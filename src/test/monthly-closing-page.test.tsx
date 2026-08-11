import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dataContext: vi.fn(),
  getAllFechamentos: vi.fn(),
  getFinanceiroContas: vi.fn(),
  templateSettings: vi.fn(),
  documentCustomization: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'actor-user',
      email: 'gabrielwilliam208@gmail.com',
      name: 'Gabriel',
      role: 'ADMIN',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    operationalUser: {
      id: 'target-user',
      email: 'retifica@example.com',
      name: 'Retífica atendida',
      role: 'ADMIN',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    isSupportImpersonating: true,
  }),
}));

vi.mock('@/contexts/DataContext', () => ({
  useData: () => mocks.dataContext(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/hooks/useDocumentTemplateSettings', () => ({
  useDocumentTemplateSettings: (id: string | null) => mocks.templateSettings(id),
  useDocumentCustomization: (type: string, id: string | null) =>
    mocks.documentCustomization(type, id),
}));

vi.mock('@/api/supabase/fechamentos', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/supabase/fechamentos')>();
  return {
    ...original,
    getAllFechamentos: mocks.getAllFechamentos,
    getFechamentosAbertosCliente: vi.fn(),
    getNotaDetalhesParaFechamento: vi.fn(),
  };
});

vi.mock('@/api/supabase/financeiro', () => ({
  getFinanceiroContas: mocks.getFinanceiroContas,
  insertFinanceiroAnexo: vi.fn(),
  uploadFinanceiroComprovante: vi.fn(),
}));

vi.mock('@/api/supabase/notas', () => ({
  getNotasServico: vi.fn(),
  mapStatusNome: (value: string) => value,
}));

vi.mock('@/components/privacy/FinancialValue', () => ({
  FinancialValue: ({ children }: { children: React.ReactNode }) => children,
}));

let MonthlyClosing: ComponentType;
let setActiveSupportSession: typeof import('@/services/auth/supportContext')['setActiveSupportSession'];

