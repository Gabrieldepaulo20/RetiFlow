import { describe, expect, it } from 'vitest';
import {
  extractNoteNumberDigits,
  formatNoteNumber,
  getNextNoteCounter,
  NOTE_NUMBER_MAX,
  NOTE_NUMBER_PREFIX,
  noteMatchesNumericQuery,
  normalizeNoteNumber,
  parseNoteNumberValue,
} from '@/lib/noteNumbers';

describe('formatNoteNumber', () => {
  it('formats a simple integer with the OS- prefix', () => {
    expect(formatNoteNumber(1)).toBe('OS-1');
    expect(formatNoteNumber(42)).toBe('OS-42');
    expect(formatNoteNumber(9999)).toBe('OS-9999');
  });

  it('formats 0', () => {
    expect(formatNoteNumber(0)).toBe('OS-0');
  });

  it('wraps at NOTE_NUMBER_MAX + 1 (cycle boundary)', () => {
    // 10001 % 10001 === 0
    expect(formatNoteNumber(NOTE_NUMBER_MAX + 1)).toBe('OS-0');
  });

  it('wraps 10001 → OS-0, 10002 → OS-1', () => {
    expect(formatNoteNumber(NOTE_NUMBER_MAX + 2)).toBe('OS-1');
  });

  it('truncates decimal part', () => {
    expect(formatNoteNumber(5.9)).toBe('OS-5');
  });

  it('handles negative values by wrapping to positive cycle', () => {
    // -1 mod 10001 should be 10000
    expect(formatNoteNumber(-1)).toBe(`OS-${NOTE_NUMBER_MAX}`);
  });
});

describe('extractNoteNumberDigits', () => {
  it('strips the OS- prefix and non-digit characters', () => {
    expect(extractNoteNumberDigits('OS-42')).toBe('42');
    expect(extractNoteNumberDigits('OS-1234')).toBe('1234');
  });

  it('returns only digits when input is already a number string', () => {
    expect(extractNoteNumberDigits('99')).toBe('99');
  });

  it('returns empty string for input with no digits', () => {
    expect(extractNoteNumberDigits('OS-')).toBe('');
    expect(extractNoteNumberDigits('abc')).toBe('');
  });
});

describe('parseNoteNumberValue', () => {
  it('parses a standard OS- formatted number', () => {
    expect(parseNoteNumberValue('OS-7')).toBe(7);
    expect(parseNoteNumberValue('OS-999')).toBe(999);
  });

  it('returns 0 for empty or non-numeric input', () => {
    expect(parseNoteNumberValue('')).toBe(0);
    expect(parseNoteNumberValue('OS-')).toBe(0);
    expect(parseNoteNumberValue('abc')).toBe(0);
  });

  it('applies cycle normalization when parsed value exceeds max', () => {
    expect(parseNoteNumberValue(`OS-${NOTE_NUMBER_MAX + 1}`)).toBe(0);
  });
});

describe('normalizeNoteNumber', () => {
  it('round-trips a valid OS- number unchanged', () => {
    expect(normalizeNoteNumber('OS-15')).toBe('OS-15');
  });

  it('normalizes a bare number to OS- prefixed form', () => {
    expect(normalizeNoteNumber('100')).toBe('OS-100');
  });

  it('normalizes an empty string to OS-0', () => {
    expect(normalizeNoteNumber('')).toBe('OS-0');
  });

  it('normalizes a number above max to wrapped value', () => {
    expect(normalizeNoteNumber(`${NOTE_NUMBER_MAX + 1}`)).toBe('OS-0');
  });
});

describe('getNextNoteCounter', () => {
  it('returns 0 for an empty array', () => {
    expect(getNextNoteCounter([])).toBe(0);
  });

  it('returns highest + 1 for a simple list', () => {
    expect(getNextNoteCounter(['OS-1', 'OS-5', 'OS-3'])).toBe(6);
  });

  it('works with a single item', () => {
    expect(getNextNoteCounter(['OS-99'])).toBe(100);
  });

  it('wraps to 0 when next would exceed NOTE_NUMBER_MAX', () => {
    expect(getNextNoteCounter([`OS-${NOTE_NUMBER_MAX}`])).toBe(0);
  });

  it('ignores non-numeric note numbers (treats them as 0)', () => {
    expect(getNextNoteCounter(['OS-', 'abc'])).toBe(1);
  });
});

describe('noteMatchesNumericQuery', () => {
  it('returns true for empty query (shows all)', () => {
    expect(noteMatchesNumericQuery('OS-42', '')).toBe(true);
    expect(noteMatchesNumericQuery('OS-42', '   ')).toBe(true);
  });

  it('matches when query digits appear in the note number digits', () => {
    expect(noteMatchesNumericQuery('OS-123', '12')).toBe(true);
    expect(noteMatchesNumericQuery('OS-123', '23')).toBe(true);
  });

  it('does not match when digits do not appear', () => {
    expect(noteMatchesNumericQuery('OS-100', '99')).toBe(false);
  });

  it('falls back to case-insensitive text match for non-numeric queries', () => {
    expect(noteMatchesNumericQuery('OS-5', 'os')).toBe(true);
    expect(noteMatchesNumericQuery('OS-5', 'OS')).toBe(true);
    expect(noteMatchesNumericQuery('OS-5', 'nope')).toBe(false);
  });

  it('matches exact note number', () => {
    expect(noteMatchesNumericQuery('OS-42', '42')).toBe(true);
  });

  it('matches prefix query "OS-"', () => {
    // extractNoteNumberDigits('OS-') → '' so falls to text match
    expect(noteMatchesNumericQuery('OS-7', 'OS-')).toBe(true);
  });
});

describe('NOTE_NUMBER_PREFIX constant', () => {
  it('is "OS-"', () => {
    expect(NOTE_NUMBER_PREFIX).toBe('OS-');
  });
});

describe('NOTE_NUMBER_MAX constant', () => {
  it('is 10000', () => {
    expect(NOTE_NUMBER_MAX).toBe(10000);
  });
});
