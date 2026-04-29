import { supabase } from '@/lib/supabase';
import { supabaseToClient, type ClienteListItem } from './clientes';
import { supabaseToIntakeNote, type NotaServico, type NotaServicoDetalhesItem } from './notas';
import type { ContaPagar } from './contas-pagar';
import type { Categoria } from './categorias';
import type {
  AccountPayable,
  Client,
  IntakeNote,
  IntakeService,
  PayableCategory,
  PayableEntrySource,
  PaymentMethod,
  RecurrenceType,
} from '@/types';

export interface DashboardServicoResumoItem extends NotaServicoDetalhesItem {
  note_id: string;
}

export interface DashboardResumo {
  notas: NotaServico[];
  clientes: ClienteListItem[];
  contas: ContaPagar[];
  categorias: Categoria[];
  servicos: DashboardServicoResumoItem[];
  totais?: {
    notas?: number;
    clientes?: number;
    contas?: number;
  };
}

export async function getDashboardResumo(params?: { p_limite?: number }) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente.');
  }

  const { data, error } = await supabase.functions.invoke<{ dados?: DashboardResumo; error?: string }>('dashboard-resumo', {
    body: params ?? {},
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.dados) {
    throw new Error(data?.error ?? error?.message ?? 'Não foi possível carregar o resumo do dashboard.');
  }

  return {
    notas: data.dados.notas ?? [],
    clientes: data.dados.clientes ?? [],
    contas: data.dados.contas ?? [],
    categorias: data.dados.categorias ?? [],
    servicos: data.dados.servicos ?? [],
    totais: data.dados.totais ?? {},
  };
}

function dashboardContaToPayable(row: ContaPagar): AccountPayable {
  return {
    id: row.id_contas_pagar,
    title: row.titulo,
    supplierId: row.fornecedor?.id,
    supplierName: row.nome_fornecedor ?? row.fornecedor?.nome ?? undefined,
    categoryId: row.categoria.id,
    docNumber: row.numero_documento ?? undefined,
    issueDate: row.data_emissao ?? undefined,
    dueDate: row.data_vencimento,
    originalAmount: row.valor_original,
    interest: row.juros > 0 ? row.juros : undefined,
    discount: row.desconto > 0 ? row.desconto : undefined,
    finalAmount: row.valor_final,
    paidAmount: row.valor_pago ?? undefined,
    status: row.status,
    paymentMethod: (row.forma_pagamento_prevista as PaymentMethod) ?? undefined,
    paidAt: row.pago_em ?? undefined,
    paidWith: (row.pago_com as PaymentMethod) ?? undefined,
    recurrence: (row.recorrencia as RecurrenceType) ?? 'NENHUMA',
    recurrenceIndex: row.indice_recorrencia ?? undefined,
    totalInstallments: row.total_parcelas ?? undefined,
    isUrgent: row.urgente,
    deletedAt: row.excluido_em ?? undefined,
    entrySource: (row.origem_lancamento as PayableEntrySource) ?? 'MANUAL',
    competencyDate: row.data_competencia ?? undefined,
    paymentExecutionStatus: 'MANUAL',
    reconciliationStatus: 'PENDENTE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: '',
  };
}

function dashboardCategoriaToPayableCategory(cat: Categoria): PayableCategory {
  return {
    id: cat.id_categorias,
    name: cat.nome,
    color: cat.cor,
    icon: cat.icone,
    isActive: cat.ativo,
    createdAt: cat.created_at,
  };
}

function dashboardServicoToIntakeService(item: DashboardServicoResumoItem): IntakeService {
  return {
    id: item.id_rel,
    noteId: item.note_id,
    name: item.descricao,
    description: item.detalhes ?? '',
    price: item.preco_unitario,
    quantity: item.quantidade,
    subtotal: item.subtotal_item,
  };
}

export interface DashboardDomainData {
  notes: IntakeNote[];
  clients: Client[];
  payables: AccountPayable[];
  payableCategories: PayableCategory[];
  services: IntakeService[];
}

export function dashboardResumoToDomainData(resumo: DashboardResumo): DashboardDomainData {
  return {
    notes: resumo.notas.map(supabaseToIntakeNote),
    clients: resumo.clientes.map(supabaseToClient),
    payables: resumo.contas.map(dashboardContaToPayable),
    payableCategories: resumo.categorias.map(dashboardCategoriaToPayableCategory),
    services: resumo.servicos.map(dashboardServicoToIntakeService),
  };
}
