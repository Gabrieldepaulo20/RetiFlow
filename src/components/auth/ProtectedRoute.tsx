import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';
import { AppModuleKey, UserRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Button } from '@/components/ui/button';
import { isSuperAdmin } from '@/services/auth/superAdmin';

interface ProtectedRouteProps {
  moduleKey?: AppModuleKey;
  allowedRoles?: UserRole[];
  redirectTo?: string;
  megaMasterOnly?: boolean;
}

export default function ProtectedRoute({ moduleKey, allowedRoles, redirectTo, megaMasterOnly = false }: ProtectedRouteProps) {
  const { authMode, isAuthenticated, canAccessModule, isAuthLoading, realUser, user, profileError, retryAuth, refreshProfile, isProfileFresh } = useAuth();
  const location = useLocation();
  const loginPath = moduleKey === 'admin' ? '/admin/login' : '/login';
  const accessCheckKey = useMemo(
    () => `${user?.id ?? 'anonymous'}:${moduleKey ?? 'route'}:${location.pathname}`,
    [location.pathname, moduleKey, user?.id],
  );
  const [verifiedAccessKey, setVerifiedAccessKey] = useState<string | null>(null);
  const [profileRecoveryAttempts, setProfileRecoveryAttempts] = useState(0);
  const shouldRevalidateRoute = authMode === 'real' && isAuthenticated && Boolean(moduleKey) && !isAuthLoading && !profileError;

  useEffect(() => {
    if (!profileError) {
      setProfileRecoveryAttempts(0);
      return undefined;
    }

    if (profileRecoveryAttempts >= 3) return undefined;

    const delayByAttempt = [600, 1_500, 3_000] as const;
    const timeoutId = window.setTimeout(() => {
      setProfileRecoveryAttempts((attempts) => attempts + 1);
      retryAuth();
    }, delayByAttempt[profileRecoveryAttempts] ?? 3_000);

    return () => window.clearTimeout(timeoutId);
  }, [profileError, profileRecoveryAttempts, retryAuth]);

  useEffect(() => {
    if (!shouldRevalidateRoute) {
      setVerifiedAccessKey(null);
      return;
    }

    // Perfil carregado recentemente — libera rota sem spinner nem RPC adicional
    if (isProfileFresh()) {
      setVerifiedAccessKey(accessCheckKey);
      return;
    }

    let cancelled = false;
    setVerifiedAccessKey(null);

    void refreshProfile()
      .catch(() => {
        // AuthContext exibirá uma falha de perfil; a rota fica fechada enquanto isso.
      })
      .finally(() => {
        if (!cancelled) setVerifiedAccessKey(accessCheckKey);
      });

    return () => {
      cancelled = true;
    };
  }, [accessCheckKey, isProfileFresh, refreshProfile, shouldRevalidateRoute]);

  if (isAuthLoading) {
    return (
      <LoadingScreen
        description="Mantendo você exatamente na página atual."
        label="Restaurando sessão"
      />
    );
  }

  if (profileError) {
    if (profileRecoveryAttempts < 3) {
      return (
        <LoadingScreen
          description="Sua sessão existe. Estamos validando o perfil novamente para manter você na mesma tela."
          label="Reconectando sessão"
        />
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm space-y-4 rounded-[28px] border border-border/60 bg-card/80 px-8 py-7 shadow-sm backdrop-blur-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <WifiOff className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Conexão instável</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Não conseguimos validar o perfil agora. Sua sessão não foi descartada.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={retryAuth} className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            Verificar sessão
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (shouldRevalidateRoute && verifiedAccessKey !== accessCheckKey) {
    return (
      <LoadingScreen
        description="Confirmando no servidor se este usuário ainda pode acessar esta área."
        label="Verificando acesso"
      />
    );
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo ?? '/acesso-negado'} replace state={{ from: location.pathname, moduleKey }} />;
  }

  if (authMode === 'real' && moduleKey === 'admin' && !isSuperAdmin(user)) {
    return <Navigate to={redirectTo ?? '/acesso-negado'} replace state={{ from: location.pathname, moduleKey }} />;
  }

  if (megaMasterOnly && !isSuperAdmin(realUser)) {
    return <Navigate to={redirectTo ?? '/acesso-negado'} replace state={{ from: location.pathname, moduleKey }} />;
  }

  if (moduleKey && !canAccessModule(moduleKey)) {
    return <Navigate to="/acesso-negado" replace state={{ from: location.pathname, moduleKey }} />;
  }

  return <Outlet />;
}
