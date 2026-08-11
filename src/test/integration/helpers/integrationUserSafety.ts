export const INTEGRATION_TEST_USER_NAME = 'Integration Test User';
export const INTEGRATION_TEST_AUTH_MARKER = 'retiflow_integration_test';

const SAFE_INTEGRATION_LOCAL_PART = /^integration[._+-]test(?:[._+-]|$)/i;
const SAFE_INTEGRATION_DOMAIN = 'retifica.com';

export function assertSafeIntegrationTestEmail(email: string): void {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  const localPart = atIndex > 0 ? normalized.slice(0, atIndex) : '';
  const domain = atIndex > 0 ? normalized.slice(atIndex + 1) : '';

  if (!SAFE_INTEGRATION_LOCAL_PART.test(localPart) || domain !== SAFE_INTEGRATION_DOMAIN) {
    throw new Error(
      '[integration] Cleanup recusado: TEST_USER_EMAIL não identifica inequivocamente uma conta de teste.',
    );
  }
}
