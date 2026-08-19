import { describe, expect, it } from 'vitest';
import {
  buildMarketingMeasurementLedger,
  isSiteTelemetryDateCovered,
  resolveSiteTelemetryAvailability,
} from '../../supabase/functions/_shared/marketing-measurement-ledger';

describe('linha de verdade dos KPIs de marketing', () => {
  it('separa exatamente os dez números solicitados sem transformar intenção em resultado', () => {
    const ledger = buildMarketingMeasurementLedger({
      startDate: '2026-08-01',
      endDate: '2026-08-19',
      googleAdsAvailable: true,
      siteTelemetryAvailability: 'available',
      siteTelemetryCoverageStartDate: '2026-07-23',
      siteTelemetryCoverageEndDate: null,
      officialAdsClicks: 40,
      adWhatsappClicks: 7,
      adCallClicks: 3,
      consentedSessions: 18,
      siteWhatsappClicks: 5,
      sitePhoneClicks: 2,
      approvedOrders: 1,
      attributedServicesRevenue: 1_250,
    });

    expect(ledger).toHaveLength(10);
    expect(ledger.map((item) => item.key)).toEqual([
      'official_ads_clicks',
      'direct_ad_actions',
      'consented_site_sessions',
      'site_whatsapp_clicks',
      'site_phone_clicks',
      'evaluations',
      'heads_received',
      'quotes_issued',
      'approved_service_orders',
      'attributed_revenue',
    ]);
    expect(ledger.find((item) => item.key === 'direct_ad_actions')).toMatchObject({
      classification: 'intention',
      values: [{ value: 10 }, { value: 7 }, { value: 3 }],
    });
    expect(ledger.find((item) => item.key === 'approved_service_orders')).toMatchObject({
      classification: 'commercial_result',
      availability: 'partial',
      values: [{ value: 1 }],
    });
    expect(ledger.find((item) => item.key === 'evaluations')?.values).toEqual([
      { key: 'started', label: 'Iniciadas', value: null, unit: 'count' },
      { key: 'completed', label: 'Concluídas', value: null, unit: 'count' },
    ]);
    expect(ledger.every((item) => (
      item.sourceOfTruth
      && item.queryOrField
      && item.period.timeZone === 'America/Sao_Paulo'
      && item.deduplication
      && item.expectedLatency
      && item.limitations
    ))).toBe(true);
  });

  it('expõe Google Ads como indisponível sem fabricar zero', () => {
    const ledger = buildMarketingMeasurementLedger({
      startDate: '2026-08-19',
      endDate: '2026-08-19',
      googleAdsAvailable: false,
      siteTelemetryAvailability: 'unavailable',
      siteTelemetryCoverageStartDate: '2026-07-23',
      siteTelemetryCoverageEndDate: null,
      officialAdsClicks: 0,
      adWhatsappClicks: 0,
      adCallClicks: 0,
      consentedSessions: 0,
      siteWhatsappClicks: 0,
      sitePhoneClicks: 0,
      approvedOrders: 0,
      attributedServicesRevenue: 0,
    });
    expect(ledger[0]).toMatchObject({ availability: 'unavailable' });
    expect(ledger[0].values[0].value).toBeNull();
    expect(ledger[1].values.every((value) => value.value === null)).toBe(true);
    for (const siteMetric of ledger.slice(2, 5)) {
      expect(siteMetric.availability).toBe('unavailable');
      expect(siteMetric.values.every((value) => value.value === null)).toBe(true);
      expect(siteMetric.limitations).toContain('ausência de eventos não equivale a zero');
    }
  });

  it('classifica antes, durante, depois e sobreposições do intervalo do piloto', () => {
    const base = {
      moduleEnabled: true,
      hasSiteKey: true,
      pilotStartDate: '2026-07-23',
      pilotEndDate: '2026-08-10',
    };
    expect(resolveSiteTelemetryAvailability({
      ...base,
      startDate: '2026-07-01',
      endDate: '2026-07-22',
    })).toBe('unavailable');
    expect(resolveSiteTelemetryAvailability({
      ...base,
      startDate: '2026-07-01',
      endDate: '2026-07-30',
    })).toBe('partial');
    expect(resolveSiteTelemetryAvailability({
      ...base,
      startDate: '2026-07-23',
      endDate: '2026-08-10',
    })).toBe('available');
    expect(resolveSiteTelemetryAvailability({
      ...base,
      startDate: '2026-08-01',
      endDate: '2026-08-19',
    })).toBe('partial');
    expect(resolveSiteTelemetryAvailability({
      ...base,
      startDate: '2026-08-11',
      endDate: '2026-08-19',
    })).toBe('unavailable');
    expect(resolveSiteTelemetryAvailability({
      ...base,
      pilotEndDate: null,
      startDate: '2026-08-11',
      endDate: '2026-08-19',
    })).toBe('available');
    expect(resolveSiteTelemetryAvailability({
      ...base,
      hasSiteKey: false,
      startDate: '2026-08-01',
      endDate: '2026-08-19',
    })).toBe('unavailable');
    expect(isSiteTelemetryDateCovered({
      date: '2026-07-22T23:59:59-03:00',
      pilotStartDate: base.pilotStartDate,
      pilotEndDate: base.pilotEndDate,
    })).toBe(false);
    expect(isSiteTelemetryDateCovered({
      date: '2026-07-23T00:00:00-03:00',
      pilotStartDate: base.pilotStartDate,
      pilotEndDate: base.pilotEndDate,
    })).toBe(true);
    expect(isSiteTelemetryDateCovered({
      date: '2026-08-11T00:00:00-03:00',
      pilotStartDate: base.pilotStartDate,
      pilotEndDate: base.pilotEndDate,
    })).toBe(false);
    expect(isSiteTelemetryDateCovered({
      date: '2026-08-11T00:00:00-03:00',
      pilotStartDate: base.pilotStartDate,
      pilotEndDate: null,
    })).toBe(true);
  });

  it('preserva o mínimo observado, mas rotula explicitamente períodos parciais', () => {
    const ledger = buildMarketingMeasurementLedger({
      startDate: '2026-07-01',
      endDate: '2026-08-19',
      googleAdsAvailable: false,
      siteTelemetryAvailability: 'partial',
      siteTelemetryCoverageStartDate: '2026-07-23',
      siteTelemetryCoverageEndDate: '2026-08-10',
      officialAdsClicks: 0,
      adWhatsappClicks: 0,
      adCallClicks: 0,
      consentedSessions: 4,
      siteWhatsappClicks: 2,
      sitePhoneClicks: 1,
      approvedOrders: 0,
      attributedServicesRevenue: 0,
    });
    for (const [metric, expected] of ledger.slice(2, 5).map((item, index) => [
      item,
      [4, 2, 1][index],
    ] as const)) {
      expect(metric.availability).toBe('partial');
      expect(metric.values[0].value).toBe(expected);
      expect(metric.limitations).toContain(
        'Cobertura parcial desde 2026-07-23 até 2026-08-10',
      );
    }
  });
});
