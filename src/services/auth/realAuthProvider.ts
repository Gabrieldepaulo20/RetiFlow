import { supabase } from '@/lib/supabase';
import type { IAuthProvider, AuthResponse } from './authProvider';
import { dbUserToSystemUser } from '@/services/auth/supabaseUserMapping';

export const realAuthProvider: IAuthProvider = {
  async authenticate(credentials): Promise<AuthResponse> {
    try {
      // 1. Login via Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email:    credentials.email,
          password: credentials.password,
        });

      if (authError || !authData.session) {
        return {
          success: false,
          error: authError?.message ?? 'Credenciais inválidas.',
        };
      }

      // 2. Busca perfil completo no banco via RPC
      const { data: envelope, error: rpcError } =
        await supabase.schema('RetificaPremium').rpc('get_usuario_por_auth_id');

      if (rpcError || !envelope || envelope.status !== 200) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Perfil não encontrado. Contate o administrador.',
        };
      }

      const perfil = envelope.dados;
      if (!perfil.status) {
        await supabase.auth.signOut();
        return { success: false, error: 'Usuário inativo. Contate o administrador.' };
      }

      return {
        success: true,
        session: {
          user: dbUserToSystemUser(perfil),
          mode: 'real',
          tokens: {
            accessToken:  authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            expiresAt: authData.session.expires_at
              ? new Date(authData.session.expires_at * 1000).toISOString()
              : null,
          },
          authenticatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro inesperado ao autenticar.',
      };
    }
  },
};
