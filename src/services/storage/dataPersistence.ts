import type {
  AccountPayable,
  ActivityLog,
  Attachment,
  Customer,
  EmailSuggestion,
  IntakeNote,
  IntakeProduct,
  IntakeService,
  PayableAttachment,
  PayableHistory,
} from '@/types';

// Estado que deve sobreviver ao reload. Campos efêmeros (dataVersion) e catálogos
// imutáveis do seed (payableCategories, payableSuppliers) ficam de fora.
export interface PersistedData {
  customers: Customer[];
  notes: IntakeNote[];
  services: IntakeService[];
  products: IntakeProduct[];
  attachments: Attachment[];
  activities: ActivityLog[];
  payables: AccountPayable[];
  payableAttachments: PayableAttachment[];
  payableHistory: PayableHistory[];
  emailSuggestions: EmailSuggestion[];
}

const STORAGE_KEY = 'retiflow:v1:data';
const SCHEMA_VERSION = 1;
const MAX_ACTIVITIES = 500;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB — localStorage tem ~5 MB por origem

interface StorageEnvelope {
  schemaVersion: number;
  savedAt: string;
  data: PersistedData;
}

function tryParseEnvelope(raw: string): StorageEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).schemaVersion !== SCHEMA_VERSION
    ) {
      return null;
    }
    return parsed as StorageEnvelope;
  } catch {
    return null;
  }
}

/**
 * Carrega o estado persistido do localStorage.
 * Se não houver dados, versão inválida ou qualquer erro → retorna fallback (seed) silenciosamente.
 * Nunca lança exceção.
 */
export function loadStateFromStorage(fallback: PersistedData): PersistedData {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const envelope = tryParseEnvelope(raw);
    if (!envelope) {
      // Schema inválido ou corrompido — descarta e usa seed
      window.localStorage.removeItem(STORAGE_KEY);
      return fallback;
    }

    return envelope.data;
  } catch {
    return fallback;
  }
}

/**
 * Grava o estado no localStorage com envelope versionado.
 * Limita activities a MAX_ACTIVITIES e aborta se o payload ultrapassar 4 MB.
 * Nunca lança exceção.
 */
export function saveStateToStorage(data: PersistedData): void {
  if (typeof window === 'undefined') return;

  const envelope: StorageEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: {
      ...data,
      activities: data.activities.slice(0, MAX_ACTIVITIES),
    },
  };

  try {
    const serialized = JSON.stringify(envelope);

    if (serialized.length > MAX_PAYLOAD_BYTES) {
      console.warn(
        `[dataPersistence] Payload ${Math.round(serialized.length / 1024)}KB excede o limite de 4MB — estado não gravado.`,
      );
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.warn('[dataPersistence] Falha ao persistir estado:', error);
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Agenda uma gravação após `delay` ms. Chamadas anteriores são canceladas. */
export function debouncedSaveToStorage(data: PersistedData, delay = 400): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => saveStateToStorage(data), delay);
}

/** Remove o estado persistido — próximo reload volta ao seed. Útil em testes e logout. */
export function clearPersistedState(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
