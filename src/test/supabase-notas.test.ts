import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractNotaStoragePath, getNotaPDFSignedUrl } from '@/api/supabase/notas';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: mocks.from,
    },
  },
}));

describe('Notas Supabase PDF storage helpers', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.createSignedUrl.mockReset();
    mocks.upload.mockReset();
    mocks.from.mockReturnValue({
      createSignedUrl: mocks.createSignedUrl,
      upload: mocks.upload,
    });
  });

  it('extractNotaStoragePath handles empty values and blob URLs as non-storage references', () => {
    expect(extractNotaStoragePath(null)).toBeNull();
    expect(extractNotaStoragePath(undefined)).toBeNull();
    expect(extractNotaStoragePath('')).toBeNull();
    expect(extractNotaStoragePath('blob:https://app.local/123')).toBeNull();
  });

  it('extractNotaStoragePath normalizes relative paths', () => {
    expect(extractNotaStoragePath('/notas/2026/04/OS-1.pdf')).toBe('notas/2026/04/OS-1.pdf');
    expect(extractNotaStoragePath('object/public/notas/notas/2026/04/OS-2.pdf')).toBe('notas/2026/04/OS-2.pdf');
    expect(extractNotaStoragePath('object/sign/notas/notas/2026/04/OS-3.pdf')).toBe('notas/2026/04/OS-3.pdf');
  });

  it('extractNotaStoragePath extracts paths from Supabase public and signed URLs', () => {
    expect(extractNotaStoragePath(
      'https://project.supabase.co/storage/v1/object/public/notas/notas/2026/04/OS-1.pdf',
    )).toBe('notas/2026/04/OS-1.pdf');
    expect(extractNotaStoragePath(
      'https://project.supabase.co/storage/v1/object/sign/notas/notas/2026/04/OS%202.pdf?token=abc',
    )).toBe('notas/2026/04/OS 2.pdf');
  });

  it('extractNotaStoragePath rejects external non-storage URLs', () => {
    expect(extractNotaStoragePath('https://example.com/OS-1.pdf')).toBeNull();
  });

  it('getNotaPDFSignedUrl returns null for empty values and keeps blob URLs unchanged', async () => {
    await expect(getNotaPDFSignedUrl(null)).resolves.toBeNull();
    await expect(getNotaPDFSignedUrl('blob:https://app.local/123')).resolves.toBe('blob:https://app.local/123');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('getNotaPDFSignedUrl signs relative paths', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/notas/notas/2026/04/OS-1.pdf?token=abc' },
      error: null,
    });

    await expect(getNotaPDFSignedUrl('notas/2026/04/OS-1.pdf')).resolves.toContain('/storage/v1/object/sign/notas/');
    expect(mocks.from).toHaveBeenCalledWith('notas');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('notas/2026/04/OS-1.pdf', 60 * 60);
  });

  it('getNotaPDFSignedUrl signs parseable public URLs', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/os-1.pdf' },
      error: null,
    });

    await expect(getNotaPDFSignedUrl(
      'https://project.supabase.co/storage/v1/object/public/notas/notas/2026/04/OS-1.pdf',
      300,
    )).resolves.toBe('https://signed.example.com/os-1.pdf');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('notas/2026/04/OS-1.pdf', 300);
  });

  it('getNotaPDFSignedUrl keeps external URLs as temporary legacy fallback', async () => {
    await expect(getNotaPDFSignedUrl('https://example.com/OS-1.pdf')).resolves.toBe('https://example.com/OS-1.pdf');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('getNotaPDFSignedUrl falls back to original public URL when signing fails during transition', async () => {
    const publicUrl = 'https://project.supabase.co/storage/v1/object/public/notas/notas/2026/04/OS-1.pdf';
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Bucket ainda publico em transicao' },
    });

    await expect(getNotaPDFSignedUrl(publicUrl)).resolves.toBe(publicUrl);
  });

  it('getNotaPDFSignedUrl returns null when signing a path fails without legacy URL fallback', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Objeto nao encontrado' },
    });

    await expect(getNotaPDFSignedUrl('notas/2026/04/OS-1.pdf')).resolves.toBeNull();
  });

  it('uploadNotaPDF stores the PDF and returns storage path instead of public URL', async () => {
    const { uploadNotaPDF } = await import('@/api/supabase/notas');
    mocks.upload.mockResolvedValue({ data: { path: 'notas/2026/04/OS-123.pdf' }, error: null });

    const path = await uploadNotaPDF(new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'OS-123');

    expect(path).toMatch(/^notas\/\d{4}\/\d{2}\/OS-123\.pdf$/);
    expect(path.startsWith('http')).toBe(false);
    expect(mocks.from).toHaveBeenCalledWith('notas');
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^notas\/\d{4}\/\d{2}\/OS-123\.pdf$/),
      expect.any(Blob),
      {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      },
    );
  });
});
