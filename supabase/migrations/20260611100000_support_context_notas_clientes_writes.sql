-- Variantes de suporte para escritas auditadas em Notas de Serviço e Clientes.
-- Padrão idêntico ao de Contas a Pagar: resolve_suporte_contexto_usuario_id
-- valida o actor (Mega Master com sessão ativa) e retorna o id_usuarios do tenant-alvo.
-- Todas as escritas ficam registradas em Logs_Acoes_Suporte.
--
-- RPCs criados:
--   update_nota_servico_contexto_suporte  — editar O.S. existente
--   nova_nota_contexto_suporte            — criar nova O.S.
--   update_cliente_contexto_suporte       — atualizar dados do cliente
--   salvar_cliente_completo_contexto_suporte — criar/editar cliente com endereço e contatos
--   inativar_cliente_contexto_suporte     — inativar cliente
--   reativar_cliente_contexto_suporte     — reativar cliente

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. update_nota_servico_contexto_suporte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "RetificaPremium".update_nota_servico_contexto_suporte(
  p_payload              jsonb,
  p_contexto_usuario_id  uuid,
  p_sessao_suporte       uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'RetificaPremium', 'public'
AS $$
DECLARE
  v_usuario_id       uuid;
  v_id_nota          uuid := nullif(p_payload->>'id_notas_servico', '')::uuid;
  v_current_veiculo_id uuid;
  v_current_placa    text;
  v_cliente_id       uuid;
  v_veiculo          jsonb;
  v_modelo           text;
  v_placa            text;
  v_km               bigint;
  v_motor            text;
  v_motor_id         bigint;
  v_veiculo_id       uuid;
  v_item             jsonb;
  v_item_nome        text;
  v_item_detalhes    text;
  v_servico_id       bigint;
  v_quantidade       smallint;
  v_valor            numeric;
  v_desconto         numeric;
BEGIN
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id, p_sessao_suporte
  );

  IF v_id_nota IS NULL THEN
    RAISE EXCEPTION 'ID da O.S. é obrigatório.' USING errcode = 'P3001';
  END IF;

  SELECT ns.fk_veiculos, v.placa
    INTO v_current_veiculo_id, v_current_placa
    FROM "RetificaPremium"."Notas_de_Servico" ns
    JOIN "RetificaPremium"."Veiculos" v ON v.id_veiculos = ns.fk_veiculos
   WHERE ns.id_notas_servico = v_id_nota
     AND ns.criado_por_usuario = v_usuario_id;

  IF v_current_veiculo_id IS NULL THEN
    RAISE EXCEPTION 'O.S. não encontrada para este usuário.' USING errcode = 'P3001';
  END IF;

  IF p_payload ? 'fk_clientes' THEN
    v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
    IF v_cliente_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM "RetificaPremium"."Clientes"
       WHERE id_clientes = v_cliente_id AND fk_criado_por = v_usuario_id
    ) THEN
      RAISE EXCEPTION 'Cliente não encontrado para este usuário.' USING errcode = 'P0403';
    END IF;
  END IF;

  UPDATE "RetificaPremium"."Notas_de_Servico"
     SET defeito          = CASE WHEN p_payload ? 'defeito' THEN coalesce(nullif(p_payload->>'defeito', ''), '-') ELSE defeito END,
         observacoes      = CASE WHEN p_payload ? 'observacoes' THEN nullif(p_payload->>'observacoes', '') ELSE observacoes END,
         fk_clientes      = coalesce(v_cliente_id, fk_clientes),
         prazo            = CASE WHEN p_payload ? 'prazo' THEN coalesce(nullif(p_payload->>'prazo', '')::timestamp, prazo) ELSE prazo END,
         total_servicos   = CASE WHEN p_payload ? 'total_servicos' THEN coalesce(nullif(p_payload->>'total_servicos', '')::numeric, 0) ELSE total_servicos END,
         total_produtos   = CASE WHEN p_payload ? 'total_produtos' THEN coalesce(nullif(p_payload->>'total_produtos', '')::numeric, 0) ELSE total_produtos END,
         total            = CASE WHEN p_payload ? 'total' THEN coalesce(nullif(p_payload->>'total', '')::numeric, 0) ELSE total END,
         fk_status        = CASE WHEN p_payload ? 'fk_status' THEN coalesce(nullif(p_payload->>'fk_status', '')::smallint, fk_status) ELSE fk_status END,
         payment_status   = CASE WHEN p_payload ? 'payment_status' THEN coalesce(nullif(p_payload->>'payment_status', ''), payment_status) ELSE payment_status END,
         pago_em          = CASE WHEN p_payload ? 'pago_em' THEN nullif(p_payload->>'pago_em', '')::timestamp ELSE pago_em END,
         pago_com         = CASE WHEN p_payload ? 'pago_com' THEN nullif(p_payload->>'pago_com', '') ELSE pago_com END,
         contato_nome     = CASE WHEN p_payload ? 'contato_nome' THEN nullif(p_payload->>'contato_nome', '') ELSE contato_nome END,
         contato_telefone = CASE WHEN p_payload ? 'contato_telefone' THEN nullif(p_payload->>'contato_telefone', '') ELSE contato_telefone END,
         updated_at       = now()
   WHERE id_notas_servico = v_id_nota
     AND criado_por_usuario = v_usuario_id;

  IF p_payload ? 'veiculo' THEN
    v_veiculo  := coalesce(p_payload->'veiculo', '{}'::jsonb);
    v_modelo   := coalesce(nullif(btrim(v_veiculo->>'modelo'), ''), 'Não Identificado');
    v_placa    := nullif(upper(regexp_replace(coalesce(v_veiculo->>'placa', ''), '[^a-zA-Z0-9]', '', 'g')), '');
    v_km       := coalesce(nullif(v_veiculo->>'km', '')::bigint, 0);
    v_motor    := coalesce(nullif(btrim(v_veiculo->>'motor'), ''), 'Não Identificado');

    IF v_placa IS NOT NULL AND length(v_placa) <> 7 THEN
      RAISE EXCEPTION 'Placa inválida.' USING errcode = 'P3001';
    END IF;

    SELECT id_tipos_de_motor INTO v_motor_id
      FROM "RetificaPremium"."Tipos_de_Motor"
     WHERE lower(tipo) = lower(v_motor) LIMIT 1;

    IF v_motor_id IS NULL THEN
      INSERT INTO "RetificaPremium"."Tipos_de_Motor"(tipo)
      VALUES (v_motor)
      RETURNING id_tipos_de_motor INTO v_motor_id;
    END IF;

    IF v_placa IS NOT NULL THEN
      SELECT id_veiculos INTO v_veiculo_id
        FROM "RetificaPremium"."Veiculos"
       WHERE placa = v_placa LIMIT 1;
    END IF;

    IF v_veiculo_id IS NULL AND v_placa IS NULL AND v_current_placa IS NULL THEN
      v_veiculo_id := v_current_veiculo_id;
    END IF;

    IF v_veiculo_id IS NULL THEN
      INSERT INTO "RetificaPremium"."Veiculos"(modelo, placa, km, fk_tipos_de_motor)
      VALUES (v_modelo, v_placa, v_km, v_motor_id)
      RETURNING id_veiculos INTO v_veiculo_id;
    ELSE
      UPDATE "RetificaPremium"."Veiculos"
         SET modelo = v_modelo, placa = v_placa, km = v_km,
             fk_tipos_de_motor = v_motor_id, updated_at = now()
       WHERE id_veiculos = v_veiculo_id;
    END IF;

    UPDATE "RetificaPremium"."Notas_de_Servico"
       SET fk_veiculos = v_veiculo_id, updated_at = now()
     WHERE id_notas_servico = v_id_nota AND criado_por_usuario = v_usuario_id;
  END IF;

  IF p_payload ? 'itens' THEN
    DELETE FROM "RetificaPremium"."Rel_NotaS_Serv"
     WHERE fk_notas_servico = v_id_nota;

    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb)) LOOP
      v_item_nome    := nullif(btrim(v_item->>'descricao'), '');
      IF v_item_nome IS NULL THEN CONTINUE; END IF;
      v_item_detalhes := nullif(v_item->>'detalhes', '');
      v_quantidade   := greatest(1, coalesce(nullif(v_item->>'quantidade', '')::numeric, 1))::smallint;
      v_valor        := greatest(0, coalesce(nullif(v_item->>'valor', '')::numeric, 0));
      v_desconto     := least(100, greatest(0, coalesce(nullif(v_item->>'desconto', '')::numeric, 0)));

      SELECT id_servicos_itens INTO v_servico_id
        FROM "RetificaPremium"."Servicos_ou_Itens"
       WHERE lower(nome) = lower(v_item_nome) LIMIT 1;

      IF v_servico_id IS NULL THEN
        INSERT INTO "RetificaPremium"."Servicos_ou_Itens"(nome)
        VALUES (v_item_nome) RETURNING id_servicos_itens INTO v_servico_id;
      END IF;

      INSERT INTO "RetificaPremium"."Rel_NotaS_Serv"
        (fk_notas_servico, fk_servicos_itens, quantidade, valor, desconto, detalhes)
      VALUES (v_id_nota, v_servico_id, v_quantidade, v_valor, v_desconto, v_item_detalhes);
    END LOOP;
  END IF;

  PERFORM "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id, p_sessao_suporte,
    'update_nota_servico', 'Notas_de_Servico', v_id_nota::text,
    'O.S. editada em modo suporte'
  );

  RETURN json_build_object('status', 200, 'mensagem', 'Nota de Serviço atualizada.');
