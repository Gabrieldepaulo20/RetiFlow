import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FechamentoDadosJson } from '@/api/supabase/fechamentos';
import { ClosingHtmlPreview } from '@/components/closing/ClosingHtmlPreview';
import {
  getClosingFinancialSummaryDisplay,
  type ClosingFinancialSummary,
} from '@/components/closing/closingFinancialSummary';
import { FinancialPrivacyContext } from '@/contexts/FinancialPrivacyContext';

const dados: FechamentoDadosJson = {
  gerado_em: '2026-08-08T12:00:00.000Z',
  periodo: 'Agosto/2026',
  cliente: { id: 'cliente-1', nome: 'Cliente Teste' },
  notas: [],
  total_original: 1_000,
  total_com_desconto: 1_000,
};

function renderPreview(financialSummary?: ClosingFinancialSummary) {
  return render(
    <FinancialPrivacyContext.Provider
      value={{ financialValuesHidden: false, toggleFinancialValues: vi.fn() }}
    >
      <ClosingHtmlPreview dados={dados} financialSummary={financialSummary} />
    </FinancialPrivacyContext.Provider>,
  );
}

describe('resumo financeiro compartilhado do fechamento', () => {
  it('mantém o total legado quando o resumo opcional não é informado', () => {
    renderPreview();

    expect(screen.queryByRole('region', { name: 'Resumo financeiro do fechamento' })).not.toBeInTheDocument();
    expect(screen.getByText('Total a pagar')).toBeInTheDocument();
  });

  it('mostra total, recebido e saldo na prévia parcial', () => {
    renderPreview({ total: 1_000, received: 600, open: 400, status: 'PARCIAL' });

    const summary = screen.getByRole('region', { name: 'Resumo financeiro do fechamento' });
    expect(within(summary).getByText('Total')).toBeInTheDocument();
    expect(within(summary).getByText('Recebido')).toBeInTheDocument();
    expect(within(summary).getByText('Saldo')).toBeInTheDocument();
    expect(within(summary).getByText('R$ 600,00')).toBeInTheDocument();
    expect(within(summary).getByText('R$ 400,00')).toBeInTheDocument();
  });

  it('troca o saldo pela situação quitada quando o fechamento está pago', () => {
    renderPreview({ total: 1_000, received: 1_000, open: 0, status: 'PAGO' });

    const summary = screen.getByRole('region', { name: 'Resumo financeiro do fechamento' });
    expect(within(summary).getByText('Situação')).toBeInTheDocument();
    expect(within(summary).getByText('Quitado')).toBeInTheDocument();
    expect(within(summary).queryByText('Saldo')).not.toBeInTheDocument();
  });

  it('distingue a entrada planejada de um pagamento já recebido no rascunho', () => {
    renderPreview({
      total: 1_000,
      received: 600,
      open: 400,
      status: 'PARCIAL',
      planned: true,
    });

    const summary = screen.getByRole('region', { name: 'Resumo financeiro planejado do fechamento' });
    expect(within(summary).getByText('Entrada prevista')).toBeInTheDocument();
    expect(within(summary).getByText('Saldo após gerar')).toBeInTheDocument();
    expect(within(summary).queryByText('Recebido')).not.toBeInTheDocument();
  });

  it('neutraliza valores inválidos sem alterar o status informado', () => {
    expect(getClosingFinancialSummaryDisplay({
      total: Number.NaN,
      received: -10,
      open: Number.POSITIVE_INFINITY,
      status: 'PAGO',
    })).toEqual({ total: 0, received: 0, open: 0, isPaid: true, isPlanned: false });
  });
});
