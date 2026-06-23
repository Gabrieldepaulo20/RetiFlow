import type { MarketingResumo } from '@/api/supabase/marketing';
import {
  MARKETING_RESUMO_CACHE_TTL_MS,
  clearCachedMarketingResumo,
  getMarketingResumoCacheKey,
  readCachedMarketingResumo,
  writeCachedMarketingResumo,
} from '@/api/supabase/marketingCache';

function buildResumo(periodDays = 30): MarketingResumo {
  return {
    periodDays,
    config: {
      moduloHabilitado: true,
      ga4Status: 'connected',
      hasSiteKey: true,
      allowedOrigins: [],
      updatedAt: '2026-06-23T12:00:00.000Z',
      ga4PropertyId: '123',
    },
    integrations: [],
    site: {
      current: {
        visits: 10,
        pageViews: 20,
        whatsappClicks: 2,
        formSubmits: 1,
        actionEvents: 3,
        leads: 1,
      },
      previous: {
        visits: 4,
        pageViews: 8,
        whatsappClicks: 1,
        formSubmits: 0,
        actionEvents: 1,
        leads: 0,
      },
      pages: [],
      sources: [],
      daily: [],
    },
    campaigns: {
      current: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        cpl: 0,
      },
      items: [],
      daily: [],
      financialAvailable: false,
    },
  };
}

describe('marketing growth session cache', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores and reads a fresh marketing summary for the same period and target', () => {
    const resumo = buildResumo(30);
    writeCachedMarketingResumo(30, 'cliente-1', resumo, 1_000);

    const cached = readCachedMarketingResumo(30, 'cliente-1', 1_500);

    expect(cached?.savedAt).toBe(1_000);
    expect(cached?.data.site.current.visits).toBe(10);
    expect(cached?.key).toBe(getMarketingResumoCacheKey(30, 'cliente-1'));
  });

  it('isolates cache entries by target user and period', () => {
    writeCachedMarketingResumo(30, 'cliente-1', buildResumo(30), 1_000);

    expect(readCachedMarketingResumo(7, 'cliente-1', 1_500)).toBeNull();
    expect(readCachedMarketingResumo(30, 'cliente-2', 1_500)).toBeNull();
  });

  it('expires old summaries and removes the stale entry', () => {
    writeCachedMarketingResumo(30, null, buildResumo(30), 1_000);

    const cached = readCachedMarketingResumo(30, null, 1_000 + MARKETING_RESUMO_CACHE_TTL_MS + 1);

    expect(cached).toBeNull();
    expect(window.sessionStorage.getItem(getMarketingResumoCacheKey(30, null))).toBeNull();
  });

  it('ignores corrupted cache payloads', () => {
    const key = getMarketingResumoCacheKey(30, 'cliente-1');
    window.sessionStorage.setItem(key, '{quebrado');

    expect(readCachedMarketingResumo(30, 'cliente-1')).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('clears a specific cached summary', () => {
    writeCachedMarketingResumo(30, 'cliente-1', buildResumo(30), 1_000);

    clearCachedMarketingResumo(30, 'cliente-1');

    expect(readCachedMarketingResumo(30, 'cliente-1', 1_500)).toBeNull();
  });
});
