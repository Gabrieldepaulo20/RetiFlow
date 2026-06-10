import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, Loader2, RotateCcw, Save, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  getModelosDocumentosUsuario,
  publicarModeloDocumento,
  restaurarModeloDocumentoPadrao,
  salvarRascunhoModeloDocumento,
} from '@/api/supabase/documentos';
import {
  ACTIVE_DOCUMENT_TYPES,
  DOCUMENT_TYPE_OPTIONS,
  TEMPLATE_VARIABLES,
  getDefaultDocumentTemplateConfig,
  getInvalidTemplateVariables,
  normalizeDocumentTemplateConfig,
  renderTemplateText,
  validateDocumentTemplateConfig,
  type DocumentTemplateConfig,
  type DocumentType,
} from '@/services/domain/documentCustomization';
import { useToast } from '@/hooks/use-toast';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface DocumentTemplatesPanelProps {
  targetUserId?: string | null;
}

const MOCK_VARIABLES = {
  company_name: 'Retífica Premium',
  company_phone: '(16) 3524-4661',
  company_whatsapp: '(16) 99777-0101',
  customer_name: 'Auto Peças Silva Ltda',
  vehicle_plate: 'ABC1D23',
  service_order_number: 'OS-99',
  entry_note_number: 'OS-99',
  closing_number: 'Junho/2026',
  current_date: '10/06/2026',
  total_amount: 'R$ 1.550,00',
};

function getTemplateName(documentType: DocumentType) {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.label ?? 'Documento';
}

