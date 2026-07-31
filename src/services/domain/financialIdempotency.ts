import { generateId } from '@/lib/generateId';

const STORAGE_KEY = 'retiflow:financial-idempotency:v1';
const KEY_PREFIX = 'retiflow-web';

interface StoredAttempt {
  fingerprint: string;
  key: string;
}

type StoredAttempts = Record<string, StoredAttempt>;

export interface FinancialIdempotencyAttempt {
  scope: string;
  fingerprint: string;
  key: string;
}

const fallbackAttempts: StoredAttempts = {};
let storageWriteFailed = false;

function replaceFallbackAttempts(attempts: StoredAttempts) {
  Object.keys(fallbackAttempts).forEach((key) => delete fallbackAttempts[key]);
  Object.assign(fallbackAttempts, attempts);
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function fingerprintHash(value: unknown) {
  const serialized = stableSerialize(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}:${serialized.length}`;
}

function getSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function readAttempts(): StoredAttempts {
  const storage = getSessionStorage();
  if (!storage) return { ...fallbackAttempts };

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null && storageWriteFailed) return { ...fallbackAttempts };
    const parsed = JSON.parse(raw ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const validAttempts = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, StoredAttempt] => {
        const attempt = entry[1];
        return Boolean(
          attempt
          && typeof attempt === 'object'
          && !Array.isArray(attempt)
          && typeof (attempt as StoredAttempt).fingerprint === 'string'
          && typeof (attempt as StoredAttempt).key === 'string',
        );
      }),
    );
    replaceFallbackAttempts(validAttempts);
    return validAttempts;
  } catch {
    return { ...fallbackAttempts };
  }
}

function writeAttempts(attempts: StoredAttempts) {
  replaceFallbackAttempts(attempts);
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    if (Object.keys(attempts).length === 0) {
      storage.removeItem(STORAGE_KEY);
    } else {
      storage.setItem(STORAGE_KEY, JSON.stringify(attempts));
    }
    storageWriteFailed = false;
  } catch {
    storageWriteFailed = true;
    // O espelho em memória ainda mantém retries idempotentes nesta aba quando
    // o navegador bloqueia sessionStorage (modo privado/política corporativa).
  }
}

/**
 * Mantém uma única chave pendente por operação e entidade.
 *
 * - mesmo fingerprint: retry reaproveita a chave;
 * - fingerprint alterado: inicia uma nova tentativa;
 * - sucesso confirmado: `completeFinancialIdempotencyAttempt` libera a chave.
 */
export function acquireFinancialIdempotencyAttempt(input: {
  operation: string;
  entityId: string;
  fingerprint: unknown;
}): FinancialIdempotencyAttempt {
  const scope = `${input.operation}:${input.entityId}`;
  // Só o hash determinístico vai para sessionStorage; observações e outros
  // dados do lançamento não ficam persistidos no navegador.
  const fingerprint = fingerprintHash(input.fingerprint);
  const attempts = readAttempts();
  const current = attempts[scope];

  if (current?.fingerprint === fingerprint) {
    return { scope, fingerprint, key: current.key };
  }

  const key = `${KEY_PREFIX}:${input.operation}:${input.entityId}:${generateId()}`;
  attempts[scope] = { fingerprint, key };
  writeAttempts(attempts);
  return { scope, fingerprint, key };
}

export function completeFinancialIdempotencyAttempt(attempt: FinancialIdempotencyAttempt) {
  const attempts = readAttempts();
  const current = attempts[attempt.scope];
  if (!current || current.key !== attempt.key || current.fingerprint !== attempt.fingerprint) return;

  delete attempts[attempt.scope];
  writeAttempts(attempts);
}
