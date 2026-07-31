import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractNotaStoragePath, getNotaPDFSignedUrl, mapStatusNome, supabaseToIntakeNote, type NotaServico } from '@/api/supabase/notas';
import { setActiveSupportSession } from '@/services/auth/supportContext';
import { toPaymentMethod } from '@/types';
import type { SupportImpersonationSession } from '@/types';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  upload: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  getPerfil: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: mocks.from,
    },
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
    },
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

vi.mock('@/api/supabase/auth', () => ({
  getPerfil: mocks.getPerfil,
}));

describe('Notas Supabase PDF storage helpers', () => {
  beforeEach(() => {
    setActiveSupportSession(null);
    mocks.from.mockReset();
    mocks.createSignedUrl.mockReset();
    mocks.upload.mockReset();
    mocks.getUser.mockReset();
    mocks.getSession.mockReset();
    mocks.invoke.mockReset();
    mocks.getPerfil.mockReset();
    mocks.from.mockReturnValue({
      createSignedUrl: mocks.createSignedUrl,
      upload: mocks.upload,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-0000-0000-000000000001' } },
      error: null,
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    });
    mocks.getPerfil.mockResolvedValue({
      nome: 'Retífica Premium',
      email: 'retificapremium5@gmail.com',
    });
  });

  it('extractNotaStoragePath handles empty values and blob URLs as non-storage references', () => {
    expect(extractNotaStoragePath(null)).toBeNull();
    expect(extractNotaStoragePath(undefined)).toBeNull();
    expect(extractNotaStoragePath('')).toBeNull();
    expect(extractNotaStoragePath('blob:https://app.local/123')).toBeNull();
  });

  it('mapStatusNome keeps legacy closed statuses aligned with the billable model', () => {
    expect(mapStatusNome('Finalizado')).toBe('ENTREGUE');
    expect(mapStatusNome('Cancelado')).toBe('EXCLUIDA');
    expect(mapStatusNome('Descartado')).toBe('EXCLUIDA');
    expect(mapStatusNome('Sem Conserto')).toBe('SEM_CONSERTO');
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

  it('getNotaPDFSignedUrl uses the audited server path in support mode', async () => {
    const supportSession: SupportImpersonationSession = {
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'Atendimento operacional autorizado',
      startedAt: '2026-07-30T12:00:00.000Z',
      expiresAt: null,
      actorUser: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Guilherme Henrique',
        email: 'guilhermehenriquedepaulo2@gmail.com',
        role: 'ADMIN',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        moduleAccess: { admin: true },
      },
      targetUser: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Retífica Premium',
        email: 'retificapremium5@gmail.com',
        role: 'RECEPCAO',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    };
    setActiveSupportSession(supportSession);
    mocks.invoke.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/support-os-1.pdf' },
      error: null,
    });

    await expect(getNotaPDFSignedUrl(
      'retifica-premium/2026/julho/30 (Quinta-feira)/OS-1.pdf',
      300,
    )).resolves.toBe('https://signed.example.com/support-os-1.pdf');

    expect(mocks.invoke).toHaveBeenCalledWith('note-pdf-url', {
      body: {
        pathOrUrl: 'retifica-premium/2026/julho/30 (Quinta-feira)/OS-1.pdf',
        support: {
          sessionId: supportSession.id,
          targetUserId: supportSession.targetUser.id,
        },
        expiresIn: 300,
      },
      headers: {
        Authorization: 'Bearer test-access-token',
      },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uploadNotaPDF stores the PDF and returns storage path instead of public URL', async () => {
    const { uploadNotaPDF } = await import('@/api/supabase/notas');
    mocks.upload.mockResolvedValue({ data: { path: 'retifica-premium/2026/junho/10 (Quarta-feira)/OS-123.pdf' }, error: null });

    const path = await uploadNotaPDF(new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'OS-123');

    expect(path).toMatch(/^retifica-premium\/\d{4}\/(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/\d{2} \((?:Domingo|Segunda-feira|Terca-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sabado)\)\/OS-123\.pdf$/);
    expect(path.startsWith('http')).toBe(false);
    expect(mocks.from).toHaveBeenCalledWith('notas');
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^retifica-premium\/\d{4}\/(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/\d{2} \((?:Domingo|Segunda-feira|Terca-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sabado)\)\/OS-123\.pdf$/),
      expect.any(Blob),
      {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      },
    );
  });
});

describe('toPaymentMethod', () => {
  it('aceita valores do union PaymentMethod', () => {
    expect(toPaymentMethod('PIX')).toBe('PIX');
    expect(toPaymentMethod('DEBITO_AUTOMATICO')).toBe('DEBITO_AUTOMATICO');
  });

  it('rejeita valores legados/desconhecidos vindos do banco ou da IA', () => {
    expect(toPaymentMethod('CREDITO')).toBeUndefined();
    expect(toPaymentMethod('pix')).toBeUndefined();
    expect(toPaymentMethod(null)).toBeUndefined();
    expect(toPaymentMethod(undefined)).toBeUndefined();
    expect(toPaymentMethod(42)).toBeUndefined();
  });
});

describe('supabaseToIntakeNote — campos de pagamento', () => {
  const baseRow: NotaServico = {
    id_notas_servico: 'nota-1',
    os: 'OS-10',
    prazo: '2026-06-20',
    defeito: 'Teste',
    observacoes: null,
    total: 100,
    total_servicos: 100,
    total_produtos: 0,
    created_at: '2026-06-15T10:00:00Z',
    updated_at: '2026-06-15T10:00:00Z',
    pdf_url: null,
    finalizado_em: null,
    cliente: { id: 'c1', nome: 'Cliente' },
    veiculo: { id: 'v1', modelo: 'Gol', placa: null, km: 0, motor: 'AP' },
    status: { id: 26, nome: 'Entregue', index: 8, tipo_status: 'fechado' },
  };

  it('mantém paidWith válido e descarta valor fora do union sem quebrar', () => {
    const valid = supabaseToIntakeNote({ ...baseRow, payment_status: 'PAGO', pago_com: 'PIX' } as NotaServico);
    expect(valid.paidWith).toBe('PIX');

    const legacy = supabaseToIntakeNote({ ...baseRow, payment_status: 'PAGO', pago_com: 'CREDITO' } as NotaServico);
    expect(legacy.paymentStatus).toBe('PAGO');
    expect(legacy.paidWith).toBeUndefined();
  });

  it('trata ausência dos campos de pagamento (variante de suporte) como PENDENTE sem paidWith', () => {
    const note = supabaseToIntakeNote(baseRow);
    expect(note.paymentStatus).toBe('PENDENTE');
    expect(note.valorRecebido).toBe(0);
    expect(note.paidWith).toBeUndefined();
    expect(note.paidAt).toBeUndefined();
  });

  it('preserva recebimento parcial e valor recebido retornados pelo financeiro', () => {
    const note = supabaseToIntakeNote({
      ...baseRow,
      payment_status: 'PARCIAL',
      valor_recebido: '40.50',
      pago_com: 'PIX',
    } as NotaServico);

    expect(note.paymentStatus).toBe('PARCIAL');
    expect(note.valorRecebido).toBe(40.5);
    expect(note.paidWith).toBe('PIX');
  });
});
