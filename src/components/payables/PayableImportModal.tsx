import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import PayableModalShell from '@/components/payables/PayableModalShell';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';
import { todayLocalISODate } from '@/lib/dates';
import {
  buildMeaningfulPayableTitle,
  buildPayableHistoryDescription,
  calculatePayableFinalAmount,
  classifyPayableMatch,
} from '@/services/domain/payables';
import { inferPayableAttachmentType, isPayableImageFile, isPayablePdfFile } from '@/services/domain/payableFiles';
import { buildImportedPayableAttachmentName } from '@/services/domain/payableAttachments';
import { AccountPayable, PAYMENT_METHOD_LABELS, PaymentMethod, RecurrenceType } from '@/types';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Camera, CheckCircle2, ChevronDown, FileScan, LoaderCircle, RotateCw, Sparkles, Trash2, Upload, XCircle } from 'lucide-react';
import { analisarContaPagarComIA, insertAnexoContaPagar, uploadAnexoContaPagar } from '@/api/supabase/contas-pagar';
import {
  criarMovimentoManual,
  criarRecebivelManual,
  getAllFinanceiroExtrato,
  getAllFinanceiroLancamentos,
  insertFinanceiroAnexo,
  uploadFinanceiroComprovante,
  type CategoriaEntrada,
  type FinanceiroConta,
} from '@/api/supabase/financeiro';
import { normalizeCommonBusinessTermsPtBr } from '@/services/domain/textNormalization';
import {
  buildMeaningfulFinancialEntryTitle,
  canCreateImportedFinancialEntry,
  isSimilarImportedFinancialEntry,
  normalizeFinancialImportDirection,
  type FinancialImportDirection as FinancialDirection,
  type FinancialImportEntryOrigin as EntryOrigin,
  type FinancialImportEntryTiming as EntryTiming,
  type FinancialImportServiceOrderDecision as ServiceOrderDecision,
} from '@/services/domain/financialImport';

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
  recurrenceIndex?: number;
  totalInstallments?: number;
  direction?: FinancialDirection;
  directionConfidence?: number;
  directionReason?: string;
  entryCategoryId?: string;
  entryTiming?: EntryTiming;
  entryOrigin?: EntryOrigin;
  possibleServiceOrder?: boolean;
  serviceOrderReference?: string;
};

type Clarification = {
  id: string;
  kind: 'account_count' | 'installments' | 'duplicate' | 'direction' | 'entry_timing' | 'other';
  question: string;
  options: Array<{ label: string; value: string }>;
};

type AnalysisResult = {
  draft: ImportDraft;
  /** Edge novo: uma entrada por conta detectada (parcela irregular = uma por parcela). */
  drafts?: ImportDraft[];
  accountCount?: number;
  clarifications?: Clarification[];
  fields: ExtractedField[];
  warnings: string[];
  highlights: string[];
};

type ImportSource = 'arquivo' | 'camera';
type ImportFileStatus = 'pending' | 'analyzing' | 'success' | 'review' | 'error' | 'created';

type ImportDraftEdits = {
  title?: string;
  supplierName?: string;
  originalAmount?: string;
  dueDate?: string;
  paymentMethod?: AccountPayable['paymentMethod'];
  categoryId?: string;
  direction?: FinancialDirection;
  entryCategoryId?: string;
  entryTiming?: EntryTiming;
  entryOrigin?: EntryOrigin;
  financeAccountId?: string;
  serviceOrderDecision?: ServiceOrderDecision;
};

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
  draftEdits: ImportDraftEdits;
  creating: boolean;
  createdPayableId?: string;
  createdPayable?: AccountPayable;
  duplicatePayableId?: string;
  duplicateFinancialEntry?: { description: string; date: string };
  operationKey: string;
  /** Liga itens que vieram do MESMO arquivo (PDF com várias contas). */
  groupId?: string;
  /** Perguntas com botões da IA (mostradas no 1º item do grupo). */
  clarifications?: Clarification[];
};

