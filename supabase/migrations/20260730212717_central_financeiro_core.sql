-- Central Financeiro do Retiflow
-- Fundação aditiva: contas financeiras, razão imutável, recebíveis manuais,
-- recorrências, anexos privados, RPCs autenticadas e leituras de suporte.
--
-- Segurança:
--   * tabelas com RLS;
--   * escrita somente por RPC SECURITY DEFINER com search_path vazio;
--   * execução revogada de PUBLIC/anon;
--   * suporte possui apenas variantes de leitura.
--
-- Rollback documentado no fim. O rollback remove somente os objetos novos;
-- colunas-resumo adicionadas ao legado devem ser mantidas enquanto houver
-- movimentos, para não perder compatibilidade.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Compatibilidade aditiva com O.S., fechamentos e contas a pagar
-- ---------------------------------------------------------------------------

alter table "RetificaPremium"."Notas_de_Servico"
  add column if not exists valor_recebido numeric(14,2) not null default 0,
  add column if not exists receber_em date;

alter table "RetificaPremium"."Notas_de_Servico"
  drop constraint if exists notas_payment_status_chk;
alter table "RetificaPremium"."Notas_de_Servico"
  add constraint notas_payment_status_chk
  check (payment_status in ('PENDENTE', 'PARCIAL', 'PAGO'));

alter table "RetificaPremium"."Notas_de_Servico"
  drop constraint if exists notas_valor_recebido_chk;
alter table "RetificaPremium"."Notas_de_Servico"
  add constraint notas_valor_recebido_chk
  check (valor_recebido >= 0);

alter table "RetificaPremium"."Fechamentos"
  add column if not exists valor_recebido numeric(14,2) not null default 0,
  add column if not exists vencimento_em date;

alter table "RetificaPremium"."Fechamentos"
  drop constraint if exists fechamentos_status_pagamento_check;
alter table "RetificaPremium"."Fechamentos"
  add constraint fechamentos_status_pagamento_check
  check (status_pagamento in ('PENDENTE', 'PARCIAL', 'PAGO'));

alter table "RetificaPremium"."Fechamentos"
  drop constraint if exists fechamentos_valor_recebido_chk;
alter table "RetificaPremium"."Fechamentos"
  add constraint fechamentos_valor_recebido_chk
  check (valor_recebido >= 0);

-- ---------------------------------------------------------------------------
-- 2. Estruturas financeiras
-- ---------------------------------------------------------------------------

create table if not exists "RetificaPremium"."Financeiro_Contas" (
  id_financeiro_contas uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  nome text not null,
  tipo text not null default 'CAIXA'
    check (tipo in ('CAIXA', 'BANCO', 'PIX', 'CARTEIRA', 'OUTRA')),
  saldo_inicial numeric(14,2),
  data_corte date not null default date '2026-06-01',
  saldo_inicial_confirmado boolean not null default false,
  padrao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_contas_nome_chk
    check (char_length(btrim(nome)) between 2 and 80)
);

create unique index if not exists financeiro_contas_owner_nome_uidx
  on "RetificaPremium"."Financeiro_Contas"
  (fk_criado_por, lower(btrim(nome)));
create unique index if not exists financeiro_contas_owner_padrao_uidx
  on "RetificaPremium"."Financeiro_Contas"(fk_criado_por)
  where padrao and ativo;
create index if not exists financeiro_contas_owner_ativo_idx
  on "RetificaPremium"."Financeiro_Contas"(fk_criado_por, ativo, padrao desc);

create table if not exists "RetificaPremium"."Categorias_Entradas" (
  id_categorias_entradas uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  nome text not null,
  cor text not null default 'bg-blue-100 text-blue-800',
  icone text not null default 'ArrowDownToLine',
  impacta_dre boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorias_entradas_nome_chk
    check (char_length(btrim(nome)) between 2 and 80)
);

create unique index if not exists categorias_entradas_owner_nome_uidx
  on "RetificaPremium"."Categorias_Entradas"
  (fk_criado_por, lower(btrim(nome)));
create index if not exists categorias_entradas_owner_ativo_idx
  on "RetificaPremium"."Categorias_Entradas"(fk_criado_por, ativo);

create table if not exists "RetificaPremium"."Financeiro_Recebiveis_Manuais" (
  id_financeiro_recebiveis_manuais uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  fk_categorias_entradas uuid
    references "RetificaPremium"."Categorias_Entradas"(id_categorias_entradas)
    on delete set null,
  fk_clientes uuid
    references "RetificaPremium"."Clientes"(id_clientes) on delete set null,
  cliente_nome text,
  descricao text not null,
  valor_previsto numeric(14,2) not null check (valor_previsto > 0),
  valor_recebido numeric(14,2) not null default 0 check (valor_recebido >= 0),
  data_vencimento date not null,
  data_competencia date not null,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO')),
  observacoes text,
  chave_idempotencia text,
  impacta_dre boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_recebiveis_descricao_chk
    check (char_length(btrim(descricao)) between 2 and 180)
);

create index if not exists financeiro_recebiveis_owner_vencimento_idx
  on "RetificaPremium"."Financeiro_Recebiveis_Manuais"
  (fk_criado_por, data_vencimento, status);
create index if not exists financeiro_recebiveis_categoria_idx
  on "RetificaPremium"."Financeiro_Recebiveis_Manuais"(fk_categorias_entradas);
create index if not exists financeiro_recebiveis_cliente_idx
  on "RetificaPremium"."Financeiro_Recebiveis_Manuais"(fk_clientes);
create unique index if not exists financeiro_recebiveis_owner_idempotencia_uidx
  on "RetificaPremium"."Financeiro_Recebiveis_Manuais"(fk_criado_por,chave_idempotencia)
  where chave_idempotencia is not null;

create table if not exists "RetificaPremium"."Financeiro_Modelos_Recorrentes" (
  id_financeiro_modelos_recorrentes uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  fk_categorias uuid not null
    references "RetificaPremium"."Categorias_Contas_Pagar"(id_categorias)
    on delete restrict,
  fk_fornecedores uuid
    references "RetificaPremium"."Fornecedores_Contas_Pagar"(id_fornecedores)
    on delete set null,
  titulo text not null,
  nome_fornecedor text,
  valor_original numeric(14,2) not null check (valor_original > 0),
  juros numeric(14,2) not null default 0 check (juros >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0),
  forma_pagamento_prevista text,
  recorrencia text not null default 'MENSAL'
    check (recorrencia in (
      'SEMANAL', 'QUINZENAL', 'MENSAL', 'BIMESTRAL',
      'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'
    )),
  dia_vencimento smallint not null default 10
    check (dia_vencimento between 1 and 31),
  proxima_competencia date not null,
  data_fim date,
  observacoes text,
  favorecido_tipo text not null default 'FORNECEDOR'
    check (favorecido_tipo in ('FORNECEDOR', 'FUNCIONARIO')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_modelos_titulo_chk
    check (char_length(btrim(titulo)) between 2 and 180),
  constraint financeiro_modelos_periodo_chk
    check (data_fim is null or data_fim >= proxima_competencia)
);

create index if not exists financeiro_modelos_owner_ativo_idx
  on "RetificaPremium"."Financeiro_Modelos_Recorrentes"
  (fk_criado_por, ativo, proxima_competencia);
create index if not exists financeiro_modelos_categoria_idx
  on "RetificaPremium"."Financeiro_Modelos_Recorrentes"(fk_categorias);
create index if not exists financeiro_modelos_fornecedor_idx
  on "RetificaPremium"."Financeiro_Modelos_Recorrentes"(fk_fornecedores);

alter table "RetificaPremium"."Contas_Pagar"
  add column if not exists fk_modelo_recorrente uuid
    references "RetificaPremium"."Financeiro_Modelos_Recorrentes"
      (id_financeiro_modelos_recorrentes) on delete set null,
  add column if not exists competencia_recorrencia date;

create unique index if not exists contas_pagar_modelo_competencia_uidx
  on "RetificaPremium"."Contas_Pagar"
  (fk_modelo_recorrente, competencia_recorrencia)
  where fk_modelo_recorrente is not null
    and competencia_recorrencia is not null;
create index if not exists contas_pagar_modelo_recorrente_idx
  on "RetificaPremium"."Contas_Pagar"(fk_modelo_recorrente);

create table if not exists "RetificaPremium"."Financeiro_Movimentos" (
  id_financeiro_movimentos uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  fk_financeiro_contas uuid not null
    references "RetificaPremium"."Financeiro_Contas"(id_financeiro_contas)
    on delete restrict,
  direcao text not null check (direcao in ('ENTRADA', 'SAIDA')),
  tipo_movimento text not null check (tipo_movimento in (
    'RECEBIMENTO_OS',
    'RECEBIMENTO_FECHAMENTO',
    'RECEBIMENTO_MANUAL',
    'RECEITA_AVULSA',
    'PAGAMENTO_CONTA',
    'APORTE',
    'REEMBOLSO',
    'AJUSTE',
    'TRANSFERENCIA',
    'ESTORNO'
  )),
  valor numeric(14,2) not null check (valor > 0),
  data_efetiva timestamptz,
  data_competencia date,
  forma_pagamento text,
  descricao text not null,
  observacoes text,
  status text not null default 'CONFIRMADO'
    check (status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR', 'ESTORNADO')),
  impacta_dre boolean not null default false,
  fk_categorias_entradas uuid
    references "RetificaPremium"."Categorias_Entradas"(id_categorias_entradas)
    on delete set null,
  fk_categorias_saidas uuid
    references "RetificaPremium"."Categorias_Contas_Pagar"(id_categorias)
    on delete set null,
  fk_notas_servico uuid
    references "RetificaPremium"."Notas_de_Servico"(id_notas_servico)
    on delete restrict,
  fk_fechamentos uuid
    references "RetificaPremium"."Fechamentos"(id_fechamentos)
    on delete restrict,
  fk_contas_pagar uuid
    references "RetificaPremium"."Contas_Pagar"(id_contas_pagar)
    on delete restrict,
  fk_recebivel_manual uuid
    references "RetificaPremium"."Financeiro_Recebiveis_Manuais"
      (id_financeiro_recebiveis_manuais) on delete restrict,
  fk_movimento_origem uuid
    references "RetificaPremium"."Financeiro_Movimentos"
      (id_financeiro_movimentos) on delete restrict,
  fk_transferencia uuid,
  chave_idempotencia text,
  fk_registrado_por uuid
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  estornado_em timestamptz,
  motivo_estorno text,
  fk_estornado_por uuid
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint financeiro_movimentos_data_status_chk check (
    (status = 'REVISAR' and data_efetiva is null)
    or (status <> 'REVISAR' and data_efetiva is not null)
  ),
  constraint financeiro_movimentos_origem_unica_chk check (
    num_nonnulls(
      fk_notas_servico,
      fk_fechamentos,
      fk_contas_pagar,
      fk_recebivel_manual
    ) <= 1
  ),
  constraint financeiro_movimentos_estorno_chk check (
    (tipo_movimento = 'ESTORNO' and fk_movimento_origem is not null)
    or (tipo_movimento <> 'ESTORNO')
  )
);

create unique index if not exists financeiro_movimentos_owner_idempotencia_uidx
  on "RetificaPremium"."Financeiro_Movimentos"
  (fk_criado_por, chave_idempotencia)
  where chave_idempotencia is not null;
create unique index if not exists financeiro_movimentos_estorno_origem_uidx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_movimento_origem)
  where tipo_movimento = 'ESTORNO';
create index if not exists financeiro_movimentos_owner_data_idx
  on "RetificaPremium"."Financeiro_Movimentos"
  (fk_criado_por, data_efetiva desc, id_financeiro_movimentos);
create index if not exists financeiro_movimentos_conta_data_idx
  on "RetificaPremium"."Financeiro_Movimentos"
  (fk_financeiro_contas, data_efetiva desc);
create index if not exists financeiro_movimentos_nota_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_notas_servico);
create index if not exists financeiro_movimentos_fechamento_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_fechamentos);
create index if not exists financeiro_movimentos_conta_pagar_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_contas_pagar);
create index if not exists financeiro_movimentos_recebivel_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_recebivel_manual);
create index if not exists financeiro_movimentos_categoria_entrada_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_categorias_entradas);
create index if not exists financeiro_movimentos_categoria_saida_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_categorias_saidas);
create index if not exists financeiro_movimentos_registrado_por_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_registrado_por);
create index if not exists financeiro_movimentos_estornado_por_idx
  on "RetificaPremium"."Financeiro_Movimentos"(fk_estornado_por);

create table if not exists "RetificaPremium"."Financeiro_Anexos" (
  id_financeiro_anexos uuid primary key default gen_random_uuid(),
  fk_criado_por uuid not null
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete restrict,
  fk_financeiro_movimentos uuid not null
    references "RetificaPremium"."Financeiro_Movimentos"
      (id_financeiro_movimentos) on delete cascade,
  storage_path text not null,
  nome_arquivo text not null,
  tipo_mime text,
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),
  fk_registrado_por uuid
    references "RetificaPremium"."Usuarios"(id_usuarios) on delete set null,
  created_at timestamptz not null default now(),
  constraint financeiro_anexos_path_chk
    check (char_length(btrim(storage_path)) between 3 and 500),
  constraint financeiro_anexos_nome_chk
    check (char_length(btrim(nome_arquivo)) between 1 and 180)
);

create unique index if not exists financeiro_anexos_owner_path_uidx
  on "RetificaPremium"."Financeiro_Anexos"(fk_criado_por, storage_path);
create index if not exists financeiro_anexos_movimento_idx
  on "RetificaPremium"."Financeiro_Anexos"(fk_financeiro_movimentos);
create index if not exists financeiro_anexos_registrado_por_idx
  on "RetificaPremium"."Financeiro_Anexos"(fk_registrado_por);

-- ---------------------------------------------------------------------------
-- 3. Helpers de identidade, permissão e conta padrão
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".current_financeiro_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id_usuarios
  from "RetificaPremium"."Usuarios" u
  join "RetificaPremium"."Modulos" m
    on m.fk_usuarios = u.id_usuarios
  where u.auth_id = (select auth.uid())
    and u.status = true
    and m.contas_a_pagar = true
  limit 1
$$;

revoke execute on function
  "RetificaPremium".current_financeiro_usuario_id()
  from public, anon;
grant execute on function
  "RetificaPremium".current_financeiro_usuario_id()
  to authenticated, service_role;

create or replace function "RetificaPremium".require_financeiro_usuario_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacao necessaria.' using errcode = 'P0401';
  end if;

  v_usuario_id := "RetificaPremium".current_financeiro_usuario_id();
  if v_usuario_id is null then
    raise exception 'Modulo Financeiro nao habilitado para este usuario.'
      using errcode = 'P0403';
  end if;

  return v_usuario_id;
end;
$$;

revoke execute on function
  "RetificaPremium".require_financeiro_usuario_id()
  from public, anon;
grant execute on function
  "RetificaPremium".require_financeiro_usuario_id()
  to authenticated, service_role;