EXCEPTION
  WHEN sqlstate 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized',    'mensagem', sqlerrm);
  WHEN sqlstate 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden',       'mensagem', sqlerrm);
  WHEN sqlstate 'P3001' THEN RETURN json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
  WHEN OTHERS            THEN RETURN json_build_object('status', 500, 'code', sqlstate,          'mensagem', sqlerrm);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. nova_nota_contexto_suporte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "RetificaPremium".nova_nota_contexto_suporte(
  p_payload              jsonb,
  p_contexto_usuario_id  uuid,
  p_sessao_suporte       uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'RetificaPremium', 'public'
AS $$
DECLARE
  v_usuario_id     uuid;
  v_tipo_nota      text    := p_payload->>'tipo_nota';
  v_numero         text    := nullif(btrim(p_payload->>'numero_nota'), '');
  v_numero_digits  text;
  v_numero_numeric numeric;
  v_status_id      smallint;
  v_id_nota        uuid;
  v_cliente_id     uuid;
  v_veiculo        jsonb;
  v_modelo         text;
  v_placa          text;
  v_km             bigint;
  v_motor          text;
  v_motor_id       bigint;
  v_veiculo_id     uuid;
  v_item           jsonb;
  v_item_nome      text;
  v_item_detalhes  text;
  v_servico_id     bigint;
  v_quantidade     smallint;
  v_valor          numeric;
  v_desconto       numeric;
BEGIN
  IF v_tipo_nota NOT IN ('Serviço', 'Compra') THEN
    RAISE EXCEPTION 'Tipo de nota inválido.' USING errcode = 'P3001';
  END IF;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'Número da nota é obrigatório.' USING errcode = 'P3001';
  END IF;

  v_numero_digits := nullif(regexp_replace(v_numero, '\D', '', 'g'), '');
  IF v_numero_digits IS NOT NULL THEN
    v_numero_numeric := v_numero_digits::numeric;
  END IF;

  SELECT id_status_notas INTO v_status_id
    FROM "RetificaPremium"."Status_Notas"
   WHERE tipo_nota::text = v_tipo_nota AND tipo_status = 'ativo'
   ORDER BY "index" ASC LIMIT 1;

  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'Status inicial não encontrado.' USING errcode = 'P3001';
  END IF;

  -- Notas de Compra não têm owner de tenant; criação direta sem contexto de suporte
  IF v_tipo_nota = 'Compra' THEN
    INSERT INTO "RetificaPremium"."Notas_de_Compra" (oc, observacoes, fk_status, fk_notas_servico)
    VALUES (
      v_numero,
      nullif(p_payload->>'observacoes', ''),
      v_status_id,
      nullif(p_payload->>'fk_notas_servico', '')::uuid
    )
    RETURNING id_notas_compra INTO v_id_nota;
    RETURN json_build_object('status', 200, 'mensagem', 'Nota de Compra criada.', 'id_nota', v_id_nota, 'tipo_nota', v_tipo_nota);
  END IF;

  -- Serviço: requer tenant-alvo
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id, p_sessao_suporte
  );

  v_cliente_id := nullif(p_payload->>'fk_clientes', '')::uuid;
  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Cliente é obrigatório para O.S.' USING errcode = 'P3001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "RetificaPremium"."Clientes"
     WHERE id_clientes = v_cliente_id AND fk_criado_por = v_usuario_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado para este usuário.' USING errcode = 'P0403';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "RetificaPremium"."Notas_de_Servico" ns
     WHERE ns.criado_por_usuario = v_usuario_id
       AND (
         lower(btrim(ns.os)) = lower(v_numero)
         OR (
           v_numero_numeric IS NOT NULL
           AND nullif(regexp_replace(coalesce(ns.os, ''), '\D', '', 'g'), '') IS NOT NULL
           AND nullif(regexp_replace(coalesce(ns.os, ''), '\D', '', 'g'), '')::numeric = v_numero_numeric
         )
       )
  ) THEN
    RAISE EXCEPTION 'Já existe uma O.S. com este número para esta conta.' USING errcode = 'P3002';
  END IF;

  v_veiculo  := coalesce(p_payload->'veiculo', '{}'::jsonb);
  v_modelo   := coalesce(nullif(btrim(v_veiculo->>'modelo'), ''), 'Não Identificado');
  v_placa    := nullif(upper(regexp_replace(coalesce(v_veiculo->>'placa', ''), '[^a-zA-Z0-9]', '', 'g')), '');
  v_km       := coalesce(nullif(v_veiculo->>'km', '')::bigint, 0);
  v_motor    := coalesce(nullif(btrim(v_veiculo->>'motor'), ''), 'Não Identificado');

  IF v_placa IS NOT NULL AND length(v_placa) <> 7 THEN
    RAISE EXCEPTION 'Placa inválida.' USING errcode = 'P3001';
  END IF;

  SELECT id_tipos_de_motor INTO v_motor_id
    FROM "RetificaPremium"."Tipos_de_Motor"
   WHERE lower(tipo) = lower(v_motor) LIMIT 1;

  IF v_motor_id IS NULL THEN
    INSERT INTO "RetificaPremium"."Tipos_de_Motor"(tipo)
    VALUES (v_motor) RETURNING id_tipos_de_motor INTO v_motor_id;
  END IF;

  IF v_placa IS NOT NULL THEN
    SELECT id_veiculos INTO v_veiculo_id
      FROM "RetificaPremium"."Veiculos"
     WHERE placa = v_placa LIMIT 1;
  END IF;

  IF v_veiculo_id IS NULL THEN
    INSERT INTO "RetificaPremium"."Veiculos"(modelo, placa, km, fk_tipos_de_motor)
    VALUES (v_modelo, v_placa, v_km, v_motor_id)
    RETURNING id_veiculos INTO v_veiculo_id;
  ELSE
    UPDATE "RetificaPremium"."Veiculos"
       SET modelo = v_modelo, km = v_km, fk_tipos_de_motor = v_motor_id, updated_at = now()
     WHERE id_veiculos = v_veiculo_id;
  END IF;

  INSERT INTO "RetificaPremium"."Notas_de_Servico" (
    os, prazo, defeito, observacoes, fk_clientes, fk_veiculos,
    fk_status, criado_por_usuario, total_servicos, total_produtos, total
  ) VALUES (
    v_numero,
    coalesce(nullif(p_payload->>'prazo', '')::timestamp, now() + interval '30 days'),
    coalesce(nullif(p_payload->>'defeito', ''), '-'),
    nullif(p_payload->>'observacoes', ''),
    v_cliente_id,
    v_veiculo_id,
    v_status_id,
    v_usuario_id,
    coalesce(nullif(p_payload->>'total_servicos', '')::numeric, 0),
    coalesce(nullif(p_payload->>'total_produtos', '')::numeric, 0),
    coalesce(nullif(p_payload->>'total', '')::numeric, 0)
  )
  RETURNING id_notas_servico INTO v_id_nota;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb)) LOOP
    v_item_nome    := nullif(btrim(v_item->>'descricao'), '');
    IF v_item_nome IS NULL THEN CONTINUE; END IF;
    v_item_detalhes := nullif(v_item->>'detalhes', '');
    v_quantidade   := greatest(1, coalesce(nullif(v_item->>'quantidade', '')::numeric, 1))::smallint;
    v_valor        := greatest(0, coalesce(nullif(v_item->>'valor', '')::numeric, 0));
    v_desconto     := least(100, greatest(0, coalesce(nullif(v_item->>'desconto', '')::numeric, 0)));

    SELECT id_servicos_itens INTO v_servico_id
      FROM "RetificaPremium"."Servicos_ou_Itens"
     WHERE lower(nome) = lower(v_item_nome) LIMIT 1;

    IF v_servico_id IS NULL THEN
      INSERT INTO "RetificaPremium"."Servicos_ou_Itens"(nome)
      VALUES (v_item_nome) RETURNING id_servicos_itens INTO v_servico_id;
    END IF;

    INSERT INTO "RetificaPremium"."Rel_NotaS_Serv"
      (fk_notas_servico, fk_servicos_itens, quantidade, valor, desconto, detalhes)
    VALUES (v_id_nota, v_servico_id, v_quantidade, v_valor, v_desconto, v_item_detalhes);
  END LOOP;

  PERFORM "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id, p_sessao_suporte,
    'nova_nota', 'Notas_de_Servico', v_id_nota::text,
    'O.S. criada em modo suporte: ' || v_numero
  );

  RETURN json_build_object('status', 200, 'mensagem', 'Nota de Serviço criada.', 'id_nota', v_id_nota, 'tipo_nota', v_tipo_nota);
