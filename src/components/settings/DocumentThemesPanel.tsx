import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Loader2, Palette, Power, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ativarTemaDocumento, getTemasDocumentosUsuario, salvarTemaDocumento } from '@/api/supabase/documentos';
import {
  ACTIVE_DOCUMENT_TYPES,
  DOCUMENT_THEME_PRESETS,
  DOCUMENT_TYPE_OPTIONS,
  type DocumentThemeConfig,
  type DocumentType,
} from '@/services/domain/documentCustomization';
import { useToast } from '@/hooks/use-toast';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface DocumentThemesPanelProps {
  targetUserId?: string | null;
}

export function DocumentThemesPanel({ targetUserId }: DocumentThemesPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', 'document-themes', targetUserId ?? 'current'],
    queryFn: () => getTemasDocumentosUsuario(targetUserId ?? null),
    enabled: IS_REAL_AUTH,
    staleTime: 60_000,
  });
  const [presetId, setPresetId] = useState('system');
  const selectedPreset = useMemo(
    () => DOCUMENT_THEME_PRESETS.find((preset) => preset.id === presetId) ?? DOCUMENT_THEME_PRESETS[0],
    [presetId],
  );
  const [name, setName] = useState(selectedPreset.name);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [appliesTo, setAppliesTo] = useState<DocumentType[]>(['entry_note', 'closing_report']);

  const saveMutation = useMutation({
    mutationFn: () => salvarTemaDocumento({
      idUsuarios: targetUserId ?? null,
      name,
      config: selectedPreset.config,
      appliesTo,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      isActive: true,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-themes'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
      toast({ title: 'Tema salvo' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível salvar o tema',
        description: error instanceof Error ? error.message : 'Revise o período e tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => ativarTemaDocumento(id, isActive),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-themes'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível atualizar o tema',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const applyPreset = (id: string) => {
    const preset = DOCUMENT_THEME_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setName(preset.name);
    if (preset.seasonal && preset.startMonthDay && preset.endMonthDay) {
      const year = new Date().getFullYear();
      setStartsAt(`${year}-${preset.startMonthDay}`);
      setEndsAt(`${year}-${preset.endMonthDay}`);
    }
  };

  const toggleDocType = (type: DocumentType) => {
    setAppliesTo((current) => {
      if (current.includes(type)) {
        const next = current.filter((item) => item !== type);
        return next.length > 0 ? next : current;
      }
      return [...current, type];
    });
  };

  if (!IS_REAL_AUTH) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Temas de documentos dependem do Supabase em modo real.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5" />
            Temas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`rounded-lg border bg-background p-4 text-left transition hover:border-primary/40 ${presetId === preset.id ? 'border-primary ring-2 ring-primary/15' : ''}`}
                onClick={() => applyPreset(preset.id)}
              >
                <div className="mb-3 flex gap-2">
                  <Swatch config={preset.config} />
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{preset.name}</p>
                  {preset.seasonal && <Badge variant="secondary">Sazonal</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do tema</Label>
                <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-sm font-semibold">Aplicar em</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ACTIVE_DOCUMENT_TYPES.map((type) => (
                    <label key={type} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                      <span>{DOCUMENT_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type}</span>
                      <Switch checked={appliesTo.includes(type)} onCheckedChange={() => toggleDocType(type)} />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="p-5 text-white" style={{ backgroundColor: selectedPreset.config.primaryColor }}>
                <p className="text-base font-bold">{name || selectedPreset.name}</p>
                <p className="mt-1 text-sm text-white/80">Prévia do cabeçalho</p>
              </div>
              <div className="space-y-3 p-4 text-sm">
                <div className="rounded-lg border p-3" style={{ borderColor: selectedPreset.config.borderColor }}>
                  <p className="font-semibold" style={{ color: selectedPreset.config.primaryColor }}>OS-99</p>
                  <p className="text-muted-foreground">Retífica de cabeçote</p>
                </div>
                <div className="rounded-lg p-3 text-right font-bold" style={{ backgroundColor: `${selectedPreset.config.primaryColor}14`, color: selectedPreset.config.primaryColor }}>
                  R$ 1.550,00
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button type="button" disabled={saveMutation.isPending || appliesTo.length === 0} onClick={() => saveMutation.mutate()} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar tema
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Temas cadastrados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando temas...
            </div>
          ) : (query.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              Nenhum tema cadastrado.
            </div>
          ) : (
            (query.data ?? []).map((theme) => (
              <div key={theme.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Swatch config={theme.config} />
                    <p className="font-semibold">{theme.name}</p>
                    <Badge variant={theme.isActive ? 'default' : 'secondary'}>{theme.isActive ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {theme.appliesTo.map((type) => DOCUMENT_TYPE_OPTIONS.find((item) => item.value === type)?.shortLabel ?? type).join(', ')}
                    {' · '}
                    {theme.startsAt || 'sem início'} até {theme.endsAt || 'sem fim'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate({ id: theme.id, isActive: !theme.isActive })}
                  className="gap-2"
                >
                  <Power className="h-4 w-4" />
                  {theme.isActive ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Swatch({ config }: { config: Partial<DocumentThemeConfig> }) {
  return (
    <span className="flex gap-1">
      <span className="h-6 w-6 rounded-full border" style={{ backgroundColor: config.primaryColor ?? '#1a7a8a' }} />
      <span className="h-6 w-6 rounded-full border" style={{ backgroundColor: config.secondaryColor ?? '#0f7f95' }} />
      <span className="h-6 w-6 rounded-full border" style={{ backgroundColor: config.accentColor ?? '#f4b740' }} />
    </span>
  );
}
