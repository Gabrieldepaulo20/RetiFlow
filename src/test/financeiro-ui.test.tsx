import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  criarMovimentoManual,
  estornarMovimentoFinanceiro,
  getAllFinanceiroExtrato,
  getAllFinanceiroLancamentos,
  getAllFinanceiroModelosRecorrentes,
  getCategoriasEntradas,
  getFinanceiroContas,
  getFinanceiroResumo,
  salvarContaFinanceira,
  salvarModeloRecorrente,
} from '@/api/supabase/financeiro';
import { FinanceActionDialog } from '@/components/finance/FinanceActionDialog';
import { FinanceAccountsDialog } from '@/components/finance/FinanceAccountsDialog';
import { KpiCard, LaunchList } from '@/components/finance/FinanceLedger';
import { FinanceMovementDetailsDialog } from '@/components/finance/FinanceMovementDetailsDialog';
import { FinancialPrivacyContext } from '@/contexts/FinancialPrivacyContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import Financeiro from '@/pages/Financeiro';
import type { FinanceiroLancamento, FinanceiroMovimento } from '@/api/supabase/financeiro';

vi.mock('@/api/supabase/financeiro', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/supabase/financeiro')>();
  return {
    ...original,
    criarMovimentoManual: vi.fn(),
    estornarMovimentoFinanceiro: vi.fn(),
    getAllFinanceiroExtrato: vi.fn(),
    getAllFinanceiroLancamentos: vi.fn(),
    getAllFinanceiroModelosRecorrentes: vi.fn(),
    getCategoriasEntradas: vi.fn(),
    getFinanceiroAnexos: vi.fn().mockResolvedValue([]),
    getFinanceiroContas: vi.fn(),
    getFinanceiroResumo: vi.fn(),
    salvarContaFinanceira: vi.fn().mockResolvedValue({
      id: 'conta-1',
      movimentoId: null,
      status: null,
      valorRealizado: null,
      valorAberto: null,
    }),
    salvarModeloRecorrente: vi.fn(),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isSupportImpersonating: false }),
}));

vi.mock('@/contexts/DataContext', () => ({
  usePayablesData: () => ({ payableCategories: [] }),
}));

const launch: FinanceiroLancamento = {
  id: 'lancamento-1',
  direcao: 'ENTRADA',
  origem: 'NOTA_SERVICO',
  origemId: 'nota-1',
  origemNumero: 'OS-42',
  pessoa: 'Cliente exemplo',
  descricao: 'Serviço de cabeçote',
  categoriaId: null,
  categoriaNome: 'Serviços',
  vencimento: '2026-07-30',
  competencia: '2026-07-01',
  dataEfetiva: null,
  contaId: null,
  contaNome: null,
  formaPagamento: null,
  previsto: 1250,
  realizado: 0,
  aberto: 1250,
  status: 'PENDENTE',
  revisar: false,
  createdAt: '2026-07-30T12:00:00-03:00',
};

const movement: FinanceiroMovimento = {
  id: 'movimento-1',
  direcao: 'ENTRADA',
  origem: 'NOTA_SERVICO',
  origemId: 'nota-1',
  descricao: 'Recebimento OS-42',
  valor: 1250,
  dataEfetiva: '2026-07-30T12:00:00-03:00',
  contaId: 'conta-1',
  contaNome: 'Caixa geral',
  formaPagamento: 'PIX',
  saldoAcumulado: 8250,
  estornado: false,
  estornoDeId: null,
  motivoEstorno: null,
  usuarioNome: 'Usuário responsável',
  createdAt: '2026-07-30T12:00:00-03:00',
};

const account = {
  id: 'conta-1',
  nome: 'Caixa geral',
  tipo: 'CAIXA' as const,
  saldoInicial: 3500,
  saldoInicialConfirmado: false,
  dataCorte: '2026-06-01',
  ativa: true,
  padrao: true,
  createdAt: '2026-06-01T12:00:00-03:00',
  updatedAt: null,
};

