# QuickBooks-Lite — Plan Doc

A built-in basic bookkeeping module for Branch Manager. Pulls bank
transactions, auto-categorizes against the chart of accounts, generates
P&L / cash-flow / tax-time exports.

Status: **planning** — written 2026-05-09. No code yet.

---

## Goal

Replace QuickBooks for tree-service-style operations: ~5–25 employees,
$300k–$2M revenue, mostly cash + check + Stripe + ACH. Doug's threshold:
"basic version that pulls my bank info in." Not full GAAP accounting,
not payroll tax filing, not advanced inventory. Just:

- Pull bank transactions
- Categorize them (auto + manual)
- Tie to existing BM expenses + invoices + payments
- Show monthly / YTD P&L
- Export tax-ready CSVs

## What we already have

| Existing in BM | Notes |
|---|---|
| `payments` table | 363 rows from Stripe + Jobber Payments + checks logged manually |
| `invoices` table | 351 rows; total / balance / amount_paid per row |
| `expenses` table (cloud) + `bm-expenses` localStorage | 0 + N rows; categorized by tenant |
| `Expenses` page | Add/edit/delete, monthly totals, fixed-cost calculator |
| Stripe integration | Webhook for payments + payouts already firing |

## What's missing

| Need | Why |
|---|---|
| Bank account connection | Pull every transaction across all accounts (chase business checking, savings, etc.) |
| Categorization rules engine | Auto-tag "HOME DEPOT 4023" → Materials, "SHELL OIL" → Fuel |
| Reconciliation UI | Mark transactions as matched-to-invoice or matched-to-expense |
| Chart of accounts | Income, COGS, OpEx, Capital, Liabilities — IRS-1040-Schedule-C aligned |
| Reports | Monthly P&L, YTD P&L, Cash Flow, Tax Summary, A/R, A/P aging |
| Export | TurboTax-friendly + accountant-handoff CSV |

## Architecture decision: Plaid vs. CSV-only

### Option A: Plaid (auto-pulled bank data)
- **Cost**: $0.30 / linked account / mo for 1k–10k accounts; sandbox free
- **Coverage**: 12,000+ banks via OAuth
- **UX**: User clicks "Connect bank", Plaid Link popup, done. Transactions pull every 4 hours
- **Latency**: 24–48hr lag for some banks; some are real-time
- **Risk**: Plaid Link UI is its own modal, opens in popup
- **Compliance**: Plaid handles SOC 2, no PCI on our side

### Option B: Manual CSV upload
- **Cost**: $0
- **Coverage**: Any bank that exports CSV/OFX (basically all)
- **UX**: User downloads CSV monthly, drops in BM. Manual.
- **Latency**: Whatever the user's update cadence is
- **Risk**: User forgets, files get out of sync
- **Compliance**: Nothing

### Option C: Both
Start with Option B (CSV upload, ship in 1 week). Add Option A later
once volume justifies the per-account fee.

**Recommendation**: B first. Most tree-service operators have 1–3 bank
accounts and manually downloading CSVs once a month is fine.

## Phased rollout

### Phase 1 — Foundation (1 week)
- New Supabase table: `bank_transactions` (id, tenant_id, account_id, date, amount, description, balance, category, matched_to_id, matched_to_kind, source, raw_csv_row)
- New Supabase table: `bank_accounts` (id, tenant_id, name, type, last_4, balance_current, balance_as_of)
- New Supabase table: `chart_of_accounts` (id, tenant_id, code, name, type, parent_id) — seeded with Schedule-C-aligned defaults
- BM page: **Reports → Books** — top-level summary, account list, recent transactions
- CSV importer with column auto-detect (Date / Amount / Description / Balance)

### Phase 2 — Categorization (1 week)
- Auto-categorize via:
  - Vendor-name match (HOME DEPOT → Materials)
  - Amount + date heuristic (recurring $1912 → Truck Payment)
  - User-defined rules ("anything from Verizon → Phone")
- Inline category dropdown on each transaction row
- Bulk-categorize (select 10, set category, save)

### Phase 3 — Reconciliation (1–2 weeks)
- Match BM payments → bank deposits (Stripe payout = N invoice payments aggregated)
- Match BM expenses → bank withdrawals
- Match remaining transactions to chart-of-accounts categories
- "Unmatched" filter for stuff that needs attention

### Phase 4 — Reports (1 week)
- Monthly P&L (revenue / COGS / gross margin / OpEx / net income)
- Cash flow (sources + uses)
- A/R aging (already partially in BM)
- Tax summary (Schedule C lines pre-filled)
- Year-to-date roll-up

### Phase 5 — Plaid integration (optional, later)
- Add "Connect bank" button → Plaid Link
- Plaid webhook for transaction sync
- Replace CSV upload with auto-pull

## Schema sketch (Phase 1)

