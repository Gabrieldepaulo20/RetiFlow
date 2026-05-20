import { describe, expect, it } from 'vitest';
import { getInitials } from '@/lib/avatarInitials';

describe('getInitials', () => {
  it('returns empty string for empty input', () => {
    expect(getInitials('')).toBe('');
    expect(getInitials(null)).toBe('');
    expect(getInitials(undefined)).toBe('');
  });

  it('returns two letters of a single-word name', () => {
    expect(getInitials('Gabriel')).toBe('GA');
    expect(getInitials('Ana')).toBe('AN');
  });

  it('returns first letter of first two words', () => {
    expect(getInitials('Gabriel William')).toBe('GW');
    expect(getInitials('Maria Fernanda Silva')).toBe('MF');
  });

  it('always uppercases the result', () => {
    expect(getInitials('gabriel william')).toBe('GW');
    expect(getInitials('maria')).toBe('MA');
  });

  it('skips Portuguese noise tokens (de, da, dos)', () => {
    expect(getInitials('Maria da Silva')).toBe('MS');
    expect(getInitials('João dos Santos')).toBe('JS');
    expect(getInitials('Ana de Souza Lima')).toBe('AS');
  });

  it('handles a name with only one letter gracefully', () => {
    expect(getInitials('A')).toBe('A');
  });

  it('trims extra whitespace', () => {
    expect(getInitials('  Gabriel   William  ')).toBe('GW');
  });
});
