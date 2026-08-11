-- Permite que um operador autorizado finalize um fechamento no tenant ativo
-- do modo suporte. O escopo e a sessao sao revalidados no servidor e ficam
-- travados ate o commit. Nesta primeira etapa, recebimento inicial e PDF
-- persistente continuam bloqueados para evitar cruzamento financeiro/Storage.

create or replace function "RetificaPremium".require_fechamento_usuario_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  -- O GUC de fechamento reduz o alcance do contexto DML compartilhado: apenas
  -- a wrapper abaixo o ativa e somente durante a chamada do core atomico.
  if current_setting('retiflow.support_closing_dml', true) = 'on' then
    v_usuario := "RetificaPremium".support_context_dml_usuario_id();
  end if;
  if v_usuario is null then
    v_usuario := "RetificaPremium".require_current_usuario_id();
  end if;

  perform "RetificaPremium".assert_fechamento_target_access(v_usuario);
  return v_usuario;
end;
$$;

revoke execute on function
  "RetificaPremium".require_fechamento_usuario_id()
  from public, anon, authenticated;
grant execute on function
  "RetificaPremium".require_fechamento_usuario_id()
  to service_role;

-- Os triggers legados de ownership comparam diretamente com o ator autenticado.
-- Durante a unica janela em que a wrapper de fechamento ativa o GUC dedicado,
-- eles devem comparar com o tenant validado; em qualquer outro fluxo continuam
-- usando require_current_usuario_id(), sem ampliar as escritas de Notas/O.S.
create or replace function "RetificaPremium".enforce_note_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if current_setting('retiflow.support_closing_dml', true) = 'on' then
    v_usuario_id := "RetificaPremium".require_fechamento_usuario_id();
  else
    v_usuario_id := "RetificaPremium".require_current_usuario_id();
  end if;

  if tg_op = 'INSERT' then
    new.criado_por_usuario := coalesce(new.criado_por_usuario, v_usuario_id);
    if new.criado_por_usuario is distinct from v_usuario_id then
      raise exception 'O.S. pertence a outro usuario.' using errcode = 'P0403';
    end if;
    return new;
  end if;

  if old.criado_por_usuario is distinct from v_usuario_id then
    raise exception 'O.S. nao encontrada para este usuario.' using errcode = 'P0403';
  end if;

  if tg_op = 'UPDATE' then
    new.criado_por_usuario := old.criado_por_usuario;
    return new;
  end if;

  return old;
end;
$$;

create or replace function "RetificaPremium".enforce_closing_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_client_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if current_setting('retiflow.support_closing_dml', true) = 'on' then
    v_usuario_id := "RetificaPremium".require_fechamento_usuario_id();
  else
    v_usuario_id := "RetificaPremium".require_current_usuario_id();
  end if;
  v_client_id := case when tg_op = 'DELETE' then old.fk_clientes else new.fk_clientes end;

  if v_client_id is null or not exists (
    select 1
      from "RetificaPremium"."Clientes" c
     where c.id_clientes = v_client_id
       and c.fk_criado_por = v_usuario_id
  ) then
    raise exception 'Fechamento nao pertence a um cliente deste usuario.'
      using errcode = 'P0403';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function "RetificaPremium".enforce_note_owner()
  from public, anon, authenticated;
revoke execute on function "RetificaPremium".enforce_closing_owner()
  from public, anon, authenticated;

