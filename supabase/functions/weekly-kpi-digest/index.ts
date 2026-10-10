// weekly-kpi-digest — once per week, emails the TENANT OWNER ONLY a brief
// KPI summary for the prior 7 days. Customers receive nothing from this
// function. Pattern mirrors marketing-daily-summary (same owner-only
// recipient guard, same dedup, same kill switch).
//
// SAFETY CONSTRAINTS — every one of these MUST hold for a send to occur:
//
//   1. RECIPIENT WHITELIST — the only allowed `to` address is the tenant's
//      `tenants.owner_email` (fallback config.company_email). Resolved
//      address must pass /^[^\s@]+@[^\s@]+\.[^\s@]+$/ or function returns
//      400 without sending. No customer email can ever receive this output.
//
//   2. PER-WEEK DEDUP — checks `communications` for a row with
//      metadata.kind='weekly_kpi_digest' for THIS tenant created in the
//      last 6 days. If found, returns 200 {skipped:'already-sent-this-week'}.
//      Re-runs are no-ops.
//
//   3. KILL SWITCH — env var WEEKLY_KPI_DIGEST_DISABLED=true makes the
//      function a no-op immediately. Set the secret to disable with zero
//      code change.
//
//   4. CONTENT IS NUMERIC — counts, dollar totals, and percentages only.
//      No per-customer PII, no quote/invoice text, just aggregates +
//      a "View in BM" link. Safe to forward.
//
// Deploy: supabase functions deploy weekly-kpi-digest --no-verify-jwt
//
// Schedule (DOUG MUST OPT IN — do NOT auto-schedule per memory rule):
//   pg_cron job, 'weekly-kpi-digest', '0 12 * * 1' (Mon 7am ET / 8am DST)
//   SELECT cron.schedule('weekly-kpi-digest', '0 12 * * 1',
//     $$ SELECT net.http_post(url:='https://ltpivkqahvplapyagljt.supabase.co/functions/v1/weekly-kpi-digest',
//        headers:='{"Content-Type":"application/json"}'::jsonb,
//        body:='{}'::jsonb) $$);
//
// Manual test: curl -X POST https://ltpivkqahvplapyagljt.supabase.co/functions/v1/weekly-kpi-digest

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY        = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL_ENV = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const DISABLED              = (Deno.env.get("WEEKLY_KPI_DIGEST_DISABLED") || "").toLowerCase() === "true";

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
  return "$" + v.toLocaleString();
}

function diffPct(now: number, prev: number): string {
  if (!prev) return now > 0 ? "+∞%" : "—";
  const d = ((now - prev) / prev) * 100;
  const sign = d >= 0 ? "+" : "";
  return sign + Math.round(d) + "%";
}

