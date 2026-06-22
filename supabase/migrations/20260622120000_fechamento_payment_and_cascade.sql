-- Peca 2b — pagamento do fechamento + cascata para as O.S.
--
-- Aditivo e reversivel. Adiciona status de pagamento ao Fechamento e RPCs para
-- marcar/estornar pago que cascateiam o recebimento para as O.S. vinculadas
-- (Notas_de_Servico.fk_fechamentos). get_fechamentos passa a retornar o status.
-- Escopo de dono: o fechamento pertence ao usuario cujo cliente o criou
-- (Clientes.fk_criado_por), igual ao filtro do proprio get_fechamentos.
--
-- Aplicar via: supabase db query --linked -f <este arquivo>
--   + supabase migration repair --status applied 20260622120000
-- Rollback no fim do arquivo.

-- 1) Colunas de pagamento no fechamento (idempotente)
ALTER TABLE "RetificaPremium"."Fechamentos"
  ADD COLUMN IF NOT EXISTS "status_pagamento" text NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE "RetificaPremium"."Fechamentos"
  DROP CONSTRAINT IF EXISTS fechamentos_status_pagamento_check;
ALTER TABLE "RetificaPremium"."Fechamentos"
  ADD CONSTRAINT fechamentos_status_pagamento_check CHECK ("status_pagamento" IN ('PENDENTE', 'PAGO'));
ALTER TABLE "RetificaPremium"."Fechamentos" ADD COLUMN IF NOT EXISTS "pago_em" timestamp without time zone;
ALTER TABLE "RetificaPremium"."Fechamentos" ADD COLUMN IF NOT EXISTS "pago_com" text;

