import type { AppModuleKey, UserRole } from '@/types';
import { supabase } from '@/lib/supabase';

type ModuleAccess = Partial<Record<AppModuleKey, boolean>>;

export type AdminUserActionResult = {
  id_usuarios?: string;
  auth_user_id?: string;
  action_link?: string;
  mensagem?: string;
};

type AdminUserAction =
  | {
      action: 'create_user' | 'create_admin';
      email: string;
      name: string;
      phone?: string;
      role: UserRole;
      modules?: ModuleAccess;
    }
  | {
      action: 'reset_password' | 'deactivate_user' | 'reactivate_user';
      userId: string;
      email?: string;
    }
  | {
      action: 'set_modules';
      userId: string;
      modules: ModuleAccess;
    };

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente.');
  }
  return data.session.access_token;
}

export async function callAdminUsersFunction(payload: AdminUserAction): Promise<AdminUserActionResult> {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<AdminUserActionResult>('admin-users', {
    body: payload,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    let message = error.message || 'Erro ao executar ação administrativa.';
    const context = typeof error === 'object' && error !== null && 'context' in error
      ? (error as { context?: unknown }).context
      : null;

    if (context instanceof Response) {
      try {
        const parsed = await context.clone().json() as { error?: string; mensagem?: string };
        message = parsed.error ?? parsed.mensagem ?? message;
      } catch {
        // Mantém a mensagem original do SDK quando o corpo não é JSON.
      }
    }

    throw new Error(message);
  }

  return data ?? {};
}

