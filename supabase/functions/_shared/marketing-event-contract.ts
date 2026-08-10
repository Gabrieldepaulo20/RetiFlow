type JsonRecord = Record<string, unknown>;

const DATABASE_EVENT_TYPES = new Set([
  'page_view',
  'whatsapp_click',
  'phone_click',
  'form_view',
  'form_start',
  'form_abandon',
  'form_submit_attempt',
  'form_validation_error',
  'form_submit_error',
  'form_submit',
  'lead_created',
  'critical_page_view',
  'custom',
]);

export const MARKETING_V2_MICRO_EVENT_TYPES = [
  'instagram_click',
  'directions_click',
  'cta_click',
  'service_detail_click',
  'form_field_complete',
  'scroll_depth',
] as const;

export const MARKETING_ACCEPTED_EVENT_TYPES = new Set([
  ...DATABASE_EVENT_TYPES,
  ...MARKETING_V2_MICRO_EVENT_TYPES,
]);

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
  if (DATABASE_EVENT_TYPES.has(eventType)) {
    return { eventType, metadata };
  }

  const interactionLabel = safeInteractionLabel(metadata.eventLabel ?? metadata.event_label);
  return {
    eventType: 'custom',
    metadata: {
      ...metadata,
      ...(interactionLabel && interactionLabel !== eventType ? { interactionLabel } : {}),
      eventLabel: eventType,
    },
  };
}

export function storedMarketingEventMatches(
  requestedEventType: string,
  storedEventType: unknown,
  storedMetadata: unknown,
) {
  const normalized = normalizeMarketingEventForStorage(requestedEventType, {});
  if (storedEventType !== normalized.eventType) return false;
  if (normalized.eventType !== 'custom' || requestedEventType === 'custom') return true;
  if (!storedMetadata || typeof storedMetadata !== 'object' || Array.isArray(storedMetadata)) return false;
  return (storedMetadata as JsonRecord).eventLabel === requestedEventType;
}
