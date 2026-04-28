import { describe, expect, it } from 'vitest';
import {
  buildImportedPayableAttachmentName,
  normalizeAttachmentDisplayName,
} from '@/services/domain/payableAttachments';

describe('payable attachment naming', () => {
  it('builds friendly names for IA imported attachments', () => {
    expect(buildImportedPayableAttachmentName({
      title: 'Boleto peças abril',
      supplierName: 'Distribuidora São João',
      dueDate: '2026-04-30',
      originalFilename: 'scan 001.PDF',
    })).toBe('2026-04-30 - Distribuidora Sao Joao - Boleto pecas abril.pdf');
  });

  it('removes path-unsafe characters from editable names', () => {
    expect(normalizeAttachmentDisplayName(' boleto:abril/2026?.pdf ')).toBe('boleto abril 2026.pdf');
  });

  it('keeps a fallback when the user clears the name', () => {
    expect(normalizeAttachmentDisplayName('  ', 'anexo-original.pdf')).toBe('anexo-original.pdf');
  });
});
