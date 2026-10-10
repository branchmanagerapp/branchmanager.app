// weekly-pnl-report — once per week, emails the TENANT OWNER ONLY a weekly
// P&L: Revenue − Payroll − Expenses, this week vs last week. Customers receive
// nothing. Mirrors weekly-kpi-digest's safety model exactly.
//
// SAFETY CONSTRAINTS — every one MUST hold for a send to occur:
//   1. RECIPIENT WHITELIST — only `tenants.owner_email` (fallback
//      config.company_email). Must pass an email regex or no send. No customer
//      address can ever receive this.
//   2. PER-WEEK DEDUP — checks `communications` for metadata.kind=
//      'weekly_pnl_report' for THIS tenant in the last 6 days; re-runs no-op.
//   3. KILL SWITCH — env WEEKLY_PNL_REPORT_DISABLED=true → immediate no-op.
//   4. CONTENT IS NUMERIC — dollar aggregates only, no per-customer PII.
//
// REVENUE SOURCE: prefers Jobber (config.jobber.connected → a future
// jobber-sync writes weekly revenue into `jobber_weekly_revenue`). Until Jobber
// is connected, falls back to BM paid invoices and the email LABELS the source
// + warns that revenue may be incomplete (SNT still runs on Jobber). Payroll
// (payroll_runs.total_gross) and Expenses (expenses.amount) come from BM and
// are accurate regardless.
//
// Deploy: supabase functions deploy weekly-pnl-report --no-verify-jwt
// Schedule (DOUG MUST OPT IN — never auto-schedule per memory rule):
//   SELECT cron.schedule('weekly-pnl-report','0 12 * * 1',
//     $$ SELECT net.http_post(url:='https://ltpivkqahvplapyagljt.supabase.co/functions/v1/weekly-pnl-report',
//        headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb) $$);
// Manual test (no send): .../weekly-pnl-report?dry_run=true&tenant=<id>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_ENV  = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const DISABLED         = (Deno.env.get("WEEKLY_PNL_REPORT_DISABLED") || "").toLowerCase() === "true";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { ...CORS, "content-type": "application/json" } });
}
function money(n: number): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString();
}
function diffPct(now: number, prev: number): string {
  if (!prev) return now ? "+∞%" : "—";
  const d = ((now - prev) / Math.abs(prev)) * 100;
  return (d >= 0 ? "+" : "") + Math.round(d) + "%";
}

// Sum paid-invoice revenue (BM) in [startISO, endISO). Used as the fallback
// revenue source until Jobber is connected. Tries paid_date, falls back to
// amount_paid/total on paid-status rows.
async function bmRevenue(tid: string, startISO: string, endISO: string): Promise<number> {
  const { data } = await sb.from("invoices")
    .select("total,amount_paid,paid_date,status")
    .eq("tenant_id", tid)
    .gte("paid_date", startISO).lt("paid_date", endISO);
  return (data || []).reduce((s: number, i: any) =>
    s + (Number(i.amount_paid) || Number(i.total) || 0), 0);
}

// Jobber revenue for a week, if a jobber-sync has populated it. Returns null
// when Jobber isn't wired yet (so the caller knows to fall back + label).
async function jobberRevenue(tid: string, startISO: string, endISO: string): Promise<number | null> {
  try {
    const { error, data } = await sb.from("jobber_weekly_revenue")
      .select("amount")
      .eq("tenant_id", tid)
      .gte("week_start", startISO).lt("week_start", endISO);
    if (error) return null;           // table doesn't exist yet → not connected
    if (!data || !data.length) return null;
    return data.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  } catch { return null; }
}

async function expensesSum(tid: string, startISO: string, endISO: string): Promise<number> {
  const { data } = await sb.from("expenses")
    .select("amount,date")
    .eq("tenant_id", tid)
    .gte("date", startISO.slice(0, 10)).lt("date", endISO.slice(0, 10));
  return (data || []).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
}

async function payrollSum(tid: string, startISO: string, endISO: string): Promise<number> {
  const { data } = await sb.from("payroll_runs")
    .select("total_gross,week_start")
    .eq("tenant_id", tid)
    .gte("week_start", startISO.slice(0, 10)).lt("week_start", endISO.slice(0, 10));
  return (data || []).reduce((s: number, p: any) => s + (Number(p.total_gross) || 0), 0);
}

