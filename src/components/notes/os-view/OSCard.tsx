/**
 * Primitivas de card da O.S. — casca branca com borda quente, título em
 * caixa-alta com ícone laranja e o par rótulo/valor usado nos blocos de dados.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OSCardProps {
  children: ReactNode;
  className?: string;
}

export function OSCard({ children, className }: OSCardProps) {
  return (
    <div className={cn('rounded-[14px] border border-os-line bg-os-surface', className)}>
      {children}
    </div>
  );
}

interface OSCardTitleProps {
  icon: LucideIcon;
  children: ReactNode;
  /** Conteúdo alinhado à direita (contagem de itens, pílula de status…). */
  aside?: ReactNode;
  className?: string;
}

export function OSCardTitle({ icon: Icon, children, aside, className }: OSCardTitleProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-os-stone">
        <Icon className="h-[15px] w-[15px] shrink-0 text-os-accent" />
        {children}
      </div>
      {aside}
    </div>
  );
}

interface OSFieldProps {
  label: string;
  children: ReactNode;
  /** Números, datas, placa e valores usam a mono do design. */
  mono?: boolean;
  /** Linha auxiliar abaixo do valor. */
  hint?: ReactNode;
  className?: string;
}

export function OSField({ label, children, mono, hint, className }: OSFieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-os-stone">{label}</span>
      <span
        className={cn(
          'break-words text-[15px] font-semibold text-os-ink',
          mono && 'font-os-mono font-medium',
        )}
      >
        {children}
      </span>
      {hint ? <span className="text-[12.5px] text-os-stone">{hint}</span> : null}
    </div>
  );
}

/** Régua fina entre grupos dentro de um card. */
export function OSDivider({ className }: { className?: string }) {
  return <div className={cn('h-px bg-os-line-soft', className)} />;
}
