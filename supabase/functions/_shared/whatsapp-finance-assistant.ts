export const ASSISTANT_SCOPE_REFUSAL =
  'Eu só posso explicar dados do Dashboard, Financeiro, Contas a Pagar e O.S. Não posso cadastrar, alterar, pagar, estornar, excluir, corrigir ou executar ações.';

export const ASSISTANT_UNCONFIRMED =
  'Não consigo confirmar isso com os dados disponíveis no Retiflow.';

export const ASSISTANT_TEXT_ONLY =
  'Por segurança, eu só respondo perguntas em texto sobre Dashboard, Financeiro, Contas a Pagar e O.S.';

export const ASSISTANT_MAX_QUESTION_LENGTH = 800;

export const ASSISTANT_INTENTS = [
  'DASHBOARD_RESUMO',
  'FINANCEIRO_RESUMO',
  'CONTAS_PAGAR',
  'SALARIOS',
  'NOTAS_RESUMO',
  'NOTA_ESPECIFICA',
  'DEFINICAO_METRICA',
  'FORA_ESCOPO',
] as const;

export type AssistantIntent = typeof ASSISTANT_INTENTS[number];

export const ASSISTANT_METRICS = [
  'GERAL',
  'ENTRADAS_RECEBIDAS',
  'SAIDAS_PAGAS',
  'SALDO_ATUAL',
  'SALDO_PROJETADO',
  'A_RECEBER',
  'A_PAGAR',
  'RESULTADO_CAIXA',
  'FATURAMENTO_COMPETENCIA',
  'DESPESAS_COMPETENCIA',
  'RESULTADO_COMPETENCIA',
  'QUANTIDADE_OS',
  'VALOR_OS',
  'TICKET_MEDIO',
  'STATUS_OS',
  'PAGAMENTO_OS',
  'DUPLICIDADE',
] as const;

export type AssistantMetric = typeof ASSISTANT_METRICS[number];

export const PAYABLE_FILTERS = [
  'TODOS',
  'PENDENTE',
  'PARCIAL',
  'PAGO',
  'AGENDADO',
  'ATRASADO',
] as const;

export type PayableFilter = typeof PAYABLE_FILTERS[number];

export type AssistantDecision = {
  intent: AssistantIntent;
  metric: AssistantMetric;
  dateStart: string | null;
  dateEnd: string | null;
  osNumber: string | null;
  searchTerm: string | null;
  payableFilter: PayableFilter;
  needsClarification: boolean;
  clarification: string | null;
  confidence: number;
};

export type AssistantPeriod = {
  start: string;
  end: string;
  label: string;
};

export const assistantDecisionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'metric',
    'date_start',
    'date_end',
    'os_number',
    'search_term',
    'payable_filter',
    'needs_clarification',
    'clarification',
    'confidence',
  ],
  properties: {
    intent: { type: 'string', enum: ASSISTANT_INTENTS },
    metric: { type: 'string', enum: ASSISTANT_METRICS },
    date_start: { type: ['string', 'null'], description: 'Data ISO YYYY-MM-DD ou null.' },
    date_end: { type: ['string', 'null'], description: 'Data ISO YYYY-MM-DD ou null.' },
    os_number: { type: ['string', 'null'], description: 'Número da O.S., sem inventar.' },
    search_term: {
      type: ['string', 'null'],
      description: 'Título, favorecido ou documento citado literalmente, sem ampliar.',
    },
    payable_filter: { type: 'string', enum: PAYABLE_FILTERS },
    needs_clarification: { type: 'boolean' },
    clarification: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSearchText(value: string) {
  return stripDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export function parseAllowedPhones(value: string | null | undefined) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map(normalizePhone)
      .filter((phone) => phone.length >= 10 && phone.length <= 15),
  );
}

const CLEAR_IMPERATIVE = [
  /\b(pague|quite|estorne|cancele|exclua|delete|apague)\b/,
  /\b(cadastre|crie|registre|lance|importe)\b/,
  /\b(corrija|ajuste|altere|mude|edite|reclassifique)\b/,
  /\b(marque|coloque)\b.{0,35}\b(como\s+)?(pago|paga|pendente|cancelado|cancelada)\b/,
  /\b(execute|rode|dispare|envie|gere|baixe)\b/,
] as const;

