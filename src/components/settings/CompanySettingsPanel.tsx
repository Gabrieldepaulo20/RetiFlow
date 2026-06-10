import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, Check, Loader2, RotateCcw, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  getConfiguracaoEmpresaCliente,
  upsertConfiguracaoEmpresaCliente,
  type SafeCompanySettingsPayload,
  type UserCompanySettings,
} from '@/api/supabase/empresa';
import { isHexColor } from '@/services/domain/documentCustomization';
import { normalizeEmail, normalizeWhitespace, onlyDigits, toTitleCasePtBr } from '@/services/domain/textNormalization';
import { useToast } from '@/hooks/use-toast';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface CompanySettingsPanelProps {
  targetUserId?: string | null;
  targetUserName?: string | null;
}

type CompanyDraft = Pick<
  UserCompanySettings,
  | 'nomeFantasia'
  | 'endereco'
  | 'cidade'
  | 'estado'
  | 'cep'
  | 'telefone'
  | 'whatsapp'
  | 'email'
  | 'site'
  | 'instagram'
  | 'horarioAtendimento'
  | 'mensagemAtendimento'
  | 'observacaoDocumentos'
  | 'brandPrimaryColor'
  | 'brandSecondaryColor'
>;

function buildDraft(settings: UserCompanySettings): CompanyDraft {
  return {
    nomeFantasia: settings.nomeFantasia,
    endereco: settings.endereco,
    cidade: settings.cidade,
    estado: settings.estado,
    cep: settings.cep,
    telefone: settings.telefone,
    whatsapp: settings.whatsapp,
    email: settings.email,
    site: settings.site,
    instagram: settings.instagram,
    horarioAtendimento: settings.horarioAtendimento,
    mensagemAtendimento: settings.mensagemAtendimento,
    observacaoDocumentos: settings.observacaoDocumentos,
    brandPrimaryColor: settings.brandPrimaryColor,
    brandSecondaryColor: settings.brandSecondaryColor,
  };
}

function buildPayload(targetUserId: string | null | undefined, draft: CompanyDraft): SafeCompanySettingsPayload {
  return {
    idUsuarios: targetUserId ?? null,
    nomeFantasia: toTitleCasePtBr(draft.nomeFantasia),
    endereco: toTitleCasePtBr(draft.endereco),
    cidade: toTitleCasePtBr(draft.cidade),
    estado: normalizeWhitespace(draft.estado).toUpperCase().slice(0, 2),
    cep: onlyDigits(draft.cep).slice(0, 8),
    telefone: onlyDigits(draft.telefone).slice(0, 11),
    whatsapp: onlyDigits(draft.whatsapp).slice(0, 11),
    email: normalizeEmail(draft.email),
    site: normalizeWhitespace(draft.site),
    instagram: normalizeWhitespace(draft.instagram),
    horarioAtendimento: normalizeWhitespace(draft.horarioAtendimento),
    mensagemAtendimento: normalizeWhitespace(draft.mensagemAtendimento).slice(0, 500),
    observacaoDocumentos: normalizeWhitespace(draft.observacaoDocumentos).slice(0, 700),
    brandPrimaryColor: draft.brandPrimaryColor.trim(),
    brandSecondaryColor: draft.brandSecondaryColor.trim(),
  };
}

