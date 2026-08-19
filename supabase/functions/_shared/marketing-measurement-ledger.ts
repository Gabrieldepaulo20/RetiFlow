import { getMarketingDateKey } from './marketing-date.ts';

export type MarketingMetricAvailability = 'available' | 'partial' | 'unavailable';
export type MarketingMetricClassification =
  | 'click'
  | 'intention'
  | 'session'
  | 'operational'
  | 'commercial_result';

export interface MarketingMeasurementLedgerItem {
  key: string;
  label: string;
  classification: MarketingMetricClassification;
  availability: MarketingMetricAvailability;
  values: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: 'count' | 'BRL';
  }>;
  sourceOfTruth: string;
  queryOrField: string;
  period: {
    startDate: string;
    endDate: string;
    timeZone: 'America/Sao_Paulo';
  };
  deduplication: string;
  expectedLatency: string;
  limitations: string;
}

interface LedgerInput {
  startDate: string;
  endDate: string;
  googleAdsAvailable: boolean;
  siteTelemetryAvailability: MarketingMetricAvailability;
  siteTelemetryCoverageStartDate?: string | null;
  siteTelemetryCoverageEndDate?: string | null;
  officialAdsClicks: number;
  adWhatsappClicks: number;
  adCallClicks: number;
  consentedSessions: number;
  siteWhatsappClicks: number;
  sitePhoneClicks: number;
  approvedOrders: number;
  attributedServicesRevenue: number;
}

interface SiteTelemetryAvailabilityInput {
  moduleEnabled: boolean;
  hasSiteKey: boolean;
  pilotStartDate?: string | null;
  pilotEndDate?: string | null;
  startDate: string;
  endDate: string;
}

interface SiteTelemetryDateCoverageInput {
  date: string;
  pilotStartDate?: string | null;
  pilotEndDate?: string | null;
}

function marketingDateKey(value: string | null | undefined) {
  const key = value?.trim().slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(`${key}T00:00:00Z`))
    ? key
    : null;
}

export function isSiteTelemetryDateCovered(input: SiteTelemetryDateCoverageInput) {
  const rawDate = input.date.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? marketingDateKey(rawDate)
    : getMarketingDateKey(rawDate) || null;
  const pilotStartDate = marketingDateKey(input.pilotStartDate);
  const rawPilotEndDate = input.pilotEndDate?.trim() ?? '';
  const pilotEndDate = rawPilotEndDate ? marketingDateKey(rawPilotEndDate) : null;
  if (!date || !pilotStartDate || (rawPilotEndDate && !pilotEndDate)) return false;
  return date >= pilotStartDate && (!pilotEndDate || date <= pilotEndDate);
}

export function resolveSiteTelemetryAvailability(
  input: SiteTelemetryAvailabilityInput,
): MarketingMetricAvailability {
  if (!input.moduleEnabled || !input.hasSiteKey) return 'unavailable';
  const pilotStartDate = marketingDateKey(input.pilotStartDate);
  const rawPilotEndDate = input.pilotEndDate?.trim() ?? '';
  const pilotEndDate = rawPilotEndDate ? marketingDateKey(rawPilotEndDate) : null;
  const startDate = marketingDateKey(input.startDate);
  const endDate = marketingDateKey(input.endDate);
  if (
    !pilotStartDate
    || (rawPilotEndDate && !pilotEndDate)
    || !startDate
    || !endDate
    || startDate > endDate
    || (pilotEndDate && pilotEndDate < pilotStartDate)
  ) return 'unavailable';
  if (endDate < pilotStartDate || (pilotEndDate && startDate > pilotEndDate)) {
    return 'unavailable';
  }
  if (startDate < pilotStartDate || (pilotEndDate && endDate > pilotEndDate)) {
    return 'partial';
  }
  return 'available';
}

