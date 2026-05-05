import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { validatePasswordPolicy } from '@/services/auth/passwordPolicy';
import { cn } from '@/lib/utils';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const passwordValidation = useMemo(() => validatePasswordPolicy(password), [password]);
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword;
  const canSubmit = passwordValidation.valid && passwordsMatch && !submitting;

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session?.access_token));
    }).finally(() => {
      if (active) setLoadingSession(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!passwordValidation.valid) {
      toast({
        title: 'Senha ainda não atende ao padrão',
        description: 'Confira todos os requisitos de segurança antes de continuar.',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Senhas diferentes',
        description: 'Confirme a senha exatamente como digitou no primeiro campo.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      toast({
        title: 'Não foi possível definir a senha',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    await supabase.auth.signOut();
    setSuccess(true);
    toast({
      title: 'Senha definida com sucesso',
      description: 'Entre novamente e ative o MFA em Configurações > Segurança.',
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-xl">
        <div className="mb-7 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Definir senha</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Crie uma senha segura para ativar seu acesso ao Retiflow.
            </p>
          </div>
        </div>

        {loadingSession ? (
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            Validando o link seguro do Supabase...
          </div>
        ) : !hasRecoverySession ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Este link expirou ou já foi usado. Solicite um novo convite ou recuperação de senha.
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/admin/login">Voltar para o login</Link>
            </Button>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Senha criada com sucesso
              </div>
              <p className="mt-2 leading-relaxed">
                Sua conta já pode entrar no Retiflow. No primeiro acesso, recomendamos ativar MFA em Configurações &gt; Segurança.
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Ir para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Mínimo 10 caracteres, número e símbolo"
                disabled={submitting}
              />
            </div>

            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">PADRÃO DE SEGURANÇA</p>
              <div className="space-y-1.5">
                {passwordValidation.checks.map((check) => (
                  <div
                    key={check.key}
                    className={cn('flex items-center gap-2 text-xs', check.valid ? 'text-emerald-700' : 'text-muted-foreground')}
                  >
                    {check.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Repita a nova senha"
                disabled={submitting}
              />
              {confirmPassword ? (
                <p className={cn('text-xs', passwordsMatch ? 'text-emerald-700' : 'text-destructive')}>
                  {passwordsMatch ? 'As senhas conferem.' : 'As senhas ainda estão diferentes.'}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full gap-2" disabled={!canSubmit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
