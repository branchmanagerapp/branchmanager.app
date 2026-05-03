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
// Bouncie sends signed payloads — set BOUNCIE_WEBHOOK_SECRET in Supabase env
// matching the secret you configured in the Bouncie portal. The function
// verifies the HMAC signature header `x-bouncie-signature` (sha256).
//
// Tables expected: vehicles, vehicle_positions (created Apr 26, 2026)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantFromEvent } from "../_shared/tenant.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("BOUNCIE_WEBHOOK_SECRET") || "";
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
  if (!WEBHOOK_SECRET) return true; // dev mode — no verification
  if (!sig) return false;
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
  const d = payload.data || payload;
  const deviceId: string = d.imei || d.device_id || d.deviceId || d.vin || "";
  const vin: string | undefined = d.vin;
  if (!deviceId) return new Response(JSON.stringify({ ok: false, reason: "no device id" }), { status: 200 });

  // Phase 2 — resolve tenant by Bouncie account hash from payload
  const TENANT_ID = await tenantForBouncie(payload);

  const vehicleId = await ensureVehicle(deviceId, vin, d.nickName || d.nickname, TENANT_ID);
  if (!vehicleId) return new Response(JSON.stringify({ ok: false, reason: "no vehicle" }), { status: 200 });

  // Position — present on tripStart/tripData/tripEnd
  const loc = d.location || d.stats?.location || {};
  const lat = loc.lat ?? loc.latitude ?? d.latitude;
  const lon = loc.lon ?? loc.longitude ?? d.longitude;
  if (lat != null && lon != null) {
    const ts = new Date(d.timestamp || d.lastUpdated || Date.now()).toISOString();
    const speed = d.speed ?? d.stats?.speed ?? null;
    const heading = d.heading ?? d.bearing ?? null;
    const fuel = d.fuelLevel ?? d.stats?.fuelLevel ?? null;
    const odometer = d.odometer ?? d.stats?.odometer ?? null;
    const battery = d.battery ?? d.stats?.battery ?? null;
    const ignition = d.ignition ?? null;
    await sb.from("vehicle_positions").insert({
      vehicle_id: vehicleId, ts, lat, lon,
      speed_mph: speed, heading, fuel_level: fuel,
      odometer, battery, ignition, raw: d,
    });
    // Update last-known cache on vehicles row for fast list rendering
    await sb.from("vehicles").update({
      last_lat: lat, last_lon: lon, last_seen_at: ts,
      last_speed_mph: speed, last_ignition: ignition,
      updated_at: new Date().toISOString(),
    }).eq("id", vehicleId);
  }

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
