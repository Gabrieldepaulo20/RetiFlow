import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import PayableModalShell from '@/components/payables/PayableModalShell';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import {
  buildPayableHistoryDescription,
  calculatePayableFinalAmount,
  findPayableDuplicate,
  formatPayableRecurrenceLabel,
} from '@/services/domain/payables';
import { AccountPayable, PAYMENT_METHOD_LABELS, RECURRENCE_TYPE_LABELS } from '@/types';
import { Bot, Camera, CheckCircle2, ChevronDown, FileScan, LoaderCircle, SendHorizontal, ShieldCheck, Sparkles, Trash2, Upload, XCircle } from 'lucide-react';
import { analisarContaPagarComIA } from '@/api/supabase/contas-pagar';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

type ExtractedField = {
  label: string;
  value: string;
  confidence: number;
};

type SuggestedStatus = 'PAGO' | 'PENDENTE' | 'AGENDADO' | 'INCERTO';

type ImportDraft = {
  title: string;
  supplierName: string;
  categoryId: string;
  dueDate: string;
  issueDate?: string;
  originalAmount: number;
  paymentMethod: AccountPayable['paymentMethod'];
  recurrence: AccountPayable['recurrence'];
  docNumber?: string;
  observations?: string;
  isUrgent: boolean;
  suggestedStatus: SuggestedStatus;
};

type AnalysisResult = {
  draft: ImportDraft;
  fields: ExtractedField[];
  warnings: string[];
  highlights: string[];
};

type ImportSource = 'arquivo' | 'camera';
type ImportFileStatus = 'pending' | 'analyzing' | 'success' | 'error' | 'created';

