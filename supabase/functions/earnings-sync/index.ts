// earnings-sync — builds the crew earnings ledger from real records (v1082).
//
// Idempotent (source_key unique): safe to run any number of times.
//   earned  rows ← time_entries (hours × the member's current rate)
//   payment rows ← payroll_runs with status='paid' (batch_payload per member)
// Commission/bonus/corrections are 'adjustment' rows entered from the app.
//
// Balance per member = earned + adjustments − payments. Surfaced on the
// Payroll page and in the daily digest. Runs on pg_cron daily 09:30 UTC
// (before the 10:00 digest) and can be invoked manually.
//
// Deploy: supabase functions deploy earnings-sync --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("earnings-sync ok", { status: 200 });
  }

  const { data: members, error: mErr } = await sb.from("team_members")
    .select("tenant_id, name, rate, employment_type");
  if (mErr) return new Response(JSON.stringify({ ok: false, error: mErr.message }), { status: 500 });
  const rateOf: Record<string, { rate: number; tenant: string }> = {};
  for (const m of members || []) {
    rateOf[(m.name || "").toLowerCase()] = { rate: +m.rate || 0, tenant: m.tenant_id };
  }

  const { data: entries, error: tErr } = await sb.from("time_entries")
    .select("id, tenant_id, user_name, date, hours, notes");
  if (tErr) return new Response(JSON.stringify({ ok: false, error: tErr.message }), { status: 500 });

  const { data: existing } = await sb.from("earnings_ledger").select("source_key");
  const seen = new Set((existing || []).map((r) => r.source_key));

  const rows: Record<string, unknown>[] = [];
  for (const e of entries || []) {
    const key = "te-" + e.id;
    if (seen.has(key)) continue;
    const m = rateOf[(e.user_name || "").toLowerCase()];
    if (!m || !m.rate || !e.hours) continue; // commission/zero-rate: adjustments only
    rows.push({
      tenant_id: e.tenant_id,
      member_name: e.user_name,
      entry_date: e.date,
      kind: "earned",
      hours: +e.hours,
      rate: m.rate,
      amount: Math.round(+e.hours * m.rate * 100) / 100,
      source: "time_entry",
      source_key: key,
      week_start: weekStartOf(e.date),
      notes: (e.notes || "").slice(0, 200) || null,
    });
  }

  // Payment rows from recorded paid payroll runs (none exist yet — future-proof).
  const { data: runs } = await sb.from("payroll_runs").select("*").eq("status", "paid");
  for (const run of runs || []) {
    const batch = Array.isArray(run.batch_payload) ? run.batch_payload : [];
    for (const b of batch) {
      const name = b.name || b.employee_name || "";
      const gross = +(b.gross ?? b.amount ?? 0);
      if (!name || !gross) continue;
      const key = "run-" + run.id + "-" + name.toLowerCase().replace(/\s+/g, "-");
      if (seen.has(key)) continue;
      rows.push({
        tenant_id: run.tenant_id,
        member_name: name,
        entry_date: (run.week_start || run.created_at || "").slice(0, 10) || null,
        kind: "payment",
        amount: -Math.abs(gross),
        source: "payroll_run",
        source_key: key,
        week_start: run.week_start || null,
        notes: "payroll run " + run.id,
      });
    }
  }

  let inserted = 0;
  if (rows.length) {
    const { error: iErr, count } = await sb.from("earnings_ledger")
      .insert(rows, { count: "exact" });
    if (iErr) return new Response(JSON.stringify({ ok: false, error: iErr.message, attempted: rows.length }), { status: 500 });
    inserted = count ?? rows.length;
  }

  // Per-member balances for the response (handy for digest + debugging)
  const { data: all } = await sb.from("earnings_ledger").select("member_name, amount");
  const bal: Record<string, number> = {};
  for (const r of all || []) bal[r.member_name] = Math.round(((bal[r.member_name] || 0) + +r.amount) * 100) / 100;

  return new Response(JSON.stringify({ ok: true, inserted, balances: bal }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
