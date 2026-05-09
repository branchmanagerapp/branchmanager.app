// Bouncie webhook receiver — accepts trip data + vehicle position updates
// from Bouncie OBD-II GPS trackers and stores in Supabase.
//
// Deploy:
//   supabase functions deploy bouncie-webhook --no-verify-jwt
//
// Then in Bouncie developer portal (https://www.bouncie.dev/):
//   Webhook URL: https://<project-ref>.supabase.co/functions/v1/bouncie-webhook
//   Events: connect, disconnect, tripStart, tripData, tripEnd, mil, battery
//
// Bouncie sends signed payloads — set BOUNCIE_WEBHOOK_KEY in Supabase env
// matching the secret you configured in the Bouncie portal. The function
// verifies the HMAC signature header `x-bouncie-signature` (sha256).
// (v694: env var was named BOUNCIE_WEBHOOK_SECRET in code but Doug's
// Supabase secret is BOUNCIE_WEBHOOK_KEY — code was reading empty string
// and falling back to fail-open. Renamed to match the actual secret name.)
//
// Tables expected: vehicles, vehicle_positions (created Apr 26, 2026)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantFromEvent } from "../_shared/tenant.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// v694: tries BOUNCIE_WEBHOOK_KEY first (the canonical name in Supabase secrets);
// falls back to BOUNCIE_WEBHOOK_SECRET in case the secret is later renamed.
const WEBHOOK_SECRET = Deno.env.get("BOUNCIE_WEBHOOK_KEY") || Deno.env.get("BOUNCIE_WEBHOOK_SECRET") || "";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Phase 2 — route by Bouncie account hash stored on tenants.config.bouncie_account.
// Falls back to SNT when not found (current single-tenant behavior).
async function tenantForBouncie(payload: Record<string, unknown>): Promise<string> {
  const acct = String(
    (payload as { account?: string; accountId?: string; account_id?: string }).account
    || (payload as { accountId?: string }).accountId
    || (payload as { account_id?: string }).account_id
    || "",
  );
  return await resolveTenantFromEvent(sb, "bouncie_account", acct);
}