```sql
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,                    -- "Chase Business Checking"
  bank_name TEXT,                        -- "Chase"
  account_type TEXT,                     -- 'checking' / 'savings' / 'credit_card' / 'loan'
  last_4 TEXT,
  balance_current NUMERIC(12,2),
  balance_as_of DATE,
  plaid_item_id TEXT,                    -- null if CSV-only
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  account_id UUID REFERENCES bank_accounts(id),
  posted_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,         -- positive = inflow, negative = outflow
  description TEXT NOT NULL,
  category TEXT,                         -- references chart_of_accounts.code
  -- Reconciliation
  matched_to_kind TEXT,                  -- 'invoice' / 'payment' / 'expense' / 'transfer' / 'manual'
  matched_to_id UUID,
  reconciled BOOLEAN DEFAULT false,
  -- Provenance
  source TEXT,                           -- 'csv-chase' / 'plaid' / 'manual'
  external_id TEXT,                      -- Plaid transaction_id or row hash
  raw JSONB,                             -- full source row, for debugging
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, external_id)       -- dedup on re-import
);

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL,                    -- '4000', '5100', '6200', etc.
  name TEXT NOT NULL,                    -- 'Service Revenue', 'Truck Fuel', 'Insurance'
  account_type TEXT NOT NULL,            -- 'income' / 'cogs' / 'opex' / 'asset' / 'liability' / 'equity'
  schedule_c_line TEXT,                  -- '1', '8', '9', etc. for tax mapping
  parent_id UUID,
  active BOOLEAN DEFAULT true,
  UNIQUE (tenant_id, code)
);
```

## Tax-time output

Tree-service Schedule C (Form 1040) lines we should auto-map:

| Line | Label | BM source |
|---|---|---|
| 1 | Gross receipts | sum(payments.amount where type='income') |
| 4 | Cost of goods sold | sum(expenses where category in COGS list) |
| 9 | Car & truck expenses | sum(expenses where category='vehicle' or 'fuel') |
| 11 | Contract labor | sum(expenses where category='subcontractor') |
| 13 | Depreciation | TODO — needs equipment cost basis tracking |
| 15 | Insurance | sum(expenses where category='insurance') |
| 17 | Legal & professional | sum(expenses where category='legal') |
| 18 | Office expense | sum(expenses where category='office') |
| 21 | Repairs & maintenance | sum(expenses where category='vehicle_maintenance' or 'equipment_repair') |
| 22 | Supplies | sum(expenses where category='supplies') |
| 23 | Taxes & licenses | sum(expenses where category='taxes' or 'permits') |
| 24a | Travel | sum(expenses where category='travel') |
| 24b | Meals | sum(expenses where category='meals') × 50% |
| 25 | Utilities | sum(expenses where category='utilities') |
| 26 | Wages | sum(payroll where status='paid') |

## Risks

1. **Bank CSV format drift** — banks change their export formats. Mitigation: column auto-detect on header names + manual mapping override.
2. **Reconciliation is painful** — matching bank deposits to Stripe payouts requires joining on (date ± 1d, amount, account). False matches will happen. Mitigation: match suggestions are suggestions, user confirms each.
3. **Schedule-C alignment is opinionated** — different accountants categorize differently (is a chainsaw a "supply" or a "tool depreciation"?). Mitigation: show category in plain English + IRS line; let user override per-transaction.
4. **No double-entry** — we're tracking single-entry P&L. Cash-basis only, accrual-basis is a Phase 6 stretch.

## Out of scope (forever)

- Payroll tax filing (use Gusto / OnPay / a real payroll provider)
- Sales tax remittance (use TaxJar / Avalara)
- Multi-currency
- Inventory accounting (FIFO/LIFO/specific-identification)
- Loan amortization schedules
- 1099 generation (deferred until Phase 6)

## Decision points needed before building

1. **Do we go Plaid or CSV-only for Phase 1?** Recommend CSV.
2. **Are we cash-basis only, or does Phase 4 add accrual?** Recommend cash-basis only.
3. **Per-tenant chart of accounts, or one global default?** Recommend per-tenant with global seed.
4. **Where does this live in nav?** Reports → Books, with a top-level shortcut.
5. **What's the MVP scope?** Phase 1 + Phase 2 (foundation + categorization) ships first; Phase 3+4 follow once the data is flowing.

## Estimated effort

- Phase 1: 5–8 days
- Phase 2: 3–5 days
- Phase 3: 5–8 days
- Phase 4: 3–5 days
- Phase 5 (Plaid): 5–7 days

**Total to QuickBooks parity**: 4–6 weeks of focused work. To "good enough to file taxes": 2–3 weeks (Phase 1 + 2 + lite Phase 4).

---

Doug — answers to the 5 decision points above will unblock Phase 1
build. Default-yes recommendations are noted; feel free to override.
