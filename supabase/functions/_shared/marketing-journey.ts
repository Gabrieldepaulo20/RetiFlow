import {
  classifyMarketingAttribution,
  isTechnicalMarketingTest,
  type MarketingAttributionBucket,
} from './marketing-attribution.ts';
import { getMarketingVisitorKey } from './marketing-visitors.ts';

type JsonRecord = Record<string, unknown>;

export type MarketingJourneyDestination =
  | 'whatsapp'
  | 'phone'
  | 'estimate'
  | 'service'
  | 'contact'
  | 'directions'
  | 'video'
  | 'other';

export type MarketingJourneyCategory =
  | 'page'
  | 'retention'
  | 'cta'
  | 'quiz'
  | 'contact'
  | 'form'
  | 'other';

export interface MarketingJourneySummary {
  measurement: {
    trackedSessions: number;
    pageViewSessions: number;
    activeTimeMeasuredSessions: number;
    consentedSessions: number;
    anonymousSessions: number;
    mixedSessions: number;
    unknownSessions: number;
  };
  retention: {
    eligibleSessions: number;
    active5sSessions: number;
    active10sSessions: number;
    active5sRate: number;
    active10sRate: number;
    no5sSignalSessions: number;
    no10sSignalSessions: number;
    scope: 'tracked_sessions_only';
  };
  contactChannels: Array<{
    channel: 'whatsapp' | 'phone' | 'form';
    sessions: number;
    events: number;
  }>;
  locations: {
    scope: 'analytics_consented_sessions_only';
    minimumSessions: 3;
    groupsTruncated: boolean;
    groups: Array<{
      city: string;
      region: string | null;
      sessions: number;
    }>;
  };
  clicks: {
    totalEvents: number;
    uniqueSessions: number;
    groupsTruncated: boolean;
    groups: Array<{
      eventName: string;
      pagePath: string;
      componentId: string;
      position: string;
      destinationType: MarketingJourneyDestination;
      destinationPath: string | null;
      experimentId: string | null;
      variantId: string | null;
      events: number;
      sessions: number;
      paidSessions: number;
      organicSessions: number;
      otherSessions: number;
      lastOccurredAt: string;
    }>;
  };
  quizStepsTruncated: boolean;
  quizSteps: Array<{
    experimentId: string | null;
    variantId: string | null;
    flowType: string | null;
    stepId: string;
    views: number;
    completes: number;
    advancedSessions: number;
    possibleDropOffSessions: number;
    advanceRate: number;
    backEvents: number;
    unknownSelections: number;
  }>;
  variantsTruncated: boolean;
  variants: Array<{
    experimentId: string;
    variantId: string;
    sessions: number;
    active5sSessions: number;
    active10sSessions: number;
    ctaClickSessions: number;
    quizStartSessions: number;
    quizResultSessions: number;
    contactSessions: number;
    active5sRate: number;
    active10sRate: number;
    contactRate: number;
  }>;
  pagesTruncated: boolean;
  pages: Array<{
    pagePath: string;
    sessions: number;
    views: number;
    active5sSessions: number;
    active10sSessions: number;
    ctaClickSessions: number;
    quizStartSessions: number;
    contactSessions: number;
    active5sRate: number;
    active10sRate: number;
    contactRate: number;
  }>;
}

export interface MarketingRecentActivityItem {
  activityId: string;
  visitorToken: string;
  occurredAt: string;
  eventName: string;
  category: MarketingJourneyCategory;
  pagePath: string;
  originType: MarketingAttributionBucket;
  source: string;
  medium: string;
  campaign: string | null;
  deviceType: string | null;
  componentId: string | null;
  position: string | null;
  flowType: string | null;
  stepId: string | null;
  optionId: string | null;
  fieldId: string | null;
  interactionAction: string | null;
  validationReason: string | null;
  experimentId: string | null;
  variantId: string | null;
  estimateState: string | null;
  destinationType: MarketingJourneyDestination;
  destinationPath: string | null;
  contactState: 'anonymous' | 'intent' | 'identified';
}

export interface MarketingRecentActivityCursor {
  occurredAt: string;
  eventId: string;
}

const KNOWN_EVENT_NAMES = new Set([
  'page_view',
  'engagement_5s',
  'engagement_10s',
  'session_engagement',
  'cta_impression',
  'cta_click',
  'quiz_start',
  'quiz_flow_selected',
  'quiz_option_selected',
  'quiz_field_interaction',
  'quiz_step_view',
  'quiz_step_complete',
  'quiz_continue_blocked',
  'quiz_unknown_selected',
  'quiz_back',
  'quiz_reset',
  'quiz_file_intent',
  'quiz_result_view',
  'quiz_estimate_state',
  'quiz_whatsapp_prepared',
  'quiz_whatsapp_click',
  'whatsapp_click',
  'instagram_click',
  'phone_click',
  'directions_click',
  'service_detail_click',
  'form_view',
  'form_start',
  'form_field_complete',
  'form_abandon',
  'form_submit_attempt',
  'form_validation_error',
  'form_submit_error',
  'form_submit',
  'lead_created',
  'generate_lead',
  'scroll_depth',
]);

