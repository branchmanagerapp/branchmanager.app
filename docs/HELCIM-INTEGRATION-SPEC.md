# Helcim Integration — Implementation Spec

**Status:** Deferred. Implement when one of the triggers below fires.
**Owner:** Doug Brown
**Created:** 2026-05-23

---

## Why we deferred

Today, SNT runs Stripe end-to-end:
- `tenants.config.stripe_base_link = https://buy.stripe.com/cNidR8amGda50ujfMP6g802`
- `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` in Supabase secrets
- 4 edge functions deployed (`stripe-create-link`, `stripe-webhook`, `stripe-charge`, `portal-pay-all`)
- Customer Portal "Pay all outstanding" wired
- Invoices auto-build pay URLs with cents-prefilled quantities

The current monetary impact of switching to (or adding) Helcim is ~$30-60/mo at SNT's volume vs ~30-60h of plumbing rewrite. **Bad math today, good math at scale.**

## Triggers — implement Helcim when ANY of these is true

1. **Field-crew taps cards on-site.** Driveway / curb / "card in hand right after the job" workflows. Helcim's mobile reader UX + interchange-plus per-swipe rate beats Stripe Terminal at SNT-style ticket sizes.
2. **Monthly processed volume ≥ $20k.** Per-transaction savings (Helcim interchange-plus vs Stripe flat) cross the threshold where switching cost pays back inside ~6 months.
3. **A BM friend-tenant already runs Helcim** and wants their BM instance to use their existing merchant account. Multi-processor support becomes a feature, not an internal optimization.

## Architecture target

### Phase A — Coexist with Stripe (additive)

`tenants.config.payments` becomes a structured object:

```json
{
  "stripe": {
    "base_link": "https://buy.stripe.com/...",
    "publishable_key": "pk_live_...",
    "enabled": true
  },
  "helcim": {
    "account_id": "...",
    "api_token": "...",
    "enabled": false
  },
  "default_processor": "stripe"
}
```

`tenants.config.stripe_base_link` (current flat field) is kept for back-compat — read both, write only the new nested form.

### Phase B — Per-invoice processor selection

When generating an invoice payment URL, the invoice can opt in to a non-default processor:

```sql
ALTER TABLE invoices ADD COLUMN processor text NULL;
-- Values: null (use tenant default), 'stripe', 'helcim'
```

UI: a "Pay via" dropdown on invoice detail. Default = tenant default, override per-invoice (rare).

### Phase C — In-person (tap-to-pay)

Helcim's Smart Terminal API (or Helcim Card Reader SDK in Capacitor) becomes the BM-app surface. Lives under a new "Tap to Pay" button on the job detail screen, gated by:
- Crew role
- A connected Helcim reader (paired via OS-level Bluetooth, mediated by their SDK)
- A specific invoice or "ad-hoc" amount

---

## API endpoints we'd need (edge functions)

```
supabase/functions/
├── helcim-save-keys/         # owner-gated, like plaid-save-keys
├── helcim-create-charge/     # POST { tenant_id, invoice_id, amount } → returns checkout URL
├── helcim-webhook/           # inbound payment events from Helcim
├── helcim-refund/            # admin-only refund initiation
└── _shared/helcim.ts         # resolveHelcimCreds(tenantId), helcimFetch(creds, path, body)
```

Same per-tenant cred resolver pattern as `_shared/plaid.ts` (v856).

## Client-side changes

### `src/helcim.js` (new) — mirror of `src/stripe.js`

```js
var Helcim = {
  isConnected: function() {
    return !!(localStorage.getItem('bm-helcim-saved') === '1');
  },
  buildPayUrl: function(invoiceId, amountDollars) { /* hit helcim-create-charge */ },
  paymentButton: function(invoiceId) { /* render <button> */ }
};
```

### `src/pages/settings.js` — add Helcim card

Same shape as the v856 Plaid card:
- account_id input
- api_token (password) input
- Save & verify button → hits `helcim-save-keys` edge fn
- Status pill: connected / not connected
- Test charge button (sandbox)

### `src/pages/invoices.js` — processor dropdown

In invoice detail's Payment section: if both Stripe AND Helcim are connected, render a `<select>` with the two options. Default to tenant default. Save selection on invoice row.

## Helcim sandbox account setup

Helcim provides sandbox accounts on signup (no production approval needed for testing). Doc: https://devdocs.helcim.com/docs/getting-started

Implementation should test against sandbox first, then flip env to production once everything proves out — same pattern we used for Plaid (v856).

## Migration / cutover plan (if eventually switching default)

1. Wire Helcim alongside Stripe (Phase A above). Stripe stays default.
2. Generate test invoices, pay one via each, verify both webhooks fire + reconcile in Books.
3. Customer-facing: keep Stripe links live for existing outstanding invoices. New invoices generated after the cutover use Helcim by default.
4. Old invoices keep their Stripe links forever — never break a payment URL we already sent a customer.
5. Watch BM's `payments` table for ~30 days post-cutover to confirm Helcim webhook reconciliation matches Stripe's previous behavior.

## Estimated effort

- Phase A (coexist + per-invoice override): 1.5 days
- Phase B (config UI + dashboard reconciliation polish): 0.5 day
- Phase C (in-person tap-to-pay): 3-4 days (Capacitor + SDK integration is the bulk)

Total ~5 days end-to-end. Most of that is Phase C; A+B alone is ~2 days for the bookkeeping benefit.

---

## When to revisit

Add a 30-day check after any of:
- First time monthly processed volume crosses $20k
- First customer asks "can I tap a card now"
- First BM tenant asks about Helcim integration

Until then, this doc waits.

*Last updated: 2026-05-23*
