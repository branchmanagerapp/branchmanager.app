#!/usr/bin/env bash
# Branch Manager — version bump helper
#
# Atomically bumps the four places that must stay in lockstep:
#   1. version.json          "version": N
#   2. index.html            var BUNDLED_VERSION = N
#   3. index.html            all ?v=N cache-busters on script/link tags
#   4. sw.js                 var CACHE_NAME = 'branch-manager-vN'
#
# If these drift (as they did at v318 → infinite reload loop), the self-healing
# checker nukes caches and reloads forever. This script prevents that.
#
# Usage:
#   ./scripts/bump.sh [new-version] [release-notes]
#
# If no args given, increments current version by 1 and opens $EDITOR for notes.

set -euo pipefail

cd "$(dirname "$0")/.."

CURRENT=$(grep -oE '"version":\s*[0-9]+' version.json | grep -oE '[0-9]+')
NEXT="${1:-$((CURRENT + 1))}"
NOTES="${2:-}"

if [[ ! "$NEXT" =~ ^[0-9]+$ ]]; then
  echo "❌ Version must be an integer, got: $NEXT"; exit 1
fi
if [[ "$NEXT" -le "$CURRENT" ]]; then
  echo "❌ New version ($NEXT) must be greater than current ($CURRENT)"; exit 1
fi

echo "📦 Bumping v$CURRENT → v$NEXT"

TODAY=$(date +%Y-%m-%d)

# 1. version.json
if [[ -n "$NOTES" ]]; then
  cat > version.json <<EOF
{
  "version": $NEXT,
  "released": "$TODAY",
  "notes": "$NOTES"
}
EOF
else
  # Preserve existing notes if none supplied
  EXISTING_NOTES=$(grep -oE '"notes":\s*"[^"]*"' version.json || echo '"notes": "(no notes)"')
  cat > version.json <<EOF
{
  "version": $NEXT,
  "released": "$TODAY",
  $EXISTING_NOTES
}
EOF
fi

# 2. + 3. index.html
sed -i '' "s/BUNDLED_VERSION = $CURRENT/BUNDLED_VERSION = $NEXT/" index.html
sed -i '' "s/?v=$CURRENT/?v=$NEXT/g" index.html

# 3b. bundle reference in index.html (only present after build-bundle --html ran).
#     Same for the parallel test page index-bundled.html.
sed -i '' "s|bm.bundle.v$CURRENT.min.js|bm.bundle.v$NEXT.min.js|g" index.html
[ -f index-bundled.html ] && sed -i '' "s|bm.bundle.v$CURRENT.min.js|bm.bundle.v$NEXT.min.js|g" index-bundled.html

# 4. sw.js
sed -i '' "s/branch-manager-v$CURRENT/branch-manager-v$NEXT/" sw.js

# ── Verification ──
echo ""
echo "✅ Checking all four locations match:"
printf "   version.json     : %s\n" "$(grep -oE '"version":\s*[0-9]+' version.json)"
printf "   BUNDLED_VERSION  : %s\n" "$(grep -oE 'BUNDLED_VERSION = [0-9]+' index.html)"
printf "   CACHE_NAME       : %s\n" "$(grep -oE "branch-manager-v[0-9]+" sw.js)"
printf "   ?v= strings uniq : %s\n" "$(grep -oE '\?v=[0-9]+' index.html | sort -u | tr '\n' ' ')"

# Sanity check — all should contain $NEXT
if grep -q "BUNDLED_VERSION = $NEXT" index.html \
  && grep -q "branch-manager-v$NEXT" sw.js \
  && grep -q "\"version\": $NEXT" version.json; then
  echo ""
  echo "🎉 Version metadata locked to v$NEXT."
else
  echo ""
  echo "⚠️  Something didn't match — inspect diffs before committing."
  exit 1
fi

# 5. Build the production bundle. index.html points at
# dist/bm.bundle.v$NEXT.min.js — without this step the live site 404s on
# the bundle and the app dies at boot (this happened v537 + v538). Skip
# with BUMP_NO_BUILD=1 if you really want to defer the build.
if [[ -z "${BUMP_NO_BUILD:-}" ]]; then
  echo ""
  echo "📦 Building bundle dist/bm.bundle.v$NEXT.min.js …"
  if node scripts/build-bundle.mjs >/dev/null 2>&1; then
    if [[ -f "dist/bm.bundle.v$NEXT.min.js" ]]; then
      SIZE=$(ls -lh "dist/bm.bundle.v$NEXT.min.js" | awk '{print $5}')
      echo "✅ dist/bm.bundle.v$NEXT.min.js built ($SIZE)"
    else
      echo "❌ Bundle build ran but dist/bm.bundle.v$NEXT.min.js is missing — STOP and investigate."
      exit 1
    fi
  else
    echo "❌ Bundle build failed — STOP and investigate (run: node scripts/build-bundle.mjs)."
    exit 1
  fi
else
  echo ""
  echo "⚠️  Skipped bundle build (BUMP_NO_BUILD=1). Build manually before pushing or the live site will 404 the bundle."
fi

echo ""
echo "Next:"
echo "   git add -A && git commit -m \"v$NEXT: <summary>\" && git push"
