// Supabase Edge Function — Resend Email Proxy
// Solves CORS: browser → this function → Resend API
//
// v372: migrated SendGrid → Resend (SendGrid trial ends May 22, 2026; Resend
// is free at our volume and request-notify already uses it successfully).
// Old `apiKey` parameter is still accepted for backwards-compat but ignored —
// Resend key lives only as a server-side secret.
//
// v671: per-tenant FROM address support (Phase 2 of white-label SaaS).
// The BM client (src/email.js) now computes the correct FROM + replyTo
// using the Subscription module before calling, and passes them via the
// `from` and `replyTo` request fields. The server simply honors what the
// caller sends. Resolution order:
//
//   1. Caller-supplied `from` / `replyTo` (BM client + Stripe-webhook etc.)
//   2. RESEND_PLATFORM_FROM env var (BM-neutral fallback —
//      e.g. "Branch Manager <noreply@branchmanager.app>"). Doug should
//      verify branchmanager.app in Resend so this domain is acceptable.
//   3. RESEND_FROM_EMAIL env var (legacy, still honored).
//   4. Resend sandbox sender (`onboarding@resend.dev`) as last-resort.
//
// Trust model: BM is the only caller of /functions/v1/send-email; the
// browser anon key bounds calls per-tenant via RLS, and the BM bundle
// stamps the correct FROM for that tenant. Server-to-server callers
// (stripe-webhook etc.) pass `from` explicitly.
//
// Deploy: supabase functions deploy send-email --no-verify-jwt
// Required secrets: RESEND_API_KEY (always), RESEND_PLATFORM_FROM (recommended)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resolveFrom(callerFrom: string | undefined): { from: string; mode: string } {
  if (callerFrom && callerFrom.includes('@')) return { from: callerFrom, mode: 'caller' }
  const platformFrom = Deno.env.get('RESEND_PLATFORM_FROM') ?? Deno.env.get('RESEND_FROM_EMAIL') ?? ''
  if (platformFrom) return { from: platformFrom, mode: 'platform' }
  return { from: 'Branch Manager <onboarding@resend.dev>', mode: 'sandbox' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('send-email ok', { status: 200, headers: CORS_HEADERS })
  }

  try {
    const { to, subject, html, text, from, replyTo } = await req.json()

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html or text' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'No Resend API key configured (set RESEND_API_KEY secret)' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const sender = resolveFrom(from)
    const replyToAddr = replyTo || Deno.env.get('RESEND_REPLY_TO') || 'info@peekskilltree.com'
    const recipients = Array.isArray(to) ? to : [to]

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender.from,
        to: recipients,
        subject,
        text: text || undefined,
        html: html || undefined,
        reply_to: replyToAddr,
      }),
    })

    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      return new Response(JSON.stringify({ success: true, status: r.status, id: d?.id, from_mode: sender.mode }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const errText = await r.text()
    return new Response(JSON.stringify({ error: 'Resend error', status: r.status, details: errText.slice(0, 500), from_mode: sender.mode, from_attempted: sender.from }), {
      status: r.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
