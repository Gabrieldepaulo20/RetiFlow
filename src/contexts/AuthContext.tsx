import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthMode, AuthSession, LoginCredentials, Permission, SupportImpersonationSession, SystemUser } from '@/types';
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
import { canUserAccessModule, canUserAccessModuleInContext, getDefaultRedirect } from '@/services/auth/defaultRedirect';
import { isAdminMaster, isSuperAdmin } from '@/services/auth/superAdmin';
import {
  readStoredSupportSession,
  setActiveSupportSession,
  writeStoredSupportSession,
} from '@/services/auth/supportContext';
import { callAdminUsersFunction } from '@/api/supabase/admin-users';
import { touchUserPresence } from '@/api/supabase/presence';
import { isMfaChallengeRequired, getMfaAssuranceLevel } from '@/services/auth/mfa';
import { markSessionExpiredByInactivity, SESSION_INACTIVITY_TIMEOUT_MS } from '@/services/auth/inactivitySession';
import { clearAllCachedMarketingResumo } from '@/api/supabase/marketingCache';
import { queryClient } from '@/lib/queryClient';

const AUTH_SESSION_STORAGE_KEY = 'auth.session';
const SUPPORT_VALIDATION_RETRY_DELAY_MS = 3_000;
const SUPPORT_VALIDATION_RETRY_MAX_DELAY_MS = 30_000;
export const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface LoginResult {
  success: boolean;
  redirect: string;
  error?: string;
  mfaRequired?: boolean;
}

export type LoginPortal = 'client' | 'admin';

interface AuthContextType {
  authMode: AuthMode;
  realUser: SystemUser | null;
  user: SystemUser | null;
  operationalUser: SystemUser | null;
  supportTargetUser: SystemUser | null;
  session: AuthSession | null;
  supportSession: SupportImpersonationSession | null;
  isSupportImpersonating: boolean;
  isSupportSessionValidating: boolean;
  supportSessionIssue: string | null;
  isAuthLoading: boolean;
  profileError: string | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials, portal?: LoginPortal) => Promise<LoginResult>;
  logout: () => void;
  startSupportImpersonation: (targetUserId: string, reason: string) => Promise<SupportImpersonationSession>;
  endSupportImpersonation: () => Promise<void>;
  retrySupportImpersonation: () => void;
  retryAuth: () => void;
  refreshProfile: (options?: { keepCurrentSessionOnTransientError?: boolean; force?: boolean }) => Promise<boolean>;
  isProfileFresh: () => boolean;
  completeMfaLogin: () => Promise<LoginResult>;
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

