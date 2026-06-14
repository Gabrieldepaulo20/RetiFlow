import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, ClipboardCheck, Eye, EyeOff, LayoutDashboard, LifeBuoy, LogIn, Shield, Sparkles, Wallet, Wrench } from 'lucide-react';
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
  const panelTitle = isAdminPortal
    ? 'Gestão das empresas atendidas'
    : 'A gestão da sua retífica, sem complicação';
  const panelDescription = isAdminPortal
    ? 'Provisione contas, libere módulos e dê suporte às empresas — tudo em um só lugar.'
    : 'Ordens de serviço, financeiro e produção reunidos numa plataforma feita para o seu dia a dia.';
  const panelFeatures = isAdminPortal
    ? [
        { icon: Building2, title: 'Empresas e módulos', description: 'Provisione contas e libere recursos por cliente.' },
        { icon: LifeBuoy, title: 'Suporte assistido', description: 'Acompanhe e atue nas operações quando preciso.' },
        { icon: LayoutDashboard, title: 'Visão consolidada', description: 'Indicadores das empresas num só painel.' },
      ]
    : [
        { icon: ClipboardCheck, title: 'Ordens de serviço', description: 'Da entrada à entrega, com cada etapa no lugar.' },
        { icon: Wallet, title: 'Financeiro completo', description: 'Contas a pagar, fechamento e fluxo de caixa.' },
        { icon: LayoutDashboard, title: 'Gestão em tempo real', description: 'Produção, recebíveis e indicadores num só painel.' },
        { icon: Sparkles, title: 'Assistente com IA', description: 'Sugestões de contas direto do seu e-mail.' },
      ];
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

          <div className="relative z-10 flex min-h-[100dvh] w-full flex-col justify-between px-8 py-10 lg:px-14 lg:py-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3.5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sidebar-primary to-accent text-white shadow-lg shadow-sidebar-primary/30 ring-1 ring-white/15">
                {isAdminPortal ? <Shield className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
              </div>
              <div>
                <p className="font-display text-lg font-bold leading-tight tracking-tight text-white">{portalTitle}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/55">{portalBadge}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25 }}
              className="max-w-[470px]"
            >
              <h1 className="font-display text-[2rem] font-extrabold leading-[1.12] tracking-tight text-white lg:text-[2.6rem]">
                {panelTitle}
              </h1>
              <p className="mt-4 text-sm leading-6 text-sidebar-foreground/85 lg:text-base">
                {panelDescription}
              </p>

              <div className="mt-9 space-y-2.5">
                {panelFeatures.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.45 + index * 0.1 }}
                      className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-sm backdrop-blur-sm"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/25">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{feature.title}</p>
                        <p className="truncate text-xs text-sidebar-foreground/65">{feature.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="flex items-center gap-2.5 text-xs font-medium text-sidebar-foreground/50"
            >
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent))]" />
              {isAdminPortal ? 'Painel administrativo GAWI' : 'Plataforma de gestão para retíficas'}
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
