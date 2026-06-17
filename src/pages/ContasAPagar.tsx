import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CalendarCheck, CalendarClock, CheckCircle2, Clock, Copy, FileText, MailOpen, MoreHorizontal, Pencil, PlusCircle, Repeat, Search, Sparkles, Trash2, Wallet, XCircle } from 'lucide-react';
import { getCategoryIcon } from '@/lib/payableCategoryIcon';
import { SupplierAvatar } from '@/components/payables/SupplierAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { usePayablesData } from '@/contexts/DataContext';
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
import { AccountPayable, PaymentMethod, PAYABLE_STATUS_COLORS, PAYABLE_STATUS_LABELS, PAYMENT_METHOD_LABELS, RECURRENCE_TYPE_LABELS } from '@/types';
import { buildPayableHistoryDescription, calculatePayableFinalAmount, calculatePayableRemainingBalance, canCancelPayable, canEditPayable, canRegisterPayment, formatPayableDueDateLabel, getContextualQuestion, getDueDateUrgencyLevel, getPayableDisplayStatus, isPayableEditRestricted, isPayableOverdue, type ContextualActionKind } from '@/services/domain/payables';
import { calculatePayablesCashFlowSummary } from '@/services/domain/payablesCashFlow';
import { ContextualQuestionBanner } from '@/components/payables/ContextualQuestionBanner';
import { getGmailOAuthFeedback } from '@/services/domain/gmailOAuth';
import {
  normalizeDecimalInputDraft,
  normalizeMoneyInput,
  normalizeWhitespace,
  parsePositiveNumber,
  toTitleCasePtBr,
} from '@/services/domain/textNormalization';
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
  return normalizeMoneyInput(value).value ?? 0;
}

function PayableStatusBadge({ payable }: { payable: AccountPayable }) {
  const display = getPayableDisplayStatus(payable);
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', PAYABLE_STATUS_COLORS[display])}>{PAYABLE_STATUS_LABELS[display]}</span>;
}

function DueDateLabel({ payable }: { payable: AccountPayable }) {
  const urgency = getDueDateUrgencyLevel(payable);
  return (
    <span className={cn(
      'text-xs font-medium',
      urgency === 'overdue' && 'font-semibold text-destructive',
      urgency === 'critical' && 'font-semibold text-amber-700',
      urgency !== 'overdue' && urgency !== 'critical' && 'text-muted-foreground',
    )}>
      {formatPayableDueDateLabel(payable)}
    </span>
  );
}

type PageView = 'contas' | 'sugestoes';

