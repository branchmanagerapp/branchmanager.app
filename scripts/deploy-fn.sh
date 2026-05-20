#!/bin/bash
# deploy-fn.sh — safe edge function deploy with smoke test
#
# Usage:
#   ./scripts/deploy-fn.sh <function-name>
#
# Why this script exists (May 2 2026):
# Twice today the dialpad-webhook function was deployed without the
# --no-verify-jwt flag. Each time, BM silently dropped every Dialpad
# webhook (401 UNAUTHORIZED_NO_AUTH_HEADER) for ~14 hours combined.
# Lead pipeline was offline. Doug found out by trying to use the app
# and noticing his Stripe SMS hadn't appeared.
#
# This script:
# 1. Knows which functions need verify_jwt=false (the webhook receivers
#    and public-facing endpoints) and passes the flag automatically.
# 2. Smoke-tests the function after deploy, asserting the response is
#    NOT 'UNAUTHORIZED_NO_AUTH_HEADER'.
# 3. Fails loudly if smoke test fails.

set -euo pipefail

PROJECT_REF="ltpivkqahvplapyagljt"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN env var required." >&2
  echo "  export SUPABASE_ACCESS_TOKEN=sbp_..." >&2
  exit 2
fi

# Functions that MUST be deployed with --no-verify-jwt (receive external
# webhooks or anonymous public traffic without Supabase JWTs).
PUBLIC_FNS=(
  dialpad-webhook
  bouncie-webhook
  bouncie-oauth-callback
  bouncie-rest-sync
  stripe-webhook
  resend-webhook
  request-notify
  quote-notify
  quote-update
  quote-fetch
  invoice-fetch
  portal-auth
  portal-session
  portal-update
  portal-pay-all
  tenant-by-slug
  bm-receptionist
  render-marketing-site
  send-email
  subscription-create-checkout
  plaid-link-token
  plaid-exchange-token
  plaid-webhook
  plaid-sync-transactions
)

FN="${1:-}"
if [ -z "$FN" ]; then
  echo "Usage: ./scripts/deploy-fn.sh <function-name>" >&2
  exit 2
fi

# Determine if this function needs --no-verify-jwt
NEEDS_PUBLIC=0
for f in "${PUBLIC_FNS[@]}"; do
  if [ "$f" = "$FN" ]; then NEEDS_PUBLIC=1; break; fi
done

echo "Deploying $FN..."
if [ "$NEEDS_PUBLIC" = "1" ]; then
  echo "  → public function, --no-verify-jwt"
  SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
    npx -y supabase functions deploy "$FN" \
    --project-ref "$PROJECT_REF" \
    --no-verify-jwt 2>&1 | tail -3
else
  echo "  → internal function, verify_jwt=true (default)"
  SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
    npx -y supabase functions deploy "$FN" \
    --project-ref "$PROJECT_REF" 2>&1 | tail -3
fi

# Smoke test: deploy succeeded only if function doesn't 401 the empty POST.
echo "Smoke test..."
URL="https://${PROJECT_REF}.supabase.co/functions/v1/${FN}"
if [ "$NEEDS_PUBLIC" = "1" ]; then
  # Public fn — should return its OWN error (not Supabase's JWT gate)
  RESP=$(curl -s -X POST "$URL" -H 'Content-Type: application/json' -d '{}' --max-time 8)
  if echo "$RESP" | grep -qi "UNAUTHORIZED_NO_AUTH_HEADER"; then
    echo "  ❌ FAIL: $FN returns Supabase JWT gate — verify_jwt did not stick."
    echo "  Response: $RESP" | head -c 200
    exit 1
  fi
  echo "  ✅ Smoke test passed: $RESP" | head -c 120
else
  # Internal fn — should 401 without auth header (that's expected)
  RESP=$(curl -s -X POST "$URL" -H 'Content-Type: application/json' -d '{}' --max-time 8)
  echo "  Response: $RESP" | head -c 120
fi
echo
echo "Done."
