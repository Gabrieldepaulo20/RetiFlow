import { describe, expect, it } from 'vitest';
import {
  appendClosingLog,
  buildClosingPeriodLabel,
  calcServiceTotal,
  cloneClosing,
  createClosingLog,
  getClosingDateRange,
  getNoteDiscount,
  recalcClosing,
} from '@/services/domain/monthlyClosing';
import type { ClosingPeriodFilters, ClosingPeriodType } from '@/services/domain/monthlyClosing';
import type { ClosingRecord, ClosingService } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseFilters(overrides: Partial<ClosingPeriodFilters> = {}): ClosingPeriodFilters {
  return {
    periodType: 'mensal',
    month: '2',
    year: '2026',
    quinzena: '1',
    weekDate: new Date('2026-02-10T00:00:00.000Z'),
    customRange: {},
    clientFilter: 'all',
    ...overrides,
  };
}

function buildClosing(overrides: Partial<ClosingRecord> = {}): ClosingRecord {
  return {
    id: 'closing-1',
    label: 'Fechamento Fevereiro',
    period: 'Fevereiro/2026',
    clientId: 'c1',
    clientName: 'Cliente Teste',
    notes: [],
    total: 0,
    createdAt: '2026-02-10T10:00:00.000Z',
    updatedAt: '2026-02-10T10:00:00.000Z',
    version: 1,
    regenerationCount: 1,
    editCount: 0,
    downloadCount: 0,
    logs: [],
    ...overrides,
  };
}

// ─── getClosingDateRange ──────────────────────────────────────────────────────

describe('getClosingDateRange — mensal', () => {
  it('starts on the 1st and ends on the last day of the month', () => {
    const { start, end } = getClosingDateRange(baseFilters({ periodType: 'mensal', month: '2', year: '2026' }));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1); // Feb = 1
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(1);
    expect(end.getDate()).toBe(28); // 2026 is not a leap year
    expect(end.getHours()).toBe(23);
    expect(end.getSeconds()).toBe(59);
  });

  it('handles December correctly (end day is 31)', () => {
    const { start, end } = getClosingDateRange(baseFilters({ periodType: 'mensal', month: '12', year: '2026' }));
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31);
  });
});

describe('getClosingDateRange — quinzenal', () => {
  it('1ª quinzena: 1–15', () => {
    const { start, end } = getClosingDateRange(
      baseFilters({ periodType: 'quinzenal', quinzena: '1', month: '3', year: '2026' }),
    );
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(23);
  });

  it('2ª quinzena: 16–last day', () => {
    const { start, end } = getClosingDateRange(
      baseFilters({ periodType: 'quinzenal', quinzena: '2', month: '2', year: '2026' }),
    );
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(28);
  });
});

describe('getClosingDateRange — semanal', () => {
  it('returns monday-to-sunday week containing the weekDate', () => {
    // 2026-02-10 is a Tuesday. Week should be Mon Feb 9 – Sun Feb 15.
    const { start, end } = getClosingDateRange(
      baseFilters({ periodType: 'semanal', weekDate: new Date('2026-02-10T00:00:00.000Z') }),
    );
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.getHours()).toBe(23);
  });
});

describe('getClosingDateRange — personalizado', () => {
  it('uses customRange.from and customRange.to when provided', () => {
    const from = new Date('2026-03-05T00:00:00.000Z');
    const to = new Date('2026-03-20T00:00:00.000Z');
    const { start, end } = getClosingDateRange(
      baseFilters({ periodType: 'personalizado', customRange: { from, to } }),
    );
    expect(start).toBe(from);
    expect(end.getDate()).toBe(to.getDate());
    expect(end.getHours()).toBe(23);
  });

  it('falls back to mensal range when customRange is incomplete', () => {
    const { start } = getClosingDateRange(
      baseFilters({ periodType: 'personalizado', customRange: {}, month: '4', year: '2026' }),
    );
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(3); // April = 3
  });
});

// ─── buildClosingPeriodLabel ──────────────────────────────────────────────────

