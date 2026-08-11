-- Paridade operacional do modulo de Fechamento no modo suporte.
--
-- Invariantes desta migration:
--   * o dono financeiro continua sendo o tenant atendido;
--   * o operador real fica em fk_registrado_por/fk_estornado_por e nos logs;
--   * toda escrita financeira exige Mega Master, alvo e sessao ativa exatos;
--   * os arquivos emitidos pelo suporte usam namespace server-issued e nunca
--     ficam owner do auth.uid() do operador;
--   * os cores existentes continuam sendo a unica fonte das regras de duas
--     parcelas, concorrencia otimista, idempotencia e estorno LIFO.

-- O token de upload assinado nao passa pelas policies de objeto. O bucket
-- tambem limita o dano de um token emitido e ainda valido: privado, PDF-only
-- e no maximo 10 MB, igual ao binder abaixo.
update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf']::text[]
 where id = 'fechamentos';

-- ---------------------------------------------------------------------------
-- 1. Contexto financeiro DML, separado do contexto generico de suporte
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".require_financeiro_usuario_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacao necessaria.' using errcode = 'P0401';
  end if;

  if current_setting('retiflow.support_financeiro_dml', true) = 'on' then
    v_usuario_id := "RetificaPremium".support_context_dml_usuario_id();
    if v_usuario_id is null then
      raise exception 'Contexto financeiro de suporte ausente.'
        using errcode = 'P0403';
    end if;
    perform "RetificaPremium".assert_financeiro_target_access(v_usuario_id);
    return v_usuario_id;
  end if;

  v_usuario_id := "RetificaPremium".current_financeiro_usuario_id();
  if v_usuario_id is null then
    raise exception 'Modulo Financeiro nao habilitado para este usuario.'
      using errcode = 'P0403';
  end if;
  return v_usuario_id;
end;
$$;

revoke execute on function "RetificaPremium".require_financeiro_usuario_id()
  from public, anon, authenticated;
grant execute on function "RetificaPremium".require_financeiro_usuario_id()
  to service_role;

