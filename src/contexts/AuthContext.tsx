import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthMode, AuthSession, LoginCredentials, Permission, SystemUser } from '@/types';
import { getAuthProvider } from '@/services/auth/authProvider';
import { getModulePermission, hasPermission } from '@/services/auth/permissions';
import { loadSystemUsers } from '@/services/auth/systemUsers';
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

const AUTH_SESSION_STORAGE_KEY = 'auth.session';

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
  return readJsonStorage<AuthSession | null>(AUTH_SESSION_STORAGE_KEY, null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [moduleAccessVersion, setModuleAccessVersion] = useState(0);
  const authMode: AuthMode = 'development';

  useEffect(() => subscribeToModuleAccessChanges(() => setModuleAccessVersion((value) => value + 1)), []);
  useEffect(() => {
    if (!session?.user) {
      return;
    }

    const currentUser = loadSystemUsers().find((candidate) => candidate.id === session.user.id);
    if (!currentUser || !currentUser.isActive) {
      removeStorageItem(AUTH_SESSION_STORAGE_KEY);
      setSession(null);
    }
  }, [session]);

  const user = session?.user ?? null;

  const commitSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    if (nextSession) {
      writeJsonStorage(AUTH_SESSION_STORAGE_KEY, nextSession);
      return;
    }

    removeStorageItem(AUTH_SESSION_STORAGE_KEY);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials, portal: LoginPortal = 'client'): Promise<LoginResult> => {
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
    return {
      success: true,
      redirect: getDefaultRedirect(response.session.user),
    };
  }, [commitSession]);

  const logout = useCallback(() => commitSession(null), [commitSession]);

  const can = useCallback((permission: Permission) => hasPermission(user, permission), [user]);

  const canAccessModule = useCallback((moduleKey: Parameters<typeof getModulePermission>[0]) => {
    if (!user) {
      return false;
    }

    const permission = getModulePermission(moduleKey);
    if (!can(permission)) {
      return false;
    }

    if (!isRoleModuleEnabled(user.role, moduleKey)) {
      return false;
    }

    if (!isUserModuleEnabled(user.id, moduleKey)) {
      return false;
    }

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
    [authMode, can, canAccessModule, login, logout, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be within AuthProvider');
  }

  return ctx;
}
