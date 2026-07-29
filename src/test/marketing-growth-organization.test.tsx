import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketingResumo } from '@/api/supabase/marketing';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GoogleAdsTab, OverviewTab, ResultsTab } from '@/pages/MarketingGrowth';
import { FinancialPrivacyProvider } from '@/contexts/FinancialPrivacyProvider';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

function buildResumo(): MarketingResumo {
  const adsTotals = {
    spend: 45,
    impressions: 1_000,
    clicks: 50,
    leads: 4,
    conversions: 4,
    allConversions: 5,
    cpl: 11.25,
    ctr: 5,
    averageCpc: 0.9,
    conversionRate: 8,
    conversionValue: 4,
    allConversionValue: 5,
    valuePerConversion: 1,
    roas: 0.09,
    invalidClicks: 2,
    invalidClickRate: 3.8,
    searchImpressionShare: 62,
    searchTopImpressionShare: 44,
    searchAbsoluteTopImpressionShare: 21,
    searchBudgetLostImpressionShare: 18,
    searchRankLostImpressionShare: 20,
  };

  return {
    periodDays: 30,
    context: { accessLevel: 'full', privateToMegaMaster: true },
    config: {
      moduloHabilitado: true,
      ga4Status: 'connected',
      hasSiteKey: true,
      allowedOrigins: [],
      updatedAt: '2026-07-25T00:00:00.000Z',
      commissionRate: 0.2,
    },
    integrations: [],
    site: {
      current: {
        visits: 20,
        sessions: 25,
        pageViews: 50,
        whatsappClicks: 5,
        phoneClicks: 0,
        formViews: 0,
        formStarts: 0,
        formSubmits: 0,
        actionEvents: 0,
        leads: 0,
        conversionRate: 0,
        averageSessionDuration: 90,
      },
      previous: {
        visits: 10,
        sessions: 10,
        pageViews: 15,
        whatsappClicks: 1,
        phoneClicks: 0,
        formViews: 0,
        formStarts: 0,
        formSubmits: 0,
        actionEvents: 0,
        leads: 0,
        averageSessionDuration: 45,
      },
      pages: [],
      sources: [],
      daily: [],
    },
    campaigns: {
      current: adsTotals,
      previous: adsTotals,
      items: [],
      daily: [],
      devices: [],
      keywords: [],
      searchTerms: [],
      landingPages: [],
      schedule: [],
      conversionActions: [],
      paidVisitors: [],
      offlineConversions: null,
      financialAvailable: true,
      statusMessage: 'Conta conectada.',
    },
    business: {
      current: {
        identifiedClients: 2,
        approvedOrders: 1,
        approvedServices: 1_000,
        excludedProducts: 250,
        commission: 200,
      },
      previous: {
        identifiedClients: 0,
        approvedOrders: 0,
        approvedServices: 0,
        excludedProducts: 0,
        commission: 0,
      },
      attributions: [],
      commissions: [],
    },
  };
}

function renderWithTooltips(node: ReactNode) {
  return render(
    <TooltipProvider delayDuration={0}>
      <FinancialPrivacyProvider>{node}</FinancialPrivacyProvider>
    </TooltipProvider>,
  );
}

describe('organização do painel Crescimento', () => {
  it('prioriza visitantes, WhatsApp, tempo e páginas no resumo', () => {
    renderWithTooltips(<OverviewTab resumo={buildResumo()} />);

    expect(screen.getByText('Visitantes no site')).toBeInTheDocument();
    expect(screen.getByText('Clicaram no WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Tempo médio no site')).toBeInTheDocument();
    expect(screen.getByText('Páginas por visita')).toBeInTheDocument();
    expect(screen.getByText('25,0% em relação aos visitantes')).toBeInTheDocument();
    expect(screen.getByText('1min 30s')).toBeInTheDocument();
  });

  it('mantém a aba Google Ads focada somente em mídia paga e explica seus KPIs', async () => {
    renderWithTooltips(<GoogleAdsTab resumo={buildResumo()} />);

    expect(screen.getByRole('heading', { name: 'Somente desempenho dos anúncios' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quanto investimos e quantas pessoas reagiram?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Os cliques estão virando resultado?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Onde estamos perdendo oportunidades?' })).toBeInTheDocument();
    expect(screen.getByText('Todas as conversões')).toBeInTheDocument();
    expect(screen.queryByText('Comissão gerada')).not.toBeInTheDocument();
    expect(screen.queryByText('O.S. aprovadas')).not.toBeInTheDocument();

    const [ctrHelp] = screen.getAllByRole('button', { name: 'Entender CTR' });
    fireEvent.focus(ctrHelp);

    await waitFor(() => {
      expect(screen.getAllByText(/Taxa de cliques: cliques divididos por impressões/i).length).toBeGreaterThan(0);
    });
  });

  it('mantém Resultado exclusivamente comercial, sem repetir o bloco de Google Ads', () => {
    renderWithTooltips(<ResultsTab resumo={buildResumo()} />);

    expect(screen.getByText('Esta aba mostra somente o resultado comercial atribuído.')).toBeInTheDocument();
    expect(screen.getByText('Comissão gerada')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'O.S. que geraram comissão' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Google Ads' })).not.toBeInTheDocument();
    expect(screen.queryByText('Mídia paga')).not.toBeInTheDocument();
  });
});
