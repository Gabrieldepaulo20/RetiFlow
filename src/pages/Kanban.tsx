import { useState, useMemo, useCallback } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useSearchParams } from "react-router-dom";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  NOTE_STATUS_ORDER,
  STATUS_LABELS,
  FINAL_STATUSES,
  ALLOWED_TRANSITIONS,
  NoteStatus,
} from "@/types";
import {
  FileText,
  Paperclip,
  Clock,
  Car,
  GripVertical,
  Link2,
  Package,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { noteMatchesNumericQuery } from "@/lib/noteNumbers";
import { cn } from "@/lib/utils";
import NoteDetailModal from "@/components/notes/NoteDetailModal";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/* ─── Status color maps ─── */

const COLUMN_ACCENT: Record<string, string> = {
  ABERTO: "bg-blue-500",
  EM_ANALISE: "bg-amber-500",
  ORCAMENTO: "bg-orange-500",
  APROVADO: "bg-emerald-500",
  EM_EXECUCAO: "bg-violet-500",
  AGUARDANDO_COMPRA: "bg-yellow-500",
  PRONTO: "bg-teal-500",
  ENTREGUE: "bg-sky-500",
  FINALIZADO: "bg-slate-400",
  CANCELADO: "bg-red-500",
  DESCARTADO: "bg-zinc-400",
  SEM_CONSERTO: "bg-rose-500",
};

const COLUMN_COUNT_BG: Record<string, string> = {
  ABERTO: "bg-blue-50 text-blue-700",
  EM_ANALISE: "bg-amber-50 text-amber-700",
  ORCAMENTO: "bg-orange-50 text-orange-700",
  APROVADO: "bg-emerald-50 text-emerald-700",
  EM_EXECUCAO: "bg-violet-50 text-violet-700",
  AGUARDANDO_COMPRA: "bg-yellow-50 text-yellow-700",
  PRONTO: "bg-teal-50 text-teal-700",
  ENTREGUE: "bg-sky-50 text-sky-700",
  FINALIZADO: "bg-slate-100 text-slate-600",
  CANCELADO: "bg-red-50 text-red-700",
  DESCARTADO: "bg-zinc-100 text-zinc-600",
  SEM_CONSERTO: "bg-rose-50 text-rose-700",
};

const CARD_ACCENT_BORDER: Record<string, string> = {
  ABERTO: "border-t-blue-400",
  EM_ANALISE: "border-t-amber-400",
  ORCAMENTO: "border-t-orange-400",
  APROVADO: "border-t-emerald-400",
  EM_EXECUCAO: "border-t-violet-400",
  AGUARDANDO_COMPRA: "border-t-yellow-400",
  PRONTO: "border-t-teal-400",
  ENTREGUE: "border-t-sky-400",
  FINALIZADO: "border-t-slate-300",
  CANCELADO: "border-t-red-400",
  DESCARTADO: "border-t-zinc-300",
  SEM_CONSERTO: "border-t-rose-400",
};

/* ─── Period filter ─── */

type PeriodFilter = "all" | "30" | "60" | "90";

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

/* ─── Column visibility (localStorage) ─── */

const STORAGE_KEY = "kanban.visibleColumns.v1";

const FLOW_STATUSES: NoteStatus[] = [
  "ABERTO",
  "EM_ANALISE",
  "ORCAMENTO",
  "APROVADO",
  "EM_EXECUCAO",
  "AGUARDANDO_COMPRA",
  "PRONTO",
  "ENTREGUE",
];

const FINAL_STATUS_LIST: NoteStatus[] = [
  "FINALIZADO",
  "CANCELADO",
  "DESCARTADO",
  "SEM_CONSERTO",
];

function loadVisibleStatuses(): Set<NoteStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return new Set(parsed as NoteStatus[]);
      }
    }
  } catch {
    /* ignore */
  }
  return new Set(NOTE_STATUS_ORDER);
}

