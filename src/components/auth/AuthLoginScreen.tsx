import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
  const portalTitle = isAdminPortal ? 'GAWI Admin' : 'Portal do Cliente';
  const portalBadge = isAdminPortal ? 'Acesso administrativo' : 'Acesso operacional';
  const panelTitle = isAdminPortal ? 'Gestão interna das empresas' : 'Acompanhamento operacional';
  const panelDescription = isAdminPortal
    ? 'Ambiente reservado para administrar contas, módulos e suporte às empresas atendidas.'
    : 'Consulte ordens de serviço, produção e informações liberadas para sua conta.';
  const formTitle = isAdminPortal ? 'Entrar como administrador' : 'Entrar na área do cliente';
  const formDescription = isAdminPortal
    ? 'Use suas credenciais administrativas para continuar.'
    : 'Use o e-mail e a senha da conta liberada para este usuário.';

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
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] w-full md:grid-cols-[minmax(300px,0.82fr)_minmax(380px,1fr)] xl:grid-cols-[minmax(420px,0.78fr)_minmax(520px,1fr)]">
        <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-primary-foreground md:flex">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,hsl(var(--sidebar-background))_0%,hsl(var(--sidebar-accent))_100%)]" />
          <div
            className="absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          <div className="relative z-10 flex min-h-[100dvh] w-full flex-col justify-between px-8 py-8 lg:px-12 lg:py-10">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-primary/15 text-sidebar-primary shadow-sm">
                {isAdminPortal ? <Shield className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-display text-lg font-bold leading-tight">{portalTitle}</p>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-sidebar-foreground/60">{portalBadge}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="max-w-[430px] space-y-5"
            >
              <h1 className="font-display text-3xl font-extrabold leading-tight text-sidebar-primary-foreground lg:text-4xl">
                {panelTitle}
              </h1>
              <p className="text-sm leading-6 text-sidebar-foreground lg:text-base">
                {panelDescription}
              </p>

              <div className="mt-8 grid gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/45 p-3 text-sm text-sidebar-foreground shadow-sm">
                <div className="flex items-center justify-between gap-4 rounded-md bg-sidebar-background/50 px-3 py-2">
                  <span>Ambiente</span>
                  <span className="font-medium text-sidebar-primary-foreground">Seguro</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md bg-sidebar-background/50 px-3 py-2">
                  <span>Acesso</span>
                  <span className="font-medium text-sidebar-primary-foreground">Autenticado</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md bg-sidebar-background/50 px-3 py-2">
                  <span>Portal</span>
                  <span className="font-medium text-sidebar-primary-foreground">{isAdminPortal ? 'Admin' : 'Cliente'}</span>
                </div>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="text-[11px] text-sidebar-foreground/45"
            >
              © {new Date().getFullYear()} {isAdminPortal ? 'GAWI · Gestão de sistemas' : 'Retífica Premium · Software de Gestão'}
            </motion.p>
          </div>
        </aside>

        <main className="relative flex min-h-[100dvh] items-start justify-center overflow-x-hidden px-4 pb-4 pt-8 sm:px-6 md:items-center md:px-8 md:py-8 lg:px-12">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)] md:bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)]" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10 flex w-full max-w-[440px] flex-col justify-center md:max-w-[460px]"
          >
            <div className="mb-4 flex items-center gap-3 md:hidden">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                {isAdminPortal ? <Shield className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold text-foreground">{portalTitle}</h1>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{portalBadge}</p>
              </div>
            </div>

            <section className="rounded-lg border border-border/80 bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-5 space-y-1.5 sm:mb-6">
                <h2 className="font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
                  {formTitle}
                </h2>
                <p className="text-sm leading-5 text-muted-foreground">
                  {formDescription}
                </p>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {mfaRequired ? (
                  <motion.form
                    key="mfa-form"
                    onSubmit={handleMfaSubmit}
                    className="space-y-4"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground sm:p-4">
                      <p className="font-semibold text-foreground">Verificação em duas etapas</p>
                      <p className="mt-1">
                        Esta conta tem MFA ativo. Informe o código de 6 dígitos do seu aplicativo autenticador.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-mfa-code" className="text-sm font-medium text-foreground">
                        Código MFA
                      </Label>
                      <Input
                        id="login-mfa-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={mfaCode}
                        onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="h-11 rounded-lg border-border/60 bg-muted/30 text-center text-lg tracking-[0.35em] transition-all duration-200 focus:border-primary/60 focus:bg-background focus:ring-2 focus:ring-primary/20 sm:h-12"
                        disabled={mfaLoading}
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={mfaLoading || mfaCode.length !== 6}
                      className="h-11 w-full gap-2 text-sm font-semibold shadow-sm shadow-primary/15 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/20 sm:h-12"
                    >
                      {mfaLoading ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                      ) : (
                        <>
                          <Shield className="h-4 w-4" />
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
                  </motion.form>
                ) : (
                  <motion.form
                    key="login-form"
                    onSubmit={handleLogin}
                    className="space-y-4"
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05, duration: 0.4 }}
                    >
                      <Label htmlFor="login-email" className="text-sm font-medium text-foreground">
                        E-mail
                      </Label>
                      <Input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="seu@email.com"
                        className="h-11 rounded-lg border-border/60 bg-muted/30 text-sm transition-all duration-200 focus:border-primary/60 focus:bg-background focus:ring-2 focus:ring-primary/20 sm:h-12"
                        disabled={loading}
                      />
                    </motion.div>

                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.4 }}
                    >
                      <Label htmlFor="login-password" className="text-sm font-medium text-foreground">
                        Senha
                      </Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="••••••••"
                          className="h-11 rounded-lg border-border/60 bg-muted/30 pr-12 text-sm transition-all duration-200 focus:border-primary/60 focus:bg-background focus:ring-2 focus:ring-primary/20 sm:h-12"
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.4 }}
                    >
                      <Button
                        type="submit"
                        disabled={loading}
                        className="h-11 w-full gap-2 text-sm font-semibold shadow-sm shadow-primary/15 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/20 sm:h-12"
                      >
                        {loading ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        ) : (
                          <>
                            <LogIn className="h-4 w-4" />
                            Entrar
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="mt-5 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>{isAdminPortal ? 'Área administrativa protegida' : 'Área operacional liberada por conta'}</span>
                <Link
                  to={isAdminPortal ? '/login' : '/admin/login'}
                  className="font-medium text-primary hover:underline"
                >
                  {isAdminPortal ? 'Ir para portal do cliente' : 'Ir para login admin'}
                </Link>
              </div>
            </section>

            {authMode === 'development' && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border bg-card/85 p-3 text-xs text-muted-foreground shadow-sm">
                <p className="font-medium text-foreground">Credenciais de desenvolvimento</p>
                <p className="mt-1">Senha temporária: <span className="font-mono break-all">{credentials.password}</span></p>
                <div className="mt-2 space-y-1">
                  {accounts.map((account) => (
                    <p key={account.id} className="break-all">
                      <span className="font-medium text-foreground">{account.email}</span>
                      <span> · {account.role}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
