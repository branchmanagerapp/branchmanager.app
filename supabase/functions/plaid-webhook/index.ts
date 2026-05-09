/**
 * Branch Manager — Plaid webhook receiver (v691)
 *
 * Plaid POSTs here when transactions are ready, accounts change, or an
 * item enters an error state. We log the event and trigger a sync for
 * INITIAL_UPDATE / HISTORICAL_UPDATE / DEFAULT_UPDATE.
 *
 * No JWT verify. Plaid signs requests with HMAC-SHA256 in the
 * `Plaid-Verification` header — verifying signatures requires a public
 * key fetch per webhook (TODO Phase 2 hardening).
 *
 * Deploy: supabase functions deploy plaid-webhook --no-verify-jwt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPA_URL = Deno.env.get('SUPABASE_URL') || 'https://ltpivkqahvplapyagljt.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  let body: any = {};
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const code = body.webhook_code;
  const itemId = body.item_id;

  // Trigger sync for transaction-related codes
  if (['INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE', 'TRANSACTIONS_REMOVED', 'SYNC_UPDATES_AVAILABLE'].includes(code)) {
    fetch(`${SUPA_URL}/functions/v1/plaid-sync-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ item_id: itemId, full_backfill: code === 'HISTORICAL_UPDATE' }),
    }).catch((e) => console.warn('sync trigger failed:', e));
  }

  // Always 200 — Plaid retries 4xx/5xx
  return new Response(JSON.stringify({ ok: true, received: code }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
