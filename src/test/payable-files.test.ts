import { describe, expect, it } from 'vitest';
import {
  inferPayableAttachmentType,
  isPayableImageFile,
  isPayablePdfFile,
  resolvePayableFileMimeType,
} from '@/services/domain/payableFiles';

describe('payableFiles', () => {
  it('recognizes PDF by extension when browser MIME is missing or generic', () => {
    const missingMime = new File(['%PDF-1.4'], 'Boleto_1.pdf', { type: '' });
    const genericMime = new File(['%PDF-1.4'], 'boleto-antigo.PDF', { type: 'application/octet-stream' });

    expect(isPayablePdfFile(missingMime)).toBe(true);
    expect(isPayablePdfFile(genericMime)).toBe(true);
    expect(resolvePayableFileMimeType(missingMime)).toBe('application/pdf');
    expect(resolvePayableFileMimeType(genericMime)).toBe('application/pdf');
    expect(inferPayableAttachmentType(genericMime)).toBe('BOLETO');
  });

  it('normalizes legacy application/x-pdf files to standard PDF MIME', () => {
    const legacyPdf = new File(['%PDF-1.4'], 'boleto-legado.pdf', { type: 'application/x-pdf' });

    expect(isPayablePdfFile(legacyPdf)).toBe(true);
    expect(resolvePayableFileMimeType(legacyPdf)).toBe('application/pdf');
  });

  it('recognizes images by extension when browser MIME is generic', () => {
    const image = new File(['img'], 'comprovante.webp', { type: 'application/octet-stream' });

    expect(isPayableImageFile(image)).toBe(true);
    expect(resolvePayableFileMimeType(image)).toBe('image/webp');
    expect(inferPayableAttachmentType(image)).toBe('COMPROVANTE');
  });
});
