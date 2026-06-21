-- Fase 2 (DRE) — classe contabil nas categorias de Contas a Pagar.
--
-- Aditivo e reversivel. Adiciona a coluna `classe` (CUSTO/DESPESA/IMPOSTO/FINANCEIRO),
-- faz backfill por nome das categorias existentes e estende get_categorias_conta_pagar
-- para retornar `classe`. NAO altera insert/update (write-path/UI de classificacao fica
-- para um proximo passo). Rollback documentado no fim do arquivo.
--
-- Aplicado no remoto via: supabase db query --linked -f <este arquivo>
-- e marcado com: supabase migration repair --status applied 20260621183000
-- (supabase db push segue bloqueado por drift historico antigo).

-- 1) Coluna (idempotente)
ALTER TABLE "RetificaPremium"."Categorias_Contas_Pagar"
  ADD COLUMN IF NOT EXISTS "classe" text;

-- 2) Valores validos (idempotente). NULL = ainda nao classificada.
ALTER TABLE "RetificaPremium"."Categorias_Contas_Pagar"
  DROP CONSTRAINT IF EXISTS categorias_contas_pagar_classe_check;
ALTER TABLE "RetificaPremium"."Categorias_Contas_Pagar"
  ADD CONSTRAINT categorias_contas_pagar_classe_check
  CHECK ("classe" IS NULL OR "classe" IN ('CUSTO', 'DESPESA', 'IMPOSTO', 'FINANCEIRO'));

-- 3) Backfill por nome (somente onde ainda esta nulo).
UPDATE "RetificaPremium"."Categorias_Contas_Pagar"
   SET "classe" = 'CUSTO'
 WHERE "classe" IS NULL
   AND (lower("nome") LIKE '%peça%' OR lower("nome") LIKE '%peca%'
        OR lower("nome") LIKE '%material%' OR lower("nome") LIKE '%insumo%'
        OR lower("nome") LIKE '%mão de obra%' OR lower("nome") LIKE '%mao de obra%');

UPDATE "RetificaPremium"."Categorias_Contas_Pagar"
   SET "classe" = 'IMPOSTO'
 WHERE "classe" IS NULL
   AND (lower("nome") LIKE '%imposto%' OR lower("nome") LIKE '%taxa%'
        OR lower("nome") LIKE '%tributo%' OR lower("nome") LIKE '%simples%'
        OR lower("nome") LIKE '%iss%');

UPDATE "RetificaPremium"."Categorias_Contas_Pagar"
   SET "classe" = 'FINANCEIRO'
 WHERE "classe" IS NULL
   AND (lower("nome") LIKE '%juro%' OR lower("nome") LIKE '%multa%'
        OR lower("nome") LIKE '%tarifa%' OR lower("nome") LIKE '%banc%'
        OR lower("nome") LIKE '%financeir%');

-- Resto = DESPESA operacional (default seguro; o usuario reclassifica depois).
UPDATE "RetificaPremium"."Categorias_Contas_Pagar"
   SET "classe" = 'DESPESA'
 WHERE "classe" IS NULL;

-- 4) get_categorias_conta_pagar passa a retornar `classe` (corpo identico + a coluna).
CREATE OR REPLACE FUNCTION "RetificaPremium".get_categorias_conta_pagar(p_ativo boolean DEFAULT NULL::boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'RetificaPremium', 'public'
AS $function$
DECLARE
  v_dados JSON;
BEGIN

  SELECT COALESCE(json_agg(r ORDER BY r."nome" ASC), '[]'::json)
  INTO v_dados
  FROM (
    SELECT "id_categorias", "nome", "cor", "icone", "ativo", "classe", "created_at"
    FROM "RetificaPremium"."Categorias_Contas_Pagar"
    WHERE (p_ativo IS NULL OR "ativo" = p_ativo)
    ORDER BY "nome" ASC
  ) r;

  RETURN json_build_object('status', 200, 'mensagem', 'Categorias encontradas.', 'dados', v_dados);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', SQLERRM);
END;
$function$;

-- ============================ ROLLBACK ============================
-- Restaura get_categorias_conta_pagar sem `classe`:
-- CREATE OR REPLACE FUNCTION "RetificaPremium".get_categorias_conta_pagar(p_ativo boolean DEFAULT NULL::boolean)
--  RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'RetificaPremium', 'public'
-- AS $function$
-- DECLARE v_dados JSON;
-- BEGIN
--   SELECT COALESCE(json_agg(r ORDER BY r."nome" ASC), '[]'::json) INTO v_dados
--   FROM (SELECT "id_categorias","nome","cor","icone","ativo","created_at"
--         FROM "RetificaPremium"."Categorias_Contas_Pagar"
--         WHERE (p_ativo IS NULL OR "ativo" = p_ativo) ORDER BY "nome" ASC) r;
--   RETURN json_build_object('status',200,'mensagem','Categorias encontradas.','dados',v_dados);
-- EXCEPTION WHEN OTHERS THEN RETURN json_build_object('status',500,'code','unknown_error','mensagem',SQLERRM);
-- END; $function$;
-- ALTER TABLE "RetificaPremium"."Categorias_Contas_Pagar" DROP CONSTRAINT IF EXISTS categorias_contas_pagar_classe_check;
-- ALTER TABLE "RetificaPremium"."Categorias_Contas_Pagar" DROP COLUMN IF EXISTS "classe";