create or replace function "RetificaPremium".assert_financeiro_target_access(
  p_usuario_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_usuario_id is null or not exists (
    select 1
    from "RetificaPremium"."Usuarios" u
    join "RetificaPremium"."Modulos" m
      on m.fk_usuarios = u.id_usuarios
    where u.id_usuarios = p_usuario_id
      and u.status = true
      and m.contas_a_pagar = true
  ) then
    raise exception 'Modulo Financeiro nao habilitado para o contexto.'
      using errcode = 'P0403';
  end if;
end;
$$;

revoke execute on function
  "RetificaPremium".assert_financeiro_target_access(uuid)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".assert_financeiro_target_access(uuid)
  to service_role;

create or replace function "RetificaPremium".financeiro_contexto_leitura(
  p_contexto_usuario_id uuid,p_sessao_suporte uuid
)
returns uuid
language plpgsql stable security definer set search_path=''
as $$
declare v_usuario uuid;
begin
  v_usuario:="RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,p_sessao_suporte);
  perform "RetificaPremium".assert_financeiro_target_access(v_usuario);
  return v_usuario;
end $$;
revoke execute on function "RetificaPremium".financeiro_contexto_leitura(uuid,uuid)
  from public,anon,authenticated;
grant execute on function "RetificaPremium".financeiro_contexto_leitura(uuid,uuid)
  to service_role;

create or replace function "RetificaPremium".garantir_conta_financeira_padrao(
  p_usuario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
begin
  select fc.id_financeiro_contas
    into v_conta_id
  from "RetificaPremium"."Financeiro_Contas" fc
  where fc.fk_criado_por = p_usuario_id
    and fc.ativo
  order by fc.padrao desc, fc.created_at
  limit 1;

  if v_conta_id is null then
    insert into "RetificaPremium"."Financeiro_Contas" (
      fk_criado_por,
      nome,
      tipo,
      saldo_inicial,
      data_corte,
      saldo_inicial_confirmado,
      padrao
    ) values (
      p_usuario_id,
      'Caixa geral',
      'CAIXA',
      null,
      date '2026-06-01',
      false,
      true
    )
    returning id_financeiro_contas into v_conta_id;
  end if;

  return v_conta_id;
end;
$$;

revoke execute on function
  "RetificaPremium".garantir_conta_financeira_padrao(uuid)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".garantir_conta_financeira_padrao(uuid)
  to service_role;

-- Defaults para tenants existentes. Nenhum saldo é inferido.
insert into "RetificaPremium"."Financeiro_Contas" (
  fk_criado_por,
  nome,
  tipo,
  saldo_inicial,
  data_corte,
  saldo_inicial_confirmado,
  padrao
)
select
  u.id_usuarios,
  'Caixa geral',
  'CAIXA',
  null,
  date '2026-06-01',
  false,
  true
from "RetificaPremium"."Usuarios" u
join "RetificaPremium"."Modulos" m
  on m.fk_usuarios = u.id_usuarios
where u.status = true
  and m.contas_a_pagar = true
on conflict do nothing;

insert into "RetificaPremium"."Categorias_Entradas" (
  fk_criado_por,
  nome,
  cor,
  icone,
  impacta_dre
)
select
  u.id_usuarios,
  seed.nome,
  seed.cor,
  seed.icone,
  seed.impacta_dre
from "RetificaPremium"."Usuarios" u
join "RetificaPremium"."Modulos" m
  on m.fk_usuarios = u.id_usuarios
cross join (
  values
    ('Servicos / O.S.', 'bg-blue-100 text-blue-800', 'Wrench', true),
    ('Fechamentos', 'bg-indigo-100 text-indigo-800', 'Files', true),
    ('Receita avulsa', 'bg-emerald-100 text-emerald-800', 'ArrowDownToLine', true),
    ('Aporte', 'bg-cyan-100 text-cyan-800', 'Landmark', false),
    ('Reembolso', 'bg-amber-100 text-amber-800', 'RotateCcw', false),
    ('Ajuste', 'bg-slate-100 text-slate-800', 'SlidersHorizontal', false)
) as seed(nome, cor, icone, impacta_dre)
where u.status = true
  and m.contas_a_pagar = true
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS: leitura própria; nenhuma escrita direta pelo cliente
-- ---------------------------------------------------------------------------

alter table "RetificaPremium"."Financeiro_Contas" enable row level security;
alter table "RetificaPremium"."Categorias_Entradas" enable row level security;
alter table "RetificaPremium"."Financeiro_Recebiveis_Manuais" enable row level security;
alter table "RetificaPremium"."Financeiro_Modelos_Recorrentes" enable row level security;
alter table "RetificaPremium"."Financeiro_Movimentos" enable row level security;
alter table "RetificaPremium"."Financeiro_Anexos" enable row level security;

drop policy if exists financeiro_contas_select_own
  on "RetificaPremium"."Financeiro_Contas";
create policy financeiro_contas_select_own
  on "RetificaPremium"."Financeiro_Contas"
  for select to authenticated
  using (
    fk_criado_por =
      (select "RetificaPremium".current_financeiro_usuario_id())
  );

drop policy if exists categorias_entradas_select_own
  on "RetificaPremium"."Categorias_Entradas";
create policy categorias_entradas_select_own
  on "RetificaPremium"."Categorias_Entradas"
  for select to authenticated
  using (
    fk_criado_por =
      (select "RetificaPremium".current_financeiro_usuario_id())
  );

drop policy if exists financeiro_recebiveis_select_own
  on "RetificaPremium"."Financeiro_Recebiveis_Manuais";
create policy financeiro_recebiveis_select_own
  on "RetificaPremium"."Financeiro_Recebiveis_Manuais"
  for select to authenticated
  using (
    fk_criado_por =
      (select "RetificaPremium".current_financeiro_usuario_id())
  );

drop policy if exists financeiro_modelos_select_own
  on "RetificaPremium"."Financeiro_Modelos_Recorrentes";
create policy financeiro_modelos_select_own
  on "RetificaPremium"."Financeiro_Modelos_Recorrentes"
  for select to authenticated
  using (
    fk_criado_por =
      (select "RetificaPremium".current_financeiro_usuario_id())
  );

drop policy if exists financeiro_movimentos_select_own
  on "RetificaPremium"."Financeiro_Movimentos";
create policy financeiro_movimentos_select_own
  on "RetificaPremium"."Financeiro_Movimentos"
  for select to authenticated
  using (
    fk_criado_por =
      (select "RetificaPremium".current_financeiro_usuario_id())
  );

drop policy if exists financeiro_anexos_select_own
  on "RetificaPremium"."Financeiro_Anexos";
create policy financeiro_anexos_select_own
  on "RetificaPremium"."Financeiro_Anexos"
  for select to authenticated
  using (
    fk_criado_por =
      (select "RetificaPremium".current_financeiro_usuario_id())
  );

revoke all on table
  "RetificaPremium"."Financeiro_Contas",
  "RetificaPremium"."Categorias_Entradas",
  "RetificaPremium"."Financeiro_Recebiveis_Manuais",
  "RetificaPremium"."Financeiro_Modelos_Recorrentes",
  "RetificaPremium"."Financeiro_Movimentos",
  "RetificaPremium"."Financeiro_Anexos"
  from public, anon, authenticated;

grant select on table
  "RetificaPremium"."Financeiro_Contas",
  "RetificaPremium"."Categorias_Entradas",
  "RetificaPremium"."Financeiro_Recebiveis_Manuais",
  "RetificaPremium"."Financeiro_Modelos_Recorrentes",
  "RetificaPremium"."Financeiro_Movimentos",
  "RetificaPremium"."Financeiro_Anexos"
  to authenticated;
grant all on table
  "RetificaPremium"."Financeiro_Contas",
  "RetificaPremium"."Categorias_Entradas",
  "RetificaPremium"."Financeiro_Recebiveis_Manuais",
  "RetificaPremium"."Financeiro_Modelos_Recorrentes",
  "RetificaPremium"."Financeiro_Movimentos",
  "RetificaPremium"."Financeiro_Anexos"
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Motor transacional do razão
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".financeiro_validar_conta(
  p_usuario_id uuid,
  p_conta_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_conta_id uuid;
begin
  v_conta_id := coalesce(
    p_conta_id,
    "RetificaPremium".garantir_conta_financeira_padrao(p_usuario_id)
  );
  if not exists (
    select 1
    from "RetificaPremium"."Financeiro_Contas" c
    where c.id_financeiro_contas = v_conta_id
      and c.fk_criado_por = p_usuario_id
      and c.ativo
  ) then
    raise exception 'Conta financeira invalida para este usuario.'
      using errcode = 'P0403';
  end if;
  return v_conta_id;
end;
$$;

create or replace function "RetificaPremium".financeiro_recalcular_origem(
  p_nota_id uuid default null,
  p_fechamento_id uuid default null,
  p_conta_pagar_id uuid default null,
  p_recebivel_manual_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(14,2);
  v_realizado numeric(14,2);
  v_status text;
  v_data timestamptz;
  v_forma text;
begin
  perform set_config('retiflow.financeiro_internal', 'on', true);

  if p_nota_id is not null then
    select greatest(coalesce(n.total, 0), 0)
      into v_total
    from "RetificaPremium"."Notas_de_Servico" n
    where n.id_notas_servico = p_nota_id
    for update;

    select coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0),
           max(m.data_efetiva) filter (where m.direcao = 'ENTRADA')
      into v_realizado, v_data
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_notas_servico = p_nota_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');

    select m.forma_pagamento into v_forma
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_notas_servico = p_nota_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.direcao = 'ENTRADA'
    order by m.data_efetiva desc, m.created_at desc limit 1;

    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    v_status := case
      when v_realizado <= 0.004 then 'PENDENTE'
      when v_realizado + 0.004 >= v_total then 'PAGO'
      else 'PARCIAL'
    end;
    update "RetificaPremium"."Notas_de_Servico"
       set valor_recebido = least(v_realizado, v_total),
           payment_status = v_status,
           pago_em = case when v_realizado > 0
             then v_data at time zone 'America/Sao_Paulo' else null end,
           pago_com = case when v_realizado > 0 then v_forma else null end
     where id_notas_servico = p_nota_id;
  end if;

  if p_fechamento_id is not null then
    select greatest(coalesce(f.valor_total, 0), 0)
      into v_total
    from "RetificaPremium"."Fechamentos" f
    where f.id_fechamentos = p_fechamento_id
    for update;

    select coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0),
           max(m.data_efetiva) filter (where m.direcao = 'ENTRADA')
      into v_realizado, v_data
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = p_fechamento_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');

    select m.forma_pagamento into v_forma
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = p_fechamento_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.direcao = 'ENTRADA'
    order by m.data_efetiva desc, m.created_at desc limit 1;

    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    v_status := case
      when v_realizado <= 0.004 then 'PENDENTE'
      when v_realizado + 0.004 >= v_total then 'PAGO'
      else 'PARCIAL'
    end;
    update "RetificaPremium"."Fechamentos"
       set valor_recebido = least(v_realizado, v_total),
           status_pagamento = v_status,
           pago_em = case when v_realizado > 0
             then v_data at time zone 'America/Sao_Paulo' else null end,
           pago_com = case when v_realizado > 0 then v_forma else null end,
           updated_at = now()
     where id_fechamentos = p_fechamento_id;

    -- Compatibilidade visual: as filhas refletem o fechamento, mas nunca
    -- recebem lançamentos próprios no razão.
    with independentes as (
      select n2.id_notas_servico,
             coalesce(sum(case when m.direcao='ENTRADA' then m.valor else -m.valor end),0) valor,
             max(m.data_efetiva) at time zone 'America/Sao_Paulo' data_efetiva,
             (array_agg(m.forma_pagamento order by m.data_efetiva desc)
               filter(where m.forma_pagamento is not null))[1] forma_pagamento
      from "RetificaPremium"."Notas_de_Servico" n2
      left join "RetificaPremium"."Financeiro_Movimentos" m
        on m.fk_notas_servico=n2.id_notas_servico
       and m.status in ('CONFIRMADO','ESTIMADO','REVISAR')
      where n2.fk_fechamentos=p_fechamento_id
      group by n2.id_notas_servico
    )
    update "RetificaPremium"."Notas_de_Servico" n
       set valor_recebido = case when v_status = 'PAGO' then n.total
             else least(n.total, greatest(coalesce(ind.valor,0),0)) end,
           payment_status = case
             when v_status = 'PAGO' or coalesce(ind.valor,0)+0.004>=n.total then 'PAGO'
             when coalesce(ind.valor,0)>0.004 then 'PARCIAL' else 'PENDENTE' end,
           pago_em = case
             when v_status = 'PAGO' then v_data at time zone 'America/Sao_Paulo'
             when coalesce(ind.valor,0)>0.004 then ind.data_efetiva else null end,
           pago_com = case
             when v_status = 'PAGO' then v_forma
             when coalesce(ind.valor,0)>0.004 then ind.forma_pagamento else null end
      from independentes ind
     where n.id_notas_servico=ind.id_notas_servico;
  end if;

  if p_conta_pagar_id is not null then
    select greatest(coalesce(c.valor_final, 0), 0)
      into v_total
    from "RetificaPremium"."Contas_Pagar" c
    where c.id_contas_pagar = p_conta_pagar_id
    for update;

    select coalesce(sum(case when m.direcao = 'SAIDA' then m.valor else -m.valor end), 0),
           max(m.data_efetiva) filter (where m.direcao = 'SAIDA')
      into v_realizado, v_data
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_contas_pagar = p_conta_pagar_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');

    select m.forma_pagamento into v_forma
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_contas_pagar = p_conta_pagar_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.direcao = 'SAIDA'
    order by m.data_efetiva desc, m.created_at desc limit 1;

    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    v_status := case
      when v_realizado <= 0.004 then 'PENDENTE'
      when v_realizado + 0.004 >= v_total then 'PAGO'
      else 'PARCIAL'
    end;
    update "RetificaPremium"."Contas_Pagar"
       set valor_pago = least(v_realizado, v_total),
           status = v_status::"RetificaPremium".status_conta_pagar,
           pago_em = case when v_realizado > 0
             then v_data at time zone 'America/Sao_Paulo' else null end,
           pago_com = case
             when v_realizado > 0 and v_forma is not null
               then v_forma::"RetificaPremium".forma_pagamento
             else null
           end,
           updated_at = now()
     where id_contas_pagar = p_conta_pagar_id;
  end if;

  if p_recebivel_manual_id is not null then
    select r.valor_previsto into v_total
    from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.id_financeiro_recebiveis_manuais = p_recebivel_manual_id
    for update;
    select coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0)
      into v_realizado
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_recebivel_manual = p_recebivel_manual_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');
    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    update "RetificaPremium"."Financeiro_Recebiveis_Manuais"
       set valor_recebido = least(v_realizado, v_total),
           status = case
             when v_realizado <= 0.004 then 'PENDENTE'
             when v_realizado + 0.004 >= v_total then 'PAGO'
             else 'PARCIAL'
           end,
           updated_at = now()
     where id_financeiro_recebiveis_manuais = p_recebivel_manual_id;
  end if;
end;
$$;

create or replace function "RetificaPremium".financeiro_validar_data_conta(
  p_conta_id uuid,p_data_efetiva timestamptz
)
returns void
language plpgsql stable security definer set search_path=''
as $$
begin
  if p_data_efetiva is null or exists(
    select 1 from "RetificaPremium"."Financeiro_Contas" c
    where c.id_financeiro_contas=p_conta_id
      and (p_data_efetiva at time zone 'America/Sao_Paulo')::date<c.data_corte
  ) then
    raise exception 'Data efetiva anterior ao corte da conta financeira.'
      using errcode='P0602';
  end if;
end $$;

create or replace function "RetificaPremium".financeiro_movimento_por_idempotencia(
  p_usuario uuid,p_chave text,p_direcao text,p_tipo text,p_valor numeric,
  p_data_efetiva timestamptz,p_data_competencia date,p_conta uuid,p_forma text,
  p_status text,p_impacta_dre boolean,p_categoria_entrada uuid,
  p_categoria_saida uuid,p_nota uuid,p_fechamento uuid,p_conta_pagar uuid,
  p_recebivel uuid,p_movimento_origem uuid,p_transferencia uuid
)
returns uuid
language plpgsql stable security definer set search_path=''
as $$
declare v_existente record;
begin
  if exists(
    select 1 from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.fk_criado_por=p_usuario and r.chave_idempotencia=p_chave
  ) then
    raise exception 'Chave de idempotencia ja utilizada por um recebivel.'
      using errcode='P0602';
  end if;
  select m.* into v_existente
  from "RetificaPremium"."Financeiro_Movimentos" m
  where m.fk_criado_por=p_usuario and m.chave_idempotencia=p_chave;
  if not found then return null; end if;

  if v_existente.direcao is distinct from p_direcao
     or v_existente.tipo_movimento is distinct from p_tipo
     or v_existente.valor is distinct from p_valor
     or v_existente.data_efetiva is distinct from p_data_efetiva
     or v_existente.data_competencia is distinct from p_data_competencia
     or v_existente.fk_financeiro_contas is distinct from p_conta
     or v_existente.forma_pagamento is distinct from nullif(btrim(p_forma),'')
     or v_existente.status is distinct from p_status
     or v_existente.impacta_dre is distinct from coalesce(p_impacta_dre,false)
     or v_existente.fk_categorias_entradas is distinct from p_categoria_entrada
     or v_existente.fk_categorias_saidas is distinct from p_categoria_saida
     or v_existente.fk_notas_servico is distinct from p_nota
     or v_existente.fk_fechamentos is distinct from p_fechamento
     or v_existente.fk_contas_pagar is distinct from p_conta_pagar
     or v_existente.fk_recebivel_manual is distinct from p_recebivel
     or v_existente.fk_movimento_origem is distinct from p_movimento_origem
     or v_existente.fk_transferencia is distinct from p_transferencia then
    raise exception 'Chave de idempotencia ja utilizada por outra operacao financeira.'
      using errcode='P0602';
  end if;
  return v_existente.id_financeiro_movimentos;
