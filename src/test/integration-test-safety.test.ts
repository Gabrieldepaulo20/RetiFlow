import { describe, expect, it } from 'vitest';
import { assertSafeIntegrationTestEmail } from './integration/helpers/integrationUserSafety';
import {
  INTEGRATION_ENV_KEYS,
  parseIntegrationEnv,
} from './integration/helpers/loadIntegrationEnv';

describe('segurança do ambiente de integração', () => {
  it('carrega somente as chaves permitidas e preserva a precedência do CI', () => {
    const parsed = parseIntegrationEnv(
      [
        'VITE_SUPABASE_URL=https://arquivo.supabase.co',
        'VITE_SUPABASE_ANON_KEY="anon-arquivo"',
        'VITE_SUPABASE_SERVICE_ROLE_KEY=service-arquivo',
        'TEST_USER_EMAIL=integration.test@retifica.test',
        "TEST_USER_PASSWORD='senha-arquivo'",
        'SEGREDO_FORA_DO_CONTRATO=nao-carregar',
      ].join('\n'),
      { VITE_SUPABASE_URL: 'https://ci.supabase.co' },
    );

    expect(Object.keys(parsed).sort()).toEqual([...INTEGRATION_ENV_KEYS].sort());
    expect(parsed.VITE_SUPABASE_URL).toBe('https://ci.supabase.co');
    expect(parsed.VITE_SUPABASE_ANON_KEY).toBe('anon-arquivo');
    expect(parsed.TEST_USER_PASSWORD).toBe('senha-arquivo');
    expect(parsed).not.toHaveProperty('SEGREDO_FORA_DO_CONTRATO');

    expect(parseIntegrationEnv('', {
      TEST_USER_EMAIL: 'integration.test@retifica.com',
    })).toEqual({ TEST_USER_EMAIL: 'integration.test@retifica.com' });
  });

  it('aceita somente e-mail inequivocamente dedicado a integração', () => {
    expect(() => assertSafeIntegrationTestEmail('integration.test@retifica.com')).not.toThrow();
    expect(() => assertSafeIntegrationTestEmail('integration-test+ci@retifica.com')).not.toThrow();
    expect(() => assertSafeIntegrationTestEmail('gabrielwilliam208@gmail.com')).toThrow(/recusado/i);
    expect(() => assertSafeIntegrationTestEmail('financeiro@retifica.com')).toThrow(/recusado/i);
    expect(() => assertSafeIntegrationTestEmail('integration.test@empresa-real.com')).toThrow(/recusado/i);
    expect(() => assertSafeIntegrationTestEmail('integration.test')).toThrow(/recusado/i);
  });
});