export function CompanySettingsPanel({ targetUserId, targetUserName }: CompanySettingsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', 'company-safe', targetUserId ?? 'current'],
    queryFn: () => getConfiguracaoEmpresaCliente(targetUserId ?? null),
    enabled: IS_REAL_AUTH,
    staleTime: 60_000,
  });
  const [draft, setDraft] = useState<CompanyDraft | null>(null);

  useEffect(() => {
    if (query.data) setDraft(buildDraft(query.data));
  }, [query.data]);

  const dirty = useMemo(() => {
    if (!draft || !query.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(buildDraft(query.data));
  }, [draft, query.data]);

  const mutation = useMutation({
    mutationFn: (payload: SafeCompanySettingsPayload) => upsertConfiguracaoEmpresaCliente(payload),
    onSuccess: async (saved) => {
      setDraft(buildDraft(saved));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings', 'company-safe'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'document-customization'] }),
        queryClient.invalidateQueries({ queryKey: ['settings', 'audit'] }),
      ]);
      toast({ title: 'Dados da empresa salvos' });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : 'Revise os campos e tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const updateDraft = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const save = () => {
    if (!draft) return;
    if (!isHexColor(draft.brandPrimaryColor) || !isHexColor(draft.brandSecondaryColor)) {
      toast({
        title: 'Cor inválida',
        description: 'Use hexadecimal com seis dígitos, como #1a7a8a.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate(buildPayload(targetUserId, draft));
  };

  if (!IS_REAL_AUTH) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Modo local</AlertTitle>
        <AlertDescription>As configurações da empresa dependem do Supabase em modo real.</AlertDescription>
      </Alert>
    );
  }

  if (query.isLoading || !draft) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando dados da empresa...
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Empresa indisponível</AlertTitle>
        <AlertDescription>{query.error instanceof Error ? query.error.message : 'Não foi possível carregar a configuração.'}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Building2 className="h-5 w-5" />
          Dados da empresa
          <Badge variant="outline">{targetUserName ?? 'Conta atual'}</Badge>
        </CardTitle>
        {dirty && <Badge className="w-fit" variant="secondary">Alterações pendentes</Badge>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <LockedField label="Razão social" value={query.data?.razaoSocial} />
          <div className="space-y-2">
            <Label>Nome fantasia</Label>
            <Input value={draft.nomeFantasia} onChange={(event) => updateDraft('nomeFantasia', event.target.value)} />
          </div>
          <LockedField label="CNPJ" value={query.data?.cnpj} />
          <LockedField label="Inscrição Estadual" value={query.data?.inscricaoEstadual || 'Não informada'} />
          <LockedField label="Inscrição Municipal" value={query.data?.inscricaoMunicipal || 'Não informada'} />
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Campos fiscais bloqueados</AlertTitle>
          <AlertDescription>Razão social, CNPJ e inscrições são alterados apenas por suporte administrativo validado.</AlertDescription>
        </Alert>

        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Endereço</Label>
            <Input value={draft.endereco} onChange={(event) => updateDraft('endereco', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input value={draft.cidade} onChange={(event) => updateDraft('cidade', event.target.value)} />
          </div>
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
            <div className="space-y-2">
              <Label>UF</Label>
              <Input value={draft.estado} maxLength={2} onChange={(event) => updateDraft('estado', event.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={draft.cep} onChange={(event) => updateDraft('cep', onlyDigits(event.target.value).slice(0, 8))} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={draft.telefone} onChange={(event) => updateDraft('telefone', onlyDigits(event.target.value).slice(0, 11))} />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input value={draft.whatsapp} onChange={(event) => updateDraft('whatsapp', onlyDigits(event.target.value).slice(0, 11))} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} onBlur={() => updateDraft('email', normalizeEmail(draft.email))} />
          </div>
          <div className="space-y-2">
            <Label>Site</Label>
            <Input value={draft.site} onChange={(event) => updateDraft('site', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Instagram</Label>
            <Input value={draft.instagram} onChange={(event) => updateDraft('instagram', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input value={draft.horarioAtendimento} onChange={(event) => updateDraft('horarioAtendimento', event.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Mensagem padrão</Label>
            <Textarea value={draft.mensagemAtendimento} maxLength={500} onChange={(event) => updateDraft('mensagemAtendimento', event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Observação nos documentos</Label>
            <Textarea value={draft.observacaoDocumentos} maxLength={700} onChange={(event) => updateDraft('observacaoDocumentos', event.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || mutation.isPending}
            onClick={() => query.data && setDraft(buildDraft(query.data))}
            className="gap-2"
          >
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
  );
}

function LockedField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value ?? ''} disabled className="bg-muted/50" />
    </div>
  );
}
