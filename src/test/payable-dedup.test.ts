import { describe, it, expect } from 'vitest';
import { buildMeaningfulPayableTitle, generatePayableDuplicateKey, findPayableForSuggestion, isGenericPayableTitle } from '@/services/domain/payables';
import type { AccountPayable } from '@/types';

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p1',
    title: 'Conta',
    categoryId: 'c1',
    dueDate: '2026-05-29',
    originalAmount: 100,
    finalAmount: 100,
    status: 'PENDENTE',
    recurrence: 'NENHUMA',
    isUrgent: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    createdByUserId: 'u1',
    ...overrides,
  };
}

describe('payable dedup (chave por nome normalizado)', () => {
  it('mesma conta por id-de-fornecedor e por nome gera a mesma chave', () => {
    // Import por IA: só nome. Cadastro manual: nome + supplierId. Antes divergiam (id vs nome).
    const viaImport = generatePayableDuplicateKey({ supplierName: 'Enel SP', originalAmount: 512.4, dueDate: '2026-05-10' });
    const viaManual = generatePayableDuplicateKey({ supplierId: 'forn-99', supplierName: 'ENEL  sp', originalAmount: 512.4, dueDate: '2026-05-10' });
    expect(viaImport).not.toBeNull();
    expect(viaImport).toBe(viaManual);
  });

  it('ignora acento e caixa no nome', () => {
    const a = generatePayableDuplicateKey({ supplierName: 'Águas Paulista', originalAmount: 50, dueDate: '2026-05-01' });
    const b = generatePayableDuplicateKey({ supplierName: 'aguas paulista', originalAmount: 50, dueDate: '2026-05-01' });
    expect(a).toBe(b);
  });

  it('casa sugestão de e-mail com conta existente equivalente', () => {
    const existing = [payable({ supplierName: 'Sabesp', originalAmount: 231.7, dueDate: '2026-05-15' })];
    const match = findPayableForSuggestion(
      { suggestedSupplierName: 'SABESP', suggestedAmount: 231.7, suggestedDueDate: '2026-05-15' },
      existing,
    );
    expect(match?.id).toBe('p1');
  });

  it('não casa quando valor ou vencimento diferem', () => {
    const existing = [payable({ supplierName: 'Sabesp', originalAmount: 231.7, dueDate: '2026-05-15' })];
    expect(findPayableForSuggestion({ suggestedSupplierName: 'SABESP', suggestedAmount: 999, suggestedDueDate: '2026-05-15' }, existing)).toBeNull();
    expect(findPayableForSuggestion({ suggestedSupplierName: 'SABESP', suggestedAmount: 231.7, suggestedDueDate: '2026-06-15' }, existing)).toBeNull();
  });

  it('conta cancelada/excluída não bloqueia duplicata', () => {
    const cancelled = [payable({ status: 'CANCELADO', supplierName: 'Sabesp', originalAmount: 231.7, dueDate: '2026-05-15' })];
    expect(findPayableForSuggestion({ suggestedSupplierName: 'Sabesp', suggestedAmount: 231.7, suggestedDueDate: '2026-05-15' }, cancelled)).toBeNull();
  });

  it('detecta título genérico e monta descrição útil para evitar "Duplicata" solta', () => {
    expect(isGenericPayableTitle('  duplicata ')).toBe(true);
    expect(isGenericPayableTitle('Duplicata 123456')).toBe(true);
    expect(isGenericPayableTitle('Duplicata 02/03')).toBe(true);
    expect(isGenericPayableTitle('Fatura Vivo Total')).toBe(false);
    expect(buildMeaningfulPayableTitle({
      title: 'Duplicata',
      supplierName: 'Auto Peças Silva',
      dueDate: '2026-06-10',
    })).toBe('Auto Peças Silva · Venc. 06/2026');

    expect(buildMeaningfulPayableTitle({
      title: 'Duplicata 123456',
      supplierName: 'Viação Sertanezina',
      docNumber: 'Duplicata 123456',
      dueDate: '2026-06-10',
    })).toBe('Viação Sertanezina · Doc 123456');
  });

  it('remove títulos genéricos preservando documento ou parcela quando disponíveis', () => {
    expect(buildMeaningfulPayableTitle({
      title: 'Boleto',
      supplierName: 'Distribuidora Centro',
      docNumber: 'NF 12345',
      dueDate: '2026-06-10',
    })).toBe('Distribuidora Centro · Doc NF 12345');

    expect(buildMeaningfulPayableTitle({
      title: 'Fatura',
      supplierName: 'Notebook Loja',
      recurrenceIndex: 3,
      totalInstallments: 10,
      dueDate: '2026-06-10',
    })).toBe('Notebook Loja · Parcela 3/10');
  });

  it('preserva título financeiro já descritivo', () => {
    expect(buildMeaningfulPayableTitle({
      title: 'Salário João Maio',
      supplierName: 'João',
      dueDate: '2026-06-05',
    })).toBe('Salário João Maio');
  });
});
