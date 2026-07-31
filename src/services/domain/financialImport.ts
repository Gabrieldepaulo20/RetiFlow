export type FinancialImportDirection = 'ENTRADA' | 'SAIDA' | 'INCERTO';
export type FinancialImportEntryTiming = 'REALIZADA' | 'PREVISTA' | 'INCERTO';
export type FinancialImportEntryOrigin = 'MOVIMENTO_MANUAL' | 'APORTE' | 'REEMBOLSO' | 'AJUSTE';
export type FinancialImportServiceOrderDecision = 'YES' | 'NO' | 'UNKNOWN';

export function normalizeFinancialImportDirection(value: unknown): FinancialImportDirection {
  return value === 'ENTRADA' || value === 'SAIDA' ? value : 'INCERTO';
}

export function buildMeaningfulFinancialEntryTitle(input: {
  title?: string | null;
  counterparty: string;
  timing: FinancialImportEntryTiming;
  date: string;
}) {
  const title = input.title?.replace(/\s+/g, ' ').trim() ?? '';
  const generic = /^(entrada|recebimento|pix|comprovante|cr[eé]dito)( importad[oa])?$/i.test(title);
  if (title && !generic) return title.slice(0, 120);

  const counterparty = input.counterparty.replace(/\s+/g, ' ').trim() || 'Origem não identificada';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date.split('-').reverse().join('/')
    : input.date;
  const event = input.timing === 'PREVISTA' ? 'A receber' : 'Recebimento';
  return `${counterparty} · ${event} ${date}`.slice(0, 120);
}

export function isSimilarImportedFinancialEntry(
  candidate: { direcao: string; valor: number; dataEfetiva: string; estornado?: boolean },
  expected: { value: number; date: string },
) {
  return candidate.direcao === 'ENTRADA'
    && candidate.estornado !== true
    && candidate.dataEfetiva.slice(0, 10) === expected.date
    && Math.abs(candidate.valor - expected.value) < 0.01;
}

export function canCreateImportedFinancialEntry(input: {
  direction: FinancialImportDirection;
  serviceOrderDecision?: FinancialImportServiceOrderDecision;
}) {
  return input.direction === 'ENTRADA' && input.serviceOrderDecision === 'NO';
}
