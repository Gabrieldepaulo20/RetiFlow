import {
  addMarketingDays,
  getMarketingDateKey,
  getMarketingDateRange,
  MARKETING_TIME_ZONE,
  normalizeMarketingOccurredAt,
  toMarketingDayAfterEndIso,
  toMarketingDayEndIso,
  toMarketingDayStartIso,
} from '../../supabase/functions/_shared/marketing-date';

describe('marketing business dates', () => {
  it('uses the Sao Paulo calendar when UTC has already advanced to the next day', () => {
    const range = getMarketingDateRange(
      7,
      new Date('2026-07-24T00:30:00.000Z'),
      MARKETING_TIME_ZONE,
    );

    expect(range).toEqual({
      startDate: '2026-07-17',
      endDate: '2026-07-23',
      previousStartDate: '2026-07-10',
      previousEndDate: '2026-07-16',
    });
  });

  it('converts local business-day boundaries to UTC', () => {
    expect(toMarketingDayStartIso('2026-07-23')).toBe('2026-07-23T03:00:00.000Z');
    expect(toMarketingDayEndIso('2026-07-23')).toBe('2026-07-24T02:59:59.999Z');
    expect(toMarketingDayAfterEndIso('2026-07-23')).toBe('2026-07-24T03:00:00.000Z');
  });

  it('groups late UTC events into the correct Sao Paulo day', () => {
    expect(getMarketingDateKey('2026-07-24T01:30:00.000Z')).toBe('2026-07-23');
  });

  it('adds calendar days without depending on the runtime timezone', () => {
    expect(addMarketingDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('allows delayed events but clamps future timestamps beyond clock skew', () => {
    const now = Date.parse('2026-07-23T15:00:00.000Z');

    expect(normalizeMarketingOccurredAt('2026-07-16T15:00:00.000Z', now))
      .toBe('2026-07-16T15:00:00.000Z');
    expect(normalizeMarketingOccurredAt('2026-07-23T15:04:59.000Z', now))
      .toBe('2026-07-23T15:04:59.000Z');
    expect(normalizeMarketingOccurredAt('2026-07-23T15:05:01.000Z', now))
      .toBe('2026-07-23T15:00:00.000Z');
  });
});
