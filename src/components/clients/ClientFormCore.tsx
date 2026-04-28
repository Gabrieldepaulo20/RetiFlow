import { FormEvent, ReactNode, useMemo, useRef, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Loader2, Mail, MapPin, Phone, Save, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Validadores de documento ──────────────────────────────────────────────────

function validarCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r >= 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r >= 10) r = 0;
  return r === parseInt(d[10]);
}

function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (s: string, n: number) => {
    let sum = 0, pos = n - 7;
    for (let i = n; i >= 1; i--) {
      sum += parseInt(s[n - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  return calc(d, 12) === parseInt(d[12]) && calc(d, 13) === parseInt(d[13]);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientFormCoreProps {
  onSuccess: (client: Client) => void;
  onCancel: () => void;
  isModal?: boolean;
  editingClient?: Client;
}

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

// ── Micro-components ─────────────────────────────────────────────────────────

/** Labeled section divider: "IDENTIFICAÇÃO ──────" */
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/75 shrink-0 leading-none select-none">
        {label}
      </span>
      <div className="h-px flex-1 bg-border/70" />
    </div>
  );
}

/** Individual field wrapper: label + optional char count + input slot */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 leading-none">
        <span className="text-[12.5px] font-semibold text-foreground/90">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        {hint && (
          <span className="text-[10.5px] text-muted-foreground/70 tabular-nums shrink-0">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Icon-only square button for CEP / CNPJ lookup */
function LookupButton({
  loading,
  disabled,
  wide,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  wide?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'shrink-0 flex items-center justify-center gap-1.5 rounded-lg border border-border/70',
        'bg-muted/35 text-foreground/80 transition-all h-10 shadow-sm',
        'hover:bg-muted hover:text-foreground hover:border-border',
        'disabled:opacity-35 disabled:cursor-not-allowed',
        wide ? 'px-3' : 'w-10',
      )}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Search className="h-3.5 w-3.5" />}
      {wide && <span className="text-xs font-medium hidden sm:inline">Buscar</span>}
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClientFormCore({ onSuccess, onCancel, editingClient }: ClientFormCoreProps) {
  const { addClient, updateClient } = useData();
  const { toast } = useToast();

  const [form, setForm] = useState<Omit<Client, 'id' | 'createdAt'>>(() =>
    editingClient
      ? {
          name: editingClient.name,
          tradeName: editingClient.tradeName || '',
          docType: editingClient.docType,
          docNumber: editingClient.docNumber,
          phone: editingClient.phone,
          email: editingClient.email,
          cep: editingClient.cep || '',
          address: editingClient.address,
          addressNumber: editingClient.addressNumber || '',
          district: editingClient.district || '',
          city: editingClient.city,
          state: editingClient.state,
          notes: editingClient.notes,
          isActive: editingClient.isActive,
        }
      : INITIAL_FORM,
  );
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const nameLimitToastLockedRef = useRef(false);
  const nameLimitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCompany = form.docType === 'CNPJ';
  const canLookupCep = stripDigits(form.cep || '').length === 8;
  const canLookupCnpj = isCompany && stripDigits(form.docNumber).length === 14;
  const docLabel = useMemo(() => (isCompany ? 'CNPJ' : 'CPF'), [isCompany]);

  const set = <K extends keyof Omit<Client, 'id' | 'createdAt'>>(
    key: K,
    value: Omit<Client, 'id' | 'createdAt'>[K],
  ) => setForm((p) => ({ ...p, [key]: value }));

  const showNameLimitToast = () => {
    if (nameLimitToastLockedRef.current) return;
    nameLimitToastLockedRef.current = true;
    const { dismiss } = toast({
      title: 'Limite de caracteres atingido',
      description: 'O nome foi limitado para caber corretamente nas notas impressas.',
    });
    nameLimitToastTimerRef.current = setTimeout(() => {
      dismiss();
      nameLimitToastLockedRef.current = false;
    }, 12000);
  };

  const handleDocTypeChange = (value: DocType) => {
    setForm((p) => ({
      ...p,
      docType: value,
      docNumber: '',
      tradeName: value === 'CPF' ? '' : p.tradeName,
    }));
  };

  const handleCepLookup = async () => {
    if (!canLookupCep) return;
    setCepLoading(true);
    try {
      const addr = await lookupCep(form.cep || '');
      setForm((p) => ({
        ...p,
        cep: addr.cep,
        address: addr.address,
        district: addr.district,
        city: addr.city,
        state: addr.state,
      }));
    } catch (err) {
      toast({
        title: 'CEP não encontrado',
        description: err instanceof Error ? err.message : 'Verifique e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCepLoading(false);
    }
  };

  const handleCnpjLookup = async () => {
    if (!canLookupCnpj) return;
    setCnpjLoading(true);
    try {
      const co = await lookupCnpj(form.docNumber);
      setForm((p) => ({
        ...p,
        name: co.name || p.name,
        tradeName: co.tradeName || p.tradeName,
        email: co.email || p.email,
        phone: co.phone || p.phone,
        cep: co.cep || p.cep,
        address: co.address || p.address,
        addressNumber: co.addressNumber || p.addressNumber,
        district: co.district || p.district,
        city: co.city || p.city,
        state: co.state || p.state,
      }));
      if (co.cep && (!co.address || !co.district)) {
        try {
          const addr = await lookupCep(co.cep);
          setForm((p) => ({
            ...p,
            address: p.address || addr.address,
            district: p.district || addr.district,
            city: p.city || addr.city,
            state: p.state || addr.state,
          }));
        } catch { /* dados do CNPJ são suficientes */ }
      }
      toast({ title: 'Dados preenchidos pelo CNPJ.' });
    } catch (err) {
      toast({
        title: 'CNPJ não encontrado',
        description: err instanceof Error ? err.message : 'Verifique e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCnpjLoading(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const payload = sanitizeClientInput(form);

    if (
      !payload.name ||
      !payload.docNumber ||
      !payload.cep ||
      !payload.address ||
      !payload.addressNumber ||
      !payload.city ||
      !payload.state
    ) {
      toast({
        title: 'Campos obrigatórios não preenchidos',
        description: 'Nome, documento, CEP, endereço, número, cidade e estado são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    const rawDoc = stripDigits(payload.docNumber);
    if (payload.docType === 'CPF' && !validarCPF(rawDoc)) {
      toast({ title: 'CPF inválido', description: 'Verifique os dígitos do CPF informado.', variant: 'destructive' });
      return;
    }
    if (payload.docType === 'CNPJ' && !validarCNPJ(rawDoc)) {
      toast({ title: 'CNPJ inválido', description: 'Verifique os dígitos do CNPJ informado.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingClient) {
        await updateClient(editingClient.id, payload);
        toast({ title: 'Cliente atualizado com sucesso!' });
        onSuccess({ ...editingClient, ...payload });
        return;
      }
      const created = await addClient(payload);
      toast({
        title: 'Cliente criado com sucesso!',
        description: `${created.name} já está disponível no cadastro.`,
      });
      onSuccess(created);
    } catch (error) {
      toast({
        title: editingClient ? 'Erro ao atualizar cliente' : 'Erro ao criar cliente',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingClient, addClient, updateClient, onSuccess, toast]);

  // ── Shared class names ──────────────────────────────────────────────────
  const inputBase = cn(
    'h-10 border-border/70 bg-background shadow-sm',
    'text-foreground placeholder:text-muted-foreground/75',
    'focus-visible:border-primary/60 focus-visible:ring-primary/25',
  );
  const readOnly = cn(
    inputBase,
    'bg-muted/45 border-border/60 text-foreground/80',
    'cursor-default select-none',
    'focus-visible:ring-0 focus-visible:ring-offset-0',
    'placeholder:text-muted-foreground/60',
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    /**
     * Flex column: scrollable body + sticky footer
     * min-h-0 is critical — prevents flex child from exceeding parent height
     */
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain bg-muted/[0.18]">
        <div className="px-6 py-5 space-y-6">

          {/* ── IDENTIFICAÇÃO ── */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-sm sm:px-5">
            <SectionLabel label="Identificação" />

            {/* Row 1: Tipo + Documento + Nome (tudo na mesma linha) */}
            <div className={cn(
              'grid gap-3',
              isCompany
                ? 'grid-cols-1 sm:grid-cols-[130px_230px_1fr]'
                : 'grid-cols-1 sm:grid-cols-[130px_170px_1fr]',
            )}>
              <Field label="Tipo de pessoa">
                <Select
                  value={form.docType}
                  onValueChange={(v) => handleDocTypeChange(v as DocType)}
                >
                  <SelectTrigger className={inputBase}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={docLabel} required>
                <div className="flex gap-1.5">
                  <Input
                    className={cn(inputBase, 'flex-1 font-mono text-sm tracking-wide')}
                    value={form.docNumber}
                    onChange={(e) =>
                      set('docNumber', formatCpfCnpj(e.target.value, form.docType))
                    }
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canLookupCnpj) void handleCnpjLookup(); } }}
                    maxLength={CUSTOMER_FIELD_LIMITS.docNumber}
                    placeholder=""
                  />
                  {isCompany && (
                    <LookupButton
                      loading={cnpjLoading}
                      disabled={!canLookupCnpj || cnpjLoading}
                      wide
                      onClick={() => void handleCnpjLookup()}
                    />
                  )}
                </div>
              </Field>

              <Field
                label={isCompany ? 'Razão social' : 'Nome completo'}
                required
                hint={`${form.name.length}/${CUSTOMER_FIELD_LIMITS.name}`}
              >
                <Input
                  className={inputBase}
                  value={form.name}
                  onChange={(e) => {
                    if (e.target.value.length > CUSTOMER_FIELD_LIMITS.name) showNameLimitToast();
                    set('name', e.target.value.slice(0, CUSTOMER_FIELD_LIMITS.name));
                  }}
                  placeholder={isCompany ? 'Razão social da empresa' : 'Nome completo do cliente'}
                />
              </Field>
            </div>

            {/* Row 2: Nome fantasia (CNPJ) + Telefone + E-mail */}
            <div className={cn(
              'grid gap-3',
              isCompany ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2',
            )}>
              {isCompany && (
                <Field
                  label="Nome fantasia"
                  hint={`${(form.tradeName || '').length}/${CUSTOMER_FIELD_LIMITS.tradeName}`}
                >
                  <Input
                    className={inputBase}
                    value={form.tradeName || ''}
                    onChange={(e) =>
                      set('tradeName', e.target.value.slice(0, CUSTOMER_FIELD_LIMITS.tradeName))
                    }
                    placeholder="Como é conhecido no mercado"
                  />
                </Field>
              )}
              <Field label="Telefone / WhatsApp">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
                  <Input
                    className={cn(inputBase, 'pl-9')}
                    value={form.phone}
                    onChange={(e) => set('phone', formatPhone(e.target.value))}
                    maxLength={CUSTOMER_FIELD_LIMITS.phone}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </Field>
              <Field label="E-mail">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
                  <Input
                    type="email"
                    className={cn(inputBase, 'pl-9')}
                    value={form.email}
                    onChange={(e) =>
                      set('email', e.target.value.slice(0, CUSTOMER_FIELD_LIMITS.email))
                    }
                    placeholder={isCompany ? 'financeiro@empresa.com' : 'email@exemplo.com'}
                  />
                </div>
              </Field>
            </div>
          </div>

          {/* ── ENDEREÇO ── */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-sm sm:px-5">
            <SectionLabel label="Endereço" />

            {/* Row 1: CEP + Número + Logradouro (tudo na mesma linha) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_88px_1fr]">
              <Field label="CEP" required>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
                    <Input
                      className={cn(inputBase, 'pl-9 font-mono text-sm tracking-wide')}
                      value={form.cep || ''}
                      onChange={(e) => {
                        const formatted = formatCep(e.target.value);
                        const digits = stripDigits(formatted);
                        setForm((p) => ({
                          ...p,
                          cep: formatted,
                          ...(digits.length < 8 && {
                            address: '',
                            district: '',
                            city: '',
                            state: '',
                          }),
                        }));
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canLookupCep) void handleCepLookup(); } }}
                      maxLength={CUSTOMER_FIELD_LIMITS.cep}
                      placeholder=""
                    />
                  </div>
                  <LookupButton
                    loading={cepLoading}
                    disabled={!canLookupCep || cepLoading}
                    onClick={() => void handleCepLookup()}
                  />
                </div>
              </Field>

              <Field label="Número" required>
                <Input
                  className={inputBase}
                  value={form.addressNumber || ''}
                  onChange={(e) =>
                    set('addressNumber', e.target.value.slice(0, CUSTOMER_FIELD_LIMITS.addressNumber))
                  }
                  placeholder="142"
                />
              </Field>

              <Field label="Logradouro" required>
                <Input
                  className={readOnly}
                  value={form.address}
                  readOnly
                  placeholder="Preenchido pelo CEP"
                />
              </Field>
            </div>

            {/* Row 2: Bairro + Cidade + UF */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_72px]">
              <Field label="Bairro">
                <Input
                  className={readOnly}
                  value={form.district || ''}
                  readOnly
                  placeholder="—"
                />
              </Field>
              <Field label="Cidade" required>
                <Input
                  className={readOnly}
                  value={form.city}
                  readOnly
                  placeholder="—"
                />
              </Field>
              <Field label="UF" required>
                <Input
                  className={cn(readOnly, 'text-center font-mono tracking-widest')}
                  value={form.state}
                  readOnly
                  placeholder="—"
                />
              </Field>
            </div>

            {/* CEP hint — only when address is empty */}
            {!form.address && (
              <p className="text-[12px] text-foreground/70 leading-relaxed">
                Digite o CEP e pressione Tab ou clique em buscar — o endereço será preenchido automaticamente.
              </p>
            )}
          </div>

          {/* ── OBSERVAÇÕES ── */}
          <div className="space-y-4 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-sm sm:px-5">
            <SectionLabel label="Observações" />

            <Field
              label="Notas internas"
              hint={`${form.notes.length}/${CUSTOMER_FIELD_LIMITS.notes}`}
            >
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  set('notes', e.target.value.slice(0, CUSTOMER_FIELD_LIMITS.notes))
                }
                className={cn(
                  'min-h-[88px] resize-none text-sm leading-relaxed',
                  'border-border/70 bg-background shadow-sm placeholder:text-muted-foreground/75',
                  'focus-visible:border-primary/60 focus-visible:ring-primary/25',
                )}
                placeholder="Informações internas de atendimento — não aparecem nas notas fiscais."
              />
            </Field>
          </div>

          {/* Bottom breathing room */}
          <div className="h-1" />
        </div>
      </div>

      {/* ── Footer fixo ── */}
      <div className="shrink-0 flex items-center justify-between gap-4 border-t border-border/60 bg-muted/35 px-6 py-4">
        <p className="hidden text-[12px] leading-relaxed text-foreground/72 sm:block">
          Campos com <span className="font-semibold text-destructive">*</span> são obrigatórios.
          CEP e CNPJ são preenchidos automaticamente.
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-9 border-border/70 bg-background px-3 text-foreground/85 hover:bg-muted"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting}
            className="gap-1.5 px-4 h-9 font-medium"
          >
            {submitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />
            }
            {editingClient ? 'Salvar alterações' : 'Salvar cliente'}
          </Button>
        </div>
      </div>
    </form>
  );
}
