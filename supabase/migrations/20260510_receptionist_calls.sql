-- BM Receptionist — per-call log table.
--
-- Twilio fires inbound voice webhooks at /functions/v1/bm-receptionist.
-- The edge fn streams audio to Claude via ConversationRelay, captures
-- the qualified lead info, and writes ONE row here per call with the
-- full transcript + Claude's structured output + cost estimate.
--
-- Disposition values:
--   'qualified'   → a real lead, edge fn also inserts a `requests` row
--   'borderline'  → ambiguous, lands in the v759 Leads Center Triage
--                    (also writes a communications row tagged for triage)
--   'junk'        → robocall / wrong number / known spam, dropped silently
--   'voicemail'   → out-of-hours, took a message (body in transcript)
--   'transferred' → AI handed off to Doug (call still in progress)
--
-- Cost columns are recorded for per-call profitability tracking.

BEGIN;

CREATE TABLE IF NOT EXISTS public.receptionist_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  call_sid        text UNIQUE,        -- Twilio CallSid for dedup + correlation
  from_number     text,
  to_number       text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  duration_sec    integer,
  transcript      text,               -- raw concat of caller + AI turns
  turns           jsonb,              -- structured: [{role, text, ts}, ...]
  disposition     text DEFAULT 'in_progress',
  qualified_data  jsonb,              -- { name, address, service, urgency, notes }
  request_id      uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  communication_id uuid REFERENCES public.communications(id) ON DELETE SET NULL,
  cost_estimate   numeric(8,4),       -- USD per the research-doc math
  ai_model        text,
  error           text,               -- non-null when something went wrong
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receptionist_calls_tenant_started_idx
  ON public.receptionist_calls (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS receptionist_calls_disposition_idx
  ON public.receptionist_calls (tenant_id, disposition);

ALTER TABLE public.receptionist_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rc_tenant_all ON public.receptionist_calls;
CREATE POLICY rc_tenant_all ON public.receptionist_calls
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptionist_calls TO authenticated;

COMMIT;
