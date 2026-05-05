import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createAnonClient, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { deleteTestUser, ensureTestUser, TEST_CATEGORY_ID, TEST_PREFIX } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const envStatus = getIntegrationEnvStatus();
if (!envStatus.configured) warnIntegrationSkipped('anon-hardening.test');

const OTHER_EMAIL = `anon-hardening-${Date.now()}@retifica.test`;
const OTHER_PASSWORD = `AnonHardening@${Date.now()}!`;

async function expectRpcDenied(rpcName: string, params: Record<string, unknown> = {}) {
  await expect(callRpc(createAnonClient(), rpcName, params)).rejects.toThrow(/permission denied|not allowed|42501/i);
}

async function invokeFunctionWithoutSession(name: string, body: Record<string, unknown>) {
  const { url, anonKey } = getTestEnv();
  return fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!envStatus.configured)('Anon key hardening — chamadas externas sem sessão', () => {
  const createdStoragePaths: string[] = [];
  let otherClientId: string | null = null;
  let otherAuthId: string | null = null;

  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
    otherAuthId = await ensureTestUser(OTHER_EMAIL, OTHER_PASSWORD);
  });

  afterAll(async () => {
    const service = createServiceClient();
    if (createdStoragePaths.length > 0) {
      await service.storage.from('notas').remove(createdStoragePaths);
    }
    if (otherClientId) {
      await service
        .schema('RetificaPremium')
        .from('Clientes')
        .delete()
        .eq('id_clientes', otherClientId);
    }
    await deleteTestUser(OTHER_EMAIL);
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  it('anon key não lê nem grava tabelas do schema RetificaPremium diretamente', async () => {
    const anon = createAnonClient();
    const tables = ['Usuarios', 'Clientes', 'Notas_de_Servico', 'Contas_Pagar'];

    for (const table of tables) {
      const { data, error } = await anon
        .schema('RetificaPremium')
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        expect(error.message).toMatch(/permission denied|not allowed|schema/i);
      } else {
        expect(data).toEqual([]);
      }
    }

    const insert = await anon
      .schema('RetificaPremium')
      .from('Clientes')
      .insert({
        nome: `${TEST_PREFIX} tentativa anon`,
        documento: '12345678901',
        tipo_documento: 'CPF',
      });

    expect(insert.data).toBeNull();
    expect(insert.error?.message ?? '').toMatch(/permission denied|not allowed|row-level security|violates/i);
  });

  it('anon key não executa RPCs de leitura ou mutação', async () => {
    await expectRpcDenied('get_clientes', { p_limite: 1 });
    await expectRpcDenied('get_notas_servico', { p_limite: 1 });
    await expectRpcDenied('get_contas_pagar', { p_limite: 1 });
    await expectRpcDenied('get_usuarios', { p_limite: 1 });
    await expectRpcDenied('novo_cliente', {
      p_payload: {
        nome: `${TEST_PREFIX} tentativa anon`,
        documento: '12345678901',
        tipo_documento: 'CPF',
      },
    });
    await expectRpcDenied('insert_conta_pagar', {
      p_titulo: `${TEST_PREFIX} tentativa anon`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: '2026-12-31',
      p_valor_original: 100,
    });
    await expectRpcDenied('update_nota_pdf_url', {
      p_id_nota: '00000000-0000-0000-0000-000000000000',
      p_pdf_url: 'notas/tentativa.pdf',
    });
  });

  it('anon key não lista storage privado nem abre objeto privado por URL pública', async () => {
    const service = createServiceClient();
    const anon = createAnonClient();
    const privateBuckets = ['notas', 'fechamentos', 'contas-pagar'];

    const path = `notas/security/anon-${crypto.randomUUID()}.pdf`;
    createdStoragePaths.push(path);
    const upload = await service.storage
      .from('notas')
      .upload(path, new Blob(['%PDF-1.4\n% private\n'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      });
    expect(upload.error).toBeNull();

    for (const bucket of privateBuckets) {
      const { data, error } = await anon.storage.from(bucket).list('notas/security', { limit: 10 });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }

    const publicUrl = `${getTestEnv().url}/storage/v1/object/public/notas/${path}`;
    const response = await fetch(publicUrl);
    expect(response.ok).toBe(false);

    const signed = await anon.storage.from('notas').createSignedUrl(path, 60);
    expect(signed.data?.signedUrl).toBeUndefined();
    expect(signed.error?.message ?? '').toMatch(/not found|permission|not authorized|row-level/i);

    const download = await anon.storage.from('notas').download(path);
    expect(download.data).toBeNull();
    expect(download.error?.message ?? '').toMatch(/not found|permission|not authorized|row-level/i);
  });

  it('Edge Functions sensíveis recusam chamada com anon key sem sessão de usuário', async () => {
    const cases = [
      ['admin-users', { action: 'get_user_presence' }],
      ['dashboard-resumo', { p_limite: 1 }],
      ['support-ticket', { message: `${TEST_PREFIX} não deve enviar` }],
      ['analisar-conta-pagar', { files: [] }],
      ['gmail-oauth-start', {}],
      ['gmail-scan-payables', {}],
    ] as const;

    for (const [name, body] of cases) {
      const response = await invokeFunctionWithoutSession(name, body);
      expect([401, 403]).toContain(response.status);
    }
  });

  it('payload adulterado autenticado não altera cliente de outro usuário', async () => {
    const otherClient = createAnonClient();
    const login = await otherClient.auth.signInWithPassword({
      email: OTHER_EMAIL,
      password: OTHER_PASSWORD,
    });
    expect(login.error).toBeNull();

    const created = await callRpc(otherClient, 'salvar_cliente_completo', {
      p_payload: {
        nome: `${TEST_PREFIX} Cliente De Outro Tenant`,
        documento: String(Date.now()).slice(-11).padStart(11, '9'),
        tipo_documento: 'CPF',
        status: true,
      },
    });
    expect(created.status).toBe(200);
    otherClientId = created.id_cliente as string;
    await otherClient.auth.signOut();

    const { client } = await signInAsTestUser();
    const tampered = await callRpc(client, 'salvar_cliente_completo', {
      p_payload: {
        id_clientes: otherClientId,
        nome: `${TEST_PREFIX} alteração indevida`,
        documento: '99999999999',
        tipo_documento: 'CPF',
        status: true,
      },
    });

    expect(tampered.status).toBe(404);

    const service = createServiceClient();
    const { data, error } = await service
      .schema('RetificaPremium')
      .from('Clientes')
      .select('nome, fk_criado_por')
      .eq('id_clientes', otherClientId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.nome).toContain('Cliente De Outro Tenant');
    expect(data?.nome).not.toContain('alteração indevida');
    expect(data?.fk_criado_por).toBeTruthy();
    expect(otherAuthId).toBeTruthy();
    await client.auth.signOut();
  });
});
