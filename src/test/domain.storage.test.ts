import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJsonStorage, removeStorageItem, writeJsonStorage } from '@/services/storage/browserStorage';

// We need a real localStorage-like object so we can verify writes/reads.
// jsdom provides window.localStorage in the test environment.

const KEY = 'test.storage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ─── readJsonStorage ──────────────────────────────────────────────────────────

describe('readJsonStorage', () => {
  it('returns the fallback when the key does not exist', () => {
    expect(readJsonStorage('nonexistent.key', 'fallback')).toBe('fallback');
  });

  it('returns the fallback for a null fallback value', () => {
    expect(readJsonStorage('nonexistent.key', null)).toBeNull();
  });

  it('parses and returns a stored value', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ hello: 'world' }));
    expect(readJsonStorage(KEY, null)).toEqual({ hello: 'world' });
  });

  it('parses a stored number', () => {
    window.localStorage.setItem(KEY, '42');
    expect(readJsonStorage<number>(KEY, 0)).toBe(42);
  });

  it('parses a stored array', () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    expect(readJsonStorage<number[]>(KEY, [])).toEqual([1, 2, 3]);
  });

  it('returns the fallback for corrupted JSON', () => {
    window.localStorage.setItem(KEY, 'not-valid-json{{{');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readJsonStorage(KEY, 'fallback')).toBe('fallback');
    expect(spy).toHaveBeenCalled();
  });

  it('returns the fallback for an empty string value', () => {
    window.localStorage.setItem(KEY, '');
    expect(readJsonStorage(KEY, 'default')).toBe('default');
  });
});

// ─── writeJsonStorage ─────────────────────────────────────────────────────────

describe('writeJsonStorage', () => {
  it('writes a value that can be read back', () => {
    writeJsonStorage(KEY, { name: 'Gabriel' });
    const raw = window.localStorage.getItem(KEY);
    expect(raw).toBe(JSON.stringify({ name: 'Gabriel' }));
  });

  it('overwrites an existing key', () => {
    writeJsonStorage(KEY, 'original');
    writeJsonStorage(KEY, 'updated');
    expect(readJsonStorage<string>(KEY, '')).toBe('updated');
  });

  it('writes arrays correctly', () => {
    writeJsonStorage(KEY, [10, 20, 30]);
    expect(readJsonStorage<number[]>(KEY, [])).toEqual([10, 20, 30]);
  });

  it('writes null without throwing', () => {
    expect(() => writeJsonStorage(KEY, null)).not.toThrow();
  });

  it('writes booleans correctly', () => {
    writeJsonStorage(KEY, false);
    expect(readJsonStorage<boolean>(KEY, true)).toBe(false);
  });
});

// ─── removeStorageItem ────────────────────────────────────────────────────────

describe('removeStorageItem', () => {
  it('removes an existing key so reads return fallback', () => {
    writeJsonStorage(KEY, 'value');
    removeStorageItem(KEY);
    expect(readJsonStorage(KEY, 'fallback')).toBe('fallback');
  });

  it('does not throw when removing a non-existent key', () => {
    expect(() => removeStorageItem('does.not.exist')).not.toThrow();
  });
});

// ─── round-trip ───────────────────────────────────────────────────────────────

describe('read/write/remove round-trip', () => {
  it('write → read → remove → fallback', () => {
    const data = { a: 1, b: [true, false] };
    writeJsonStorage(KEY, data);
    expect(readJsonStorage(KEY, null)).toEqual(data);
    removeStorageItem(KEY);
    expect(readJsonStorage(KEY, null)).toBeNull();
  });
});