-- O estorno agregado normal e o estorno contextual precisam visitar os
-- movimentos na mesma ordem total. O desempate por UUID evita que duas
-- transacoes segurem parcelas diferentes e aguardem uma a outra.
create or replace function "RetificaPremium".financeiro_estornar_origem(
  p_tipo text,
  p_origem_id uuid,
  p_motivo text,
  p_data timestamptz,
  p_chave text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov record;
  v_result json;
  v_first uuid;
  v_count integer := 0;
begin
  for v_mov in
    select m.id_financeiro_movimentos
      from "RetificaPremium"."Financeiro_Movimentos" m
     where m.fk_criado_por = "RetificaPremium".require_financeiro_usuario_id()
       and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
       and m.tipo_movimento <> 'ESTORNO'
       and (
         (p_tipo = 'NOTA' and m.fk_notas_servico = p_origem_id)
         or (p_tipo = 'FECHAMENTO' and m.fk_fechamentos = p_origem_id)
       )
     order by m.created_at, m.id_financeiro_movimentos
  loop
    v_result := "RetificaPremium".estornar_movimento_financeiro(
      v_mov.id_financeiro_movimentos,
      p_motivo,
      p_data,
      p_chave || ':' || v_mov.id_financeiro_movimentos
    );
    v_first := coalesce(
      v_first,
      nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid
    );
    v_count := v_count + 1;
  end loop;
  return json_build_object(
    'status', 200,
    'mensagem', 'Recebimento estornado.',
    'dados', json_build_object(
      'id_movimento', v_first,
      'movimento_id', v_first,
      'status', 'PENDENTE',
      'movimentos_estornados', v_count,
      'valor_realizado', 0
    )
  );
end;
$$;

revoke execute on function
  "RetificaPremium".financeiro_estornar_origem(text, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".financeiro_estornar_origem(text, uuid, text, timestamptz, text)
  to service_role;

create or replace function "RetificaPremium".support_closing_enable_dml(
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid,
  p_require_financeiro boolean default false,
  p_require_mega_master boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_target uuid;
begin
  if p_contexto_usuario_id is null or p_sessao_suporte is null then
    raise exception 'Alvo e sessao de suporte sao obrigatorios.'
      using errcode = 'P0403';
  end if;

  v_actor := "RetificaPremium".require_current_usuario_id();
  if p_require_mega_master and not exists (
    select 1
      from "RetificaPremium"."Usuarios" u
      join "RetificaPremium"."Modulos" m
        on m.fk_usuarios = u.id_usuarios
     where u.id_usuarios = v_actor
       and u.status = true
       and lower(u.acesso::text) = 'administrador'
       and m.admin = true
       and "RetificaPremium".is_mega_master_email(u.email)
  ) then
    raise exception 'Somente Mega Master pode movimentar recebimentos em suporte.'
      using errcode = 'P0403';
  end if;

  -- Mantem a sessao aberta e presa ao mesmo ator/alvo ate o COMMIT.
  perform 1
    from "RetificaPremium"."Sessoes_Suporte" s
   where s.id_sessao_suporte = p_sessao_suporte
     and s.fk_actor_usuarios = v_actor
     and s.fk_target_usuarios = p_contexto_usuario_id
     and s.ended_at is null
   for share of s;
  if not found then
    raise exception 'Sessao de suporte invalida ou encerrada.'
      using errcode = 'P0403';
  end if;

  v_target := "RetificaPremium".set_suporte_contexto_dml(
    p_contexto_usuario_id,
    p_sessao_suporte
  );
  perform "RetificaPremium".assert_fechamento_target_access(v_target);
  if p_require_financeiro then
    perform "RetificaPremium".assert_financeiro_target_access(v_target);
  end if;

  perform set_config('retiflow.support_closing_dml', 'on', true);
  perform set_config(
    'retiflow.support_financeiro_dml',
    case when p_require_financeiro then 'on' else 'off' end,
    true
  );
  return v_target;
end;
$$;

revoke execute on function
  "RetificaPremium".support_closing_enable_dml(uuid, uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".support_closing_enable_dml(uuid, uuid, boolean, boolean)
  to service_role;

-- Retorna true somente quando a auditoria foi criada nesta chamada. O lock
-- evita duplicar Logs_Acoes_Suporte em retries concorrentes da mesma operacao.
create index if not exists idx_logs_acoes_suporte_target_action_entity
  on "RetificaPremium"."Logs_Acoes_Suporte"(
    fk_target_usuarios, acao, entidade, entidade_id
  );

create or replace function "RetificaPremium".support_closing_log_once(
  p_fk_alvo uuid,
  p_sessao_suporte uuid,
  p_acao text,
  p_entidade text,
  p_entidade_id text,
  p_descricao text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'support-audit:' || p_acao || ':' || p_entidade || ':' || p_entidade_id,
      0
    )
  );
  if exists (
    select 1
     from "RetificaPremium"."Logs_Acoes_Suporte" l
     where l.fk_target_usuarios = p_fk_alvo
       and l.acao = p_acao
       and l.entidade = p_entidade
       and l.entidade_id = p_entidade_id
  ) then
    return false;
  end if;

  perform "RetificaPremium".insert_log_acao_suporte(
    p_fk_alvo,
    p_sessao_suporte,
    p_acao,
    p_entidade,
    p_entidade_id,
    p_descricao
  );
  return true;
end;
$$;

revoke execute on function
  "RetificaPremium".support_closing_log_once(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".support_closing_log_once(uuid, uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Criacao atomica do fechamento, agora incluindo recebimento inicial
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".finalizar_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_fk_clientes uuid,
  p_mes text,
  p_ano smallint,
  p_periodo text,
  p_label text,
  p_valor_total numeric,
  p_dados_json jsonb,
  p_pdf_url text,
  p_chave_idempotencia text,
  p_fk_template_documento uuid,
  p_documento_tema_snapshot jsonb,
  p_documento_config_snapshot jsonb,
  p_recebimento_valor numeric,
  p_recebimento_data timestamptz,
  p_recebimento_conta uuid,
  p_recebimento_forma text,
  p_recebimento_observacoes text,
  p_recebimento_idempotencia text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_usuario uuid;
  v_result json;
  v_result_id uuid;
  v_movimento_id uuid;
  v_idempotent_retry boolean;
  v_tem_recebimento boolean := p_recebimento_valor is not null;
  v_logged boolean;
begin
  -- O arquivo privado e emitido e vinculado depois do COMMIT, quando o
  -- fechamento ja existe e pode autorizar um upload assinado exato.
  if p_pdf_url is not null then
    raise exception 'O PDF deve ser vinculado pela etapa segura pos-criacao.'
      using errcode = 'P0602';
  end if;

  v_actor := "RetificaPremium".require_current_usuario_id();
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id,
    p_sessao_suporte,
    v_tem_recebimento,
    true
  );

  v_result := "RetificaPremium".finalizar_fechamento(
    p_id_fechamentos,
    p_fk_clientes,
    p_mes,
    p_ano,
    p_periodo,
    p_label,
    p_valor_total,
    p_dados_json,
    null,
    p_chave_idempotencia,
    p_fk_template_documento,
    p_documento_tema_snapshot,
    p_documento_config_snapshot,
    p_recebimento_valor,
    p_recebimento_data,
    p_recebimento_conta,
    p_recebimento_forma,
    p_recebimento_observacoes,
    p_recebimento_idempotencia
  );

  v_result_id := nullif(v_result -> 'dados' ->> 'id_fechamentos', '')::uuid;
  v_movimento_id := nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid;
  v_idempotent_retry := coalesce(
    (v_result -> 'dados' ->> 'idempotent_retry')::boolean,
    false
  );
  if v_result_id is distinct from p_id_fechamentos then
    raise exception 'Resposta inconsistente ao finalizar o fechamento em suporte.'
      using errcode = 'P4095';
  end if;

  if not v_idempotent_retry then
    v_logged := "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'finalizar_fechamento',
      'Fechamentos',
      v_result_id::text,
      case when v_tem_recebimento
        then 'Fechamento criado com recebimento inicial em modo suporte.'
        else 'Fechamento criado sem recebimento inicial em modo suporte.'
      end
    );
    if v_logged then
      insert into "RetificaPremium"."Fechamento_Logs" (
        fk_fechamentos, tipo, mensagem, fk_usuarios
      ) values (
        v_result_id,
        'suporte',
        case when v_tem_recebimento
          then 'Fechamento e recebimento inicial registrados por Mega Master em suporte.'
          else 'Fechamento registrado por Mega Master em suporte.'
        end,
        v_actor
      );
    end if;
  end if;

  if v_movimento_id is not null and not v_idempotent_retry then
    update "RetificaPremium"."Financeiro_Movimentos" m
       set fk_registrado_por = v_actor
     where m.id_financeiro_movimentos = v_movimento_id
       and m.fk_criado_por = v_usuario
       and m.fk_fechamentos = v_result_id;
    if not found then
      raise exception 'Movimento inicial fora do tenant da sessao.'
        using errcode = 'P0403';
    end if;
    perform "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'registrar_parcela_fechamento',
      'Financeiro_Movimentos',
      v_movimento_id::text,
      'Recebimento inicial do fechamento registrado por Mega Master em suporte.'
    );
  end if;

  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return v_result;
end;
$$;

revoke all on function
  "RetificaPremium".finalizar_fechamento_contexto_suporte(
    uuid, uuid, text, smallint, text, text, numeric, jsonb, text, text,
    uuid, jsonb, jsonb, numeric, timestamptz, uuid, text, text, text,
    uuid, uuid
  )
  from public, anon;
grant execute on function
  "RetificaPremium".finalizar_fechamento_contexto_suporte(
    uuid, uuid, text, smallint, text, text, numeric, jsonb, text, text,
    uuid, jsonb, jsonb, numeric, timestamptz, uuid, text, text, text,
    uuid, uuid
  )
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Autorizacao de uploads privados e vinculo auditado
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".support_closing_validate_pdf_path(
  p_usuario uuid,
  p_id_fechamentos uuid,
  p_pdf_url text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text := btrim(p_pdf_url);
  v_mime text;
  v_size bigint;
begin
  if p_usuario is null
     or p_id_fechamentos is null
     or nullif(v_path, '') is null
     or v_path !~ (
       '^support/' || p_usuario::text || '/' || p_id_fechamentos::text
       || '-[0-9]{1,18}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}'
       || '-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$'
     )
     or v_path like '%..%'
     or v_path ~* '^https?://'
     or v_path like '/%' then
    raise exception 'Caminho do PDF de suporte invalido.' using errcode = 'P0602';
  end if;

  select
    lower(nullif(o.metadata ->> 'mimetype', '')),
    case when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
      then (o.metadata ->> 'size')::bigint
      else null
    end
    into v_mime, v_size
    from storage.objects o
   where o.bucket_id = 'fechamentos'
     and o.name = v_path;
  if not found then
    raise exception 'PDF privado nao encontrado no Storage.' using errcode = 'P0404';
  end if;
  if v_mime is distinct from 'application/pdf'
     or coalesce(v_size, 0) <= 0
     or coalesce(v_size, 0) > 10485760 then
    raise exception 'O arquivo vinculado precisa ser um PDF de ate 10 MB.'
      using errcode = 'P0602';
  end if;
  return v_path;
end;
$$;

revoke execute on function
  "RetificaPremium".support_closing_validate_pdf_path(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".support_closing_validate_pdf_path(uuid, uuid, text)
  to service_role;

-- Chamadas pelas Edge Functions com o JWT do operador. Elas nao emitem token;
-- apenas confirmam ao servidor que o ator pode emitir um upload exato agora.
create or replace function "RetificaPremium".autorizar_upload_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_valor_recebido_esperado numeric,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_recebido numeric(14,2);
  v_esperado numeric(14,2);
begin
  if p_valor_recebido_esperado is null or p_valor_recebido_esperado < 0 then
    raise exception 'Valor recebido esperado invalido.' using errcode = 'P0602';
  end if;
  v_esperado := round(p_valor_recebido_esperado, 2);
  if abs(p_valor_recebido_esperado - v_esperado) > 0.004 then
    raise exception 'Valor recebido esperado invalido.' using errcode = 'P0602';
  end if;
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, false, true
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('financeiro:fechamento:' || p_id_fechamentos::text, 0)
  );
  select round(coalesce(f.valor_recebido, 0), 2)
    into v_recebido
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
   where f.id_fechamentos = p_id_fechamentos
     and c.fk_criado_por = v_usuario
   for share of f;
  if not found then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if v_recebido is distinct from v_esperado then
    raise exception 'O saldo mudou. Regenere o PDF com os valores atuais.'
      using errcode = 'P4094';
  end if;
  return json_build_object(
    'status', 200,
    'mensagem', 'Upload de PDF autorizado.',
    'dados', json_build_object(
      'target_user_id', v_usuario,
      'closing_id', p_id_fechamentos,
      'received_cents', round(v_recebido * 100)::bigint
    )
  );
end;
$$;

create or replace function "RetificaPremium".autorizar_upload_comprovante_contexto_suporte(
  p_id_financeiro_movimentos uuid,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_fechamento uuid;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );
  select m.fk_fechamentos
    into v_fechamento
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.id_financeiro_movimentos = p_id_financeiro_movimentos
     and m.fk_criado_por = v_usuario
     and m.direcao = 'ENTRADA'
     and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
     and m.fk_fechamentos is not null;
  if not found then
    raise exception 'Movimento de fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  return json_build_object(
    'status', 200,
    'mensagem', 'Upload de comprovante autorizado.',
    'dados', json_build_object(
      'target_user_id', v_usuario,
      'closing_id', v_fechamento,
      'movement_id', p_id_financeiro_movimentos
    )
  );
