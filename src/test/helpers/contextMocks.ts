import { vi } from 'vitest';
import type { useAuth } from '@/contexts/AuthContext';
import type { useData } from '@/contexts/DataContext';

type AuthCtx = ReturnType<typeof useAuth>;
type DataCtx = ReturnType<typeof useData>;

/**
 * Bases completas e tipadas para mockar os contextos em testes.
 * Espalhe (`...makeAuthCtx()`) e sobrescreva só o que o teste precisa.
 * Tipadas via ReturnType: se o contexto ganhar um campo, o teste quebra aqui — não em silêncio.
 */
export function makeAuthCtx(overrides: Partial<AuthCtx> = {}): AuthCtx {
  return {
    authMode: 'development',
    realUser: null,
    user: null,
    operationalUser: null,
    supportTargetUser: null,
    session: null,
    supportSession: null,
    isSupportImpersonating: false,
    isAuthLoading: false,
    profileError: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    startSupportImpersonation: vi.fn(),
    endSupportImpersonation: vi.fn(),
    retryAuth: vi.fn(),
    refreshProfile: vi.fn().mockResolvedValue(true),
    isProfileFresh: vi.fn().mockReturnValue(true),
    completeMfaLogin: vi.fn(),
    can: vi.fn(),
    canAccessModule: vi.fn(),
    isAdmin: false,
    ...overrides,
  };
}

export function makeDataCtx(overrides: Partial<DataCtx> = {}): DataCtx {
  return {
    customers: [],
    clients: [],
    addClient: vi.fn(),
    updateClient: vi.fn(),
    getClient: vi.fn(),
    notes: [],
    addNote: vi.fn(),
    updateNote: vi.fn(),
    getNote: vi.fn(),
    updateNoteStatus: vi.fn(),
    registrarRecebimentoNota: vi.fn(),
    estornarRecebimentoNota: vi.fn(),
    createPurchaseNote: vi.fn(),
    getChildNotes: vi.fn(() => []),
    services: [],
    getServicesForNote: vi.fn(() => []),
    addService: vi.fn(),
    replaceServicesForNote: vi.fn(),
    removeService: vi.fn(),
    products: [],
    getProductsForNote: vi.fn(() => []),
    addProduct: vi.fn(),
    replaceProductsForNote: vi.fn(),
    removeProduct: vi.fn(),
    attachments: [],
    getAttachmentsForNote: vi.fn(() => []),
    addAttachment: vi.fn(),
    activities: [],
    addActivity: vi.fn(),
    noteCounter: 0,
    dataVersion: 0,
    payables: [],
    payableCategories: [],
    payableSuppliers: [],
    payableAttachments: [],
    payableHistory: [],
    addPayable: vi.fn(),
    updatePayable: vi.fn(),
    getPayable: vi.fn(),
    addPayableAttachment: vi.fn(),
    addPayableHistoryEntry: vi.fn(),
    getAttachmentsForPayable: vi.fn(() => []),
    getHistoryForPayable: vi.fn(() => []),
    getInstallmentSiblings: vi.fn(() => []),
    emailSuggestions: [],
    refreshEmailSuggestions: vi.fn(),
    acceptEmailSuggestion: vi.fn(),
    dismissEmailSuggestion: vi.fn(),
    ...overrides,
  };
}
