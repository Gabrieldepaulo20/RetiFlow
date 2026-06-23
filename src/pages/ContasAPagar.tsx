import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, Building2, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, Layers, MailOpen, MoreHorizontal, Pencil, PlusCircle, Repeat, Search, Sparkles, Trash2, TrendingUp, Users, Wallet, XCircle } from 'lucide-react';
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
import { buildPayableHistoryDescription, calculatePayableFinalAmount, calculatePayableRemainingBalance, canCancelPayable, canEditPayable, canRegisterPayment, formatPayableDueDateLabel, generatePayableDuplicateKey, getContextualQuestion, getDueDateUrgencyLevel, getPayableDisplayStatus, groupPayables, isPayableEditRestricted, isPayableOverdue, type ContextualActionKind, type PayableGroupBy } from '@/services/domain/payables';
import { calculatePayablesCashFlowSummary } from '@/services/domain/payablesCashFlow';
import { getGmailOAuthFeedback } from '@/services/domain/gmailOAuth';
import {
  normalizeDecimalInputDraft,
  normalizeCommonBusinessTermsPtBr,
  normalizeWhitespace,
  parsePositiveNumber,
  toTitleCasePtBr,
} from '@/services/domain/textNormalization';
import PayableCreateModal from '@/components/payables/PayableCreateModal';
import PayableImportModal from '@/components/payables/PayableImportModal';
import PayableDetailsModal from '@/components/payables/PayableDetailsModal';
import PayableEmailSuggestions from '@/components/payables/PayableEmailSuggestions';
import { ContextualQuestionBanner } from '@/components/payables/ContextualQuestionBanner';
import { PayablesCockpit } from '@/components/payables/PayablesCockpit';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { detectPayableAnomalies, formatAnomalyBadge } from '@/services/domain/payablesAnomaly';
import { buildComputedBriefing, type PayableBriefing } from '@/services/domain/payablesBriefing';
import { usePayablesBriefing } from '@/hooks/usePayablesBriefing';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type StatusFilter = 'all' | 'pendente' | 'parcelado' | 'repetido' | 'vencido' | 'pago' | 'cancelado';
type PeriodFilter = 'all' | 'next-30' | 'overdue' | `month:${string}`;
type OriginFilter = 'all' | 'MANUAL' | 'IA_IMPORT' | 'CAMERA_CAPTURE' | 'AUTO_SERIES' | 'recurring' | 'installment';
type FavorecidoFilter = 'all' | 'FORNECEDOR' | 'FUNCIONARIO';
type GroupByOption = 'none' | PayableGroupBy;
type DialogMode = 'payment' | 'edit' | 'cancel' | 'delete' | null;

const MONTH_FILTER_PREFIX = 'month:';

function getMonthPeriodFilter(date: Date): PeriodFilter {
  return `${MONTH_FILTER_PREFIX}${format(date, 'yyyy-MM')}` as PeriodFilter;
}