end $$;

create or replace function "RetificaPremium".financeiro_bloquear_idempotencia(
  p_usuario uuid,p_chave text
)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if p_usuario is null or nullif(btrim(p_chave),'') is null then
    raise exception 'Usuario e chave de idempotencia sao obrigatorios.'
      using errcode='P0602';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_usuario::text||':'||p_chave,0)
  );
end $$;

create or replace function "RetificaPremium".financeiro_recebivel_por_idempotencia(
  p_usuario uuid,p_chave text,p_descricao text,p_valor numeric,p_vencimento date,
  p_competencia date,p_categoria uuid,p_cliente uuid,p_cliente_nome text,
  p_impacta_dre boolean
)
returns uuid
language plpgsql stable security definer set search_path=''
as $$
declare v_existente record;
begin
  if exists(
    select 1 from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por=p_usuario and m.chave_idempotencia=p_chave
  ) then
    raise exception 'Chave de idempotencia ja utilizada por um movimento financeiro.'
      using errcode='P0602';
  end if;
  select r.* into v_existente
  from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
  where r.fk_criado_por=p_usuario and r.chave_idempotencia=p_chave;
  if not found then return null; end if;
  if v_existente.descricao is distinct from btrim(p_descricao)
     or v_existente.valor_previsto is distinct from p_valor
     or v_existente.data_vencimento is distinct from p_vencimento
     or v_existente.data_competencia is distinct from coalesce(p_competencia,p_vencimento)
     or v_existente.fk_categorias_entradas is distinct from p_categoria
     or v_existente.fk_clientes is distinct from p_cliente
     or v_existente.cliente_nome is distinct from nullif(btrim(p_cliente_nome),'')
     or v_existente.impacta_dre is distinct from coalesce(p_impacta_dre,true) then
    raise exception 'Chave de idempotencia ja utilizada por outro recebivel.'
      using errcode='P0602';
  end if;
  return v_existente.id_financeiro_recebiveis_manuais;
end $$;

revoke execute on function "RetificaPremium".financeiro_validar_conta(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".financeiro_validar_data_conta(uuid,timestamptz)
  from public,anon,authenticated;
revoke execute on function "RetificaPremium".financeiro_movimento_por_idempotencia(
  uuid,text,text,text,numeric,timestamptz,date,uuid,text,text,boolean,uuid,uuid,
  uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated;
revoke execute on function "RetificaPremium".financeiro_bloquear_idempotencia(uuid,text)
  from public,anon,authenticated;
revoke execute on function "RetificaPremium".financeiro_recebivel_por_idempotencia(
  uuid,text,text,numeric,date,date,uuid,uuid,text,boolean
) from public,anon,authenticated;
revoke execute on function "RetificaPremium".financeiro_recalcular_origem(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function "RetificaPremium".financeiro_validar_conta(uuid, uuid),
  "RetificaPremium".financeiro_validar_data_conta(uuid,timestamptz),
  "RetificaPremium".financeiro_movimento_por_idempotencia(
    uuid,text,text,text,numeric,timestamptz,date,uuid,text,text,boolean,uuid,uuid,
    uuid,uuid,uuid,uuid,uuid,uuid
  ),
  "RetificaPremium".financeiro_bloquear_idempotencia(uuid,text),
  "RetificaPremium".financeiro_recebivel_por_idempotencia(
    uuid,text,text,numeric,date,date,uuid,uuid,text,boolean
  ),
  "RetificaPremium".financeiro_recalcular_origem(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function "RetificaPremium".registrar_recebimento_nota(
  p_id_notas_servico uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_idempotency_key text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_nota record;
  v_conta uuid;
  v_mov uuid;
  v_realizado numeric;
  v_competencia date;
  v_forma text;
  v_inserido boolean:=false;
begin
  if p_valor is null or p_valor <= 0 or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Valor, data e chave de idempotencia sao obrigatorios.'
      using errcode = 'P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  select n.*, c.fk_criado_por as owner_id into v_nota
  from "RetificaPremium"."Notas_de_Servico" n
  join "RetificaPremium"."Clientes" c on c.id_clientes = n.fk_clientes
  where n.id_notas_servico = p_id_notas_servico for update of n;
  if not found then raise exception 'O.S. nao encontrada.' using errcode = 'P0404'; end if;
  if v_nota.owner_id <> v_usuario then raise exception 'Sem permissao.' using errcode = 'P0403'; end if;
  if v_nota.fk_fechamentos is not null then
    raise exception 'O.S. vinculada a fechamento deve ser recebida pelo fechamento.'
      using errcode = 'P0602';
  end if;
  if not exists (
    select 1 from "RetificaPremium"."Status_Notas" s
    where s.id_status_notas = v_nota.fk_status
      and lower(s.nome) in ('entregue', 'recusada', 'sem conserto', 'finalizado')
  ) then
    raise exception 'O.S. ainda nao e faturavel.' using errcode = 'P0602';
  end if;
  v_conta := "RetificaPremium".financeiro_validar_conta(v_usuario, p_fk_conta_financeira);
  perform "RetificaPremium".financeiro_validar_data_conta(v_conta,p_data_efetiva);
  v_competencia:=coalesce(v_nota.receber_em,v_nota.created_at::date);
  v_forma:=nullif(btrim(p_forma_pagamento),'');
  v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
    v_usuario,p_idempotency_key,'ENTRADA','RECEBIMENTO_OS',p_valor,
    p_data_efetiva,v_competencia,v_conta,v_forma,'CONFIRMADO',false,
    null,null,p_id_notas_servico,null,null,null,null,null
  );
  if v_mov is null then
    if coalesce(v_nota.valor_recebido, 0) + p_valor > v_nota.total + 0.004 then
      raise exception 'Recebimento excede o valor em aberto.' using errcode = 'P0602';
    end if;
    insert into "RetificaPremium"."Financeiro_Movimentos" (
      fk_criado_por, fk_financeiro_contas, direcao, tipo_movimento, valor,
      data_efetiva, data_competencia, forma_pagamento, descricao, observacoes,
      impacta_dre, fk_notas_servico, chave_idempotencia, fk_registrado_por
    ) values (
      v_usuario, v_conta, 'ENTRADA', 'RECEBIMENTO_OS', p_valor,
      p_data_efetiva,v_competencia,v_forma,
      'Recebimento ' || v_nota.os, p_observacoes, false,
      p_id_notas_servico, p_idempotency_key, v_usuario
    )
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_mov;
    v_inserido:=v_mov is not null;
    if v_mov is null then
      v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,p_idempotency_key,'ENTRADA','RECEBIMENTO_OS',p_valor,
        p_data_efetiva,v_competencia,v_conta,v_forma,'CONFIRMADO',false,
        null,null,p_id_notas_servico,null,null,null,null,null
      );
    end if;
    if v_mov is null then
      raise exception 'Falha ao confirmar idempotencia do recebimento.' using errcode='P0602';
    end if;
    if v_inserido then
      perform "RetificaPremium".financeiro_recalcular_origem(p_id_notas_servico,null,null,null);
    end if;
  end if;
  select n.valor_recebido into v_realizado
  from "RetificaPremium"."Notas_de_Servico" n where n.id_notas_servico = p_id_notas_servico;
  return json_build_object('status', 200, 'mensagem', 'Recebimento registrado.',
    'dados', json_build_object('id_movimento', v_mov, 'movimento_id', v_mov,
      'status', case when v_realizado + 0.004 >= v_nota.total then 'PAGO' else 'PARCIAL' end,
      'valor_realizado', v_realizado, 'valor_aberto', greatest(v_nota.total-v_realizado,0)));
end;
$$;

create or replace function "RetificaPremium".registrar_recebimento_fechamento(
  p_id_fechamentos uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_idempotency_key text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_item record; v_conta uuid; v_mov uuid; v_realizado numeric;
  v_competencia date; v_forma text; v_inserido boolean:=false;
begin
  if p_valor is null or p_valor <= 0 or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Valor, data e chave de idempotencia sao obrigatorios.' using errcode='P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  select f.*, c.fk_criado_por owner_id, c.nome cliente_nome into v_item
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
  where f.id_fechamentos=p_id_fechamentos for update of f;
  if not found then raise exception 'Fechamento nao encontrado.' using errcode='P0404'; end if;
  if v_item.owner_id<>v_usuario then raise exception 'Sem permissao.' using errcode='P0403'; end if;
  v_conta := "RetificaPremium".financeiro_validar_conta(v_usuario,p_fk_conta_financeira);
  perform "RetificaPremium".financeiro_validar_data_conta(v_conta,p_data_efetiva);
  v_competencia:=coalesce(v_item.vencimento_em,v_item.data_fechamento::date);
  v_forma:=nullif(btrim(p_forma_pagamento),'');
  v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
    v_usuario,p_idempotency_key,'ENTRADA','RECEBIMENTO_FECHAMENTO',p_valor,
    p_data_efetiva,v_competencia,v_conta,v_forma,'CONFIRMADO',false,
    null,null,null,p_id_fechamentos,null,null,null,null
  );
  if v_mov is null then
    if coalesce(v_item.valor_recebido,0)+p_valor>v_item.valor_total+0.004 then
      raise exception 'Recebimento excede o valor liquido em aberto.' using errcode='P0602';
    end if;
    insert into "RetificaPremium"."Financeiro_Movimentos" (
      fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
      data_competencia,forma_pagamento,descricao,observacoes,impacta_dre,
      fk_fechamentos,chave_idempotencia,fk_registrado_por
    ) values (
      v_usuario,v_conta,'ENTRADA','RECEBIMENTO_FECHAMENTO',p_valor,p_data_efetiva,
      v_competencia,v_forma,
      'Recebimento de fechamento - '||coalesce(v_item.cliente_nome,v_item.label,'Cliente'),
      p_observacoes,false,p_id_fechamentos,p_idempotency_key,v_usuario
    )
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_mov;
    v_inserido:=v_mov is not null;
    if v_mov is null then
      v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,p_idempotency_key,'ENTRADA','RECEBIMENTO_FECHAMENTO',p_valor,
        p_data_efetiva,v_competencia,v_conta,v_forma,'CONFIRMADO',false,
        null,null,null,p_id_fechamentos,null,null,null,null
      );
    end if;
    if v_mov is null then
      raise exception 'Falha ao confirmar idempotencia do fechamento.' using errcode='P0602';
    end if;
    if v_inserido then
      perform "RetificaPremium".financeiro_recalcular_origem(null,p_id_fechamentos,null,null);
    end if;
  end if;
  select f.valor_recebido into v_realizado from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos=p_id_fechamentos;
  return json_build_object('status',200,'mensagem','Recebimento do fechamento registrado.',
    'dados',json_build_object('id_movimento',v_mov,'movimento_id',v_mov,
      'status',case when v_realizado+0.004>=v_item.valor_total then 'PAGO' else 'PARCIAL' end,
      'valor_realizado',v_realizado,'valor_aberto',greatest(v_item.valor_total-v_realizado,0)));
end;
$$;

create or replace function "RetificaPremium".registrar_pagamento_conta(
  p_id_contas_pagar uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_idempotency_key text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_item record; v_conta uuid; v_mov uuid; v_realizado numeric;
  v_competencia date; v_forma text; v_inserido boolean:=false;
begin
  if p_valor is null or p_valor<=0 or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'Valor, data e chave de idempotencia sao obrigatorios.' using errcode='P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  select * into v_item from "RetificaPremium"."Contas_Pagar"
  where id_contas_pagar=p_id_contas_pagar and fk_criado_por=v_usuario for update;
  if not found then raise exception 'Conta nao encontrada.' using errcode='P0404'; end if;
  if v_item.excluido_em is not null or v_item.status::text='CANCELADO' then
    raise exception 'Conta cancelada ou excluida nao aceita pagamento.' using errcode='P0602';
  end if;
  v_conta := "RetificaPremium".financeiro_validar_conta(v_usuario,p_fk_conta_financeira);
  perform "RetificaPremium".financeiro_validar_data_conta(v_conta,p_data_efetiva);
  v_competencia:=coalesce(v_item.data_competencia::date,v_item.data_vencimento::date);
  v_forma:=nullif(btrim(p_forma_pagamento),'');
  v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
    v_usuario,p_idempotency_key,'SAIDA','PAGAMENTO_CONTA',p_valor,
    p_data_efetiva,v_competencia,v_conta,v_forma,'CONFIRMADO',false,
    null,v_item.fk_categorias,null,null,p_id_contas_pagar,null,null,null
  );
  if v_mov is null then
    if coalesce(v_item.valor_pago,0)+p_valor>v_item.valor_final+0.004 then
      raise exception 'Pagamento excede o valor em aberto.' using errcode='P0602';
    end if;
    insert into "RetificaPremium"."Financeiro_Movimentos" (
      fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
      data_competencia,forma_pagamento,descricao,observacoes,impacta_dre,
      fk_categorias_saidas,fk_contas_pagar,chave_idempotencia,fk_registrado_por
    ) values (
      v_usuario,v_conta,'SAIDA','PAGAMENTO_CONTA',p_valor,p_data_efetiva,
      v_competencia,v_forma,
      'Pagamento - '||v_item.titulo,p_observacoes,false,
      v_item.fk_categorias,p_id_contas_pagar,p_idempotency_key,v_usuario
    )
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_mov;
    v_inserido:=v_mov is not null;
    if v_mov is null then
      v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,p_idempotency_key,'SAIDA','PAGAMENTO_CONTA',p_valor,
        p_data_efetiva,v_competencia,v_conta,v_forma,'CONFIRMADO',false,
        null,v_item.fk_categorias,null,null,p_id_contas_pagar,null,null,null
      );
    end if;
    if v_mov is null then
      raise exception 'Falha ao confirmar idempotencia do pagamento.' using errcode='P0602';
    end if;
    if v_inserido then
      perform "RetificaPremium".financeiro_recalcular_origem(null,null,p_id_contas_pagar,null);
    end if;
  end if;
  select coalesce(c.valor_pago,0) into v_realizado from "RetificaPremium"."Contas_Pagar" c
  where c.id_contas_pagar=p_id_contas_pagar;
  return json_build_object('status',200,'mensagem','Pagamento registrado.',
    'dados',json_build_object('id_movimento',v_mov,'movimento_id',v_mov,
      'status',case when v_realizado+0.004>=v_item.valor_final then 'PAGO' else 'PARCIAL' end,
      'valor_realizado',v_realizado,'valor_aberto',greatest(v_item.valor_final-v_realizado,0)));
end;
$$;

revoke execute on function
  "RetificaPremium".registrar_recebimento_nota(uuid,numeric,timestamptz,uuid,text,text,text),
  "RetificaPremium".registrar_recebimento_fechamento(uuid,numeric,timestamptz,uuid,text,text,text),
  "RetificaPremium".registrar_pagamento_conta(uuid,numeric,timestamptz,uuid,text,text,text)
  from public, anon;
grant execute on function
  "RetificaPremium".registrar_recebimento_nota(uuid,numeric,timestamptz,uuid,text,text,text),
  "RetificaPremium".registrar_recebimento_fechamento(uuid,numeric,timestamptz,uuid,text,text,text),
  "RetificaPremium".registrar_pagamento_conta(uuid,numeric,timestamptz,uuid,text,text,text)
  to authenticated, service_role;

create or replace function "RetificaPremium".criar_recebivel_manual(
  p_descricao text,
  p_valor numeric,
  p_vencimento date,
  p_competencia date,
  p_fk_categoria_entrada uuid,
  p_fk_clientes uuid default null,
  p_cliente_nome text default null,
  p_impacta_dre boolean default true,
  p_observacoes text default null,
  p_idempotency_key text default null
)
returns json
language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_id uuid;
  v_item record;
begin
  if nullif(btrim(p_descricao),'') is null or p_valor<=0 or p_vencimento is null
     or nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'Descricao, valor, vencimento e idempotencia sao obrigatorios.' using errcode='P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  v_id:="RetificaPremium".financeiro_recebivel_por_idempotencia(
    v_usuario,p_idempotency_key,p_descricao,p_valor,p_vencimento,p_competencia,
    p_fk_categoria_entrada,p_fk_clientes,p_cliente_nome,p_impacta_dre
  );
  if v_id is null then
    if not exists (select 1 from "RetificaPremium"."Categorias_Entradas" c
      where c.id_categorias_entradas=p_fk_categoria_entrada and c.fk_criado_por=v_usuario) then
      raise exception 'Categoria de entrada invalida.' using errcode='P0403';
    end if;
    if p_fk_clientes is not null and not exists (select 1 from "RetificaPremium"."Clientes" c
      where c.id_clientes=p_fk_clientes and c.fk_criado_por=v_usuario) then
      raise exception 'Cliente invalido.' using errcode='P0403';
    end if;
    insert into "RetificaPremium"."Financeiro_Recebiveis_Manuais"(
      fk_criado_por,fk_categorias_entradas,fk_clientes,cliente_nome,descricao,
      valor_previsto,data_vencimento,data_competencia,observacoes,chave_idempotencia,impacta_dre
    ) values (
      v_usuario,p_fk_categoria_entrada,p_fk_clientes,nullif(btrim(p_cliente_nome),''),
      btrim(p_descricao),p_valor,p_vencimento,coalesce(p_competencia,p_vencimento),
      nullif(btrim(p_observacoes),''),p_idempotency_key,coalesce(p_impacta_dre,true)
    )
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_recebiveis_manuais into v_id;
    if v_id is null then
      v_id:="RetificaPremium".financeiro_recebivel_por_idempotencia(
        v_usuario,p_idempotency_key,p_descricao,p_valor,p_vencimento,p_competencia,
        p_fk_categoria_entrada,p_fk_clientes,p_cliente_nome,p_impacta_dre
      );
    end if;
    if v_id is null then
      raise exception 'Falha ao confirmar idempotencia do recebivel.' using errcode='P0602';
    end if;
  end if;
  select r.status,r.valor_recebido,r.valor_previsto into v_item
  from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
  where r.id_financeiro_recebiveis_manuais=v_id;
  return json_build_object('status',200,'mensagem','Recebivel criado.',
    'dados',json_build_object('id_recebivel',v_id,'id',v_id,'status',v_item.status,
      'valor_realizado',v_item.valor_recebido,
      'valor_aberto',greatest(v_item.valor_previsto-v_item.valor_recebido,0)));
