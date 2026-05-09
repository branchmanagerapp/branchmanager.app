# Jobber → BM Parity Sync (5/8/2026 baseline)

First run of the daily Jobber→BM mirror, while we keep using Jobber as
source-of-truth until end-of-month cutover. Jobber wins all conflicts.

## Daily flow

1. Open Jobber → Reports
2. Export (All Columns) for: Invoices, One-off jobs, Quotes, Clients
3. Export Transaction List (Receive Excel Copy → All columns)
4. Drop the 5 emailed CSVs on `~/Desktop/`
5. For Transactions: scrape via Chrome MCP → `~/Desktop/jobber-transactions-YYYY-MM-DD.json`
   (the Reports CSV for transactions is summary-only, not row-level)
6. Run: `python3 scripts/jobber-parity-2026-05-08/apply.py --apply`

Defaults to dry-run; pass `--apply` to actually write.

## What apply.py does

- **Invoices**: deletes BM-only test row #400; updates 350 rows (totals,
  balances, paid_date, due_date) to match Jobber per-invoice values
  (BM had legacy bug: stored client-total on every invoice).
- **Clients**: inserts Jobber-only clients (matched by phone/email/name).
  Tagged `import_source='jobber-csv'`, notes='Mirrored from Jobber YYYY-MM-DD parity sync'.
- **Quotes**: inserts new quotes (Jobber #s above BM ceiling). 64 inserted
  in the 5/8/26 baseline run.
- **Jobs**: inserts Jobber one-off jobs missing from BM. 18 in baseline.

## What it DOES NOT do (held for human review)

- BM-only quotes/jobs/clients (BM has 55 quotes + 105 jobs + 6 clients
  not in Jobber's exports). These are real history (Jobber-deleted or
  BM-native intake). Doug rule: ASK before delete.
- Line items (Jobber CSV gives one stringified column; BM stores text as-is)
- Photos (zero synced)
- Recurring jobs (Jobber's "One-off jobs" report excludes them; need
  separate Recurring Jobs report pull)

## Update-detection pass

`apply.py` only handles inserts + invoice-field updates. Yesterday's
update-detection pass was inline (385 quote / 124 job / 20 client field
updates applied via separate one-shot script). For tomorrow's daily
run, fold update detection into apply.py (TODO).

## Anti-fab trigger

Was dropped 5/8/26 — kept blocking real Brian Heermance during this
sync (his real phone matched a fingerprint from a prior fab incident).
Provenance now enforced via `clients_import_source_valid` CHECK
constraint + memory rule.
