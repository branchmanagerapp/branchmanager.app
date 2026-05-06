// Supabase Edge Function — Marketing Automation
//
// Triggers:
//   1. Review request email      — 24h+ after job marked completed
//   2. Quote follow-up email     — 7 days after quote sent with no response
//   3. Upsell email              — 30 days after invoice paid
//   4. Appointment reminder email — day before scheduled job (1–2 days out)
//
// Each trigger is idempotent: checks communications table before sending.
// Wide time windows + alreadySent() dedup = cron can skip runs without missing records.
//
// Deploy:
//   supabase functions deploy marketing-automation --project-ref ltpivkqahvplapyagljt --no-verify-jwt
//
// Schedule via pg_cron (run once from Supabase SQL editor):
//   select cron.schedule('marketing-automation', '0 */4 * * *',
//     $$select net.http_post(
//       'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/marketing-automation',
//       '{}',
//       'application/json'
//     )$$);
//
// Env secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL (optional)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY      = Deno.env.get("RESEND_API_KEY") ?? "";

// Phase 2 — these were hardcoded SNT values. Now loaded per-tenant inside the
// run loop. Kept here as fallbacks if a tenant's config is missing fields.
// SNT default fallback — only fires when tenants.config is missing the value
const FALLBACK_FROM_EMAIL    = Deno.env.get("RESEND_FROM_EMAIL") ?? "Second Nature Tree <onboarding@resend.dev>";
const FALLBACK_REPLY_TO      = "info@peekskilltree.com";
const FALLBACK_REVIEW_URL    = "https://g.page/r/CcVkZHV_EKlEEBM/review";
const FALLBACK_COMPANY_NAME  = "Second Nature Tree Service";
const FALLBACK_COMPANY_PHONE = "(914) 391-5233";
const FALLBACK_OWNER_NAME    = "Owner";
const FALLBACK_ADDRESS       = "Second Nature Tree LLC · 1 Highland Industrial Park, Peekskill, NY 10566";

// Per-tenant context populated per iteration in the main handler.
// Module-level vars so the existing helpers can still see them. The handler
// rewrites these at the start of each tenant iteration.
let TENANT_ID: string        = "";
let FROM_EMAIL: string       = FALLBACK_FROM_EMAIL;
let REPLY_TO: string         = FALLBACK_REPLY_TO;
let GOOGLE_REVIEW_URL: string = FALLBACK_REVIEW_URL;
let COMPANY_NAME: string     = FALLBACK_COMPANY_NAME;
let COMPANY_PHONE: string    = FALLBACK_COMPANY_PHONE;
let OWNER_NAME: string       = FALLBACK_OWNER_NAME;
let COMPANY_ADDRESS: string  = FALLBACK_ADDRESS;

// Toggle individual triggers via Supabase secrets (default: enabled)
const REVIEW_ENABLED         = Deno.env.get("AUTOMATION_REVIEW")         !== "false";
const QUOTE_FOLLOWUP_ENABLED = Deno.env.get("AUTOMATION_QUOTE_FOLLOWUP") !== "false";
const UPSELL_ENABLED         = Deno.env.get("AUTOMATION_UPSELL")         !== "false";
const APPT_REMINDER_ENABLED  = Deno.env.get("AUTOMATION_APPT_REMINDER")  !== "false";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// May 2 2026 — Resend free tier is 100 emails/day. Marketing-automation
// burned through it in one morning run, blocking all transactional sends
// (quote-notify, request-notify, send-email) for the rest of the day.
// Cap automation at 85/day so transactional has 15-email headroom.
const DAILY_AUTOMATION_CAP = 85;

async function checkDailyQuota(): Promise<{ ok: boolean; sent: number }> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await sb
    .from("communications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT_ID)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .gte("created_at", startOfDay.toISOString());
  if (error) { console.warn("quota check failed:", error.message); return { ok: true, sent: 0 }; } // fail-open on read errors
  const sent = count ?? 0;
  return { ok: sent < DAILY_AUTOMATION_CAP, sent };
}