end;
$$;

revoke all on function
  "RetificaPremium".autorizar_upload_fechamento_contexto_suporte(
    uuid, numeric, uuid, uuid
  ),
  "RetificaPremium".autorizar_upload_comprovante_contexto_suporte(
    uuid, uuid, uuid
  )
  from public, anon;
grant execute on function
  "RetificaPremium".autorizar_upload_fechamento_contexto_suporte(
    uuid, numeric, uuid, uuid
  ),
  "RetificaPremium".autorizar_upload_comprovante_contexto_suporte(
    uuid, uuid, uuid
  )
  to authenticated, service_role;

create or replace function "RetificaPremium".atualizar_pdf_fechamento_seguro_contexto_suporte(
  p_id_fechamentos uuid,
  p_pdf_url text,
  p_valor_recebido_esperado numeric,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_fechamento record;
  v_path text;
  v_esperado numeric(14,2);
  v_retry boolean;
begin
  if p_valor_recebido_esperado is null or p_valor_recebido_esperado < 0 then
    raise exception 'O valor recebido esperado e obrigatorio.' using errcode = 'P0602';
  end if;
  v_esperado := round(p_valor_recebido_esperado, 2);
  if abs(p_valor_recebido_esperado - v_esperado) > 0.004 then
    raise exception 'O valor recebido esperado deve ter duas casas decimais.'
      using errcode = 'P0602';
  end if;
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, false, true
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('financeiro:fechamento:' || p_id_fechamentos::text, 0)
  );
  select f.*
    into v_fechamento
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
   where f.id_fechamentos = p_id_fechamentos
     and c.fk_criado_por = v_usuario
   for update of f;
  if not found then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if round(coalesce(v_fechamento.valor_recebido, 0), 2) is distinct from v_esperado then
    raise exception 'O saldo mudou. Regenere o PDF com os valores atuais.'
      using errcode = 'P4094';
  end if;
  v_path := "RetificaPremium".support_closing_validate_pdf_path(
    v_usuario, p_id_fechamentos, p_pdf_url
  );
  if left(
    v_path,
    char_length(
      'support/' || v_usuario::text || '/' || p_id_fechamentos::text || '-'
      || round(v_esperado * 100)::bigint::text || '-'
    )
  ) is distinct from (
    'support/' || v_usuario::text || '/' || p_id_fechamentos::text || '-'
    || round(v_esperado * 100)::bigint::text || '-'
  ) then
    raise exception 'O PDF nao corresponde ao saldo atual do fechamento.'
      using errcode = 'P4094';
  end if;
  v_retry := v_fechamento.pdf_url is not distinct from v_path;
  if not v_retry then
    update "RetificaPremium"."Fechamentos"
       set pdf_url = v_path,
           updated_at = now()
     where id_fechamentos = p_id_fechamentos;
    perform "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'atualizar_pdf_fechamento_seguro',
      'Fechamentos_PDF',
      v_path,
      'PDF privado do fechamento vinculado por Mega Master em suporte.'
    );
  end if;
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return json_build_object(
    'status', 200,
    'mensagem', case when v_retry then 'PDF ja atualizado.' else 'PDF atualizado.' end,
    'dados', json_build_object(
      'id', p_id_fechamentos,
      'id_fechamentos', p_id_fechamentos,
      'pdf_url', v_path,
      'valor_recebido', v_esperado,
      'idempotent_retry', v_retry
    )
  );
