import { cn } from '@/lib/utils';

type LoadingSpinnerProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

type LoadingScreenProps = {
  className?: string;
  compact?: boolean;
  description?: string;
  label?: string;
};

const spinnerSizeMap: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
};

export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative flex items-center justify-center', spinnerSizeMap[size], className)}
    >
      <div className="absolute inset-0 rounded-full bg-primary/10 blur-md" />
      <div className="absolute inset-0 rounded-full border-[3px] border-primary/15 border-t-primary border-r-primary/50 animate-spin" />
      <div className="absolute inset-[18%] rounded-full border border-primary/10 border-b-primary/35 animate-spin [animation-direction:reverse] [animation-duration:1.8s]" />
      <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-lg shadow-primary/30 animate-pulse" />
    </div>
  );
}

export function LoadingScreen({
  className,
  compact = false,
  description = 'Preparando o conteúdo para você.',
  label = 'Carregando',
}: LoadingScreenProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'flex w-full flex-col items-center justify-center px-6 text-center',
        compact ? 'min-h-[220px] py-8' : 'min-h-[56vh] py-12',
        className,
      )}
      role="status"
    >
      <div className="rounded-[28px] border border-border/60 bg-card/80 px-8 py-7 shadow-sm backdrop-blur-sm">
        <LoadingSpinner size={compact ? 'md' : 'lg'} />
        <div className="mt-5 space-y-1.5">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
