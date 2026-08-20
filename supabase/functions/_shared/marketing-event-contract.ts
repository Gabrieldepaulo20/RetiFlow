type JsonRecord = Record<string, unknown>;

export const MARKETING_EVENT_CONTRACT = {
  schemaVersion: 'marketing-events-v3',
  aliases: {},
  events: [
    { name: 'page_view', storageEventType: 'page_view' },
    { name: 'whatsapp_click', storageEventType: 'whatsapp_click' },
    { name: 'instagram_click', storageEventType: 'custom', metadataEventLabel: 'instagram_click' },
    { name: 'phone_click', storageEventType: 'phone_click' },
    { name: 'directions_click', storageEventType: 'custom', metadataEventLabel: 'directions_click' },
    { name: 'cta_click', storageEventType: 'custom', metadataEventLabel: 'cta_click' },
    { name: 'service_detail_click', storageEventType: 'custom', metadataEventLabel: 'service_detail_click' },
    { name: 'form_view', storageEventType: 'form_view' },
    { name: 'form_start', storageEventType: 'form_start' },
    { name: 'form_field_complete', storageEventType: 'custom', metadataEventLabel: 'form_field_complete' },
    { name: 'form_abandon', storageEventType: 'form_abandon' },
    { name: 'form_submit_attempt', storageEventType: 'form_submit_attempt' },
    { name: 'form_validation_error', storageEventType: 'form_validation_error' },
    { name: 'form_submit_error', storageEventType: 'form_submit_error' },
    { name: 'form_submit', storageEventType: 'form_submit' },
    { name: 'lead_created', storageEventType: 'lead_created' },
    { name: 'critical_page_view', storageEventType: 'critical_page_view' },
    { name: 'scroll_depth', storageEventType: 'custom', metadataEventLabel: 'scroll_depth' },
    { name: 'custom', storageEventType: 'custom' },
  ],
  requiredFields: ['eventType', 'leadCode', 'eventId'],
  optionalFields: [
    'anonymousId', 'sessionId', 'channel', 'occurredAt', 'pagePath',
    'pageLocation', 'pageTitle', 'referrer', 'source', 'medium', 'campaign',
    'term', 'content', 'gclid', 'gbraid', 'wbraid', 'deviceType', 'city',
    'region', 'metadata', 'lead',
  ],
  limits: {
    bodyBytes: 32_000,
    eventType: 60,
    eventId: 80,
    leadCode: 40,
    anonymousId: 120,
    sessionId: 120,
    channel: 80,
    occurredAt: 80,
    pagePath: 500,
    pageLocation: 800,
    pageTitle: 300,
    referrer: 800,
    source: 120,
    medium: 120,
    campaign: 180,
    term: 180,
    content: 180,
    clickId: 220,
    deviceType: 40,
    city: 60,
    region: 60,
    metadataString: 180,
    metadataHostname: 255,
  },
  metadata: {
    allowedKeys: [
      'eventLabel',
      'method',
      'formName',
      'lastField',
      'validationReason',
      'elapsedSeconds',
      'fieldsCompleted',
      'completionPercent',
      'engagedSeconds',
      'percentScrolled',
      'experimentId',
      'variantId',
      'componentId',
      'position',
      'pageType',
      'serviceId',
      'flowType',
      'stepId',
      'optionId',
      'fieldId',
      'interactionAction',
      'estimateState',
      'destinationType',
      'destinationPath',
      'visitorCity',
      'sessionOriginType',
      'siteHostname',
      'environment',
      'measurementMode',
      'eventContractVersion',
    ],
    maxKeys: 30,
    keyLength: 80,
    numericMin: -1_000_000,
    numericMax: 1_000_000,
    destinationTypes: [
      'whatsapp',
      'phone',
      'estimate',
      'service',
      'contact',
      'directions',
      'video',
      'other',
    ],
    measurementModes: [
      'analytics',
      'advertising',
      'analytics_and_advertising',
      /*
        'essencial' = contagem minima do funil por legitimo interesse, de quem
        ainda nao decidiu sobre cookies. Sem este item na lista o sanitizador
        descartava o rotulo e os registros anonimos chegavam sem base legal
        identificavel, o que impede auditoria. Esta e a SEGUNDA copia do
        contrato: a do site vive em src/lib/marketing-event-contract.ts e as
        duas precisam concordar.
      */
      'essencial',
    ],
    technicalDimensionKeys: [
      'optionId',
      'fieldId',
      'interactionAction',
    ],
    technicalDimensionLimit: 100,
    technicalDimensionMaxDigits: 9,
    destinationPathLimit: 180,
    visitorCityLimit: 'city',
    defaultStringLimit: 'metadataString',
    hostnameStringLimit: 'metadataHostname',
    allowBoolean: true,
    allowNull: false,
  },
  normalization: {
    eventType: 'trim_exact_case_no_unknown_fallback',
    eventId: 'trim_required_caller_stable_url_safe_charset_field_limit_reject_email_or_phone_shaped',
    technicalIds: 'trim_url_safe_charset_field_limit_reject_email_or_phone_shaped',
    technicalIdPattern: '^[A-Za-z0-9._~-]{8,}$',
    leadCode: 'trim_uppercase',
    leadCodePattern: '^RP-[0-9]{8}-[A-Z0-9]{8}$',
    strings: 'collapse_whitespace_trim_truncate',
    personalDataDecodePasses: 3,
    pageLocation: 'origin_and_path_only',
    referrer: 'origin_only',
    pathPersonalData: 'decode_up_to_3_fail_closed_replace_path_with_root',
    clickIds: 'trim_url_safe_charset_length_1_220_reject_email_or_phone_shaped',
    clickIdPattern: '^[A-Za-z0-9._~-]{1,220}$',
  },
  pii: {
    siteTelemetryEndpointForwardsLead: false,
    siteTelemetryEndpointRejectedEvents: ['form_submit', 'lead_created'],
    edgeAcceptsLeadOnlyForEvents: ['form_submit', 'lead_created'],
    genericFreeTextWithEmailOrPhone: 'drop_raw_or_decoded_up_to_3_embedded_sequence',
    queryStringsInPageLocationOrReferrer: 'drop',
  },
} as const;

