// sendjim-send — proxy to SendJim API (keeps credentials server-side)
// POST { action, payload } where action = "send" | "quicksends" | "balance"
// Deploy: supabase functions deploy sendjim-send --no-verify-jwt
//
// Required secrets:
//   supabase secrets set SENDJIM_CLIENT_KEY=xxx SENDJIM_CLIENT_SECRET=yyy

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_KEY = Deno.env.get("SENDJIM_CLIENT_KEY") || "";
const CLIENT_SECRET = Deno.env.get("SENDJIM_CLIENT_SECRET") || "";
const BASE = "https://api.sendjim.com/api";

function cors(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
    },
  });
}

function authHeader(): string {
  const creds = btoa(`${CLIENT_KEY}:${CLIENT_SECRET}`);
  return `Bearer ${creds}`;
}

async function sj(path: string, method = "GET", body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      "Authorization": authHeader(),
      "api_version": "3",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors("", 200);
  if (req.method !== "POST") return cors(JSON.stringify({ error: "POST only" }), 405);
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    return cors(JSON.stringify({ error: "SendJim credentials not configured. Set SENDJIM_CLIENT_KEY and SENDJIM_CLIENT_SECRET in Supabase secrets." }), 503);
  }

  let body: { action: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return cors(JSON.stringify({ error: "Invalid JSON" }), 400); }

  const { action, payload } = body;

  if (action === "balance") {
    const data = await sj("/user");
    return cors(JSON.stringify(data));
  }

  if (action === "quicksends") {
    const data = await sj("/quicksends");
    return cors(JSON.stringify(data));
  }

  if (action === "send") {
    // payload: { quickSendId, contact: { firstName, lastName, address, city, state, zip, email, phone } }
    const { quickSendId, contact } = payload as { quickSendId: number; contact: Record<string, string> };
    if (!quickSendId || !contact) return cors(JSON.stringify({ error: "quickSendId and contact required" }), 400);
    const data = await sj("/contact-quicksend", "POST", {
      QuickSendID: quickSendId,
      ContactData: {
        FirstName: contact.firstName || "",
        LastName:  contact.lastName  || "",
        StreetAddress:  contact.address || contact.street || "",
        StreetAddress2: contact.address2 || "",
        City:        contact.city  || "",
        State:       contact.state || "NY",
        PostalCode:  contact.zip   || "",
        Email:       contact.email || "",
        PhoneNumber: (contact.phone || "").replace(/\D/g, ""),
        Tags:        ["second-nature-tree"],
      },
    });
    return cors(JSON.stringify(data));
  }

  return cors(JSON.stringify({ error: "Unknown action" }), 400);
});
