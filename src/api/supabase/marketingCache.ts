import type { MarketingResumo } from './marketing';

export const MARKETING_RESUMO_CACHE_TTL_MS = 5 * 60_000;
export const MARKETING_RESUMO_REFRESH_INTERVAL_MS = 5 * 60_000;

const STORAGE_KEY_PREFIX = 'retiflow:marketing-growth:v4:';
const STORAGE_KEY_FAMILY_PREFIX = 'retiflow:marketing-growth:';

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

function normalizeRequesterUserId(requesterUserId: string) {
  const normalized = requesterUserId.trim();
  if (!normalized) throw new Error('Usuário solicitante é obrigatório para o cache de Crescimento.');
  return normalized;
}

function matchesCacheScope(
  data: MarketingResumo,
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
  const expectedTargetUserId = targetUserId?.trim() || requesterUserId.trim();
  return data.context?.accessLevel === 'basic'
    && data.context.targetUserId === expectedTargetUserId;
}

export function getMarketingResumoCacheKey(
  periodDays: number,
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
  const safePeriod = Number.isFinite(periodDays) ? Math.trunc(periodDays) : 30;
  return `${STORAGE_KEY_PREFIX}${normalizeRequesterUserId(requesterUserId)}:${normalizeTargetUserId(targetUserId)}:${safePeriod}`;
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
  targetUserId: string | null | undefined,
  requesterUserId: string,
  now = Date.now(),
): CachedMarketingResumo | null {
  const storage = getStorage();
  if (!storage) return null;

  const key = getMarketingResumoCacheKey(periodDays, targetUserId, requesterUserId);
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isCacheEntry(parsed)
      || !matchesCacheScope(parsed.data, targetUserId, requesterUserId)
      || now - parsed.savedAt > MARKETING_RESUMO_CACHE_TTL_MS
    ) {
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
  requesterUserId: string,
  data: MarketingResumo,
  savedAt = Date.now(),
) {
  const storage = getStorage();
  if (!storage) return;

  const key = getMarketingResumoCacheKey(periodDays, targetUserId, requesterUserId);
  if (!matchesCacheScope(data, targetUserId, requesterUserId)) {
    storage.removeItem(key);
    return;
  }
  const entry: MarketingResumoCacheEntry = { savedAt, data };

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    storage.removeItem(key);
  }
}

export function clearCachedMarketingResumo(
  periodDays: number,
  targetUserId: string | null | undefined,
  requesterUserId: string,
) {
  getStorage()?.removeItem(getMarketingResumoCacheKey(periodDays, targetUserId, requesterUserId));
}

export function clearAllCachedMarketingResumo() {
  const storage = getStorage();
  if (!storage) return;

  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(STORAGE_KEY_FAMILY_PREFIX)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
}
