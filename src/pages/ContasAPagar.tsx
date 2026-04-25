import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, ArrowLeft, CalendarCheck, CheckCircle2, Clock, Copy, FileText, MailOpen, MoreHorizontal, Pencil, PlusCircle, Search, Trash2, Wallet, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AccountPayable, PaymentMethod, PAYABLE_ENTRY_SOURCE_LABELS, PAYABLE_STATUS_COLORS, PAYABLE_STATUS_LABELS, PAYMENT_METHOD_LABELS, RECURRENCE_TYPE_LABELS } from '@/types';
import { buildPayableHistoryDescription, calculatePayableRemainingBalance, canCancelPayable, canRegisterPayment, formatPayableDueDateLabel, getDueDateUrgencyLevel, getPayableDisplayStatus, isPayableOverdue } from '@/services/domain/payables';
import PayableCreateModal from '@/components/payables/PayableCreateModal';
import PayableImportModal from '@/components/payables/PayableImportModal';
import PayableDetailsModal from '@/components/payables/PayableDetailsModal';
import PayableEmailSuggestions from '@/components/payables/PayableEmailSuggestions';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type StatusFilter = 'all' | 'pendente' | 'vencido' | 'pago' | 'cancelado';
type PeriodFilter = 'all' | 'current-month' | 'next-30' | 'overdue';
type OriginFilter = 'all' | 'MANUAL' | 'IA_IMPORT' | 'CAMERA_CAPTURE' | 'AUTO_SERIES' | 'recurring' | 'installment';
type DialogMode = 'payment' | 'edit' | 'cancel' | 'delete' | null;

