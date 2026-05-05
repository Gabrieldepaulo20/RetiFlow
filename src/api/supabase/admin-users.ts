import type { AppModuleKey, SupportImpersonationSession, UserRole } from '@/types';
import { supabase } from '@/lib/supabase';

type ModuleAccess = Partial<Record<AppModuleKey, boolean>>;

export type AdminUserDeletionStep = {
  key: string;
  label: string;
  count?: number;
  status: 'pending' | 'running' | 'done' | 'skipped';
};

export type AdminUserDeletionReport = {
  targetUserId: string;
  targetEmail: string;
  targetName: string;
  steps: AdminUserDeletionStep[];
  totalRecords: number;
  warnings: string[];
};

export type AdminUserPresence = {
  userId: string;
  email: string;
  lastSeenAt: string;
  currentRoute?: string | null;
  isOnline: boolean;
};

export type AdminUserActionResult = {
  id_usuarios?: string;
  auth_user_id?: string;
  action_link?: string;
  mensagem?: string;
  resetEmail?: string;
  confirmationEmail?: string | null;
  confirmationSent?: boolean;
  confirmationWarning?: string | null;
  supportSession?: SupportImpersonationSession;
  deletionReport?: AdminUserDeletionReport;
  userPresence?: AdminUserPresence[];
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
      action: 'reset_password' | 'resend_invite' | 'deactivate_user' | 'reactivate_user';
      userId: string;
      email?: string;
      confirmationEmail?: string;
    }
  | {
      action: 'analyze_delete_user' | 'delete_user';
      userId: string;
      confirmEmail: string;
    }
  | {
      action: 'set_modules';
      userId: string;
      modules: ModuleAccess;
    }
  | {
      action: 'promote_to_admin';
      userId: string;
    }
  | {
      action: 'start_support_impersonation';
      targetUserId: string;
      reason: string;
    }
  | {
      action: 'end_support_impersonation';
      sessionId: string;
    }
  | {
      action: 'get_user_presence';
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
