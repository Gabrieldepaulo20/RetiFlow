import type { MarketingResumo } from '@/api/supabase/marketing';
import { evaluateMarketingHealth } from '@/services/domain/marketingHealth';

function buildResumo(): MarketingResumo {
  return {
    periodDays: 30,
    context: { accessLevel: 'basic' },
    config: {
      moduloHabilitado: true,
      ga4Status: 'connected',
      updatedAt: '2026-07-23T12:00:00.000Z',
    },
    integrations: [
      { provider: 'internal', status: 'connected' },
      { provider: 'ga4', status: 'connected' },
    ],
    site: {
      current: {
        visits: 120,
        sessions: 100,
        pageViews: 240,
        whatsappClicks: 14,
        formSubmits: 10,
        totalEvents: 300,
        engagementRate: 62,
        leads: 12,
      },
      previous: {
        visits: 100,
        sessions: 90,
        pageViews: 200,
        whatsappClicks: 10,
        formSubmits: 8,
        engagementRate: 60,
        leads: 8,
      },
      pages: [],
      sources: [],
      daily: [],
    },
    campaigns: {
      current: { spend: 0, clicks: 0, leads: 0, cpl: 0 },
      items: [],
      daily: [],
      financialAvailable: false,
    },
  };
}

describe('marketing health evaluation', () => {
  it('classifies stable data as healthy', () => {
    const health = evaluateMarketingHealth(buildResumo());

    expect(health.status).toBe('healthy');
    expect(health.signals.some((item) => item.id === 'leads-growth')).toBe(true);
  });

  it('raises attention only after minimum-volume decline thresholds', () => {
    const resumo = buildResumo();
    resumo.site.current.visits = 60;
    resumo.site.current.whatsappClicks = 4;

    const health = evaluateMarketingHealth(resumo);

    expect(health.status).toBe('attention');
    expect(health.signals.map((item) => item.id)).toEqual(expect.arrayContaining([
      'visits-drop',
      'whatsapp-drop',
    ]));
  });

  it('prioritizes technical failures as critical', () => {
    const resumo = buildResumo();
    resumo.quality = {
      lastEventAt: null,
      alertFailures: 2,
      refreshIntervalMinutes: 5,
      generatedAt: '2026-07-23T12:00:00.000Z',
    };

    expect(evaluateMarketingHealth(resumo).status).toBe('critical');
  });

  it('flags meaningful traffic with no tracked contact without claiming marketing failure', () => {
    const resumo = buildResumo();
    resumo.site.current = {
      visits: 60,
      sessions: 60,
      whatsappClicks: 0,
      phoneClicks: 0,
      formSubmits: 0,
      totalEvents: 120,
      leads: 0,
    };

    const health = evaluateMarketingHealth(resumo);

    expect(health.status).toBe('attention');
    expect(health.signals.some((item) => item.id === 'traffic-without-contact')).toBe(true);
  });

  it('does not create noisy trend alerts for a tiny sample', () => {
    const resumo = buildResumo();
    resumo.site.current = {
      visits: 1,
      sessions: 1,
      whatsappClicks: 0,
      formSubmits: 0,
      totalEvents: 2,
      leads: 0,
    };
    resumo.site.previous = {
      visits: 2,
      sessions: 2,
      whatsappClicks: 1,
      formSubmits: 1,
      leads: 0,
    };

    expect(evaluateMarketingHealth(resumo).status).toBe('insufficient');
  });
});
