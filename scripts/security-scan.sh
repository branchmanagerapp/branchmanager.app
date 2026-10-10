#!/usr/bin/env bash
# Branch Manager — security scan (Aqua Trivy)
# Usage: ./scripts/security-scan.sh            (full scan: vuln + secret + misconfig)
#        ./scripts/security-scan.sh --secrets  (fast secret-only scan)
# Install Trivy: brew install trivy
set -euo pipefail
cd "$(dirname "$0")/.."
command -v trivy >/dev/null || { echo "Trivy not installed. Run: brew install trivy"; exit 127; }
if [[ "${1:-}" == "--secrets" ]]; then
  trivy fs --scanners secret --severity HIGH,CRITICAL --skip-dirs node_modules,dist,mobile,_archive --no-progress --exit-code 1 .
else
  trivy fs --scanners vuln,secret,misconfig --skip-dirs node_modules,dist \
    --severity HIGH,CRITICAL --no-progress .
fi