function renderWithPrivacy(node: ReactNode, hidden = true) {
  return render(
    <TooltipProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <FinancialPrivacyContext.Provider
          value={{ financialValuesHidden: hidden, toggleFinancialValues: vi.fn() }}
        >
          {node}
        </FinancialPrivacyContext.Provider>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function renderWithQueryClient(node: ReactNode, hidden = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <FinancialPrivacyContext.Provider
            value={{ financialValuesHidden: hidden, toggleFinancialValues: vi.fn() }}
          >
            {node}
          </FinancialPrivacyContext.Provider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Central Financeiro UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFinanceiroContas).mockResolvedValue([account]);
    vi.mocked(getCategoriasEntradas).mockResolvedValue([{
      id: 'categoria-entrada-1',
      nome: 'Serviços',
      cor: null,
      icone: null,
      impactaDre: true,
      ativa: true,
    }]);
    vi.mocked(getFinanceiroResumo).mockResolvedValue({
      saldoInicialInformado: true,
      saldoAnterior: 3500,
      entradasRecebidas: 0,
      saidasPagas: 0,
      saldoAtual: 3500,
      aReceber: 0,
      aPagar: 0,
      saldoProjetado: 3500,
      resultadoPeriodo: 0,
      faturamentoCompetencia: 0,
      despesasCompetencia: 0,
      resultadoCompetencia: 0,
    });
    vi.mocked(getAllFinanceiroLancamentos).mockResolvedValue({ dados: [], total: 0 });
    vi.mocked(getAllFinanceiroExtrato).mockResolvedValue({ dados: [], total: 0 });
    vi.mocked(getAllFinanceiroModelosRecorrentes).mockResolvedValue({ dados: [], total: 0 });
    vi.mocked(salvarContaFinanceira).mockResolvedValue({
      id: 'conta-1',
      movimentoId: null,
      status: null,
      valorRealizado: null,
      valorAberto: null,
    });
    vi.mocked(salvarModeloRecorrente).mockResolvedValue({
      id: 'modelo-1',
      movimentoId: null,
      status: null,
      valorRealizado: null,
      valorAberto: null,
    });
    vi.mocked(criarMovimentoManual).mockResolvedValue({
      id: 'movimento-2',
      movimentoId: 'movimento-2',
      status: 'PAGO',
      valorRealizado: 100,
      valorAberto: 0,
    });
    vi.mocked(estornarMovimentoFinanceiro).mockResolvedValue({
      id: 'estorno-1',
      movimentoId: 'estorno-1',
      status: 'PENDENTE',
      valorRealizado: 0,
      valorAberto: 1250,
    });
  });

  it('mascara valores monetários nos KPIs e lançamentos', () => {
    renderWithPrivacy(
      <>
        <KpiCard label="Entradas" value={1250} hint="Valor recebido." />
        <LaunchList items={[launch]} readOnly onSettle={vi.fn()} />
      </>,
    );

    expect(screen.getAllByText('R$ ••••••').length).toBeGreaterThan(1);
    expect(screen.queryByText('R$ 1.250,00')).not.toBeInTheDocument();
  });

  it('não oferece liquidação na consulta somente leitura', () => {
    renderWithPrivacy(<LaunchList items={[launch]} readOnly onSettle={vi.fn()} />, false);

    expect(screen.queryByRole('button', { name: 'Receber' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Abrir origem' }).length).toBeGreaterThan(0);
  });

  it('não abre modais de movimentação no modo suporte', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FinancialPrivacyContext.Provider
          value={{ financialValuesHidden: false, toggleFinancialValues: vi.fn() }}
        >
          <FinanceActionDialog
            kind="entrada"
            open
            readOnly
            onClose={vi.fn()}
            accounts={[]}
            categories={[]}
            payableCategories={[]}
            launch={null}
            movement={null}
            model={null}
            onSuccess={vi.fn()}
            onError={vi.fn()}
          />
        </FinancialPrivacyContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar entrada' })).not.toBeInTheDocument();
  });

  it('mostra a auditoria do movimento sem permitir upload no suporte', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FinancialPrivacyContext.Provider
          value={{ financialValuesHidden: false, toggleFinancialValues: vi.fn() }}
        >
          <FinanceMovementDetailsDialog
            movement={movement}
            open
            readOnly
            onClose={vi.fn()}
          />
        </FinancialPrivacyContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Detalhe do movimento' })).toBeInTheDocument();
    expect(screen.getByText('Usuário responsável')).toBeInTheDocument();
    expect(screen.getByText('Caixa geral')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anexar' })).not.toBeInTheDocument();
  });

  it('mascara o saldo inicial e salva a confirmação da data de corte', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onSuccess = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <FinancialPrivacyContext.Provider
          value={{ financialValuesHidden: true, toggleFinancialValues: vi.fn() }}
        >
          <FinanceAccountsDialog
            accounts={[account]}
            open
            readOnly={false}
            onClose={vi.fn()}
            onSuccess={onSuccess}
            onError={vi.fn()}
          />
        </FinancialPrivacyContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('R$ ••••••')).toBeInTheDocument();
    expect(screen.getByLabelText('Saldo inicial')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('switch', { name: 'Confirmar saldo inicial' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conta' }));

    await waitFor(() => {
      expect(vi.mocked(salvarContaFinanceira)).toHaveBeenCalledWith(expect.objectContaining({
        id: 'conta-1',
        nome: 'Caixa geral',
        tipo: 'CAIXA',
        saldoInicial: 3500,
        dataCorte: '2026-06-01',
        padrao: true,
      }));
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('não exibe gerenciamento de contas no modo suporte', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FinancialPrivacyContext.Provider
          value={{ financialValuesHidden: false, toggleFinancialValues: vi.fn() }}
        >
          <FinanceAccountsDialog
            accounts={[account]}
            open
            readOnly
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            onError={vi.fn()}
          />
        </FinancialPrivacyContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar conta' })).not.toBeInTheDocument();
  });

  it('alinha o motivo mínimo do estorno com a validação do banco', async () => {
    const onError = vi.fn();

    renderWithQueryClient(
      <FinanceActionDialog
        kind="estornar"
        open
        readOnly={false}
        onClose={vi.fn()}
        accounts={[account]}
        categories={[]}
        payableCategories={[]}
        launch={null}
        movement={movement}
        model={null}
        onSuccess={vi.fn().mockResolvedValue(undefined)}
        onError={onError}
      />,
    );

    const reason = screen.getByLabelText('Motivo obrigatório');
    expect(reason).toHaveAttribute('minLength', '5');

    fireEvent.change(reason, { target: { value: 'Erro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toEqual(expect.objectContaining({
        message: 'Informe um motivo com pelo menos 5 caracteres.',
      }));
    });
    expect(estornarMovimentoFinanceiro).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: 'Erro de lançamento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));

    await waitFor(() => {
      expect(estornarMovimentoFinanceiro).toHaveBeenCalledWith(expect.objectContaining({
        movimentoId: 'movimento-1',
        motivo: 'Erro de lançamento',
      }));
    });
  });

  it('usa categoria de saída ao criar um gasto recorrente', async () => {
    renderWithQueryClient(
      <FinanceActionDialog
        kind="recorrente"
        open
        readOnly={false}
        onClose={vi.fn()}
        accounts={[account]}
        categories={[{
          id: 'categoria-entrada-1',
          nome: 'Serviços',
          cor: null,
          icone: null,
          impactaDre: true,
          ativa: true,
        }]}
        payableCategories={[{ id: 'categoria-saida-1', name: 'Aluguel' }]}
        launch={null}
        movement={null}
        model={null}
        onSuccess={vi.fn().mockResolvedValue(undefined)}
        onError={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome do gasto fixo'), {
      target: { value: 'Aluguel da oficina' },
    });
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '2500,00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar gasto fixo' }));

    await waitFor(() => {
      expect(vi.mocked(salvarModeloRecorrente)).toHaveBeenCalledWith(expect.objectContaining({
        titulo: 'Aluguel da oficina',
        categoriaId: 'categoria-saida-1',
        valor: 2500,
      }));
    });
  });

  it('reutiliza a idempotência após erro e renova ao alterar dados ou concluir', async () => {
    vi.mocked(criarMovimentoManual)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        id: 'movimento-2',
        movimentoId: 'movimento-2',
        status: 'PAGO',
        valorRealizado: 200,
        valorAberto: 0,
      })
      .mockResolvedValueOnce({
        id: 'movimento-3',
        movimentoId: 'movimento-3',
        status: 'PAGO',
        valorRealizado: 200,
        valorAberto: 0,
      });
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    renderWithQueryClient(
      <FinanceActionDialog
        kind="entrada"
        open
        readOnly={false}
        onClose={vi.fn()}
        accounts={[account]}
        categories={[{
          id: 'categoria-entrada-1',
          nome: 'Serviços',
          cor: null,
          icone: null,
          impactaDre: true,
          ativa: true,
        }]}
        payableCategories={[]}
        launch={null}
        movement={null}
        model={null}
        onSuccess={onSuccess}
        onError={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Receita de teste' },
    });
    const amountInput = screen.getByLabelText('Valor');
    fireEvent.change(amountInput, { target: { value: '100,00' } });
    const submit = screen.getByRole('button', { name: 'Registrar entrada' });

    fireEvent.click(submit);
    await waitFor(() => expect(criarMovimentoManual).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).not.toBeDisabled());
    const firstKey = vi.mocked(criarMovimentoManual).mock.calls[0][0].idempotencyKey;

    fireEvent.click(submit);
    await waitFor(() => expect(criarMovimentoManual).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(submit).not.toBeDisabled());
    const retryKey = vi.mocked(criarMovimentoManual).mock.calls[1][0].idempotencyKey;
    expect(retryKey).toBe(firstKey);

    fireEvent.change(amountInput, { target: { value: '200,00' } });
    fireEvent.click(submit);
    await waitFor(() => expect(criarMovimentoManual).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).not.toBeDisabled());
    const changedDataKey = vi.mocked(criarMovimentoManual).mock.calls[2][0].idempotencyKey;
    expect(changedDataKey).not.toBe(firstKey);

    fireEvent.click(submit);
    await waitFor(() => expect(criarMovimentoManual).toHaveBeenCalledTimes(4));
    const afterSuccessKey = vi.mocked(criarMovimentoManual).mock.calls[3][0].idempotencyKey;
    expect(afterSuccessKey).not.toBe(changedDataKey);
  });

  it('não exibe KPIs zerados quando o resumo falha', async () => {
    vi.mocked(getFinanceiroResumo).mockRejectedValueOnce(new Error('RPC indisponível'));

    renderWithQueryClient(<Financeiro />);

    expect(await screen.findByText('Parte da central não carregou')).toBeInTheDocument();
    expect(screen.queryByText('Saldo atual')).not.toBeInTheDocument();
    expect(screen.queryByText('Projetado')).not.toBeInTheDocument();
  });

  it('mantém os sete KPIs preparados para uma linha no tablet deitado', async () => {
    renderWithQueryClient(<Financeiro />);

    const grid = await screen.findByTestId('finance-summary-grid');
    expect(grid.children).toHaveLength(7);
    expect(grid).toHaveClass('lg:grid-cols-7');
  });

  it('bloqueia a exportação CSV enquanto os valores estão ocultos', async () => {
    renderWithQueryClient(<Financeiro />, true);

    expect(await screen.findByRole('heading', { name: 'Financeiro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();
  });
});
