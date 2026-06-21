import type { IntakeNote } from '@/types';

export type IntakeNoteSortField = 'date' | 'os';
export type IntakeNoteSortDirection = 'asc' | 'desc';

export const INTAKE_NOTE_MONTHS = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const osCollator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});

const monthLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
});

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getIntakeNoteSortLabel(field: IntakeNoteSortField, direction: IntakeNoteSortDirection) {
  if (field === 'os') {
    return direction === 'asc' ? 'O.S. menor primeiro' : 'O.S. maior primeiro';
  }

  return direction === 'asc' ? 'Data mais antiga' : 'Data mais recente';
}

export function getCurrentIntakeMonthInput(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getIntakeMonthRange(monthInput: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthInput);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    start,
    end,
    startInput: toDateInput(start),
    endInput: toDateInput(end),
    label: capitalize(monthLabelFormatter.format(start)),
  };
}

export function compareIntakeNotes(
  a: IntakeNote,
  b: IntakeNote,
  field: IntakeNoteSortField,
  direction: IntakeNoteSortDirection,
) {
  const multiplier = direction === 'asc' ? 1 : -1;

  if (field === 'os') {
    const byOs = osCollator.compare(a.number, b.number);
    if (byOs !== 0) return byOs * multiplier;
  } else {
    const byDate = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (byDate !== 0) return byDate * multiplier;
  }

  const fallbackDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (fallbackDate !== 0) return fallbackDate;

  return osCollator.compare(b.number, a.number);
}