end;
$$;

create or replace function "RetificaPremium".insert_financeiro_anexo_contexto_suporte(
  p_fk_financeiro_movimentos uuid,
  p_nome_arquivo text,
  p_caminho text,
  p_mime_type text,
  p_tamanho_bytes bigint,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_id uuid;
  v_path text := btrim(p_caminho);
  v_nome text := btrim(p_nome_arquivo);
  v_prefix text;
  v_leaf text;
  v_storage_mime text;
  v_storage_size bigint;
  v_existente record;
  v_retry boolean := false;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );
  v_prefix := 'support/' || v_usuario::text || '/'
    || p_fk_financeiro_movimentos::text || '/';
  v_leaf := substr(v_path, char_length(v_prefix) + 1);
  if nullif(v_nome, '') is null
     or char_length(v_nome) > 180
     or nullif(v_path, '') is null
     or char_length(v_path) > 500
     or left(v_path, char_length(v_prefix)) is distinct from v_prefix
     or v_leaf !~ '^[0-9a-f]{64}-[^/]{1,180}$'
     or v_path like '%..%'
     or v_path ~* '^https?://'
     or coalesce(p_tamanho_bytes, 0) <= 0
     or p_tamanho_bytes > 15728640
     or (
       p_mime_type is not null
       and lower(btrim(p_mime_type)) not in (
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
       )
     ) then
    raise exception 'Caminho, nome, tipo ou tamanho do comprovante invalido.'
      using errcode = 'P0602';
  end if;
  if not exists (
    select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
     where m.id_financeiro_movimentos = p_fk_financeiro_movimentos
       and m.fk_criado_por = v_usuario
       and m.direcao = 'ENTRADA'
       and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
       and m.fk_fechamentos is not null
  ) then
    raise exception 'Movimento de fechamento nao encontrado.' using errcode = 'P0404';
  end if;

  select
    lower(nullif(o.metadata ->> 'mimetype', '')),
    case when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
      then (o.metadata ->> 'size')::bigint
      else null
    end
    into v_storage_mime, v_storage_size
    from storage.objects o
   where o.bucket_id = 'financeiro-comprovantes'
     and o.name = v_path;
  if not found then
    raise exception 'Comprovante privado nao encontrado no Storage.'
      using errcode = 'P0404';
  end if;
  if v_storage_mime is null
     or v_storage_mime not in (
       'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
     )
     or coalesce(v_storage_size, 0) <= 0
     or v_storage_size > 15728640
     or (
       p_mime_type is not null
       and v_storage_mime is distinct from lower(btrim(p_mime_type))
     )
     or v_storage_size is distinct from p_tamanho_bytes then
    raise exception 'Tipo ou tamanho do comprovante diverge do objeto armazenado.'
      using errcode = 'P0602';
  end if;

  insert into "RetificaPremium"."Financeiro_Anexos" (
    fk_criado_por,
    fk_financeiro_movimentos,
    storage_path,
    nome_arquivo,
    tipo_mime,
    tamanho_bytes,
    fk_registrado_por
  ) values (
    v_usuario,
    p_fk_financeiro_movimentos,
    v_path,
    v_nome,
    v_storage_mime,
    v_storage_size,
    v_actor
  )
  on conflict (fk_criado_por, storage_path) do nothing
  returning id_financeiro_anexos into v_id;

  if v_id is null then
    v_retry := true;
    select a.*
      into v_existente
      from "RetificaPremium"."Financeiro_Anexos" a
     where a.fk_criado_por = v_usuario
       and a.storage_path = v_path;
    if not found
       or v_existente.fk_financeiro_movimentos is distinct from p_fk_financeiro_movimentos
       or v_existente.nome_arquivo is distinct from v_nome
       or v_existente.tipo_mime is distinct from v_storage_mime
       or v_existente.tamanho_bytes is distinct from v_storage_size then
      raise exception 'O caminho do comprovante ja foi usado com outros dados.'
        using errcode = 'P0602';
    end if;
    v_id := v_existente.id_financeiro_anexos;
  end if;

  perform "RetificaPremium".support_closing_log_once(
    v_usuario,
    p_sessao_suporte,
    'insert_financeiro_anexo',
    'Financeiro_Anexos',
    v_id::text,
    'Comprovante de recebimento vinculado por Mega Master em suporte.'
  );
  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return json_build_object(
    'status', 200,
    'mensagem', case when v_retry then 'Comprovante ja vinculado.' else 'Comprovante vinculado.' end,
    'dados', json_build_object('id', v_id, 'idempotent_retry', v_retry)
  );
end;
$$;

create or replace function "RetificaPremium".registrar_acao_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_tipo text,
  p_mensagem text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_tipo text := lower(btrim(p_tipo));
  v_mensagem text := nullif(btrim(p_mensagem), '');
  v_id uuid;