EXCEPTION
  WHEN sqlstate 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized',    'mensagem', sqlerrm);
  WHEN sqlstate 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden',       'mensagem', sqlerrm);
  WHEN sqlstate 'P3001' THEN RETURN json_build_object('status', 400, 'code', 'invalid_payload', 'mensagem', sqlerrm);
  WHEN sqlstate 'P3002' THEN RETURN json_build_object('status', 400, 'code', 'duplicate_os',    'mensagem', sqlerrm);
  WHEN unique_violation  THEN RETURN json_build_object('status', 400, 'code', 'duplicate_os',    'mensagem', 'Já existe uma O.S. com este número para esta conta.');
  WHEN OTHERS            THEN RETURN json_build_object('status', 500, 'code', sqlstate,          'mensagem', sqlerrm);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. update_cliente_contexto_suporte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "RetificaPremium".update_cliente_contexto_suporte(
  p_id_clientes          uuid,
  p_contexto_usuario_id  uuid,
  p_sessao_suporte       uuid,
  p_nome                 text    DEFAULT NULL,
  p_documento            text    DEFAULT NULL,
  p_tipo_documento       text    DEFAULT NULL,
  p_status               boolean DEFAULT NULL,
  p_observacao           text    DEFAULT NULL,
  p_nome_fantasia        text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'RetificaPremium', 'public'
AS $$
DECLARE
  v_usuario_id      uuid;
  v_documento_limpo text;
BEGIN
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id, p_sessao_suporte
  );

  IF NOT EXISTS (
    SELECT 1 FROM "RetificaPremium"."Clientes"
     WHERE id_clientes = p_id_clientes AND fk_criado_por = v_usuario_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado para este usuário.' USING errcode = 'P2001';
  END IF;

  IF p_documento IS NOT NULL AND trim(p_documento) <> '' THEN
    v_documento_limpo := upper(regexp_replace(p_documento, '[^a-zA-Z0-9]', '', 'g'));
  END IF;

  UPDATE "RetificaPremium"."Clientes"
     SET nome          = CASE WHEN p_nome IS NOT NULL THEN initcap(trim(p_nome)) ELSE nome END,
         documento     = coalesce(v_documento_limpo, documento),
         tipo_documento = CASE WHEN p_tipo_documento IS NOT NULL THEN upper(trim(p_tipo_documento))::"RetificaPremium"."tipo_documento" ELSE tipo_documento END,
         status        = coalesce(p_status, status),
         observacao    = CASE WHEN p_observacao IS NOT NULL THEN nullif(trim(p_observacao), '') ELSE observacao END,
         nome_fantasia = CASE WHEN p_nome_fantasia IS NOT NULL THEN nullif(trim(p_nome_fantasia), '') ELSE nome_fantasia END,
         updated_at    = now()
   WHERE id_clientes = p_id_clientes AND fk_criado_por = v_usuario_id;

  PERFORM "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id, p_sessao_suporte,
    'update_cliente', 'Clientes', p_id_clientes::text,
    'Cliente atualizado em modo suporte'
  );

  RETURN json_build_object('status', 200, 'mensagem', 'Cliente atualizado com sucesso.');
