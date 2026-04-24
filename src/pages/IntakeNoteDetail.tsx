import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getNotaServicoDetalhes, type NotaServicoDetalhes } from '@/api/supabase/notas';
import { pdf } from '@react-pdf/renderer';
import { NotaPDFTemplate } from '@/components/notes/NotaPDFTemplate';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATUS_LABELS, STATUS_COLORS, NOTE_STATUS_ORDER, FINAL_STATUSES, ALLOWED_TRANSITIONS, NoteStatus } from '@/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Eye, Printer, Share2, ChevronRight, ChevronLeft, Paperclip, Receipt, Ban, Trash2, XCircle, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import OSPreviewModal from '@/components/OSPreviewModal';
import { cn } from '@/lib/utils';

/** Estágios do fluxo principal (sem os finais alternativos) para a timeline */
const MAIN_FLOW: NoteStatus[] = ['ABERTO', 'EM_ANALISE', 'ORCAMENTO', 'APROVADO', 'EM_EXECUCAO', 'AGUARDANDO_COMPRA', 'PRONTO', 'ENTREGUE', 'FINALIZADO'];

export default function IntakeNoteDetail() {
  const { id } = useParams();
  const { getNote, getClient, getServicesForNote, getProductsForNote, getAttachmentsForNote, updateNoteStatus, updateNote, invoices, getChildNotes, notes } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
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
  const noteInvoices = invoices.filter(inv => inv.noteId === note.id);
  const childNotes = getChildNotes(note.id);
  const parentNote = note.parentNoteId ? notes.find(n => n.id === note.parentNoteId) : null;

  const isFinal = FINAL_STATUSES.has(note.status);
  const isAguardando = note.status === 'AGUARDANDO_COMPRA';
  const allowed = ALLOWED_TRANSITIONS[note.status];
  // Próximo estágio no fluxo principal (exclui finais alternativos e AGUARDANDO)
  const nextMainStatus = allowed.find(s => !FINAL_STATUSES.has(s) || s === 'FINALIZADO');
  const canAdvance = !isFinal && !isAguardando && nextMainStatus !== undefined;

  const mainFlowIdx = MAIN_FLOW.indexOf(note.status);
  const canGoBack = mainFlowIdx > 0 && user?.role === 'ADMIN' && !isFinal && !isAguardando;

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

  // Timeline: mostra o fluxo principal + estágio final alternativo se aplicável
  const timelineStatuses = MAIN_FLOW.slice();
  const isAltFinal = isFinal && !MAIN_FLOW.includes(note.status);
  const statusIdxForTimeline = isAltFinal ? -1 : MAIN_FLOW.indexOf(note.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-primary">{note.number}</h1>
            <Badge className={STATUS_COLORS[note.status]}>{STATUS_LABELS[note.status]}</Badge>
            <Badge className={cn(
              note.type === 'COMPRA' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
            )}>
              {note.type === 'COMPRA' ? 'Compra' : 'Serviço'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{client?.name} · {note.vehicleModel} · R$ {note.totalAmount.toLocaleString('pt-BR')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
              setIsDownloadingPDF(true);
              try {
                if (source?.cabecalho.pdf_url) {
                  const a = document.createElement('a');
                  a.href = source.cabecalho.pdf_url;
                  a.download = `OS-${source.cabecalho.os_numero}.pdf`;
                  a.target = '_blank';
                  a.click();
                } else if (source) {
                  const blob = await pdf(<NotaPDFTemplate dados={source} />).toBlob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `OS-${note.number}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } else {
                  toast({ title: 'Imprimir indisponível em modo demo' });
                }
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
          <Button variant="outline" size="sm" onClick={() => toast({ title: 'WhatsApp (mock)' })} className="gap-1.5">
            <Share2 className="w-4 h-4" /> WhatsApp
          </Button>
          {canGoBack && <Button variant="ghost" size="sm" onClick={goBack}><ChevronLeft className="w-4 h-4" /> Voltar etapa</Button>}
          {canAdvance && <Button size="sm" onClick={advance}>Avançar <ChevronRight className="w-4 h-4 ml-1" /></Button>}

          {/* Cancelar - somente a partir de Orçamento */}
          {note.status === 'ORCAMENTO' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Ban className="w-4 h-4" /> Cancelar O.S.
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar {note.number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O cliente não aprovou o orçamento. A O.S. será movida para "Cancelado" (estágio final).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => moveToFinal('CANCELADO', 'Cancelado')}
                  >
                    Confirmar Cancelamento
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
                  <Trash2 className="w-4 h-4" /> Descartar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Descartar {note.number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A O.S. será movida para "Descartado" por erro. Essa ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction className="bg-zinc-600 text-white hover:bg-zinc-700" onClick={() => moveToFinal('DESCARTADO', 'Descartado')}>
                    Confirmar Descarte
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
        <TabsList>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="anexos">Anexos ({atts.length})</TabsTrigger>
          <TabsTrigger value="nf" className="text-muted-foreground">NF ({noteInvoices.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="itens">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Serviços</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead className="w-[80px]">Qtd</TableHead><TableHead className="w-[100px] text-right">Preço</TableHead><TableHead className="w-[100px] text-right">Subtotal</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {svcs.map(s => (
                      <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.quantity}</TableCell><TableCell className="text-right">R$ {s.price.toFixed(2)}</TableCell><TableCell className="text-right font-medium">R$ {s.subtotal.toFixed(2)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Produtos / Peças</CardTitle></CardHeader>
              <CardContent>
                {prds.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead className="w-[80px]">Qtd</TableHead><TableHead className="w-[100px] text-right">Preço</TableHead><TableHead className="w-[100px] text-right">Subtotal</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {prds.map(p => (
                        <TableRow key={p.id}><TableCell>{p.name}</TableCell><TableCell className="text-muted-foreground">{p.sku}</TableCell><TableCell>{p.quantity}</TableCell><TableCell className="text-right">R$ {p.unitPrice.toFixed(2)}</TableCell><TableCell className="text-right font-medium">R$ {p.subtotal.toFixed(2)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="text-center py-4 text-muted-foreground text-sm">Nenhum produto.</p>}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="grid grid-cols-3 gap-6">
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
        <TabsContent value="nf">
          <Card className="border-0 shadow-sm"><CardContent className="p-6">
            {noteInvoices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-3">Nenhuma nota fiscal vinculada.</p>
                <Button variant="outline" asChild><Link to="/nota-fiscal"><Receipt className="w-4 h-4 mr-2" /> Registrar NF</Link></Button>
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Número</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                <TableBody>{noteInvoices.map(inv => (
                  <TableRow key={inv.id}><TableCell>{inv.type}</TableCell><TableCell>{inv.number}</TableCell><TableCell>{new Date(inv.issueDate).toLocaleDateString('pt-BR')}</TableCell><TableCell className="text-right font-medium">R$ {inv.amount.toLocaleString('pt-BR')}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Preview Modal */}
      <OSPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        note={note}
        client={client}
        services={svcs}
        products={prds}
      />
    </div>
  );
}
