import { describe, expect, it } from 'vitest';
import { buildMarketingVisitorSessions } from '../../supabase/functions/_shared/marketing-visitors';

describe('sessões individuais de marketing', () => {
  it('ordena os eventos por horário e preserva a atribuição mais específica da sessão', () => {
    const sessions = buildMarketingVisitorSessions([
      {
        session_id: 'sessao-ordenacao-1',
        occurred_at: '2026-08-03T10:05:00.000Z',
        page_path: '/orcamento',
        event_type: 'whatsapp_click',
        source: 'google',
        medium: 'cpc',
        campaign: 'Pesquisa regional',
        gclid: 'identificador-presente',
        lead_code: 'LEAD-1',
      },
      {
        session_id: 'sessao-ordenacao-1',
        occurred_at: '2026-08-03T10:00:00.000Z',
        page_path: '/',
        event_type: 'page_view',
        source: 'direto',
        medium: 'sem meio',
      },
      {
        session_id: 'sessao-ordenacao-1',
        occurred_at: '2026-08-03T10:02:00.000Z',
        page_path: '/servicos',
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
      landingPage: '/',
      lastPage: '/orcamento',
      source: 'google',
      medium: 'cpc',
      campaign: 'Pesquisa regional',
      clickIdType: 'gclid',
      originType: 'paid',
      eventCount: 3,
      actionCount: 1,
      leadCode: 'LEAD-1',
      leadName: 'Cliente identificado',
      convertedClient: true,
      clientId: 'cliente-1',
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
    });
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
});
