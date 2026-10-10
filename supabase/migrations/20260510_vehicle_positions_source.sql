-- v741: add `source` column to vehicle_positions so we can tell apart
-- pings pushed by the Bouncie webhook from those backfilled by the
-- bouncie-rest-sync edge function. Useful for debugging webhook gaps
-- and for auditing.
--
-- Default 'bouncie-webhook' preserves the meaning of existing rows
-- (every existing row arrived via the webhook).

BEGIN;

ALTER TABLE public.vehicle_positions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bouncie-webhook';

CREATE INDEX IF NOT EXISTS vehicle_positions_vehicle_ts_idx
  ON public.vehicle_positions (vehicle_id, ts DESC);

COMMIT;
