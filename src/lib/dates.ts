/**
 * Formatação defensiva de datas vindas do banco/RPC/localStorage.
 * Timestamps corrompidos ou em formato inesperado viram null em vez de
 * renderizar "Invalid Date" na tela.
 */

function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const DATABASE_WALL_CLOCK_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

function formatDatabaseWallClock(value: string): string | null {
  const match = DATABASE_WALL_CLOCK_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const validated = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    validated.getUTCFullYear() !== year
    || validated.getUTCMonth() !== month - 1
    || validated.getUTCDate() !== day
    || validated.getUTCHours() !== hour
    || validated.getUTCMinutes() !== minute
    || validated.getUTCSeconds() !== second
  ) {
    return null;
  }

  return `${dayText}/${monthText}/${yearText} às ${hourText}:${minuteText}`;
}

/** `DD/MM/AAAA` em pt-BR, ou null se o valor não for uma data válida. */
export function formatDateBR(value: string | null | undefined): string | null {
  return parseDateSafe(value)?.toLocaleDateString('pt-BR') ?? null;
}

/** Data+hora curta em pt-BR (`DD/MM HH:mm`), ou null se inválida. */
export function formatDateTimeShortBR(value: string | null | undefined): string | null {
  return (
    parseDateSafe(value)?.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? null
  );
}

/**
 * Data/hora de colunas PostgreSQL `timestamp without time zone` usadas pelo
 * Retiflow (`DD/MM/AAAA às HH:mm`). Esses valores representam o relógio
 * operacional de São Paulo e chegam pelo PostgREST sem offset; por isso não
 * podem ser reinterpretados no fuso do tablet. Valores com offset explícito
 * são convertidos para `America/Sao_Paulo`.
 */
export function formatDatabaseDateTimeBR(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  if (DATABASE_WALL_CLOCK_PATTERN.test(normalized)) {
    return formatDatabaseWallClock(normalized);
  }

  const parsed = parseDateSafe(normalized);
  if (!parsed) return null;

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const day = getPart('day');
  const month = getPart('month');
  const year = getPart('year');
  const hour = getPart('hour');
  const minute = getPart('minute');

  return day && month && year && hour && minute
    ? `${day}/${month}/${year} às ${hour}:${minute}`
    : null;
}

/**
 * `YYYY-MM-DD` do dia LOCAL (fuso do navegador), para usar como default de
 * "hoje" em formulários de escrita. Nunca usar `new Date().toISOString().slice(0, 10)`
 * para esse fim: em `America/Sao_Paulo` (UTC-3), entre ~21h e 23h59 esse cálculo já
 * cruzou a meia-noite em UTC e devolve o dia seguinte.
 */
export function todayLocalISODate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
