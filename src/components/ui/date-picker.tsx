import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function parseDateInput(value: string) {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function toInputDate(date?: Date) {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateInput(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-start rounded-xl border-border/60 px-3 text-left font-normal shadow-sm transition-colors hover:border-primary/20 hover:bg-muted/30 hover:text-foreground',
            className,
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 text-primary" />
          <span className={cn(!selectedDate && 'text-muted-foreground')}>
            {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-[1.75rem] border border-border/70 p-2 shadow-[0_16px_60px_rgba(15,23,42,0.14)]"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            onChange(toInputDate(date));
            setOpen(false);
          }}
          initialFocus
          locale={ptBR}
          className="rounded-2xl bg-background p-2"
          classNames={{
            month: 'space-y-4',
            caption: 'relative flex items-center justify-center px-12 pb-3 pt-1',
            caption_label: 'text-[15px] font-semibold tracking-tight text-foreground',
            table: 'w-full border-separate border-spacing-y-1',
            head_cell: 'w-10 text-sm font-semibold lowercase text-muted-foreground',
            row: 'flex w-full justify-between',
            cell: 'h-10 w-10',
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
