import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_SCOPE_REFUSAL,
  containsForbiddenAction,
  extractWhatsAppMessages,
  fallbackDecision,
  normalizePhone,
  parseAllowedPhones,
  parseAssistantDecision,
  resolveAssistantPeriod,
} from '../../supabase/functions/_shared/whatsapp-finance-assistant';

describe('WhatsApp Finance Assistant guardrails', () => {
  it.each([
    'Pague essa conta agora',
    'por favor, corrija o erro do saldo',
    'marque a O.S. 5905 como paga',
    'exclua a conta repetida',
    'cadastre um salário novo',
    'vamos alterar o vencimento',
    'consegue estornar esse pagamento?',
    'execute um comando para consertar',
  ])('blocks commands and mutations: %s', (question) => {
    expect(containsForbiddenAction(question)).toBe(true);
  });

  it.each([
    'Por que a conta foi paga duas vezes?',
    'Quanto preciso pagar amanhã?',
    'O que significa faturamento por competência?',
    'Quanto entrou em julho?',
    'Quais contas estão pendentes?',
    'Como está a O.S. 5905?',
    'Você pode me explicar o saldo projetado?',
  ])('keeps explanatory questions read-only: %s', (question) => {
    expect(containsForbiddenAction(question)).toBe(false);
  });

  it('keeps the fixed refusal explicit and action-free', () => {
    expect(ASSISTANT_SCOPE_REFUSAL).toContain('Não posso cadastrar, alterar, pagar');
  });
});

describe('WhatsApp authorization helpers', () => {
  it('normalizes and allowlists only plausible phone numbers', () => {
    const allowed = parseAllowedPhones('+55 (11) 99999-0000, 5511988887777, invalido, 123');
    expect(normalizePhone('+55 (11) 99999-0000')).toBe('5511999990000');
    expect(allowed.has('5511999990000')).toBe(true);
    expect(allowed.has('5511988887777')).toBe(true);
    expect(allowed.has('123')).toBe(false);
  });

  it('extracts inbound text and ignores status-only payloads', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'phone-id' },
            messages: [{
              id: 'wamid.1',
              from: '+55 (11) 99999-0000',
              type: 'text',
              text: { body: 'Quanto entrou?' },
            }],
            statuses: [{ id: 'wamid.sent', status: 'delivered' }],
          },
        }],
      }],
    };
    expect(extractWhatsAppMessages(payload)).toEqual([{
      id: 'wamid.1',
      from: '5511999990000',
      phoneNumberId: 'phone-id',
      type: 'text',
      text: 'Quanto entrou?',
    }]);
    expect(extractWhatsAppMessages({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }],
    })).toEqual([]);
  });
});

describe('WhatsApp assistant query contract', () => {
  it('uses the current month only when the model did not infer a period', () => {
    expect(resolveAssistantPeriod({ now: new Date('2026-07-31T15:00:00Z') })).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
      label: '01/07/2026 a 31/07/2026',
    });
  });

  it('rejects invalid and overlong periods', () => {
    expect(resolveAssistantPeriod({
      dateStart: '2026-08-01',
      dateEnd: '2026-07-01',
    })).toBeNull();
    expect(resolveAssistantPeriod({
      dateStart: '2025-01-01',
      dateEnd: '2026-07-31',
    })).toBeNull();
  });

  it('accepts only closed classifier enums', () => {
    const valid = parseAssistantDecision({
      intent: 'FINANCEIRO_RESUMO',
      metric: 'ENTRADAS_RECEBIDAS',
      date_start: '2026-07-01',
      date_end: '2026-07-31',
      os_number: null,
      search_term: null,
      payable_filter: 'TODOS',
      needs_clarification: false,
      clarification: null,
      confidence: 0.96,
    });
    expect(valid?.metric).toBe('ENTRADAS_RECEBIDAS');
    expect(parseAssistantDecision({ ...valid, intent: 'EXECUTAR_PAGAMENTO' })).toBeNull();
  });

  it('has a conservative deterministic fallback', () => {
    expect(fallbackDecision('Qual o pagamento da O.S. 5905?')).toMatchObject({
      intent: 'NOTA_ESPECIFICA',
      metric: 'PAGAMENTO_OS',
      osNumber: '5905',
    });
    expect(fallbackDecision('Quais contas estão pendentes?').payableFilter).toBe('PENDENTE');
    expect(fallbackDecision('Quanto entrou em julho?')).toMatchObject({
      needsClarification: true,
      confidence: 0.5,
    });
    expect(fallbackDecision('Qual a previsão do tempo?').intent).toBe('FORA_ESCOPO');
  });
});

describe('WhatsApp Edge Function is structurally read-only', () => {
  const source = readFileSync(
    join(process.cwd(), 'supabase/functions/whatsapp-financeiro/index.ts'),
    'utf8',
  );

  it('contains no database mutation method', () => {
    expect(source).not.toMatch(/\.(insert|update|upsert)\s*\(/);
    expect(
      source
        .replace('processedMessages.delete(id)', '')
        .replace('inFlightMessages.delete(message.id)', ''),
    ).not.toMatch(/\.delete\s*\(/);
  });

  it('exposes no OpenAI tool and calls only the approved read RPC', () => {
    expect(source).not.toMatch(/\btools\s*:/);
    expect(Array.from(source.matchAll(/\.rpc\(\s*'([^']+)'/g), (match) => match[1]))
      .toEqual(['financeiro_resumo_usuario']);
  });
});
