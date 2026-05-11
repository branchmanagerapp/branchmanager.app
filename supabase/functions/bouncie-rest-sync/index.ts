// v741: bouncie-rest-sync — pulls vehicle positions from the Bouncie REST
// API and upserts into vehicle_positions. Complement to bouncie-webhook
// (real-time but lossy when delivery dies or our endpoint is down). REST
// sync backfills the gaps and is per-tenant.
//
// AUTH MODEL
// Each tenant that wants REST sync must complete the OAuth handshake once
// via the bouncie-oauth-callback function — that stores access_token +
// refresh_token on tenants.config.bouncie. This function loops over
// tenants with a configured token, refreshing them as needed.
//
// Endpoints (under BOUNCIE_API_BASE, default https://api.bouncie.dev/v1):
//   GET /vehicles
//   GET /trips?imei={imei}&starts-after={iso}&gps-format=geojson
// Verified May 10 2026: /v1/vehicles returns 401 with no token (path
// exists); /api/vehicles returns 404 (wrong path).
//
// Token refresh: POST https://auth.bouncie.com/oauth/token with
// grant_type=refresh_token + client_id + client_secret. Updated tokens
// are written back to tenants.config.bouncie.
//
// Schedule: pg_cron every 15 min (see scripts/seed_bouncie_cron.sql).
//
// Run manually (no body needed):
//   curl -i -X POST \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//     "https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bouncie-rest-sync"

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("BOUNCIE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("BOUNCIE_CLIENT_SECRET") ?? "";
const TOKEN_URL = Deno.env.get("BOUNCIE_TOKEN_URL") ?? "https://auth.bouncie.com/oauth/token";
const BOUNCIE_API_BASE = (Deno.env.get("BOUNCIE_API_BASE") ?? "https://api.bouncie.dev/v1").replace(/\/+$/, "");

interface BouncieTenantConfig {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string;
}

interface BounciePoint { ts: string; lat: number; lon: number; speed_mph?: number | null }
interface BouncieTrip {
  transactionId?: string;
  imei?: string;
  startTime?: string;
  endTime?: string;
  gps?: {
    coordinates?: Array<[number, number]>;
    timestamps?: string[];
    speeds?: number[];
  };
}
interface BouncieVehicle { imei?: string; vin?: string }

function pointsFromTrip(t: BouncieTrip): BounciePoint[] {
  const out: BounciePoint[] = [];
  const coords = t.gps?.coordinates ?? [];
  const stamps = t.gps?.timestamps ?? [];
  const speeds = t.gps?.speeds ?? [];
  const n = Math.min(coords.length, stamps.length);
  for (let i = 0; i < n; i++) {
    const c = coords[i];
    const ts = stamps[i];
    if (!c || c.length < 2 || !ts) continue;
    out.push({ ts, lon: c[0], lat: c[1], speed_mph: typeof speeds[i] === "number" ? speeds[i] : null });
  }
  return out;
}

async function refreshBouncieToken(refreshToken: string): Promise<BouncieTenantConfig | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!r.ok) {
    console.error("BOUNCIE_REFRESH_FAIL", r.status, (await r.text()).slice(0, 200));
    return null;
  }
  const j = await r.json();
  if (!j.access_token) return null;
  const expiresIn = (j.expires_in as number) ?? 3600;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? refreshToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: j.scope ?? "",
  };
}

