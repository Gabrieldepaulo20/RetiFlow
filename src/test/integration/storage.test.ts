import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';
import { cleanupAll } from './helpers/cleanup';
import { ensureTestUser, TEST_CATEGORY_ID, TEST_PREFIX, deleteTestUser } from './helpers/seed';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('storage.test');

describe.skipIf(skipIntegration)('Storage — PDFs e anexos privados com signed URL', () => {
  const fechamentoPaths: string[] = [];
  const payableAttachmentPaths: string[] = [];
  const notaPaths: string[] = [];

  beforeAll(async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    await ensureTestUser(testUserEmail, testUserPassword);
    await cleanupAll();
  });

  afterAll(async () => {
    const service = createServiceClient();
    if (fechamentoPaths.length > 0) {
      await service.storage.from('fechamentos').remove(fechamentoPaths);
    }
    if (payableAttachmentPaths.length > 0) {
      await service.storage.from('contas-pagar').remove(payableAttachmentPaths);
    }
    if (notaPaths.length > 0) {
      await service.storage.from('notas').remove(notaPaths);
    }
    await cleanupAll();
    const { testUserEmail } = getTestEnv();
    await deleteTestUser(testUserEmail);
  });

  it('uploadFechamentoPDF salva path privado e getFechamentoPDFSignedUrl permite leitura real', async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    const [{ supabase }, fechamentoApi] = await Promise.all([
      import('@/lib/supabase'),
      import('@/api/supabase/fechamentos'),
    ]);

    const login = await supabase.auth.signInWithPassword({
      email: testUserEmail,
      password: testUserPassword,
    });
    expect(login.error).toBeNull();

    const pdfBlob = new Blob(['%PDF-1.4\n% integration test fechamento\n'], { type: 'application/pdf' });
    const path = await fechamentoApi.uploadFechamentoPDF(`integration-${crypto.randomUUID()}`, pdfBlob);
    fechamentoPaths.push(path);

    expect(path).toMatch(/integration-.+\.pdf$/);
    expect(path.startsWith('http')).toBe(false);

    const signedUrl = await fechamentoApi.getFechamentoPDFSignedUrl(path);
    expect(signedUrl).toContain('/storage/v1/object/sign/fechamentos/');

    const response = await fetch(signedUrl);
    expect(response.ok).toBe(true);
    expect(await response.text()).toContain('integration test fechamento');

    await supabase.auth.signOut();
  });

  it('anexo de conta a pagar é enviado, vinculado e lido por signed URL', async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    const { client } = await signInAsTestUser();
    const [{ supabase }, payablesApi] = await Promise.all([
      import('@/lib/supabase'),
      import('@/api/supabase/contas-pagar'),
    ]);

    const login = await supabase.auth.signInWithPassword({
      email: testUserEmail,
      password: testUserPassword,
    });
    expect(login.error).toBeNull();

    const created = await callRpc(client, 'insert_conta_pagar', {
      p_titulo: `${TEST_PREFIX} Storage anexo`,
      p_fk_categorias: TEST_CATEGORY_ID,
      p_data_vencimento: '2026-12-20T00:00:00',
      p_valor_original: 99.9,
      p_origem_lancamento: 'MANUAL',
    });
    expect(created.status).toBe(200);

    const contaId = created.id_contas_pagar as string;
    const file = new File(['comprovante integração'], 'Comprovante Teste.pdf', {
      type: 'application/pdf',
    });

    const path = await payablesApi.uploadAnexoContaPagar({ contaPagarId: contaId, file });
    payableAttachmentPaths.push(path);
    expect(path.toLowerCase()).toMatch(new RegExp(`^${contaId}/.+comprovante-teste\\.pdf$`));

    const anexoId = await payablesApi.insertAnexoContaPagar({
      p_fk_contas_pagar: contaId,
      p_tipo: 'BOLETO',
      p_nome_arquivo: file.name,
      p_url: path,
    });
    expect(anexoId).toBeTruthy();

    const detalhes = await payablesApi.getContaPagarDetalhes(contaId);
    expect(detalhes?.conta.id_contas_pagar).toBe(contaId);
    expect(detalhes?.anexos.some((anexo) => anexo.url === path)).toBe(true);

    const signedUrl = await payablesApi.getAnexoContaPagarUrl(path);
    expect(signedUrl).toContain('/storage/v1/object/sign/contas-pagar/');

    const response = await fetch(signedUrl);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe('comprovante integração');

    await Promise.all([
      client.auth.signOut(),
      supabase.auth.signOut(),
    ]);
  });

  it('uploadNotaPDF salva path privado e getNotaPDFSignedUrl permite leitura real', async () => {
    const { testUserEmail, testUserPassword } = getTestEnv();
    const service = createServiceClient();
    const [{ supabase }, notasApi] = await Promise.all([
      import('@/lib/supabase'),
      import('@/api/supabase/notas'),
    ]);

    const bucket = await service.storage.getBucket('notas');
    expect(bucket.error).toBeNull();
    expect(bucket.data?.public).toBe(false);
    expect(bucket.data?.allowed_mime_types).toContain('application/pdf');

    const login = await supabase.auth.signInWithPassword({
      email: testUserEmail,
      password: testUserPassword,
    });
    expect(login.error).toBeNull();

    const osNumero = `OS-INT-${crypto.randomUUID()}`;
    const pdfBlob = new Blob(['%PDF-1.4\n% integration test nota\n'], { type: 'application/pdf' });
    const path = await notasApi.uploadNotaPDF(pdfBlob, osNumero);
    notaPaths.push(path);

    expect(path).toMatch(/^notas\/\d{4}\/\d{2}\/OS-INT-/);
    expect(path.startsWith('http')).toBe(false);

    const signedUrl = await notasApi.getNotaPDFSignedUrl(path);
    expect(signedUrl).toContain('/storage/v1/object/sign/notas/');

    const response = await fetch(signedUrl!);
    expect(response.ok).toBe(true);
    expect(await response.text()).toContain('integration test nota');

    const projectUrl = getTestEnv().url;
    const legacyPublicUrl = `${projectUrl}/storage/v1/object/public/notas/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
    const signedFromLegacy = await notasApi.getNotaPDFSignedUrl(legacyPublicUrl);
    expect(signedFromLegacy).toContain('/storage/v1/object/sign/notas/');

    await supabase.auth.signOut();
  });
});
