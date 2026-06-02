import { createClient } from 'npm:@supabase/supabase-js@2';

const maxConnectionsPerRun = 2;
const scheduledMessageLimit = 12;
const retryDelayMs = 60 * 60 * 1000;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nextAttemptIso() {
  return new Date(Date.now() + retryDelayMs).toISOString();
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500);

  const cronSecret = request.headers.get('x-retiflow-cron-secret')?.trim() ?? '';
  if (!cronSecret) return jsonResponse({ error: 'Autenticação interna obrigatória.' }, 401);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: secretIsValid, error: secretError } = await service
    .schema('RetificaPremium')
    .rpc('validate_gmail_auto_sync_cron_secret', { p_secret: cronSecret });

  if (secretError || secretIsValid !== true) return jsonResponse({ error: 'Autenticação interna inválida.' }, 401);

  const now = new Date().toISOString();
  const { data: connections, error: connectionError } = await service
    .schema('RetificaPremium')
    .from('Gmail_Connections')
    .select('id_gmail_connections,fk_auth_user,auto_sync_failures')
    .eq('status', 'CONNECTED')
    .eq('sync_enabled', true)
    .eq('auto_sync_enabled', true)
    .or(`next_auto_sync_at.is.null,next_auto_sync_at.lte.${now}`)
    .order('next_auto_sync_at', { ascending: true, nullsFirst: true })
    .limit(maxConnectionsPerRun);

  if (connectionError) {
    console.error('[gmail-auto-sync-dispatch] Falha ao carregar conexões elegíveis', connectionError.message);
    return jsonResponse({ error: 'Não foi possível carregar as conexões elegíveis.' }, 500);
  }

  let processed = 0;
  let failed = 0;
  for (const connection of connections ?? []) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/gmail-scan-payables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-retiflow-cron-secret': cronSecret,
        },
        body: JSON.stringify({
          scheduledUserId: connection.fk_auth_user,
          maxMessages: scheduledMessageLimit,
        }),
      });

      if (!response.ok) {
        throw new Error(`scanner respondeu ${response.status}`);
      }

      processed += 1;
    } catch (error) {
      failed += 1;
      console.error('[gmail-auto-sync-dispatch] Falha em uma conexão agendada', {
        connectionId: connection.id_gmail_connections,
        error: error instanceof Error ? error.message : 'erro desconhecido',
      });
      await service
        .schema('RetificaPremium')
        .from('Gmail_Connections')
        .update({
          next_auto_sync_at: nextAttemptIso(),
          auto_sync_failures: Number(connection.auto_sync_failures ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id_gmail_connections', connection.id_gmail_connections);
    }
  }

  return jsonResponse({ eligible: connections?.length ?? 0, processed, failed }, 200);
});