export function DocumentTemplatesPanel({ targetUserId }: DocumentTemplatesPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<DocumentType>('entry_note');
  const [publishOpen, setPublishOpen] = useState(false);
  const query = useQuery({
    queryKey: ['settings', 'document-templates', targetUserId ?? 'current'],
    queryFn: () => getModelosDocumentosUsuario(targetUserId ?? null),
    enabled: IS_REAL_AUTH,
    staleTime: 60_000,
  });

  const selectedTemplate = useMemo(() => {
    const sameType = (query.data ?? []).filter((template) => template.documentType === documentType);
    return sameType.find((template) => template.status === 'draft')
      ?? sameType.find((template) => template.status === 'active')
      ?? sameType[0]
      ?? null;
  }, [documentType, query.data]);

  const [draft, setDraft] = useState<DocumentTemplateConfig>(() => getDefaultDocumentTemplateConfig('entry_note'));

  useEffect(() => {
    setDraft(normalizeDocumentTemplateConfig(documentType, selectedTemplate?.config ?? getDefaultDocumentTemplateConfig(documentType)));
  }, [documentType, selectedTemplate?.config, selectedTemplate?.id, selectedTemplate?.updatedAt]);

  const validation = useMemo(() => validateDocumentTemplateConfig(draft), [draft]);
  const invalidVariableSamples = useMemo(() => {
    const fields = [draft.title, draft.subtitle, draft.introText, draft.defaultObservation, draft.termsText, draft.footerText];
    return Array.from(new Set(fields.flatMap(getInvalidTemplateVariables)));
  }, [draft]);

  const saveMutation = useMutation({
    mutationFn: () => salvarRascunhoModeloDocumento({
      idUsuarios: targetUserId ?? null,
      documentType,
      name: getTemplateName(documentType),
      config: draft,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-templates'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
      toast({ title: 'Rascunho salvo' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível salvar o rascunho',
        description: error instanceof Error ? error.message : 'Revise o modelo e tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate?.id) throw new Error('Salve um rascunho antes de publicar.');
      return publicarModeloDocumento(selectedTemplate.id);
    },
    onSuccess: async () => {
      setPublishOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-templates'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
      toast({ title: 'Modelo publicado' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível publicar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => restaurarModeloDocumentoPadrao({ idUsuarios: targetUserId ?? null, documentType }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-templates'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
      toast({ title: 'Padrão restaurado' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível restaurar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const setField = <K extends keyof DocumentTemplateConfig>(key: K, value: DocumentTemplateConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setThemeField = (key: keyof DocumentTemplateConfig['theme'], value: string) => {
    setDraft((current) => ({ ...current, theme: { ...current.theme, [key]: value } }));
  };

  const save = () => {
    if (!validation.ok) {
      toast({
        title: 'Modelo inválido',
        description: validation.errors[0] ?? 'Revise os campos do modelo.',
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate();
  };

  if (!IS_REAL_AUTH) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Modelos de documento dependem do Supabase em modo real.
        </CardContent>
      </Card>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando modelos...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Modelos
            <Badge variant={selectedTemplate?.status === 'active' ? 'default' : 'secondary'}>
              {selectedTemplate?.status === 'active' ? 'Publicado' : 'Rascunho'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {query.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Modelos indisponíveis</AlertTitle>
              <AlertDescription>{query.error instanceof Error ? query.error.message : 'Não foi possível carregar os modelos.'}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getTemplateName(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">Versão {selectedTemplate?.version ?? 0}</p>
              <p className="text-muted-foreground">
                {selectedTemplate?.publishedAt ? `Publicado em ${new Date(selectedTemplate.publishedAt).toLocaleString('pt-BR')}` : 'Ainda não publicado.'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <TextInput label="Título" value={draft.title} maxLength={80} onChange={(value) => setField('title', value)} />
              <TextInput label="Subtítulo" value={draft.subtitle} maxLength={140} onChange={(value) => setField('subtitle', value)} />
              <TextareaField label="Texto inicial" value={draft.introText} maxLength={500} onChange={(value) => setField('introText', value)} />
              <TextareaField label="Observação padrão" value={draft.defaultObservation} maxLength={700} onChange={(value) => setField('defaultObservation', value)} />
              <TextareaField label="Termos" value={draft.termsText} maxLength={900} onChange={(value) => setField('termsText', value)} />
              <TextareaField label="Rodapé" value={draft.footerText} maxLength={500} onChange={(value) => setField('footerText', value)} />

              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label="Layout"
                  value={draft.layoutStyle}
                  values={['classic', 'modern', 'compact', 'premium', 'minimal', 'colorful']}
                  onChange={(value) => setField('layoutStyle', value as DocumentTemplateConfig['layoutStyle'])}
                />
                <SelectField
                  label="Tabela"
                  value={draft.tableStyle}
                  values={['classic', 'striped', 'lined', 'minimal']}
                  onChange={(value) => setField('tableStyle', value as DocumentTemplateConfig['tableStyle'])}
                />
                <SelectField
                  label="Total"
                  value={draft.totalStyle}
                  values={['boxed', 'highlight', 'minimal']}
                  onChange={(value) => setField('totalStyle', value as DocumentTemplateConfig['totalStyle'])}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <SwitchLine label="Mostrar dados da empresa" checked={draft.showCompanyData} onChange={(checked) => setField('showCompanyData', checked)} />
                <SwitchLine label="Mostrar rodapé" checked={draft.showFooter} onChange={(checked) => setField('showFooter', checked)} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <ColorInput label="Primária" value={draft.theme.primaryColor} onChange={(value) => setThemeField('primaryColor', value)} />
                <ColorInput label="Secundária" value={draft.theme.secondaryColor} onChange={(value) => setThemeField('secondaryColor', value)} />
                <ColorInput label="Destaque" value={draft.theme.accentColor} onChange={(value) => setThemeField('accentColor', value)} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border bg-background">
                <div className="p-4 text-white" style={{ backgroundColor: draft.theme.primaryColor }}>
                  <p className="text-sm font-semibold">{renderTemplateText(draft.title, MOCK_VARIABLES)}</p>
                  <p className="mt-1 text-xs text-white/80">{renderTemplateText(draft.subtitle, MOCK_VARIABLES)}</p>
                </div>
                <div className="space-y-3 p-4 text-sm">
                  <p>{renderTemplateText(draft.introText, MOCK_VARIABLES)}</p>
                  <div className="rounded-lg border">
                    <div className="grid grid-cols-[1fr_90px] border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      <span>Descrição</span>
                      <span className="text-right">Total</span>
                    </div>
                    <div className="grid grid-cols-[1fr_90px] px-3 py-2">
                      <span>Retífica de cabeçote</span>
                      <span className="text-right">R$ 380,00</span>
                    </div>
                  </div>
                  <div className="rounded-lg p-3 text-right font-bold" style={{ backgroundColor: `${draft.theme.primaryColor}14`, color: draft.theme.primaryColor }}>
                    {MOCK_VARIABLES.total_amount}
                  </div>
                  <p className="text-xs text-muted-foreground">{renderTemplateText(draft.defaultObservation, MOCK_VARIABLES)}</p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-sm font-semibold">Variáveis permitidas</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TEMPLATE_VARIABLES.map((variable) => (
                    <Badge key={variable.key} variant="secondary" className="font-mono">
                      {'{{'}{variable.key}{'}}'}
                    </Badge>
                  ))}
                </div>
              </div>

              {(validation.errors.length > 0 || invalidVariableSamples.length > 0) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Revise o modelo</AlertTitle>
                  <AlertDescription>
                    {[...validation.errors, invalidVariableSamples.length ? `Variáveis inválidas: ${invalidVariableSamples.join(', ')}` : ''].filter(Boolean).join(' ')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate()}
              className="gap-2"
            >
              {restoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Restaurar padrão
            </Button>
            <Button type="button" variant="outline" disabled={saveMutation.isPending} onClick={save} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar rascunho
            </Button>
            <Button type="button" disabled={!selectedTemplate?.id || publishMutation.isPending} onClick={() => setPublishOpen(true)} className="gap-2">
              <Send className="h-4 w-4" />
              Publicar
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              A versão publicada passa a ser usada nos novos documentos deste tipo. Documentos antigos continuam com PDF salvo ou snapshot próprio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? 'Publicando...' : 'Publicar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TextInput({ label, value, maxLength, onChange }: { label: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TextareaField({ label, value, maxLength, onChange }: { label: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SwitchLine({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1a7a8a'} onChange={(event) => onChange(event.target.value)} className="h-10 w-14 p-1" />
        <Input value={value} maxLength={7} onChange={(event) => onChange(event.target.value)} className="font-mono" />
      </div>
    </div>
  );
}