end $$;

create or replace function "RetificaPremium".criar_movimento_manual(
  p_direcao text,
  p_origem text,
  p_origem_id uuid,
  p_descricao text,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text default null,
  p_fk_categoria_entrada uuid default null,
  p_fk_categoria_saida uuid default null,
  p_impacta_dre boolean default false,
  p_observacoes text default null,
  p_idempotency_key text default null
)
returns json
language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_conta uuid; v_mov uuid; v_tipo text; v_recebivel record; v_realizado numeric;
  v_competencia date; v_forma text; v_inserido boolean:=false;
begin
  if p_direcao not in ('ENTRADA','SAIDA')
     or p_origem not in ('RECEBIVEL_MANUAL','MOVIMENTO_MANUAL','APORTE','REEMBOLSO','AJUSTE')
     or p_valor<=0 or p_data_efetiva is null
     or nullif(btrim(p_descricao),'') is null
     or nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'Parametros de movimento manual invalidos.' using errcode='P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  if p_direcao='SAIDA' and p_origem<>'AJUSTE' then
    raise exception 'Saidas operacionais devem ser cadastradas em Contas a Pagar.'
      using errcode='P0602';
  end if;
  if p_origem in ('APORTE','AJUSTE') then p_impacta_dre:=false; end if;
  if p_origem='RECEBIVEL_MANUAL' then
    if p_direcao<>'ENTRADA' or p_origem_id is null then
      raise exception 'Recebivel manual aceita somente entrada vinculada.' using errcode='P0602';
    end if;
    select * into v_recebivel from "RetificaPremium"."Financeiro_Recebiveis_Manuais"
    where id_financeiro_recebiveis_manuais=p_origem_id and fk_criado_por=v_usuario for update;
    if not found or v_recebivel.status='CANCELADO' then
      raise exception 'Recebivel manual invalido.' using errcode='P0404';
    end if;
    p_fk_categoria_entrada:=coalesce(p_fk_categoria_entrada,v_recebivel.fk_categorias_entradas);
    p_impacta_dre:=false; -- a DRE reconhece a obrigacao, nao o caixa
    v_tipo:='RECEBIMENTO_MANUAL';
  else
    v_tipo:=case p_origem
      when 'APORTE' then 'APORTE' when 'REEMBOLSO' then 'REEMBOLSO'
      when 'AJUSTE' then 'AJUSTE' else 'RECEITA_AVULSA' end;
  end if;
  if p_fk_categoria_entrada is not null and not exists (
    select 1 from "RetificaPremium"."Categorias_Entradas" c
    where c.id_categorias_entradas=p_fk_categoria_entrada and c.fk_criado_por=v_usuario
  ) then raise exception 'Categoria de entrada invalida.' using errcode='P0403'; end if;
  v_conta:="RetificaPremium".financeiro_validar_conta(v_usuario,p_fk_conta_financeira);
  perform "RetificaPremium".financeiro_validar_data_conta(v_conta,p_data_efetiva);
  v_competencia:=(p_data_efetiva at time zone 'America/Sao_Paulo')::date;
  v_forma:=nullif(btrim(p_forma_pagamento),'');
  v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
    v_usuario,p_idempotency_key,p_direcao,v_tipo,p_valor,p_data_efetiva,
    v_competencia,v_conta,v_forma,'CONFIRMADO',coalesce(p_impacta_dre,false),
    p_fk_categoria_entrada,p_fk_categoria_saida,null,null,null,
    case when p_origem='RECEBIVEL_MANUAL' then p_origem_id end,null,null
  );
  if v_mov is null then
    if p_origem='RECEBIVEL_MANUAL'
       and v_recebivel.valor_recebido+p_valor>v_recebivel.valor_previsto+0.004 then
      raise exception 'Recebimento excede o valor em aberto.' using errcode='P0602';
    end if;
    insert into "RetificaPremium"."Financeiro_Movimentos"(
      fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
      data_competencia,forma_pagamento,descricao,observacoes,impacta_dre,
      fk_categorias_entradas,fk_categorias_saidas,fk_recebivel_manual,
      chave_idempotencia,fk_registrado_por,metadata
    ) values (
      v_usuario,v_conta,p_direcao,v_tipo,p_valor,p_data_efetiva,
      v_competencia,v_forma,btrim(p_descricao),p_observacoes,
      coalesce(p_impacta_dre,false),p_fk_categoria_entrada,p_fk_categoria_saida,
      case when p_origem='RECEBIVEL_MANUAL' then p_origem_id end,
      p_idempotency_key,v_usuario,jsonb_build_object('origem',p_origem)
    )
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_mov;
    v_inserido:=v_mov is not null;
    if v_mov is null then
      v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,p_idempotency_key,p_direcao,v_tipo,p_valor,p_data_efetiva,
        v_competencia,v_conta,v_forma,'CONFIRMADO',coalesce(p_impacta_dre,false),
        p_fk_categoria_entrada,p_fk_categoria_saida,null,null,null,
        case when p_origem='RECEBIVEL_MANUAL' then p_origem_id end,null,null
      );
    end if;
    if v_mov is null then
      raise exception 'Falha ao confirmar idempotencia do movimento.' using errcode='P0602';
    end if;
    if v_inserido and p_origem='RECEBIVEL_MANUAL' then
      perform "RetificaPremium".financeiro_recalcular_origem(null,null,null,p_origem_id);
    end if;
  end if;
  select case when m.fk_recebivel_manual is null then m.valor else r.valor_recebido end
    into v_realizado
  from "RetificaPremium"."Financeiro_Movimentos" m
  left join "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    on r.id_financeiro_recebiveis_manuais=m.fk_recebivel_manual
  where m.id_financeiro_movimentos=v_mov;
  return json_build_object('status',200,'mensagem','Movimento registrado.',
    'dados',json_build_object('id_movimento',v_mov,'movimento_id',v_mov,
      'status','PAGO','valor_realizado',v_realizado,'valor_aberto',0));
end $$;

create or replace function "RetificaPremium".estornar_movimento_financeiro(
  p_id_financeiro_movimentos uuid,
  p_motivo text,
  p_data_efetiva timestamptz,
  p_idempotency_key text
)
returns json
language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_original record; v_alvo record; v_mov uuid; v_primeiro uuid;
  v_direcao text; v_status text; v_data timestamptz; v_competencia date;
  v_chave text; v_inserido boolean;
begin
  if char_length(btrim(coalesce(p_motivo,'')))<5 or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'Motivo, data e idempotencia sao obrigatorios.' using errcode='P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  select * into v_original from "RetificaPremium"."Financeiro_Movimentos"
  where id_financeiro_movimentos=p_id_financeiro_movimentos
    and fk_criado_por=v_usuario for update;
  if not found then raise exception 'Movimento nao encontrado.' using errcode='P0404'; end if;
  if v_original.tipo_movimento='ESTORNO' then
    raise exception 'Um estorno nao pode ser estornado diretamente.' using errcode='P0602';
  end if;
  if v_original.estornado_em is not null then
    v_direcao:=case when v_original.direcao='ENTRADA' then 'SAIDA' else 'ENTRADA' end;
    v_status:=case when v_original.status in ('ESTIMADO','REVISAR')
      then v_original.status else 'CONFIRMADO' end;
    v_data:=case when v_original.status='REVISAR' then null else p_data_efetiva end;
    v_competencia:=(p_data_efetiva at time zone 'America/Sao_Paulo')::date;
    v_chave:=p_idempotency_key;
    v_primeiro:="RetificaPremium".financeiro_movimento_por_idempotencia(
      v_usuario,v_chave,v_direcao,'ESTORNO',v_original.valor,v_data,
      v_competencia,v_original.fk_financeiro_contas,v_original.forma_pagamento,
      v_status,false,v_original.fk_categorias_entradas,v_original.fk_categorias_saidas,
      v_original.fk_notas_servico,v_original.fk_fechamentos,
      v_original.fk_contas_pagar,v_original.fk_recebivel_manual,
      v_original.id_financeiro_movimentos,v_original.fk_transferencia
    );
    if v_primeiro is null then
      raise exception 'Movimento ja estornado por outra operacao.' using errcode='P0602';
    end if;
    if exists(
      select 1 from "RetificaPremium"."Financeiro_Movimentos" m
      where m.id_financeiro_movimentos=v_primeiro
        and m.motivo_estorno is distinct from p_motivo
    ) then
      raise exception 'Chave de idempotencia usada com motivo de estorno diferente.'
        using errcode='P0602';
    end if;
  else
    for v_alvo in
      select m.* from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_criado_por=v_usuario
        and m.tipo_movimento<>'ESTORNO'
        and m.estornado_em is null
        and (m.id_financeiro_movimentos=p_id_financeiro_movimentos
          or (v_original.fk_transferencia is not null
            and m.fk_transferencia=v_original.fk_transferencia))
      order by
        (m.id_financeiro_movimentos<>p_id_financeiro_movimentos),
        m.id_financeiro_movimentos
      for update
    loop
      v_direcao:=case when v_alvo.direcao='ENTRADA' then 'SAIDA' else 'ENTRADA' end;
      v_status:=case when v_alvo.status in ('ESTIMADO','REVISAR')
        then v_alvo.status else 'CONFIRMADO' end;
      v_data:=case when v_alvo.status='REVISAR' then null else p_data_efetiva end;
      v_competencia:=(p_data_efetiva at time zone 'America/Sao_Paulo')::date;
      v_chave:=case
        when v_alvo.id_financeiro_movimentos=p_id_financeiro_movimentos
          then p_idempotency_key
        else p_idempotency_key||':'||v_alvo.id_financeiro_movimentos
      end;
      if v_chave<>p_idempotency_key then
        perform "RetificaPremium".financeiro_bloquear_idempotencia(v_usuario,v_chave);
      end if;
      if v_alvo.status='CONFIRMADO' then
        perform "RetificaPremium".financeiro_validar_data_conta(
          v_alvo.fk_financeiro_contas,p_data_efetiva
        );
      end if;
      v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,v_chave,v_direcao,'ESTORNO',v_alvo.valor,v_data,
        v_competencia,v_alvo.fk_financeiro_contas,v_alvo.forma_pagamento,
        v_status,false,v_alvo.fk_categorias_entradas,v_alvo.fk_categorias_saidas,
        v_alvo.fk_notas_servico,v_alvo.fk_fechamentos,v_alvo.fk_contas_pagar,
        v_alvo.fk_recebivel_manual,v_alvo.id_financeiro_movimentos,v_alvo.fk_transferencia
      );
      v_inserido:=false;
      if v_mov is null then
      insert into "RetificaPremium"."Financeiro_Movimentos"(
        fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
        data_competencia,forma_pagamento,descricao,observacoes,status,impacta_dre,
        fk_categorias_entradas,fk_categorias_saidas,fk_notas_servico,fk_fechamentos,
        fk_contas_pagar,fk_recebivel_manual,fk_movimento_origem,fk_transferencia,
        chave_idempotencia,fk_registrado_por,motivo_estorno
      ) values (
        v_usuario,v_alvo.fk_financeiro_contas,v_direcao,'ESTORNO',v_alvo.valor,
        v_data,v_competencia,
        v_alvo.forma_pagamento,'Estorno - '||v_alvo.descricao,p_motivo,
        v_status,false,
        v_alvo.fk_categorias_entradas,v_alvo.fk_categorias_saidas,
        v_alvo.fk_notas_servico,v_alvo.fk_fechamentos,v_alvo.fk_contas_pagar,
        v_alvo.fk_recebivel_manual,v_alvo.id_financeiro_movimentos,v_alvo.fk_transferencia,
        v_chave,v_usuario,p_motivo
      )
      on conflict do nothing
      returning id_financeiro_movimentos into v_mov;
      v_inserido:=v_mov is not null;
      if v_mov is null then
        v_mov:="RetificaPremium".financeiro_movimento_por_idempotencia(
          v_usuario,v_chave,v_direcao,'ESTORNO',v_alvo.valor,v_data,
          v_competencia,v_alvo.fk_financeiro_contas,v_alvo.forma_pagamento,
          v_status,false,v_alvo.fk_categorias_entradas,v_alvo.fk_categorias_saidas,
          v_alvo.fk_notas_servico,v_alvo.fk_fechamentos,v_alvo.fk_contas_pagar,
          v_alvo.fk_recebivel_manual,v_alvo.id_financeiro_movimentos,v_alvo.fk_transferencia
        );
      end if;
      if v_mov is null then
        raise exception 'Movimento ja estornado por outra operacao.' using errcode='P0602';
      end if;
      end if;
      if exists(
        select 1 from "RetificaPremium"."Financeiro_Movimentos" m
        where m.id_financeiro_movimentos=v_mov
          and m.motivo_estorno is distinct from p_motivo
      ) then
        raise exception 'Chave de idempotencia usada com motivo de estorno diferente.'
          using errcode='P0602';
      end if;
      v_primeiro := coalesce(v_primeiro,v_mov);
      if v_inserido then
        update "RetificaPremium"."Financeiro_Movimentos"
           set estornado_em=now(),motivo_estorno=p_motivo,
               fk_estornado_por=v_usuario
         where id_financeiro_movimentos=v_alvo.id_financeiro_movimentos;
        perform "RetificaPremium".financeiro_recalcular_origem(
          v_alvo.fk_notas_servico,v_alvo.fk_fechamentos,
          v_alvo.fk_contas_pagar,v_alvo.fk_recebivel_manual);
      end if;
    end loop;
  end if;
  return json_build_object('status',200,'mensagem','Movimento estornado.',
    'dados',json_build_object('id_movimento',v_primeiro,'movimento_id',v_primeiro,'status','PAGO'));
end $$;

create or replace function "RetificaPremium".transferir_contas_financeiras(
  p_fk_conta_origem uuid,
  p_fk_conta_destino uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_descricao text default null,
  p_idempotency_key text default null
)
returns json
language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_origem uuid; v_destino uuid; v_transferencia uuid; v_saida uuid; v_entrada uuid;
  v_competencia date; v_inseriu_saida boolean:=false;
