import fs from 'node:fs';
import path from 'node:path';

export const INTEGRATION_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'TEST_USER_EMAIL',
  'TEST_USER_PASSWORD',
] as const;

export function parseIntegrationEnv(
  source: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const fileValues = new Map<string, string>();

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!INTEGRATION_ENV_KEYS.includes(key as (typeof INTEGRATION_ENV_KEYS)[number])) continue;
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    fileValues.set(key, value);
  }

  const result: Record<string, string> = {};
  for (const key of INTEGRATION_ENV_KEYS) {
    const inheritedValue = inheritedEnv[key]?.trim();
    const value = inheritedValue || fileValues.get(key);
    if (value) result[key] = value;
  }
  return result;
}

/** Lê o ambiente de integração sem depender de dotenv no contexto ESM do Vitest. */
export function loadIntegrationEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.integration');
  if (!fs.existsSync(envPath)) {
    console.warn('\n[integration] AVISO: .env.integration não encontrado.');
    console.warn('[integration] Copie .env.integration.example e preencha as credenciais.\n');
    return parseIntegrationEnv('');
  }

  return parseIntegrationEnv(fs.readFileSync(envPath, 'utf-8'));
}
