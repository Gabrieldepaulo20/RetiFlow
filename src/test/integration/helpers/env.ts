type IntegrationEnv = {
  url: string;
  anonKey: string;
  serviceKey: string;
  testUserEmail: string;
  testUserPassword: string;
};

const REQUIRED_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'TEST_USER_EMAIL',
  'TEST_USER_PASSWORD',
] as const;

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^<.+>$/,
  /^PREENCHER/i,
  /^sua_/i,
  /^seu_/i,
];

function isPlaceholder(value: string | undefined) {
  const normalized = (value ?? '').trim();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function readEnvValue(key: (typeof REQUIRED_KEYS)[number]) {
  return (process.env[key] ?? '').trim();
}

export function getIntegrationEnvStatus(): {
  configured: boolean;
  missingKeys: string[];
} {
  const missingKeys = REQUIRED_KEYS.filter((key) => isPlaceholder(readEnvValue(key)));
  const password = readEnvValue('TEST_USER_PASSWORD');
  const url = readEnvValue('VITE_SUPABASE_URL');

  if (password && password.length < 8) missingKeys.push('TEST_USER_PASSWORD');
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    missingKeys.push('VITE_SUPABASE_URL');
  }

  return {
    configured: missingKeys.length === 0,
    missingKeys,
  };
}

export function getIntegrationEnv(): IntegrationEnv {
  const status = getIntegrationEnvStatus();

  if (!status.configured) {
    throw new Error(
      `[integration] Ambiente incompleto. Configure: ${status.missingKeys.join(', ')}`,
    );
  }

  return {
    url: readEnvValue('VITE_SUPABASE_URL'),
    anonKey: readEnvValue('VITE_SUPABASE_ANON_KEY'),
    serviceKey: readEnvValue('VITE_SUPABASE_SERVICE_ROLE_KEY'),
    testUserEmail: readEnvValue('TEST_USER_EMAIL'),
    testUserPassword: readEnvValue('TEST_USER_PASSWORD'),
  };
}

export function warnIntegrationSkipped(testFile: string) {
  const status = getIntegrationEnvStatus();
  if (status.configured) return;

  console.warn(
    `[${testFile}] .env.integration incompleto — testes de integração pulados. ` +
      `Faltando/placeholder: ${status.missingKeys.join(', ')}`,
  );
}