const REQUESTED_ACTION = /\b(pode|consegue|conseguiria|quero\s+que|preciso\s+que|favor|por\s+favor|vamos)\b.{0,80}\b(pagar|quitar|estornar|cancelar|excluir|deletar|apagar|cadastrar|criar|registrar|lancar|importar|corrigir|ajustar|alterar|mudar|editar|reclassificar|marcar|executar|rodar|disparar|enviar|gerar|baixar)\b/;
const BARE_ACTION = /^(pagar|quitar|estornar|cancelar|excluir|deletar|apagar|cadastrar|criar|registrar|lancar|importar|corrigir|ajustar|alterar|mudar|editar|reclassificar|marcar|executar|rodar|disparar|enviar|gerar|baixar)\b/;
const EXPLANATORY_PAYMENT = /^(quanto|qual|quais|quando|por que|porque|como saber|o que|me explique|explique).{0,80}\b(pagar|pago|paga|pagamento)\b/;

export function containsForbiddenAction(value: string) {
  const normalized = normalizeSearchText(value);
  if (EXPLANATORY_PAYMENT.test(normalized)) return false;
  return CLEAR_IMPERATIVE.some((pattern) => pattern.test(normalized))
    || REQUESTED_ACTION.test(normalized)
    || BARE_ACTION.test(normalized);
}

function isValidISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatPeriodLabel(start: string, end: string) {
  const format = (value: string) => {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  };
  return start === end ? format(start) : `${format(start)} a ${format(end)}`;
}

export function currentBrazilDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function resolveAssistantPeriod(input: {
  dateStart?: string | null;
  dateEnd?: string | null;
  now?: Date;
  maxDays?: number;
}): AssistantPeriod | null {
  const today = currentBrazilDate(input.now);
  const defaultStart = `${today.slice(0, 8)}01`;
  const start = input.dateStart ?? defaultStart;
  const end = input.dateEnd ?? today;
  if (!isValidISODate(start) || !isValidISODate(end) || start > end) return null;

  const startMs = new Date(`${start}T12:00:00Z`).getTime();
  const endMs = new Date(`${end}T12:00:00Z`).getTime();
  const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
  if (days > (input.maxDays ?? 366)) return null;
  return { start, end, label: formatPeriodLabel(start, end) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNullableText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}

export function parseAssistantDecision(value: unknown): AssistantDecision | null {
  if (!isRecord(value)) return null;
  if (!ASSISTANT_INTENTS.includes(value.intent as AssistantIntent)) return null;
  if (!ASSISTANT_METRICS.includes(value.metric as AssistantMetric)) return null;
  if (!PAYABLE_FILTERS.includes(value.payable_filter as PayableFilter)) return null;

  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    intent: value.intent as AssistantIntent,
    metric: value.metric as AssistantMetric,
    dateStart: asNullableText(value.date_start, 10),
    dateEnd: asNullableText(value.date_end, 10),
    osNumber: asNullableText(value.os_number, 40),
    searchTerm: asNullableText(value.search_term, 80),
    payableFilter: value.payable_filter as PayableFilter,
    needsClarification: value.needs_clarification === true,
    clarification: asNullableText(value.clarification, 180),
    confidence,
  };
}

export type WhatsAppInboundMessage = {
  id: string;
  from: string;
  phoneNumberId: string;
  type: string;
  text: string | null;
};

export function extractWhatsAppMessages(payload: unknown): WhatsAppInboundMessage[] {
  if (!isRecord(payload) || payload.object !== 'whatsapp_business_account') return [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const result: WhatsAppInboundMessage[] = [];

  for (const entry of entries) {
    const changes = isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = isRecord(change) && isRecord(change.value) ? change.value : null;
      const metadata = value && isRecord(value.metadata) ? value.metadata : null;
      const phoneNumberId = metadata && typeof metadata.phone_number_id === 'string'
        ? metadata.phone_number_id
        : '';
      const messages = value && Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        if (!isRecord(message)) continue;
        const text = isRecord(message.text) && typeof message.text.body === 'string'
          ? message.text.body.trim()
          : null;
        result.push({
          id: typeof message.id === 'string' ? message.id : '',
          from: typeof message.from === 'string' ? normalizePhone(message.from) : '',
          phoneNumberId,
          type: typeof message.type === 'string' ? message.type : 'unknown',
          text: text || null,
        });
      }
    }
  }

  return result.filter((message) => message.id && message.from && message.phoneNumberId);
}

