CREATE OR REPLACE FUNCTION "RetificaPremium".get_usuarios(
  p_busca text DEFAULT NULL::text,
  p_acesso text DEFAULT NULL::text,
  p_status boolean DEFAULT NULL::boolean,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_total INT;
  v_dados JSON;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM "RetificaPremium"."Usuarios" u
  WHERE
    (p_status IS NULL OR u."status" = p_status)
    AND (p_acesso IS NULL OR u."acesso"::TEXT = p_acesso)
    AND (p_busca IS NULL
      OR u."nome"  ILIKE '%' || p_busca || '%'
      OR u."email" ILIKE '%' || p_busca || '%'
    );

  SELECT COALESCE(json_agg(r ORDER BY r."nome" ASC), '[]'::json)
  INTO v_dados
  FROM (
    SELECT
      u."id_usuarios",
      u."nome",
      u."email",
      u."telefone",
      u."acesso",
      u."status",
      u."created_at",
      u."ultimo_login",
      CASE
        WHEN m."id_modulos" IS NULL THEN NULL
        ELSE json_build_object(
          'dashboard',        m."dashboard",
          'clientes',         m."clientes",
          'notas_de_entrada', m."notas_de_entrada",
          'kanban',           m."kanban",
          'fechamento',       m."fechamento",
          'nota_fiscal',      m."nota_fiscal",
          'configuracoes',    m."configuracoes",
          'contas_a_pagar',   m."contas_a_pagar",
          'admin',            m."admin"
        )
      END AS "modulos"
    FROM "RetificaPremium"."Usuarios" u
    LEFT JOIN "RetificaPremium"."Modulos" m ON m."fk_usuarios" = u."id_usuarios"
    WHERE
      (p_status IS NULL OR u."status" = p_status)
      AND (p_acesso IS NULL OR u."acesso"::TEXT = p_acesso)
      AND (p_busca IS NULL
        OR u."nome"  ILIKE '%' || p_busca || '%'
        OR u."email" ILIKE '%' || p_busca || '%'
      )
    ORDER BY u."nome" ASC
    LIMIT  COALESCE(p_limite, 50)
    OFFSET COALESCE(p_offset, 0)
  ) r;

  RETURN json_build_object(
    'status', 200, 'mensagem', 'Usuários encontrados.',
    'total', v_total, 'dados', v_dados
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', SQLERRM);
END;
$function$;
