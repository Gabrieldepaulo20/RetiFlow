export type MarketingActionMetricsSource = 'internal' | 'ga4' | 'internal_partial';

export interface MarketingActionMetricsDecision {
  source: MarketingActionMetricsSource;
  useFirstPartyActions: boolean;
  includeInternalDailyActions: boolean;
  label: string;
}

export function resolveMarketingActionMetricsSource(input: {
  hasSiteKey: boolean;
  pilotStartDate?: string | null;
  comparisonStartDate: string;
  hasGa4: boolean;
}): MarketingActionMetricsDecision {
  const firstPartyComparisonReady = Boolean(
    input.hasSiteKey
    && input.pilotStartDate
    && input.pilotStartDate <= input.comparisonStartDate,
  );

  if (firstPartyComparisonReady) {
    return {
      source: 'internal',
      useFirstPartyActions: true,
      includeInternalDailyActions: true,
      label: 'eventos internos deduplicados',
    };
  }

  if (input.hasGa4) {
    return {
      source: 'ga4',
      useFirstPartyActions: false,
      includeInternalDailyActions: false,
      label: `GA4 até o piloto interno cobrir os dois períodos${input.pilotStartDate ? ` (desde ${input.pilotStartDate})` : ''}`,
    };
  }

  return {
    source: 'internal_partial',
    useFirstPartyActions: true,
    includeInternalDailyActions: false,
    label: 'eventos internos com cobertura parcial; GA4 indisponível',
  };
}
