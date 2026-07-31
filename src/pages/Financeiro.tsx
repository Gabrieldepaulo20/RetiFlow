import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Download,
  Landmark,
  ListChecks,
  Plus,
  Power,
  Printer,
  Pencil,
  RefreshCw,
  Repeat2,
  Search,
  Settings2,
  TrendingDown,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePayablesData } from '@/contexts/DataContext';
import {
  gerarContasRecorrentes,
  getAllFinanceiroExtrato,
  getAllFinanceiroLancamentos,
  getAllFinanceiroModelosRecorrentes,
  getCategoriasEntradas,
  getFinanceiroContas,
  getFinanceiroResumo,
  inativarModeloRecorrente,
  type FinanceiroLancamento,
  type FinanceiroModeloRecorrente,
  type FinanceiroModo,
  type FinanceiroMovimento,
  type FinanceiroResumo,
} from '@/api/supabase/financeiro';
import {
  FinanceActionDialog,
  type FinanceDialogKind,
} from '@/components/finance/FinanceActionDialog';
import { FinanceAccountsDialog } from '@/components/finance/FinanceAccountsDialog';
import {
  EmptyLedger,
  KpiCard,
  LaunchList,
  LedgerColumn,
  MovementList,
} from '@/components/finance/FinanceLedger';
import { FinanceMovementDetailsDialog } from '@/components/finance/FinanceMovementDetailsDialog';
import {
  brl,
  dateBR,
  ORIGEM_LABELS,
  STATUS_LABELS,
} from '@/components/finance/financeUi';
import { FinancialPrivacyToggle } from '@/components/privacy/FinancialPrivacyToggle';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { downloadCsv, toCsv, type CsvRow } from '@/lib/csv';
import {
  PAYMENT_METHOD_LABELS,
  RECURRENCE_TYPE_LABELS,
} from '@/types';

type FinanceiroTab = 'visao' | 'entradas' | 'saidas' | 'fixos' | 'dre' | 'extrato';
type PeriodoTipo = 'mes' | 'personalizado';
const ContasAPagar = lazy(() => import('@/pages/ContasAPagar'));

const FINANCEIRO_TABS: Array<{ value: FinanceiroTab; label: string; icon: typeof WalletCards }> = [
  { value: 'visao', label: 'Visão geral', icon: WalletCards },
  { value: 'entradas', label: 'Entradas', icon: ArrowDownLeft },
  { value: 'saidas', label: 'Saídas', icon: ArrowUpRight },
  { value: 'fixos', label: 'Gastos fixos', icon: Repeat2 },
  { value: 'dre', label: 'DRE', icon: Landmark },
  { value: 'extrato', label: 'Extrato', icon: ListChecks },
];

const MODOS: Array<{
  value: FinanceiroModo;
  label: string;
  description: string;
}> = [
  {
    value: 'CAIXA',
    label: 'Caixa',
    description: 'Dinheiro que realmente entrou ou saiu no período.',
  },
  {
    value: 'PREVISTO',
    label: 'Previsto',
    description: 'Vencimentos e saldos ainda abertos no período.',
  },
  {
    value: 'COMPETENCIA',
    label: 'Competência',
    description: 'Receitas, custos e despesas reconhecidos no mês.',
  },
];

const MESES = Array.from({ length: 12 }, (_, index) => {
  const value = format(new Date(2026, index, 1), 'MMM', { locale: ptBR }).replace('.', '');
  return value.charAt(0).toUpperCase() + value.slice(1);
});

const EMPTY_RESUMO: FinanceiroResumo = {
  saldoInicialInformado: false,
  saldoAnterior: 0,
  entradasRecebidas: 0,
  saidasPagas: 0,
  saldoAtual: 0,
  aReceber: 0,
  aPagar: 0,
  saldoProjetado: 0,
  resultadoPeriodo: 0,
  faturamentoCompetencia: 0,
  despesasCompetencia: 0,
  resultadoCompetencia: 0,
};
const EMPTY_LAUNCHES: FinanceiroLancamento[] = [];
const EMPTY_MOVEMENTS: FinanceiroMovimento[] = [];