// v603 (2026-05-05): sendEmail() removed. Triggers now stage drafts in
// marketing_drafts for Doug to review + approve in BM Marketing → Drafts to
// Review. Per the never-autonomous-send rule (Basquali incident, MEMORY.md).
// Replaces 5 sendEmail() callsites.
//
// To re-enable autonomous sending, build a separate cron that picks up
// marketing_drafts WHERE status='approved' and posts to send-email.
async function enqueueDraft(params: {
  triggerType: string;
  sourceRecordType: string;       // 'job' | 'quote' | 'invoice' | 'request'
  sourceRecordId: string;
  clientId: string | null;
  clientName: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const dedupKey = `${params.triggerType}:${params.sourceRecordId}`;
  // Idempotent insert — UNIQUE (tenant_id, trigger, dedup_key) makes a
  // re-run a no-op rather than a duplicate.
  const { error } = await sb.from("marketing_drafts").upsert({
    tenant_id:          TENANT_ID,
    trigger:            params.triggerType,
    source_record_type: params.sourceRecordType,
    source_record_id:   params.sourceRecordId,
    client_id:          params.clientId,
    client_name:        params.clientName,
    to_email:           params.toEmail,
    channel:            "email",
    subject:            params.subject,
    body_text:          params.bodyText,
    body_html:          params.bodyHtml,
    status:             "pending",
    dedup_key:          dedupKey,
    metadata:           params.metadata ?? {},
  }, { onConflict: "tenant_id,trigger,dedup_key", ignoreDuplicates: true });
  if (error) { console.error("[enqueueDraft]", error.message, dedupKey); return false; }
  return true;
}

// Backwards-compat shim — keeps the old signature so call-sites don't all
// need rewriting in one pass. Triggers below now pass the full draft
// metadata; this shim is for any caller that still uses the (to, subject,
// html) signature. Will warn and skip — drafts can't be enqueued without
// a tenant + record reference.
async function sendEmail(_to: string, _subject: string, _html: string): Promise<boolean> {
  console.warn("[sendEmail] DEPRECATED — caller should switch to enqueueDraft()");
  return false;
}

// Quota check still useful for visibility but no longer gates anything
// (drafts don't consume Resend quota until approved + sent via send-email).
// Kept for the dashboard's "today's automation activity" indicator.
async function _checkDailyQuotaUnused() { return checkDailyQuota(); }

async function alreadySent(triggerType: string, recordId: string): Promise<boolean> {
  // Check BOTH historical communications (already-sent) AND the new
  // marketing_drafts queue (pending/approved) so cron skips records that
  // already have a draft staged or a real send recorded.
  const [{ data: comms }, { data: drafts }] = await Promise.all([
    sb.from("communications")
      .select("id")
      .eq("channel", "email")
      .eq("direction", "outbound")
      .contains("metadata", { trigger: triggerType, record_id: recordId })
      .limit(1),
    sb.from("marketing_drafts")
      .select("id")
      .eq("tenant_id", TENANT_ID)
      .eq("trigger", triggerType)
      .eq("dedup_key", `${triggerType}:${recordId}`)
      .limit(1),
  ]);
  return !!(comms?.length) || !!(drafts?.length);
}

async function logSend(clientId: string | null, triggerType: string, recordId: string, toEmail: string, subject: string, status: string = "sent", errorMsg: string = "") {
  await sb.from("communications").insert({
    tenant_id:  TENANT_ID,
    client_id:  clientId || null,
    type:       "email",
    channel:    "email",
    direction:  "outbound",
    status:     status,
    body:       subject,
    metadata:   { trigger: triggerType, record_id: recordId, to: toEmail, ...(errorMsg ? { error: errorMsg } : {}) },
  });
}

function esc(s: string): string {
  return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function emailHtml(bodyText: string, recipientEmail: string): string {
  const lines = bodyText.split("\n").map(l => `<p style="margin:0 0 10px;">${esc(l) || "&nbsp;"}</p>`).join("");
  const encodedEmail = encodeURIComponent(recipientEmail || "");
  const unsubUrl = `https://branchmanager.app/unsubscribe?token=pending&email=${encodedEmail}`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#333;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#1a3c12;padding:16px 24px;border-radius:8px 8px 0 0;">
      <div style="font-size:18px;font-weight:700;color:#fff;">${esc(COMPANY_NAME)}</div>
    </div>
    <div style="background:#fff;border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      ${lines}
    </div>
    <div style="font-size:11px;color:#999;text-align:center;margin-top:16px;">
      ${esc(COMPANY_NAME)} · ${esc(COMPANY_PHONE)} · <a href="mailto:${esc(REPLY_TO)}" style="color:#999;">${esc(REPLY_TO)}</a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px;">
    <p style="font-size:11px;color:#999;line-height:1.5;text-align:center;">
      ${esc(COMPANY_ADDRESS)}<br>
      <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from marketing emails.
    </p>
  </body></html>`;
}

// ─── Trigger 1: Review request (24h–14d after job completed) ─────────────────
// Wide window: any completed job updated 24h–14d ago that hasn't been sent.
// alreadySent() prevents re-sending on subsequent cron runs.

async function runReviewRequests(): Promise<{ sent: number; skipped: number }> {
  if (!REVIEW_ENABLED) return { sent: 0, skipped: 0 };

  const until = new Date(Date.now() - 22 * 3600_000).toISOString();   // at least 22h ago
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();  // no older than 14 days

  const { data: jobs, error } = await sb
    .from("jobs")
    .select("id, client_id, client_name, job_number, description, total, updated_at, completed_date")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "completed")
    .lte("updated_at", until)
    .gte("updated_at", since);

  if (error) { console.error("jobs query error:", error.message); return { sent: 0, skipped: 0 }; }
  if (!jobs || jobs.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;

  for (const job of jobs) {
    try {
      if (await alreadySent("review_request", job.id)) { skipped++; continue; }

      let email = "";
      let firstName = (job.client_name || "").split(" ")[0] || "there";
      if (job.client_id) {
        const { data: cl } = await sb.from("clients").select("email, name").eq("id", job.client_id).eq("tenant_id", TENANT_ID).single();
        if (cl?.email) { email = cl.email; firstName = (cl.name || "").split(" ")[0] || firstName; }
      }
      if (!email) { skipped++; continue; }

      const jobNum  = job.job_number ? `#${job.job_number}` : "";
      const jobDesc = job.description || "your tree service";
      const subject = "Your tree work is complete — how did we do?";
      const body =
        `Hi ${firstName},\n\n` +
        `We have finished the work at your property! Job ${jobNum} (${jobDesc}) is now complete.\n\n` +
        `We hope everything looks great. If you notice anything that needs attention, please let us know right away and we will take care of it.\n\n` +
        `If you were happy with the service, it would mean a lot if you could leave us a quick Google review. It only takes a minute and really helps our small business:\n\n` +
        `${GOOGLE_REVIEW_URL}\n\n` +
        `Thank you for choosing ${COMPANY_NAME}. We appreciate your business and hope to work with you again!\n\n` +
        `${OWNER_NAME}\n` +
        `${COMPANY_PHONE}`;

      const ok = await enqueueDraft({
        triggerType: "review_request",
        sourceRecordType: "job", sourceRecordId: job.id,
        clientId: job.client_id, clientName: job.client_name || email,
        toEmail: email, subject,
        bodyText: body, bodyHtml: emailHtml(body, email),
        metadata: { sent_after_completion: true },
      });
      if (ok) {
        await logSend(job.client_id, "review_request", job.id, email, subject, "draft");
        sent++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("review_request iteration failed for job", job.id, msg);
      try { await logSend(job.client_id || null, "review_request", job.id, "", "review_request failed", "failed", msg); } catch (_) {}
      skipped++;
    }
  }

  return { sent, skipped };
}

// ─── Trigger 2: Quote follow-up (7–30d after sent, no response) ──────────────
// Wide window catches missed runs. alreadySent() prevents double-sends.

async function runQuoteFollowups(): Promise<{ sent: number; skipped: number }> {
  if (!QUOTE_FOLLOWUP_ENABLED) return { sent: 0, skipped: 0 };

  const until = new Date(Date.now() - 6 * 86400_000).toISOString();   // at least 6 days old
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();  // no older than 30 days

  const { data: quotes, error } = await sb
    .from("quotes")
    .select("id, client_id, client_name, quote_number, description, total, updated_at")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "sent")
    .lte("updated_at", until)
    .gte("updated_at", since);

  if (error) { console.error("quotes query error:", error.message); return { sent: 0, skipped: 0 }; }
  if (!quotes || quotes.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;

  for (const q of quotes) {
    try {
      if (await alreadySent("quote_followup_7d", q.id)) { skipped++; continue; }

      let email = "";
      let firstName = (q.client_name || "").split(" ")[0] || "there";
      if (q.client_id) {
        const { data: cl } = await sb.from("clients").select("email, name").eq("id", q.client_id).eq("tenant_id", TENANT_ID).single();
        if (cl?.email) { email = cl.email; firstName = (cl.name || "").split(" ")[0] || firstName; }
      }
      if (!email) { skipped++; continue; }

      const quoteNum = q.quote_number ? `#${q.quote_number}` : "";
      const total    = q.total ? `$${Number(q.total).toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "";
      const jobDesc  = q.description || "your tree service";
      const sentDate = new Date(q.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const approveUrl = `https://branchmanager.app/approve.html?id=${q.id}`;
      const subject  = `Following up on your tree service quote ${quoteNum}`;
      const body =
        `Hi ${firstName},\n\n` +
        `I wanted to follow up on the estimate we sent on ${sentDate} for ${jobDesc}.\n\n` +
        `Your quote (${quoteNum}) came to ${total}. If you have any questions about the scope of work or pricing, I am happy to walk through it with you.\n\n` +
        `You can also view and approve your quote online:\n${approveUrl}\n\n` +
        `We have availability coming up and would love to get you on the schedule. Just reply to this email or give us a call at ${COMPANY_PHONE}.\n\n` +
        `Thanks,\n${OWNER_NAME}\n${COMPANY_NAME}\n${COMPANY_PHONE}`;

      const ok = await enqueueDraft({
        triggerType: "quote_followup_7d",
        sourceRecordType: "quote", sourceRecordId: q.id,
        clientId: q.client_id, clientName: q.client_name || email,
        toEmail: email, subject,
        bodyText: body, bodyHtml: emailHtml(body, email),
      });
      if (ok) {
        await logSend(q.client_id, "quote_followup_7d", q.id, email, subject, "draft");
        sent++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("quote_followup iteration failed for quote", q.id, msg);
      try { await logSend(q.client_id || null, "quote_followup_7d", q.id, "", "quote_followup failed", "failed", msg); } catch (_) {}
      skipped++;
    }
  }

  return { sent, skipped };
}

// ─── Trigger 3: Upsell (30–90d after invoice paid) ───────────────────────────
// Uses paid_date if set, otherwise falls back to updated_at.
// Wide window + alreadySent() dedup.

async function runUpsells(): Promise<{ sent: number; skipped: number }> {
  if (!UPSELL_ENABLED) return { sent: 0, skipped: 0 };

  const until = new Date(Date.now() - 28 * 86400_000).toISOString();  // at least 28 days ago
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();  // no older than 90 days

  // Fetch paid invoices in the window — prefer paid_date, fall back to updated_at
  const { data: invoices, error } = await sb
    .from("invoices")
    .select("id, client_id, client_name, invoice_number, total, paid_date, updated_at")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "paid")
    .gte("updated_at", since)
    .lte("updated_at", until);

  if (error) { console.error("invoices query error:", error.message); return { sent: 0, skipped: 0 }; }
  if (!invoices || invoices.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;

  // Per-client dedup tracker — prevents the May 5 2026 incident where Basquali
  // got 3 upsell emails in 14 seconds because 3 separate paid invoices all
  // crossed the 28-day threshold in the same cron tick. We now dedup BY CLIENT,
  // not by invoice. One upsell per client per 60-day window, no matter how
  // many of their invoices are paid.
  const clientsHitThisRun = new Set<string>();

  for (const inv of invoices) {
    try {
      // If paid_date is set, verify it's also in the right window (paid_date takes priority)
      if (inv.paid_date) {
        const pd = new Date(inv.paid_date).getTime();
        if (pd > new Date(until).getTime() || pd < new Date(since).getTime()) { skipped++; continue; }
      }

      // Per-invoice dedup (legacy — covers same-invoice re-runs of the same cron tick)
      if (await alreadySent("upsell_30d", inv.id)) { skipped++; continue; }

      // Per-client dedup THIS RUN (Basquali fix)
      if (inv.client_id && clientsHitThisRun.has(inv.client_id)) { skipped++; continue; }

      // Per-client dedup ACROSS RUNS — refuse if this client got any upsell in
      // the last 60 days regardless of which invoice triggered it.
      if (inv.client_id) {
        const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();
        const { data: recent } = await sb
          .from("communications")
          .select("id")
          .eq("tenant_id", TENANT_ID)
          .eq("client_id", inv.client_id)
          .eq("channel", "email")
          .eq("status", "sent")
          .gte("created_at", sixtyDaysAgo)
          .filter("metadata->>trigger", "eq", "upsell_30d")
          .limit(1);
        if (recent && recent.length > 0) { skipped++; continue; }
      }

      let email = "";
      let firstName = (inv.client_name || "").split(" ")[0] || "there";
      if (inv.client_id) {
        const { data: cl } = await sb.from("clients").select("email, name").eq("id", inv.client_id).eq("tenant_id", TENANT_ID).single();
        if (cl?.email) { email = cl.email; firstName = (cl.name || "").split(" ")[0] || firstName; }
      }
      if (!email) { skipped++; continue; }

      // Mark this client as hit BEFORE actually sending (covers the rest of THIS run)
      if (inv.client_id) clientsHitThisRun.add(inv.client_id);

      const invoiceNum = inv.invoice_number ? `#${inv.invoice_number}` : "";
      const subject    = `Ready for your next tree service, ${firstName}?`;
      const body =
        `Hi ${firstName},\n\n` +
        `It has been about a month since we completed your job (invoice ${invoiceNum}). Hope everything at your property is looking great!\n\n` +
        `Spring and summer are our busiest seasons — if you have been thinking about any additional tree work (pruning, removal, stump grinding, cleanups), now is a great time to get on the schedule before the calendar fills up.\n\n` +
        `Just reply to this email or give us a call at ${COMPANY_PHONE} and we can get you a quick estimate.\n\n` +
        `And if you know anyone who needs tree work, we really appreciate the referral — word of mouth is how we built this business.\n\n` +
        `Thanks again,\n${OWNER_NAME}\n${COMPANY_NAME}\n${COMPANY_PHONE}`;

      const ok = await enqueueDraft({
        triggerType: "upsell_30d",
        sourceRecordType: "invoice", sourceRecordId: inv.id,
        clientId: inv.client_id, clientName: inv.client_name || email,
        toEmail: email, subject,
        bodyText: body, bodyHtml: emailHtml(body, email),
      });
      if (ok) {
        await logSend(inv.client_id, "upsell_30d", inv.id, email, subject, "draft");
        sent++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("upsell iteration failed for invoice", inv.id, msg);
      try { await logSend(inv.client_id || null, "upsell_30d", inv.id, "", "upsell failed", "failed", msg); } catch (_) {}
      skipped++;
    }
  }

  return { sent, skipped };
}

// ─── Trigger 4: Appointment reminder (16–52h before scheduled job) ───────────
// Customer gets a friendly day-before reminder. Wide window catches missed cron
// runs without ever sending two reminders for the same job.

async function runApptReminders(): Promise<{ sent: number; skipped: number }> {
  if (!APPT_REMINDER_ENABLED) return { sent: 0, skipped: 0 };

  const now    = new Date();
  // Looking for jobs scheduled 16–52h from NOW: catches "tomorrow morning"
  // and "two-days-out afternoon" both, with overlap so a missed 4h cron run
  // doesn't drop anyone.
  const earliest = new Date(now.getTime() + 16 * 3600_000).toISOString();
  const latest   = new Date(now.getTime() + 52 * 3600_000).toISOString();

  const { data: jobs, error } = await sb
    .from("jobs")
    .select("id, client_id, client_name, job_number, description, scheduled_date, property, crew, total")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "scheduled")
    .gte("scheduled_date", earliest)
    .lte("scheduled_date", latest);

  if (error) { console.error("appt-reminder jobs query error:", error.message); return { sent: 0, skipped: 0 }; }
  if (!jobs || jobs.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;

  for (const job of jobs) {
    try {
      if (await alreadySent("appt_reminder", job.id)) { skipped++; continue; }

      let email = "";
      let firstName = (job.client_name || "").split(" ")[0] || "there";
      if (job.client_id) {
        const { data: cl } = await sb.from("clients").select("email, name").eq("id", job.client_id).eq("tenant_id", TENANT_ID).single();
        if (cl?.email) { email = cl.email; firstName = (cl.name || "").split(" ")[0] || firstName; }
      }
      if (!email) { skipped++; continue; }

      // Format scheduled_date in Eastern time
      const scheduled = new Date(job.scheduled_date as string);
      const dayName   = scheduled.toLocaleDateString("en-US", { weekday: "long",  timeZone: "America/New_York" });
      const dateStr   = scheduled.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });
      const timeStr   = scheduled.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", hour12: true });

      const subject = `Reminder: We're coming ${dayName}`;
      const body =
        `Hi ${firstName},\n\n` +
        `Quick reminder — ${COMPANY_NAME} is scheduled to arrive at your property on ${dayName}, ${dateStr} around ${timeStr}.\n\n` +
        (job.property    ? `Address: ${job.property}\n` : "") +
        (job.description ? `Scope: ${job.description}\n\n` : "\n") +
        `A few quick things to make the day go smoothly:\n` +
        `• Please move any vehicles, lawn furniture, or kids' toys away from the work area before we arrive.\n` +
        `• Make sure pets are inside while the crew is on site (chainsaws scare them).\n` +
        `• If anything has changed or you need to reschedule, just reply to this email or call ${COMPANY_PHONE}.\n\n` +
        `See you soon!\n${OWNER_NAME}\n${COMPANY_NAME}\n${COMPANY_PHONE}`;

      const ok = await enqueueDraft({
        triggerType: "appt_reminder",
        sourceRecordType: "job", sourceRecordId: job.id,
        clientId: job.client_id, clientName: job.client_name || email,
        toEmail: email, subject,
        bodyText: body, bodyHtml: emailHtml(body, email),
      });
      if (ok) {
        await logSend(job.client_id, "appt_reminder", job.id, email, subject, "draft");
        sent++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("appt-reminder iteration failed for job", job.id, msg);
      try { await logSend(job.client_id || null, "appt_reminder", job.id, "", "appt reminder failed", "failed", msg); } catch (_) {}
      skipped++;
    }
  }

  return { sent, skipped };
}

// ─── Trigger 5: Compliance renewal reminders (90/60/30 days before expiry) ───
// For each row in compliance_documents_with_status with status='expiring_soon',
// fire owner-facing emails at three notice points (90/60/30 days). Idempotent
// per-doc per-notice so cron can run hourly without duplicate emails. Once a
// doc actually expires (status='expired'), one final escalation email goes out.

async function runRenewalReminders(): Promise<{ sent: number; skipped: number }> {
  // Owner gets these — find their email. Fall back to FROM_EMAIL (info@…)
  // since Doug reads that inbox today.
  const ownerEmail = REPLY_TO; // already resolved per-tenant from cfg.from_email

  // Pull every active compliance doc with an expiry date for this tenant.
  const { data: rows, error } = await sb
    .from("compliance_documents_with_status")
    .select("id, kind, number, issuer, expires_date, renewal_url, status, days_until_expiry")
    .eq("tenant_id", TENANT_ID)
    .eq("active", true)
    .not("expires_date", "is", null);

  if (error) { console.error("renewal_reminder query error:", error.message); return { sent: 0, skipped: 0 }; }
  if (!rows || rows.length === 0) return { sent: 0, skipped: 0 };

  // Friendly labels (mirror the BM Insurance UI _kindLabel map)
  const kindLabel: Record<string, string> = {
    wc_policy: "Workers Comp Policy",
    db_policy: "Disability Benefits",
    pfl_policy: "Paid Family Leave",
    general_liability: "General Liability",
    auto_liability: "Commercial Auto",
    umbrella: "Umbrella / Excess",
    pesticide_cert: "Pesticide Cert",
    tcia_member: "TCIA Membership",
    isa_member: "ISA Membership",
    usdot_registration: "US DOT Registration",
    mcs150_biennial: "MCS-150 Biennial",
    dos_biennial: "NY DOS Biennial",
    sales_tax_cert: "Sales Tax Cert",
    vehicle_registration: "Vehicle Registration",
    vehicle_inspection: "NY Inspection",
    driver_license: "Driver License",
    cdl: "CDL",
    dot_medical_card: "DOT Medical Card",
    osha_z133_training: "ANSI Z133 Training",
    first_aid_cpr_cert: "First Aid / CPR",
    business_license_local: "Local Business License",
    home_improvement_contractor: "HIC License",
  };

  let sent = 0, skipped = 0;

  for (const r of rows) {
    try {
      const days = (r as { days_until_expiry: number | null }).days_until_expiry;
      const status = (r as { status: string }).status;

      // Pick which notice bucket this doc is in (or skip).
      // Status from view: active | expiring_soon | expired | no_expiry | archived
      let bucket: "90d" | "60d" | "30d" | "expired" | null = null;
      if (status === "expired") {
        bucket = "expired";
      } else if (days != null) {
        if (days >  60 && days <= 90) bucket = "90d";
        else if (days >  30 && days <= 60) bucket = "60d";
        else if (days >=  0 && days <= 30) bucket = "30d";
      }
      if (!bucket) { skipped++; continue; }

      const triggerKey = `renewal_reminder_${bucket}`;
      if (await alreadySent(triggerKey, (r as { id: string }).id)) { skipped++; continue; }

      const label = kindLabel[(r as { kind: string }).kind] || (r as { kind: string }).kind;
      const num    = (r as { number: string | null }).number || "";
      const issuer = (r as { issuer: string | null }).issuer || "";
      const expDate = (r as { expires_date: string | null }).expires_date || "";
      const renewalUrl = (r as { renewal_url: string | null }).renewal_url || "";

      const subject = bucket === "expired"
        ? `🔴 EXPIRED: ${label}${num ? " #" + num : ""}`
        : `⏳ ${label}${num ? " #" + num : ""} expires in ${days}d`;

      const urgency = bucket === "expired"
        ? "is EXPIRED. This is a compliance hold — renew immediately."
        : bucket === "30d"
          ? `expires in ${days} days. Last reminder.`
          : bucket === "60d"
            ? `expires in ${days} days. Plan the renewal — most state/insurance portals take 1–3 weeks.`
            : `expires in ${days} days. Heads-up so you can budget time + filing fees.`;

      const body =
        `${label}${num ? " #" + num : ""}${issuer ? " (" + issuer + ")" : ""} ${urgency}\n\n` +
        `Expiration date: ${expDate}\n\n` +
        (renewalUrl ? `Renew here: ${renewalUrl}\n\n` : "") +
        `View in BM:\n` +
        `https://branchmanager.app/#insurance\n\n` +
        `— Branch Manager (auto-reminder, ${bucket})`;

      const ok = await enqueueDraft({
        triggerType: triggerKey as string,
        sourceRecordType: "request", sourceRecordId: (r as { id: string }).id,
        clientId: null, clientName: (r as { client_name?: string }).client_name || "Renewal alert",
        toEmail: ownerEmail, subject,
        bodyText: body, bodyHtml: emailHtml(body, ownerEmail),
        metadata: { renewal_bucket: bucket },
      });
      if (ok) {
        await logSend(null, triggerKey, (r as { id: string }).id, ownerEmail, subject, "draft");
        sent++;
      } else {
        skipped++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("renewal_reminder iteration failed for doc", (r as { id: string }).id, msg);
      try { await logSend(null, "renewal_reminder", (r as { id: string }).id, "", "renewal reminder failed", "failed", msg); } catch (_) {}
      skipped++;
    }
  }

  return { sent, skipped };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const startMs = Date.now();
  console.log("marketing-automation: starting run at", new Date().toISOString());

  // Phase 2 — fetch all active tenants and run all 4 triggers per tenant.
  // Each iteration sets the module-level constants from tenants.config so
  // the existing helpers (which read those vars) work unchanged.
  const { data: tenants, error: tErr } = await sb
    .from("tenants")
    .select("id, name, config")
    .order("created_at", { ascending: true });
  if (tErr || !tenants || tenants.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "No tenants to process: " + (tErr?.message || "empty") }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const perTenant: Record<string, unknown>[] = [];
  let total_sent = 0;
  for (const t of tenants) {
    TENANT_ID         = t.id;
    const cfg = (t.config || {}) as Record<string, unknown>;
    const fromName    = String(cfg.from_name      ?? FALLBACK_COMPANY_NAME);
    const fromAddr    = String(cfg.from_email     ?? FALLBACK_REPLY_TO);
    FROM_EMAIL        = `${fromName} <${fromAddr}>`;
    REPLY_TO          = String(cfg.from_email     ?? FALLBACK_REPLY_TO);
    GOOGLE_REVIEW_URL = String(cfg.google_review_url ?? FALLBACK_REVIEW_URL);
    COMPANY_NAME      = String(cfg.company_name   ?? FALLBACK_COMPANY_NAME);
    COMPANY_PHONE     = String(cfg.company_phone  ?? FALLBACK_COMPANY_PHONE);
    OWNER_NAME        = String(cfg.owner_name     ?? FALLBACK_OWNER_NAME);
    COMPANY_ADDRESS   = String(cfg.company_address ?? FALLBACK_ADDRESS);

    const [review, followup, upsell, apptReminder, renewalReminder] = await Promise.all([
      runReviewRequests(),
      runQuoteFollowups(),
      runUpsells(),
      runApptReminders(),
      runRenewalReminders(),
    ]);
    const tenant_total = review.sent + followup.sent + upsell.sent + apptReminder.sent + renewalReminder.sent;
    total_sent += tenant_total;
    perTenant.push({
      tenant_id: t.id,
      tenant_name: t.name,
      review_requests: review,
      quote_followups: followup,
      upsells: upsell,
      appt_reminders: apptReminder,
      renewal_reminders: renewalReminder,
      total_sent: tenant_total,
    });
  }

  const result = {
    ran_at:       new Date().toISOString(),
    duration_ms:  Date.now() - startMs,
    tenants:      perTenant,
    total_sent,
  };

  console.log("marketing-automation: done", JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
