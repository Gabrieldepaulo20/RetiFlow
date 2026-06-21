-- Fase 2 parte 2 — permite classificar categorias (p_classe) no insert/update.
--
-- Adicionar o parametro p_classe MUDA a assinatura das funcoes, entao e preciso
-- DROP da assinatura antiga + CREATE da nova (senao ficam dois overloads e a
-- resolucao por argumentos nomeados fica ambigua). DROP remove os GRANTs, entao
-- re-concedemos exatamente o ACL atual (authenticated + service_role; revoga public).
--
-- Apenas as variantes NAO-suporte (owner edita em modo normal). As variantes
-- *_contexto_suporte ficam como follow-up; a UI desabilita reclassificacao em modo
-- suporte para nao chamar uma variante sem p_classe.
--
-- Aplicado no remoto via supabase db query --linked -f + migration repair.
-- Bodies originais (para rollback) ao final do arquivo.

-- ===================== insert_categoria_conta_pagar =====================
DROP FUNCTION IF EXISTS "RetificaPremium".insert_categoria_conta_pagar(text, text, text);

CREATE OR REPLACE FUNCTION "RetificaPremium".insert_categoria_conta_pagar(
  p_nome text,
  p_cor text DEFAULT 'bg-gray-100 text-gray-800'::text,
  p_icone text DEFAULT 'MoreHorizontal'::text,
  p_classe text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
DECLARE
  v_id_categorias "RetificaPremium"."Categorias_Contas_Pagar"."id_categorias"%TYPE;
  v_classe text := NULLIF(trim(p_classe), '');
BEGIN
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Erro de parâmetro' USING ERRCODE = 'P0500';
  END IF;
  IF v_classe IS NOT NULL AND v_classe NOT IN ('CUSTO', 'DESPESA', 'IMPOSTO', 'FINANCEIRO') THEN
    RAISE EXCEPTION 'Classe inválida' USING ERRCODE = 'P0512';
  END IF;

  INSERT INTO "RetificaPremium"."Categorias_Contas_Pagar" ("nome", "cor", "icone", "classe")
  VALUES (trim(p_nome), COALESCE(trim(p_cor), 'bg-gray-100 text-gray-800'), COALESCE(trim(p_icone), 'MoreHorizontal'), v_classe)
  RETURNING "id_categorias" INTO v_id_categorias;

  RETURN json_build_object('status', 200, 'mensagem', 'Categoria cadastrada com sucesso.', 'id_categorias', v_id_categorias);

EXCEPTION
  WHEN SQLSTATE 'P0500' THEN RETURN json_build_object('status', 400, 'code', 'missing_nome', 'mensagem', 'O nome da categoria é obrigatório.');
  WHEN SQLSTATE 'P0512' THEN RETURN json_build_object('status', 400, 'code', 'invalid_classe', 'mensagem', 'Classe contábil inválida.');
  WHEN unique_violation   THEN RETURN json_build_object('status', 400, 'code', 'duplicate',   'mensagem', 'Já existe uma categoria com este nome.');
  WHEN OTHERS THEN RETURN json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION "RetificaPremium".insert_categoria_conta_pagar(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION "RetificaPremium".insert_categoria_conta_pagar(text, text, text, text) TO authenticated, service_role;

-- ===================== update_categoria_conta_pagar =====================
DROP FUNCTION IF EXISTS "RetificaPremium".update_categoria_conta_pagar(uuid, text, text, text, boolean);

CREATE OR REPLACE FUNCTION "RetificaPremium".update_categoria_conta_pagar(
  p_id_categorias uuid,
  p_nome text DEFAULT NULL::text,
  p_cor text DEFAULT NULL::text,
  p_icone text DEFAULT NULL::text,
  p_ativo boolean DEFAULT NULL::boolean,
  p_classe text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
DECLARE
  v_classe text := NULLIF(trim(p_classe), '');
BEGIN
  IF p_id_categorias IS NULL THEN
    RAISE EXCEPTION 'ID da categoria é obrigatório.' USING ERRCODE = 'P0510';
  END IF;
  IF v_classe IS NOT NULL AND v_classe NOT IN ('CUSTO', 'DESPESA', 'IMPOSTO', 'FINANCEIRO') THEN
    RAISE EXCEPTION 'Classe inválida' USING ERRCODE = 'P0512';
  END IF;

  UPDATE "RetificaPremium"."Categorias_Contas_Pagar" SET
    "nome"   = COALESCE(NULLIF(trim(p_nome), ''),  "nome"),
    "cor"    = COALESCE(NULLIF(trim(p_cor), ''),   "cor"),
    "icone"  = COALESCE(NULLIF(trim(p_icone), ''), "icone"),
    "ativo"  = COALESCE(p_ativo,                    "ativo"),
    "classe" = COALESCE(v_classe,                   "classe")
  WHERE "id_categorias" = p_id_categorias;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'P0511';
  END IF;

  RETURN json_build_object('status', 200, 'mensagem', 'Categoria atualizada com sucesso.');

EXCEPTION
  WHEN SQLSTATE 'P0510' THEN RETURN json_build_object('status', 400, 'code', 'missing_id', 'mensagem', SQLERRM);
  WHEN SQLSTATE 'P0511' THEN RETURN json_build_object('status', 404, 'code', 'not_found',  'mensagem', SQLERRM);
  WHEN SQLSTATE 'P0512' THEN RETURN json_build_object('status', 400, 'code', 'invalid_classe', 'mensagem', 'Classe contábil inválida.');
  WHEN OTHERS THEN RETURN json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION "RetificaPremium".update_categoria_conta_pagar(uuid, text, text, text, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION "RetificaPremium".update_categoria_conta_pagar(uuid, text, text, text, boolean, text) TO authenticated, service_role;

-- ============================ ROLLBACK ============================
-- DROP FUNCTION IF EXISTS "RetificaPremium".insert_categoria_conta_pagar(text, text, text, text);
-- DROP FUNCTION IF EXISTS "RetificaPremium".update_categoria_conta_pagar(uuid, text, text, text, boolean, text);
-- Recriar as versoes originais (sem p_classe):
--   insert_categoria_conta_pagar(p_nome text, p_cor text DEFAULT 'bg-gray-100 text-gray-800', p_icone text DEFAULT 'MoreHorizontal')
--     INSERT ("nome","cor","icone") VALUES (trim(p_nome), COALESCE(trim(p_cor),'bg-gray-100 text-gray-800'), COALESCE(trim(p_icone),'MoreHorizontal'))
--   update_categoria_conta_pagar(p_id_categorias uuid, p_nome text DEFAULT NULL, p_cor text DEFAULT NULL, p_icone text DEFAULT NULL, p_ativo boolean DEFAULT NULL)
--     UPDATE SET nome/cor/icone/ativo (sem classe)
-- e re-aplicar: GRANT EXECUTE ... TO authenticated, service_role; REVOKE ... FROM public;
