-- Regra de negócio: a data da O.S. e o prazo podem estar em qualquer ordem e
-- Versao registrada na producao: 20260808154240.
-- podem ser futuras ou passadas, desde que pertençam ao mesmo ano civil.
--
-- As RPCs acumulam validações de tenant, suporte e bloqueio por fechamento em
-- várias migrations. Este patch altera apenas os fragmentos de data esperados
-- e falha explicitamente se houver drift no corpo atual.

do $migration$
declare
  v_definition text;
begin
  -- Criação normal ----------------------------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'nova_nota'
     and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if strpos(v_definition, $old$
  if v_entry_date > v_base_date then
    raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'nova_nota: bloqueio de data futura não encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  if v_entry_date > v_base_date then
    raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
  end if;
$old$, E'\n');

  if strpos(v_definition, $old$
    (v_entry_date + 5)::timestamp
$old$) = 0 then
    raise exception 'nova_nota: prazo padrão não encontrado';
  end if;
  v_definition := replace(v_definition, $old$
    (v_entry_date + 5)::timestamp
$old$, $new$
    least(
      v_entry_date + 5,
      make_date(extract(year from v_entry_date)::integer, 12, 31)
    )::timestamp
$new$);

  if strpos(v_definition, $old$
  if v_prazo::date < v_entry_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'nova_nota: validação de ordem das datas não encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  if v_prazo::date < v_entry_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$, $new$
  if extract(year from v_prazo::date) <> extract(year from v_entry_date) then
    raise exception 'A data da O.S. e o prazo devem pertencer ao mesmo ano civil.' using errcode = 'P3001';
  end if;
$new$);

  execute v_definition;

  -- Edição normal -----------------------------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'update_nota_servico'
     and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if strpos(v_definition, $old$
    if v_new_created_at::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
    end if;
$old$) = 0 then
    raise exception 'update_nota_servico: bloqueio de data futura não encontrado';
  end if;
  v_definition := replace(v_definition, $old$
    if v_new_created_at::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
    end if;
$old$, E'\n');

  if strpos(v_definition, $old$
  if v_prazo is not null and v_prazo::date < v_new_created_at::date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'update_nota_servico: validação de ordem das datas não encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  if v_prazo is not null and v_prazo::date < v_new_created_at::date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$, $new$
  if v_prazo is not null
     and extract(year from v_prazo::date) <> extract(year from v_new_created_at::date) then
    raise exception 'A data da O.S. e o prazo devem pertencer ao mesmo ano civil.' using errcode = 'P3001';
  end if;
$new$);

  execute v_definition;

  -- Criação em contexto de suporte -----------------------------------------
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'nova_nota_contexto_suporte';

  if strpos(v_definition, $old$
  if v_entry_date > v_base_date then
    raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'nova_nota_contexto_suporte: bloqueio de data futura não encontrado';
  end if;
  v_definition := replace(v_definition, $old$
  if v_entry_date > v_base_date then
    raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
  end if;
$old$, E'\n');

  if strpos(v_definition, $old$
    (v_entry_date + 5)::timestamp
$old$) = 0 then
    raise exception 'nova_nota_contexto_suporte: prazo padrão não encontrado';
  end if;
  v_definition := replace(v_definition, $old$
    (v_entry_date + 5)::timestamp
$old$, $new$
    least(
      v_entry_date + 5,
      make_date(extract(year from v_entry_date)::integer, 12, 31)
    )::timestamp
$new$);

  if strpos(v_definition, $old$
  if v_prazo::date < v_entry_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'nova_nota_contexto_suporte: validação de ordem das datas não encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  if v_prazo::date < v_entry_date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$, $new$
  if extract(year from v_prazo::date) <> extract(year from v_entry_date) then
    raise exception 'A data da O.S. e o prazo devem pertencer ao mesmo ano civil.' using errcode = 'P3001';
  end if;
$new$);

  execute v_definition;

  -- Edição em contexto de suporte. Desde a Central Financeira, o wrapper
  -- público delega para esta implementação preservada.
  select pg_get_functiondef(p.oid)
    into strict v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'RetificaPremium'
     and p.proname = 'update_nota_servico_contexto_suporte_pre_financeiro';

  if strpos(v_definition, $old$
    if v_new_created_at::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
    end if;
$old$) = 0 then
    raise exception 'update_nota_servico_contexto_suporte_pre_financeiro: bloqueio de data futura não encontrado';
  end if;
  v_definition := replace(v_definition, $old$
    if v_new_created_at::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de entrada da O.S. não pode ser futura.' using errcode = 'P3001';
    end if;
$old$, E'\n');

  if strpos(v_definition, $old$
  if v_prazo is not null and v_prazo::date < v_new_created_at::date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$) = 0 then
    raise exception 'update_nota_servico_contexto_suporte_pre_financeiro: validação de ordem das datas não encontrada';
  end if;
  v_definition := replace(v_definition, $old$
  if v_prazo is not null and v_prazo::date < v_new_created_at::date then
    raise exception 'O prazo não pode ser anterior à data de entrada da O.S.' using errcode = 'P3001';
  end if;
$old$, $new$
  if v_prazo is not null
     and extract(year from v_prazo::date) <> extract(year from v_new_created_at::date) then
    raise exception 'A data da O.S. e o prazo devem pertencer ao mesmo ano civil.' using errcode = 'P3001';
  end if;
$new$);

  execute v_definition;
end;
$migration$;

comment on function "RetificaPremium".nova_nota(jsonb) is
  'Creates service/purchase notes. Service data_entrada and prazo may be in any order but must share the same calendar year.';

comment on function "RetificaPremium".update_nota_servico(jsonb) is
  'Updates unlocked service notes. data_entrada and prazo may be in any order but must share the same calendar year.';

-- Rollback: restore the four function definitions from the state immediately
-- before this migration. No rows, closing snapshots, RLS policies or indexes
-- are changed here.
