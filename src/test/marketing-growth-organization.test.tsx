import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketingResumo } from '@/api/supabase/marketing';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ContactsTab, GoogleAdsTab, JourneyTab, OverviewTab, QualityTab, ResultsTab, SeoTab } from '@/pages/MarketingGrowth';
import { FinancialPrivacyProvider } from '@/contexts/FinancialPrivacyProvider';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

import { buildResumo } from '@/test/fixtures/marketing-resumo';

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
    expect(screen.getByRole('heading', { name: 'De onde vieram e por onde passaram' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filtrar jornadas por origem' })).toBeInTheDocument();
    expect(screen.getAllByText('Google Ads').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Orgânico').length).toBeGreaterThan(0);
    expect(screen.queryByText('retífica de cabeçote')).not.toBeInTheDocument();
    expect(screen.getByText('Com consentimento')).toBeInTheDocument();
    expect(screen.getByText('Sessão anônima')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Jornadas das sessões do site' })).toHaveClass('max-h-[34rem]', 'overflow-auto');
    expect(screen.queryByText('Anúncio principal')).not.toBeInTheDocument();
    expect(screen.getByText('5min 00s')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando 2 de 2 jornadas rastreadas/i)).toBeInTheDocument();
    expect(screen.getByText(/não permite afirmar que a pessoa saiu imediatamente/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da sessão sessao-paga/i }));
    expect(screen.getByText('Caminho completo no site')).toBeInTheDocument();
    expect(screen.getByText('Clique no WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('/contato · whatsapp_contato')).toBeInTheDocument();
  });

  it('filtra /quanto-custa e mostra os cliques da pergunta na ordem da sessão', () => {
    const resumo = buildResumo();
    const baseVisitor = resumo.campaigns.allVisitors![0];
    resumo.campaigns.allVisitors = [
      ...resumo.campaigns.allVisitors!,
      {
        ...baseVisitor,
        visitorId: 'sessao-estimativa',
        firstSeenAt: '2026-07-30T10:00:00.000Z',
        lastSeenAt: '2026-07-30T10:00:08.000Z',
        landingPage: '/quanto-custa',
        lastPage: '/quanto-custa',
        pages: [{
          path: '/quanto-custa',
          title: null,
          occurredAt: '2026-07-30T10:00:00.000Z',
        }],
        actions: [
          {
            type: 'custom',
            eventName: 'quiz_step_view',
            occurredAt: '2026-07-30T10:00:04.000Z',
            pagePath: '/quanto-custa',
            detail: 'quiz_step_view',
            stepId: 'symptoms',
          },
          {
            type: 'custom',
            eventName: 'quiz_option_selected',
            occurredAt: '2026-07-30T10:00:05.000Z',
            pagePath: '/quanto-custa',
            detail: 'quiz_option_selected',
            stepId: 'symptoms',
            optionId: 'overheating',
            interactionAction: 'select',
          },
        ],
      },
    ];

    renderWithTooltips(<OverviewTab resumo={resumo} />);

    const estimateFilter = screen.getByRole('button', { name: /Só \/quanto-custa 1/i });
    fireEvent.click(estimateFilter);
    expect(estimateFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Mostrando 1 de 3 jornadas rastreadas/i)).toBeInTheDocument();
    expect(screen.getByText('2 ação(ões) na estimativa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da sessão sessao-estimativa/i }));
    expect(screen.getByText('Etapa visualizada')).toBeInTheDocument();
    expect(screen.getByText('Opção da pergunta clicada')).toBeInTheDocument();
    expect(screen.getByText(/Sintomas · marcou: Superaquecimento/i)).toBeInTheDocument();
  });

  it('mostra a jornada agregada e a atividade recente sem PII', () => {
    renderWithTooltips(
      <JourneyTab
        resumo={buildResumo()}
        recentActivity={{
          items: [{
            activityId: 'activity-abcdef1234567890',
            visitorToken: 'visitor-demo-001',
            occurredAt: '2026-07-31T12:00:00.000Z',
            eventName: 'cta_click',
            category: 'cta',
            pagePath: '/servicos',
            originType: 'paid',
            source: 'google',
            medium: 'cpc',
            campaign: 'campanha_regional',
            deviceType: 'mobile',
            componentId: 'services_hero_estimate',
            position: 'hero_primary',
            flowType: null,
            stepId: null,
            experimentId: 'hero_mobile_paid_v1',
            variantId: 'guided_estimate',
            estimateState: null,
            destinationType: 'estimate',
            destinationPath: '/quanto-custa',
            contactState: 'anonymous',
          }],
          nextCursor: null,
          hasMore: false,
          refreshAfterSeconds: 30,
          generatedAt: '2026-07-31T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Ativas em 5 segundos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cidades informadas na jornada' })).toBeInTheDocument();
    expect(screen.getByText('Ribeirão Preto / SP')).toBeInTheDocument();
    expect(screen.getByText('Sertãozinho / SP')).toBeInTheDocument();
    expect(screen.getByText('10 sessões nos grupos exibidos')).toBeInTheDocument();
    expect(screen.getByText('Privacidade: mínimo de 3 sessões')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Onde as pessoas clicaram' })).toBeInTheDocument();
    expect(screen.getByText('Sem avanço rastreado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Variantes do experimento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Retenção e contato por página' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Atividade recente do site' })).toBeInTheDocument();
    expect(screen.getByText('demo-001')).toBeInTheDocument();
    expect(screen.queryByText(/nome privado|telefone privado|sessao bruta/i)).not.toBeInTheDocument();
  });

  it('mantém a aba Google Ads focada somente em mídia paga e explica seus KPIs', async () => {
    renderWithTooltips(<GoogleAdsTab resumo={buildResumo()} />);

    expect(screen.queryByRole('heading', { name: 'Somente desempenho dos anúncios' })).not.toBeInTheDocument();
    expect(screen.queryByText('Escopo da aba')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quanto investimos e quantas interações tivemos?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para onde foram os cliques?' })).toBeInTheDocument();
    expect(screen.getByText('Links do site')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp do anúncio')).toBeInTheDocument();
    expect(screen.getByText('(16) 99302-1998')).toBeInTheDocument();
    expect(screen.getByText('Apto a aparecer')).toBeInTheDocument();
    expect(screen.queryByText('Ligar no anúncio')).not.toBeInTheDocument();
    expect(screen.getByText('WhatsApp no site após anúncio')).toBeInTheDocument();
    expect(screen.getByText('Somente pessoas identificadas como vindas da mídia paga')).toBeInTheDocument();
    expect(screen.getByText('1 SEO · 0 demais ficam no Resumo')).toBeInTheDocument();
    expect(screen.queryByText('WhatsApp dentro do site')).not.toBeInTheDocument();
    expect(screen.getByText('Onde visitantes dos anúncios clicaram no WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Topo da página B2B')).toBeInTheDocument();
    expect(screen.getByLabelText('55 de 55 cliques explicados')).toHaveTextContent('55 / 55');
    expect(screen.queryByText('1 atendida · 45s em média')).not.toBeInTheDocument();
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
    expect(screen.queryByText('ROAS configurado')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pesquisa Google x parceiros' })).not.toBeInTheDocument();
    // Bloco removido a pedido do dono: a divisão por grupo nunca chegou a ser
    // sincronizada pela Edge Function, então o card vivia vazio no painel.
    expect(screen.queryByRole('heading', { name: 'Desempenho por grupo de anúncios' })).not.toBeInTheDocument();
    expect(screen.getByText('Todas as conversões')).toBeInTheDocument();
    expect(screen.queryByText('Comissão gerada')).not.toBeInTheDocument();
    expect(screen.queryByText('O.S. aprovadas')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'De onde vieram e por onde passaram' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conferência de cliques e sessões do Google Ads' })).toHaveClass('max-h-[32rem]', 'overflow-auto');
    expect(screen.getByText('Tempo médio medido')).toBeInTheDocument();
    expect(screen.getByText('nenhuma sessão medida')).toBeInTheDocument();

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

  it('mantém os quatro indicadores de Contatos compactos em uma linha no tablet', () => {
    renderWithTooltips(
      <ContactsTab resumo={buildResumo()} onLinked={vi.fn()} canManageAttribution={false} />,
    );

    const grid = screen.getByTestId('contacts-summary-grid');
    expect(grid.className).toMatch(/grid-cols-\[repeat\(auto-fit/);
    expect(grid).toHaveClass('gap-2');
    expect(grid.children).toHaveLength(4);
    expect(grid.querySelectorAll('[class~="lg:p-2.5"]')).toHaveLength(4);
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

    const clientGrid = screen.getByTestId('results-client-grid');
    const valueGrid = screen.getByTestId('results-value-grid');
    for (const grid of [clientGrid, valueGrid]) {
      expect(grid.className).toMatch(/grid-cols-\[repeat\(auto-fit/);
    expect(grid).toHaveClass('gap-2');
      expect(grid.children).toHaveLength(4);
      expect(grid.querySelectorAll('[class~="lg:p-2.5"]')).toHaveLength(4);
    }
  });

  it('separa tráfego confirmado por IA de menções sem clique', () => {
    renderWithTooltips(<SeoTab resumo={buildResumo()} />);

    expect(screen.getByRole('heading', { name: 'Visitas confirmadas vindas de IAs' })).toBeInTheDocument();
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
    expect(screen.getByText('chatgpt.com / ai_referral')).toBeInTheDocument();
    expect(screen.getByText(/Uma IA pode citar a Retífica Premium sem gerar clique/i)).toBeInTheDocument();
  });

  it('mantém indicadores e fontes de Qualidade em linhas compactas no tablet', () => {
    const resumo = buildResumo();
    resumo.integrations = [
      { provider: 'google_ads', status: 'connected', accountName: 'Retífica Premium', freshness: 'Cache de até 10 minutos', lastSyncAt: '2026-07-31T12:00:00.000Z' },
      { provider: 'internal', status: 'connected', accountName: 'premiumretifica.com.br', freshness: 'Atualização a cada 5 minutos', lastSyncAt: '2026-07-31T12:00:00.000Z' },
      { provider: 'search_console', status: 'connected', accountName: 'sc-domain:premiumretifica.com.br', freshness: 'Defasagem da própria fonte', lastSyncAt: '2026-07-31T12:00:00.000Z' },
      { provider: 'ga4', status: 'connected', accountName: 'Retífica Premium', freshness: 'Cache de até 10 minutos', lastSyncAt: '2026-07-31T12:00:00.000Z' },
    ];

    renderWithTooltips(<QualityTab resumo={resumo} />);

    const summaryGrid = screen.getByTestId('quality-summary-grid');
    expect(summaryGrid.className).toMatch(/grid-cols-\[repeat\(auto-fit/);
    expect(summaryGrid).toHaveClass('gap-2');
    expect(summaryGrid.children).toHaveLength(4);
    expect(summaryGrid.querySelectorAll('[class~="lg:p-2.5"]')).toHaveLength(4);

    const integrationsGrid = screen.getByTestId('quality-integrations-grid');
    expect(integrationsGrid.className).toMatch(/grid-cols-\[repeat\(auto-fit/);
    expect(integrationsGrid).toHaveClass('gap-2');
    expect(integrationsGrid.children).toHaveLength(4);
    expect(screen.queryByRole('heading', { name: 'O que aconteceu no site' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Snapshots congelados' })).toBeInTheDocument();
  });
});
