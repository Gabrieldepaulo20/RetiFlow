import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, CalendarClock, Loader2, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { calculatePayableRemainingBalance } from '@/services/domain/payables';
import type { PayablesCashFlowSummary } from '@/services/domain/payablesCashFlow';
import type { PayableBriefing, PayableBriefingHighlightKind } from '@/services/domain/payablesBriefing';
import type { AccountPayable } from '@/types';
import { cn } from '@/lib/utils';

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const HIGHLIGHT_STYLES: Record<PayableBriefingHighlightKind, string> = {
  saida: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
  atraso: 'border-rose-300/30 bg-rose-400/10 text-rose-200',
  anomalia: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  folha: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
};

type Props = {
  summary: PayablesCashFlowSummary;
  briefing: PayableBriefing;
  briefingLoading?: boolean;
  onOpenDetails: (id: string) => void;
  onRefreshBriefing?: () => void;
  prefersReducedMotion?: boolean;
};

function RunwayBars({ summary, reduce }: { summary: PayablesCashFlowSummary; reduce: boolean }) {
  const overdue = { total: summary.overdueTotal, count: summary.overdueCount };
  const max = Math.max(
    overdue.total,
    ...summary.runway.map((day) => day.total),
    1,
  );

  const columns: Array<{
    key: string;
    label: string;
    total: number;
    count: number;
    tone: 'overdue' | 'today' | 'labor' | 'default';
    title: string;
  }> = [];

  if (overdue.total > 0) {
    columns.push({
      key: 'overdue',
      label: 'atraso',
      total: overdue.total,
      count: overdue.count,
      tone: 'overdue',
      title: `Atrasadas: ${fmtBRL(overdue.total)} em ${overdue.count} conta(s)`,
    });
  }

  for (const day of summary.runway) {
    const weekday = day.isToday ? 'hoje' : format(parseISO(day.dateISO), 'eee', { locale: ptBR }).replace('.', '');
    columns.push({
      key: day.dateISO,
      label: weekday,
      total: day.total,
      count: day.count,
      tone: day.isToday ? 'today' : day.hasLabor ? 'labor' : 'default',
      title: day.total > 0
        ? `${format(parseISO(day.dateISO), "dd/MM", { locale: ptBR })}: ${fmtBRL(day.total)} em ${day.count} conta(s)`
        : `${format(parseISO(day.dateISO), 'dd/MM', { locale: ptBR })}: sem vencimentos`,
    });
  }

  const toneClass: Record<string, string> = {
    overdue: 'bg-gradient-to-t from-rose-500/45 to-rose-400',
    today: 'bg-gradient-to-t from-amber-500/55 to-amber-300',
    labor: 'bg-gradient-to-t from-emerald-500/45 to-emerald-300',
    default: 'bg-gradient-to-t from-cyan-600/45 to-cyan-300',
  };

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-slate-400">
        <span>{overdue.total > 0 ? 'Atraso' : 'Hoje'}</span>
        <span>+7 dias</span>
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {columns.map((col, index) => {
          const heightPct = Math.max(col.total > 0 ? 14 : 4, Math.round((col.total / max) * 100));
          return (
            <div key={col.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={col.title}>
              <div className="flex w-full flex-1 items-end">
                <motion.div
                  className={cn('w-full rounded-t-md rounded-b-sm', toneClass[col.tone])}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: index * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: `${heightPct}%`, transformOrigin: 'bottom' }}
                />
              </div>
              <span className={cn('truncate text-[10px]', col.tone === 'today' ? 'font-semibold text-amber-200' : 'text-slate-400')}>
                {col.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PayablesCockpit({ summary, briefing, briefingLoading, onOpenDetails, onRefreshBriefing, prefersReducedMotion }: Props) {
  const reduce = prefersReducedMotion ?? false;
  const isIa = briefing.source === 'ia';

  return (
    <section
      className="relative overflow-hidden rounded-2xl text-slate-100 shadow-[0_24px_60px_-24px_rgba(11,22,34,0.55)]"
      style={{ background: 'radial-gradient(680px 320px at 80% -30%, rgba(52,195,222,0.16), transparent 65%), linear-gradient(165deg, #1D2A38, #16202C 55%)' }}
    >
      {/* malha sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(640px 320px at 82% 0%, #000, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(640px 320px at 82% 0%, #000, transparent 70%)',
        }}
      />

      <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Esquerda: total + runway */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Saídas previstas · próximos 7 dias
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-lg font-bold text-slate-400">R$</span>
            <AnimatedNumber
              value={summary.nextSevenTotal}
              format={(n) => n.toLocaleString('pt-BR')}
              className="font-display text-4xl font-extrabold leading-none text-white tabular-nums sm:text-5xl"
            />
          </div>
          <p className="mt-2 text-[13px] text-slate-400">
            <b className="font-semibold text-cyan-300">{summary.nextSevenCount} {summary.nextSevenCount === 1 ? 'vencimento' : 'vencimentos'}</b>
            {summary.overdueCount > 0 ? (
              <> · <b className="font-semibold text-rose-300">{summary.overdueCount} {summary.overdueCount === 1 ? 'atrasado' : 'atrasados'}</b> exige ação hoje</>
            ) : (
              <> · nada vencido</>
            )}
          </p>

          <RunwayBars summary={summary} reduce={reduce} />

          {/* próximos vencimentos clicáveis */}
          {summary.nextDue.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {summary.nextDue.slice(0, 4).map((payable: AccountPayable) => (
                <button
                  key={payable.id}
                  type="button"
                  onClick={() => onOpenDetails(payable.id)}
                  className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                >
                  <span className="max-w-[130px] truncate text-xs font-medium text-slate-200">{payable.title}</span>
                  <span className="text-xs font-bold tabular-nums text-cyan-200">{fmtBRL(calculatePayableRemainingBalance(payable))}</span>
                  <ArrowRight className="h-3 w-3 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-200" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Direita: briefing */}
        <div className="lg:border-l lg:border-white/10 lg:pl-6">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
              isIa ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'border-white/12 bg-white/[0.05] text-slate-300',
            )}>
              {isIa ? <Sparkles className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {isIa ? 'Resumo da semana · IA' : 'Resumo automático'}
            </span>
            {onRefreshBriefing ? (
              <button
                type="button"
                onClick={onRefreshBriefing}
                disabled={briefingLoading}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:opacity-50"
                aria-label="Atualizar resumo com IA"
                title="Atualizar resumo com IA"
              >
                {briefingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>

          <h3 className="mt-3 font-display text-base font-bold text-white">{briefing.headline}</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-300">{briefing.body}</p>

          {briefing.highlights.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {briefing.highlights.map((highlight, index) => (
                <span
                  key={`${highlight.kind}-${index}`}
                  className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold', HIGHLIGHT_STYLES[highlight.kind])}
                >
                  {highlight.kind === 'anomalia' ? <AlertTriangle className="h-3 w-3" /> : highlight.kind === 'saida' ? <CalendarClock className="h-3 w-3" /> : null}
                  {highlight.text}
                </span>
              ))}
            </div>
          ) : null}

          {!isIa && onRefreshBriefing ? (
            <p className="mt-3 text-[11px] text-slate-500">Toque em atualizar para gerar um resumo escrito por IA.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
