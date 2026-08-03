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
  durationSource: 'active' | 'event_interval';
  landingPage: string;
  lastPage: string;
  source: string;
  medium: string;
  campaign: string | null;
  clickIdType: 'gclid' | 'gbraid' | 'wbraid' | null;
  originType: MarketingAttributionBucket;
  eventCount: number;
  actionCount: number;
  pageViewCount: number;
  activityCount: number;
  pages: MarketingVisitorPage[];
  actions: MarketingVisitorAction[];
  engagementLevel: 'converted' | 'contact' | 'engaged' | 'brief' | 'unknown';
  leadCode: string | null;
  leadName: string | null;
  leadContact: string | null;
  convertedClient: boolean;
  clientId: string | null;
}

export interface MarketingVisitorPage {
  path: string;
  title: string | null;
  occurredAt: string;
}

export interface MarketingVisitorAction {
  type: string;
  occurredAt: string;
  pagePath: string;
  detail: string | null;
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

function sessionAttribution(item: JsonRecord) {
  const metadata = eventMetadata(item);
  const stored = limitedString(metadata.sessionOriginType ?? metadata.session_origin_type, 20);
  return stored === 'paid' || stored === 'organic' || stored === 'other'
    ? stored
    : classifyMarketingAttribution(item);
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

function eventMetadata(item: JsonRecord) {
  return item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata as JsonRecord
    : {};
}

function isEngagementPulse(item: JsonRecord) {
  if (String(item.event_type) !== 'custom') return false;
  const metadata = eventMetadata(item);
  return limitedString(metadata.eventLabel ?? metadata.event_label, 100) === 'session_engagement';
}

function activeEngagementSeconds(item: JsonRecord) {
  if (!isEngagementPulse(item)) return null;
  const metadata = eventMetadata(item);
  const raw = metadata.engagedSeconds ?? metadata.engaged_seconds;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
}

function isMeaningfulAction(item: JsonRecord) {
  const eventType = String(item.event_type ?? '');
  return Boolean(eventType && eventType !== 'page_view' && !isEngagementPulse(item));
}

function classifyEngagement(session: MarketingVisitorSession): MarketingVisitorSession['engagementLevel'] {
  if (session.convertedClient) return 'converted';
  if (session.actionCount > 0) return 'contact';
  if (session.activityCount > 0 || session.pageViewCount > 1) return 'engaged';
  if (session.durationSource === 'active') return session.durationSeconds >= 10 ? 'engaged' : 'brief';
  return 'unknown';
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
    const originType = options.onlyPaid ? classifyMarketingAttribution(event) : sessionAttribution(event);
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
    const engagementPulse = isEngagementPulse(event);
    const activeSeconds = activeEngagementSeconds(event);
    const isPageView = String(event.event_type) === 'page_view';
    const meaningfulAction = isMeaningfulAction(event);
    const metadata = eventMetadata(event);
    const existing = visitors.get(rawKey);

    if (!existing) {
      visitors.set(rawKey, {
        visitorId: rawKey.slice(-12),
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        durationSeconds: activeSeconds ?? 0,
        durationSource: activeSeconds === null ? 'event_interval' : 'active',
        landingPage: pagePath,
        lastPage: pagePath,
        ...labels,
        clickIdType: getMarketingClickIdType(event),
        originType,
        eventCount: engagementPulse ? 0 : 1,
        actionCount: isAction ? 1 : 0,
        pageViewCount: isPageView ? 1 : 0,
        activityCount: meaningfulAction ? 1 : 0,
        pages: isPageView ? [{
          path: pagePath,
          title: limitedString(event.page_title, 300),
          occurredAt,
        }] : [],
        actions: meaningfulAction ? [{
          type: String(event.event_type),
          occurredAt,
          pagePath,
          detail: limitedString(metadata.eventLabel ?? metadata.event_label, 180),
        }] : [],
        engagementLevel: 'unknown',
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
    const intervalSeconds = Math.max(
      0,
      Math.round((Date.parse(existing.lastSeenAt) - Date.parse(existing.firstSeenAt)) / 1000),
    );
    if (activeSeconds !== null) {
      const previousActiveSeconds = existing.durationSource === 'active' ? existing.durationSeconds : 0;
      existing.durationSource = 'active';
      existing.durationSeconds = Math.max(previousActiveSeconds, activeSeconds);
    } else if (existing.durationSource === 'event_interval') {
      existing.durationSeconds = intervalSeconds;
    }
    existing.eventCount += engagementPulse ? 0 : 1;
    existing.actionCount += isAction ? 1 : 0;
    existing.pageViewCount += isPageView ? 1 : 0;
    existing.activityCount += meaningfulAction ? 1 : 0;
    if (isPageView) {
      existing.pages.push({
        path: pagePath,
        title: limitedString(event.page_title, 300),
        occurredAt,
      });
    }
    if (meaningfulAction) {
      existing.actions.push({
        type: String(event.event_type),
        occurredAt,
        pagePath,
        detail: limitedString(metadata.eventLabel ?? metadata.event_label, 180),
      });
    }

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
    .map((visitor) => ({
      ...visitor,
      pages: visitor.pages.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)),
      actions: visitor.actions.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)),
      engagementLevel: classifyEngagement(visitor),
    }))
    .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))
    .slice(0, limit);
}