async function digestForTenant(t: any, dryRun: boolean) {
  const tid: string = t.id;
  const ownerEmail: string = (t.owner_email || t.config?.company_email || "").trim().toLowerCase();
  const fromEmail: string  = RESEND_FROM_EMAIL_ENV || (t.config?.from_email) || "Branch Manager <noreply@branchmanager.app>";
  const companyName: string = t.config?.company_name || t.name || "your business";

  // Hard guard #1 — owner email must be on file
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return { tenant: tid, skipped: "no-owner-email-on-file" };
  }

  // Hard guard #2 — per-week dedup
  if (!dryRun) {
    const { data: alreadyThisWeek } = await sb
      .from("communications")
      .select("id")
      .eq("tenant_id", tid)
      .filter("metadata->>kind", "eq", "weekly_kpi_digest")
      .gte("created_at", new Date(Date.now() - 6 * 86400 * 1000).toISOString())
      .limit(1);
    if (alreadyThisWeek && alreadyThisWeek.length) {
      return { tenant: tid, skipped: "already-sent-this-week" };
    }
  }

  // Date windows: this week = last 7 days, last week = the 7 before
  const now = Date.now();
  const week1Start = new Date(now - 7  * 86400 * 1000).toISOString();
  const week2Start = new Date(now - 14 * 86400 * 1000).toISOString();
  const weekEnd    = new Date(now).toISOString();

  // ── Jobs completed (this week vs last week)
  const [{ data: jobsW1 }, { data: jobsW2 }] = await Promise.all([
    sb.from("jobs").select("id,total,status,completed_at").eq("tenant_id", tid)
      .eq("status", "completed").gte("completed_at", week1Start).lt("completed_at", weekEnd),
    sb.from("jobs").select("id,total,status,completed_at").eq("tenant_id", tid)
      .eq("status", "completed").gte("completed_at", week2Start).lt("completed_at", week1Start),
  ]);
  const jobsCompletedW1 = (jobsW1 || []).length;
  const jobsCompletedW2 = (jobsW2 || []).length;

  // ── Revenue (paid invoices in window — falls back to invoice.total when
  // there's no paid_at column)
  const [{ data: paidW1 }, { data: paidW2 }] = await Promise.all([
    sb.from("invoices").select("id,total,paid_at,status").eq("tenant_id", tid)
      .eq("status", "paid").gte("paid_at", week1Start).lt("paid_at", weekEnd),
    sb.from("invoices").select("id,total,paid_at,status").eq("tenant_id", tid)
      .eq("status", "paid").gte("paid_at", week2Start).lt("paid_at", week1Start),
  ]);
  const revenueW1 = (paidW1 || []).reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
  const revenueW2 = (paidW2 || []).reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);

  // ── Quotes sent + win rate
  const [{ data: quotesSentW1 }, { data: quotesApprovedW1 }] = await Promise.all([
    sb.from("quotes").select("id,sent_at").eq("tenant_id", tid)
      .gte("sent_at", week1Start).lt("sent_at", weekEnd),
    sb.from("quotes").select("id,status,approved_at").eq("tenant_id", tid)
      .in("status", ["approved", "converted"]).gte("approved_at", week1Start).lt("approved_at", weekEnd),
  ]);
  const quotesSentCount = (quotesSentW1 || []).length;
  const quotesWonCount  = (quotesApprovedW1 || []).length;

  // ── New leads (requests created in window)
  const { data: leadsW1 } = await sb
    .from("requests")
    .select("id,created_at")
    .eq("tenant_id", tid)
    .gte("created_at", week1Start)
    .lt("created_at", weekEnd);
  const leadsCount = (leadsW1 || []).length;

  // ── AR aging snapshot (unpaid invoices, all-time)
  const { data: unpaidInv } = await sb
    .from("invoices")
    .select("id,total,due_date,sent_at,created_at,status,balance")
    .eq("tenant_id", tid)
    .in("status", ["sent", "overdue", "partial"]);
  let ar0 = 0, ar30 = 0, ar60 = 0, ar90 = 0;
  (unpaidInv || []).forEach((inv: any) => {
    const anchor = inv.due_date || inv.sent_at || inv.created_at;
    if (!anchor) return;
    const days = Math.floor((now - new Date(anchor).getTime()) / 86400000);
    const bal = Number(inv.balance) || Number(inv.total) || 0;
    if (days > 90)      ar90 += bal;
    else if (days > 60) ar60 += bal;
    else if (days > 30) ar30 += bal;
    else                ar0  += bal;
  });
  const arTotal = ar0 + ar30 + ar60 + ar90;

  // Build the email body — kept short, numeric-only, no PII
  const revChange = diffPct(revenueW1, revenueW2);
  const jobsChange = diffPct(jobsCompletedW1, jobsCompletedW2);

  const subject = `BM Weekly KPI · ${money(revenueW1)} · ${jobsCompletedW1} jobs`;

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff;">
  <div style="background:linear-gradient(135deg,#065f46,#16a34a);color:#fff;border-radius:12px;padding:20px;margin-bottom:18px;">
    <div style="font-size:13px;opacity:.9;letter-spacing:.08em;text-transform:uppercase;">${companyName} · Weekly KPI</div>
    <div style="font-size:24px;font-weight:800;margin-top:4px;">${money(revenueW1)} <span style="font-size:14px;font-weight:500;opacity:.85;">(${revChange} vs prev week)</span></div>
    <div style="font-size:13px;opacity:.9;margin-top:4px;">${jobsCompletedW1} jobs completed (${jobsChange}) · ${quotesSentCount} quotes sent · ${leadsCount} new leads</div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">Revenue (paid this week)</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${money(revenueW1)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">Prior week</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#888;">${money(revenueW2)}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">Jobs completed</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${jobsCompletedW1} (was ${jobsCompletedW2})</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">Quotes sent</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${quotesSentCount}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">Quotes approved (this week)</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#15803d;">${quotesWonCount}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;">New leads</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${leadsCount}</td></tr>
  </table>

  <div style="background:#fafafa;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">AR aging</div>
    <div style="font-size:13px;color:#1a1a1a;line-height:1.7;">
      <span style="display:inline-block;width:14px;height:8px;background:#15803d;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>0–30d &nbsp;<b>${money(ar0)}</b><br>
      <span style="display:inline-block;width:14px;height:8px;background:#ca8a04;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>31–60d &nbsp;<b>${money(ar30)}</b><br>
      <span style="display:inline-block;width:14px;height:8px;background:#c2410c;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>61–90d &nbsp;<b>${money(ar60)}</b><br>
      <span style="display:inline-block;width:14px;height:8px;background:#991b1b;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>90+d &nbsp;<b style="color:#991b1b;">${money(ar90)}</b><br>
      <div style="margin-top:8px;border-top:1px dashed #ddd;padding-top:6px;"><b>Total outstanding: ${money(arTotal)}</b></div>
    </div>
  </div>

  <div style="text-align:center;margin-top:16px;">
    <a href="https://branchmanager.app/#reports" style="display:inline-block;background:#065f46;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View full Reports →</a>
  </div>

  <div style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:12px;line-height:1.5;">
    Auto-generated weekly summary from Branch Manager. To disable, set the WEEKLY_KPI_DIGEST_DISABLED secret to true, or remove the pg_cron schedule.
  </div>