EXCEPTION
  WHEN sqlstate 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  WHEN sqlstate 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden',    'mensagem', sqlerrm);
  WHEN sqlstate 'P2001' THEN RETURN json_build_object('status', 404, 'code', 'not_found',    'mensagem', sqlerrm);
  WHEN unique_violation  THEN RETURN json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  WHEN OTHERS            THEN RETURN json_build_object('status', 500, 'code', sqlstate,       'mensagem', sqlerrm);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. salvar_cliente_completo_contexto_suporte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "RetificaPremium".salvar_cliente_completo_contexto_suporte(
  p_payload              jsonb,
  p_contexto_usuario_id  uuid,
  p_sessao_suporte       uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'RetificaPremium', 'public'
AS $$
DECLARE
  v_usuario_id            uuid;
  v_id_cliente            uuid;
  v_documento_limpo       text;
  v_tipo_doc              text;
  v_id_endereco_existente uuid;
  v_contato_item          jsonb;
  v_acao_log              text;
  v_retorno_json          json;
BEGIN
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id, p_sessao_suporte
  );

  v_id_cliente := nullif(p_payload->>'id_clientes', '')::uuid;

  -- Validar ownership se cliente existente foi fornecido
  IF v_id_cliente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "RetificaPremium"."Clientes"
     WHERE id_clientes = v_id_cliente AND fk_criado_por = v_usuario_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado para este usuário.' USING errcode = 'P2001';
  END IF;

  -- Buscar pelo documento se id não fornecido
  IF v_id_cliente IS NULL AND p_payload->>'documento' IS NOT NULL AND p_payload->>'documento' <> '' THEN
    v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));
    SELECT id_clientes INTO v_id_cliente
      FROM "RetificaPremium"."Clientes"
     WHERE documento = v_documento_limpo AND fk_criado_por = v_usuario_id;
  END IF;

  v_tipo_doc := upper(trim(coalesce(p_payload->>'tipo_documento', '')));

  IF v_id_cliente IS NOT NULL THEN
    -- UPDATE
    IF p_payload->>'documento' IS NOT NULL AND p_payload->>'documento' <> '' THEN
      v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));
    END IF;

    UPDATE "RetificaPremium"."Clientes"
       SET nome          = CASE WHEN p_payload ? 'nome' THEN initcap(trim(p_payload->>'nome')) ELSE nome END,
           documento     = coalesce(v_documento_limpo, documento),
           tipo_documento = CASE WHEN v_tipo_doc <> '' THEN v_tipo_doc::"RetificaPremium"."tipo_documento" ELSE tipo_documento END,
           status        = coalesce((p_payload->>'status')::boolean, status),
           observacao    = CASE WHEN p_payload ? 'observacao' THEN nullif(trim(p_payload->>'observacao'), '') ELSE observacao END,
           nome_fantasia = CASE WHEN p_payload ? 'nome_fantasia' THEN nullif(trim(p_payload->>'nome_fantasia'), '') ELSE nome_fantasia END,
           updated_at    = now()
     WHERE id_clientes = v_id_cliente AND fk_criado_por = v_usuario_id;
    v_acao_log := 'cliente_atualizado';
  ELSE
    -- INSERT — validações básicas
    IF p_payload->>'nome' IS NULL OR trim(p_payload->>'nome') = '' THEN
      RAISE EXCEPTION 'O nome do cliente é obrigatório.' USING errcode = 'P0001';
    END IF;
    IF p_payload->>'documento' IS NULL OR trim(p_payload->>'documento') = '' THEN
      RAISE EXCEPTION 'O documento é obrigatório.' USING errcode = 'P0002';
    END IF;
    IF v_tipo_doc = '' THEN
      RAISE EXCEPTION 'O tipo de documento é obrigatório.' USING errcode = 'P0003';
    END IF;

    v_documento_limpo := upper(regexp_replace(p_payload->>'documento', '[^a-zA-Z0-9]', '', 'g'));

    IF v_tipo_doc = 'CPF' AND length(v_documento_limpo) != 11 THEN
      RAISE EXCEPTION 'CPF deve conter 11 dígitos.' USING errcode = 'P0005';
    END IF;
    IF v_tipo_doc = 'CNPJ' AND length(v_documento_limpo) != 14 THEN
      RAISE EXCEPTION 'CNPJ deve conter 14 dígitos.' USING errcode = 'P0006';
    END IF;

    INSERT INTO "RetificaPremium"."Clientes"
      (nome, documento, tipo_documento, status, observacao, nome_fantasia, fk_criado_por)
    VALUES (
      initcap(trim(p_payload->>'nome')),
      v_documento_limpo,
      v_tipo_doc::"RetificaPremium"."tipo_documento",
      coalesce((p_payload->>'status')::boolean, true),
      nullif(trim(coalesce(p_payload->>'observacao', '')), ''),
      nullif(trim(coalesce(p_payload->>'nome_fantasia', '')), ''),
      v_usuario_id
    )
    RETURNING id_clientes INTO v_id_cliente;
    v_acao_log := 'cliente_criado';
  END IF;

  -- Endereço
  IF p_payload->'endereco' IS NOT NULL THEN
    SELECT id_enderecos INTO v_id_endereco_existente
      FROM "RetificaPremium"."Enderecos"
     WHERE fk_clientes = v_id_cliente;

    IF v_id_endereco_existente IS NOT NULL THEN
      v_retorno_json := "RetificaPremium".update_endereco(
        v_id_endereco_existente,
        p_payload->'endereco'->>'cep',    p_payload->'endereco'->>'uf',
        p_payload->'endereco'->>'estado', p_payload->'endereco'->>'cidade',
        p_payload->'endereco'->>'bairro', p_payload->'endereco'->>'rua',
        p_payload->'endereco'->>'numero'
      );
    ELSE
      v_retorno_json := "RetificaPremium".insert_endereco(
        v_id_cliente,
        p_payload->'endereco'->>'cep',    p_payload->'endereco'->>'uf',
        p_payload->'endereco'->>'estado', p_payload->'endereco'->>'cidade',
        p_payload->'endereco'->>'bairro', p_payload->'endereco'->>'rua',
        p_payload->'endereco'->>'numero'
      );
    END IF;
  END IF;

  -- Contatos
  IF p_payload->'contatos' IS NOT NULL AND jsonb_typeof(p_payload->'contatos') = 'array' THEN
    IF v_acao_log = 'cliente_atualizado' THEN
      DELETE FROM "RetificaPremium"."Contatos"
       WHERE fk_clientes = v_id_cliente AND tipo_contato IN ('telefone', 'email');
    END IF;

    FOR v_contato_item IN SELECT * FROM jsonb_array_elements(p_payload->'contatos') LOOP
      v_retorno_json := "RetificaPremium".insert_contato(
        v_id_cliente,
        v_contato_item->>'contato',
        v_contato_item->>'tipo_contato'
      );
    END LOOP;
  END IF;

  PERFORM "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id, p_sessao_suporte,
    v_acao_log, 'Clientes', v_id_cliente::text,
    'Cliente processado em modo suporte: ' || coalesce(p_payload->>'nome', '')
  );

  RETURN json_build_object('status', 200, 'mensagem', 'Cliente e vínculos processados com sucesso.', 'id_cliente', v_id_cliente);
