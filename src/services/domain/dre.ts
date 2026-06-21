import type { AccountPayable, PayableCategoryClass } from '@/types';

/** Somas das saídas por classe contábil (base do DRE). */
export interface DRELineSums {
  custo: number;
  despesa: number;
  imposto: number;
  financeiro: number;
  /** Contas cuja categoria ainda não tem classe — tratadas como despesa, mas expostas. */
  naoClassificado: number;
}

export interface DREResult {
  receitaBruta: number;
  impostos: number;
  receitaLiquida: number;
  custos: number;
  lucroBruto: number;
  /** DESPESA operacional + naoClassificado. */
  despesas: number;
  naoClassificado: number;
  resultadoOperacional: number;
  financeiro: number;
  lucroLiquido: number;
  /** Lucro Bruto / Receita Bruta (%). Null quando não há receita. */
  margemBruta: number | null;
  /** Lucro Líquido / Receita Bruta (%). Null quando não há receita. */
  margemLiquida: number | null;
}

type PayableForDRE = Pick<AccountPayable, 'categoryId' | 'finalAmount' | 'status' | 'deletedAt'>;

/**
 * Soma o valor (finalAmount) das contas por classe contábil da categoria.
 * Ignora canceladas e excluídas. As contas já devem vir filtradas pelo período
 * (competência) desejado — esta função só classifica e soma.
 */
export function sumPayablesByClass(
  payables: PayableForDRE[],
  resolveClasse: (categoryId: string) => PayableCategoryClass | undefined,
): DRELineSums {
  const sums: DRELineSums = { custo: 0, despesa: 0, imposto: 0, financeiro: 0, naoClassificado: 0 };
  for (const payable of payables) {
    if (payable.deletedAt != null || payable.status === 'CANCELADO') continue;
    switch (resolveClasse(payable.categoryId)) {
      case 'CUSTO': sums.custo += payable.finalAmount; break;
      case 'IMPOSTO': sums.imposto += payable.finalAmount; break;
      case 'FINANCEIRO': sums.financeiro += payable.finalAmount; break;
      case 'DESPESA': sums.despesa += payable.finalAmount; break;
      default: sums.naoClassificado += payable.finalAmount; break;
    }
  }
  return sums;
}

/**
 * Monta o DRE (regime de competência):
 *   Receita Bruta − Impostos = Receita Líquida
 *   − Custos (CMV/CSP) = Lucro Bruto
 *   − Despesas = Resultado Operacional
 *   − Financeiro = Lucro Líquido
 * `naoClassificado` é somado às despesas (default conservador) mas exposto para aviso.
 */
export function computeDRE(receitaBruta: number, sums: DRELineSums): DREResult {
  const impostos = sums.imposto;
  const receitaLiquida = receitaBruta - impostos;
  const custos = sums.custo;
  const lucroBruto = receitaLiquida - custos;
  const despesas = sums.despesa + sums.naoClassificado;
  const resultadoOperacional = lucroBruto - despesas;
  const financeiro = sums.financeiro;
  const lucroLiquido = resultadoOperacional - financeiro;
  return {
    receitaBruta,
    impostos,
    receitaLiquida,
    custos,
    lucroBruto,
    despesas,
    naoClassificado: sums.naoClassificado,
    resultadoOperacional,
    financeiro,
    lucroLiquido,
    margemBruta: receitaBruta > 0 ? (lucroBruto / receitaBruta) * 100 : null,
    margemLiquida: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : null,
  };
}
