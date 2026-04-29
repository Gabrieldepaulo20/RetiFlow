import { describe, expect, it } from 'vitest';
import { getGmailOAuthFeedback } from '@/services/domain/gmailOAuth';

describe('gmail oauth feedback', () => {
  it('maps successful callback to a clear message', () => {
    expect(getGmailOAuthFeedback('connected', null)).toEqual({
      title: 'Gmail conectado',
      description: 'A conta foi autorizada. Você já pode buscar sugestões de contas.',
      variant: 'default',
    });
  });

  it('maps known callback errors to user-friendly messages', () => {
    expect(getGmailOAuthFeedback('error', 'configuracao_ausente')).toMatchObject({
      title: 'Não foi possível conectar o Gmail',
      description: 'A integração Gmail ainda precisa de configuração no servidor.',
      variant: 'destructive',
    });
  });

  it('keeps unknown callback errors honest without leaking internals', () => {
    expect(getGmailOAuthFeedback('error', 'erro_interno_estranho')).toMatchObject({
      description: 'A conexão com o Google falhou. Tente novamente.',
      variant: 'destructive',
    });
  });

  it('ignores unrelated query params', () => {
    expect(getGmailOAuthFeedback(null, null)).toBeNull();
    expect(getGmailOAuthFeedback('pending', null)).toBeNull();
  });
});
