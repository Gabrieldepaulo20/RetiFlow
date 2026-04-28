import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthMode, AuthSession, LoginCredentials, Permission, SystemUser } from '@/types';
import { getAuthProvider } from '@/services/auth/authProvider';
import { getModulePermission, hasPermission } from '@/services/auth/permissions';
import {
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
import { canUserAccessModule, getDefaultRedirect } from '@/services/auth/defaultRedirect';

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
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials, portal?: LoginPortal) => Promise<LoginResult>;
  logout: () => void;
  can: (permission: Permission) => boolean;
  canAccessModule: (moduleKey: Parameters<typeof getModulePermission>[0]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

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
  const [isAuthLoading, setIsAuthLoading] = useState(IS_REAL_AUTH);
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
    if (!IS_REAL_AUTH) {
      setIsAuthLoading(false);
      return;
    }

    let active = true;

    const restoreProfileFromSupabase = async () => {
      const { data: envelope } = await supabase.schema('RetificaPremium').rpc('get_usuario_por_auth_id');
      if (!envelope || envelope.status !== 200) return null;
      return createRealSession(dbUserToSystemUser(envelope.dados));
    };

    // Restaura sessão antes de qualquer rota protegida decidir redirecionar.
    void supabase.auth.getSession().then(async ({ data: { session: sbSession } }) => {
      if (!active) return;

      if (!sbSession) {
        setSession(null);
        return;
      }

      const restoredSession = await restoreProfileFromSupabase();
      if (!active) return;

      removeStorageItem(AUTH_SESSION_STORAGE_KEY);
      setSession(restoredSession);
    }).catch(() => {
      if (active) setSession(null);
    }).finally(() => {
      if (active) setIsAuthLoading(false);
    });

    // Escuta sign-out do Supabase. Tokens ficam somente na persistência do SDK.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sbSession) => {
      removeStorageItem(AUTH_SESSION_STORAGE_KEY);

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setIsAuthLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && sbSession) {
        setIsAuthLoading(true);
        void restoreProfileFromSupabase().then((restoredSession) => {
          if (!active) return;
          setSession(restoredSession);
        }).catch(() => {
          if (active) setSession(null);
        }).finally(() => {
          if (active) setIsAuthLoading(false);
        });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
    return canUserAccessModule(user, moduleKey);
  }, [user]);

  const value = useMemo<AuthContextType>(
    () => ({
      authMode,
      user,
      session,
      isAuthLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      can,
      canAccessModule,
      isAdmin: user?.role === 'ADMIN',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authMode, can, canAccessModule, isAuthLoading, login, logout, session, user, moduleAccessVersion],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
