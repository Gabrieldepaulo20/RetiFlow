/**
 * NoteDetailModal — Shared premium central modal for viewing OS/note details.
 * Used by both Kanban (replaces Sheet) and IntakeNotes list (replaces page navigation).
 * All business logic mirrors IntakeNoteDetail.tsx.
 */

import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { getNotaServicoDetalhes, type NotaServicoDetalhesItem, type NotaServicoDetalhes } from '@/api/supabase/notas';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import { NotaPDFTemplate } from '@/components/notes/NotaPDFTemplate';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  STATUS_LABELS,
  FINAL_STATUSES,
  ALLOWED_TRANSITIONS,
  NoteStatus,
} from '@/types';
import {
  User,
  Car,
  Clock,
  Link2,
  Ban,
  Trash2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  AlertCircle,
  Paperclip,
  FolderOpen,
  ScanSearch,
  ClipboardList,
  ThumbsUp,
  Wrench,
  ShoppingCart,
  CheckCheck,
  Truck,
  Archive,
  Hammer,
  Printer,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/** Main workflow statuses for timeline display */
const MAIN_FLOW: NoteStatus[] = [
  'ABERTO',
  'EM_ANALISE',
  'ORCAMENTO',
  'APROVADO',
  'EM_EXECUCAO',
  'AGUARDANDO_COMPRA',
  'PRONTO',
  'ENTREGUE',
  'FINALIZADO',
];

const STATUS_ICON: Record<string, LucideIcon> = {
  ABERTO: FolderOpen,
  EM_ANALISE: ScanSearch,
  ORCAMENTO: ClipboardList,
  APROVADO: ThumbsUp,
  EM_EXECUCAO: Wrench,
  AGUARDANDO_COMPRA: ShoppingCart,
  PRONTO: CheckCheck,
  ENTREGUE: Truck,
  FINALIZADO: Archive,
  CANCELADO: Ban,
  DESCARTADO: Trash2,
  SEM_CONSERTO: Hammer,
};

const STATUS_DOT: Record<string, string> = {
  ABERTO: 'bg-blue-500',
  EM_ANALISE: 'bg-amber-500',
  ORCAMENTO: 'bg-orange-500',
  APROVADO: 'bg-emerald-500',
  EM_EXECUCAO: 'bg-violet-500',
  AGUARDANDO_COMPRA: 'bg-yellow-500',
  PRONTO: 'bg-teal-500',
  ENTREGUE: 'bg-sky-500',
  FINALIZADO: 'bg-slate-400',
  CANCELADO: 'bg-red-500',
  DESCARTADO: 'bg-zinc-400',
  SEM_CONSERTO: 'bg-rose-500',
};

/** 3px accent bar color at the very top of the modal */
const STATUS_ACCENT: Record<string, string> = {
  ABERTO: 'bg-blue-500',
  EM_ANALISE: 'bg-amber-500',
  ORCAMENTO: 'bg-orange-500',
  APROVADO: 'bg-emerald-500',
  EM_EXECUCAO: 'bg-violet-500',
  AGUARDANDO_COMPRA: 'bg-yellow-400',
  PRONTO: 'bg-teal-500',
  ENTREGUE: 'bg-sky-500',
  FINALIZADO: 'bg-slate-400',
  CANCELADO: 'bg-red-500',
  DESCARTADO: 'bg-zinc-400',
  SEM_CONSERTO: 'bg-rose-500',
};

const STATUS_TEXT: Record<string, string> = {
  ABERTO: 'text-blue-600',
  EM_ANALISE: 'text-amber-600',
  ORCAMENTO: 'text-orange-600',
  APROVADO: 'text-emerald-600',
  EM_EXECUCAO: 'text-violet-600',
  AGUARDANDO_COMPRA: 'text-yellow-600',
  PRONTO: 'text-teal-600',
  ENTREGUE: 'text-sky-600',
  FINALIZADO: 'text-slate-500',
  CANCELADO: 'text-red-600',
  DESCARTADO: 'text-zinc-500',
  SEM_CONSERTO: 'text-rose-600',
};

interface NoteDetailModalProps {
  noteId: string | null;
  onClose: () => void;
}

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

export default function NoteDetailModal({ noteId, onClose }: NoteDetailModalProps) {
  const {
    notes,
    getNote,
    getClient,
    getServicesForNote,
    getProductsForNote,
    getAttachmentsForNote,
    updateNoteStatus,
    invoices,
    getChildNotes,
  } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [realItens, setRealItens] = useState<NotaServicoDetalhesItem[]>([]);
  const [realDetalhes, setRealDetalhes] = useState<NotaServicoDetalhes | null>(null);
  const [realDetalhesLoading, setRealDetalhesLoading] = useState(false);
  const [showPDF, setShowPDF] = useState(false);

  const note = noteId ? getNote(noteId) : undefined;
  const client = note ? getClient(note.clientId) : undefined;

  useEffect(() => {
    if (!noteId) { setRealItens([]); setRealDetalhes(null); return; }
    if (IS_REAL_AUTH) {
      setRealDetalhesLoading(true);
      getNotaServicoDetalhes(noteId).then((res) => {
        setRealItens(res?.itens_servico ?? []);
        setRealDetalhes(res);
      }).finally(() => setRealDetalhesLoading(false));
    }
  }, [noteId]);

  const localSvcs = note ? getServicesForNote(note.id) : [];

  // Build PDF data from real RPC or fall back to local mock data
  const pdfDados: NotaServicoDetalhes | null = realDetalhes ?? (note && client ? {
    cabecalho: {
      id_nota: note.id,
      os_numero: note.number,
      prazo: note.deadline ?? '',
      defeito: note.complaint,
      observacoes: note.observations ?? null,
      data_criacao: note.createdAt,
      finalizado_em: note.finalizedAt ?? null,
      total: note.totalAmount,
      total_servicos: note.totalServices,
      total_produtos: note.totalProducts,
      criado_por_usuario: null,
      pdf_url: null,
      cliente: { id: client.id, nome: client.name, documento: client.docNumber ?? '', endereco: null, cep: null, cidade: null, telefone: null, email: null },
      veiculo: { id: '', modelo: note.vehicleModel, placa: note.plate ?? '', km: note.km ?? 0, motor: note.engineType ?? '' },
      status: { id: 0, nome: note.status, index: 0, tipo_status: 'ativo' },
    },
    itens_servico: localSvcs.map((s, i) => ({
      id_rel: s.id,
      sku: i,
      descricao: s.name,
      detalhes: s.description !== s.name ? s.description : null,
      quantidade: s.quantity,
      preco_unitario: s.price,
      desconto_porcentagem: 0,
      subtotal_item: s.subtotal,
    })),
    notas_compra_vinculadas: [],
    financeiro_servicos: { total_bruto: note.totalServices, total_liquido: note.totalServices },
  } : null);
  const svcs = IS_REAL_AUTH
    ? realItens.map((i) => ({
        id: i.id_rel,
        noteId: noteId ?? '',
        name: i.descricao,
        description: i.detalhes ?? i.descricao,
        price: i.preco_unitario,
        quantity: i.quantidade,
        subtotal: i.subtotal_item,
      }))
    : localSvcs;
  const prds = note ? getProductsForNote(note.id) : [];
  const atts = note ? getAttachmentsForNote(note.id) : [];
  const noteInvoices = note
    ? invoices.filter((inv) => inv.noteId === note.id)
    : [];
  const childNotes = note ? getChildNotes(note.id) : [];
  const parentNote = note?.parentNoteId
    ? notes.find((n) => n.id === note.parentNoteId)
    : null;

  const isOpen = !!noteId;

  if (!note || !client) {
    return (
      <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Nota não encontrada</DialogTitle>
          <p className="text-center py-8 text-muted-foreground text-sm">
            Nota não encontrada.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const isFinal = FINAL_STATUSES.has(note.status);
  const isAguardando = note.status === 'AGUARDANDO_COMPRA';
  const allowed = ALLOWED_TRANSITIONS[note.status];
  const nextMainStatus = allowed.find(
    (s) => !FINAL_STATUSES.has(s) || s === 'FINALIZADO',
  );
  const canAdvance = !isFinal && !isAguardando && nextMainStatus !== undefined;
  const mainFlowIdx = MAIN_FLOW.indexOf(note.status);
  const canGoBack =
    mainFlowIdx > 0 && user?.role === 'ADMIN' && !isFinal && !isAguardando;
  const daysInStatus = Math.floor(
    (Date.now() - new Date(note.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const isAltFinal = isFinal && !MAIN_FLOW.includes(note.status);
  const statusIdxForTimeline = isAltFinal ? -1 : MAIN_FLOW.indexOf(note.status);

  const advance = () => {
    if (canAdvance && nextMainStatus) {
      updateNoteStatus(note.id, nextMainStatus);
      toast({ title: `${note.number} → ${STATUS_LABELS[nextMainStatus]}` });
    }
  };

  const goBack = () => {
    if (canGoBack) {
      const prevStatus = MAIN_FLOW[mainFlowIdx - 1];
      updateNoteStatus(note.id, prevStatus);
      toast({ title: `Voltou para ${STATUS_LABELS[prevStatus]}` });
    }
  };

  const moveToFinal = (status: NoteStatus, label: string) => {
    updateNoteStatus(note.id, status);
    onClose();
    toast({
      title: `${note.number} → ${label}`,
      description: `A O.S. foi movida para "${label}".`,
    });
  };

  const hasItems = svcs.length > 0 || prds.length > 0 || atts.length > 0;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      {/*
       * Override DialogContent defaults:
       * - max-w-2xl (wider than default max-w-lg)
       * - p-0 gap-0 (we control internal spacing)
       * - overflow-hidden (child div handles scroll)
       */}
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-4xl">
        <DialogTitle className="sr-only">Detalhes da nota {note.number}</DialogTitle>
        <div className="flex max-h-[92vh] flex-col">
          {/* ── Status accent bar ── */}
          <div className={cn('h-0.5 w-full shrink-0', STATUS_ACCENT[note.status] ?? 'bg-primary')} />

          {/* ── Header ── */}
          {/* pr-14 reserves space for the auto-rendered Dialog close button */}
          <div className="shrink-0 px-4 pb-4 pt-4 pr-12 sm:px-6 sm:pr-14">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {/* Number + type + status pill in one row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-base font-bold tracking-tight text-foreground sm:text-lg">
                    {note.number}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest leading-none',
                      note.type === 'COMPRA'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-blue-50 text-blue-600',
                    )}
                  >
                    {note.type === 'COMPRA' ? 'Compra' : 'Serviço'}
                  </span>
                  {/* Status badge */}
                  {(() => {
                    const Icon = STATUS_ICON[note.status] ?? FolderOpen;
                    const bgClass = STATUS_DOT[note.status]
                      .replace('-500', '-100').replace('-400', '-100');
                    return (
                      <span
                        className={cn(
                          'ml-0.5 inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full',
                          bgClass, STATUS_TEXT[note.status],
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {STATUS_LABELS[note.status]}
                        {isFinal && <span className="opacity-50 text-[10px]">· final</span>}
                      </span>
                    );
                  })()}
                </div>
                {/* Client + vehicle subtitle */}
                <p className="mt-1 text-xs text-muted-foreground leading-snug">
                  {client.name}
                  {note.vehicleModel ? <span className="opacity-60"> · {note.vehicleModel}</span> : ''}
                  {note.plate ? <span className="font-mono opacity-50"> · {note.plate}</span> : ''}
                </p>
              </div>
            </div>
          </div>

          {/* ── Timeline band (truly edge-to-edge) ── */}
          <div className="shrink-0 border-t border-b bg-muted/20">
            <div className="px-4 pt-3 pb-0.5 sm:px-6">
              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em]">
                Progresso
              </p>
            </div>
            {/* overflow-x-auto only on mobile; on larger screens fills 100% */}
            <div className="overflow-x-auto pb-3 scrollbar-thin">
              <div className="flex items-end w-full min-w-[540px] px-4 sm:px-6 pt-2">
                {MAIN_FLOW.map((s, i) => {
                  const isPast = i < statusIdxForTimeline;
                  const isCurrent = i === statusIdxForTimeline;
                  const isLast = i === MAIN_FLOW.length - 1 && !isAltFinal;
                  const StepIcon = STATUS_ICON[s] ?? FolderOpen;
                  return (
                    /* Each non-last item = step + flex-1 connector; last item = step only */
                    <div key={s} className={cn('flex items-center', isLast ? 'shrink-0' : 'flex-1 min-w-0')}>
                      {/* Step column */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div
                          className={cn(
                            'flex items-center justify-center rounded-full transition-all',
                            isCurrent
                              ? 'w-11 h-11 bg-primary text-primary-foreground ring-[3px] ring-primary/20 ring-offset-2 shadow-md shadow-primary/20'
                              : isPast
                                ? 'w-9 h-9 bg-primary/15 text-primary'
                                : 'w-7 h-7 bg-border/60 text-muted-foreground/30',
                          )}
                        >
                          <StepIcon
                            className={cn(
                              isCurrent ? 'w-5 h-5' : isPast ? 'w-[18px] h-[18px]' : 'w-3.5 h-3.5',
                            )}
                          />
                        </div>
                        <span
                          className={cn(
                            'text-[8px] whitespace-nowrap leading-none',
                            isPast
                              ? 'text-primary/60 font-medium'
                              : isCurrent
                                ? 'text-primary font-bold'
                                : 'text-muted-foreground/35 font-medium',
                          )}
                        >
                          {STATUS_LABELS[s]}
                        </span>
                      </div>
                      {/* Connector — flex-1 fills remaining space */}
                      {!isLast && (
                        <div
                          className={cn(
                            'flex-1 min-w-[6px] mb-[22px] mx-0.5',
                            isPast ? 'h-0.5 bg-primary/35' : 'h-px bg-border/50',
                          )}
                        />
                      )}
                    </div>
                  );
                })}
                {isAltFinal && (
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="flex-1 min-w-[6px] mb-[22px] mx-0.5 h-px bg-destructive/30" />
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <div className="w-9 h-9 rounded-full bg-destructive/15 flex items-center justify-center ring-2 ring-destructive/25 ring-offset-1">
                        {(() => {
                          const AltIcon = STATUS_ICON[note.status] ?? Ban;
                          return <AltIcon className="w-[18px] h-[18px] text-destructive" />;
                        })()}
                      </div>
                      <span className="text-[8px] font-bold whitespace-nowrap leading-none text-destructive">
                        {STATUS_LABELS[note.status]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Body (scrollable) ── */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
              {/* Banner: AGUARDANDO_COMPRA */}
              {isAguardando && (
                <div className="flex gap-3 p-3.5 bg-yellow-50 border border-yellow-200/80 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Nota pausada — aguardando compra vinculada ser finalizada.
                    </p>
                    {childNotes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {childNotes.map((child) => (
                          <button
                            key={child.id}
                            className="text-xs text-yellow-700 underline underline-offset-2 hover:text-yellow-900"
                            onClick={() => {
                              onClose();
                              navigate(`/notas-entrada/${child.id}`);
                            }}
                          >
                            {child.number} — {STATUS_LABELS[child.status]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Banner: parent note */}
              {parentNote && (
                <div className="flex gap-3 p-3.5 bg-blue-50/70 border border-blue-200/60 rounded-lg">
                  <Link2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wider">
                      Vinculada à nota de serviço
                    </p>
                    <button
                      className="text-xs font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 mt-0.5"
                      onClick={() => {
                        onClose();
                        navigate(`/notas-entrada/${parentNote.id}`);
                      }}
                    >
                      {parentNote.number} — {STATUS_LABELS[parentNote.status]}
                    </button>
                  </div>
                </div>
              )}

              {/* Client + Vehicle grid */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {/* Client */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-foreground/30" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cliente</p>
                    <p className="text-sm font-semibold leading-tight mt-0.5 break-words">
                      {client.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70 truncate">
                      {client.phone}
                    </p>
                    {client.docNumber && (
                      <p className="text-[10px] text-muted-foreground/40 font-mono truncate">
                        {client.docNumber}
                      </p>
                    )}
                  </div>
                </div>

                {/* Vehicle info */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <Car className="w-3.5 h-3.5 text-foreground/30" />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Veículo</p>
                    <p className="text-sm font-semibold leading-tight">{note.vehicleModel || '—'}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div>
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Motor</p>
                        <p className="text-xs font-medium text-foreground/80">{note.engineType || '—'}</p>
                      </div>
                      {note.plate && (
                        <div>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Placa</p>
                          <p className="font-mono text-xs font-bold text-foreground/80 tracking-widest">{note.plate}</p>
                        </div>
                      )}
                      {note.km && (
                        <div>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">KM</p>
                          <p className="text-xs font-medium text-foreground/80">{note.km.toLocaleString('pt-BR')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Complaint */}
              {note.complaint && (
                <div className="p-3 rounded-xl bg-muted/30">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Reclamação / Defeito relatado
                  </p>
                  <p className="text-sm leading-relaxed text-foreground/75">
                    {note.complaint}
                  </p>
                </div>
              )}

              {/* Days in status */}
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg',
                  daysInStatus >= 7
                    ? 'bg-red-50/70 text-red-700'
                    : daysInStatus >= 4
                      ? 'bg-amber-50/70 text-amber-700'
                      : 'bg-muted/20 text-muted-foreground',
                )}
              >
                <Clock className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="text-xs font-medium">
                  {daysInStatus === 0
                    ? 'Atualizado hoje'
                    : `${daysInStatus} dia${daysInStatus !== 1 ? 's' : ''} nesta etapa`}
                </span>
                {daysInStatus >= 7 && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wide opacity-80">Atenção</span>
                )}
              </div>

              {/* Financial summary */}
              <div className="rounded-xl bg-muted/30 overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-border/40">
                  <div className="p-3">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Serviços</p>
                    <p className="font-semibold text-sm mt-1 tabular-nums text-foreground/80">
                      R${' '}{note.totalServices.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Peças</p>
                    <p className="font-semibold text-sm mt-1 tabular-nums text-foreground/80">
                      R${' '}{note.totalProducts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="border-t border-border/40 px-3 py-2.5 bg-primary/[0.05] flex items-center justify-between">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Total</p>
                  <p className="font-bold text-base text-primary tabular-nums">
                    R${' '}{note.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Items tabs */}
              {hasItems && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Itens
                  </p>
                  <Tabs
                    defaultValue={
                      svcs.length > 0
                        ? 'svcs'
                        : prds.length > 0
                          ? 'prds'
                          : 'atts'
                    }
                  >
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/40 p-1">
                      {svcs.length > 0 && (
                        <TabsTrigger value="svcs" className="h-8 min-w-[110px] flex-1 text-xs sm:flex-none">
                          Serviços ({svcs.length})
                        </TabsTrigger>
                      )}
                      {prds.length > 0 && (
                        <TabsTrigger value="prds" className="h-8 min-w-[110px] flex-1 text-xs sm:flex-none">
                          Peças ({prds.length})
                        </TabsTrigger>
                      )}
                      {atts.length > 0 && (
                        <TabsTrigger value="atts" className="h-8 min-w-[110px] flex-1 text-xs sm:flex-none">
                          <Paperclip className="w-3 h-3 mr-1" />
                          Anexos ({atts.length})
                        </TabsTrigger>
                      )}
                    </TabsList>

                    {svcs.length > 0 && (
                      <TabsContent value="svcs" className="mt-2">
                        <div className="space-y-1">
                          {svcs.map((s) => (
                            <div
                              key={s.id}
                              className="rounded-lg bg-muted/25 px-3 py-3 transition-colors hover:bg-muted/40"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="break-words text-sm leading-relaxed text-foreground">
                                    <span className="mr-2 text-xs tabular-nums text-muted-foreground/50">
                                      {s.quantity}×
                                    </span>
                                    {s.name}
                                  </p>
                                </div>
                                <span className="text-sm font-semibold tabular-nums sm:ml-4 sm:shrink-0">
                                  R${' '}
                                  {s.subtotal.toLocaleString('pt-BR', {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    )}

                    {prds.length > 0 && (
                      <TabsContent value="prds" className="mt-2">
                        <div className="space-y-1">
                          {prds.map((p) => (
                            <div
                              key={p.id}
                              className="rounded-lg bg-muted/25 px-3 py-3 transition-colors hover:bg-muted/40"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="break-words text-sm leading-relaxed text-foreground">
                                    <span className="mr-2 text-xs tabular-nums text-muted-foreground/50">
                                      {p.quantity}×
                                    </span>
                                    {p.name}
                                  </p>
                                  {p.sku && (
                                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                                      SKU: {p.sku}
                                    </p>
                                  )}
                                </div>
                                <span className="text-sm font-semibold tabular-nums sm:ml-4 sm:shrink-0">
                                  R${' '}
                                  {p.subtotal.toLocaleString('pt-BR', {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    )}

                    {atts.length > 0 && (
                      <TabsContent value="atts" className="mt-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {atts.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center gap-2 rounded-md bg-muted/25 p-2.5 text-xs"
                            >
                              <span className="font-bold text-muted-foreground/50 text-[10px] w-8 shrink-0 uppercase text-center">
                                {a.type}
                              </span>
                              <span className="truncate text-foreground/70">
                                {a.filename}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    )}
                  </Tabs>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer (actions) ── */}
          <div className="shrink-0 space-y-2 border-t bg-background/95 backdrop-blur-sm px-4 py-3.5 sm:px-6">
            {/* Primary row */}
            <div className="flex items-center gap-2">
              {canGoBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={goBack}
                  title="Voltar etapa"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 flex-1 justify-start text-xs gap-1.5 text-muted-foreground"
                onClick={() => {
                  onClose();
                  navigate(`/notas-entrada/${note.id}`);
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver O.S. completa
              </Button>
              {(pdfDados || IS_REAL_AUTH) && noteId && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={IS_REAL_AUTH && realDetalhesLoading}
                  onClick={async () => {
                    if (IS_REAL_AUTH && !realDetalhes && noteId) {
                      setRealDetalhesLoading(true);
                      const res = await getNotaServicoDetalhes(noteId);
                      setRealItens(res?.itens_servico ?? []);
                      setRealDetalhes(res);
                      setRealDetalhesLoading(false);
                    }
                    setShowPDF(true);
                  }}
                  title="Imprimir / PDF"
                >
                  {IS_REAL_AUTH && realDetalhesLoading
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <Printer className="w-4 h-4" />
                  }
                </Button>
              )}
              {canAdvance && (
                <Button className="h-9 shrink-0 gap-1.5 px-4 text-sm font-semibold" onClick={advance}>
                  Avançar
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Secondary row (contextual actions) */}
            {(note.status === 'ORCAMENTO' ||
              note.status === 'EM_EXECUCAO' ||
              (!isFinal && !isAguardando)) && (
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                {note.status === 'ORCAMENTO' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 border-red-200 text-xs text-red-600 hover:border-red-300 hover:bg-red-50/50 sm:h-8"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancelar O.S.
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Cancelar {note.number}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          O cliente não aprovou o orçamento. A O.S. será movida
                          para "Cancelado" (estágio final).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() =>
                            moveToFinal('CANCELADO', 'Cancelado')
                          }
                        >
                          Confirmar Cancelamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {note.status === 'EM_EXECUCAO' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 border-rose-200 text-xs text-rose-600 hover:border-rose-300 hover:bg-rose-50/50 sm:h-8"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Sem Conserto
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Marcar {note.number} como Sem Conserto?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          A O.S. será movida para "Sem Conserto" (estágio
                          final). Essa ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-rose-600 text-white hover:bg-rose-700"
                          onClick={() =>
                            moveToFinal('SEM_CONSERTO', 'Sem Conserto')
                          }
                        >
                          Confirmar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {!isFinal && !isAguardando && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-zinc-600 sm:h-8"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Descartar O.S.
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Descartar {note.number}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          A O.S. será movida para "Descartado" por erro. Essa
                          ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-zinc-600 text-white hover:bg-zinc-700"
                          onClick={() =>
                            moveToFinal('DESCARTADO', 'Descartado')
                          }
                        >
                          Confirmar Descarte
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* PDF Preview overlay */}
    {showPDF && pdfDados && (
      <Dialog open={showPDF} onOpenChange={setShowPDF}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col gap-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
            <DialogTitle className="text-sm font-semibold">
              Notinha — O.S. {pdfDados.cabecalho.os_numero}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={async () => {
                  const storedUrl = pdfDados.cabecalho.pdf_url;
                  if (storedUrl) {
                    const a = document.createElement('a');
                    a.href = storedUrl;
                    a.download = `OS-${pdfDados.cabecalho.os_numero}.pdf`;
                    a.target = '_blank';
                    a.click();
                  } else {
                    const blob = await pdf(<NotaPDFTemplate dados={pdfDados} />).toBlob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `OS-${pdfDados.cabecalho.os_numero}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                Baixar PDF
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPDF(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <PDFViewer width="100%" height="100%" style={{ border: 'none', flex: 1 }}>
            <NotaPDFTemplate dados={pdfDados} />
          </PDFViewer>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
