-- ─────────────────────────────────────────────────────────────────────────────
-- calendar_events — non-job calendar items: time off, personal / day-rate days,
-- notes. Lets the Schedule page show things like "Catherine — Prague" or
-- "Braxton — day-rate job" alongside scheduled jobs. Cloud-backed so it syncs
-- across devices (unlike the old localStorage reminders).
--
-- RLS: tenant-scoped via public.current_tenant_id() (JWT/header → tenant_id),
-- same pattern as receptionist_calls / onboarding_signatures. Never anon.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'note',   -- time_off | personal | note
  title       text NOT NULL,
  person      text,                           -- 'Catherine', 'Braxton', 'Doug', …
  start_date  date NOT NULL,
  end_date    date,                           -- null = single day
  all_day     boolean NOT NULL DEFAULT true,
  color       text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_events_tenant_date_idx
  ON public.calendar_events (tenant_id, start_date);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ce_tenant_all ON public.calendar_events;
CREATE POLICY ce_tenant_all ON public.calendar_events
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;

-- ── Seed the known 2026 items for Second Nature (explicit tenant_id because the
--    SQL editor runs without a tenant JWT, so current_tenant_id() is null here).
INSERT INTO public.calendar_events (tenant_id, type, title, person, start_date, end_date, color)
VALUES
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'time_off', 'Prague',          'Catherine', '2026-06-22', '2026-07-05', '#8e44ad'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'time_off', 'Tokyo',           'Catherine', '2026-07-20', '2026-08-03', '#8e44ad'),
  ('93af4348-8bba-4045-ac3e-5e71ec1cc8c5', 'personal', 'Day-rate jobs',   'Braxton',   '2026-06-09', '2026-06-10', '#e07c24')
ON CONFLICT DO NOTHING;
