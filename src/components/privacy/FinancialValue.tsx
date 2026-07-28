import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';

type FinancialValueProps = {
  children: ReactNode;
  className?: string;
  mask?: string;
};

export function FinancialValue({
  children,
  className,
  mask = 'R$ ••••••',
}: FinancialValueProps) {
  const { financialValuesHidden } = useFinancialPrivacy();

  return (
    <span
      className={cn('inline-block tabular-nums', className)}
      aria-label={financialValuesHidden ? 'Valor financeiro oculto' : undefined}
    >
      {financialValuesHidden ? mask : children}
    </span>
  );
}
