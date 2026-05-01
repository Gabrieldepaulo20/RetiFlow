const GMAIL_OAUTH_MESSAGES: Record<string, string> = {
  access_denied: 'A conexão foi cancelada no Google.',
  callback_invalido: 'O retorno do Google veio incompleto. Tente conectar novamente.',
  configuracao_ausente: 'A integração Gmail ainda precisa de configuração no servidor.',
  configuracao_google: 'As credenciais Google OAuth ainda não estão configuradas no servidor.',
  configuracao_supabase: 'A configuração Supabase da integração Gmail está incompleta no servidor.',
  criptografia_token: 'A chave segura para guardar o token do Gmail ainda não está configurada.',
  email_gmail: 'Não foi possível identificar o e-mail da conta Gmail autorizada.',
  perfil_gmail: 'Não foi possível ler o perfil da conta Gmail autorizada.',
  salvar_conexao: 'A autorização foi aceita, mas não conseguimos salvar a conexão.',
  sem_refresh_token: 'O Google não retornou permissão offline. Reconecte e aceite o consentimento.',
  state_expirado: 'A tentativa de conexão expirou. Inicie a conexão novamente.',
  token_google: 'Não foi possível concluir a troca de autorização com o Google.',
};

export function getGmailOAuthFeedback(status: string | null, message: string | null) {
  if (status === 'connected') {
    return {
      title: 'Gmail conectado',
      description: 'A conta foi autorizada. Você já pode buscar sugestões de contas.',
      variant: 'default' as const,
    };
  }

  if (status === 'error') {
    const key = (message ?? '').trim();
    return {
      title: 'Não foi possível conectar o Gmail',
      description: GMAIL_OAUTH_MESSAGES[key] ?? 'A conexão com o Google falhou. Tente novamente.',
      variant: 'destructive' as const,
    };
  }

  return null;
}
