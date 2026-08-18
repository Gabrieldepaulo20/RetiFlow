/**
 * Cabeçalho escuro da O.S. — número, status, eixo financeiro e identificação do
 * cliente/peça. Compartilhado pelo modal e pela página.
 *
 * Contrato de teste: o número da nota (`note.number`) precisa aparecer como um
 * único nó de texto exato na tela, e o rótulo do status também isolado — os
 * testes e2e localizam ambos por `getByText(..., { exact: true })`.
 */

import type { ReactNode } from 'react';
import { Car, User } from 'lucide-react';
import {
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  type Client,
  type IntakeNote,
} from '@/types';
import { cn } from '@/lib/utils';
import { OS_STATUS_PILL_ON_INK, osStatusIcon, osStatusTone } from './osStatusVisuals';
import { OS_STEP_HINT } from './osViewModel';

interface OSHeaderBarProps {
  note: IntakeNote;
  client?: Client | null;
  /** Slot antes do número (ex.: botão voltar, na página). */
  leading?: ReactNode;
  /** Slot no canto direito. No modal fica vazio: o Dialog injeta o botão fechar. */
  trailing?: ReactNode;
  /**
   * Elemento do número da O.S. Na página ele precisa ser o `h1` (a suíte de
   * rotas procura `heading` com o nome da nota); no modal o título acessível já
   * é o `DialogTitle`, então fica um `span`.
   */
  numberAs?: 'h1' | 'span';
  className?: string;
}

export function OSHeaderBar({
  note,
  client,
  leading,
  trailing,
  numberAs = 'span',
  className,
}: OSHeaderBarProps) {
  const NumberTag = numberAs;
  const StatusIcon = osStatusIcon(note.status);
  const tone = osStatusTone(note.status);
  const stepHint = OS_STEP_HINT[note.status];

  return (
    <div
      className={cn(
        'relative flex flex-none flex-wrap items-start gap-3 bg-os-ink px-4 pb-3 pt-3 text-os-cream sm:gap-5 sm:px-8 sm:pb-4 sm:pt-4',
        className,
      )}
    >
      {/* Brilho quente no canto superior esquerdo, como no design */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(226,96,11,0.22)_0%,rgba(226,96,11,0)_45%)]"
      />

      <div className="relative flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {leading}
          {/* Nó de texto exato do número — não repetir em outro lugar da tela */}
          <NumberTag className="font-os-mono text-[22px] font-semibold leading-none tracking-tight sm:text-[27px]">
            {note.number}
          </NumberTag>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold',
              OS_STATUS_PILL_ON_INK[tone],
            )}
          >
            <StatusIcon className="h-[14px] w-[14px] shrink-0" />
            <span>{STATUS_LABELS[note.status]}</span>
            {stepHint ? <span className="font-medium opacity-70">· {stepHint}</span> : null}
          </span>

          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              note.paymentStatus === 'PAGO'
                ? 'border-os-done/60 bg-os-done/25 text-os-done-soft'
                : 'border-os-warn-dot/50 bg-os-warn-dot/20 text-os-warn-line',
            )}
          >
            {PAYMENT_STATUS_LABELS[note.paymentStatus]}
          </span>

          <span
            className={cn(
              'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]',
              note.type === 'COMPRA'
                ? 'bg-os-warn-dot/25 text-os-warn-line'
                : 'bg-os-cream/10 text-os-cream-2',
            )}
          >
            {note.type === 'COMPRA' ? 'Compra' : 'Serviço'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-os-cream-2 sm:gap-x-4 sm:text-[14px]">
          <span className="flex min-w-0 items-center gap-2 font-medium text-os-cream">
            <User className="h-[15px] w-[15px] shrink-0 text-os-cream-3" />
            <span className="truncate">{client?.name ?? 'Cliente não encontrado'}</span>
          </span>

          {note.vehicleModel ? (
            <span className="flex min-w-0 items-center gap-2">
              <Car className="h-4 w-4 shrink-0 text-os-cream-3" />
              <span className="truncate">{note.vehicleModel}</span>
            </span>
          ) : null}

          {note.plate ? (
            <span className="rounded-md border border-os-ink-line bg-os-ink-2 px-2.5 py-0.5 font-os-mono text-[12px] font-semibold tracking-[0.08em] text-os-cream">
              {note.plate}
            </span>
          ) : null}
        </div>
      </div>

      {trailing ? <div className="relative flex-none">{trailing}</div> : null}
    </div>
  );
}

export default OSHeaderBar;
