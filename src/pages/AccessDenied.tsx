import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getDefaultRedirect } from '@/services/auth/defaultRedirect';

export default function AccessDenied() {
  const { user } = useAuth();
  const location = useLocation();
  const requestedPath =
    location.state && typeof location.state === 'object' && 'from' in location.state
      ? String(location.state.from)
      : '';
  const loginPath = requestedPath.startsWith('/admin') ? '/admin/login' : '/login';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-display font-bold">Acesso negado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você está autenticado, mas não possui permissão para acessar este módulo.
        </p>
        {location.state && typeof location.state === 'object' && 'from' in location.state && (
          <p className="mt-3 text-xs text-muted-foreground">
            Origem: {String(location.state.from)}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link to={user ? getDefaultRedirect(user) : loginPath}>Ir para a área permitida</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={loginPath}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao login
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
