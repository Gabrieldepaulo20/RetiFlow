import { useState, useMemo, useCallback, useRef, useEffect, type TouchEvent as ReactTouchEvent } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useSearchParams } from "react-router-dom";
import { useOperationalData } from "@/contexts/DataContext";
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
  ChevronLeft,
  ChevronRight,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── Status color maps ─── */

/** Dica curta sob o nome da etapa (ex.: Aprovado = espera para execução). */
const STEP_HINT: Partial<Record<NoteStatus, string>> = {
  APROVADO: 'Espera para execução',
};

const COLUMN_ACCENT: Record<NoteStatus, string> = {
  ABERTO: "bg-blue-500",
  EM_ANALISE: "bg-amber-500",
  ORCAMENTO: "bg-orange-500",
  APROVADO: "bg-emerald-500",
  EM_EXECUCAO: "bg-violet-500",
  AGUARDANDO_COMPRA: "bg-yellow-500",
  PRONTA: "bg-teal-500",
  ENTREGUE: "bg-sky-500",
  RECUSADO: "bg-red-500",
  SEM_CONSERTO: "bg-rose-500",
  EXCLUIDA: "bg-zinc-400",
};

const COLUMN_COUNT_BG: Record<NoteStatus, string> = {
  ABERTO: "bg-blue-50 text-blue-700",
  EM_ANALISE: "bg-amber-50 text-amber-700",
  ORCAMENTO: "bg-orange-50 text-orange-700",
  APROVADO: "bg-emerald-50 text-emerald-700",
  EM_EXECUCAO: "bg-violet-50 text-violet-700",
  AGUARDANDO_COMPRA: "bg-yellow-50 text-yellow-700",
  PRONTA: "bg-teal-50 text-teal-700",
  ENTREGUE: "bg-sky-50 text-sky-700",
  RECUSADO: "bg-red-50 text-red-700",
  SEM_CONSERTO: "bg-rose-50 text-rose-700",
  EXCLUIDA: "bg-zinc-100 text-zinc-600",
};

const CARD_ACCENT_BORDER: Record<NoteStatus, string> = {
  ABERTO: "border-t-blue-400",
  EM_ANALISE: "border-t-amber-400",
  ORCAMENTO: "border-t-orange-400",
  APROVADO: "border-t-emerald-400",
  EM_EXECUCAO: "border-t-violet-400",
  AGUARDANDO_COMPRA: "border-t-yellow-400",
  PRONTA: "border-t-teal-400",
  ENTREGUE: "border-t-sky-400",
  RECUSADO: "border-t-red-400",
  SEM_CONSERTO: "border-t-rose-400",
  EXCLUIDA: "border-t-zinc-300",
};

/* ─── Period filter ─── */

type PeriodFilter = "all" | "30" | "60" | "90";

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

const MOBILE_PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "30", label: "30d" },
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
  "PRONTA",
  "ENTREGUE",
];

const FINAL_STATUS_LIST: NoteStatus[] = [
  "RECUSADO",
  "SEM_CONSERTO",
];

