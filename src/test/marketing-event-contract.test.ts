import { describe, expect, it } from 'vitest';
import {
  MARKETING_ACCEPTED_EVENT_TYPES,
  MARKETING_V2_MICRO_EVENT_TYPES,
  normalizeMarketingEventForStorage,
  storedMarketingEventMatches,
} from '../../supabase/functions/_shared/marketing-event-contract';

describe('contrato de ingestão dos eventos de marketing v2', () => {
  it('aceita os eventos diretos atuais do site sem remover os tipos históricos', () => {
    expect([...MARKETING_V2_MICRO_EVENT_TYPES]).toEqual([
      'instagram_click',
      'directions_click',
      'cta_click',
      'service_detail_click',
      'form_field_complete',
      'scroll_depth',
    ]);
    for (const eventType of [
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
      ...MARKETING_V2_MICRO_EVENT_TYPES,
    ]) {
      expect(MARKETING_ACCEPTED_EVENT_TYPES.has(eventType)).toBe(true);
    }
    expect(MARKETING_ACCEPTED_EVENT_TYPES.has('evento_inventado')).toBe(false);
  });

  it('persiste microeventos v2 como custom para respeitar a constraint atual do banco', () => {
    for (const eventType of MARKETING_V2_MICRO_EVENT_TYPES) {
      expect(normalizeMarketingEventForStorage(eventType, {
        eventLabel: 'services_hero_action',
        componentId: 'services_hero_action',
      })).toEqual({
        eventType: 'custom',
        metadata: {
          eventLabel: eventType,
          interactionLabel: 'services_hero_action',
          componentId: 'services_hero_action',
        },
      });
    }
  });

  it('mantém tipos canônicos e protege a idempotência entre microeventos distintos', () => {
    expect(normalizeMarketingEventForStorage('whatsapp_click', { componentId: 'hero_whatsapp' })).toEqual({
      eventType: 'whatsapp_click',
      metadata: { componentId: 'hero_whatsapp' },
    });
    expect(storedMarketingEventMatches(
      'cta_click',
      'custom',
      { eventLabel: 'cta_click' },
    )).toBe(true);
    expect(storedMarketingEventMatches(
      'scroll_depth',
      'custom',
      { eventLabel: 'cta_click' },
    )).toBe(false);
  });
});