async function fetchProfileFromSupabase(): Promise<{
  session: AuthSession | null;
  isTransientError: boolean;
}> {
  const { data: envelope, error: rpcError } = await supabase
    .schema('RetificaPremium')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc('get_usuario_por_auth_id') as { data: any; error: unknown };

  if (rpcError) {
    return { session: null, isTransientError: true };
  }

  if (!envelope || envelope.status !== 200) {
    return { session: null, isTransientError: false };
  }

  if (envelope.dados?.status === false) {
    return { session: null, isTransientError: false };
  }

  return { session: createRealSession(dbUserToSystemUser(envelope.dados)), isTransientError: false };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Tempo limite excedido ao validar a sessão de suporte.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [supportSession, setSupportSession] = useState<SupportImpersonationSession | null>(
    () => {
      const initialSession = IS_REAL_AUTH ? null : readStoredSupportSession();
      setActiveSupportSession(initialSession);
      return initialSession;
    },
  );
  const [storedSupportCandidate, setStoredSupportCandidate] = useState<SupportImpersonationSession | null>(
    () => IS_REAL_AUTH ? readStoredSupportSession() : null,
  );
  const [supportSessionIssue, setSupportSessionIssue] = useState<string | null>(null);
  const [supportValidationRetryVersion, setSupportValidationRetryVersion] = useState(0);
  const [isAuthLoading, setIsAuthLoading] = useState(IS_REAL_AUTH);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [moduleAccessVersion, setModuleAccessVersion] = useState(0);
  const sessionRef = useRef<AuthSession | null>(session);
  const pendingMfaSessionRef = useRef<{ session: AuthSession; portal: LoginPortal } | null>(null);
  const lastSuccessfulProfileFetchAt = useRef<number>(0);
  const pendingProfileRefreshRef = useRef<Promise<boolean> | null>(null);
  const previousAuthenticatedUserId = useRef<string | null>(session?.user.id ?? null);
  const validatedSupportSessionKey = useRef<string | null>(null);
  const PROFILE_CACHE_TTL_MS = 30_000;

  const authMode: AuthMode = IS_REAL_AUTH ? 'real' : 'development';

  const clearSupportState = useCallback(() => {
    validatedSupportSessionKey.current = null;
    setActiveSupportSession(null);
    setSupportSession(null);
    setStoredSupportCandidate(null);
    setSupportSessionIssue(null);
    setSupportValidationRetryVersion(0);
    writeStoredSupportSession(null);
    queryClient.clear();
    clearAllCachedMarketingResumo();
  }, []);

  const suspendSupportState = useCallback((
    candidate: SupportImpersonationSession,
    message: string,
  ) => {
    validatedSupportSessionKey.current = null;
    setActiveSupportSession(null);
    setSupportSession(null);
    setStoredSupportCandidate(candidate);
    setSupportSessionIssue(message);
    writeStoredSupportSession(candidate);
    queryClient.clear();
    clearAllCachedMarketingResumo();
  }, []);

  const retrySupportImpersonation = useCallback(() => {
    if (!storedSupportCandidate) return;
    validatedSupportSessionKey.current = null;
    setSupportSessionIssue(null);
    setSupportValidationRetryVersion((version) => version + 1);
  }, [storedSupportCandidate]);

  useEffect(() => {
    const currentUserId = session?.user.id ?? null;
    if (previousAuthenticatedUserId.current === currentUserId) return;

    queryClient.clear();
    clearAllCachedMarketingResumo();
    previousAuthenticatedUserId.current = currentUserId;
  }, [session?.user.id]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const realUser = session?.user ?? null;
    if (!supportSession) return;
    if (IS_REAL_AUTH && isAuthLoading && !realUser) return;

    // Sessão já validada continua ativa somente enquanto pertencer ao mesmo
    // operador administrativo autenticado.
    const actorMismatch = supportSession.actorUser.id !== realUser?.id;
    const requesterCannotImpersonate = !isSuperAdmin(realUser) && !isAdminMaster(realUser);

    if (!realUser || actorMismatch || requesterCannotImpersonate) {
      clearSupportState();
    }
  }, [clearSupportState, isAuthLoading, session?.user, supportSession]);

  useEffect(() => {
    if (!storedSupportCandidate) return;
    if (IS_REAL_AUTH && isAuthLoading) return;

    const realUser = session?.user ?? null;
    const candidateMatchesActor = storedSupportCandidate.actorUser.id === realUser?.id;
    const requesterCanImpersonate = isSuperAdmin(realUser) || isAdminMaster(realUser);

    if (!realUser || !candidateMatchesActor || !requesterCanImpersonate) {
      clearSupportState();
      return;
    }

    if (supportSessionIssue) return;

    if (!IS_REAL_AUTH) {
      setActiveSupportSession(storedSupportCandidate);
      setSupportSession(storedSupportCandidate);
      setStoredSupportCandidate(null);
      return;
    }

    const validationKey = [
      realUser.id,
      storedSupportCandidate.id,
      storedSupportCandidate.targetUser.id,
    ].join(':');
    if (validatedSupportSessionKey.current === validationKey) return;

    validatedSupportSessionKey.current = validationKey;
    let cancelled = false;
    let retryTimer: number | undefined;

    void withTimeout(callAdminUsersFunction({
      action: 'validate_support_impersonation',
      sessionId: storedSupportCandidate.id,
      targetUserId: storedSupportCandidate.targetUser.id,
    }), 12_000).then((result) => {
      if (cancelled) return;
      const validated = result.supportSession;
      const responseMatchesRequest = Boolean(
        validated
        && validated.id === storedSupportCandidate.id
        && validated.actorUser.id === realUser.id
        && validated.targetUser.id === storedSupportCandidate.targetUser.id,
      );

      if (!validated || !responseMatchesRequest) {
        suspendSupportState(
          storedSupportCandidate,
          'A sessão não foi confirmada pelo servidor. Os dados da empresa continuam bloqueados e você só voltará ao Mega Master ao sair do modo suporte.',
        );
        return;
      }

      queryClient.clear();
      clearAllCachedMarketingResumo();
      setActiveSupportSession(validated);
      setSupportSession(validated);
      setStoredSupportCandidate(null);
      setSupportSessionIssue(null);
      setSupportValidationRetryVersion(0);
      writeStoredSupportSession(validated);
    }).catch(() => {
      if (cancelled) return;
      // Falha de rede, timeout ou indisponibilidade da Function não encerra uma
      // sessão de suporte. O candidato segue sem autoridade até uma resposta
      // canônica do servidor e é tentado novamente automaticamente.
      if (validatedSupportSessionKey.current === validationKey) {
        validatedSupportSessionKey.current = null;
      }
      retryTimer = window.setTimeout(() => {
        if (!cancelled) {
          setSupportValidationRetryVersion((version) => version + 1);
        }
      }, Math.min(
        SUPPORT_VALIDATION_RETRY_DELAY_MS * (2 ** Math.min(supportValidationRetryVersion, 4)),
        SUPPORT_VALIDATION_RETRY_MAX_DELAY_MS,
      ));
    });

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (validatedSupportSessionKey.current === validationKey) {
        validatedSupportSessionKey.current = null;
      }
    };
  }, [
    clearSupportState,
    isAuthLoading,
    session?.user,
    storedSupportCandidate,
    supportSessionIssue,
    supportValidationRetryVersion,
    suspendSupportState,
  ]);

  useEffect(() => {
    if (!IS_REAL_AUTH || !storedSupportCandidate || supportSessionIssue) return undefined;
    if (typeof window === 'undefined') return undefined;

    const retryWhenConnectionReturns = () => {
      if (validatedSupportSessionKey.current) return;
      setSupportValidationRetryVersion((version) => version + 1);
    };

    window.addEventListener('online', retryWhenConnectionReturns);
    window.addEventListener('focus', retryWhenConnectionReturns);
    return () => {
      window.removeEventListener('online', retryWhenConnectionReturns);
      window.removeEventListener('focus', retryWhenConnectionReturns);
    };
  }, [storedSupportCandidate, supportSessionIssue]);

  useEffect(() => {
    if (
      !IS_REAL_AUTH
      || isAuthLoading
      || !session?.user
      || !supportSession
      || typeof window === 'undefined'
      || typeof document === 'undefined'
    ) {
      return undefined;
    }

    let cancelled = false;
    let validationInFlight = false;

    const validateActiveSupportSession = async () => {
      if (cancelled || validationInFlight) return;
      validationInFlight = true;
      try {
        const result = await withTimeout(callAdminUsersFunction({
          action: 'validate_support_impersonation',
          sessionId: supportSession.id,
          targetUserId: supportSession.targetUser.id,
        }), 12_000);
        if (cancelled) return;

        const validated = result.supportSession;
        const stillMatches = Boolean(
          validated
          && validated.id === supportSession.id
          && validated.actorUser.id === session.user.id
          && validated.targetUser.id === supportSession.targetUser.id,
        );
        if (!stillMatches) {
          suspendSupportState(
            supportSession,
            'A sessão de suporte foi encerrada ou substituída no servidor. Os dados da empresa foram bloqueados e você só voltará ao Mega Master ao sair do modo suporte.',
          );
        }
      } catch {
        // O contexto já foi validado e continua sendo enviado a todas as RPCs.
        // Uma falha transitória ao retomar o tablet não pode trocar silenciosamente
        // para o usuário Mega Master; o próximo foco/intervalo valida de novo.
      } finally {
        validationInFlight = false;
      }
    };

    const handleFocus = () => {
      void validateActiveSupportSession();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void validateActiveSupportSession();
      }
    };

    const interval = window.setInterval(() => {
      void validateActiveSupportSession();
    }, 30_000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    isAuthLoading,
    session?.user,
    supportSession,
    suspendSupportState,
  ]);

  const applyProfileResult = useCallback((
    result: { session: AuthSession | null; isTransientError: boolean },
    options?: { keepCurrentSessionOnTransientError?: boolean },
  ) => {
    if (result.isTransientError) {
      if (options?.keepCurrentSessionOnTransientError && sessionRef.current?.user) {
        return true;
      }
      setProfileError('Não foi possível carregar seu perfil. Verifique sua conexão e tente novamente.');
      return false;
    }
    if (!result.session) {
      void supabase.auth.signOut();
      setSession(null);
      clearSupportState();
      setProfileError(null);
      return false;
    }
    removeStorageItem(AUTH_SESSION_STORAGE_KEY);
    setSession(result.session);
    setProfileError(null);
    lastSuccessfulProfileFetchAt.current = Date.now();
    return true;
  }, [clearSupportState]);

  const refreshProfile = useCallback(async (options?: { keepCurrentSessionOnTransientError?: boolean; force?: boolean }) => {
    if (!IS_REAL_AUTH) return true;

    // Reutiliza perfil em cache se foi carregado há menos de PROFILE_CACHE_TTL_MS (evita RPC por rota)
    if (!options?.force && sessionRef.current?.user && Date.now() - lastSuccessfulProfileFetchAt.current < PROFILE_CACHE_TTL_MS) {
      return true;
    }

    if (pendingProfileRefreshRef.current) return pendingProfileRefreshRef.current;

    const request = (async () => {
      const { data: { session: sbSession } } = await supabase.auth.getSession();
      if (!sbSession) {
        setSession(null);
        clearSupportState();
        setProfileError(null);
        return false;
      }

      const result = await fetchProfileFromSupabase();
      return applyProfileResult(result, options);
    })();

    pendingProfileRefreshRef.current = request;
    try {
      return await request;
    } finally {
      if (pendingProfileRefreshRef.current === request) {
        pendingProfileRefreshRef.current = null;
      }
    }
  }, [applyProfileResult, clearSupportState]);

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
    const pendingTimers = new Set<number>();

    const deferAuthWork = (work: () => Promise<void>) => {
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer);
        void work();
      }, 0);
      pendingTimers.add(timer);
    };

    const refreshProfileAfterAuthEvent = (
      sbSession: unknown,
      options?: { keepCurrentSessionOnTransientError?: boolean; initialEvent?: boolean },
    ) => {
      deferAuthWork(async () => {
        if (!active) return;

        if (!sbSession) {
          setSession(null);
          clearSupportState();
          setProfileError(null);
          if (options?.initialEvent) setIsAuthLoading(false);
          return;
        }

        if (!options?.initialEvent && !options?.keepCurrentSessionOnTransientError) {
          setIsAuthLoading(true);
        }

        try {
          const result = await fetchProfileFromSupabase();
          if (!active) return;
          applyProfileResult(result, {
            keepCurrentSessionOnTransientError: options?.keepCurrentSessionOnTransientError,
          });
        } catch {
          if (!active) return;
          if (!options?.keepCurrentSessionOnTransientError) {
            setProfileError('Erro inesperado ao carregar perfil. Tente novamente.');
          }
        } finally {
          if (active && (options?.initialEvent || !options?.keepCurrentSessionOnTransientError)) {
            setIsAuthLoading(false);
          }
        }
      });
    };

    // Escuta sign-out do Supabase. Tokens ficam somente na persistência do SDK.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sbSession) => {
      removeStorageItem(AUTH_SESSION_STORAGE_KEY);

      if (event === 'SIGNED_OUT') {
        setSession(null);
        clearSupportState();
        setIsAuthLoading(false);
        setProfileError(null);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        refreshProfileAfterAuthEvent(sbSession, { initialEvent: true });
        return;
      }

      if (event === 'SIGNED_IN' && sbSession) {
        const hasCurrentSession = Boolean(sessionRef.current?.user);
        setProfileError(null);
        refreshProfileAfterAuthEvent(sbSession, {
          keepCurrentSessionOnTransientError: hasCurrentSession,
        });
      }
    });

    return () => {
      active = false;
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
      pendingTimers.clear();
      subscription.unsubscribe();
    };
  }, [applyProfileResult, clearSupportState]);

  const realUser = session?.user ?? null;
  const supportTargetUser = realUser && supportSession ? supportSession.targetUser : null;
  const operationalUser = supportTargetUser ?? realUser;
  const user = realUser;

  useEffect(() => {
    if (!IS_REAL_AUTH || !realUser?.id) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let stopped = false;
    let lastSentAt = 0;

    const sendHeartbeat = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastSentAt < 45_000) return;
      lastSentAt = now;

      void touchUserPresence(window.location.pathname).catch(() => {
        // Presença online é recurso auxiliar; falha transitória não deve derrubar a sessão.
      });
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastSentAt = 0;
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [realUser?.id]);

  const commitSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    if (nextSession && !IS_REAL_AUTH) {
      writeJsonStorage(AUTH_SESSION_STORAGE_KEY, nextSession);
      return;
    }
    removeStorageItem(AUTH_SESSION_STORAGE_KEY);
  }, []);

  const isProfileFresh = useCallback(() => {
    return Boolean(sessionRef.current?.user) && Date.now() - lastSuccessfulProfileFetchAt.current < PROFILE_CACHE_TTL_MS;
  }, []);

  const retryAuth = useCallback(() => {
    if (!IS_REAL_AUTH) return;
    setIsAuthLoading(true);
    setProfileError(null);

    void refreshProfile({ force: true }).catch(() => {
      setProfileError('Erro inesperado ao verificar sessão. Tente novamente.');
    }).finally(() => {
      setIsAuthLoading(false);
    });
  }, [refreshProfile]);

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

    if (IS_REAL_AUTH && portal === 'admin' && !canUserAccessModule(response.session.user, 'admin')) {
      return {
        success: false,
        redirect: '/admin/login',
        error: 'Esta conta não possui o módulo administrativo habilitado.',
      };
    }

    if (IS_REAL_AUTH && await isMfaChallengeRequired()) {
      pendingMfaSessionRef.current = { session: response.session, portal };
      return {
        success: false,
        redirect: portal === 'admin' ? '/admin/login' : '/login',
        mfaRequired: true,
      };
    }

    clearSupportState();
    commitSession(response.session);
    return {
      success: true,
      redirect: getDefaultRedirect(response.session.user, {
        operationalOnly: portal === 'client' && isAdminUser,
      }),
    };
  }, [clearSupportState, commitSession]);

  const completeMfaLogin = useCallback(async (): Promise<LoginResult> => {
    const pending = pendingMfaSessionRef.current;
    if (!pending) {
      return {
        success: false,
        redirect: '/login',
        error: 'Não existe um login aguardando MFA. Entre novamente.',
      };
    }

    const { currentLevel } = await getMfaAssuranceLevel();
    if (currentLevel !== 'aal2') {
      return {
        success: false,
        redirect: pending.portal === 'admin' ? '/admin/login' : '/login',
        error: 'O segundo fator ainda não foi confirmado.',
        mfaRequired: true,
      };
    }

    pendingMfaSessionRef.current = null;
    clearSupportState();
    commitSession(pending.session);

    return {
      success: true,
      redirect: getDefaultRedirect(pending.session.user, {
        operationalOnly: pending.portal === 'client' && pending.session.user.role === 'ADMIN',
      }),
    };
  }, [clearSupportState, commitSession]);

  const logout = useCallback(async () => {
    if (IS_REAL_AUTH) await supabase.auth.signOut();
    clearSupportState();
    commitSession(null);
  }, [clearSupportState, commitSession]);

  useEffect(() => {
    if (!IS_REAL_AUTH || !realUser?.id) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let timeoutId: number | undefined;
    const resetTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        markSessionExpiredByInactivity();
        void logout();
      }, SESSION_INACTIVITY_TIMEOUT_MS);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'focus'];
    resetTimer();
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    document.addEventListener('visibilitychange', resetTimer);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      document.removeEventListener('visibilitychange', resetTimer);
    };
  }, [logout, realUser?.id]);

  const startSupportImpersonation = useCallback(async (targetUserId: string, reason: string) => {
    const actorUser = sessionRef.current?.user;
    if (!isSuperAdmin(actorUser) && !isAdminMaster(actorUser)) {
      throw new Error('Seu perfil não possui acesso administrativo ao modo suporte.');
    }

    const result = await callAdminUsersFunction({
      action: 'start_support_impersonation',
      targetUserId,
      reason,
    });

    if (!result.supportSession) {
      throw new Error('A Function não retornou a sessão de suporte.');
    }

    if (
      result.supportSession.actorUser.id !== actorUser?.id
      || result.supportSession.targetUser.id !== targetUserId
    ) {
      throw new Error('A sessão retornada não corresponde ao operador e à conta solicitados.');
    }

    validatedSupportSessionKey.current = [
      actorUser.id,
      result.supportSession.id,
      targetUserId,
    ].join(':');
    setActiveSupportSession(result.supportSession);
    setSupportSession(result.supportSession);
    setStoredSupportCandidate(null);
    setSupportSessionIssue(null);
    setSupportValidationRetryVersion(0);
    writeStoredSupportSession(result.supportSession);
    queryClient.clear();
    clearAllCachedMarketingResumo();
    return result.supportSession;
  }, []);

  const endSupportImpersonation = useCallback(async () => {
    const current = supportSession ?? storedSupportCandidate;
    const wasSuspended = Boolean(supportSessionIssue);
    // A aba perde a autoridade do alvo imediatamente. A confirmação remota é
    // feita depois e nunca mantém dados do cliente visíveis por falha de rede.
    clearSupportState();

    if (current && IS_REAL_AUTH) {
      try {
        await callAdminUsersFunction({
          action: 'end_support_impersonation',
          sessionId: current.id,
        });
      } catch {
        if (wasSuspended) return;
        throw new Error(
          'Você saiu desta aba, mas o servidor não confirmou o encerramento. Não opere outra aba em modo suporte até a conexão voltar.',
        );
      }
    }
  }, [clearSupportState, storedSupportCandidate, supportSession, supportSessionIssue]);

  const can = useCallback((permission: Permission) => hasPermission(user, permission), [user]);

  const canAccessModule = useCallback((moduleKey: Parameters<typeof getModulePermission>[0]) => {
    return canUserAccessModuleInContext({
      actorUser: realUser,
      operationalUser,
      supportSession,
      moduleKey,
    });
  }, [operationalUser, realUser, supportSession]);

  const value = useMemo<AuthContextType>(
    () => ({
      authMode,
      realUser,
      user,
      operationalUser,
      supportTargetUser,
      session,
      supportSession,
      isSupportImpersonating: Boolean(realUser && supportSession),
      isSupportSessionValidating: Boolean(IS_REAL_AUTH && storedSupportCandidate),
      supportSessionIssue,
      isAuthLoading,
      profileError,
      isAuthenticated: Boolean(realUser),
      login,
      logout,
      startSupportImpersonation,
      endSupportImpersonation,
      retrySupportImpersonation,
      retryAuth,
      refreshProfile,
      isProfileFresh,
      completeMfaLogin,
      can,
      canAccessModule,
      isAdmin: realUser?.role === 'ADMIN',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authMode, realUser, user, operationalUser, supportTargetUser, session, supportSession, storedSupportCandidate, supportSessionIssue, isAuthLoading, profileError, login, logout, startSupportImpersonation, endSupportImpersonation, retrySupportImpersonation, retryAuth, refreshProfile, isProfileFresh, completeMfaLogin, can, canAccessModule, moduleAccessVersion],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
