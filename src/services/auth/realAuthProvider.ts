import type { IAuthProvider } from './authProvider';

/**
 * Provider de autenticação real — stub para implementação futura.
 * Conectar aqui: Supabase Auth, JWT + backend próprio, etc.
 *
 * Para ativar: VITE_AUTH_MODE=real
 */
export const realAuthProvider: IAuthProvider = {
  authenticate: async (_credentials) => {
    throw new Error(
      '[auth] Autenticação real não está implementada. ' +
        'Configure VITE_AUTH_MODE=mock para desenvolvimento, ou implemente este provider com um backend real.',
    );
  },
};
