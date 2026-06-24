-- Prevent duplicated customer names inside the same operational tenant.
--
-- Why: the legacy import allowed the same workshop/company to enter twice when
-- the document had a typo. That can split O.S. history and monthly closings.
-- The guard lives in the database so frontend/support paths cannot bypass it.

create or replace function "RetificaPremium".normalizar_nome_cliente(p_nome text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(
          translate(
            coalesce(p_nome, ''),
            'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
            'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
          )
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function "RetificaPremium".enforce_unique_cliente_nome()
returns trigger
language plpgsql
set search_path to 'RetificaPremium', 'public'
as $$
declare
  v_nome_key text;
begin
  if tg_op = 'UPDATE'
    and "RetificaPremium".normalizar_nome_cliente(new.nome)
      is not distinct from "RetificaPremium".normalizar_nome_cliente(old.nome)
    and new.fk_criado_por is not distinct from old.fk_criado_por
  then
    return new;
  end if;

  v_nome_key := "RetificaPremium".normalizar_nome_cliente(new.nome);

  if v_nome_key is not null
    and new.fk_criado_por is not null
    and exists (
      select 1
      from "RetificaPremium"."Clientes" c
      where c.fk_criado_por = new.fk_criado_por
        and c.id_clientes <> new.id_clientes
        and "RetificaPremium".normalizar_nome_cliente(c.nome) = v_nome_key
    )
  then
    raise exception 'Já existe um cliente com este nome nesta conta.'
      using errcode = 'P2002';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_unique_cliente_nome on "RetificaPremium"."Clientes";

create trigger trg_unique_cliente_nome
before insert or update of nome, fk_criado_por on "RetificaPremium"."Clientes"
for each row
execute function "RetificaPremium".enforce_unique_cliente_nome();

grant execute on function "RetificaPremium".normalizar_nome_cliente(text) to authenticated, service_role;
