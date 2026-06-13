-- Hardening de segurança: fixa search_path em TODAS as funções SECURITY DEFINER
-- do schema RetificaPremium, mitigando "search_path hijacking"
-- (Supabase advisor "Function Search Path Mutable").
--
-- Por que é seguro / behavior-preserving:
--   - `'RetificaPremium', 'public'` replica o search_path que o PostgREST já
--     define por requisição ao chamar RPCs no schema exposto. As funções já
--     qualificam objetos como "RetificaPremium"."Tabela" e usam auth.uid()
--     totalmente qualificado, então o efeito prático é nulo — só impede que um
--     objeto malicioso criado em um schema anterior no search_path seja usado.
--   - Idempotente: pula funções que já fixam search_path.
--   - Atômico: roda num único DO block; se algum ALTER falhar, nada é aplicado.
--
-- Rollback (não recomendado): por função, `ALTER FUNCTION ... RESET search_path;`.
--
-- Observação: aplicado em produção via `supabase db query -f` (o histórico de
-- migrations do projeto está fora de sync com `db push`; este arquivo é o
-- registro versionado da mudança).

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch,
           p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'RetificaPremium'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = %L, %L',
      r.sch, r.fn, r.args, 'RetificaPremium', 'public'
    );
  END LOOP;
END $$;
