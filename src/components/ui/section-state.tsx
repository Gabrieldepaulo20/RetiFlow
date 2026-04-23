import { LucideIcon, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

type SectionStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  className?: string;
};

export function SectionEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
}: SectionStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/15 px-6 py-8 text-center',
        className,
      )}
    >
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function SectionErrorState({
  title,
  description,
  icon: Icon = AlertTriangle,
  className,
}: SectionStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-8 text-center',
        className,
      )}
    >
      <div className="mb-3 rounded-full bg-destructive/10 p-3 text-destructive">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-destructive">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