function formatMonthName(date: Date) {
  const month = format(date, 'MMMM', { locale: ptBR });
  return `${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

function getMonthPeriodRange(filter: PeriodFilter) {
  if (!filter.startsWith(MONTH_FILTER_PREFIX)) return null;

  const [yearRaw, monthRaw] = filter.slice(MONTH_FILTER_PREFIX.length).split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;

  const date = new Date(year, month - 1, 1);
  return {
    start: startOfMonth(date).getTime(),
    end: endOfMonth(date).getTime(),
  };
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendente');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => getMonthPeriodFilter(new Date()));
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [favorecidoFilter, setFavorecidoFilter] = useState<FavorecidoFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
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
  const defaultMonthFilter = useMemo(() => getMonthPeriodFilter(now), [now]);
  const periodMonthOptions = useMemo(() => (
    Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), index, 1);
      return {
        value: getMonthPeriodFilter(date),
        label: formatMonthName(date),
      };
    })
  ), [now]);
  const selectedPeriodLabel = useMemo(() => {
    const selectedMonth = periodMonthOptions.find((option) => option.value === periodFilter);
    if (selectedMonth) return `Mês ${selectedMonth.label.toLowerCase()}`;
    if (periodFilter === 'all') return 'Todo período';
    if (periodFilter === 'next-30') return 'Próx. 30 dias';
    if (periodFilter === 'overdue') return 'Vencidas';
    return 'Período';
  }, [periodFilter, periodMonthOptions]);
  const periodFilterIsMonth = periodFilter.startsWith(MONTH_FILTER_PREFIX);
  const categoryById = useMemo(() => new Map(payableCategories.map((category) => [category.id, category])), [payableCategories]);
  const activePayables = useMemo(() => payables.filter((payable) => payable.deletedAt == null), [payables]);
  const selectedPayable = useMemo(() => selectedPayableId ? payables.find((payable) => payable.id === selectedPayableId) ?? null : null, [payables, selectedPayableId]);
  const routeModal = searchParams.get('modal');
  const routeDetailsId = searchParams.get('id');

  const payableDuplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const payable of activePayables) {
      if (payable.status === 'CANCELADO') continue;
      const key = generatePayableDuplicateKey(payable);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [activePayables]);

  const payableSeriesStats = useMemo(() => {
    const series = new Map<string, {
      items: AccountPayable[];
      paidCount: number;
      remainingAmount: number;
    }>();

    for (const payable of activePayables) {
      if ((payable.totalInstallments ?? 0) <= 1) continue;
      const key = payable.recurrenceParentId ?? payable.id;
      const current = series.get(key) ?? {
        items: [],
        paidCount: 0,
        remainingAmount: 0,
      };

      current.items.push(payable);
      current.remainingAmount += calculatePayableRemainingBalance(payable);
      if (payable.status === 'PAGO') {
        current.paidCount += 1;
      }
      series.set(key, current);
    }

    for (const current of series.values()) {
      current.items.sort((a, b) => (
        (a.recurrenceIndex ?? 999) - (b.recurrenceIndex ?? 999)
        || a.dueDate.localeCompare(b.dueDate)
      ));
    }

    return series;
  }, [activePayables]);

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
    if (statusFilter === 'parcelado') result = result.filter((payable) => (payable.totalInstallments ?? 0) > 1);
    if (statusFilter === 'repetido') result = result.filter((payable) => {
      const key = generatePayableDuplicateKey(payable);
      return key ? (payableDuplicateCounts.get(key) ?? 0) > 1 : false;
    });
    if (statusFilter === 'vencido') result = result.filter((payable) => isPayableOverdue(payable));
    if (statusFilter === 'pago') result = result.filter((payable) => payable.status === 'PAGO');
    if (statusFilter === 'cancelado') result = result.filter((payable) => payable.status === 'CANCELADO');
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((payable) => payable.title.toLowerCase().includes(query) || (payable.supplierName?.toLowerCase().includes(query) ?? false) || (payable.docNumber?.toLowerCase().includes(query) ?? false));
    }
    if (categoryFilter !== 'all') result = result.filter((payable) => payable.categoryId === categoryFilter);
    if (favorecidoFilter !== 'all') {
      result = result.filter((payable) => (payable.favorecidoTipo ?? 'FORNECEDOR') === favorecidoFilter);
    }
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
      const monthRange = getMonthPeriodRange(periodFilter);
      result = result.filter((payable) => {
        const dueTime = parseISO(payable.dueDate).getTime();
        if (monthRange) return dueTime >= monthRange.start && dueTime <= monthRange.end;
        if (periodFilter === 'next-30') return dueTime >= nowTime && dueTime <= inThirtyDays;
        if (periodFilter === 'overdue') return isPayableOverdue(payable);
        return true;
      });
    }
    return [...result].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [activePayables, categoryFilter, favorecidoFilter, now, originFilter, payableDuplicateCounts, periodFilter, search, statusFilter]);

  // Agrupamento opcional da lista (por categoria, favorecido ou fornecedor) com subtotais.
  const payableGroups = useMemo(
    () => (groupBy === 'none'
      ? null
      : groupPayables(filtered, groupBy, (id) => categoryById.get(id)?.name)),
    [filtered, groupBy, categoryById],
  );

  // Paginação da lista plana (a visão agrupada usa grupos recolhíveis no lugar).
  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedPayables = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );
  // Volta para a 1ª página quando filtros/busca/agrupamento mudam.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter, favorecidoFilter, originFilter, periodFilter, groupBy]);

  const hasDueToday = dueToday.length > 0;
  const hasOverdue = overduePayables.length > 0;
  const paidThisMonthTotal = paidThisMonth.reduce((sum, payable) => sum + (payable.paidAmount ?? payable.finalAmount), 0);
  const cashFlowSummary = useMemo(
    () => calculatePayablesCashFlowSummary({ payables: activePayables, categories: payableCategories, now }),
    [activePayables, now, payableCategories],
  );
  // Anomalias de valor: contas que destoam da média do mesmo fornecedor+categoria.
  const anomalyMap = useMemo(() => detectPayableAnomalies({ payables: activePayables }), [activePayables]);
  const anomalyDigest = useMemo(() => {
    const byId = new Map(activePayables.map((payable) => [payable.id, payable]));
    return [...anomalyMap.values()]
      .filter((anomaly) => anomaly.direction === 'acima')
      .sort((a, b) => b.deltaPct - a.deltaPct)
      .slice(0, 3)
      .map((anomaly) => {
        const payable = byId.get(anomaly.payableId);
        return {
          title: payable?.title ?? 'Conta',
          supplierName: payable?.supplierName ?? undefined,
          badge: formatAnomalyBadge(anomaly),
          current: anomaly.currentAmount,
          baseline: anomaly.baseline,
        };
      });
  }, [anomalyMap, activePayables]);

  // Briefing da semana: resumo automático (sempre) + versão IA sob demanda.
  const computedBriefing = useMemo(
    () => buildComputedBriefing({ summary: cashFlowSummary, anomalies: anomalyDigest }),
    [cashFlowSummary, anomalyDigest],
  );
  const { iaBriefing, isGenerating, generate: generateBriefing } = usePayablesBriefing();
  const activeBriefing: PayableBriefing = iaBriefing ?? computedBriefing;
  const briefingPayload = useMemo(() => ({
    monthLabel: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
    nextSevenTotal: cashFlowSummary.nextSevenTotal,
    nextSevenCount: cashFlowSummary.nextSevenCount,
    nextThirtyTotal: cashFlowSummary.nextThirtyTotal,
    nextThirtyCount: cashFlowSummary.nextThirtyCount,
    overdueTotal: cashFlowSummary.overdueTotal,
    overdueCount: cashFlowSummary.overdueCount,
    laborTotal: cashFlowSummary.laborTotal,
    laborCount: cashFlowSummary.laborCount,
    anomalies: anomalyDigest,
    topDue: cashFlowSummary.nextDue.map((payable) => ({
      title: payable.title,
      dueDate: payable.dueDate,
      amount: calculatePayableRemainingBalance(payable),
    })),
  }), [cashFlowSummary, anomalyDigest, now]);

  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );

  const kpis = [
    {
      label: 'Vence hoje',
      amount: dueToday.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
      sub: hasDueToday ? `${dueToday.length} conta${dueToday.length !== 1 ? 's' : ''} no prazo` : 'Nada pra hoje',
      dot: 'bg-amber-500',
      valueClass: hasDueToday ? 'text-amber-700' : 'text-foreground',
    },
    {
      label: 'Em atraso',
      amount: overduePayables.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
      sub: hasOverdue ? `${overduePayables.length} ${overduePayables.length === 1 ? 'venceu' : 'venceram'}` : 'Nenhum atraso',
      dot: 'bg-destructive',
      valueClass: hasOverdue ? 'text-destructive' : 'text-foreground',
    },
    {
      label: 'A pagar',
      amount: pendingLike.reduce((sum, payable) => sum + calculatePayableRemainingBalance(payable), 0),
      sub: `${pendingLike.length} conta${pendingLike.length !== 1 ? 's' : ''} pendente${pendingLike.length !== 1 ? 's' : ''}`,
      dot: 'bg-primary',
      valueClass: 'text-foreground',
    },
    {
      label: 'Pago no mês',
      amount: paidThisMonthTotal,
      sub: format(now, "MMMM 'de' yyyy", { locale: ptBR }),
      dot: 'bg-emerald-500',
      valueClass: 'text-emerald-700',
    },
  ];

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
    } else {
      dismissContextualQuestion(payableId);
    }
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
    const normalizedTitle = normalizeCommonBusinessTermsPtBr(toTitleCasePtBr(editTitle));
    const normalizedSupplierName = normalizeCommonBusinessTermsPtBr(toTitleCasePtBr(editSupplierName));
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

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function renderPayableCard(payable: AccountPayable, index: number) {
    const urgency = getDueDateUrgencyLevel(payable);
    const displayStatus = getPayableDisplayStatus(payable);
    const overdue = isPayableOverdue(payable);
    const category = categoryById.get(payable.categoryId);
    const CategoryIcon = getCategoryIcon(category?.icon);
    const isPaid = displayStatus === 'PAGO';
    const isCancelled = displayStatus === 'CANCELADO';
    const isFuncionario = payable.favorecidoTipo === 'FUNCIONARIO';
    const duplicateKey = generatePayableDuplicateKey(payable);
    const duplicateCount = duplicateKey ? (payableDuplicateCounts.get(duplicateKey) ?? 0) : 0;
    const anomaly = anomalyMap.get(payable.id);
    const contextualQuestion = getContextualQuestion(payable, now);
    const seriesKey = (payable.totalInstallments ?? 0) > 1 ? (payable.recurrenceParentId ?? payable.id) : null;
    const series = seriesKey ? payableSeriesStats.get(seriesKey) : null;
    const seriesTotal = Math.max(payable.totalInstallments ?? 0, series?.items.length ?? 0);
    const installmentLabel = (payable.totalInstallments ?? 0) > 1
      ? `Parcela ${payable.recurrenceIndex ?? 1}/${seriesTotal || payable.totalInstallments}`
      : null;

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
      ? { label: 'Pagar', title: 'Registrar pagamento', onClick: () => openPayment(payable) }
      : canEditPayable(payable)
        ? { label: 'Editar', title: 'Editar conta', onClick: () => openEdit(payable) }
        : null;

    return (
      <motion.div
        key={payable.id}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={prefersReducedMotion || isCancelled ? undefined : { y: -1 }}
        transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.22 }}
        className={cn(
          'group relative flex overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-colors hover:border-primary/25 hover:bg-primary/[0.012] sm:rounded-2xl',
          overdue && 'border-rose-200/80 bg-rose-50/25 hover:border-rose-300/80',
          isCancelled && 'opacity-70',
        )}
      >
        <div className={cn('w-1 shrink-0', rail)} />
        <div className="min-w-0 flex-1">
          <div className="grid gap-2 p-2.5 sm:p-2.5 lg:grid-cols-[minmax(280px,1.7fr)_minmax(136px,0.6fr)_minmax(150px,0.72fr)_auto] lg:items-center lg:gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <SupplierAvatar name={payable.supplierName ?? payable.title} categoryIcon={category?.icon} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {payable.isUrgent ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Urgente" /> : null}
                <p className="truncate text-sm font-semibold leading-tight text-foreground">{payable.title}</p>
              </div>
              {payable.supplierName ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{payable.supplierName}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <PayableStatusBadge payable={payable} />
                {category ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <CategoryIcon className="h-3 w-3" />
                    {category.name}
                  </span>
                ) : null}
                {isFuncionario ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                    <Users className="h-3 w-3" />
                    Funcionário
                  </span>
                ) : null}
                {payable.entrySource === 'IA_IMPORT' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Sparkles className="h-3 w-3" /> IA
                  </span>
                ) : null}
                {duplicateCount > 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    Possível repetida ({duplicateCount})
                  </span>
                ) : null}
                {anomaly && anomaly.direction === 'acima' && !isPaid && !isCancelled ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                    title={`Valor ${formatAnomalyBadge(anomaly)} — o normal para ${payable.supplierName ?? 'este favorecido'} é cerca de ${fmtBRL(anomaly.baseline)}.`}
                  >
                    <TrendingUp className="h-3 w-3" />
                    {formatAnomalyBadge(anomaly)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs lg:block">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vencimento</p>
              <div className="mt-1 flex items-center gap-1.5">
                <CalendarClock className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  overdue ? 'text-destructive' : urgency === 'critical' ? 'text-amber-600' : 'text-muted-foreground',
                )} />
                <DueDateLabel payable={payable} />
              </div>
            </div>
            <div className="min-w-0 lg:mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Documento</p>
              <p className="mt-1 truncate font-medium text-foreground/80">{payable.docNumber || 'Sem documento'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {installmentLabel ? (
              <button
                type="button"
                onClick={() => updateRouteModal('details', payable.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/10"
              >
                <Repeat className="h-3 w-3" />
                <span className="truncate">{installmentLabel}</span>
              </button>
            ) : (
              <Badge variant="outline" className="text-[11px]">Conta única</Badge>
            )}
            {series ? (
              <div className="max-w-xs">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{series.paidCount}/{seriesTotal || series.items.length} pagas</span>
                  <span className="font-medium text-foreground/80">{fmtBRL(series.remainingAmount)} aberto</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, Math.round((series.paidCount / Math.max(1, seriesTotal || series.items.length)) * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}
            {payable.recurrence !== 'NENHUMA' ? (
              <Badge variant="outline" className="text-[11px]">{RECURRENCE_TYPE_LABELS[payable.recurrence]}</Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <p className={cn('mr-auto text-base font-display font-bold tabular-nums tracking-tight lg:mr-2 lg:text-right', valueColor)}>
              {fmtBRL(payable.finalAmount)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] lg:flex-none lg:px-3"
              onClick={() => updateRouteModal('details', payable.id)}
              title="Ver detalhes"
            >
              Detalhes
            </Button>
            {primaryAction ? (
              <Button
                size="sm"
                className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] lg:flex-none lg:px-3"
                onClick={primaryAction.onClick}
                title={primaryAction.title}
              >
                {primaryAction.label}
              </Button>
            ) : null}
            <div className="shrink-0">{renderActions(payable)}</div>
          </div>
          </div>
          {contextualQuestion && !dismissedQuestions.has(payable.id) ? (
            <div className="px-2.5 pb-2.5">
              <ContextualQuestionBanner
                question={contextualQuestion}
                payableId={payable.id}
                onAction={handleContextualAction}
                onDismiss={dismissContextualQuestion}
              />
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <div className="space-y-2 overflow-x-hidden sm:space-y-3">
        <h1 className="sr-only">Contas a Pagar</h1>
        <div className="-mt-5 sm:-mt-7 lg:-mt-9">
          <div className="relative flex flex-col gap-2 sm:min-h-11 sm:flex-row sm:items-center sm:justify-center">
            <div className="flex justify-center">
              <Tabs value={effectiveView} onValueChange={(value) => updatePageView(value as PageView)}>
                <TabsList className={cn('grid h-11 rounded-2xl bg-muted/70 p-1 shadow-sm ring-1 ring-border/60', suggestionsEnabled ? 'grid-cols-2' : 'grid-cols-1')}>
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
            </div>
            {effectiveView === 'contas' ? (
              <div className="grid w-full grid-cols-2 gap-2 lg:absolute lg:right-0 lg:top-0 lg:w-auto lg:flex lg:flex-wrap">
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
        <PayablesCockpit
          summary={cashFlowSummary}
          briefing={activeBriefing}
          briefingLoading={isGenerating}
          onOpenDetails={(id) => updateRouteModal('details', id)}
          onRefreshBriefing={() => generateBriefing(briefingPayload)}
          prefersReducedMotion={prefersReducedMotion}
        />

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {kpis.map((kpi, index) => (
            <motion.div
              key={kpi.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.25 }}
              className="rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:rounded-2xl sm:p-4"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', kpi.dot)} />
                {kpi.label}
              </div>
              <AnimatedNumber
                value={kpi.amount}
                format={fmtBRL}
                className={cn('mt-1.5 block truncate font-display text-lg font-bold tabular-nums tracking-tight sm:text-xl', kpi.valueClass)}
              />
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{kpi.sub}</p>
            </motion.div>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border/60 p-2.5 sm:p-3">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <TabsList className="flex h-9 w-full justify-start overflow-x-auto rounded-xl p-1 xl:w-auto xl:shrink-0">
                    <TabsTrigger value="pendente" className="shrink-0 text-xs">Pendentes</TabsTrigger>
                    <TabsTrigger value="parcelado" className="shrink-0 text-xs">Parceladas</TabsTrigger>
                    <TabsTrigger value="repetido" className="shrink-0 text-xs">Repetidas</TabsTrigger>
                    <TabsTrigger value="vencido" className="shrink-0 text-xs">Vencidas</TabsTrigger>
                    <TabsTrigger value="all" className="shrink-0 text-xs">Todas</TabsTrigger>
                    <TabsTrigger value="pago" className="shrink-0 text-xs">Pagas</TabsTrigger>
                    <TabsTrigger value="cancelado" className="hidden text-xs 2xl:flex">Canceladas</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-[minmax(150px,1fr)_repeat(5,minmax(86px,0.58fr))]">
                  <div className="relative col-span-2 min-w-0 md:col-span-3 xl:col-span-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={searchRaw} onChange={(event) => setSearchRaw(event.target.value)} placeholder="Buscar conta..." className="h-9 pl-8 text-sm" /></div>
                  <Select value={favorecidoFilter} onValueChange={(value) => setFavorecidoFilter(value as FavorecidoFilter)}><SelectTrigger className="h-9 min-w-0 truncate text-xs sm:text-sm"><SelectValue placeholder="Favorecidos" /></SelectTrigger><SelectContent><SelectItem value="all">Favorecidos</SelectItem><SelectItem value="FORNECEDOR">Fornecedores</SelectItem><SelectItem value="FUNCIONARIO">Funcionários</SelectItem></SelectContent></Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="h-9 min-w-0 truncate text-xs sm:text-sm"><SelectValue placeholder="Categorias" /></SelectTrigger><SelectContent><SelectItem value="all">Categorias</SelectItem>{payableCategories.filter((category) => category.isActive).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
                  <Select value={originFilter} onValueChange={(value) => setOriginFilter(value as OriginFilter)}><SelectTrigger className="h-9 min-w-0 truncate text-xs sm:text-sm"><SelectValue placeholder="Origens" /></SelectTrigger><SelectContent><SelectItem value="all">Origens</SelectItem><SelectItem value="MANUAL">Manual</SelectItem><SelectItem value="IA_IMPORT">IA</SelectItem><SelectItem value="CAMERA_CAPTURE">Câmera</SelectItem><SelectItem value="AUTO_SERIES">Série</SelectItem><SelectItem value="recurring">Recorrentes</SelectItem><SelectItem value="installment">Parceladas</SelectItem></SelectContent></Select>
                  <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}>
                    <SelectTrigger
                      className={cn(
                        'h-9 min-w-0 gap-1.5 truncate text-xs sm:text-sm',
                        periodFilterIsMonth && 'border-primary/40 bg-primary/10 font-semibold text-primary shadow-sm ring-1 ring-primary/20',
                      )}
                    >
                      <CalendarClock className={cn('h-3.5 w-3.5 shrink-0', periodFilterIsMonth ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="truncate">{selectedPeriodLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {periodMonthOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                      <SelectItem value="all">Todo período</SelectItem>
                      <SelectItem value="next-30">Próx. 30 dias</SelectItem>
                      <SelectItem value="overdue">Vencidas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupByOption)}><SelectTrigger className="h-9 min-w-0 gap-1 truncate text-xs sm:text-sm"><Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><SelectValue placeholder="Agrupar" /></SelectTrigger><SelectContent><SelectItem value="none">Sem grupo</SelectItem><SelectItem value="category">Por categoria</SelectItem><SelectItem value="favorecido">Por favorecido</SelectItem><SelectItem value="supplier">Por fornecedor</SelectItem></SelectContent></Select>
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center"><Wallet className="h-10 w-10 text-muted-foreground" /><div className="max-w-sm"><h3 className="text-base font-semibold">Nenhuma conta encontrada</h3><p className="text-sm text-muted-foreground">Ajuste os filtros ou cadastre a primeira conta.</p></div><Button variant="outline" onClick={() => { setStatusFilter('pendente'); setPeriodFilter(defaultMonthFilter); setOriginFilter('all'); setCategoryFilter('all'); setFavorecidoFilter('all'); setGroupBy('none'); setSearchRaw(''); }}>Voltar para pendentes deste mês</Button></div>
            ) : payableGroups ? (
              <div className="space-y-2 p-2.5 sm:p-3">
                {payableGroups.map((group) => {
                  const collapsed = collapsedGroups.has(group.key);
                  const GroupIcon = groupBy === 'favorecido'
                    ? (group.key === 'FUNCIONARIO' ? Users : Building2)
                    : Layers;
                  return (
                    <div key={group.key} className="overflow-hidden rounded-xl border border-border/60">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <GroupIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-semibold text-foreground">{group.label}</span>
                        <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{group.items.length}</span>
                        <span className="ml-auto shrink-0 text-sm font-display font-bold tabular-nums text-foreground/80">{fmtBRL(group.subtotal)}</span>
                      </button>
                      {!collapsed ? (
                        <div className="space-y-2 p-2.5 sm:p-3">
                          {group.items.map((payable, index) => renderPayableCard(payable, index))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="space-y-2 p-2.5 sm:p-3">
                  {pagedPayables.map((payable, index) => renderPayableCard(payable, index))}
                </div>
                {totalPages > 1 ? (
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} contas
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Anterior</span>
                      </Button>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{safePage}/{totalPages}</span>
                      <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                        <span className="hidden sm:inline">Próxima</span><ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
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
            <div className="space-y-2 md:col-span-2"><Label>Título *</Label><Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} onBlur={() => setEditTitle(normalizeCommonBusinessTermsPtBr(toTitleCasePtBr(editTitle)))} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{editFavorecidoTipo === 'FUNCIONARIO' ? 'Funcionário' : 'Fornecedor'}</Label>
                <div className="flex rounded-lg border border-border/70 p-0.5 text-xs font-medium">
                  <button type="button" onClick={() => setEditFavorecidoTipo('FORNECEDOR')} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} className={`rounded-md px-2 py-1 transition-colors ${editFavorecidoTipo !== 'FUNCIONARIO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:cursor-not-allowed disabled:opacity-60`}>Fornecedor</button>
                  <button type="button" onClick={() => setEditFavorecidoTipo('FUNCIONARIO')} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} className={`rounded-md px-2 py-1 transition-colors ${editFavorecidoTipo === 'FUNCIONARIO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:cursor-not-allowed disabled:opacity-60`}>Funcionário</button>
                </div>
              </div>
              <Input value={editSupplierName} onChange={(event) => setEditSupplierName(event.target.value)} onBlur={() => setEditSupplierName(normalizeCommonBusinessTermsPtBr(toTitleCasePtBr(editSupplierName)))} disabled={!!(selectedPayable && isPayableEditRestricted(selectedPayable))} placeholder={editFavorecidoTipo === 'FUNCIONARIO' ? 'Nome do funcionário' : 'Nome do fornecedor'} />
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