-- O PDF precisa usar a identidade visual do tenant atendido. Estas leituras
-- passam pela sessao validada em vez das RPCs legadas com acesso cross-user.
create or replace function "RetificaPremium".get_configuracao_modelo_usuario_contexto_suporte(
  p_fk_usuarios uuid,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_config record;
begin
  if p_contexto_usuario_id is null or p_sessao_suporte is null then
    raise exception 'Alvo e sessao de suporte sao obrigatorios.'
      using errcode = 'P0403';
  end if;

  v_usuario := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,
    p_sessao_suporte
  );
  if p_fk_usuarios is not null and p_fk_usuarios is distinct from v_usuario then
    raise exception 'A configuracao solicitada nao pertence ao alvo da sessao.'
      using errcode = 'P0403';
  end if;

  select *
    into v_config
    from "RetificaPremium"."Configuracoes_Modelos_Usuario" c
   where c.fk_usuarios = v_usuario
   limit 1;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Configuracao de modelo carregada em suporte.',
    'dados', jsonb_build_object(
      'fk_usuarios', v_usuario,
      'os_modelo', coalesce(v_config.os_modelo, 'auto'),
      'cor_documento', coalesce(v_config.cor_documento, '#1a7a8a'),
      'fechamento_modelo', coalesce(v_config.fechamento_modelo, 'moderno'),
      'cor_fechamento', coalesce(v_config.cor_fechamento, '#0f7f95'),
      'updated_at', v_config.updated_at
    )
  );
end;
$$;

create or replace function "RetificaPremium".resolver_configuracao_documento_contexto_suporte(
  p_fk_usuarios uuid,
  p_document_type text,
  p_generated_at date,
  p_contexto_usuario_id uuid,
  p_sessao_suporte uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_company_row record;
  v_company jsonb;
  v_template record;
  v_theme record;
  v_resolved jsonb;
begin
  if p_contexto_usuario_id is null or p_sessao_suporte is null then
    raise exception 'Alvo e sessao de suporte sao obrigatorios.'
      using errcode = 'P0403';
  end if;

  v_usuario := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id,
    p_sessao_suporte
  );
  if p_fk_usuarios is not null and p_fk_usuarios is distinct from v_usuario then
    raise exception 'O documento solicitado nao pertence ao alvo da sessao.'
      using errcode = 'P0403';
  end if;
  if p_document_type is null or p_document_type not in (
    'entry_note', 'exit_note', 'closing_report', 'service_order',
    'receipt', 'quote', 'report'
  ) then
    raise exception 'Tipo de documento invalido.' using errcode = 'P0602';
  end if;

  select *
    into v_company_row
    from "RetificaPremium"."Configuracoes_Empresa_Usuario" c
   where c.fk_usuarios = v_usuario
   limit 1;

  v_company := jsonb_build_object(
    'fk_usuarios', v_usuario,
    'razao_social', coalesce(v_company_row.razao_social, 'Retífica Premium'),
    'nome_fantasia', coalesce(v_company_row.nome_fantasia, 'Retífica Premium'),
    'cnpj', coalesce(v_company_row.cnpj, ''),
    'inscricao_estadual', coalesce(v_company_row.inscricao_estadual, ''),
    'inscricao_municipal', coalesce(v_company_row.inscricao_municipal, ''),
    'endereco', coalesce(v_company_row.endereco, ''),
    'cidade', coalesce(v_company_row.cidade, ''),
    'estado', coalesce(v_company_row.estado, ''),
    'cep', coalesce(v_company_row.cep, ''),
    'telefone', coalesce(v_company_row.telefone, '(16) 3524-4661'),
    'whatsapp', coalesce(v_company_row.whatsapp, ''),
    'email', coalesce(v_company_row.email, ''),
    'site', coalesce(v_company_row.site, ''),
    'instagram', coalesce(v_company_row.instagram, ''),
    'horario_atendimento', coalesce(v_company_row.horario_atendimento, ''),
    'mensagem_atendimento', coalesce(v_company_row.mensagem_atendimento, ''),
    'observacao_documentos', coalesce(v_company_row.observacao_documentos, ''),
    'brand_primary_color', coalesce(v_company_row.brand_primary_color, '#1a7a8a'),
    'brand_secondary_color', coalesce(v_company_row.brand_secondary_color, '#0f7f95'),
    'updated_at', v_company_row.updated_at
  );

  select *
    into v_template
    from "RetificaPremium"."Templates_Documentos_Usuario" t
   where t.fk_usuarios = v_usuario
     and t.document_type = p_document_type
     and t.status = 'active'
   order by t.version desc
   limit 1;

  select *
    into v_theme
    from "RetificaPremium"."Temas_Documentos_Usuario" t
   where t.fk_usuarios = v_usuario
     and t.is_active = true
     and (t.applies_to_json = '[]'::jsonb or t.applies_to_json ? p_document_type)
     and (t.starts_at is null or t.starts_at <= coalesce(p_generated_at, current_date))
     and (t.ends_at is null or t.ends_at >= coalesce(p_generated_at, current_date))
   order by
     case when t.starts_at is null and t.ends_at is null then 0 else 1 end,
     t.updated_at desc
   limit 1;

  v_resolved := "RetificaPremium".document_default_config(p_document_type)
    || jsonb_build_object(
      'theme',
      jsonb_build_object(
        'primaryColor', coalesce(v_company ->> 'brand_primary_color', '#1a7a8a'),
        'secondaryColor', coalesce(v_company ->> 'brand_secondary_color', '#0f7f95'),
        'accentColor', coalesce(v_company ->> 'brand_primary_color', '#1a7a8a'),
        'headerBackgroundColor', coalesce(v_company ->> 'brand_primary_color', '#1a7a8a'),
        'headerTextColor', '#ffffff',
        'borderColor', '#d6e3e8'
      )
    );

  if v_theme.id_temas_documentos_usuario is not null then
    v_resolved := v_resolved || jsonb_build_object(
      'theme',
      coalesce(v_resolved -> 'theme', '{}'::jsonb)
        || coalesce(v_theme.config_json, '{}'::jsonb)
    );
  end if;
  if v_template.id_templates_documentos_usuario is not null then
    v_resolved := v_resolved || coalesce(v_template.config_json, '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'status', 200,
    'mensagem', 'Configuracao de documento resolvida em suporte.',
    'dados', jsonb_build_object(
      'fk_usuarios', v_usuario,
      'document_type', p_document_type,
      'company', v_company,
      'template', case
        when v_template.id_templates_documentos_usuario is null then null
        else to_jsonb(v_template)
      end,
      'theme', case
        when v_theme.id_temas_documentos_usuario is null then null
        else to_jsonb(v_theme)
      end,
      'resolved_config', v_resolved
    )
  );
