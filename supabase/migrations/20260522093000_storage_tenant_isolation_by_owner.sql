-- Storage tenant isolation: replace broad "authenticated" policies with owner-scoped policies.
-- Covers buckets: notas, fechamentos, contas-pagar.
-- Strategy: auth users can only access objects where owner = auth.uid().
-- service_role bypasses RLS (Edge Functions still have full access).

DROP POLICY IF EXISTS "auth users can read fechamentos pdf" ON storage.objects;
DROP POLICY IF EXISTS "auth users can upload fechamentos pdf" ON storage.objects;
DROP POLICY IF EXISTS contas_pagar_select_auth ON storage.objects;
DROP POLICY IF EXISTS contas_pagar_insert_auth ON storage.objects;
DROP POLICY IF EXISTS contas_pagar_update_auth ON storage.objects;
DROP POLICY IF EXISTS contas_pagar_delete_auth ON storage.objects;
DROP POLICY IF EXISTS fechamentos_select_auth ON storage.objects;
DROP POLICY IF EXISTS fechamentos_insert_auth ON storage.objects;
DROP POLICY IF EXISTS fechamentos_update_auth ON storage.objects;
DROP POLICY IF EXISTS fechamentos_delete_auth ON storage.objects;
DROP POLICY IF EXISTS notas_select_auth ON storage.objects;
DROP POLICY IF EXISTS notas_insert_auth ON storage.objects;
DROP POLICY IF EXISTS notas_update_auth ON storage.objects;
DROP POLICY IF EXISTS notas_delete_auth ON storage.objects;

-- ── notas ───────────────────────────────────────────────────────
CREATE POLICY notas_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'notas' AND owner = auth.uid());

CREATE POLICY notas_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas' AND owner = auth.uid());

CREATE POLICY notas_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'notas' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'notas' AND owner = auth.uid());

CREATE POLICY notas_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notas' AND owner = auth.uid());

-- ── fechamentos ─────────────────────────────────────────────────
CREATE POLICY fechamentos_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fechamentos' AND owner = auth.uid());

CREATE POLICY fechamentos_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fechamentos' AND owner = auth.uid());

CREATE POLICY fechamentos_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fechamentos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'fechamentos' AND owner = auth.uid());

CREATE POLICY fechamentos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fechamentos' AND owner = auth.uid());

-- ── contas-pagar ────────────────────────────────────────────────
CREATE POLICY contas_pagar_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contas-pagar' AND owner = auth.uid());

CREATE POLICY contas_pagar_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contas-pagar' AND owner = auth.uid());

CREATE POLICY contas_pagar_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'contas-pagar' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'contas-pagar' AND owner = auth.uid());

CREATE POLICY contas_pagar_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contas-pagar' AND owner = auth.uid());
