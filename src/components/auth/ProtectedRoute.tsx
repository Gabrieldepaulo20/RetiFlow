import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppModuleKey, UserRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@/components/ui/loading-screen';

interface ProtectedRouteProps {
  moduleKey?: AppModuleKey;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export default function ProtectedRoute({ moduleKey, allowedRoles, redirectTo }: ProtectedRouteProps) {
  const { isAuthenticated, canAccessModule, isAuthLoading, user } = useAuth();
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