describe('MonthlyClosing support tablet visibility', () => {
  beforeAll(async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'real');
    vi.resetModules();
    ({ setActiveSupportSession } = await import('@/services/auth/supportContext'));
    MonthlyClosing = (await import('@/pages/MonthlyClosing')).default;
  });

  afterAll(() => {
    setActiveSupportSession(null);
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setActiveSupportSession({
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'Atendimento de fechamento validado',
      startedAt: '2026-08-11T11:00:00.000Z',
      expiresAt: null,
      actorUser: {
        id: 'actor-user',
        email: 'gabrielwilliam208@gmail.com',
        name: 'Gabriel',
        role: 'ADMIN',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      targetUser: {
        id: 'target-user',
        email: 'retifica@example.com',
        name: 'Retífica atendida',
        role: 'ADMIN',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    mocks.getAllFechamentos.mockReset();
    mocks.dataContext.mockReset();
    mocks.getFinanceiroContas.mockReset();
    mocks.templateSettings.mockReset();
    mocks.documentCustomization.mockReset();
    mocks.toast.mockReset();
    mocks.getFinanceiroContas.mockResolvedValue([]);
    mocks.dataContext.mockReturnValue({
      notes: [],
      clients: [],
      registrarRecebimentoNota: vi.fn(),
      estornarRecebimentoNota: vi.fn(),
      refreshNotes: vi.fn().mockResolvedValue(undefined),
    });
    mocks.templateSettings.mockReturnValue({
      data: {
        fkUsuarios: 'target-user',
        osModelo: 'auto',
        corDocumento: '#1a7a8a',
        fechamentoModelo: 'moderno',
        corFechamento: '#0f7f95',
        updatedAt: null,
      },
      isPlaceholderData: false,
      isError: false,
    });
    mocks.documentCustomization.mockReturnValue({
      data: {
        fkUsuarios: 'target-user',
        documentType: 'closing_report',
        company: {},
        template: null,
        theme: null,
        resolvedConfig: {},
      },
      isPlaceholderData: false,
      isError: false,
    });
    mocks.getAllFechamentos.mockResolvedValue([{
      id_fechamentos: 'closing-support-1',
      mes: 'Agosto',
      ano: 2026,
      periodo: 'Agosto/2026',
      label: 'Fechamento Agosto',
      valor_total: 1_490,
      versao: 1,
      total_regeneracoes: 0,
      total_edicoes: 0,
      total_downloads: 0,
      created_at: '2026-08-11T11:26:48.363927',
      updated_at: null,
      cliente: { id: 'client-target', nome: 'Sert Car' },
      dados_json: {
        gerado_em: '2026-08-11T14:26:00.000Z',
        periodo: 'Agosto/2026',
        cliente: { id: 'client-target', nome: 'Sert Car' },
        notas: [],
        total_original: 1_490,
        total_com_desconto: 1_490,
        recebimento_inicial: null,
      },
      pdf_url: null,
      status_pagamento: 'PENDENTE',
      valor_recebido: 0,
    }]);
  });

  it('shows the target closing before clients load and uses the target document settings', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MonthlyClosing />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Sert Car')).toBeInTheDocument();
    expect(screen.getByText('Criado em 11/08/2026 às 11:26')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum fechamento gerado ainda.')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getAllFechamentos).toHaveBeenCalled());
    expect(mocks.templateSettings).toHaveBeenCalledWith('target-user');
    expect(mocks.documentCustomization).toHaveBeenCalledWith('closing_report', 'target-user');
  });

  it('enables audited creation, receipts and WhatsApp in support mode', async () => {
    mocks.getFinanceiroContas.mockResolvedValue([{
      id: 'account-target',
      nome: 'Caixa da retífica',
      tipo: 'CAIXA',
      saldoInicial: 0,
      saldoInicialConfirmado: true,
      dataCorte: null,
      ativa: true,
      padrao: true,
      createdAt: null,
      updatedAt: null,
    }]);
    mocks.dataContext.mockReturnValue({
      notes: [],
      clients: [{ id: 'client-target', name: 'Sert Car', isActive: true, phone: '' }],
      registrarRecebimentoNota: vi.fn(),
      estornarRecebimentoNota: vi.fn(),
      refreshNotes: vi.fn().mockResolvedValue(undefined),
    });
    window.localStorage.setItem('retiflow:monthly-closing-drafts:v3:target-user', JSON.stringify([{
      id: 'draft-support-1',
      closingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      generationKey: 'finalizar-fechamento:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      generationStartedAt: null,
      clientId: 'client-target',
      clientName: 'Sert Car',
      periodMode: 'month',
      startDate: null,
      endDate: null,
      cutoffDate: null,
      month: '8',
      year: '2026',
      periodLabel: 'Agosto/2026',
      notes: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        os: 'OS-1',
        veiculo: 'Motor',
        placa: null,
        total: 100,
        updatedAt: '2026-08-10T11:00:00.000Z',
        paymentStatus: 'PENDENTE',
        valorRecebido: 0,
        pagoEm: null,
        itens: [{
          id: 'item-1',
          descricao: 'Retífica',
          quantidade: 1,
          preco_unitario: 100,
          desconto_original: 0,
          desconto_porcentagem: 0,
          subtotal_original: 100,
          subtotal: 100,
        }],
      }],
      includedNoteIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      discounts: {},
      initialPayment: {
        mode: 'NONE',
        date: '2026-08-11',
        method: 'PIX',
        accountId: '',
        observations: '',
      },
      createdAt: '2026-08-11T11:00:00.000Z',
      updatedAt: '2026-08-11T11:00:00.000Z',
    }]));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MonthlyClosing />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: /whatsapp/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /pagamentos/i })).toBeEnabled();
    const editDraft = await screen.findByRole('button', { name: /^editar$/i });
    fireEvent.click(editDraft);

    expect(mocks.toast).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Editar rascunho de fechamento' });
    expect(within(dialog).getByText('Criação controlada em modo suporte')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /gerar sem entrada/i })).toBeEnabled();
    expect(within(dialog).getByText('Recebimento ao gerar')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getFinanceiroContas).toHaveBeenCalled());
    fireEvent.click(within(dialog).getByRole('button', { name: '50%' }));
    await waitFor(() => expect(within(dialog).getByText('Caixa da retífica')).toBeInTheDocument());
    expect(within(dialog).getByRole('button', { name: /gerar e receber r\$ 50,00/i })).toBeEnabled();
  });

  it('fails closed when the visual support state has no validated active session', async () => {
    setActiveSupportSession(null);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MonthlyClosing />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nenhum fechamento gerado ainda.')).toBeInTheDocument();
    expect(mocks.getAllFechamentos).not.toHaveBeenCalled();
    expect(screen.queryByText('Sert Car')).not.toBeInTheDocument();
  });
});
