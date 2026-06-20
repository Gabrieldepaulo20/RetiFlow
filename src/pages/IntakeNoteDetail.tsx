import { lazy, Suspense, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getNotaPDFSignedUrl, getNotaServicoDetalhes, type NotaServicoDetalhes } from '@/api/supabase/notas';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
import { useOperationalData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATUS_LABELS, STATUS_COLORS, NOTE_STATUS_ORDER, FINAL_STATUSES, ALLOWED_TRANSITIONS, NoteStatus, PaymentMethod, PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { isBillableNoteStatus } from '@/services/domain/intakeNotes';
import { ArrowLeft, Eye, Printer, Share2, ChevronRight, ChevronLeft, Paperclip, Ban, Trash2, XCircle, Link2, Wallet, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl, openExternalUrl } from '@/lib/browserShare';
import { generateNotaPdfBlob } from '@/lib/notaPdf';
import { useDocumentCustomization, useDocumentTemplateSettings } from '@/hooks/useDocumentTemplateSettings';
import { createPdfPreviewWindow, openPdfInBrowser } from '@/lib/printPdf';

const OSPreviewModal = lazy(() => import('@/components/OSPreviewModal'));

/** Estágios do fluxo principal (sem os finais alternativos) para a timeline */
const MAIN_FLOW: NoteStatus[] = ['ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'AGUARDANDO_COMPRA', 'PRONTA', 'ENTREGUE'];

export default function IntakeNoteDetail() {
  const { id } = useParams();
  const { getNote, getClient, getServicesForNote, getProductsForNote, getAttachmentsForNote, updateNoteStatus, updateNote, registrarRecebimentoNota, estornarRecebimentoNota, getChildNotes, notes } = useOperationalData();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: templateSettings } = useDocumentTemplateSettings();
  const { data: documentSettings } = useDocumentCustomization('entry_note');
  const [showPreview, setShowPreview] = useState(false);
  const [realDetalhes, setRealDetalhes] = useState<NotaServicoDetalhes | null>(null);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [recebForma, setRecebForma] = useState<PaymentMethod>('PIX');
  const [recebData, setRecebData] = useState(() => new Date().toISOString().slice(0, 10));

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
  const allowed = ALLOWED_TRANSITIONS[note.status];
  // Próximo estágio no fluxo principal (exclui finais alternativos e AGUARDANDO)
  const nextMainStatus = allowed.find(s => !FINAL_STATUSES.has(s) || s === 'ENTREGUE');
  const canManageWorkflowStatus = user?.role === 'ADMIN'
    || can('notes.status.manage')
    || can('notes.manage')
    || can('kanban.manage');
  const canAdvance = canManageWorkflowStatus && !isFinal && !isAguardando && nextMainStatus !== undefined;

  const mainFlowIdx = MAIN_FLOW.indexOf(note.status);
  const canGoBack = canManageWorkflowStatus && mainFlowIdx > 0 && !isFinal && !isAguardando;

  const advance = () => {
    if (canAdvance && nextMainStatus) {
      updateNoteStatus(note.id, nextMainStatus);
      toast({ title: `Movido para ${STATUS_LABELS[nextMainStatus]}` });
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
    toast({ title: `${note.number} → ${label}`, description: `A O.S. foi movida para "${label}".` });
    navigate(-1);
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

  // Timeline: mostra o fluxo principal + estágio final alternativo se aplicável
  const timelineStatuses = MAIN_FLOW.slice();
  const isAltFinal = isFinal && !MAIN_FLOW.includes(note.status);
  const statusIdxForTimeline = isAltFinal ? -1 : MAIN_FLOW.indexOf(note.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-xl font-display font-bold text-primary sm:text-2xl">{note.number}</h1>
            <Badge className={STATUS_COLORS[note.status]}>{STATUS_LABELS[note.status]}</Badge>
            {isBillableNoteStatus(note.status) && (
              <Badge className={PAYMENT_STATUS_COLORS[note.paymentStatus]}>{PAYMENT_STATUS_LABELS[note.paymentStatus]}</Badge>
            )}
            <Badge className={cn(
              note.type === 'COMPRA' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
            )}>
              {note.type === 'COMPRA' ? 'Compra' : 'Serviço'}
            </Badge>
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">{client?.name} · {note.vehicleModel} · R$ {note.totalAmount.toLocaleString('pt-BR')}</p>
        </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:ml-auto lg:justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} className="gap-1.5">
            <Eye className="w-4 h-4" /> Visualizar O.S.
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDownloadingPDF || (IS_REAL_AUTH && !realDetalhes)}
            className="gap-1.5"
            onClick={async () => {
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
                  const blob = await generateNotaPdfBlob(source, templateSettings ? {
                    accentColor: templateSettings.corDocumento,
                    templateMode: templateSettings.osModelo,
                    documentSettings,
                  } : undefined);
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
            }}
          >
            {isDownloadingPDF
              ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Printer className="w-4 h-4" />}
            Imprimir
          </Button>
          <Button variant="outline" size="sm" onClick={handleWhatsAppShare} className="gap-1.5">
            <Share2 className="w-4 h-4" /> WhatsApp
          </Button>
          {canGoBack && (
            <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
              <ChevronLeft className="w-4 h-4" /> Voltar status
            </Button>
          )}
          {canAdvance && <Button size="sm" onClick={advance}>Avançar <ChevronRight className="w-4 h-4 ml-1" /></Button>}

          {/* Registrar recebimento - somente em nota faturável e pendente */}
          {isBillableNoteStatus(note.status) && note.paymentStatus === 'PENDENTE' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                  <Wallet className="w-4 h-4" /> Registrar recebimento
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Registrar recebimento de {note.number}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Confirme a forma e a data do recebimento de R$ {note.totalAmount.toLocaleString('pt-BR')}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Forma de pagamento</label>
                    <Select value={recebForma} onValueChange={(v) => setRecebForma(v as PaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                          <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Data do recebimento</label>
                    <Input type="date" value={recebData} onChange={(e) => setRecebData(e.target.value)} />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => {
                      registrarRecebimentoNota(note.id, { paidWith: recebForma, paidAt: new Date(`${recebData}T12:00:00`).toISOString() });
                      toast({ title: `${note.number} recebida`, description: `Pagamento via ${PAYMENT_METHOD_LABELS[recebForma]} registrado.` });
                    }}
                  >
                    Confirmar recebimento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Estornar recebimento - admin, nota paga */}
          {isBillableNoteStatus(note.status) && note.paymentStatus === 'PAGO' && user?.role === 'ADMIN' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RotateCcw className="w-4 h-4" /> Estornar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Estornar recebimento de {note.number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A nota volta para "A receber". Use apenas para corrigir um lançamento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      estornarRecebimentoNota(note.id);
                      toast({ title: `${note.number} estornada`, description: 'Recebimento revertido para pendente.' });
                    }}
                  >
                    Confirmar estorno
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Cancelar - somente a partir de Orçamento */}
          {note.status === 'ORCAMENTO' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Ban className="w-4 h-4" /> Recusar O.S.
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
                    onClick={() => moveToFinal('RECUSADO', 'Recusada')}
                  >
                    Confirmar Recusa
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Sem Conserto - somente a partir de Em Execução */}
          {note.status === 'EM_EXECUCAO' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50">
                  <XCircle className="w-4 h-4" /> Sem Conserto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Marcar {note.number} como Sem Conserto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A O.S. será movida para "Sem Conserto" (estágio final). Essa ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => moveToFinal('SEM_CONSERTO', 'Sem Conserto')}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Descartar - a partir de qualquer estágio não-final e não-aguardando */}
          {!isFinal && !isAguardando && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-zinc-300 text-zinc-600 hover:bg-zinc-50">
                  <Trash2 className="w-4 h-4" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {note.number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A O.S. será movida para "Excluída" (anulação por engano/duplicata). Essa ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction className="bg-zinc-600 text-white hover:bg-zinc-700" onClick={() => moveToFinal('EXCLUIDA', 'Excluída')}>
                    Confirmar Exclusão
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Banner AGUARDANDO_COMPRA */}
      {isAguardando && (
        <Card className="border-yellow-200 bg-yellow-50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-yellow-800">Nota pausada — aguardando compra vinculada ser finalizada.</p>
            {childNotes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {childNotes.map(child => (
                  <Link key={child.id} to={`/notas-entrada/${child.id}`} className="text-xs font-semibold text-yellow-700 underline hover:text-yellow-900">
                    {child.number} — {STATUS_LABELS[child.status]}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notas Vinculadas */}
      {(parentNote || childNotes.length > 0) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Link2 className="w-4 h-4" /> Notas Vinculadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {parentNote && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <span className="text-[10px] text-blue-600 font-semibold uppercase">Nota pai</span>
                <Link to={`/notas-entrada/${parentNote.id}`} className="text-xs font-mono font-bold text-blue-700 hover:underline">
                  {parentNote.number}
                </Link>
                <Badge className={cn("text-[10px]", STATUS_COLORS[parentNote.status])}>{STATUS_LABELS[parentNote.status]}</Badge>
              </div>
            )}
            {childNotes.map(child => (
              <div key={child.id} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
                <span className="text-[10px] text-amber-600 font-semibold uppercase">Compra</span>
                <Link to={`/notas-entrada/${child.id}`} className="text-xs font-mono font-bold text-amber-700 hover:underline">
                  {child.number}
                </Link>
                <Badge className={cn("text-[10px]", STATUS_COLORS[child.status])}>{STATUS_LABELS[child.status]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {timelineStatuses.map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${i <= statusIdxForTimeline ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {STATUS_LABELS[s]}
                </div>
                {i < timelineStatuses.length - 1 && <div className={`w-6 h-0.5 mx-1 ${i < statusIdxForTimeline ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
            {/* Mostra estágio final alternativo na timeline */}
            {isAltFinal && (
              <>
                <div className="w-6 h-0.5 mx-1 bg-destructive" />
                <div className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-destructive text-destructive-foreground">
                  {STATUS_LABELS[note.status]}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="itens">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="anexos">Anexos ({atts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="itens">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Serviços</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3 md:hidden">
                  {svcs.map((s) => (
                    <div key={s.id} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                      <p className="font-semibold leading-tight">{s.name}</p>
                      {s.description && s.description !== s.name ? (
                        <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                      ) : null}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div><p className="text-xs text-muted-foreground">Qtd</p><p className="font-medium">{s.quantity}</p></div>
                        <div><p className="text-xs text-muted-foreground">Preço</p><p className="font-medium">R$ {s.price.toFixed(2)}</p></div>
                        <div className="text-right"><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-semibold">R$ {s.subtotal.toFixed(2)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead className="w-[80px]">Qtd</TableHead><TableHead className="w-[100px] text-right">Preço</TableHead><TableHead className="w-[100px] text-right">Subtotal</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {svcs.map(s => (
                      <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.quantity}</TableCell><TableCell className="text-right">R$ {s.price.toFixed(2)}</TableCell><TableCell className="text-right font-medium">R$ {s.subtotal.toFixed(2)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Produtos / Peças</CardTitle></CardHeader>
              <CardContent>
                {prds.length > 0 ? (
                  <>
                  <div className="grid gap-3 md:hidden">
                    {prds.map((p) => (
                      <div key={p.id} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                        <p className="font-semibold leading-tight">{p.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">SKU: {p.sku || '—'}</p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-xs text-muted-foreground">Qtd</p><p className="font-medium">{p.quantity}</p></div>
                          <div><p className="text-xs text-muted-foreground">Preço</p><p className="font-medium">R$ {p.unitPrice.toFixed(2)}</p></div>
                          <div className="text-right"><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-semibold">R$ {p.subtotal.toFixed(2)}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead className="w-[80px]">Qtd</TableHead><TableHead className="w-[100px] text-right">Preço</TableHead><TableHead className="w-[100px] text-right">Subtotal</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {prds.map(p => (
                        <TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell className="text-muted-foreground">{p.sku}</TableCell><TableCell>{p.quantity}</TableCell><TableCell className="text-right">R$ {p.unitPrice.toFixed(2)}</TableCell><TableCell className="text-right font-medium">R$ {p.subtotal.toFixed(2)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  </>
                ) : <p className="text-center py-4 text-muted-foreground text-sm">Nenhum produto.</p>}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Serviços</p><p className="font-bold">R$ {note.totalServices.toLocaleString('pt-BR')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Produtos</p><p className="font-bold">R$ {note.totalProducts.toLocaleString('pt-BR')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="font-bold text-lg text-primary">R$ {note.totalAmount.toLocaleString('pt-BR')}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="anexos">
          <Card className="border-0 shadow-sm"><CardContent className="p-6">
            {atts.length === 0 ? <p className="text-center py-8 text-muted-foreground">Nenhum anexo.</p> : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {atts.map(a => (
                  <div key={a.id} className="border rounded-lg p-3 text-center">
                    <div className="w-10 h-10 bg-muted rounded mx-auto mb-2 flex items-center justify-center text-xs font-bold text-muted-foreground">{a.type}</div>
                    <p className="text-xs truncate">{a.filename}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

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
            documentSettings={documentSettings}
          />
        </Suspense>
      )}
    </div>
  );
}
