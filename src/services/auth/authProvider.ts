import type { AuthSession, LoginCredentials } from '@/types';
import { mockAuthProvider } from './mockAuthProvider';
import { realAuthProvider } from './realAuthProvider';

export interface AuthResponse {
  success: boolean;
  error?: string;
  session?: AuthSession;
}

export interface IAuthProvider {
  authenticate(credentials: LoginCredentials): Promise<AuthResponse>;
  getCredentialHint?(): {
    password: string;
    accounts: Array<{ id: string; name: string; email: string; role: string; isActive: boolean }>;
  };
}

/**
 * Retorna o provider de auth correto com base em VITE_AUTH_MODE.
 * - 'mock' (padrão em dev): usa credenciais de desenvolvimento, sem backend.
 * - 'real': espera um backend real configurado.
 *
 * Em builds de produção com mode='mock', emite um erro de console ruidoso.
 * Nunca falha silenciosamente em produção.
 */
export function getAuthProvider(): IAuthProvider {
  const mode = (import.meta.env.VITE_AUTH_MODE as string | undefined) ?? 'mock';

  if (import.meta.env.PROD && mode !== 'real') {
    throw new Error(
      '[auth] VITE_AUTH_MODE não está configurado como "real" em build de produção. ' +
        'Defina VITE_AUTH_MODE=real no ambiente antes de publicar.',
    );
  }

  return mode === 'real' ? realAuthProvider : mockAuthProvider;
}
