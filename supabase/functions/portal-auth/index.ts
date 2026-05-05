// portal-auth — send magic-link login email to a client (multi-tenant)
// POST { email } → finds client by email → creates 7-day session → emails link via Resend
// Tenant resolution: X-Tenant-ID header, or scoped by client's tenant_id row.
// Deploy: supabase functions deploy portal-auth --no-verify-jwt
//
// v598 white-label: tenant branding pulled via loadTenantBranding() so the
// login email uses the right business name + colors + footer for the
// tenant the client belongs to.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantId, loadTenantBranding } from "../_shared/tenant.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const PORTAL_BASE = "https://branchmanager.app/portal.html";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function cors(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-tenant-id",
    },
  });
}

function randomToken(len = 48): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors("", 200);
  if (req.method === "GET" || req.method === "HEAD") return cors("portal-auth ok", 200);
  if (req.method !== "POST") return cors(JSON.stringify({ error: "Method not allowed" }), 405);

  let email: string;
  try {
    const body = await req.json();
    email = (body.email || "").trim().toLowerCase();
  } catch {
    return cors(JSON.stringify({ error: "Invalid JSON" }), 400);
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return cors(JSON.stringify({ error: "Valid email required" }), 400);
  }

  const tenantId = resolveTenantId(req);

  // Look up client by email — scoped to tenant when header provided
  const { data: clients } = await sb
    .from("clients")
    .select("id, name, email, tenant_id")
    .ilike("email", email)
    .eq("tenant_id", tenantId)
    .limit(1);

  if (!clients || clients.length === 0) {
    // Return success anyway to avoid email enumeration
    return cors(JSON.stringify({ ok: true }));
  }

  const client = clients[0];
  const token = randomToken();

  // Use the client's actual tenant_id for branding (in case header was missing/wrong)
  const b = await loadTenantBranding(sb, client.tenant_id || tenantId);

  // Store session
  await sb.from("portal_sessions").insert({
    client_id: client.id,
    token,
    email: client.email || email,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const portalLink = `${PORTAL_BASE}?t=${token}`;
  const firstName = (client.name || "").split(" ")[0] || "there";

  // Send email via Resend with tenant branding
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${b.from_name} <${b.from_email}>`,
      to: [client.email || email],
      reply_to: b.email,
      subject: `Your ${b.business_short_name} portal link`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#1d1d1f;">
          <div style="background:${b.brand_color};color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;margin-bottom:0;">
            <div style="font-size:20px;font-weight:700;">🌳 ${esc(b.business_short_name)}</div>
            <div style="font-size:13px;opacity:.75;margin-top:4px;">Customer Portal</div>
          </div>
          <div style="background:#fff;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 10px 10px;padding:28px 24px;">
            <p style="font-size:16px;margin:0 0 20px;">Hi ${esc(firstName)},</p>
            <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 24px;">
              Here's your secure link to view your quotes, invoices, and job history — and pay any outstanding balance online.
            </p>
            <a href="${portalLink}" style="display:inline-block;background:${b.brand_color};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">
              Open My Portal →
            </a>
            <p style="font-size:12px;color:#888;margin-top:24px;line-height:1.5;">
              This link is valid for 7 days. If you didn't request this, you can safely ignore this email.
            </p>
            <p style="font-size:12px;color:#888;margin-top:16px;border-top:1px solid #eee;padding-top:12px;">
              ${esc(b.business_name)} · ${esc(b.address_short)} · ${esc(b.phone)}
            </p>
          </div>
        </div>
      `,
    }),
  });

  return cors(JSON.stringify({ ok: true }));
});
