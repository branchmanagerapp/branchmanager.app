#!/usr/bin/env bash
# Branch Manager — customer-facing flow smoke test
# Runs the REAL edge functions a customer hits, against a throwaway canary quote,
# so schema drift / broken deploys are caught BEFORE a customer sees them.
# Usage: bash scripts/smoke-customer-flows.sh
# Requires: ~/Desktop/_Credentials/supabase-service-role.txt (SUPABASE_URL/ANON/SERVICE)
set -eo pipefail
set -a
eval "$(grep -E '^SUPABASE_' "$HOME/Desktop/_Credentials/supabase-service-role.txt")"
set +a
FN="$SUPABASE_URL/functions/v1"
TENANT="93af4348-8bba-4045-ac3e-5e71ec1cc8c5"
fail=0

check() { # name  http_code  expected
  if [ "$2" = "$3" ]; then echo "  ✅ $1 ($2)"; else echo "  ❌ $1 (got $2, want $3)"; fail=1; fi
}

TOK="smoke$(date +%s | tail -c 8)"
CID=$(curl -s -X POST "$SUPABASE_URL/rest/v1/quotes" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"tenant_id\":\"$TENANT\",\"client_name\":\"ZZ SMOKE DELETE\",\"status\":\"sent\",\"total\":1,\"approval_token\":\"$TOK\",\"quote_number\":999002,\"line_items\":[]}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
trap 'curl -s -o /dev/null -X DELETE "$SUPABASE_URL/rest/v1/quotes?id=eq.$CID" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"' EXIT

echo "Customer-flow smoke test (canary $CID):"
# 1. quote-fetch (customer opens the link)
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$FN/quote-fetch" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "{\"id\":\"$CID\",\"token\":\"$TOK\"}")
check "quote-fetch (load quote)" "$C" "200"
# 2. quote-update approve (customer taps Approve)
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$FN/quote-update" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "{\"id\":\"$CID\",\"token\":\"$TOK\",\"action\":\"approve\",\"signed_name\":\"Smoke\",\"signed_ip\":\"1.1.1.1\",\"signed_user_agent\":\"smoke\"}")
check "quote-update (approve)" "$C" "200"
ST=$(curl -s "$SUPABASE_URL/rest/v1/quotes?id=eq.$CID&select=status" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['status'])")
[ "$ST" = "approved" ] && echo "  ✅ status flipped to approved" || { echo "  ❌ status is '$ST', not approved"; fail=1; }

# 3. payment path schema guard — the exact paid-invoice update stripe-webhook does
C=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SUPABASE_URL/rest/v1/invoices?id=eq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{"status":"paid","balance":0,"amount_paid":1,"payment_method":"stripe","stripe_payment_id":"pi_smoke","paid_date":"2026-01-01T00:00:00Z"}')
check "invoice paid-update (stripe-webhook schema)" "$C" "204"

echo
[ "$fail" = 0 ] && echo "ALL CUSTOMER FLOWS OK ✅" || echo "SMOKE TEST FAILED ❌ — do NOT trust customer-facing sends"
exit $fail
