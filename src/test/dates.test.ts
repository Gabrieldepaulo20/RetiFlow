import { describe, expect, it } from 'vitest';
import { formatDateBR, formatDateTimeShortBR } from '@/lib/dates';

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
