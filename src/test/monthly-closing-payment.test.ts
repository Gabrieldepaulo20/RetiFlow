import { describe, expect, it } from 'vitest';
import {
  aggregateOpenClosingReminders,
  buildClosingPaymentSummary,
  calculateInitialClosingPayment,
  calculateSecondClosingPayment,
  centsToMoney,
  filterOpenClosingReminders,
  isExactSecondClosingPayment,
  moneyToCents,
  validateFirstClosingPayment,
  validateSecondClosingPayment,
  type ClosingReminderCandidate,
} from '@/services/domain/monthlyClosingPayment';

describe('monthlyClosingPayment money boundaries', () => {
  it('converte reais para centavos com arredondamento somente na borda', () => {
    expect(moneyToCents(0.1 + 0.2)).toBe(30);
    expect(moneyToCents(100.005)).toBe(10001);
    expect(centsToMoney(10001)).toBe(100.01);
  });

  it('não propaga valores monetários inválidos', () => {
    expect(moneyToCents(Number.NaN)).toBe(0);
    expect(centsToMoney(-1)).toBe(0);
    expect(centsToMoney(10.5)).toBe(0);
  });
});

describe('calculateInitialClosingPayment', () => {
  it('mantém total integral em aberto no plano NONE', () => {
    expect(calculateInitialClosingPayment(10_001, { mode: 'NONE' })).toEqual({
      mode: 'NONE',
      totalCents: 10_001,
      amountCents: 0,
      balanceCents: 10_001,
      hasPayment: false,
      valid: true,
      error: null,
    });
  });

  it('arredonda 50% e 60% em centavos e preserva a soma exata', () => {
    const half = calculateInitialClosingPayment(10_001, { mode: 'PERCENT_50' });
    const sixty = calculateInitialClosingPayment(10_001, { mode: 'PERCENT_60' });

    expect(half).toMatchObject({ amountCents: 5_001, balanceCents: 5_000, valid: true });
    expect(sixty).toMatchObject({ amountCents: 6_001, balanceCents: 4_000, valid: true });
    expect(half.amountCents + half.balanceCents).toBe(half.totalCents);
    expect(sixty.amountCents + sixty.balanceCents).toBe(sixty.totalCents);
  });

  it('aceita valor personalizado positivo até o total, inclusive quitação integral', () => {
    expect(calculateInitialClosingPayment(10_000, { mode: 'CUSTOM', amountCents: 4_321 }))
      .toMatchObject({ amountCents: 4_321, balanceCents: 5_679, valid: true });
    expect(calculateInitialClosingPayment(10_000, { mode: 'CUSTOM', amountCents: 10_000 }))
      .toMatchObject({ amountCents: 10_000, balanceCents: 0, valid: true });
  });

  it('rejeita primeira parcela zero, acima do total ou em fração de centavo', () => {
    expect(validateFirstClosingPayment(10_000, 0)).toEqual({ valid: false, error: 'PAYMENT_REQUIRED' });
    expect(validateFirstClosingPayment(10_000, 10_001)).toEqual({ valid: false, error: 'PAYMENT_EXCEEDS_TOTAL' });
    expect(validateFirstClosingPayment(10_000, 100.5)).toEqual({ valid: false, error: 'INVALID_AMOUNT' });
    expect(calculateInitialClosingPayment(10_000, { mode: 'CUSTOM', amountCents: 10_001 }))
      .toMatchObject({ amountCents: 10_001, balanceCents: 0, valid: false, error: 'PAYMENT_EXCEEDS_TOTAL' });
  });
});

describe('segunda parcela', () => {
  it('calcula exatamente todo o saldo ainda aberto', () => {
    expect(calculateSecondClosingPayment(10_001, 5_001)).toEqual({
      totalCents: 10_001,
      receivedCents: 5_001,
      amountCents: 5_000,
      balanceAfterPaymentCents: 0,
      valid: true,
      error: null,
    });
  });

  it('aceita somente o saldo exato, sem tolerância de um centavo', () => {
    expect(isExactSecondClosingPayment(10_001, 5_001, 5_000)).toBe(true);
    expect(isExactSecondClosingPayment(10_001, 5_001, 4_999)).toBe(false);
    expect(validateSecondClosingPayment(10_001, 5_001, 5_001)).toEqual({
      valid: false,
      error: 'SECOND_PAYMENT_MUST_MATCH_BALANCE',
    });
  });

  it('não trata pagamento integral como segunda parcela sem uma primeira', () => {
    expect(calculateSecondClosingPayment(10_000, 0)).toMatchObject({
      amountCents: 10_000,
      valid: false,
      error: 'FIRST_PAYMENT_REQUIRED',
    });
    expect(calculateSecondClosingPayment(10_000, 10_000)).toMatchObject({
      amountCents: 0,
      valid: false,
      error: 'CLOSING_ALREADY_PAID',
    });
  });
});

describe('buildClosingPaymentSummary', () => {
  it.each([
    [0, 'PENDENTE', 10_000, 0],
    [2_500, 'PARCIAL', 7_500, 25],
    [10_000, 'PAGO', 0, 100],
  ] as const)('resume recebido %i como %s', (receivedCents, status, openCents, progressPercent) => {
    expect(buildClosingPaymentSummary({ totalCents: 10_000, receivedCents })).toMatchObject({
      status,
      openCents,
      progressPercent,
      hasInvalidValues: false,
    });
  });

  it('expõe sobrepagamento sem produzir saldo negativo', () => {
    expect(buildClosingPaymentSummary({ totalCents: 10_000, receivedCents: 10_001 })).toEqual({
      totalCents: 10_000,
      receivedCents: 10_001,
      openCents: 0,
      overpaidCents: 1,
      status: 'PAGO',
      progressPercent: 100,
      hasInvalidValues: true,
    });
  });
});

describe('lembretes de fechamentos em aberto', () => {
  const candidates: ClosingReminderCandidate[] = [
    { closingId: 'f1', clientId: 'c1', totalCents: 10_000, receivedCents: 5_000 },
    { closingId: 'f2', clientId: 'c1', totalCents: 2_000, receivedCents: 0 },
    { closingId: 'f3', clientId: 'c1', totalCents: 1_000, receivedCents: 1_000 },
    { closingId: 'f4', clientId: 'c2', totalCents: 8_000, receivedCents: 2_000 },
  ];

  it('filtra somente saldos abertos do cliente solicitado e preserva os itens', () => {
    expect(filterOpenClosingReminders(candidates, 'c1').map((item) => item.closingId))
      .toEqual(['f1', 'f2']);
    expect(filterOpenClosingReminders(candidates).map((item) => item.closingId))
      .toEqual(['f1', 'f2', 'f4']);
  });

  it('agrega quantidade e valores sem incluir pagos ou outros clientes', () => {
    expect(aggregateOpenClosingReminders(candidates, 'c1')).toEqual({
      closingCount: 2,
      clientCount: 1,
      totalCents: 12_000,
      receivedCents: 5_000,
      openCents: 7_000,
    });
    expect(aggregateOpenClosingReminders(candidates)).toEqual({
      closingCount: 3,
      clientCount: 2,
      totalCents: 20_000,
      receivedCents: 7_000,
      openCents: 13_000,
    });
  });

  it('retorna agregado zerado quando não há pendências', () => {
    expect(aggregateOpenClosingReminders(candidates, 'inexistente')).toEqual({
      closingCount: 0,
      clientCount: 0,
      totalCents: 0,
      receivedCents: 0,
      openCents: 0,
    });
  });
});
