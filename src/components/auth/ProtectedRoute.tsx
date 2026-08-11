import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
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
  const {
    authMode,
    isAuthenticated,
    canAccessModule,
    isAuthLoading,
    isSupportImpersonating,
    isSupportSessionValidating,
    supportSessionIssue,
    retrySupportImpersonation,
    endSupportImpersonation,
    realUser,
    user,
    profileError,
    retryAuth,
    refreshProfile,
    isProfileFresh,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const loginPath = moduleKey === 'admin' ? '/admin/login' : '/login';
  const [profileRecoveryAttempts, setProfileRecoveryAttempts] = useState(0);
  const [isEndingSuspendedSupport, setIsEndingSuspendedSupport] = useState(false);
  const shouldRevalidateRoute = authMode === 'real'
    && isAuthenticated
    && Boolean(moduleKey)
    && !isAuthLoading
    && !isSupportSessionValidating
    && !profileError;

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
    if (!shouldRevalidateRoute) return;

    // O perfil autenticado já carregado libera a navegação imediatamente. Quando
    // envelhece, a permissão é atualizada em segundo plano; RLS/RPCs continuam
    // sendo a barreira real para cada acesso a dados.
    if (isProfileFresh()) return;

    void refreshProfile({ keepCurrentSessionOnTransientError: true })
      .catch(() => {
        // Uma falha transitória preserva o perfil atual; o próximo ciclo tenta de novo.
      });
  }, [isProfileFresh, location.pathname, moduleKey, refreshProfile, shouldRevalidateRoute, user?.id]);

  const exitSuspendedSupport = async () => {
    if (isEndingSuspendedSupport) return;
    setIsEndingSuspendedSupport(true);
    try {
      await endSupportImpersonation();
    } finally {
      setIsEndingSuspendedSupport(false);
      navigate('/admin/usuarios', { replace: true });
    }
  };

  if (supportSessionIssue) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-md space-y-5 rounded-[28px] border border-amber-200/70 bg-card/95 px-7 py-7 shadow-sm backdrop-blur-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-5 w-5 text-amber-700" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">Modo suporte pausado</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {supportSessionIssue}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" onClick={retrySupportImpersonation}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar reconectar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isEndingSuspendedSupport}
              onClick={() => void exitSuspendedSupport()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {isEndingSuspendedSupport ? 'Saindo...' : 'Sair do modo suporte'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthLoading || isSupportSessionValidating) {
    return (
      <LoadingScreen
        description={isSupportSessionValidating
          ? 'Confirmando no servidor o operador, a empresa e a sessão auditada.'
          : 'Mantendo você exatamente na página atual.'}
        label={isSupportSessionValidating ? 'Validando modo suporte' : 'Restaurando sessão'}
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

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo ?? '/acesso-negado'} replace state={{ from: location.pathname, moduleKey }} />;
  }

  if (megaMasterOnly && !isSuperAdmin(realUser)) {
    return <Navigate to={redirectTo ?? '/acesso-negado'} replace state={{ from: location.pathname, moduleKey }} />;
  }

  if (moduleKey && !canAccessModule(moduleKey)) {
    const supportSafeRedirect = isSupportImpersonating
      && (moduleKey === 'admin' || moduleKey === 'settings')
      ? '/dashboard'
      : null;
    return (
      <Navigate
        to={supportSafeRedirect ?? redirectTo ?? '/acesso-negado'}
        replace
        state={{ from: location.pathname, moduleKey }}
      />
    );
  }

  return <Outlet />;
}
