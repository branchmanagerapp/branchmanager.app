// Dialpad webhook receiver — logs inbound calls, SMS, voicemails into Supabase.
//
// Deploy:
//   supabase functions deploy dialpad-webhook --no-verify-jwt
//
// Then in Dialpad admin → Automations → Webhooks, add:
//   https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/dialpad-webhook
//   Events: call.ringing, call.completed, sms.received, voicemail.created
//   Secret: (set as DIALPAD_WEBHOOK_SECRET env var in Supabase)
//
// Table expected:
//   CREATE TABLE communications (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
//     channel text NOT NULL,         -- 'call' | 'sms' | 'voicemail'
//     direction text NOT NULL,        -- 'inbound' | 'outbound'
//     from_number text,
//     to_number text,
//     duration_seconds int,
//     body text,                      -- sms body or voicemail transcript
//     recording_url text,
//     status text,                    -- 'ringing' | 'completed' | 'missed' etc.
//     dialpad_id text UNIQUE,
//     metadata jsonb,
//     created_at timestamptz DEFAULT now()
//   );
//   CREATE INDEX idx_comms_client ON communications(client_id);
//   CREATE INDEX idx_comms_created ON communications(created_at DESC);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantFromEvent, SNT_TENANT_ID_CONST } from "../_shared/tenant.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("DIALPAD_WEBHOOK_SECRET") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Phase 2 multi-tenant: route inbound events to the right tenant by
// matching the destination number against tenants.config.sms_from_number.
// Falls back to SNT for backwards compat during rollout.
async function tenantForEvent(toNumber: string | null): Promise<string> {
  // Normalize to +E.164 for the lookup
  const digits = (toNumber || "").replace(/\D/g, "");
  const e164 = digits.length === 10 ? "+1" + digits : (digits.length === 11 && digits[0] === "1" ? "+" + digits : (digits ? "+" + digits : ""));
  return await resolveTenantFromEvent(sb, "sms_from_number", e164);
}

function normPhone(n?: string): string {
  if (!n) return "";
  return String(n).replace(/\D/g, "").slice(-10);
}

async function findClientByPhone(phone: string): Promise<string | null> {
  const p = normPhone(phone);
  if (p.length < 7) return null;
  // Try last-10-digits match against clients.phone
  const { data } = await sb
    .from("clients")
    .select("id, phone")
    .ilike("phone", `%${p}%`)
    .limit(1);
  return data && data.length ? data[0].id : null;
}