</body></html>`;

  if (dryRun) {
    return {
      tenant: tid,
      to: ownerEmail,
      subject,
      stats: { jobsCompletedW1, jobsCompletedW2, revenueW1, revenueW2, quotesSentCount, quotesWonCount, leadsCount, ar0, ar30, ar60, ar90 }
    };
  }

  if (!RESEND_API_KEY) {
    return { tenant: tid, skipped: "no-resend-key" };
  }

  // Send via Resend
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [ownerEmail],
      subject,
      html
    })
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { tenant: tid, error: result.message || `Resend ${resp.status}` };
  }

  // Log to communications for dedup + audit
  await sb.from("communications").insert({
    tenant_id: tid,
    type: "email",
    direction: "outbound",
    to_email: ownerEmail,
    subject,
    body: `Weekly KPI digest · ${money(revenueW1)} · ${jobsCompletedW1} jobs`,
    source: "weekly-kpi-digest",
    metadata: { kind: "weekly_kpi_digest", resend_id: result.id, week_start: week1Start }
  });

  return { tenant: tid, sent: true, to: ownerEmail, resend_id: result.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (DISABLED) return json({ ok: true, skipped: "WEEKLY_KPI_DIGEST_DISABLED=true" });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const onlyTenant = url.searchParams.get("tenant");

  // Pull tenants (no status column — all rows are "live" tenants)
  let tenantsQ = sb.from("tenants").select("id,name,owner_email,config");
  if (onlyTenant) tenantsQ = tenantsQ.eq("id", onlyTenant);
  const { data: tenants, error: tenantsErr } = await tenantsQ;
  if (tenantsErr) return json({ error: tenantsErr.message }, 500);
  if (!tenants || !tenants.length) return json({ ok: true, results: [] });

  const results = [];
  for (const t of tenants) {
    try {
      const r = await digestForTenant(t, dryRun);
      results.push(r);
    } catch (e) {
      results.push({ tenant: t.id, error: (e as Error).message });
    }
  }

  return json({ ok: true, dryRun, results });
});
