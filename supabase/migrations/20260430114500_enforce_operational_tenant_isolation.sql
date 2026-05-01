-- Enforces per-user ownership for operational data.
-- This migration intentionally keeps legacy records by assigning orphan rows to
-- the configured Mega Master. New operational reads/writes are scoped by auth.uid().

create or replace function "RetificaPremium".current_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = "RetificaPremium", public
as $$
  select u.id_usuarios
  from "RetificaPremium"."Usuarios" u
  where u.auth_id = auth.uid()
  limit 1
$$;

create or replace function "RetificaPremium".require_current_usuario_id()
returns uuid
language plpgsql
stable
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = 'P0401';
  end if;

  v_usuario_id := "RetificaPremium".current_usuario_id();
  if v_usuario_id is null then
    raise exception 'Usuário interno não encontrado.' using errcode = 'P0403';
  end if;

  return v_usuario_id;
end;
$$;

alter table "RetificaPremium"."Clientes"
  add column if not exists fk_criado_por uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'Clientes_fk_criado_por_fkey'
      and conrelid = '"RetificaPremium"."Clientes"'::regclass
  ) then
    alter table "RetificaPremium"."Clientes"
      add constraint "Clientes_fk_criado_por_fkey"
      foreign key (fk_criado_por)
      references "RetificaPremium"."Usuarios"(id_usuarios)
      on delete set null;
  end if;
end;
$$;

do $$
declare
  v_mega_master_id uuid;
begin
  select id_usuarios
  into v_mega_master_id
  from "RetificaPremium"."Usuarios"
  where lower(email) = 'gabrielwilliam208@gmail.com'
  order by created_at asc
  limit 1;

  if v_mega_master_id is null then
    raise exception 'Mega Master não encontrado para backfill de tenant.';
  end if;

  update "RetificaPremium"."Clientes"
     set fk_criado_por = v_mega_master_id
   where fk_criado_por is null;

  update "RetificaPremium"."Notas_de_Servico"
     set criado_por_usuario = v_mega_master_id
   where criado_por_usuario is null;

  update "RetificaPremium"."Contas_Pagar"
     set fk_criado_por = v_mega_master_id
   where fk_criado_por is null;
end;
$$;

alter table "RetificaPremium"."Clientes"
  drop constraint if exists "Clientes_documento_key";

create index if not exists idx_clientes_fk_criado_por
  on "RetificaPremium"."Clientes"(fk_criado_por);

create unique index if not exists idx_clientes_owner_documento_unique
  on "RetificaPremium"."Clientes"(fk_criado_por, documento)
  where fk_criado_por is not null and documento is not null;

create index if not exists idx_notas_servico_criado_por
  on "RetificaPremium"."Notas_de_Servico"(criado_por_usuario, created_at desc);

create index if not exists idx_contas_pagar_criado_por
  on "RetificaPremium"."Contas_Pagar"(fk_criado_por, data_vencimento asc);

create or replace function "RetificaPremium".enforce_client_owner()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if tg_op = 'INSERT' then
    new.fk_criado_por := coalesce(new.fk_criado_por, v_usuario_id);
    if new.fk_criado_por is distinct from v_usuario_id then
      raise exception 'Cliente pertence a outro usuário.' using errcode = 'P0403';
    end if;
    return new;
  end if;

  if old.fk_criado_por is distinct from v_usuario_id then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P0403';
  end if;

  if tg_op = 'UPDATE' then
    new.fk_criado_por := old.fk_criado_por;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_client_owner on "RetificaPremium"."Clientes";
create trigger trg_enforce_client_owner
before insert or update or delete on "RetificaPremium"."Clientes"
for each row execute function "RetificaPremium".enforce_client_owner();

create or replace function "RetificaPremium".enforce_note_owner()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if tg_op = 'INSERT' then
    new.criado_por_usuario := coalesce(new.criado_por_usuario, v_usuario_id);
    if new.criado_por_usuario is distinct from v_usuario_id then
      raise exception 'O.S. pertence a outro usuário.' using errcode = 'P0403';
    end if;
    return new;
  end if;

  if old.criado_por_usuario is distinct from v_usuario_id then
    raise exception 'O.S. não encontrada para este usuário.' using errcode = 'P0403';
  end if;

  if tg_op = 'UPDATE' then
    new.criado_por_usuario := old.criado_por_usuario;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_note_owner on "RetificaPremium"."Notas_de_Servico";
create trigger trg_enforce_note_owner
before insert or update or delete on "RetificaPremium"."Notas_de_Servico"
for each row execute function "RetificaPremium".enforce_note_owner();

