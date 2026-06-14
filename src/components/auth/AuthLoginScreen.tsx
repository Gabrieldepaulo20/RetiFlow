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
  const brandName = 'RetiFlow';
  const brandTagline = isAdminPortal ? 'Administração da plataforma' : 'Sistema de gestão · Retífica Premium';
  const panelHeadline = isAdminPortal
    ? 'Gestão da plataforma RetiFlow.'
    : 'Tudo da sua retífica, organizado e sob controle.';
  const formTitle = 'Entrar na sua conta';
  const formDescription = 'Informe seu e-mail e senha para continuar.';

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
          <div className="absolute inset-0 bg-[linear-gradient(155deg,hsl(var(--sidebar-background))_0%,hsl(var(--sidebar-accent))_100%)]" />
          {/* Brilhos suaves para profundidade premium */}
          <div className="pointer-events-none absolute -left-28 top-[28%] h-80 w-80 rounded-full bg-sidebar-primary/25 blur-[130px]" />
          <div className="pointer-events-none absolute -right-20 bottom-[-4rem] h-72 w-72 rounded-full bg-accent/20 blur-[130px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
              backgroundSize: '38px 38px',
            }}
          />

          <div className="relative z-10 flex min-h-[100dvh] w-full flex-col justify-center px-8 py-12 lg:px-16">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-[460px]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-sidebar-primary to-accent text-white shadow-xl shadow-sidebar-primary/30 ring-1 ring-white/15">
                  {isAdminPortal ? <Shield className="h-8 w-8" /> : <Wrench className="h-8 w-8" />}
                </div>
                <span className="font-display text-4xl font-extrabold tracking-tight text-white lg:text-5xl">{brandName}</span>
              </div>

              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-sidebar-primary/90">
                {brandTagline}
              </p>
              <h1 className="mt-3 font-display text-[1.85rem] font-bold leading-[1.2] tracking-tight text-white lg:text-[2.3rem]">
                {panelHeadline}
              </h1>

              <div className="mt-10 h-px w-28 bg-gradient-to-r from-sidebar-primary/70 to-transparent" />
            </motion.div>
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
                <h1 className="truncate font-display text-lg font-bold text-foreground">{brandName}</h1>
                <p className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{brandTagline}</p>
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

              {isAdminPortal && (
                <div className="mt-5 text-center text-xs text-muted-foreground">
                  <Link to="/login" className="font-medium text-primary hover:underline">
                    Ir para portal do cliente
                  </Link>
                </div>
              )}
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