async function verifyHmac(rawBody: string, sig: string): Promise<boolean> {
  // v694 audit: BOUNCIE_WEBHOOK_KEY env var IS set in Supabase secrets, but
  // bouncie pipeline is currently live and ingesting (Ram 2500, F-550, F-750
  // all reporting positions May 8 2026). That means EITHER Bouncie is sending
  // unsigned webhooks OR the signature isn't matching the stored key. Until
  // we confirm which, we can't safely fail-closed without breaking the live
  // pipeline. Logging loudly so the next audit can see — DO NOT remove this
  // warn until you've confirmed Bouncie's actual signing behavior in the
  // Bouncie dashboard (https://www.bouncie.dev/) and tightened this path.
  if (!WEBHOOK_SECRET) {
    console.warn("[bouncie-webhook] SECURITY: secret not configured — accepting unverified payload");
    return true;
  }
  if (!sig) {
    console.warn("[bouncie-webhook] SECURITY: payload arrived without x-bouncie-signature — accepting (legacy fail-open)");
    return true; // legacy behavior preserved; tighten once Bouncie signing is confirmed
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  // Bouncie sends as "sha256=<hex>"
  const provided = sig.replace(/^sha256=/, "");
  return hex === provided;
}

async function ensureVehicle(deviceId: string, vin?: string, nickname?: string, tenant_id?: string) {
  // Look up by tracker_device_id first, then by VIN
  let { data } = await sb.from("vehicles").select("id").eq("tracker_device_id", deviceId).maybeSingle();
  if (data?.id) return data.id;
  if (vin) {
    const r2 = await sb.from("vehicles").select("id").eq("vin", vin).maybeSingle();
    if (r2.data?.id) {
      await sb.from("vehicles").update({ tracker_device_id: deviceId, tracker_provider: "bouncie" }).eq("id", r2.data.id);
      return r2.data.id;
    }
  }
  // Auto-create — admin can later rename + assign metadata
  const { data: ins } = await sb.from("vehicles").insert({
    tenant_id,
    name: nickname || `Vehicle ${deviceId.slice(-4)}`,
    nickname: nickname || null,
    vin: vin || null,
    tracker_provider: "bouncie",
    tracker_device_id: deviceId,
    active: true,
  }).select("id").single();
  return ins?.id || null;
}

Deno.serve(async (req) => {
  // Verify probes (UptimeRobot HEAD pings, webhook provider preflights) get 200
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("bouncie-webhook ok", { status: 200 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await req.text();
  const headerDump: Record<string, string> = {};
  req.headers.forEach((v, k) => { headerDump[k] = v; });
  console.log("BOUNCIE_INBOUND_HEADERS", JSON.stringify(headerDump));
  console.log("BOUNCIE_INBOUND_BODY_HEAD", rawBody.slice(0, 500));
  const sig = req.headers.get("x-bouncie-signature") || "";
  if (!(await verifyHmac(rawBody, sig))) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400 }); }

  const event: string = payload.eventType || payload.event || "unknown";
  // v662 — Bouncie's actual payload shape (verified from production logs
  // 2026-05-08): IMEI/VIN are at the TOP LEVEL on every event type.
  // The payload sub-object key varies: `data` is an ARRAY of GPS pings on
  // tripData; `end` on tripEnd (odometer, no GPS); `metrics` on tripMetrics
  // (trip stats, no GPS); `start` on tripStart (single GPS).
  const deviceId: string = payload.imei || payload.device_id || payload.deviceId || payload.vin || "";
  const vin: string | undefined = payload.vin;
  if (!deviceId) return new Response(JSON.stringify({ ok: false, reason: "no device id", event }), { status: 200 });

  // Phase 2 — resolve tenant by Bouncie account hash from payload
  const TENANT_ID = await tenantForBouncie(payload);

  const vehicleId = await ensureVehicle(deviceId, vin, payload.nickName || payload.nickname, TENANT_ID);
  if (!vehicleId) return new Response(JSON.stringify({ ok: false, reason: "no vehicle", event }), { status: 200 });

  // Build the list of position pings to insert from this event.
  // tripData = array under .data; tripStart = single ping under .start;
  // tripEnd has no GPS (just odometer); tripMetrics = aggregate, no GPS.
  type Ping = { ts: string; lat: number; lon: number; speed?: number | null; heading?: number | null; ignition?: boolean | null; raw: any };
  const pings: Ping[] = [];
  const pushPing = (src: any) => {
    if (!src) return;
    const gps = src.gps || src.location || src;
    const lat = gps.lat ?? gps.latitude ?? src.lat ?? src.latitude;
    const lon = gps.lon ?? gps.lng ?? gps.longitude ?? src.lon ?? src.longitude;
    if (lat == null || lon == null) return;
    pings.push({
      ts: new Date(src.timestamp || src.ts || gps.timestamp || Date.now()).toISOString(),
      lat, lon,
      speed: src.speed ?? gps.speed ?? null,
      heading: src.heading ?? gps.heading ?? src.bearing ?? null,
      ignition: src.ignition ?? null,
      raw: src,
    });
  };
  if (Array.isArray(payload.data)) payload.data.forEach(pushPing);
  if (payload.start) pushPing(payload.start);
  if (payload.end) pushPing(payload.end);

  if (pings.length) {
    // Insert all pings into vehicle_positions
    const rows = pings.map((p) => ({
      vehicle_id: vehicleId, ts: p.ts, lat: p.lat, lon: p.lon,
      speed_mph: p.speed, heading: p.heading, ignition: p.ignition, raw: p.raw,
    }));
    await sb.from("vehicle_positions").insert(rows);
    // Update last-known cache from the most recent ping
    const last = pings.reduce((a, b) => (a.ts > b.ts ? a : b));
    await sb.from("vehicles").update({
      last_lat: last.lat, last_lon: last.lon, last_seen_at: last.ts,
      last_speed_mph: last.speed ?? null, last_ignition: last.ignition ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", vehicleId);
  }

  // Even with no GPS pings (tripEnd / tripMetrics), record the timestamp so
  // the vehicle shows as "recently seen" on dashboards.
  if (!pings.length) {
    const ts = new Date(
      payload.end?.timestamp || payload.metrics?.timestamp || payload.timestamp || Date.now(),
    ).toISOString();
    await sb.from("vehicles").update({
      last_seen_at: ts, updated_at: new Date().toISOString(),
    }).eq("id", vehicleId);
  }

  // Convenience aliases — the maintenance branches below still expect a `d`
  // pointer with the per-event payload subtree.
  const d: any = payload.start || payload.end || payload.metrics || payload;

  // ── Auto-create maintenance tasks based on Bouncie event types ──
  // Idempotent via source_event_id (partial unique index).
  async function maint(row: Record<string, unknown>) {
    row.tenant_id = TENANT_ID;
    row.vehicle_id = vehicleId;
    row.source = "bouncie";
    await sb.from("vehicle_maintenance").upsert(row, { onConflict: "source_event_id", ignoreDuplicates: true });
  }

  if (event === "mil" || event === "checkEngine" || d.mil === true) {
    const code = d.dtc || d.code || d.troubleCode || "MIL";
    await maint({
      kind: "check_engine",
      severity: "warning",
      title: "Check Engine: " + code,
      details: "Bouncie reported MIL on. " + (d.description || ""),
      source_event_id: `${deviceId}-mil-${code}-${Date.now().toString().slice(0, -4)}0000`,
      status: "open",
    });
  }

  if (event === "battery" && d.battery != null && d.battery < 12.0) {
    await maint({
      kind: "battery_low",
      severity: "warning",
      title: "Battery low: " + Number(d.battery).toFixed(1) + "V",
      details: "Bouncie reported vehicle battery below 12.0V — check / replace.",
      current_value: d.battery,
      source_event_id: `${deviceId}-batt-${Math.floor(Date.now() / 86400000)}`,
      status: "open",
    });
  }

  // Odometer milestones — every 5000 mi crossed since last event creates an oil-change task
  const odo = d.odometer ?? d.stats?.odometer ?? null;
  if (event === "tripEnd" && odo) {
    const milestoneInterval = 5000;
    const milestone = Math.floor(odo / milestoneInterval) * milestoneInterval;
    if (milestone > 0) {
      await maint({
        kind: "scheduled_service",
        severity: "info",
        title: `Oil change due (${milestone} mi)`,
        details: `Odometer crossed ${milestone} mi. Schedule oil + filter change.`,
        threshold_miles: milestone,
        current_value: odo,
        source_event_id: `${deviceId}-odo-${milestone}`,
        status: "open",
      });
    }
  }

  // Harsh-driving events (Bouncie sends as separate eventTypes)
  if (event === "harshAccel" || event === "harshBrake" || event === "speedingStart") {
    // not maintenance — log only via vehicle_positions raw column already.
  }

  return new Response(JSON.stringify({ ok: true, event, vehicleId }), {
    headers: { "content-type": "application/json" },
  });
});
