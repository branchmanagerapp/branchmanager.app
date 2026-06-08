-- ═══════════════════════════════════════════════════════════════════════════
-- Move Plaid credentials out of anon-readable tenants.config into a locked
-- tenant_secrets table.  (SECURITY — confirmed live leak 2026-06-07)
--
-- ROOT CAUSE: policy `public_read_tenants_for_branding` makes the whole
-- tenants row (incl. config jsonb) readable by the anon role, so the bundled
-- anon key could read tenants.config.plaid.{client_id,secret} — the production
-- Plaid banking credentials — over the open internet.
--
-- CUTOVER ORDER (do NOT reorder — avoids downtime AND avoids re-leaking):
--   STAGE 1 (this file's first block): create tenant_secrets + RLS + backfill
--           from config.plaid. config.plaid is left in place → nothing breaks.
--   DEPLOY:  supabase functions deploy _shared is implicit; redeploy the fns
--           that import it:
--             supabase functions deploy plaid-save-keys --no-verify-jwt
--             supabase functions deploy plaid-sync-transactions --no-verify-jwt
--             supabase functions deploy plaid-link-token --no-verify-jwt
--             supabase functions deploy plaid-exchange-token --no-verify-jwt
--             supabase functions deploy plaid-webhook --no-verify-jwt
--   ROTATE:  rotate the Plaid Production secret (dashboard.plaid.com) and
--           re-enter it in BM Settings → Advanced → Plaid. AFTER the deploy,
--           plaid-save-keys writes it to tenant_secrets (not config) — no leak.
--   STAGE 2 (second block, run after deploy verified): strip config.plaid.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- STAGE 1 — table + RLS + backfill (safe to run now; no breakage)
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_secrets (
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key        text NOT NULL,                       -- e.g. 'plaid'
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { client_id, secret, env, cursors }
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;

-- anon gets NOTHING. Strip any default grant and add no anon policy.
REVOKE ALL ON public.tenant_secrets FROM anon;

-- Only an owner/admin of the tenant may read its own secrets. Cross-tenant and
-- anon are denied. Writes are service-role only (edge fns) — no write policy.
DROP POLICY IF EXISTS ts_owner_select ON public.tenant_secrets;
CREATE POLICY ts_owner_select ON public.tenant_secrets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = tenant_secrets.tenant_id
      AND ut.role IN ('owner','admin')
  ));

GRANT SELECT ON public.tenant_secrets TO authenticated;  -- RLS still gates rows

-- Backfill: copy each tenant's existing config.plaid blob into tenant_secrets.
INSERT INTO public.tenant_secrets (tenant_id, key, value)
SELECT id, 'plaid', config->'plaid'
FROM public.tenants
WHERE config ? 'plaid' AND jsonb_typeof(config->'plaid') = 'object'
ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify STAGE 1 (run as the SQL editor / owner):
--   SELECT tenant_id, key, (value ? 'secret') AS has_secret,
--          (value ? 'client_id') AS has_client_id
--   FROM public.tenant_secrets;
-- And confirm anon is denied (separate, with ONLY the anon key):
--   curl -s "$URL/rest/v1/tenant_secrets?select=*" -H "apikey:$ANON" -H "Authorization:Bearer $ANON"
--   → expect []  (RLS denies anon)


-- ─────────────────────────────────────────────────────────────────────────
-- STAGE 2 — strip config.plaid (run ONLY after the functions are deployed
--           AND tenant_secrets is confirmed populated; this closes the leak)
-- ─────────────────────────────────────────────────────────────────────────
-- UPDATE public.tenants SET config = config - 'plaid' WHERE config ? 'plaid';
-- NOTIFY pgrst, 'reload schema';
--
-- Verify STAGE 2 (with ONLY the anon key — the leak should be gone):
--   curl -s "$URL/rest/v1/tenants?select=config" -H "apikey:$ANON" -H "Authorization:Bearer $ANON"
--   → no 'plaid' key in any config; only a non-secret { plaid_configured, plaid_env } marker.


-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if something breaks before STAGE 2):
--   -- restore creds back into config from the secret store, then drop the table
--   UPDATE public.tenants t
--   SET config = jsonb_set(t.config, '{plaid}', s.value, true)
--   FROM public.tenant_secrets s
--   WHERE s.tenant_id = t.id AND s.key = 'plaid';
--   DROP TABLE IF EXISTS public.tenant_secrets;
--   NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────────────────
