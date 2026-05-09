/**
 * Branch Manager — Plaid transactions sync (v691)
 *
 * Pulls the latest transactions from Plaid for one or all linked items
 * and upserts into bank_transactions. Idempotent via UNIQUE
 * (account_id, external_id).
 *
 * Triggered by:
 *   - plaid-exchange-token (initial backfill, full_backfill=true)
 *   - plaid-webhook (when Plaid notifies new data is ready)
 *   - manual UI "Sync now" button
 *   - pg_cron (every 4 hours)
 *
 * Request: POST { tenant_id, item_id?, full_backfill? }
 *   - item_id: sync only this item's accounts (else: all active items for tenant)
 *   - full_backfill: pull last 24mo (else: incremental since cursor)
 *
 * Response: { synced: N, by_account: {...} }
 *
 * Env vars: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy: supabase functions deploy plaid-sync-transactions --no-verify-jwt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID') || '';
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') || '';
const PLAID_ENV = (Deno.env.get('PLAID_ENV') || 'sandbox').toLowerCase();
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;
const SUPA_URL = Deno.env.get('SUPABASE_URL') || 'https://ltpivkqahvplapyagljt.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function err(m: string, status = 400) {
  return new Response(JSON.stringify({ error: m }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function plaid(path: string, body: any) {
  const r = await fetch(`${PLAID_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, ...body }),
  });
  const data = await r.json();
  if (!r.ok || data.error_code) throw new Error(data.error_message || data.display_message || 'plaid error');
  return data;
}

async function supa(method: string, path: string, body?: any) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`supabase ${method} ${path}: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// Map Plaid's category hierarchy to BM chart-of-accounts codes (loose mapping —
// user can override per transaction). Plaid returns categories like
// ["Travel","Gas Stations"] or ["Food and Drink","Restaurants"].
function autoCategorize(plaidCategories: string[] | null, name: string, amount: number): string {
  const cats = (plaidCategories || []).map(c => c.toLowerCase());
  const n = (name || '').toLowerCase();

  // Income (positive amounts in Plaid's outflow convention = inflows)
  if (amount < 0) {
    if (n.includes('stripe')) return '4000'; // Service Revenue (Stripe payout)
    if (cats.some(c => c.includes('deposit') || c.includes('transfer in'))) return '4000';
    return '4900'; // Other Income
  }

  // Outflows
  if (cats.some(c => c.includes('gas station')) || /shell|sunoco|exxon|mobil|chevron|bp gas|gulf|valero|76|arco/.test(n)) return '6200';
  if (cats.some(c => c.includes('automotive') || c.includes('auto repair'))) return '6220';
  if (/messick|r&l parts|napa|advance auto|autozone|pep boys|oreilly|o'reilly/.test(n)) return '6220';
  if (/bandit|vermeer|morbark/.test(n)) return '6410';
  if (/home depot|lowes|lowe's|menards/.test(n)) return '5200';
  if (cats.some(c => c.includes('hardware'))) return '5200';
  if (cats.some(c => c.includes('food') || c.includes('restaurant'))) return '6810';
  if (/uber|lyft|airline|southwest|delta|hotel|marriott|hilton/.test(n)) return '6800';
  if (/at&t|verizon|t-mobile|comcast|spectrum|dialpad/.test(n)) return '6510';
  if (/google|apple|microsoft|adobe|zoom|github|notion|figma|claude|openai|anthropic/.test(n)) return '6500';
  if (/insurance|nysif|geico|progressive|liberty mutual|travelers/.test(n)) return '6300';
  if (/payroll|gusto|onpay|adp|paychex/.test(n)) return '6100';
  if (cats.some(c => c.includes('payroll') || c.includes('wages'))) return '6100';
  if (cats.some(c => c.includes('bank fees'))) return '6900';
  if (n.includes('stripe')) return '6910';
  if (cats.some(c => c.includes('transfer'))) return '7100'; // transfer between own accounts
  return '6999'; // Other / Uncategorized
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return err('POST only', 405);
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) return err('Plaid credentials not configured', 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty for cron */ }
  const tenantId = body.tenant_id ? String(body.tenant_id).trim() : null;
  const itemId = body.item_id ? String(body.item_id).trim() : null;
  const fullBackfill = !!body.full_backfill;

  // Fetch which items to sync. Group by item to share access_token across accounts.
  let where = '?active=eq.true&select=plaid_item_id,plaid_access_token,plaid_account_id,id,tenant_id&plaid_item_id=not.is.null';
  if (tenantId) where += `&tenant_id=eq.${encodeURIComponent(tenantId)}`;
  if (itemId) where += `&plaid_item_id=eq.${encodeURIComponent(itemId)}`;

  let accounts: any[] = [];
  try {
    accounts = await supa('GET', `bank_accounts${where}`);
  } catch (e) {
    return err(`Failed to load accounts: ${(e as Error).message}`, 500);
  }

  // Group by item_id to deduplicate Plaid calls
  const byItem: Record<string, { access: string, accounts: any[] }> = {};
  for (const a of accounts) {
    if (!a.plaid_item_id || !a.plaid_access_token) continue;
    if (!byItem[a.plaid_item_id]) byItem[a.plaid_item_id] = { access: a.plaid_access_token, accounts: [] };
    byItem[a.plaid_item_id].accounts.push(a);
  }

  const startDate = fullBackfill
    ? new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0] // 2 years
    : new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]; // 30 days
  const endDate = new Date().toISOString().split('T')[0];

  const result: Record<string, number> = {};
  let totalSynced = 0;

  for (const [iid, { access, accounts: accs }] of Object.entries(byItem)) {
    try {
      // Use legacy /transactions/get for simplicity. /transactions/sync is
      // cleaner with cursors but adds bookkeeping; revisit in Phase 2.
      let offset = 0;
      const pageSize = 500;
      const aIdByPlaidId: Record<string, { id: string, tenant_id: string }> = {};
      for (const a of accs) aIdByPlaidId[a.plaid_account_id] = { id: a.id, tenant_id: a.tenant_id };

      while (true) {
        const resp = await plaid('/transactions/get', {
          access_token: access,
          start_date: startDate,
          end_date: endDate,
          options: { count: pageSize, offset },
        });
        const txns = resp.transactions || [];
        if (!txns.length) break;

        const rows = txns.map((t: any) => {
          const accMatch = aIdByPlaidId[t.account_id];
          if (!accMatch) return null;
          // Plaid amounts: outflow = positive, inflow = negative. We invert
          // to BM convention (inflow = positive) for display.
          const amt = -(t.amount as number);
          return {
            tenant_id: accMatch.tenant_id,
            account_id: accMatch.id,
            posted_date: t.date,
            amount: amt,
            description: t.name || t.merchant_name || '—',
            merchant_name: t.merchant_name || null,
            category: autoCategorize(t.category || null, t.name || '', t.amount || 0),
            plaid_category: t.category || null,
            pending: !!t.pending,
            source: 'plaid',
            external_id: t.transaction_id,
            raw: t,
          };
        }).filter(Boolean);

        if (rows.length) {
          // Upsert via Prefer: resolution=merge-duplicates on the unique
          // (account_id, external_id) constraint.
          await supa('POST', 'bank_transactions?on_conflict=account_id,external_id', rows);
          totalSynced += rows.length;
          result[iid] = (result[iid] || 0) + rows.length;
        }

        if (txns.length < pageSize) break;
        offset += pageSize;
        if (offset >= 10000) break; // safety cap
      }
    } catch (e) {
      console.error(`Sync failed for item ${iid}:`, (e as Error).message);
      result[iid] = -1;
    }
  }

  return new Response(JSON.stringify({ synced: totalSynced, by_item: result }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
