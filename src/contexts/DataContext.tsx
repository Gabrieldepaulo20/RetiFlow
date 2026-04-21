import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountPayable,
  ActivityLog,
  Attachment,
  Client,
  Customer,
  EmailSuggestion,
  FINAL_STATUSES,
  IntakeNote,
  IntakeProduct,
  IntakeService,
  Invoice,
  NoteStatus,
  PayableAttachment,
  PayableCategory,
  PayableHistory,
  PayableSupplier,
} from '@/types';
import * as seed from '@/data/seed';
import { debouncedSaveToStorage, loadStateFromStorage, type PersistedData } from '@/services/storage/dataPersistence';
import { generateId } from '@/lib/generateId';
import { formatNoteNumber, getNextNoteCounter, parseNoteNumberValue } from '@/lib/noteNumbers';
import { applyNoteStatusTransition } from '@/services/domain/intakeNotes';
import {
  getClientes,
  novoCliente,
  updateCliente as updateClienteApi,
  inativarCliente,
  reativarCliente,
  supabaseToClient,
  clientToNovoClientePayload,
} from '@/api/supabase/clientes';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface DataCtx {
  customers: Customer[];
  clients: Client[];
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => Promise<Client>;
  updateClient: (id: string, d: Partial<Client>) => Promise<void>;
  getClient: (id: string) => Client | undefined;

  notes: IntakeNote[];
  addNote: (n: Omit<IntakeNote, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }) => IntakeNote;
  updateNote: (id: string, d: Partial<IntakeNote>) => void;
  getNote: (id: string) => IntakeNote | undefined;
  updateNoteStatus: (id: string, status: NoteStatus) => void;
  createPurchaseNote: (parentNoteId: string) => IntakeNote;
  getChildNotes: (parentNoteId: string) => IntakeNote[];

  services: IntakeService[];
  getServicesForNote: (noteId: string) => IntakeService[];
  addService: (s: Omit<IntakeService, 'id'>) => void;
  replaceServicesForNote: (noteId: string, services: Omit<IntakeService, 'id'>[]) => void;
  removeService: (id: string) => void;

  products: IntakeProduct[];
  getProductsForNote: (noteId: string) => IntakeProduct[];
  addProduct: (p: Omit<IntakeProduct, 'id'>) => void;
  replaceProductsForNote: (noteId: string, products: Omit<IntakeProduct, 'id'>[]) => void;
  removeProduct: (id: string) => void;

  attachments: Attachment[];
  getAttachmentsForNote: (noteId: string) => Attachment[];
  addAttachment: (a: Omit<Attachment, 'id' | 'createdAt'>) => void;

  invoices: Invoice[];
  addInvoice: (inv: Omit<Invoice, 'id'>) => Invoice;
  updateInvoice: (id: string, d: Partial<Invoice>) => void;

  activities: ActivityLog[];
  addActivity: (message: string, noteId?: string) => void;

  noteCounter: number;
  dataVersion: number;

  // ── Contas a Pagar ──────────────────────────────────────────────────────
  payables: AccountPayable[];
  payableCategories: PayableCategory[];
  payableSuppliers: PayableSupplier[];
  payableAttachments: PayableAttachment[];
  payableHistory: PayableHistory[];
  addPayable: (data: Omit<AccountPayable, 'id' | 'createdAt' | 'updatedAt'>) => AccountPayable;
  updatePayable: (id: string, data: Partial<AccountPayable>) => void;
  getPayable: (id: string) => AccountPayable | undefined;
  addPayableAttachment: (data: Omit<PayableAttachment, 'id' | 'createdAt'>) => PayableAttachment;
  addPayableHistoryEntry: (data: Omit<PayableHistory, 'id' | 'createdAt'>) => PayableHistory;
  getAttachmentsForPayable: (payableId: string) => PayableAttachment[];
  getHistoryForPayable: (payableId: string) => PayableHistory[];
  getInstallmentSiblings: (payable: AccountPayable) => AccountPayable[];

  // ── Sugestões de E-mail ──────────────────────────────────────────────────
  emailSuggestions: EmailSuggestion[];
  acceptEmailSuggestion: (id: string) => AccountPayable | null;
  dismissEmailSuggestion: (id: string) => void;
}

