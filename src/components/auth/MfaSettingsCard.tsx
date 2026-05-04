import { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  getMfaAssuranceLevel,
  listVerifiedTotpFactors,
  removeTotpFactor,
  startTotpEnrollment,
  verifyTotpFactor,
  type MfaEnrollment,
  type VerifiedTotpFactor,
} from '@/services/auth/mfa';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

export default function MfaSettingsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(IS_REAL_AUTH);
  const [saving, setSaving] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<'aal1' | 'aal2'>('aal1');
  const [factors, setFactors] = useState<VerifiedTotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  const refreshMfaState = async () => {
    if (!IS_REAL_AUTH) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [assurance, verifiedFactors] = await Promise.all([
        getMfaAssuranceLevel(),
        listVerifiedTotpFactors(),
      ]);
      setCurrentLevel(assurance.currentLevel);
      setFactors(verifiedFactors);
    } catch (error) {
      toast({
        title: 'Não foi possível carregar MFA',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshMfaState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartEnrollment = async () => {
    setSaving(true);
    try {
      const nextEnrollment = await startTotpEnrollment('Retiflow');
      setEnrollment(nextEnrollment);
      setVerifyCode('');
    } catch (error) {
      toast({
        title: 'Não foi possível iniciar o MFA',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!enrollment) return;

    setSaving(true);
    try {
      await verifyTotpFactor(enrollment.factorId, verifyCode);
      setEnrollment(null);
      setVerifyCode('');
      await refreshMfaState();
      toast({
        title: 'MFA ativado',
        description: 'A partir do próximo login esta conta exigirá o código do aplicativo autenticador.',
      });
    } catch (error) {
      toast({
        title: 'Código MFA inválido',
        description: error instanceof Error ? error.message : 'Confira o código e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFactor = async (factorId: string) => {
    setSaving(true);
    try {
      await removeTotpFactor(factorId);
      await refreshMfaState();
      toast({ title: 'MFA removido desta conta' });
    } catch (error) {
      toast({
        title: 'Não foi possível remover o MFA',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> Autenticação em dois fatores
          <Badge variant={factors.length > 0 ? 'default' : 'outline'}>
            {factors.length > 0 ? 'Ativo' : 'Recomendado'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!IS_REAL_AUTH ? (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>MFA disponível somente no Auth real</AlertTitle>
            <AlertDescription>
              Em desenvolvimento/mock esta área fica apenas informativa.
            </AlertDescription>
          </Alert>
        ) : null}

        <Alert>
          <Smartphone className="h-4 w-4" />
          <AlertTitle>Use Google Authenticator, Authy, 1Password ou Apple Senhas</AlertTitle>
          <AlertDescription>
            Quando a conta tiver MFA ativo, o login só termina depois do segundo fator. Sessões já abertas continuam usando refresh token seguro do Supabase.
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando status do MFA...
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/20 p-4 text-sm">
            <p className="font-semibold text-foreground">Status atual</p>
            <p className="mt-1 text-muted-foreground">
              Nível da sessão: <span className="font-mono">{currentLevel}</span> · fatores verificados: {factors.length}
            </p>
          </div>
        )}

        {factors.length > 0 ? (
          <div className="space-y-2">
            {factors.map((factor) => (
              <div key={factor.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="font-medium text-foreground">{factor.friendlyName || 'Aplicativo autenticador'}</p>
                  <p className="text-xs text-muted-foreground">Fator TOTP verificado</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={saving}
                  onClick={() => void handleRemoveFactor(factor.id)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remover
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {enrollment ? (
          <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="grid gap-4 sm:grid-cols-[180px,1fr]">
              <div className="rounded-xl border bg-white p-3">
                <img src={enrollment.qrCode} alt="QR Code para ativar MFA" className="h-auto w-full" />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-foreground">Escaneie o QR Code</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Depois informe o código de 6 dígitos gerado pelo aplicativo para confirmar a ativação.
                  </p>
                </div>
                {enrollment.secret ? (
                  <div className="rounded-xl border bg-background p-3 text-xs">
                    <p className="font-medium text-muted-foreground">Código manual</p>
                    <p className="mt-1 break-all font-mono text-foreground">{enrollment.secret}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-mfa-code">Código do aplicativo</Label>
              <Input
                id="settings-mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={verifyCode}
                onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="max-w-xs text-center text-lg tracking-[0.35em]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="gap-2"
                disabled={saving || verifyCode.length !== 6}
                onClick={() => void handleVerifyEnrollment()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Confirmar MFA
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEnrollment(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant={factors.length > 0 ? 'outline' : 'default'}
            className="gap-2"
            disabled={!IS_REAL_AUTH || saving}
            onClick={() => void handleStartEnrollment()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {factors.length > 0 ? 'Adicionar outro autenticador' : 'Ativar MFA nesta conta'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