export function buildMarketingMeasurementLedger(
  input: LedgerInput,
): MarketingMeasurementLedgerItem[] {
  const period = {
    startDate: input.startDate,
    endDate: input.endDate,
    timeZone: 'America/Sao_Paulo' as const,
  };
  const count = (key: string, label: string, value: number | null) => ({
    key,
    label,
    value,
    unit: 'count' as const,
  });
  const siteTelemetryValue = (value: number) => (
    input.siteTelemetryAvailability === 'unavailable' ? null : value
  );
  const siteTelemetryLimitation = (base: string) => {
    if (input.siteTelemetryAvailability === 'unavailable') {
      return `${base} Ingestão, configuração ou cobertura não comprovada; ausência de eventos não equivale a zero.`;
    }
    if (input.siteTelemetryAvailability === 'partial') {
      const coverageStart = marketingDateKey(input.siteTelemetryCoverageStartDate);
      const coverageEnd = marketingDateKey(input.siteTelemetryCoverageEndDate);
      const coverageWindow = coverageStart
        ? ` desde ${coverageStart}${coverageEnd ? ` até ${coverageEnd}` : ''}`
        : coverageEnd ? ` até ${coverageEnd}` : '';
      return `${base} Cobertura parcial${coverageWindow}; os números são mínimos observados, não o total integral do período.`;
    }
    return base;
  };

  return [
    {
      key: 'official_ads_clicks',
      label: 'Cliques oficiais do Google Ads',
      classification: 'click',
      availability: input.googleAdsAvailable ? 'available' : 'unavailable',
      values: [count('clicks', 'Cliques', input.googleAdsAvailable ? input.officialAdsClicks : null)],
      sourceOfTruth: 'Google Ads API',
      queryOrField: 'customer/campaign.metrics.clicks no período da conta',
      period,
      deduplication: 'Regra nativa do Google Ads; não deduplicar novamente no Retiflow.',
      expectedLatency: 'Sincronização do painel em até 10 minutos; ajustes do Google podem ocorrer depois.',
      limitations: 'Soma destinos diferentes. Clique não prova visita, mensagem ou chamada atendida.',
    },
    {
      key: 'direct_ad_actions',
      label: 'Ações diretas dentro do anúncio',
      classification: 'intention',
      availability: input.googleAdsAvailable ? 'available' : 'unavailable',
      values: [
        count(
          'total',
          'Total',
          input.googleAdsAvailable ? input.adWhatsappClicks + input.adCallClicks : null,
        ),
        count('whatsapp', 'WhatsApp', input.googleAdsAvailable ? input.adWhatsappClicks : null),
        count('phone', 'Telefone', input.googleAdsAvailable ? input.adCallClicks : null),
      ],
      sourceOfTruth: 'Google Ads API',
      queryOrField: 'segments.click_type em CLICK_TO_MESSAGE_THIRD_PARTY_CLICK e CALLS',
      period,
      deduplication: 'Contagem oficial por tipo de clique; a mesma pessoa pode clicar mais de uma vez.',
      expectedLatency: 'Até 10 minutos no cache local, sujeito à latência da API do Google.',
      limitations: 'WhatsApp não prova mensagem enviada; telefone não prova chamada recebida ou atendida.',
    },
    {
      key: 'consented_site_sessions',
      label: 'Sessões consentidas no site',
      classification: 'session',
      availability: input.siteTelemetryAvailability,
      values: [count('sessions', 'Sessões', siteTelemetryValue(input.consentedSessions))],
      sourceOfTruth: 'Retiflow Marketing_Site_Eventos',
      queryOrField: 'site.journey.measurement.consentedSessions',
      period,
      deduplication: 'Uma sessão por session_id; conflitos são classificados como mixed, não consented.',
      expectedLatency: 'Quase em tempo real; painel recomenda atualização a cada 5 minutos.',
      limitations: siteTelemetryLimitation(
        'Sessão consentida é navegação mensurada, não contato, lead ou cliente.',
      ),
    },
    {
      key: 'site_whatsapp_clicks',
      label: 'Cliques em WhatsApp no site',
      classification: 'intention',
      availability: input.siteTelemetryAvailability,
      values: [count(
        'clicks',
        'Cliques únicos consolidados',
        siteTelemetryValue(input.siteWhatsappClicks),
      )],
      sourceOfTruth: 'Retiflow Marketing_Site_Eventos',
      queryOrField: "event_type = 'whatsapp_click'",
      period,
      deduplication: 'eventId idempotente e janela configurável, normalmente 30 minutos, por sessão/visitante.',
      expectedLatency: 'Quase em tempo real; painel recomenda atualização a cada 5 minutos.',
      limitations: siteTelemetryLimitation(
        'Abertura do WhatsApp não prova envio, leitura ou resposta da conversa.',
      ),
    },
    {
      key: 'site_phone_clicks',
      label: 'Cliques em telefone no site',
      classification: 'intention',
      availability: input.siteTelemetryAvailability,
      values: [count('clicks', 'Cliques', siteTelemetryValue(input.sitePhoneClicks))],
      sourceOfTruth: 'Retiflow Marketing_Site_Eventos',
      queryOrField: "event_type = 'phone_click'",
      period,
      deduplication: 'eventId idempotente; não existe consolidação temporal adicional para telefone.',
      expectedLatency: 'Quase em tempo real; painel recomenda atualização a cada 5 minutos.',
      limitations: siteTelemetryLimitation(
        'Clique no link tel: não prova início, recebimento, duração ou atendimento da chamada.',
      ),
    },
    {
      key: 'evaluations',
      label: 'Avaliações combinadas',
      classification: 'operational',
      availability: 'unavailable',
      values: [
        count('started', 'Iniciadas', null),
        count('completed', 'Concluídas', null),
      ],
      sourceOfTruth: 'Indisponível no schema atual',
      queryOrField: 'Exige eventos imutáveis de início e conclusão da avaliação da O.S.',
      period,
      deduplication: 'Futura chave única por tenant + O.S. + marco.',
      expectedLatency: 'A definir após instrumentação operacional.',
      limitations: 'Status atual da O.S. não reconstrói com segurança quando cada transição ocorreu.',
    },
    {
      key: 'heads_received',
      label: 'Cabeçotes recebidos para avaliação',
      classification: 'operational',
      availability: 'unavailable',
      values: [count('received', 'Recebidos', null)],
      sourceOfTruth: 'Indisponível no schema de marketing atual',
      queryOrField: 'Exige outbox do marco cabecote_recebido_avaliacao ligado à O.S.',
      period,
      deduplication: 'Futura chave única por tenant + O.S. + marco.',
      expectedLatency: 'A definir após instrumentação operacional.',
      limitations: 'Criação ou status atual de O.S. não comprova sozinho o recebimento no período.',
    },
    {
      key: 'quotes_issued',
      label: 'Orçamentos emitidos',
      classification: 'operational',
      availability: 'unavailable',
      values: [count('issued', 'Emitidos', null)],
      sourceOfTruth: 'Indisponível no schema de marketing atual',
      queryOrField: 'Exige outbox do marco orcamento_emitido ligado à O.S.',
      period,
      deduplication: 'Futura chave única por tenant + O.S. + versão/marco definido.',
      expectedLatency: 'A definir após instrumentação operacional.',
      limitations: 'Status atual não informa com segurança emissão, reemissão ou horário histórico.',
    },
    {
      key: 'approved_service_orders',
      label: 'O.S. aprovadas',
      classification: 'commercial_result',
      availability: 'partial',
      values: [count('orders', 'O.S.', input.approvedOrders)],
      sourceOfTruth: 'Retiflow Marketing_Commission_Snapshots',
      queryOrField: 'COUNT por approved_at; um snapshot por fk_notas_servico',
      period,
      deduplication: 'Constraint/snapshot único por O.S. aprovada.',
      expectedLatency: 'Após criação do snapshot de aprovação; painel em até 5 minutos.',
      limitations: 'Mede apenas O.S. com snapshot; aprovação não significa execução, faturamento ou pagamento.',
    },
    {
      key: 'attributed_revenue',
      label: 'Receita atribuída',
      classification: 'commercial_result',
      availability: 'partial',
      values: [{
        key: 'services',
        label: 'Serviços aprovados',
        value: input.attributedServicesRevenue,
        unit: 'BRL',
      }],
      sourceOfTruth: 'Retiflow Marketing_Commission_Snapshots',
      queryOrField: 'SUM(services_snapshot) por approved_at; produtos excluídos',
      period,
      deduplication: 'Mesmo snapshot único por O.S.; valor congelado na aprovação.',
      expectedLatency: 'Após criação do snapshot de aprovação; painel em até 5 minutos.',
      limitations: 'É valor de serviços aprovados atribuído, não receita contábil, faturada ou recebida em caixa.',
    },
  ];
}
