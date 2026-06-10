import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Palette, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getConfiguracaoEmpresaCliente, upsertConfiguracaoEmpresaCliente } from '@/api/supabase/empresa';
import { DOCUMENT_THEME_PRESETS, isHexColor } from '@/services/domain/documentCustomization';
import { useToast } from '@/hooks/use-toast';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface DocumentAppearancePanelProps {
  targetUserId?: string | null;
}

export function DocumentAppearancePanel({ targetUserId }: DocumentAppearancePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', 'company-safe', targetUserId ?? 'current'],
    queryFn: () => getConfiguracaoEmpresaCliente(targetUserId ?? null),
    enabled: IS_REAL_AUTH,
    staleTime: 60_000,
  });
  const [primary, setPrimary] = useState('#1a7a8a');
  const [secondary, setSecondary] = useState('#0f7f95');

  useEffect(() => {
    if (!query.data) return;
    setPrimary(query.data.brandPrimaryColor);
    setSecondary(query.data.brandSecondaryColor);
  }, [query.data]);

  const dirty = useMemo(() => {
    return Boolean(query.data && (query.data.brandPrimaryColor !== primary || query.data.brandSecondaryColor !== secondary));
  }, [primary, query.data, secondary]);

  const mutation = useMutation({
    mutationFn: () => upsertConfiguracaoEmpresaCliente({
      idUsuarios: targetUserId ?? null,
      brandPrimaryColor: primary,
      brandSecondaryColor: secondary,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'company-safe'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
      toast({ title: 'Aparência salva' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível salvar a aparência',
        description: error instanceof Error ? error.message : 'Revise as cores e tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const save = () => {
    if (!isHexColor(primary) || !isHexColor(secondary)) {
      toast({
        title: 'Cor inválida',
        description: 'Use hexadecimal com seis dígitos, como #1a7a8a.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate();
  };

  const reset = () => {
    if (!query.data) return;
    setPrimary(query.data.brandPrimaryColor);
    setSecondary(query.data.brandSecondaryColor);
  };

  if (!IS_REAL_AUTH) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Aparência de documentos depende do Supabase em modo real.
        </CardContent>
      </Card>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando aparência...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Palette className="h-5 w-5" />
            Aparência
            {dirty && <Badge variant="secondary">Alterações pendentes</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <ColorInput label="Cor primária" value={primary} onChange={setPrimary} />
            <ColorInput label="Cor secundária" value={secondary} onChange={setSecondary} />
          </div>

          <div className="overflow-hidden rounded-lg border">
            <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
              <p className="text-lg font-bold">Prévia de documento</p>
              <p className="mt-1 text-sm text-white/85">Cabeçalho, totais e destaques usam estas cores quando não houver tema ativo.</p>
            </div>
            <div className="grid gap-3 bg-background p-4 md:grid-cols-3">
              <PreviewMetric label="O.S." value="OS-99" color={primary} />
              <PreviewMetric label="Cliente" value="Auto Peças Silva" color={secondary} />
              <PreviewMetric label="Total" value="R$ 1.550,00" color={primary} />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={!dirty || mutation.isPending} onClick={reset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Cancelar
            </Button>
            <Button type="button" disabled={!dirty || mutation.isPending} onClick={save} className="gap-2">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Presets visuais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_THEME_PRESETS.slice(0, 5).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-lg border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-muted/30"
                onClick={() => {
                  setPrimary(preset.config.primaryColor);
                  setSecondary(preset.config.secondaryColor);
                }}
              >
                <div className="mb-3 flex gap-2">
                  <span className="h-7 w-7 rounded-full border" style={{ backgroundColor: preset.config.primaryColor }} />
                  <span className="h-7 w-7 rounded-full border" style={{ backgroundColor: preset.config.secondaryColor }} />
                  <span className="h-7 w-7 rounded-full border" style={{ backgroundColor: preset.config.accentColor }} />
                </div>
                <p className="text-sm font-semibold">{preset.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="color" value={isHexColor(value) ? value : '#1a7a8a'} onChange={(event) => onChange(event.target.value)} className="h-10 w-14 p-1" />
        <Input value={value} maxLength={7} onChange={(event) => onChange(event.target.value)} className="font-mono" />
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