begin
  if p_id_fechamentos is null
     or v_tipo is null
     or v_tipo not in ('baixado', 'compartilhado', 'regenerado', 'pdf_gerado')
     or char_length(coalesce(v_mensagem, '')) > 1000 then
    raise exception 'Fechamento, tipo ou mensagem da acao invalidos.'
      using errcode = 'P0602';
  end if;
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, false, true
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('financeiro:fechamento:' || p_id_fechamentos::text, 0)
  );
  update "RetificaPremium"."Fechamentos" f
     set total_regeneracoes = case
           when v_tipo = 'regenerado' then f.total_regeneracoes + 1
           else f.total_regeneracoes
         end,
         total_downloads = case
           when v_tipo = 'baixado' then f.total_downloads + 1
           else f.total_downloads
         end,
         versao = case
           when v_tipo = 'regenerado' then f.versao + 1
           else f.versao
         end
    from "RetificaPremium"."Clientes" c
   where f.id_fechamentos = p_id_fechamentos
     and c.id_clientes = f.fk_clientes
     and c.fk_criado_por = v_usuario
  returning f.id_fechamentos into v_id;
  if v_id is null then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  insert into "RetificaPremium"."Fechamento_Logs" (
    fk_fechamentos, tipo, mensagem, fk_usuarios
  ) values (
    p_id_fechamentos,
    v_tipo,
    coalesce(v_mensagem, initcap(replace(v_tipo, '_', ' ')) || '.'),
    v_actor
  );
  perform "RetificaPremium".insert_log_acao_suporte(
    v_usuario,
    p_sessao_suporte,
    'registrar_acao_fechamento_' || v_tipo,
    'Fechamentos',
    p_id_fechamentos::text,
    case when v_tipo = 'compartilhado'
      then 'WhatsApp aberto com o link do fechamento; envio nao confirmado.'
      else 'Acao ' || v_tipo || ' registrada por Mega Master em suporte.'
    end
  );
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return json_build_object(
    'status', 200,
    'mensagem', 'Acao registrada com sucesso.'
  );
end;
$$;

revoke all on function
  "RetificaPremium".atualizar_pdf_fechamento_seguro_contexto_suporte(
    uuid, text, numeric, uuid, uuid
  ),
  "RetificaPremium".insert_financeiro_anexo_contexto_suporte(
    uuid, text, text, text, bigint, uuid, uuid
  ),
  "RetificaPremium".registrar_acao_fechamento_contexto_suporte(
    uuid, text, text, uuid, uuid
  )
  from public, anon;
grant execute on function
  "RetificaPremium".atualizar_pdf_fechamento_seguro_contexto_suporte(
    uuid, text, numeric, uuid, uuid
  ),
  "RetificaPremium".insert_financeiro_anexo_contexto_suporte(
    uuid, text, text, text, bigint, uuid, uuid
  ),
  "RetificaPremium".registrar_acao_fechamento_contexto_suporte(
    uuid, text, text, uuid, uuid
  )
  to authenticated, service_role;

comment on function
  "RetificaPremium".finalizar_fechamento_contexto_suporte(
    uuid, uuid, text, smallint, text, text, numeric, jsonb, text, text,
    uuid, jsonb, jsonb, numeric, timestamptz, uuid, text, text, text,
    uuid, uuid
  ) is
  'Finaliza um fechamento no tenant da sessao de suporte; recebimento inicial exige Mega Master e e auditado atomicamente.';

-- ---------------------------------------------------------------------------
-- 3. Recebimentos e estornos contextuais
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".registrar_recebimento_nota_contexto_suporte(
  p_id_notas_servico uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text,
  p_observacoes text,
  p_idempotency_key text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_result json;
  v_movimento uuid;
  v_retry boolean;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario, p_idempotency_key
  );
  select exists (
    select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
     where m.fk_criado_por = v_usuario
       and m.chave_idempotencia = p_idempotency_key
  ) into v_retry;
  v_result := "RetificaPremium".registrar_recebimento_nota(
    p_id_notas_servico,
    p_valor,
    p_data_efetiva,
    p_fk_conta_financeira,
    p_forma_pagamento,
    p_observacoes,
    p_idempotency_key
  );
  v_movimento := nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid;
  if v_movimento is null then
    raise exception 'Resposta inconsistente ao registrar recebimento da O.S.'
      using errcode = 'P4095';
  end if;

  perform 1
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.id_financeiro_movimentos = v_movimento
     and m.fk_criado_por = v_usuario
     and m.fk_notas_servico = p_id_notas_servico;
  if not found then
    raise exception 'Movimento da O.S. fora do tenant da sessao.'
      using errcode = 'P0403';
  end if;

  if not v_retry then
    update "RetificaPremium"."Financeiro_Movimentos"
       set fk_registrado_por = v_actor
     where id_financeiro_movimentos = v_movimento;
    perform "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'registrar_recebimento_nota',
      'Financeiro_Movimentos',
      v_movimento::text,
      'Recebimento de O.S. registrado por Mega Master em suporte.'
    );
  end if;
  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return (v_result::jsonb || jsonb_build_object(
    'dados', coalesce(v_result -> 'dados', '{}'::json)::jsonb
      || jsonb_build_object('idempotent_retry', v_retry)
  ))::json;
end;
$$;

