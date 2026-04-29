import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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

    if (password.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'Use pelo menos 8 caracteres para proteger o acesso.',
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
    toast({
      title: 'Senha definida com sucesso',
      description: 'Entre novamente usando seu e-mail e a nova senha.',
    });
    navigate('/admin/login', { replace: true });
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
                placeholder="Mínimo 8 caracteres"
                disabled={submitting}
              />
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
            </div>

            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              <ShieldCheck className="h-4 w-4" />
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
