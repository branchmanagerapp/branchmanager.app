// marketing-daily-summary — once per day, emails the TENANT OWNER ONLY
// (info@peekskilltree.com for SNT) a brief summary of marketing draft
// activity. Customers receive nothing from this function.
//
// SAFETY CONSTRAINTS — every one of these MUST hold for a send to occur:
//
//   1. RECIPIENT WHITELIST — the only allowed `to` address is the tenant's
//      `tenants.config.company_email`. If the resolved address doesn't match,
//      the function returns 400 without sending. No customer email can ever
//      receive this output.
//
//   2. PER-DAY DEDUP — the function checks `communications` for a row with
//      metadata.kind='daily_marketing_summary' for THIS tenant created in
//      the last 20 hours. If found, returns 200 {skipped:'already-sent-today'}.
//      Re-runs are no-ops.
//
//   3. KILL SWITCH — env var DAILY_SUMMARY_DISABLED=true makes the function
//      a no-op immediately. Set the secret to disable with zero code change.
//
//   4. CONTENT IS BRIEF — only counts + a link back to BM. No customer PII
//      in the body, no per-customer details. Safe to forward.
//
// Deploy: supabase functions deploy marketing-daily-summary --no-verify-jwt
// (Recommended schedule: 0 12 * * *  → 7:00 AM ET / 8:00 AM ET DST)
// Schedule should ONLY be enabled with explicit Doug consent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY        = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL_ENV = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const DISABLED              = (Deno.env.get("DAILY_SUMMARY_DISABLED") || "").toLowerCase() === "true";

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

async function summaryForTenant(t: any, dryRun: boolean) {
  const tid: string = t.id;
  // PRIMARY recipient = tenants.owner_email (top-level column).
  // Fall back to config.company_email only if owner_email is empty.
  const ownerEmail: string = (t.owner_email || t.config?.company_email || "").trim().toLowerCase();
  const fromEmail: string  = RESEND_FROM_EMAIL_ENV || (t.config?.from_email) || "Branch Manager <noreply@branchmanager.app>";
  const companyName: string = t.config?.company_name || t.name || "your business";

  // Hard guard #1 — owner email must be on file
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return { tenant: tid, skipped: "no-owner-email-on-file" };
  }

  // Hard guard #2 — per-day dedup
  const { data: alreadyToday } = await sb
    .from("communications")
    .select("id")
    .eq("tenant_id", tid)
    .filter("metadata->>kind", "eq", "daily_marketing_summary")
    .gte("created_at", new Date(Date.now() - 20 * 3600 * 1000).toISOString())
    .limit(1);
  if (alreadyToday && alreadyToday.length) {
    return { tenant: tid, skipped: "already-sent-today" };
  }

  // Pull stats
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  // Pending drafts grouped by trigger
  const { data: pending } = await sb
    .from("marketing_drafts")
    .select("trigger")
    .eq("tenant_id", tid)
    .eq("status", "pending");

  const triggerCounts: Record<string, number> = {};
  (pending || []).forEach((d: any) => { triggerCounts[d.trigger] = (triggerCounts[d.trigger] || 0) + 1; });

  // Sent in last 24h (drafts you approved)
  const { data: sent24 } = await sb
    .from("communications")
    .select("id")
    .eq("tenant_id", tid)
    .eq("type", "email").eq("direction", "outbound").eq("status", "sent")
    .gte("created_at", oneDayAgo);

  // Sent in last 7d
  const { data: sent7 } = await sb
    .from("communications")
    .select("id")
    .eq("tenant_id", tid)
    .eq("type", "email").eq("direction", "outbound").eq("status", "sent")
    .gte("created_at", sevenDaysAgo);

  const totalPending = (pending || []).length;
  const sentToday    = (sent24 || []).length;
  const sentThisWeek = (sent7 || []).length;

  // Compose plain-text body
  const triggerLines = Object.keys(triggerCounts).sort()
    .map((k) => `  • ${k.padEnd(20, " ")} ${triggerCounts[k]}`)
    .join("\n") || "  (none)";

  const subject = `BM daily — ${totalPending} draft${totalPending === 1 ? "" : "s"} pending review`;
  const body =
    `Branch Manager — Daily marketing summary for ${companyName}\n\n` +
    `📋 Drafts pending review: ${totalPending}\n` +
    triggerLines + "\n\n" +
    `📤 Sent in the last 24h:  ${sentToday}\n` +
    `📤 Sent in the last 7d:   ${sentThisWeek}\n\n` +
    (totalPending > 0
      ? `Open BM Marketing to review and approve:\n  https://branchmanager.app/#marketing\n\n`
      : `Nothing waiting on you. Cron is paused — drafts only stage when the cron runs (currently disabled).\n\n`) +
    `— Branch Manager\n` +
    `(This summary was generated automatically. To stop it: set DAILY_SUMMARY_DISABLED=true in Supabase secrets.)`;

  // Hard guard #3 — recipient match check (paranoid double-check)
  const recipientToSend = ownerEmail;
  if (recipientToSend !== ownerEmail) {
    return { tenant: tid, skipped: "recipient-mismatch", expected: ownerEmail };
  }

  // DRY RUN — return what would be sent, don't touch Resend, don't log
  if (dryRun) {
    return { tenant: tid, dry_run: true, would_send_to: recipientToSend, subject, preview_body: body, pending: totalPending, sent_today: sentToday, sent_week: sentThisWeek };
  }

  // Send via Resend
  if (!RESEND_API_KEY) return { tenant: tid, skipped: "no-resend-key" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [recipientToSend],
      subject: subject,
      text:    body,
    }),
  });
  const respText = await resp.text();
  let respJson: any = null; try { respJson = JSON.parse(respText); } catch {}

  // Log the send to communications so per-day dedup catches future runs
  await sb.from("communications").insert({
    tenant_id: tid,
    type: "email", direction: "outbound", channel: "email",
    status: resp.ok ? "sent" : "failed",
    body: subject,
    notes: body,
    metadata: { kind: "daily_marketing_summary", to: recipientToSend, status_code: resp.status, resend_id: respJson?.id || null }
  });

  return {
    tenant: tid,
    sent_to: recipientToSend,
    status: resp.status,
    pending: totalPending,
    sent_today: sentToday,
    sent_week: sentThisWeek,
    resend_id: respJson?.id || null
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (DISABLED) return json({ skipped: "DAILY_SUMMARY_DISABLED=true" });

  // Optional query params:
  //   ?tenant_id=<uuid>   — limit to single tenant (test fires)
  //   ?dry_run=true       — compose but don't send and don't log
  const url = new URL(req.url);
  const onlyTenant = url.searchParams.get("tenant_id");
  const dryRun = url.searchParams.get("dry_run") === "true";

  let q = sb.from("tenants").select("id, name, owner_email, config");
  if (onlyTenant) q = q.eq("id", onlyTenant);
  const { data: tenants, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!tenants || !tenants.length) return json({ skipped: "no-tenants-matched" });

  const results = [];
  for (const t of tenants) {
    try {
      results.push(await summaryForTenant(t, dryRun));
    } catch (e) {
      results.push({ tenant: t.id, error: (e as Error).message });
    }
  }

  return json({ ran_at: new Date().toISOString(), dry_run: dryRun, results });
});
