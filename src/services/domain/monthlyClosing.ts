import { endOfWeek, startOfWeek } from 'date-fns';
import {
  ClosingLogEntry,
  ClosingLogType,
  ClosingNote,
  ClosingRecord,
  ClosingService,
  Customer,
  IntakeNote,
  IntakeService,
} from '@/types';
import { resolveNoteFinalizedAt } from '@/services/domain/intakeNotes';
import { normalizeNoteNumber } from '@/lib/noteNumbers';

export type ClosingPeriodType = 'mensal' | 'quinzenal' | 'semanal' | 'personalizado';

export interface ClosingPeriodFilters {
  periodType: ClosingPeriodType;
  month: string;
  year: string;
  quinzena: '1' | '2';
  weekDate: Date;
  customRange: {
    from?: Date;
    to?: Date;
  };
  clientFilter: string;
}

export interface ClosingSource {
  customers: Customer[];
  notes: IntakeNote[];
  services: IntakeService[];
}

export function getClosingDateRange(filters: ClosingPeriodFilters) {
  const year = Number.parseInt(filters.year, 10);
  const monthIndex = Number.parseInt(filters.month, 10) - 1;

  if (filters.periodType === 'quinzenal') {
    return filters.quinzena === '1'
      ? { start: new Date(year, monthIndex, 1), end: new Date(year, monthIndex, 15, 23, 59, 59) }
      : { start: new Date(year, monthIndex, 16), end: new Date(year, monthIndex + 1, 0, 23, 59, 59) };
  }

  if (filters.periodType === 'semanal') {
    const weekStart = startOfWeek(filters.weekDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(filters.weekDate, { weekStartsOn: 1 });
    return {
      start: weekStart,
      end: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59),
    };
  }

  if (filters.periodType === 'personalizado' && filters.customRange.from && filters.customRange.to) {
    return {
      start: filters.customRange.from,
      end: new Date(
        filters.customRange.to.getFullYear(),
        filters.customRange.to.getMonth(),
        filters.customRange.to.getDate(),
        23,
        59,
        59,
      ),
    };
  }

  return {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59),
  };
}

export function getServicesForClosingNote(services: IntakeService[], noteId: string) {
  return services.filter((service) => service.noteId === noteId);
}

// ─── Closing Record Calculations ──────────────────────────────────────────

export function calcServiceTotal(service: ClosingService): number {
  const gross = service.price * service.quantity;
  if (service.discountType === 'percent') {
    return gross * (1 - service.discount / 100);
  }
  return Math.max(0, gross - service.discount);
}

export function getNoteDiscount(note: ClosingNote): number {
  return note.services.reduce((sum, service) => {
    const gross = service.price * service.quantity;
    return sum + (gross - calcServiceTotal(service));
  }, 0);
}

export function recalcClosing(closing: ClosingRecord): ClosingRecord {
  const notes = closing.notes.map((note) => {
    const total = note.services.reduce((sum, s) => sum + calcServiceTotal(s), 0);
    return { ...note, total };
  });
  return { ...closing, notes, total: notes.reduce((sum, n) => sum + n.total, 0) };
}

export function createClosingLog(
  message: string,
  type: ClosingLogType,
  createdAt = new Date().toISOString(),
): ClosingLogEntry {
  return {
    id: `log-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt,
  };
}

export function appendClosingLog(closing: ClosingRecord, log: ClosingLogEntry): ClosingRecord {
  return { ...closing, logs: [log, ...closing.logs] };
}

export function cloneClosing(closing: ClosingRecord): ClosingRecord {
  return {
    ...closing,
    notes: closing.notes.map((note) => ({
      ...note,
      services: note.services.map((service) => ({ ...service })),
    })),
    logs: [...closing.logs],
  };
}

// ─── Normalization (safe deserialization from localStorage) ───────────────

function normalizeClosingLogEntry(log: Partial<ClosingLogEntry> | null | undefined): ClosingLogEntry {
  const createdAt = typeof log?.createdAt === 'string' ? log.createdAt : new Date().toISOString();
  return {
    id: typeof log?.id === 'string' ? log.id : `log-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    type: log?.type ?? 'generated',
    message:
      typeof log?.message === 'string' && log.message.trim()
        ? log.message
        : 'Atualização registrada no fechamento.',
    createdAt,
  };
}

