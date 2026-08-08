import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  estornarParcelaFechamento,
  getParcelasFechamento,
  insertFinanceiroAnexo,
  registrarParcelaFechamento,
  uploadFinanceiroComprovante,
  type FinanceiroConta,
  type FechamentoParcela,
  type ParcelasFechamentoResumo,
} from '@/api/supabase/financeiro';
import type { FechamentoListItem } from '@/api/supabase/fechamentos';
import { ClosingPaymentDialog } from '@/components/closing/ClosingPaymentDialog';
import { FinancialPrivacyContext } from '@/contexts/FinancialPrivacyContext';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock('@/api/supabase/financeiro', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/supabase/financeiro')>();
  return {
    ...original,
    estornarParcelaFechamento: vi.fn(),
    getFinanceiroAnexoSignedUrl: vi.fn(),
    getParcelasFechamento: vi.fn(),
    insertFinanceiroAnexo: vi.fn(),
    registrarParcelaFechamento: vi.fn(),
    uploadFinanceiroComprovante: vi.fn(),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

const account: FinanceiroConta = {
  id: 'conta-1',
  nome: 'Caixa geral',
  tipo: 'CAIXA',
  saldoInicial: 0,
  saldoInicialConfirmado: true,
  dataCorte: null,
  ativa: true,
  padrao: true,
  createdAt: null,
  updatedAt: null,
};

const closing = (id: string, clientName = `Cliente ${id}`): FechamentoListItem => ({
  id_fechamentos: id,
  mes: 'Agosto',
  ano: 2026,
  periodo: 'Agosto de 2026',
  label: `Fechamento ${id}`,
  valor_total: 1000,
  status_pagamento: 'PENDENTE',
  valor_recebido: 0,
  versao: 1,
  total_regeneracoes: 0,
  total_edicoes: 0,
  total_downloads: 0,
  created_at: '2026-08-08T12:00:00-03:00',
  updated_at: null,
  cliente: { id: `cliente-${id}`, nome: clientName },
  dados_json: null,
  pdf_url: null,
});

const installment = (overrides: Partial<FechamentoParcela> = {}): FechamentoParcela => ({
  id: 'parcela-1',
  numero: 1,
  valor: 500,
  dataEfetiva: '2026-08-08T12:00:00-03:00',
  contaId: account.id,
  contaNome: account.nome,
  formaPagamento: 'PIX',
  observacoes: null,
  usuarioNome: 'Financeiro',
  createdAt: '2026-08-08T12:00:00-03:00',
  ativa: true,
  estornadaEm: null,
  motivoEstorno: null,
  podeEstornar: true,
  anexos: [],
  ...overrides,
});

const summary = (
  fechamentoId: string,
  overrides: Partial<ParcelasFechamentoResumo> = {},
): ParcelasFechamentoResumo => ({
  fechamentoId,
  clienteId: null,
  chaveIdempotencia: null,
  recebimentoInicialChave: null,
  valorTotal: 1000,
  valorRecebido: 0,
  valorAberto: 1000,
  status: 'PENDENTE',
  parcelasAtivas: 0,
  parcelas: [],
  ...overrides,
});

type DialogProps = {
  closing: FechamentoListItem;
  accounts?: FinanceiroConta[];
  canReverse?: boolean;
  onChanged?: () => Promise<void> | void;
};

function dialogNode({
  closing: currentClosing,
  accounts = [account],
  canReverse = false,
  onChanged = vi.fn(),
}: DialogProps) {
  return (
    <FinancialPrivacyContext.Provider value={{ financialValuesHidden: false, toggleFinancialValues: vi.fn() }}>
      <ClosingPaymentDialog
        closing={currentClosing}
        accounts={accounts}
        open
        readOnly={false}
        canReverse={canReverse}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    </FinancialPrivacyContext.Provider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ClosingPaymentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.mocked(uploadFinanceiroComprovante).mockResolvedValue('usuario/parcela/comprovante.pdf');
    vi.mocked(insertFinanceiroAnexo).mockResolvedValue({
      id: 'anexo-1',
      movimentoId: 'parcela-1',
      status: null,
      valorRealizado: null,
      valorAberto: null,
    });
    vi.mocked(registrarParcelaFechamento).mockResolvedValue({
      id: 'parcela-2',
      movimentoId: 'parcela-2',
      status: 'PARCIAL',
      valorRealizado: 500,
      valorAberto: 500,
    });
    vi.mocked(estornarParcelaFechamento).mockResolvedValue({
      id: 'estorno-1',
      movimentoId: 'estorno-1',
      status: 'PENDENTE',
      valorRealizado: 0,
      valorAberto: 1000,
    });
  });

  it('ignora a resposta antiga quando o fechamento muda durante a consulta', async () => {
    const first = deferred<ParcelasFechamentoResumo>();
    const second = deferred<ParcelasFechamentoResumo>();
    vi.mocked(getParcelasFechamento).mockImplementation((id) => (
      id === 'fechamento-a' ? first.promise : second.promise
    ));

    const view = render(dialogNode({ closing: closing('fechamento-a', 'Cliente A') }));
    await waitFor(() => expect(getParcelasFechamento).toHaveBeenCalledWith('fechamento-a'));

    view.rerender(dialogNode({ closing: closing('fechamento-b', 'Cliente B') }));
    await waitFor(() => expect(getParcelasFechamento).toHaveBeenCalledWith('fechamento-b'));

    await act(async () => {
      second.resolve(summary('fechamento-b', { valorTotal: 222, valorAberto: 222 }));
      await second.promise;
    });
    expect((await screen.findAllByText('R$ 222,00')).length).toBeGreaterThan(0);

    await act(async () => {
      first.resolve(summary('fechamento-a', { valorTotal: 111, valorAberto: 111 }));
      await first.promise;
    });
    expect(screen.queryByText('R$ 111,00')).not.toBeInTheDocument();
    expect(screen.getAllByText('R$ 222,00').length).toBeGreaterThan(0);
  });

  it('usa parcelasAtivas do servidor e exige o saldo quando já existe uma parcela', async () => {
    vi.mocked(getParcelasFechamento).mockResolvedValue(summary('fechamento-1', {
      valorRecebido: 500,
      valorAberto: 500,
      status: 'PARCIAL',
      parcelasAtivas: 1,
      parcelas: [],
    }));

    render(dialogNode({ closing: closing('fechamento-1') }));

    const amount = await screen.findByLabelText('Valor recebido agora');
    expect(amount).toHaveValue(500);
    expect(amount).toHaveAttribute('readonly');
    expect(screen.getByRole('heading', { name: 'Quitar o saldo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '50%' })).not.toBeInTheDocument();
    expect(screen.getByText('1 de 2 parcelas ativas registradas.')).toBeInTheDocument();
  });

  it('calcula os atalhos percentuais em centavos sem perder o centavo ímpar', async () => {
    vi.mocked(getParcelasFechamento).mockResolvedValue(summary('fechamento-centavos', {
      valorTotal: 1.15,
      valorAberto: 1.15,
    }));

    render(dialogNode({ closing: closing('fechamento-centavos') }));

    const amount = await screen.findByLabelText('Valor recebido agora');
    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    expect(amount).toHaveValue(0.58);
    fireEvent.click(screen.getByRole('button', { name: '60%' }));
    expect(amount).toHaveValue(0.69);
  });

  it('preserva campos digitados quando as contas chegam e ao recarregar depois de anexar', async () => {
    const currentSummary = summary('fechamento-formulario', {
      parcelasAtivas: 0,
      parcelas: [installment()],
    });
    vi.mocked(getParcelasFechamento).mockResolvedValue(currentSummary);
    const currentClosing = closing('fechamento-formulario');
    const onChanged = vi.fn();
    const view = render(dialogNode({ closing: currentClosing, accounts: [], onChanged }));

    const amount = await screen.findByLabelText('Valor recebido agora');
    const observations = screen.getByLabelText('Observações');
    const date = screen.getByLabelText('Data');
    fireEvent.change(amount, { target: { value: '400.00' } });
    fireEvent.change(observations, { target: { value: 'Cheque combinado com o cliente' } });
    fireEvent.change(date, { target: { value: '2026-08-10' } });

    view.rerender(dialogNode({ closing: currentClosing, accounts: [account], onChanged }));
    await waitFor(() => expect(screen.getByLabelText('Conta financeira')).toHaveTextContent(account.nome));
    expect(amount).toHaveValue(400);
    expect(observations).toHaveValue('Cheque combinado com o cliente');
    expect(date).toHaveValue('2026-08-10');

    const file = new File(['comprovante'], 'comprovante.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Anexar comprovante'), { target: { files: [file] } });
    await waitFor(() => expect(insertFinanceiroAnexo).toHaveBeenCalled());
    await waitFor(() => expect(getParcelasFechamento).toHaveBeenCalledTimes(2));
    expect(amount).toHaveValue(400);
  });

  it('mantém o sucesso do pagamento quando apenas a atualização externa falha', async () => {
    vi.mocked(getParcelasFechamento).mockResolvedValue(summary('fechamento-pagamento'));
    const onChanged = vi.fn().mockRejectedValue(new Error('refresh indisponível'));
    render(dialogNode({ closing: closing('fechamento-pagamento'), onChanged }));

    await screen.findByLabelText('Valor recebido agora');
    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar parcela' }));

    await waitFor(() => expect(registrarParcelaFechamento).toHaveBeenCalled());
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Pagamento salvo; atualização pendente',
    })));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parcela registrada' }));
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível registrar a parcela' }));
  });

  it('mantém o sucesso do estorno quando apenas a atualização externa falha', async () => {
    vi.mocked(getParcelasFechamento).mockResolvedValue(summary('fechamento-estorno', {
      valorRecebido: 500,
      valorAberto: 500,
      status: 'PARCIAL',
      parcelasAtivas: 1,
      parcelas: [installment()],
    }));
    const onChanged = vi.fn().mockRejectedValue(new Error('refresh indisponível'));
    render(dialogNode({ closing: closing('fechamento-estorno'), canReverse: true, onChanged }));

    await screen.findByText('Parcela 1');
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir esta parcela' }));
    fireEvent.change(screen.getByLabelText('Motivo do estorno'), { target: { value: 'Cheque devolvido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));

    await waitFor(() => expect(estornarParcelaFechamento).toHaveBeenCalled());
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Estorno salvo; atualização pendente',
    })));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parcela estornada' }));
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível estornar' }));
  });

  it('repete exatamente o mesmo estorno quando a primeira resposta se perde', async () => {
    vi.mocked(getParcelasFechamento).mockResolvedValue(summary('fechamento-retry-estorno', {
      valorRecebido: 500,
      valorAberto: 500,
      status: 'PARCIAL',
      parcelasAtivas: 1,
      parcelas: [installment()],
    }));
    vi.mocked(estornarParcelaFechamento)
      .mockRejectedValueOnce(new Error('resposta perdida'))
      .mockResolvedValueOnce({
        id: 'estorno-1',
        movimentoId: 'estorno-1',
        status: 'PENDENTE',
        valorRealizado: 0,
        valorAberto: 1000,
      });

    render(dialogNode({ closing: closing('fechamento-retry-estorno'), canReverse: true }));
    await screen.findByText('Parcela 1');
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir esta parcela' }));
    fireEvent.change(screen.getByLabelText('Motivo do estorno'), { target: { value: 'Cheque devolvido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));

    await waitFor(() => expect(estornarParcelaFechamento).toHaveBeenCalledTimes(2));
    const firstInput = vi.mocked(estornarParcelaFechamento).mock.calls[0]?.[0];
    const retryInput = vi.mocked(estornarParcelaFechamento).mock.calls[1]?.[0];
    expect(retryInput).toEqual(firstInput);
    expect(firstInput?.dataEfetiva).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Parcela estornada' }));
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível estornar' }));
  });

  it('preserva o último histórico válido quando uma recarga falha', async () => {
    vi.mocked(getParcelasFechamento)
      .mockResolvedValueOnce(summary('fechamento-historico', {
        valorRecebido: 500,
        valorAberto: 500,
        status: 'PARCIAL',
        parcelasAtivas: 1,
        parcelas: [installment()],
      }))
      .mockRejectedValueOnce(new Error('refresh indisponível'));

    render(dialogNode({ closing: closing('fechamento-historico') }));
    await screen.findByText('Parcela 1');
    const file = new File(['comprovante'], 'comprovante.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Anexar comprovante'), { target: { files: [file] } });

    await waitFor(() => expect(getParcelasFechamento).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Parcela 1')).toBeInTheDocument();
  });
});