function loadVisibleStatuses(): Set<NoteStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Preferências antigas podem conter status removidos na reforma
        // (ex.: PRONTO, FINALIZADO); sem este filtro o board pode abrir vazio.
        const known = parsed.filter(
          (s): s is NoteStatus =>
            typeof s === 'string' && (NOTE_STATUS_ORDER as string[]).includes(s),
        );
        if (known.length > 0) return new Set(known);
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
  const { notes, clients, updateNoteStatus, getAttachmentsForNote } = useOperationalData();
  const { user } = useAuth();
  const { toast } = useToast();
  const boardScrollerRef = useRef<HTMLDivElement | null>(null);
  const boardTouchRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    horizontal: boolean;
    interactive: boolean;
  } | null>(null);
  const suppressCardClickRef = useRef(false);
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

  const scrollBoardBy = useCallback((direction: -1 | 1) => {
    const scroller = boardScrollerRef.current;
    if (!scroller) return;

    const distance = Math.max(280, Math.floor(scroller.clientWidth * 0.75));
    scroller.scrollBy({ left: direction * distance, behavior: "smooth" });
  }, []);

  const isInteractiveTouchTarget = useCallback((target: EventTarget | null) => (
    target instanceof HTMLElement &&
    Boolean(target.closest("button,a,input,textarea,select,[role='button'],[data-kanban-drag-handle]"))
  ), []);

  const handleBoardTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const scroller = boardScrollerRef.current;
    const touch = event.touches[0];
    if (!scroller || !touch) {
      boardTouchRef.current = null;
      return;
    }

    boardTouchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      scrollLeft: scroller.scrollLeft,
      horizontal: false,
      interactive: isInteractiveTouchTarget(event.target),
    };
  }, [isInteractiveTouchTarget]);

  const handleBoardTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const scroller = boardScrollerRef.current;
    const state = boardTouchRef.current;
    const touch = event.touches[0];
    if (!scroller || !state || !touch || state.interactive) return;

    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!state.horizontal && absX > 10 && absX > absY + 4) {
      state.horizontal = true;
    }

    if (state.horizontal) {
      if (event.cancelable) event.preventDefault();
      scroller.scrollLeft = state.scrollLeft - deltaX;
      suppressCardClickRef.current = true;
    }
  }, []);

  const handleBoardTouchEnd = useCallback(() => {
    boardTouchRef.current = null;
    if (suppressCardClickRef.current) {
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 120);
    }
  }, []);

  const handleBoardWheel = useCallback((event: WheelEvent) => {
    const scroller = boardScrollerRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

    const target = event.target;
    const columnScroller =
      target instanceof HTMLElement
        ? target.closest<HTMLElement>("[data-kanban-column-scroll]")
        : null;

    if (columnScroller) {
      const canScrollVertically =
        columnScroller.scrollHeight > columnScroller.clientHeight + 1;
      const isScrollingDown = event.deltaY > 0;
      const isScrollingUp = event.deltaY < 0;
      const atTop = columnScroller.scrollTop <= 0;
      const atBottom =
        columnScroller.scrollTop + columnScroller.clientHeight >=
        columnScroller.scrollHeight - 1;

      if (
        canScrollVertically &&
        ((isScrollingDown && !atBottom) || (isScrollingUp && !atTop))
      ) {
        return;
      }
    }

    event.preventDefault();
    scroller.scrollLeft += event.deltaY;
  }, []);

  useEffect(() => {
    const scroller = boardScrollerRef.current;
    if (!scroller) return undefined;

    scroller.addEventListener("wheel", handleBoardWheel, { passive: false });

    return () => {
      scroller.removeEventListener("wheel", handleBoardWheel);
    };
  }, [handleBoardWheel]);

  /* ── Filtered notes ── */

  const filteredNotes = useMemo(() => {
    // EXCLUIDA é soft-delete: fora do board e fora do contador do topo.
    let result = notes.filter((n) => n.status !== 'EXCLUIDA');

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
    <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 bg-background pb-3">
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
        <div className="flex items-center gap-1.5 overflow-hidden pb-1 sm:flex-wrap sm:gap-2 sm:overflow-visible">
          {/* Compact mobile period toggles */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/60 p-1 sm:hidden">
            {MOBILE_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriodFilter(opt.value)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11px] font-medium leading-none transition-all duration-150",
                  periodFilter === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11px] font-medium leading-none transition-all duration-150",
                    (periodFilter === "60" || periodFilter === "90")
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  Mais
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-40 p-2">
                <button
                  onClick={() => setPeriodFilter("60")}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    periodFilter === "60" && "bg-primary/10 text-primary",
                  )}
                >
                  60 dias
                </button>
                <button
                  onClick={() => setPeriodFilter("90")}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    periodFilter === "90" && "bg-primary/10 text-primary",
                  )}
                >
                  90 dias
                </button>
              </PopoverContent>
            </Popover>
          </div>

          {/* Desktop/tablet period toggles */}
          <div className="hidden shrink-0 items-center gap-1 rounded-lg bg-muted/60 p-1 sm:flex">
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

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-8 w-[78px] shrink-0 rounded-lg border-border/70 px-2 text-[11px] font-medium shadow-none sm:hidden">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all">Todos</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="hidden shrink-0 items-center gap-1 rounded-lg bg-muted/60 p-1 sm:flex">
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
                  "h-8 gap-1.5 px-2 text-[12px] font-medium shadow-none sm:px-3",
                  !allVisible && "border-primary/40 text-primary",
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Colunas</span>
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

          <div className="ml-auto hidden shrink-0 items-center gap-1 sm:flex">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg shadow-none"
              aria-label="Rolar Kanban para a esquerda"
              onClick={() => scrollBoardBy(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg shadow-none"
              aria-label="Rolar Kanban para a direita"
              onClick={() => scrollBoardBy(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <ErrorBoundary>
      <DragDropContext onDragEnd={onDragEnd}>
        <div
          ref={boardScrollerRef}
          data-testid="kanban-board-scroller"
          className="-mx-3 min-h-0 flex-1 touch-pan-y overflow-x-auto overscroll-x-contain px-3 pb-3 scrollbar-thin sm:-mx-1 sm:px-1"
          style={{ WebkitOverflowScrolling: "touch" }}
          onTouchStart={handleBoardTouchStart}
          onTouchMove={handleBoardTouchMove}
          onTouchEnd={handleBoardTouchEnd}
          onTouchCancel={handleBoardTouchEnd}
        >
        <div className="flex h-[calc(100dvh-12.75rem)] min-h-[410px] gap-3 sm:h-[calc(100dvh-12.5rem)] sm:min-h-[420px]">
          {columns.map((col) => (
            <div key={col.status} className="flex h-full w-[min(82vw,280px)] flex-shrink-0 flex-col sm:w-[286px]">
              {/* Column header */}
              <div className="mb-3 flex shrink-0 items-center gap-2.5 px-0.5">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    COLUMN_ACCENT[col.status],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-semibold text-foreground tracking-tight leading-none">
                    {col.label}
                    {FINAL_STATUSES.has(col.status) && (
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        final
                      </span>
                    )}
                  </h2>
                  {STEP_HINT[col.status] && (
                    <p className="mt-1 text-[10px] font-normal leading-none text-muted-foreground/70">
                      {STEP_HINT[col.status]}
                    </p>
                  )}
                </div>
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
                    data-kanban-column-scroll
                    className={cn(
                      "min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto overscroll-y-contain rounded-xl border p-2 transition-colors duration-200 scrollbar-thin",
                      snapshot.isDraggingOver
                        ? "bg-primary/[0.06] border-primary/25 ring-1 ring-primary/15 ring-inset"
                        : "bg-muted/30 border-border/40",
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
                              onClick={(event) => {
                                if (suppressCardClickRef.current) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  return;
                                }
                                setSelectedNote(note.id);
                              }}
                              className={cn(
                                "group bg-card rounded-xl border border-t-2 border-border/50 transition-all duration-150",
                                CARD_ACCENT_BORDER[note.status],
                                "hover:border-border/80 hover:shadow-md hover:-translate-y-0.5",
                                snapshot.isDragging &&
                                  "shadow-xl shadow-black/[0.12] border-border ring-2 ring-primary/20 rotate-[1deg] scale-[1.03]",
                              )}
                            >
                              <div className="p-3">
                                {/* Top row: drag handle + number + type badge + indicators */}
                                <div className="flex items-center gap-1.5">
                                  <div
                                    {...provided.dragHandleProps}
                                    data-kanban-drag-handle
                                    aria-label="Arrastar nota"
                                    onClick={(e) => e.stopPropagation()}
                                    className="opacity-50 transition-opacity -ml-0.5 shrink-0 touch-none cursor-grab active:cursor-grabbing rounded p-0.5 -m-0.5 sm:opacity-0 sm:group-hover:opacity-50 sm:active:opacity-100"
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