-- 2) Marcar fechamento como pago + cascata (so O.S. pendentes vinculadas)
CREATE OR REPLACE FUNCTION "RetificaPremium".marcar_fechamento_pago(
  p_id_fechamentos uuid,
  p_pago_em timestamp without time zone DEFAULT now(),
  p_pago_com text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
DECLARE
  v_usuario_id uuid;
  v_owner uuid;
  v_pago_em timestamp without time zone := COALESCE(p_pago_em, now());
  v_pago_com text := NULLIF(trim(p_pago_com), '');
  v_notas int;
BEGIN
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  SELECT c.fk_criado_por INTO v_owner
  FROM "RetificaPremium"."Fechamentos" f
  JOIN "RetificaPremium"."Clientes" c ON c.id_clientes = f.fk_clientes
  WHERE f.id_fechamentos = p_id_fechamentos;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Fechamento nao encontrado.' USING ERRCODE = 'P0404';
  END IF;
  IF v_owner <> v_usuario_id THEN
    RAISE EXCEPTION 'Sem permissao para este fechamento.' USING ERRCODE = 'P0403';
  END IF;

  UPDATE "RetificaPremium"."Fechamentos"
  SET status_pagamento = 'PAGO', pago_em = v_pago_em, pago_com = v_pago_com, updated_at = now()
  WHERE id_fechamentos = p_id_fechamentos;

  UPDATE "RetificaPremium"."Notas_de_Servico"
  SET payment_status = 'PAGO', pago_em = v_pago_em, pago_com = v_pago_com
  WHERE fk_fechamentos = p_id_fechamentos AND payment_status IS DISTINCT FROM 'PAGO';
  GET DIAGNOSTICS v_notas = ROW_COUNT;

  RETURN json_build_object('status', 200, 'mensagem', 'Fechamento marcado como pago.', 'notas_atualizadas', v_notas);
EXCEPTION
  WHEN SQLSTATE 'P0404' THEN RETURN json_build_object('status', 404, 'code', 'not_found', 'mensagem', SQLERRM);
  WHEN SQLSTATE 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden', 'mensagem', SQLERRM);
  WHEN SQLSTATE 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', SQLERRM);
  WHEN OTHERS THEN RETURN json_build_object('status', 500, 'code', SQLSTATE, 'mensagem', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION "RetificaPremium".marcar_fechamento_pago(uuid, timestamp without time zone, text) FROM public;
GRANT EXECUTE ON FUNCTION "RetificaPremium".marcar_fechamento_pago(uuid, timestamp without time zone, text) TO authenticated, service_role;

-- 3) Estornar pagamento do fechamento (reverte so as O.S. pagas por ESTA cascata)
CREATE OR REPLACE FUNCTION "RetificaPremium".estornar_fechamento_pago(
  p_id_fechamentos uuid
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
DECLARE
  v_usuario_id uuid;
  v_owner uuid;
  v_pago_em timestamp without time zone;
  v_notas int;
BEGIN
  v_usuario_id := "RetificaPremium".require_current_usuario_id();

  SELECT c.fk_criado_por, f.pago_em INTO v_owner, v_pago_em
  FROM "RetificaPremium"."Fechamentos" f
  JOIN "RetificaPremium"."Clientes" c ON c.id_clientes = f.fk_clientes
  WHERE f.id_fechamentos = p_id_fechamentos;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Fechamento nao encontrado.' USING ERRCODE = 'P0404';
  END IF;
  IF v_owner <> v_usuario_id THEN
    RAISE EXCEPTION 'Sem permissao para este fechamento.' USING ERRCODE = 'P0403';
  END IF;

  -- So reverte as O.S. cujo recebimento veio desta cascata (mesmo pago_em do fechamento).
  UPDATE "RetificaPremium"."Notas_de_Servico"
  SET payment_status = 'PENDENTE', pago_em = NULL, pago_com = NULL
  WHERE fk_fechamentos = p_id_fechamentos
    AND payment_status = 'PAGO'
    AND pago_em IS NOT DISTINCT FROM v_pago_em;
  GET DIAGNOSTICS v_notas = ROW_COUNT;

  UPDATE "RetificaPremium"."Fechamentos"
  SET status_pagamento = 'PENDENTE', pago_em = NULL, pago_com = NULL, updated_at = now()
  WHERE id_fechamentos = p_id_fechamentos;

  RETURN json_build_object('status', 200, 'mensagem', 'Pagamento do fechamento estornado.', 'notas_revertidas', v_notas);
EXCEPTION
  WHEN SQLSTATE 'P0404' THEN RETURN json_build_object('status', 404, 'code', 'not_found', 'mensagem', SQLERRM);
  WHEN SQLSTATE 'P0403' THEN RETURN json_build_object('status', 403, 'code', 'forbidden', 'mensagem', SQLERRM);
  WHEN SQLSTATE 'P0401' THEN RETURN json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', SQLERRM);
  WHEN OTHERS THEN RETURN json_build_object('status', 500, 'code', SQLSTATE, 'mensagem', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION "RetificaPremium".estornar_fechamento_pago(uuid) FROM public;
GRANT EXECUTE ON FUNCTION "RetificaPremium".estornar_fechamento_pago(uuid) TO authenticated, service_role;

-- 4) get_fechamentos passa a retornar status_pagamento/pago_em/pago_com (corpo identico + 3 campos)
CREATE OR REPLACE FUNCTION "RetificaPremium".get_fechamentos(p_fk_clientes uuid DEFAULT NULL::uuid, p_periodo text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
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
      f.id_fechamentos, f.mes, f.ano, f.periodo, f.label, f.valor_total,
      f.status_pagamento, f.pago_em, f.pago_com,
      f.versao, f.total_regeneracoes, f.total_edicoes, f.total_downloads,
      f.dados_json, f.pdf_url, f.created_at, f.updated_at,
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
$function$;

-- 4b) variante de suporte tambem retorna o status
CREATE OR REPLACE FUNCTION "RetificaPremium".get_fechamentos_contexto_suporte(p_fk_clientes uuid DEFAULT NULL::uuid, p_periodo text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_offset integer DEFAULT 0, p_contexto_usuario_id uuid DEFAULT NULL::uuid, p_sessao_suporte uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
declare
  v_usuario_id uuid;
  v_total int;
  v_dados json;
begin
  v_usuario_id := "RetificaPremium".resolve_suporte_contexto_usuario_id(p_contexto_usuario_id, p_sessao_suporte);

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
      f.id_fechamentos, f.mes, f.ano, f.periodo, f.label, f.valor_total,
      f.status_pagamento, f.pago_em, f.pago_com,
      f.versao, f.total_regeneracoes, f.total_edicoes, f.total_downloads,
      f.dados_json, f.pdf_url, f.created_at, f.updated_at,
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
$function$;

-- ============================ ROLLBACK ============================
-- DROP FUNCTION IF EXISTS "RetificaPremium".marcar_fechamento_pago(uuid, timestamp without time zone, text);
-- DROP FUNCTION IF EXISTS "RetificaPremium".estornar_fechamento_pago(uuid);
-- Recriar get_fechamentos / get_fechamentos_contexto_suporte sem os campos
--   status_pagamento/pago_em/pago_com (versao anterior).
-- ALTER TABLE "RetificaPremium"."Fechamentos" DROP CONSTRAINT IF EXISTS fechamentos_status_pagamento_check;
-- ALTER TABLE "RetificaPremium"."Fechamentos" DROP COLUMN IF EXISTS "status_pagamento";
-- ALTER TABLE "RetificaPremium"."Fechamentos" DROP COLUMN IF EXISTS "pago_em";
-- ALTER TABLE "RetificaPremium"."Fechamentos" DROP COLUMN IF EXISTS "pago_com";
