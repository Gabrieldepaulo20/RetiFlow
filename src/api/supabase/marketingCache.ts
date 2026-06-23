import type { MarketingResumo } from './marketing';

export const MARKETING_RESUMO_CACHE_TTL_MS = 15 * 60_000;

const STORAGE_KEY_PREFIX = 'retiflow:marketing-growth:v1:';

interface MarketingResumoCacheEntry {
  savedAt: number;
  data: MarketingResumo;
}

export interface CachedMarketingResumo {
  key: string;
  savedAt: number;
  data: MarketingResumo;
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeTargetUserId(targetUserId?: string | null) {
  const normalized = targetUserId?.trim();
  return normalized ? normalized : 'self';
}

export function getMarketingResumoCacheKey(periodDays: number, targetUserId?: string | null) {
  const safePeriod = Number.isFinite(periodDays) ? Math.trunc(periodDays) : 30;
  return `${STORAGE_KEY_PREFIX}${normalizeTargetUserId(targetUserId)}:${safePeriod}`;
}

function isCacheEntry(value: unknown): value is MarketingResumoCacheEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Partial<MarketingResumoCacheEntry>;
  return typeof entry.savedAt === 'number'
    && typeof entry.data === 'object'
    && entry.data !== null;
}

export function readCachedMarketingResumo(
  periodDays: number,
  targetUserId?: string | null,
  now = Date.now(),
): CachedMarketingResumo | null {
  const storage = getStorage();
  if (!storage) return null;

  const key = getMarketingResumoCacheKey(periodDays, targetUserId);
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isCacheEntry(parsed) || now - parsed.savedAt > MARKETING_RESUMO_CACHE_TTL_MS) {
      storage.removeItem(key);
      return null;
    }

    return {
      key,
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeCachedMarketingResumo(
  periodDays: number,
  targetUserId: string | null | undefined,
  data: MarketingResumo,
  savedAt = Date.now(),
) {
  const storage = getStorage();
  if (!storage) return;

  const key = getMarketingResumoCacheKey(periodDays, targetUserId);
  const entry: MarketingResumoCacheEntry = { savedAt, data };

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    storage.removeItem(key);
  }
}

export function clearCachedMarketingResumo(periodDays: number, targetUserId?: string | null) {
  getStorage()?.removeItem(getMarketingResumoCacheKey(periodDays, targetUserId));
}
