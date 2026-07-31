import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  FileSearch,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  FinanceiroDirecao,
  FinanceiroLancamento,
  FinanceiroMovimento,
} from '@/api/supabase/financeiro';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from '@/types';
import {
  brl,
  dateBR,
  ORIGEM_LABELS,
  sourceLink,
  STATUS_LABELS,
  STATUS_STYLES,
} from './financeUi';

export function FieldHint({ children }: { children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 text-[11px] font-bold text-muted-foreground outline-none transition hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Ajuda: ${children}`}
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed" side="top">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  emphasized = false,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'projected';
  emphasized?: boolean;
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-700',
    negative: 'text-rose-700',
    projected: 'text-blue-700',
  }[tone];

  return (
    <Card
      className={cn(
        'min-w-0 overflow-visible border-slate-200/80 bg-white shadow-sm',
        emphasized && 'border-blue-200 bg-gradient-to-br from-blue-50 to-white',
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-xs">
            {label}
          </p>
          <FieldHint>{hint}</FieldHint>
        </div>
        <p className={cn('mt-1.5 truncate font-display text-base font-bold tabular-nums sm:text-xl', toneClass)}>
          <FinancialValue>{brl(value)}</FinancialValue>
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ item }: { item: FinanceiroLancamento }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-semibold', STATUS_STYLES[item.status])}>
      {STATUS_LABELS[item.status]}
    </Badge>
  );
}

export function EmptyLedger({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
      <Receipt className="h-7 w-7 text-slate-400" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

function LaunchActions({
  item,
  readOnly,
  onSettle,
}: {
  item: FinanceiroLancamento;
  readOnly: boolean;
  onSettle: (item: FinanceiroLancamento) => void;
}) {
  const link = sourceLink(item);
  const canSettle = item.aberto > 0
    && item.status !== 'CANCELADO'
    && ['NOTA_SERVICO', 'FECHAMENTO', 'CONTA_PAGAR', 'RECEBIVEL_MANUAL'].includes(item.origem);

  return (
    <div className="flex items-center justify-end gap-1">
      {!readOnly && canSettle ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => onSettle(item)}
        >
          {item.direcao === 'ENTRADA' ? 'Receber' : 'Pagar'}
        </Button>
      ) : null}
      {link ? (
        <Button asChild size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" title="Abrir origem">
          <Link to={link}>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Abrir origem</span>
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

export function LaunchList({
  items,
  readOnly,
  compact = false,
  onSettle,
}: {
  items: FinanceiroLancamento[];
  readOnly: boolean;
  compact?: boolean;
  onSettle: (item: FinanceiroLancamento) => void;
}) {
  if (!items.length) {
    return (
      <EmptyLedger
        title="Nenhum lançamento neste recorte"
        description="Altere o mês, a conta ou o regime para consultar outro período."
      />
    );
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{item.descricao}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {ORIGEM_LABELS[item.origem]}{item.origemNumero ? ` · ${item.origemNumero}` : ''}
                  {item.pessoa ? ` · ${item.pessoa}` : ''}
                </p>
              </div>
              <StatusBadge item={item} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Data</p>
                <p className="mt-0.5 font-medium">{dateBR(item.dataEfetiva ?? item.vencimento)}</p>
              </div>
              <div>
                <p className="text-slate-500">Realizado</p>
                <p className="mt-0.5 font-semibold tabular-nums"><FinancialValue>{brl(item.realizado)}</FinancialValue></p>
              </div>
              <div className="text-right">
                <p className="text-slate-500">Em aberto</p>
                <p className="mt-0.5 font-semibold tabular-nums"><FinancialValue>{brl(item.aberto)}</FinancialValue></p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-xs text-slate-500">{item.categoriaNome ?? 'Sem categoria'}</span>
              <LaunchActions item={item} readOnly={readOnly} onSettle={onSettle} />
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Origem / descrição</th>
              {!compact ? <th className="px-3 py-2.5">Pessoa</th> : null}
              <th className="px-3 py-2.5">Data</th>
              <th className="px-3 py-2.5">Categoria</th>
              <th className="px-3 py-2.5 text-right">Previsto</th>
              <th className="px-3 py-2.5 text-right">Realizado</th>
              <th className="px-3 py-2.5 text-right">Aberto</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="w-24 px-3 py-2.5"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-blue-50/35">
                <td className="max-w-[260px] px-3 py-2.5">
                  <p className="truncate font-semibold text-slate-900">{item.descricao}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {ORIGEM_LABELS[item.origem]}{item.origemNumero ? ` · ${item.origemNumero}` : ''}
                  </p>
                </td>
                {!compact ? <td className="max-w-40 truncate px-3 py-2.5 text-slate-600">{item.pessoa ?? '—'}</td> : null}
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                  {dateBR(item.dataEfetiva ?? item.vencimento)}
                </td>
                <td className="max-w-36 truncate px-3 py-2.5 text-slate-600">{item.categoriaNome ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">
                  <FinancialValue>{brl(item.previsto)}</FinancialValue>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                  <FinancialValue>{brl(item.realizado)}</FinancialValue>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-amber-700">
                  <FinancialValue>{brl(item.aberto)}</FinancialValue>
                </td>
                <td className="px-3 py-2.5"><StatusBadge item={item} /></td>
                <td className="px-3 py-2.5">
                  <LaunchActions item={item} readOnly={readOnly} onSettle={onSettle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function LedgerColumn({
  title,
  subtitle,
  direction,
  subtotal,
  items,
  readOnly,
  onSettle,
}: {
  title: string;
  subtitle: string;
  direction: FinanceiroDirecao;
  subtotal: number;
  items: FinanceiroLancamento[];
  readOnly: boolean;
  onSettle: (item: FinanceiroLancamento) => void;
}) {
  const incoming = direction === 'ENTRADA';
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className={cn(
        'border-b px-4 py-3',
        incoming ? 'border-emerald-100 bg-emerald-50/60' : 'border-rose-100 bg-rose-50/60',
      )}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              {incoming
                ? <ArrowDownLeft className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                : <ArrowUpRight className="h-4 w-4 text-rose-700" aria-hidden="true" />}
              {title}
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          <p className={cn(
            'font-display text-lg font-bold tabular-nums',
            incoming ? 'text-emerald-700' : 'text-rose-700',
          )}>
            <FinancialValue>{brl(subtotal)}</FinancialValue>
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-1">
          {items.length ? items.slice(0, 7).map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
            >
              <span className={cn(
                'h-8 w-1 shrink-0 rounded-full',
                incoming ? 'bg-emerald-400' : 'bg-rose-400',
              )} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{item.descricao}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {dateBR(item.dataEfetiva ?? item.vencimento)} · {item.pessoa ?? ORIGEM_LABELS[item.origem]}
                </p>
              </div>
              <div className="text-right">
                <p className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">
                  <FinancialValue>{brl(item.realizado || item.previsto)}</FinancialValue>
                </p>
                {item.aberto > 0 ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onSettle(item)}
                    className="text-[11px] font-semibold text-blue-700 enabled:hover:underline disabled:text-slate-400"
                  >
                    {readOnly ? STATUS_LABELS[item.status] : incoming ? 'Receber' : 'Pagar'}
                  </button>
                ) : (
                  <span className="text-[11px] text-emerald-700">Realizado</span>
                )}
              </div>
            </div>
          )) : (
            <EmptyLedger
              title={`Sem ${incoming ? 'entradas' : 'saídas'}`}
              description="Não há lançamentos para a conta e o período selecionados."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function MovementList({
  items,
  readOnly,
  onReverse,
  onDetails,
}: {
  items: FinanceiroMovimento[];
  readOnly: boolean;
  onReverse: (item: FinanceiroMovimento) => void;
  onDetails: (item: FinanceiroMovimento) => void;
}) {
  if (!items.length) {
    return (
      <EmptyLedger
        title="Sem dinheiro movimentado"
        description="O extrato mostra apenas recebimentos, pagamentos, transferências e estornos confirmados."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2.5">Data</th>
            <th className="px-3 py-2.5">Movimento</th>
            <th className="px-3 py-2.5">Conta / forma</th>
            <th className="px-3 py-2.5 text-right">Valor</th>
            <th className="px-3 py-2.5 text-right">Saldo acumulado</th>
            <th className="w-44 px-3 py-2.5"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100 hover:bg-blue-50/30">
              <td className="whitespace-nowrap px-3 py-3 text-slate-600">{dateBR(item.dataEfetiva)}</td>
              <td className="max-w-[320px] px-3 py-3">
                <p className="truncate font-semibold text-slate-900">{item.descricao}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {ORIGEM_LABELS[item.origem]}{item.estornado ? ' · Estornado' : ''}
                </p>
              </td>
              <td className="px-3 py-3 text-slate-600">
                <p>{item.contaNome ?? 'Conta financeira'}</p>
                <p className="text-xs text-slate-500">
                  {item.formaPagamento ? PAYMENT_METHOD_LABELS[item.formaPagamento] : 'Sem forma informada'}
                </p>
              </td>
              <td className={cn(
                'whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums',
                item.direcao === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700',
              )}>
                <FinancialValue>{item.direcao === 'ENTRADA' ? '+' : '−'} {brl(item.valor)}</FinancialValue>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                <FinancialValue>{item.saldoAcumulado === null ? '—' : brl(item.saldoAcumulado)}</FinancialValue>
              </td>
              <td className="px-3 py-3 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 rounded-lg px-2 text-xs text-slate-600"
                  onClick={() => onDetails(item)}
                >
                  <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                  Detalhes
                </Button>
                {!readOnly && !item.estornado && item.origem !== 'ESTORNO' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 rounded-lg px-2 text-xs text-slate-600"
                    onClick={() => onReverse(item)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Estornar
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
