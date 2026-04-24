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
  PayableEntrySource,
  PayableHistory,
  PayableSupplier,
  PaymentMethod,
  RecurrenceType,
} from '@/types';
import * as seed from '@/data/seed';
import { debouncedSaveToStorage, loadStateFromStorage, type PersistedData } from '@/services/storage/dataPersistence';
import { generateId } from '@/lib/generateId';
import { formatNoteNumber, getNextNoteCounter, parseNoteNumberValue } from '@/lib/noteNumbers';
import { applyNoteStatusTransition } from '@/services/domain/intakeNotes';
import {
  getClientes,
  novoCliente,
  inativarCliente,
  reativarCliente,
  salvarClienteCompleto,
  supabaseToClient,
  clientToNovoClientePayload,
} from '@/api/supabase/clientes';
import {
  getNotasServico,
  getStatusNotas,
  novaNota,
  updateNotaServico as updateNotaServicoDB,
  supabaseToIntakeNote,
  buildStatusIdMap,
} from '@/api/supabase/notas';
import {
  getContasPagar,
  insertContaPagar,
  updateContaPagar,
  registrarPagamento,
  cancelarContaPagar,
  excluirContaPagar,
  type ContaPagar,
  type InsertContaPagarPayload,
} from '@/api/supabase/contas-pagar';
import { getCategorias, type Categoria } from '@/api/supabase/categorias';
import { getFornecedores, type Fornecedor } from '@/api/supabase/fornecedores';
import { getLogs, type LogAtividade } from '@/api/supabase/logs';

// ── Supabase adapters ─────────────────────────────────────────────────────────

function supabaseToAccountPayable(row: ContaPagar): AccountPayable {
  return {
    id: row.id_contas_pagar,
    title: row.titulo,
    supplierId: row.fornecedor?.id,
    supplierName: row.nome_fornecedor ?? row.fornecedor?.nome ?? undefined,
    categoryId: row.categoria.id,
    docNumber: row.numero_documento ?? undefined,
    issueDate: row.data_emissao ?? undefined,
    dueDate: row.data_vencimento,
    originalAmount: row.valor_original,
    interest: row.juros > 0 ? row.juros : undefined,
    discount: row.desconto > 0 ? row.desconto : undefined,
    finalAmount: row.valor_final,
    paidAmount: row.valor_pago ?? undefined,
    status: row.status,
    paymentMethod: (row.forma_pagamento_prevista as PaymentMethod) ?? undefined,
    paidAt: row.pago_em ?? undefined,
    paidWith: (row.pago_com as PaymentMethod) ?? undefined,
    recurrence: (row.recorrencia as RecurrenceType) ?? 'NENHUMA',
    recurrenceIndex: row.indice_recorrencia ?? undefined,
    totalInstallments: row.total_parcelas ?? undefined,
    isUrgent: row.urgente,
    deletedAt: row.excluido_em ?? undefined,
    entrySource: (row.origem_lancamento as PayableEntrySource) ?? 'MANUAL',
    competencyDate: row.data_competencia ?? undefined,
    paymentExecutionStatus: 'MANUAL',
    reconciliationStatus: 'PENDENTE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: '',
  };
}

function supabaseToPayableCategory(cat: Categoria): PayableCategory {
  return {
    id: cat.id_categorias,
    name: cat.nome,
    color: cat.cor,
    icon: cat.icone,
    isActive: cat.ativo,
    createdAt: cat.created_at,
  };
}

function supabaseToPayableSupplier(f: Fornecedor): PayableSupplier {
  return {
    id: f.id_fornecedores,
    name: f.nome,
    tradeName: f.nome_fantasia ?? undefined,
    docType: f.tipo_documento ?? undefined,
    docNumber: f.documento ?? undefined,
    phone: f.telefone ?? undefined,
    email: f.email ?? undefined,
    isActive: f.ativo,
    createdAt: f.created_at,
  };
}

function supabaseToActivityLog(log: LogAtividade): ActivityLog {
  return {
    id: String(log.id_log),
    noteId: log.entidade_id || undefined,
    message: log.descricao,
    userId: log.usuario?.id ?? '',
    createdAt: log.created_at,
  };
}