create or replace function "RetificaPremium".estornar_recebimento_nota_contexto_suporte(
  p_id_notas_servico uuid,
  p_motivo text,
  p_data_efetiva timestamptz,
  p_idempotency_key text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_result json;
  v_primeiro uuid;
  v_count integer := 0;
  v_retry boolean := false;
  v_movement_ids uuid[] := array[]::uuid[];
  v_current_ids uuid[] := array[]::uuid[];
  v_movement_id uuid;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );

  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario, p_idempotency_key
  );

  if not exists (
    select 1
    from "RetificaPremium"."Notas_de_Servico" n
    join "RetificaPremium"."Clientes" c
      on c.id_clientes = n.fk_clientes
    where n.id_notas_servico = p_id_notas_servico
      and c.fk_criado_por = v_usuario
  ) then
    raise exception 'O.S. nao encontrada no tenant da sessao.'
      using errcode = 'P0404';
  end if;

  select exists (
    select 1
      from "RetificaPremium"."Financeiro_Movimentos" rev
     where rev.fk_criado_por = v_usuario
       and rev.tipo_movimento = 'ESTORNO'
       and rev.fk_notas_servico = p_id_notas_servico
       and rev.fk_movimento_origem is not null
       and rev.chave_idempotencia = p_idempotency_key || ':'
         || rev.fk_movimento_origem::text
  ) into v_retry;

  if v_retry then
    select coalesce(
      array_agg(
        original.id_financeiro_movimentos
        order by original.created_at, original.id_financeiro_movimentos
      ),
      array[]::uuid[]
    )
      into v_movement_ids
      from "RetificaPremium"."Financeiro_Movimentos" rev
      join "RetificaPremium"."Financeiro_Movimentos" original
        on original.id_financeiro_movimentos = rev.fk_movimento_origem
     where rev.fk_criado_por = v_usuario
       and rev.tipo_movimento = 'ESTORNO'
       and rev.fk_notas_servico = p_id_notas_servico
       and rev.fk_movimento_origem is not null
       and rev.chave_idempotencia = p_idempotency_key || ':'
         || rev.fk_movimento_origem::text;
  else
    select coalesce(
      array_agg(
        active_movement.id_financeiro_movimentos
        order by active_movement.created_at, active_movement.id_financeiro_movimentos
      ),
      array[]::uuid[]
    )
      into v_movement_ids
      from "RetificaPremium"."Financeiro_Movimentos" active_movement
     where active_movement.fk_criado_por = v_usuario
       and active_movement.fk_notas_servico = p_id_notas_servico
       and active_movement.tipo_movimento <> 'ESTORNO'
       and active_movement.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
       and active_movement.estornado_em is null;
  end if;

  if cardinality(v_movement_ids) = 0 then
    raise exception 'A O.S. nao possui recebimento ativo para estornar.'
      using errcode = 'P0602';
  end if;

  -- Replica a ordem global do estorno agregado: idempotencias derivadas,
  -- movimentos por created_at + UUID e, somente depois, a row da O.S. O core
  -- readquire os mesmos locks de forma reentrante, sem inverter a ordem.
  foreach v_movement_id in array v_movement_ids loop
    perform "RetificaPremium".financeiro_bloquear_idempotencia(
      v_usuario,
      p_idempotency_key || ':' || v_movement_id::text
    );
  end loop;

  perform 1
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.fk_criado_por = v_usuario
     and m.id_financeiro_movimentos = any(v_movement_ids)
   order by m.created_at, m.id_financeiro_movimentos
   for update;

  select coalesce(
    array_agg(
      m.id_financeiro_movimentos
      order by m.created_at, m.id_financeiro_movimentos
    ),
    array[]::uuid[]
  )
    into v_current_ids
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.fk_criado_por = v_usuario
     and m.id_financeiro_movimentos = any(v_movement_ids);
  if v_current_ids is distinct from v_movement_ids then
    raise exception 'Os recebimentos mudaram durante o estorno. Atualize os dados e tente novamente.'
      using errcode = 'P4094';
  end if;

  -- Serializa com registrar_recebimento_nota(), que tambem bloqueia a O.S.
  -- antes de inserir o movimento. Depois do lock, o conjunto capturado precisa
  -- continuar exato; uma tentativa antiga nunca pode engolir pagamento novo.
  perform 1
    from "RetificaPremium"."Notas_de_Servico" n
    join "RetificaPremium"."Clientes" c
      on c.id_clientes = n.fk_clientes
   where n.id_notas_servico = p_id_notas_servico
     and c.fk_criado_por = v_usuario
   for update of n;
  if not found then
    raise exception 'O.S. nao encontrada no tenant da sessao.'
      using errcode = 'P0404';
  end if;

  select coalesce(
    array_agg(
      active_movement.id_financeiro_movimentos
      order by active_movement.created_at, active_movement.id_financeiro_movimentos
    ),
    array[]::uuid[]
  )
    into v_current_ids
    from "RetificaPremium"."Financeiro_Movimentos" active_movement
   where active_movement.fk_criado_por = v_usuario
     and active_movement.fk_notas_servico = p_id_notas_servico
     and active_movement.tipo_movimento <> 'ESTORNO'
     and active_movement.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
     and active_movement.estornado_em is null;

  if (v_retry and cardinality(v_current_ids) > 0)
     or (not v_retry and v_current_ids is distinct from v_movement_ids) then
    raise exception 'A O.S. recebeu um novo pagamento depois desta tentativa de estorno. Atualize os dados e tente novamente.'
      using errcode = 'P4094';
  end if;

  foreach v_movement_id in array v_movement_ids loop
    v_result := "RetificaPremium".estornar_movimento_financeiro(
      v_movement_id,
      p_motivo,
      p_data_efetiva,
      p_idempotency_key || ':' || v_movement_id::text
    );
    v_primeiro := coalesce(
      v_primeiro,
      nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid
    );
    v_count := v_count + 1;
  end loop;

  if v_primeiro is null or v_count = 0 then
    raise exception 'Resposta inconsistente ao estornar o recebimento da O.S.'
      using errcode = 'P4095';
  end if;

  if not v_retry then
    update "RetificaPremium"."Financeiro_Movimentos" rev
       set fk_registrado_por = v_actor
     where rev.fk_criado_por = v_usuario
       and rev.tipo_movimento = 'ESTORNO'
       and rev.fk_notas_servico = p_id_notas_servico
       and rev.fk_movimento_origem is not null
       and rev.chave_idempotencia = p_idempotency_key || ':'
         || rev.fk_movimento_origem::text;
    update "RetificaPremium"."Financeiro_Movimentos" original
       set fk_estornado_por = v_actor
     where original.id_financeiro_movimentos in (
       select rev.fk_movimento_origem
         from "RetificaPremium"."Financeiro_Movimentos" rev
        where rev.fk_criado_por = v_usuario
          and rev.tipo_movimento = 'ESTORNO'
          and rev.fk_notas_servico = p_id_notas_servico
          and rev.fk_movimento_origem is not null
          and rev.chave_idempotencia = p_idempotency_key || ':'
            || rev.fk_movimento_origem::text
     );

    perform "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'estornar_recebimento_nota',
      'Financeiro_Movimentos',
      v_primeiro::text,
      'Recebimento de O.S. estornado por Mega Master em suporte.'
    );
  end if;

  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return json_build_object(
    'status', 200,
    'mensagem', case when v_retry then 'Recebimento ja estornado.' else 'Recebimento estornado.' end,
    'dados', json_build_object(
      'id_movimento', v_primeiro,
      'movimento_id', v_primeiro,
      'status', 'PENDENTE',
      'movimentos_estornados', v_count,
      'valor_realizado', 0,
      'idempotent_retry', v_retry
    )
  );
