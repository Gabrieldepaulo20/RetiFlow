import { callRPC } from './_base';
import { supabase } from '@/lib/supabase';

export interface ContaPagar {
  id_contas_pagar: string;
  titulo: string;
  nome_fornecedor: string | null;
  numero_documento: string | null;
  data_vencimento: string;
  data_emissao: string | null;
  data_competencia: string | null;
  valor_original: number;
  juros: number;
  desconto: number;
  valor_final: number;
  valor_pago: number | null;
  status: 'PENDENTE' | 'PAGO' | 'PARCIAL' | 'CANCELADO' | 'AGENDADO';
  forma_pagamento_prevista: string | null;
  pago_em: string | null;
  pago_com: string | null;
  recorrencia: string;
  indice_recorrencia: number | null;
  total_parcelas: number | null;
  urgente: boolean;
  origem_lancamento: string;
  excluido_em: string | null;
  vencida: boolean;
  created_at: string;
  updated_at: string;
  categoria: { id: string; nome: string; cor: string; icone: string };
  fornecedor: { id: string; nome: string } | null;
}

export interface InsertContaPagarPayload {
  p_titulo: string;
  p_fk_categorias: string;
  p_data_vencimento: string;
  p_valor_original: number;
  p_fk_fornecedores?: string;
  p_nome_fornecedor?: string;
  p_numero_documento?: string;
  p_data_emissao?: string;
  p_juros?: number;
  p_desconto?: number;
  p_forma_pagamento_prevista?: string;
  p_origem_lancamento?: string;
  p_data_competencia?: string;
  p_recorrencia?: string;
  p_fk_conta_pai?: string;
  p_indice_recorrencia?: number;
  p_total_parcelas?: number;
  p_observacoes?: string;
  p_urgente?: boolean;
}