begin
  if p_fk_conta_origem=p_fk_conta_destino or p_valor<=0 or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'Transferencia invalida.' using errcode='P0602';
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key
  );
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario,p_idempotency_key||':entrada'
  );
  v_origem := "RetificaPremium".financeiro_validar_conta(v_usuario,p_fk_conta_origem);
  v_destino := "RetificaPremium".financeiro_validar_conta(v_usuario,p_fk_conta_destino);
  perform "RetificaPremium".financeiro_validar_data_conta(v_origem,p_data_efetiva);
  perform "RetificaPremium".financeiro_validar_data_conta(v_destino,p_data_efetiva);
  v_competencia:=(p_data_efetiva at time zone 'America/Sao_Paulo')::date;
  select m.id_financeiro_movimentos,m.fk_transferencia into v_saida,v_transferencia
  from "RetificaPremium"."Financeiro_Movimentos" m
  where m.fk_criado_por=v_usuario and m.chave_idempotencia=p_idempotency_key;
  v_saida:="RetificaPremium".financeiro_movimento_por_idempotencia(
    v_usuario,p_idempotency_key,'SAIDA','TRANSFERENCIA',p_valor,
    p_data_efetiva,v_competencia,v_origem,null,'CONFIRMADO',false,
    null,null,null,null,null,null,null,v_transferencia
  );
  if v_saida is not null then
    v_entrada:="RetificaPremium".financeiro_movimento_por_idempotencia(
      v_usuario,p_idempotency_key||':entrada','ENTRADA','TRANSFERENCIA',p_valor,
      p_data_efetiva,v_competencia,v_destino,null,'CONFIRMADO',false,
      null,null,null,null,null,null,null,v_transferencia
    );
    if v_entrada is null then
      raise exception 'Transferencia idempotente incompleta.' using errcode='P0602';
    end if;
  end if;
  if v_saida is null then
    v_transferencia := gen_random_uuid();
    insert into "RetificaPremium"."Financeiro_Movimentos"(
      fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
      data_competencia,descricao,status,impacta_dre,fk_transferencia,chave_idempotencia,
      fk_registrado_por
    ) values
      (v_usuario,v_origem,'SAIDA','TRANSFERENCIA',p_valor,p_data_efetiva,
       v_competencia,
       coalesce(nullif(btrim(p_descricao),''),'Transferencia entre contas'),'CONFIRMADO',false,
       v_transferencia,p_idempotency_key,v_usuario)
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_saida;
    v_inseriu_saida:=v_saida is not null;
    if v_saida is null then
      select m.fk_transferencia into v_transferencia
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_criado_por=v_usuario
        and m.chave_idempotencia=p_idempotency_key;
      v_saida:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,p_idempotency_key,'SAIDA','TRANSFERENCIA',p_valor,
        p_data_efetiva,v_competencia,v_origem,null,'CONFIRMADO',false,
        null,null,null,null,null,null,null,v_transferencia
      );
    end if;
    if v_saida is null then
      raise exception 'Falha ao confirmar idempotencia da transferencia.' using errcode='P0602';
    end if;
    if v_inseriu_saida then
    v_entrada:="RetificaPremium".financeiro_movimento_por_idempotencia(
      v_usuario,p_idempotency_key||':entrada','ENTRADA','TRANSFERENCIA',p_valor,
      p_data_efetiva,v_competencia,v_destino,null,'CONFIRMADO',false,
      null,null,null,null,null,null,null,v_transferencia
    );
    if v_entrada is not null then
      raise exception 'Chave de idempotencia da entrada ja utilizada.'
        using errcode='P0602';
    end if;
    insert into "RetificaPremium"."Financeiro_Movimentos"(
      fk_criado_por,fk_financeiro_contas,direcao,tipo_movimento,valor,data_efetiva,
      data_competencia,descricao,status,impacta_dre,fk_transferencia,chave_idempotencia,
      fk_registrado_por
    ) values
      (v_usuario,v_destino,'ENTRADA','TRANSFERENCIA',p_valor,p_data_efetiva,
       v_competencia,
       coalesce(nullif(btrim(p_descricao),''),'Transferencia entre contas'),'CONFIRMADO',false,
       v_transferencia,p_idempotency_key||':entrada',v_usuario)
    on conflict(fk_criado_por,chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_entrada;
    end if;
    if v_entrada is null then
      v_entrada:="RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario,p_idempotency_key||':entrada','ENTRADA','TRANSFERENCIA',p_valor,
        p_data_efetiva,v_competencia,v_destino,null,'CONFIRMADO',false,
        null,null,null,null,null,null,null,v_transferencia
      );
    end if;
    if v_entrada is null then
      raise exception 'Transferencia idempotente incompleta.' using errcode='P0602';
    end if;
  end if;
  return json_build_object('status',200,'mensagem','Transferencia registrada.',
    'dados',json_build_object('id_movimento',v_saida,'movimento_id',v_saida,'status','PAGO'));
end $$;

revoke execute on function
  "RetificaPremium".criar_recebivel_manual(text,numeric,date,date,uuid,uuid,text,boolean,text,text),
  "RetificaPremium".criar_movimento_manual(text,text,uuid,text,numeric,timestamptz,uuid,text,uuid,uuid,boolean,text,text),
  "RetificaPremium".estornar_movimento_financeiro(uuid,text,timestamptz,text),
  "RetificaPremium".transferir_contas_financeiras(uuid,uuid,numeric,timestamptz,text,text)
  from public, anon;
grant execute on function
  "RetificaPremium".criar_recebivel_manual(text,numeric,date,date,uuid,uuid,text,boolean,text,text),
  "RetificaPremium".criar_movimento_manual(text,text,uuid,text,numeric,timestamptz,uuid,text,uuid,uuid,boolean,text,text),
  "RetificaPremium".estornar_movimento_financeiro(uuid,text,timestamptz,text),
  "RetificaPremium".transferir_contas_financeiras(uuid,uuid,numeric,timestamptz,text,text)
  to authenticated, service_role;

create or replace function "RetificaPremium".financeiro_estornar_origem(
  p_tipo text, p_origem_id uuid, p_motivo text, p_data timestamptz, p_chave text
)
returns json
language plpgsql security definer set search_path=''
as $$
declare v_mov record; v_result json; v_first uuid; v_count int:=0;
begin
  for v_mov in
    select m.id_financeiro_movimentos
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por="RetificaPremium".require_financeiro_usuario_id()
      and m.status in ('CONFIRMADO','ESTIMADO','REVISAR')
      and m.tipo_movimento<>'ESTORNO'
      and ((p_tipo='NOTA' and m.fk_notas_servico=p_origem_id)
        or (p_tipo='FECHAMENTO' and m.fk_fechamentos=p_origem_id))
    order by m.created_at
  loop
    v_result := "RetificaPremium".estornar_movimento_financeiro(
      v_mov.id_financeiro_movimentos,p_motivo,p_data,
      p_chave||':'||v_mov.id_financeiro_movimentos);
    v_first := coalesce(v_first,(v_result->'dados'->>'movimento_id')::uuid);
    v_count:=v_count+1;
  end loop;
  return json_build_object('status',200,'mensagem','Recebimento estornado.',
    'dados',json_build_object('id_movimento',v_first,'movimento_id',v_first,
      'status','PENDENTE','movimentos_estornados',v_count,'valor_realizado',0));
end $$;

create or replace function "RetificaPremium".estornar_recebimento_nota(
  p_id_notas_servico uuid,p_motivo text,p_data_efetiva timestamptz,p_idempotency_key text
)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_estornar_origem(
  'NOTA',p_id_notas_servico,p_motivo,p_data_efetiva,p_idempotency_key) $$;

create or replace function "RetificaPremium".estornar_recebimento_fechamento(
  p_id_fechamentos uuid,p_motivo text,p_data_efetiva timestamptz,p_idempotency_key text
)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".financeiro_estornar_origem(
  'FECHAMENTO',p_id_fechamentos,p_motivo,p_data_efetiva,p_idempotency_key) $$;

-- Assinaturas legadas continuam operacionais, agora sem escrita direta.
create or replace function "RetificaPremium".marcar_fechamento_pago(
  p_id_fechamentos uuid,
  p_pago_em timestamp without time zone
    default (now() at time zone 'America/Sao_Paulo'),
  p_pago_com text default null
)
returns json language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id();
  v_item record;
  v_conta uuid;
begin
  select f.valor_total,coalesce(f.valor_recebido,0) recebido into v_item
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
  where f.id_fechamentos=p_id_fechamentos and c.fk_criado_por=v_usuario;
  if not found then raise exception 'Fechamento nao encontrado.' using errcode='P0404'; end if;
  if v_item.recebido+0.004>=v_item.valor_total then
    return json_build_object('status',200,'mensagem','Fechamento ja recebido.','dados',
      json_build_object('status','PAGO','valor_realizado',v_item.recebido,'valor_aberto',0));
  end if;
  v_conta:="RetificaPremium".garantir_conta_financeira_padrao(v_usuario);
  return "RetificaPremium".registrar_recebimento_fechamento(
    p_id_fechamentos,v_item.valor_total-v_item.recebido,p_pago_em at time zone 'America/Sao_Paulo',
    v_conta,p_pago_com,'Registro pelo fluxo legado',
    'legacy:fechamento:'||p_id_fechamentos||':'||v_item.recebido::text);
end $$;

create or replace function "RetificaPremium".estornar_fechamento_pago(p_id_fechamentos uuid)
returns json language sql security definer set search_path=''
as $$ select "RetificaPremium".estornar_recebimento_fechamento(
  p_id_fechamentos,'Estorno pelo fluxo legado',now(),
  'legacy:estorno-fechamento:'||p_id_fechamentos||':'||extract(epoch from now())::bigint) $$;

revoke execute on function
  "RetificaPremium".financeiro_estornar_origem(text,uuid,text,timestamptz,text)
  from public,anon,authenticated;
revoke execute on function
  "RetificaPremium".estornar_recebimento_nota(uuid,text,timestamptz,text),
  "RetificaPremium".estornar_recebimento_fechamento(uuid,text,timestamptz,text),
  "RetificaPremium".marcar_fechamento_pago(uuid,timestamp without time zone,text),
  "RetificaPremium".estornar_fechamento_pago(uuid)
  from public,anon;
grant execute on function
  "RetificaPremium".estornar_recebimento_nota(uuid,text,timestamptz,text),
  "RetificaPremium".estornar_recebimento_fechamento(uuid,text,timestamptz,text),
  "RetificaPremium".marcar_fechamento_pago(uuid,timestamp without time zone,text),
  "RetificaPremium".estornar_fechamento_pago(uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 6. Cadastros e recorrências
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".salvar_conta_financeira(
  p_id_financeiro_conta uuid,p_nome text,p_tipo text,p_saldo_inicial numeric,
  p_data_corte date,p_padrao boolean,p_ativa boolean
)
returns json language plpgsql security definer set search_path=''
as $$
declare
  v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id();
  v_id uuid;
  v_data_corte_atual date;
  v_saldo_atual numeric;
  v_confirmado_atual boolean;
  v_nova_data_corte date;
  v_novo_saldo numeric;
  v_novo_confirmado boolean;
  v_tem_caixa_confirmado boolean;
begin
  if p_tipo not in ('CAIXA','BANCO','PIX','CARTEIRA','OUTRA')
     or char_length(btrim(coalesce(p_nome,'')))<2 then
    raise exception 'Dados da conta financeira invalidos.' using errcode='P0602';
  end if;
  if p_id_financeiro_conta is not null then
    select c.data_corte,c.saldo_inicial,c.saldo_inicial_confirmado
      into v_data_corte_atual,v_saldo_atual,v_confirmado_atual
    from "RetificaPremium"."Financeiro_Contas" c
    where c.id_financeiro_contas=p_id_financeiro_conta
      and c.fk_criado_por=v_usuario
    for update;
    if not found then
      raise exception 'Conta financeira nao encontrada.' using errcode='P0404';
    end if;
    v_nova_data_corte:=coalesce(p_data_corte,v_data_corte_atual);
    v_novo_saldo:=coalesce(p_saldo_inicial,v_saldo_atual);
    v_novo_confirmado:=case
      when v_confirmado_atual then true
      when p_saldo_inicial is not null and p_data_corte is not null then true
      else false
    end;
    select exists(
      select 1 from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_financeiro_contas=p_id_financeiro_conta
        and m.status='CONFIRMADO'
    ) into v_tem_caixa_confirmado;
    if v_tem_caixa_confirmado and (
      v_nova_data_corte is distinct from v_data_corte_atual
      or v_novo_saldo is distinct from v_saldo_atual
      or v_novo_confirmado is distinct from v_confirmado_atual
    ) then
      if not (
        not v_confirmado_atual
        and v_novo_confirmado
        and v_data_corte_atual=date '2026-06-01'
        and v_nova_data_corte=v_data_corte_atual
      ) then
        raise exception 'Conta com caixa confirmado exige ajuste auditado para alterar saldo ou corte.'
          using errcode='P0602';
      end if;
    end if;
  end if;
  if coalesce(p_padrao,false) then
    update "RetificaPremium"."Financeiro_Contas" set padrao=false,updated_at=now()
    where fk_criado_por=v_usuario and padrao;
  end if;
  if p_id_financeiro_conta is null then
    insert into "RetificaPremium"."Financeiro_Contas"(
      fk_criado_por,nome,tipo,saldo_inicial,data_corte,saldo_inicial_confirmado,padrao,ativo
    ) values (v_usuario,btrim(p_nome),p_tipo,p_saldo_inicial,coalesce(p_data_corte,date '2026-06-01'),
      p_saldo_inicial is not null and p_data_corte is not null,
      coalesce(p_padrao,false),coalesce(p_ativa,true))
    returning id_financeiro_contas into v_id;
  else
    update "RetificaPremium"."Financeiro_Contas"
    set nome=btrim(p_nome),tipo=p_tipo,saldo_inicial=v_novo_saldo,
        data_corte=v_nova_data_corte,
        saldo_inicial_confirmado=v_novo_confirmado,
        padrao=coalesce(p_padrao,false),ativo=coalesce(p_ativa,true),updated_at=now()
    where id_financeiro_contas=p_id_financeiro_conta and fk_criado_por=v_usuario
    returning id_financeiro_contas into v_id;
    if v_id is null then raise exception 'Conta financeira nao encontrada.' using errcode='P0404'; end if;
    if not coalesce(p_ativa,true) and exists(select 1 from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_financeiro_contas=v_id and m.status in ('CONFIRMADO','ESTIMADO','REVISAR')) then
      raise exception 'Conta com movimentos nao pode ser inativada.' using errcode='P0602';
    end if;
  end if;
  return json_build_object('status',200,'mensagem','Conta financeira salva.',
    'dados',json_build_object('id_conta',v_id,'id',v_id));
end $$;

create or replace function "RetificaPremium".salvar_categoria_entrada(
  p_id_categoria_entrada uuid,p_nome text,p_cor text,p_icone text,p_impacta_dre boolean,p_ativa boolean
)
returns json language plpgsql security definer set search_path=''
as $$
declare v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id(); v_id uuid;
begin
  if char_length(btrim(coalesce(p_nome,'')))<2 then
    raise exception 'Nome da categoria invalido.' using errcode='P0602';
  end if;
  if p_id_categoria_entrada is null then
    insert into "RetificaPremium"."Categorias_Entradas"(
      fk_criado_por,nome,cor,icone,impacta_dre,ativo)
    values(v_usuario,btrim(p_nome),coalesce(nullif(p_cor,''),'bg-blue-100 text-blue-800'),
      coalesce(nullif(p_icone,''),'ArrowDownToLine'),coalesce(p_impacta_dre,true),coalesce(p_ativa,true))
    returning id_categorias_entradas into v_id;
  else
    update "RetificaPremium"."Categorias_Entradas"
    set nome=btrim(p_nome),cor=coalesce(nullif(p_cor,''),cor),icone=coalesce(nullif(p_icone,''),icone),
        impacta_dre=coalesce(p_impacta_dre,true),ativo=coalesce(p_ativa,true),updated_at=now()
    where id_categorias_entradas=p_id_categoria_entrada and fk_criado_por=v_usuario
    returning id_categorias_entradas into v_id;
    if v_id is null then raise exception 'Categoria nao encontrada.' using errcode='P0404'; end if;
  end if;
  return json_build_object('status',200,'mensagem','Categoria salva.',
    'dados',json_build_object('id_categoria',v_id,'id',v_id));