export function normalizeClosingRecord(record: Partial<ClosingRecord> | null | undefined): ClosingRecord | null {
  if (!record || typeof record.id !== 'string' || typeof record.clientId !== 'string') {
    return null;
  }

  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();

  return recalcClosing({
    id: record.id,
    label: typeof record.label === 'string' ? record.label : 'Fechamento',
    period: typeof record.period === 'string' ? record.period : 'Período não informado',
    clientId: record.clientId,
    clientName: typeof record.clientName === 'string' ? record.clientName : 'Cliente',
    notes: Array.isArray(record.notes)
      ? record.notes.map((note) => ({
          id: note.id,
          number: normalizeNoteNumber(note.number),
          total: typeof note.total === 'number' ? note.total : 0,
          services: Array.isArray(note.services)
            ? note.services.map((service) => ({
                name: service.name,
                price: typeof service.price === 'number' ? service.price : 0,
                quantity: typeof service.quantity === 'number' ? service.quantity : 0,
                discount: typeof service.discount === 'number' ? service.discount : 0,
                discountType: service.discountType === 'value' ? ('value' as const) : ('percent' as const),
              }))
            : [],
        }))
      : [],
    total: typeof record.total === 'number' ? record.total : 0,
    createdAt,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : createdAt,
    version: typeof record.version === 'number' && record.version > 0 ? record.version : 1,
    regenerationCount: typeof record.regenerationCount === 'number' ? record.regenerationCount : 1,
    editCount: typeof record.editCount === 'number' ? record.editCount : 0,
    downloadCount: typeof record.downloadCount === 'number' ? record.downloadCount : 0,
    logs:
      Array.isArray(record.logs) && record.logs.length > 0
        ? record.logs.map((log) => normalizeClosingLogEntry(log))
        : [createClosingLog('Fechamento recuperado do armazenamento local.', 'generated', createdAt)],
  });
}

// ─── Period label builder ─────────────────────────────────────────────────

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export function buildClosingPeriodLabel(filters: ClosingPeriodFilters, dateRange: { start: Date; end: Date }): string {
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const monthName = MONTH_NAMES[parseInt(filters.month, 10) - 1];

  switch (filters.periodType) {
    case 'mensal':
      return `${monthName}/${filters.year}`;
    case 'quinzenal':
      return `${filters.quinzena === '1' ? '1ª' : '2ª'} Quinzena — ${monthName}/${filters.year}`;
    case 'semanal': {
      const weekStart = startOfWeek(filters.weekDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(filters.weekDate, { weekStartsOn: 1 });
      return `Semana ${fmt(weekStart)} a ${fmt(weekEnd)}`;
    }
    default:
      return `${fmt(dateRange.start)} a ${fmt(dateRange.end)}`;
  }
}

// ─── Closing generation ───────────────────────────────────────────────────

export interface GenerateClosingsParams {
  filters: ClosingPeriodFilters;
  dateRange: { start: Date; end: Date };
  customers: Customer[];
  notes: IntakeNote[];
  services: IntakeService[];
  groupedByClient: Map<string, IntakeNote[]>;
}

export function generateClosingRecords({
  filters,
  dateRange,
  customers,
  services,
  groupedByClient,
}: GenerateClosingsParams): ClosingRecord[] {
  const periodLabel = buildClosingPeriodLabel(filters, dateRange);
  const createdAt = new Date().toISOString();
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const buildClosing = (clientId: string, clientNotes: IntakeNote[]): ClosingRecord => {
    const customer = customerMap.get(clientId);
    const clientName = customer?.name ?? 'Desconhecido';

    const closingNotes: ClosingNote[] = clientNotes.map((note) => ({
      id: note.id,
      number: note.number,
      total: note.totalAmount,
      services: getServicesForClosingNote(services, note.id).map((s) => ({
        name: s.name,
        price: s.price,
        quantity: s.quantity,
        discount: 0,
        discountType: 'percent' as const,
      })),
    }));

    return recalcClosing({
      id: `closing-${Date.now()}-${clientId}`,
      label: `Fechamento ${periodLabel}`,
      period: periodLabel,
      clientId,
      clientName,
      notes: closingNotes,
      total: 0,
      createdAt,
      updatedAt: createdAt,
      version: 1,
      regenerationCount: 1,
      editCount: 0,
      downloadCount: 0,
      logs: [
        createClosingLog(
          `Fechamento gerado com ${clientNotes.length} nota(s) finalizada(s) para ${clientName}.`,
          'generated',
          createdAt,
        ),
      ],
    });
  };

  const results: ClosingRecord[] = [];

  if (filters.clientFilter === 'all') {
    groupedByClient.forEach((clientNotes, clientId) => {
      results.push(buildClosing(clientId, clientNotes));
    });
  } else {
    const notes = groupedByClient.get(filters.clientFilter) ?? [];
    if (notes.length > 0) {
      results.push(buildClosing(filters.clientFilter, notes));
    }
  }

  return results;
}

export function getFinalizedNotesForClosing(source: ClosingSource, filters: ClosingPeriodFilters) {
  const { start, end } = getClosingDateRange(filters);

  return source.notes.filter((note) => {
    if (note.status !== 'FINALIZADO') {
      return false;
    }

    const finalizedAt = resolveNoteFinalizedAt(note);
    if (!finalizedAt) {
      return false;
    }

    const completedAt = new Date(finalizedAt);
    if (completedAt < start || completedAt > end) {
      return false;
    }

    if (filters.clientFilter !== 'all' && note.clientId !== filters.clientFilter) {
      return false;
    }

    return true;
  });
}
