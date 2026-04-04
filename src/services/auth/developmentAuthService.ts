import { AuthMode, AuthSession, LoginCredentials, SystemUser } from '@/types';
import { loadSystemUsers } from '@/services/auth/systemUsers';

const DEVELOPMENT_PASSWORD = 'demo123';

interface DevelopmentAuthResponse {
  success: boolean;
  error?: string;
  session?: AuthSession;
}

function createDevelopmentSession(user: SystemUser): AuthSession {
  const now = new Date().toISOString();

  return {
    user,
    mode: 'development' satisfies AuthMode,
    authenticatedAt: now,
    tokens: {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    },
  };
}

export async function authenticateInDevelopment(credentials: LoginCredentials): Promise<DevelopmentAuthResponse> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const users = loadSystemUsers();
  const email = credentials.email.trim().toLowerCase();
  const user = users.find((candidate) => candidate.email.toLowerCase() === email);
  if (!user || !user.isActive) {
    return {
      success: false,
      error: 'Usuário não encontrado ou desativado.',
    };
  }

  if (credentials.password !== DEVELOPMENT_PASSWORD) {
    return {
      success: false,
      error: 'Senha inválida para o ambiente de desenvolvimento.',
    };
  }

  return {
    success: true,
    session: createDevelopmentSession({
      ...user,
      lastLogin: new Date().toISOString(),
    }),
  };
}

export function getDevelopmentCredentialHint() {
  const users = loadSystemUsers();
  return {
    password: DEVELOPMENT_PASSWORD,
    accounts: users.map(({ id, name, email, role, isActive }) => ({
      id,
      name,
      email,
      role,
      isActive,
    })),
  };
}
