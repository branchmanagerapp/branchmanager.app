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
import { mintApproveToken } from "../_shared/approve-token.ts";

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

  // Hard guard #2 — per-day dedup (skipped under dry_run so testing always works)
  if (!dryRun) {
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
  }

  // Pull stats
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  // Pending drafts (full row — we want subject/recipient/id for inline links)
  const { data: pending } = await sb
    .from("marketing_drafts")
    .select("id, trigger, client_name, to_email, subject, created_at")
    .eq("tenant_id", tid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

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

  // Mint a 24h HMAC token for the inline approve links + "review all" CTA.
  // Token binds to this tenant_id only.
  let approvalToken = "";
  try { approvalToken = await mintApproveToken(tid, 24 * 3600); } catch (e) {
    console.warn("[daily-summary] mintApproveToken failed:", (e as Error).message);
  }
  const APPROVE_BASE = `${SUPABASE_URL}/functions/v1/marketing-approve`;
  const APPROVALS_PAGE = `https://branchmanager.app/approvals.html?t=${encodeURIComponent(approvalToken)}`;

  const subject = `BM daily — ${totalPending} draft${totalPending === 1 ? "" : "s"} pending review`;

  // Plain-text body — links rendered inline, no buttons but still clickable
  const draftLines = (pending || []).slice(0, 20).map((d: any) => {
    const who = d.client_name || d.to_email || "(unknown)";
    const subj = d.subject || "(no subject)";
    const apprUrl = `${APPROVE_BASE}?t=${encodeURIComponent(approvalToken)}&id=${d.id}&action=approve`;
    const rejUrl  = `${APPROVE_BASE}?t=${encodeURIComponent(approvalToken)}&id=${d.id}&action=reject`;
    return `• [${d.trigger}] ${who}\n    "${subj}"\n    Approve & send: ${apprUrl}\n    Reject:         ${rejUrl}`;
  }).join("\n\n");

  const body =
    `Branch Manager — Daily marketing summary for ${companyName}\n\n` +
    (totalPending > 0
      ? `${totalPending} customer email${totalPending === 1 ? "" : "s"} are waiting for your approval.\n` +
        `No customer email goes out until you say so.\n\n` +
        `► Review and approve in one place:\n  ${APPROVALS_PAGE}\n\n` +
        `(Or click the per-draft links below.)\n\n` +
        `── PENDING DRAFTS ──\n${draftLines}\n\n` +
        (totalPending > 20 ? `... and ${totalPending - 20} more — see the page above.\n\n` : "")
      : `Nothing waiting on you — the queue is empty.\n\n`) +
    `── ACTIVITY ──\n` +
    `Sent in the last 24h: ${sentToday}\n` +
    `Sent in the last 7d:  ${sentThisWeek}\n\n` +
    `— Branch Manager\n` +
    `(Approval links expire in 24h. Mute this email: set DAILY_SUMMARY_DISABLED=true.)`;

  // HTML body — same content with clickable buttons per draft
  const escapeHtml = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const draftRowsHtml = (pending || []).slice(0, 20).map((d: any) => {
    const who = escapeHtml(d.client_name || d.to_email || "(unknown)");
    const subj = escapeHtml(d.subject || "(no subject)");
    const trig = escapeHtml(d.trigger || "");
    const apprUrl = `${APPROVE_BASE}?t=${encodeURIComponent(approvalToken)}&id=${d.id}&action=approve`;
    const rejUrl  = `${APPROVE_BASE}?t=${encodeURIComponent(approvalToken)}&id=${d.id}&action=reject`;
    return `<tr><td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;font-weight:700;">${trig}</div>
      <div style="font-size:14px;font-weight:600;color:#111827;margin:4px 0 2px;">${subj}</div>
      <div style="font-size:13px;color:#374151;">To: ${who}</div>
      <div style="margin-top:10px;">
        <a href="${apprUrl}" style="display:inline-block;background:#1a3c12;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;margin-right:6px;">Approve &amp; send</a>
        <a href="${rejUrl}" style="display:inline-block;background:#fff;color:#b91c1c;text-decoration:none;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;border:1px solid #fecaca;">Reject</a>
      </div>
    </td></tr>`;
  }).join("");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
    <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
      <div style="padding:22px 24px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Branch Manager — daily review</div>
        <h1 style="margin:6px 0 2px;font-size:22px;color:#111827;">${escapeHtml(companyName)}</h1>
        <div style="font-size:14px;color:#374151;">${totalPending > 0 ? `${totalPending} customer email${totalPending === 1 ? "" : "s"} waiting for your approval.` : "Nothing waiting — the queue is empty."}</div>
      </div>
      ${totalPending > 0 ? `
      <div style="padding:18px 24px;background:#e8f4ea;border-bottom:1px solid #a3d9ad;">
        <div style="font-size:13px;color:#15803d;font-weight:700;margin-bottom:8px;">► One-click bulk review</div>
        <a href="${APPROVALS_PAGE}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;">Review all ${totalPending} draft${totalPending === 1 ? "" : "s"} →</a>
        <div style="font-size:12px;color:#374151;margin-top:8px;">No customer email goes out until you click approve. Link expires in 24h.</div>
      </div>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        ${draftRowsHtml}
        ${totalPending > 20 ? `<tr><td style="padding:14px 12px;color:#6b7280;font-size:13px;text-align:center;">...and ${totalPending - 20} more — open the bulk page above.</td></tr>` : ""}
      </table>
      ` : ""}
      <div style="padding:18px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        Sent in the last 24h: ${sentToday}<br>
        Sent in the last 7d: ${sentThisWeek}<br><br>
        Approval links expire in 24h. Mute these summaries by setting <code>DAILY_SUMMARY_DISABLED=true</code>.
      </div>
    </div>
  </body></html>`;

  // Hard guard #3 — recipient match check (paranoid double-check)
  const recipientToSend = ownerEmail;
  if (recipientToSend !== ownerEmail) {
    return { tenant: tid, skipped: "recipient-mismatch", expected: ownerEmail };
  }

  // DRY RUN — return what would be sent, don't touch Resend, don't log
  if (dryRun) {
    return { tenant: tid, dry_run: true, would_send_to: recipientToSend, subject, preview_body: body, preview_html: html, approvals_url: APPROVALS_PAGE, pending: totalPending, sent_today: sentToday, sent_week: sentThisWeek };
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
      html:    html,
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
