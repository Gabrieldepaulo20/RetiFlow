import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, Shield, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, LoginPortal } from '@/contexts/AuthContext';
import { getDefaultRedirect } from '@/services/auth/defaultRedirect';
import { useToast } from '@/hooks/use-toast';
import { getDevelopmentCredentialHint } from '@/services/auth/developmentAuthService';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { verifyFirstAvailableTotpFactor } from '@/services/auth/mfa';
import { supabase } from '@/lib/supabase';
import { consumeSessionExpiredReason } from '@/services/auth/inactivitySession';

interface AuthLoginScreenProps {
  portal: LoginPortal;
}

export default function AuthLoginScreen({ portal }: AuthLoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const { authMode, isAuthenticated, isAuthLoading, login, completeMfaLogin, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const credentials = getDevelopmentCredentialHint();

  const isAdminPortal = portal === 'admin';
  useEffect(() => {
    const reason = consumeSessionExpiredReason();
    if (reason === 'inactivity') {
      toast({
        title: 'Sessão encerrada por segurança',
        description: 'Após 8 horas sem atividade, entre novamente para continuar.',
      });
    }
  }, [toast]);

  const accounts = useMemo(
    () =>
      credentials.accounts.filter((account) =>
        isAdminPortal ? account.role === 'ADMIN' : account.role !== 'ADMIN',
      ),
    [credentials.accounts, isAdminPortal],
  );

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await login({ email, password }, portal);
    setLoading(false);

    if (result.mfaRequired) {
      setMfaRequired(true);
      setMfaCode('');
      toast({
        title: 'Confirme seu segundo fator',
        description: 'Digite o código do aplicativo autenticador para concluir o acesso.',
      });
      return;
    }

    if (result.success) {
      navigate(result.redirect);
      return;
    }

    toast({
      title: 'Credenciais inválidas',
      description: result.error || 'Verifique seu e-mail e senha.',
      variant: 'destructive',
    });
  };

  const handleMfaSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setMfaLoading(true);
    try {
      await verifyFirstAvailableTotpFactor(mfaCode);
      const result = await completeMfaLogin();

      if (result.success) {
        navigate(result.redirect);
        return;
      }

      toast({
        title: 'MFA não confirmado',
        description: result.error || 'Verifique o código informado e tente novamente.',
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Código MFA inválido',
        description: error instanceof Error ? error.message : 'Não foi possível validar o segundo fator.',
        variant: 'destructive',
      });
    } finally {
      setMfaLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingScreen
          className="min-h-screen"
          description="Verificando sua sessão antes de mostrar o login."
          label="Restaurando sessão"
        />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={getDefaultRedirect(user, { operationalOnly: !isAdminPortal && user.role === 'ADMIN' })} replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar/95 to-sidebar" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-48 -left-24 w-[500px] h-[500px] rounded-full bg-accent/8 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/20 backdrop-blur-sm flex items-center justify-center">
              {isAdminPortal ? <Shield className="w-6 h-6 text-primary" /> : <Wrench className="w-6 h-6 text-primary" />}
            </div>
            <span className="font-display font-bold text-xl text-sidebar-primary-foreground">
              {isAdminPortal ? 'GAWI Admin' : 'Portal do Cliente'}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="space-y-6"
          >
            <h2 className="text-4xl font-display font-extrabold text-sidebar-primary-foreground leading-tight">
              {isAdminPortal ? 'Gestão interna' : 'Acompanhamento operacional'}
              <br />
              <span className="text-primary">
                {isAdminPortal ? 'das empresas' : 'para seus clientes'}
              </span>
            </h2>
            <p className="text-sidebar-foreground text-base leading-relaxed max-w-md">
              {isAdminPortal
                ? 'Acesso master da GAWI para administrar usuários, módulos e empresas atendidas.'
                : 'Acesse ordens de serviço, produção e informações liberadas para o usuário autenticado.'}
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-[11px] text-sidebar-foreground/40"
          >
            © {new Date().getFullYear()} {isAdminPortal ? 'GAWI · Gestão de sistemas' : 'Retífica Premium · Software de Gestão'}
          </motion.p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/20" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 w-full max-w-[420px]"
        >
          <div className="lg:hidden text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              {isAdminPortal ? <Shield className="w-7 h-7 text-primary" /> : <Wrench className="w-7 h-7 text-primary" />}
            </div>
            <h1 className="text-xl font-display font-bold text-foreground">
              {isAdminPortal ? 'GAWI Admin' : 'Portal do Cliente'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Sistema de gestão</p>
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-display font-bold text-foreground">
              {isAdminPortal ? 'Entrar como administrador' : 'Entrar na área do cliente'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAdminPortal
                ? 'Este acesso é exclusivo para administração da plataforma pela GAWI.'
                : 'Use o e-mail e a senha da conta liberada para este usuário.'}
            </p>
          </div>

          {mfaRequired ? (
            <form onSubmit={handleMfaSubmit} className="space-y-5">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Verificação em duas etapas</p>
                <p className="mt-1">
                  Esta conta tem MFA ativo. Informe o código de 6 dígitos do seu aplicativo autenticador.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-mfa-code" className="text-sm font-medium text-foreground">Código MFA</Label>
                <Input
                  id="login-mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="h-12 rounded-xl bg-muted/30 border-border/50 text-center text-lg tracking-[0.35em] focus:bg-background focus:border-primary/50 transition-all duration-200"
                  disabled={mfaLoading}
                />
              </div>

              <Button
                type="submit"
                disabled={mfaLoading || mfaCode.length !== 6}
                className="w-full h-12 rounded-xl gap-2.5 text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              >
                {mfaLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <Shield className="w-4.5 h-4.5" />
                    Confirmar MFA
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={mfaLoading}
                onClick={() => {
                  void supabase.auth.signOut();
                  setMfaRequired(false);
                  setMfaCode('');
                }}
              >
                Voltar para e-mail e senha
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-medium text-foreground">E-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  className="h-12 rounded-xl bg-muted/30 border-border/50 focus:bg-background focus:border-primary/50 transition-all duration-200 text-sm"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-sm font-medium text-foreground">Senha</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-12 rounded-xl bg-muted/30 border-border/50 focus:bg-background focus:border-primary/50 transition-all duration-200 text-sm pr-12"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl gap-2.5 text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4.5 h-4.5" />
                    Entrar
                  </>
                )}
              </Button>
            </form>
          )}

          <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAdminPortal ? 'Área administrativa protegida' : 'Área operacional liberada por conta'}</span>
            <Link to={isAdminPortal ? '/login' : '/admin/login'} className="text-primary hover:underline">
              {isAdminPortal ? 'Ir para portal do cliente' : 'Ir para login admin'}
            </Link>
          </div>

          {authMode === 'development' && (
            <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Credenciais de desenvolvimento</p>
              <p className="mt-1">Senha temporária: <span className="font-mono">{credentials.password}</span></p>
              <div className="mt-2 space-y-1">
                {accounts.map((account) => (
                  <p key={account.id}>
                    <span className="font-medium text-foreground">{account.email}</span> · {account.role}
                  </p>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
