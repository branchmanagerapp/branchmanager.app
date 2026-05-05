-- ════════════════════════════════════════════════════════════════════════
-- compliance_documents — single source of truth for license/cert/policy
-- expirations across all of BM's tenants. Replaces the localStorage-only
-- bm-ins-policies array used by the Insurance page (which lived in a single
-- browser and got lost on cache clear / device switch).
--
-- Tracks: WC + DBL + GL + Auto/Comm Liability, Pesticide Cert (NY DEC),
-- TCIA + ISA membership, USDOT/MCS-150, NY DOS biennial, vehicle reg,
-- driver's license, and any future cert with an expiration date.
--
-- Daily cron computes status (active / expiring_soon / expired) and the
-- marketing-automation edge fn fires renewal-reminder emails.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,

  -- What kind of document. Keep flexible; not an enum so future kinds
  -- don't require a migration.
  kind          text NOT NULL,
    -- Common values:
    --   'wc_policy', 'db_policy', 'pfl_policy',
    --   'general_liability', 'auto_liability', 'umbrella',
    --   'pesticide_cert', 'tcia_member', 'isa_member',
    --   'usdot_registration', 'mcs150_biennial',
    --   'dos_biennial', 'sales_tax_cert',
    --   'vehicle_registration', 'vehicle_inspection',
    --   'driver_license', 'cdl', 'dot_medical_card',
    --   'osha_z133_training', 'first_aid_cpr_cert',
    --   'business_license_local', 'home_improvement_contractor'

  number        text,                -- "WC-32079-H19", "PC-7932", etc.
  issuer        text,                -- "NYSIF", "NY DEC", "FMCSA", "TCIA"
  holder_name   text,                -- person's name for DL/CDL/medical card

  -- Dates
  issued_date   date,
  effective_date date,                -- when coverage starts (insurance)
  expires_date  date,                -- the one we monitor

  -- Renewal logistics
  renewal_url   text,                -- direct deep link to issuer renewal portal
  renewal_lead_days int DEFAULT 30,  -- how many days before expiry to start nagging

  -- Storage of the actual scan / PDF (Supabase Storage path)
  doc_url       text,
  doc_size_bytes int,

  -- Optional links to other tenant resources
  vehicle_id    uuid,                -- for vehicle reg/inspection
  team_member_id uuid,               -- for DL/CDL/medical card

  notes         text,
  active        boolean NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS compliance_documents_tenant_idx ON compliance_documents(tenant_id);
CREATE INDEX IF NOT EXISTS compliance_documents_expires_idx ON compliance_documents(expires_date) WHERE active = true;
CREATE INDEX IF NOT EXISTS compliance_documents_kind_idx ON compliance_documents(tenant_id, kind);
CREATE INDEX IF NOT EXISTS compliance_documents_vehicle_idx ON compliance_documents(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION compliance_documents_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compliance_documents_updated_at_trigger ON compliance_documents;
CREATE TRIGGER compliance_documents_updated_at_trigger
  BEFORE UPDATE ON compliance_documents
  FOR EACH ROW EXECUTE FUNCTION compliance_documents_set_updated_at();

-- RLS — tenant-scoped, identical pattern to other multi-tenant tables
ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON compliance_documents;
DROP POLICY IF EXISTS tenant_isolation_write ON compliance_documents;
CREATE POLICY tenant_isolation_select ON compliance_documents
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation_write ON compliance_documents
  FOR ALL USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Computed status view — active / expiring_soon / expired
-- (read-only, no maintenance needed; recalculates on every query)
CREATE OR REPLACE VIEW compliance_documents_with_status AS
SELECT
  *,
  CASE
    WHEN NOT active THEN 'archived'
    WHEN expires_date IS NULL THEN 'no_expiry'
    WHEN expires_date < CURRENT_DATE THEN 'expired'
    WHEN expires_date < CURRENT_DATE + (renewal_lead_days || ' days')::interval THEN 'expiring_soon'
    ELSE 'active'
  END AS status,
  CASE
    WHEN expires_date IS NULL THEN NULL
    ELSE (expires_date - CURRENT_DATE)::int
  END AS days_until_expiry
FROM compliance_documents;

-- Inherit RLS from base table (Postgres view security_invoker)
ALTER VIEW compliance_documents_with_status SET (security_invoker = on);

-- ════════════════════════════════════════════════════════════════════════
-- SEED — Second Nature Tree LLC compliance docs from memory.
-- Numbers are known; expiration dates are NULL (Doug fills in via UI).
-- Idempotent: ON CONFLICT skip if (tenant_id, kind, number) already exists.
-- ════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS compliance_documents_tenant_kind_number_uniq
  ON compliance_documents(tenant_id, kind, number)
  WHERE active = true;

-- Tenant: Second Nature Tree (93af4348-8bba-4045-ac3e-5e71ec1cc8c5)
INSERT INTO compliance_documents (tenant_id, kind, number, issuer, renewal_url, notes) VALUES
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'wc_policy', 'W 2477 367-3', 'NYSIF',
    'https://www.nysif.com/', 'Workers Comp policy via NYSIF'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'wc_policy', 'WC-32079-H19', 'NYSIF',
    'https://www.nysif.com/', 'WC Policy ID — Westchester'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'db_policy', 'D701106', 'ShelterPoint',
    'https://www.sslicny.com/', 'NY Statutory Disability Benefits'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'pesticide_cert', 'PC-7932', 'NY DEC',
    'https://www.dec.ny.gov/permits/45675.html', 'NY Pesticide Applicator Cert (3yr w/ CEUs)'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'tcia_member', '222530', 'TCIA',
    'https://www.tcia.org/', 'Tree Care Industry Assoc. membership'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'isa_member', '280064', 'ISA',
    'https://www.isa-arbor.com/', 'Intl Society of Arboriculture membership'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'usdot_registration', '3187854', 'FMCSA',
    'https://safer.fmcsa.dot.gov/', 'US DOT registration'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'mcs150_biennial', '3187854', 'FMCSA',
    'https://www.fmcsa.dot.gov/registration/updating-your-registration', 'MCS-150 biennial update — required every 2yr from USDOT issue date'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'dos_biennial', '5434206', 'NY DOS',
    'https://www.dos.ny.gov/corps/biennial.html', 'NY DOS biennial filing — Second Nature Tree LLC')
ON CONFLICT (tenant_id, kind, number) WHERE active = true DO NOTHING;

-- Vehicle registrations (linked to vehicles table by VIN)
-- We insert one per truck; expires_date is NULL until Doug enters from physical reg.
INSERT INTO compliance_documents (tenant_id, kind, number, issuer, renewal_url, vehicle_id, notes)
SELECT
  v.tenant_id, 'vehicle_registration', v.vin, 'NY DMV',
  'https://dmv.ny.gov/registration/renew-vehicle-registration', v.id,
  v.name || ' — VIN ' || COALESCE(v.vin, '(unknown)')
FROM vehicles v
WHERE v.tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
  AND v.vin IS NOT NULL
ON CONFLICT (tenant_id, kind, number) WHERE active = true DO NOTHING;
