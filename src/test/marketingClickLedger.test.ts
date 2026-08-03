import { describe, expect, it } from 'vitest';
import { buildUntrackedAdsClickRows } from '@/lib/marketingClickLedger';
import type {
  MarketingAdsClickTypeMetric,
  MarketingAdsLandingPageMetric,
  MarketingPaidVisitor,
} from '@/api/supabase/marketing';

const clickType = (type: string, clicks: number): MarketingAdsClickTypeMetric => ({
  type,
  clicks,
  interactions: clicks,
  spend: 0,
});

const landingPage = (url: string, clicks: number): MarketingAdsLandingPageMetric => ({
  url,
  clicks,
  spend: 0,
  leads: 0,
  cpl: 0,
});

const paidVisitor = (landingPagePath: string): MarketingPaidVisitor => ({
  visitorId: landingPagePath,
  firstSeenAt: '2026-08-03T12:00:00.000Z',
  lastSeenAt: '2026-08-03T12:00:30.000Z',
  durationSeconds: 30,
  landingPage: landingPagePath,
  lastPage: landingPagePath,
  source: 'google',
  medium: 'cpc',
  campaign: null,
  clickIdType: 'gclid',
  originType: 'paid',
  eventCount: 1,
  actionCount: 0,
  leadCode: null,
  leadName: null,
  leadContact: null,
  convertedClient: false,
  clientId: null,
});

describe('conferência de cliques do Google Ads', () => {
  it('mostra uma linha não medida para cada clique no site que não virou sessão', () => {
    const rows = buildUntrackedAdsClickRows({
      totalClicks: 7,
      paidVisitors: [paidVisitor('/contato'), paidVisitor('/problemas/junta-do-cabecote-queimada')],
      landingPages: [
        landingPage('https://premiumretifica.com.br/contato?gclid=nao-expor', 2),
        landingPage('https://premiumretifica.com.br/problemas/junta-do-cabecote-queimada', 1),
        landingPage('https://premiumretifica.com.br/servicos/retifica-de-cabecote', 2),
        landingPage('https://premiumretifica.com.br/servicos', 1),
        landingPage('https://premiumretifica.com.br/servicos/teste-de-trinca', 1),
      ],
      clickTypes: [clickType('URL_CLICKS', 5), clickType('SITELINKS', 2)],
    });

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.destinationLabel)).toEqual([
      '/contato',
      '/servicos/retifica-de-cabecote',
      '/servicos/retifica-de-cabecote',
      '/servicos',
      '/servicos/teste-de-trinca',
    ]);
    expect(JSON.stringify(rows)).not.toContain('gclid');
  });

  it('separa WhatsApp e ligação do anúncio sem inventar uma sessão no site', () => {
    const rows = buildUntrackedAdsClickRows({
      totalClicks: 4,
      paidVisitors: [],
      landingPages: [landingPage('https://premiumretifica.com.br/contato', 1)],
      clickTypes: [
        clickType('URL_CLICKS', 1),
        clickType('CLICK_TO_MESSAGE_THIRD_PARTY_CLICK', 2),
        clickType('CALLS', 1),
      ],
    });

    expect(rows.map((row) => row.kind)).toEqual([
      'site',
      'whatsapp_ad',
      'whatsapp_ad',
      'call_ad',
    ]);
  });

  it('mantém os cliques não classificados na conferência', () => {
    const rows = buildUntrackedAdsClickRows({
      totalClicks: 3,
      paidVisitors: [],
      landingPages: [],
      clickTypes: [clickType('URL_CLICKS', 1)],
    });

    expect(rows.map((row) => row.kind)).toEqual(['site', 'other', 'other']);
  });

  it('preserva uma linha por clique mesmo em períodos com 200 cliques', () => {
    const rows = buildUntrackedAdsClickRows({
      totalClicks: 200,
      paidVisitors: [],
      landingPages: [landingPage('https://premiumretifica.com.br/contato', 200)],
      clickTypes: [clickType('URL_CLICKS', 200)],
    });

    expect(rows).toHaveLength(200);
    expect(rows.every((row) => row.kind === 'site')).toBe(true);
  });
});