function parseMoneyInput(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function PayableStatusBadge({ payable }: { payable: AccountPayable }) {
  const display = getPayableDisplayStatus(payable);
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', PAYABLE_STATUS_COLORS[display])}>{PAYABLE_STATUS_LABELS[display]}</span>;
}

function DueDateLabel({ payable }: { payable: AccountPayable }) {
  const urgency = getDueDateUrgencyLevel(payable);
  return (
    <span className={cn('text-sm', urgency === 'overdue' && 'font-medium text-destructive', urgency === 'critical' && 'font-medium text-amber-600')}>
      {formatPayableDueDateLabel(payable)}
    </span>
  );
}

function SourceBadge({ payable }: { payable: AccountPayable }) {
  const source = payable.entrySource ?? 'MANUAL';
  const tone = source === 'IA_IMPORT' ? 'bg-primary/10 text-primary' : source === 'CAMERA_CAPTURE' ? 'bg-sky-100 text-sky-700' : source === 'AUTO_SERIES' ? 'bg-violet-100 text-violet-700' : 'bg-muted text-muted-foreground';
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>{PAYABLE_ENTRY_SOURCE_LABELS[source]}</span>;
}

type PageView = 'contas' | 'sugestoes';

export default function ContasAPagar() {
  const { payables, payableCategories, updatePayable, addPayable, addPayableHistoryEntry, emailSuggestions } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageView, setPageView] = useState<PageView>('contas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchRaw, setSearchRaw] = useState('');
  const search = useDebounce(searchRaw, 250);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedPayableId, setSelectedPayableId] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editObservations, setEditObservations] = useState('');
  const [editUrgent, setEditUrgent] = useState(false);

  const pendingEmailSuggestions = useMemo(() => emailSuggestions.filter((s) => s.status === 'PENDING').length, [emailSuggestions]);

  const now = useMemo(() => new Date(), []);
  const startCurrentMonth = useMemo(() => startOfMonth(now).getTime(), [now]);
  const endCurrentMonth = useMemo(() => endOfMonth(now).getTime(), [now]);
  const categoryById = useMemo(() => new Map(payableCategories.map((category) => [category.id, category])), [payableCategories]);
  const activePayables = useMemo(() => payables.filter((payable) => payable.deletedAt == null), [payables]);
  const selectedPayable = useMemo(() => selectedPayableId ? payables.find((payable) => payable.id === selectedPayableId) ?? null : null, [payables, selectedPayableId]);
  const routeModal = searchParams.get('modal');
  const routeDetailsId = searchParams.get('id');

  const pendingLike = useMemo(() => activePayables.filter((payable) => ['PENDENTE', 'PARCIAL', 'AGENDADO'].includes(payable.status)), [activePayables]);
  const overduePayables = useMemo(() => pendingLike.filter((payable) => isPayableOverdue(payable)), [pendingLike]);
  const paidThisMonth = useMemo(() => activePayables.filter((payable) => payable.status === 'PAGO' && payable.paidAt && new Date(payable.paidAt).getTime() >= startCurrentMonth && new Date(payable.paidAt).getTime() <= endCurrentMonth), [activePayables, endCurrentMonth, startCurrentMonth]);
  const dueToday = useMemo(() => {
    const today = format(now, 'yyyy-MM-dd');
    return activePayables.filter((payable) => ['PENDENTE', 'PARCIAL', 'AGENDADO'].includes(payable.status) && payable.dueDate.startsWith(today));
  }, [activePayables, now]);

  const filtered = useMemo(() => {
    let result = activePayables;
    if (statusFilter === 'pendente') result = result.filter((payable) => ['PENDENTE', 'PARCIAL', 'AGENDADO'].includes(payable.status));
    if (statusFilter === 'vencido') result = result.filter((payable) => isPayableOverdue(payable));
    if (statusFilter === 'pago') result = result.filter((payable) => payable.status === 'PAGO');
    if (statusFilter === 'cancelado') result = result.filter((payable) => payable.status === 'CANCELADO');
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((payable) => payable.title.toLowerCase().includes(query) || (payable.supplierName?.toLowerCase().includes(query) ?? false) || (payable.docNumber?.toLowerCase().includes(query) ?? false));
    }
    if (categoryFilter !== 'all') result = result.filter((payable) => payable.categoryId === categoryFilter);
    if (originFilter !== 'all') {
      result = result.filter((payable) => {
        if (originFilter === 'recurring') return payable.recurrence !== 'NENHUMA';
        if (originFilter === 'installment') return (payable.totalInstallments ?? 0) > 1;
        return (payable.entrySource ?? 'MANUAL') === originFilter;
      });
    }
    if (periodFilter !== 'all') {
      const nowTime = now.getTime();
      const inThirtyDays = nowTime + 30 * 24 * 60 * 60 * 1000;
      result = result.filter((payable) => {
        const dueTime = new Date(payable.dueDate).getTime();
        if (periodFilter === 'current-month') return dueTime >= startCurrentMonth && dueTime <= endCurrentMonth;
        if (periodFilter === 'next-30') return dueTime >= nowTime && dueTime <= inThirtyDays;
        if (periodFilter === 'overdue') return isPayableOverdue(payable);
        return true;
      });
    }
    return [...result].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [activePayables, categoryFilter, endCurrentMonth, now, originFilter, periodFilter, search, startCurrentMonth, statusFilter]);

  const summaryCards = [
    { label: 'Total Pendente', value: fmtBRL(pendingLike.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0)), sub: `${pendingLike.length} conta${pendingLike.length !== 1 ? 's' : ''}`, Icon: Clock, iconClass: 'text-amber-600 bg-amber-50' },
    { label: 'Total Vencido', value: overduePayables.length > 0 ? fmtBRL(overduePayables.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0)) : 'Nenhum', sub: overduePayables.length > 0 ? `${overduePayables.length} em atraso` : 'Tudo em dia', Icon: AlertTriangle, iconClass: overduePayables.length > 0 ? 'text-destructive bg-destructive/10' : 'text-muted-foreground bg-muted' },
    { label: 'Pago no Mês', value: fmtBRL(paidThisMonth.reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0)), sub: format(now, "MMMM 'de' yyyy", { locale: ptBR }), Icon: CheckCircle2, iconClass: 'text-success bg-success/10' },
    { label: 'Vence Hoje', value: dueToday.length > 0 ? fmtBRL(dueToday.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0)) : '—', sub: `${dueToday.length} conta${dueToday.length !== 1 ? 's' : ''}`, Icon: CalendarCheck, iconClass: dueToday.length > 0 ? 'text-orange-600 bg-orange-50' : 'text-muted-foreground bg-muted' },
  ];

  function updateRouteModal(modal?: string, id?: string) {
    const next = new URLSearchParams(searchParams);
    next.delete('modal');
    next.delete('id');
    if (modal) next.set('modal', modal);
    if (id) next.set('id', id);
    setSearchParams(next, { replace: true });
  }

  function clearDialogFields() {
    setSelectedPayableId(null);
    setPaymentAmountInput('');
    setPaymentMethod('PIX');
    setPaymentNotes('');
    setEditTitle('');
    setEditCategoryId('');
    setEditDueDate('');
    setEditObservations('');
    setEditUrgent(false);
  }

  function resetDialogs() {
    setDialogMode(null);
    window.setTimeout(clearDialogFields, 260);
  }

  function openPayment(payable: AccountPayable) {
    setSelectedPayableId(payable.id);
    setPaymentAmountInput(calculatePayableRemainingBalance(payable).toFixed(2).replace('.', ','));
    setPaymentMethod(payable.paymentMethod ?? 'PIX');
    setPaymentNotes(payable.paymentNotes ?? '');
    setDialogMode('payment');
  }

  function openEdit(payable: AccountPayable) {
    setSelectedPayableId(payable.id);
    setEditTitle(payable.title);
    setEditCategoryId(payable.categoryId);
    setEditDueDate(payable.dueDate.slice(0, 10));
    setEditObservations(payable.observations ?? '');
    setEditUrgent(payable.isUrgent);
    setDialogMode('edit');
  }

  async function handleDuplicate(payable: AccountPayable) {
    const created = await addPayable({
      title: `${payable.title} (cópia)`,
      supplierId: payable.supplierId,
      supplierName: payable.supplierName,
      categoryId: payable.categoryId,
      docNumber: payable.docNumber,
      issueDate: payable.issueDate,
      dueDate: payable.dueDate,
      originalAmount: payable.originalAmount,
      interest: payable.interest,
      discount: payable.discount,
      finalAmount: payable.finalAmount,
      status: 'PENDENTE',
      paymentMethod: payable.paymentMethod,
      recurrence: payable.recurrence,
      recurrenceIndex: payable.recurrenceIndex,
      totalInstallments: payable.totalInstallments,
      observations: payable.observations,
      isUrgent: payable.isUrgent,
      entrySource: payable.entrySource,
      competencyDate: payable.competencyDate,
      paymentExecutionStatus: 'MANUAL',
      createdByUserId: user?.id ?? 'user-2',
    });
    addPayableHistoryEntry(buildPayableHistoryDescription({ payableId: created.id, action: 'CREATED', userId: user?.id ?? 'user-2' }));
    toast({ title: 'Conta duplicada', description: 'Criamos uma cópia pronta para ajustes rápidos.' });
  }

  async function handleSubmitPayment() {
    if (!selectedPayable) return;
    const paymentValue = parseMoneyInput(paymentAmountInput);
    const remaining = calculatePayableRemainingBalance(selectedPayable);
    if (paymentValue <= 0) {
      toast({ title: 'Informe um valor válido', description: 'O valor pago precisa ser maior que zero.', variant: 'destructive' });
      return;
    }
    const nextPaidAmount = Number(((selectedPayable.paidAmount ?? 0) + paymentValue).toFixed(2));
    const settled = nextPaidAmount >= selectedPayable.finalAmount;
    try {
      await updatePayable(selectedPayable.id, {
        status: settled ? 'PAGO' : 'PARCIAL',
        paidAmount: nextPaidAmount,
        paidAt: new Date().toISOString(),
        paidWith: paymentMethod,
        paymentNotes: paymentNotes.trim() || undefined,
      });
      addPayableHistoryEntry(buildPayableHistoryDescription({ payableId: selectedPayable.id, action: settled ? 'PAID' : 'PARTIAL_PAID', userId: user?.id ?? 'user-2', extra: { paidAmount: paymentValue, finalAmount: remaining } }));
      toast({ title: settled ? 'Pagamento registrado' : 'Pagamento parcial registrado', description: settled ? 'A conta foi marcada como paga.' : 'O saldo restante continua em aberto para acompanhamento.' });
      setDialogMode(null);
      window.setTimeout(clearDialogFields, 260);
    } catch (error) {
      toast({
        title: 'Não foi possível registrar pagamento',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function handleSubmitEdit() {
    if (!selectedPayable || !editTitle.trim() || !editCategoryId || !editDueDate) {
      toast({ title: 'Campos obrigatórios', description: 'Título, categoria e vencimento precisam estar preenchidos.', variant: 'destructive' });
      return;
    }
    try {
      await updatePayable(selectedPayable.id, {
        title: editTitle.trim(),
        categoryId: editCategoryId,
        dueDate: editDueDate,
        observations: editObservations.trim() || undefined,
        isUrgent: editUrgent,
      });
      addPayableHistoryEntry(buildPayableHistoryDescription({ payableId: selectedPayable.id, action: 'UPDATED', userId: user?.id ?? 'user-2' }));
      toast({ title: 'Conta atualizada', description: 'As informações principais foram ajustadas com sucesso.' });
      setDialogMode(null);
      window.setTimeout(clearDialogFields, 260);
    } catch (error) {
      toast({
        title: 'Não foi possível atualizar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function handleCancelSelectedPayable() {
    if (!selectedPayable) return;
    try {
      await updatePayable(selectedPayable.id, { status: 'CANCELADO' });
      addPayableHistoryEntry(buildPayableHistoryDescription({ payableId: selectedPayable.id, action: 'CANCELLED', userId: user?.id ?? 'user-2' }));
      toast({ title: 'Conta cancelada', description: 'Ela continua no histórico, mas sai do fluxo ativo.' });
      setDialogMode(null);
      window.setTimeout(clearDialogFields, 260);
    } catch (error) {
      toast({
        title: 'Não foi possível cancelar a conta',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteSelectedPayable() {
    if (!selectedPayable) return;
    try {
      await updatePayable(selectedPayable.id, { deletedAt: new Date().toISOString() });
      addPayableHistoryEntry(buildPayableHistoryDescription({ payableId: selectedPayable.id, action: 'DELETED', userId: user?.id ?? 'user-2' }));
      toast({ title: 'Conta removida da listagem', description: 'A exclusão foi lógica.' });
      setDialogMode(null);
      window.setTimeout(clearDialogFields, 260);
    } catch (error) {
      toast({
        title: 'Não foi possível excluir a conta',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  function renderActions(payable: AccountPayable) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => updateRouteModal('details', payable.id)}><FileText className="mr-2 h-4 w-4" />Ver detalhes</DropdownMenuItem>
          {canRegisterPayment(payable) ? <DropdownMenuItem onClick={() => openPayment(payable)}><Wallet className="mr-2 h-4 w-4" />Registrar pagamento</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={() => openEdit(payable)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDuplicate(payable)}><Copy className="mr-2 h-4 w-4" />Duplicar</DropdownMenuItem>
          {canCancelPayable(payable) ? <DropdownMenuItem onClick={() => { setSelectedPayableId(payable.id); setDialogMode('cancel'); }}><XCircle className="mr-2 h-4 w-4" />Cancelar</DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setSelectedPayableId(payable.id); setDialogMode('delete'); }}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Contas a Pagar</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Gerencie boletos, notas e despesas da retífica com entrada manual rápida ou importação assistida.</p>
          </div>
          {pageView === 'sugestoes' ? (
            <Button variant="outline" onClick={() => setPageView('contas')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para Contas
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setPageView('sugestoes')}
                className="relative"
              >
                <MailOpen className="mr-2 h-4 w-4" />
                Sugestões de E-mail
                {pendingEmailSuggestions > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {pendingEmailSuggestions}
                  </span>
                ) : null}
              </Button>
              <Button variant="outline" onClick={() => updateRouteModal('import')}><FileText className="mr-2 h-4 w-4" />Importar com IA</Button>
              <Button onClick={() => updateRouteModal('new')}><PlusCircle className="mr-2 h-4 w-4" />Nova Conta</Button>
            </div>
          )}
        </div>

        {pageView === 'sugestoes' ? (
          <ErrorBoundary>
            <Card>
              <CardContent className="p-6">
                <PayableEmailSuggestions onCreated={(id) => { setPageView('contas'); updateRouteModal('details', id); }} />
              </CardContent>
            </Card>
          </ErrorBoundary>
        ) : null}

        {pageView === 'contas' ? <ErrorBoundary><>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card, index) => (
            <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.2 }}>
              <Card><CardContent className="p-4"><div className="mb-3 flex items-start justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{card.label}</span><span className={cn('rounded-md p-1.5', card.iconClass)}><card.Icon className="h-3.5 w-3.5" /></span></div><p className="text-2xl font-display font-bold tracking-tight">{card.value}</p><p className="mt-1 text-xs text-muted-foreground">{card.sub}</p></CardContent></Card>
            </motion.div>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="space-y-3 border-b border-border/60 p-4">
              <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <TabsList className="h-9 flex-wrap">
                  <TabsTrigger value="all">Todas</TabsTrigger>
                  <TabsTrigger value="pendente">Pendentes</TabsTrigger>
                  <TabsTrigger value="vencido">Vencidas</TabsTrigger>
                  <TabsTrigger value="pago">Pagas</TabsTrigger>
                  <TabsTrigger value="cancelado" className="hidden sm:flex">Canceladas</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px_180px]">
                <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchRaw} onChange={(event) => setSearchRaw(event.target.value)} placeholder="Buscar por título, fornecedor ou documento..." className="pl-9" /></div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{payableCategories.filter((category) => category.isActive).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
                <Select value={originFilter} onValueChange={(value) => setOriginFilter(value as OriginFilter)}><SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as origens</SelectItem><SelectItem value="MANUAL">Cadastro manual</SelectItem><SelectItem value="IA_IMPORT">Importadas por IA</SelectItem><SelectItem value="CAMERA_CAPTURE">Captura por câmera</SelectItem><SelectItem value="AUTO_SERIES">Geradas em série</SelectItem><SelectItem value="recurring">Recorrentes</SelectItem><SelectItem value="installment">Parceladas</SelectItem></SelectContent></Select>
                <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}><SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger><SelectContent><SelectItem value="all">Todo o período</SelectItem><SelectItem value="current-month">Vencimento neste mês</SelectItem><SelectItem value="next-30">Próximos 30 dias</SelectItem><SelectItem value="overdue">Somente vencidas</SelectItem></SelectContent></Select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center"><Wallet className="h-10 w-10 text-muted-foreground" /><div className="max-w-sm"><h3 className="text-base font-semibold">Nenhuma conta encontrada</h3><p className="text-sm text-muted-foreground">Ajuste os filtros ou cadastre a primeira conta.</p></div><Button variant="outline" onClick={() => { setStatusFilter('all'); setPeriodFilter('all'); setOriginFilter('all'); setCategoryFilter('all'); setSearchRaw(''); }}>Limpar filtros</Button></div>
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((payable) => (
                  <Card key={payable.id} className={cn('border shadow-none', isPayableOverdue(payable) && 'border-destructive/30 bg-destructive/[0.02]')}>
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-start gap-2">{payable.isUrgent ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : null}<p className="truncate text-sm font-medium">{payable.title}</p></div>
                          {payable.supplierName ? <p className="mt-1 truncate text-xs text-muted-foreground">{payable.supplierName}</p> : null}
                        </div>
                        {renderActions(payable)}
                      </div>
                      <div className="flex flex-wrap gap-1.5"><span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', categoryById.get(payable.categoryId)?.color ?? 'bg-muted text-muted-foreground')}>{categoryById.get(payable.categoryId)?.name ?? 'Categoria'}</span><SourceBadge payable={payable} />{(payable.totalInstallments ?? 0) > 1 ? <Badge variant="outline">{payable.recurrenceIndex ?? 1}/{payable.totalInstallments}</Badge> : null}{payable.recurrence !== 'NENHUMA' ? <Badge variant="outline">{RECURRENCE_TYPE_LABELS[payable.recurrence]}</Badge> : null}</div>
                      <div className="flex items-center justify-between gap-3"><DueDateLabel payable={payable} /><p className="text-lg font-display font-bold tabular-nums">{fmtBRL(payable.finalAmount)}</p></div>
                      <div className="flex items-center justify-between gap-2"><PayableStatusBadge payable={payable} /><span className="text-xs text-muted-foreground">{getDueDateUrgencyLevel(payable) === 'overdue' ? 'Atenção imediata' : 'Em acompanhamento'}</span></div>
                      <div className="mt-auto grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateRouteModal('details', payable.id)}>Ver detalhes</Button>
                        {canRegisterPayment(payable) ? <Button size="sm" onClick={() => openPayment(payable)}>Registrar pagamento</Button> : <Button variant="outline" size="sm" onClick={() => openEdit(payable)}>Editar</Button>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </></ErrorBoundary> : null}
      </div>

      <PayableCreateModal open={routeModal === 'new'} onOpenChange={(open) => { if (!open) updateRouteModal(); }} onSaved={(payable) => updateRouteModal('details', payable.id)} />
      <PayableImportModal open={routeModal === 'import'} onOpenChange={(open) => { if (!open) updateRouteModal(); }} onCreated={(payable) => updateRouteModal('details', payable.id)} />
      <PayableDetailsModal open={routeModal === 'details' && !!routeDetailsId} payableId={routeDetailsId} onOpenChange={(open) => { if (!open) updateRouteModal(); }} onRequestEdit={(payable) => { updateRouteModal(); openEdit(payable); }} onRequestPayment={(payable) => { updateRouteModal(); openPayment(payable); }} />

      <Dialog open={dialogMode === 'payment'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar pagamento</DialogTitle><DialogDescription>Popup rápido para pagamento total ou parcial.</DialogDescription></DialogHeader>
          {selectedPayable ? <div className="space-y-4"><div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm"><p className="font-medium">{selectedPayable.title}</p><p className="mt-1 text-muted-foreground">Saldo em aberto: {fmtBRL(calculatePayableRemainingBalance(selectedPayable))}</p></div><div className="space-y-2"><Label>Valor pago</Label><Input value={paymentAmountInput} onChange={(event) => setPaymentAmountInput(event.target.value)} placeholder="0,00" /></div><div className="space-y-2"><Label>Forma de pagamento</Label><Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Observações</Label><Textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} rows={4} placeholder="Ex.: pagamento feito via PIX do caixa do dia" /></div></div> : null}
          <DialogFooter><Button variant="outline" onClick={resetDialogs}>Cancelar</Button><Button onClick={() => void handleSubmitPayment()}>Salvar pagamento</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === 'edit'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar conta</DialogTitle><DialogDescription>Edição rápida dos dados principais.</DialogDescription></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><Label>Título</Label><Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></div><div className="space-y-2"><Label>Categoria</Label><Select value={editCategoryId} onValueChange={setEditCategoryId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{payableCategories.filter((category) => category.isActive).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label>Observações</Label><Textarea value={editObservations} onChange={(event) => setEditObservations(event.target.value)} rows={4} /></div><label className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm md:col-span-2"><input type="checkbox" checked={editUrgent} onChange={(event) => setEditUrgent(event.target.checked)} className="h-4 w-4 rounded border-input" />Marcar esta conta como urgente</label></div>
          <DialogFooter><Button variant="outline" onClick={resetDialogs}>Cancelar</Button><Button onClick={() => void handleSubmitEdit()}>Salvar alterações</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === 'cancel'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Cancelar conta</DialogTitle><DialogDescription>Ela sai do fluxo ativo, mas continua no histórico.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={resetDialogs}>Voltar</Button><Button variant="secondary" onClick={() => void handleCancelSelectedPayable()}>Confirmar cancelamento</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={dialogMode === 'delete'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Excluir conta da listagem</DialogTitle><DialogDescription>Exclusão lógica: some da tela, mas mantém auditoria.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={resetDialogs}>Cancelar</Button><Button variant="destructive" onClick={() => void handleDeleteSelectedPayable()}>Confirmar exclusão</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  );
}
