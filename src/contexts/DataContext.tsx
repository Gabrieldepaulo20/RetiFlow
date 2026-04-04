import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import {
  ActivityLog,
  Attachment,
  Client,
  Customer,
  FINAL_STATUSES,
  IntakeNote,
  IntakeProduct,
  IntakeService,
  Invoice,
  NoteStatus,
} from '@/types';
import * as seed from '@/data/seed';
import { generateId } from '@/lib/generateId';
import { formatNoteNumber, getNextNoteCounter, parseNoteNumberValue } from '@/lib/noteNumbers';
import { applyNoteStatusTransition } from '@/services/domain/intakeNotes';

interface DataCtx {
  customers: Customer[];
  clients: Client[];
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => Client;
  updateClient: (id: string, d: Partial<Client>) => void;
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
}

const Ctx = createContext<DataCtx | null>(null);

const uid = () => generateId();

export function DataProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState(seed.customers);
  const [notes, setNotes] = useState(seed.notes);
  const [services, setServices] = useState(seed.services);
  const [products, setProducts] = useState(seed.products);
  const [attachments, setAttachments] = useState(seed.attachments);
  const [invoices, setInvoices] = useState(seed.invoices);
  const [activities, setActivities] = useState(seed.activities);
  const [noteCounter, setNoteCounter] = useState(() => getNextNoteCounter(seed.notes.map((note) => note.number)));
  const [dataVersion, setDataVersion] = useState(0);

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

  const addClient = useCallback((client: Omit<Client, 'id' | 'createdAt'>) => {
    const newClient: Client = {
      ...client,
      id: uid(),
      createdAt: new Date().toISOString(),
    };

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

  const updateClient = useCallback((id: string, data: Partial<Client>) => {
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