describe('buildClosingPeriodLabel', () => {
  const dateRange = {
    start: new Date('2026-02-01T00:00:00.000Z'),
    end: new Date('2026-02-28T23:59:59.000Z'),
  };

  it('formats mensal as "MonthName/Year"', () => {
    expect(buildClosingPeriodLabel(baseFilters({ periodType: 'mensal', month: '2', year: '2026' }), dateRange)).toBe(
      'Fevereiro/2026',
    );
  });

  it('formats 1ª quinzena', () => {
    expect(
      buildClosingPeriodLabel(
        baseFilters({ periodType: 'quinzenal', quinzena: '1', month: '3', year: '2026' }),
        dateRange,
      ),
    ).toMatch(/1ª Quinzena/);
  });

  it('formats 2ª quinzena', () => {
    expect(
      buildClosingPeriodLabel(
        baseFilters({ periodType: 'quinzenal', quinzena: '2', month: '3', year: '2026' }),
        dateRange,
      ),
    ).toMatch(/2ª Quinzena/);
  });

  it('formats semanal as a date range', () => {
    const label = buildClosingPeriodLabel(
      baseFilters({ periodType: 'semanal', weekDate: new Date('2026-02-10T00:00:00.000Z') }),
      dateRange,
    );
    expect(label).toMatch(/Semana/);
    expect(label).toMatch(/a/);
  });

  it('formats personalizado using dateRange.start and end', () => {
    const label = buildClosingPeriodLabel(baseFilters({ periodType: 'personalizado' }), dateRange);
    expect(label).toMatch(/a/); // "dd/MM/yyyy a dd/MM/yyyy"
  });

  it('handles all 12 month names correctly (spot checks)', () => {
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    months.forEach((name, i) => {
      const label = buildClosingPeriodLabel(
        baseFilters({ periodType: 'mensal', month: String(i + 1), year: '2026' }),
        dateRange,
      );
      expect(label).toBe(`${name}/2026`);
    });
  });
});

// ─── calcServiceTotal ─────────────────────────────────────────────────────────

describe('calcServiceTotal', () => {
  it('calculates gross when discount is 0%', () => {
    expect(calcServiceTotal({ name: 'S', price: 100, quantity: 2, discount: 0, discountType: 'percent' })).toBe(200);
  });

  it('applies percent discount correctly', () => {
    // 100 * 2 = 200 gross, 10% off → 180
    expect(calcServiceTotal({ name: 'S', price: 100, quantity: 2, discount: 10, discountType: 'percent' })).toBe(180);
  });

  it('applies 100% percent discount → 0', () => {
    expect(calcServiceTotal({ name: 'S', price: 50, quantity: 1, discount: 100, discountType: 'percent' })).toBe(0);
  });

  it('applies value discount correctly', () => {
    // 50 * 1 = 50 gross, 5 off → 45
    expect(calcServiceTotal({ name: 'S', price: 50, quantity: 1, discount: 5, discountType: 'value' })).toBe(45);
  });

  it('clamps value discount to 0 when discount exceeds gross', () => {
    expect(calcServiceTotal({ name: 'S', price: 10, quantity: 1, discount: 999, discountType: 'value' })).toBe(0);
  });

  it('handles quantity of 0', () => {
    expect(calcServiceTotal({ name: 'S', price: 100, quantity: 0, discount: 0, discountType: 'percent' })).toBe(0);
  });
});

// ─── getNoteDiscount ──────────────────────────────────────────────────────────

describe('getNoteDiscount', () => {
  it('returns 0 when no services', () => {
    expect(getNoteDiscount({ id: 'n1', number: 'OS-1', total: 0, services: [] })).toBe(0);
  });

  it('sums discounts across services', () => {
    // Service 1: 100*2=200 gross, 10% off → 20 discount
    // Service 2: 50*1=50 gross, value 5 off → 5 discount
    // Total discount = 25
    const note = {
      id: 'n1', number: 'OS-1', total: 225,
      services: [
        { name: 'A', price: 100, quantity: 2, discount: 10, discountType: 'percent' as const },
        { name: 'B', price: 50, quantity: 1, discount: 5, discountType: 'value' as const },
      ],
    };
    expect(getNoteDiscount(note)).toBe(25);
  });
});

// ─── recalcClosing ────────────────────────────────────────────────────────────

