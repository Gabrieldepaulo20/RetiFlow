import { describe, expect, it } from 'vitest';
import { buildCustomerCrm } from '@/services/domain/customerCrm';
import type { Client, IntakeNote, NoteStatus } from '@/types';

function client(id: string, name: string): Client {
  return {
    id,
    name,
    tradeName: '',
    docType: 'CNPJ',
    docNumber: `00.000.000/000${id}-00`,
    phone: '',
    email: '',
    cep: '',
    address: '',
    city: 'Sertãozinho',
    state: 'SP',
    notes: '',
    isActive: true,
    createdAt: '2026-01-01T12:00:00',
  };
}

function note(id: string, clientId: string, createdAt: string, totalAmount: number, status: NoteStatus = 'ENTREGUE'): IntakeNote {
  return {
    id,
    number: id,
    clientId,
    createdAt,
    createdByUserId: 'user-1',
    status,
    type: 'SERVICO',
    engineType: 'Não identificado',
    vehicleModel: 'Motor',
    complaint: '',
    observations: '',
    totalServices: totalAmount,
    totalProducts: 0,
    totalAmount,
    paymentStatus: 'PENDENTE',
    updatedAt: createdAt,
  };
}

describe('customer CRM domain', () => {
  it('classifies customers by ABC revenue contribution', () => {
    const result = buildCustomerCrm({
      clients: [
        client('1', 'Cliente A'),
        client('2', 'Cliente B'),
        client('3', 'Cliente C'),
      ],
      notes: [
        note('os-1', '1', '2026-06-01T12:00:00', 8000),
        note('os-2', '2', '2026-06-02T12:00:00', 1500),
        note('os-3', '3', '2026-06-03T12:00:00', 500),
      ],
      referenceDate: new Date('2026-06-21T12:00:00'),
    });

    expect(result.summary.totalRevenue).toBe(10000);
    expect(result.statsByClientId.get('1')?.crmClass).toBe('A');
    expect(result.statsByClientId.get('2')?.crmClass).toBe('B');
    expect(result.statsByClientId.get('3')?.crmClass).toBe('C');
  });

  it('detects relevant revenue drop and estimates the recovery opportunity', () => {
    const result = buildCustomerCrm({
      clients: [client('1', 'Mecânica em queda')],
      notes: [
        note('old-1', '1', '2026-01-20T12:00:00', 5000),
        note('old-2', '1', '2026-02-10T12:00:00', 3000),
        note('new-1', '1', '2026-05-20T12:00:00', 1000),
      ],
      referenceDate: new Date('2026-06-21T12:00:00'),
    });

    const stat = result.statsByClientId.get('1');
    expect(stat?.trend).toBe('falling');
    expect(stat?.previousRevenue).toBe(8000);
    expect(stat?.recentRevenue).toBe(1000);
    expect(result.summary.revenueAtRisk90d).toBe(7000);
    expect(result.opportunities[0]).toMatchObject({
      clientId: '1',
      type: 'recover_drop',
      estimatedImpact: 7000,
    });
  });

  it('prioritizes first-service follow-up for one-off high ticket customers', () => {
    const result = buildCustomerCrm({
      clients: [client('1', 'Cliente primeira OS')],
      notes: [note('os-1', '1', '2026-06-10T12:00:00', 1800)],
      referenceDate: new Date('2026-06-21T12:00:00'),
    });

    expect(result.summary.oneServiceClients).toBe(1);
    expect(result.opportunities[0]).toMatchObject({
      type: 'first_service_followup',
      estimatedImpact: 3600,
    });
  });

  it('does not count excluded notes as revenue', () => {
    const result = buildCustomerCrm({
      clients: [client('1', 'Cliente')],
      notes: [
        note('os-1', '1', '2026-06-10T12:00:00', 1000, 'ENTREGUE'),
        note('os-2', '1', '2026-06-11T12:00:00', 5000, 'EXCLUIDA'),
      ],
      referenceDate: new Date('2026-06-21T12:00:00'),
    });

    expect(result.statsByClientId.get('1')?.totalRevenue).toBe(1000);
    expect(result.summary.totalRevenue).toBe(1000);
  });
});
