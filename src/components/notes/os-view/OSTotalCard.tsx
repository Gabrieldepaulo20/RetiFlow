/**
 * Card preto do total da O.S. com o desdobramento recebido / em aberto.
 *
 * `Recebido` usa `note.valorRecebido` quando existe (recebimento parcial vem do
 * financeiro) e cai para o total apenas quando a nota está PAGO sem detalhe.
 */

import type { IntakeNote } from '@/types';
import { cn } from '@/lib/utils';
import { buildOSPaymentSummary, formatOSCurrency } from './osViewModel';

interface OSTotalCardProps {
  note: IntakeNote;
  className?: string;
}

export function OSTotalCard({ note, className }: OSTotalCardProps) {
  const { total, received, open } = buildOSPaymentSummary(note);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[14px] bg-os-ink px-6 py-6 text-os-cream sm:px-7',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(226,96,11,0.35),rgba(226,96,11,0)_65%)]"
      />
      <div className="relative flex flex-col gap-1.5">
        <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-os-cream-3">
          Total da O.S.
        </span>
        <span className="font-os-mono text-[34px] font-semibold leading-none tracking-tight text-os-accent-glow sm:text-[44px]">
          {formatOSCurrency(total)}
        </span>

        <div aria-hidden className="my-3.5 mt-4 h-px bg-os-ink-3" />

        <div className="flex justify-between gap-4 text-sm">
          <span className="text-os-cream-2">Recebido</span>
          <span className="font-os-mono font-semibold">{formatOSCurrency(received)}</span>
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm">
          <span className="text-os-cream-2">Em aberto</span>
          <span
            className={cn(
              'font-os-mono font-semibold',
              open > 0 ? 'text-os-accent-glow-2' : 'text-os-done-soft',
            )}
          >
            {formatOSCurrency(open)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default OSTotalCard;
