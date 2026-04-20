import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { BadgeCheck, Bot, Camera, FileImage, FileScan, FileText, LoaderCircle, ShieldCheck, Sparkles, Upload, WandSparkles } from 'lucide-react';

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

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  const { addPayable, addPayableAttachment, addPayableHistoryEntry, payableCategories, payables } = useData();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTab, setSelectedTab] = useState('arquivo');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const categoryName = useMemo(() => {
    if (!analysis) return null;
    return payableCategories.find((category) => category.id === analysis.draft.categoryId)?.name ?? 'Categoria sugerida';
  }, [analysis, payableCategories]);

  const recurrenceLabel = useMemo(() => {
    if (!analysis) return null;
    return formatPayableRecurrenceLabel(
      {
        id: 'preview',
        title: analysis.draft.title,
        categoryId: analysis.draft.categoryId,
        dueDate: analysis.draft.dueDate,
        originalAmount: analysis.draft.originalAmount,
        finalAmount: analysis.draft.originalAmount,
        status: 'PENDENTE',
        recurrence: analysis.draft.recurrence,
        isUrgent: analysis.draft.isUrgent,
        createdAt: '',
        updatedAt: '',
        createdByUserId: user?.id ?? 'user-2',
      },
      RECURRENCE_TYPE_LABELS[analysis.draft.recurrence],
    );
  }, [analysis, user?.id]);

  function resetImportState() {
    setAnalysis(null);
    setProgress(0);
    setIsAnalyzing(false);
  }

  function handleFileSelection(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    resetImportState();

    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      setPreviewUrl(URL.createObjectURL(file));
      return;
    }

    setPreviewUrl(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    handleFileSelection(event.target.files?.[0] ?? null);
  }

  function handleAnalyze() {
    if (!selectedFile) {
      toast({
        title: 'Selecione um documento',
        description: 'Envie um PDF, imagem ou arquivo da conta para iniciar a análise.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setProgress(12);
    setAnalysis(null);

    const checkpoints = [28, 49, 67, 82, 96];
    checkpoints.forEach((value, index) => {
      window.setTimeout(() => setProgress(value), 260 * (index + 1));
    });

    window.setTimeout(() => {
      setAnalysis(inferDraft(selectedFile));
      setProgress(100);
      setIsAnalyzing(false);
      toast({
        title: 'Pré-análise concluída',
        description: 'Revise os campos sugeridos antes de gerar a conta.',
      });
    }, 1700);
  }

  function handleCreateDraft(mode: 'standard' | 'paid' | 'open-details') {
    if (!selectedFile || !analysis) return;

    const duplicate = findPayableDuplicate(
      {
        supplierName: analysis.draft.supplierName,
        supplierId: undefined,
        docNumber: analysis.draft.docNumber,
        originalAmount: analysis.draft.originalAmount,
        dueDate: analysis.draft.dueDate,
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

    const finalAmount = calculatePayableFinalAmount(analysis.draft.originalAmount);
    const treatAsPaid = mode === 'paid' || analysis.draft.suggestedStatus === 'PAGO';
    const source = selectedTab === 'camera' ? 'CAMERA_CAPTURE' : 'IA_IMPORT';

    const payable = addPayable({
      title: analysis.draft.title,
      supplierName: analysis.draft.supplierName,
      categoryId: analysis.draft.categoryId,
      docNumber: analysis.draft.docNumber,
      issueDate: analysis.draft.issueDate,
      dueDate: analysis.draft.dueDate,
      originalAmount: analysis.draft.originalAmount,
      finalAmount,
      status: treatAsPaid ? 'PAGO' : analysis.draft.suggestedStatus === 'AGENDADO' ? 'AGENDADO' : 'PENDENTE',
      paymentMethod: analysis.draft.paymentMethod,
      paidWith: treatAsPaid ? analysis.draft.paymentMethod : undefined,
      paidAmount: treatAsPaid ? finalAmount : undefined,
      paidAt: treatAsPaid ? new Date().toISOString() : undefined,
      recurrence: analysis.draft.recurrence,
      observations: analysis.draft.observations,
      isUrgent: analysis.draft.isUrgent,
      entrySource: source,
      paymentExecutionStatus: analysis.draft.suggestedStatus === 'AGENDADO' ? 'SCHEDULED' : 'MANUAL',
      createdByUserId: user?.id ?? 'user-2',
    });

    addPayableAttachment({
      payableId: payable.id,
      type: selectedFile.type === 'application/pdf' ? 'BOLETO' : selectedFile.type.startsWith('image/') ? 'COMPROVANTE' : 'OUTRO',
      filename: selectedFile.name,
      url: previewUrl ?? `local-upload://${selectedFile.name}`,
      createdByUserId: user?.id ?? 'user-2',
    });

    addPayableHistoryEntry(
      buildPayableHistoryDescription({
        payableId: payable.id,
        action: 'ATTACHMENT_ADDED',
        userId: user?.id ?? 'user-2',
        extra: { filename: selectedFile.name },
      }),
    );

    toast({
      title: treatAsPaid ? 'Conta criada como já paga' : 'Conta importada com sucesso',
      description: treatAsPaid
        ? 'O lançamento já entrou no histórico como saída liquidada.'
        : 'A nova conta já está disponível na listagem para acompanhamento.',
    });

    onOpenChange(false);
    onCreated?.(payable);
    if (mode === 'open-details') {
      window.setTimeout(() => onCreated?.(payable), 50);
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
            <AlertTitle>Importação assistida preparada para IA</AlertTitle>
            <AlertDescription>
              A ideia profissional é essa: o usuário sobe o documento, a IA sugere os campos, o financeiro revisa e confirma antes de gerar a conta.
            </AlertDescription>
          </Alert>

          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp" onChange={handleFileChange} className="hidden" />
          <ImportBody
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            progress={progress}
            categoryName={categoryName}
            recurrenceLabel={recurrenceLabel}
            onSelect={() => fileInputRef.current?.click()}
            onAnalyze={handleAnalyze}
            onClear={() => handleFileSelection(null)}
            onCreateDraft={handleCreateDraft}
          />
        </TabsContent>

        <TabsContent value="camera" className="mt-0 space-y-5">
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
          <Alert>
            <Camera className="h-4 w-4" />
            <AlertTitle>Capture a nota direto do celular</AlertTitle>
            <AlertDescription>
              Ideal para notinhas, despesas rápidas, salgado, mercado, pedreiro, frete ou qualquer saída registrada por foto.
            </AlertDescription>
          </Alert>
          <ImportBody
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            progress={progress}
            categoryName={categoryName}
            recurrenceLabel={recurrenceLabel}
            cameraMode
            onSelect={() => cameraInputRef.current?.click()}
            onAnalyze={handleAnalyze}
            onClear={() => handleFileSelection(null)}
            onCreateDraft={handleCreateDraft}
          />
        </TabsContent>
      </Tabs>
    </PayableModalShell>
  );
}

type ImportBodyProps = {
  selectedFile: File | null;
  previewUrl: string | null;
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  progress: number;
  categoryName: string | null;
  recurrenceLabel: string | null;
  cameraMode?: boolean;
  onSelect: () => void;
  onAnalyze: () => void;
  onClear: () => void;
  onCreateDraft: (mode: 'standard' | 'paid' | 'open-details') => void;
};

function ImportBody({
  selectedFile,
  previewUrl,
  analysis,
  isAnalyzing,
  progress,
  categoryName,
  recurrenceLabel,
  cameraMode = false,
  onSelect,
  onAnalyze,
  onClear,
  onCreateDraft,
}: ImportBodyProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background px-6 py-12 text-center transition hover:border-primary/50 hover:bg-primary/10"
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

        {selectedFile ? (
          <Card className="border-border/60">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    {selectedFile.type.startsWith('image/') ? <FileImage className="h-5 w-5" /> : selectedFile.type === 'application/pdf' ? <FileText className="h-5 w-5" /> : <FileScan className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">{formatBytes(selectedFile.size)} • {selectedFile.type || 'Arquivo genérico'}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={onClear}>Trocar</Button>
              </div>

              {previewUrl && selectedFile.type.startsWith('image/') ? (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                  <img src={previewUrl} alt={selectedFile.name} className="max-h-[360px] w-full object-contain" />
                </div>
              ) : null}

              {previewUrl && selectedFile.type === 'application/pdf' ? (
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                  Preview rápido disponível para PDF. Na fase seguinte, essa área pode exibir páginas e zonas extraídas.
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onAnalyze} disabled={!selectedFile || isAnalyzing}>
            {isAnalyzing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
            {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
          </Button>
        </div>

        {isAnalyzing || analysis ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="grid gap-2 sm:grid-cols-4 text-xs text-muted-foreground">
              <span className={progress >= 15 ? 'font-medium text-foreground' : ''}>Arquivo recebido</span>
              <span className={progress >= 40 ? 'font-medium text-foreground' : ''}>Texto identificado</span>
              <span className={progress >= 70 ? 'font-medium text-foreground' : ''}>Campos sugeridos</span>
              <span className={progress >= 100 ? 'font-medium text-foreground' : ''}>Revisão final</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pipeline de extração e pré-preenchimento</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        ) : null}

        {analysis ? (
          <Card className="border-border/60">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Revisão do documento</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {analysis.fields.map((field) => (
                  <div key={field.label} className="rounded-2xl border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{field.label}</p>
                      <Badge variant={field.confidence >= 85 ? 'default' : 'secondary'}>{field.confidence}%</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-relaxed">{field.value}</p>
                  </div>
                ))}
              </div>
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Confirmação humana antes de salvar</AlertTitle>
                <AlertDescription>
                  Esse é o ponto que deixa o fluxo profissional: a IA acelera, mas o financeiro revisa antes de impactar o caixa.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card className="border-border/60">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Valor percebido para a cliente
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>Anexo sobe junto com a conta e fica vinculado ao lançamento.</li>
              <li>IA sugere fornecedor, vencimento, categoria, valor e status inicial.</li>
              <li>Serve tanto para boleto grande quanto para notinha rápida do dia a dia.</li>
              <li>Preparado para OCR real e extração estruturada por API depois.</li>
            </ul>
          </CardContent>
        </Card>

        {analysis ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-4 p-5">
              <p className="text-sm font-semibold">Resumo pronto para virar conta</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Categoria:</span> {categoryName}</p>
                <p><span className="font-medium text-foreground">Status sugerido:</span> {analysis.draft.suggestedStatus === 'PAGO' ? 'Já paga' : analysis.draft.suggestedStatus === 'AGENDADO' ? 'Agendada' : analysis.draft.suggestedStatus === 'PENDENTE' ? 'A pagar' : 'Não tenho certeza'}</p>
                <p><span className="font-medium text-foreground">Urgência:</span> {analysis.draft.isUrgent ? 'Alta' : 'Normal'}</p>
                <p><span className="font-medium text-foreground">Recorrência:</span> {recurrenceLabel ?? 'Sem recorrência'}</p>
                <p><span className="font-medium text-foreground">Valor:</span> {formatMoney(analysis.draft.originalAmount)}</p>
              </div>
              <div className="grid gap-2">
                <Button onClick={() => onCreateDraft('standard')}>Criar conta</Button>
                <Button variant="outline" onClick={() => onCreateDraft('open-details')}>Criar e abrir detalhes</Button>
                <Button variant="secondary" onClick={() => onCreateDraft('paid')}>Criar como já paga</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
