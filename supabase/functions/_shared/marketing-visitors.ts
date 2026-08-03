import {
  classifyMarketingAttribution,
  getMarketingClickIdType,
  isTechnicalMarketingTest,
  type MarketingAttributionBucket,
} from './marketing-attribution.ts';

type JsonRecord = Record<string, unknown>;

export interface MarketingVisitorSession {
  visitorId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  durationSeconds: number;
  landingPage: string;
  lastPage: string;
  source: string;
  medium: string;
  campaign: string | null;
  clickIdType: 'gclid' | 'gbraid' | 'wbraid' | null;
  originType: MarketingAttributionBucket;
  eventCount: number;
  actionCount: number;
  leadCode: string | null;
  leadName: string | null;
  leadContact: string | null;
  convertedClient: boolean;
  clientId: string | null;
}

function limitedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function getMarketingVisitorKey(item: JsonRecord) {
  return limitedString(item.session_id, 160)
    || limitedString(item.anonymous_id, 160)
    || limitedString(item.lead_code, 40)
    || String(item.id_marketing_site_eventos ?? '');
}

function attributionPriority(value: MarketingAttributionBucket) {
  if (value === 'paid') return 2;
  if (value === 'organic') return 1;
  return 0;
}

function attributionLabels(item: JsonRecord, originType: MarketingAttributionBucket) {
  const rawSource = limitedString(item.source, 180);
  const rawMedium = limitedString(item.medium, 120);
  const normalizedSource = rawSource?.toLowerCase();
  const source = originType === 'organic' && (!rawSource || ['direto', 'direct', '(direct)'].includes(normalizedSource ?? ''))
    ? 'busca orgânica'
    : rawSource ?? (originType === 'paid' ? 'google' : 'direto');

  return {
    source,
    medium: rawMedium ?? (originType === 'paid' ? 'cpc' : originType === 'organic' ? 'organic' : 'sem meio'),
    campaign: limitedString(item.campaign, 180),
  };
}

export function buildMarketingVisitorSessions(
  events: JsonRecord[],
  leads: JsonRecord[],
  options: { onlyPaid?: boolean; limit?: number } = {},
) {
  const leadByCode = new Map<string, JsonRecord>();
  leads.forEach((lead) => {
    const leadCode = limitedString(lead.lead_code, 40);
    if (leadCode && !leadByCode.has(leadCode)) leadByCode.set(leadCode, lead);
  });

  const visitors = new Map<string, MarketingVisitorSession>();
  const limit = Math.max(1, Math.trunc(options.limit ?? 200));

  events.forEach((event) => {
    if (isTechnicalMarketingTest(event)) return;
    const originType = classifyMarketingAttribution(event);
    if (options.onlyPaid && originType !== 'paid') return;

    const rawKey = getMarketingVisitorKey(event);
    const occurredAt = limitedString(event.occurred_at, 80);
    if (!rawKey || !occurredAt || !Number.isFinite(Date.parse(occurredAt))) return;

    const leadCode = limitedString(event.lead_code, 40);
    const lead = leadCode ? leadByCode.get(leadCode) : undefined;
    const pagePath = limitedString(event.page_path, 800) ?? '/';
    const occurredAtEpoch = Date.parse(occurredAt);
    const labels = attributionLabels(event, originType);
    const isAction = ['whatsapp_click', 'phone_click', 'form_submit'].includes(String(event.event_type));
    const existing = visitors.get(rawKey);

    if (!existing) {
      visitors.set(rawKey, {
        visitorId: rawKey.slice(-12),
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        durationSeconds: 0,
        landingPage: pagePath,
        lastPage: pagePath,
        ...labels,
        clickIdType: getMarketingClickIdType(event),
        originType,
        eventCount: 1,
        actionCount: isAction ? 1 : 0,
        leadCode,
        leadName: lead ? limitedString(lead.nome, 160) : null,
        leadContact: lead
          ? limitedString(lead.telefone, 120) ?? limitedString(lead.email, 180)
          : null,
        convertedClient: Boolean(lead?.fk_clientes),
        clientId: lead?.fk_clientes ? String(lead.fk_clientes) : null,
      });
      return;
    }

    if (occurredAtEpoch < Date.parse(existing.firstSeenAt)) {
      existing.firstSeenAt = occurredAt;
      existing.landingPage = pagePath;
    }
    if (occurredAtEpoch > Date.parse(existing.lastSeenAt)) {
      existing.lastSeenAt = occurredAt;
      existing.lastPage = pagePath;
    }
    existing.durationSeconds = Math.max(
      0,
      Math.round((Date.parse(existing.lastSeenAt) - Date.parse(existing.firstSeenAt)) / 1000),
    );
    existing.eventCount += 1;
    existing.actionCount += isAction ? 1 : 0;

    if (attributionPriority(originType) > attributionPriority(existing.originType)) {
      existing.originType = originType;
      existing.source = labels.source;
      existing.medium = labels.medium;
      existing.campaign = labels.campaign;
      existing.clickIdType = getMarketingClickIdType(event);
    } else {
      existing.clickIdType = existing.clickIdType ?? getMarketingClickIdType(event);
    }

    existing.leadCode = existing.leadCode ?? leadCode;
    if (lead) {
      existing.leadName = limitedString(lead.nome, 160) ?? existing.leadName;
      existing.leadContact = limitedString(lead.telefone, 120)
        ?? limitedString(lead.email, 180)
        ?? existing.leadContact;
      existing.convertedClient = existing.convertedClient || Boolean(lead.fk_clientes);
      existing.clientId = lead.fk_clientes ? String(lead.fk_clientes) : existing.clientId;
    }
  });

  return Array.from(visitors.values())
    .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))
    .slice(0, limit);
}
