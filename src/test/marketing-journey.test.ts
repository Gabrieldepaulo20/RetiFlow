import { describe, expect, it } from 'vitest';
import {
  buildMarketingJourneySummary,
  buildMarketingRecentActivityItems,
  createMarketingOpaqueTokenEncoder,
  decodeMarketingRecentCursor,
  encodeMarketingRecentCursor,
  normalizeMarketingJourneyEvent,
  parseMarketingRecentLimit,
  sanitizeMarketingVisitorSessionPayload,
} from '../../supabase/functions/_shared/marketing-journey';

const baseTime = '2026-08-10T12:00:00.000Z';

function event(
  sessionId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return {
    id_marketing_site_eventos: crypto.randomUUID(),
    session_id: sessionId,
    event_type: eventType,
    occurred_at: baseTime,
    page_path: '/servicos',
    source: 'direto',
    medium: 'sem meio',
    metadata,
    ...overrides,
  };
}

describe('agregação sanitizada da jornada do site', () => {
  it('mapeia os modos de consentimento v2 sem perder os valores históricos', () => {
    const modes = [
      'analytics',
      'advertising',
      'analytics_and_advertising',
      'consented',
      'anonymous',
      'invalid_mode',
    ];
    const summary = buildMarketingJourneySummary(modes.map((measurementMode, index) => (
      event(`sessao-modo-${index}`, 'page_view', { measurementMode })
    )));

    expect(summary.measurement).toMatchObject({
      trackedSessions: 6,
      consentedSessions: 4,
      anonymousSessions: 1,
      unknownSessions: 1,
    });
  });

  it('agrega cidade por sessão consentida e oculta grupos com menos de três sessões', () => {
    const summary = buildMarketingJourneySummary([
      event('sessao-rp-1', 'page_view', { measurementMode: 'analytics' }, {
        city: 'Ribeirão Preto',
        region: 'SP',
      }),
      event('sessao-rp-1', 'custom', { eventLabel: 'engagement_5s', measurementMode: 'analytics' }, {
        city: 'Ribeirao Preto',
        region: 'São Paulo',
      }),
      event('sessao-rp-2', 'page_view', { measurementMode: 'analytics' }, {
        city: 'RIBEIRÃO PRETO',
        region: 'São Paulo',
      }),
      event('sessao-rp-3', 'page_view', { measurementMode: 'analytics_and_advertising' }, {
        city: 'ribeirão preto',
        region: 'BR-SP',
      }),
      event('sessao-rp-form', 'form_submit', { measurementMode: 'analytics' }, {
        city: 'Ribeirão Preto',
        region: 'SP',
      }),
      event('sessao-sz-1', 'page_view', { measurementMode: 'analytics' }, {
        city: 'Sertãozinho',
        region: 'SP',
      }),
      event('sessao-sz-2', 'page_view', { measurementMode: 'analytics' }, {
        city: 'Sertãozinho',
        region: 'SP',
      }),
      event('sessao-advertising', 'page_view', { measurementMode: 'advertising' }, {
        city: 'Cidade de Anúncio',
        region: 'SP',
      }),
      event('sessao-invalida', 'page_view', { measurementMode: 'analytics' }, {
        city: 'Rua 123 telefone 11999999999',
        region: 'SP',
      }),
      event('sessao-conflitante', 'page_view', { measurementMode: 'analytics' }, {
        city: 'Cravinhos',
        region: 'SP',
      }),
      event('sessao-conflitante', 'custom', { eventLabel: 'engagement_5s', measurementMode: 'analytics' }, {
        city: 'Bebedouro',
        region: 'SP',
      }),
    ]);

    expect(summary.locations).toEqual({
      scope: 'analytics_consented_sessions_only',
      minimumSessions: 3,
      groupsTruncated: false,
      groups: [{ city: 'Ribeirão Preto', region: 'SP', sessions: 4 }],
    });
    expect(JSON.stringify(summary.locations)).not.toMatch(/Sertãozinho|Cidade de Anúncio|11999999999|Cravinhos|Bebedouro/);
  });

  it('mede retenção por sessão elegível e deduplica o mesmo clique de WhatsApp', () => {
    const summary = buildMarketingJourneySummary([
      event('sessao-1', 'page_view', { measurementMode: 'consented' }),
      event('sessao-1', 'custom', { eventLabel: 'engagement_5s', measurementMode: 'consented' }),
      event('sessao-1', 'custom', { eventLabel: 'engagement_10s', measurementMode: 'consented' }),
      event('sessao-1', 'custom', {
        eventLabel: 'cta_click',
        componentId: 'services_hero_estimate',
        position: 'hero_primary',
        destinationType: 'estimate',
        destinationPath: '/quanto-custa?utm_source=interno',
      }),
      event('sessao-1', 'custom', { eventLabel: 'quiz_whatsapp_click', stepId: 'step_7' }),
      event('sessao-1', 'whatsapp_click', { eventLabel: 'quiz_result_whatsapp' }),
      event('sessao-2', 'page_view', {}, { source: 'google', medium: 'organic' }),
      event('sessao-3', 'page_view', { measurementMode: 'anonymous' }),
      event('sessao-3', 'custom', { eventLabel: 'engagement_5s', measurementMode: 'anonymous' }),
    ]);

    expect(summary.measurement).toMatchObject({
      trackedSessions: 3,
      pageViewSessions: 3,
      activeTimeMeasuredSessions: 2,
      consentedSessions: 1,
      anonymousSessions: 1,
      unknownSessions: 1,
    });
    expect(summary.retention).toEqual({
      eligibleSessions: 3,
      active5sSessions: 2,
      active10sSessions: 1,
      active5sRate: 66.67,
      active10sRate: 33.33,
      no5sSignalSessions: 1,
      no10sSignalSessions: 2,
      scope: 'tracked_sessions_only',
    });
    expect(summary.contactChannels.find((item) => item.channel === 'whatsapp')).toEqual({
      channel: 'whatsapp',
      sessions: 1,
      events: 1,
    });
    expect(summary.clicks).toMatchObject({ totalEvents: 2, uniqueSessions: 1 });
    expect(summary.clicks.groups).toContainEqual(expect.objectContaining({
      componentId: 'services_hero_estimate',
      position: 'hero_primary',
      destinationType: 'estimate',
      destinationPath: '/quanto-custa',
      sessions: 1,
    }));
  });

  it('separa variantes e chama ausência da próxima etapa de possível abandono', () => {
    const common = {
      experimentId: 'hero_mobile_paid_v1',
      variantId: 'guided_estimate',
      flowType: 'symptoms',
    };
    const summary = buildMarketingJourneySummary([
      event('sessao-1', 'page_view', common),
      event('sessao-1', 'custom', { ...common, eventLabel: 'quiz_start' }),
      event('sessao-1', 'custom', { ...common, eventLabel: 'quiz_step_view', stepId: 'step_1' }),
      event('sessao-1', 'custom', { ...common, eventLabel: 'quiz_step_complete', stepId: 'step_1' }),
      event('sessao-1', 'custom', { ...common, eventLabel: 'quiz_step_view', stepId: 'step_2' }),
      event('sessao-1', 'custom', { ...common, eventLabel: 'quiz_result_view' }),
      event('sessao-2', 'page_view', common),
      event('sessao-2', 'custom', { ...common, eventLabel: 'quiz_step_view', stepId: 'step_1' }),
      event('sessao-2', 'custom', { ...common, eventLabel: 'quiz_back', stepId: 'step_1' }),
      event('sessao-2', 'custom', { ...common, eventLabel: 'quiz_unknown_selected', stepId: 'step_1' }),
    ]);

    expect(summary.quizSteps[0]).toMatchObject({
      stepId: 'step_1',
      views: 2,
      completes: 1,
      advancedSessions: 1,
      possibleDropOffSessions: 1,
      advanceRate: 50,
      backEvents: 1,
      unknownSelections: 1,
    });
    expect(summary.quizSteps[1]).toMatchObject({
      stepId: 'step_2',
      advancedSessions: 1,
      possibleDropOffSessions: 0,
    });
    expect(summary.variants).toContainEqual(expect.objectContaining({
      experimentId: 'hero_mobile_paid_v1',
      variantId: 'guided_estimate',
      sessions: 2,
      quizStartSessions: 1,
      quizResultSessions: 1,
    }));
  });

  it('respeita a ordem semântica real de cada fluxo do quiz v2', () => {
    const vehicleKnownOrder = [
      'requester',
      'vehicle',
      'situation',
      'symptoms',
      'known_information',
      'contact',
      'result',
    ];
    const problemUnknownOrder = [
      'symptoms',
      'situation',
      'known_information',
      'requester',
      'vehicle',
      'contact',
      'result',
    ];
    const stepEvents = (flowType: string, steps: string[]) => steps.map((stepId) => event(
      `sessao-${flowType}`,
      'custom',
      { eventLabel: 'quiz_step_view', flowType, stepId },
    ));
    const summary = buildMarketingJourneySummary([
      ...stepEvents('vehicle_known', [...vehicleKnownOrder].reverse()),
      ...stepEvents('problem_unknown', [...problemUnknownOrder].reverse()),
    ]);

    expect(summary.quizSteps
      .filter((step) => step.flowType === 'vehicle_known')
      .map((step) => step.stepId)).toEqual(vehicleKnownOrder);
    expect(summary.quizSteps
      .filter((step) => step.flowType === 'problem_unknown')
      .map((step) => step.stepId)).toEqual(problemUnknownOrder);
    expect(summary.quizSteps.find((step) => (
      step.flowType === 'problem_unknown' && step.stepId === 'symptoms'
    ))).toMatchObject({ advancedSessions: 1, possibleDropOffSessions: 0 });
  });

  it('preserva eventos v2 de formulário, rolagem e Instagram', () => {
    const formField = event('sessao-v2', 'form_field_complete');
    const scroll = event('sessao-v2', 'scroll_depth');
    const instagram = event('sessao-v2', 'instagram_click', {
      componentId: 'footer_instagram',
      position: 'footer_social',
      destinationType: 'other',
      destinationPath: '/retificapremium',
    });

    expect(normalizeMarketingJourneyEvent(formField)?.eventName).toBe('form_field_complete');
    expect(normalizeMarketingJourneyEvent(scroll)?.eventName).toBe('scroll_depth');
    expect(normalizeMarketingJourneyEvent(instagram)?.eventName).toBe('instagram_click');

    const summary = buildMarketingJourneySummary([formField, scroll, instagram]);
    expect(summary.clicks).toMatchObject({ totalEvents: 1, uniqueSessions: 1 });
    expect(summary.clicks.groups).toContainEqual(expect.objectContaining({
      eventName: 'instagram_click',
      componentId: 'footer_instagram',
      position: 'footer_social',
      destinationPath: '/retificapremium',
    }));
  });

  it('limita dimensões agregadas de alta cardinalidade e sinaliza truncamento', () => {
    const pageEvents = Array.from({ length: 101 }, (_, index) => event(
      `sessao-pagina-${index}`,
      'page_view',
      {},
      { page_path: `/pagina-${index}` },
    ));
    const variantEvents = Array.from({ length: 51 }, (_, index) => event(
      `sessao-variante-${index}`,
      'page_view',
      { experimentId: 'experimento-limite', variantId: `variante_${index}` },
    ));
    const quizEvents = Array.from({ length: 101 }, (_, index) => event(
      `sessao-quiz-${index}`,
      'custom',
      { eventLabel: 'quiz_step_view', flowType: 'historical', stepId: `step_${index}` },
    ));

    const summary = buildMarketingJourneySummary([...pageEvents, ...variantEvents, ...quizEvents]);

    expect(summary).toMatchObject({
      quizStepsTruncated: true,
      variantsTruncated: true,
      pagesTruncated: true,
    });
    expect(summary.quizSteps).toHaveLength(100);
    expect(summary.variants).toHaveLength(50);
    expect(summary.pages).toHaveLength(100);
  });

  it('não duplica CTA externo quando o evento canônico representa o mesmo gesto', () => {
    const externalPairs = [
      ['whatsapp', 'whatsapp_click'],
      ['phone', 'phone_click'],
      ['directions', 'directions_click'],
    ] as const;
    const pairedEvents = externalPairs.flatMap(([destinationType, canonicalEvent]) => [
      event('sessao-pares', 'custom', {
        eventLabel: 'cta_click',
        componentId: `hero_${destinationType}`,
        destinationType,
      }),
      event('sessao-pares', canonicalEvent, {
        componentId: `tracked_${destinationType}`,
        destinationType,
      }, { occurred_at: '2026-08-10T12:00:00.500Z' }),
    ]);
    const internalCtas = (['estimate', 'service', 'contact'] as const).map((destinationType) => (
      event('sessao-pares', 'custom', {
        eventLabel: 'cta_click',
        componentId: `internal_${destinationType}`,
        destinationType,
      })
    ));
    const unmatchedExternalCta = event('sessao-sem-canonico', 'custom', {
      eventLabel: 'cta_click',
      componentId: 'footer_phone_fallback',
      destinationType: 'phone',
    });

    const summary = buildMarketingJourneySummary([
      ...pairedEvents,
      ...internalCtas,
      unmatchedExternalCta,
    ]);

    expect(summary.clicks).toMatchObject({ totalEvents: 7, uniqueSessions: 2 });
    expect(summary.clicks.groups.filter((group) => (
      group.eventName === 'cta_click'
      && ['whatsapp', 'phone', 'directions'].includes(group.destinationType)
    ))).toEqual([expect.objectContaining({ componentId: 'footer_phone_fallback' })]);
    expect(summary.clicks.groups.filter((group) => (
      group.eventName === 'cta_click'
      && ['estimate', 'service', 'contact'].includes(group.destinationType)
    ))).toHaveLength(3);
  });

  it('pseudonimiza a atividade recente e não devolve ids, texto livre ou click ids', async () => {
    const raw = event('sessao-secreta-123', 'form_submit', {
      componentId: 'contact_form',
      position: 'contact_page',
      freeText: 'diagnóstico particular do cliente',
    }, {
      id_marketing_site_eventos: '11111111-1111-4111-8111-111111111111',
      anonymous_id: 'anonimo-secreto-456',
      lead_code: 'RP-2026-0001',
      term: 'telefone do cliente 11999999999',
      gclid: 'click-id-secreto',
      page_path: '/contato?gclid=click-id-secreto',
      page_location: 'https://www.premiumretifica.com.br/contato?gclid=click-id-secreto',
      source: 'cliente@example.com',
      medium: 'cpc<script>',
      campaign: '11999999999',
      device_type: 'mobile',
      city: 'Ribeirão Preto',
      region: 'SP',
    });

    const [item] = await buildMarketingRecentActivityItems([raw], { tokenSalt: 'sal-secreto-do-servidor' });
    const serialized = JSON.stringify(item);

    expect(item).toMatchObject({
      eventName: 'form_submit',
      pagePath: '/contato',
      originType: 'paid',
      source: 'google',
      medium: 'cpc',
      campaign: null,
      contactState: 'intent',
      componentId: 'contact_form',
    });
    expect(item.activityId).toMatch(/^activity-[0-9a-f]{24}$/);
    expect(item.visitorToken).toMatch(/^visit-[0-9a-f]{24}$/);
    expect(serialized).not.toContain('sessao-secreta-123');
    expect(serialized).not.toContain('anonimo-secreto-456');
    expect(serialized).not.toContain('RP-2026-0001');
    expect(serialized).not.toContain('11999999999');
    expect(serialized).not.toContain('click-id-secreto');
    expect(serialized).not.toContain('diagnóstico particular');
    expect(serialized).not.toContain('cliente@example.com');
    expect(serialized).not.toContain('11999999999');
    expect(serialized).not.toContain('Ribeirão Preto');
  });

  it('não trata o lead_code técnico de page_view como pessoa identificada', async () => {
    const [item] = await buildMarketingRecentActivityItems([
      event('sessao-anonima-com-codigo', 'page_view', {}, {
        lead_code: 'RP-20260810-TECNICO',
      }),
    ], { tokenSalt: 'sal-secreto-do-servidor' });

    expect(item.contactState).toBe('anonymous');
  });

  it('mantém envio de formulário como intenção sem vínculo persistido comprovado', async () => {
    const [item] = await buildMarketingRecentActivityItems([
      event('sessao-form-sem-vinculo', 'form_submit', {}, {
        lead_code: 'RP-20260810-TECNICO',
      }),
    ], { tokenSalt: 'sal-secreto-do-servidor' });

    expect(item.contactState).toBe('intent');
  });

  it('leva somente dimensões técnicas da pergunta para a atividade recente', async () => {
    const [item] = await buildMarketingRecentActivityItems([
      event('sessao-quiz-segura', 'custom', {
        eventLabel: 'quiz_option_selected',
        flowType: 'problem_unknown',
        stepId: 'symptoms',
        optionId: 'overheating',
        fieldId: '11999999999',
        interactionAction: 'select',
        validationReason: 'required_symptoms',
        freeText: 'relato particular do cliente',
      }, { page_path: '/quanto-custa' }),
    ], { tokenSalt: 'sal-secreto-do-servidor' });

    expect(item).toMatchObject({
      eventName: 'quiz_option_selected',
      pagePath: '/quanto-custa',
      flowType: 'problem_unknown',
      stepId: 'symptoms',
      optionId: 'overheating',
      fieldId: null,
      interactionAction: 'select',
      validationReason: 'required_symptoms',
    });
    expect(JSON.stringify(item)).not.toContain('relato particular');
    expect(JSON.stringify(item)).not.toContain('11999999999');
  });

  it('redige PII acidental em caminhos e dimensões antes de montar o feed', async () => {
    const [item] = await buildMarketingRecentActivityItems([
      event('sessao-path-pii', 'custom', {
        eventLabel: 'cta_click',
        componentId: '11999999999',
        destinationType: 'contact',
        destinationPath: '/11999999999',
      }, {
        page_path: '/cliente%40example.com',
      }),
    ], { tokenSalt: 'sal-secreto-do-servidor' });
    const serialized = JSON.stringify(item);

    expect(item.pagePath).toBe('/redacted');
    expect(item.destinationPath).toBe('/redacted');
    expect(item.componentId).toBeNull();
    expect(serialized).not.toContain('cliente%40example.com');
    expect(serialized).not.toContain('11999999999');
  });

  it('não transforma rótulo livre em identificador de componente', () => {
    const summary = buildMarketingJourneySummary([
      event('sessao-label-livre', 'custom', {
        eventLabel: 'cta_click',
        interactionLabel: 'nome_arbitrario_do_visitante',
        destinationType: 'contact',
      }),
    ]);

    expect(summary.clicks.groups).toContainEqual(expect.objectContaining({
      eventName: 'cta_click',
      componentId: 'not_informed',
    }));
    expect(JSON.stringify(summary)).not.toContain('nome_arbitrario_do_visitante');
  });

  it('limita páginas a 50 e rejeita cursor adulterado', () => {
    const cursor = encodeMarketingRecentCursor({
      occurredAt: baseTime,
      eventId: '11111111-1111-4111-8111-111111111111',
    });

    expect(decodeMarketingRecentCursor(cursor)).toEqual({
      occurredAt: baseTime,
      eventId: '11111111-1111-4111-8111-111111111111',
    });
    expect(decodeMarketingRecentCursor(`${cursor}x`)).toBeNull();
    expect(parseMarketingRecentLimit(500)).toBe(50);
    expect(parseMarketingRecentLimit(0)).toBe(1);
    expect(parseMarketingRecentLimit('inválido')).toBe(50);
  });

  it('gera pseudônimo HMAC estável sem devolver o identificador de origem', async () => {
    const firstEncoder = await createMarketingOpaqueTokenEncoder('segredo-server-side');
    const secondEncoder = await createMarketingOpaqueTokenEncoder('outro-segredo');
    const first = await firstEncoder('visit', 'sessao-bruta-123');

    expect(await firstEncoder('visit', 'sessao-bruta-123')).toBe(first);
    expect(await secondEncoder('visit', 'sessao-bruta-123')).not.toBe(first);
    expect(first).toMatch(/^visit-[0-9a-f]{24}$/);
    expect(first).not.toContain('sessao-bruta-123');
  });

  it('serializa sessões privadas sem PII residual e limita listas internas', async () => {
    const encodeToken = await createMarketingOpaqueTokenEncoder('segredo-server-side');
    const pages = Array.from({ length: 101 }, (_, index) => ({
      path: index === 0 ? '/cliente%40example.com' : `/pagina-${index}`,
      url: `https://www.premiumretifica.com.br/pagina-${index}?gclid=segredo`,
      title: index === 0 ? 'Cliente cliente@example.com' : `Página ${index}`,
      occurredAt: baseTime,
    }));
    const actions = Array.from({ length: 101 }, (_, index) => ({
      type: 'custom',
      occurredAt: baseTime,
      pagePath: index === 0 ? '/11999999999' : `/pagina-${index}`,
      detail: index === 0 ? '11999999999' : 'cta_click',
    }));
    const safe = await sanitizeMarketingVisitorSessionPayload({
      visitorId: 'sessao-bruta-123',
      originType: 'paid',
      source: 'cliente@example.com',
      medium: 'cpc<script>',
      campaign: '11999999999',
      landingPage: '/cliente%40example.com',
      lastPage: '/11999999999',
      searchTerm: 'telefone 11999999999',
      leadName: 'Nome particular',
      pages,
      actions,
    }, encodeToken);
    const serialized = JSON.stringify(safe);

    expect(safe).toMatchObject({
      visitorId: expect.stringMatching(/^visit-[0-9a-f]{24}$/),
      source: 'google',
      medium: 'cpc',
      campaign: null,
      landingPage: '/redacted',
      lastPage: '/redacted',
      pagesTruncated: true,
      actionsTruncated: true,
    });
    expect(safe.pages).toHaveLength(100);
    expect(safe.actions).toHaveLength(100);
    expect(serialized).not.toContain('sessao-bruta-123');
    expect(serialized).not.toContain('cliente@example.com');
    expect(serialized).not.toContain('11999999999');
    expect(serialized).not.toContain('Nome particular');
    expect(serialized).not.toContain('gclid=segredo');
  });
});