const Ctx = createContext<DataCtx | null>(null);

const uid = () => generateId();

export function DataProvider({ children }: { children: ReactNode }) {
  // Carrega estado do localStorage uma única vez na montagem.
  // useRef garante execução única mesmo em StrictMode double-render.
  const initRef = useRef<PersistedData | null>(null);
  if (initRef.current === null) {
    initRef.current = loadStateFromStorage({
      customers: seed.customers,
      notes: seed.notes,
      services: seed.services,
      products: seed.products,
      attachments: seed.attachments,
      invoices: seed.invoices,
      activities: seed.activities,
      payables: seed.payables,
      payableAttachments: seed.payableAttachments,
      payableHistory: seed.payableHistory,
      emailSuggestions: seed.emailSuggestions,
    });
  }
  const init = initRef.current;

  const [customers, setCustomers] = useState<Customer[]>(IS_REAL_AUTH ? [] : init.customers);
  const [notes, setNotes] = useState<IntakeNote[]>(init.notes);
  const [services, setServices] = useState<IntakeService[]>(init.services);
  const [products, setProducts] = useState<IntakeProduct[]>(init.products);
  const [attachments, setAttachments] = useState<Attachment[]>(init.attachments);
  const [invoices, setInvoices] = useState<Invoice[]>(init.invoices);
  const [activities, setActivities] = useState<ActivityLog[]>(init.activities);
  const [noteCounter, setNoteCounter] = useState(() => getNextNoteCounter(init.notes.map((note) => note.number)));
  const [dataVersion, setDataVersion] = useState(0);

  // ── Contas a Pagar state ──────────────────────────────────────────────────
  const [payables, setPayables] = useState<AccountPayable[]>(init.payables);
  const [payableCategories] = useState(seed.payableCategories);
  const [payableSuppliers] = useState(seed.payableSuppliers);
  const [payableAttachments, setPayableAttachments] = useState<PayableAttachment[]>(init.payableAttachments);
  const [payableHistory, setPayableHistory] = useState<PayableHistory[]>(init.payableHistory);
  const [emailSuggestions, setEmailSuggestions] = useState<EmailSuggestion[]>(init.emailSuggestions);

  // Em modo real, carrega clientes do Supabase na montagem.
  useEffect(() => {
    if (!IS_REAL_AUTH) return;
    getClientes({ p_limite: 500 }).then(({ dados }) => {
      setCustomers(dados.map(supabaseToClient));
    }).catch(() => {});
  }, []);

  // Grava estado relevante no localStorage após 400ms de inatividade.
  // payableCategories/payableSuppliers são catálogos estáticos do seed — não precisam persistir.
  // customers são persistidos apenas no modo mock (em modo real vêm do Supabase).
  useEffect(() => {
    debouncedSaveToStorage({
      customers: IS_REAL_AUTH ? [] : customers,
      notes,
      services,
      products,
      attachments,
      invoices,
      activities,
      payables,
      payableAttachments,
      payableHistory,
      emailSuggestions,
    });
  }, [customers, notes, services, products, attachments, invoices, activities, payables, payableAttachments, payableHistory, emailSuggestions]);

  const bumpDataVersion = useCallback(() => {
    setDataVersion((value) => value + 1);
  }, []);

  const addActivity = useCallback((message: string, noteId?: string) => {
    setActivities((previous) => [
      {
        id: uid(),
        noteId,
        message,
        userId: 'user-1',
        createdAt: new Date().toISOString(),
      },
      ...previous,
    ]);
  }, []);

  const addClient = useCallback(async (client: Omit<Client, 'id' | 'createdAt'>): Promise<Client> => {
    if (IS_REAL_AUTH) {
      const payload = clientToNovoClientePayload(client);
      const id = await novoCliente(payload);
      const newClient: Client = { ...client, id, createdAt: new Date().toISOString() };
      setCustomers((previous) => [newClient, ...previous]);
      bumpDataVersion();
      return newClient;
    }
    const newClient: Client = { ...client, id: uid(), createdAt: new Date().toISOString() };
    setCustomers((previous) => [newClient, ...previous]);
    bumpDataVersion();
    addActivity(`Novo cliente cadastrado: ${newClient.name}`);
    return newClient;
  }, [addActivity, bumpDataVersion]);

  // Indexes rebuilt only when source arrays change. They keep read access O(1)
  // and must exist before callbacks that depend on them.
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const clientById = useMemo(() => new Map(customers.map((client) => [client.id, client])), [customers]);

  const childNotesByParentId = useMemo(() => {
    const map = new Map<string, IntakeNote[]>();

    for (const note of notes) {
      if (!note.parentNoteId) continue;
      const bucket = map.get(note.parentNoteId);
      if (bucket) {
        bucket.push(note);
      } else {
        map.set(note.parentNoteId, [note]);
      }
    }

    return map;
  }, [notes]);

  const servicesByNoteId = useMemo(() => {
    const map = new Map<string, IntakeService[]>();

    for (const service of services) {
      const bucket = map.get(service.noteId);
      if (bucket) {
        bucket.push(service);
      } else {
        map.set(service.noteId, [service]);
      }
    }

    return map;
  }, [services]);

  const productsByNoteId = useMemo(() => {
    const map = new Map<string, IntakeProduct[]>();

    for (const product of products) {
      const bucket = map.get(product.noteId);
      if (bucket) {
        bucket.push(product);
      } else {
        map.set(product.noteId, [product]);
      }
    }

    return map;
  }, [products]);

  const attachmentsByNoteId = useMemo(() => {
    const map = new Map<string, Attachment[]>();

    for (const attachment of attachments) {
      const bucket = map.get(attachment.noteId);
      if (bucket) {
        bucket.push(attachment);
      } else {
        map.set(attachment.noteId, [attachment]);
      }
    }

    return map;
  }, [attachments]);

  // ── Contas a Pagar indexes ────────────────────────────────────────────────
  const payableById = useMemo(() => new Map(payables.map((p) => [p.id, p])), [payables]);

  const payableAttachmentsByPayableId = useMemo(() => {
    const map = new Map<string, PayableAttachment[]>();
    for (const att of payableAttachments) {
      const bucket = map.get(att.payableId);
      if (bucket) {
        bucket.push(att);
      } else {
        map.set(att.payableId, [att]);
      }
    }
    return map;
  }, [payableAttachments]);

  const payableHistoryByPayableId = useMemo(() => {
    const map = new Map<string, PayableHistory[]>();
    for (const entry of payableHistory) {
      const bucket = map.get(entry.payableId);
      if (bucket) {
        bucket.push(entry);
      } else {
        map.set(entry.payableId, [entry]);
      }
    }
    return map;
  }, [payableHistory]);

  const updateClient = useCallback(async (id: string, data: Partial<Client>): Promise<void> => {
    if (IS_REAL_AUTH) {
      if ('isActive' in data) {
        if (data.isActive) {
          await reativarCliente(id);
        } else {
          await inativarCliente(id);
        }
      }
      const { isActive: _ia, ...rest } = data;
      const supabaseData: Parameters<typeof updateClienteApi>[1] = {};
      if (rest.name      !== undefined) supabaseData.nome           = rest.name;
      if (rest.tradeName !== undefined) supabaseData.nome_fantasia   = rest.tradeName;
      if (rest.docNumber !== undefined) supabaseData.documento       = rest.docNumber;
      if (rest.docType   !== undefined) supabaseData.tipo_documento  = rest.docType;
      if (rest.notes     !== undefined) supabaseData.observacao      = rest.notes;
      if (Object.keys(supabaseData).length > 0) {
        await updateClienteApi(id, supabaseData);
      }
    }
    setCustomers((previous) => previous.map((client) => (client.id === id ? { ...client, ...data } : client)));
    bumpDataVersion();
  }, [bumpDataVersion]);

  const getClient = useCallback((id: string) => clientById.get(id), [clientById]);

  const addNote = useCallback((note: Omit<IntakeNote, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }) => {
    const now = new Date().toISOString();
    const resolvedNumber = note.number ?? formatNoteNumber(noteCounter);
    const { number: _number, ...noteWithoutNumber } = note;
    const newNote: IntakeNote = {
      ...noteWithoutNumber,
      id: uid(),
      number: resolvedNumber,
      createdAt: now,
      updatedAt: now,
    };

    setNotes((previous) => [newNote, ...previous]);
    const customNumericValue = note.number ? parseNoteNumberValue(note.number) : null;
    if (customNumericValue !== null && customNumericValue >= noteCounter) {
      setNoteCounter((customNumericValue + 1) % 10001);
    } else {
      setNoteCounter((previous) => (previous + 1) % 10001);
    }
    bumpDataVersion();
    addActivity(`${newNote.number} criada`, newNote.id);

    return newNote;
  }, [addActivity, bumpDataVersion, noteCounter]);

  const updateNote = useCallback((id: string, data: Partial<IntakeNote>) => {
    setNotes((previous) =>
      previous.map((note) => (note.id === id ? { ...note, ...data, updatedAt: new Date().toISOString() } : note)),
    );
    bumpDataVersion();
  }, [bumpDataVersion]);

  const getNote = useCallback((id: string) => noteById.get(id), [noteById]);

  const updateNoteStatus = useCallback((id: string, status: NoteStatus) => {
    const changedAt = new Date().toISOString();

    setNotes((previous) => {
      let updatedNotes = previous.map((note) =>
        note.id === id ? applyNoteStatusTransition({ nextStatus: status, previousNote: note, changedAt }) : note,
      );

      const changedNote = updatedNotes.find((note) => note.id === id);
      if (changedNote?.parentNoteId && FINAL_STATUSES.has(status)) {
        updatedNotes = updatedNotes.map((note) => {
          if (note.id === changedNote.parentNoteId && note.status === 'AGUARDANDO_COMPRA' && note.previousStatus) {
            return {
              ...note,
              status: note.previousStatus,
              previousStatus: undefined,
              updatedAt: changedAt,
            };
          }

          return note;
        });
      }

      return updatedNotes;
    });

    bumpDataVersion();

    const note = notes.find((candidate) => candidate.id === id);
    if (!note) {
      return;
    }

    addActivity(`${note.number} movida para ${status}`, id);
    if (note.parentNoteId && FINAL_STATUSES.has(status)) {
      const parent = notes.find((candidate) => candidate.id === note.parentNoteId);
      if (parent && parent.status === 'AGUARDANDO_COMPRA' && parent.previousStatus) {
        addActivity(
          `${parent.number} retomada automaticamente (compra ${status === 'FINALIZADO' ? 'finalizada' : 'encerrada'})`,
          parent.id,
        );
      }
    }
  }, [addActivity, bumpDataVersion, notes]);

  const createPurchaseNote = useCallback((parentId: string) => {
    const parentNote = notes.find((note) => note.id === parentId);
    if (!parentNote) {
      throw new Error('Nota pai não encontrada');
    }

    setNotes((previous) =>
      previous.map((note) =>
        note.id === parentId
          ? {
              ...note,
              previousStatus: note.status,
              status: 'AGUARDANDO_COMPRA',
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    );
    bumpDataVersion();
    addActivity(`${parentNote.number} pausada — aguardando compra`, parentId);

    return addNote({
      clientId: parentNote.clientId,
      status: 'ABERTO',
      type: 'COMPRA',
      parentNoteId: parentId,
      engineType: parentNote.engineType,
      vehicleModel: parentNote.vehicleModel,
      plate: parentNote.plate,
      km: parentNote.km,
      complaint: '',
      observations: `Nota de compra vinculada à ${parentNote.number}`,
      createdByUserId: parentNote.createdByUserId,
      totalServices: 0,
      totalProducts: 0,
      totalAmount: 0,
    });
  }, [addActivity, addNote, bumpDataVersion, notes]);

  const getChildNotes = useCallback((parentNoteId: string) => {
    return childNotesByParentId.get(parentNoteId) ?? [];
  }, [childNotesByParentId]);

  const getServicesForNote = useCallback((noteId: string) => servicesByNoteId.get(noteId) ?? [], [servicesByNoteId]);
  const addService = useCallback((service: Omit<IntakeService, 'id'>) => {
    setServices((previous) => [...previous, { ...service, id: uid() }]);
    bumpDataVersion();
  }, [bumpDataVersion]);
  const replaceServicesForNote = useCallback((noteId: string, nextServices: Omit<IntakeService, 'id'>[]) => {
    setServices((previous) => [
      ...previous.filter((service) => service.noteId !== noteId),
      ...nextServices.map((service) => ({ ...service, id: uid() })),
    ]);
    bumpDataVersion();
  }, [bumpDataVersion]);
  const removeService = useCallback((id: string) => {
    setServices((previous) => previous.filter((service) => service.id !== id));
    bumpDataVersion();
  }, [bumpDataVersion]);

  const getProductsForNote = useCallback((noteId: string) => productsByNoteId.get(noteId) ?? [], [productsByNoteId]);
  const addProduct = useCallback((product: Omit<IntakeProduct, 'id'>) => {
    setProducts((previous) => [...previous, { ...product, id: uid() }]);
    bumpDataVersion();
  }, [bumpDataVersion]);
  const replaceProductsForNote = useCallback((noteId: string, nextProducts: Omit<IntakeProduct, 'id'>[]) => {
    setProducts((previous) => [
      ...previous.filter((product) => product.noteId !== noteId),
      ...nextProducts.map((product) => ({ ...product, id: uid() })),
    ]);
    bumpDataVersion();
  }, [bumpDataVersion]);
  const removeProduct = useCallback((id: string) => {
    setProducts((previous) => previous.filter((product) => product.id !== id));
    bumpDataVersion();
  }, [bumpDataVersion]);

  const getAttachmentsForNote = useCallback((noteId: string) => attachmentsByNoteId.get(noteId) ?? [], [attachmentsByNoteId]);
  const addAttachment = useCallback((attachment: Omit<Attachment, 'id' | 'createdAt'>) => {
    setAttachments((previous) => [
      ...previous,
      {
        ...attachment,
        id: uid(),
        createdAt: new Date().toISOString(),
      },
    ]);
    bumpDataVersion();
  }, [bumpDataVersion]);

  const addInvoice = useCallback((invoice: Omit<Invoice, 'id'>) => {
    const newInvoice: Invoice = { ...invoice, id: uid() };
    setInvoices((previous) => [newInvoice, ...previous]);
    bumpDataVersion();
    addActivity(`Nota fiscal ${invoice.number || ''} registrada`, invoice.noteId);
    return newInvoice;
  }, [addActivity, bumpDataVersion]);

  const updateInvoice = useCallback((id: string, data: Partial<Invoice>) => {
    setInvoices((previous) => previous.map((invoice) => (invoice.id === id ? { ...invoice, ...data } : invoice)));
    bumpDataVersion();
  }, [bumpDataVersion]);

  // ── Contas a Pagar callbacks ──────────────────────────────────────────────

  const addPayable = useCallback((data: Omit<AccountPayable, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const competencyDate = data.competencyDate ?? `${data.dueDate.slice(0, 7)}-01`;
    const newPayable: AccountPayable = {
      ...data,
      competencyDate,
      entrySource: data.entrySource ?? 'MANUAL',
      paymentExecutionStatus: data.paymentExecutionStatus ?? 'MANUAL',
      reconciliationStatus: data.reconciliationStatus ?? 'PENDENTE',
      id: uid(),
      createdAt: now,
      updatedAt: now,
    };
    setPayables((prev) => [newPayable, ...prev]);
    bumpDataVersion();
    addActivity(`Conta a pagar criada: ${newPayable.title}`);
    return newPayable;
  }, [addActivity, bumpDataVersion]);

  const updatePayable = useCallback((id: string, data: Partial<AccountPayable>) => {
    setPayables((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p)),
    );
    bumpDataVersion();
  }, [bumpDataVersion]);

  const getPayable = useCallback((id: string) => payableById.get(id), [payableById]);

  const addPayableAttachment = useCallback((data: Omit<PayableAttachment, 'id' | 'createdAt'>) => {
    const attachment: PayableAttachment = {
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
    };

    setPayableAttachments((previous) => [attachment, ...previous]);
    bumpDataVersion();
    return attachment;
  }, [bumpDataVersion]);

  const addPayableHistoryEntry = useCallback((data: Omit<PayableHistory, 'id' | 'createdAt'>) => {
    const historyEntry: PayableHistory = {
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
    };

    setPayableHistory((previous) => [historyEntry, ...previous]);
    bumpDataVersion();
    return historyEntry;
  }, [bumpDataVersion]);

  const getAttachmentsForPayable = useCallback(
    (payableId: string) => payableAttachmentsByPayableId.get(payableId) ?? [],
    [payableAttachmentsByPayableId],
  );

  const getHistoryForPayable = useCallback(
    (payableId: string) => payableHistoryByPayableId.get(payableId) ?? [],
    [payableHistoryByPayableId],
  );

  const getInstallmentSiblings = useCallback((payable: AccountPayable): AccountPayable[] => {
    const parentId = payable.recurrenceParentId ?? payable.id;
    return payables.filter(
      (p) => p.deletedAt == null && (p.id === parentId || p.recurrenceParentId === parentId),
    ).sort((a, b) => (a.recurrenceIndex ?? 1) - (b.recurrenceIndex ?? 1));
  }, [payables]);

  const acceptEmailSuggestion = useCallback((id: string): AccountPayable | null => {
    const suggestion = emailSuggestions.find((s) => s.id === id);
    if (!suggestion) return null;
    const now = new Date().toISOString();
    const newPayable: AccountPayable = {
      id: uid(),
      title: suggestion.suggestedTitle,
      supplierName: suggestion.suggestedSupplierName,
      categoryId: suggestion.suggestedCategoryId,
      dueDate: suggestion.suggestedDueDate,
      originalAmount: suggestion.suggestedAmount,
      finalAmount: suggestion.suggestedAmount,
      status: 'PENDENTE',
      paymentMethod: suggestion.suggestedPaymentMethod,
      recurrence: 'NENHUMA',
      isUrgent: false,
      entrySource: 'EMAIL_IMPORT',
      createdAt: now,
      updatedAt: now,
      createdByUserId: 'user-2',
    };
    setPayables((prev) => [newPayable, ...prev]);
    setEmailSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'ACCEPTED' } : s));
    bumpDataVersion();
    return newPayable;
  }, [emailSuggestions, bumpDataVersion]);

  const dismissEmailSuggestion = useCallback((id: string) => {
    setEmailSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'DISMISSED' } : s));
  }, []);

  const value = useMemo<DataCtx>(() => ({
    customers,
    clients: customers,
    addClient,
    updateClient,
    getClient,
    notes,
    addNote,
    updateNote,
    getNote,
    updateNoteStatus,
    createPurchaseNote,
    getChildNotes,
    services,
    getServicesForNote,
    addService,
    replaceServicesForNote,
    removeService,
    products,
    getProductsForNote,
    addProduct,
    replaceProductsForNote,
    removeProduct,
    attachments,
    getAttachmentsForNote,
    addAttachment,
    invoices,
    addInvoice,
    updateInvoice,
    activities,
    addActivity,
    noteCounter,
    dataVersion,
    payables,
    payableCategories,
    payableSuppliers,
    payableAttachments,
    payableHistory,
    addPayable,
    updatePayable,
    getPayable,
    addPayableAttachment,
    addPayableHistoryEntry,
    getAttachmentsForPayable,
    getHistoryForPayable,
    getInstallmentSiblings,
    emailSuggestions,
    acceptEmailSuggestion,
    dismissEmailSuggestion,
  }), [
    customers,
    addClient,
    updateClient,
    getClient,
    notes,
    addNote,
    updateNote,
    getNote,
    updateNoteStatus,
    createPurchaseNote,
    getChildNotes,
    services,
    getServicesForNote,
    addService,
    replaceServicesForNote,
    removeService,
    products,
    getProductsForNote,
    addProduct,
    replaceProductsForNote,
    removeProduct,
    attachments,
    getAttachmentsForNote,
    addAttachment,
    invoices,
    addInvoice,
    updateInvoice,
    activities,
    addActivity,
    noteCounter,
    dataVersion,
    payables,
    payableCategories,
    payableSuppliers,
    payableAttachments,
    payableHistory,
    addPayable,
    updatePayable,
    getPayable,
    addPayableAttachment,
    addPayableHistoryEntry,
    getAttachmentsForPayable,
    getHistoryForPayable,
    getInstallmentSiblings,
    emailSuggestions,
    acceptEmailSuggestion,
    dismissEmailSuggestion,
  ]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useData must be within DataProvider');
  }

  return ctx;
}
