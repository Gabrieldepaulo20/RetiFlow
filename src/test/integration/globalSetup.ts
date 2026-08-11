import { createServiceClient } from './helpers/client';
import { getIntegrationEnv, getIntegrationEnvStatus } from './helpers/env';
import {
  assertSafeIntegrationTestEmail,
  INTEGRATION_TEST_AUTH_MARKER,
  INTEGRATION_TEST_USER_NAME,
} from './helpers/integrationUserSafety';
import { loadIntegrationEnv } from './helpers/loadIntegrationEnv';
import { deleteTestUser, findAuthUserByEmail } from './helpers/seed';

/**
 * Mantém as credenciais restritas ao processo de integração e garante que a
 * conta dedicada não sobreviva ao fim da execução, independentemente da ordem
 * dos arquivos de teste.
 */
export function setup() {
  const integrationEnv = loadIntegrationEnv();
  for (const [key, value] of Object.entries(integrationEnv)) {
    process.env[key] = value;
  }

  return async function teardownIntegrationUser() {
    if (!getIntegrationEnvStatus().configured) return;
    const { testUserEmail } = getIntegrationEnv();
    assertSafeIntegrationTestEmail(testUserEmail);

    const service = createServiceClient();
    const { data: profiles, error: profileError } = await service
      .schema('RetificaPremium')
      .from('Usuarios')
      .select('nome')
      .eq('email', testUserEmail);

    if (profileError) {
      throw new Error(`[integration] Cleanup recusado: não foi possível validar o perfil de teste: ${profileError.message}`);
    }
    if ((profiles ?? []).some((profile) => profile.nome !== INTEGRATION_TEST_USER_NAME)) {
      throw new Error('[integration] Cleanup recusado: o perfil configurado não é o usuário dedicado de integração.');
    }

    const authUser = await findAuthUserByEmail(testUserEmail);
    if ((profiles ?? []).length === 0 && !authUser) return;
    if (authUser && authUser.app_metadata?.[INTEGRATION_TEST_AUTH_MARKER] !== true) {
      throw new Error('[integration] Cleanup recusado: a conta Auth não está marcada como fixture de integração.');
    }

    await deleteTestUser(testUserEmail);
  };
}
