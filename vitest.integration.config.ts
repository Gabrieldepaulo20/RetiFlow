import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

/** Parse manual de arquivo .env — sem dependência de dotenv em ESM context. */
function loadIntegrationEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.integration');
  if (!fs.existsSync(envPath)) {
    console.warn('\n[integration] AVISO: .env.integration não encontrado.');
    console.warn('[integration] Copie .env.integration.example e preencha as credenciais.\n');
    return {};
  }

  const result: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key) result[key] = value;
  }

  return result;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/integration/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Testes de integração rodam em série — evita race conditions no DB/Auth.
    fileParallelism: false,
    sequence: { concurrent: false },
    env: loadIntegrationEnv(),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
