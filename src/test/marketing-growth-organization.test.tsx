import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketingResumo } from '@/api/supabase/marketing';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GoogleAdsTab, OverviewTab, ResultsTab, SeoTab } from '@/pages/MarketingGrowth';
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
    clicks: 55,
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
      aiTraffic: {
        sessions: 3,
        pageViews: 7,
        engagedSessions: 2,
        engagementRate: 66.7,
        averageSessionDuration: 82,
        pagesPerSession: 2.33,
        whatsappClicks: 1,
        phoneClicks: 0,
        formSubmits: 1,
        leads: 1,
        engines: [
          {
            source: 'chatgpt.com',
            medium: 'ai_referral',
            visits: 3,
            pageViews: 7,
            engagedSessions: 2,
            engagementRate: 66.7,
            averageSessionDuration: 82,
            whatsappClicks: 1,
            phoneClicks: 0,
            formSubmits: 1,
            leads: 1,
            aiEngine: 'ChatGPT',
          },
        ],
      },
      daily: [],
      whatsapp: {
        uniqueClicks: 5,
        repeatedClicks: 1,
        paidClicks: 4,
        organicClicks: 1,
        otherClicks: 0,
        points: [
          {
            eventLabel: 'b2b_hero_whatsapp',
            pagePath: '/b2b',
            uniqueClicks: 4,
            repeatedClicks: 1,
            paidClicks: 4,
            organicClicks: 0,
            otherClicks: 0,
            lastClickedAt: '2026-07-29T10:00:00.000Z',
          },
          {
            eventLabel: 'contact_hero_whatsapp',
            pagePath: '/contato',
            uniqueClicks: 1,
            repeatedClicks: 0,
            paidClicks: 0,
            organicClicks: 1,
            otherClicks: 0,
            lastClickedAt: '2026-07-28T10:00:00.000Z',
          },
        ],
      },
    },
    businessProfile: {
      status: 'available',
      current: {
        interactions: 68,
        whatsappClicks: 2,
        calls: 9,
        directions: 14,
        websiteClicks: 11,
        bookings: 0,
        menus: 0,
      },
      previous: {
        interactions: 0,
        whatsappClicks: 0,
        calls: 0,
        directions: 0,
        websiteClicks: 0,
        bookings: 0,
        menus: 0,
      },
      syncedAt: '2026-07-31T00:00:00.000Z',
      dataWindowMonths: 6,
    },
    campaigns: {
      current: adsTotals,
      previous: adsTotals,
      items: [],
      daily: [],
      devices: [],
      networks: [
        { ...adsTotals, network: 'SEARCH' },
        { ...adsTotals, network: 'SEARCH_PARTNERS', spend: 5, clicks: 8, conversions: 0 },
      ],
      adGroups: [
        {
          ...adsTotals,
          campaignId: 'campaign-1',
          campaign: 'Pesquisa regional',
          id: 'group-1',
          name: 'Retífica de cabeçote',
          status: 'ENABLED',
        },
      ],
      keywords: [
        {
          ...adsTotals,
          campaignId: 'campaign-1',
          campaign: 'Pesquisa regional',
          adGroupId: 'group-1',
          adGroup: 'Retífica de cabeçote',
          criterionId: 'keyword-1',
          keyword: 'retífica de cabeçote',
          matchType: 'PHRASE',
          status: 'ENABLED',
          qualityScore: 8,
          creativeQualityScore: 'ABOVE_AVERAGE',
          landingPageQualityScore: 'AVERAGE',
          expectedCtrScore: 'BELOW_AVERAGE',
        },
      ],
      searchTerms: [],
      landingPages: [],
      schedule: [],
      clickTypes: [
        { type: 'URL_CLICKS', clicks: 18, interactions: 18, spend: 15 },
        { type: 'SITELINKS', clicks: 7, interactions: 7, spend: 6 },
        { type: 'CALLS', clicks: 10, interactions: 10, spend: 9 },
        { type: 'CLICK_TO_MESSAGE_THIRD_PARTY_CLICK', clicks: 5, interactions: 5, spend: 4 },
        { type: 'LOCATION_EXPANSION', clicks: 9, interactions: 9, spend: 8 },
        { type: 'GET_DIRECTIONS', clicks: 6, interactions: 6, spend: 7 },
      ],
      messageAssets: [
        {
          id: 'message-asset-1',
          name: 'WhatsApp do anúncio',
          provider: 'WHATSAPP',
          phoneNumber: '16993021998',
          countryCode: 'BR',
          callToAction: 'GET_QUOTE',
          starterMessageConfigured: true,
          level: 'CAMPAIGN',
          campaignId: 'campaign-1',
          campaign: 'Pesquisa regional',
          status: 'ENABLED',
          primaryStatus: 'ELIGIBLE',
          impressions: 20,
          clicks: 5,
          spend: 4,
          conversions: 0,
        },
      ],
      calls: {
        reported: 2,
        received: 1,
        missed: 1,
        averageDurationSeconds: 45,
        longestDurationSeconds: 65,
        items: [
          {
            id: 'call-1',
            startedAt: '2026-07-29 10:03:06',
            endedAt: '2026-07-29 10:04:11',
            durationSeconds: 65,
            status: 'RECEIVED',
            areaCode: '16',
            countryCode: '55',
            displayLocation: 'AD',
            type: 'HIGH_END_MOBILE_SEARCH',
          },
          {
            id: 'call-2',
            startedAt: '2026-07-28 15:22:00',
            endedAt: '2026-07-28 15:22:25',
            durationSeconds: 25,
            status: 'MISSED',
            areaCode: null,
            countryCode: '55',
            displayLocation: 'AD',
            type: 'HIGH_END_MOBILE_SEARCH',
          },
        ],
      },
      conversionActions: [],
      paidActions: {
        trackedSessions: 17,
        whatsappClicks: 4,
        phoneClicks: 2,
        formSubmits: 1,
      },
      paidVisitors: [],
      offlineConversions: null,
      financialAvailable: true,
      statusMessage: 'Conta conectada.',
    },
    business: {
      current: {
        identifiedClients: 2,
        newClients: 1,
        existingClients: 1,
        unknownClients: 0,
        confirmedCalls: 1,
        confirmedArrivals: 1,
        approvedOrders: 1,
        approvedServices: 1_000,
        excludedProducts: 250,
        commission: 200,
      },
      previous: {
        identifiedClients: 0,
        newClients: 0,
        existingClients: 0,
        unknownClients: 0,
        confirmedCalls: 0,
        confirmedArrivals: 0,
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

    expect(screen.getByText('Visitantes · todas as origens')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp no site · todas as origens')).toBeInTheDocument();
    expect(screen.getByText('Tempo médio no site')).toBeInTheDocument();
    expect(screen.getByText('Páginas por visita')).toBeInTheDocument();
    expect(screen.getByText('4 Google Ads · 1 SEO · 0 demais')).toBeInTheDocument();
    expect(screen.getByText('1min 30s')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'De onde veio o clique no WhatsApp?' })).toBeInTheDocument();
    expect(screen.getByText('WhatsApp do anúncio')).toBeInTheDocument();
    expect(screen.getByText('Site após anúncio')).toBeInTheDocument();
    expect(screen.getByText('Site · SEO orgânico')).toBeInTheDocument();
    expect(screen.getByText('Site · demais origens')).toBeInTheDocument();
    expect(screen.getByText('Perfil da Empresa')).toBeInTheDocument();
    expect(screen.getByText('Cliques no chat do Perfil da Empresa')).toBeInTheDocument();
  });

  it('mantém a aba Google Ads focada somente em mídia paga e explica seus KPIs', async () => {
    renderWithTooltips(<GoogleAdsTab resumo={buildResumo()} />);

    expect(screen.getByRole('heading', { name: 'Somente desempenho dos anúncios' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quanto investimos e quantas interações tivemos?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para onde foram os cliques?' })).toBeInTheDocument();
    expect(screen.getByText('Links do site')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp do anúncio')).toBeInTheDocument();
    expect(screen.getByText('(16) 99302-1998')).toBeInTheDocument();
    expect(screen.getByText('Apto a aparecer')).toBeInTheDocument();
    expect(screen.getByText('Ligar no anúncio')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp no site após anúncio')).toBeInTheDocument();
    expect(screen.getByText('Somente pessoas identificadas como vindas da mídia paga')).toBeInTheDocument();
    expect(screen.getByText('1 SEO · 0 demais ficam no Resumo')).toBeInTheDocument();
    expect(screen.queryByText('WhatsApp dentro do site')).not.toBeInTheDocument();
    expect(screen.getByText('Onde visitantes dos anúncios clicaram no WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Topo da página B2B')).toBeInTheDocument();
    expect(screen.getByLabelText('55 de 55 cliques explicados')).toHaveTextContent('55 / 55');
    expect(screen.getByText('1 atendida · 45s em média')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Do clique ao atendimento real' })).not.toBeInTheDocument();
    expect(screen.getByText('Toques em Ligar')).toBeInTheDocument();
    expect(screen.getByText('Registradas')).toBeInTheDocument();
    expect(screen.getByText('Com 30s ou mais')).toBeInTheDocument();
    expect(screen.getByText('Viraram clientes')).toBeInTheDocument();
    expect(screen.queryByText('Pedidos de rota')).not.toBeInTheDocument();
    expect(screen.queryByText('Chegaram à retífica')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Detalhes de cada ligação' })).toBeInTheDocument();
    expect(screen.getByText('29/07/2026 às 10:03')).toBeInTheDocument();
    expect(screen.getByText('1min 05s')).toBeInTheDocument();
    expect(screen.getByText('Brasil (+55) · DDD 16')).toBeInTheDocument();
    expect(screen.getByText('Brasil (+55) · DDD indisponível')).toBeInTheDocument();
    expect(screen.getAllByText('Atendida').length).toBeGreaterThan(0);
    expect(screen.getByText(/não nome nem telefone completo/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Os cliques estão virando resultado?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Onde estamos perdendo oportunidades?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pesquisa Google x parceiros' })).toBeInTheDocument();
    expect(screen.getByText('Parceiros de Pesquisa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desempenho por grupo de anúncios' })).toBeInTheDocument();
    expect(screen.getByText('Todas as conversões')).toBeInTheDocument();
    expect(screen.queryByText('Comissão gerada')).not.toBeInTheDocument();
    expect(screen.queryByText('O.S. aprovadas')).not.toBeInTheDocument();

    const [ctrHelp] = screen.getAllByRole('button', { name: 'Entender CTR' });
    fireEvent.focus(ctrHelp);

    await waitFor(() => {
      expect(screen.getAllByText(/Taxa de cliques: cliques divididos por impressões/i).length).toBeGreaterThan(0);
    });

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Palavras-chave' }), { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(screen.getByText('CTR esperado')).toBeInTheDocument());
    expect(screen.getAllByText('Retífica de cabeçote').length).toBeGreaterThan(0);
    expect(screen.getByText('Acima')).toBeInTheDocument();
    expect(screen.getByText('Na média')).toBeInTheDocument();
    expect(screen.getByText('Abaixo')).toBeInTheDocument();
  });

  it('não inventa a parcela orgânica enquanto o backend antigo ainda não a classifica', () => {
    const resumo = buildResumo();
    delete resumo.site.whatsapp?.organicClicks;
    delete resumo.site.whatsapp?.otherClicks;

    renderWithTooltips(<OverviewTab resumo={resumo} />);

    expect(screen.getByText('4 Google Ads · SEO aguardando atualização segura')).toBeInTheDocument();
    expect(screen.getByText('Aguardando a classificação oficial da fonte')).toBeInTheDocument();
    expect(screen.getByText('Sem estimar orgânico a partir do restante')).toBeInTheDocument();
  });

  it('mantém Resultado exclusivamente comercial, sem repetir o bloco de Google Ads', () => {
    renderWithTooltips(<ResultsTab resumo={buildResumo()} />);

    expect(screen.getByText('Esta aba mostra somente o resultado comercial atribuído.')).toBeInTheDocument();
    expect(screen.getByText('Comissão gerada')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quem realmente virou cliente?' })).toBeInTheDocument();
    expect(screen.getByText('Clientes novos')).toBeInTheDocument();
    expect(screen.getByText('Já eram clientes')).toBeInTheDocument();
    expect(screen.getByText('Clientes via ligação')).toBeInTheDocument();
    expect(screen.queryByText('Chegadas pela rota')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'O.S. que geraram comissão' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Google Ads' })).not.toBeInTheDocument();
    expect(screen.queryByText('Mídia paga')).not.toBeInTheDocument();
  });

  it('separa tráfego confirmado por IA de menções sem clique', () => {
    renderWithTooltips(<SeoTab resumo={buildResumo()} />);

    expect(screen.getByRole('heading', { name: 'Visitas confirmadas vindas de IAs' })).toBeInTheDocument();
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
    expect(screen.getByText('chatgpt.com / ai_referral')).toBeInTheDocument();
    expect(screen.getByText(/Uma IA pode citar a Retífica Premium sem gerar clique/i)).toBeInTheDocument();
  });
});
