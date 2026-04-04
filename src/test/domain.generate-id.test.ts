import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateId } from '@/lib/generateId';

const originalCrypto = globalThis.crypto;

describe('generateId', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
    vi.restoreAllMocks();
  });

  it('uses crypto.randomUUID when available', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: vi.fn(() => 'uuid-from-api'),
      },
    });

    expect(generateId()).toBe('uuid-from-api');
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: vi.fn((buffer: Uint8Array) => {
          buffer.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
          return buffer;
        }),
      },
    });

    expect(generateId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('adds a prefix when requested', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: vi.fn(() => 'uuid-with-prefix'),
      },
    });

    expect(generateId('support')).toBe('support-uuid-with-prefix');
  });

  it('falls back to timestamp and random when crypto is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    vi.spyOn(Date, 'now').mockReturnValue(1711843200000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    expect(generateId()).toBe('luer8qo0-4fzzzxjyl');
  });
});