type CreateConfirmation = {
  itemId: string;
  type: 'receipt' | 'similar' | 'entry-similar' | 'service-order';
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const VALID_RECURRENCE_TYPES: RecurrenceType[] = ['NENHUMA', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];
const VALID_PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

function isValidISODate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseMoneyDraft(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

type AutoCreateItemResult = {
  created: boolean;
  payable?: AccountPayable;
};

type AutoCreateBatchResult = {
  created: number;
  reviewed: number;
};

function normalizePaymentMethod(value: unknown): PaymentMethod {
  return VALID_PAYMENT_METHODS.includes(value as PaymentMethod) ? value as PaymentMethod : 'BOLETO';
}

function normalizeRecurrence(value: unknown): RecurrenceType {
  return VALID_RECURRENCE_TYPES.includes(value as RecurrenceType) ? value as RecurrenceType : 'NENHUMA';
}

function buildImportFileItem(file: File, source: ImportSource): ImportFileItem {
  const shouldPreview = isPayableImageFile(file) || isPayablePdfFile(file);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() ?? Date.now()}`,
    file,
    source,
    previewUrl: shouldPreview ? URL.createObjectURL(file) : null,
    status: 'pending',
    progress: 0,
    analysis: null,
    expanded: false,
    draftEdits: {},
    creating: false,
    operationKey: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  };
}

function getFileKind(file: File) {
  const extension = file.name.split('.').pop()?.toUpperCase() || 'ARQ';
  if (isPayableImageFile(file)) return { extension, label: 'Imagem', tone: 'from-sky-50 to-blue-100 text-blue-700 border-blue-200' };
  if (isPayablePdfFile(file)) return { extension: 'PDF', label: 'PDF', tone: 'from-rose-50 to-red-100 text-red-700 border-red-200' };
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
    direction: 'SAIDA',
    directionConfidence: 96,
    directionReason: 'Ambiente de demonstração: documento tratado como conta a pagar.',
    entryTiming: 'INCERTO',
    entryOrigin: 'MOVIMENTO_MANUAL',
    possibleServiceOrder: false,
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
      'Fluxo preparado para evitar contas repetidas antes do cadastro.',
    ],
  };
}

type PayableImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (payable: AccountPayable) => void;
  entryCategories?: CategoriaEntrada[];
  financeAccounts?: FinanceiroConta[];
  onFinancialEntryCreated?: () => void;
};

export default function PayableImportModal({
  open,
  onOpenChange,
  onCreated,
  entryCategories = [],
  financeAccounts = [],
  onFinancialEntryCreated,
}: PayableImportModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { addPayable, addPayableAttachment, addPayableHistoryEntry, payableCategories, payableSuppliers, payables } = useData();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<ImportFileItem[]>([]);
  const [selectedTab, setSelectedTab] = useState('arquivo');
  const [items, setItems] = useState<ImportFileItem[]>([]);
  const [confirmation, setConfirmation] = useState<CreateConfirmation | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  const isAnalyzing = items.some((item) => item.status === 'analyzing' || item.creating);

  function updateItem(id: string, patch: Partial<ImportFileItem>) {
    setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function mergeDraftEdits(item: ImportFileItem): ImportDraft | null {
    if (!item.analysis) return null;
    const draft = item.analysis.draft;
    const edits = item.draftEdits;
    return {
      ...draft,
      title: edits.title ?? draft.title,
      supplierName: edits.supplierName ?? draft.supplierName,
      originalAmount: parseMoneyDraft(edits.originalAmount, draft.originalAmount),
      dueDate: edits.dueDate ?? draft.dueDate,
      paymentMethod: edits.paymentMethod ?? draft.paymentMethod,
      categoryId: edits.categoryId ?? draft.categoryId,
      direction: edits.direction ?? draft.direction ?? 'INCERTO',
      entryCategoryId: edits.entryCategoryId ?? draft.entryCategoryId,
      entryTiming: edits.entryTiming ?? draft.entryTiming ?? 'INCERTO',
      entryOrigin: edits.entryOrigin ?? draft.entryOrigin ?? 'MOVIMENTO_MANUAL',
    };
  }

  function getDirection(draft: ImportDraft | null | undefined): FinancialDirection {
    return normalizeFinancialImportDirection(draft?.direction);
  }

  function normalizeEntryDraft(item: ImportFileItem, draft: ImportDraft) {
    const originalAmount = Number(draft.originalAmount);
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new Error('A IA não identificou um valor válido. Corrija o valor antes de criar a entrada.');
    }
    const date = isValidISODate(draft.dueDate)
      ? draft.dueDate
      : todayLocalISODate();
    const fallbackCategory = entryCategories.find((category) => category.ativa) ?? entryCategories[0];
    const entryCategoryId = entryCategories.some((category) => category.id === draft.entryCategoryId)
      ? draft.entryCategoryId
      : fallbackCategory?.id;
    if (!entryCategoryId) {
      throw new Error('Nenhuma categoria de entrada está disponível. Cadastre uma categoria antes de importar este recebimento.');
    }
    const entryTiming: EntryTiming = draft.entryTiming === 'REALIZADA' || draft.entryTiming === 'PREVISTA'
      ? draft.entryTiming
      : 'INCERTO';
    if (entryTiming === 'INCERTO') {
      throw new Error('Confirme se o dinheiro já entrou ou se ainda está previsto.');
    }
    const entryOrigin: EntryOrigin = draft.entryOrigin === 'APORTE'
      || draft.entryOrigin === 'REEMBOLSO'
      || draft.entryOrigin === 'AJUSTE'
      ? draft.entryOrigin
      : 'MOVIMENTO_MANUAL';
    const counterparty = normalizeCommonBusinessTermsPtBr(
      draft.supplierName.trim() || 'Origem não identificada',
    );
    const title = buildMeaningfulFinancialEntryTitle({
      title: normalizeCommonBusinessTermsPtBr(draft.title.trim()),
      counterparty,
      timing: entryTiming,
      date,
    });
    const accountId = item.draftEdits.financeAccountId
      || financeAccounts.find((account) => account.padrao)?.id
      || (financeAccounts.length === 1 ? financeAccounts[0]?.id : '');
    if (entryTiming === 'REALIZADA' && !accountId) {
      throw new Error('Selecione em qual conta financeira o dinheiro entrou.');
    }

    return {
      ...draft,
      title,
      supplierName: counterparty,
      originalAmount: Number(originalAmount.toFixed(2)),
      dueDate: date,
      paymentMethod: normalizePaymentMethod(draft.paymentMethod),
      entryCategoryId,
      entryTiming,
      entryOrigin,
      accountId,
    };
  }

  function normalizeDraftForCreate(draft: ImportDraft): ImportDraft {
    const fallbackCategory = payableCategories.find((category) => category.isActive) ?? payableCategories[0];
    if (!fallbackCategory) {
      throw new Error('Nenhuma categoria de contas a pagar está disponível para salvar esta conta.');
    }

    const originalAmount = Number(draft.originalAmount);
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new Error('A IA não identificou um valor válido. Expanda o arquivo, corrija o valor e tente criar novamente.');
    }

    const dueDate = isValidISODate(draft.dueDate)
      ? draft.dueDate
      : todayLocalISODate();
    const issueDate = isValidISODate(draft.issueDate) ? draft.issueDate : undefined;
    const categoryId = payableCategories.some((category) => category.id === draft.categoryId)
      ? draft.categoryId
      : fallbackCategory.id;
    const totalInstallments = Number(draft.totalInstallments);
    const recurrenceIndex = Number(draft.recurrenceIndex);

    const supplierName = normalizeCommonBusinessTermsPtBr(draft.supplierName.trim() || 'Fornecedor não identificado');
    const title = normalizeCommonBusinessTermsPtBr(buildMeaningfulPayableTitle({
      title: draft.title,
      supplierName,
      docNumber: draft.docNumber,
      dueDate,
      recurrenceIndex: Number.isInteger(recurrenceIndex) && recurrenceIndex > 0 ? recurrenceIndex : undefined,
      totalInstallments: Number.isInteger(totalInstallments) && totalInstallments > 1 ? totalInstallments : undefined,
    }));

    return {
      ...draft,
      supplierName,
      categoryId,
      dueDate,
      issueDate,
      originalAmount: Number(originalAmount.toFixed(2)),
      paymentMethod: normalizePaymentMethod(draft.paymentMethod),
      recurrence: normalizeRecurrence(draft.recurrence),
      recurrenceIndex: Number.isInteger(recurrenceIndex) && recurrenceIndex > 0 ? recurrenceIndex : undefined,
      totalInstallments: Number.isInteger(totalInstallments) && totalInstallments > 1 ? totalInstallments : undefined,
      title,
      suggestedStatus: draft.suggestedStatus === 'PAGO' || draft.suggestedStatus === 'AGENDADO' || draft.suggestedStatus === 'PENDENTE'
        ? draft.suggestedStatus
        : 'PENDENTE',
    };
  }

  function markItemForReview(item: ImportFileItem, message?: string) {
    updateItem(item.id, {
      status: 'review',
      progress: 100,
      creating: false,
      expanded: true,
      error: message ?? item.error,
    });
  }

  function handleFileSelection(files: FileList | File[] | null, source: ImportSource) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const newItems = selectedFiles.map((file) => buildImportFileItem(file, source));
    setItems((previous) => [...previous, ...newItems]);
    // Não analisa na hora: os arquivos ficam na fila até a usuária clicar "Enviar".
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
    itemsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setItems([]);
  }

  function isInstallmentItem(item: ImportFileItem) {
    const draft = item.analysis?.draft;
    return Boolean(draft?.totalInstallments && draft.totalInstallments > 1);
  }

  function sortInstallmentItems(groupItems: ImportFileItem[]) {
    return [...groupItems].sort((a, b) => {
      const aIndex = a.analysis?.draft.recurrenceIndex ?? Number.MAX_SAFE_INTEGER;
      const bIndex = b.analysis?.draft.recurrenceIndex ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.id.localeCompare(b.id);
    });
  }

  // Retorna os itens RESULTANTES da análise (1 conta = 1 item; várias contas =
  // N itens). Devolver a lista evita ler estado desatualizado logo após setState.
  async function analyzeItem(item: ImportFileItem, expectedAccountCount?: number): Promise<ImportFileItem[]> {
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
          entryCategories: entryCategories.filter((category) => category.ativa).map((category) => ({ id: category.id, name: category.nome })),
          expectedAccountCount,
        }) as AnalysisResult;
        updateItem(item.id, { progress: 88 });
      }

      // A IA pode detectar várias contas (PDF com 4 boletos) ou várias parcelas
      // com datas irregulares. Cada conta/parcela vira um item próprio, reusando
      // toda a revisão/criação. As perguntas (clarifications) ficam no 1º item.
      const drafts = result.drafts && result.drafts.length > 0 ? result.drafts : [result.draft];
      const clarifications = result.clarifications ?? [];

      if (drafts.length <= 1) {
        const updated: ImportFileItem = {
          ...item,
          status: 'success',
          progress: 100,
          analysis: { ...result, draft: drafts[0], drafts: undefined },
          clarifications,
          error: undefined,
          expanded: false,
        };
        setItems((previous) => previous.map((candidate) => candidate.id === item.id ? updated : candidate));
        return [updated];
      }

      // Múltiplas contas → expande este item em N itens single-draft.
      const groupId = item.groupId ?? item.id;
      const expandedItems: ImportFileItem[] = drafts.map((d, index) => ({
        ...item,
        id: index === 0 ? item.id : `${groupId}::acc-${index}-${crypto.randomUUID?.() ?? Date.now()}`,
        groupId,
        status: 'success',
        progress: 100,
        analysis: { draft: d, fields: result.fields, warnings: result.warnings, highlights: result.highlights },
        clarifications: index === 0 ? clarifications : [],
        error: undefined,
        expanded: false,
        draftEdits: {},
        creating: false,
        createdPayableId: undefined,
        createdPayable: undefined,
        duplicatePayableId: undefined,
        duplicateFinancialEntry: undefined,
        operationKey: index === 0
          ? item.operationKey
          : crypto.randomUUID?.() ?? `${Date.now()}-${index}-${Math.random()}`,
      }));

      setItems((previous) => {
        const idx = previous.findIndex((candidate) => candidate.id === item.id);
        if (idx === -1) return [...previous, ...expandedItems];
        const next = [...previous];
        next.splice(idx, 1, ...expandedItems);
        return next;
      });
      return expandedItems;
    } catch (error) {
      updateItem(item.id, {
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao analisar documento.',
        expanded: true,
      });
      return [];
    }
  }

  // Cria automaticamente UMA conta "limpa" e remove da lista.
  // Comprovante (PAGO), incerto, conta parecida ou erro NÃO são criados — ficam na lista.
  async function autoCreateItem(
    item: ImportFileItem,
    options: { recurrenceParentId?: string; existingPayables?: AccountPayable[] } = {},
  ): Promise<AutoCreateItemResult> {
    if (!item.analysis) return { created: false };
    const merged = mergeDraftEdits(item);
    if (!merged) return { created: false };
    // Entradas sempre passam pela revisão humana: conta financeira, categoria e
    // possível vínculo com O.S. não podem ser decididos só pelo documento.
    if (getDirection(merged) !== 'SAIDA') {
      markItemForReview(item);
      return { created: false };
    }
    if (merged.suggestedStatus === 'PAGO' || merged.suggestedStatus === 'INCERTO') {
      markItemForReview(item);
      return { created: false };
    }

    let normalized: ImportDraft;
    try {
      normalized = normalizeDraftForCreate(merged);
    } catch (error) {
      markItemForReview(item, error instanceof Error ? error.message : 'Revise os dados antes de criar a conta.');
      return { created: false };
    }
    const match = classifyPayableMatch(
      {
        supplierName: normalized.supplierName,
        supplierId: undefined,
        docNumber: normalized.docNumber,
        originalAmount: normalized.originalAmount,
        dueDate: normalized.dueDate,
        recurrence: normalized.recurrence,
        recurrenceIndex: normalized.recurrenceIndex,
        totalInstallments: normalized.totalInstallments,
        recurrenceParentId: options.recurrenceParentId,
      },
      [...payables, ...(options.existingPayables ?? [])],
    );
    if (match.kind === 'duplicidade_provavel' || match.kind === 'revisar') {
      const matchedTitle = match.match?.title ?? 'conta existente';
      updateItem(item.id, {
        status: 'review',
        expanded: true,
        duplicatePayableId: match.match?.id,
        error: `Encontrei uma conta parecida: ${matchedTitle}. ${match.reasons.join(', ')}. Confirme se é parcela, recorrência ou cobrança separada antes de salvar.`,
      });
      return { created: false };
    }

    updateItem(item.id, { creating: true });
    try {
      const { payable } = await createPayableFromAnalysis(item, { ...item.analysis, draft: merged }, {
        recurrenceParentId: options.recurrenceParentId,
      });
      removeItem(item.id);
      return { created: true, payable };
    } catch (error) {
      updateItem(item.id, { creating: false, status: 'error', progress: 0, expanded: true, error: error instanceof Error ? error.message : 'Não foi possível criar a conta.' });
      return { created: false };
    }
  }

  // Auto-cria as contas limpas da leva; grupos com pergunta pendente são pulados
  // (espera a usuária responder antes de criar).
  async function autoCreateProduced(produced: ImportFileItem[]): Promise<AutoCreateBatchResult> {
    const groupsWithQuestion = new Set(
      produced.filter((i) => (i.clarifications?.length ?? 0) > 0).map((i) => i.groupId ?? i.id),
    );
    const groups = new Map<string, ImportFileItem[]>();
    produced.forEach((item) => {
      const key = item.groupId ?? item.id;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

    let created = 0;
    let reviewed = 0;
    const createdInBatch: AccountPayable[] = [];

    for (const [groupId, groupItems] of groups) {
      if (groupsWithQuestion.has(groupId)) {
        groupItems.forEach((item) => markItemForReview(item));
        reviewed += groupItems.length;
        continue;
      }

      const hasInstallmentSeries = groupItems.some(isInstallmentItem);
      if (!hasInstallmentSeries) {
        for (const item of groupItems) {
          const result = await autoCreateItem(item, { existingPayables: createdInBatch });
          if (result.created && result.payable) {
            created += 1;
            createdInBatch.push(result.payable);
          } else {
            reviewed += 1;
          }
        }
        continue;
      }

      let recurrenceParentId: string | undefined;
      for (const item of sortInstallmentItems(groupItems)) {
        const result = await autoCreateItem(item, { recurrenceParentId, existingPayables: createdInBatch });
        if (result.created && result.payable) {
          created += 1;
          createdInBatch.push(result.payable);
          recurrenceParentId ??= result.payable.id;
        } else {
          reviewed += 1;
        }
      }
    }

    return { created, reviewed };
  }

  // Resposta a uma pergunta da IA (ex.: "são 2 contas"): re-analisa o MESMO
  // arquivo informando a quantidade confirmada e refaz a separação.
  async function reanalyzeWithCount(sourceItem: ImportFileItem, expectedAccountCount: number) {
    const groupId = sourceItem.groupId ?? sourceItem.id;
    const fresh = buildImportFileItem(sourceItem.file, sourceItem.source);
    // Reaproveita o preview já existente para não vazar/duplicar object URL.
    if (fresh.previewUrl && fresh.previewUrl !== sourceItem.previewUrl) URL.revokeObjectURL(fresh.previewUrl);
    fresh.previewUrl = sourceItem.previewUrl;
    fresh.groupId = groupId;
    fresh.operationKey = sourceItem.operationKey;

    setItems((previous) => {
      const idx = previous.findIndex((candidate) => (candidate.groupId ?? candidate.id) === groupId);
      const withoutGroup = previous.filter((candidate) => (candidate.groupId ?? candidate.id) !== groupId);
      const insertAt = idx === -1 ? withoutGroup.length : Math.min(idx, withoutGroup.length);
      const next = [...withoutGroup];
      next.splice(insertAt, 0, fresh);
      return next;
    });

    const produced = await analyzeItem(fresh, expectedAccountCount);
    const result = await autoCreateProduced(produced);
    if (produced.length > 0 && result.created === produced.length && result.reviewed === 0) {
      toast({
        title: `${result.created} conta${result.created === 1 ? '' : 's'} criada${result.created === 1 ? '' : 's'} automaticamente`,
        description: 'Tudo certo! A fila foi concluída.',
      });
      clearItems();
      onOpenChange(false);
    }
  }

  // Clique numa opção de pergunta da IA. Se a opção indicar uma quantidade de
  // contas (valor numérico), re-analisa com essa quantidade; senão, confirma e
  // dispensa a pergunta (a separação atual fica valendo).
  function handleClarify(item: ImportFileItem, value: string) {
    const count = Number(value);
    if (Number.isInteger(count) && count >= 1 && count <= 24) {
      void reanalyzeWithCount(item, count);
      return;
    }

    const [kind, answer] = value.split(':', 2);
    const groupId = item.groupId ?? item.id;
    if (kind === 'direction' && (answer === 'ENTRADA' || answer === 'SAIDA')) {
      setItems((previous) => previous.map((candidate) => (
        (candidate.groupId ?? candidate.id) === groupId
          ? {
              ...candidate,
              status: 'review',
              expanded: true,
              clarifications: (candidate.clarifications ?? []).filter((question) => question.kind !== 'direction'),
              draftEdits: { ...candidate.draftEdits, direction: answer },
            }
          : candidate
      )));
      return;
    }
    if (kind === 'entry_timing' && (answer === 'REALIZADA' || answer === 'PREVISTA')) {
      setItems((previous) => previous.map((candidate) => (
        (candidate.groupId ?? candidate.id) === groupId
          ? {
              ...candidate,
              status: 'review',
              expanded: true,
              clarifications: (candidate.clarifications ?? []).filter((question) => question.kind !== 'entry_timing'),
              draftEdits: { ...candidate.draftEdits, entryTiming: answer },
            }
          : candidate
      )));
      return;
    }
    updateItem(item.id, { clarifications: [], status: 'review', expanded: true });
  }

  async function persistImportedAttachment(item: ImportFileItem, payableId: string, draft: ImportDraft) {
    const type = inferPayableAttachmentType(item.file);
    const displayName = buildImportedPayableAttachmentName({
      title: draft.title,
      supplierName: draft.supplierName,
      dueDate: draft.dueDate,
      originalFilename: item.file.name,
    });
    let url = item.previewUrl ?? `local-upload://${item.file.name}`;

    if (IS_REAL_AUTH) {
      url = await uploadAnexoContaPagar({ contaPagarId: payableId, file: item.file });
      await insertAnexoContaPagar({
        p_fk_contas_pagar: payableId,
        p_tipo: type,
        p_nome_arquivo: displayName,
        p_url: url,
      });
    }

    addPayableAttachment({
      payableId,
      type,
      filename: displayName,
      url,
      createdByUserId: user?.id ?? 'user-2',
    });

    return displayName;
  }

  async function createPayableFromAnalysis(
    item: ImportFileItem,
    analysis: AnalysisResult,
    options: { allowDuplicate?: boolean; recurrenceParentId?: string } = {},
  ) {
    const draft = normalizeDraftForCreate(analysis.draft);
    let payable = item.createdPayable ?? (item.createdPayableId ? payables.find((candidate) => candidate.id === item.createdPayableId) : undefined);

    if (!payable) {
      const match = classifyPayableMatch(
        {
          supplierName: draft.supplierName,
          supplierId: undefined,
          docNumber: draft.docNumber,
          originalAmount: draft.originalAmount,
          dueDate: draft.dueDate,
          recurrence: draft.recurrence,
          recurrenceIndex: draft.recurrenceIndex,
          totalInstallments: draft.totalInstallments,
          recurrenceParentId: options.recurrenceParentId,
        },
        payables,
      );

      if ((match.kind === 'duplicidade_provavel' || match.kind === 'revisar') && !options.allowDuplicate) {
        const matchedTitle = match.match?.title ?? 'conta existente';
        updateItem(item.id, {
          status: 'review',
          progress: 0,
          creating: false,
          error: `Encontramos uma conta parecida: ${matchedTitle}. ${match.reasons.join(', ')}. Confirme se é outra parcela ou cobrança separada antes de salvar.`,
          duplicatePayableId: match.match?.id,
          expanded: true,
        });
        throw new Error(`Encontramos uma conta parecida: ${matchedTitle}. Confirme antes de criar uma conta separada.`);
      }

      const finalAmount = calculatePayableFinalAmount(draft.originalAmount);
      const treatAsPaid = draft.suggestedStatus === 'PAGO';
      const source = item.source === 'camera' ? 'CAMERA_CAPTURE' : 'IA_IMPORT';

      payable = await addPayable({
        title: draft.title,
        supplierName: draft.supplierName,
        categoryId: draft.categoryId,
        docNumber: draft.docNumber,
        issueDate: draft.issueDate,
        dueDate: draft.dueDate,
        originalAmount: draft.originalAmount,
        finalAmount,
        status: treatAsPaid ? 'PAGO' : draft.suggestedStatus === 'AGENDADO' ? 'AGENDADO' : 'PENDENTE',
        paymentMethod: draft.paymentMethod,
        paidWith: treatAsPaid ? draft.paymentMethod : undefined,
        paidAmount: treatAsPaid ? finalAmount : undefined,
        paidAt: treatAsPaid ? new Date().toISOString() : undefined,
        recurrence: draft.recurrence,
        recurrenceParentId: options.recurrenceParentId,
        recurrenceIndex: draft.recurrenceIndex,
        totalInstallments: draft.totalInstallments,
        observations: draft.observations,
        isUrgent: draft.isUrgent,
        entrySource: source,
        paymentExecutionStatus: draft.suggestedStatus === 'AGENDADO' ? 'SCHEDULED' : 'MANUAL',
        createdByUserId: user?.id ?? 'user-2',
      });

      updateItem(item.id, { createdPayableId: payable.id, createdPayable: payable, duplicatePayableId: undefined });
    }

    try {
      const attachmentName = await persistImportedAttachment(item, payable.id, draft);
      addPayableHistoryEntry(
        buildPayableHistoryDescription({
          payableId: payable.id,
          action: 'ATTACHMENT_ADDED',
          userId: user?.id ?? 'user-2',
          extra: { filename: attachmentName },
        }),
      );
    } catch (error) {
      throw new Error(`Conta criada, mas o anexo não foi salvo: ${error instanceof Error ? error.message : 'erro desconhecido no Storage.'}`);
    }

    updateItem(item.id, { status: 'created', progress: 100, creating: false, expanded: false });
    return { payable };
  }

  async function findSimilarFinancialEntry(draft: ReturnType<typeof normalizeEntryDraft>) {
    if (draft.entryTiming === 'PREVISTA') {
      const launches = await getAllFinanceiroLancamentos({
        p_data_inicio: draft.dueDate,
        p_data_fim: draft.dueDate,
        p_modo: 'PREVISTO',
        p_direcao: 'ENTRADA',
      });
      const similar = launches.dados.find((launch) => (
        launch.direcao === 'ENTRADA'
        && launch.vencimento?.slice(0, 10) === draft.dueDate
        && Math.abs(Math.max(launch.aberto, launch.previsto) - draft.originalAmount) < 0.01
      ));
      return similar ? { description: similar.descricao, date: similar.vencimento ?? draft.dueDate } : undefined;
    }
    const movements = await getAllFinanceiroExtrato({
      p_data_inicio: draft.dueDate,
      p_data_fim: draft.dueDate,
    });
    const similar = movements.dados.find((movement) => isSimilarImportedFinancialEntry(movement, {
      value: draft.originalAmount,
      date: draft.dueDate,
    }));
    return similar ? { description: similar.descricao, date: similar.dataEfetiva } : undefined;
  }

  async function persistFinancialEntryAttachment(item: ImportFileItem, movementId: string) {
    const extension = item.file.name.split('.').pop()?.toLowerCase();
    const supported = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(item.file.type)
      || ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '');
    if (!supported || !IS_REAL_AUTH) return false;
    const path = await uploadFinanceiroComprovante({ movimentoId: movementId, file: item.file });
    await insertFinanceiroAnexo({
      movimentoId: movementId,
      nomeArquivo: item.file.name.slice(0, 180),
      caminho: path,
      mimeType: item.file.type || null,
      tamanhoBytes: item.file.size,
    });
    return true;
  }

  async function createFinancialEntryFromAnalysis(item: ImportFileItem, draft: ImportDraft) {
    const normalized = normalizeEntryDraft(item, draft);
    const notes = [
      normalized.observations,
      `Importado com IA a partir de ${item.file.name}.`,
      normalized.directionReason ? `Critério da IA: ${normalized.directionReason}` : null,
    ].filter(Boolean).join(' ');

    if (normalized.entryTiming === 'PREVISTA') {
      await criarRecebivelManual({
        descricao: normalized.title,
        valor: normalized.originalAmount,
        vencimento: normalized.dueDate,
        competencia: `${normalized.dueDate.slice(0, 7)}-01`,
        categoriaId: normalized.entryCategoryId,
        clienteNome: normalized.supplierName === 'Origem não identificada' ? null : normalized.supplierName,
        impactaDre: normalized.entryOrigin === 'MOVIMENTO_MANUAL',
        observacoes: `${notes} Documento usado na análise não fica anexado à previsão; anexe o comprovante quando registrar o recebimento.`,
        idempotencyKey: `ai-recebivel:${item.operationKey}`,
      });
      return { attachmentStored: false };
    }

    const result = await criarMovimentoManual({
      direcao: 'ENTRADA',
      origem: normalized.entryOrigin,
      descricao: normalized.title,
      valor: normalized.originalAmount,
      dataEfetiva: `${normalized.dueDate}T12:00:00-03:00`,
      contaId: normalized.accountId,
      formaPagamento: normalized.paymentMethod,
      categoriaEntradaId: normalized.entryCategoryId,
      impactaDre: normalized.entryOrigin === 'MOVIMENTO_MANUAL',
      observacoes: notes,
      idempotencyKey: `ai-entrada:${item.operationKey}`,
    });
    if (!result.movimentoId) {
      throw new Error('A entrada foi criada, mas o movimento não retornou identificador para anexar o documento. Atualize o extrato antes de tentar novamente.');
    }
    return { attachmentStored: await persistFinancialEntryAttachment(item, result.movimentoId) };
  }

  // Clique em "Enviar e analisar": dispara a análise de TODOS os pendentes de uma vez.
  function handleSubmitAll() {
    const pending = itemsRef.current.filter((candidate) => candidate.status === 'pending');
    if (pending.length === 0) return;
    void analyzeItems(pending);
  }

  async function analyzeItems(targets: ImportFileItem[]) {
    if (targets.length === 0) return;
    const targetIds = new Set(targets.map((item) => item.id));
    const hadOtherItems = itemsRef.current.some((item) => !targetIds.has(item.id));

    // Analisa todos os arquivos EM PARALELO (cada um pode virar várias contas).
    const groups = await Promise.all(targets.map((item) => analyzeItem(item)));
    const produced = groups.flat();
    const failed = targets.length - groups.filter((g) => g.length > 0).length;

    // Cria sozinho as contas limpas (e some da lista); o resto fica para revisão.
    const result = await autoCreateProduced(produced);
    const created = result.created;

    if (!hadOtherItems && failed === 0 && produced.length > 0 && created === produced.length && result.reviewed === 0) {
      toast({
        title: `${created} conta${created === 1 ? '' : 's'} criada${created === 1 ? '' : 's'} automaticamente`,
        description: 'Tudo certo! A importação terminou e a fila foi fechada.',
      });
      clearItems();
      onOpenChange(false);
      return;
    }

    const pending = itemsRef.current.length;

    toast({
      title: created > 0
        ? `${created} conta${created === 1 ? '' : 's'} criada${created === 1 ? '' : 's'} automaticamente`
        : 'Análise pronta para revisão',
      description: pending > 0
        ? `${pending} item${pending === 1 ? '' : 's'} aberto${pending === 1 ? '' : 's'} para confirmar antes de criar${failed > 0 ? ` (${failed} com erro de leitura)` : ''}.`
        : 'Tudo certo! As contas já estão na tela de Contas a Pagar.',
    });
  }

  async function handleCreateItem(itemId: string, options: {
    allowDuplicate?: boolean;
    confirmedReceipt?: boolean;
    confirmedDuplicate?: boolean;
    confirmedEntryDuplicate?: boolean;
  } = {}) {
    const item = itemsRef.current.find((i) => i.id === itemId);
    if (!item || !item.analysis) return;
    const mergedDraft = mergeDraftEdits(item);
    if (!mergedDraft) return;
    const direction = getDirection(mergedDraft);

    if (direction === 'INCERTO') {
      markItemForReview(item, 'Confirme pelos botões se este documento é uma Entrada ou uma Saída.');
      return;
    }

    if (direction === 'ENTRADA') {
      const serviceOrderDecision = item.draftEdits.serviceOrderDecision;
      if (serviceOrderDecision === 'YES') {
        setConfirmation({ itemId, type: 'service-order' });
        return;
      }
      if (!canCreateImportedFinancialEntry({ direction, serviceOrderDecision })) {
        markItemForReview(item, 'Responda se esta entrada já pertence a uma O.S. ou fechamento cadastrado.');
        return;
      }

      let normalized: ReturnType<typeof normalizeEntryDraft>;
      try {
        normalized = normalizeEntryDraft(item, mergedDraft);
      } catch (error) {
        markItemForReview(item, error instanceof Error ? error.message : 'Revise os dados da entrada.');
        return;
      }

      if (!options.confirmedEntryDuplicate) {
        try {
          const similar = await findSimilarFinancialEntry(normalized);
          if (similar) {
            updateItem(item.id, { duplicateFinancialEntry: similar });
            setConfirmation({ itemId, type: 'entry-similar' });
            return;
          }
        } catch (error) {
          markItemForReview(item, `Não consegui conferir possíveis duplicidades antes de gravar: ${error instanceof Error ? error.message : 'erro desconhecido'}.`);
          return;
        }
      }

      updateItem(itemId, { creating: true, error: undefined });
      try {
        const creation = await createFinancialEntryFromAnalysis(item, mergedDraft);
        await queryClient.invalidateQueries({ queryKey: ['financeiro'] });
        toast({
          title: normalized.entryTiming === 'REALIZADA' ? 'Entrada registrada' : 'Entrada prevista criada',
          description: creation.attachmentStored || normalized.entryTiming === 'PREVISTA'
            ? normalized.title
            : `${normalized.title}. O arquivo foi analisado, mas esse formato não aceita anexo financeiro.`,
        });
        removeItem(itemId);
        const hasRemainingOpenItems = itemsRef.current.some((candidate) => candidate.id !== itemId && candidate.status !== 'created');
        if (!hasRemainingOpenItems) onOpenChange(false);
        // A callback do Financeiro troca para a aba Entradas; precisa ser a
        // ultima navegacao para nao ser sobrescrita pelo fechamento do modal.
        onFinancialEntryCreated?.();
      } catch (error) {
        updateItem(itemId, {
          creating: false,
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Não foi possível criar a entrada.',
          expanded: true,
        });
      }
      return;
    }

    if (mergedDraft.suggestedStatus === 'PAGO' && !options.confirmedReceipt) {
      setConfirmation({ itemId, type: 'receipt' });
      return;
    }

    if (options.allowDuplicate && !options.confirmedDuplicate) {
      setConfirmation({ itemId, type: 'similar' });
      return;
    }

    updateItem(itemId, { creating: true });
    try {
      const { payable: created } = await createPayableFromAnalysis(item, { ...item.analysis, draft: mergedDraft }, options);
      toast({
        title: 'Conta criada',
        description: mergedDraft.title,
      });
      removeItem(itemId);
      const hasRemainingOpenItems = itemsRef.current.some((candidate) => candidate.id !== itemId && candidate.status !== 'created');
      if (!hasRemainingOpenItems) {
        onOpenChange(false);
      }
      onCreated?.(created);
    } catch (error) {
      updateItem(itemId, {
        creating: false,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Não foi possível criar a conta.',
        expanded: true,
      });
    }
  }

  async function handleRetryItem(itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const freshItem = {
      ...item,
      analysis: item.createdPayableId ? item.analysis : null,
      status: 'pending' as ImportFileStatus,
      error: undefined,
      duplicatePayableId: undefined,
      duplicateFinancialEntry: undefined,
    };
    updateItem(itemId, freshItem);
    await analyzeItems([freshItem]);
  }

  const confirmationItem = confirmation
    ? items.find((item) => item.id === confirmation.itemId) ?? null
    : null;
  const confirmationDraft = confirmationItem ? mergeDraftEdits(confirmationItem) : null;

  return (
    <>
    <PayableModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Importar com IA"
      description="A IA identifica Entrada ou Saída, preenche os dados e pergunta por botões quando não houver certeza."
      desktopClassName="sm:max-w-4xl"
    >
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0">
          <TabsTrigger value="arquivo" className="rounded-2xl border border-border/60 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-primary/5">Enviar arquivo</TabsTrigger>
          <TabsTrigger value="camera" className="rounded-2xl border border-border/60 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-primary/5">Tirar foto</TabsTrigger>
        </TabsList>

        <TabsContent value="arquivo" className="mt-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp"
            aria-label="Selecionar documentos para análise com IA"
            onChange={(event) => handleFileChange(event, 'arquivo')}
            className="hidden"
          />
          <ImportBody
            items={items.filter((item) => item.source === 'arquivo')}
            isAnalyzing={isAnalyzing}
            payableCategories={payableCategories}
            entryCategories={entryCategories}
            financeAccounts={financeAccounts}
            onSelect={() => fileInputRef.current?.click()}
            onSubmitAll={handleSubmitAll}
            onClarify={handleClarify}
            onCreateItem={(id, options) => void handleCreateItem(id, options)}
            onRetryItem={(id) => void handleRetryItem(id)}
            onEditDraft={(id, edits) => updateItem(id, { draftEdits: { ...items.find((i) => i.id === id)?.draftEdits, ...edits } })}
            onClear={clearItems}
            onRemove={removeItem}
            onToggleExpanded={(id) => updateItem(id, { expanded: !items.find((item) => item.id === id)?.expanded })}
          />
        </TabsContent>

        <TabsContent value="camera" className="mt-0">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Abrir câmera para fotografar comprovante"
            onChange={(event) => handleFileChange(event, 'camera')}
            className="hidden"
          />
          <ImportBody
            items={items.filter((item) => item.source === 'camera')}
            isAnalyzing={isAnalyzing}
            payableCategories={payableCategories}
            entryCategories={entryCategories}
            financeAccounts={financeAccounts}
            cameraMode
            onSelect={() => cameraInputRef.current?.click()}
            onSubmitAll={handleSubmitAll}
            onClarify={handleClarify}
            onCreateItem={(id, options) => void handleCreateItem(id, options)}
            onRetryItem={(id) => void handleRetryItem(id)}
            onEditDraft={(id, edits) => updateItem(id, { draftEdits: { ...items.find((i) => i.id === id)?.draftEdits, ...edits } })}
            onClear={clearItems}
            onRemove={removeItem}
            onToggleExpanded={(id) => updateItem(id, { expanded: !items.find((item) => item.id === id)?.expanded })}
          />
        </TabsContent>
      </Tabs>
    </PayableModalShell>
    <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {confirmation?.type === 'receipt'
              ? 'Criar saída a partir de comprovante?'
              : confirmation?.type === 'entry-similar'
                ? 'Criar uma entrada parecida?'
                : confirmation?.type === 'service-order'
                  ? 'Não duplicar recebimento da O.S.?'
                  : 'Criar conta parecida separada?'}
          </DialogTitle>
          <DialogDescription>
            {confirmation?.type === 'receipt'
              ? 'Este arquivo parece ser comprovante/recibo. O caminho mais seguro é vincular a uma conta existente quando houver uma correspondente.'
              : confirmation?.type === 'entry-similar'
                ? 'Já existe uma entrada com o mesmo valor e a mesma data. Confirme apenas se forem recebimentos realmente distintos.'
                : confirmation?.type === 'service-order'
                  ? 'Recebimentos de O.S. e fechamentos devem ser registrados na própria origem. O importador não criará outra entrada.'
              : 'Já existe uma conta muito parecida. Confirme somente se for outra parcela, outra cobrança ou um lançamento que deve ficar separado.'}
          </DialogDescription>
        </DialogHeader>

        {confirmationDraft ? (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-semibold">{confirmationDraft.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {confirmationDraft.supplierName} • {formatMoney(confirmationDraft.originalAmount)} • {getDirection(confirmationDraft) === 'ENTRADA' ? 'data' : 'vence'} {confirmationDraft.dueDate}
              </p>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {confirmation?.type === 'receipt'
                  ? 'Ação sensível'
                  : confirmation?.type === 'service-order'
                    ? 'Nenhum número será alterado'
                    : 'Lançamento parecido encontrado'}
              </AlertTitle>
              <AlertDescription>
                {confirmation?.type === 'receipt'
                  ? 'Ao confirmar, a conta será criada como paga e o anexo ficará vinculado ao novo lançamento.'
                  : confirmation?.type === 'entry-similar'
                    ? `Entrada existente: ${confirmationItem?.duplicateFinancialEntry?.description ?? 'lançamento'} em ${confirmationItem?.duplicateFinancialEntry?.date?.slice(0, 10) ?? 'data não informada'}.`
                    : confirmation?.type === 'service-order'
                      ? 'O arquivo sairá desta fila e você poderá registrar o recebimento dentro da O.S. ou do fechamento correspondente.'
                  : 'O sistema vai manter as duas contas e registrar a criação no histórico do lançamento.'}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmation(null)}>
            {confirmation?.type === 'receipt' ? 'Não, voltar' : 'Voltar e revisar'}
          </Button>
          <Button
            variant={confirmation?.type === 'receipt' || confirmation?.type === 'service-order' ? 'default' : 'destructive'}
            onClick={() => {
              if (!confirmation) return;
              const current = confirmation;
              setConfirmation(null);
              if (current.type === 'service-order') {
                removeItem(current.itemId);
                toast({
                  title: 'Entrada não duplicada',
                  description: 'Nada foi lançado. Registre o recebimento na O.S. ou no fechamento correspondente.',
                });
                return;
              }
              void handleCreateItem(current.itemId, current.type === 'receipt'
                ? { confirmedReceipt: true }
                : current.type === 'entry-similar'
                  ? { confirmedEntryDuplicate: true }
                  : { allowDuplicate: true, confirmedDuplicate: true, confirmedReceipt: true });
            }}
          >
            {confirmation?.type === 'receipt'
              ? 'Sim, criar mesmo assim'
              : confirmation?.type === 'entry-similar'
                ? 'Sim, são entradas diferentes'
                : confirmation?.type === 'service-order'
                  ? 'Certo, não lançar aqui'
                  : 'Sim, criar separada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

type ImportBodyProps = {
  items: ImportFileItem[];
  isAnalyzing: boolean;
  payableCategories: Array<{ id: string; name: string }>;
  entryCategories: CategoriaEntrada[];
  financeAccounts: FinanceiroConta[];
  cameraMode?: boolean;
  onSelect: () => void;
  onSubmitAll: () => void;
  onClarify: (item: ImportFileItem, value: string) => void;
  onCreateItem: (id: string, options?: { allowDuplicate?: boolean; confirmedReceipt?: boolean; confirmedDuplicate?: boolean; confirmedEntryDuplicate?: boolean }) => void;
  onRetryItem: (id: string) => void;
  onEditDraft: (id: string, edits: ImportDraftEdits) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  onToggleExpanded: (id: string) => void;
};

function ImportBody({
  items,
  isAnalyzing,
  payableCategories,
  entryCategories,
  financeAccounts,
  cameraMode = false,
  onSelect,
  onSubmitAll,
  onClarify,
  onCreateItem,
  onRetryItem,
  onEditDraft,
  onClear,
  onRemove,
  onToggleExpanded,
}: ImportBodyProps) {
  const createdCount = items.filter((item) => item.status === 'created').length;
  const reviewCount = items.filter((item) => item.status === 'review' || item.status === 'error').length;
  const processingCount = items.filter((item) => item.status === 'analyzing' || item.creating).length;
  const pendingCount = items.filter((item) => item.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
        <button
          type="button"
          onClick={onSelect}
          aria-label={cameraMode ? 'Tirar foto para importar lançamento' : 'Selecionar arquivos para importar lançamentos'}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-background px-4 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            {cameraMode ? <Camera className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{cameraMode ? 'Tirar foto' : 'Selecionar arquivos'}</p>
            <p className="text-xs text-muted-foreground">
              {cameraMode ? 'Use a câmera do celular para uma entrada ou saída.' : 'PDF, imagem, DOC ou DOCX. Pode selecionar vários de uma vez.'}
            </p>
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Fila de importação</p>
          <p className="text-xs text-muted-foreground">
            {items.length === 0
              ? 'Nenhum arquivo selecionado.'
              : `${items.length} arquivo${items.length === 1 ? '' : 's'} • ${processingCount} processando • ${createdCount} criado${createdCount === 1 ? '' : 's'} • ${reviewCount} pendência${reviewCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {pendingCount > 0 ? (
            <Button onClick={onSubmitAll} disabled={isAnalyzing} className="gap-2 sm:w-auto">
              {isAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isAnalyzing ? 'Analisando...' : `Enviar e analisar (${pendingCount})`}
            </Button>
          ) : null}
          <Button variant={pendingCount > 0 ? 'outline' : 'default'} onClick={onSelect} disabled={isAnalyzing} className="gap-2 sm:w-auto">
            {cameraMode ? <Camera className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            {cameraMode ? 'Tirar outra foto' : 'Adicionar arquivos'}
          </Button>
          {items.length > 0 ? (
            <Button variant="ghost" onClick={onClear} disabled={isAnalyzing} className="sm:w-auto">
              Limpar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
              <FileScan className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium">Selecione um documento para começar</p>
              <p className="mt-1 text-xs text-muted-foreground">A fila mostra o status de cada arquivo.</p>
            </div>
          ) : null}

          {items.map((item) => {
            const effectiveDraft = item.analysis ? {
              ...item.analysis.draft,
              title: item.draftEdits.title ?? item.analysis.draft.title,
              supplierName: item.draftEdits.supplierName ?? item.analysis.draft.supplierName,
              dueDate: item.draftEdits.dueDate ?? item.analysis.draft.dueDate,
              categoryId: item.draftEdits.categoryId ?? item.analysis.draft.categoryId,
              paymentMethod: item.draftEdits.paymentMethod ?? item.analysis.draft.paymentMethod,
              direction: item.draftEdits.direction ?? item.analysis.draft.direction ?? 'INCERTO',
              entryCategoryId: item.draftEdits.entryCategoryId ?? item.analysis.draft.entryCategoryId,
              entryTiming: item.draftEdits.entryTiming ?? item.analysis.draft.entryTiming ?? 'INCERTO',
              entryOrigin: item.draftEdits.entryOrigin ?? item.analysis.draft.entryOrigin ?? 'MOVIMENTO_MANUAL',
            } : null;
            return (
              <ImportFileCard
                key={item.id}
                item={item}
                effectiveDraft={effectiveDraft}
                categoryName={effectiveDraft ? payableCategories.find((c) => c.id === effectiveDraft.categoryId)?.name ?? 'Categoria sugerida' : null}
                payableCategories={payableCategories}
                entryCategories={entryCategories}
                financeAccounts={financeAccounts}
                onClarify={onClarify}
                onRemove={onRemove}
                onToggleExpanded={onToggleExpanded}
                onCreateItem={onCreateItem}
                onRetryItem={onRetryItem}
                onEditDraft={onEditDraft}
              />
            );
          })}
      </div>
    </div>
  );
}

type ImportFileCardProps = {
  item: ImportFileItem;
  effectiveDraft: ImportDraft | null;
  categoryName: string | null;
  payableCategories: Array<{ id: string; name: string }>;
  entryCategories: CategoriaEntrada[];
  financeAccounts: FinanceiroConta[];
  onClarify: (item: ImportFileItem, value: string) => void;
  onRemove: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onCreateItem: (id: string, options?: { allowDuplicate?: boolean; confirmedReceipt?: boolean; confirmedDuplicate?: boolean; confirmedEntryDuplicate?: boolean }) => void;
  onRetryItem: (id: string) => void;
  onEditDraft: (id: string, edits: ImportDraftEdits) => void;
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
  if (status === 'success') return <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3" /> Analisada</Badge>;
  if (status === 'review') return <Badge className="gap-1 border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100"><AlertTriangle className="h-3 w-3" /> Revisar</Badge>;
  if (status === 'created') return <Badge className="gap-1 bg-primary text-primary-foreground"><CheckCircle2 className="h-3 w-3" /> Criado</Badge>;
  if (status === 'error') return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Erro</Badge>;
  if (status === 'analyzing') return <Badge variant="secondary" className="gap-1"><LoaderCircle className="h-3 w-3 animate-spin" /> Analisando</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function DirectionBadge({ direction }: { direction: FinancialDirection }) {
  if (direction === 'ENTRADA') {
    return <Badge className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><ArrowDownLeft className="h-3 w-3" /> Entrada</Badge>;
  }
  if (direction === 'SAIDA') {
    return <Badge className="gap-1 border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-50"><ArrowUpRight className="h-3 w-3" /> Saída</Badge>;
  }
  return <Badge className="gap-1 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50"><AlertTriangle className="h-3 w-3" /> Entrada ou saída?</Badge>;
}

const ANALYZING_MESSAGES = [
  'Lendo o documento…',
  'Identificando o fornecedor…',
  'Conferindo valores e vencimentos…',
  'Procurando parcelas e várias contas…',
  'Organizando tudo pra você…',
];

function AnalyzingAnimation({ progress }: { progress: number }) {
  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setMsgIndex((index) => (index + 1) % ANALYZING_MESSAGES.length);
    }, 1400);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mt-3 space-y-3 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-3">
      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/25" />
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4 animate-pulse" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            <span key={msgIndex} className="inline-block animate-in fade-in slide-in-from-bottom-1 duration-300">
              {ANALYZING_MESSAGES[msgIndex]}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">IA trabalhando — pode levar alguns segundos.</p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-primary">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
}

function ImportFileCard({
  item,
  effectiveDraft,
  categoryName,
  payableCategories,
  entryCategories,
  financeAccounts,
  onClarify,
  onRemove,
  onToggleExpanded,
  onCreateItem,
  onRetryItem,
  onEditDraft,
}: ImportFileCardProps) {
  const kind = getFileKind(item.file);
  const fieldPrefix = `payable-import-${item.id}`;
  const clarifications = item.clarifications ?? [];
  const needsManualCorrection = item.status === 'error' || Boolean(item.error);
  const needsReview = item.status === 'review';
  const direction: FinancialDirection = effectiveDraft?.direction === 'ENTRADA' || effectiveDraft?.direction === 'SAIDA'
    ? effectiveDraft.direction
    : 'INCERTO';
  const isEntry = direction === 'ENTRADA';
  const financialAttachmentExtension = item.file.name.split('.').pop()?.toLowerCase();
  const supportsFinancialAttachment = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(item.file.type)
    || ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(financialAttachmentExtension ?? '');

  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border transition-colors',
      needsManualCorrection
        ? 'border-destructive/50 bg-destructive/5 shadow-sm shadow-destructive/10'
        : needsReview
          ? 'border-amber-300 bg-amber-50/50'
          : 'border-border/60 bg-background',
    )}>
      {clarifications.length > 0 && (
        <div className="space-y-3 border-b border-amber-200 bg-amber-50/70 p-4">
          {clarifications.map((clarification) => (
            <div key={clarification.id} className="space-y-2">
              <p className="text-sm font-semibold text-amber-900">{clarification.question}</p>
              <div className="flex flex-wrap gap-2">
                {clarification.options.map((option) => (
                  <Button
                    key={`${clarification.id}-${option.value}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                    onClick={() => onClarify(item, option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start gap-3 p-4">
        <FileTileIcon file={item.file} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.file.name}</p>
              <p className="text-xs text-muted-foreground">{kind.label} • {formatBytes(item.file.size)} • {item.file.type || 'Tipo não informado'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.analysis ? <DirectionBadge direction={direction} /> : null}
              <StatusBadge status={item.status} />
              {item.status !== 'created' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={item.expanded ? `Recolher detalhes de ${item.file.name}` : `Expandir detalhes de ${item.file.name}`}
                  onClick={() => onToggleExpanded(item.id)}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${item.expanded ? 'rotate-180' : ''}`} />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${item.file.name} da fila`}
                onClick={() => onRemove(item.id)}
                disabled={item.status === 'analyzing' || item.creating}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {item.status === 'analyzing' ? (
            <AnalyzingAnimation progress={item.progress} />
          ) : null}

          {item.status === 'error' && !item.expanded ? (
            <p className="mt-2 truncate text-xs text-destructive">{item.error}</p>
          ) : null}
        </div>
      </div>

      {item.expanded ? (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {item.status === 'review' && item.analysis && !item.error ? (
            <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertTitle>Revise antes de criar</AlertTitle>
              <AlertDescription>
                A análise terminou, mas o lançamento ainda não foi cadastrado. Confira a direção, os campos e confirme.
              </AlertDescription>
            </Alert>
          ) : null}

          {item.error ? (
            <Alert variant="destructive">
              {item.duplicatePayableId ? <AlertTriangle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <AlertTitle>{item.duplicatePayableId ? 'Conta parecida para revisar' : 'Este arquivo precisa de revisão'}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{item.error}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => onRetryItem(item.id)}
                    disabled={item.creating || item.status === 'analyzing'}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                  {item.duplicatePayableId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => onCreateItem(item.id, { allowDuplicate: true })}
                      disabled={item.creating || item.status === 'analyzing'}
                    >
                      Criar conta separada
                    </Button>
                  ) : null}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {item.previewUrl && isPayableImageFile(item.file) ? (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-background">
              <img src={item.previewUrl} alt={item.file.name} className="max-h-[260px] w-full object-contain" />
            </div>
          ) : null}

          {item.analysis ? (
            <>
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

              {item.analysis.warnings.length > 0 ? (
                <Alert>
                  <AlertTitle className="text-sm">Atenção</AlertTitle>
                  <AlertDescription className="mt-1 space-y-1">
                    {item.analysis.warnings.map((w, i) => <p key={i} className="text-xs">{w}</p>)}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-4 rounded-2xl border border-primary/20 bg-background p-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold">É Entrada ou Saída?</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant={direction === 'ENTRADA' ? 'default' : 'outline'}
                      className={cn('justify-start gap-2', direction === 'ENTRADA' && 'bg-emerald-700 hover:bg-emerald-800')}
                      onClick={() => onEditDraft(item.id, { direction: 'ENTRADA' })}
                    >
                      <ArrowDownLeft className="h-4 w-4" /> Entrada — dinheiro entra
                    </Button>
                    <Button
                      type="button"
                      variant={direction === 'SAIDA' ? 'default' : 'outline'}
                      className={cn('justify-start gap-2', direction === 'SAIDA' && 'bg-rose-700 hover:bg-rose-800')}
                      onClick={() => onEditDraft(item.id, { direction: 'SAIDA' })}
                    >
                      <ArrowUpRight className="h-4 w-4" /> Saída — dinheiro sai
                    </Button>
                  </div>
                  {effectiveDraft?.directionReason ? (
                    <p className="text-xs text-muted-foreground">
                      IA: {effectiveDraft.directionReason} ({Math.round(effectiveDraft.directionConfidence ?? 0)}% de confiança na direção)
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3 border-t border-border/50 pt-4 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor={`${fieldPrefix}-title`} className="text-xs font-medium text-muted-foreground">Nome do lançamento</label>
                    <input
                      id={`${fieldPrefix}-title`}
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={item.draftEdits.title ?? item.analysis.draft.title}
                      onChange={(e) => onEditDraft(item.id, { title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${fieldPrefix}-supplier`} className="text-xs font-medium text-muted-foreground">{isEntry ? 'Cliente / origem do dinheiro' : 'Fornecedor / favorecido'}</label>
                    <input
                      id={`${fieldPrefix}-supplier`}
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={item.draftEdits.supplierName ?? item.analysis.draft.supplierName}
                      onChange={(e) => onEditDraft(item.id, { supplierName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${fieldPrefix}-amount`} className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
                    <input
                      id={`${fieldPrefix}-amount`}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={item.draftEdits.originalAmount ?? item.analysis.draft.originalAmount.toFixed(2).replace('.', ',')}
                      onChange={(e) => onEditDraft(item.id, { originalAmount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${fieldPrefix}-due-date`} className="text-xs font-medium text-muted-foreground">{isEntry ? 'Data da entrada / previsão' : 'Vencimento'}</label>
                    <input
                      id={`${fieldPrefix}-due-date`}
                      type="date"
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={item.draftEdits.dueDate ?? item.analysis.draft.dueDate}
                      onChange={(e) => onEditDraft(item.id, { dueDate: e.target.value })}
                    />
                  </div>

                  {isEntry ? (
                    <>
                      <div className="space-y-1">
                        <label htmlFor={`${fieldPrefix}-entry-category`} className="text-xs font-medium text-muted-foreground">Categoria de entrada</label>
                        <select
                          id={`${fieldPrefix}-entry-category`}
                          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={item.draftEdits.entryCategoryId ?? item.analysis.draft.entryCategoryId ?? entryCategories.find((c) => c.ativa)?.id ?? ''}
                          onChange={(e) => onEditDraft(item.id, { entryCategoryId: e.target.value })}
                        >
                          {entryCategories.filter((c) => c.ativa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`${fieldPrefix}-entry-timing`} className="text-xs font-medium text-muted-foreground">Situação</label>
                        <select
                          id={`${fieldPrefix}-entry-timing`}
                          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={item.draftEdits.entryTiming ?? item.analysis.draft.entryTiming ?? 'INCERTO'}
                          onChange={(e) => onEditDraft(item.id, { entryTiming: e.target.value as EntryTiming })}
                        >
                          <option value="INCERTO">Confirmar se já entrou</option>
                          <option value="REALIZADA">Já entrou na conta</option>
                          <option value="PREVISTA">Ainda vai entrar</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`${fieldPrefix}-entry-origin`} className="text-xs font-medium text-muted-foreground">Tipo de entrada</label>
                        <select
                          id={`${fieldPrefix}-entry-origin`}
                          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={item.draftEdits.entryOrigin ?? item.analysis.draft.entryOrigin ?? 'MOVIMENTO_MANUAL'}
                          onChange={(e) => onEditDraft(item.id, { entryOrigin: e.target.value as EntryOrigin })}
                        >
                          <option value="MOVIMENTO_MANUAL">Receita / recebimento</option>
                          <option value="APORTE">Aporte do dono ou sócio</option>
                          <option value="REEMBOLSO">Reembolso recebido</option>
                          <option value="AJUSTE">Ajuste financeiro</option>
                        </select>
                      </div>
                      {(item.draftEdits.entryTiming ?? item.analysis.draft.entryTiming) === 'REALIZADA' ? (
                        <div className="space-y-1">
                          <label htmlFor={`${fieldPrefix}-finance-account`} className="text-xs font-medium text-muted-foreground">Conta em que o dinheiro entrou</label>
                          <select
                            id={`${fieldPrefix}-finance-account`}
                            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={item.draftEdits.financeAccountId ?? financeAccounts.find((account) => account.padrao)?.id ?? (financeAccounts.length === 1 ? financeAccounts[0]?.id : '') ?? ''}
                            onChange={(e) => onEditDraft(item.id, { financeAccountId: e.target.value })}
                          >
                            <option value="">Selecione a conta</option>
                            {financeAccounts.filter((account) => account.ativa).map((account) => <option key={account.id} value={account.id}>{account.nome}</option>)}
                          </select>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="space-y-1">
                      <label htmlFor={`${fieldPrefix}-category`} className="text-xs font-medium text-muted-foreground">Categoria de saída</label>
                      <select
                        id={`${fieldPrefix}-category`}
                        className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        value={item.draftEdits.categoryId ?? item.analysis.draft.categoryId}
                        onChange={(e) => onEditDraft(item.id, { categoryId: e.target.value })}
                      >
                        {payableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label htmlFor={`${fieldPrefix}-payment-method`} className="text-xs font-medium text-muted-foreground">Forma de pagamento</label>
                    <select
                      id={`${fieldPrefix}-payment-method`}
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={item.draftEdits.paymentMethod ?? item.analysis.draft.paymentMethod ?? 'BOLETO'}
                      onChange={(e) => onEditDraft(item.id, { paymentMethod: e.target.value as AccountPayable['paymentMethod'] })}
                    >
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>

                {isEntry ? (
                  <div className={cn(
                    'space-y-2 rounded-xl border p-3',
                    effectiveDraft?.possibleServiceOrder ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50',
                  )}>
                    <p className="text-sm font-semibold">Este valor já pertence a uma O.S. ou fechamento cadastrado?</p>
                    <p className="text-xs text-muted-foreground">
                      {effectiveDraft?.possibleServiceOrder
                        ? `A IA encontrou sinal de serviço/O.S.${effectiveDraft.serviceOrderReference ? ` Referência: ${effectiveDraft.serviceOrderReference}.` : ''} Confirme para não duplicar a entrada.`
                        : 'Se o recebimento veio de uma O.S. ou fechamento, ele deve ser baixado lá e não criado novamente aqui.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['NO', 'Não, criar esta entrada'],
                        ['YES', 'Sim, já está na O.S.'],
                        ['UNKNOWN', 'Não sei'],
                      ] as const).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={item.draftEdits.serviceOrderDecision === value ? 'default' : 'outline'}
                          onClick={() => onEditDraft(item.id, { serviceOrderDecision: value })}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {isEntry && (item.draftEdits.entryTiming ?? item.analysis.draft.entryTiming) === 'PREVISTA' ? (
                  <Alert className="border-sky-200 bg-sky-50">
                    <AlertTitle>Entrada prevista</AlertTitle>
                    <AlertDescription>O valor ficará em A receber. O documento será usado na análise, mas o comprovante só poderá ser anexado quando o recebimento for registrado.</AlertDescription>
                  </Alert>
                ) : null}

                {isEntry && !supportsFinancialAttachment ? (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTitle>Formato sem anexo financeiro</AlertTitle>
                    <AlertDescription>DOC e DOCX podem ser analisados pela IA, mas o comprovante financeiro privado aceita PDF ou imagem. O lançamento poderá ser criado sem anexar este arquivo.</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Tipo:</span> {direction === 'ENTRADA' ? 'Entrada' : direction === 'SAIDA' ? 'Saída' : 'Confirmar'} &nbsp;•&nbsp;
                    <span className="font-medium text-foreground">Categoria:</span>{' '}
                    {isEntry
                      ? entryCategories.find((c) => c.id === (item.draftEdits.entryCategoryId ?? effectiveDraft?.entryCategoryId))?.nome ?? 'Confirmar'
                      : categoryName}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onCreateItem(item.id)}
                    disabled={item.creating || direction === 'INCERTO' || (isEntry && (!item.draftEdits.serviceOrderDecision || item.draftEdits.serviceOrderDecision === 'UNKNOWN'))}
                    className="shrink-0 gap-1.5 sm:w-auto"
                  >
                    {item.creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {isEntry && item.draftEdits.serviceOrderDecision === 'YES' ? 'Não lançar novamente' : 'Confirmar e criar'}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
