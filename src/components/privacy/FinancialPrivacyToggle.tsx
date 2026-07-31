import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';
import { cn } from '@/lib/utils';

export function FinancialPrivacyToggle({ className }: { className?: string } = {}) {
  const { financialValuesHidden, toggleFinancialValues } = useFinancialPrivacy();
  const actionLabel = financialValuesHidden
    ? 'Mostrar valores financeiros'
    : 'Ocultar valores financeiros';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-10 gap-2 rounded-xl border border-border/60 bg-background px-2.5 text-muted-foreground shadow-sm hover:bg-muted/70 hover:text-foreground sm:px-3',
            className,
          )}
          onClick={toggleFinancialValues}
          aria-label={actionLabel}
          aria-pressed={!financialValuesHidden}
        >
          {financialValuesHidden
            ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
            : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
          <span className="hidden text-xs font-semibold lg:inline">
            {financialValuesHidden ? 'Valores ocultos' : 'Valores visíveis'}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{actionLabel}</TooltipContent>
    </Tooltip>
  );
}