end;
$$;

revoke all on function
  "RetificaPremium".get_configuracao_modelo_usuario_contexto_suporte(uuid, uuid, uuid)
  from public, anon;
grant execute on function
  "RetificaPremium".get_configuracao_modelo_usuario_contexto_suporte(uuid, uuid, uuid)
  to authenticated, service_role;

revoke all on function
  "RetificaPremium".resolver_configuracao_documento_contexto_suporte(
    uuid, text, date, uuid, uuid
  )
  from public, anon;
grant execute on function
  "RetificaPremium".resolver_configuracao_documento_contexto_suporte(
    uuid, text, date, uuid, uuid
  )
  to authenticated, service_role;

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
  v_idempotent_retry boolean;
begin
  -- O resolver legado aceita alvo nulo como contexto proprio; uma RPC que se
  -- anuncia como suporte deve falhar fechada em vez de usar esse fallback.
  if p_contexto_usuario_id is null or p_sessao_suporte is null then
    raise exception 'Alvo e sessao de suporte sao obrigatorios.'
      using errcode = 'P0403';
  end if;

  if p_pdf_url is not null then
    raise exception 'O PDF persistente ainda nao esta habilitado em modo suporte.'
      using errcode = 'P0403';
  end if;

  if num_nonnulls(
    p_recebimento_valor,
    p_recebimento_data,
    p_recebimento_conta,
    p_recebimento_forma,
    p_recebimento_observacoes,
    p_recebimento_idempotencia
  ) > 0 then
    raise exception 'Crie o fechamento sem entrada no modo suporte.'
      using errcode = 'P0403';
  end if;

  v_actor := "RetificaPremium".require_current_usuario_id();

  -- Impede que a mesma sessao seja encerrada ou trocada enquanto a transacao
  -- atomica vincula as O.S. e grava os logs obrigatorios.
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

  v_usuario := "RetificaPremium".set_suporte_contexto_dml(
    p_contexto_usuario_id,
    p_sessao_suporte
  );
  perform "RetificaPremium".assert_fechamento_target_access(v_usuario);
  perform set_config('retiflow.support_closing_dml', 'on', true);

  v_result := "RetificaPremium".finalizar_fechamento(
    p_id_fechamentos,
    p_fk_clientes,
    p_mes,
    p_ano,
    p_periodo,
    p_label,
    p_valor_total,
    p_dados_json,
    p_pdf_url,
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
  perform set_config('retiflow.support_closing_dml', 'off', true);

  v_result_id := nullif(v_result -> 'dados' ->> 'id_fechamentos', '')::uuid;
  v_idempotent_retry := coalesce(
    (v_result -> 'dados' ->> 'idempotent_retry')::boolean,
    false
  );

  if v_result_id is distinct from p_id_fechamentos then
    raise exception 'Resposta inconsistente ao finalizar o fechamento em suporte.'
      using errcode = 'P4095';
  end if;

  if not v_idempotent_retry then
    insert into "RetificaPremium"."Fechamento_Logs" (
      fk_fechamentos,
      tipo,
      mensagem,
      fk_usuarios
    ) values (
      v_result_id,
      'suporte',
      'Fechamento criado por operador autorizado em modo suporte.',
      v_actor
    );

    -- Obrigatorio e na mesma transacao: falha de auditoria desfaz tambem o
    -- fechamento e todos os vinculos das O.S.
    perform "RetificaPremium".insert_log_acao_suporte(
      v_usuario,
      p_sessao_suporte,
      'finalizar_fechamento',
      'Fechamentos',
      v_result_id::text,
      'Fechamento criado sem entrada em modo suporte.'
    );
  end if;

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

comment on function
  "RetificaPremium".finalizar_fechamento_contexto_suporte(
    uuid, uuid, text, smallint, text, text, numeric, jsonb, text, text,
    uuid, jsonb, jsonb, numeric, timestamptz, uuid, text, text, text,
    uuid, uuid
  ) is
  'Finaliza um fechamento sem entrada no tenant de uma sessao de suporte validada e registra auditoria ator/alvo.';

do $$
begin
  if has_function_privilege(
    'anon',
    '"RetificaPremium".finalizar_fechamento_contexto_suporte(uuid,uuid,text,smallint,text,text,numeric,jsonb,text,text,uuid,jsonb,jsonb,numeric,timestamptz,uuid,text,text,text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon ainda pode finalizar fechamento em suporte.';
  end if;

  if not has_function_privilege(
    'authenticated',
    '"RetificaPremium".finalizar_fechamento_contexto_suporte(uuid,uuid,text,smallint,text,text,numeric,jsonb,text,text,uuid,jsonb,jsonb,numeric,timestamptz,uuid,text,text,text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated sem acesso a finalizacao auditada em suporte.';
  end if;

  if has_function_privilege(
    'anon',
    '"RetificaPremium".get_configuracao_modelo_usuario_contexto_suporte(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    '"RetificaPremium".resolver_configuracao_documento_contexto_suporte(uuid,text,date,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon ainda pode ler configuracao de documento em suporte.';
  end if;

  if not has_function_privilege(
    'authenticated',
    '"RetificaPremium".get_configuracao_modelo_usuario_contexto_suporte(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    '"RetificaPremium".resolver_configuracao_documento_contexto_suporte(uuid,text,date,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated sem acesso ao documento contextual de suporte.';
  end if;

  if has_function_privilege(
    'authenticated',
    '"RetificaPremium".require_fechamento_usuario_id()',
    'EXECUTE'
  ) then
    raise exception 'Helper interno de fechamento ficou exposto.';
  end if;

  if has_function_privilege(
    'authenticated',
    '"RetificaPremium".support_context_dml_usuario_id()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    '"RetificaPremium".set_suporte_contexto_dml(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Helper interno de contexto DML ficou exposto.';
  end if;
end;
$$;

-- Rollback operacional: revogar/remover a RPC de finalização e as duas RPCs
-- contextuais de documento; restaurar require_fechamento_usuario_id(),
-- enforce_note_owner() e enforce_closing_owner() a partir das migrations
-- anteriores, voltando a usar apenas require_current_usuario_id().
