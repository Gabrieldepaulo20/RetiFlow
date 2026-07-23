import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();
let internalTestUserId: string | null = null;
let previousMarketingAccess = false;

describe.skipIf(!envStatus.configured)('Crescimento — visão básica da empresa e privacidade Mega Master', () => {
  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    const authId = await ensureTestUser(testUserEmail, testUserPassword);
    const service = createServiceClient();
    const { data: internalUser, error: internalUserError } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('id_usuarios')
      .eq('auth_id', authId)
      .single();
    if (internalUserError || !internalUser?.id_usuarios) {
      throw new Error(`Falha ao preparar empresa de teste: ${internalUserError?.message ?? 'perfil ausente'}`);
    }

    internalTestUserId = internalUser.id_usuarios as string;
    const { data: currentModules, error: currentModulesError } = await service
      .schema('RetificaPremium')
      .from('Modulos')
      .select('marketing')
      .eq('fk_usuarios', internalTestUserId)
      .maybeSingle();
    if (currentModulesError) throw new Error(`Falha ao ler módulos de teste: ${currentModulesError.message}`);
    previousMarketingAccess = currentModules?.marketing === true;

    const { error: modulesError } = await service
      .schema('RetificaPremium')
      .from('Modulos')
      .upsert({ fk_usuarios: internalTestUserId, marketing: true }, { onConflict: 'fk_usuarios' });
    if (modulesError) throw new Error(`Falha ao habilitar Crescimento no teste: ${modulesError.message}`);
  });

  afterAll(async () => {
    if (!internalTestUserId) return;
    const { error } = await createServiceClient()
      .schema('RetificaPremium')
      .from('Modulos')
      .update({ marketing: previousMarketingAccess })
      .eq('fk_usuarios', internalTestUserId);
    if (error) throw new Error(`Falha ao restaurar módulo de teste: ${error.message}`);
  });

  it('entrega somente indicadores agregados para a empresa autenticada', async () => {
    const { accessToken } = await signInAsTestUser();
    const { url, anonKey } = getTestEnv();
    const response = await fetch(`${url}/functions/v1/marketing-dashboard`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_periodo_dias: 30,
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      dados: {
        context: {
          accessLevel: 'basic',
          privateToMegaMaster: false,
        },
        site: {
          current: expect.objectContaining({
            visits: expect.any(Number),
            whatsappClicks: expect.any(Number),
            formSubmits: expect.any(Number),
          }),
        },
      },
    });
    expect(payload.dados.context.targetEmail).toBeUndefined();
    expect(payload.dados.config.allowedOrigins).toBeUndefined();
    expect(payload.dados.site.recentEvents).toBeUndefined();
    expect(payload.dados.leads).toBeUndefined();
    expect(payload.dados.business).toBeUndefined();
    expect(payload.dados.snapshots).toBeUndefined();
    expect(JSON.stringify(payload.dados)).not.toMatch(/commission|telefone|lead_code/i);
  });

  it('impede a empresa de consultar outra conta ou vincular contatos', async () => {
    const { accessToken } = await signInAsTestUser();
    const { url, anonKey } = getTestEnv();
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const otherCompanyResponse = await fetch(`${url}/functions/v1/marketing-dashboard`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_periodo_dias: 30,
        p_target_user_id: '00000000-0000-0000-0000-000000000000',
      }),
    });
    expect(otherCompanyResponse.status).toBe(403);

    const linkResponse = await fetch(`${url}/functions/v1/marketing-dashboard`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'link_client',
        p_periodo_dias: 30,
        p_target_user_id: internalTestUserId,
        leadId: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
      }),
    });
    expect(linkResponse.status).toBe(403);
  });

  it('nega leitura direta de leads e comissões para usuário comum', async () => {
    const { client } = await signInAsTestUser();

    for (const table of ['Marketing_Leads', 'Marketing_Commission_Snapshots']) {
      const { data, error } = await client
        .schema('RetificaPremium')
        .from(table)
        .select('*')
        .limit(1);

      expect(data).toBeNull();
      expect(error?.message ?? '').toMatch(/permission denied/i);
    }
  });

  it('recusa evento de site sem uma chave válida', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.functions.invoke('marketing-events', {
      body: {
        siteKey: 'chave-invalida-de-teste',
        eventId: crypto.randomUUID(),
        leadCode: 'TESTE-NEGADO',
        eventType: 'page_view',
      },
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/non-2xx status code/i);
  });
});

if (!envStatus.configured) {
  warnIntegrationSkipped('marketing-privacy.test.ts');
}
