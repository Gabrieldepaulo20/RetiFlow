import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import type { IAuthProvider, AuthResponse } from './authProvider';

const ACESSO_PARA_ROLE: Record<string, UserRole> = {
  administrador: 'ADMIN',
  financeiro:    'FINANCEIRO',
  'produção':    'PRODUCAO',
  'recepção':    'RECEPCAO',
};

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
      const role: UserRole = ACESSO_PARA_ROLE[perfil.acesso] ?? 'RECEPCAO';

      if (!perfil.status) {
        await supabase.auth.signOut();
        return { success: false, error: 'Usuário inativo. Contate o administrador.' };
      }

      return {
        success: true,
        session: {
          user: {
            id:        perfil.id_usuarios,
            name:      perfil.nome,
            email:     perfil.email,
            role,
            isActive:  perfil.status,
            createdAt: new Date().toISOString(),
            phone:     perfil.telefone || undefined,
          },
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
