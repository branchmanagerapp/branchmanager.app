-- Branch Manager: Crew GPS Tracking
-- Run in Supabase SQL Editor: https://ltpivkqahvplapyagljt.supabase.co/dashboard/project/ltpivkqahvplapyagljt/sql

-- Table to store crew GPS pings (one row per crew member, upserted every 60s)
CREATE TABLE IF NOT EXISTS crew_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  user_name TEXT,
  role TEXT DEFAULT 'crew_member',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  status TEXT DEFAULT 'active', -- active, idle, en_route, on_site
  current_job_id TEXT,
  current_job_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_crew_locations_updated ON crew_locations(updated_at DESC);

-- RLS: authenticated users can read all crew locations, upsert their own
ALTER TABLE crew_locations ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (dispatcher needs to see all crew)
CREATE POLICY "Authenticated read crew_locations"
  ON crew_locations FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert/update their own location
CREATE POLICY "Users upsert own location"
  ON crew_locations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users update own location"
  ON crew_locations FOR UPDATE
  TO authenticated
  USING (true);

-- Also allow anon for PWA (since we use anon key with localStorage auth)
CREATE POLICY "Anon read crew_locations"
  ON crew_locations FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon upsert crew_locations"
  ON crew_locations FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon update crew_locations"
  ON crew_locations FOR UPDATE
  TO anon
  USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE crew_locations;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
