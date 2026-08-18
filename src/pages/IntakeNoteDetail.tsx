/**
 * IntakeNoteDetail — página completa da O.S. (`/notas-entrada/:id`).
 *
 * Compartilha o núcleo visual com `NoteDetailModal` via `notes/os-view`, para que
 * "Ver O.S. completa" leve a mesma leitura do modal. As ações de documento
 * (visualizar, imprimir, WhatsApp) são exclusivas desta tela.
 *
 * Contrato de teste (src/test/app-routes.test.tsx): o número da nota é o `h1` da
 * página — daí o `numberAs="h1"` no cabeçalho.
 */

import { lazy, Suspense, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNotaPDFSignedUrl, getNotaServicoDetalhes, type NotaServicoDetalhes } from '@/api/supabase/notas';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
import { useOperationalData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import NoteStatusMoveControl from '@/components/notes/NoteStatusMoveControl';
import { STATUS_LABELS, FINAL_STATUSES, NoteStatus } from '@/types';
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
import { getNextNoteWorkflowStatus, getPreviousNoteWorkflowStatus } from '@/services/domain/intakeNotes';
import { ArrowLeft, Eye, Printer, Share2, ChevronRight, ChevronLeft, Ban, Trash2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl, openExternalUrl } from '@/lib/browserShare';
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

const OSPreviewModal = lazy(() => import('@/components/OSPreviewModal'));

/** Botão de ação sobre o cabeçalho escuro. */
const HEADER_BUTTON = cn(
  'h-11 gap-2 rounded-xl border border-os-ink-line bg-os-ink-2 px-3.5 font-os text-[13px] font-semibold text-os-cream-2',
  'hover:border-os-ink-line-2 hover:bg-os-ink-3 hover:text-os-cream',
);

const FOOTER_BUTTON = 'h-10 gap-2 rounded-[11px] border-os-line bg-os-surface font-os text-[13px] font-semibold text-os-slate hover:bg-os-muted hover:text-os-ink';

export default function IntakeNoteDetail() {
  const { id } = useParams();
  const {
    getNote,
    getClient,
    getServicesForNote,
    getProductsForNote,
    getAttachmentsForNote,
    updateNoteStatus,
    registrarRecebimentoNota,
    estornarRecebimentoNota,
    getChildNotes,
    notes,
  } = useOperationalData();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const templateSettingsQuery = useDocumentTemplateSettings();
  const documentSettingsQuery = useDocumentCustomization('entry_note');
  const [showPreview, setShowPreview] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [realDetalhes, setRealDetalhes] = useState<NotaServicoDetalhes | null>(null);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  useEffect(() => {
    if (!IS_REAL_AUTH || !id) return;
    getNotaServicoDetalhes(id).then(setRealDetalhes).catch(() => {});
  }, [id]);

  const note = getNote(id!);
  if (!note) return <div className="text-center py-20 text-muted-foreground">Nota não encontrada.</div>;

  const client = getClient(note.clientId);
  const localSvcs = getServicesForNote(note.id);
  const prds = getProductsForNote(note.id);
  const svcs = IS_REAL_AUTH && realDetalhes
    ? realDetalhes.itens_servico.map((i) => ({
        id: i.id_rel,
        noteId: note.id,
        name: i.descricao,
        description: i.detalhes ?? i.descricao,
        price: i.preco_unitario,
        quantity: i.quantidade,
        subtotal: i.subtotal_item,
      }))
    : localSvcs;
  const atts = getAttachmentsForNote(note.id);
  const childNotes = getChildNotes(note.id);
  const parentNote = note.parentNoteId ? notes.find(n => n.id === note.parentNoteId) : null;

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
      navigate(-1);
    } catch {
      // O DataContext já reverte a mudança otimista e informa o erro.
    }
  };

  const handleWhatsAppShare = () => {
    const saudacao = note.contatoNome || client?.name || 'cliente';
    const message = [
      `Olá, ${saudacao}!`,
      `Segue atualização da O.S. ${note.number}.`,
      note.pdfUrl ? 'O PDF da O.S. está disponível no sistema.' : null,
    ].filter(Boolean).join('\n');
    const url = buildWhatsAppUrl(client?.phone, message);

    if (!url) {
      toast({
        title: 'Telefone não informado',
        description: 'Cadastre um telefone/WhatsApp no cliente antes de compartilhar.',
        variant: 'destructive',
      });
      return;
    }

    openExternalUrl(url);
  };

  const handlePrint = async () => {
    const source = IS_REAL_AUTH ? realDetalhes : null;
    if (IS_REAL_AUTH && !source) { toast({ title: 'Dados ainda carregando' }); return; }
    const previewWindow = createPdfPreviewWindow(`O.S. ${source?.cabecalho.os_numero ?? note.number}`);
    setIsDownloadingPDF(true);
    try {
      if (source?.cabecalho.pdf_url) {
        const resolvedUrl = await getNotaPDFSignedUrl(source.cabecalho.pdf_url);
        if (!resolvedUrl) {
          throw new Error('Não foi possível preparar o link seguro do PDF.');
        }
        openPdfInBrowser(resolvedUrl, {
          title: `O.S. ${source.cabecalho.os_numero}`,
          previewWindow,
        });
      } else if (source) {
        const [scopedTemplateSettings, scopedDocumentSettings] = await Promise.all([
          templateSettingsQuery.requireData(),
          documentSettingsQuery.requireData(),
        ]);
        const blob = await generateNotaPdfBlob(source, {
          accentColor: scopedTemplateSettings.corDocumento,
          templateMode: scopedTemplateSettings.osModelo,
          documentSettings: scopedDocumentSettings,
          expectedUserId: scopedDocumentSettings.fkUsuarios,
        });
        const url = URL.createObjectURL(blob);
        openPdfInBrowser(url, {
          title: `O.S. ${note.number}`,
          previewWindow,
          revokeObjectUrlAfterMs: 30_000,
        });
      } else {
        previewWindow?.close();
        toast({
          title: 'PDF ainda não disponível',
          description: 'Atualize ou gere novamente a O.S. para preparar o documento de impressão.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      previewWindow?.close();
      toast({
        title: 'Não foi possível abrir o PDF',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  return (
    <div className="font-os">
      <div className="overflow-hidden rounded-[20px] border border-os-line bg-os-panel shadow-[0_24px_48px_-28px_rgba(28,26,23,0.35)]">
        <OSHeaderBar
          note={note}
          client={client}
          numberAs="h1"
          leading={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="h-10 w-10 shrink-0 rounded-xl text-os-cream-2 hover:bg-os-ink-2 hover:text-os-cream"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          }
          trailing={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" className={HEADER_BUTTON} onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Visualizar</span>
              </Button>
              <Button
                variant="ghost"
                className={HEADER_BUTTON}
                disabled={isDownloadingPDF || (IS_REAL_AUTH && !realDetalhes)}
                onClick={() => void handlePrint()}
              >
                {isDownloadingPDF
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <Printer className="h-4 w-4" />}
                <span className="hidden sm:inline">Imprimir</span>
              </Button>
              <Button variant="ghost" className={HEADER_BUTTON} onClick={handleWhatsAppShare}>
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>
            </div>
          }
        />

        <OSAltFinalBanner note={note} />

        <OSStepper note={note} />

        <div className="flex flex-col gap-5 bg-os-panel px-4 py-6 sm:px-8 sm:py-7">
          <OSLinkedNotesBanner
            note={note}
            parentNote={parentNote}
            childNotes={childNotes}
            onOpenNote={(linkedNoteId) => navigate(`/notas-entrada/${linkedNoteId}`)}
          />

          <div className="grid gap-5 min-[900px]:grid-cols-2">
            <OSClientCard note={note} client={client} />
            <OSScheduleCard note={note} />
          </div>

          {note.complaint || note.observations ? (
            <div className="grid gap-5 min-[900px]:grid-cols-2">
              <OSComplaintCard note={note} />
              <OSObservationsCard note={note} />
            </div>
          ) : null}

          <OSItemsTable
            note={note}
            services={svcs}
            products={prds}
            loading={IS_REAL_AUTH && !realDetalhes}
          />

          <div className="grid items-start gap-5 min-[900px]:grid-cols-2">
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

        {/* ── Rodapé (fluxo) ── */}
        <div className="flex flex-col gap-2.5 border-t border-os-line bg-os-surface px-4 py-3.5 sm:px-8">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-auto hidden text-[12.5px] text-os-stone sm:block">
              Atualizada {formatOSRelativeTime(note.updatedAt)}
            </span>

            {note.closingId ? (
              <NoteClosingReference
                noteId={note.id}
                closingId={note.closingId}
                clientId={note.clientId}
              />
            ) : null}

            {canGoBack && (
              <Button
                variant="outline"
                className={cn(FOOTER_BUTTON, 'shrink-0')}
                onClick={goBack}
                disabled={isChangingStatus}
              >
                <ChevronLeft className="h-4 w-4" /> Voltar status
              </Button>
            )}

            <NoteStatusMoveControl
              note={note}
              canManage={canManageWorkflowStatus}
              onMove={moveStatus}
              disabled={isChangingStatus}
            />

            {canAdvance && (
              <Button
                className="h-10 shrink-0 gap-2 rounded-[11px] bg-os-accent px-5 font-os text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(226,96,11,0.8)] hover:bg-os-accent-hover"
                onClick={advance}
                disabled={isChangingStatus}
              >
                Avançar <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {(note.status === 'ORCAMENTO' ||
            note.status === 'EM_EXECUCAO' ||
            (!isFinal && !isAguardando)) && (
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {note.status === 'ORCAMENTO' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 gap-2 rounded-[10px] border-os-danger-line bg-os-surface font-os text-xs font-semibold text-os-danger hover:bg-os-danger-soft hover:text-os-danger-ink"
                    >
                      <Ban className="h-3.5 w-3.5" /> Recusar O.S.
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Recusar {note.number}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O cliente não aprovou o orçamento. A O.S. será movida para "Recusada" (estágio final) e o banho químico será faturado.
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
                      className="h-9 gap-2 rounded-[10px] border-os-danger-line bg-os-surface font-os text-xs font-semibold text-os-danger hover:bg-os-danger-soft hover:text-os-danger-ink"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Sem Conserto
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Marcar {note.number} como Sem Conserto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A O.S. será movida para "Sem Conserto" (estágio final). Se necessário, ela poderá ser reaberta para Em Execução.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => void moveToFinal('SEM_CONSERTO')}>
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
                      className="h-9 gap-2 rounded-[10px] font-os text-xs font-semibold text-os-stone hover:bg-os-muted hover:text-os-slate"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir {note.number}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A O.S. será movida para "Excluída" (anulação por engano/duplicata). Se necessário, ela poderá ser restaurada como Aberta.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction className="bg-zinc-600 text-white hover:bg-zinc-700" onClick={() => void moveToFinal('EXCLUIDA')}>
                        Confirmar Exclusão
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <Suspense fallback={null}>
          <OSPreviewModal
            open={showPreview}
            onClose={() => setShowPreview(false)}
            note={note}
            client={client}
            services={svcs}
            products={prds}
            dados={realDetalhes}
          />
        </Suspense>
      )}
    </div>
  );
}
