/**
 * NoteDetailModal — modal central da O.S., usado pelo Kanban e pela lista de
 * Notas de Entrada. A regra de negócio espelha `IntakeNoteDetail.tsx`; a
 * apresentação vem do núcleo compartilhado em `notes/os-view`.
 *
 * Contrato de teste (e2e/kanban.spec.ts, e2e/intake-notes.spec.ts):
 * - `note.number` aparece UMA única vez como nó de texto exato (no cabeçalho);
 * - o rótulo do status fica isolado num `<span>`;
 * - o `NoteStatusMoveControl` mantém o combobox "Mover <número> para outro status".
 */

import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotaPDFSignedUrl,
  getNotaServicoDetalhes,
  type NotaServicoDetalhes,
  type NotaServicoDetalhesItem,
} from '@/api/supabase/notas';
import { LazyNotaPDFViewer } from '@/components/notes/LazyNotaPDFViewer';
import NoteStatusMoveControl from '@/components/notes/NoteStatusMoveControl';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { FINAL_STATUSES, NoteStatus, STATUS_LABELS } from '@/types';
import {
  getNextNoteWorkflowStatus,
  getPreviousNoteWorkflowStatus,
} from '@/services/domain/intakeNotes';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Printer,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { generateNotaPdfBlob } from '@/lib/notaPdf';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import { createPdfPreviewWindow, openPdfInBrowser } from '@/lib/printPdf';
import { NoteClosingReference } from '@/components/notes/NoteClosingReference';
import {
  OSAltFinalBanner,
  OSAttachmentsCard,
  OSClientCard,
  OSComplaintCard,
  OSHeaderBar,
  OSItemsTable,
  OSLinkedNotesBanner,
  OSObservationsCard,
  OSPaymentCard,
  OSScheduleCard,
  OSStepper,
  OSTotalCard,
  formatOSRelativeTime,
} from '@/components/notes/os-view';

interface NoteDetailModalProps {
  noteId: string | null;
  onClose: () => void;
  noteOverride?: import('@/types').IntakeNote | null;
  clientOverride?: import('@/types').Client | null;
}

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

/** Botão de fechar sobre o cabeçalho escuro — o padrão herda `foreground` e sumiria. */
const CLOSE_BUTTON_ON_INK = cn(
  'z-20 flex h-9 w-9 items-center justify-center rounded-[10px] border border-os-ink-line bg-os-ink-2 p-0',
  'text-os-cream-2 opacity-100 hover:border-os-ink-line-2 hover:bg-os-ink-3 hover:text-os-cream',
  'right-3 top-3 sm:right-5 sm:top-3.5 [&>svg]:h-[18px] [&>svg]:w-[18px]',
);

const FOOTER_BUTTON = 'h-9 gap-2 rounded-[10px] border-os-line bg-os-surface font-os text-[13px] font-semibold text-os-slate hover:bg-os-muted hover:text-os-ink';

