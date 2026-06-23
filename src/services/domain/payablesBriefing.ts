import type { PayablesCashFlowSummary } from './payablesCashFlow';

/**
 * Briefing da semana de Contas a Pagar.
 *
 * `source: 'auto'` = resumo determinístico calculado no cliente (sempre disponível).
 * `source: 'ia'`   = narrativa gerada pela edge function com OpenAI.
 * A UI deve rotular cada um com clareza — nunca apresentar o automático como IA.
 */
export type PayableBriefingHighlightKind = 'saida' | 'atraso' | 'anomalia' | 'folha';

export type PayableBriefingHighlight = {
  kind: PayableBriefingHighlightKind;
  text: string;
};

export type PayableBriefing = {
  source: 'auto' | 'ia';
  headline: string;
  body: string;
  highlights: PayableBriefingHighlight[];
  generatedAtISO?: string;
};

export type AnomalyDigest = {
  title: string;
  supplierName?: string | null;
  /** Rótulo já formatado, ex.: "+23% vs. média". */
  badge: string;
};

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Monta o briefing determinístico a partir do resumo de fluxo de caixa e das
 * anomalias detectadas. É o estado padrão (e o fallback quando a IA não responde).
 */
export function buildComputedBriefing(input: {
  summary: PayablesCashFlowSummary;
  anomalies?: AnomalyDigest[];
}): PayableBriefing {
  const { summary } = input;
  const anomalies = input.anomalies ?? [];
  const highlights: PayableBriefingHighlight[] = [];
  const sentences: string[] = [];

  if (summary.nextSevenCount > 0) {
    sentences.push(
      `Saem ${fmtBRL(summary.nextSevenTotal)} nos próximos 7 dias em ${summary.nextSevenCount} ${plural(summary.nextSevenCount, 'conta', 'contas')}.`,
    );
    highlights.push({ kind: 'saida', text: `${fmtBRL(summary.nextSevenTotal)} · 7 dias` });
  } else {
    sentences.push('Nenhum vencimento nos próximos 7 dias.');
  }

  if (summary.overdueCount > 0) {
    sentences.push(
      `Há ${summary.overdueCount} ${plural(summary.overdueCount, 'boleto atrasado', 'boletos atrasados')} somando ${fmtBRL(summary.overdueTotal)} — quitar evita juros.`,
    );
    highlights.push({ kind: 'atraso', text: `${summary.overdueCount} ${plural(summary.overdueCount, 'atraso', 'atrasos')}` });
  }

  const topAnomaly = anomalies[0];
  if (topAnomaly) {
    const who = topAnomaly.supplierName ? ` (${topAnomaly.supplierName})` : '';
    sentences.push(`${topAnomaly.title}${who} veio ${topAnomaly.badge} do normal — vale conferir antes de pagar.`);
    highlights.push({ kind: 'anomalia', text: topAnomaly.badge });
  }

  if (summary.laborCount > 0) {
    sentences.push(`Folha de ${fmtBRL(summary.laborTotal)} já está no radar.`);
    highlights.push({ kind: 'folha', text: `Folha ${fmtBRL(summary.laborTotal)}` });
  }

  let headline = 'Tudo sob controle';
  if (summary.overdueCount > 0) headline = 'Atenção: contas vencidas';
  else if (topAnomaly) headline = 'Um valor fugiu do padrão';
  else if (summary.nextSevenCount >= 4) headline = 'Semana movimentada';

  return {
    source: 'auto',
    headline,
    body: sentences.join(' '),
    highlights,
  };
}