type ImportFileItem = {
  id: string;
  file: File;
  source: ImportSource;
  previewUrl: string | null;
  status: ImportFileStatus;
  progress: number;
  analysis: AnalysisResult | null;
  error?: string;
  expanded: boolean;
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildImportFileItem(file: File, source: ImportSource): ImportFileItem {
  const shouldPreview = file.type.startsWith('image/') || file.type === 'application/pdf';
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() ?? Date.now()}`,
    file,
    source,
    previewUrl: shouldPreview ? URL.createObjectURL(file) : null,
    status: 'pending',
    progress: 0,
    analysis: null,
    expanded: false,
  };
}

function getFileKind(file: File) {
  const extension = file.name.split('.').pop()?.toUpperCase() || 'ARQ';
  if (file.type.startsWith('image/')) return { extension, label: 'Imagem', tone: 'from-sky-50 to-blue-100 text-blue-700 border-blue-200' };
  if (file.type === 'application/pdf') return { extension: 'PDF', label: 'PDF', tone: 'from-rose-50 to-red-100 text-red-700 border-red-200' };
  if (file.name.toLowerCase().endsWith('.doc') || file.name.toLowerCase().endsWith('.docx')) return { extension: 'DOC', label: 'Word', tone: 'from-indigo-50 to-blue-100 text-indigo-700 border-indigo-200' };
  return { extension, label: 'Arquivo', tone: 'from-slate-50 to-slate-100 text-slate-700 border-slate-200' };
}

function getSuggestedCategory(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.includes('agua') || lower.includes('energia') || lower.includes('internet')) return 'paycat-2';
  if (lower.includes('aluguel')) return 'paycat-3';
  if (lower.includes('iptu') || lower.includes('imposto') || lower.includes('taxa') || lower.includes('guia')) return 'paycat-4';
  if (lower.includes('peca') || lower.includes('material') || lower.includes('boleto')) return 'paycat-1';
  if (lower.includes('obra') || lower.includes('pedreiro') || lower.includes('maquina')) return 'paycat-6';
  if (lower.includes('mercado') || lower.includes('salgado') || lower.includes('almoco')) return 'paycat-8';
  return 'paycat-7';
}

function inferSuggestedStatus(lower: string): SuggestedStatus {
  if (lower.includes('comprovante') || lower.includes('recibo') || lower.includes('pago') || lower.includes('quitado')) return 'PAGO';
  if (lower.includes('agendado') || lower.includes('programado')) return 'AGENDADO';
  if (lower.includes('boleto') || lower.includes('fatura') || lower.includes('conta')) return 'PENDENTE';
  return 'INCERTO';
}

function inferDraft(file: File): AnalysisResult {
  const lower = file.name.toLowerCase();
  const amountBase = Math.max(18, Math.min(4800, Math.round(file.size / 37)));
  const originalAmount = Number((amountBase / 10).toFixed(2));
  const dueOffset = lower.includes('vencido') ? -2 : lower.includes('urgente') ? 0 : 5;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueOffset);
  const suggestedStatus = inferSuggestedStatus(lower);

  const supplierName =
    lower.includes('sabesp') ? 'SABESP' :
    lower.includes('enel') ? 'Enel SP' :
    lower.includes('prefeitura') ? 'Prefeitura Municipal' :
    lower.includes('santos') ? 'Distribuidora Santos Peças' :
    lower.includes('mercado') ? 'Mercado Central' :
    lower.includes('obra') ? 'Equipe da obra / pedreiro' :
    'Fornecedor identificado via documento';

  const title =
    lower.includes('agua') ? 'Conta de Água importada' :
    lower.includes('energia') ? 'Conta de Energia importada' :
    lower.includes('aluguel') ? 'Aluguel importado' :
    lower.includes('boleto') ? 'Boleto importado' :
    lower.includes('nota') ? 'Nota fiscal importada' :
    lower.includes('obra') ? 'Despesa de obra importada' :
    'Despesa importada com IA';

  const paymentMethod = lower.endsWith('.pdf') ? 'BOLETO' : lower.includes('pix') ? 'PIX' : 'TRANSFERENCIA';
  const recurrence = lower.includes('mensal') ? 'MENSAL' : 'NENHUMA';
  const docNumber = file.name.replace(/\.[^.]+$/, '').slice(0, 40).toUpperCase();

  const draft: ImportDraft = {
    title,
    supplierName,
    categoryId: getSuggestedCategory(lower),
    dueDate: dueDate.toISOString().slice(0, 10),
    issueDate: new Date().toISOString().slice(0, 10),
    originalAmount,
    paymentMethod,
    recurrence,
    docNumber,
    observations: `Pré-cadastro importado de ${file.name} com preenchimento assistido por IA.`,
    isUrgent: dueOffset <= 0 || lower.includes('urgente'),
    suggestedStatus,
  };

  return {
    draft,
    fields: [
      { label: 'Fornecedor', value: draft.supplierName, confidence: 93 },
      { label: 'Título sugerido', value: draft.title, confidence: 91 },
      { label: 'Valor identificado', value: formatMoney(draft.originalAmount), confidence: 89 },
      { label: 'Vencimento', value: draft.dueDate, confidence: 84 },
      { label: 'Documento', value: draft.docNumber ?? 'Não identificado', confidence: 82 },
      { label: 'Forma de pagamento', value: PAYMENT_METHOD_LABELS[draft.paymentMethod ?? 'BOLETO'], confidence: 78 },
      { label: 'Status sugerido', value: draft.suggestedStatus === 'PAGO' ? 'Já paga' : draft.suggestedStatus === 'AGENDADO' ? 'Agendada' : draft.suggestedStatus === 'PENDENTE' ? 'A pagar' : 'Não tenho certeza', confidence: 74 },
    ],
    warnings: [
      'Campos destacados devem ser revisados antes de confirmar o cadastro.',
      'Em produção, essa etapa pode usar OCR e extração estruturada com API de IA.',
    ],
    highlights: [
      'Anexo pronto para ficar vinculado à conta.',
      'Categoria, urgência e status sugeridos automaticamente.',
      'Fluxo preparado para evitar duplicidade antes do cadastro.',
    ],
  };
}

type PayableImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (payable: AccountPayable) => void;
};

export default function PayableImportModal({ open, onOpenChange, onCreated }: PayableImportModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { addPayable, addPayableAttachment, addPayableHistoryEntry, payableCategories, payableSuppliers, payables } = useData();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<ImportFileItem[]>([]);
  const [selectedTab, setSelectedTab] = useState('arquivo');
  const [items, setItems] = useState<ImportFileItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  const isAnalyzing = items.some((item) => item.status === 'analyzing');

  function updateItem(id: string, patch: Partial<ImportFileItem>) {
    setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function handleFileSelection(files: FileList | File[] | null, source: ImportSource) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    setItems((previous) => [
      ...previous,
      ...selectedFiles.map((file) => buildImportFileItem(file, source)),
    ]);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>, source: ImportSource) {
    handleFileSelection(event.target.files, source);
    event.target.value = '';
  }

  function removeItem(id: string) {
    setItems((previous) => {
      const item = previous.find((candidate) => candidate.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return previous.filter((candidate) => candidate.id !== id);
    });
  }

  function clearItems() {
    items.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setItems([]);
  }

  async function analyzeItem(item: ImportFileItem) {
    updateItem(item.id, { status: 'analyzing', progress: 12, error: undefined, expanded: true });

    try {
      let result: AnalysisResult;
      if (!IS_REAL_AUTH) {
        [28, 49, 67, 82, 96].forEach((value, index) => {
          window.setTimeout(() => updateItem(item.id, { progress: value }), 260 * (index + 1));
        });
        await new Promise((resolve) => window.setTimeout(resolve, 1700));
        result = inferDraft(item.file);
      } else {
        updateItem(item.id, { progress: 35 });
        result = await analisarContaPagarComIA({
          file: item.file,
          categories: payableCategories.map((category) => ({ id: category.id, name: category.name })),
          suppliers: payableSuppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
        }) as AnalysisResult;
        updateItem(item.id, { progress: 88 });
      }

      updateItem(item.id, {
        status: 'success',
        progress: 100,
        analysis: result,
        error: undefined,
        expanded: true,
      });
      return true;
    } catch (error) {
      updateItem(item.id, {
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao analisar documento.',
        expanded: true,
      });
      return false;
    }
  }

  async function handleAnalyzeAll(source: ImportSource) {
    const targets = items.filter((item) => item.source === source && (item.status === 'pending' || item.status === 'error'));
    if (targets.length === 0) {
      toast({
        title: 'Nenhum arquivo pendente',
        description: 'Adicione novos arquivos ou remova os que já foram analisados.',
        variant: 'destructive',
      });
      return;
    }

    let successCount = 0;
    for (const item of targets) {
      const success = await analyzeItem(item);
      if (success) {
        successCount += 1;
      }
    }

    toast({
      title: 'Análise finalizada',
      description: `${successCount} de ${targets.length} arquivo${targets.length === 1 ? '' : 's'} analisado${targets.length === 1 ? '' : 's'} com sucesso.`,
      variant: successCount === 0 ? 'destructive' : undefined,
    });
  }

  async function handleCreateDraft(itemId: string, mode: 'standard' | 'paid' | 'open-details') {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item?.analysis) return;

    const duplicate = findPayableDuplicate(
      {
        supplierName: item.analysis.draft.supplierName,
        supplierId: undefined,
        docNumber: item.analysis.draft.docNumber,
        originalAmount: item.analysis.draft.originalAmount,
        dueDate: item.analysis.draft.dueDate,
      },
      payables,
    );

    if (duplicate) {
      toast({
        title: 'Conta possivelmente duplicada',
        description: `A listagem já possui uma conta semelhante: ${duplicate.title}.`,
        variant: 'destructive',
      });
      return;
    }

    const finalAmount = calculatePayableFinalAmount(item.analysis.draft.originalAmount);
    const treatAsPaid = mode === 'paid' || item.analysis.draft.suggestedStatus === 'PAGO';
    const source = item.source === 'camera' ? 'CAMERA_CAPTURE' : 'IA_IMPORT';

    const payable = await addPayable({
      title: item.analysis.draft.title,
      supplierName: item.analysis.draft.supplierName,
      categoryId: item.analysis.draft.categoryId,
      docNumber: item.analysis.draft.docNumber,
      issueDate: item.analysis.draft.issueDate,
      dueDate: item.analysis.draft.dueDate,
      originalAmount: item.analysis.draft.originalAmount,
      finalAmount,
      status: treatAsPaid ? 'PAGO' : item.analysis.draft.suggestedStatus === 'AGENDADO' ? 'AGENDADO' : 'PENDENTE',
      paymentMethod: item.analysis.draft.paymentMethod,
      paidWith: treatAsPaid ? item.analysis.draft.paymentMethod : undefined,
      paidAmount: treatAsPaid ? finalAmount : undefined,
      paidAt: treatAsPaid ? new Date().toISOString() : undefined,
      recurrence: item.analysis.draft.recurrence,
      observations: item.analysis.draft.observations,
      isUrgent: item.analysis.draft.isUrgent,
      entrySource: source,
      paymentExecutionStatus: item.analysis.draft.suggestedStatus === 'AGENDADO' ? 'SCHEDULED' : 'MANUAL',
      createdByUserId: user?.id ?? 'user-2',
    });

    addPayableAttachment({
      payableId: payable.id,
      type: item.file.type === 'application/pdf' ? 'BOLETO' : item.file.type.startsWith('image/') ? 'COMPROVANTE' : 'OUTRO',
      filename: item.file.name,
      url: item.previewUrl ?? `local-upload://${item.file.name}`,
      createdByUserId: user?.id ?? 'user-2',
    });

    addPayableHistoryEntry(
      buildPayableHistoryDescription({
        payableId: payable.id,
        action: 'ATTACHMENT_ADDED',
        userId: user?.id ?? 'user-2',
        extra: { filename: item.file.name },
      }),
    );

    toast({
      title: treatAsPaid ? 'Conta criada como já paga' : 'Conta importada com sucesso',
      description: treatAsPaid
        ? 'O lançamento já entrou no histórico como saída liquidada.'
        : 'A nova conta já está disponível na listagem para acompanhamento.',
    });

    updateItem(item.id, { status: 'created', expanded: false });
    if (mode === 'open-details') {
      onCreated?.(payable);
    }
  }

  return (
    <PayableModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Importar conta com IA"
      description="Suba PDF, DOCX, foto da nota ou comprovante e transforme isso em conta com revisão assistida."
      desktopClassName="sm:max-w-6xl"
    >
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-5">
        <TabsList className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0">
          <TabsTrigger value="arquivo" className="rounded-2xl border border-border/60 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-primary/5">Enviar arquivo</TabsTrigger>
          <TabsTrigger value="camera" className="rounded-2xl border border-border/60 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-primary/5">Tirar foto</TabsTrigger>
        </TabsList>

        <TabsContent value="arquivo" className="mt-0 space-y-5">
          <Alert>
            <Bot className="h-4 w-4" />
            <AlertTitle>{IS_REAL_AUTH ? 'Importação assistida com IA real' : 'Importação assistida em modo demonstração'}</AlertTitle>
            <AlertDescription>
              {IS_REAL_AUTH
                ? 'O documento será enviado para uma Supabase Function, analisado com IA e revisado antes de virar conta.'
                : 'Em desenvolvimento, a tela simula a análise sem chamar IA externa. Em produção, usa a função segura no backend.'}
            </AlertDescription>
          </Alert>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp"
            onChange={(event) => handleFileChange(event, 'arquivo')}
            className="hidden"
          />
          <ImportBody
            items={items.filter((item) => item.source === 'arquivo')}
            isAnalyzing={isAnalyzing}
            analyzableCount={items.filter((item) => item.source === 'arquivo' && (item.status === 'pending' || item.status === 'error')).length}
            payableCategories={payableCategories}
            onSelect={() => fileInputRef.current?.click()}
            onAnalyze={() => void handleAnalyzeAll('arquivo')}
            onClear={clearItems}
            onRemove={removeItem}
            onToggleExpanded={(id) => updateItem(id, { expanded: !items.find((item) => item.id === id)?.expanded })}
            onCreateDraft={(id, mode) => void handleCreateDraft(id, mode)}
          />
        </TabsContent>

        <TabsContent value="camera" className="mt-0 space-y-5">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => handleFileChange(event, 'camera')}
            className="hidden"
          />
          <Alert>
            <Camera className="h-4 w-4" />
            <AlertTitle>Capture a nota direto do celular</AlertTitle>
            <AlertDescription>
              Ideal para notinhas, despesas rápidas, salgado, mercado, pedreiro, frete ou qualquer saída registrada por foto.
            </AlertDescription>
          </Alert>
          <ImportBody
            items={items.filter((item) => item.source === 'camera')}
            isAnalyzing={isAnalyzing}
            analyzableCount={items.filter((item) => item.source === 'camera' && (item.status === 'pending' || item.status === 'error')).length}
            payableCategories={payableCategories}
            cameraMode
            onSelect={() => cameraInputRef.current?.click()}
            onAnalyze={() => void handleAnalyzeAll('camera')}
            onClear={clearItems}
            onRemove={removeItem}
            onToggleExpanded={(id) => updateItem(id, { expanded: !items.find((item) => item.id === id)?.expanded })}
            onCreateDraft={(id, mode) => void handleCreateDraft(id, mode)}
          />
        </TabsContent>
      </Tabs>
    </PayableModalShell>
  );
}