export type MarketingEventType =
  (typeof MARKETING_EVENT_CONTRACT.events)[number]['name'];

const EVENT_BY_NAME = new Map(
  MARKETING_EVENT_CONTRACT.events.map((event) => [event.name, event]),
);

export const MARKETING_ACCEPTED_EVENT_TYPES = new Set<string>(
  MARKETING_EVENT_CONTRACT.events.map((event) => event.name),
);

export const MARKETING_V2_MICRO_EVENT_TYPES = MARKETING_EVENT_CONTRACT.events
  .filter((event) => event.storageEventType === 'custom' && event.name !== 'custom')
  .map((event) => event.name) as Array<MarketingEventType>;

export function normalizeMarketingEventType(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return EVENT_BY_NAME.get(normalized as MarketingEventType) ?? null;
}

export function containsHighConfidencePersonalData(value: string) {
  const candidates = decodePersonalDataCandidates(value);
  return candidates === null || candidates.some((candidate) => (
    containsEmail(candidate) || containsEmbeddedPhoneSequence(candidate)
  ));
}

export type SanitizedMarketingMetadata = Record<string, string | number | boolean>;

const ALLOWED_METADATA_KEYS = new Set<string>(
  MARKETING_EVENT_CONTRACT.metadata.allowedKeys,
);
const DESTINATION_TYPES = new Set<string>(
  MARKETING_EVENT_CONTRACT.metadata.destinationTypes,
);
const MEASUREMENT_MODES = new Set<string>(
  MARKETING_EVENT_CONTRACT.metadata.measurementModes,
);
const TECHNICAL_DIMENSION_KEYS = new Set<string>(
  MARKETING_EVENT_CONTRACT.metadata.technicalDimensionKeys,
);