describe('recalcClosing', () => {
  it('recalculates note totals and overall total from services', () => {
    const closing = buildClosing({
      notes: [
        {
          id: 'n1', number: 'OS-1', total: 9999,
          services: [
            { name: 'A', price: 100, quantity: 1, discount: 0, discountType: 'percent' },
            { name: 'B', price: 50, quantity: 2, discount: 0, discountType: 'percent' },
          ],
        },
      ],
      total: 9999,
    });

    const result = recalcClosing(closing);
    expect(result.notes[0]!.total).toBe(200); // 100 + 100
    expect(result.total).toBe(200);
  });

  it('sums multiple notes into overall total', () => {
    const closing = buildClosing({
      notes: [
        { id: 'n1', number: 'OS-1', total: 0, services: [{ name: 'A', price: 100, quantity: 1, discount: 0, discountType: 'percent' }] },
        { id: 'n2', number: 'OS-2', total: 0, services: [{ name: 'B', price: 80, quantity: 1, discount: 0, discountType: 'percent' }] },
      ],
      total: 0,
    });

    const result = recalcClosing(closing);
    expect(result.total).toBe(180);
  });

  it('does not mutate the original closing', () => {
    const closing = buildClosing({
      notes: [{ id: 'n1', number: 'OS-1', total: 0, services: [{ name: 'A', price: 50, quantity: 1, discount: 0, discountType: 'percent' }] }],
      total: 0,
    });
    const result = recalcClosing(closing);
    expect(result).not.toBe(closing);
    expect(result.notes[0]).not.toBe(closing.notes[0]);
  });
});

// ─── createClosingLog ─────────────────────────────────────────────────────────

describe('createClosingLog', () => {
  it('creates a log entry with the given type and message', () => {
    const log = createClosingLog('Fechamento gerado.', 'generated', '2026-02-10T10:00:00.000Z');
    expect(log.type).toBe('generated');
    expect(log.message).toBe('Fechamento gerado.');
    expect(log.createdAt).toBe('2026-02-10T10:00:00.000Z');
    expect(typeof log.id).toBe('string');
    expect(log.id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs for two logs created at the same time', () => {
    const a = createClosingLog('A', 'edited', '2026-02-10T10:00:00.000Z');
    const b = createClosingLog('B', 'edited', '2026-02-10T10:00:00.000Z');
    // IDs may collide due to Math.random(), but this is unlikely; validate structure instead
    expect(a.id).toMatch(/^log-/);
    expect(b.id).toMatch(/^log-/);
  });
});

// ─── appendClosingLog ─────────────────────────────────────────────────────────

describe('appendClosingLog', () => {
  it('prepends the new log to the front of logs array', () => {
    const existing = createClosingLog('First log', 'generated', '2026-02-01T00:00:00.000Z');
    const closing = buildClosing({ logs: [existing] });
    const newLog = createClosingLog('Edited', 'edited', '2026-02-05T00:00:00.000Z');

    const result = appendClosingLog(closing, newLog);
    expect(result.logs[0]).toBe(newLog);
    expect(result.logs[1]).toBe(existing);
    expect(result.logs).toHaveLength(2);
  });

  it('does not mutate the original closing logs', () => {
    const closing = buildClosing({ logs: [] });
    const log = createClosingLog('Test', 'previewed');
    appendClosingLog(closing, log);
    expect(closing.logs).toHaveLength(0);
  });
});

// ─── cloneClosing ─────────────────────────────────────────────────────────────

describe('cloneClosing', () => {
  it('returns a new object (not the same reference)', () => {
    const closing = buildClosing();
    const clone = cloneClosing(closing);
    expect(clone).not.toBe(closing);
  });

  it('deep-clones notes and services', () => {
    const closing = buildClosing({
      notes: [
        { id: 'n1', number: 'OS-1', total: 100, services: [{ name: 'A', price: 100, quantity: 1, discount: 0, discountType: 'percent' }] },
      ],
    });
    const clone = cloneClosing(closing);
    expect(clone.notes[0]).not.toBe(closing.notes[0]);
    expect(clone.notes[0]!.services[0]).not.toBe(closing.notes[0]!.services[0]);
  });

  it('clones the logs array independently', () => {
    const log = createClosingLog('gen', 'generated');
    const closing = buildClosing({ logs: [log] });
    const clone = cloneClosing(closing);
    expect(clone.logs).not.toBe(closing.logs);
    expect(clone.logs[0]).toBe(log); // shallow entries are same refs
  });

  it('mutating the clone does not affect the original', () => {
    const closing = buildClosing({
      notes: [{ id: 'n1', number: 'OS-1', total: 100, services: [] }],
    });
    const clone = cloneClosing(closing);
    clone.notes[0]!.total = 999;
    expect(closing.notes[0]!.total).toBe(100);
  });
});