export interface NotaItemDB {
  descricao: string;
  quantidade: number;
  valor: number;
  desconto?: number;
  detalhes?: string;
}

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

interface DataCtx {
  customers: Customer[];
  clients: Client[];
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => Promise<Client>;
  updateClient: (id: string, d: Partial<Client>) => Promise<void>;
  getClient: (id: string) => Client | undefined;

  notes: IntakeNote[];
  addNote: (n: Omit<IntakeNote, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string }, itens?: NotaItemDB[]) => Promise<IntakeNote>;
  updateNote: (id: string, d: Partial<IntakeNote>, itens?: NotaItemDB[]) => Promise<void>;
  getNote: (id: string) => IntakeNote | undefined;
  updateNoteStatus: (id: string, status: NoteStatus) => void;
  createPurchaseNote: (parentNoteId: string) => Promise<IntakeNote>;
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
  addPayable: (data: Omit<AccountPayable, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AccountPayable>;
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
    const fullState = loadStateFromStorage({
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
    initRef.current = IS_REAL_AUTH
      ? {
          ...fullState,
          customers: [],
          notes: [],
        }
      : fullState;
  }
  const init = initRef.current;

  const [customers, setCustomers] = useState<Customer[]>([]);
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
  const [payableCategories, setPayableCategories] = useState<PayableCategory[]>(seed.payableCategories);
  const [payableSuppliers, setPayableSuppliers] = useState<PayableSupplier[]>(seed.payableSuppliers);
  const [payableAttachments, setPayableAttachments] = useState<PayableAttachment[]>(init.payableAttachments);
  const [payableHistory, setPayableHistory] = useState<PayableHistory[]>(init.payableHistory);
  const [emailSuggestions, setEmailSuggestions] = useState<EmailSuggestion[]>(init.emailSuggestions);

  const statusDbIdRef = useRef<Map<NoteStatus, number>>(new Map());

  // Em modo real, carrega dados do Supabase na montagem.
  useEffect(() => {
    if (!IS_REAL_AUTH) return;
    getClientes({ p_limite: 500 }).then(({ dados }) => {
      setCustomers(dados.map(supabaseToClient));
    }).catch(() => {});
    getNotasServico({ p_limite: 500 }).then(({ dados }) => {
      const loaded = dados.map(supabaseToIntakeNote);
      setNotes(loaded);
      setNoteCounter(getNextNoteCounter(loaded.map((n) => n.number)));
    }).catch(() => {});
    getStatusNotas({ p_tipo_nota: 'Serviço' }).then((statuses) => {
      statusDbIdRef.current = buildStatusIdMap(statuses);
    }).catch(() => {});
    getContasPagar({ p_limite: 500 }).then(({ dados }) => {
      setPayables(dados.map(supabaseToAccountPayable));
    }).catch(() => {});
    getCategorias(true).then((cats) => {
      if (cats.length > 0) setPayableCategories(cats.map(supabaseToPayableCategory));
    }).catch(() => {});
    getFornecedores({ p_ativo: true, p_limite: 200 }).then(({ dados }) => {
      if (dados.length > 0) setPayableSuppliers(dados.map(supabaseToPayableSupplier));
    }).catch(() => {});
    getLogs({ p_limite: 50 }).then(({ dados }) => {
      if (dados.length > 0) setActivities(dados.map(supabaseToActivityLog));
    }).catch(() => {});
  }, []);

  // Grava estado relevante no localStorage após 400ms de inatividade.
  // payableCategories/payableSuppliers são catálogos estáticos do seed — não precisam persistir.
  // customers são persistidos apenas no modo mock (em modo real vêm do Supabase).
  useEffect(() => {
    debouncedSaveToStorage({
      customers: IS_REAL_AUTH ? [] : customers,
      notes: IS_REAL_AUTH ? [] : notes,
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
      // Status changes use dedicated lightweight RPCs
      if ('isActive' in data) {
        if (data.isActive) {
          await reativarCliente(id);
        } else {
          await inativarCliente(id);
        }
      }
      // Full upsert persists all fields including address and contacts
      const current = clientById.get(id);
      if (current) {
        const merged = { ...current, ...data };
        const payload = clientToNovoClientePayload(merged);
        await salvarClienteCompleto({ ...payload, id_clientes: id });
      }
    }
    setCustomers((previous) => previous.map((client) => (client.id === id ? { ...client, ...data } : client)));
    bumpDataVersion();
  }, [bumpDataVersion, clientById]);

  const getClient = useCallback((id: string) => clientById.get(id), [clientById]);

  const addNote = useCallback(async (
    note: Omit<IntakeNote, 'id' | 'number' | 'createdAt' | 'updatedAt'> & { number?: string },
    itens?: NotaItemDB[],
  ): Promise<IntakeNote> => {
    const now = new Date().toISOString();
    const resolvedNumber = note.number ?? formatNoteNumber(noteCounter);
    const { number: _number, ...noteWithoutNumber } = note;

    if (IS_REAL_AUTH) {
      const result = await novaNota({
        tipo_nota: note.type === 'SERVICO' ? 'Serviço' : 'Compra',
        numero_nota: resolvedNumber,
        prazo: note.deadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        defeito: note.complaint || '-',
        fk_clientes: note.type === 'SERVICO' ? note.clientId : undefined,
        fk_notas_servico: note.type === 'COMPRA' ? note.parentNoteId : undefined,
        observacoes: note.observations || undefined,
        total_servicos: note.totalServices,
        total_produtos: note.totalProducts,
        total: note.totalAmount,
        veiculo: note.type === 'SERVICO' ? {
          modelo: note.vehicleModel || 'Não Identificado',
          placa: note.plate || '',
          km: note.km ?? 0,
          motor: note.engineType || 'Não Identificado',
        } : undefined,
        itens,
      });
      const newNote: IntakeNote = {
        ...noteWithoutNumber,
        id: result.id_nota,
        number: resolvedNumber,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((previous) => [newNote, ...previous]);
      bumpDataVersion();
      return newNote;
    }

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

  const updateNote = useCallback(async (id: string, data: Partial<IntakeNote>, itens?: NotaItemDB[]): Promise<void> => {
    if (IS_REAL_AUTH) {
      const payload: Record<string, unknown> = { id_notas_servico: id };
      if (data.complaint    !== undefined) payload.defeito          = data.complaint;
      if (data.observations !== undefined) payload.observacoes      = data.observations;
      if (data.clientId     !== undefined) payload.fk_clientes      = data.clientId;
      if (data.deadline     !== undefined) payload.prazo            = data.deadline;
      if (data.totalServices !== undefined) payload.total_servicos  = data.totalServices;
      if (data.totalProducts !== undefined) payload.total_produtos  = data.totalProducts;
      if (data.totalAmount  !== undefined) payload.total            = data.totalAmount;
      if (data.vehicleModel !== undefined || data.plate !== undefined || data.km !== undefined || data.engineType !== undefined) {
        payload.veiculo = {
          modelo: data.vehicleModel,
          placa:  data.plate,
          km:     data.km,
          motor:  data.engineType,
        };
      }
      if (itens !== undefined) payload.itens = itens;
      await updateNotaServicoDB(payload as { id_notas_servico: string } & Record<string, unknown>);
    }
    setNotes((previous) =>
      previous.map((note) => (note.id === id ? { ...note, ...data, updatedAt: new Date().toISOString() } : note)),
    );
    bumpDataVersion();
  }, [bumpDataVersion]);

  const getNote = useCallback((id: string) => noteById.get(id), [noteById]);

  const updateNoteStatus = useCallback((id: string, status: NoteStatus) => {
    const changedAt = new Date().toISOString();

    if (IS_REAL_AUTH) {
      const statusId = statusDbIdRef.current.get(status);
      if (statusId !== undefined) {
        updateNotaServicoDB({ id_notas_servico: id, fk_status: statusId }).catch(() => {});
      }
    }

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

  const createPurchaseNote = useCallback(async (parentId: string): Promise<IntakeNote> => {
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

  const addPayable = useCallback(async (data: Omit<AccountPayable, 'id' | 'createdAt' | 'updatedAt'>): Promise<AccountPayable> => {
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
    if (IS_REAL_AUTH) {
      try {
        const dbId = await insertContaPagar({
          p_titulo: newPayable.title,
          p_fk_categorias: newPayable.categoryId,
          p_data_vencimento: newPayable.dueDate,
          p_valor_original: newPayable.originalAmount,
          p_fk_fornecedores: newPayable.supplierId,
          p_nome_fornecedor: newPayable.supplierName,
          p_numero_documento: newPayable.docNumber,
          p_data_emissao: newPayable.issueDate,
          p_juros: newPayable.interest,
          p_desconto: newPayable.discount,
          p_forma_pagamento_prevista: newPayable.paymentMethod,
          p_origem_lancamento: newPayable.entrySource,
          p_data_competencia: competencyDate,
          p_recorrencia: newPayable.recurrence,
          p_indice_recorrencia: newPayable.recurrenceIndex,
          p_total_parcelas: newPayable.totalInstallments,
          p_observacoes: newPayable.observations,
          p_urgente: newPayable.isUrgent,
        });
        newPayable.id = dbId;
        if (newPayable.status === 'PAGO' && newPayable.paidAmount) {
          await registrarPagamento({
            p_id_contas_pagar: dbId,
            p_valor_pago: newPayable.paidAmount,
            p_pago_com: newPayable.paidWith,
          });
        }
      } catch (err) {
        console.error('[addPayable]', err);
      }
    }
    setPayables((prev) => [newPayable, ...prev]);
    bumpDataVersion();
    addActivity(`Conta a pagar criada: ${newPayable.title}`);
    return newPayable;
  }, [addActivity, bumpDataVersion]);

  const updatePayable = useCallback((id: string, data: Partial<AccountPayable>) => {
    if (IS_REAL_AUTH) {
      const current = payableById.get(id);
      void (async () => {
        try {
          if ('deletedAt' in data) {
            await excluirContaPagar(id);
          } else if (data.status === 'CANCELADO') {
            await cancelarContaPagar(id);
          } else if (data.paidAmount !== undefined) {
            const prevPaid = current?.paidAmount ?? 0;
            const increment = Number((data.paidAmount - prevPaid).toFixed(2));
            if (increment > 0) {
              await registrarPagamento({
                p_id_contas_pagar: id,
                p_valor_pago: increment,
                p_pago_com: data.paidWith,
                p_observacoes_pagamento: data.paymentNotes,
              });
            }
          } else {
            const payload: Partial<InsertContaPagarPayload> = {};
            if (data.title !== undefined) payload.p_titulo = data.title;
            if (data.categoryId !== undefined) payload.p_fk_categorias = data.categoryId;
            if (data.dueDate !== undefined) payload.p_data_vencimento = data.dueDate;
            if (data.isUrgent !== undefined) payload.p_urgente = data.isUrgent;
            if (data.observations !== undefined) payload.p_observacoes = data.observations;
            if (Object.keys(payload).length > 0) {
              await updateContaPagar(id, payload);
            }
          }
        } catch (err) {
          console.error('[updatePayable]', err);
        }
      })();
    }
    setPayables((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p)),
    );
    bumpDataVersion();
  }, [bumpDataVersion, payableById]);

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
    const localId = uid();
    const newPayable: AccountPayable = {
      id: localId,
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
    if (IS_REAL_AUTH) {
      insertContaPagar({
        p_titulo: newPayable.title,
        p_fk_categorias: newPayable.categoryId,
        p_data_vencimento: newPayable.dueDate,
        p_valor_original: newPayable.originalAmount,
        p_nome_fornecedor: newPayable.supplierName,
        p_forma_pagamento_prevista: newPayable.paymentMethod,
        p_origem_lancamento: 'EMAIL_IMPORT',
        p_recorrencia: 'NENHUMA',
        p_urgente: false,
      }).then((dbId) => {
        setPayables((prev) => prev.map((p) => p.id === localId ? { ...p, id: dbId } : p));
      }).catch((err) => console.error('[acceptEmailSuggestion]', err));
    }
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