function saveVisibleStatuses(set: Set<NoteStatus>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

/* ─── Component ─── */

export default function Kanban() {
  const { notes, clients, updateNoteStatus, getAttachmentsForNote } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const currentYear = new Date().getFullYear().toString();
  const [yearFilter, setYearFilter] = useState<string>(currentYear);
  const [visibleStatuses, setVisibleStatuses] = useState<Set<NoteStatus>>(
    loadVisibleStatuses,
  );

  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(notes.map((note) => new Date(note.createdAt).getFullYear().toString())),
    ).sort((a, b) => Number(b) - Number(a));
    return years.length > 0 ? years : [currentYear];
  }, [currentYear, notes]);

  /* ── Column visibility helpers ── */

  const toggleColumn = useCallback((status: NoteStatus) => {
    setVisibleStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        // Prevent hiding the last visible column
        if (next.size <= 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      saveVisibleStatuses(next);
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    const all = new Set(NOTE_STATUS_ORDER);
    setVisibleStatuses(all);
    saveVisibleStatuses(all);
  }, []);

  const allVisible = visibleStatuses.size === NOTE_STATUS_ORDER.length;

  /* ── Filtered notes ── */

  const filteredNotes = useMemo(() => {
    let result = notes;

    // Period filter
    if (periodFilter !== "all") {
      const days = parseInt(periodFilter, 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      result = result.filter(
        (n) => new Date(n.createdAt).getTime() >= cutoff,
      );
    }

    if (yearFilter !== "all") {
      result = result.filter(
        (n) => new Date(n.createdAt).getFullYear().toString() === yearFilter,
      );
    }

    // Search filter
    if (searchQuery) {
      result = result.filter((note) => {
        const client = clients.find((c) => c.id === note.clientId);
        return (
          [
            note.vehicleModel,
            note.plate ?? "",
            note.engineType ?? "",
            note.complaint,
            client?.name ?? "",
          ].some((v) => v.toLowerCase().includes(searchQuery)) ||
          noteMatchesNumericQuery(note.number, searchQuery)
        );
      });
    }

    return result;
  }, [notes, clients, searchQuery, periodFilter, yearFilter]);

  /* ── Columns ── */

  const columns = NOTE_STATUS_ORDER.filter((s) => visibleStatuses.has(s)).map(
    (status) => ({
      status,
      label: STATUS_LABELS[status],
      notes: filteredNotes.filter((n) => n.status === status),
    }),
  );

  /* ── Drag & drop ── */

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const destStatus = result.destination.droppableId as NoteStatus;
    const noteId = result.draggableId;
    const note = notes.find((n) => n.id === noteId);
    if (!note || note.status === destStatus) return;

    if (FINAL_STATUSES.has(note.status)) {
      toast({
        title: "Ação não permitida",
        description: `"${STATUS_LABELS[note.status]}" é um estágio final.`,
        variant: "destructive",
      });
      return;
    }

    if (note.status === "AGUARDANDO_COMPRA") {
      toast({
        title: "Ação não permitida",
        description: "Esta nota está aguardando uma compra ser finalizada.",
        variant: "destructive",
      });
      return;
    }

    if (FINAL_STATUSES.has(destStatus) || destStatus === "AGUARDANDO_COMPRA") {
      toast({
        title: "Ação não permitida",
        description: `Use o botão correspondente para mover para "${STATUS_LABELS[destStatus]}".`,
        variant: "destructive",
      });
      return;
    }

    const allowed = ALLOWED_TRANSITIONS[note.status];
    if (!allowed.includes(destStatus)) {
      const fromIdx = NOTE_STATUS_ORDER.indexOf(note.status);
      const toIdx = NOTE_STATUS_ORDER.indexOf(destStatus);
      if (toIdx < fromIdx && user?.role === "ADMIN") {
        updateNoteStatus(noteId, destStatus);
        toast({ title: `${note.number} → ${STATUS_LABELS[destStatus]}` });
        return;
      }
      toast({
        title: "Transição não permitida",
        description: `Não é possível mover de "${STATUS_LABELS[note.status]}" para "${STATUS_LABELS[destStatus]}".`,
        variant: "destructive",
      });
      return;
    }

    updateNoteStatus(noteId, destStatus);
    toast({ title: `${note.number} → ${STATUS_LABELS[destStatus]}` });
  };

  /* ── Render ── */

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-background pb-4">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-3">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
              Produção
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {searchQuery
                ? "Resultados filtrados pela busca da barra superior"
                : `Arraste os cards para mover entre etapas · ${yearFilter === "all" ? "todos os anos" : yearFilter}`}
            </p>
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">
              {filteredNotes.length}
            </span>{" "}
            notas
          </span>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period toggles */}
          <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriodFilter(opt.value)}
                className={cn(
                  "text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 leading-none",
                  periodFilter === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1">
            <button
              onClick={() => setYearFilter("all")}
              className={cn(
                "text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 leading-none",
                yearFilter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Todos
            </button>
            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => setYearFilter(year)}
                className={cn(
                  "text-[12px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 leading-none",
                  yearFilter === year
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {year}
              </button>
            ))}
          </div>

          {/* Column visibility */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-[12px] font-medium shadow-none",
                  !allVisible && "border-primary/40 text-primary",
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Colunas
                {!allVisible && (
                  <span className="ml-0.5 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {visibleStatuses.size}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground">
                  Colunas visíveis
                </span>
                {!allVisible && (
                  <button
                    onClick={resetColumns}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Mostrar todas
                  </button>
                )}
              </div>

              {/* Flow group */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                Fluxo de trabalho
              </p>
              <div className="space-y-0.5 mb-3">
                {FLOW_STATUSES.map((status) => (
                  <ColumnToggleRow
                    key={status}
                    status={status}
                    checked={visibleStatuses.has(status)}
                    onToggle={() => toggleColumn(status)}
                    accentClass={COLUMN_ACCENT[status]}
                  />
                ))}
              </div>

              {/* Final group */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                Estágios finais
              </p>
              <div className="space-y-0.5">
                {FINAL_STATUS_LIST.map((status) => (
                  <ColumnToggleRow
                    key={status}
                    status={status}
                    checked={visibleStatuses.has(status)}
                    onToggle={() => toggleColumn(status)}
                    accentClass={COLUMN_ACCENT[status]}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Kanban board */}
      <ErrorBoundary>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin -mx-1 px-1">
          {columns.map((col) => (
            <div key={col.status} className="flex-shrink-0 w-[272px]">
              {/* Column header */}
              <div className="flex items-center gap-2.5 mb-3 px-0.5">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    COLUMN_ACCENT[col.status],
                  )}
                />
                <h2 className="text-[13px] font-semibold text-foreground tracking-tight leading-none">
                  {col.label}
                  {FINAL_STATUSES.has(col.status) && (
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                      final
                    </span>
                  )}
                </h2>
                <span
                  className={cn(
                    "ml-auto text-[11px] font-semibold rounded-md px-1.5 py-0.5 leading-none tabular-nums",
                    col.notes.length > 0
                      ? COLUMN_COUNT_BG[col.status]
                      : "bg-muted text-muted-foreground/50",
                  )}
                >
                  {col.notes.length}
                </span>
              </div>

              {/* Drop zone */}
              <Droppable droppableId={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "space-y-2 min-h-[120px] rounded-lg transition-colors duration-200",
                      snapshot.isDraggingOver
                        ? "bg-primary/[0.04] ring-1 ring-primary/15 ring-inset"
                        : "",
                    )}
                  >
                    {col.notes.map((note, index) => {
                      const client = clients.find(
                        (c) => c.id === note.clientId,
                      );
                      const atts = getAttachmentsForNote(note.id);
                      const daysAgo = Math.floor(
                        (Date.now() - new Date(note.updatedAt).getTime()) /
                          (1000 * 60 * 60 * 24),
                      );

                      return (
                        <Draggable
                          key={note.id}
                          draggableId={note.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              onClick={() => setSelectedNote(note.id)}
                              className={cn(
                                "group bg-card rounded-lg border border-t-2 border-border/50 cursor-pointer transition-all duration-150",
                                CARD_ACCENT_BORDER[note.status],
                                "hover:border-border/80 hover:shadow-sm hover:-translate-y-px",
                                snapshot.isDragging &&
                                  "shadow-lg shadow-black/[0.1] border-border ring-1 ring-primary/15 rotate-[0.4deg] scale-[1.015] -translate-y-0",
                              )}
                            >
                              <div className="p-3">
                                {/* Top row: drag handle + number + type badge + indicators */}
                                <div className="flex items-center gap-1.5">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="opacity-0 group-hover:opacity-30 transition-opacity -ml-0.5 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                  </div>
                                  <span className="text-[11px] font-bold text-muted-foreground/70 tracking-wider tabular-nums uppercase">
                                    {note.number}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[9px] font-semibold px-1.5 py-0.5 rounded-sm leading-none uppercase tracking-wide",
                                      note.type === "COMPRA"
                                        ? "bg-amber-50 text-amber-600"
                                        : "bg-blue-50 text-blue-600",
                                    )}
                                  >
                                    {note.type === "COMPRA" ? "Compra" : "Serviço"}
                                  </span>
                                  <div className="ml-auto flex items-center gap-1.5">
                                    {note.parentNoteId && (
                                      <Link2 className="w-3.5 h-3.5 text-amber-400" />
                                    )}
                                    {note.pdfUrl && (
                                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                                    )}
                                    {atts.length > 0 && (
                                      <span className="flex items-center gap-0.5 text-muted-foreground/40">
                                        <Paperclip className="w-3 h-3" />
                                        <span className="text-[10px] tabular-nums">
                                          {atts.length}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Client name — dominant */}
                                <p className="text-[13.5px] font-semibold text-foreground leading-snug mt-2 truncate">
                                  {client?.name}
                                </p>

                                {/* Vehicle + plate */}
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <Car className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                                  <span className="text-[11.5px] text-muted-foreground truncate flex-1 min-w-0">
                                    {note.vehicleModel}
                                  </span>
                                  {note.plate && (
                                    <span className="ml-auto font-mono text-[10.5px] font-bold bg-zinc-800 text-zinc-100 px-2 py-0.5 rounded-sm shrink-0 tracking-widest uppercase leading-none">
                                      {note.plate}
                                    </span>
                                  )}
                                </div>

                                {/* Footer: value + time */}
                                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40">
                                  <span className="text-[13px] font-bold text-foreground tabular-nums">
                                    R${" "}
                                    {note.totalAmount.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[10.5px] flex items-center gap-1 tabular-nums font-medium",
                                      daysAgo >= 7
                                        ? "text-red-500"
                                        : daysAgo >= 4
                                          ? "text-amber-500"
                                          : "text-muted-foreground/40",
                                    )}
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                    {daysAgo === 0 ? "Hoje" : `${daysAgo}d`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {col.notes.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/30">
                        <Package className="w-5 h-5 mb-1.5" />
                        <span className="text-[11px] font-medium">
                          Nenhuma nota
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      </ErrorBoundary>

      {/* Detail modal */}
      <NoteDetailModal
        noteId={selectedNote}
        onClose={() => setSelectedNote(null)}
      />
    </div>
  );
}

/* ─── Column toggle row (popover item) ─── */

function ColumnToggleRow({
  status,
  checked,
  onToggle,
  accentClass,
}: {
  status: NoteStatus;
  checked: boolean;
  onToggle: () => void;
  accentClass: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors group"
    >
      <div
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          accentClass,
          !checked && "opacity-30",
        )}
      />
      <span
        className={cn(
          "text-[12px] font-medium flex-1 text-left leading-none",
          checked ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {STATUS_LABELS[status]}
      </span>
      <div
        className={cn(
          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
          checked
            ? "bg-primary border-primary"
            : "border-border/60 group-hover:border-border",
        )}
      >
        {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>
    </button>
  );
}