EXCEPTION
  WHEN sqlstate 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized',    'mensagem', sqlerrm);
  WHEN sqlstate 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden',       'mensagem', sqlerrm);
  WHEN sqlstate 'P2001' THEN RETURN json_build_object('status', 404, 'code', 'not_found',       'mensagem', sqlerrm);
  WHEN sqlstate 'P0001' THEN RETURN json_build_object('status', 400, 'code', 'missing_name',    'mensagem', sqlerrm);
  WHEN sqlstate 'P0002' THEN RETURN json_build_object('status', 400, 'code', 'missing_document','mensagem', sqlerrm);
  WHEN sqlstate 'P0003' THEN RETURN json_build_object('status', 400, 'code', 'missing_doc_type','mensagem', sqlerrm);
  WHEN sqlstate 'P0005' THEN RETURN json_build_object('status', 400, 'code', 'invalid_cpf',     'mensagem', sqlerrm);
  WHEN sqlstate 'P0006' THEN RETURN json_build_object('status', 400, 'code', 'invalid_cnpj',    'mensagem', sqlerrm);
  WHEN unique_violation  THEN RETURN json_build_object('status', 400, 'code', 'duplicate_document', 'mensagem', 'Este CPF/CNPJ já está cadastrado para este usuário.');
  WHEN OTHERS            THEN RETURN json_build_object('status', 500, 'code', sqlstate,          'mensagem', sqlerrm);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. inativar_cliente_contexto_suporte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "RetificaPremium".inativar_cliente_contexto_suporte(
  p_id_clientes          uuid,
  p_contexto_usuario_id  uuid,
  p_sessao_suporte       uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'RetificaPremium', 'public'
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id, p_sessao_suporte
  );

  UPDATE "RetificaPremium"."Clientes"
     SET status = false, updated_at = now()
   WHERE id_clientes = p_id_clientes AND fk_criado_por = v_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado para este usuário.' USING errcode = 'P2001';
  END IF;

  PERFORM "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id, p_sessao_suporte,
    'inativar_cliente', 'Clientes', p_id_clientes::text,
    'Cliente inativado em modo suporte'
  );

  RETURN json_build_object('status', 200, 'mensagem', 'Cliente inativado com sucesso.');
