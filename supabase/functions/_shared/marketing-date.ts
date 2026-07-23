export const MARKETING_TIME_ZONE = 'America/Sao_Paulo';

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface MarketingDateRange {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
}

function getCalendarDateParts(date: Date, timeZone = MARKETING_TIME_ZONE): CalendarDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, Number(part.value)]));

  return {
    year: values.get('year') ?? 0,
    month: values.get('month') ?? 0,
    day: values.get('day') ?? 0,
    hour: values.get('hour') ?? 0,
    minute: values.get('minute') ?? 0,
    second: values.get('second') ?? 0,
  };
}

function formatDateKey(parts: Pick<CalendarDateParts, 'year' | 'month' | 'day'>) {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Data inválida: ${value}`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getCalendarDateParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const instantWithoutMilliseconds = Math.floor(date.getTime() / 1_000) * 1_000;
  return representedAsUtc - instantWithoutMilliseconds;
}

function zonedStartOfDayMs(dateKey: string, timeZone: string) {
  const { year, month, day } = parseDateKey(dateKey);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const firstGuess = new Date(localMidnightAsUtc);
  const firstResult = localMidnightAsUtc - getTimeZoneOffsetMs(firstGuess, timeZone);
  const secondGuess = new Date(firstResult);
  const secondOffset = getTimeZoneOffsetMs(secondGuess, timeZone);

  return localMidnightAsUtc - secondOffset;
}

export function getMarketingDateKey(
  value: Date | string,
  timeZone = MARKETING_TIME_ZONE,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateKey(getCalendarDateParts(date, timeZone));
}

export function addMarketingDays(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return formatDateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

export function getMarketingDateRange(
  periodDays: number,
  now = new Date(),
  timeZone = MARKETING_TIME_ZONE,
): MarketingDateRange {
  const safePeriodDays = Math.max(1, Math.trunc(periodDays));
  const endDate = getMarketingDateKey(now, timeZone);
  const startDate = addMarketingDays(endDate, -(safePeriodDays - 1));
  const previousEndDate = addMarketingDays(startDate, -1);
  const previousStartDate = addMarketingDays(previousEndDate, -(safePeriodDays - 1));

  return { startDate, endDate, previousStartDate, previousEndDate };
}

export function toMarketingDayStartIso(
  dateKey: string,
  timeZone = MARKETING_TIME_ZONE,
) {
  return new Date(zonedStartOfDayMs(dateKey, timeZone)).toISOString();
}

export function toMarketingDayEndIso(
  dateKey: string,
  timeZone = MARKETING_TIME_ZONE,
) {
  const nextDay = addMarketingDays(dateKey, 1);
  return new Date(zonedStartOfDayMs(nextDay, timeZone) - 1).toISOString();
}

export function toMarketingDayAfterEndIso(
  dateKey: string,
  timeZone = MARKETING_TIME_ZONE,
) {
  return toMarketingDayStartIso(addMarketingDays(dateKey, 1), timeZone);
}

export function normalizeMarketingOccurredAt(value: unknown, nowMs = Date.now()) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return new Date(nowMs).toISOString();

  const parsedMs = new Date(raw).getTime();
  const maximumPastDriftMs = 7 * 24 * 60 * 60_000;
  const maximumFutureDriftMs = 5 * 60_000;
  if (
    Number.isNaN(parsedMs)
    || parsedMs < nowMs - maximumPastDriftMs
    || parsedMs > nowMs + maximumFutureDriftMs
  ) {
    return new Date(nowMs).toISOString();
  }

  return new Date(parsedMs).toISOString();
}