export async function getContasPagar(params?: {
  p_status?: string;
  p_fk_categorias?: string;
  p_fk_fornecedores?: string;
  p_busca?: string;
  p_apenas_urgentes?: boolean;
  p_apenas_vencidas?: boolean;
  p_incluir_excluidas?: boolean;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC<ContaPagar[]>('get_contas_pagar', params);
  return { dados: env.dados ?? [], total: env.total ?? 0 };
}

export interface ContaPagarDetalhes {
  conta: ContaPagar & { observacoes_pagamento?: string | null };
  anexos: Array<{
    id_anexo: string;
    tipo: string;
    nome_arquivo: string;
    url: string;
    created_at: string;
  }>;
  historico: Array<{
    id_historico_conta: string;
    acao: string;
    descricao: string;
    created_at: string;
    usuario?: { nome?: string | null } | null;
  }>;
  parcelas: Array<{
    id_contas_pagar: string;
    titulo: string;
    indice_recorrencia: number | null;
    total_parcelas: number | null;
    data_vencimento: string;
    valor_final: number;
    status: string;
    pago_em: string | null;
  }>;
}

export async function getContaPagarDetalhes(idContasPagar: string): Promise<ContaPagarDetalhes | null> {
  try {
    const env = await callRPC<ContaPagarDetalhes>('get_conta_pagar_detalhes', { p_id_contas_pagar: idContasPagar });
    // RPC legado: em produção já retornou detalhes na raiz em vez de `dados`.
    // O adapter aceita os dois formatos para compatibilidade sem alterar a UI.
    const dados = (env.dados ?? env) as ContaPagarDetalhes;

    if (!dados?.conta) {
      return null;
    }

    return {
      conta: dados.conta,
      anexos: Array.isArray(dados.anexos) ? dados.anexos : [],
      historico: Array.isArray(dados.historico) ? dados.historico : [],
      parcelas: Array.isArray(dados.parcelas) ? dados.parcelas : [],
    };
  } catch {
    return null;
  }
}

export async function insertContaPagar(payload: InsertContaPagarPayload) {
  const env = await callRPC('insert_conta_pagar', payload as unknown as Record<string, unknown>);
  return env.id_contas_pagar as string;
}

export async function updateContaPagar(
  idContasPagar: string,
  dados: Partial<InsertContaPagarPayload>,
) {
  await callRPC('update_conta_pagar', { p_id_contas_pagar: idContasPagar, ...dados });
}

export async function registrarPagamento(params: {
  p_id_contas_pagar: string;
  p_valor_pago: number;
  p_pago_com?: string;
  p_observacoes_pagamento?: string;
}) {
  const env = await callRPC('registrar_pagamento', params);
  return env.novo_status as string;
}

export async function cancelarContaPagar(idContasPagar: string) {
  await callRPC('cancelar_conta_pagar', { p_id_contas_pagar: idContasPagar });
}

export async function excluirContaPagar(idContasPagar: string) {
  await callRPC('excluir_conta_pagar', { p_id_contas_pagar: idContasPagar });
}

export async function insertAnexoContaPagar(params: {
  p_fk_contas_pagar: string;
  p_tipo: string;
  p_nome_arquivo: string;
  p_url: string;
}) {
  const env = await callRPC('insert_anexo_conta_pagar', params);
  return env.id_anexo as string;
}

export async function updateAnexoContaPagarNome(params: {
  p_id_anexo: string;
  p_nome_arquivo: string;
}) {
  await callRPC('update_anexo_conta_pagar_nome', params);
}

const PAYABLE_ATTACHMENTS_BUCKET = import.meta.env.VITE_SUPABASE_PAYABLE_ATTACHMENTS_BUCKET || 'contas-pagar';

function sanitizeStorageName(filename: string) {
  const extension = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
  const basename = filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'anexo';

  return `${basename}${extension.toLowerCase()}`;
}

export async function uploadAnexoContaPagar(params: {
  contaPagarId: string;
  file: File;
}) {
  const safeName = sanitizeStorageName(params.file.name);
  const path = `${params.contaPagarId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(PAYABLE_ATTACHMENTS_BUCKET).upload(path, params.file, {
    contentType: params.file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    throw new Error(`[uploadAnexoContaPagar] ${error.message}`);
  }

  return path;
}

export async function getAnexoContaPagarUrl(pathOrUrl: string) {
  if (!pathOrUrl || pathOrUrl.startsWith('http') || pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('local-upload://')) {
    return pathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from(PAYABLE_ATTACHMENTS_BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error(`[getAnexoContaPagarUrl] ${error?.message ?? 'Não foi possível gerar link seguro do anexo.'}`);
  }

  return data.signedUrl;
}

export type AnalisarContaPagarResultado = {
  draft: {
    title: string;
    supplierName: string;
    categoryId: string;
    dueDate: string;
    issueDate?: string;
    originalAmount: number;
    paymentMethod: string;
    recurrence: string;
    docNumber?: string;
    observations?: string;
    isUrgent: boolean;
    suggestedStatus: 'PAGO' | 'PENDENTE' | 'AGENDADO' | 'INCERTO';
    recurrenceIndex?: number;
    totalInstallments?: number;
  };
  fields: Array<{ label: string; value: string; confidence: number }>;
  warnings: string[];
  highlights: string[];
};

async function getFunctionErrorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : 'Erro ao chamar a função de IA.';
  const context = typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: unknown }).context
    : null;

  if (context instanceof Response) {
    try {
      const text = await context.clone().text();
      const parsed = JSON.parse(text) as { message?: string; error?: string; code?: string };
      message = parsed.message ?? parsed.error ?? message;
      if (parsed.code) message = `${parsed.code}: ${message}`;
    } catch {
      // Mantém a mensagem original do SDK quando o corpo não é JSON.
    }
  }

  if (message.includes('UNAUTHORIZED_LEGACY_JWT') || message.includes('Invalid JWT')) {
    return 'Sessão ou chave Supabase inválida para chamar a IA. Atualize a VITE_SUPABASE_ANON_KEY no Amplify/.env e faça login novamente.';
  }

  return message;
}

export async function analisarContaPagarComIA(params: {
  file: File;
  categories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const body = new FormData();
  body.append('file', params.file);
  body.append('categories', JSON.stringify(params.categories));
  body.append('suppliers', JSON.stringify(params.suppliers));

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente antes de usar a análise com IA.');
  }

  const { data, error } = await supabase.functions.invoke<AnalisarContaPagarResultado>('analisar-conta-pagar', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data) {
    throw new Error('A análise por IA não retornou dados.');
  }

  if ('error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }

  return data;
}