create or replace function "RetificaPremium".enforce_payable_owner()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if tg_op = 'INSERT' then
    new.fk_criado_por := coalesce(new.fk_criado_por, v_usuario_id);
    if new.fk_criado_por is distinct from v_usuario_id then
      raise exception 'Conta pertence a outro usuário.' using errcode = 'P0403';
    end if;
    return new;
  end if;

  if old.fk_criado_por is distinct from v_usuario_id then
    raise exception 'Conta não encontrada para este usuário.' using errcode = 'P0403';
  end if;

  if tg_op = 'UPDATE' then
    new.fk_criado_por := old.fk_criado_por;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_payable_owner on "RetificaPremium"."Contas_Pagar";
create trigger trg_enforce_payable_owner
before insert or update or delete on "RetificaPremium"."Contas_Pagar"
for each row execute function "RetificaPremium".enforce_payable_owner();

create or replace function "RetificaPremium".enforce_closing_owner()
returns trigger
language plpgsql
security definer
set search_path = "RetificaPremium", public
as $$
declare
  v_usuario_id uuid;
  v_client_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_usuario_id := "RetificaPremium".require_current_usuario_id();
  v_client_id := case when tg_op = 'DELETE' then old.fk_clientes else new.fk_clientes end;

  if v_client_id is null or not exists (
    select 1
    from "RetificaPremium"."Clientes" c
    where c.id_clientes = v_client_id
      and c.fk_criado_por = v_usuario_id
  ) then
    raise exception 'Fechamento não pertence a um cliente deste usuário.' using errcode = 'P0403';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_enforce_closing_owner on "RetificaPremium"."Fechamentos";
create trigger trg_enforce_closing_owner
before insert or update or delete on "RetificaPremium"."Fechamentos"
for each row execute function "RetificaPremium".enforce_closing_owner();