export default function NoteDetailModal({ noteId, onClose, noteOverride, clientOverride }: NoteDetailModalProps) {
  const {
    notes,
    getNote,
    getClient,
    getServicesForNote,
    getProductsForNote,
    getAttachmentsForNote,
    updateNoteStatus,
    getChildNotes,
    registrarRecebimentoNota,
    estornarRecebimentoNota,
  } = useData();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const templateSettingsQuery = useDocumentTemplateSettings();
  const documentSettingsQuery = useDocumentCustomization('entry_note');

  const [realItens, setRealItens] = useState<NotaServicoDetalhesItem[]>([]);
  const [realDetalhes, setRealDetalhes] = useState<NotaServicoDetalhes | null>(null);
  const [realDetalhesLoading, setRealDetalhesLoading] = useState(false);
  const [showPDF, setShowPDF] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const note = noteOverride ?? (noteId ? getNote(noteId) : undefined);
  const client = clientOverride ?? (note ? getClient(note.clientId) : undefined);

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
      contato_nome: note.contatoNome ?? null,
      contato_telefone: null,
      cliente: { id: client.id, nome: client.name, documento: client.docNumber ?? '', endereco: null, cep: null, cidade: null, telefone: null, email: null },
      veiculo: { id: '', modelo: note.vehicleModel, placa: note.plate ?? null, km: note.km ?? 0, motor: note.engineType ?? '' },
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
  const nextMainStatus = getNextNoteWorkflowStatus(note.status);
  const previousMainStatus = getPreviousNoteWorkflowStatus(note.status);
  const canManageWorkflowStatus = user?.role === 'ADMIN'
    || can('notes.status.manage')
    || can('notes.manage')
    || can('kanban.manage');
  const canAdvance = canManageWorkflowStatus && !note.closingId && nextMainStatus !== undefined;
  const canGoBack = canManageWorkflowStatus && !note.closingId && previousMainStatus !== undefined;

  const moveStatus = async (status: NoteStatus) => {
    setIsChangingStatus(true);
    try {
      await updateNoteStatus(note.id, status);
      toast({ title: `${note.number} → ${STATUS_LABELS[status]}` });
    } finally {
      setIsChangingStatus(false);
    }
  };

  const advance = () => {
    if (canAdvance && nextMainStatus) void moveStatus(nextMainStatus).catch(() => undefined);
  };

  const goBack = () => {
    if (canGoBack && previousMainStatus) void moveStatus(previousMainStatus).catch(() => undefined);
  };

  const moveToFinal = async (status: NoteStatus) => {
    try {
      await moveStatus(status);
      onClose();
    } catch {
      // O DataContext já reverte a mudança otimista e informa o erro.
    }
  };

  const openLinkedNote = (linkedNoteId: string) => {
    onClose();
    navigate(`/notas-entrada/${linkedNoteId}`);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      {/*
       * Override DialogContent defaults: largura do design (1120px), sem padding
       * (o layout controla o espaçamento) e sem scroll no container — o corpo
       * interno é que rola.
       */}
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[20px] border-0 bg-os-panel p-0 font-os sm:w-[calc(100vw-2rem)] sm:p-0 sm:max-w-2xl min-[900px]:max-w-[min(1120px,calc(100vw-2rem))]"
        closeButtonClassName={CLOSE_BUTTON_ON_INK}
      >
        <DialogTitle className="sr-only">Detalhes da nota {note.number}</DialogTitle>
        {/*
         * `w-full min-w-0` é obrigatório: o DialogContent é um grid e todo grid
         * item tem `min-width: auto`, então a largura mínima do stepper (que rola
         * na horizontal por conta própria) esticaria o modal além do `max-w`.
         *
         * A altura espelha unidade por unidade o teto do DialogContent (`dvh` na
         * base, `vh` a partir de `sm`). Se as duas divergirem, esta coluna passa
         * do teto do modal e o rodapé é cortado pelo `overflow-hidden`.
         */}
        <div className="flex w-full min-w-0 max-h-[calc(100dvh-1rem)] flex-col overflow-hidden sm:max-h-[calc(100vh-2rem)]">
          <OSHeaderBar note={note} client={client} className="pr-16 sm:pr-20" />

          <OSAltFinalBanner note={note} />

          <OSStepper note={note} />

          {/* ── Corpo (rolável) ── */}
          <div className="flex-1 overflow-y-auto bg-os-panel">
            <div className="flex flex-col gap-5 px-4 py-6 sm:px-8 sm:py-7">
              <OSLinkedNotesBanner
                note={note}
                parentNote={parentNote}
                childNotes={childNotes}
                onOpenNote={openLinkedNote}
              />

              <div className="grid gap-5 min-[820px]:grid-cols-2">
                <OSClientCard note={note} client={client} />
                <OSScheduleCard note={note} />
              </div>

              {note.complaint || note.observations ? (
                <div className="grid gap-5 min-[820px]:grid-cols-2">
                  <OSComplaintCard note={note} />
                  <OSObservationsCard note={note} />
                </div>
              ) : null}

              <OSItemsTable
                note={note}
                services={svcs}
                products={prds}
                loading={IS_REAL_AUTH && realDetalhesLoading}
              />

              <div className="grid items-start gap-5 min-[820px]:grid-cols-2">
                <OSTotalCard note={note} />
                <OSPaymentCard
                  note={note}
                  isAdmin={user?.role === 'ADMIN'}
                  onRegistrar={(input) => registrarRecebimentoNota(note.id, input)}
                  onEstornar={() => estornarRecebimentoNota(note.id)}
                />
              </div>

              <OSAttachmentsCard attachments={atts} />
            </div>
          </div>

          {/* ── Rodapé (ações) ── */}
          <div className="flex-none border-t border-os-line bg-os-surface px-4 py-2 sm:px-8">
            {/* Uma única linha: no desktop tudo cabe; em telas estreitas quebra. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="hidden text-[12px] text-os-stone sm:block">
                Atualizada {formatOSRelativeTime(note.updatedAt)}
              </span>

              {/* Grupo da esquerda: contexto + saídas do fluxo. `mr-auto` empurra
                  as ações de avanço para a direita, longe de Excluir/Recusar. */}
              <div className="mr-auto flex flex-wrap items-center gap-2">
                {/* Ações contextuais de saída do fluxo */}
                {(note.status === 'ORCAMENTO' ||
                  note.status === 'EM_EXECUCAO' ||
                  (!isFinal && !isAguardando)) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {note.status === 'ORCAMENTO' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-8 gap-2 rounded-[9px] border-os-danger-line bg-os-surface font-os text-xs font-semibold text-os-danger hover:bg-os-danger-soft hover:text-os-danger-ink"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Recusar O.S.
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Recusar {note.number}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              O cliente não aprovou o orçamento. A O.S. será movida
                              para "Recusada" (estágio final) e o banho químico será
                              faturado.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => void moveToFinal('RECUSADO')}
                            >
                              Confirmar Recusa
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
                            className="h-8 gap-2 rounded-[9px] border-os-danger-line bg-os-surface font-os text-xs font-semibold text-os-danger hover:bg-os-danger-soft hover:text-os-danger-ink"
                          >
                            <XCircle className="h-3.5 w-3.5" />
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
                              final). Se necessário, ela poderá ser reaberta para Em Execução.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-rose-600 text-white hover:bg-rose-700"
                              onClick={() => void moveToFinal('SEM_CONSERTO')}
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
                            className="h-8 gap-2 rounded-[9px] font-os text-xs font-semibold text-os-stone hover:bg-os-muted hover:text-os-slate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir O.S.
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Excluir {note.number}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              A O.S. será movida para "Excluída" (anulação por
                              engano/duplicata). Se necessário, ela poderá ser restaurada como Aberta.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-zinc-600 text-white hover:bg-zinc-700"
                              onClick={() => void moveToFinal('EXCLUIDA')}
                            >
                              Confirmar Exclusão
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </div>


              {canGoBack && (
                <Button
                  variant="outline"
                  className={cn(FOOTER_BUTTON, 'shrink-0')}
                  onClick={goBack}
                  disabled={isChangingStatus}
                  title="Voltar status"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Voltar status</span>
                  <span className="sm:hidden">Voltar</span>
                </Button>
              )}

              <NoteStatusMoveControl
                note={note}
                canManage={canManageWorkflowStatus}
                onMove={moveStatus}
                compact
                disabled={isChangingStatus}
              />

              <Button
                variant="outline"
                className={FOOTER_BUTTON}
                onClick={() => {
                  onClose();
                  navigate(`/notas-entrada/${note.id}`);
                }}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Ver O.S. completa</span>
                <span className="sm:hidden">Detalhes</span>
              </Button>

              {note.closingId ? (
                <NoteClosingReference
                  noteId={note.id}
                  closingId={note.closingId}
                  clientId={note.clientId}
                  compact
                  onBeforeNavigate={onClose}
                />
              ) : null}

              {(pdfDados || IS_REAL_AUTH) && noteId && (
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(FOOTER_BUTTON, 'w-9 shrink-0')}
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
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    : <Printer className="h-4 w-4" />
                  }
                </Button>
              )}

              {canAdvance && (
                <Button
                  className="h-9 shrink-0 gap-2 rounded-[10px] bg-os-accent px-4 font-os text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(226,96,11,0.8)] hover:bg-os-accent-hover"
                  onClick={advance}
                  disabled={isChangingStatus}
                >
                  Avançar
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                  const previewWindow = createPdfPreviewWindow(`O.S. ${pdfDados.cabecalho.os_numero}`);
                  try {
                    const storedUrl = pdfDados.cabecalho.pdf_url;
                    if (storedUrl) {
                      const resolvedUrl = await getNotaPDFSignedUrl(storedUrl);
                      if (!resolvedUrl) {
                        throw new Error('Não foi possível preparar o link seguro do PDF.');
                      }
                      openPdfInBrowser(resolvedUrl, {
                        title: `O.S. ${pdfDados.cabecalho.os_numero}`,
                        previewWindow,
                      });
                    } else {
                      const [scopedTemplateSettings, scopedDocumentSettings] = await Promise.all([
                        templateSettingsQuery.requireData(),
                        documentSettingsQuery.requireData(),
                      ]);
                      const blob = await generateNotaPdfBlob(pdfDados, {
                        accentColor: scopedTemplateSettings.corDocumento,
                        templateMode: scopedTemplateSettings.osModelo,
                        documentSettings: scopedDocumentSettings,
                        expectedUserId: scopedDocumentSettings.fkUsuarios,
                      });
                      const url = URL.createObjectURL(blob);
                      openPdfInBrowser(url, {
                        title: `O.S. ${pdfDados.cabecalho.os_numero}`,
                        previewWindow,
                        revokeObjectUrlAfterMs: 30_000,
                      });
                    }
                  } catch (error) {
                    previewWindow?.close();
                    toast({
                      title: 'Não foi possível abrir o PDF',
                      description: error instanceof Error ? error.message : 'Tente novamente.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                Abrir PDF
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPDF(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <LazyNotaPDFViewer dados={pdfDados} />
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