export function fallbackDecision(question: string): AssistantDecision {
  const normalized = normalizeSearchText(question);
  const osMatch = question.match(/\b(?:o\.?\s*s\.?|os)\s*[-#:]?\s*([a-z0-9.-]{1,30})/i);
  const isDefinition = /\b(o que|significa|explique|diferenca|diferenca entre|como funciona|por que)\b/.test(normalized);
  const hasUnresolvedPeriod = /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|hoje|ontem|amanha|semana|mes|ano)\b/.test(normalized);

  let intent: AssistantIntent = 'FORA_ESCOPO';
  let metric: AssistantMetric = 'GERAL';

  if (osMatch) {
    intent = 'NOTA_ESPECIFICA';
    metric = /\b(pag|receb)\w*/.test(normalized) ? 'PAGAMENTO_OS' : 'STATUS_OS';
  } else if (/\b(salario|folha|funcionario|pro-labore)\b/.test(normalized)) {
    intent = 'SALARIOS';
  } else if (/\b(conta|contas|vencid|vencimento|fornecedor|boleto|pagar)\b/.test(normalized)) {
    intent = 'CONTAS_PAGAR';
    metric = /\b(repet|duplic)\w*/.test(normalized) ? 'DUPLICIDADE' : 'A_PAGAR';
  } else if (/\b(nota|notas|servico|servicos|ticket|kanban)\b/.test(normalized)) {
    intent = 'NOTAS_RESUMO';
    metric = normalized.includes('ticket') ? 'TICKET_MEDIO' : 'QUANTIDADE_OS';
  } else if (/\b(dashboard|painel|visao geral|resumo)\b/.test(normalized)) {
    intent = 'DASHBOARD_RESUMO';
  } else if (/\b(financeir|entrada|entrou|recebido|recebeu|saida|saiu|pago|gastou|saldo|receber|faturamento|despesa|resultado|caixa|competencia)\b/.test(normalized)) {
    intent = isDefinition ? 'DEFINICAO_METRICA' : 'FINANCEIRO_RESUMO';
    if (/\b(entrada|entrou|recebido|recebeu)\b/.test(normalized)) metric = 'ENTRADAS_RECEBIDAS';
    else if (/\b(saida|saiu|pago|gastou)\b/.test(normalized)) metric = 'SAIDAS_PAGAS';
    else if (normalized.includes('projet')) metric = 'SALDO_PROJETADO';
    else if (normalized.includes('saldo')) metric = 'SALDO_ATUAL';
    else if (normalized.includes('faturamento')) metric = 'FATURAMENTO_COMPETENCIA';
    else if (normalized.includes('despesa')) metric = 'DESPESAS_COMPETENCIA';
    else if (normalized.includes('receber')) metric = 'A_RECEBER';
  }

  return {
    intent,
    metric,
    dateStart: null,
    dateEnd: null,
    osNumber: osMatch?.[1] ?? null,
    searchTerm: null,
    payableFilter: normalized.includes('vencid') || normalized.includes('atrasad')
      ? 'ATRASADO'
      : normalized.includes('pendente')
        ? 'PENDENTE'
        : /\b(pago|pagas)\b/.test(normalized)
          ? 'PAGO'
          : 'TODOS',
    needsClarification: hasUnresolvedPeriod,
    clarification: hasUnresolvedPeriod
      ? 'Não consegui confirmar o período. Informe a data inicial e final, por exemplo: 01/07/2026 a 31/07/2026.'
      : null,
    confidence: intent === 'FORA_ESCOPO' ? 0 : hasUnresolvedPeriod ? 0.5 : 0.7,
  };
}
