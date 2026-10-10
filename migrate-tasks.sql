-- migrate-tasks.sql — cloud-sync the Tasks/Reminders module so all devices see the same set.
-- Until v538, TaskReminders saved only to localStorage, so iPhone (Capacitor) and the web
-- browser kept divergent task lists. This adds a real `tasks` table with tenant scoping.

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to text,
  due_date timestamptz,
  priority text DEFAULT 'medium',
  category text,
  recurrence text DEFAULT 'none',
  action_link text,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  notified boolean DEFAULT false,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(tenant_id, completed);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(tenant_id, due_date) WHERE completed = false;

-- RLS: tenant-scoped. Anon role can read/write rows in its own tenant only.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_tenant_select ON tasks;
CREATE POLICY tasks_tenant_select ON tasks FOR SELECT
  USING (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

DROP POLICY IF EXISTS tasks_tenant_insert ON tasks;
CREATE POLICY tasks_tenant_insert ON tasks FOR INSERT
  WITH CHECK (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

DROP POLICY IF EXISTS tasks_tenant_update ON tasks;
CREATE POLICY tasks_tenant_update ON tasks FOR UPDATE
  USING (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid)
  WITH CHECK (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

DROP POLICY IF EXISTS tasks_tenant_delete ON tasks;
CREATE POLICY tasks_tenant_delete ON tasks FOR DELETE
  USING (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

-- Realtime so device A sees device B's writes within ~1s
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
