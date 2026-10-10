// Supabase Edge Function — AI Chat Proxy
// Routes AI API calls server-side so the API key is never exposed to the browser
// Deploy: supabase functions deploy ai-chat --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  // Health probe — UptimeRobot, audit scripts, and Doug's smoke checks all
  // hit GET /functions/v1/ai-chat. Without this they get 500 on the JSON
  // parse below. Return 200 so monitors see green.
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('ai-chat ok', { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' } })
  }

  try {
    const { messages, system, model, max_tokens, apiKey } = await req.json()

    // Prefer the server-side secret so the key never has to leave the client's
    // localStorage. Clients can still send apiKey as a fallback for dev/test,
    // but production flow is: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
    const key = Deno.env.get('ANTHROPIC_API_KEY') || apiKey
    if (!key) {
      return new Response(JSON.stringify({
        error: 'No AI API key configured. Set ANTHROPIC_API_KEY as a Supabase function secret, or paste a key in BM Settings.'
      }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5',
        max_tokens: max_tokens || 1024,
        system: system || '',
        messages,
      }),
    })

    const data = await response.text()
    return new Response(data, {
      status: response.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
