-- Deixa explicito o deny-by-default do painel privado e cobre todas as novas
-- foreign keys com indices. Service role continua sendo o unico caminho de
-- leitura/escrita, sempre por Edge Function validada.

drop policy if exists marketing_client_attributions_authenticated_deny
  on "RetificaPremium"."Marketing_Client_Attributions";
create policy marketing_client_attributions_authenticated_deny
  on "RetificaPremium"."Marketing_Client_Attributions"
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists marketing_commission_snapshots_authenticated_deny
  on "RetificaPremium"."Marketing_Commission_Snapshots";
create policy marketing_commission_snapshots_authenticated_deny
  on "RetificaPremium"."Marketing_Commission_Snapshots"
  for all
  to authenticated
  using (false)
  with check (false);

create index if not exists idx_marketing_leads_event
  on "RetificaPremium"."Marketing_Leads"(event_id)
  where event_id is not null;

create index if not exists idx_marketing_leads_client
  on "RetificaPremium"."Marketing_Leads"(fk_clientes)
  where fk_clientes is not null;

create index if not exists idx_marketing_attributions_client
  on "RetificaPremium"."Marketing_Client_Attributions"(fk_clientes);

create index if not exists idx_marketing_attributions_lead
  on "RetificaPremium"."Marketing_Client_Attributions"(fk_marketing_leads)
  where fk_marketing_leads is not null;

create index if not exists idx_marketing_attributions_actor
  on "RetificaPremium"."Marketing_Client_Attributions"(attributed_by)
  where attributed_by is not null;

create index if not exists idx_marketing_commission_client
  on "RetificaPremium"."Marketing_Commission_Snapshots"(fk_clientes);

create index if not exists idx_marketing_commission_note
  on "RetificaPremium"."Marketing_Commission_Snapshots"(fk_notas_servico);

create index if not exists idx_marketing_commission_attribution
  on "RetificaPremium"."Marketing_Commission_Snapshots"(fk_marketing_client_attributions);