const QUIZ_STEP_ORDERS: Record<string, readonly string[]> = {
  vehicle_known: [
    'requester',
    'vehicle',
    'situation',
    'symptoms',
    'known_information',
    'contact',
    'result',
  ],
  problem_unknown: [
    'symptoms',
    'situation',
    'known_information',
    'requester',
    'vehicle',
    'contact',
    'result',
  ],
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function eventMetadata(item: JsonRecord) {
  return item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata as JsonRecord
    : {};
}

function limitedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const normalized = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function containsPotentialPii(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A versão não decodificada ainda passa pelas verificações abaixo.
  }
  const digits = decoded.replace(/\D/g, '');
  return decoded.includes('@')
    || /%40/i.test(value)
    || /\d{8,}/.test(decoded)
    || digits.length >= 10;
}

function safeDimension(value: unknown, maxLength = 100) {
  const normalized = limitedString(value, maxLength);
  return normalized
    && !containsPotentialPii(normalized)
    && /^[A-Za-z0-9_-]+$/.test(normalized)
    ? normalized
    : null;
}

export function sanitizeMarketingAttributionDimension(value: unknown, maxLength: number) {
  const normalized = limitedString(value, maxLength)?.replace(/\s+/g, ' ');
  if (!normalized || containsPotentialPii(normalized)) return null;
  return /^[\p{L}\p{N} ._/-]+$/u.test(normalized) ? normalized : null;
}

