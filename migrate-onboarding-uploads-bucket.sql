-- ════════════════════════════════════════════════════════════════════════
-- onboarding-uploads — private Supabase Storage bucket for onboarding
-- artifacts: license photos (s13), I-9 supporting docs (s1 future), counter-
-- signed PDFs, etc.
--
-- Path convention:
--   {tenant_id}/{employee_id_or_session}/{kind}-{timestamp}.{ext}
--
-- Examples:
--   93af4348-.../emp-doug/dl-front-1777940000.jpg
--   93af4348-.../emp-doug/dl-back-1777940001.jpg
--   93af4348-.../emp-doug/i9-ssn-card-1777950000.jpg
--   93af4348-.../emp-doug/wage-theft-signed-1777960000.pdf
--
-- RLS lookup: storage.foldername(name)[1] is the tenant UUID — must match
-- current_tenant_id() from JWT or X-Tenant-ID header.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-uploads',
  'onboarding-uploads',
  false,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS policies on storage.objects scoped to this bucket
-- ─────────────────────────────────────────────────────────────────────────

-- Allow anon role to SELECT files in their tenant's folder
DROP POLICY IF EXISTS "onboarding_uploads_select" ON storage.objects;
CREATE POLICY "onboarding_uploads_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1]::uuid = current_tenant_id()
  );

-- Allow anon role to INSERT files into their tenant's folder
DROP POLICY IF EXISTS "onboarding_uploads_insert" ON storage.objects;
CREATE POLICY "onboarding_uploads_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1]::uuid = current_tenant_id()
  );

-- Allow anon role to UPDATE files in their tenant's folder
-- (rename/replace — cap is 10MB anyway and bucket is private)
DROP POLICY IF EXISTS "onboarding_uploads_update" ON storage.objects;
CREATE POLICY "onboarding_uploads_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1]::uuid = current_tenant_id()
  );

-- Allow anon role to DELETE files in their tenant's folder
-- (employee re-takes a blurry license photo, etc.)
DROP POLICY IF EXISTS "onboarding_uploads_delete" ON storage.objects;
CREATE POLICY "onboarding_uploads_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND (storage.foldername(name))[1]::uuid = current_tenant_id()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- onboarding_uploads metadata table — pairs each file with structured
-- record so BM can query "all DL photos for employee X" without fishing
-- through Storage paths.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  team_member_id uuid,           -- when known (employee record exists)
  session_id    text,            -- for pre-employment uploads, before team_member row exists
  kind          text NOT NULL,   -- 'dl_front', 'dl_back', 'i9_list_a', 'i9_list_b', 'i9_list_c', 'wage_theft_signed_pdf', etc.
  storage_path  text NOT NULL,   -- e.g. '93af4348-.../emp-doug/dl-front-1777940000.jpg'
  mime_type     text,
  size_bytes    bigint,
  ai_extracted  jsonb,           -- structured fields Claude Vision pulled (license_number, expiration, etc.)
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_uploads_tenant_idx ON onboarding_uploads(tenant_id);
CREATE INDEX IF NOT EXISTS onboarding_uploads_team_idx ON onboarding_uploads(team_member_id) WHERE team_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS onboarding_uploads_kind_idx ON onboarding_uploads(tenant_id, kind);

ALTER TABLE onboarding_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON onboarding_uploads;
DROP POLICY IF EXISTS tenant_isolation_write ON onboarding_uploads;
CREATE POLICY tenant_isolation_select ON onboarding_uploads
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_write ON onboarding_uploads
  FOR ALL USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