export default function ContasAPagar() {
  const { payables, payableCategories, updatePayable, addPayable, addPayableHistoryEntry, emailSuggestions } = usePayablesData();
  const { user, isSupportImpersonating } = useAuth();
  // Sugestões em modo suporte: a leitura é escopada à empresa via
  // get_sugestoes_email_contexto_suporte e as ações usam RPCs de escrita
  // auditadas por contexto. Gmail/scan continuam ocultos no componente.
  const suggestionsEnabled = true;
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageView, setPageView] = useState<PageView>(() => searchParams.get('view') === 'sugestoes' ? 'sugestoes' : 'contas');
  const effectiveView: PageView = suggestionsEnabled ? pageView : 'contas';
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
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editFavorecidoTipo, setEditFavorecidoTipo] = useState<'FORNECEDOR' | 'FUNCIONARIO'>('FORNECEDOR');
  const [editOriginalAmount, setEditOriginalAmount] = useState('');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('PIX');
  // Perguntas contextuais dispensadas nesta sessão (não reaparecem após o usuário fechar).
  const [dismissedQuestions, setDismissedQuestions] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('payable-contextual-dismissed');
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  const pendingEmailSuggestions = useMemo(() => emailSuggestions.filter((s) => s.status === 'PENDING').length, [emailSuggestions]);

  const now = useMemo(() => new Date(), []);
  const startCurrentMonth = useMemo(() => startOfMonth(now).getTime(), [now]);
  const endCurrentMonth = useMemo(() => endOfMonth(now).getTime(), [now]);
  const categoryById = useMemo(() => new Map(payableCategories.map((category) => [category.id, category])), [payableCategories]);
  const activePayables = useMemo(() => payables.filter((payable) => payable.deletedAt == null), [payables]);
  const selectedPayable = useMemo(() => selectedPayableId ? payables.find((payable) => payable.id === selectedPayableId) ?? null : null, [payables, selectedPayableId]);
  const routeModal = searchParams.get('modal');
  const routeDetailsId = searchParams.get('id');

  useEffect(() => {
    setPageView(searchParams.get('view') === 'sugestoes' ? 'sugestoes' : 'contas');
  }, [searchParams]);

  useEffect(() => {
    const feedback = getGmailOAuthFeedback(searchParams.get('gmail'), searchParams.get('message'));
    if (!feedback) return;

    toast(feedback);

    const next = new URLSearchParams(searchParams);
    next.delete('gmail');
    next.delete('message');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

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
        const dueTime = parseISO(payable.dueDate).getTime();
        if (periodFilter === 'current-month') return dueTime >= startCurrentMonth && dueTime <= endCurrentMonth;
        if (periodFilter === 'next-30') return dueTime >= nowTime && dueTime <= inThirtyDays;
        if (periodFilter === 'overdue') return isPayableOverdue(payable);
        return true;
      });
    }
    return [...result].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [activePayables, categoryFilter, endCurrentMonth, now, originFilter, periodFilter, search, startCurrentMonth, statusFilter]);

  const hasDueToday = dueToday.length > 0;
  const hasOverdue = overduePayables.length > 0;
  const paidThisMonthTotal = paidThisMonth.reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0);
  const cashFlowSummary = useMemo(
    () => calculatePayablesCashFlowSummary({ payables: activePayables, categories: payableCategories, now }),
    [activePayables, now, payableCategories],
  );
  const summaryCards = [
    {
      label: 'Vence hoje',
      value: hasDueToday ? fmtBRL(dueToday.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0)) : 'Nada pra hoje',
      sub: hasDueToday ? `${dueToday.length} conta${dueToday.length !== 1 ? 's' : ''} no prazo` : 'Você pode respirar',
      Icon: CalendarCheck,
      tone: hasDueToday ? 'urgent' : 'ok',
    },
    {
      label: 'Em atraso',
      value: hasOverdue ? fmtBRL(overduePayables.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0)) : 'Tudo em dia',
      sub: hasOverdue ? `${overduePayables.length} venceram` : 'Nenhum atraso',
      Icon: AlertTriangle,
      tone: hasOverdue ? 'danger' : 'ok',
    },
    {
      label: 'A pagar',
      value: fmtBRL(pendingLike.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0)),
      sub: `${pendingLike.length} conta${pendingLike.length !== 1 ? 's' : ''} pendente${pendingLike.length !== 1 ? 's' : ''}`,
      Icon: Clock,
      tone: 'warn',
    },
    {
      label: 'Pago no mês',
      value: fmtBRL(paidThisMonthTotal),
      sub: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
      Icon: CheckCircle2,
      tone: 'success',
    },
  ] as const;

  const kpiToneStyles: Record<typeof summaryCards[number]['tone'], { card: string; icon: string; value: string }> = {
    urgent: {
      card: 'border-amber-300/70 bg-gradient-to-br from-amber-50 via-white to-white shadow-amber-100/40',
      icon: 'bg-amber-500 text-white shadow-md shadow-amber-200',
      value: 'text-amber-900',
    },
    danger: {
      card: 'border-destructive/40 bg-gradient-to-br from-red-50 via-white to-white shadow-red-100/40',
      icon: 'bg-destructive text-destructive-foreground shadow-md shadow-red-200',
      value: 'text-destructive',
    },
    warn: {
      card: 'border-primary/30 bg-gradient-to-br from-primary/[0.05] via-white to-white shadow-primary/10',
      icon: 'bg-primary text-primary-foreground shadow-md shadow-primary/20',
      value: 'text-foreground',
    },
    success: {
      card: 'border-emerald-300/70 bg-gradient-to-br from-emerald-50 via-white to-white shadow-emerald-100/40',
      icon: 'bg-emerald-600 text-white shadow-md shadow-emerald-200',
      value: 'text-emerald-900',
    },
    ok: {
      card: 'border-border bg-gradient-to-br from-muted/30 via-white to-white',
      icon: 'bg-muted text-muted-foreground',
      value: 'text-muted-foreground',
    },
  };

  function updateRouteModal(modal?: string, id?: string) {
    const next = new URLSearchParams(searchParams);
    next.delete('modal');
    next.delete('id');
    if (modal) next.set('modal', modal);
    if (id) next.set('id', id);
    setSearchParams(next, { replace: true });
  }

  function updatePageView(value: PageView) {
    const next = new URLSearchParams(searchParams);
    if (value === 'sugestoes') {
      next.set('view', 'sugestoes');
    } else {
      next.delete('view');
    }
    setPageView(value);
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
    setEditSupplierName('');
    setEditFavorecidoTipo('FORNECEDOR');
    setEditOriginalAmount('');
    setEditDocNumber('');
    setEditPaymentMethod('PIX');
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
    setEditSupplierName(payable.supplierName ?? '');
    setEditFavorecidoTipo(payable.favorecidoTipo === 'FUNCIONARIO' ? 'FUNCIONARIO' : 'FORNECEDOR');
    setEditOriginalAmount(payable.originalAmount.toFixed(2).replace('.', ','));
    setEditDocNumber(payable.docNumber ?? '');
    setEditPaymentMethod(payable.paymentMethod ?? 'PIX');
    setDialogMode('edit');
  }

  function dismissContextualQuestion(payableId: string) {
    setDismissedQuestions((previous) => {
      const next = new Set(previous);
      next.add(payableId);
      try {
        sessionStorage.setItem('payable-contextual-dismissed', JSON.stringify([...next]));
      } catch {
        // sessionStorage indisponível — mantém apenas em memória.
      }
      return next;
    });
  }

  function handleContextualAction(payableId: string, action: ContextualActionKind) {
    const payable = payables.find((item) => item.id === payableId);
    if (!payable) return;
    if (action === 'mark_paid') {
      openPayment(payable);
    } else if (action === 'reschedule') {
      openEdit(payable);
    }
    dismissContextualQuestion(payableId);
  }

  async function handleDuplicate(payable: AccountPayable) {
    const created = await addPayable({
      title: `${payable.title} (cópia)`,
      supplierId: payable.supplierId,
      supplierName: payable.supplierName,
      favorecidoTipo: payable.favorecidoTipo,
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
    const paymentResult = parsePositiveNumber(paymentAmountInput, { allowZero: false, fieldLabel: 'valor pago' });
    const paymentValue = paymentResult.value ?? 0;
    const remaining = calculatePayableRemainingBalance(selectedPayable);
    if (paymentResult.error) {
      toast({ title: 'Informe um valor válido', description: paymentResult.error, variant: 'destructive' });
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
        paymentNotes: normalizeWhitespace(paymentNotes) || undefined,
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
    const normalizedTitle = toTitleCasePtBr(editTitle);
    const normalizedSupplierName = toTitleCasePtBr(editSupplierName);
    const normalizedDocNumber = normalizeWhitespace(editDocNumber);
    const normalizedObservations = normalizeWhitespace(editObservations);

    if (!selectedPayable || !normalizedTitle || !editCategoryId || !editDueDate) {
      toast({ title: 'Campos obrigatórios', description: 'Título, categoria e vencimento precisam estar preenchidos.', variant: 'destructive' });
      return;
    }
    const restricted = isPayableEditRestricted(selectedPayable);
    const amountResult = parsePositiveNumber(editOriginalAmount, { allowZero: false, fieldLabel: 'valor da conta' });
    const parsedAmount = amountResult.value ?? 0;
    if (!restricted && amountResult.error) {
      toast({ title: 'Informe um valor válido', description: amountResult.error, variant: 'destructive' });
      return;
    }
    try {
      const patch: Partial<AccountPayable> = {
        title: normalizedTitle,
        categoryId: editCategoryId,
        dueDate: editDueDate,
        observations: normalizedObservations || undefined,
        isUrgent: editUrgent,
      };
      if (!restricted) {
        if (normalizedSupplierName) patch.supplierName = normalizedSupplierName;
        patch.favorecidoTipo = editFavorecidoTipo;
        patch.originalAmount = parsedAmount;
        patch.finalAmount = calculatePayableFinalAmount(parsedAmount, selectedPayable.interest, selectedPayable.discount);
        if (normalizedDocNumber) patch.docNumber = normalizedDocNumber;
        patch.paymentMethod = editPaymentMethod;
      }
      await updatePayable(selectedPayable.id, patch);
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
      toast({ title: 'Conta excluída definitivamente', description: 'A conta e os anexos vinculados foram removidos.' });
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
          {canEditPayable(payable) ? <DropdownMenuItem onClick={() => openEdit(payable)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem> : null}
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
      <div className="space-y-4 overflow-x-hidden sm:space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/20 sm:h-12 sm:w-12 sm:rounded-2xl">
              <Wallet className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight sm:text-2xl">Contas a Pagar</h1>
              <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">Boletos, notas e despesas — entrada manual rápida ou importação assistida por IA.</p>
            </div>
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
            <Tabs value={effectiveView} onValueChange={(value) => updatePageView(value as PageView)}>
              <TabsList className={cn('grid h-10 rounded-xl', suggestionsEnabled ? 'grid-cols-2' : 'grid-cols-1')}>
                <TabsTrigger value="contas" className="gap-2">
                  <Wallet className="h-4 w-4" />
                  Contas
                </TabsTrigger>
                {suggestionsEnabled ? (
                  <TabsTrigger value="sugestoes" className="relative gap-2">
                    <MailOpen className="h-4 w-4" />
                    Sugestões
                    {pendingEmailSuggestions > 0 ? (
                      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {pendingEmailSuggestions}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
            {effectiveView === 'contas' ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="outline" onClick={() => updateRouteModal('import')} className="min-w-0 px-3 text-sm"><Sparkles className="mr-1.5 h-4 w-4 sm:mr-2" />Importar com IA</Button>
              <Button onClick={() => updateRouteModal('new')} className="min-w-0 px-3 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"><PlusCircle className="mr-1.5 h-4 w-4 sm:mr-2" />Nova Conta</Button>
            </div>
            ) : null}
          </div>
        </div>

        {effectiveView === 'sugestoes' ? (
          <ErrorBoundary>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <PayableEmailSuggestions supportMode={isSupportImpersonating} onCreated={(id) => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('view');
                  next.set('modal', 'details');
                  next.set('id', id);
                  setPageView('contas');
                  setSearchParams(next, { replace: true });
                }} />
              </CardContent>
            </Card>
          </ErrorBoundary>
        ) : null}

        {effectiveView === 'contas' ? <ErrorBoundary><>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {summaryCards.map((card, index) => {
            const tone = kpiToneStyles[card.tone];
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.25 }}
                className={cn(
                  'relative overflow-hidden rounded-xl border p-2.5 shadow-sm sm:rounded-2xl sm:p-4',
                  tone.card,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8', tone.icon)}>
                    <card.Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </span>
                </div>
                <p className={cn('mt-2 truncate text-base font-display font-bold tracking-tight tabular-nums leading-tight sm:text-xl', tone.value)}>{card.value}</p>
                <p className="mt-1 line-clamp-1 text-[10px] font-medium text-muted-foreground">{card.sub}</p>
              </motion.div>
            );
          })}
        </div>

        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.04] via-background to-background">
          <CardContent className="grid gap-3 p-2.5 sm:p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Fluxo de caixa</p>
                  <p className="hidden text-xs text-muted-foreground sm:block">Saídas previstas, atrasos e folha para priorizar pagamentos sem surpresa.</p>
                </div>
                <Badge variant="outline" className="hidden rounded-full sm:flex">
                  Base: contas pendentes, parciais e agendadas
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-background p-2 sm:p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Próx. 7 dias</p>
                  <p className="mt-1.5 truncate text-sm font-bold tabular-nums sm:text-base">{fmtBRL(cashFlowSummary.nextSevenTotal)}</p>
                  <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">{cashFlowSummary.nextSevenCount} vencimento{cashFlowSummary.nextSevenCount === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-xl border bg-background p-2 sm:p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Próx. 30 dias</p>
                  <p className="mt-1.5 truncate text-sm font-bold tabular-nums sm:text-base">{fmtBRL(cashFlowSummary.nextThirtyTotal)}</p>
                  <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">{cashFlowSummary.nextThirtyCount} conta{cashFlowSummary.nextThirtyCount === 1 ? '' : 's'} no radar</p>
                </div>
                <div className="rounded-xl border border-destructive/20 bg-red-50/60 p-2 sm:p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive/80">Atrasadas</p>
                  <p className="mt-1.5 truncate text-sm font-bold tabular-nums text-destructive sm:text-base">{fmtBRL(cashFlowSummary.overdueTotal)}</p>
                  <p className="mt-0.5 hidden text-[11px] text-destructive/70 sm:block">{cashFlowSummary.overdueCount} pendência{cashFlowSummary.overdueCount === 1 ? '' : 's'} crítica{cashFlowSummary.overdueCount === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 sm:p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">Mão de obra</p>
                  <p className="mt-1.5 truncate text-sm font-bold tabular-nums text-emerald-950 sm:text-base">{fmtBRL(cashFlowSummary.laborTotal)}</p>
                  <p className="mt-0.5 hidden text-[11px] text-emerald-800 sm:block">{cashFlowSummary.laborCount} lançamento{cashFlowSummary.laborCount === 1 ? '' : 's'} identificado{cashFlowSummary.laborCount === 1 ? '' : 's'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-background p-2.5 sm:p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Próximos vencimentos</p>
                  <p className="text-xs text-muted-foreground">Ordem real de prioridade pela data.</p>
                </div>
                <CalendarClock className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 space-y-2">
                {cashFlowSummary.nextDue.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhuma conta pendente no momento.
                  </div>
                ) : cashFlowSummary.nextDue.map((payable) => (
                  <button
                    key={payable.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => updateRouteModal('details', payable.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{payable.title}</span>
                      <span className="block text-xs text-muted-foreground">{format(parseISO(payable.dueDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{fmtBRL(calculatePayableRemainingBalance(payable))}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="space-y-2.5 border-b border-border/60 p-2.5 sm:p-3">
              <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <TabsList className="h-auto min-h-8 w-full justify-start overflow-x-auto rounded-xl p-1 sm:w-auto">
                  <TabsTrigger value="all" className="shrink-0 text-xs">Todas</TabsTrigger>
                  <TabsTrigger value="pendente" className="shrink-0 text-xs">Pendentes</TabsTrigger>
                  <TabsTrigger value="vencido" className="shrink-0 text-xs">Vencidas</TabsTrigger>
                  <TabsTrigger value="pago" className="shrink-0 text-xs">Pagas</TabsTrigger>
                  <TabsTrigger value="cancelado" className="hidden text-xs sm:flex">Canceladas</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={searchRaw} onChange={(event) => setSearchRaw(event.target.value)} placeholder="Buscar conta..." className="h-9 pl-8 text-sm" /></div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="h-9 min-w-0 text-xs sm:text-sm"><SelectValue placeholder="Categorias" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{payableCategories.filter((category) => category.isActive).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
                <Select value={originFilter} onValueChange={(value) => setOriginFilter(value as OriginFilter)}><SelectTrigger className="h-9 min-w-0 text-xs sm:text-sm"><SelectValue placeholder="Origens" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as origens</SelectItem><SelectItem value="MANUAL">Cadastro manual</SelectItem><SelectItem value="IA_IMPORT">Importadas por IA</SelectItem><SelectItem value="CAMERA_CAPTURE">Captura por câmera</SelectItem><SelectItem value="AUTO_SERIES">Geradas em série</SelectItem><SelectItem value="recurring">Recorrentes</SelectItem><SelectItem value="installment">Parceladas</SelectItem></SelectContent></Select>
                <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}><SelectTrigger className="h-9 min-w-0 text-xs sm:text-sm"><SelectValue placeholder="Período" /></SelectTrigger><SelectContent><SelectItem value="all">Todo o período</SelectItem><SelectItem value="current-month">Vencimento neste mês</SelectItem><SelectItem value="next-30">Próximos 30 dias</SelectItem><SelectItem value="overdue">Somente vencidas</SelectItem></SelectContent></Select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center"><Wallet className="h-10 w-10 text-muted-foreground" /><div className="max-w-sm"><h3 className="text-base font-semibold">Nenhuma conta encontrada</h3><p className="text-sm text-muted-foreground">Ajuste os filtros ou cadastre a primeira conta.</p></div><Button variant="outline" onClick={() => { setStatusFilter('all'); setPeriodFilter('all'); setOriginFilter('all'); setCategoryFilter('all'); setSearchRaw(''); }}>Limpar filtros</Button></div>
            ) : (
              <div className="grid items-start gap-2 p-2.5 sm:gap-3 sm:p-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((payable, index) => {
                  const urgency = getDueDateUrgencyLevel(payable);
                  const displayStatus = getPayableDisplayStatus(payable);
                  const overdue = isPayableOverdue(payable);
                  const category = categoryById.get(payable.categoryId);
                  const CategoryIcon = getCategoryIcon(category?.icon);
                  const isPaid = displayStatus === 'PAGO';
                  const isCancelled = displayStatus === 'CANCELADO';
                  const contextualQuestion = getContextualQuestion(payable, now);

                  const rail = overdue
                    ? 'bg-destructive'
                    : urgency === 'critical' || payable.isUrgent
                      ? 'bg-amber-500'
                      : isPaid
                        ? 'bg-emerald-500'
                        : isCancelled
                          ? 'bg-muted-foreground/50'
                          : displayStatus === 'AGENDADO'
                            ? 'bg-cyan-500'
                            : 'bg-primary/70';

                  const valueColor = overdue
                    ? 'text-destructive'
                    : isPaid
                      ? 'text-emerald-700'
                      : isCancelled
                        ? 'text-muted-foreground line-through decoration-2 decoration-muted-foreground/40'
                        : 'text-foreground';

                  const primaryAction = canRegisterPayment(payable)
                    ? { label: 'Registrar pagamento', onClick: () => openPayment(payable) }
                    : canEditPayable(payable)
                      ? { label: 'Editar', onClick: () => openEdit(payable) }
                      : null;

                  return (
                    <motion.div
                      key={payable.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.22 }}
                      whileHover={{ y: -2 }}
                      className={cn(
                        'group relative flex h-fit overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md sm:rounded-2xl',
                        overdue && 'border-destructive/40',
                        isCancelled && 'opacity-70',
                      )}
                    >
                      <div className={cn('w-1.5 shrink-0', rail)} />
                      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5 sm:gap-2.5 sm:p-3.5">
                        <div className="flex items-start gap-2.5">
                          <SupplierAvatar name={payable.supplierName} categoryIcon={category?.icon} size={30} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  {payable.isUrgent ? <AlertCircle className="h-3 w-3 shrink-0 text-destructive" aria-label="Urgente" /> : null}
                                  <p className="truncate text-sm font-semibold text-foreground leading-tight">{payable.title}</p>
                                </div>
                                {payable.supplierName ? (
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{payable.supplierName}</p>
                                ) : null}
                              </div>
                              <p className={cn('max-w-[46%] truncate text-right text-sm font-display font-bold tabular-nums tracking-tight sm:text-base', valueColor)}>
                                {fmtBRL(payable.finalAmount)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <PayableStatusBadge payable={payable} />
                          {category ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <CategoryIcon className="h-3 w-3" />
                              {category.name}
                            </span>
                          ) : null}
                          {(payable.totalInstallments ?? 0) > 1 ? (
                            <Badge variant="outline" className="gap-1 text-[11px]">
                              <Repeat className="h-3 w-3" />
                              {payable.recurrenceIndex ?? 1}/{payable.totalInstallments}
                            </Badge>
                          ) : null}
                          {payable.recurrence !== 'NENHUMA' ? (
                            <Badge variant="outline" className="text-[11px]">{RECURRENCE_TYPE_LABELS[payable.recurrence]}</Badge>
                          ) : null}
                          {payable.entrySource === 'IA_IMPORT' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              <Sparkles className="h-3 w-3" /> IA
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs leading-tight">
                          <CalendarClock className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            overdue ? 'text-destructive' : urgency === 'critical' ? 'text-amber-600' : 'text-muted-foreground',
                          )} />
                          <DueDateLabel payable={payable} />
                        </div>

                        {contextualQuestion && !dismissedQuestions.has(payable.id) ? (
                          <ContextualQuestionBanner
                            question={contextualQuestion}
                            payableId={payable.id}
                            onAction={handleContextualAction}
                            onDismiss={dismissContextualQuestion}
                          />
                        ) : null}

                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-0.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-w-0 flex-1 basis-[calc(50%-0.25rem)]"
                            onClick={() => updateRouteModal('details', payable.id)}
                          >
                            Ver detalhes
                          </Button>
                          {primaryAction ? (
                            <Button size="sm" className="min-w-0 flex-1 basis-[calc(50%-0.25rem)]" onClick={primaryAction.onClick}>
                              {primaryAction.label}
                            </Button>
                          ) : null}
                          <div className="ml-auto shrink-0">{renderActions(payable)}</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
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
          {selectedPayable ? <div className="space-y-4"><div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm"><p className="font-medium">{selectedPayable.title}</p><p className="mt-1 text-muted-foreground">Saldo em aberto: {fmtBRL(calculatePayableRemainingBalance(selectedPayable))}</p></div><div className="space-y-2"><Label>Valor pago</Label><Input value={paymentAmountInput} onChange={(event) => setPaymentAmountInput(normalizeDecimalInputDraft(event.target.value))} placeholder="0,00" /></div><div className="space-y-2"><Label>Forma de pagamento</Label><Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Observações</Label><Textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} onBlur={() => setPaymentNotes(normalizeWhitespace(paymentNotes))} rows={4} placeholder="Ex.: pagamento feito via PIX do caixa do dia" /></div></div> : null}
          <DialogFooter><Button variant="outline" onClick={resetDialogs}>Cancelar</Button><Button onClick={() => void handleSubmitPayment()}>Salvar pagamento</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === 'edit'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar conta</DialogTitle>
            <DialogDescription>
              {selectedPayable && isPayableEditRestricted(selectedPayable)
                ? 'Conta paga — apenas título, observações e urgência podem ser alterados.'
                : 'Edição completa dos dados da conta.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2"><Label>Título *</Label><Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} onBlur={() => setEditTitle(toTitleCasePtBr(editTitle))} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{editFavorecidoTipo === 'FUNCIONARIO' ? 'Funcionário' : 'Fornecedor'}</Label>
                <div className="flex rounded-lg border border-border/70 p-0.5 text-xs font-medium">
                  <button type="button" onClick={() => setEditFavorecidoTipo('FORNECEDOR')} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} className={`rounded-md px-2 py-1 transition-colors ${editFavorecidoTipo !== 'FUNCIONARIO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:cursor-not-allowed disabled:opacity-60`}>Fornecedor</button>
                  <button type="button" onClick={() => setEditFavorecidoTipo('FUNCIONARIO')} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} className={`rounded-md px-2 py-1 transition-colors ${editFavorecidoTipo === 'FUNCIONARIO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:cursor-not-allowed disabled:opacity-60`}>Funcionário</button>
                </div>
              </div>
              <Input value={editSupplierName} onChange={(event) => setEditSupplierName(event.target.value)} onBlur={() => setEditSupplierName(toTitleCasePtBr(editSupplierName))} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} placeholder={editFavorecidoTipo === 'FUNCIONARIO' ? 'Nome do funcionário' : 'Nome do fornecedor'} />
            </div>
            <div className="space-y-2"><Label>Nº do documento</Label><Input value={editDocNumber} onChange={(event) => setEditDocNumber(event.target.value)} onBlur={() => setEditDocNumber(normalizeWhitespace(editDocNumber))} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} placeholder="Número do boleto, NF..." /></div>
            <div className="space-y-2"><Label>Categoria *</Label><Select value={editCategoryId} onValueChange={setEditCategoryId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{payableCategories.filter((category) => category.isActive).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Vencimento *</Label><Input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></div>
            <div className="space-y-2"><Label>Valor (R$)</Label><Input value={editOriginalAmount} onChange={(event) => setEditOriginalAmount(normalizeDecimalInputDraft(event.target.value))} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} placeholder="0,00" /></div>
            <div className="space-y-2"><Label>Forma de pagamento</Label><Select value={editPaymentMethod} onValueChange={(v) => setEditPaymentMethod(v as PaymentMethod)} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 md:col-span-2"><Label>Observações</Label><Textarea value={editObservations} onChange={(event) => setEditObservations(event.target.value)} onBlur={() => setEditObservations(normalizeWhitespace(editObservations))} rows={3} /></div>
            <label className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm md:col-span-2"><input type="checkbox" checked={editUrgent} onChange={(event) => setEditUrgent(event.target.checked)} className="h-4 w-4 rounded border-input" />Marcar esta conta como urgente</label>
          </div>
          <DialogFooter><Button variant="outline" onClick={resetDialogs}>Cancelar</Button><Button onClick={() => void handleSubmitEdit()}>Salvar alterações</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === 'cancel'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Cancelar conta</DialogTitle><DialogDescription>Ela sai do fluxo ativo, mas continua no histórico.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={resetDialogs}>Voltar</Button><Button variant="secondary" onClick={() => void handleCancelSelectedPayable()}>Confirmar cancelamento</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={dialogMode === 'delete'} onOpenChange={(open) => !open && resetDialogs()}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Excluir conta definitivamente</DialogTitle><DialogDescription>A conta e os anexos salvos no Supabase serão apagados. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={resetDialogs}>Cancelar</Button><Button variant="destructive" onClick={() => void handleDeleteSelectedPayable()}>Confirmar exclusão</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  );
}
