import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, createServiceClient, getTestEnv } from './helpers/client';
import { deleteTestUser, ensureTestUser, TEST_PREFIX } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();
if (!envStatus.configured) warnIntegrationSkipped('support-impersonation-scope.test');
const mutatingTestOptIn = process.env.RUN_SUPPORT_SCOPE_INTEGRATION === 'true';
const canRunMutatingTest = envStatus.configured && mutatingTestOptIn;
if (envStatus.configured && !mutatingTestOptIn) {
  console.warn(
    '[support-impersonation-scope.test] Teste mutável pulado. ' +
      'Defina RUN_SUPPORT_SCOPE_INTEGRATION=true somente para uma execução coordenada.',
  );
}

const RUN_ID = Date.now();
const ACTOR_EMAIL = `support-scope-actor-${RUN_ID}@retifica.test`;
const ALLOWED_TARGET_EMAIL = `support-scope-allowed-${RUN_ID}@retifica.test`;
const DENIED_TARGET_EMAIL = `support-scope-denied-${RUN_ID}@retifica.test`;
const PASSWORD = `SupportScope@${RUN_ID}!`;
const SUPPORT_REASON = 'Teste de integração do escopo restrito de suporte.';
const SUPPORT_CLIENT_NAME = `${TEST_PREFIX} Cliente suporte ${RUN_ID}`;
const SUPPORT_CLIENT_OBSERVATION = `${TEST_PREFIX} support-scope-client-${RUN_ID}`;
const SUPPORT_CLIENT_DOCUMENT = String(RUN_ID).slice(-11).padStart(11, '0');
const OAUTH_STATE = `${TEST_PREFIX}-support-oauth-state-${RUN_ID}`;
const OAUTH_CONNECTION_EMAIL = `support-oauth-${RUN_ID}@retifica.test`;
const OAUTH_TOKEN_CIPHER = `${TEST_PREFIX}-cipher-${RUN_ID}`;

type SupportUser = {
  id: string;
  email: string;
};

type SupportSession = {
  id: string;
  actorUser: SupportUser;
  targetUser: SupportUser;
  reason: string;
  startedAt: string;
  expiresAt: string | null;
};

type AdminUsersPayload = {
  error?: string;
  mensagem?: string;
  supportTargetUserIds?: string[];
  supportSession?: SupportSession | null;
};

type ClientSupportEnvelope = {
  status: number;
  code?: string;
  mensagem?: string;
  total?: number;
  dados?: Array<{
    id_clientes: string;
    nome: string;
    documento: string;
  }>;
};

async function signIn(email: string) {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(`[support-scope] Login falhou: ${error?.message ?? 'sem sessão'}`);
  }

  return {
    client,
    accessToken: data.session.access_token,
  };
}

async function getInternalUserId(email: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .eq('email', email)
    .maybeSingle();

  if (error || !data?.id_usuarios) {
    throw new Error(
      `[support-scope] Usuário interno não encontrado: ${error?.message ?? email}`,
    );
  }

  return data.id_usuarios as string;
}

async function configureInternalUser(
  email: string,
  acesso: 'financeiro' | 'administrador',
  adminModule: boolean,
) {
  const service = createServiceClient();
  const userId = await getInternalUserId(email);

  const { error: userError } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .update({
      nome: `${TEST_PREFIX} ${email.split('@')[0]}`,
      acesso,
      status: true,
    })
    .eq('id_usuarios', userId);

  if (userError) {
    throw new Error(`[support-scope] Falha ao configurar usuário: ${userError.message}`);
  }

  const { error: moduleError } = await service
    .schema('RetificaPremium')
    .from('Modulos')
    .upsert({
      fk_usuarios: userId,
      dashboard: true,
      clientes: true,
      notas_de_entrada: true,
      kanban: true,
      fechamento: true,
      nota_fiscal: false,
      configuracoes: acesso === 'administrador',
      contas_a_pagar: true,
      marketing: false,
      admin: adminModule,
    }, { onConflict: 'fk_usuarios' });

  if (moduleError) {
    throw new Error(`[support-scope] Falha ao configurar módulos: ${moduleError.message}`);
  }

  return userId;
}

