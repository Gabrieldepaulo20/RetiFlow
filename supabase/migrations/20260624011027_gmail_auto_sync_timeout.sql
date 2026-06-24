-- Evita que o pg_net aborte a busca automatica do Gmail antes da Edge Function
-- terminar de varrer o mes e gravar a telemetria. Nao altera dados de clientes
-- nem credenciais; apenas recria o mesmo cron com timeout explicito.

do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'retiflow-gmail-auto-sync'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'retiflow-gmail-auto-sync',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'retiflow_project_url'
      ) || '/functions/v1/gmail-auto-sync-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-retiflow-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'gmail_auto_sync_cron_secret'
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