end $$;

create or replace function "RetificaPremium".salvar_modelo_recorrente(
  p_id_modelo_recorrente uuid,p_titulo text,p_fk_categorias uuid,p_fk_fornecedores uuid,
  p_nome_fornecedor text,p_valor numeric,p_recorrencia text,p_dia_vencimento integer,
  p_competencia_inicial date,p_forma_pagamento_prevista text,p_observacoes text,p_ativa boolean
)
returns json language plpgsql security definer set search_path=''
as $$
declare v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id(); v_id uuid;
begin
  if p_valor<=0 or p_competencia_inicial is null or p_dia_vencimento not between 1 and 31
     or p_recorrencia not in ('SEMANAL','QUINZENAL','MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')
     or char_length(btrim(coalesce(p_titulo,'')))<2 then
    raise exception 'Dados do modelo recorrente invalidos.' using errcode='P0602';
  end if;
  if not exists(select 1 from "RetificaPremium"."Categorias_Contas_Pagar" c
    where c.id_categorias=p_fk_categorias and c.ativo) then
    raise exception 'Categoria de saida invalida.' using errcode='P0602';
  end if;
  if p_id_modelo_recorrente is null then
    insert into "RetificaPremium"."Financeiro_Modelos_Recorrentes"(
      fk_criado_por,fk_categorias,fk_fornecedores,titulo,nome_fornecedor,valor_original,
      forma_pagamento_prevista,recorrencia,dia_vencimento,proxima_competencia,observacoes,ativo
    ) values(v_usuario,p_fk_categorias,p_fk_fornecedores,btrim(p_titulo),nullif(btrim(p_nome_fornecedor),''),
      p_valor,nullif(btrim(p_forma_pagamento_prevista),''),p_recorrencia,p_dia_vencimento,
      date_trunc('month',p_competencia_inicial)::date,p_observacoes,coalesce(p_ativa,true))
    returning id_financeiro_modelos_recorrentes into v_id;
  else
    update "RetificaPremium"."Financeiro_Modelos_Recorrentes"
    set fk_categorias=p_fk_categorias,fk_fornecedores=p_fk_fornecedores,titulo=btrim(p_titulo),
      nome_fornecedor=nullif(btrim(p_nome_fornecedor),''),valor_original=p_valor,
      forma_pagamento_prevista=nullif(btrim(p_forma_pagamento_prevista),''),
      recorrencia=p_recorrencia,dia_vencimento=p_dia_vencimento,
      proxima_competencia=date_trunc('month',p_competencia_inicial)::date,
      observacoes=p_observacoes,ativo=coalesce(p_ativa,true),updated_at=now()
    where id_financeiro_modelos_recorrentes=p_id_modelo_recorrente and fk_criado_por=v_usuario
    returning id_financeiro_modelos_recorrentes into v_id;
    if v_id is null then raise exception 'Modelo recorrente nao encontrado.' using errcode='P0404'; end if;
    update "RetificaPremium"."Contas_Pagar" cp
       set titulo=btrim(p_titulo),fk_categorias=p_fk_categorias,
           fk_fornecedores=p_fk_fornecedores,
           nome_fornecedor=nullif(btrim(p_nome_fornecedor),''),
           valor_original=p_valor,juros=0,desconto=0,valor_final=p_valor,
           forma_pagamento_prevista=nullif(btrim(p_forma_pagamento_prevista),'')
             ::"RetificaPremium".forma_pagamento,
           data_vencimento=(case
             when p_recorrencia in ('SEMANAL','QUINZENAL') then cp.competencia_recorrencia
             else date_trunc('month',cp.competencia_recorrencia)::date+
               (least(p_dia_vencimento,extract(day from (
                 date_trunc('month',cp.competencia_recorrencia)+interval '1 month-1 day'
               )))::int-1) end)::timestamp,
           observacoes=p_observacoes,updated_at=now()
     where cp.fk_modelo_recorrente=v_id
       and cp.competencia_recorrencia>=(now() at time zone 'America/Sao_Paulo')::date
       and cp.status::text in ('PENDENTE','AGENDADO')
       and coalesce(cp.valor_pago,0)=0
       and cp.excluido_em is null;
  end if;
  return json_build_object('status',200,'mensagem','Modelo recorrente salvo.',
    'dados',json_build_object('id_modelo',v_id,'id',v_id));
end $$;

create or replace function "RetificaPremium".inativar_modelo_recorrente(p_id_modelo_recorrente uuid)
returns json language plpgsql security definer set search_path=''
as $$
declare v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id();
begin
  update "RetificaPremium"."Financeiro_Modelos_Recorrentes" set ativo=false,updated_at=now()
  where id_financeiro_modelos_recorrentes=p_id_modelo_recorrente and fk_criado_por=v_usuario;
  if not found then raise exception 'Modelo recorrente nao encontrado.' using errcode='P0404'; end if;
  return json_build_object('status',200,'mensagem','Modelo inativado.',
    'dados',json_build_object('id_modelo',p_id_modelo_recorrente,'id',p_id_modelo_recorrente));
end $$;

create or replace function "RetificaPremium".financeiro_gerar_recorrencias_usuario(
  p_usuario_id uuid,p_ate date
)
returns json
language plpgsql security definer set search_path=''
as $$
declare v_modelo record; v_comp date; v_due date; v_next date; v_geradas int:=0; v_ignoradas int:=0;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario_id);
  for v_modelo in
    select * from "RetificaPremium"."Financeiro_Modelos_Recorrentes"
    where fk_criado_por=p_usuario_id and ativo order by proxima_competencia for update
  loop
    v_comp:=v_modelo.proxima_competencia;
    while v_comp<=p_ate and (v_modelo.data_fim is null or v_comp<=v_modelo.data_fim) loop
      v_due:=case
        when v_modelo.recorrencia in ('SEMANAL','QUINZENAL') then v_comp
        else (date_trunc('month',v_comp)::date
          + (least(v_modelo.dia_vencimento,
              extract(day from (date_trunc('month',v_comp)+interval '1 month-1 day')))::int-1))
      end;
      insert into "RetificaPremium"."Contas_Pagar"(
        titulo,fk_fornecedores,nome_fornecedor,fk_categorias,data_vencimento,
        valor_original,juros,desconto,valor_final,status,forma_pagamento_prevista,
        origem_lancamento,data_competencia,recorrencia,observacoes,urgente,
        fk_criado_por,favorecido_tipo,fk_modelo_recorrente,competencia_recorrencia
      ) values(
        v_modelo.titulo,v_modelo.fk_fornecedores,v_modelo.nome_fornecedor,
        v_modelo.fk_categorias,v_due::timestamp,v_modelo.valor_original,v_modelo.juros,
        v_modelo.desconto,greatest(0,v_modelo.valor_original+v_modelo.juros-v_modelo.desconto),
        'PENDENTE',nullif(v_modelo.forma_pagamento_prevista,'')::"RetificaPremium".forma_pagamento,
        'AUTO_SERIES',v_comp::timestamp,'NENHUMA',v_modelo.observacoes,false,
        p_usuario_id,v_modelo.favorecido_tipo,v_modelo.id_financeiro_modelos_recorrentes,v_comp
      ) on conflict (fk_modelo_recorrente,competencia_recorrencia)
        where fk_modelo_recorrente is not null and competencia_recorrencia is not null
        do nothing;
      if found then v_geradas:=v_geradas+1; else v_ignoradas:=v_ignoradas+1; end if;
      v_next:=case v_modelo.recorrencia
        when 'SEMANAL' then v_comp+7
        when 'QUINZENAL' then v_comp+15
        when 'MENSAL' then (v_comp+interval '1 month')::date
        when 'BIMESTRAL' then (v_comp+interval '2 months')::date
        when 'TRIMESTRAL' then (v_comp+interval '3 months')::date
        when 'SEMESTRAL' then (v_comp+interval '6 months')::date
        else (v_comp+interval '1 year')::date end;
      v_comp:=v_next;
    end loop;
    update "RetificaPremium"."Financeiro_Modelos_Recorrentes"
       set proxima_competencia=v_comp,updated_at=now()
     where id_financeiro_modelos_recorrentes=v_modelo.id_financeiro_modelos_recorrentes;
  end loop;
  return json_build_object('geradas',v_geradas,'ignoradas',v_ignoradas);
end $$;

create or replace function "RetificaPremium".gerar_contas_recorrentes(
  p_ate date default null,p_horizonte_dias integer default 90
)
returns json
language plpgsql security definer set search_path=''
as $$
declare v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id(); v_dados json;
begin
  if coalesce(p_horizonte_dias,90) not between 1 and 366 then
    raise exception 'Horizonte deve ter entre 1 e 366 dias.' using errcode='P0602';
  end if;
  v_dados:="RetificaPremium".financeiro_gerar_recorrencias_usuario(
    v_usuario,coalesce(p_ate,(now() at time zone 'America/Sao_Paulo')::date+coalesce(p_horizonte_dias,90)));
  return json_build_object('status',200,'mensagem','Recorrencias processadas.','dados',v_dados);
end $$;

create or replace function "RetificaPremium".insert_financeiro_anexo(
  p_fk_financeiro_movimentos uuid,p_nome_arquivo text,p_caminho text,
  p_mime_type text default null,p_tamanho_bytes bigint default null
)
returns json
language plpgsql security definer set search_path=''
as $$
declare v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id(); v_id uuid;
begin
  if (select auth.uid()) is null
     or p_caminho not like (select auth.uid())::text||'/%'
     or coalesce(p_tamanho_bytes,0)>15728640
     or (p_mime_type is not null and p_mime_type not in
       ('application/pdf','image/jpeg','image/png','image/webp')) then
    raise exception 'Caminho, tipo ou tamanho do comprovante invalido.' using errcode='P0602';
  end if;
  if not exists(select 1 from "RetificaPremium"."Financeiro_Movimentos" m
    where m.id_financeiro_movimentos=p_fk_financeiro_movimentos and m.fk_criado_por=v_usuario) then
    raise exception 'Movimento nao encontrado.' using errcode='P0404';
  end if;
  insert into "RetificaPremium"."Financeiro_Anexos"(
    fk_criado_por,fk_financeiro_movimentos,storage_path,nome_arquivo,tipo_mime,
    tamanho_bytes,fk_registrado_por
  ) values(v_usuario,p_fk_financeiro_movimentos,btrim(p_caminho),btrim(p_nome_arquivo),
    nullif(btrim(p_mime_type),''),p_tamanho_bytes,v_usuario)
  returning id_financeiro_anexos into v_id;
  return json_build_object('status',200,'mensagem','Comprovante vinculado.',
    'dados',json_build_object('id',v_id));
end $$;

revoke execute on function
  "RetificaPremium".salvar_conta_financeira(uuid,text,text,numeric,date,boolean,boolean),
  "RetificaPremium".salvar_categoria_entrada(uuid,text,text,text,boolean,boolean),
  "RetificaPremium".salvar_modelo_recorrente(uuid,text,uuid,uuid,text,numeric,text,integer,date,text,text,boolean),
  "RetificaPremium".inativar_modelo_recorrente(uuid),
  "RetificaPremium".gerar_contas_recorrentes(date,integer),
  "RetificaPremium".insert_financeiro_anexo(uuid,text,text,text,bigint)
  from public,anon;
revoke execute on function "RetificaPremium".financeiro_gerar_recorrencias_usuario(uuid,date)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".salvar_conta_financeira(uuid,text,text,numeric,date,boolean,boolean),
  "RetificaPremium".salvar_categoria_entrada(uuid,text,text,text,boolean,boolean),
  "RetificaPremium".salvar_modelo_recorrente(uuid,text,uuid,uuid,text,numeric,text,integer,date,text,text,boolean),
  "RetificaPremium".inativar_modelo_recorrente(uuid),
  "RetificaPremium".gerar_contas_recorrentes(date,integer),
  "RetificaPremium".insert_financeiro_anexo(uuid,text,text,text,bigint)
  to authenticated,service_role;
grant execute on function "RetificaPremium".financeiro_gerar_recorrencias_usuario(uuid,date)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Leituras paginadas e variantes de suporte (somente leitura)
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".financeiro_resumo_usuario(
  p_usuario uuid,p_data_inicio date,p_data_fim date,p_modo text,p_conta uuid
)
returns json
language plpgsql stable security definer set search_path=''
as $$
declare
  v_saldo_confirmado boolean; v_inicial numeric; v_anterior numeric;
  v_entradas numeric; v_saidas numeric; v_receber numeric; v_pagar numeric;
  v_faturamento numeric; v_despesas numeric;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario);
  if p_data_inicio is null or p_data_fim is null or p_data_inicio>p_data_fim
     or coalesce(p_modo,'CAIXA') not in ('CAIXA','PREVISTO','COMPETENCIA') then
    raise exception 'Periodo ou modo invalido.' using errcode='P0602';
  end if;
  select coalesce(bool_and(c.saldo_inicial_confirmado and c.data_corte<=p_data_inicio),false),
         coalesce(sum(case when c.data_corte<=p_data_inicio then coalesce(c.saldo_inicial,0) else 0 end),0)
    into v_saldo_confirmado,v_inicial
  from "RetificaPremium"."Financeiro_Contas" c
  where c.fk_criado_por=p_usuario and c.ativo
    and (p_conta is null or c.id_financeiro_contas=p_conta);

  select v_inicial+coalesce(sum(case when m.direcao='ENTRADA' then m.valor else -m.valor end),0)
    into v_anterior
  from "RetificaPremium"."Financeiro_Movimentos" m
  join "RetificaPremium"."Financeiro_Contas" c
    on c.id_financeiro_contas=m.fk_financeiro_contas
  where m.fk_criado_por=p_usuario and m.status='CONFIRMADO'
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date<p_data_inicio
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date>=c.data_corte
    and (p_conta is null or m.fk_financeiro_contas=p_conta);
  select coalesce(sum(m.valor) filter(where m.direcao='ENTRADA'),0),
         coalesce(sum(m.valor) filter(where m.direcao='SAIDA'),0)
    into v_entradas,v_saidas
  from "RetificaPremium"."Financeiro_Movimentos" m
  join "RetificaPremium"."Financeiro_Contas" c
    on c.id_financeiro_contas=m.fk_financeiro_contas
  where m.fk_criado_por=p_usuario and m.status='CONFIRMADO'
    and (p_conta is not null or m.tipo_movimento<>'TRANSFERENCIA')
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date between p_data_inicio and p_data_fim
    and (m.data_efetiva at time zone 'America/Sao_Paulo')::date>=c.data_corte
    and (p_conta is null or m.fk_financeiro_contas=p_conta);

  select coalesce(sum(x.aberto),0) into v_receber from (
    select greatest(n.total-coalesce(n.valor_recebido,0),0) aberto
    from "RetificaPremium"."Notas_de_Servico" n join "RetificaPremium"."Clientes" c on c.id_clientes=n.fk_clientes
    join "RetificaPremium"."Status_Notas" s on s.id_status_notas=n.fk_status
    where c.fk_criado_por=p_usuario and n.fk_fechamentos is null
      and lower(s.nome) in ('entregue','recusada','sem conserto','finalizado')
      and coalesce(n.receber_em,n.created_at::date)<=p_data_fim
    union all
    select greatest(f.valor_total-coalesce(f.valor_recebido,0),0)
    from "RetificaPremium"."Fechamentos" f join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
    where c.fk_criado_por=p_usuario and coalesce(f.vencimento_em,f.data_fechamento::date)<=p_data_fim
    union all
    select greatest(r.valor_previsto-r.valor_recebido,0)
    from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.fk_criado_por=p_usuario and r.status<>'CANCELADO' and r.data_vencimento<=p_data_fim
  ) x;
  select coalesce(sum(greatest(c.valor_final-coalesce(c.valor_pago,0),0)),0) into v_pagar
  from "RetificaPremium"."Contas_Pagar" c
  where c.fk_criado_por=p_usuario and c.excluido_em is null and c.status::text<>'CANCELADO'
    and c.data_vencimento::date<=p_data_fim;

  select coalesce(sum(x.valor),0) into v_faturamento from (
    select n.total valor from "RetificaPremium"."Notas_de_Servico" n
    join "RetificaPremium"."Clientes" c on c.id_clientes=n.fk_clientes
    join "RetificaPremium"."Status_Notas" s on s.id_status_notas=n.fk_status
    where c.fk_criado_por=p_usuario and n.fk_fechamentos is null
      and lower(s.nome) in ('entregue','recusada','sem conserto','finalizado')
      and coalesce(n.finalizado_em::date,n.receber_em,n.created_at::date)
        between p_data_inicio and p_data_fim
    union all
    -- O.S. comprovadamente recebida antes do fechamento não compõe o valor
    -- líquido cobrado no fechamento e, portanto, é receita independente.
    select recebida.valor
    from (
      select distinct on (n.id_notas_servico)
        parsed.valor valor,
        coalesce(
          n.finalizado_em::date,
          n.created_at::date
        ) competencia
      from "RetificaPremium"."Fechamentos" f
      join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(f.dados_json->'recebidas')='array'
            then f.dados_json->'recebidas'
          else '[]'::jsonb
        end
      ) r(item)
      cross join lateral (
        select
          case
            when coalesce(r.item->>'id','') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (r.item->>'id')::uuid
          end nota_id,
          case
            when coalesce(r.item->>'total','') ~ '^[0-9]+([.][0-9]{1,2})?$'
            then (r.item->>'total')::numeric
          end valor
      ) parsed
      join "RetificaPremium"."Notas_de_Servico" n
        on n.id_notas_servico=parsed.nota_id
       and n.fk_fechamentos=f.id_fechamentos
      where c.fk_criado_por=p_usuario
        and parsed.valor>0
      order by n.id_notas_servico,f.created_at desc
    ) recebida
    where recebida.competencia between p_data_inicio and p_data_fim
    union all
    select f.valor_total from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
    where c.fk_criado_por=p_usuario and f.data_fechamento::date between p_data_inicio and p_data_fim
    union all
    select r.valor_previsto from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.fk_criado_por=p_usuario and r.impacta_dre and r.status<>'CANCELADO'
      and r.data_competencia between p_data_inicio and p_data_fim
    union all
    select m.valor from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por=p_usuario and m.impacta_dre and m.direcao='ENTRADA'
      and m.tipo_movimento in ('RECEITA_AVULSA','REEMBOLSO')
      and m.estornado_em is null
      and m.data_competencia between p_data_inicio and p_data_fim
  ) x;
  select coalesce(sum(c.valor_final),0) into v_despesas
  from "RetificaPremium"."Contas_Pagar" c
  where c.fk_criado_por=p_usuario and c.excluido_em is null and c.status::text<>'CANCELADO'
    and coalesce(c.data_competencia::date,c.data_vencimento::date) between p_data_inicio and p_data_fim;

  return json_build_object(
    'saldo_inicial_informado',v_saldo_confirmado,'saldo_anterior',v_anterior,
    'entradas_recebidas',v_entradas,'saidas_pagas',v_saidas,
    'saldo_atual',v_anterior+v_entradas-v_saidas,'a_receber',v_receber,'a_pagar',v_pagar,
    'saldo_projetado',v_anterior+v_entradas-v_saidas+v_receber-v_pagar,
    'resultado_periodo',v_entradas-v_saidas,'faturamento_competencia',v_faturamento,
    'despesas_competencia',v_despesas,'resultado_competencia',v_faturamento-v_despesas);
