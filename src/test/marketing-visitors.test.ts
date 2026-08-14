import { describe, expect, it } from 'vitest';
import {
  buildMarketingVisitorSessions,
  getMarketingVisitorKey,
} from '../../supabase/functions/_shared/marketing-visitors';

describe('sessões individuais de marketing', () => {
  it('usa a mesma chave no agrupamento detalhado e no total agregado', () => {
    expect(getMarketingVisitorKey({ session_id: 'sessao-1', anonymous_id: 'anonimo-1' })).toBe('sessao-1');
    expect(getMarketingVisitorKey({ anonymous_id: 'anonimo-1', lead_code: 'LEAD-1' })).toBe('anonimo-1');
    expect(getMarketingVisitorKey({ lead_code: 'LEAD-1' })).toBe('LEAD-1');
    expect(getMarketingVisitorKey({ id_marketing_site_eventos: 42 })).toBe('42');
  });

  it('ordena os eventos por horário e preserva a atribuição mais específica da sessão', () => {
    const sessions = buildMarketingVisitorSessions([
      {
        session_id: 'sessao-ordenacao-1',
        occurred_at: '2026-08-03T10:05:00.000Z',
        page_path: '/orcamento',
        page_location: 'https://www.premiumretifica.com.br/orcamento?gclid=segredo#formulario',
        event_type: 'whatsapp_click',
        source: 'google',
        medium: 'cpc',
        campaign: 'Pesquisa regional',
        term: 'retífica de cabeçote',
        gclid: 'identificador-presente',
        lead_code: 'LEAD-1',
        metadata: { measurementMode: 'consented' },
      },
      {
        session_id: 'sessao-ordenacao-1',
        occurred_at: '2026-08-03T10:00:00.000Z',
        page_path: '/',
        page_location: 'https://premiumretifica.com.br/?gclid=nao-expor',
        event_type: 'page_view',
        source: 'direto',
        medium: 'sem meio',
        metadata: { measurementMode: 'anonymous' },
      },
      {
        session_id: 'sessao-ordenacao-1',
        occurred_at: '2026-08-03T10:02:00.000Z',
        page_path: '/servicos',
        page_location: 'https://www.premiumretifica.com.br/servicos?utm_term=cabecote',
        event_type: 'page_view',
        source: 'google',
        medium: 'organic',
      },
    ], [
      {
        lead_code: 'LEAD-1',
        nome: 'Cliente identificado',
        telefone: 'telefone-mascarado',
        fk_clientes: 'cliente-1',
      },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      firstSeenAt: '2026-08-03T10:00:00.000Z',
      lastSeenAt: '2026-08-03T10:05:00.000Z',
      durationSeconds: 300,
      durationSource: 'event_interval',
      landingPage: '/',
      lastPage: '/orcamento',
      landingUrl: 'https://www.premiumretifica.com.br/',
      lastUrl: 'https://www.premiumretifica.com.br/orcamento',
      source: 'google',
      medium: 'cpc',
      campaign: 'Pesquisa regional',
      searchTerm: 'retífica de cabeçote',
      clickIdType: 'gclid',
      originType: 'paid',
      eventCount: 3,
      actionCount: 1,
      pageViewCount: 2,
      activityCount: 1,
      measurementMode: 'mixed',
      leadCode: 'LEAD-1',
      leadName: 'Cliente identificado',
      convertedClient: true,
      clientId: 'cliente-1',
    });
    expect(sessions[0].pages.map((page) => page.path)).toEqual(['/', '/servicos']);
    expect(sessions[0].pages.map((page) => page.url)).toEqual([
      'https://www.premiumretifica.com.br/',
      'https://www.premiumretifica.com.br/servicos',
    ]);
    expect(JSON.stringify(sessions[0])).not.toContain('gclid=');
    expect(JSON.stringify(sessions[0])).not.toContain('utm_term=');
    expect(sessions[0].actions).toEqual([expect.objectContaining({
      type: 'whatsapp_click',
      pagePath: '/orcamento',
    })]);
    expect(sessions[0].engagementLevel).toBe('converted');
  });

  it('não reaproveita termo de uma origem antiga quando a sessão passa a ser paga', () => {
    const [session] = buildMarketingVisitorSessions([
      {
        session_id: 'sessao-termo-origem',
        occurred_at: '2026-08-03T09:00:00.000Z',
        event_type: 'page_view',
        source: 'bing',
        medium: 'organic',
        term: 'termo orgânico antigo',
      },
      {
        session_id: 'sessao-termo-origem',
        occurred_at: '2026-08-03T09:03:00.000Z',
        event_type: 'page_view',
        source: 'google',
        medium: 'cpc',
        campaign: 'Pesquisa paga',
        gclid: 'clique-pago',
      },
    ], []);

    expect(session).toMatchObject({
      originType: 'paid',
      source: 'google',
      searchTerm: null,
    });
  });

  it('rotula acesso sem atribuição como direto/outros e não inventa duração', () => {
    const [session] = buildMarketingVisitorSessions([
      {
        anonymous_id: 'anonimo-direto-1',
        occurred_at: '2026-08-03T11:00:00.000Z',
        page_path: '/contato',
        event_type: 'page_view',
      },
    ], []);

    expect(session).toMatchObject({
      originType: 'other',
      source: 'direto',
      medium: 'sem meio',
      durationSeconds: 0,
      eventCount: 1,
      actionCount: 0,
      engagementLevel: 'unknown',
    });
  });

  it('usa tempo ativo e só classifica saída rápida quando existe medição de engajamento', () => {
    const [session] = buildMarketingVisitorSessions([
      {
        session_id: 'sessao-tempo-ativo',
        occurred_at: '2026-08-03T11:00:00.000Z',
        page_path: '/',
        event_type: 'page_view',
      },
      {
        session_id: 'sessao-tempo-ativo',
        occurred_at: '2026-08-03T11:00:45.000Z',
        page_path: '/',
        event_type: 'custom',
        metadata: { eventLabel: 'session_engagement', engagedSeconds: 7 },
      },
    ], []);

    expect(session).toMatchObject({
      durationSeconds: 7,
      durationSource: 'active',
      eventCount: 1,
      activityCount: 0,
      engagementLevel: 'brief',
    });
    expect(session.actions).toEqual([]);
  });

  it('preserva a sequência técnica da estimativa sem copiar o conteúdo digitado', () => {
    const [session] = buildMarketingVisitorSessions([
      {
        session_id: 'sessao-estimativa-1',
        occurred_at: '2026-08-03T11:00:00.000Z',
        page_path: '/quanto-custa',
        event_type: 'page_view',
      },
      {
        session_id: 'sessao-estimativa-1',
        occurred_at: '2026-08-03T11:00:02.000Z',
        page_path: '/quanto-custa',
        event_type: 'custom',
        metadata: {
          eventLabel: 'quiz_option_selected',
          flowType: 'problem_unknown',
          stepId: 'symptoms',
          optionId: 'overheating',
          interactionAction: 'select',
          freeText: 'não deve aparecer no painel',
        },
      },
      {
        session_id: 'sessao-estimativa-1',
        occurred_at: '2026-08-03T11:00:03.000Z',
        page_path: '/quanto-custa',
        event_type: 'custom',
        metadata: {
          eventLabel: 'quiz_field_interaction',
          stepId: 'vehicle',
          fieldId: 'vehicle_make',
        },
      },
    ], []);

    expect(session.actions).toEqual([
      expect.objectContaining({
        eventName: 'quiz_option_selected',
        flowType: 'problem_unknown',
        stepId: 'symptoms',
        optionId: 'overheating',
        interactionAction: 'select',
      }),
      expect.objectContaining({
        eventName: 'quiz_field_interaction',
        stepId: 'vehicle',
        fieldId: 'vehicle_make',
      }),
    ]);
    expect(JSON.stringify(session.actions)).not.toContain('não deve aparecer');
  });

  it('mapeia os modos de consentimento v2 para a visão legada de sessões', () => {
    for (const measurementMode of ['analytics', 'advertising', 'analytics_and_advertising']) {
      const [session] = buildMarketingVisitorSessions([
        {
          session_id: `sessao-${measurementMode}`,
          occurred_at: '2026-08-03T11:00:00.000Z',
          page_path: '/',
          event_type: 'page_view',
          metadata: { measurementMode },
        },
      ], []);

      expect(session.measurementMode).toBe('consented');
    }
  });

  it('mantém a visão paga sem orgânico e remove eventos técnicos', () => {
    const sessions = buildMarketingVisitorSessions([
      {
        session_id: 'pago-real',
        occurred_at: '2026-08-03T12:00:00.000Z',
        source: 'google',
        medium: 'cpc',
        gclid: 'clique-real',
      },
      {
        session_id: 'organico',
        occurred_at: '2026-08-03T12:01:00.000Z',
        source: 'google',
        medium: 'organic',
      },
      {
        session_id: 'teste-tecnico',
        occurred_at: '2026-08-03T12:02:00.000Z',
        source: 'google',
        medium: 'cpc',
        campaign: 'retifica_teste_pre_lancamento',
      },
    ], [], { onlyPaid: true });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ originType: 'paid', source: 'google' });
  });

  it('separa a origem desta sessão da atribuição antiga preservada para o contato', () => {
    const [session] = buildMarketingVisitorSessions([
      {
        session_id: 'retorno-direto',
        occurred_at: '2026-08-03T13:00:00.000Z',
        event_type: 'page_view',
        source: 'google',
        medium: 'cpc',
        gclid: 'clique-anterior',
        metadata: { sessionOriginType: 'other' },
      },
    ], []);

    expect(session.originType).toBe('other');

    const [paidAttribution] = buildMarketingVisitorSessions([
      {
        session_id: 'retorno-direto',
        occurred_at: '2026-08-03T13:00:00.000Z',
        event_type: 'page_view',
        source: 'google',
        medium: 'cpc',
        gclid: 'clique-anterior',
        metadata: { sessionOriginType: 'other' },
      },
    ], [], { onlyPaid: true });
    expect(paidAttribution.originType).toBe('paid');
  });
});
