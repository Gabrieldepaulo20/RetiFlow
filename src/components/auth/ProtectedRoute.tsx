import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { AppModuleKey, UserRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  moduleKey?: AppModuleKey;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export default function ProtectedRoute({ moduleKey, allowedRoles, redirectTo }: ProtectedRouteProps) {
  const { authMode, isAuthenticated, canAccessModule, isAuthLoading, user, profileError, retryAuth, refreshProfile } = useAuth();
  const location = useLocation();
  const loginPath = moduleKey === 'admin' ? '/admin/login' : '/login';
  const accessCheckKey = useMemo(
    () => `${user?.id ?? 'anonymous'}:${moduleKey ?? 'route'}:${location.pathname}`,
    [location.pathname, moduleKey, user?.id],
  );
  const [verifiedAccessKey, setVerifiedAccessKey] = useState<string | null>(null);
  const shouldRevalidateRoute = authMode === 'real' && isAuthenticated && Boolean(moduleKey) && !isAuthLoading && !profileError;

  useEffect(() => {
    if (!shouldRevalidateRoute) {
      setVerifiedAccessKey(null);
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
  }, [accessCheckKey, refreshProfile, shouldRevalidateRoute]);

  if (isAuthLoading) {
    return (
      <LoadingScreen
        description="Mantendo você exatamente na página atual."
        label="Restaurando sessão"
      />
    );
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="rounded-[28px] border border-border/60 bg-card/80 px-8 py-7 shadow-sm backdrop-blur-sm space-y-4 max-w-sm w-full">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mx-auto">
            <WifiOff className="w-5 h-5 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Falha ao carregar perfil</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{profileError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={retryAuth} className="w-full">
            Tentar novamente
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

  if (moduleKey && !canAccessModule(moduleKey)) {
    return <Navigate to="/acesso-negado" replace state={{ from: location.pathname, moduleKey }} />;
  }

  return <Outlet />;
}