end;
$$;

create or replace function "RetificaPremium".registrar_recebimento_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text,
  p_observacoes text,
  p_idempotency_key text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_result json;
  v_movimento uuid;
  v_retry boolean;
  v_logged boolean;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );
  v_result := "RetificaPremium".registrar_recebimento_fechamento(
    p_id_fechamentos,
    p_valor,
    p_data_efetiva,
    p_fk_conta_financeira,
    p_forma_pagamento,
    p_observacoes,
    p_idempotency_key
  );
  v_movimento := nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid;
  v_retry := coalesce((v_result -> 'dados' ->> 'idempotent_retry')::boolean, false);
  if v_movimento is null then
    raise exception 'Resposta inconsistente ao registrar recebimento do fechamento.'
      using errcode = 'P4095';
  end if;
  perform 1
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.id_financeiro_movimentos = v_movimento
     and m.fk_criado_por = v_usuario
     and m.fk_fechamentos = p_id_fechamentos;
  if not found then
    raise exception 'Movimento fora do tenant da sessao.' using errcode = 'P0403';
  end if;

  if not v_retry then
    update "RetificaPremium"."Financeiro_Movimentos"
       set fk_registrado_por = v_actor
     where id_financeiro_movimentos = v_movimento;
    v_logged := "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'registrar_recebimento_fechamento',
      'Financeiro_Movimentos',
      v_movimento::text,
      'Recebimento do fechamento registrado por Mega Master em suporte.'
    );
    if v_logged then
      insert into "RetificaPremium"."Fechamento_Logs" (
        fk_fechamentos, tipo, mensagem, fk_usuarios
      ) values (
        p_id_fechamentos,
        'recebimento',
        'Recebimento registrado por Mega Master em suporte.',
        v_actor
      );
    end if;
  end if;
  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return v_result;
end;
$$;

create or replace function "RetificaPremium".registrar_parcela_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text,
  p_observacoes text,
  p_idempotency_key text,
  p_valor_recebido_esperado numeric,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_result json;
  v_movimento uuid;
  v_retry boolean;
  v_logged boolean;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );
  v_result := "RetificaPremium".registrar_parcela_fechamento(
    p_id_fechamentos,
    p_valor,
    p_data_efetiva,
    p_fk_conta_financeira,
    p_forma_pagamento,
    p_observacoes,
    p_idempotency_key,
    p_valor_recebido_esperado
  );
  v_movimento := nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid;
  v_retry := coalesce((v_result -> 'dados' ->> 'idempotent_retry')::boolean, false);
  if v_movimento is null then
    raise exception 'Resposta inconsistente ao registrar parcela.' using errcode = 'P4095';
  end if;
  perform 1
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.id_financeiro_movimentos = v_movimento
     and m.fk_criado_por = v_usuario
     and m.fk_fechamentos = p_id_fechamentos;
  if not found then
    raise exception 'Movimento fora do tenant da sessao.' using errcode = 'P0403';
  end if;

  if not v_retry then
    update "RetificaPremium"."Financeiro_Movimentos"
       set fk_registrado_por = v_actor
     where id_financeiro_movimentos = v_movimento;
    v_logged := "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'registrar_parcela_fechamento',
      'Financeiro_Movimentos',
      v_movimento::text,
      'Parcela do fechamento registrada por Mega Master em suporte.'
    );
    if v_logged then
      insert into "RetificaPremium"."Fechamento_Logs" (
        fk_fechamentos, tipo, mensagem, fk_usuarios
      ) values (
        p_id_fechamentos,
        'recebimento',
        'Parcela registrada por Mega Master em suporte.',
        v_actor
      );
    end if;
  end if;
  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return v_result;
end;
$$;

create or replace function "RetificaPremium".estornar_parcela_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_id_financeiro_movimentos uuid,
  p_motivo text,
  p_data_efetiva timestamptz,
  p_idempotency_key text,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := "RetificaPremium".require_current_usuario_id();
  v_usuario uuid;
  v_result json;
  v_estorno uuid;
  v_logged boolean;
  v_retry boolean;
begin
  v_usuario := "RetificaPremium".support_closing_enable_dml(
    p_contexto_usuario_id, p_sessao_suporte, true, true
  );
  -- Mesma ordem global do core: fechamento antes da idempotencia.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario, p_idempotency_key
  );
  select exists (
    select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
     where m.fk_criado_por = v_usuario
       and m.tipo_movimento = 'ESTORNO'
       and m.chave_idempotencia = p_idempotency_key
       and m.fk_movimento_origem = p_id_financeiro_movimentos
       and m.fk_fechamentos = p_id_fechamentos
  ) into v_retry;
  v_result := "RetificaPremium".estornar_parcela_fechamento(
    p_id_fechamentos,
    p_id_financeiro_movimentos,
    p_motivo,
    p_data_efetiva,
    p_idempotency_key
  );
  v_estorno := nullif(v_result -> 'dados' ->> 'movimento_id', '')::uuid;
  if v_estorno is null then
    raise exception 'Resposta inconsistente ao estornar parcela.' using errcode = 'P4095';
  end if;
  perform 1
    from "RetificaPremium"."Financeiro_Movimentos" m
   where m.id_financeiro_movimentos = v_estorno
     and m.fk_criado_por = v_usuario
     and m.tipo_movimento = 'ESTORNO';
  if not found then
    raise exception 'Estorno fora do tenant da sessao.' using errcode = 'P0403';
  end if;
  if not v_retry then
    update "RetificaPremium"."Financeiro_Movimentos"
       set fk_registrado_por = v_actor
     where id_financeiro_movimentos = v_estorno;
    update "RetificaPremium"."Financeiro_Movimentos" m
       set fk_estornado_por = v_actor
     where m.id_financeiro_movimentos = p_id_financeiro_movimentos
       and m.fk_criado_por = v_usuario
       and m.fk_fechamentos = p_id_fechamentos;
    if not found then
      raise exception 'Parcela original fora do tenant da sessao.'
        using errcode = 'P0403';
    end if;

    v_logged := "RetificaPremium".support_closing_log_once(
      v_usuario,
      p_sessao_suporte,
      'estornar_parcela_fechamento',
      'Financeiro_Movimentos',
      v_estorno::text,
      'Parcela do fechamento estornada por Mega Master em suporte.'
    );
    if v_logged then
      insert into "RetificaPremium"."Fechamento_Logs" (
        fk_fechamentos, tipo, mensagem, fk_usuarios
      ) values (
        p_id_fechamentos,
        'estorno',
        'Parcela estornada por Mega Master em suporte.',
        v_actor
      );
    end if;
  end if;
  perform set_config('retiflow.support_financeiro_dml', 'off', true);
  perform set_config('retiflow.support_closing_dml', 'off', true);
  return (v_result::jsonb || jsonb_build_object(
    'dados', coalesce(v_result -> 'dados', '{}'::json)::jsonb
      || jsonb_build_object('idempotent_retry', v_retry)
  ))::json;
