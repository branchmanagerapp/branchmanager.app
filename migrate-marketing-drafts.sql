-- migrate-marketing-drafts.sql
-- Phase 2 / draft-only review queue for marketing-automation.
--
-- Replaces the silent autonomous email sends that caused the Basquali
-- triple-email incident on 2026-05-05. Now every cron run stages outbound
-- communications as DRAFTS in this table; Doug reviews + approves in the
-- BM Marketing tab; only then does the draft go out via send-email.

CREATE TABLE IF NOT EXISTS public.marketing_drafts (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,

  -- Source: what triggered this draft
  trigger         TEXT NOT NULL CHECK (trigger IN (
                    'review_request',     -- 24h after job complete
                    'quote_followup_7d',  -- 7d after quote sent + still no response
                    'upsell_30d',         -- 30d after paid invoice
                    'appt_reminder',      -- 16-52h before scheduled job
                    'renewal_reminder',   -- annual recurring service due
                    'custom'              -- any future trigger
                  )),
  source_record_type TEXT,                -- 'job', 'quote', 'invoice', 'request'
  source_record_id   UUID,                -- pointer back to the row that triggered

  -- Recipient
  client_id       UUID,
  client_name     TEXT NOT NULL,
  to_email        TEXT,
  to_phone        TEXT,
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),

  -- Content (rendered, ready to send — no further templating needed at send time)
  subject         TEXT,
  body_text       TEXT NOT NULL,
  body_html       TEXT,

  -- Lifecycle
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending',     -- waiting for Doug's review
                    'approved',    -- Doug clicked Approve, queued for send
                    'sent',        -- send-email succeeded
                    'send_failed', -- send-email returned non-2xx
                    'rejected',    -- Doug clicked Reject (won't send)
                    'expired'      -- auto-dismissed after N days unreviewed
                  )),
  approved_at     TIMESTAMPTZ,
  approved_by     TEXT,            -- email of the user who approved
  sent_at         TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  rejected_reason TEXT,

  -- Dedup metadata (per-trigger, per-client) so the cron doesn't re-stage
  -- the same notification twice.
  dedup_key       TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}'::JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id),
  -- One draft per (tenant, trigger, dedup_key) — cron-safe idempotency
  UNIQUE (tenant_id, trigger, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_tenant_status
  ON public.marketing_drafts (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_drafts_client
  ON public.marketing_drafts (client_id);

-- RLS: tenant-scoped, same pattern as other tables
ALTER TABLE public.marketing_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_full_marketing_drafts" ON public.marketing_drafts;
CREATE POLICY "auth_full_marketing_drafts" ON public.marketing_drafts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_marketing_drafts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_marketing_drafts ON public.marketing_drafts;
CREATE TRIGGER trg_touch_marketing_drafts
  BEFORE UPDATE ON public.marketing_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_drafts_updated_at();

-- Helper view: pending drafts grouped by trigger for the BM "Drafts to Review" tab
CREATE OR REPLACE VIEW public.marketing_drafts_pending AS
SELECT
  d.*,
  AGE(NOW(), d.created_at) AS age,
  c.email AS client_email_on_file,
  c.phone AS client_phone_on_file
FROM public.marketing_drafts d
LEFT JOIN public.clients c ON c.id = d.client_id
WHERE d.status = 'pending'
ORDER BY d.created_at DESC;
