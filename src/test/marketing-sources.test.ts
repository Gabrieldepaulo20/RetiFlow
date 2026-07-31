import { resolveMarketingActionMetricsSource } from '../../supabase/functions/_shared/marketing-sources';
import { classifyMarketingAttribution } from '../../supabase/functions/_shared/marketing-attribution';

describe('marketing attribution bucket', () => {
  it('keeps paid, organic and remaining site traffic in separate buckets', () => {
    expect(classifyMarketingAttribution({ source: 'google', medium: 'cpc' })).toBe('paid');
    expect(classifyMarketingAttribution({ source: 'google', medium: 'organic' })).toBe('organic');
    expect(classifyMarketingAttribution({ source: 'direto', referrer: 'https://www.google.com.br/search?q=retifica' })).toBe('organic');
    expect(classifyMarketingAttribution({ source: 'direto', referrer: 'https://www.bing.com/search?q=retifica' })).toBe('organic');
    expect(classifyMarketingAttribution({ source: 'bing', medium: 'cpc', referrer: 'https://www.bing.com' })).toBe('other');
    expect(classifyMarketingAttribution({ source: 'direto', medium: 'sem meio' })).toBe('other');
  });

  it('treats Google click identifiers as paid even without UTM fields', () => {
    expect(classifyMarketingAttribution({ gclid: 'gclid-presente', referrer: 'https://google.com' })).toBe('paid');
    expect(classifyMarketingAttribution({ gbraid: 'gbraid-presente' })).toBe('paid');
    expect(classifyMarketingAttribution({ wbraid: 'wbraid-presente' })).toBe('paid');
  });
});

describe('marketing action metric source', () => {
  it('keeps GA4 while the internal pilot does not cover both comparison periods', () => {
    expect(resolveMarketingActionMetricsSource({
      hasSiteKey: true,
      pilotStartDate: '2026-07-23',
      comparisonStartDate: '2026-05-25',
      hasGa4: true,
    })).toMatchObject({
      source: 'ga4',
      useFirstPartyActions: false,
      includeInternalDailyActions: false,
    });
  });

  it('uses deduplicated internal actions after the whole comparison window is covered', () => {
    expect(resolveMarketingActionMetricsSource({
      hasSiteKey: true,
      pilotStartDate: '2026-07-23',
      comparisonStartDate: '2026-07-23',
      hasGa4: true,
    })).toMatchObject({
      source: 'internal',
      useFirstPartyActions: true,
      includeInternalDailyActions: true,
    });
  });

  it('reports partial internal coverage when GA4 is unavailable', () => {
    expect(resolveMarketingActionMetricsSource({
      hasSiteKey: true,
      pilotStartDate: '2026-07-23',
      comparisonStartDate: '2026-07-01',
      hasGa4: false,
    })).toMatchObject({
      source: 'internal_partial',
      useFirstPartyActions: true,
      includeInternalDailyActions: false,
    });
  });
});
