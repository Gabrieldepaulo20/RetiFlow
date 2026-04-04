const NOTE_NUMBER_MAX = 10000;
const NOTE_NUMBER_CYCLE_SIZE = NOTE_NUMBER_MAX + 1;
const NOTE_NUMBER_PREFIX = 'OS-';

function normalizeCounterValue(value: number): number {
  const integerValue = Number.isFinite(value) ? Math.trunc(value) : 0;
  return ((integerValue % NOTE_NUMBER_CYCLE_SIZE) + NOTE_NUMBER_CYCLE_SIZE) % NOTE_NUMBER_CYCLE_SIZE;
}

export function formatNoteNumber(value: number): string {
  return `${NOTE_NUMBER_PREFIX}${normalizeCounterValue(value)}`;
}

export function extractNoteNumberDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function parseNoteNumberValue(value: string): number {
  const digits = extractNoteNumberDigits(value);
  if (!digits) {
    return 0;
  }

  return normalizeCounterValue(Number.parseInt(digits, 10));
}

export function normalizeNoteNumber(value: string): string {
  return formatNoteNumber(parseNoteNumberValue(value));
}

export function getNextNoteCounter(numbers: string[]): number {
  if (numbers.length === 0) {
    return 0;
  }

  const highest = numbers.reduce((max, number) => {
    return Math.max(max, parseNoteNumberValue(number));
  }, 0);

  return normalizeCounterValue(highest + 1);
}

export function noteMatchesNumericQuery(noteNumber: string, query: string): boolean {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return true;
  }

  const queryDigits = extractNoteNumberDigits(trimmedQuery);
  if (queryDigits) {
    return extractNoteNumberDigits(noteNumber).includes(queryDigits);
  }

  return noteNumber.toLowerCase().includes(trimmedQuery.toLowerCase());
}

export { NOTE_NUMBER_MAX, NOTE_NUMBER_PREFIX };