end;
$$;

revoke all on function
  "RetificaPremium".registrar_recebimento_nota_contexto_suporte(
    uuid, numeric, timestamptz, uuid, text, text, text, uuid, uuid
  ),
  "RetificaPremium".estornar_recebimento_nota_contexto_suporte(
    uuid, text, timestamptz, text, uuid, uuid
  ),
  "RetificaPremium".registrar_recebimento_fechamento_contexto_suporte(
    uuid, numeric, timestamptz, uuid, text, text, text, uuid, uuid
  ),
  "RetificaPremium".registrar_parcela_fechamento_contexto_suporte(
    uuid, numeric, timestamptz, uuid, text, text, text, numeric, uuid, uuid
  ),
  "RetificaPremium".estornar_parcela_fechamento_contexto_suporte(
    uuid, uuid, text, timestamptz, text, uuid, uuid
  )
  from public, anon;
grant execute on function
  "RetificaPremium".registrar_recebimento_nota_contexto_suporte(
    uuid, numeric, timestamptz, uuid, text, text, text, uuid, uuid
  ),
  "RetificaPremium".estornar_recebimento_nota_contexto_suporte(
    uuid, text, timestamptz, text, uuid, uuid
  ),
  "RetificaPremium".registrar_recebimento_fechamento_contexto_suporte(
    uuid, numeric, timestamptz, uuid, text, text, text, uuid, uuid
  ),
  "RetificaPremium".registrar_parcela_fechamento_contexto_suporte(
    uuid, numeric, timestamptz, uuid, text, text, text, numeric, uuid, uuid
  ),
  "RetificaPremium".estornar_parcela_fechamento_contexto_suporte(
    uuid, uuid, text, timestamptz, text, uuid, uuid
  )
  to authenticated, service_role;

-- Falha a migration se uma RPC publica ficar anonima, se o frontend perder
-- acesso ou se um helper que aceita GUC/contexto escapar para authenticated.
do $$
declare
  v_signature text;
  v_public_signatures text[] := array[
    '"RetificaPremium".finalizar_fechamento_contexto_suporte(uuid,uuid,text,smallint,text,text,numeric,jsonb,text,text,uuid,jsonb,jsonb,numeric,timestamptz,uuid,text,text,text,uuid,uuid)',
    '"RetificaPremium".autorizar_upload_fechamento_contexto_suporte(uuid,numeric,uuid,uuid)',
    '"RetificaPremium".autorizar_upload_comprovante_contexto_suporte(uuid,uuid,uuid)',
    '"RetificaPremium".atualizar_pdf_fechamento_seguro_contexto_suporte(uuid,text,numeric,uuid,uuid)',
    '"RetificaPremium".insert_financeiro_anexo_contexto_suporte(uuid,text,text,text,bigint,uuid,uuid)',
    '"RetificaPremium".registrar_acao_fechamento_contexto_suporte(uuid,text,text,uuid,uuid)',
    '"RetificaPremium".registrar_recebimento_nota_contexto_suporte(uuid,numeric,timestamptz,uuid,text,text,text,uuid,uuid)',
    '"RetificaPremium".estornar_recebimento_nota_contexto_suporte(uuid,text,timestamptz,text,uuid,uuid)',
    '"RetificaPremium".registrar_recebimento_fechamento_contexto_suporte(uuid,numeric,timestamptz,uuid,text,text,text,uuid,uuid)',
    '"RetificaPremium".registrar_parcela_fechamento_contexto_suporte(uuid,numeric,timestamptz,uuid,text,text,text,numeric,uuid,uuid)',
    '"RetificaPremium".estornar_parcela_fechamento_contexto_suporte(uuid,uuid,text,timestamptz,text,uuid,uuid)'
  ];
  v_internal_signatures text[] := array[
    '"RetificaPremium".require_financeiro_usuario_id()',
    '"RetificaPremium".financeiro_estornar_origem(text,uuid,text,timestamptz,text)',
    '"RetificaPremium".support_closing_enable_dml(uuid,uuid,boolean,boolean)',
    '"RetificaPremium".support_closing_log_once(uuid,uuid,text,text,text,text)',
    '"RetificaPremium".support_closing_validate_pdf_path(uuid,uuid,text)'
  ];
begin
  foreach v_signature in array v_public_signatures loop
    if has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'anon ainda pode executar %.', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'authenticated sem acesso a %.', v_signature;
    end if;
  end loop;

  foreach v_signature in array v_internal_signatures loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'Helper interno exposto: %.', v_signature;
    end if;
  end loop;
end;
$$;

-- Rollback operacional:
--   1. revogar/remover as onze RPCs contexto_suporte e restaurar os cinco helpers acima;
--   2. restaurar finalizar_fechamento_contexto_suporte e
--      require_financeiro_usuario_id() pelas migrations imediatamente anteriores;
--   3. restaurar os limites anteriores do bucket fechamentos, se necessario;
--   4. reverter as Edge Functions closing-pdf-url e financeiro-anexo-url na
--      mesma janela, mantendo os buckets privados e sem remover objetos;
--   5. preservar Logs_Acoes_Suporte, Fechamento_Logs e movimentos financeiros.
