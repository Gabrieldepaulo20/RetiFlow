import { Clock, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  ContextualAction,
  ContextualActionKind,
  ContextualActionVariant,
  ContextualQuestion,
  ContextualTone,
} from '@/services/domain/payables';

interface ContextualQuestionBannerProps {
  question: ContextualQuestion;
  payableId: string;
  onAction: (payableId: string, action: ContextualActionKind) => void;
  onDismiss: (payableId: string) => void;
}

const toneStyles: Record<ContextualTone, { box: string; icon: string; text: string }> = {
  amber: { box: 'border-amber-200 bg-amber-50', icon: 'text-amber-600', text: 'text-amber-900' },
  blue: { box: 'border-sky-200 bg-sky-50', icon: 'text-sky-600', text: 'text-sky-900' },
  green: { box: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-600', text: 'text-emerald-900' },
};

function actionButtonProps(variant: ContextualActionVariant) {
  switch (variant) {
    case 'success':
      return { variant: 'default' as const, className: 'h-7 bg-emerald-600 text-white hover:bg-emerald-700' };
    case 'primary':
      return { variant: 'default' as const, className: 'h-7' };
    case 'secondary':
      return { variant: 'outline' as const, className: 'h-7 bg-white' };
    case 'ghost':
    default:
      return { variant: 'ghost' as const, className: 'h-7' };
  }
}

/**
 * Banner contextual inline, dentro do card da conta (não é popup).
 * Pergunta proativa com ações rápidas + dispensar (X).
 */
export function ContextualQuestionBanner({ question, payableId, onAction, onDismiss }: ContextualQuestionBannerProps) {
  const tone = toneStyles[question.tone];
  const Icon = question.type === 'due_today' || question.type === 'due_soon' ? Clock : HelpCircle;

  return (
    <div
      role="status"
      className={cn('w-full min-w-0 overflow-hidden rounded-xl border px-3 py-2.5', tone.box)}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)} aria-hidden />
        <p className={cn('min-w-0 whitespace-normal break-words text-xs font-medium leading-relaxed', tone.text)}>
          {question.message}
        </p>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
        {question.actions.map((action: ContextualAction) => {
          if (action.action === 'dismiss') {
            const props = actionButtonProps(action.variant);
            return (
              <Button
                key={action.action}
                size="sm"
                variant={props.variant}
                className={cn('min-w-0 shrink-0 px-2 text-xs', props.className)}
                onClick={() => onDismiss(payableId)}
              >
                {action.label}
              </Button>
            );
          }
          const props = actionButtonProps(action.variant);
          return (
            <Button
              key={action.action}
              size="sm"
              variant={props.variant}
              className={cn('min-w-0 shrink-0 px-2.5 text-xs', props.className)}
              onClick={() => onAction(payableId, action.action)}
            >
              {action.label}
            </Button>
          );
        })}
        <button
          type="button"
          aria-label="Dispensar sugestão"
          className={cn('rounded-md p-1 transition-colors hover:bg-black/5', tone.icon)}
          onClick={() => onDismiss(payableId)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
