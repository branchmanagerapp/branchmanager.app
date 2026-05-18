#!/bin/bash
# Branch Manager — local backup pipeline.
# Run from the BM repo root:    ./scripts/backup.sh
#
# Captures to ~/Desktop/Tree/Backups/<date>/:
#   1. Postgres data — preferred: pg_dump (.sql.gz), fallback: per-table JSON
#   2. Source snapshot — zip of repo minus dist/.git/node_modules
#
# What's NOT included:
#   - Supabase Storage objects (job-photos bucket) — too large; the
#     `photos` table dump captures URLs + metadata for re-attachment.
#   - localStorage on individual devices — those need their own sync.
#
# For full pg_dump support, install libpq once:    brew install libpq
# (pg_dump only — ~6 MB, much smaller than full postgres).

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATE="$(date +%Y-%m-%d_%H%M)"
OUT="$HOME/Desktop/Tree/Backups/$DATE"
mkdir -p "$OUT"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "❌ SUPABASE_ACCESS_TOKEN not set. Run:"
  echo "   export SUPABASE_ACCESS_TOKEN=sbp_..."
  exit 1
fi

PROJECT_REF="ltpivkqahvplapyagljt"
ANON_KEY="$(grep -oE 'eyJ[A-Za-z0-9._-]{60,}' "$REPO/src/supabase.js" 2>/dev/null | head -1 || true)"
if [ -z "$ANON_KEY" ]; then
  ANON_KEY="$(grep -oE 'eyJ[A-Za-z0-9._-]{60,}' "$REPO/index.html" 2>/dev/null | head -1 || true)"
fi

echo "📦 Backing up to $OUT"

# ─── 1. Database ────────────────────────────────────────────────────────────
PG_DUMP=""
for p in pg_dump /opt/homebrew/opt/libpq/bin/pg_dump /usr/local/opt/libpq/bin/pg_dump; do
  if command -v "$p" >/dev/null 2>&1 || [ -x "$p" ]; then
    PG_DUMP="$p"; break
  fi
done

if [ -n "$PG_DUMP" ]; then
  echo "1/2 — Postgres dump via $PG_DUMP…"
  # Pull DB password from the project. The supabase CLI stores it, but
  # we can also use the pooler connection string from project settings.
  CONN="$(curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$PROJECT_REF/config/database" 2>/dev/null | \
    grep -oE '"db_dns_alias":"[^"]+"' | head -1 | cut -d'"' -f4)"
  if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
    echo "   ⚠ Set SUPABASE_DB_PASSWORD to enable direct pg_dump."
    echo "     Found at Supabase dashboard → Project Settings → Database → Connection string."
    echo "   Falling back to REST-table dump…"
    PG_DUMP=""
  else
    DUMP_URL="postgresql://postgres.$PROJECT_REF:$SUPABASE_DB_PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
    "$PG_DUMP" "$DUMP_URL" --no-owner --no-privileges --clean --if-exists \
      --schema=public --schema=auth --schema=storage \
      > "$OUT/db.sql" 2>"$OUT/db.dump.log" || PG_DUMP=""
    if [ -n "$PG_DUMP" ] && [ -s "$OUT/db.sql" ]; then
      gzip -f "$OUT/db.sql"
      echo "   ✅ $(du -h "$OUT/db.sql.gz" | cut -f1) → $OUT/db.sql.gz"
    fi
  fi
fi

if [ -z "$PG_DUMP" ] || [ ! -s "$OUT/db.sql.gz" ]; then
  echo "1/2 — REST table dump (pg_dump unavailable / no DB password)…"
  if [ -z "$ANON_KEY" ]; then
    echo "   ❌ Could not resolve ANON_KEY. Skipping DB dump."
  else
    mkdir -p "$OUT/tables"
    TABLES="clients jobs invoices payments quotes requests deals communications photos services materials team_members vehicles vehicle_positions vehicle_day_assignments payroll_approvals payroll_runs tenants user_tenants time_entries tasks bm_invites tenant_settings"
    for t in $TABLES; do
      curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
        "https://$PROJECT_REF.supabase.co/rest/v1/$t?select=*" > "$OUT/tables/$t.json" 2>/dev/null
      lines=$(wc -c < "$OUT/tables/$t.json" 2>/dev/null || echo 0)
      printf "   %-30s %s bytes\n" "$t" "$lines"
    done
    cd "$OUT" && tar -czf tables.tar.gz tables
    # ─── Integrity gate ──────────────────────────────────────────────────
    # Post-RLS-lockdown, the anon/access-token REST read is DENIED for the
    # per-tenant tables, so this fallback silently writes `[]`. A backup
    # that reports success while empty is worse than none. Fail LOUD if any
    # business-critical table came back empty so the false-success can't
    # mislead. Real data backup then = Supabase server-side daily backups
    # (full privileges) OR set SUPABASE_DB_PASSWORD for true pg_dump.
    HOLLOW=""
    for t in clients invoices payments jobs quotes; do
      c=$(tr -d ' \n\r\t' < "$OUT/tables/$t.json" 2>/dev/null)
      if [ "$c" = "[]" ] || [ -z "$c" ]; then HOLLOW="$HOLLOW $t"; fi
    done
    rm -rf tables
    if [ -n "$HOLLOW" ]; then
      echo ""
      echo "   ❌ DB DUMP IS HOLLOW — empty tables:$HOLLOW"
      echo "   ❌ RLS denies the REST fallback key. This snapshot does NOT"
      echo "      back up business data. Real coverage = Supabase daily"
      echo "      backups (server-side) or set SUPABASE_DB_PASSWORD for pg_dump."
      DB_DUMP_OK=0
    else
      echo "   ✅ $(du -h "$OUT/tables.tar.gz" | cut -f1) → $OUT/tables.tar.gz"
      DB_DUMP_OK=1
    fi
  fi
fi

# ─── 2. Source snapshot ─────────────────────────────────────────────────────
echo "2/2 — Source snapshot…"
VERSION=$(grep -oE '"version":\s*[0-9]+' "$REPO/version.json" 2>/dev/null | grep -oE '[0-9]+' || echo 'unknown')
ZIP="$OUT/branchmanager-v$VERSION.zip"
cd "$REPO"
zip -rq "$ZIP" . \
  -x "dist/*" \
  -x "node_modules/*" \
  -x ".git/*" \
  -x ".DS_Store" \
  -x "*.zip"
echo "   ✅ $(du -h "$ZIP" | cut -f1) → $ZIP"

echo ""
if [ "${DB_DUMP_OK:-1}" = "0" ]; then
  echo "⚠️  Source snapshot saved, but the DB dump is HOLLOW (see above)."
  echo "   This is NOT a complete backup. Business data is only protected"
  echo "   by Supabase server-side daily backups until SUPABASE_DB_PASSWORD"
  echo "   (or a service-role REST path) is provided for a real pg_dump."
else
  echo "🎉 Backup complete:"
fi
ls -lh "$OUT"
echo ""
echo "Recommended: copy $OUT to external drive or iCloud Drive for off-Mac redundancy."