function cleanContractMetadataString(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export const MARKETING_LEAD_CODE_PATTERN = new RegExp(
  MARKETING_EVENT_CONTRACT.normalization.leadCodePattern,
);
const MARKETING_CLICK_ID_PATTERN = new RegExp(
  MARKETING_EVENT_CONTRACT.normalization.clickIdPattern,
);
const MARKETING_TECHNICAL_ID_PATTERN = new RegExp(
  MARKETING_EVENT_CONTRACT.normalization.technicalIdPattern,
);

export function normalizeMarketingLeadCode(value: unknown) {
  const normalized = cleanContractMetadataString(
    value,
    MARKETING_EVENT_CONTRACT.limits.leadCode,
  ).toUpperCase();
  return MARKETING_LEAD_CODE_PATTERN.test(normalized) ? normalized : null;
}

function decodePersonalDataCandidates(value: string) {
  const candidates = [value];
  const seen = new Set(candidates);
  let current = value;
  for (
    let pass = 0;
    pass < MARKETING_EVENT_CONTRACT.normalization.personalDataDecodePasses;
    pass += 1
  ) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) return candidates;
    if (seen.has(decoded)) return null;
    candidates.push(decoded);
    seen.add(decoded);
    current = decoded;
  }
  // Se ainda houver uma sequência codificada após o limite, a entrada exigiria
  // mais camadas para ser compreendida e é descartada de forma fail-closed.
  return /%[0-9a-f]{2}/i.test(current) ? null : candidates;
}

function isPhoneShaped(value: string) {
  if (!/^[+\d\s().-]+$/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14;
}

function containsEmail(value: string) {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value);
}

export function sanitizeMarketingClickId(value: unknown) {
  if (typeof value !== 'string') return null;
  const clickId = value.trim();
  if (!clickId || clickId.length > MARKETING_EVENT_CONTRACT.limits.clickId) return null;
  const candidates = decodePersonalDataCandidates(clickId);
  if (candidates === null || candidates.some((candidate) => (
    containsEmail(candidate) || isPhoneShaped(candidate)
  ))) return null;
  if (!MARKETING_CLICK_ID_PATTERN.test(clickId)) {
    return null;
  }
  return clickId;
}

export function sanitizeMarketingTechnicalId(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const identifier = value.trim();
  if (!identifier || identifier.length > max || !MARKETING_TECHNICAL_ID_PATTERN.test(identifier)) {
    return null;
  }
  const candidates = decodePersonalDataCandidates(identifier);
  if (candidates === null || candidates.some((candidate) => (
    containsEmail(candidate) || isPhoneShaped(candidate)
  ))) return null;
  return identifier;
}

function containsEmbeddedPhoneSequence(value: string) {
  return value
    .split(/[^+\d\s().-]+/)
    .some((candidate) => candidate.replace(/\D/g, '').length >= 8);
}

function pathContainsPersonalData(path: string) {
  const candidates = decodePersonalDataCandidates(path);
  return candidates === null || candidates.some((candidate) => (
    containsEmail(candidate) || containsEmbeddedPhoneSequence(candidate)
  ));
}

