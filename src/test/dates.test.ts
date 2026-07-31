import { describe, expect, it, vi } from 'vitest';
import { formatDateBR, formatDateTimeShortBR, todayLocalISODate } from '@/lib/dates';

describe('formatDateBR', () => {
  it('formats valid ISO timestamps as pt-BR dates', () => {
    expect(formatDateBR('2026-06-15T12:00:00-03:00')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('returns null for null, undefined and empty values', () => {
    expect(formatDateBR(null)).toBeNull();
    expect(formatDateBR(undefined)).toBeNull();
    expect(formatDateBR('')).toBeNull();
  });

  it('returns null for corrupted timestamps instead of rendering Invalid Date', () => {
    expect(formatDateBR('not-a-date')).toBeNull();
    expect(formatDateBR('0000-00-00')).toBeNull();
    expect(formatDateBR('2026-13-45')).toBeNull();
  });
});

describe('formatDateTimeShortBR', () => {
  it('formats valid timestamps with date and time', () => {
    expect(formatDateTimeShortBR('2026-06-15T12:34:00-03:00')).toMatch(/\d{2}\/\d{2}.*\d{2}:\d{2}/);
  });

  it('returns null for invalid or missing values', () => {
    expect(formatDateTimeShortBR(null)).toBeNull();
    expect(formatDateTimeShortBR(undefined)).toBeNull();
    expect(formatDateTimeShortBR('garbage')).toBeNull();
  });
});

describe('todayLocalISODate', () => {
  it('returns YYYY-MM-DD in the format expected by <input type="date"> defaults', () => {
    expect(todayLocalISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses local date parts, not toISOString/UTC — regression test for the timezone bug', () => {
    // 23h50 local time em America/Sao_Paulo (UTC-3) já é o dia seguinte em UTC.
    // new Date().toISOString().slice(0, 10) devolveria erroneamente o dia seguinte;
    // todayLocalISODate() precisa devolver o dia local correto.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 23, 50, 0)); // 31/jul/2026 23:50 no fuso local do runner
    try {
      expect(todayLocalISODate()).toBe('2026-07-31');
    } finally {
      vi.useRealTimers();
    }
  });

  it('zero-pads single-digit month and day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 10, 0, 0)); // 05/jan/2026
    try {
      expect(todayLocalISODate()).toBe('2026-01-05');
    } finally {
      vi.useRealTimers();
    }
  });
});
