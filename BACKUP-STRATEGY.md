# Branch Manager — Backup Strategy

_Last reviewed: May 10 2026, post-v758._

## Current state — what's protected where

| Asset | Primary location | Redundancy | Risk |
|---|---|---|---|
| **Source code** | `~/Desktop/Tree/branchmanager-app/` | GitHub (`branchmanagerapp/branchmanager.app`), pushed on every bump | ✅ Low. Even if local disk dies, code is safe on GitHub. |
| **Supabase Postgres** | Supabase project `ltpivkqahvplapyagljt` (Pro plan, us-west-2) | Daily physical backups, 7-day retention (verified via API) | ⚠ Medium. If the project itself gets deleted/locked, the daily backups go with it. No local copy. |
| **Supabase Storage** (photos in `job-photos` bucket) | Supabase Storage | None by us. Supabase keeps their own infra-level redundancy but objects are **not** included in the daily Postgres backups. | ⚠ Medium. Object loss = full photo loss. |
| **Snapshot zip backups** | `~/Desktop/Tree/Backups/` | One zip from May 5 (v598) — stale. | 🔴 High. |
| **Time Machine** | Not configured | None | 🔴 High. Single-disk-failure away from total loss of anything not on GitHub/Supabase. |
| **Per-device localStorage** | Each iPhone/desktop Doug uses | None (until CloudSync pushes to Supabase) | ⚠ Medium. Brand-new entries pre-sync are at risk. |

## What's in place after v758

### 1. `scripts/backup.sh`
Run from the repo root. Captures:
- Postgres data — preferred path is `pg_dump` (install `brew install libpq` once, set `SUPABASE_DB_PASSWORD`); fallback is per-table JSON dump via REST.
- Source snapshot — zip of repo without `dist/`, `.git/`, `node_modules/` (~16 MB at v758).

Output goes to `~/Desktop/Tree/Backups/YYYY-MM-DD_HHMM/`.

Verified May 10 2026: 22 tables (596 KB compressed) + v758 source zip (15 MB) successfully captured.

### 2. Supabase Pro daily backups
Already running server-side. List via:
```bash
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  https://api.supabase.com/v1/projects/ltpivkqahvplapyagljt/database/backups
```
Restore is dashboard-driven (Supabase Studio → Database → Backups).

## Recommended cadence

### Daily (automatic, already running)
Supabase daily physical backup. No action needed.

### Weekly (Doug's hand)
```bash
cd ~/Desktop/Tree/branchmanager-app
SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/backup.sh
```
Then drag `~/Desktop/Tree/Backups/<latest>/` to iCloud Drive or an external SSD for off-Mac redundancy.

### Before any risky migration
Run `./scripts/backup.sh` first. Five minutes of insurance.

## Gaps to close — Doug-side decisions

These are decisions only Doug can make, not autonomous fixes:

1. **Time Machine** — buy a 2 TB external SSD ($80–120) and turn on Time Machine. Single biggest local-data risk reducer for the whole Mac, not just BM.
2. **iCloud Drive sync of `~/Desktop/Tree/Backups/`** — toggle the Desktop iCloud sync on, or symlink the Backups folder into iCloud Drive manually. Free with paid iCloud tier; if Mac dies, backups survive.
3. **PITR (Point-in-Time-Recovery)** — Supabase add-on, $100/mo. Enables restoring to any second within the retention window instead of yesterday's snapshot. Worth it once Doug has a paying tenant beyond himself. Right now the 24h granularity is acceptable.
4. **Storage bucket export** — not in `backup.sh` because the bucket is large. The `photos` table dump captures every URL + metadata; if a restore is ever needed, the actual JPEGs can be re-pulled from public URLs while they're still live, or Supabase support can restore the bucket. For belt-and-suspenders, run `npx supabase storage cp` against the bucket into Backups quarterly.
5. **Install `libpq`** — `brew install libpq` then `echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc`. Gives the backup script real `pg_dump` output (cleaner than the REST fallback for restore).

## How to restore

### Restore source code
```bash
git clone https://github.com/branchmanagerapp/branchmanager.app.git
# or unzip the most recent branchmanager-v*.zip from Backups
```

### Restore Postgres (via Supabase dashboard)
1. Supabase Studio → Project Settings → Database → Backups
2. Pick a date → "Restore"
3. Wait ~5 min for the project to spin up against the snapshot

### Restore from local pg_dump
```bash
psql "postgresql://postgres.PROJECT:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres" \
  < ~/Desktop/Tree/Backups/<date>/db.sql
```

### Restore from REST table dump
The JSON files in `tables.tar.gz` can be replayed via `supabase.from(table).insert(...)` per file, or imported as CSV via Supabase Studio. Order matters — restore tenants first, then user-scoped tables.
