import { FormEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Client, DocType } from '@/types';
import {
  CUSTOMER_FIELD_LIMITS,
  formatCep,
  formatCpfCnpj,
  formatPhone,
  lookupCep,
  lookupCnpj,
  sanitizeClientInput,
  stripDigits,
} from '@/services/domain/customers';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  Search,
  UserRound,
} from 'lucide-react';

const INITIAL_FORM: Omit<Client, 'id' | 'createdAt'> = {
  name: '',
  tradeName: '',
  docType: 'CPF',
  docNumber: '',
  phone: '',
  email: '',
  cep: '',
  address: '',
  addressNumber: '',
  district: '',
  city: '',
  state: '',
  notes: '',
  isActive: true,
};

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="space-y-1.5 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function FieldBlock({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ClientForm() {
  const { addClient } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<Omit<Client, 'id' | 'createdAt'>>(INITIAL_FORM);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const nameLimitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameLimitToastLockedRef = useRef(false);

  const isCompany = form.docType === 'CNPJ';
  const canLookupCep = stripDigits(form.cep || '').length === 8;
  const canLookupCnpj = isCompany && stripDigits(form.docNumber).length === 14;

  const docLabel = useMemo(() => (isCompany ? 'CNPJ *' : 'CPF *'), [isCompany]);

  const setField = <K extends keyof Omit<Client, 'id' | 'createdAt'>>(
    key: K,
    value: Omit<Client, 'id' | 'createdAt'>[K],
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const showNameProtectionToast = () => {
    if (nameLimitToastLockedRef.current) {
      return;
    }

    nameLimitToastLockedRef.current = true;
    const { dismiss } = toast({
      title: 'Limite de nome atingido',
      description: 'Esse limite protege a impressao da nota e evita que campos fiquem quebrados ou cortados.',
    });

    nameLimitToastTimerRef.current = setTimeout(() => {
      dismiss();
      nameLimitToastLockedRef.current = false;
      nameLimitToastTimerRef.current = null;
    }, 15000);
  };

  const handleDocTypeChange = (value: DocType) => {
    setForm((previous) => ({
      ...previous,
      docType: value,
      docNumber: '',
      tradeName: value === 'CPF' ? '' : previous.tradeName,
    }));
  };

  const handleCepLookup = async () => {
    if (!canLookupCep) {
      toast({
        title: 'CEP incompleto',
        description: 'Informe um CEP com 8 digitos.',
        variant: 'destructive',
      });
      return;
    }

    setCepLoading(true);
    try {
      const address = await lookupCep(form.cep || '');
      setForm((previous) => ({
        ...previous,
        cep: address.cep,
        address: address.address,
        district: address.district,
        city: address.city,
        state: address.state,
      }));
      toast({ title: 'Endereco preenchido pelo CEP.' });
    } catch (error) {
      toast({
        title: 'Nao foi possivel consultar o CEP',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setCepLoading(false);
    }
  };

  const handleCnpjLookup = async () => {
    if (!canLookupCnpj) {
      toast({
        title: 'CNPJ incompleto',
        description: 'Informe um CNPJ com 14 digitos.',
        variant: 'destructive',
      });
      return;
    }

    setCnpjLoading(true);
    try {
      const company = await lookupCnpj(form.docNumber);
      setForm((previous) => ({
        ...previous,
        name: company.name || previous.name,
        tradeName: company.tradeName || previous.tradeName,
        email: company.email || previous.email,
        phone: company.phone || previous.phone,
        cep: company.cep || previous.cep,
        address: company.address || previous.address,
        addressNumber: company.addressNumber || previous.addressNumber,
        district: company.district || previous.district,
        city: company.city || previous.city,
        state: company.state || previous.state,
      }));

      if (company.cep && (!company.address || !company.district || !company.city || !company.state)) {
        try {
          const cepAddress = await lookupCep(company.cep);
          setForm((previous) => ({
            ...previous,
            cep: cepAddress.cep,
            address: previous.address || cepAddress.address,
            district: previous.district || cepAddress.district,
            city: previous.city || cepAddress.city,
            state: previous.state || cepAddress.state,
          }));
        } catch {
          // A consulta do CNPJ ja trouxe dados suficientes para seguir.
        }
      }

      toast({ title: 'Dados da empresa preenchidos pelo CNPJ.' });
    } catch (error) {
      toast({
        title: 'Nao foi possivel consultar o CNPJ',
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const payload = sanitizeClientInput(form);
    if (!payload.name || !payload.docNumber || !payload.cep || !payload.address || !payload.addressNumber || !payload.city || !payload.state) {
      toast({
        title: 'Preencha os campos obrigatorios',
        description: 'Nome, documento, CEP, endereco, numero, cidade e estado sao obrigatorios.',
        variant: 'destructive',
      });
      return;
    }

    const createdClient = addClient(payload);
    toast({ title: 'Cliente criado com sucesso!' });
    navigate(`/clientes/${createdClient.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Novo Cliente</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastro responsivo com consulta publica de CEP e, quando for empresa, busca automatica por CNPJ.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-6">
            <SectionCard
              icon={<UserRound className="h-5 w-5" />}
              title="Identificacao"
              description="Escolha o tipo de cadastro e preencha os dados principais do cliente."
            >
              <div className="grid gap-4 md:grid-cols-[170px_minmax(0,1fr)]">
                <FieldBlock label="Tipo de documento">
                  <Select value={form.docType} onValueChange={(value) => handleDocTypeChange(value as DocType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CPF">CPF</SelectItem>
                      <SelectItem value="CNPJ">CNPJ</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldBlock>

                <FieldBlock label={docLabel}>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={form.docNumber}
                      onChange={(event) => setField('docNumber', formatCpfCnpj(event.target.value, form.docType))}
                      onBlur={() => {
                        if (canLookupCnpj) {
                          void handleCnpjLookup();
                        }
                      }}
                      maxLength={CUSTOMER_FIELD_LIMITS.docNumber}
                      placeholder={isCompany ? '00.000.000/0000-00' : '000.000.000-00'}
                      className="sm:flex-1"
                    />
                    {isCompany && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleCnpjLookup()}
                        disabled={!canLookupCnpj || cnpjLoading}
                        className="sm:w-auto"
                      >
                        {cnpjLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Buscar CNPJ
                      </Button>
                    )}
                  </div>
                </FieldBlock>
              </div>

              <div className={isCompany ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
                <FieldBlock
                  label={isCompany ? 'Razao social / nome principal *' : 'Nome completo *'}
                  meta={`${form.name.length}/${CUSTOMER_FIELD_LIMITS.name}`}
                >
                  <Input
                    value={form.name}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue.length > CUSTOMER_FIELD_LIMITS.name) {
                        showNameProtectionToast();
                      }
                      setField('name', nextValue.slice(0, CUSTOMER_FIELD_LIMITS.name));
                    }}
                    maxLength={CUSTOMER_FIELD_LIMITS.name}
                    placeholder={isCompany ? 'Nome principal da empresa' : 'Nome do cliente'}
                  />
                </FieldBlock>

                {isCompany && (
                  <FieldBlock
                    label="Nome fantasia"
                    meta={`${(form.tradeName || '').length}/${CUSTOMER_FIELD_LIMITS.tradeName}`}
                  >
                    <Input
                      value={form.tradeName || ''}
                      onChange={(event) => setField('tradeName', event.target.value.slice(0, CUSTOMER_FIELD_LIMITS.tradeName))}
                      maxLength={CUSTOMER_FIELD_LIMITS.tradeName}
                      placeholder="Opcional"
                    />
                  </FieldBlock>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="Telefone">
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={form.phone}
                      onChange={(event) => setField('phone', formatPhone(event.target.value))}
                      maxLength={CUSTOMER_FIELD_LIMITS.phone}
                      className="pl-9"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </FieldBlock>

                <FieldBlock label="E-mail">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(event) => setField('email', event.target.value.slice(0, CUSTOMER_FIELD_LIMITS.email))}
                      maxLength={CUSTOMER_FIELD_LIMITS.email}
                      className="pl-9"
                      placeholder={isCompany ? 'financeiro@empresa.com' : 'cliente@email.com'}
                    />
                  </div>
                </FieldBlock>
              </div>
            </SectionCard>

            <SectionCard
              icon={<MapPin className="h-5 w-5" />}
              title="Endereco"
              description="O endereco fica bloqueado para digitacao manual e e preenchido pelo CEP para manter consistencia."
            >
              <div className="grid gap-4 md:grid-cols-[170px_130px_minmax(0,1fr)]">
                <FieldBlock label="CEP *">
                  <div className="flex gap-2">
                    <Input
                      value={form.cep || ''}
                      onChange={(event) => setField('cep', formatCep(event.target.value))}
                      onBlur={() => {
                        if (canLookupCep) {
                          void handleCepLookup();
                        }
                      }}
                      maxLength={CUSTOMER_FIELD_LIMITS.cep}
                      placeholder="00000-000"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCepLookup()}
                      disabled={!canLookupCep || cepLoading}
                      className="shrink-0"
                    >
                      {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </FieldBlock>

                <FieldBlock label="Numero *">
                  <Input
                    value={form.addressNumber || ''}
                    onChange={(event) => setField('addressNumber', event.target.value.slice(0, CUSTOMER_FIELD_LIMITS.addressNumber))}
                    maxLength={CUSTOMER_FIELD_LIMITS.addressNumber}
                    placeholder="123"
                  />
                </FieldBlock>

                <FieldBlock label="Bairro">
                  <Input
                    value={form.district || ''}
                    readOnly
                    className="bg-muted/50 text-muted-foreground"
                    placeholder="Preenchido pelo CEP"
                  />
                </FieldBlock>
              </div>

              <FieldBlock label="Endereco *">
                <Input
                  value={form.address}
                  readOnly
                  className="bg-muted/50 text-muted-foreground"
                  placeholder="Preenchido automaticamente pelo CEP"
                />
              </FieldBlock>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
                <FieldBlock label="Cidade *">
                  <Input
                    value={form.city}
                    readOnly
                    className="bg-muted/50 text-muted-foreground"
                    placeholder="Preenchida pelo CEP"
                  />
                </FieldBlock>

                <FieldBlock label="UF *">
                  <Input
                    value={form.state}
                    readOnly
                    className="bg-muted/50 text-muted-foreground"
                    placeholder="UF"
                  />
                </FieldBlock>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              icon={<FileText className="h-5 w-5" />}
              title="Observacoes"
              description="Anotacoes curtas e objetivas para atendimento, faturamento ou logistica."
            >
              <FieldBlock label="Observacoes" meta={`${form.notes.length}/${CUSTOMER_FIELD_LIMITS.notes}`}>
                <Textarea
                  value={form.notes}
                  onChange={(event) => setField('notes', event.target.value.slice(0, CUSTOMER_FIELD_LIMITS.notes))}
                  maxLength={CUSTOMER_FIELD_LIMITS.notes}
                  className="min-h-[156px] resize-none"
                  placeholder="Informacoes importantes para o time."
                />
              </FieldBlock>
            </SectionCard>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            O sistema usa consultas publicas para complementar CEP e CNPJ quando houver dados disponiveis.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit">
              <Save className="mr-2 h-4 w-4" /> Salvar cliente
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