async function bouncieGet<T>(token: string, path: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  const url = `${BOUNCIE_API_BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, { headers: { Authorization: token, Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`BOUNCIE_REST ${res.status} ${url}`, body.slice(0, 300));
    return { ok: false, status: res.status, data: null };
  }
  return { ok: true, status: res.status, data: (await res.json()) as T };
}

async function syncTenant(sb: SupabaseClient, tenantId: string, cfg: BouncieTenantConfig) {
  let token = cfg.access_token;

  // Pre-refresh if expired (or expires in <5 min) and we have refresh_token
  const expSoon =
    cfg.expires_at && new Date(cfg.expires_at).getTime() < Date.now() + 5 * 60 * 1000;
  if (expSoon && cfg.refresh_token) {
    const refreshed = await refreshBouncieToken(cfg.refresh_token);
    if (refreshed) {
      token = refreshed.access_token;
      await saveTenantBouncie(sb, tenantId, refreshed);
    }
  }

  // Fetch vehicles, retry once after refresh if 401
  let vResp = await bouncieGet<BouncieVehicle[] | { vehicles?: BouncieVehicle[] }>(token, "/vehicles");
  if (!vResp.ok && vResp.status === 401 && cfg.refresh_token) {
    const refreshed = await refreshBouncieToken(cfg.refresh_token);
    if (refreshed) {
      token = refreshed.access_token;
      await saveTenantBouncie(sb, tenantId, refreshed);
      vResp = await bouncieGet<BouncieVehicle[] | { vehicles?: BouncieVehicle[] }>(token, "/vehicles");
    }
  }
  if (!vResp.ok) return { tenantId, error: `vehicles ${vResp.status}`, inserted: 0 };

  const raw = vResp.data;
  const vehicles: BouncieVehicle[] = Array.isArray(raw)
    ? raw
    : ((raw as { vehicles?: BouncieVehicle[] } | null)?.vehicles ?? []);

  let totalInserted = 0;
  const perVehicle: Array<{ imei: string; inserted: number; latestSeen: string | null }> = [];

  for (const bv of vehicles) {
    const imei = bv.imei;
    if (!imei) continue;

    let { data: localVehicle } = await sb
      .from("vehicles")
      .select("id, tenant_id, last_seen_at")
      .eq("tenant_id", tenantId)
      .eq("tracker_device_id", imei)
      .maybeSingle();

    if (!localVehicle && bv.vin) {
      const { data: byVin } = await sb
        .from("vehicles")
        .select("id, tenant_id, last_seen_at")
        .eq("tenant_id", tenantId)
        .eq("vin", bv.vin)
        .maybeSingle();
      localVehicle = byVin;
      if (localVehicle) {
        await sb
          .from("vehicles")
          .update({ tracker_device_id: imei, tracker_provider: "bouncie" })
          .eq("id", localVehicle.id);
      }
    }

    if (!localVehicle) continue;

    const { data: latestPing } = await sb
      .from("vehicle_positions")
      .select("ts")
      .eq("vehicle_id", localVehicle.id)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const startsAfter = latestPing?.ts && latestPing.ts > dayAgo ? latestPing.ts : dayAgo;

    const tResp = await bouncieGet<BouncieTrip[] | { trips?: BouncieTrip[] }>(
      token,
      `/trips?imei=${encodeURIComponent(imei)}&starts-after=${encodeURIComponent(startsAfter)}&gps-format=geojson`,
    );
    if (!tResp.ok) {
      perVehicle.push({ imei, inserted: 0, latestSeen: null });
      continue;
    }
    const rawT = tResp.data;
    const trips: BouncieTrip[] = Array.isArray(rawT)
      ? rawT
      : ((rawT as { trips?: BouncieTrip[] } | null)?.trips ?? []);

    let inserted = 0;
    let latestSeenTs: string | null = null;

    for (const trip of trips) {
      const pts = pointsFromTrip(trip);
      if (!pts.length) continue;
      const fresh = pts.filter((p) => !latestPing?.ts || p.ts > latestPing.ts);
      if (!fresh.length) continue;

      const rows = fresh.map((p) => ({
        tenant_id: localVehicle!.tenant_id,
        vehicle_id: localVehicle!.id,
        ts: p.ts,
        lat: p.lat,
        lon: p.lon,
        speed_mph: p.speed_mph ?? null,
        source: "bouncie-rest",
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error } = await sb.from("vehicle_positions").insert(slice);
        if (error) { console.error("BOUNCIE_INSERT_ERR", imei, error.message); break; }
        inserted += slice.length;
      }

      const lastTs = fresh[fresh.length - 1].ts;
      if (!latestSeenTs || lastTs > latestSeenTs) latestSeenTs = lastTs;
    }

    if (latestSeenTs && (!localVehicle.last_seen_at || latestSeenTs > localVehicle.last_seen_at)) {
      await sb.from("vehicles").update({ last_seen_at: latestSeenTs }).eq("id", localVehicle.id);
    }

    totalInserted += inserted;
    perVehicle.push({ imei, inserted, latestSeen: latestSeenTs });
  }

  return { tenantId, vehicles_seen: vehicles.length, inserted: totalInserted, perVehicle };
}

async function saveTenantBouncie(sb: SupabaseClient, tenantId: string, cfg: BouncieTenantConfig) {
  const { data: tenant } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  const nextConfig = { ...(tenant?.config ?? {}) };
  nextConfig.bouncie = { ...(nextConfig.bouncie ?? {}), ...cfg };
  await sb.from("tenants").update({ config: nextConfig }).eq("id", tenantId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Find every tenant with a Bouncie token configured
  const { data: tenants, error } = await sb
    .from("tenants")
    .select("id, config")
    .not("config->bouncie", "is", null);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!tenants?.length) {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "No tenants have a Bouncie token configured.",
        next: "Visit https://auth.bouncie.com/dialog/authorize?client_id=<BOUNCIE_CLIENT_ID>&redirect_uri=<callback>&response_type=code&state=<tenant_id> to bootstrap.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const results = [];
  for (const t of tenants) {
    const cfg = (t.config as { bouncie?: BouncieTenantConfig } | null)?.bouncie;
    if (!cfg?.access_token) continue;
    try {
      results.push(await syncTenant(sb, t.id, cfg));
    } catch (e) {
      results.push({ tenantId: t.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, tenants: results.length, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