async function invokeAdminUsers(
  accessToken: string,
  body: Record<string, unknown>,
) {
  const { url, anonKey } = getTestEnv();
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as AdminUsersPayload;

  return { response, payload };
}

async function insertScopedGrant(actorUserId: string, targetUserId: string) {
  const service = createServiceClient();
  const { error } = await service
    .schema('RetificaPremium')
    .from('Permissoes_Suporte')
    .insert({
      fk_actor_usuarios: actorUserId,
      fk_target_usuarios: targetUserId,
      escopo_global: false,
      ativo: true,
      motivo: 'Permissão criada pelo teste de integração de suporte.',
      revoked_at: null,
    });

  if (error) {
    throw new Error(`[support-scope] Falha ao criar permissão: ${error.message}`);
  }
}

async function collectTestUserIds() {
  const service = createServiceClient();
  const { data, error } = await service
    .schema('RetificaPremium')
    .from('Usuarios')
    .select('id_usuarios')
    .in('email', [ACTOR_EMAIL, ALLOWED_TARGET_EMAIL, DENIED_TARGET_EMAIL]);

  if (error) {
    throw new Error(`[support-scope] Falha ao localizar usuários para cleanup: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id_usuarios as string);
}

async function cleanupTestData() {
  const service = createServiceClient();
  const cleanupErrors: string[] = [];
  let userIds: string[] = [];

  try {
    userIds = await collectTestUserIds();
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error.message : String(error));
  }

  const { error: oauthStateError } = await service
    .schema('RetificaPremium')
    .from('Gmail_OAuth_States')
    .delete()
    .eq('state', OAUTH_STATE);
  if (oauthStateError) cleanupErrors.push(oauthStateError.message);

  const { error: gmailConnectionError } = await service
    .schema('RetificaPremium')
    .from('Gmail_Connections')
    .delete()
    .eq('email', OAUTH_CONNECTION_EMAIL);
  if (gmailConnectionError) cleanupErrors.push(gmailConnectionError.message);

  if (userIds.length > 0) {
    const { error: actorLogError } = await service
      .schema('RetificaPremium')
      .from('Logs_Acoes_Suporte')
      .delete()
      .in('fk_actor_usuarios', userIds);
    if (actorLogError) cleanupErrors.push(actorLogError.message);

    const { error: targetLogError } = await service
      .schema('RetificaPremium')
      .from('Logs_Acoes_Suporte')
      .delete()
      .in('fk_target_usuarios', userIds);
    if (targetLogError) cleanupErrors.push(targetLogError.message);

    const { error: clientError } = await service
      .schema('RetificaPremium')
      .from('Clientes')
      .delete()
      .in('fk_criado_por', userIds)
      .eq('observacao', SUPPORT_CLIENT_OBSERVATION);
    if (clientError) cleanupErrors.push(clientError.message);

    const { error: sessionActorError } = await service
      .schema('RetificaPremium')
      .from('Sessoes_Suporte')
      .delete()
      .in('fk_actor_usuarios', userIds);
    if (sessionActorError) cleanupErrors.push(sessionActorError.message);

    const { error: sessionTargetError } = await service
      .schema('RetificaPremium')
      .from('Sessoes_Suporte')
      .delete()
      .in('fk_target_usuarios', userIds);
    if (sessionTargetError) cleanupErrors.push(sessionTargetError.message);

    const { error: actorGrantError } = await service
      .schema('RetificaPremium')
      .from('Permissoes_Suporte')
      .delete()
      .in('fk_actor_usuarios', userIds);
    if (actorGrantError) cleanupErrors.push(actorGrantError.message);

    const { error: targetGrantError } = await service
      .schema('RetificaPremium')
      .from('Permissoes_Suporte')
      .delete()
      .in('fk_target_usuarios', userIds);
    if (targetGrantError) cleanupErrors.push(targetGrantError.message);
  }

  for (const email of [ACTOR_EMAIL, ALLOWED_TARGET_EMAIL, DENIED_TARGET_EMAIL]) {
    try {
      await deleteTestUser(email);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(
      `[support-scope] Cleanup incompleto: ${Array.from(new Set(cleanupErrors)).join(' | ')}`,
    );
  }
}

describe.skipIf(!canRunMutatingTest)(
  'Support impersonation — operador fica restrito aos alvos explicitamente autorizados',
  () => {
    let actorUserId = '';
    let allowedTargetUserId = '';
    let allowedTargetAuthId = '';
    let deniedTargetUserId = '';
    let actorClient: SupabaseClient | null = null;

    beforeAll(async () => {
      await ensureTestUser(ACTOR_EMAIL, PASSWORD);
      allowedTargetAuthId = await ensureTestUser(ALLOWED_TARGET_EMAIL, PASSWORD);
      await ensureTestUser(DENIED_TARGET_EMAIL, PASSWORD);

      actorUserId = await configureInternalUser(ACTOR_EMAIL, 'administrador', true);
      allowedTargetUserId = await configureInternalUser(
        ALLOWED_TARGET_EMAIL,
        'financeiro',
        false,
      );
      deniedTargetUserId = await configureInternalUser(
        DENIED_TARGET_EMAIL,
        'financeiro',
        false,
      );

      await insertScopedGrant(actorUserId, allowedTargetUserId);
    });

    afterAll(async () => {
      await actorClient?.auth.signOut();
      await cleanupTestData();
    });

    it('mantém a allowlist e os helpers de autorização inacessíveis ao operador', async () => {
      const signedIn = await signIn(ACTOR_EMAIL);
      actorClient = signedIn.client;

      const { error: tableError } = await actorClient
        .schema('RetificaPremium')
        .from('Permissoes_Suporte')
        .select('id_permissao_suporte')
        .limit(1);

      expect(tableError).not.toBeNull();

      const { error: helperError } = await actorClient
        .schema('RetificaPremium')
        .rpc('pode_acessar_suporte', {
          p_actor_usuario_id: actorUserId,
          p_target_usuario_id: allowedTargetUserId,
        });

      expect(helperError).not.toBeNull();
    });

    it('lista somente o alvo permitido e controla todo o ciclo da sessão', async () => {
      const signedIn = await signIn(ACTOR_EMAIL);
      actorClient = signedIn.client;

      const service = createServiceClient();
      const { data: allowedByRpc, error: allowedRpcError } = await service
        .schema('RetificaPremium')
        .rpc('pode_acessar_suporte', {
          p_actor_usuario_id: actorUserId,
          p_target_usuario_id: allowedTargetUserId,
        });
      expect(allowedRpcError).toBeNull();
      expect(allowedByRpc).toBe(true);

      const { data: deniedByRpc, error: deniedRpcError } = await service
        .schema('RetificaPremium')
        .rpc('pode_acessar_suporte', {
          p_actor_usuario_id: actorUserId,
          p_target_usuario_id: deniedTargetUserId,
        });
      expect(deniedRpcError).toBeNull();
      expect(deniedByRpc).toBe(false);

      const targetsResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'get_support_targets',
      });
      expect(targetsResult.response.status).toBe(200);
      expect(targetsResult.payload.supportTargetUserIds).toEqual([allowedTargetUserId]);

      const startResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'start_support_impersonation',
        targetUserId: allowedTargetUserId,
        reason: SUPPORT_REASON,
      });
      expect(startResult.response.status).toBe(200);
      expect(startResult.payload.supportSession).toMatchObject({
        actorUser: { id: actorUserId, email: ACTOR_EMAIL },
        targetUser: { id: allowedTargetUserId, email: ALLOWED_TARGET_EMAIL },
        reason: SUPPORT_REASON,
      });

      const sessionId = startResult.payload.supportSession?.id;
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const deniedStartResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'start_support_impersonation',
        targetUserId: deniedTargetUserId,
        reason: SUPPORT_REASON,
      });
      expect(deniedStartResult.response.status).toBe(400);
      expect(deniedStartResult.payload.error).toMatch(/não possui permissão de suporte/i);

      const validateResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'validate_support_impersonation',
        sessionId,
        targetUserId: allowedTargetUserId,
      });
      expect(validateResult.response.status).toBe(200);
      expect(validateResult.payload.supportSession).toMatchObject({
        id: sessionId,
        actorUser: { id: actorUserId },
        targetUser: { id: allowedTargetUserId },
      });

      const endResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'end_support_impersonation',
        sessionId,
      });
      expect(endResult.response.status).toBe(200);

      const { data: endedSession, error: endedSessionError } = await service
        .schema('RetificaPremium')
        .from('Sessoes_Suporte')
        .select('ended_at')
        .eq('id_sessao_suporte', sessionId)
        .maybeSingle();
      expect(endedSessionError).toBeNull();
      expect(endedSession?.ended_at).toBeTruthy();

      const validateEndedResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'validate_support_impersonation',
        sessionId,
        targetUserId: allowedTargetUserId,
      });
      expect(validateEndedResult.response.status).toBe(200);
      expect(validateEndedResult.payload.supportSession).toBeNull();
    });

    it('lê dados operacionais somente com a sessão ativa e o alvo exato', async () => {
      const signedIn = await signIn(ACTOR_EMAIL);
      actorClient = signedIn.client;
      const service = createServiceClient();
      let clientId: string | null = null;
      let sessionId: string | null = null;

      try {
        const { data: seededClient, error: seedClientError } = await service
          .schema('RetificaPremium')
          .from('Clientes')
          .insert({
            nome: SUPPORT_CLIENT_NAME,
            documento: SUPPORT_CLIENT_DOCUMENT,
            tipo_documento: 'CPF',
            status: true,
            observacao: SUPPORT_CLIENT_OBSERVATION,
            fk_criado_por: allowedTargetUserId,
          })
          .select('id_clientes')
          .single();
        expect(seedClientError).toBeNull();
        expect(seededClient?.id_clientes).toBeTruthy();
        clientId = seededClient?.id_clientes ?? null;

        const startResult = await invokeAdminUsers(signedIn.accessToken, {
          action: 'start_support_impersonation',
          targetUserId: allowedTargetUserId,
          reason: `${SUPPORT_REASON} leitura operacional`,
        });
        expect(startResult.response.status).toBe(200);
        sessionId = startResult.payload.supportSession?.id ?? null;
        expect(sessionId).toBeTruthy();
        if (!sessionId || !clientId) {
          throw new Error('[support-scope] Cliente ou sessão não foi criado para a leitura.');
        }

        const { data: allowedRead, error: allowedReadError } = await actorClient
          .schema('RetificaPremium')
          .rpc('get_clientes_contexto_suporte', {
            p_busca: SUPPORT_CLIENT_NAME,
            p_status: true,
            p_limite: 10,
            p_offset: 0,
            p_contexto_usuario_id: allowedTargetUserId,
            p_sessao_suporte: sessionId,
          });
        expect(allowedReadError).toBeNull();
        const allowedEnvelope = allowedRead as ClientSupportEnvelope;
        expect(allowedEnvelope.status).toBe(200);
        expect(allowedEnvelope.total).toBe(1);
        expect(allowedEnvelope.dados).toEqual([
          expect.objectContaining({
            id_clientes: clientId,
            nome: SUPPORT_CLIENT_NAME,
            documento: SUPPORT_CLIENT_DOCUMENT,
          }),
        ]);

        const { data: wrongTargetRead, error: wrongTargetReadError } = await actorClient
          .schema('RetificaPremium')
          .rpc('get_clientes_contexto_suporte', {
            p_busca: SUPPORT_CLIENT_NAME,
            p_status: true,
            p_limite: 10,
            p_offset: 0,
            p_contexto_usuario_id: deniedTargetUserId,
            p_sessao_suporte: sessionId,
          });
        expect(wrongTargetReadError).toBeNull();
        expect(wrongTargetRead).toMatchObject({
          status: 403,
          code: 'forbidden',
        });

        const endResult = await invokeAdminUsers(signedIn.accessToken, {
          action: 'end_support_impersonation',
          sessionId,
        });
        expect(endResult.response.status).toBe(200);

        const { data: endedRead, error: endedReadError } = await actorClient
          .schema('RetificaPremium')
          .rpc('get_clientes_contexto_suporte', {
            p_busca: SUPPORT_CLIENT_NAME,
            p_status: true,
            p_limite: 10,
            p_offset: 0,
            p_contexto_usuario_id: allowedTargetUserId,
            p_sessao_suporte: sessionId,
          });
        expect(endedReadError).toBeNull();
        expect(endedRead).toMatchObject({
          status: 403,
          code: 'forbidden',
        });
      } finally {
        if (sessionId) {
          const { error: closeSessionError } = await service
            .schema('RetificaPremium')
            .from('Sessoes_Suporte')
            .update({ ended_at: new Date().toISOString() })
            .eq('id_sessao_suporte', sessionId)
            .is('ended_at', null);
          expect(closeSessionError).toBeNull();
        }

        if (clientId) {
          const { error: deleteClientError } = await service
            .schema('RetificaPremium')
            .from('Clientes')
            .delete()
            .eq('id_clientes', clientId);
          expect(deleteClientError).toBeNull();
        }
      }
    });

    it('não persiste conexão Gmail quando o suporte é revogado após iniciar o OAuth', async () => {
      const signedIn = await signIn(ACTOR_EMAIL);
      actorClient = signedIn.client;
      const service = createServiceClient();
      let sessionId: string | null = null;
      let oauthStateId: string | null = null;

      try {
        const { data: existingConnections, error: existingConnectionError } = await service
          .schema('RetificaPremium')
          .from('Gmail_Connections')
          .select('id_gmail_connections')
          .eq('fk_auth_user', allowedTargetAuthId)
          .eq('email', OAUTH_CONNECTION_EMAIL);
        expect(existingConnectionError).toBeNull();
        expect(existingConnections).toHaveLength(0);

        const startResult = await invokeAdminUsers(signedIn.accessToken, {
          action: 'start_support_impersonation',
          targetUserId: allowedTargetUserId,
          reason: `${SUPPORT_REASON} OAuth Gmail`,
        });
        expect(startResult.response.status).toBe(200);
        sessionId = startResult.payload.supportSession?.id ?? null;
        expect(sessionId).toBeTruthy();
        if (!sessionId) {
          throw new Error('[support-scope] Sessão não criada para o fluxo OAuth.');
        }

        const { data: createdStateId, error: createStateError } = await service
          .schema('RetificaPremium')
          .rpc('criar_estado_oauth_suporte', {
            p_actor_usuario_id: actorUserId,
            p_target_usuario_id: allowedTargetUserId,
            p_sessao_suporte: sessionId,
            p_state: OAUTH_STATE,
            p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          });
        expect(createStateError).toBeNull();
        expect(createdStateId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        oauthStateId = typeof createdStateId === 'string' ? createdStateId : null;
        if (!oauthStateId) {
          throw new Error('[support-scope] Estado OAuth de teste não foi criado.');
        }

        // Simula o claim atômico feito pelo callback antes da troca/persistência
        // do token. A revogação ocorre depois do início, mas antes do save final.
        const { data: claimedState, error: claimStateError } = await service
          .schema('RetificaPremium')
          .from('Gmail_OAuth_States')
          .update({ used_at: new Date().toISOString() })
          .eq('id_gmail_oauth_states', oauthStateId)
          .is('used_at', null)
          .select('id_gmail_oauth_states')
          .single();
        expect(claimStateError).toBeNull();
        expect(claimedState?.id_gmail_oauth_states).toBe(oauthStateId);

        const { error: revokeError } = await service
          .schema('RetificaPremium')
          .from('Permissoes_Suporte')
          .update({ ativo: false, revoked_at: new Date().toISOString() })
          .eq('fk_actor_usuarios', actorUserId)
          .eq('fk_target_usuarios', allowedTargetUserId);
        expect(revokeError).toBeNull();

        const { data: connectionId, error: saveConnectionError } = await service
          .schema('RetificaPremium')
          .rpc('salvar_conexao_gmail_suporte', {
            p_oauth_state_id: oauthStateId,
            p_email: OAUTH_CONNECTION_EMAIL,
            p_refresh_token_cipher: OAUTH_TOKEN_CIPHER,
          });
        expect(connectionId).toBeNull();
        expect(saveConnectionError).not.toBeNull();
        expect(saveConnectionError?.code).toBe('P0403');
        expect(saveConnectionError?.message).toMatch(/sessão de suporte inválida ou encerrada/i);

        const { data: connectionsAfterRevoke, error: connectionLookupError } = await service
          .schema('RetificaPremium')
          .from('Gmail_Connections')
          .select('id_gmail_connections')
          .eq('fk_auth_user', allowedTargetAuthId)
          .eq('email', OAUTH_CONNECTION_EMAIL);
        expect(connectionLookupError).toBeNull();
        expect(connectionsAfterRevoke).toHaveLength(0);
      } finally {
        const cleanupErrors: string[] = [];

        const { error: connectionCleanupError } = await service
          .schema('RetificaPremium')
          .from('Gmail_Connections')
          .delete()
          .eq('fk_auth_user', allowedTargetAuthId)
          .eq('email', OAUTH_CONNECTION_EMAIL);
        if (connectionCleanupError) cleanupErrors.push(connectionCleanupError.message);

        const { error: stateCleanupError } = await service
          .schema('RetificaPremium')
          .from('Gmail_OAuth_States')
          .delete()
          .eq('state', OAUTH_STATE);
        if (stateCleanupError) cleanupErrors.push(stateCleanupError.message);

        if (sessionId) {
          const { error: closeSessionError } = await service
            .schema('RetificaPremium')
            .from('Sessoes_Suporte')
            .update({ ended_at: new Date().toISOString() })
            .eq('id_sessao_suporte', sessionId)
            .is('ended_at', null);
          if (closeSessionError) cleanupErrors.push(closeSessionError.message);
        }

        const { error: restoreGrantError } = await service
          .schema('RetificaPremium')
          .from('Permissoes_Suporte')
          .update({ ativo: true, revoked_at: null })
          .eq('fk_actor_usuarios', actorUserId)
          .eq('fk_target_usuarios', allowedTargetUserId);
        if (restoreGrantError) cleanupErrors.push(restoreGrantError.message);

        expect(cleanupErrors, 'Cleanup OAuth incompleto').toEqual([]);
      }
    });

    it('mantém exatamente uma sessão aberta mesmo com dois inícios concorrentes', async () => {
      const signedIn = await signIn(ACTOR_EMAIL);
      actorClient = signedIn.client;

      const [first, second] = await Promise.all([
        invokeAdminUsers(signedIn.accessToken, {
          action: 'start_support_impersonation',
          targetUserId: allowedTargetUserId,
          reason: `${SUPPORT_REASON} tentativa A`,
        }),
        invokeAdminUsers(signedIn.accessToken, {
          action: 'start_support_impersonation',
          targetUserId: allowedTargetUserId,
          reason: `${SUPPORT_REASON} tentativa B`,
        }),
      ]);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      const firstSessionId = first.payload.supportSession?.id;
      const secondSessionId = second.payload.supportSession?.id;
      expect(firstSessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(secondSessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(firstSessionId).not.toBe(secondSessionId);
      if (!firstSessionId || !secondSessionId) {
        throw new Error('[support-scope] Inícios concorrentes não retornaram duas sessões.');
      }
      const returnedSessionIds = [firstSessionId, secondSessionId];

      const service = createServiceClient();
      const { data: openSessions, error } = await service
        .schema('RetificaPremium')
        .from('Sessoes_Suporte')
        .select('id_sessao_suporte')
        .eq('fk_actor_usuarios', actorUserId)
        .is('ended_at', null);
      expect(error).toBeNull();
      expect(openSessions).toHaveLength(1);
      expect(returnedSessionIds).toContain(openSessions?.[0].id_sessao_suporte);

      const { data: attemptSessions, error: attemptSessionsError } = await service
        .schema('RetificaPremium')
        .from('Sessoes_Suporte')
        .select('id_sessao_suporte,ended_at')
        .in('id_sessao_suporte', returnedSessionIds);
      expect(attemptSessionsError).toBeNull();
      expect(attemptSessions).toHaveLength(2);
      expect(attemptSessions?.filter((session) => session.ended_at === null)).toHaveLength(1);
      expect(attemptSessions?.filter((session) => Boolean(session.ended_at))).toHaveLength(1);

      const endResult = await invokeAdminUsers(signedIn.accessToken, {
        action: 'end_support_impersonation',
        sessionId: openSessions![0].id_sessao_suporte,
      });
      expect(endResult.response.status).toBe(200);
    });

    it('encerra definitivamente a sessão quando permissão, alvo ou módulo Admin são revogados', async () => {
      const signedIn = await signIn(ACTOR_EMAIL);
      actorClient = signedIn.client;
      const service = createServiceClient();

      const startSession = async () => {
        const result = await invokeAdminUsers(signedIn.accessToken, {
          action: 'start_support_impersonation',
          targetUserId: allowedTargetUserId,
          reason: SUPPORT_REASON,
        });
        expect(result.response.status).toBe(200);
        expect(result.payload.supportSession?.id).toBeTruthy();
        return result.payload.supportSession!.id;
      };

      const expectSessionClosed = async (sessionId: string) => {
        const { data, error } = await service
          .schema('RetificaPremium')
          .from('Sessoes_Suporte')
          .select('ended_at')
          .eq('id_sessao_suporte', sessionId)
          .single();
        expect(error).toBeNull();
        expect(data?.ended_at).toBeTruthy();

        const validation = await invokeAdminUsers(signedIn.accessToken, {
          action: 'validate_support_impersonation',
          sessionId,
          targetUserId: allowedTargetUserId,
        });
        expect(validation.response.status).toBe(200);
        expect(validation.payload.supportSession).toBeNull();
      };

      const permissionSessionId = await startSession();
      const { error: revokeError } = await service
        .schema('RetificaPremium')
        .from('Permissoes_Suporte')
        .update({ ativo: false, revoked_at: new Date().toISOString() })
        .eq('fk_actor_usuarios', actorUserId)
        .eq('fk_target_usuarios', allowedTargetUserId);
      expect(revokeError).toBeNull();
      await expectSessionClosed(permissionSessionId);

      const { error: reactivateGrantError } = await service
        .schema('RetificaPremium')
        .from('Permissoes_Suporte')
        .update({ ativo: true, revoked_at: null })
        .eq('fk_actor_usuarios', actorUserId)
        .eq('fk_target_usuarios', allowedTargetUserId);
      expect(reactivateGrantError).toBeNull();

      const targetSessionId = await startSession();
      const { error: deactivateTargetError } = await service
        .schema('RetificaPremium')
        .from('Usuarios')
        .update({ status: false })
        .eq('id_usuarios', allowedTargetUserId);
      expect(deactivateTargetError).toBeNull();
      const { error: reactivateTargetError } = await service
        .schema('RetificaPremium')
        .from('Usuarios')
        .update({ status: true })
        .eq('id_usuarios', allowedTargetUserId);
      expect(reactivateTargetError).toBeNull();
      await expectSessionClosed(targetSessionId);

      const moduleSessionId = await startSession();
      const { error: removeAdminError } = await service
        .schema('RetificaPremium')
        .from('Modulos')
        .delete()
        .eq('fk_usuarios', actorUserId);
      expect(removeAdminError).toBeNull();
      await configureInternalUser(ACTOR_EMAIL, 'administrador', true);
      await expectSessionClosed(moduleSessionId);
    });
  },
);
