import type { IntakeNote } from '@/types';

export type IntakeNoteSortField = 'date' | 'os';
export type IntakeNoteSortDirection = 'asc' | 'desc';

const osCollator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});

export function getIntakeNoteSortLabel(field: IntakeNoteSortField, direction: IntakeNoteSortDirection) {
  if (field === 'os') {
    return direction === 'asc' ? 'O.S. menor primeiro' : 'O.S. maior primeiro';
  }

  return direction === 'asc' ? 'Data mais antiga' : 'Data mais recente';
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
