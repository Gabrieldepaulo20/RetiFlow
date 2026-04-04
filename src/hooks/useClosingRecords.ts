import { useCallback, useEffect, useState } from 'react';
import {
  ClosingLogType,
  ClosingRecord,
  ClosingService,
  IntakeNote,
  Customer,
  IntakeService,
} from '@/types';
import {
  appendClosingLog,
  cloneClosing,
  createClosingLog,
  generateClosingRecords,
  normalizeClosingRecord,
  recalcClosing,
} from '@/services/domain/monthlyClosing';
import { getClosingDateRange, ClosingPeriodFilters } from '@/services/domain/monthlyClosing';
import { readJsonStorage, writeJsonStorage } from '@/services/storage/browserStorage';
import { useToast } from '@/hooks/use-toast';

const STORAGE_KEY = 'monthly-closing.records.v1';
const PAGE_SIZE = 15;

function readStoredClosings(): ClosingRecord[] {
  const stored = readJsonStorage<Partial<ClosingRecord>[]>(STORAGE_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .map((r) => normalizeClosingRecord(r))
    .filter((r): r is ClosingRecord => Boolean(r));
}

export interface UseClosingRecordsReturn {
  closings: ClosingRecord[];
  editingClosing: ClosingRecord | null;
  previewClosing: ClosingRecord | null;
  page: number;
  PAGE_SIZE: number;
  setPreviewClosing: (c: ClosingRecord | null) => void;
  openClosingEditor: (c: ClosingRecord) => void;
  closeEditor: () => void;
  updateDraftService: (
    noteId: string,
    serviceIndex: number,
    updater: (service: ClosingService) => ClosingService,
  ) => void;
  saveClosingEdits: () => void;
  recordClosingAction: (
    closingId: string,
    logType: ClosingLogType,
    message: string,
    mutate?: (c: ClosingRecord) => ClosingRecord,
  ) => void;
  handleGenerate: (params: {
    filters: ClosingPeriodFilters;
    customers: Customer[];
    notes: IntakeNote[];
    services: IntakeService[];
    groupedByClient: Map<string, IntakeNote[]>;
  }) => void;
  setPage: (p: number | ((prev: number) => number)) => void;
}

export function useClosingRecords(): UseClosingRecordsReturn {
  const { toast } = useToast();
  const [closings, setClosings] = useState<ClosingRecord[]>(() => readStoredClosings());
  const [editingClosing, setEditingClosing] = useState<ClosingRecord | null>(null);
  const [previewClosing, setPreviewClosing] = useState<ClosingRecord | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEY, closings);
  }, [closings]);

  const openClosingEditor = useCallback((closing: ClosingRecord) => {
    setEditingClosing(cloneClosing(closing));
  }, []);

  const closeEditor = useCallback(() => {
    setEditingClosing(null);
  }, []);

  const updateDraftService = useCallback(
    (noteId: string, serviceIndex: number, updater: (s: ClosingService) => ClosingService) => {
      setEditingClosing((prev) => {
        if (!prev) return prev;
        const notes = prev.notes.map((note) => {
          if (note.id !== noteId) return note;
          return {
            ...note,
            services: note.services.map((s, i) => (i === serviceIndex ? updater(s) : s)),
          };
        });
        return recalcClosing({ ...prev, notes });
      });
    },
    [],
  );

  const saveClosingEdits = useCallback(() => {
    if (!editingClosing) return;

    const savedAt = new Date().toISOString();

    setClosings((prev) =>
      prev.map((closing) => {
        if (closing.id !== editingClosing.id) return closing;

        const updated = recalcClosing({
          ...cloneClosing(editingClosing),
          version: closing.version + 1,
          editCount: closing.editCount + 1,
          regenerationCount: closing.regenerationCount + 1,
          downloadCount: closing.downloadCount,
          createdAt: closing.createdAt,
          updatedAt: savedAt,
          logs: closing.logs,
        });

        return appendClosingLog(
          appendClosingLog(
            updated,
            createClosingLog(`Fechamento salvo na versão ${updated.version}.`, 'edited', savedAt),
          ),
          createClosingLog('Fechamento regerado automaticamente após ajustes nas notas incluídas.', 'regenerated', savedAt),
        );
      }),
    );

    setEditingClosing(null);
    toast({ title: 'Fechamento atualizado e regerado com sucesso.' });
  }, [editingClosing, toast]);

  const recordClosingAction = useCallback(
    (
      closingId: string,
      logType: ClosingLogType,
      message: string,
      mutate?: (c: ClosingRecord) => ClosingRecord,
    ) => {
      const createdAt = new Date().toISOString();
      setClosings((prev) =>
        prev.map((closing) => {
          if (closing.id !== closingId) return closing;
          const mutated = mutate ? mutate(closing) : closing;
          return appendClosingLog(mutated, createClosingLog(message, logType, createdAt));
        }),
      );
    },
    [],
  );

  const handleGenerate = useCallback(
    (params: {
      filters: ClosingPeriodFilters;
      customers: Customer[];
      notes: IntakeNote[];
      services: IntakeService[];
      groupedByClient: Map<string, IntakeNote[]>;
    }) => {
      if (params.notes.length === 0) {
        toast({ title: 'Nenhuma nota finalizada no período', variant: 'destructive' });
        return;
      }

      const dateRange = getClosingDateRange(params.filters);
      const newClosings = generateClosingRecords({ ...params, dateRange });

      if (newClosings.length === 0) {
        toast({ title: 'Nenhuma nota encontrada para o cliente selecionado', variant: 'destructive' });
        return;
      }

      setClosings((prev) => [...newClosings, ...prev]);
      setPage(1);
      toast({ title: `${newClosings.length} fechamento(s) gerado(s)!` });
    },
    [toast],
  );

  return {
    closings,
    editingClosing,
    previewClosing,
    page,
    PAGE_SIZE,
    setPreviewClosing,
    openClosingEditor,
    closeEditor,
    updateDraftService,
    saveClosingEdits,
    recordClosingAction,
    handleGenerate,
    setPage,
  };
}