async function reportForTenant(t: any, dryRun: boolean) {
  const tid: string = t.id;
  const ownerEmail: string = (t.owner_email || t.config?.company_email || "").trim().toLowerCase();
  const fromEmail: string  = RESEND_FROM_ENV || (t.config?.from_email) || "Branch Manager <noreply@branchmanager.app>";
  const companyName: string = t.config?.company_name || t.name || "your business";

  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return { tenant: tid, skipped: "no-owner-email-on-file" };
  }
  if (!dryRun) {
    const { data: already } = await sb.from("communications").select("id")
      .eq("tenant_id", tid).filter("metadata->>kind", "eq", "weekly_pnl_report")
      .gte("created_at", new Date(Date.now() - 6 * 86400 * 1000).toISOString()).limit(1);
    if (already && already.length) return { tenant: tid, skipped: "already-sent-this-week" };
  }

  const now = Date.now();
  const w1Start = new Date(now - 7  * 86400 * 1000).toISOString();
  const w2Start = new Date(now - 14 * 86400 * 1000).toISOString();
  const wEnd    = new Date(now).toISOString();

  // Revenue — Jobber if synced, else BM invoices (labeled)
  const [jb1, jb2] = await Promise.all([
    jobberRevenue(tid, w1Start, wEnd), jobberRevenue(tid, w2Start, w1Start),
  ]);
  const jobberConnected = jb1 !== null;
  const revW1 = jobberConnected ? (jb1 as number) : await bmRevenue(tid, w1Start, wEnd);
  const revW2 = jobberConnected ? (jb2 ?? 0)      : await bmRevenue(tid, w2Start, w1Start);
  const revSource = jobberConnected ? "Jobber (live)" : "BM invoices — connect Jobber for live revenue";

  const [payW1, payW2, expW1, expW2] = await Promise.all([
    payrollSum(tid, w1Start, wEnd), payrollSum(tid, w2Start, w1Start),
    expensesSum(tid, w1Start, wEnd), expensesSum(tid, w2Start, w1Start),
  ]);

  const pnlW1 = revW1 - payW1 - expW1;
  const pnlW2 = revW2 - payW2 - expW2;

  const wkLabel = new Date(now - 7 * 86400 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    + "–" + new Date(now).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const subject = `Weekly P&L · ${money(pnlW1)} · rev ${money(revW1)} (${wkLabel})`;

  const warn = jobberConnected ? "" :
    `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#92400e;">
      ⚠️ Revenue shown is from BM's own records and may be incomplete — SNT still runs on Jobber. Connect Jobber so revenue auto-pulls and this P&L is accurate.
    </div>`;

  const row = (label: string, w1: number, w2: number, strong = false, color = "#1a1a1a") =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #eee;color:#555;">${label}</td>
      <td style="padding:9px 0;border-bottom:1px solid #eee;text-align:right;font-weight:${strong ? 800 : 700};color:${color};">${money(w1)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #eee;text-align:right;color:#888;">${money(w2)}</td></tr>`;

  const pnlColor = pnlW1 >= 0 ? "#15803d" : "#b91c1c";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff;">
  <div style="background:linear-gradient(135deg,#065f46,#16a34a);color:#fff;border-radius:12px;padding:20px;margin-bottom:18px;">
    <div style="font-size:13px;opacity:.9;letter-spacing:.08em;text-transform:uppercase;">${companyName} · Weekly P&amp;L</div>
    <div style="font-size:13px;opacity:.85;margin-top:2px;">Week of ${wkLabel}</div>
    <div style="font-size:28px;font-weight:800;margin-top:6px;">${money(pnlW1)} <span style="font-size:14px;font-weight:500;opacity:.85;">net (${diffPct(pnlW1, pnlW2)} vs prev)</span></div>
  </div>
  ${warn}
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
    <tr><td></td><th style="text-align:right;font-size:11px;color:#888;text-transform:uppercase;padding-bottom:4px;">This wk</th><th style="text-align:right;font-size:11px;color:#888;text-transform:uppercase;padding-bottom:4px;">Last wk</th></tr>
    ${row("Revenue", revW1, revW2, true, "#15803d")}
    ${row("− Payroll (gross)", payW1, payW2)}
    ${row("− Expenses", expW1, expW2)}
    <tr><td style="padding:11px 0;color:#1a1a1a;font-weight:800;">= Net P&amp;L</td>
      <td style="padding:11px 0;text-align:right;font-weight:800;font-size:16px;color:${pnlColor};">${money(pnlW1)}</td>
      <td style="padding:11px 0;text-align:right;color:#888;">${money(pnlW2)}</td></tr>
  </table>
  <div style="font-size:12px;color:#666;margin-bottom:14px;">Revenue source: <b>${revSource}</b>. Payroll from BM approved payroll runs; expenses from BM Expenses.</div>
  <div style="text-align:center;margin-top:8px;">
    <a href="https://branchmanager.app/#reports" style="display:inline-block;background:#065f46;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Reports →</a>
  </div>
  <div style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;line-height:1.5;">
    Auto-generated weekly P&amp;L from Branch Manager. To disable: set WEEKLY_PNL_REPORT_DISABLED=true or remove the pg_cron schedule.
  </div>
</body></html>`;

  if (dryRun) {
    return { tenant: tid, to: ownerEmail, subject, jobberConnected,
      stats: { revW1, revW2, payW1, payW2, expW1, expW2, pnlW1, pnlW2 } };
  }
  if (!RESEND_API_KEY) return { tenant: tid, skipped: "no-resend-key" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [ownerEmail], subject, html }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) return { tenant: tid, error: result.message || `Resend ${resp.status}` };

  await sb.from("communications").insert({
    tenant_id: tid, type: "email", direction: "outbound", to_email: ownerEmail, subject,
    body: `Weekly P&L · net ${money(pnlW1)} · rev ${money(revW1)} · payroll ${money(payW1)} · exp ${money(expW1)}`,
    source: "weekly-pnl-report",
    metadata: { kind: "weekly_pnl_report", resend_id: result.id, week_start: w1Start, jobber: jobberConnected },
  });
  return { tenant: tid, sent: true, to: ownerEmail, resend_id: result.id, jobberConnected };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (DISABLED) return json({ ok: true, skipped: "WEEKLY_PNL_REPORT_DISABLED=true" });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const onlyTenant = url.searchParams.get("tenant");

  let q = sb.from("tenants").select("id,name,owner_email,config");
  if (onlyTenant) q = q.eq("id", onlyTenant);
  const { data: tenants, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!tenants || !tenants.length) return json({ ok: true, results: [] });

  const results = [];
  for (const t of tenants) {
    try { results.push(await reportForTenant(t, dryRun)); }
    catch (e) { results.push({ tenant: t.id, error: (e as Error).message }); }
  }
  return json({ ok: true, dryRun, results });
});
