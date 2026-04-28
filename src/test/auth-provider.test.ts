import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthProvider } from '@/services/auth/authProvider';

describe('auth provider selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows mock auth outside production for local development', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_AUTH_MODE', 'mock');

    expect(getAuthProvider().getCredentialHint).toBeTypeOf('function');
  });

  it('blocks mock auth in production builds', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_AUTH_MODE', 'mock');

    expect(() => getAuthProvider()).toThrow(/VITE_AUTH_MODE.*real/i);
  });

  it('allows real auth in production builds', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_AUTH_MODE', 'real');

    expect(getAuthProvider()).toBeDefined();
  });
});
