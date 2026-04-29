import { describe, expect, it } from 'vitest';
import { normalizeSupportMessage, SUPPORT_MESSAGE_LIMITS, validateSupportMessage } from '@/services/domain/supportTickets';

describe('support ticket domain helpers', () => {
  it('normalizes whitespace and trims messages', () => {
    expect(normalizeSupportMessage('  erro   ao\nsalvar   nota  ')).toBe('erro ao salvar nota');
  });

  it('rejects messages that are too short', () => {
    const result = validateSupportMessage('bug');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(String(SUPPORT_MESSAGE_LIMITS.min));
    }
  });

  it('accepts valid support messages', () => {
    const result = validateSupportMessage('Ao gerar fechamento apareceu erro inesperado.');

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Ao gerar fechamento apareceu erro inesperado.');
  });
});
