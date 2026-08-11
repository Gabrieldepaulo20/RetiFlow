import { defineConfig } from 'vitest/config';
import path from 'path';
import { loadIntegrationEnv } from './src/test/integration/helpers/loadIntegrationEnv';

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
    globalSetup: ['./src/test/integration/globalSetup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
