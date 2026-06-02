export type GmailApiFailureCode =
  | 'gmail_api_disabled'
  | 'gmail_permission_missing'
  | 'gmail_auth_expired'
  | 'gmail_rate_limited'
  | 'gmail_unavailable';

export type GmailApiFailure = {
  code: GmailApiFailureCode;
  message: string;
};

export async function classifyGmailApiFailure(
  response: Response,
  operation: string,
): Promise<GmailApiFailure> {
  const body = await response.clone().text().catch(() => '');
  const normalizedBody = body.toLowerCase();

  console.error(`Gmail API ${operation} failed`, {
    status: response.status,
    body: body.slice(0, 500),
  });

  if (response.status === 401) {
    return {
      code: 'gmail_auth_expired',
      message: 'A autorização do Gmail expirou ou foi revogada. Reconecte a conta.',
    };
  }

  if (response.status === 429) {
    return {
      code: 'gmail_rate_limited',
      message: 'O Gmail limitou temporariamente a busca. Aguarde alguns minutos e tente novamente.',
    };
  }

  if (
    response.status === 403
    && (
      normalizedBody.includes('accessnotconfigured')
      || normalizedBody.includes('access_not_configured')
      || normalizedBody.includes('service_disabled')
      || normalizedBody.includes('gmail api has not been used')
    )
  ) {
    return {
      code: 'gmail_api_disabled',
      message: 'A API do Gmail não está habilitada no Google Cloud. Ative a Gmail API e reconecte a conta.',
    };
  }

  if (response.status === 403) {
    return {
      code: 'gmail_permission_missing',
      message: 'A autorização do Gmail não concedeu permissão de leitura. Reconecte a conta e aceite a permissão solicitada.',
    };
  }

  return {
    code: 'gmail_unavailable',
    message: `Não foi possível acessar o Gmail agora (${response.status}). Tente novamente em instantes.`,
  };
}