// Decode + verify a Dialpad webhook JWT (HS256). Returns the decoded payload
// or null if the body isn't a JWT or the signature fails. When WEBHOOK_SECRET
// is empty, signature isn't checked but the JWT is still decoded so we can
// pull the event payload from its claims.
async function decodeDialpadJwt(token: string): Promise<unknown | null> {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const decode = (s: string) => {
      const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
      return atob(padded);
    };
    const decoded = JSON.parse(decode(payloadB64));

    if (WEBHOOK_SECRET) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const sigBytes = Uint8Array.from(decode(sigB64), (c) => c.charCodeAt(0));
      const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(`${headerB64}.${payloadB64}`));
      if (!ok) {
        console.warn("Dialpad webhook JWT signature mismatch — rejecting");
        return null;
      }
    }
    return decoded;
  } catch (e) {
    console.warn("Dialpad webhook JWT decode failed:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  // Dialpad + UptimeRobot probe with GET/HEAD before marking the URL "alive".
  // Returning 405 here was causing Dialpad's SMS subscription to stay in
  // status:false (no events delivered) and UptimeRobot to flag the
  // webhook as DOWN. Respond 200 to verification probes; only require POST
  // for actual event delivery.
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("dialpad-webhook ok", { status: 200 });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Read body as text first — Dialpad sends either a signed JWT (when the
  // webhook has a secret on its side) or plain JSON (no secret). Auto-detect.
  const rawBody = await req.text();
  let payload: any = null;
  if (rawBody.trim().startsWith("{")) {
    // Plain JSON path (unsigned webhook). If WEBHOOK_SECRET is set, refuse —
    // Dialpad should always send signed JWT in that mode, so unsigned JSON =
    // spoof attempt.
    if (WEBHOOK_SECRET) {
      return new Response("Signed payload required", { status: 401 });
    }
    try { payload = JSON.parse(rawBody); }
    catch { return new Response("Bad JSON", { status: 400 }); }
  } else {
    // Signed JWT path
    payload = await decodeDialpadJwt(rawBody);
    if (!payload) return new Response("Invalid signed payload", { status: 401 });
  }

  const event: string = payload.event_type || payload.event || "unknown";
  const data = payload.data || payload;

  // Phase 2 — resolve tenant by matching the destination number against
  // tenants.config.sms_from_number. Falls back to SNT during rollout.
  // The to_number for inbound events = the Dialpad number that received it.
  const toForRouting = data.to_number || data.internal_number || data.to || null;
  const TENANT_ID = await tenantForEvent(toForRouting);

  // Normalize across Dialpad event shapes.
  // tenant_id MUST be set or RLS will hide every row from BM's anon-key reads
  // (the May 2 audit found 56 of 60 communications were orphaned this way and
  // invisible in the call center UI).
  let row: any = {
    tenant_id: TENANT_ID,
    type: "call",
    channel: "call",
    direction: "inbound",
    from_number: data.from_number || data.external_number || data.from || null,
    to_number: data.to_number || data.internal_number || data.to || null,
    duration_seconds: data.duration || null,
    body: null,
    recording_url: data.recording_url || null,
    status: data.state || event,
    dialpad_id: String(data.call_id || data.id || data.uuid || `${event}-${Date.now()}`),
    metadata: payload,
  };

  if (event.startsWith("sms")) {
    row.type = "sms";
    row.channel = "sms";
    row.direction = data.direction === "outbound" ? "outbound" : "inbound";
    row.body = data.text || data.message || data.body || null;
  } else if (event.startsWith("voicemail")) {
    row.type = "voicemail";
    row.channel = "voicemail";
    row.body = data.transcription || data.transcript || null;
  } else if (event.startsWith("call")) {
    row.type = "call";
    row.channel = "call";
    row.direction = data.direction === "outbound" ? "outbound" : "inbound";
  }

  // Try to auto-link to a client by phone number
  const lookupPhone = row.direction === "inbound" ? row.from_number : row.to_number;
  if (lookupPhone) {
    row.client_id = await findClientByPhone(lookupPhone);
  }

  // ── TCPA opt-out keyword handling for inbound SMS.
  // STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT → opt out
  // START/UNSTOP/YES → opt back in
  // HELP/INFO → help reply
  // Always still log the inbound message; just stamp metadata.note + try to
  // patch clients.sms_opt_out when sender matches a known client.
  if (row.channel === "sms" && row.direction === "inbound") {
    // (TENANT_ID already resolved by tenantForEvent() at top of handler)
    const raw = (row.body || "").trim().toUpperCase();
    var keyword = "";
    if (raw === "STOP" || raw === "STOPALL" || raw === "UNSUBSCRIBE" || raw === "CANCEL" || raw === "END" || raw === "QUIT") {
      keyword = "STOP";
    } else if (raw === "START" || raw === "UNSTOP") {
      // NOTE: "YES" is intentionally NOT treated as START here. The quote-reply
      // detector below interprets YES as quote-approval, which is the more
      // common case. Carriers expect START/UNSTOP as the canonical opt-in.
      keyword = "START";
    } else if (raw === "HELP" || raw === "INFO") {
      keyword = "HELP";
    }

    if (keyword) {
      var autoReply = "";
      if (keyword === "STOP") {
        autoReply = "You're unsubscribed. Reply START to opt back in.";
      } else if (keyword === "START") {
        autoReply = "You're opted back in. Reply STOP to unsubscribe.";
      } else if (keyword === "HELP") {
        autoReply = "Second Nature Tree Service. Reply STOP to unsubscribe. Standard msg/data rates may apply. Call (914) 391-5233.";
      }

      // Patch clients.sms_opt_out for matched client (by last-10 phone)
      if (keyword === "STOP" || keyword === "START") {
        const last10 = normPhone(row.from_number);
        if (last10.length >= 10) {
          const optOut = keyword === "STOP";
          const patchUrl = `${SUPABASE_URL}/rest/v1/clients?phone=ilike.*${last10}*&tenant_id=eq.${TENANT_ID}`;
          try {
            await fetch(patchUrl, {
              method: "PATCH",
              headers: {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
              },
              body: JSON.stringify({
                sms_opt_out: optOut,
                sms_opt_out_at: optOut ? new Date().toISOString() : null,
              }),
            });
          } catch (e) {
            console.warn("sms_opt_out patch failed:", e);
          }
        }
      }

      // Stamp note into metadata so it surfaces in Doug's comms log
      row.metadata = Object.assign({}, row.metadata || {}, {
        note: keyword + " keyword",
        auto_reply: autoReply,
      });

      // Fire the actual auto-reply via dialpad-sms-send. system:true bypasses
      // the opt-out check (TCPA requires the STOP confirmation to go through
      // even AFTER opt-out is recorded). Fire-and-forget — a Dialpad hiccup
      // shouldn't 500 the inbound webhook (Dialpad would retry the inbound).
      const replyPhone = row.from_number;
      if (replyPhone && autoReply) {
        fetch(`${SUPABASE_URL}/functions/v1/dialpad-sms-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({
            to: replyPhone,
            message: autoReply,
            clientId: row.client_id || null,
            system: true,
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const text = await r.text();
              console.warn(`auto-reply ${keyword} send failed: HTTP ${r.status} — ${text}`);
            }
          })
          .catch((e) => console.warn(`auto-reply ${keyword} fetch error:`, e));
      }
    }
  }

  // Upsert (idempotent on dialpad_id)
  const { error } = await sb
    .from("communications")
    .upsert(row, { onConflict: "dialpad_id" });

  if (error) {
    console.error("dialpad-webhook insert failed:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // ── Inbound SMS auto-routing: detect quote-related replies from known clients.
  // For YES/NO/RESCHEDULE on a client who has a recent quote-sent SMS + an open
  // quote, create a structured task in the `tasks` table so Doug sees it on
  // every device (cloud-synced via v538). Does NOT auto-flip quote status —
  // Doug taps the task to confirm. Preserves human control on a fuzzy match.
  if (row.channel === "sms" && row.direction === "inbound" && row.client_id) {
    try {
      // (TENANT_ID already resolved by tenantForEvent() at top of handler)
      const clean = (row.body || "").trim().toUpperCase();
      let action: "approve" | "decline" | "reschedule" | null = null;

      // Only act on short plain replies — anything > 30 chars is probably a real message
      if (clean.length > 0 && clean.length <= 30) {
        if (/^(YES|YEP|YEAH|YS|CONFIRM(ED)?|APPROVE(D)?|OK(AY)?|GOOD|SOUNDS GOOD|LETS GO|LET'S GO|GO AHEAD|DO IT|👍|✅|YES PLEASE)\b/.test(clean)) {
          action = "approve";
        } else if (/^(NO|NOPE|NAH|DECLINE(D)?|REJECT(ED)?|NOT INTERESTED|PASS|👎|❌)\b/.test(clean)) {
          action = "decline";
        } else if (/^(RESCHEDULE|MOVE|CHANGE|DIFFERENT (DAY|TIME|DATE)|ANOTHER (DAY|TIME|DATE)|POSTPONE|DELAY)\b/.test(clean)) {
          action = "reschedule";
        }
      }

      if (action) {
        // Look up client name + most recent quote
        const { data: clientRow } = await sb
          .from("clients")
          .select("id, name")
          .eq("id", row.client_id)
          .limit(1)
          .single();
        const clientName = clientRow?.name || "Client";

        let quoteId: string | null = null;
        let quoteNumber: string | null = null;
        if (action === "approve" || action === "decline") {
          // Find the most recent open quote for this client
          const { data: quotes } = await sb
            .from("quotes")
            .select("id, quote_number, status")
            .eq("client_id", row.client_id)
            .in("status", ["sent", "draft", "viewed", "pending"])
            .order("created_at", { ascending: false })
            .limit(1);
          if (quotes && quotes.length) {
            quoteId = quotes[0].id;
            quoteNumber = quotes[0].quote_number;
          }
        }

        // Build a deterministic task id so re-fires (Dialpad redelivery, dupe SMS)
        // don't create N tasks. Re-firing just upserts the same row.
        const taskId = `task_smsreply_${row.client_id}_${action}_${(row.dialpad_id || row.id).slice(-8)}`;

        let title = "";
        let description = "";
        let actionLink: string | null = null;
        let category = "sales";
        if (action === "approve") {
          title = quoteNumber
            ? `${clientName} confirmed Quote #${quoteNumber} via SMS`
            : `${clientName} sent approval via SMS — find their quote`;
          description = `${clientName} replied "${row.body}" to a recent SMS. ${quoteId ? "Tap to verify and accept the quote." : "No open quote found — verify manually."}`;
          actionLink = quoteId ? `quotes/${quoteId}` : "messaging";
        } else if (action === "decline") {
          title = quoteNumber
            ? `${clientName} declined Quote #${quoteNumber} via SMS`
            : `${clientName} sent decline via SMS — find their quote`;
          description = `${clientName} replied "${row.body}" to a recent SMS. ${quoteId ? "Tap to verify and decline the quote." : "No open quote found — verify manually."}`;
          actionLink = quoteId ? `quotes/${quoteId}` : "messaging";
        } else if (action === "reschedule") {
          title = `${clientName} wants to reschedule — call them`;
          description = `${clientName} replied "${row.body}". Tap to open the messaging thread.`;
          actionLink = "messaging";
          category = "sales";
        }

        const taskRow = {
          id: taskId,
          tenant_id: TENANT_ID,
          title,
          description,
          assigned_to: null,
          due_date: null,
          priority: "high",
          category,
          recurrence: "none",
          action_link: actionLink,
          completed: false,
          completed_at: null,
          notified: false,
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: taskErr } = await sb.from("tasks").upsert(taskRow, { onConflict: "id" });
        if (taskErr) {
          console.warn("smsreply task upsert failed:", taskErr.message);
        } else {
          // Stamp the comm row with the action so the messaging UI can show a chip later
          await sb
            .from("communications")
            .update({
              metadata: Object.assign({}, row.metadata || {}, {
                suggested_action: action,
                suggested_quote_id: quoteId,
                suggested_quote_number: quoteNumber,
                task_id: taskId,
              }),
            })
            .eq("dialpad_id", row.dialpad_id);
        }
      }
    } catch (e) {
      console.warn("smsreply auto-route failed:", e);
    }
  }

  // ── Auto-create a BM request for inbound voicemails or missed inbound calls.
  // This surfaces phone leads in the Requests page without manual entry.
  let requestId: string | null = null;
  const isMissedInbound = row.direction === "inbound" && (
    row.channel === "voicemail" ||
    (row.channel === "call" && (row.status === "missed" || row.status === "no-answer" || row.status === "voicemail"))
  );
  if (isMissedInbound) {
    // (TENANT_ID already resolved by tenantForEvent() at top of handler)
    const callerName = data.from_name || data.contact_name || data.caller_name || "Phone caller";
    const transcript = row.body || "";
    const noteParts: string[] = [];
    if (transcript) noteParts.push("Voicemail transcript:\n" + transcript);
    if (row.recording_url) noteParts.push("Recording: " + row.recording_url);
    noteParts.push(`Source: Dialpad ${row.channel} on ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`);

    // Idempotency: a single Dialpad call fires up to 3 webhook events
    // (ringing → completed → voicemail), each landing here. Without dedup
    // we'd create 3 request rows per call. Look for an existing 'new'
    // request from the same caller in the last 5 minutes — if found,
    // append the latest note instead of creating a fresh row.
    // (May 2 audit caught this — 6 duplicate rows already in the table.)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let existingId: string | null = null;
    if (row.from_number) {
      const { data: existing } = await sb
        .from("requests")
        .select("id, notes")
        .eq("tenant_id", TENANT_ID)
        .eq("client_phone", row.from_number)
        .eq("source", "Phone (Dialpad)")
        .gte("created_at", fiveMinAgo)
        .limit(1);
      if (existing && existing.length > 0) {
        existingId = existing[0].id;
        // Append new info to the existing row instead of duplicating.
        const merged = (existing[0].notes || "") + "\n\n" + noteParts.join("\n\n");
        const { error: updErr } = await sb
          .from("requests")
          .update({ notes: merged })
          .eq("id", existingId);
        if (updErr) console.warn("auto-request merge failed:", updErr.message);
        requestId = existingId;
      }
    }

    if (!existingId) {
      const reqRow: Record<string, unknown> = {
        tenant_id: TENANT_ID,
        client_id: row.client_id || null,
        client_name: callerName,
        client_phone: row.from_number,
        title: row.channel === "voicemail" ? "Voicemail from " + callerName : "Missed call from " + callerName,
        notes: noteParts.join("\n\n"),
        status: "new",
        source: "Phone (Dialpad)",
      };
      const { data: insData, error: insErr } = await sb
        .from("requests")
        .insert(reqRow)
        .select("id")
        .single();
      if (insErr) {
        console.warn("auto-request insert failed:", insErr.message);
      } else {
        requestId = insData?.id || null;
      }
    }
  }

  // ── Doug-alert email on every inbound ────────────────────────────────
  // Doug previously had zero notification when calls/SMS came in. Fires a
  // Resend email to info@peekskilltree.com summarizing the inbound + linking
  // to BM. Cheap (~free at this volume), works even when BM is closed.
  // SMS alert via Dialpad outbound is deferred until DIALPAD_API_TOKEN is set.
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    if (RESEND_API_KEY) {
      const labelMap: Record<string, string> = {
        call: row.status === "missed" || row.status === "no_answer" ? "📵 Missed call" : "📞 Inbound call",
        voicemail: "📭 Voicemail",
        sms: "💬 SMS received",
        email: "✉️ Email",
      };
      const label = labelMap[row.channel] || "📞 Inbound";
      const callerName = data.from_name || data.contact_name || data.caller_name || row.from_number || "Unknown";
      const phoneFmt = row.from_number ? row.from_number.replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") : "";
      const bodyLine = (row.body || "").slice(0, 280);
      const subject = `${label} — ${callerName}${phoneFmt ? " · " + phoneFmt : ""}`;
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;">
  <div style="background:#1a3c12;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
    <div style="font-size:16px;font-weight:700;">${label}</div>
    <div style="font-size:13px;opacity:.85;margin-top:2px;">${callerName}${phoneFmt ? " · " + phoneFmt : ""}</div>
  </div>
  <div style="background:#fff;padding:20px 22px;border:1px solid #e8e8e8;border-radius:0 0 10px 10px;font-size:14px;line-height:1.5;color:#333;">
    ${bodyLine ? `<p style="background:#f8faf8;border-left:3px solid #1a3c12;padding:10px 14px;border-radius:0 8px 8px 0;margin:0 0 14px;white-space:pre-wrap;">${bodyLine.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}
    <p style="margin:0 0 6px;color:#666;font-size:12px;">${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}</p>
    <a href="https://branchmanager.app/" style="display:inline-block;background:#1a3c12;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin-top:8px;">Open Branch Manager</a>
  </div>
</div>`;
      const text = `${label}\n${callerName}${phoneFmt ? " · " + phoneFmt : ""}\n\n${bodyLine}\n\nOpen BM: https://branchmanager.app/`;
      // Fire-and-forget so a Resend hiccup doesn't 500 the webhook (Dialpad would retry).
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "Second Nature Tree <onboarding@resend.dev>",
          to: ["info@peekskilltree.com"],
          subject,
          text,
          html,
          reply_to: "info@peekskilltree.com",
        }),
      }).catch((e) => console.warn("doug-alert email failed:", e));
    }
  } catch (e) {
    console.warn("doug-alert wrap failed:", e);
  }

  // ── Doug-alert SMS (defense in depth) ────────────────────────────────
  // Email goes through Resend which is metered. If Resend is over quota
  // (today's incident, May 2 2026), the email alert silently fails. SMS
  // alert via Dialpad's own API (dialpad-sms-send fn) is a separate path
  // — different metering, different failure mode. Doug always sees one of
  // the two channels, even when one is broken. Fires only for inbound SMS
  // and missed calls (not for ringing/completed events that don't need
  // immediate attention). Excludes outbound (so we don't alert on our own
  // messages bouncing back through the loop).
  try {
    const isAlertWorthy =
      row.direction === "inbound" &&
      (row.channel === "sms" ||
       row.channel === "voicemail" ||
       (row.channel === "call" && (row.status === "missed" || row.status === "no-answer")));
    if (isAlertWorthy) {
      const callerPhone = row.from_number ? row.from_number.replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") : "Unknown";
      const channelLabel: Record<string, string> = {
        sms: "💬 SMS",
        voicemail: "📭 Voicemail",
        call: "📵 Missed call",
      };
      const tag = channelLabel[row.channel] || "📞 Inbound";
      const bodySnip = (row.body || "").slice(0, 100).replace(/\s+/g, " ").trim();
      const ownerSmsTo = Deno.env.get("OWNER_ALERT_PHONE") || ""; // optional fallback target
      // Skip if no fallback target configured — Resend email alert is the primary.
      if (ownerSmsTo) {
        const summary = `${tag} from ${callerPhone}${bodySnip ? `: "${bodySnip}"` : ""} — open BM`;
        fetch(`${SUPABASE_URL}/functions/v1/dialpad-sms-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({ to: ownerSmsTo, message: summary, system: true }),
        }).catch((e) => console.warn("doug-alert SMS failed:", e));
      }
    }
  } catch (e) {
    console.warn("doug-alert SMS wrap failed:", e);
  }

  return new Response(JSON.stringify({ ok: true, matched_client: !!row.client_id, request_id: requestId }), {
    headers: { "content-type": "application/json" },
  });
});
