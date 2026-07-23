import { resolveMarketingActionMetricsSource } from '../../supabase/functions/_shared/marketing-sources';

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
