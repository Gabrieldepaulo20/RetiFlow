import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, createServiceClient, getTestEnv } from './helpers/client';
import { deleteTestUser, ensureTestUser } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();
const MASTER_TEST_EMAIL = 'integration.master-marketing@example.com';
const RETIFICA_PREMIUM_EMAIL = 'retificapremium5@gmail.com';

describe.skipIf(!envStatus.configured)('Crescimento — Master espelha a Retífica Premium', () => {
  beforeAll(async () => {
    const { testUserPassword } = getTestEnv();
    const authId = await ensureTestUser(MASTER_TEST_EMAIL, testUserPassword);
    const service = createServiceClient();

    const { data: internalUser, error: internalUserError } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .update({ acesso: 'administrador', status: true })
      .eq('auth_id', authId)
      .select('id_usuarios')
      .single();
    if (internalUserError || !internalUser?.id_usuarios) {
      throw new Error(`Falha ao preparar Master de integração: ${internalUserError?.message ?? 'perfil ausente'}`);
    }

    const { error: modulesError } = await service
      .schema('RetificaPremium')
      .from('Modulos')
      .upsert({
        fk_usuarios: internalUser.id_usuarios,
        marketing: true,
        admin: true,
      }, { onConflict: 'fk_usuarios' });
    if (modulesError) throw new Error(`Falha ao preparar módulos do Master: ${modulesError.message}`);
  });

  afterAll(async () => {
    await deleteTestUser(MASTER_TEST_EMAIL);
  });

  it('usa a Retífica Premium como alvo padrão e entrega os KPIs reais do Google', async () => {
    const { testUserPassword, url, anonKey } = getTestEnv();
    const client = createAnonClient();
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: MASTER_TEST_EMAIL,
      password: testUserPassword,
    });
    if (authError || !authData.session) {
      throw new Error(`Falha ao autenticar Master de integração: ${authError?.message ?? 'sessão ausente'}`);
    }

    const response = await fetch(`${url}/functions/v1/marketing-dashboard`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_periodo_dias: 30 }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      dados: {
        context: {
          targetEmail: RETIFICA_PREMIUM_EMAIL,
          accessLevel: 'full',
          privateToAdministrators: true,
          canManageAttribution: false,
        },
        campaigns: {
          financialAvailable: true,
          current: {
            impressions: expect.any(Number),
            clicks: expect.any(Number),
            spend: expect.any(Number),
          },
        },
      },
    });
    expect(payload.dados.campaigns.items.length).toBeGreaterThan(0);
    expect(payload.dados.campaigns.current.impressions).toBeGreaterThan(0);
    expect(payload.dados.campaigns.current.clicks).toBeGreaterThan(0);
    expect(payload.dados.campaigns.current.spend).toBeGreaterThan(0);
    expect(payload.dados.campaigns.clickTypes.length).toBeGreaterThan(0);
    expect(
      payload.dados.campaigns.clickTypes.reduce(
        (total: number, item: { clicks: number }) => total + item.clicks,
        0,
      ),
    ).toBe(payload.dados.campaigns.current.clicks);
    expect(payload.dados.campaigns.calls).toMatchObject({
      reported: expect.any(Number),
      received: expect.any(Number),
      averageDurationSeconds: expect.any(Number),
      items: expect.any(Array),
    });
    if (payload.dados.campaigns.calls.reported > 0) {
      expect(payload.dados.campaigns.calls.items).toHaveLength(payload.dados.campaigns.calls.reported);
      expect(payload.dados.campaigns.calls.items[0]).toMatchObject({
        id: expect.any(String),
        startedAt: expect.any(String),
        durationSeconds: expect.any(Number),
        status: expect.any(String),
      });
    }
    expect(payload.dados.campaigns.paidActions).toMatchObject({
      trackedSessions: expect.any(Number),
      whatsappClicks: expect.any(Number),
      phoneClicks: expect.any(Number),
      formSubmits: expect.any(Number),
    });
    expect(payload.dados.campaigns.allVisitors).toEqual(expect.any(Array));
    if (payload.dados.campaigns.allVisitors.length > 0) {
      expect(payload.dados.campaigns.allVisitors[0]).toMatchObject({
        visitorId: expect.any(String),
        firstSeenAt: expect.any(String),
        lastSeenAt: expect.any(String),
        durationSeconds: expect.any(Number),
        source: expect.any(String),
        medium: expect.any(String),
        originType: expect.stringMatching(/^(paid|organic|other)$/),
        eventCount: expect.any(Number),
        actionCount: expect.any(Number),
      });
    }
    expect(payload.dados.campaigns.messageAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'WHATSAPP',
          phoneNumber: expect.any(String),
          status: 'ENABLED',
          primaryStatus: 'ELIGIBLE',
        }),
      ]),
    );
    expect(payload.dados.site.whatsapp).toMatchObject({
      uniqueClicks: expect.any(Number),
      repeatedClicks: expect.any(Number),
      paidClicks: expect.any(Number),
      organicClicks: expect.any(Number),
      otherClicks: expect.any(Number),
      points: expect.any(Array),
    });
    expect(
      payload.dados.site.whatsapp.paidClicks
      + payload.dados.site.whatsapp.organicClicks
      + payload.dados.site.whatsapp.otherClicks,
    ).toBe(payload.dados.site.whatsapp.uniqueClicks);
    expect(payload.dados.site.current.visits).toBeGreaterThan(0);
    expect(payload.dados.leads.total).toBeGreaterThan(0);
  });
});

if (!envStatus.configured) {
  warnIntegrationSkipped('marketing-master-mirror.test.ts');
}
