import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import contractCorpus from '../../contracts/marketing-events-v3.json';
import {
  MARKETING_ACCEPTED_EVENT_TYPES,
  MARKETING_EVENT_CONTRACT,
  MARKETING_V2_MICRO_EVENT_TYPES,
  containsHighConfidencePersonalData,
  normalizeMarketingLeadCode,
  normalizeMarketingEventType,
  normalizeMarketingEventForStorage,
  sanitizeMarketingClickId,
  sanitizeMarketingEventMetadata,
  sanitizeMarketingPageLocation,
  sanitizeMarketingPagePath,
  sanitizeMarketingTechnicalId,
  storedMarketingEventMatches,
} from '../../supabase/functions/_shared/marketing-event-contract';

describe('contrato de ingestão dos eventos de marketing v3', () => {
  it('mantém o módulo da Edge idêntico ao corpus versionado compartilhado com o site', () => {
    expect(MARKETING_EVENT_CONTRACT).toEqual(contractCorpus);
  });

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
    expect(normalizeMarketingEventType(' evento_inventado ')).toBeNull();
    expect(normalizeMarketingEventType(' WHATSAPP_CLICK ')).toBeNull();
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

  it('declara os mesmos campos, limites e ausência de aliases do proxy do site', () => {
    expect(MARKETING_EVENT_CONTRACT.aliases).toEqual({});
    expect(MARKETING_EVENT_CONTRACT.requiredFields).toEqual(['eventType', 'leadCode', 'eventId']);
    expect(MARKETING_EVENT_CONTRACT.optionalFields).not.toContain('eventId');
    expect(MARKETING_EVENT_CONTRACT.limits).toMatchObject({
      bodyBytes: 32_000,
      eventId: 80,
      leadCode: 40,
      anonymousId: 120,
      sessionId: 120,
      pagePath: 500,
      pageLocation: 800,
      referrer: 800,
      metadataString: 180,
      clickId: 220,
      city: 60,
    });
    expect(MARKETING_EVENT_CONTRACT.metadata).toEqual(contractCorpus.metadata);
    expect(MARKETING_EVENT_CONTRACT.pii.siteTelemetryEndpointForwardsLead).toBe(false);
    expect(MARKETING_EVENT_CONTRACT.pii.siteTelemetryEndpointRejectedEvents).toEqual([
      'form_submit',
      'lead_created',
    ]);
    expect(MARKETING_EVENT_CONTRACT.pii.edgeAcceptsLeadOnlyForEvents).toEqual([
      'form_submit',
      'lead_created',
    ]);
  });

  it('exige o leadCode canônico aceito pelos RPCs de vínculo', () => {
    expect(normalizeMarketingLeadCode(' rp-20260819-ab12cd34 '))
      .toBe('RP-20260819-AB12CD34');
    expect(normalizeMarketingLeadCode('RP-2026-0819-AB12CD34')).toBeNull();
    expect(normalizeMarketingLeadCode('RP-20260819-ABCD')).toBeNull();
    expect(normalizeMarketingLeadCode('RP-20260819-AB12CD345')).toBeNull();
  });

  it('aceita click IDs ASCII opacos e rejeita e-mail, telefone ou charset fora do corpus', () => {
    expect(sanitizeMarketingClickId(' CjwK._~-abc123 ')).toBe('CjwK._~-abc123');
    expect(sanitizeMarketingClickId('123xyz')).toBe('123xyz');
    expect(sanitizeMarketingClickId('pessoa@example.com')).toBeNull();
    expect(sanitizeMarketingClickId('pessoa%40example.com')).toBeNull();
    expect(sanitizeMarketingClickId('pessoa%2540example.com')).toBeNull();
    expect(sanitizeMarketingClickId('+55 (16) 99999-9999')).toBeNull();
    expect(sanitizeMarketingClickId('5516999999999')).toBeNull();
    expect(sanitizeMarketingClickId('abc%20def')).toBeNull();
    expect(sanitizeMarketingClickId(`x${'a'.repeat(220)}`)).toBeNull();
    expect(sanitizeMarketingClickId('gclid11999999999opaque')).toBe('gclid11999999999opaque');
  });

  it('protege eventId, anonymousId e sessionId com o mesmo charset técnico sem PII', () => {
    expect(sanitizeMarketingTechnicalId(' session-abc_123.~ ', 120))
      .toBe('session-abc_123.~');
    expect(sanitizeMarketingTechnicalId('pessoa@example.com', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('pessoa%40example.com', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('pessoa%2540example.com', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('+55 (16) 99999-9999', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('5516999999999', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('session:unsafe', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('short-1', 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId(`x${'a'.repeat(120)}`, 120)).toBeNull();
    expect(sanitizeMarketingTechnicalId('opaque11999999999value', 120))
      .toBe('opaque11999999999value');
  });

  it('remove query/hash e reduz pathname com PII para a raiz', () => {
    expect(sanitizeMarketingPagePath('/servicos/cabecote?utm_source=x#hero'))
      .toBe('/servicos/cabecote');
    expect(sanitizeMarketingPagePath('/contato/pessoa@example.com')).toBe('/');
    expect(sanitizeMarketingPagePath('/contato/pessoa%40example.com')).toBe('/');
    expect(sanitizeMarketingPagePath('/contato/pessoa%2540example.com')).toBe('/');
    expect(sanitizeMarketingPagePath('/telefone/+5516999999999')).toBe('/');
    expect(sanitizeMarketingPagePath('/telefone-11999999999')).toBe('/');
    expect(sanitizeMarketingPagePath('/telefone-%31%31%39%39%39%39%39%39%39%39%39')).toBe('/');
    expect(sanitizeMarketingPagePath('/telefone-%2531%2531%2539%2539%2539%2539%2539%2539%2539%2539%2539')).toBe('/');
    expect(sanitizeMarketingPagePath('/contato/%E0%A4%A')).toBe('/');
    expect(sanitizeMarketingPageLocation(
      'https://premiumretifica.com.br/contato/pessoa%40example.com?utm=x',
    )).toBe('https://premiumretifica.com.br/');
    expect(sanitizeMarketingPageLocation(
      'https://premiumretifica.com.br/servicos/cabecote?utm=x#hero',
    )).toBe('https://premiumretifica.com.br/servicos/cabecote');
  });

  it('descarta metadata e atribuição com PII raw ou encoded, inclusive telefone com ramal', () => {
    const doubleEncodedEmail = encodeURIComponent(encodeURIComponent('cliente@example.com'));
    const doubleEncodedPhone = encodeURIComponent(
      encodeURIComponent('+55 (16) 99999-9999 ramal 123'),
    );
    expect(sanitizeMarketingEventMetadata({
      eventLabel: doubleEncodedEmail,
      formName: doubleEncodedPhone,
      validationReason: 'Ligue +55 (16) 99999-9999 ramal 123',
      method: '11999999999 ou 11888888888',
      environment: '%E0%A4%A',
    })).toEqual({});
    expect(containsHighConfidencePersonalData(doubleEncodedEmail)).toBe(true);
    expect(containsHighConfidencePersonalData('Ligue +55 (16) 99999-9999 ramal 123'))
      .toBe(true);
    expect(containsHighConfidencePersonalData('11999999999 ou 11888888888')).toBe(true);
    expect(containsHighConfidencePersonalData('campanha técnica 1234567')).toBe(false);
  });

  it('aplica a allowlist antes da contagem e descarta unknown, chave longa, PII e estruturas', () => {
    const unknown = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`unknown_${index}`, `value_${index}`]),
    );
    expect(sanitizeMarketingEventMetadata({
      ...unknown,
      [`${'x'.repeat(81)}`]: 'não deve truncar para chave permitida',
      eventLabel: '  hero   action  ',
      formName: 'pessoa@example.com',
      method: '+55 16 99999-9999',
      environment: null,
      componentId: { nested: true },
      position: ['hero'],
      estimateState: true,
    })).toEqual({
      eventLabel: 'hero action',
      estimateState: true,
    });
  });

  it('normaliza destinos, cidade, consentimento e dimensões técnicas pelo corpus v3', () => {
    expect(sanitizeMarketingEventMetadata({
      destinationType: ' WhatsApp ',
      destinationPath: '/servicos/cabecote?utm_source=x#hero',
      visitorCity: "  Santa Bárbara d'Oeste  ",
      measurementMode: 'analytics_and_advertising',
      optionId: 'service_option_123456789',
      fieldId: 'field_1234567890',
      interactionAction: 'open/modal',
      siteHostname: ` ${'a'.repeat(300)} `,
      completionPercent: 2_000_000,
      elapsedSeconds: -2_000_000,
    })).toEqual({
      destinationType: 'whatsapp',
      destinationPath: '/servicos/cabecote',
      visitorCity: "Santa Bárbara d'Oeste",
      measurementMode: 'analytics_and_advertising',
      optionId: 'service_option_123456789',
      siteHostname: 'a'.repeat(255),
      completionPercent: 1_000_000,
      elapsedSeconds: -1_000_000,
    });
  });

  it('remove cidade sem consentimento analítico e nunca persiste body.city/body.region', () => {
    const edgeSource = readFileSync(resolve(
      process.cwd(),
      'supabase/functions/marketing-events/index.ts',
    ), 'utf8');
    expect(edgeSource).toContain("delete sanitizedMetadata.visitorCity");
    expect(edgeSource).toContain(
      "city: typeof metadata.visitorCity === 'string' ? metadata.visitorCity : null",
    );
    expect(edgeSource).toContain('region: null');
    expect(edgeSource).not.toContain('city: asNonPersonalString(body.city');
    expect(edgeSource).not.toContain('region: asNonPersonalString(body.region');
    expect(edgeSource).toContain('eventId é obrigatório para idempotência.');
    expect(edgeSource).not.toContain('body.eventId ?? crypto.randomUUID');
  });
});