end $$;

create or replace function "RetificaPremium".get_financeiro_resumo(
  p_data_inicio date,p_data_fim date,p_modo text default 'CAIXA',p_fk_conta_financeira uuid default null
)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Resumo financeiro.','dados',
  "RetificaPremium".financeiro_resumo_usuario(
    "RetificaPremium".require_financeiro_usuario_id(),p_data_inicio,p_data_fim,p_modo,p_fk_conta_financeira)) $$;

create or replace function "RetificaPremium".get_financeiro_resumo_contexto_suporte(
  p_data_inicio date,p_data_fim date,p_modo text default 'CAIXA',p_fk_conta_financeira uuid default null,
  p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null
)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Resumo financeiro.','dados',
  "RetificaPremium".financeiro_resumo_usuario(
    "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),
    p_data_inicio,p_data_fim,p_modo,p_fk_conta_financeira)) $$;

create or replace function "RetificaPremium".financeiro_lancamentos_usuario(
  p_usuario uuid,p_data_inicio date,p_data_fim date,p_modo text,p_conta uuid,
  p_direcao text,p_status text,p_origem text,p_busca text,p_limite integer,p_offset integer
)
returns json
language plpgsql stable security definer set search_path=''
as $$
declare v_total int; v_dados json;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario);
  if p_data_inicio is null or p_data_fim is null or p_data_inicio>p_data_fim
     or coalesce(p_modo,'CAIXA') not in ('CAIXA','PREVISTO','COMPETENCIA') then
    raise exception 'Periodo ou modo invalido.' using errcode='P0602';
  end if;
  with lancamentos as (
    select n.id_notas_servico id,'ENTRADA'::text direcao,'NOTA_SERVICO'::text origem,
      n.id_notas_servico origem_id,n.os origem_numero,c.nome pessoa,'O.S. '||n.os descricao,
      null::uuid categoria_id,'Servicos / O.S.'::text categoria_nome,
      coalesce(n.receber_em,n.created_at::date) vencimento,
      coalesce(n.finalizado_em::date,n.receber_em,n.created_at::date) competencia,
      n.pago_em::timestamptz data_efetiva,null::uuid conta_id,null::text conta_nome,n.pago_com forma_pagamento,
      n.total previsto,coalesce(n.valor_recebido,0) realizado,
      greatest(n.total-coalesce(n.valor_recebido,0),0) aberto,n.payment_status status,
      (n.receber_em is null or n.finalizado_em is null) revisar,n.created_at::timestamptz created_at
    from "RetificaPremium"."Notas_de_Servico" n
    join "RetificaPremium"."Clientes" c on c.id_clientes=n.fk_clientes
    join "RetificaPremium"."Status_Notas" s on s.id_status_notas=n.fk_status
    where coalesce(p_modo,'CAIXA')<>'CAIXA'
      and c.fk_criado_por=p_usuario and n.fk_fechamentos is null
      and lower(s.nome) in ('entregue','recusada','sem conserto','finalizado')
    union all
    select f.id_fechamentos,'ENTRADA','FECHAMENTO',f.id_fechamentos,
      coalesce(f.label,f.periodo),c.nome,'Fechamento '||coalesce(f.label,f.periodo,c.nome),
      null,'Fechamentos',coalesce(f.vencimento_em,f.data_fechamento::date),f.data_fechamento::date,
      f.pago_em::timestamptz,null,null,f.pago_com,f.valor_total,coalesce(f.valor_recebido,0),
      greatest(f.valor_total-coalesce(f.valor_recebido,0),0),f.status_pagamento,
      f.vencimento_em is null,f.created_at::timestamptz
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes=f.fk_clientes
    where coalesce(p_modo,'CAIXA')<>'CAIXA' and c.fk_criado_por=p_usuario
    union all
    select cp.id_contas_pagar,'SAIDA','CONTA_PAGAR',cp.id_contas_pagar,
      cp.numero_documento,coalesce(fr.nome_fantasia,fr.nome,cp.nome_fornecedor),cp.titulo,
      cp.fk_categorias,cat.nome,cp.data_vencimento::date,
      coalesce(cp.data_competencia::date,cp.data_vencimento::date),cp.pago_em::timestamptz,
      null,null,cp.pago_com::text,cp.valor_final,coalesce(cp.valor_pago,0),
      greatest(cp.valor_final-coalesce(cp.valor_pago,0),0),cp.status::text,false,cp.created_at::timestamptz
    from "RetificaPremium"."Contas_Pagar" cp
    left join "RetificaPremium"."Fornecedores_Contas_Pagar" fr on fr.id_fornecedores=cp.fk_fornecedores
    left join "RetificaPremium"."Categorias_Contas_Pagar" cat on cat.id_categorias=cp.fk_categorias
    where coalesce(p_modo,'CAIXA')<>'CAIXA'
      and cp.fk_criado_por=p_usuario and cp.excluido_em is null and cp.status::text<>'CANCELADO'
    union all
    select r.id_financeiro_recebiveis_manuais,'ENTRADA','RECEBIVEL_MANUAL',
      r.id_financeiro_recebiveis_manuais,null,coalesce(c.nome,r.cliente_nome),r.descricao,
      r.fk_categorias_entradas,ce.nome,r.data_vencimento,r.data_competencia,null,
      null,null,null,r.valor_previsto,r.valor_recebido,greatest(r.valor_previsto-r.valor_recebido,0),
      r.status,false,r.created_at
    from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    left join "RetificaPremium"."Clientes" c on c.id_clientes=r.fk_clientes
    left join "RetificaPremium"."Categorias_Entradas" ce on ce.id_categorias_entradas=r.fk_categorias_entradas
    where coalesce(p_modo,'CAIXA')<>'CAIXA'
      and r.fk_criado_por=p_usuario and r.status<>'CANCELADO'
    union all
    select m.id_financeiro_movimentos,m.direcao,
      case when m.tipo_movimento='ESTORNO' then 'ESTORNO'
        when m.tipo_movimento='TRANSFERENCIA' then 'TRANSFERENCIA'
        when m.fk_notas_servico is not null then 'NOTA_SERVICO'
        when m.fk_fechamentos is not null then 'FECHAMENTO'
        when m.fk_contas_pagar is not null then 'CONTA_PAGAR'
        when m.fk_recebivel_manual is not null then 'RECEBIVEL_MANUAL'
        when m.tipo_movimento='APORTE' then 'APORTE'
        when m.tipo_movimento='REEMBOLSO' then 'REEMBOLSO'
        when m.tipo_movimento='AJUSTE' then 'AJUSTE'
        else 'MOVIMENTO_MANUAL' end,
      case when m.tipo_movimento='ESTORNO' then m.fk_movimento_origem
        else coalesce(m.fk_notas_servico,m.fk_fechamentos,m.fk_contas_pagar,m.fk_recebivel_manual) end,
      coalesce(n.os,f.label,f.periodo,cp.numero_documento),
      coalesce(cn.nome,cf.nome,fr.nome_fantasia,fr.nome,cp.nome_fornecedor,rm.cliente_nome),
      m.descricao,coalesce(m.fk_categorias_entradas,m.fk_categorias_saidas),
      coalesce(ce.nome,cs.nome),(m.data_efetiva at time zone 'America/Sao_Paulo')::date,
      m.data_competencia,m.data_efetiva,
      m.fk_financeiro_contas,fc.nome,m.forma_pagamento,m.valor,m.valor,0,
      case when m.status='REVISAR' then 'REVISAR' else 'PAGO' end,
      m.status='REVISAR',m.created_at
    from "RetificaPremium"."Financeiro_Movimentos" m
    join "RetificaPremium"."Financeiro_Contas" fc on fc.id_financeiro_contas=m.fk_financeiro_contas
    left join "RetificaPremium"."Categorias_Entradas" ce on ce.id_categorias_entradas=m.fk_categorias_entradas
    left join "RetificaPremium"."Categorias_Contas_Pagar" cs on cs.id_categorias=m.fk_categorias_saidas
    left join "RetificaPremium"."Notas_de_Servico" n on n.id_notas_servico=m.fk_notas_servico
    left join "RetificaPremium"."Clientes" cn on cn.id_clientes=n.fk_clientes
    left join "RetificaPremium"."Fechamentos" f on f.id_fechamentos=m.fk_fechamentos
    left join "RetificaPremium"."Clientes" cf on cf.id_clientes=f.fk_clientes
    left join "RetificaPremium"."Contas_Pagar" cp on cp.id_contas_pagar=m.fk_contas_pagar
    left join "RetificaPremium"."Fornecedores_Contas_Pagar" fr on fr.id_fornecedores=cp.fk_fornecedores
    left join "RetificaPremium"."Financeiro_Recebiveis_Manuais" rm
      on rm.id_financeiro_recebiveis_manuais=m.fk_recebivel_manual
    where m.fk_criado_por=p_usuario
      and (m.data_efetiva is null
        or (m.data_efetiva at time zone 'America/Sao_Paulo')::date>=fc.data_corte)
      and ((coalesce(p_modo,'CAIXA')='CAIXA' and m.status='CONFIRMADO')
        or (coalesce(p_modo,'CAIXA')<>'CAIXA'
          and m.fk_notas_servico is null and m.fk_fechamentos is null
          and m.fk_contas_pagar is null and m.fk_recebivel_manual is null
          and m.status in ('CONFIRMADO','ESTIMADO','REVISAR')))
  ), filtrados as (
    select * from lancamentos l where
      (p_direcao is null or l.direcao=p_direcao)
      and (p_status is null or l.status=p_status)
      and (p_origem is null or l.origem=p_origem)
      and (p_busca is null or concat_ws(' ',l.origem_numero,l.pessoa,l.descricao,l.categoria_nome) ilike '%'||p_busca||'%')
      and (p_conta is null or l.conta_id is null or l.conta_id=p_conta)
      and (case coalesce(p_modo,'CAIXA')
        when 'CAIXA' then (l.data_efetiva at time zone 'America/Sao_Paulo')::date between p_data_inicio and p_data_fim
        when 'COMPETENCIA' then l.competencia between p_data_inicio and p_data_fim
        else l.vencimento between p_data_inicio and p_data_fim end)
  )
  select count(*),coalesce(json_agg(f order by coalesce(f.data_efetiva,f.vencimento::timestamptz) desc)
    filter(where rn between greatest(coalesce(p_offset,0),0)+1
      and greatest(coalesce(p_offset,0),0)+least(greatest(coalesce(p_limite,50),1),500)),'[]'::json)
  into v_total,v_dados
  from (select filtrados.*,row_number() over(order by coalesce(data_efetiva,vencimento::timestamptz) desc) rn
    from filtrados) f;
  return json_build_object('status',200,'mensagem','Lancamentos financeiros.','total',v_total,'dados',v_dados);
end $$;

create or replace function "RetificaPremium".get_financeiro_lancamentos(
  p_data_inicio date,p_data_fim date,p_modo text default 'CAIXA',p_fk_conta_financeira uuid default null,
  p_direcao text default null,p_status text default null,p_origem text default null,p_busca text default null,
  p_limite integer default 50,p_offset integer default 0
)
returns json language sql stable security definer set search_path=''
as $$ select "RetificaPremium".financeiro_lancamentos_usuario(
  "RetificaPremium".require_financeiro_usuario_id(),p_data_inicio,p_data_fim,p_modo,p_fk_conta_financeira,
  p_direcao,p_status,p_origem,p_busca,p_limite,p_offset) $$;

