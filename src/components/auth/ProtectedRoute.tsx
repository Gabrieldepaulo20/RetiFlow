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
  const { isAuthenticated, canAccessModule, isAuthLoading, user, profileError, retryAuth } = useAuth();
  const location = useLocation();
  const loginPath = moduleKey === 'admin' ? '/admin/login' : '/login';

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

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo ?? '/acesso-negado'} replace state={{ from: location.pathname, moduleKey }} />;
  }

  if (moduleKey && !canAccessModule(moduleKey)) {
    return <Navigate to="/acesso-negado" replace state={{ from: location.pathname, moduleKey }} />;
  }

  return <Outlet />;
}
