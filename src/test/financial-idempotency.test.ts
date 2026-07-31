import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquireFinancialIdempotencyAttempt,
  completeFinancialIdempotencyAttempt,
} from '@/services/domain/financialIdempotency';

describe('financial idempotency attempts', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reuses the same key while a request with the same fingerprint is unresolved', () => {
    const first = acquireFinancialIdempotencyAttempt({
      operation: 'receber-os',
      entityId: 'nota-1',
      fingerprint: { amount: 125.5, date: '2026-07-30', method: 'PIX' },
    });
    const retry = acquireFinancialIdempotencyAttempt({
      operation: 'receber-os',
      entityId: 'nota-1',
      fingerprint: { method: 'PIX', date: '2026-07-30', amount: 125.5 },
    });

    expect(retry.key).toBe(first.key);
  });

  it('creates a new key when the financial input changes', () => {
    const first = acquireFinancialIdempotencyAttempt({
      operation: 'receber-fechamento',
      entityId: 'fechamento-1',
      fingerprint: { alreadyReceived: 100, amount: 200 },
    });
    const changed = acquireFinancialIdempotencyAttempt({
      operation: 'receber-fechamento',
      entityId: 'fechamento-1',
      fingerprint: { alreadyReceived: 100, amount: 250 },
    });

    expect(changed.key).not.toBe(first.key);
  });

  it('only releases the pending key after confirmed success', () => {
    const first = acquireFinancialIdempotencyAttempt({
      operation: 'pagar-conta',
      entityId: 'conta-1',
      fingerprint: { alreadyPaid: 0, amount: 90 },
    });

    // Sem confirmação, o retry continua idempotente.
    expect(acquireFinancialIdempotencyAttempt({
      operation: 'pagar-conta',
      entityId: 'conta-1',
      fingerprint: { alreadyPaid: 0, amount: 90 },
    }).key).toBe(first.key);

    completeFinancialIdempotencyAttempt(first);

    expect(acquireFinancialIdempotencyAttempt({
      operation: 'pagar-conta',
      entityId: 'conta-1',
      fingerprint: { alreadyPaid: 0, amount: 90 },
    }).key).not.toBe(first.key);
  });
});
