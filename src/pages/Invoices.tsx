/**
 * Módulo de Notas Fiscais
 *
 * Arquitetura preparada para integração com NFE.io:
 *   - Todos os campos da API NFE.io mapeados no tipo Invoice (types/index.ts)
 *   - Funções de criação/atualização isoladas → fácil substituir DataContext
 *     por chamada à API sem reescrever o componente
 *   - Status reflete ciclo de vida real: REGISTRADA → ENVIADA → (CANCELADA)
 *   - nfeIoId / nfeIoStatus / nfeIoEmittedAt prontos para resposta da API
 */
import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Invoice, InvoiceStatus, InvoiceType } from '@/types';
import {
  AlertCircle, Calendar, CheckCircle2, ChevronRight, DollarSign, Download,
  ExternalLink, FileText, Hash, Key, Link2, MoreHorizontal, PlusCircle, Printer,
  Receipt, Search, Share2, Upload, X, Building2, FileX, XCircle,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// ── Constants ────────────────────────────────────────────────────────────────

const NO_NOTE = '__none__';

const STATUS_CONFIG: Record<InvoiceStatus, {
  label: string;
  icon: typeof CheckCircle2;
  badgeClass: string;
  dotClass: string;
}> = {
  REGISTRADA: {
    label: 'Pendente',
    icon: AlertCircle,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  ENVIADA: {
    label: 'Enviada',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  CANCELADA: {
    label: 'Cancelada',
    icon: XCircle,
    badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  NFE: 'NF-e',
  NFSE: 'NFS-e',
  RECIBO: 'Recibo',
};

const TYPE_FULL_LABELS: Record<InvoiceType, string> = {
  NFE: 'NF-e — Nota Fiscal Eletrônica',
  NFSE: 'NFS-e — Nota Fiscal de Serviço',
  RECIBO: 'Recibo',
};

// ── Form state ───────────────────────────────────────────────────────────────

interface InvoiceFormState {
  clientId: string;
  noteId: string;
  type: InvoiceType;
  number: string;
  series: string;
  accessKey: string;
  issueDate: string;
  amount: string;
  description: string;
  cnpjEmitter: string;
  municipalReg: string;
  stateReg: string;
}

const EMPTY_FORM: InvoiceFormState = {
  clientId: '',
  noteId: '',
  type: 'NFSE',
  number: '',
  series: '001',
  accessKey: '',
  issueDate: new Date().toISOString().split('T')[0],
  amount: '',
  description: '',
  cnpjEmitter: '',
  municipalReg: '',
  stateReg: '',
};

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.badgeClass)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub: string;
  icon: typeof DollarSign; accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold font-display leading-tight">{value}</p>
          <p className="text-xs font-medium text-foreground/80 mt-0.5">{label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Invoices() {
  const { invoices, clients, notes, addInvoice, updateInvoice } = useData();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [searchRaw, setSearchRaw] = useState('');
  const [typeFilter, setTypeFilter] = useState<InvoiceType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<InvoiceFormState>(EMPTY_FORM);

  const search = useDebounce(searchRaw, 220);

  // ── Derived data ─────────────────────────────────────────────────────────
  const clientById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const noteById = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      if (typeFilter !== 'all' && inv.type !== typeFilter) return false;
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (q) {
        const name = clientById.get(inv.clientId)?.name.toLowerCase() ?? '';
        const num = (inv.number ?? '').toLowerCase();
        const key = (inv.accessKey ?? '').toLowerCase();
        if (!name.includes(q) && !num.includes(q) && !key.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, typeFilter, statusFilter, search, clientById]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    pending: invoices.filter(i => i.status === 'REGISTRADA').length,
    sent: invoices.filter(i => i.status === 'ENVIADA').length,
    total: invoices.filter(i => i.status !== 'CANCELADA').reduce((s, i) => s + i.amount, 0),
    month: (() => {
      const now = new Date();
      return invoices
        .filter(i => i.status !== 'CANCELADA')
        .filter(i => {
          const d = new Date(i.issueDate);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        })
        .reduce((s, i) => s + i.amount, 0);
    })(),
  }), [invoices]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const setField = <K extends keyof InvoiceFormState>(k: K, v: InvoiceFormState[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!form.clientId) { toast({ title: 'Selecione o cliente', variant: 'destructive' }); return; }
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (!amount || amount <= 0) { toast({ title: 'Informe um valor válido', variant: 'destructive' }); return; }

    addInvoice({
      clientId: form.clientId,
      noteId: (form.noteId === NO_NOTE || !form.noteId) ? undefined : form.noteId,
      type: form.type,
      number: form.number || undefined,
      series: form.series || undefined,
      accessKey: form.accessKey || undefined,
      issueDate: form.issueDate || new Date().toISOString(),
      amount,
      description: form.description || undefined,
      cnpjEmitter: form.cnpjEmitter || undefined,
      municipalReg: form.municipalReg || undefined,
      stateReg: form.stateReg || undefined,
      status: 'REGISTRADA',
    });

    toast({ title: 'Nota fiscal registrada com sucesso!' });
    setFormOpen(false);
    setForm(EMPTY_FORM);
  };

  const markAsSent = (id: string) => {
    updateInvoice(id, { status: 'ENVIADA' });
    toast({ title: 'Nota fiscal marcada como enviada.' });
    setSelectedId(null);
  };

  const cancel = (id: string) => {
    updateInvoice(id, { status: 'CANCELADA' });
    toast({ title: 'Nota fiscal cancelada.' });
    setSelectedId(null);
  };

  // ── Detail ────────────────────────────────────────────────────────────────
  const detail = selectedId ? invoices.find(i => i.id === selectedId) ?? null : null;
  const detailClient = detail ? clientById.get(detail.clientId) : null;
  const detailNote = detail?.noteId ? noteById.get(detail.noteId) : null;

  // ── Note options for the form ─────────────────────────────────────────────
  const noteOptions = useMemo(() => {
    if (!form.clientId) return notes.filter(n => n.status === 'FINALIZADO');
    return notes.filter(n => n.clientId === form.clientId && n.status === 'FINALIZADO');
  }, [notes, form.clientId]);

  const needsAccessKey = form.type === 'NFE' || form.type === 'NFSE';

  return (
    <div className="space-y-5">

      {/* ── Page header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Notas Fiscais</h1>
          <p className="text-sm text-muted-foreground">Gerencie e emita documentos fiscais</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <PlusCircle className="w-4 h-4 mr-2" /> Registrar NF
        </Button>
      </div>

      {/* ── Stats ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pendentes"
          value={stats.pending}
          sub="Aguardando envio"
          icon={AlertCircle}
          accent="text-amber-600 bg-amber-50 dark:bg-amber-950/30"
        />
        <StatCard
          label="Enviadas"
          value={stats.sent}
          sub="Confirmadas pelo fisco"
          icon={CheckCircle2}
          accent="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
        />
        <StatCard
          label="Total emitido"
          value={`R$ ${stats.total.toLocaleString('pt-BR')}`}
          sub="Excluindo canceladas"
          icon={DollarSign}
          accent="text-primary bg-primary/10"
        />
        <StatCard
          label="Mês atual"
          value={`R$ ${stats.month.toLocaleString('pt-BR')}`}
          sub="Emitidas este mês"
          icon={Calendar}
          accent="text-sky-600 bg-sky-50 dark:bg-sky-950/30"
        />
      </div>

      {/* ── Filters + Table ─── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Filters row */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Número, cliente ou chave de acesso..."
                value={searchRaw}
                onChange={e => setSearchRaw(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as InvoiceType | 'all')}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="NFE">NF-e</SelectItem>
                <SelectItem value="NFSE">NFS-e</SelectItem>
                <SelectItem value="RECIBO">Recibo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as InvoiceStatus | 'all')}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="REGISTRADA">Pendente</SelectItem>
                <SelectItem value="ENVIADA">Enviada</SelectItem>
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto -mx-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Tipo</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Nota OS</TableHead>
                  <TableHead className="hidden sm:table-cell">Emissão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(inv => {
                  const client = clientById.get(inv.clientId);
                  const note = inv.noteId ? noteById.get(inv.noteId) : null;
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedId(inv.id)}
                    >
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs h-5">
                          {TYPE_LABELS[inv.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-sm">
                        {inv.number
                          ? <span>{inv.series ? `${inv.series}/` : ''}{inv.number}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <span className="truncate block text-sm">{client?.name ?? '—'}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {note
                          ? <span className="font-mono text-xs text-primary">{note.number}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {new Date(inv.issueDate).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        R$ {inv.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedId(inv.id)}>
                              <FileText className="mr-2 h-4 w-4" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast({ title: 'PDF baixado (mock)' })}>
                              <Download className="mr-2 h-4 w-4" /> Baixar PDF
                            </DropdownMenuItem>
                            {inv.status === 'REGISTRADA' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => markAsSent(inv.id)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Marcar como enviada
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => cancel(inv.id)}
                                >
                                  <FileX className="mr-2 h-4 w-4" /> Cancelar NF
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                          <Receipt className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {search || typeFilter !== 'all' || statusFilter !== 'all'
                            ? 'Nenhuma nota encontrada com esses filtros.'
                            : 'Nenhuma nota fiscal registrada ainda.'}
                        </p>
                        {!search && typeFilter === 'all' && statusFilter === 'all' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => setFormOpen(true)}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" /> Registrar primeira NF
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {filtered.length} de {invoices.length} nota{invoices.length !== 1 ? 's' : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Sheet ─── */}
      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent className="w-full sm:w-[460px] p-0 flex flex-col" side="right">
          {detail && (
            <>
              {/* Header */}
              <div className="flex items-start gap-3 border-b border-border/60 p-5 shrink-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Receipt className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base leading-tight">
                    {TYPE_LABELS[detail.type]}
                    {detail.number ? ` nº ${detail.series ? `${detail.series}/` : ''}${detail.number}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Emitida em {new Date(detail.issueDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <StatusBadge status={detail.status} />
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Client */}
                {detailClient && (
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cliente</p>
                    <div className="rounded-xl border border-border/60 p-3 space-y-0.5">
                      <p className="font-medium text-sm">{detailClient.name}</p>
                      <p className="text-xs text-muted-foreground">{detailClient.docType}: {detailClient.docNumber}</p>
                      {detailClient.email && <p className="text-xs text-muted-foreground">{detailClient.email}</p>}
                    </div>
                  </section>
                )}

                {/* Linked note */}
                {detailNote && (
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Nota de Entrada Vinculada
                    </p>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-bold text-primary text-sm">{detailNote.number}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {detailNote.vehicleModel}{detailNote.plate ? ` — ${detailNote.plate}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-primary">
                          R$ {detailNote.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* Financial */}
                <section>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Valores</p>
                  <div className="rounded-xl border border-border/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Valor do documento</span>
                      <span className="text-xl font-bold text-primary tabular-nums">
                        R$ {detail.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Technical details */}
                {(detail.accessKey || detail.cnpjEmitter || detail.municipalReg || detail.stateReg) && (
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados Técnicos</p>
                    <div className="rounded-xl border border-border/60 divide-y divide-border/50">
                      {detail.accessKey && (
                        <div className="p-3">
                          <p className="text-[10px] text-muted-foreground mb-1">Chave de acesso</p>
                          <p className="font-mono text-[10px] break-all leading-relaxed">{detail.accessKey}</p>
                        </div>
                      )}
                      {detail.cnpjEmitter && (
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">CNPJ Emitente</span>
                          <span className="text-xs font-mono">{detail.cnpjEmitter}</span>
                        </div>
                      )}
                      {detail.municipalReg && (
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Insc. Municipal</span>
                          <span className="text-xs font-mono">{detail.municipalReg}</span>
                        </div>
                      )}
                      {detail.stateReg && (
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Insc. Estadual</span>
                          <span className="text-xs font-mono">{detail.stateReg}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* NFE.io integration status */}
                <section>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Integração NFE.io
                  </p>
                  <div className="rounded-xl border border-border/60 p-3">
                    {detail.nfeIoId ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">ID no NFE.io</span>
                          <span className="text-xs font-mono">{detail.nfeIoId}</span>
                        </div>
                        {detail.nfeIoStatus && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Status NFE.io</span>
                            <Badge variant="outline" className="text-[10px]">{detail.nfeIoStatus}</Badge>
                          </div>
                        )}
                        {detail.nfeIoEmittedAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Emitida em</span>
                            <span className="text-xs">{new Date(detail.nfeIoEmittedAt).toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ExternalLink className="h-4 w-4" />
                        <p className="text-xs">Ainda não emitida via API NFE.io</p>
                      </div>
                    )}
                  </div>
                </section>

                {detail.description && (
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Descrição</p>
                    <p className="text-sm leading-relaxed text-muted-foreground rounded-xl border border-border/60 p-3">
                      {detail.description}
                    </p>
                  </section>
                )}
              </div>

              {/* Footer actions */}
              <div className="shrink-0 border-t border-border/60 p-4 space-y-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => toast({ title: 'PDF baixado (mock)' })}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => toast({ title: 'Imprimindo... (mock)' })}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Imprimir
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => toast({ title: 'Enviado (mock)' })}>
                    <Share2 className="h-3.5 w-3.5 mr-1.5" /> Enviar
                  </Button>
                </div>
                {detail.status === 'REGISTRADA' && (
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => markAsSent(detail.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Marcar como enviada
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => cancel(detail.id)}>
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create Form Modal ─── */}
      <DialogPrimitive.Root open={formOpen} onOpenChange={v => { if (!v) setFormOpen(false); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            onPointerDownOutside={e => e.preventDefault()}
            onInteractOutside={e => e.preventDefault()}
            onEscapeKeyDown={e => e.preventDefault()}
            className={[
              'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
              'w-full h-[100dvh] sm:h-auto sm:max-h-[92vh]',
              'sm:w-[580px] sm:rounded-2xl',
              'flex flex-col overflow-hidden',
              'bg-background border border-border/60 shadow-2xl',
              'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2',
              'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
            ].join(' ')}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <DialogPrimitive.Title className="text-base font-semibold">Registrar Nota Fiscal</DialogPrimitive.Title>
                <p className="text-xs text-muted-foreground mt-0.5">Preencha os dados do documento fiscal.</p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body (scrollable) */}
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-5">

              {/* Client + Note */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Cliente *
                  </Label>
                  <Select value={form.clientId} onValueChange={v => setField('clientId', v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.filter(c => c.isActive).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} — {c.docNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> Vincular a Nota de Entrada
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Select value={form.noteId} onValueChange={v => setField('noteId', v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione uma nota finalizada" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_NOTE}>Nenhuma</SelectItem>
                      {noteOptions.map(n => {
                        const cl = clientById.get(n.clientId);
                        return (
                          <SelectItem key={n.id} value={n.id}>
                            {n.number} — {cl?.name} — R$ {n.totalAmount.toLocaleString('pt-BR')}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t border-border/50" />

              {/* Type + Number + Series */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Tipo do Documento
                  </Label>
                  <Select value={form.type} onValueChange={v => setField('type', v as InvoiceType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_FULL_LABELS) as InvoiceType[]).map(t => (
                        <SelectItem key={t} value={t}>{TYPE_FULL_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div>
                    <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5" /> Número
                    </Label>
                    <Input
                      className="h-9 font-mono"
                      value={form.number}
                      onChange={e => setField('number', e.target.value)}
                      placeholder="000001234"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1.5 block">Série</Label>
                    <Input
                      className="h-9 font-mono"
                      value={form.series}
                      onChange={e => setField('series', e.target.value)}
                      placeholder="001"
                    />
                  </div>
                </div>

                {needsAccessKey && (
                  <div>
                    <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5" /> Chave de Acesso
                    </Label>
                    <Input
                      className="h-9 font-mono text-xs"
                      value={form.accessKey}
                      onChange={e => setField('accessKey', e.target.value.replace(/\D/g, '').slice(0, 44))}
                      placeholder="44 dígitos"
                      maxLength={44}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{form.accessKey.length}/44</p>
                  </div>
                )}
              </div>

              <div className="border-t border-border/50" />

              {/* Date + Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Data de Emissão
                  </Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={form.issueDate}
                    onChange={e => setField('issueDate', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Valor (R$) *
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-9"
                    value={form.amount}
                    onChange={e => setField('amount', e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* CNPJ + Registrations */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium mb-1.5">CNPJ Emitente</Label>
                  <Input
                    className="h-9 font-mono"
                    value={form.cnpjEmitter}
                    onChange={e => setField('cnpjEmitter', e.target.value)}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium mb-1.5">Inscrição Municipal</Label>
                    <Input className="h-9" value={form.municipalReg} onChange={e => setField('municipalReg', e.target.value)} placeholder="Opcional" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1.5">Inscrição Estadual</Label>
                    <Input className="h-9" value={form.stateReg} onChange={e => setField('stateReg', e.target.value)} placeholder="Opcional" />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs font-medium mb-1.5">Descrição dos Serviços</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  className="resize-none text-sm min-h-[80px]"
                  placeholder="Serviços de retífica e recuperação de motor..."
                />
              </div>

              {/* Upload area */}
              <div className="rounded-xl border-2 border-dashed border-border/60 p-5 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer">
                <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-sm font-medium text-muted-foreground">Anexar PDF ou XML da NF</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Arraste ou clique para selecionar</p>
              </div>

            </div>

            {/* Modal footer */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-5 py-4">
              <p className="text-xs text-muted-foreground hidden sm:block">
                Campos com <span className="text-destructive">*</span> são obrigatórios.
              </p>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit} className="gap-1.5">
                  <Receipt className="h-4 w-4" /> Registrar NF
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
