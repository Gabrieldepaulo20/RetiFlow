import { describe, expect, it } from 'vitest';
import { detectPayableAnomalies, formatAnomalyBadge } from '@/services/domain/payablesAnomaly';
import type { AccountPayable } from '@/types';

function payable(overrides: Partial<AccountPayable>): AccountPayable {
  return {
    id: 'p1',
    title: 'Conta',
    categoryId: 'paycat-1',
    supplierName: 'CPFL',
    dueDate: '2026-06-10',
    originalAmount: 100,
    finalAmount: 100,
    status: 'PENDENTE',
    recurrence: 'MENSAL',
    isUrgent: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    createdByUserId: 'u1',
    ...overrides,
  };
}

describe('detecção de anomalia de valor', () => {
  it('sinaliza conta acima da mediana do mesmo fornecedor+categoria', () => {
    const anomalies = detectPayableAnomalies({
      payables: [
        payable({ id: 'm1', finalAmount: 1000 }),
        payable({ id: 'm2', finalAmount: 1000 }),
        payable({ id: 'm3', finalAmount: 1050 }),
        payable({ id: 'spike', finalAmount: 1300 }), // +30% sobre mediana 1000
      ],
    });

    const spike = anomalies.get('spike');
    expect(spike).toBeDefined();
    expect(spike?.baseline).toBe(1000);
    expect(Math.round((spike?.deltaPct ?? 0) * 100)).toBe(30);
    expect(spike?.direction).toBe('acima');
    expect(formatAnomalyBadge(spike!)).toBe('+30% vs. média');
  });

  it('não sinaliza variação dentro do limiar (20%)', () => {
    const anomalies = detectPayableAnomalies({
      payables: [
        payable({ id: 'a', finalAmount: 1000 }),
        payable({ id: 'b', finalAmount: 1000 }),
        payable({ id: 'c', finalAmount: 1000 }),
        payable({ id: 'd', finalAmount: 1150 }), // +15%, abaixo do limiar
      ],
    });
    expect(anomalies.size).toBe(0);
  });

  it('exige amostra mínima de contas comparáveis', () => {
    const anomalies = detectPayableAnomalies({
      payables: [
        payable({ id: 'x', finalAmount: 100 }),
        payable({ id: 'y', finalAmount: 1000 }), // grupo pequeno demais
      ],
    });
    expect(anomalies.size).toBe(0);
  });

  it('ignora contas pequenas mesmo com variação percentual grande', () => {
    const anomalies = detectPayableAnomalies({
      payables: [
        payable({ id: 's1', finalAmount: 10 }),
        payable({ id: 's2', finalAmount: 10 }),
        payable({ id: 's3', finalAmount: 10 }),
        payable({ id: 's4', finalAmount: 40 }), // +300% mas só R$30 de diferença
      ],
    });
    expect(anomalies.size).toBe(0);
  });

  it('não compara entre fornecedores/categorias diferentes nem usa contas excluídas/canceladas', () => {
    const anomalies = detectPayableAnomalies({
      payables: [
        payable({ id: 'cpfl1', supplierName: 'CPFL', finalAmount: 1000 }),
        payable({ id: 'cpfl2', supplierName: 'CPFL', finalAmount: 1000 }),
        payable({ id: 'cpfl3', supplierName: 'CPFL', finalAmount: 1000, status: 'CANCELADO' }),
        payable({ id: 'cpfl4', supplierName: 'CPFL', finalAmount: 1000, deletedAt: '2026-06-01T00:00:00.000Z' }),
        payable({ id: 'outra', supplierName: 'Outro Fornecedor', finalAmount: 5000 }),
      ],
    });
    // CPFL só tem 2 contas válidas (amostra insuficiente); "outra" está sozinha.
    expect(anomalies.size).toBe(0);
  });
});
