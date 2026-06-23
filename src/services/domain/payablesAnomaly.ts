import type { AccountPayable } from '@/types';

/**
 * Anomalia de valor: uma conta cujo valor destoa do padrão histórico de contas
 * comparáveis (mesmo fornecedor + categoria). Ex.: a conta de energia veio 23%
 * acima da mediana das últimas. Serve para alertar o usuário antes de pagar.
 */
export type PayableAnomaly = {
  payableId: string;
  currentAmount: number;
  /** Mediana das contas comparáveis (referência do "normal"). */
  baseline: number;
  /** Variação fracionária: 0.23 = +23%; valor negativo = abaixo do normal. */
  deltaPct: number;
  /** Quantas contas comparáveis sustentam a baseline. */
  sampleSize: number;
  direction: 'acima' | 'abaixo';
};

type DetectInput = {
  payables: AccountPayable[];
  /** Variação mínima (fração) para sinalizar. Padrão: 0.2 (20%). */
  thresholdPct?: number;
  /** Diferença absoluta mínima em R$ para evitar ruído em contas pequenas. Padrão: 50. */
  minAbsoluteDelta?: number;
  /** Mínimo de contas comparáveis (além da atual) para confiar na baseline. Padrão: 2. */
  minSamples?: number;
};

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparisonKey(payable: AccountPayable): string | null {
  const supplier = normalizeKeyPart(payable.supplierName);
  const category = normalizeKeyPart(payable.categoryId);
  // Precisa de ao menos um eixo de comparação estável.
  if (!supplier && !category) return null;
  return `${supplier}|${category}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Detecta anomalias de valor agrupando por fornecedor+categoria e comparando o
 * valor de cada conta contra a mediana das demais do mesmo grupo.
 */
export function detectPayableAnomalies(input: DetectInput): Map<string, PayableAnomaly> {
  const thresholdPct = input.thresholdPct ?? 0.2;
  const minAbsoluteDelta = input.minAbsoluteDelta ?? 50;
  const minSamples = input.minSamples ?? 2;

  const active = input.payables.filter(
    (p) => p.deletedAt == null && p.status !== 'CANCELADO' && p.finalAmount > 0,
  );

  const groups = new Map<string, AccountPayable[]>();
  for (const payable of active) {
    const key = comparisonKey(payable);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(payable);
    else groups.set(key, [payable]);
  }

  const anomalies = new Map<string, PayableAnomaly>();
  for (const bucket of groups.values()) {
    if (bucket.length <= minSamples) continue; // precisa de baseline + amostras
    for (const payable of bucket) {
      const others = bucket.filter((p) => p.id !== payable.id).map((p) => p.finalAmount);
      if (others.length < minSamples) continue;
      const baseline = median(others);
      if (baseline <= 0) continue;
      const delta = payable.finalAmount - baseline;
      const deltaPct = delta / baseline;
      if (Math.abs(deltaPct) < thresholdPct) continue;
      if (Math.abs(delta) < minAbsoluteDelta) continue;
      anomalies.set(payable.id, {
        payableId: payable.id,
        currentAmount: payable.finalAmount,
        baseline,
        deltaPct,
        sampleSize: others.length,
        direction: delta >= 0 ? 'acima' : 'abaixo',
      });
    }
  }

  return anomalies;
}

/** Rótulo curto pt-BR para um selo (ex.: "+23% vs. média"). */
export function formatAnomalyBadge(anomaly: PayableAnomaly): string {
  const pct = Math.round(Math.abs(anomaly.deltaPct) * 100);
  const sign = anomaly.direction === 'acima' ? '+' : '−';
  return `${sign}${pct}% vs. média`;
}