create or replace function "RetificaPremium".get_financeiro_lancamentos_contexto_suporte(
  p_data_inicio date,p_data_fim date,p_modo text default 'CAIXA',p_fk_conta_financeira uuid default null,
  p_direcao text default null,p_status text default null,p_origem text default null,p_busca text default null,
  p_limite integer default 50,p_offset integer default 0,p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json language sql stable security definer set search_path=''
as $$ select "RetificaPremium".financeiro_lancamentos_usuario(
  "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),
  p_data_inicio,p_data_fim,p_modo,p_fk_conta_financeira,p_direcao,p_status,p_origem,p_busca,p_limite,p_offset) $$;

create or replace function "RetificaPremium".financeiro_extrato_usuario(
  p_usuario uuid,p_data_inicio date,p_data_fim date,p_conta uuid,p_busca text,p_limite integer,p_offset integer
)
returns json
language plpgsql stable security definer set search_path=''
as $$
declare v_total int; v_dados json;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario);
  if p_data_inicio is null or p_data_fim is null or p_data_inicio>p_data_fim then
    raise exception 'Periodo invalido.' using errcode='P0602';
  end if;
  with base as (
    select m.id_financeiro_movimentos id,m.direcao,
      case
        when m.tipo_movimento='ESTORNO' then 'ESTORNO'
        when m.tipo_movimento='TRANSFERENCIA' then 'TRANSFERENCIA'
        when m.fk_notas_servico is not null then 'NOTA_SERVICO'
        when m.fk_fechamentos is not null then 'FECHAMENTO'
        when m.fk_contas_pagar is not null then 'CONTA_PAGAR'
        when m.fk_recebivel_manual is not null then 'RECEBIVEL_MANUAL'
        when m.tipo_movimento='APORTE' then 'APORTE'
        when m.tipo_movimento='REEMBOLSO' then 'REEMBOLSO'
        when m.tipo_movimento='AJUSTE' then 'AJUSTE'
        else 'MOVIMENTO_MANUAL' end origem,
      case when m.tipo_movimento='ESTORNO' then m.fk_movimento_origem
        else coalesce(m.fk_notas_servico,m.fk_fechamentos,m.fk_contas_pagar,m.fk_recebivel_manual) end
        origem_id,
      m.descricao,m.valor,m.data_efetiva,m.fk_financeiro_contas conta_id,fc.nome conta_nome,
      m.forma_pagamento,
      coalesce(fc.saldo_inicial,0)+sum(case when m.direcao='ENTRADA' then m.valor else -m.valor end)
        over(partition by m.fk_financeiro_contas order by m.data_efetiva,m.created_at,m.id_financeiro_movimentos)
        saldo_acumulado,
      m.estornado_em is not null estornado,m.fk_movimento_origem estorno_de_id,m.motivo_estorno,
      u.nome usuario_nome,m.created_at
    from "RetificaPremium"."Financeiro_Movimentos" m
    join "RetificaPremium"."Financeiro_Contas" fc on fc.id_financeiro_contas=m.fk_financeiro_contas
    left join "RetificaPremium"."Usuarios" u on u.id_usuarios=m.fk_registrado_por
    where m.fk_criado_por=p_usuario and m.status='CONFIRMADO'
      and (m.data_efetiva at time zone 'America/Sao_Paulo')::date>=fc.data_corte
      and (p_conta is null or m.fk_financeiro_contas=p_conta)
  ), filtrados as (
    select * from base b where
      (b.data_efetiva at time zone 'America/Sao_Paulo')::date between p_data_inicio and p_data_fim
      and (p_busca is null or concat_ws(' ',b.descricao,b.conta_nome,b.origem) ilike '%'||p_busca||'%')
  )
  select count(*),coalesce(json_agg(x order by x.data_efetiva desc)
    filter(where rn between greatest(coalesce(p_offset,0),0)+1
      and greatest(coalesce(p_offset,0),0)+least(greatest(coalesce(p_limite,50),1),500)),'[]'::json)
  into v_total,v_dados
  from (select filtrados.*,row_number() over(order by data_efetiva desc,created_at desc) rn from filtrados) x;
  return json_build_object('status',200,'mensagem','Extrato financeiro.','total',v_total,'dados',v_dados);
end $$;

create or replace function "RetificaPremium".get_financeiro_extrato(
  p_data_inicio date,p_data_fim date,p_fk_conta_financeira uuid default null,p_busca text default null,
  p_limite integer default 50,p_offset integer default 0
)
returns json language sql stable security definer set search_path=''
as $$ select "RetificaPremium".financeiro_extrato_usuario(
  "RetificaPremium".require_financeiro_usuario_id(),p_data_inicio,p_data_fim,p_fk_conta_financeira,
  p_busca,p_limite,p_offset) $$;

create or replace function "RetificaPremium".get_financeiro_extrato_contexto_suporte(
  p_data_inicio date,p_data_fim date,p_fk_conta_financeira uuid default null,p_busca text default null,
  p_limite integer default 50,p_offset integer default 0,p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json language sql stable security definer set search_path=''
as $$ select "RetificaPremium".financeiro_extrato_usuario(
  "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),
  p_data_inicio,p_data_fim,p_fk_conta_financeira,p_busca,p_limite,p_offset) $$;

create or replace function "RetificaPremium".financeiro_contas_usuario(p_usuario uuid,p_inativas boolean)
returns json language sql stable security definer set search_path=''
as $$ select coalesce(json_agg(json_build_object(
  'id',c.id_financeiro_contas,'nome',c.nome,'tipo',c.tipo,'saldo_inicial',coalesce(c.saldo_inicial,0),
  'saldo_inicial_confirmado',c.saldo_inicial_confirmado,
  'data_corte',c.data_corte,'ativa',c.ativo,'padrao',c.padrao,'created_at',c.created_at,'updated_at',c.updated_at)
  order by c.padrao desc,c.nome),'[]'::json) from "RetificaPremium"."Financeiro_Contas" c
  where c.fk_criado_por=p_usuario and (coalesce(p_inativas,false) or c.ativo) $$;

create or replace function "RetificaPremium".get_financeiro_contas(p_incluir_inativas boolean default false)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Contas financeiras.','dados',
  "RetificaPremium".financeiro_contas_usuario(
    "RetificaPremium".require_financeiro_usuario_id(),p_incluir_inativas)) $$;
create or replace function "RetificaPremium".get_financeiro_contas_contexto_suporte(
  p_incluir_inativas boolean default false,p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Contas financeiras.','dados',
  "RetificaPremium".financeiro_contas_usuario(
    "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),p_incluir_inativas)) $$;

create or replace function "RetificaPremium".financeiro_categorias_usuario(p_usuario uuid,p_inativas boolean)
returns json language sql stable security definer set search_path=''
as $$ select coalesce(json_agg(json_build_object('id',c.id_categorias_entradas,'nome',c.nome,'cor',c.cor,
  'icone',c.icone,'impacta_dre',c.impacta_dre,'ativa',c.ativo) order by c.nome),'[]'::json)
  from "RetificaPremium"."Categorias_Entradas" c
  where c.fk_criado_por=p_usuario and (coalesce(p_inativas,false) or c.ativo) $$;
create or replace function "RetificaPremium".get_categorias_entradas(p_incluir_inativas boolean default false)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Categorias de entrada.','dados',
  "RetificaPremium".financeiro_categorias_usuario(
    "RetificaPremium".require_financeiro_usuario_id(),p_incluir_inativas)) $$;
create or replace function "RetificaPremium".get_categorias_entradas_contexto_suporte(
  p_incluir_inativas boolean default false,p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Categorias de entrada.','dados',
  "RetificaPremium".financeiro_categorias_usuario(
    "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),p_incluir_inativas)) $$;

create or replace function "RetificaPremium".financeiro_modelos_usuario(
  p_usuario uuid,p_inativos boolean,p_limite integer,p_offset integer
)
returns json language plpgsql stable security definer set search_path=''
as $$
declare v_total int; v_dados json;
begin
  select count(*) into v_total from "RetificaPremium"."Financeiro_Modelos_Recorrentes" m
  where m.fk_criado_por=p_usuario and (coalesce(p_inativos,false) or m.ativo);
  select coalesce(json_agg(x order by x.titulo),'[]'::json) into v_dados from (
    select m.id_financeiro_modelos_recorrentes id,m.titulo,m.fk_categorias categoria_id,
      c.nome categoria_nome,m.fk_fornecedores fornecedor_id,
      coalesce(f.nome_fantasia,f.nome,m.nome_fornecedor) fornecedor_nome,
      greatest(0,m.valor_original+m.juros-m.desconto) valor,m.recorrencia,m.dia_vencimento,
      m.proxima_competencia,m.forma_pagamento_prevista,m.ativo ativa,null::timestamptz ultima_geracao_em,
      m.created_at,m.updated_at
    from "RetificaPremium"."Financeiro_Modelos_Recorrentes" m
    join "RetificaPremium"."Categorias_Contas_Pagar" c on c.id_categorias=m.fk_categorias
    left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on f.id_fornecedores=m.fk_fornecedores
    where m.fk_criado_por=p_usuario and (coalesce(p_inativos,false) or m.ativo)
    order by m.titulo limit least(greatest(coalesce(p_limite,50),1),500)
    offset greatest(coalesce(p_offset,0),0)
  ) x;
  return json_build_object('status',200,'mensagem','Modelos recorrentes.','total',v_total,'dados',v_dados);
end $$;
create or replace function "RetificaPremium".get_financeiro_modelos_recorrentes(
  p_incluir_inativos boolean default false,p_limite integer default 50,p_offset integer default 0)
returns json language sql stable security definer set search_path=''
as $$ select "RetificaPremium".financeiro_modelos_usuario(
  "RetificaPremium".require_financeiro_usuario_id(),p_incluir_inativos,p_limite,p_offset) $$;
create or replace function "RetificaPremium".get_financeiro_modelos_recorrentes_contexto_suporte(
  p_incluir_inativos boolean default false,p_limite integer default 50,p_offset integer default 0,
  p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null)
returns json language sql stable security definer set search_path=''
as $$ select "RetificaPremium".financeiro_modelos_usuario(
  "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),
  p_incluir_inativos,p_limite,p_offset) $$;

create or replace function "RetificaPremium".financeiro_anexos_usuario(p_usuario uuid,p_movimento uuid)
returns json language sql stable security definer set search_path=''
as $$ select coalesce(json_agg(json_build_object('id',a.id_financeiro_anexos,
  'movimento_id',a.fk_financeiro_movimentos,'nome_arquivo',a.nome_arquivo,'caminho',a.storage_path,
  'mime_type',a.tipo_mime,'tamanho_bytes',a.tamanho_bytes,'created_at',a.created_at,
  'usuario_nome',u.nome) order by a.created_at desc),'[]'::json)
  from "RetificaPremium"."Financeiro_Anexos" a
  left join "RetificaPremium"."Usuarios" u on u.id_usuarios=a.fk_registrado_por
  where a.fk_criado_por=p_usuario and a.fk_financeiro_movimentos=p_movimento $$;
create or replace function "RetificaPremium".get_financeiro_anexos(p_fk_financeiro_movimentos uuid)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Comprovantes financeiros.','dados',
  "RetificaPremium".financeiro_anexos_usuario(
    "RetificaPremium".require_financeiro_usuario_id(),p_fk_financeiro_movimentos)) $$;
create or replace function "RetificaPremium".get_financeiro_anexos_contexto_suporte(
  p_fk_financeiro_movimentos uuid,p_contexto_usuario_id uuid default null,p_sessao_suporte uuid default null)
returns json language sql stable security definer set search_path=''
as $$ select json_build_object('status',200,'mensagem','Comprovantes financeiros.','dados',
  "RetificaPremium".financeiro_anexos_usuario(
    "RetificaPremium".financeiro_contexto_leitura(p_contexto_usuario_id,p_sessao_suporte),
    p_fk_financeiro_movimentos)) $$;

-- Funções internas não são API. As públicas normais e de suporte recebem
-- grants explícitos; suporte não recebe nenhuma mutação financeira.
revoke execute on function
  "RetificaPremium".financeiro_resumo_usuario(uuid,date,date,text,uuid),
  "RetificaPremium".financeiro_lancamentos_usuario(uuid,date,date,text,uuid,text,text,text,text,integer,integer),
  "RetificaPremium".financeiro_extrato_usuario(uuid,date,date,uuid,text,integer,integer),
  "RetificaPremium".financeiro_contas_usuario(uuid,boolean),
  "RetificaPremium".financeiro_categorias_usuario(uuid,boolean),
  "RetificaPremium".financeiro_modelos_usuario(uuid,boolean,integer,integer),
  "RetificaPremium".financeiro_anexos_usuario(uuid,uuid)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".financeiro_resumo_usuario(uuid,date,date,text,uuid),
  "RetificaPremium".financeiro_lancamentos_usuario(uuid,date,date,text,uuid,text,text,text,text,integer,integer),
  "RetificaPremium".financeiro_extrato_usuario(uuid,date,date,uuid,text,integer,integer),
  "RetificaPremium".financeiro_contas_usuario(uuid,boolean),
  "RetificaPremium".financeiro_categorias_usuario(uuid,boolean),
  "RetificaPremium".financeiro_modelos_usuario(uuid,boolean,integer,integer),
  "RetificaPremium".financeiro_anexos_usuario(uuid,uuid)
  to service_role;

revoke execute on function
  "RetificaPremium".get_financeiro_resumo(date,date,text,uuid),
  "RetificaPremium".get_financeiro_lancamentos(date,date,text,uuid,text,text,text,text,integer,integer),
  "RetificaPremium".get_financeiro_extrato(date,date,uuid,text,integer,integer),
  "RetificaPremium".get_financeiro_contas(boolean),
  "RetificaPremium".get_categorias_entradas(boolean),
  "RetificaPremium".get_financeiro_modelos_recorrentes(boolean,integer,integer),
  "RetificaPremium".get_financeiro_anexos(uuid),
  "RetificaPremium".get_financeiro_resumo_contexto_suporte(date,date,text,uuid,uuid,uuid),
  "RetificaPremium".get_financeiro_lancamentos_contexto_suporte(date,date,text,uuid,text,text,text,text,integer,integer,uuid,uuid),
  "RetificaPremium".get_financeiro_extrato_contexto_suporte(date,date,uuid,text,integer,integer,uuid,uuid),
  "RetificaPremium".get_financeiro_contas_contexto_suporte(boolean,uuid,uuid),
  "RetificaPremium".get_categorias_entradas_contexto_suporte(boolean,uuid,uuid),
  "RetificaPremium".get_financeiro_modelos_recorrentes_contexto_suporte(boolean,integer,integer,uuid,uuid),
  "RetificaPremium".get_financeiro_anexos_contexto_suporte(uuid,uuid,uuid)
  from public,anon;
grant execute on function
  "RetificaPremium".get_financeiro_resumo(date,date,text,uuid),
  "RetificaPremium".get_financeiro_lancamentos(date,date,text,uuid,text,text,text,text,integer,integer),
  "RetificaPremium".get_financeiro_extrato(date,date,uuid,text,integer,integer),
  "RetificaPremium".get_financeiro_contas(boolean),
  "RetificaPremium".get_categorias_entradas(boolean),
  "RetificaPremium".get_financeiro_modelos_recorrentes(boolean,integer,integer),
  "RetificaPremium".get_financeiro_anexos(uuid),
  "RetificaPremium".get_financeiro_resumo_contexto_suporte(date,date,text,uuid,uuid,uuid),
  "RetificaPremium".get_financeiro_lancamentos_contexto_suporte(date,date,text,uuid,text,text,text,text,integer,integer,uuid,uuid),
  "RetificaPremium".get_financeiro_extrato_contexto_suporte(date,date,uuid,text,integer,integer,uuid,uuid),
  "RetificaPremium".get_financeiro_contas_contexto_suporte(boolean,uuid,uuid),
  "RetificaPremium".get_categorias_entradas_contexto_suporte(boolean,uuid,uuid),
  "RetificaPremium".get_financeiro_modelos_recorrentes_contexto_suporte(boolean,integer,integer,uuid,uuid),
  "RetificaPremium".get_financeiro_anexos_contexto_suporte(uuid,uuid,uuid)
  to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 8. Comprovantes privados
-- ---------------------------------------------------------------------------

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financeiro-comprovantes','financeiro-comprovantes',false,15728640,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists financeiro_comprovantes_insert_own on storage.objects;
create policy financeiro_comprovantes_insert_own on storage.objects
for insert to authenticated with check (
  bucket_id='financeiro-comprovantes'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from "RetificaPremium"."Financeiro_Movimentos" m
    where m.id_financeiro_movimentos=(
      case when coalesce((storage.foldername(name))[2],'') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(name))[2]::uuid end)
      and m.fk_criado_por=(select "RetificaPremium".current_financeiro_usuario_id())
  )
);
drop policy if exists financeiro_comprovantes_select_own on storage.objects;
create policy financeiro_comprovantes_select_own on storage.objects
for select to authenticated using (
  bucket_id='financeiro-comprovantes'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from "RetificaPremium"."Financeiro_Movimentos" m
    where m.id_financeiro_movimentos=(
      case when coalesce((storage.foldername(name))[2],'') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(name))[2]::uuid end)
      and m.fk_criado_por=(select "RetificaPremium".current_financeiro_usuario_id())
  )
);
drop policy if exists financeiro_comprovantes_delete_own on storage.objects;
-- Comprovantes são evidência imutável nesta entrega. Não há policy DELETE
-- para authenticated; remoções futuras exigirão fluxo administrativo auditado.

-- ROLLBACK OPERACIONAL (executar somente após exportar o razão):
-- 1. Desativar menu/mutações do Financeiro.
-- 2. Desagendar cron retiflow-financeiro-recorrencias (migration seguinte).
-- 3. Restaurar as versões anteriores de marcar_fechamento_pago e
--    estornar_fechamento_pago.
-- 4. Remover policies/bucket somente depois de baixar os comprovantes.
-- 5. DROP das RPCs/tabelas novas na ordem Anexos, Movimentos, Modelos,
--    Recebiveis, Categorias e Contas.
-- 6. Só remover valor_recebido/receber_em/vencimento_em e constraints PARCIAL
--    quando não houver movimento; por padrão elas são preservadas.
