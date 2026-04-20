import type { IAuthProvider } from './authProvider';
import { authenticateInDevelopment, getDevelopmentCredentialHint } from './developmentAuthService';

/**
 * Provider de autenticação mock para desenvolvimento.
 * Usa senha fixa e usuários do seed — sem backend, sem tokens reais.
 * Nunca deve estar ativo em produção com dados reais.
 */
export const mockAuthProvider: IAuthProvider = {
  authenticate: authenticateInDevelopment,
  getCredentialHint: getDevelopmentCredentialHint,
};
