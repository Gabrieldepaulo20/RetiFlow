-- Padroniza numeros de O.S. como OS-<numero> e remove zeros a esquerda.
-- A regra preserva o numero logico existente: 0014, 14 e OS-0014 viram OS-14.

create or replace function "RetificaPremium".normalizar_numero_os(p_os text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(regexp_replace(coalesce(p_os, ''), '\D', '', 'g'), '') is null then null
    else 'OS-' || (nullif(regexp_replace(coalesce(p_os, ''), '\D', '', 'g'), '')::numeric)::text
  end;
$$;

revoke all on function "RetificaPremium".normalizar_numero_os(text) from public;
grant execute on function "RetificaPremium".normalizar_numero_os(text) to authenticated, service_role;

do $$
begin
  if exists (
    with candidatos as (
      select
        criado_por_usuario,
        "RetificaPremium".normalizar_numero_os(os) as os_normalizada,
        count(*) as total
      from "RetificaPremium"."Notas_de_Servico"
      where criado_por_usuario is not null
        and "RetificaPremium".normalizar_numero_os(os) is not null
      group by criado_por_usuario, "RetificaPremium".normalizar_numero_os(os)
      having count(*) > 1
    )
    select 1 from candidatos
  ) then
    raise exception 'Existem O.S. numericamente duplicadas. Normalize os conflitos antes de aplicar a padronizacao.' using errcode = 'P3002';
  end if;
end;
$$;

update "RetificaPremium"."Notas_de_Servico"
set os = "RetificaPremium".normalizar_numero_os(os)
where "RetificaPremium".normalizar_numero_os(os) is not null
  and os is distinct from "RetificaPremium".normalizar_numero_os(os);

create or replace function "RetificaPremium".trg_normalizar_numero_os()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
begin
  new.os := "RetificaPremium".normalizar_numero_os(new.os);

  if new.os is null then
    raise exception 'Número da O.S. é obrigatório.' using errcode = 'P3001';
  end if;

  return new;
end;
$$;

revoke all on function "RetificaPremium".trg_normalizar_numero_os() from public;

drop trigger if exists trg_normalizar_numero_os on "RetificaPremium"."Notas_de_Servico";
create trigger trg_normalizar_numero_os
before insert or update of os
on "RetificaPremium"."Notas_de_Servico"
for each row
execute function "RetificaPremium".trg_normalizar_numero_os();