type ImportBodyProps = {
  items: ImportFileItem[];
  isAnalyzing: boolean;
  analyzableCount: number;
  payableCategories: Array<{ id: string; name: string }>;
  cameraMode?: boolean;
  onSelect: () => void;
  onAnalyze: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onCreateDraft: (id: string, mode: 'standard' | 'paid' | 'open-details') => void;
};

function ImportBody({
  items,
  isAnalyzing,
  analyzableCount,
  payableCategories,
  cameraMode = false,
  onSelect,
  onAnalyze,
  onClear,
  onRemove,
  onToggleExpanded,
  onCreateDraft,
}: ImportBodyProps) {
  const successCount = items.filter((item) => item.status === 'success' || item.status === 'created').length;
  const errorCount = items.filter((item) => item.status === 'error').length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background px-6 py-8 text-center transition hover:border-primary/50 hover:bg-primary/10"
        >
          <div className="rounded-2xl bg-primary/10 p-4 text-primary">
            {cameraMode ? <Camera className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
          </div>
          <p className="mt-4 text-base font-semibold">{cameraMode ? 'Tirar foto da nota' : 'Arraste ou selecione um documento'}</p>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            {cameraMode
              ? 'A câmera abre direto no celular. Depois a imagem entra na análise e vira uma conta revisável.'
              : 'Ideal para boletos em PDF, imagens escaneadas, DOCX e comprovantes de saída do dia a dia.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge variant="secondary">PDF</Badge>
            <Badge variant="secondary">Imagem</Badge>
            <Badge variant="secondary">DOC / DOCX</Badge>
            {cameraMode ? <Badge variant="secondary">Camera-first</Badge> : <Badge variant="secondary">Inbox financeiro</Badge>}
          </div>
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Arquivos para análise</p>
            <p className="text-xs text-muted-foreground">
              {items.length === 0
                ? 'Selecione um ou vários documentos para montar a fila.'
                : `${items.length} arquivo${items.length === 1 ? '' : 's'} na fila • ${successCount} pronto${successCount === 1 ? '' : 's'} • ${errorCount} com erro`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onAnalyze} disabled={items.length === 0 || analyzableCount === 0 || isAnalyzing} className="gap-2">
              {isAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              {isAnalyzing ? 'Analisando...' : `Enviar para IA${analyzableCount > 0 ? ` (${analyzableCount})` : ''}`}
            </Button>
            {items.length > 0 ? (
              <Button variant="outline" onClick={onClear} disabled={isAnalyzing}>
                Limpar fila
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
              <FileScan className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">Nenhum arquivo selecionado ainda</p>
              <p className="mt-1 text-xs text-muted-foreground">Depois de anexar, eles aparecem aqui com status individual de análise.</p>
            </div>
          ) : null}

          {items.map((item) => (
            <ImportFileCard
              key={item.id}
              item={item}
              categoryName={item.analysis ? payableCategories.find((category) => category.id === item.analysis?.draft.categoryId)?.name ?? 'Categoria sugerida' : null}
              recurrenceLabel={item.analysis ? formatPayableRecurrenceLabel(
                {
                  id: 'preview',
                  title: item.analysis.draft.title,
                  categoryId: item.analysis.draft.categoryId,
                  dueDate: item.analysis.draft.dueDate,
                  originalAmount: item.analysis.draft.originalAmount,
                  finalAmount: item.analysis.draft.originalAmount,
                  status: 'PENDENTE',
                  recurrence: item.analysis.draft.recurrence,
                  isUrgent: item.analysis.draft.isUrgent,
                  createdAt: '',
                  updatedAt: '',
                  createdByUserId: 'preview',
                },
                RECURRENCE_TYPE_LABELS[item.analysis.draft.recurrence],
              ) : null}
              onRemove={onRemove}
              onToggleExpanded={onToggleExpanded}
              onCreateDraft={onCreateDraft}
            />
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <Card className="border-border/60">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Fluxo simples para o financeiro
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>1. Anexe um ou vários arquivos.</li>
              <li>2. Clique em enviar para IA uma única vez.</li>
              <li>3. Revise cada resultado e crie as contas aprovadas.</li>
              <li>4. Se algum arquivo falhar, expanda para ver o motivo e tente novamente.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-4 p-5">
            <p className="text-sm font-semibold">Resumo da fila</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs text-muted-foreground">Arquivos</p>
                <p className="text-xl font-bold">{items.length}</p>
              </div>
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs text-muted-foreground">Prontos</p>
                <p className="text-xl font-bold text-primary">{successCount}</p>
              </div>
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold">{items.filter((item) => item.status === 'pending').length}</p>
              </div>
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs text-muted-foreground">Erros</p>
                <p className="text-xl font-bold text-destructive">{errorCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type ImportFileCardProps = {
  item: ImportFileItem;
  categoryName: string | null;
  recurrenceLabel: string | null;
  onRemove: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onCreateDraft: (id: string, mode: 'standard' | 'paid' | 'open-details') => void;
};

function FileTileIcon({ file }: { file: File }) {
  const kind = getFileKind(file);
  return (
    <div className={`relative flex h-14 w-12 shrink-0 items-end justify-center rounded-lg border bg-gradient-to-br pb-1.5 shadow-sm ${kind.tone}`}>
      <div className="absolute right-0 top-0 h-0 w-0 border-l-[13px] border-t-[13px] border-l-transparent border-t-white/80" />
      <span className="text-[10px] font-black tracking-tight">{kind.extension.slice(0, 4)}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ImportFileStatus }) {
  if (status === 'success') return <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3" /> Sucesso</Badge>;
  if (status === 'created') return <Badge className="gap-1 bg-primary text-primary-foreground"><CheckCircle2 className="h-3 w-3" /> Conta criada</Badge>;
  if (status === 'error') return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Erro</Badge>;
  if (status === 'analyzing') return <Badge variant="secondary" className="gap-1"><LoaderCircle className="h-3 w-3 animate-spin" /> Analisando</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function ImportFileCard({
  item,
  categoryName,
  recurrenceLabel,
  onRemove,
  onToggleExpanded,
  onCreateDraft,
}: ImportFileCardProps) {
  const kind = getFileKind(item.file);

  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-0">
        <div className="flex items-start gap-3 p-4">
          <FileTileIcon file={item.file} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">{kind.label} • {formatBytes(item.file.size)} • {item.file.type || 'Tipo não informado'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={item.status} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleExpanded(item.id)}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${item.expanded ? 'rotate-180' : ''}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRemove(item.id)} disabled={item.status === 'analyzing'}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {item.status === 'analyzing' ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Lendo documento e extraindo campos</span>
                  <span>{item.progress}%</span>
                </div>
                <Progress value={item.progress} />
              </div>
            ) : null}

            {item.status === 'error' && !item.expanded ? (
              <p className="mt-2 truncate text-xs text-destructive">{item.error}</p>
            ) : null}
          </div>
        </div>

        {item.expanded ? (
          <div className="border-t bg-muted/20 p-4">
            {item.error ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Erro ao analisar este arquivo</AlertTitle>
                <AlertDescription>{item.error}</AlertDescription>
              </Alert>
            ) : null}

            {item.previewUrl && item.file.type.startsWith('image/') ? (
              <div className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-background">
                <img src={item.previewUrl} alt={item.file.name} className="max-h-[260px] w-full object-contain" />
              </div>
            ) : null}

            {item.analysis ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {item.analysis.fields.map((field) => (
                    <div key={field.label} className="rounded-2xl border border-border/60 bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{field.label}</p>
                        <Badge variant={field.confidence >= 85 ? 'default' : 'secondary'}>{field.confidence}%</Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium">{field.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-primary/20 bg-background p-4">
                  <p className="text-sm font-semibold">Resumo pronto para virar conta</p>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <p><span className="font-medium text-foreground">Categoria:</span> {categoryName}</p>
                    <p><span className="font-medium text-foreground">Valor:</span> {formatMoney(item.analysis.draft.originalAmount)}</p>
                    <p><span className="font-medium text-foreground">Status:</span> {item.analysis.draft.suggestedStatus === 'PAGO' ? 'Já paga' : item.analysis.draft.suggestedStatus === 'AGENDADO' ? 'Agendada' : item.analysis.draft.suggestedStatus === 'PENDENTE' ? 'A pagar' : 'Não tenho certeza'}</p>
                    <p><span className="font-medium text-foreground">Recorrência:</span> {recurrenceLabel ?? 'Sem recorrência'}</p>
                  </div>
                  {item.status !== 'created' ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <Button onClick={() => onCreateDraft(item.id, 'standard')}>Criar conta</Button>
                      <Button variant="outline" onClick={() => onCreateDraft(item.id, 'open-details')}>Criar e abrir</Button>
                      <Button variant="secondary" onClick={() => onCreateDraft(item.id, 'paid')}>Criar paga</Button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-success/10 px-3 py-2 text-sm font-medium text-success">
                      Conta já criada a partir deste arquivo.
                    </div>
                  )}
                </div>

                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Revise antes de salvar</AlertTitle>
                  <AlertDescription>A IA acelera o cadastro, mas a confirmação humana continua sendo a etapa mais importante.</AlertDescription>
                </Alert>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