EXCEPTION
  WHEN sqlstate 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  WHEN sqlstate 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden',    'mensagem', sqlerrm);
  WHEN sqlstate 'P2001' THEN RETURN json_build_object('status', 404, 'code', 'not_found',    'mensagem', sqlerrm);
  WHEN OTHERS            THEN RETURN json_build_object('status', 500, 'code', sqlstate,       'mensagem', sqlerrm);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. reativar_cliente_contexto_suporte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "RetificaPremium".reativar_cliente_contexto_suporte(
  p_id_clientes          uuid,
  p_contexto_usuario_id  uuid,
  p_sessao_suporte       uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'RetificaPremium', 'public'
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(
    p_contexto_usuario_id, p_sessao_suporte
  );

  UPDATE "RetificaPremium"."Clientes"
     SET status = true, updated_at = now()
   WHERE id_clientes = p_id_clientes AND fk_criado_por = v_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado para este usuário.' USING errcode = 'P2001';
  END IF;

  PERFORM "RetificaPremium".insert_log_acao_suporte(
    p_contexto_usuario_id, p_sessao_suporte,
    'reativar_cliente', 'Clientes', p_id_clientes::text,
    'Cliente reativado em modo suporte'
  );

  RETURN json_build_object('status', 200, 'mensagem', 'Cliente reativado com sucesso.');
EXCEPTION
  WHEN sqlstate 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', sqlerrm);
  WHEN sqlstate 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden',    'mensagem', sqlerrm);
  WHEN sqlstate 'P2001' THEN RETURN json_build_object('status', 404, 'code', 'not_found',    'mensagem', sqlerrm);
  WHEN OTHERS            THEN RETURN json_build_object('status', 500, 'code', sqlstate,       'mensagem', sqlerrm);
END;
$$;
