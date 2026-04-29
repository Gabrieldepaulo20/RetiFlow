create table if not exists "RetificaPremium"."Sessoes_Suporte" (
  id_sessao_suporte uuid primary key default gen_random_uuid(),
  fk_actor_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  fk_target_usuarios uuid not null references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  actor_email text not null,
  target_email text not null,
  motivo text not null check (char_length(motivo) between 8 and 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sessoes_suporte_different_users check (fk_actor_usuarios <> fk_target_usuarios),
  constraint sessoes_suporte_valid_period check (expires_at > started_at)
);

create index if not exists idx_sessoes_suporte_actor_started
  on "RetificaPremium"."Sessoes_Suporte"(fk_actor_usuarios, started_at desc);

create index if not exists idx_sessoes_suporte_target_started
  on "RetificaPremium"."Sessoes_Suporte"(fk_target_usuarios, started_at desc);

alter table "RetificaPremium"."Sessoes_Suporte" enable row level security;

revoke all on table "RetificaPremium"."Sessoes_Suporte" from anon, authenticated;
grant all on table "RetificaPremium"."Sessoes_Suporte" to service_role;
