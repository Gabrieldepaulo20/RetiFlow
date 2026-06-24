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

function appendHighlight(list: PayableBriefingHighlight[], item: PayableBriefingHighlight) {
  if (list.length < 2) list.push(item);
}

function shortName(value?: string | null): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'uma conta';
  return clean.length > 34 ? `${clean.slice(0, 31).trim()}...` : clean;
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
  const today = summary.runway[0];
  const topAnomaly = anomalies[0];

  if (summary.overdueCount > 0) {
    appendHighlight(highlights, { kind: 'atraso', text: `${summary.overdueCount} ${plural(summary.overdueCount, 'vencida', 'vencidas')}` });
    appendHighlight(highlights, { kind: 'atraso', text: `${fmtBRL(summary.overdueTotal)} em atraso` });
    return {
      source: 'auto',
      headline: 'Resolver atrasos primeiro',
      body: `Tem ${fmtBRL(summary.overdueTotal)} em atraso. Vale pagar ou remarcar antes de olhar o restante.`,
      highlights,
    };
  }

  if (today && today.count > 0) {
    appendHighlight(highlights, { kind: 'saida', text: `${fmtBRL(today.total)} hoje` });
    if (summary.nextSevenCount > today.count) appendHighlight(highlights, { kind: 'saida', text: `${summary.nextSevenCount} nos 7 dias` });
    return {
      source: 'auto',
      headline: 'Pagar o que vence hoje',
      body: `Hoje vence ${fmtBRL(today.total)}. Depois disso, acompanhe o restante da semana com calma.`,
      highlights,
    };
  }

  if (topAnomaly) {
    appendHighlight(highlights, { kind: 'anomalia', text: topAnomaly.badge });
    if (summary.nextSevenCount > 0) appendHighlight(highlights, { kind: 'saida', text: `${fmtBRL(summary.nextSevenTotal)} em 7 dias` });
    return {
      source: 'auto',
      headline: 'Conferir valor diferente',
      body: `${shortName(topAnomaly.supplierName ?? topAnomaly.title)} veio fora do padrão. Confira antes de pagar.`,
      highlights,
    };
  }

  if (summary.laborCount > 0) {
    appendHighlight(highlights, { kind: 'folha', text: `Folha ${fmtBRL(summary.laborTotal)}` });
    return {
      source: 'auto',
      headline: 'Folha no radar',
      body: `A folha soma ${fmtBRL(summary.laborTotal)}. Reserve esse valor antes das outras contas.`,
      highlights,
    };
  }

  if (summary.nextSevenCount > 0) {
    appendHighlight(highlights, { kind: 'saida', text: `${fmtBRL(summary.nextSevenTotal)} em 7 dias` });
    return {
      source: 'auto',
      headline: summary.nextSevenCount >= 4 ? 'Semana movimentada' : 'Semana organizada',
      body: `Próximos 7 dias somam ${fmtBRL(summary.nextSevenTotal)}. O fluxo parece controlado.`,
      highlights,
    };
  }

  return {
    source: 'auto',
    headline: 'Tudo tranquilo',
    body: 'Nenhuma conta urgente nos próximos 7 dias.',
    highlights,
  };
}
