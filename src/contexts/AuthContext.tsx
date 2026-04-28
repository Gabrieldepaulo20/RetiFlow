import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthMode, AuthSession, LoginCredentials, Permission, SystemUser } from '@/types';
import { getAuthProvider } from '@/services/auth/authProvider';
import { getModulePermission, hasPermission } from '@/services/auth/permissions';
import {
  isRoleModuleEnabled,
  isUserModuleEnabled,
  subscribeToModuleAccessChanges,
} from '@/services/auth/moduleAccess';
import {
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from '@/services/storage/browserStorage';
import { loadSystemUsers } from '@/services/auth/systemUsers';
import { supabase } from '@/lib/supabase';
import { dbUserToSystemUser } from '@/services/auth/supabaseUserMapping';

const AUTH_SESSION_STORAGE_KEY = 'auth.session';
const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface LoginResult {
  success: boolean;
  redirect: string;
  error?: string;
}

export type LoginPortal = 'client' | 'admin';

interface AuthContextType {
  authMode: AuthMode;
  user: SystemUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials, portal?: LoginPortal) => Promise<LoginResult>;
  logout: () => void;
  can: (permission: Permission) => boolean;
  canAccessModule: (moduleKey: Parameters<typeof getModulePermission>[0]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getDefaultRedirect(user: SystemUser) {
  return user.role === 'ADMIN' ? '/admin' : '/dashboard';
}

function loadStoredSession() {
  if (IS_REAL_AUTH) {
    removeStorageItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
  return readJsonStorage<AuthSession | null>(AUTH_SESSION_STORAGE_KEY, null);
}

function createRealSession(user: SystemUser): AuthSession {
  return {
    user,
    mode: 'real',
    tokens: {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    },
    authenticatedAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [moduleAccessVersion, setModuleAccessVersion] = useState(0);

  const authMode: AuthMode = IS_REAL_AUTH ? 'real' : 'development';

  useEffect(() => subscribeToModuleAccessChanges(() => setModuleAccessVersion((v) => v + 1)), []);

  // Modo mock: valida que o usuário ainda existe nos dados de seed
  useEffect(() => {
    if (IS_REAL_AUTH || !session?.user) return;

    const currentUser = loadSystemUsers().find((u) => u.id === session.user.id);
    if (!currentUser || !currentUser.isActive) {
      removeStorageItem(AUTH_SESSION_STORAGE_KEY);
      setSession(null);
    }
  }, [session]);

  // Modo real: restaura sessão Supabase existente ao montar e escuta mudanças de auth
  useEffect(() => {
    if (!IS_REAL_AUTH) return;

    // Restaura sessão se Supabase tiver token válido mas app session não existir
    supabase.auth.getSession().then(async ({ data: { session: sbSession } }) => {
      if (!sbSession || session) return;

      const { data: envelope } = await supabase.schema('RetificaPremium').rpc('get_usuario_por_auth_id');
      if (!envelope || envelope.status !== 200) return;

      const perfil = envelope.dados;

      removeStorageItem(AUTH_SESSION_STORAGE_KEY);
      setSession(createRealSession(dbUserToSystemUser(perfil)));
    });

    // Escuta sign-out do Supabase. Tokens ficam somente na persistência do SDK.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sbSession) => {
      removeStorageItem(AUTH_SESSION_STORAGE_KEY);

      if (event === 'SIGNED_OUT') {
        setSession(null);
        return;
      }

      if (event === 'SIGNED_IN' && sbSession && !session) {
        void supabase.schema('RetificaPremium').rpc('get_usuario_por_auth_id').then(({ data: envelope }) => {
          if (envelope && envelope.status === 200) {
            setSession(createRealSession(dbUserToSystemUser(envelope.dados)));
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const user = session?.user ?? null;

  const commitSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    if (nextSession && !IS_REAL_AUTH) {
      writeJsonStorage(AUTH_SESSION_STORAGE_KEY, nextSession);
      return;
    }
    removeStorageItem(AUTH_SESSION_STORAGE_KEY);
  }, []);

  const login = useCallback(async (
    credentials: LoginCredentials,
    portal: LoginPortal = 'client',
  ): Promise<LoginResult> => {
    const response = await getAuthProvider().authenticate(credentials);

    if (!response.success || !response.session) {
      return {
        success: false,
        redirect: portal === 'admin' ? '/admin/login' : '/login',
        error: response.error ?? 'Falha ao autenticar.',
      };
    }

    const isAdminUser = response.session.user.role === 'ADMIN';

    if (portal === 'admin' && !isAdminUser) {
      return {
        success: false,
        redirect: '/admin/login',
        error: 'Este acesso administrativo exige uma conta de administrador.',
      };
    }

    if (portal === 'client' && isAdminUser) {
      return {
        success: false,
        redirect: '/admin/login',
        error: 'Use a tela administrativa para acessar a área de gestão.',
      };
    }

    commitSession(response.session);
    return { success: true, redirect: getDefaultRedirect(response.session.user) };
  }, [commitSession]);

  const logout = useCallback(async () => {
    if (IS_REAL_AUTH) await supabase.auth.signOut();
    commitSession(null);
  }, [commitSession]);

  const can = useCallback((permission: Permission) => hasPermission(user, permission), [user]);

  const canAccessModule = useCallback((moduleKey: Parameters<typeof getModulePermission>[0]) => {
    if (!user) return false;
    const permission = getModulePermission(moduleKey);
    if (!can(permission)) return false;
    if (IS_REAL_AUTH && user.moduleAccess) {
      return user.moduleAccess[moduleKey] !== false;
    }
    if (!isRoleModuleEnabled(user.role, moduleKey)) return false;
    if (!isUserModuleEnabled(user.id, moduleKey)) return false;
    return true;
  }, [can, user]);

  const value = useMemo<AuthContextType>(
    () => ({
      authMode,
      user,
      session,
      isAuthenticated: Boolean(user),
      login,
      logout,
      can,
      canAccessModule,
      isAdmin: user?.role === 'ADMIN',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authMode, can, canAccessModule, login, logout, session, user, moduleAccessVersion],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