function getTab(value: string | null): FinanceiroTab {
  return FINANCEIRO_TABS.some((item) => item.value === value)
    ? value as FinanceiroTab
    : 'visao';
}

export default function Financeiro() {
  const { isSupportImpersonating } = useAuth();
  const { payableCategories } = usePayablesData();
  const { financialValuesHidden } = useFinancialPrivacy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);

  const [tab, setTab] = useState<FinanceiroTab>(() => getTab(searchParams.get('tab')));
  const [modo, setModo] = useState<FinanceiroModo>('CAIXA');
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('mes');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [customStart, setCustomStart] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(today, 'yyyy-MM-dd'));
  const [accountId, setAccountId] = useState('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<FinanceDialogKind>(null);
  const [selectedLaunch, setSelectedLaunch] = useState<FinanceiroLancamento | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<FinanceiroMovimento | null>(null);
  const [detailsMovement, setDetailsMovement] = useState<FinanceiroMovimento | null>(null);
  const [selectedModel, setSelectedModel] = useState<FinanceiroModeloRecorrente | null>(null);
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false);

  const monthDate = useMemo(() => new Date(year, month, 1), [month, year]);
  const range = useMemo(() => {
    if (periodoTipo === 'personalizado') {
      return { start: customStart, end: customEnd };
    }
    return {
      start: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
      end: format(endOfMonth(monthDate), 'yyyy-MM-dd'),
    };
  }, [customEnd, customStart, monthDate, periodoTipo]);
  const validRange = Boolean(range.start && range.end && range.start <= range.end);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const periodParams = useMemo(() => ({
    p_data_inicio: range.start,
    p_data_fim: range.end,
    p_modo: modo,
    p_fk_conta_financeira: accountId === 'all' ? undefined : accountId,
  }), [accountId, modo, range.end, range.start]);

  const contasQuery = useQuery({
    queryKey: ['financeiro', 'contas'],
    queryFn: () => getFinanceiroContas(),
    staleTime: 60_000,
  });
  const categoriasQuery = useQuery({
    queryKey: ['financeiro', 'categorias-entradas'],
    queryFn: () => getCategoriasEntradas(),
    staleTime: 60_000,
  });
  const resumoQuery = useQuery({
    queryKey: ['financeiro', 'resumo', periodParams],
    queryFn: () => getFinanceiroResumo(periodParams),
    enabled: validRange,
    refetchInterval: 30_000,
  });
  const launchesQuery = useQuery({
    queryKey: ['financeiro', 'lancamentos', periodParams, debouncedSearch],
    queryFn: () => getAllFinanceiroLancamentos({
      ...periodParams,
      p_busca: debouncedSearch || undefined,
    }),
    enabled: validRange,
    refetchInterval: 30_000,
  });
  const extratoQuery = useQuery({
    queryKey: ['financeiro', 'extrato', range, accountId, debouncedSearch],
    queryFn: () => getAllFinanceiroExtrato({
      p_data_inicio: range.start,
      p_data_fim: range.end,
      p_fk_conta_financeira: accountId === 'all' ? undefined : accountId,
      p_busca: debouncedSearch || undefined,
    }),
    enabled: validRange,
    refetchInterval: 30_000,
  });
  const modelosQuery = useQuery({
    queryKey: ['financeiro', 'modelos-recorrentes'],
    queryFn: () => getAllFinanceiroModelosRecorrentes({
      p_incluir_inativos: true,
    }),
    staleTime: 30_000,
  });

  const contas = contasQuery.data ?? [];
  const categorias = categoriasQuery.data ?? [];
  const resumo = resumoQuery.data ?? EMPTY_RESUMO;
  const launches = launchesQuery.data?.dados ?? EMPTY_LAUNCHES;
  const movements = extratoQuery.data?.dados ?? EMPTY_MOVEMENTS;
  const modelos = modelosQuery.data?.dados ?? [];
  const hasQueryError = [
    contasQuery,
    categoriasQuery,
    resumoQuery,
    launchesQuery,
    extratoQuery,
    modelosQuery,
  ].some((query) => query.isError);

  const filteredLaunches = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return launches;
    return launches.filter((item) => [
      item.descricao,
      item.pessoa,
      item.origemNumero,
      item.categoriaNome,
      ORIGEM_LABELS[item.origem],
    ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [launches, search]);
  const entradas = useMemo(
    () => filteredLaunches.filter((item) => item.direcao === 'ENTRADA'),
    [filteredLaunches],
  );
  const saidas = useMemo(
    () => filteredLaunches.filter((item) => item.direcao === 'SAIDA'),
    [filteredLaunches],
  );
  const filteredMovements = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return movements;
    return movements.filter((item) => [
      item.descricao,
      item.contaNome,
      item.usuarioNome,
      ORIGEM_LABELS[item.origem],
    ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [movements, search]);
  const exportDataUnavailable = tab === 'extrato'
    ? !extratoQuery.data || extratoQuery.isError
    : !launchesQuery.data || launchesQuery.isError;

  useEffect(() => {
    const previousHtmlOverflowX = document.documentElement.style.overflowX;
    const previousBodyOverflowX = document.body.style.overflowX;
    document.documentElement.style.overflowX = 'clip';
    document.body.style.overflowX = 'clip';
    return () => {
      document.documentElement.style.overflowX = previousHtmlOverflowX;
      document.body.style.overflowX = previousBodyOverflowX;
    };
  }, []);

  useEffect(() => {
    const next = getTab(searchParams.get('tab'));
    setTab(next);
  }, [searchParams]);

  const updateTab = (value: string) => {
    const next = getTab(value);
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['financeiro'] });
  };

  const handleMutationError = (error: unknown) => {
    toast({
      title: 'Não foi possível concluir',
      description: error instanceof Error ? error.message : 'Confira os dados e tente novamente.',
      variant: 'destructive',
    });
  };

  const closeDialog = () => {
    setDialog(null);
    setSelectedLaunch(null);
    setSelectedMovement(null);
    setSelectedModel(null);
  };

  const openSettle = (item: FinanceiroLancamento) => {
    if (isSupportImpersonating) return;
    setSelectedLaunch(item);
    setDialog('liquidar');
  };

  const openReverse = (item: FinanceiroMovimento) => {
    if (isSupportImpersonating) return;
    setSelectedMovement(item);
    setDialog('estornar');
  };

  const exportRows = useMemo<CsvRow[]>(() => {
    if (tab === 'extrato') {
      return filteredMovements.map((item) => ({
        Data: dateBR(item.dataEfetiva),
        Direção: item.direcao === 'ENTRADA' ? 'Entrada' : 'Saída',
        Origem: ORIGEM_LABELS[item.origem],
        Descrição: item.descricao,
        Conta: item.contaNome ?? '',
        Forma: item.formaPagamento ? PAYMENT_METHOD_LABELS[item.formaPagamento] : '',
        Valor: item.valor,
        'Saldo acumulado': item.saldoAcumulado ?? '',
        Estornado: item.estornado ? 'Sim' : 'Não',
      }));
    }
    const source = tab === 'entradas' ? entradas : tab === 'saidas' ? saidas : filteredLaunches;
    return source.map((item) => ({
      Origem: ORIGEM_LABELS[item.origem],
      Número: item.origemNumero ?? '',
      Pessoa: item.pessoa ?? '',
      Descrição: item.descricao,
      Categoria: item.categoriaNome ?? '',
      Vencimento: dateBR(item.vencimento),
      Competência: dateBR(item.competencia),
      'Data efetiva': dateBR(item.dataEfetiva),
      Conta: item.contaNome ?? '',
      Forma: item.formaPagamento ? PAYMENT_METHOD_LABELS[item.formaPagamento] : '',
      Previsto: item.previsto,
      Realizado: item.realizado,
      Aberto: item.aberto,
      Status: STATUS_LABELS[item.status],
    }));
  }, [entradas, filteredLaunches, filteredMovements, saidas, tab]);

  const handleCsv = () => {
    if (financialValuesHidden) {
      toast({
        title: 'Valores ocultos',
        description: 'Mostre os valores pelo olhinho antes de exportar o CSV.',
      });
      return;
    }
    if (exportDataUnavailable) {
      toast({
        title: 'Exportação indisponível',
        description: 'Os lançamentos ainda não foram carregados por completo. Atualize e tente novamente.',
        variant: 'destructive',
      });
      return;
    }
    if (!exportRows.length) {
      toast({ title: 'Nada para exportar', description: 'Este período não possui lançamentos.' });
      return;
    }
    downloadCsv(
      `retiflow-financeiro-${range.start}-a-${range.end}.csv`,
      toCsv(exportRows),
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const periodTitle = periodoTipo === 'personalizado'
    ? `${dateBR(range.start)} a ${dateBR(range.end)}`
    : format(monthDate, 'MMMM yyyy', { locale: ptBR });

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-clip pb-10 print:bg-white print:p-0">
      <section className="relative overflow-hidden rounded-[26px] bg-[#0b2035] text-white shadow-[0_18px_60px_-35px_rgba(2,15,28,0.85)] print:rounded-none print:bg-white print:text-black print:shadow-none">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,rgba(30,136,229,0.16))] lg:block" />
        <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pt-5 lg:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f0b44d]">
                <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                Central Financeiro
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  Financeiro
                </h1>
                <span className="mb-1 text-xs font-medium capitalize text-slate-300 print:text-slate-600">
                  Livro-caixa da operação · {periodTitle}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300 print:text-slate-600 sm:text-sm">
                Obrigações, dinheiro realizado e resultado contábil separados para cada número ter uma origem conferível.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {!isSupportImpersonating ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-2 rounded-xl bg-[#f0b44d] px-3 font-bold text-[#10253a] hover:bg-[#ffd078]"
                    onClick={() => setDialog('entrada')}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nova entrada
                  </Button>
                  <Button asChild type="button" size="sm" variant="secondary" className="h-9 gap-2 rounded-xl px-3">
                    <Link to="/contas-a-pagar/nova">
                      <TrendingDown className="h-4 w-4" aria-hidden="true" />
                      Nova saída
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 gap-2 rounded-xl border border-white/15 px-3 text-slate-200 hover:bg-white/10 hover:text-white"
                    onClick={() => setAccountsDialogOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    Contas e saldo
                  </Button>
                </>
              ) : null}
              <FinancialPrivacyToggle />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-xl border border-white/15 p-0 text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={() => void refreshAll()}
                aria-label="Atualizar dados financeiros"
              >
                <RefreshCw className={cn('h-4 w-4', resumoQuery.isFetching && 'animate-spin')} aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[1fr_auto_auto]">
            <div className="min-w-0 max-w-full overflow-hidden">
              <div className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-lg p-0 text-slate-300 hover:bg-white/10 hover:text-white print:hidden"
                  onClick={() => setYear((current) => current - 1)}
                  aria-label="Ano anterior"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="w-11 shrink-0 text-center font-display text-sm font-bold">{year}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-lg p-0 text-slate-300 hover:bg-white/10 hover:text-white print:hidden"
                  onClick={() => setYear((current) => current + 1)}
                  aria-label="Próximo ano"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div
                  className="flex w-0 min-w-0 max-w-full flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
                  role="group"
                  aria-label="Meses do período financeiro"
                >
                  {MESES.map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setPeriodoTipo('mes');
                        setMonth(index);
                      }}
                      className={cn(
                        'relative h-8 min-w-11 shrink-0 rounded-lg px-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0b44d]',
                        periodoTipo === 'mes' && month === index
                          ? 'bg-[#f0b44d] text-[#10253a] shadow-sm'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white',
                      )}
                      aria-pressed={periodoTipo === 'mes' && month === index}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-9 gap-2 rounded-xl border px-3 text-xs',
                  periodoTipo === 'personalizado'
                    ? 'border-[#f0b44d]/60 bg-[#f0b44d]/10 text-[#ffd078]'
                    : 'border-white/15 text-slate-200 hover:bg-white/10 hover:text-white',
                )}
                onClick={() => setPeriodoTipo((current) => current === 'mes' ? 'personalizado' : 'mes')}
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Período livre
              </Button>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-9 w-[170px] rounded-xl border-white/15 bg-white/5 text-xs text-white">
                  <SelectValue placeholder="Todas as contas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas</SelectItem>
                  {contas.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>{conta.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 rounded-xl border border-white/15 bg-white/5 p-1">
              {MODOS.map((item) => (
                <Tooltip key={item.value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setModo(item.value)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0b44d]',
                        modo === item.value
                          ? 'bg-white text-[#10253a] shadow-sm'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      {item.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {item.description}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {periodoTipo === 'personalizado' ? (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/10 p-3 print:hidden">
              <div className="space-y-1">
                <Label htmlFor="finance-start" className="text-[10px] uppercase tracking-wider text-slate-300">Data inicial</Label>
                <Input
                  id="finance-start"
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="h-9 w-40 border-white/15 bg-white text-xs text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="finance-end" className="text-[10px] uppercase tracking-wider text-slate-300">Data final</Label>
                <Input
                  id="finance-end"
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="h-9 w-40 border-white/15 bg-white text-xs text-slate-900"
                />
              </div>
              {!validRange ? <p className="pb-2 text-xs font-medium text-rose-300">A data final deve ser igual ou posterior à inicial.</p> : null}
            </div>
          ) : null}
        </div>
      </section>

      {isSupportImpersonating ? (
        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Consulta em modo suporte</AlertTitle>
          <AlertDescription>
            Os dados financeiros da empresa podem ser conferidos, mas recebimentos, pagamentos, transferências e estornos estão bloqueados.
          </AlertDescription>
        </Alert>
      ) : null}

      {resumoQuery.data && !resumo.saldoInicialInformado ? (
        <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Saldo inicial ainda não confirmado</AlertTitle>
          <AlertDescription>
            Enquanto a cliente não informar o saldo da data de corte, o valor principal é apresentado como resultado do período, não como saldo bancário real.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasQueryError ? (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Parte da central não carregou</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Atualize a tela. Se persistir, confira se as novas RPCs financeiras já foram publicadas.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void refreshAll()}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {resumoQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}
        </div>
      ) : resumoQuery.data ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          <KpiCard
            label={resumo.saldoInicialInformado ? 'Saldo anterior' : 'Resultado anterior'}
            value={resumo.saldoAnterior}
            hint={resumo.saldoInicialInformado
              ? 'Saldo calculado até o dia anterior ao início do período.'
              : 'Movimentação acumulada antes do período, ainda sem uma base de saldo inicial confirmada.'}
          />
          <KpiCard label="Entradas" value={resumo.entradasRecebidas} hint="Recebimentos confirmados na data real em que o dinheiro entrou." tone="positive" />
          <KpiCard label="Saídas" value={resumo.saidasPagas} hint="Pagamentos confirmados na data real em que o dinheiro saiu." tone="negative" />
          <KpiCard
            label={resumo.saldoInicialInformado ? 'Saldo atual' : 'Resultado do período'}
            value={resumo.saldoInicialInformado ? resumo.saldoAtual : resumo.resultadoPeriodo}
            hint={resumo.saldoInicialInformado ? 'Saldo inicial mais entradas confirmadas menos saídas confirmadas.' : 'Entradas menos saídas do período. Não é chamado de saldo até o saldo inicial ser confirmado.'}
            tone="projected"
            emphasized
          />
          <KpiCard label="A receber" value={resumo.aReceber} hint="Valores previstos de O.S., fechamentos e receitas manuais que ainda estão abertos." tone="positive" />
          <KpiCard label="A pagar" value={resumo.aPagar} hint="Saldo aberto das contas a pagar no recorte selecionado." tone="negative" />
          <KpiCard
            label="Projetado"
            value={resumo.saldoProjetado}
            hint={resumo.saldoInicialInformado
              ? 'Saldo atual somado ao que falta receber e subtraído do que falta pagar.'
              : 'Resultado acumulado mais o que falta receber, menos o que falta pagar; ainda não representa saldo real.'}
            tone="projected"
          />
        </section>
      ) : null}

      <Tabs value={tab} onValueChange={updateTab} className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm xl:flex-row xl:items-center xl:justify-between print:hidden">
          <div className="overflow-x-auto">
            <TabsList className="h-10 min-w-max justify-start rounded-xl bg-slate-100 p-1">
              {FINANCEIRO_TABS.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger key={item.value} value={item.value} className="h-8 gap-1.5 rounded-lg px-2.5 text-xs xl:px-3">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab !== 'saidas' && tab !== 'fixos' && tab !== 'dre' ? (
              <div className="relative min-w-44 flex-1 xl:w-56 xl:flex-none">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar lançamento"
                  className="h-9 rounded-xl border-slate-200 pl-9 text-xs"
                />
              </div>
            ) : null}
            {!isSupportImpersonating && contas.length > 1 ? (
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl text-xs" onClick={() => setDialog('transferir')}>
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                Transferir
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-xl text-xs"
              onClick={handleCsv}
              disabled={financialValuesHidden || exportDataUnavailable}
              title={
                financialValuesHidden
                  ? 'Mostre os valores pelo olhinho para exportar o CSV.'
                  : exportDataUnavailable
                    ? 'Aguarde o carregamento completo dos lançamentos.'
                    : undefined
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              CSV
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl text-xs" onClick={handlePrint}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              PDF
            </Button>
          </div>
        </div>

        <TabsContent value="visao" className="mt-0 space-y-4">
          {launchesQuery.isLoading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-80 rounded-2xl" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          ) : launchesQuery.data ? (
            <section className="grid gap-4 xl:grid-cols-2">
              <LedgerColumn
                title="Entradas"
                subtitle="Recebidas e previstas no período"
                direction="ENTRADA"
                subtotal={entradas.reduce(
                  (sum, item) => sum + (
                    modo === 'CAIXA'
                      ? item.realizado
                      : modo === 'PREVISTO'
                        ? item.aberto
                        : item.previsto
                  ),
                  0,
                )}
                items={entradas}
                readOnly={isSupportImpersonating}
                onSettle={openSettle}
              />
              <LedgerColumn
                title="Saídas"
                subtitle="Pagas e previstas no período"
                direction="SAIDA"
                subtotal={saidas.reduce(
                  (sum, item) => sum + (
                    modo === 'CAIXA'
                      ? item.realizado
                      : modo === 'PREVISTO'
                        ? item.aberto
                        : item.previsto
                  ),
                  0,
                )}
                items={saidas}
                readOnly={isSupportImpersonating}
                onSettle={openSettle}
              />
            </section>
          ) : null}

          {extratoQuery.isLoading ? (
            <Skeleton className="h-56 rounded-2xl" />
          ) : extratoQuery.data ? (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-100 px-4 py-3">
                <div>
                  <CardTitle className="text-base">Últimas movimentações</CardTitle>
                  <p className="mt-0.5 text-xs text-slate-500">Extrato real, em ordem cronológica.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => updateTab('extrato')}>
                  Ver extrato <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </CardHeader>
              <CardContent className="p-3">
                <MovementList
                  items={filteredMovements.slice(0, 6)}
                  readOnly={isSupportImpersonating}
                  onReverse={openReverse}
                  onDetails={setDetailsMovement}
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="entradas" className="mt-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Entradas</h2>
              {launchesQuery.data ? (
                <p className="text-xs text-slate-500">
                  {entradas.length} lançamentos no filtro · recebido{' '}
                  <FinancialValue>
                    {brl(entradas.reduce((sum, item) => sum + item.realizado, 0))}
                  </FinancialValue>
                </p>
              ) : null}
            </div>
            {!isSupportImpersonating ? (
              <Button type="button" size="sm" className="h-9 gap-2 rounded-xl" onClick={() => setDialog('entrada')}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nova entrada
              </Button>
            ) : null}
          </div>
          {launchesQuery.isLoading ? (
            <Skeleton className="h-72 rounded-2xl" />
          ) : launchesQuery.data ? (
            <LaunchList items={entradas} readOnly={isSupportImpersonating} onSettle={openSettle} />
          ) : null}
        </TabsContent>

        <TabsContent value="saidas" className="mt-0">
          <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
            <ContasAPagar embedded readOnly={isSupportImpersonating} />
          </Suspense>
        </TabsContent>

        <TabsContent value="fixos" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Gastos fixos</h2>
              <p className="text-xs text-slate-500">Modelos que geram contas concretas sem duplicar a mesma competência.</p>
            </div>
            {!isSupportImpersonating ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 rounded-xl"
                  onClick={() => void gerarContasRecorrentes({ horizonteDias: 90 }).then((result) => {
                    toast({
                      title: 'Gastos fixos conferidos',
                      description: `${result.geradas} conta(s) gerada(s); ${result.ignoradas} já existiam.`,
                    });
                    return refreshAll();
                  }).catch(handleMutationError)}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Gerar 90 dias
                </Button>
                <Button type="button" size="sm" className="h-9 gap-2 rounded-xl" onClick={() => setDialog('recorrente')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Novo gasto fixo
                </Button>
              </div>
            ) : null}
          </div>

          {modelosQuery.isLoading ? (
            <Skeleton className="h-56 rounded-2xl" />
          ) : modelosQuery.data ? modelos.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modelos.map((modelo) => (
                <Card key={modelo.id} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{modelo.titulo}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {modelo.fornecedorNome ?? modelo.categoriaNome ?? 'Sem favorecido'}
                        </p>
                      </div>
                      <Badge variant="outline" className={modelo.ativa ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}>
                        {modelo.ativa ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <p className="mt-4 font-display text-xl font-bold tabular-nums text-slate-900">
                      <FinancialValue>{brl(modelo.valor)}</FinancialValue>
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                      <div>
                        <p className="text-slate-500">Recorrência</p>
                        <p className="mt-0.5 font-medium">{RECURRENCE_TYPE_LABELS[modelo.recorrencia]}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Próxima competência</p>
                        <p className="mt-0.5 font-medium">{dateBR(modelo.proximaCompetencia)}</p>
                      </div>
                    </div>
                    {!isSupportImpersonating ? (
                      <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 rounded-lg text-xs"
                          onClick={() => {
                            setSelectedModel(modelo);
                            setDialog('recorrente');
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          {modelo.ativa ? 'Editar' : 'Reativar'}
                        </Button>
                        {modelo.ativa ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            onClick={() => void inativarModeloRecorrente(modelo.id).then(async () => {
                              toast({ title: 'Gasto fixo inativado', description: 'Contas já geradas e pagas não foram alteradas.' });
                              await refreshAll();
                            }).catch(handleMutationError)}
                          >
                            <Power className="h-3.5 w-3.5" aria-hidden="true" />
                            Inativar
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyLedger
              title="Nenhum gasto fixo cadastrado"
              description="Cadastre aluguel, energia, salários e outros compromissos que precisam reaparecer automaticamente."
            />
          ) : null}
        </TabsContent>

        <TabsContent value="dre" className="mt-0 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">DRE por competência</h2>
            <p className="text-xs text-slate-500">Resultado econômico separado do dia em que o dinheiro entrou ou saiu.</p>
          </div>
          {resumoQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : resumoQuery.data ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                <CardContent className="p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Faturamento</p>
                  <p className="mt-2 font-display text-2xl font-bold text-slate-900"><FinancialValue>{brl(resumo.faturamentoCompetencia)}</FinancialValue></p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">Receita reconhecida no período, sem aportes, transferências ou saldo inicial.</p>
                </CardContent>
              </Card>
              <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white">
                <CardContent className="p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-700">Custos e despesas</p>
                  <p className="mt-2 font-display text-2xl font-bold text-slate-900"><FinancialValue>{brl(resumo.despesasCompetencia)}</FinancialValue></p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">Contas classificadas pela competência e classe contábil.</p>
                </CardContent>
              </Card>
              <Card className={cn(
                'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
                resumo.resultadoCompetencia < 0 && 'border-rose-200 from-rose-50',
              )}>
                <CardContent className="p-5">
                  <p className={cn(
                    'text-xs font-bold uppercase tracking-[0.14em] text-emerald-700',
                    resumo.resultadoCompetencia < 0 && 'text-rose-700',
                  )}>
                    Resultado
                  </p>
                  <p className="mt-2 font-display text-2xl font-bold text-slate-900"><FinancialValue>{brl(resumo.resultadoCompetencia)}</FinancialValue></p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">Faturamento menos custos, despesas, impostos e despesas financeiras.</p>
                </CardContent>
              </Card>
            </div>
          ) : null}
          <Alert className="border-slate-200 bg-slate-50">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Caixa e DRE respondem perguntas diferentes</AlertTitle>
            <AlertDescription>
              Use Caixa para saber quanto dinheiro existe; use DRE para entender se o trabalho do mês gerou resultado.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="extrato" className="mt-0 space-y-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Extrato financeiro</h2>
            <p className="text-xs text-slate-500">Somente dinheiro efetivamente movimentado; nada é apagado, estornos aparecem na trilha.</p>
          </div>
          {extratoQuery.isLoading ? (
            <Skeleton className="h-72 rounded-2xl" />
          ) : extratoQuery.data ? (
            <MovementList
              items={filteredMovements}
              readOnly={isSupportImpersonating}
              onReverse={openReverse}
              onDetails={setDetailsMovement}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      <FinanceActionDialog
        kind={dialog}
        open={dialog !== null}
        readOnly={isSupportImpersonating}
        onClose={closeDialog}
        accounts={contas}
        categories={categorias}
        payableCategories={payableCategories}
        launch={selectedLaunch}
        movement={selectedMovement}
        model={selectedModel}
        onSuccess={async (title, description) => {
          toast({ title, description });
          closeDialog();
          await refreshAll();
        }}
        onError={handleMutationError}
      />

      <FinanceMovementDetailsDialog
        movement={detailsMovement}
        open={detailsMovement !== null}
        readOnly={isSupportImpersonating}
        onClose={() => setDetailsMovement(null)}
      />

      <FinanceAccountsDialog
        accounts={contas}
        open={accountsDialogOpen}
        readOnly={isSupportImpersonating}
        onClose={() => setAccountsDialogOpen(false)}
        onSuccess={async (title, description) => {
          toast({ title, description });
          setAccountsDialogOpen(false);
          await refreshAll();
        }}
        onError={handleMutationError}
      />

      <div className="hidden print:block">
        <div className="mb-5 border-b-2 border-slate-900 pb-3">
          <p className="text-xs font-bold uppercase tracking-widest">Retiflow · Central Financeiro</p>
          <h2 className="mt-1 text-2xl font-bold capitalize">{periodTitle}</h2>
          <p className="mt-1 text-sm">Regime: {MODOS.find((item) => item.value === modo)?.label} · Conta: {contas.find((item) => item.id === accountId)?.nome ?? 'Todas as contas'}</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div><p className="text-xs">Entradas</p><p className="font-bold"><FinancialValue>{brl(resumo.entradasRecebidas)}</FinancialValue></p></div>
          <div><p className="text-xs">Saídas</p><p className="font-bold"><FinancialValue>{brl(resumo.saidasPagas)}</FinancialValue></p></div>
          <div><p className="text-xs">A receber</p><p className="font-bold"><FinancialValue>{brl(resumo.aReceber)}</FinancialValue></p></div>
          <div><p className="text-xs">A pagar</p><p className="font-bold"><FinancialValue>{brl(resumo.aPagar)}</FinancialValue></p></div>
        </div>
      </div>
    </div>
  );
}