export function sanitizeMarketingPagePath(
  value: unknown,
  max: number = MARKETING_EVENT_CONTRACT.limits.pagePath,
) {
  const raw = cleanContractMetadataString(value, max).split(/[?#]/, 1)[0];
  if (!raw || !raw.startsWith('/')) return '/';
  const normalized = `/${raw.replace(/^\/+/, '')}`;
  return pathContainsPersonalData(normalized) ? '/' : normalized;
}

export function sanitizeMarketingPageLocation(value: unknown) {
  const max = MARKETING_EVENT_CONTRACT.limits.pageLocation;
  const raw = cleanContractMetadataString(value, max);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const path = sanitizeMarketingPagePath(parsed.pathname);
    return `${parsed.origin}${path}`.slice(0, max);
  } catch {
    return null;
  }
}

export function sanitizeMarketingEventMetadata(
  value: unknown,
): SanitizedMarketingMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const metadata: SanitizedMarketingMetadata = {};
  const rules = MARKETING_EVENT_CONTRACT.metadata;

  for (const [key, item] of Object.entries(value)) {
    if (Object.keys(metadata).length >= rules.maxKeys) break;
    if (key.length > rules.keyLength || !ALLOWED_METADATA_KEYS.has(key)) {
      continue;
    }

    if (key === 'destinationType') {
      const destinationType = cleanContractMetadataString(item, 32).toLowerCase();
      if (DESTINATION_TYPES.has(destinationType)) {
        metadata[key] = destinationType;
      }
      continue;
    }

    if (key === 'destinationPath') {
      const rawDestinationPath = cleanContractMetadataString(
        item,
        rules.destinationPathLimit,
      );
      if (!rawDestinationPath) continue;
      const destinationPath = sanitizeMarketingPagePath(
        rawDestinationPath,
        rules.destinationPathLimit,
      );
      if (/^\/[a-z0-9/_-]*$/i.test(destinationPath)) {
        metadata[key] = `/${destinationPath.replace(/^\/+/, '')}`;
      }
      continue;
    }

    if (key === 'visitorCity') {
      const cityLimit = MARKETING_EVENT_CONTRACT.limits[rules.visitorCityLimit];
      const city = cleanContractMetadataString(item, cityLimit);
      if (/^[\p{L}\s.'-]+$/u.test(city)) metadata[key] = city;
      continue;
    }

    if (key === 'measurementMode') {
      const measurementMode = cleanContractMetadataString(item, 40);
      if (MEASUREMENT_MODES.has(measurementMode)) {
        metadata[key] = measurementMode;
      }
      continue;
    }

    if (TECHNICAL_DIMENSION_KEYS.has(key)) {
      const dimension = cleanContractMetadataString(
        item,
        rules.technicalDimensionLimit,
      );
      if (
        dimension
        && /^[A-Za-z0-9_-]+$/.test(dimension)
        && dimension.replace(/\D/g, '').length <= rules.technicalDimensionMaxDigits
      ) {
        metadata[key] = dimension;
      }
      continue;
    }

    if (typeof item === 'string') {
      const limitKey = key === 'siteHostname'
        ? rules.hostnameStringLimit
        : rules.defaultStringLimit;
      const cleaned = cleanContractMetadataString(
        item,
        MARKETING_EVENT_CONTRACT.limits[limitKey],
      );
      if (cleaned && !containsHighConfidencePersonalData(cleaned)) {
        metadata[key] = cleaned;
      }
      continue;
    }

    if (typeof item === 'number' && Number.isFinite(item)) {
      metadata[key] = Math.max(rules.numericMin, Math.min(rules.numericMax, item));
      continue;
    }

    if (typeof item === 'boolean' && rules.allowBoolean) {
      metadata[key] = item;
    }
  }

  return metadata;
}

function safeInteractionLabel(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().slice(0, 100);
  return normalized
    && normalized.replace(/\D/g, '').length < 10
    && /^[A-Za-z0-9_-]+$/.test(normalized)
    ? normalized
    : null;
}

export function normalizeMarketingEventForStorage(
  eventType: string,
  metadata: JsonRecord,
) {
  const definition = EVENT_BY_NAME.get(eventType as MarketingEventType);
  if (!definition) throw new Error('Tipo de evento fora do contrato.');

  if (definition.storageEventType !== 'custom' || eventType === 'custom') {
    return { eventType: definition.storageEventType, metadata };
  }
  const metadataEventLabel = 'metadataEventLabel' in definition
    ? definition.metadataEventLabel
    : eventType;

  const interactionLabel = safeInteractionLabel(metadata.eventLabel ?? metadata.event_label);
  return {
    eventType: definition.storageEventType,
    metadata: {
      ...metadata,
      ...(interactionLabel && interactionLabel !== eventType ? { interactionLabel } : {}),
      eventLabel: metadataEventLabel,
    },
  };
}

export function storedMarketingEventMatches(
  requestedEventType: string,
  storedEventType: unknown,
  storedMetadata: unknown,
) {
  const definition = EVENT_BY_NAME.get(requestedEventType as MarketingEventType);
  if (!definition || storedEventType !== definition.storageEventType) return false;
  if (definition.storageEventType !== 'custom' || requestedEventType === 'custom') return true;
  if (!storedMetadata || typeof storedMetadata !== 'object' || Array.isArray(storedMetadata)) return false;
  const metadataEventLabel = 'metadataEventLabel' in definition
    ? definition.metadataEventLabel
    : requestedEventType;
  return (storedMetadata as JsonRecord).eventLabel === metadataEventLabel;
}