create or replace function "RetificaPremium".get_clientes(
  p_busca text default null,
  p_status boolean default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select count(*)
  into v_total
  from "RetificaPremium"."Clientes" c
  where c.fk_criado_por = v_usuario_id
    and (p_status is null or c.status = p_status)
    and (
      p_busca is null
      or c.nome ilike '%' || p_busca || '%'
      or c.documento ilike '%' || p_busca || '%'
      or exists (
        select 1
        from "RetificaPremium"."Enderecos" e
        where e.fk_clientes = c.id_clientes
          and e.cidade ilike '%' || p_busca || '%'
      )
    );

  select coalesce(json_agg(r order by r.nome asc), '[]'::json)
  into v_dados
  from (
    select
      c.id_clientes,
      c.nome,
      c.nome_fantasia,
      c.documento,
      c.tipo_documento,
      c.status,
      c.observacao,
      c.created_at,
      (select con.contato from "RetificaPremium"."Contatos" con
       where con.fk_clientes = c.id_clientes and con.tipo_contato = 'telefone'
       order by con.created_at asc limit 1) as telefone,
      (select con.contato from "RetificaPremium"."Contatos" con
       where con.fk_clientes = c.id_clientes and con.tipo_contato = 'email'
       order by con.created_at asc limit 1) as email,
      e.cep,
      e.rua,
      e.numero,
      e.bairro,
      e.cidade,
      e.uf,
      e.estado
    from "RetificaPremium"."Clientes" c
    left join "RetificaPremium"."Enderecos" e on e.fk_clientes = c.id_clientes
    where c.fk_criado_por = v_usuario_id
      and (p_status is null or c.status = p_status)
      and (
        p_busca is null
        or c.nome ilike '%' || p_busca || '%'
        or c.documento ilike '%' || p_busca || '%'
        or e.cidade ilike '%' || p_busca || '%'
      )
    order by c.nome asc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Clientes encontrados.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".insert_cliente(
  p_nome text,
  p_documento text,
  p_tipo_documento text,
  p_status boolean,
  p_observacao text default null,
  p_nome_fantasia text default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_id_clientes "RetificaPremium"."Clientes"."id_clientes"%type;
  v_documento_limpo text;
  v_tipo_doc_formatado text;
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_nome is null or trim(p_nome) = '' then
    raise exception 'Erro de parâmetro' using errcode = 'P0001';
  end if;
  if p_documento is null or trim(p_documento) = '' then
    raise exception 'Erro de parâmetro' using errcode = 'P0002';
  end if;
  if p_tipo_documento is null or trim(p_tipo_documento) = '' then
    raise exception 'Erro de parâmetro' using errcode = 'P0003';
  end if;
  if p_status is null then
    raise exception 'Erro de parâmetro' using errcode = 'P0004';
  end if;

  v_documento_limpo := upper(regexp_replace(p_documento, '[^a-zA-Z0-9]', '', 'g'));
  v_tipo_doc_formatado := upper(trim(p_tipo_documento));

  if v_tipo_doc_formatado = 'CPF' and length(v_documento_limpo) != 11 then
    raise exception 'Erro de validação' using errcode = 'P0005';
  end if;
  if v_tipo_doc_formatado = 'CNPJ' and length(v_documento_limpo) != 14 then
    raise exception 'Erro de validação' using errcode = 'P0006';
  end if;

  insert into "RetificaPremium"."Clientes" (
    nome, documento, tipo_documento, status, observacao, nome_fantasia, fk_criado_por
  ) values (
    initcap(trim(p_nome)),
    v_documento_limpo,
    v_tipo_doc_formatado::"RetificaPremium"."tipo_documento",
    p_status,
    p_observacao,
    nullif(trim(coalesce(p_nome_fantasia, '')), ''),
    v_usuario_id
  )
  returning id_clientes into v_id_clientes;

  return json_build_object('status', 200, 'mensagem', 'Cliente cadastrado com sucesso.', 'id_clientes', v_id_clientes);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P0001' then return json_build_object('status', 400, 'code', 'missing_name', 'mensagem', 'O nome do cliente é obrigatório.');
  when sqlstate 'P0002' then return json_build_object('status', 400, 'code', 'missing_document', 'mensagem', 'O documento é obrigatório.');
  when sqlstate 'P0003' then return json_build_object('status', 400, 'code', 'missing_doc_type', 'mensagem', 'O tipo de documento é obrigatório.');
  when sqlstate 'P0004' then return json_build_object('status', 400, 'code', 'missing_status', 'mensagem', 'O status é obrigatório.');
  when sqlstate 'P0005' then return json_build_object('status', 400, 'code', 'invalid_cpf', 'mensagem', 'CPF deve conter 11 dígitos.');
  when sqlstate 'P0006' then return json_build_object('status', 400, 'code', 'invalid_cnpj', 'mensagem', 'CNPJ deve conter 14 dígitos.');
  when unique_violation then return json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  when invalid_text_representation then return json_build_object('status', 400, 'code', 'invalid_enum', 'mensagem', 'Tipo de documento inválido. Use CPF ou CNPJ.');
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".salvar_cliente_completo(p_payload jsonb)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_id_cliente "RetificaPremium"."Clientes"."id_clientes"%type;
  v_documento_limpo text;
  v_endereco jsonb;
  v_id_endereco_existente "RetificaPremium"."Enderecos"."id_enderecos"%type;
  v_contatos jsonb;
  v_contato_item jsonb;
  v_retorno_json json;
  v_acao_log text;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();
  v_id_cliente := nullif(p_payload->>'id_clientes', '')::uuid;

  if v_id_cliente is not null and not exists (
    select 1 from "RetificaPremium"."Clientes"
    where id_clientes = v_id_cliente and fk_criado_por = v_usuario_id
  ) then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  if v_id_cliente is null and p_payload->>'documento' is not null and p_payload->>'documento' <> '' then
    v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));
    select id_clientes
    into v_id_cliente
    from "RetificaPremium"."Clientes"
    where documento = v_documento_limpo
      and fk_criado_por = v_usuario_id;
  end if;

  if v_id_cliente is not null then
    v_retorno_json := "RetificaPremium".update_cliente(
      v_id_cliente,
      p_payload->>'nome',
      p_payload->>'documento',
      p_payload->>'tipo_documento',
      (p_payload->>'status')::boolean,
      p_payload->>'observacao',
      p_payload->>'nome_fantasia'
    );
    v_acao_log := 'cliente_atualizado';
  else
    v_retorno_json := "RetificaPremium".insert_cliente(
      p_payload->>'nome',
      p_payload->>'documento',
      p_payload->>'tipo_documento',
      coalesce((p_payload->>'status')::boolean, true),
      p_payload->>'observacao',
      p_payload->>'nome_fantasia'
    );
    if (v_retorno_json->>'status')::int = 200 then
      v_id_cliente := nullif(v_retorno_json->>'id_clientes', '')::uuid;
    end if;
    v_acao_log := 'cliente_criado';
  end if;

  if (v_retorno_json->>'status')::int <> 200 then
    raise exception '%', v_retorno_json->>'mensagem';
  end if;

  v_endereco := p_payload->'endereco';
  if v_endereco is not null then
    select id_enderecos
    into v_id_endereco_existente
    from "RetificaPremium"."Enderecos"
    where fk_clientes = v_id_cliente;

    if v_id_endereco_existente is not null then
      v_retorno_json := "RetificaPremium".update_endereco(
        v_id_endereco_existente,
        v_endereco->>'cep', v_endereco->>'uf', v_endereco->>'estado',
        v_endereco->>'cidade', v_endereco->>'bairro', v_endereco->>'rua', v_endereco->>'numero'
      );
    else
      v_retorno_json := "RetificaPremium".insert_endereco(
        v_id_cliente,
        v_endereco->>'cep', v_endereco->>'uf', v_endereco->>'estado',
        v_endereco->>'cidade', v_endereco->>'bairro', v_endereco->>'rua', v_endereco->>'numero'
      );
    end if;

    if (v_retorno_json->>'status')::int <> 200 then
      raise exception '%', v_retorno_json->>'mensagem';
    end if;
  end if;

  v_contatos := p_payload->'contatos';
  if v_contatos is not null and jsonb_typeof(v_contatos) = 'array' then
    if v_acao_log = 'cliente_atualizado' then
      delete from "RetificaPremium"."Contatos"
      where fk_clientes = v_id_cliente
        and tipo_contato in ('telefone', 'email');
    end if;

    for v_contato_item in select * from jsonb_array_elements(v_contatos) loop
      v_retorno_json := "RetificaPremium".insert_contato(
        v_id_cliente,
        v_contato_item->>'contato',
        v_contato_item->>'tipo_contato'
      );
      if (v_retorno_json->>'status')::int <> 200 then
        if v_retorno_json->>'code' = 'duplicate_contact' then
          continue;
        end if;
        raise exception '%', v_retorno_json->>'mensagem';
      end if;
    end loop;
  end if;

  begin
    perform "RetificaPremium".insert_log(v_acao_log, 'Clientes', v_id_cliente::text, 'Cliente processado: ' || (p_payload->>'nome'));
  exception when others then null;
  end;

  return json_build_object('status', 200, 'mensagem', 'Cliente e vínculos processados com sucesso.', 'id_cliente', v_id_cliente);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when raise_exception then return json_build_object('status', 400, 'code', 'validation_error', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_notas_servico(
  p_fk_clientes uuid default null,
  p_fk_status smallint default null,
  p_busca text default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select count(*)
  into v_total
  from "RetificaPremium"."Notas_de_Servico" ns
  where ns.criado_por_usuario = v_usuario_id
    and (p_fk_clientes is null or ns.fk_clientes = p_fk_clientes)
    and (p_fk_status is null or ns.fk_status = p_fk_status)
    and (p_busca is null or ns.os ilike '%' || p_busca || '%' or ns.defeito ilike '%' || p_busca || '%');

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      ns.id_notas_servico,
      ns.os,
      ns.prazo,
      ns.defeito,
      ns.observacoes,
      ns.total,
      ns.total_servicos,
      ns.total_produtos,
      ns.created_at,
      ns.updated_at,
      ns.pdf_url,
      ns.finalizado_em,
      json_build_object('id', c.id_clientes, 'nome', c.nome) as cliente,
      json_build_object('id', v.id_veiculos, 'modelo', v.modelo, 'placa', v.placa, 'km', v.km, 'motor', coalesce(tm.tipo, '')) as veiculo,
      json_build_object('id', sn.id_status_notas, 'nome', sn.nome, 'index', sn.index, 'tipo_status', sn.tipo_status) as status
    from "RetificaPremium"."Notas_de_Servico" ns
    join "RetificaPremium"."Clientes" c on ns.fk_clientes = c.id_clientes and c.fk_criado_por = v_usuario_id
    join "RetificaPremium"."Veiculos" v on ns.fk_veiculos = v.id_veiculos
    join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
    left join "RetificaPremium"."Tipos_de_Motor" tm on v.fk_tipos_de_motor = tm.id_tipos_de_motor
    where ns.criado_por_usuario = v_usuario_id
      and (p_fk_clientes is null or ns.fk_clientes = p_fk_clientes)
      and (p_fk_status is null or ns.fk_status = p_fk_status)
      and (p_busca is null or ns.os ilike '%' || p_busca || '%' or ns.defeito ilike '%' || p_busca || '%')
    order by ns.created_at desc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Notas de Serviço encontradas.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_fechamentos(
  p_fk_clientes uuid default null,
  p_periodo text default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select count(*)
  into v_total
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where c.fk_criado_por = v_usuario_id
    and (p_fk_clientes is null or f.fk_clientes = p_fk_clientes)
    and (p_periodo is null or f.periodo = p_periodo);

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json)
  into v_dados
  from (
    select
      f.id_fechamentos,
      f.mes,
      f.ano,
      f.periodo,
      f.label,
      f.valor_total,
      f.versao,
      f.total_regeneracoes,
      f.total_edicoes,
      f.total_downloads,
      f.dados_json,
      f.pdf_url,
      f.created_at,
      f.updated_at,
      json_build_object('id', c.id_clientes, 'nome', c.nome) as cliente
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
    where c.fk_criado_por = v_usuario_id
      and (p_fk_clientes is null or f.fk_clientes = p_fk_clientes)
      and (p_periodo is null or f.periodo = p_periodo)
    order by f.created_at desc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Fechamentos encontrados.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_contas_pagar(
  p_status text default null,
  p_fk_categorias uuid default null,
  p_fk_fornecedores uuid default null,
  p_busca text default null,
  p_apenas_urgentes boolean default null,
  p_apenas_vencidas boolean default null,
  p_incluir_excluidas boolean default false,
  p_limite integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select count(*)
  into v_total
  from "RetificaPremium"."Contas_Pagar" cp
  where cp.fk_criado_por = v_usuario_id
    and (coalesce(p_incluir_excluidas, false) = true or cp.excluido_em is null)
    and (p_status is null or cp.status::text = upper(trim(p_status)))
    and (p_apenas_vencidas is null or p_apenas_vencidas = false or (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()))
    and (p_fk_categorias is null or cp.fk_categorias = p_fk_categorias)
    and (p_fk_fornecedores is null or cp.fk_fornecedores = p_fk_fornecedores)
    and (p_apenas_urgentes is null or cp.urgente = p_apenas_urgentes)
    and (p_busca is null or cp.titulo ilike '%' || p_busca || '%' or cp.nome_fornecedor ilike '%' || p_busca || '%' or cp.numero_documento ilike '%' || p_busca || '%');

  select coalesce(json_agg(r order by r.data_vencimento asc), '[]'::json)
  into v_dados
  from (
    select
      cp.id_contas_pagar,
      cp.titulo,
      cp.nome_fornecedor,
      cp.numero_documento,
      cp.data_vencimento,
      cp.data_emissao,
      cp.data_competencia,
      cp.valor_original,
      cp.juros,
      cp.desconto,
      cp.valor_final,
      cp.valor_pago,
      cp.status,
      cp.forma_pagamento_prevista,
      cp.pago_em,
      cp.pago_com,
      cp.recorrencia,
      cp.indice_recorrencia,
      cp.total_parcelas,
      cp.urgente,
      cp.origem_lancamento,
      cp.excluido_em,
      cp.created_at,
      cp.updated_at,
      (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()) as vencida,
      json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone) as categoria,
      case when cp.fk_fornecedores is not null then
        json_build_object('id', f.id_fornecedores, 'nome', f.nome)
      else null end as fornecedor
    from "RetificaPremium"."Contas_Pagar" cp
    join "RetificaPremium"."Categorias_Contas_Pagar" cat on cp.fk_categorias = cat.id_categorias
    left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on cp.fk_fornecedores = f.id_fornecedores
    where cp.fk_criado_por = v_usuario_id
      and (coalesce(p_incluir_excluidas, false) = true or cp.excluido_em is null)
      and (p_status is null or cp.status::text = upper(trim(p_status)))
      and (p_apenas_vencidas is null or p_apenas_vencidas = false or (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()))
      and (p_fk_categorias is null or cp.fk_categorias = p_fk_categorias)
      and (p_fk_fornecedores is null or cp.fk_fornecedores = p_fk_fornecedores)
      and (p_apenas_urgentes is null or cp.urgente = p_apenas_urgentes)
      and (p_busca is null or cp.titulo ilike '%' || p_busca || '%' or cp.nome_fornecedor ilike '%' || p_busca || '%' or cp.numero_documento ilike '%' || p_busca || '%')
    order by cp.data_vencimento asc
    limit coalesce(p_limite, 50)
    offset coalesce(p_offset, 0)
  ) r;

  return json_build_object('status', 200, 'mensagem', 'Contas a pagar encontradas.', 'total', v_total, 'dados', v_dados);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".update_nota_pdf_url(p_id_nota uuid, p_pdf_url text)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  update "RetificaPremium"."Notas_de_Servico"
  set pdf_url = p_pdf_url
  where id_notas_servico = p_id_nota
    and criado_por_usuario = v_usuario_id;

  if not found then
    return json_build_object('status', 404, 'mensagem', 'Nota não encontrada para este usuário.');
  end if;

  return json_build_object('status', 200, 'mensagem', 'PDF salvo com sucesso.');
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_cliente_detalhes(p_id_cliente uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_cliente json;
  v_endereco json;
  v_contatos json;
  v_resumo_os json;
  v_historico json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select json_build_object(
    'id_clientes', c.id_clientes,
    'nome', c.nome,
    'nome_fantasia', c.nome_fantasia,
    'documento', c.documento,
    'tipo_documento', c.tipo_documento,
    'status', c.status,
    'observacao', c.observacao,
    'cadastrado_em', c.created_at
  )
  into v_cliente
  from "RetificaPremium"."Clientes" c
  where c.id_clientes = p_id_cliente
    and c.fk_criado_por = v_usuario_id;

  if v_cliente is null then
    raise exception 'Cliente não encontrado para este usuário.' using errcode = 'P2001';
  end if;

  select json_build_object('cep', e.cep, 'rua', e.rua, 'numero', e.numero, 'bairro', e.bairro, 'cidade', e.cidade, 'uf', e.uf)
  into v_endereco
  from "RetificaPremium"."Enderecos" e
  where e.fk_clientes = p_id_cliente
  limit 1;

  select coalesce(json_agg(json_build_object('tipo', ct.tipo_contato, 'valor', ct.contato)), '[]'::json)
  into v_contatos
  from "RetificaPremium"."Contatos" ct
  where ct.fk_clientes = p_id_cliente;

  select json_build_object(
    'total', count(ns.id_notas_servico),
    'em_aberto', count(ns.id_notas_servico) filter (where sn.tipo_status = 'ativo')
  )
  into v_resumo_os
  from "RetificaPremium"."Notas_de_Servico" ns
  join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
  where ns.fk_clientes = p_id_cliente
    and ns.criado_por_usuario = v_usuario_id;

  select coalesce(json_agg(t order by t.data desc), '[]'::json)
  into v_historico
  from (
    select
      ns.id_notas_servico as id_nota,
      ns.os as identificador,
      'Serviço' as tipo_nota,
      ns.created_at as data,
      v.modelo as veiculo_modelo,
      sn.nome as status_nome,
      sn.tipo_status as status_tipo,
      coalesce((
        select sum((rns.quantidade * rns.valor) * (1 - (rns.desconto / 100.0)))
        from "RetificaPremium"."Rel_NotaS_Serv" rns
        where rns.fk_notas_servico = ns.id_notas_servico
      ), 0) as valor_total
    from "RetificaPremium"."Notas_de_Servico" ns
    left join "RetificaPremium"."Veiculos" v on ns.fk_veiculos = v.id_veiculos
    left join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
    where ns.fk_clientes = p_id_cliente
      and ns.criado_por_usuario = v_usuario_id
  ) t;

  return json_build_object(
    'status', 200,
    'mensagem', 'Detalhes do cliente encontrados.',
    'cliente', v_cliente,
    'endereco', v_endereco,
    'contatos', v_contatos,
    'resumo_os', v_resumo_os,
    'historico', v_historico
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P2001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_nota_servico_detalhes(p_id_nota_servico uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_cabecalho json;
  v_itens json;
  v_vinculos_compra json;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  select json_build_object(
    'id_nota', ns.id_notas_servico,
    'os_numero', ns.os,
    'prazo', ns.prazo,
    'defeito', ns.defeito,
    'observacoes', ns.observacoes,
    'data_criacao', ns.created_at,
    'finalizado_em', ns.finalizado_em,
    'total', ns.total,
    'total_servicos', ns.total_servicos,
    'total_produtos', ns.total_produtos,
    'criado_por_usuario', ns.criado_por_usuario,
    'pdf_url', ns.pdf_url,
    'cliente', json_build_object(
      'id', c.id_clientes,
      'nome', c.nome,
      'documento', c.documento,
      'endereco', case when e.rua is not null then trim(e.rua || case when e.numero is not null then ', ' || e.numero else '' end) else null end,
      'cep', e.cep,
      'cidade', e.cidade,
      'telefone', (select ct.contato from "RetificaPremium"."Contatos" ct where ct.fk_clientes = c.id_clientes and ct.tipo_contato = 'telefone' order by ct.created_at limit 1),
      'email', (select ct.contato from "RetificaPremium"."Contatos" ct where ct.fk_clientes = c.id_clientes and ct.tipo_contato = 'email' order by ct.created_at limit 1)
    ),
    'veiculo', json_build_object('id', v.id_veiculos, 'modelo', v.modelo, 'placa', v.placa, 'km', v.km, 'motor', tm.tipo),
    'status', json_build_object('id', sn.id_status_notas, 'nome', sn.nome, 'index', sn.index, 'tipo_status', sn.tipo_status)
  )
  into v_cabecalho
  from "RetificaPremium"."Notas_de_Servico" ns
  join "RetificaPremium"."Clientes" c on ns.fk_clientes = c.id_clientes and c.fk_criado_por = v_usuario_id
  left join "RetificaPremium"."Enderecos" e on e.fk_clientes = c.id_clientes
  join "RetificaPremium"."Veiculos" v on ns.fk_veiculos = v.id_veiculos
  join "RetificaPremium"."Tipos_de_Motor" tm on v.fk_tipos_de_motor = tm.id_tipos_de_motor
  join "RetificaPremium"."Status_Notas" sn on ns.fk_status = sn.id_status_notas
  where ns.id_notas_servico = p_id_nota_servico
    and ns.criado_por_usuario = v_usuario_id;

  if v_cabecalho is null then
    raise exception 'Nota de Serviço não encontrada para este usuário.' using errcode = 'P3001';
  end if;

  select coalesce(json_agg(json_build_object(
    'id_rel', rns.id_rel_notas_servi,
    'sku', si.id_servicos_itens,
    'descricao', si.nome,
    'detalhes', rns.detalhes,
    'quantidade', rns.quantidade,
    'preco_unitario', rns.valor,
    'desconto_porcentagem', rns.desconto,
    'subtotal_item', (rns.quantidade * rns.valor) * (1 - (rns.desconto / 100.0))
  )), '[]'::json)
  into v_itens
  from "RetificaPremium"."Rel_NotaS_Serv" rns
  join "RetificaPremium"."Servicos_ou_Itens" si on rns.fk_servicos_itens = si.id_servicos_itens
  where rns.fk_notas_servico = p_id_nota_servico;

  select coalesce(json_agg(json_build_object(
    'id_nota_compra', nc.id_notas_compra,
    'oc_numero', nc.oc,
    'status_nome', sn.nome,
    'status_tipo', sn.tipo_status
  )), '[]'::json)
  into v_vinculos_compra
  from "RetificaPremium"."Notas_de_Compra" nc
  join "RetificaPremium"."Status_Notas" sn on nc.fk_status = sn.id_status_notas
  where nc.fk_notas_servico = p_id_nota_servico;

  return json_build_object(
    'status', 200,
    'cabecalho', v_cabecalho,
    'itens_servico', v_itens,
    'notas_compra_vinculadas', v_vinculos_compra,
    'financeiro_servicos', json_build_object(
      'total_bruto', coalesce((select sum(quantidade * valor) from "RetificaPremium"."Rel_NotaS_Serv" where fk_notas_servico = p_id_nota_servico), 0),
      'total_liquido', coalesce((select sum((quantidade * valor) * (1 - (desconto / 100.0))) from "RetificaPremium"."Rel_NotaS_Serv" where fk_notas_servico = p_id_nota_servico), 0)
    )
  );
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P3001' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;

create or replace function "RetificaPremium".get_conta_pagar_detalhes(p_id_contas_pagar uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid;
  v_conta json;
  v_anexos json;
  v_historico json;
  v_parcelas json;
  v_serie_pai uuid;
begin
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  if p_id_contas_pagar is null then
    raise exception 'ID da conta é obrigatório.' using errcode = 'P0700';
  end if;

  select coalesce(cp.fk_conta_pai, cp.id_contas_pagar)
  into v_serie_pai
  from "RetificaPremium"."Contas_Pagar" cp
  where cp.id_contas_pagar = p_id_contas_pagar
    and cp.fk_criado_por = v_usuario_id;

  select json_build_object(
    'id_contas_pagar', cp.id_contas_pagar,
    'titulo', cp.titulo,
    'numero_documento', cp.numero_documento,
    'data_emissao', cp.data_emissao,
    'data_vencimento', cp.data_vencimento,
    'data_competencia', cp.data_competencia,
    'valor_original', cp.valor_original,
    'juros', cp.juros,
    'desconto', cp.desconto,
    'valor_final', cp.valor_final,
    'valor_pago', cp.valor_pago,
    'status', cp.status,
    'forma_pagamento_prevista', cp.forma_pagamento_prevista,
    'pago_em', cp.pago_em,
    'pago_com', cp.pago_com,
    'observacoes_pagamento', cp.observacoes_pagamento,
    'origem_lancamento', cp.origem_lancamento,
    'status_execucao', cp.status_execucao,
    'provedor_pagamento', cp.provedor_pagamento,
    'referencia_provedor', cp.referencia_provedor,
    'agendado_para', cp.agendado_para,
    'url_comprovante', cp.url_comprovante,
    'motivo_falha', cp.motivo_falha,
    'status_conciliacao', cp.status_conciliacao,
    'recorrencia', cp.recorrencia,
    'indice_recorrencia', cp.indice_recorrencia,
    'total_parcelas', cp.total_parcelas,
    'nome_fornecedor', cp.nome_fornecedor,
    'observacoes', cp.observacoes,
    'urgente', cp.urgente,
    'excluido_em', cp.excluido_em,
    'created_at', cp.created_at,
    'updated_at', cp.updated_at,
    'vencida', (cp.status in ('PENDENTE', 'PARCIAL') and cp.data_vencimento < now()),
    'categoria', json_build_object('id', cat.id_categorias, 'nome', cat.nome, 'cor', cat.cor, 'icone', cat.icone),
    'fornecedor', case when cp.fk_fornecedores is not null then
      json_build_object('id', f.id_fornecedores, 'nome', f.nome, 'documento', f.documento, 'telefone', f.telefone, 'email', f.email)
    else null end
  )
  into v_conta
  from "RetificaPremium"."Contas_Pagar" cp
  join "RetificaPremium"."Categorias_Contas_Pagar" cat on cp.fk_categorias = cat.id_categorias
  left join "RetificaPremium"."Fornecedores_Contas_Pagar" f on cp.fk_fornecedores = f.id_fornecedores
  where cp.id_contas_pagar = p_id_contas_pagar
    and cp.fk_criado_por = v_usuario_id;

  if v_conta is null then
    raise exception 'Conta não encontrada para este usuário.' using errcode = 'P0701';
  end if;

  select coalesce(json_agg(json_build_object(
    'id_anexo', a.id_anexo,
    'tipo', a.tipo,
    'nome_arquivo', a.nome_arquivo,
    'url', a.url,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::json)
  into v_anexos
  from "RetificaPremium"."Contas_Pagar_Anexos" a
  where a.fk_contas_pagar = p_id_contas_pagar;

  select coalesce(json_agg(json_build_object(
    'id_historico_conta', h.id_historico_conta,
    'acao', h.acao,
    'descricao', h.descricao,
    'alteracoes_campos', h.alteracoes_campos,
    'created_at', h.created_at,
    'usuario', case when h.fk_usuarios is not null then json_build_object('id', u.id_usuarios, 'nome', u.nome) else null end
  ) order by h.created_at desc), '[]'::json)
  into v_historico
  from "RetificaPremium"."Contas_Pagar_Historico" h
  left join "RetificaPremium"."Usuarios" u on h.fk_usuarios = u.id_usuarios
  where h.fk_contas_pagar = p_id_contas_pagar;

  select coalesce(json_agg(json_build_object(
    'id_contas_pagar', p.id_contas_pagar,
    'titulo', p.titulo,
    'indice_recorrencia', p.indice_recorrencia,
    'total_parcelas', p.total_parcelas,
    'data_vencimento', p.data_vencimento,
    'valor_final', p.valor_final,
    'status', p.status,
    'pago_em', p.pago_em
  ) order by p.indice_recorrencia asc nulls last), '[]'::json)
  into v_parcelas
  from "RetificaPremium"."Contas_Pagar" p
  where p.fk_criado_por = v_usuario_id
    and (p.fk_conta_pai = v_serie_pai or p.id_contas_pagar = v_serie_pai)
    and p.total_parcelas > 1;

  return json_build_object('status', 200, 'conta', v_conta, 'anexos', v_anexos, 'historico', v_historico, 'parcelas', v_parcelas);
exception
  when sqlstate 'P0401' then return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  when sqlstate 'P0403' then return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', sqlerrm);
  when sqlstate 'P0700' then return json_build_object('status', 400, 'code', 'missing_id', 'mensagem', sqlerrm);
  when sqlstate 'P0701' then return json_build_object('status', 404, 'code', 'not_found', 'mensagem', sqlerrm);
  when others then return json_build_object('status', 500, 'code', sqlstate, 'mensagem', sqlerrm);
end;
$$;
