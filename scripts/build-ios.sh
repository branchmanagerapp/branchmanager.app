#!/usr/bin/env bash
# Build iOS app from current BM source.
#
# Usage:
#   ./scripts/build-ios.sh           — full build into ios/ (clean if first time)
#   ./scripts/build-ios.sh --device  — also install onto connected iPhone
#   ./scripts/build-ios.sh --archive — produce .xcarchive for App Store upload
#
# Requirements:
#   - Xcode 16+ with command-line tools
#   - Connected Apple ID with a Team set in the project (manual once in Xcode)
#   - iPhone unlocked + paired for --device

set -euo pipefail
cd "$(dirname "$0")/.."

# Step 1. Sync Capacitor — copies www/ + capacitor.config.json into ios/App/App
if [[ ! -d ios ]]; then
  echo "▶ First run — adding iOS platform"
  npx cap add ios
fi
npx cap sync ios

# Step 2. Apply local patches that Capacitor regenerates incorrectly each time.
# Capacitor 8's auto-generated AppDelegate.swift calls a removed
# ApplicationDelegateProxy.application(_:continue:restorationHandler:) overload
# which fails to compile on Xcode 16+. Replace with a no-op return false.
APPDELEGATE="ios/App/App/AppDelegate.swift"
if grep -q "continue: userActivity, restorationHandler: restorationHandler" "$APPDELEGATE"; then
  echo "▶ Patching AppDelegate.swift (Capacitor 8 / Xcode 16 SDK fix)"
  python3 -c "
import re
fn = '$APPDELEGATE'
s = open(fn).read()
old = 'return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)'
new = 'return false  // Capacitor 8 ApplicationDelegateProxy has no continue/restorationHandler overload; until Universal Links land, default-system handle.'
s = s.replace(old, new)
open(fn, 'w').write(s)
"
fi

# Step 3. Replace placeholder app icon with BM tree icon.
if [[ -f icons/icon-1024.png ]]; then
  cp icons/icon-1024.png ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
fi

# Step 4. Build.
ARGS=(-project ios/App/App.xcodeproj -scheme App -configuration Release)

if [[ "${1:-}" == "--archive" ]]; then
  echo "▶ Archiving for App Store"
  xcodebuild "${ARGS[@]}" -destination 'generic/platform=iOS' \
    -archivePath build/App.xcarchive -allowProvisioningUpdates archive
  echo "✓ Archive: build/App.xcarchive — open in Xcode → Window → Organizer → Distribute"
elif [[ "${1:-}" == "--device" ]]; then
  echo "▶ Building + installing onto connected iPhone"
  DEVICE_ID=$(xcrun devicectl list devices --json-output - 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin)['result']['devices'];print(d[0]['identifier'] if d else '')")
  if [[ -z "$DEVICE_ID" ]]; then
    echo "✗ No iPhone connected — pair via Xcode first"; exit 1
  fi
  xcodebuild "${ARGS[@]}" -destination "id=$DEVICE_ID" -allowProvisioningUpdates build
  echo "✓ Built + installed. Open Branch Manager on the phone."
else
  echo "▶ Compile-check (no signing, no install)"
  xcodebuild "${ARGS[@]}" -destination 'generic/platform=iOS' \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -quiet build
  echo "✓ Compiled. To install on phone: ./scripts/build-ios.sh --device"
  echo "  To produce App Store archive: ./scripts/build-ios.sh --archive"
fi