export function sanitizeMarketingPath(value: unknown) {
  const raw = limitedString(value, 800);
  if (!raw) return '/';
  try {
    const parsed = new URL(raw, 'https://www.premiumretifica.com.br');
    const pathname = parsed.pathname.replace(/\/{2,}/g, '/').slice(0, 300);
    const safePathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return containsPotentialPii(safePathname) ? '/redacted' : safePathname;
  } catch {
    const pathname = raw.split(/[?#]/, 1)[0].replace(/\/{2,}/g, '/').slice(0, 300);
    const safePathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return containsPotentialPii(safePathname) ? '/redacted' : safePathname;
  }
}

function optionalDestinationPath(value: unknown) {
  return limitedString(value, 800) ? sanitizeMarketingPath(value) : null;
}

function roundRate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let total = 0;
  left.forEach((value) => {
    if (right.has(value)) total += 1;
  });
  return total;
}

function normalizedEventName(item: JsonRecord, metadata: JsonRecord) {
  const eventType = limitedString(item.event_type, 80) ?? 'other';
  if (eventType === 'custom') {
    const customName = safeDimension(metadata.eventLabel ?? metadata.event_label, 100);
    return customName && KNOWN_EVENT_NAMES.has(customName) ? customName : 'custom';
  }
  return KNOWN_EVENT_NAMES.has(eventType) ? eventType : 'other';
}

function sessionOrigin(item: JsonRecord, metadata: JsonRecord): MarketingAttributionBucket {
  const stored = safeDimension(metadata.sessionOriginType ?? metadata.session_origin_type, 20);
  return stored === 'paid' || stored === 'organic' || stored === 'other'
    ? stored
    : classifyMarketingAttribution(item);
}

function eventMeasurementMode(metadata: JsonRecord): 'anonymous' | 'consented' | 'unknown' {
  const measurement = safeDimension(metadata.measurementMode ?? metadata.measurement_mode, 40);
  if (measurement === 'anonymous') return 'anonymous';
  // 'essencial' e sessao medida de fato: o evento existe e foi registrado por
  // legitimo interesse. Deixar de fora faria a jornada ignorar justamente o
  // trafego que a correcao de 19/08 recuperou.
  if (
    measurement === 'consented'
    || measurement === 'analytics'
    || measurement === 'advertising'
    || measurement === 'analytics_and_advertising'
    || measurement === 'essencial'
  ) {
    return 'consented';
  }
  return 'unknown';
}

function getDestination(
  eventName: string,
  pagePath: string,
  metadata: JsonRecord,
  componentId: string | null,
  serviceId: string | null,
) {
  const explicitType = safeDimension(metadata.destinationType ?? metadata.destination_type, 30);
  const validTypes = new Set<MarketingJourneyDestination>([
    'whatsapp', 'phone', 'estimate', 'service', 'contact', 'directions', 'video', 'other',
  ]);
  let destinationType = validTypes.has(explicitType as MarketingJourneyDestination)
    ? explicitType as MarketingJourneyDestination
    : null;

  if (!destinationType) {
    if (eventName === 'whatsapp_click' || eventName === 'quiz_whatsapp_click') destinationType = 'whatsapp';
    else if (eventName === 'phone_click') destinationType = 'phone';
    else if (eventName === 'directions_click') destinationType = 'directions';
    else if (serviceId || eventName === 'service_detail_click') destinationType = 'service';
    else if (componentId?.includes('estimate') || componentId?.includes('guided') || pagePath === '/quanto-custa') destinationType = 'estimate';
    else if (componentId?.includes('contact')) destinationType = 'contact';
    else if (componentId?.includes('video')) destinationType = 'video';
    else destinationType = 'other';
  }

  const explicitPath = optionalDestinationPath(metadata.destinationPath ?? metadata.destination_path);
  const destinationPath = explicitPath
    ?? (destinationType === 'estimate' ? '/quanto-custa' : null)
    ?? (destinationType === 'service' && serviceId ? `/servicos/${serviceId}` : null)
    ?? (destinationType === 'contact' ? '/contato' : null);

  return { destinationType, destinationPath };
}

function eventCategory(eventName: string): MarketingJourneyCategory {
  if (eventName === 'page_view') return 'page';
  if (eventName.startsWith('engagement_') || eventName === 'session_engagement') return 'retention';
  if (eventName.startsWith('quiz_')) return 'quiz';
  if (['whatsapp_click', 'phone_click', 'directions_click'].includes(eventName)) return 'contact';
  if (eventName.startsWith('form_')) return 'form';
  if (eventName.startsWith('cta_') || ['service_detail_click', 'instagram_click'].includes(eventName)) return 'cta';
  return 'other';
}

function isContactEvent(eventName: string) {
  return ['whatsapp_click', 'phone_click', 'form_submit', 'quiz_whatsapp_click'].includes(eventName);
}

interface NormalizedJourneyEvent {
  raw: JsonRecord;
  sessionKey: string;
  occurredAt: string;
  eventName: string;
  category: MarketingJourneyCategory;
  pagePath: string;
  originType: MarketingAttributionBucket;
  measurementMode: 'anonymous' | 'consented' | 'unknown';
  analyticsConsent: boolean;
  city: string | null;
  region: string | null;
  componentId: string | null;
  position: string | null;
  serviceId: string | null;
  flowType: string | null;
  stepId: string | null;
  optionId: string | null;
  fieldId: string | null;
  interactionAction: string | null;
  validationReason: string | null;
  experimentId: string | null;
  variantId: string | null;
  estimateState: string | null;
  destinationType: MarketingJourneyDestination;
  destinationPath: string | null;
}

const BRAZIL_STATE_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const BRAZIL_STATE_NAMES = new Map([
  ['acre', 'AC'],
  ['alagoas', 'AL'],
  ['amapa', 'AP'],
  ['amazonas', 'AM'],
  ['bahia', 'BA'],
  ['ceara', 'CE'],
  ['distrito federal', 'DF'],
  ['espirito santo', 'ES'],
  ['goias', 'GO'],
  ['maranhao', 'MA'],
  ['mato grosso', 'MT'],
  ['mato grosso do sul', 'MS'],
  ['minas gerais', 'MG'],
  ['para', 'PA'],
  ['paraiba', 'PB'],
  ['parana', 'PR'],
  ['pernambuco', 'PE'],
  ['piaui', 'PI'],
  ['rio de janeiro', 'RJ'],
  ['rio grande do norte', 'RN'],
  ['rio grande do sul', 'RS'],
  ['rondonia', 'RO'],
  ['roraima', 'RR'],
  ['santa catarina', 'SC'],
  ['sao paulo', 'SP'],
  ['sergipe', 'SE'],
  ['tocantins', 'TO'],
]);

const LOCATION_CONNECTORS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function normalizedLocationKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function titleCaseLocation(value: string) {
  const parts = value.toLocaleLowerCase('pt-BR').split(/([\s-]+)/u);
  let wordIndex = 0;
  return parts.map((part) => {
    if (!part || /^[\s-]+$/u.test(part)) return part;
    const isConnector = wordIndex > 0 && LOCATION_CONNECTORS.has(part);
    wordIndex += 1;
    if (isConnector) return part;
    const [first, ...rest] = [...part];
    return `${first.toLocaleUpperCase('pt-BR')}${rest.join('')}`;
  }).join('');
}

function normalizeMarketingCity(value: unknown) {
  const normalized = limitedString(value, 60)?.normalize('NFKC').replace(/\s+/g, ' ');
  if (!normalized || normalized.length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(normalized)) return null;
  return {
    key: normalizedLocationKey(normalized),
    label: titleCaseLocation(normalized),
  };
}

function normalizeMarketingRegion(value: unknown) {
  const normalized = limitedString(value, 40)?.normalize('NFKC').replace(/\s+/g, ' ');
  if (!normalized || !/^[\p{L}\p{M} -]+$/u.test(normalized)) return null;
  const compact = normalized.toLocaleUpperCase('pt-BR').replace(/^BR[-\s]/u, '');
  if (BRAZIL_STATE_UFS.has(compact)) return compact;
  return BRAZIL_STATE_NAMES.get(normalizedLocationKey(normalized)) ?? null;
}

/*
  Usada apenas para liberar a agregacao de CIDADE na jornada (ver o filtro
  `!event.analyticsConsent || !event.city`). O modo 'essencial' entra porque
  cidade passou a fazer parte da contagem por legitimo interesse, decidida pelo
  controlador em 19/08/2026 — e a agregacao ja oculta grupos com menos de 3
  sessoes, que e a salvaguarda que torna isso defensavel.
*/
function hasAnalyticsConsent(metadata: JsonRecord) {
  const measurement = safeDimension(metadata.measurementMode ?? metadata.measurement_mode, 40);
  return measurement === 'analytics'
    || measurement === 'analytics_and_advertising'
    || measurement === 'consented'
    || measurement === 'essencial';
}

export function normalizeMarketingJourneyEvent(item: JsonRecord): NormalizedJourneyEvent | null {
  if (isTechnicalMarketingTest(item)) return null;
  const occurredAt = limitedString(item.occurred_at, 80);
  const sessionKey = getMarketingVisitorKey(item);
  if (!occurredAt || !sessionKey || !Number.isFinite(Date.parse(occurredAt))) return null;

  const metadata = eventMetadata(item);
  const eventName = normalizedEventName(item, metadata);
  const pagePath = sanitizeMarketingPath(item.page_path);
  const componentId = safeDimension(metadata.componentId ?? metadata.component_id, 100);
  const serviceId = safeDimension(metadata.serviceId ?? metadata.service_id, 100);
  const destination = getDestination(eventName, pagePath, metadata, componentId, serviceId);

  return {
    raw: item,
    sessionKey,
    occurredAt,
    eventName,
    category: eventCategory(eventName),
    pagePath,
    originType: sessionOrigin(item, metadata),
    measurementMode: eventMeasurementMode(metadata),
    analyticsConsent: hasAnalyticsConsent(metadata),
    city: normalizeMarketingCity(item.city)?.label ?? null,
    region: normalizeMarketingRegion(item.region),
    componentId,
    position: safeDimension(metadata.position, 100),
    serviceId,
    flowType: safeDimension(metadata.flowType ?? metadata.flow_type, 100),
    stepId: safeDimension(metadata.stepId ?? metadata.step_id, 100),
    optionId: safeDimension(metadata.optionId ?? metadata.option_id, 100),
    fieldId: safeDimension(metadata.fieldId ?? metadata.field_id, 100),
    interactionAction: safeDimension(
      metadata.interactionAction ?? metadata.interaction_action,
      40,
    ),
    validationReason: safeDimension(
      metadata.validationReason ?? metadata.validation_reason,
      100,
    ),
    experimentId: safeDimension(metadata.experimentId ?? metadata.experiment_id, 100),
    variantId: safeDimension(metadata.variantId ?? metadata.variant_id, 100),
    estimateState: safeDimension(metadata.estimateState ?? metadata.estimate_state, 100),
    ...destination,
  };
}

type ContactChannel = 'whatsapp' | 'phone' | 'form';

function contactChannel(eventName: string): ContactChannel | null {
  if (eventName === 'whatsapp_click' || eventName === 'quiz_whatsapp_click') return 'whatsapp';
  if (eventName === 'phone_click') return 'phone';
  if (eventName === 'form_submit') return 'form';
  return null;
}

function stepOrder(flowType: string | null, stepId: string) {
  const explicitOrder = flowType ? QUIZ_STEP_ORDERS[flowType] : undefined;
  const explicitIndex = explicitOrder?.indexOf(stepId) ?? -1;
  if (explicitIndex >= 0) return explicitIndex;
  const parsed = Number(stepId.match(/\d+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function buildMarketingJourneySummary(rawEvents: JsonRecord[]): MarketingJourneySummary {
  const events = rawEvents
    .map(normalizeMarketingJourneyEvent)
    .filter((event): event is NormalizedJourneyEvent => Boolean(event));
  const trackedSessions = new Set(events.map((event) => event.sessionKey));
  const pageViewSessions = new Set(events.filter((event) => event.eventName === 'page_view').map((event) => event.sessionKey));
  const active5sSessions = new Set(events.filter((event) => event.eventName === 'engagement_5s').map((event) => event.sessionKey));
  const active10sSessions = new Set(events.filter((event) => event.eventName === 'engagement_10s').map((event) => event.sessionKey));
  const activeTimeMeasuredSessions = new Set(events
    .filter((event) => ['engagement_5s', 'engagement_10s', 'session_engagement'].includes(event.eventName))
    .map((event) => event.sessionKey));
  const sessionModes = new Map<string, Set<'anonymous' | 'consented'>>();
  events.forEach((event) => {
    if (event.measurementMode === 'unknown') return;
    const modes = sessionModes.get(event.sessionKey) ?? new Set<'anonymous' | 'consented'>();
    modes.add(event.measurementMode);
    sessionModes.set(event.sessionKey, modes);
  });
  let consentedSessions = 0;
  let anonymousSessions = 0;
  let mixedSessions = 0;
  let unknownSessions = 0;
  trackedSessions.forEach((sessionKey) => {
    const modes = sessionModes.get(sessionKey);
    if (!modes?.size) unknownSessions += 1;
    else if (modes.size > 1) mixedSessions += 1;
    else if (modes.has('consented')) consentedSessions += 1;
    else anonymousSessions += 1;
  });

  const contactStats = new Map<ContactChannel, Map<string, { canonical: number; fallback: number }>>();
  (['whatsapp', 'phone', 'form'] as ContactChannel[]).forEach((channel) => contactStats.set(channel, new Map()));
  events.forEach((event) => {
    const channel = contactChannel(event.eventName);
    if (!channel) return;
    const sessions = contactStats.get(channel)!;
    const stats = sessions.get(event.sessionKey) ?? { canonical: 0, fallback: 0 };
    if (event.eventName === 'quiz_whatsapp_click') stats.fallback += 1;
    else stats.canonical += 1;
    sessions.set(event.sessionKey, stats);
  });
  const contactChannels = (['whatsapp', 'phone', 'form'] as ContactChannel[]).map((channel) => {
    const sessions = contactStats.get(channel)!;
    let eventCount = 0;
    sessions.forEach((stats) => {
      eventCount += stats.canonical || Math.min(1, stats.fallback);
    });
    return { channel, sessions: sessions.size, events: eventCount };
  });
  const contactSessions = new Set<string>();
  contactStats.forEach((sessions) => sessions.forEach((_stats, sessionKey) => contactSessions.add(sessionKey)));

  type SessionLocation = {
    city: string;
    cityKey: string;
    region: string | null;
    conflicted: boolean;
  };
  const sessionLocations = new Map<string, SessionLocation>();
  events.forEach((event) => {
    if (!event.analyticsConsent || !event.city) return;
    const cityKey = normalizedLocationKey(event.city);
    const current = sessionLocations.get(event.sessionKey);
    if (!current) {
      sessionLocations.set(event.sessionKey, {
        city: event.city,
        cityKey,
        region: event.region,
        conflicted: false,
      });
      return;
    }
    if (current.cityKey !== cityKey) {
      current.conflicted = true;
      return;
    }
    if (current.region && event.region && current.region !== event.region) {
      current.conflicted = true;
      return;
    }
    if (!current.region && event.region) current.region = event.region;
  });
  const locationGroups = new Map<string, {
    city: string;
    region: string | null;
    sessions: Set<string>;
  }>();
  sessionLocations.forEach((location, sessionKey) => {
    if (location.conflicted) return;
    const key = JSON.stringify([location.cityKey, location.region]);
    const group = locationGroups.get(key) ?? {
      city: location.city,
      region: location.region,
      sessions: new Set<string>(),
    };
    group.sessions.add(sessionKey);
    locationGroups.set(key, group);
  });
  const minimumLocationSessions = 3 as const;
  const allVisibleLocationGroups = [...locationGroups.values()]
    .map((group) => ({
      city: group.city,
      region: group.region,
      sessions: group.sessions.size,
    }))
    .filter((group) => group.sessions >= minimumLocationSessions)
    .sort((left, right) => (
      right.sessions - left.sessions
      || (left.region ?? '').localeCompare(right.region ?? '', 'pt-BR')
      || left.city.localeCompare(right.city, 'pt-BR')
    ));

  type CanonicalClickName = 'whatsapp_click' | 'phone_click' | 'directions_click';
  const canonicalClickNames = new Set<CanonicalClickName>([
    'whatsapp_click',
    'phone_click',
    'directions_click',
  ]);
  const canonicalClickKey = (
    sessionKey: string,
    pagePath: string,
    eventName: CanonicalClickName,
  ) => JSON.stringify([sessionKey, pagePath, eventName]);
  const canonicalClickTimes = new Map<string, number[]>();
  events.forEach((event) => {
    if (!canonicalClickNames.has(event.eventName as CanonicalClickName)) return;
    const key = canonicalClickKey(event.sessionKey, event.pagePath, event.eventName as CanonicalClickName);
    const times = canonicalClickTimes.get(key) ?? [];
    times.push(Date.parse(event.occurredAt));
    canonicalClickTimes.set(key, times);
  });
  canonicalClickTimes.forEach((times) => times.sort((left, right) => left - right));

  const hasNearbyCanonicalClick = (
    event: NormalizedJourneyEvent,
    canonicalEventName: CanonicalClickName,
  ) => {
    const times = canonicalClickTimes.get(canonicalClickKey(
      event.sessionKey,
      event.pagePath,
      canonicalEventName,
    ));
    if (!times?.length) return false;
    const minimum = Date.parse(event.occurredAt) - 2_000;
    const maximum = minimum + 4_000;
    let low = 0;
    let high = times.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (times[middle] < minimum) low = middle + 1;
      else high = middle;
    }
    return low < times.length && times[low] <= maximum;
  };
  const clickEvents = events.filter((event) => {
    if (event.eventName === 'quiz_whatsapp_click') {
      return !hasNearbyCanonicalClick(event, 'whatsapp_click');
    }
    if (event.eventName === 'cta_click') {
      if (event.destinationType === 'whatsapp') return !hasNearbyCanonicalClick(event, 'whatsapp_click');
      if (event.destinationType === 'phone') return !hasNearbyCanonicalClick(event, 'phone_click');
      if (event.destinationType === 'directions') return !hasNearbyCanonicalClick(event, 'directions_click');
      return true;
    }
    return ['cta_click', 'whatsapp_click', 'instagram_click', 'phone_click', 'directions_click', 'service_detail_click'].includes(event.eventName);
  });
  const clickSessions = new Set(clickEvents.map((event) => event.sessionKey));
  const clickGroups = new Map<string, {
    base: MarketingJourneySummary['clicks']['groups'][number];
    sessions: Set<string>;
    paid: Set<string>;
    organic: Set<string>;
    other: Set<string>;
  }>();
  clickEvents.forEach((event) => {
    const componentId = event.componentId ?? 'not_informed';
    const position = event.position ?? 'not_informed';
    const key = JSON.stringify([
      event.eventName,
      event.pagePath,
      componentId,
      position,
      event.destinationType,
      event.destinationPath,
      event.experimentId,
      event.variantId,
    ]);
    const existing = clickGroups.get(key) ?? {
      base: {
        eventName: event.eventName,
        pagePath: event.pagePath,
        componentId,
        position,
        destinationType: event.destinationType,
        destinationPath: event.destinationPath,
        experimentId: event.experimentId,
        variantId: event.variantId,
        events: 0,
        sessions: 0,
        paidSessions: 0,
        organicSessions: 0,
        otherSessions: 0,
        lastOccurredAt: event.occurredAt,
      },
      sessions: new Set<string>(),
      paid: new Set<string>(),
      organic: new Set<string>(),
      other: new Set<string>(),
    };
    existing.base.events += 1;
    existing.sessions.add(event.sessionKey);
    existing[event.originType].add(event.sessionKey);
    if (event.occurredAt > existing.base.lastOccurredAt) existing.base.lastOccurredAt = event.occurredAt;
    clickGroups.set(key, existing);
  });
  const allClickGroups = [...clickGroups.values()]
    .map((group) => ({
      ...group.base,
      sessions: group.sessions.size,
      paidSessions: group.paid.size,
      organicSessions: group.organic.size,
      otherSessions: group.other.size,
    }))
    .sort((left, right) => right.sessions - left.sessions || right.events - left.events || right.lastOccurredAt.localeCompare(left.lastOccurredAt));

  type QuizGroup = {
    experimentId: string | null;
    variantId: string | null;
    flowType: string | null;
    stepId: string;
    views: Set<string>;
    completes: Set<string>;
    backEvents: number;
    unknownSelections: number;
  };
  const quizGroups = new Map<string, QuizGroup>();
  const quizResults = new Map<string, Set<string>>();
  events.forEach((event) => {
    const flowKey = JSON.stringify([event.experimentId, event.variantId, event.flowType]);
    if (event.eventName === 'quiz_result_view') {
      const sessions = quizResults.get(flowKey) ?? new Set<string>();
      sessions.add(event.sessionKey);
      quizResults.set(flowKey, sessions);
    }
    if (!event.stepId || !['quiz_step_view', 'quiz_step_complete', 'quiz_back', 'quiz_unknown_selected'].includes(event.eventName)) return;
    const key = JSON.stringify([event.experimentId, event.variantId, event.flowType, event.stepId]);
    const group = quizGroups.get(key) ?? {
      experimentId: event.experimentId,
      variantId: event.variantId,
      flowType: event.flowType,
      stepId: event.stepId,
      views: new Set<string>(),
      completes: new Set<string>(),
      backEvents: 0,
      unknownSelections: 0,
    };
    if (event.eventName === 'quiz_step_view') group.views.add(event.sessionKey);
    if (event.eventName === 'quiz_step_complete') group.completes.add(event.sessionKey);
    if (event.eventName === 'quiz_back') group.backEvents += 1;
    if (event.eventName === 'quiz_unknown_selected') group.unknownSelections += 1;
    quizGroups.set(key, group);
  });
  const groupedStepsByFlow = new Map<string, QuizGroup[]>();
  quizGroups.forEach((group) => {
    const flowKey = JSON.stringify([group.experimentId, group.variantId, group.flowType]);
    const steps = groupedStepsByFlow.get(flowKey) ?? [];
    steps.push(group);
    groupedStepsByFlow.set(flowKey, steps);
  });
  const quizSteps: MarketingJourneySummary['quizSteps'] = [];
  groupedStepsByFlow.forEach((steps, flowKey) => {
    steps.sort((left, right) => (
      stepOrder(left.flowType, left.stepId) - stepOrder(right.flowType, right.stepId)
      || left.stepId.localeCompare(right.stepId)
    ));
    steps.forEach((step, index) => {
      const nextSessions = steps[index + 1]?.views ?? quizResults.get(flowKey) ?? new Set<string>();
      const advancedSessions = intersectionSize(step.views, nextSessions);
      quizSteps.push({
        experimentId: step.experimentId,
        variantId: step.variantId,
        flowType: step.flowType,
        stepId: step.stepId,
        views: step.views.size,
        completes: step.completes.size,
        advancedSessions,
        possibleDropOffSessions: Math.max(0, step.views.size - advancedSessions),
        advanceRate: roundRate(advancedSessions, step.views.size),
        backEvents: step.backEvents,
        unknownSelections: step.unknownSelections,
      });
    });
  });

  const variantGroups = new Map<string, {
    experimentId: string;
    variantId: string;
    sessions: Set<string>;
    cta: Set<string>;
    quizStart: Set<string>;
    quizResult: Set<string>;
  }>();
  events.forEach((event) => {
    if (!event.experimentId || !event.variantId) return;
    const key = `${event.experimentId}:${event.variantId}`;
    const group = variantGroups.get(key) ?? {
      experimentId: event.experimentId,
      variantId: event.variantId,
      sessions: new Set<string>(),
      cta: new Set<string>(),
      quizStart: new Set<string>(),
      quizResult: new Set<string>(),
    };
    group.sessions.add(event.sessionKey);
    if (event.eventName === 'cta_click') group.cta.add(event.sessionKey);
    if (event.eventName === 'quiz_start') group.quizStart.add(event.sessionKey);
    if (event.eventName === 'quiz_result_view') group.quizResult.add(event.sessionKey);
    variantGroups.set(key, group);
  });
  const variants = [...variantGroups.values()].map((group) => {
    const active5 = intersectionSize(group.sessions, active5sSessions);
    const active10 = intersectionSize(group.sessions, active10sSessions);
    const contacts = intersectionSize(group.sessions, contactSessions);
    return {
      experimentId: group.experimentId,
      variantId: group.variantId,
      sessions: group.sessions.size,
      active5sSessions: active5,
      active10sSessions: active10,
      ctaClickSessions: group.cta.size,
      quizStartSessions: group.quizStart.size,
      quizResultSessions: group.quizResult.size,
      contactSessions: contacts,
      active5sRate: roundRate(active5, group.sessions.size),
      active10sRate: roundRate(active10, group.sessions.size),
      contactRate: roundRate(contacts, group.sessions.size),
    };
  }).sort((left, right) => right.sessions - left.sessions || left.variantId.localeCompare(right.variantId));

  const pageGroups = new Map<string, {
    views: number;
    sessions: Set<string>;
    active5: Set<string>;
    active10: Set<string>;
    cta: Set<string>;
    quizStart: Set<string>;
    contact: Set<string>;
  }>();
  events.forEach((event) => {
    const group = pageGroups.get(event.pagePath) ?? {
      views: 0,
      sessions: new Set<string>(),
      active5: new Set<string>(),
      active10: new Set<string>(),
      cta: new Set<string>(),
      quizStart: new Set<string>(),
      contact: new Set<string>(),
    };
    if (event.eventName === 'page_view') {
      group.views += 1;
      group.sessions.add(event.sessionKey);
    }
    if (event.eventName === 'engagement_5s') group.active5.add(event.sessionKey);
    if (event.eventName === 'engagement_10s') group.active10.add(event.sessionKey);
    if (event.eventName === 'cta_click') group.cta.add(event.sessionKey);
    if (event.eventName === 'quiz_start') group.quizStart.add(event.sessionKey);
    if (isContactEvent(event.eventName)) group.contact.add(event.sessionKey);
    pageGroups.set(event.pagePath, group);
  });
  const pages = [...pageGroups.entries()]
    .filter(([, group]) => group.views > 0)
    .map(([pagePath, group]) => {
      const active5 = intersectionSize(group.sessions, group.active5);
      const active10 = intersectionSize(group.sessions, group.active10);
      const contacts = intersectionSize(group.sessions, group.contact);
      return {
        pagePath,
        sessions: group.sessions.size,
        views: group.views,
        active5sSessions: active5,
        active10sSessions: active10,
        ctaClickSessions: intersectionSize(group.sessions, group.cta),
        quizStartSessions: intersectionSize(group.sessions, group.quizStart),
        contactSessions: contacts,
        active5sRate: roundRate(active5, group.sessions.size),
        active10sRate: roundRate(active10, group.sessions.size),
        contactRate: roundRate(contacts, group.sessions.size),
      };
    })
    .sort((left, right) => right.sessions - left.sessions || left.pagePath.localeCompare(right.pagePath));

  const eligibleSessions = pageViewSessions.size;
  const retained5 = intersectionSize(pageViewSessions, active5sSessions);
  const retained10 = intersectionSize(pageViewSessions, active10sSessions);
  return {
    measurement: {
      trackedSessions: trackedSessions.size,
      pageViewSessions: eligibleSessions,
      activeTimeMeasuredSessions: activeTimeMeasuredSessions.size,
      consentedSessions,
      anonymousSessions,
      mixedSessions,
      unknownSessions,
    },
    retention: {
      eligibleSessions,
      active5sSessions: retained5,
      active10sSessions: retained10,
      active5sRate: roundRate(retained5, eligibleSessions),
      active10sRate: roundRate(retained10, eligibleSessions),
      no5sSignalSessions: Math.max(0, eligibleSessions - retained5),
      no10sSignalSessions: Math.max(0, eligibleSessions - retained10),
      scope: 'tracked_sessions_only',
    },
    contactChannels,
    locations: {
      scope: 'analytics_consented_sessions_only',
      minimumSessions: minimumLocationSessions,
      groupsTruncated: allVisibleLocationGroups.length > 100,
      groups: allVisibleLocationGroups.slice(0, 100),
    },
    clicks: {
      totalEvents: clickEvents.length,
      uniqueSessions: clickSessions.size,
      groupsTruncated: allClickGroups.length > 100,
      groups: allClickGroups.slice(0, 100),
    },
    quizStepsTruncated: quizSteps.length > 100,
    quizSteps: quizSteps.slice(0, 100),
    variantsTruncated: variants.length > 50,
    variants: variants.slice(0, 50),
    pagesTruncated: pages.length > 100,
    pages: pages.slice(0, 100),
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeMarketingRecentCursor(cursor: MarketingRecentActivityCursor) {
  const serialized = JSON.stringify({ t: cursor.occurredAt, i: cursor.eventId });
  return bytesToBase64(new TextEncoder().encode(serialized))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function decodeMarketingRecentCursor(value: unknown): MarketingRecentActivityCursor | null {
  const raw = limitedString(value, 500);
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
    const parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(padded))) as { t?: unknown; i?: unknown };
    const occurredAt = limitedString(parsed.t, 80);
    const eventId = limitedString(parsed.i, 80);
    if (!occurredAt || !eventId || !Number.isFinite(Date.parse(occurredAt)) || !UUID_PATTERN.test(eventId)) return null;
    return { occurredAt: new Date(occurredAt).toISOString(), eventId: eventId.toLowerCase() };
  } catch {
    return null;
  }
}

export function parseMarketingRecentLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(50, Math.trunc(parsed)));
}

export async function createMarketingOpaqueTokenEncoder(secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return async (prefix: string, value: string) => {
    const signature = new Uint8Array(await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${prefix}:${value}`),
    ));
    return `${prefix}-${[...signature.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  };
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function sanitizeMarketingVisitorSessionPayload(
  item: JsonRecord,
  encodeToken: (prefix: string, value: string) => Promise<string>,
) {
  const safe = { ...item };
  delete safe.leadCode;
  delete safe.leadName;
  delete safe.leadContact;
  delete safe.clientId;
  delete safe.searchTerm;

  const originType = safe.originType === 'paid' || safe.originType === 'organic' ? safe.originType : 'other';
  const landingPage = sanitizeMarketingPath(safe.landingPage);
  const lastPage = sanitizeMarketingPath(safe.lastPage);
  safe.source = sanitizeMarketingAttributionDimension(safe.source, 120)
    ?? (originType === 'paid' ? 'google' : 'direto');
  safe.medium = sanitizeMarketingAttributionDimension(safe.medium, 80)
    ?? (originType === 'paid' ? 'cpc' : originType === 'organic' ? 'organic' : 'sem meio');
  safe.campaign = sanitizeMarketingAttributionDimension(safe.campaign, 120);
  safe.landingPage = landingPage;
  safe.lastPage = lastPage;
  safe.landingUrl = `https://www.premiumretifica.com.br${landingPage}`;
  safe.lastUrl = `https://www.premiumretifica.com.br${lastPage}`;

  const rawPages = Array.isArray(safe.pages) ? safe.pages.filter(isJsonRecord) : [];
  safe.pagesTruncated = rawPages.length > 100;
  safe.pages = rawPages.slice(0, 100).map((page) => {
    const path = sanitizeMarketingPath(page.path);
    return {
      path,
      url: `https://www.premiumretifica.com.br${path}`,
      title: null,
      occurredAt: limitedString(page.occurredAt, 80),
    };
  });

  const rawActions = Array.isArray(safe.actions) ? safe.actions.filter(isJsonRecord) : [];
  safe.actionsTruncated = rawActions.length > 100;
  safe.actions = rawActions.slice(0, 100).map((action) => ({
    type: safeDimension(action.type, 80) ?? 'other',
    eventName: safeDimension(action.eventName, 100),
    occurredAt: limitedString(action.occurredAt, 80),
    pagePath: sanitizeMarketingPath(action.pagePath),
    detail: safeDimension(action.detail, 100),
    flowType: safeDimension(action.flowType, 100),
    stepId: safeDimension(action.stepId, 100),
    optionId: safeDimension(action.optionId, 100),
    fieldId: safeDimension(action.fieldId, 100),
    interactionAction: safeDimension(action.interactionAction, 40),
    validationReason: safeDimension(action.validationReason, 100),
  }));
  safe.visitorId = await encodeToken('visit', String(item.visitorId ?? 'unknown'));
  return safe;
}

export async function buildMarketingRecentActivityItems(
  rawEvents: JsonRecord[],
  options: { tokenSalt: string },
): Promise<MarketingRecentActivityItem[]> {
  const normalized = rawEvents
    .map(normalizeMarketingJourneyEvent)
    .filter((event): event is NormalizedJourneyEvent => Boolean(event));
  const encodeToken = await createMarketingOpaqueTokenEncoder(options.tokenSalt);

  return await Promise.all(normalized.map(async (event) => {
    const eventId = limitedString(event.raw.id_marketing_site_eventos, 80)
      ?? `${event.occurredAt}:${event.sessionKey}:${event.eventName}`;
    const source = sanitizeMarketingAttributionDimension(event.raw.source, 120)
      ?? (event.originType === 'paid' ? 'google' : 'direto');
    const medium = sanitizeMarketingAttributionDimension(event.raw.medium, 80)
      ?? (event.originType === 'paid' ? 'cpc' : event.originType === 'organic' ? 'organic' : 'sem meio');
    const hasContactIntent = [
      'form_submit',
      'lead_created',
      'generate_lead',
      'whatsapp_click',
      'phone_click',
      'quiz_whatsapp_click',
    ].includes(event.eventName);

    return {
      activityId: await encodeToken('activity', eventId),
      visitorToken: await encodeToken('visit', event.sessionKey),
      occurredAt: event.occurredAt,
      eventName: event.eventName,
      category: event.category,
      pagePath: event.pagePath,
      originType: event.originType,
      source,
      medium,
      campaign: sanitizeMarketingAttributionDimension(event.raw.campaign, 120),
      deviceType: safeDimension(event.raw.device_type, 40),
      componentId: event.componentId,
      position: event.position,
      flowType: event.flowType,
      stepId: event.stepId,
      optionId: event.optionId,
      fieldId: event.fieldId,
      interactionAction: event.interactionAction,
      validationReason: event.validationReason,
      experimentId: event.experimentId,
      variantId: event.variantId,
      estimateState: event.estimateState,
      destinationType: event.destinationType,
      destinationPath: event.destinationPath,
      contactState: hasContactIntent ? 'intent' : 'anonymous',
    } satisfies MarketingRecentActivityItem;
  }));
}
