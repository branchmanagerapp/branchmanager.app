#!/bin/bash
# Get (and update) the knowledge base on any computer.
#
#   scripts/kb-sync.sh                 # get/refresh a local copy in ~/bm-knowledge, check access
#   scripts/kb-sync.sh push "message"  # check the rules, rebuild kb.json, commit, push (live in ~90s)
#
# Read-only, no login needed:  curl -s https://branchmanager.app/knowledge/kb.json
# Viewer:                      https://branchmanager.app/knowledge
#
# Pushing needs the GitHub CLI logged in as an account with write access to
# branchmanagerapp/branchmanager.app (peekskilltree has it). This script checks
# and tells you exactly what to run if it's missing. It never asks for a password.
set -euo pipefail
REPO="branchmanagerapp/branchmanager.app"
DIR="${KB_DIR:-$HOME/bm-knowledge}"
cmd="${1:-get}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing '$1'. $2"; exit 1; }; }
need git "Install Xcode command line tools: xcode-select --install"
need python3 "Install Xcode command line tools: xcode-select --install"

if [ ! -d "$DIR/.git" ]; then
  echo "Getting the knowledge base into $DIR ..."
  git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/$REPO.git" "$DIR"
  git -C "$DIR" sparse-checkout set --no-cone /knowledge/ /knowledge.html /scripts/kb-build.py /scripts/kb-sync.sh
else
  git -C "$DIR" pull -q --rebase --autostash origin main
fi
python3 "$DIR/scripts/kb-build.py" --check | tail -1
echo "Local copy: $DIR/knowledge   (facts/*.json are the files to edit)"

can_push() {
  command -v gh >/dev/null 2>&1 || { echo "Push access: NO - GitHub CLI not installed. Run: brew install gh"; return 1; }
  gh auth status >/dev/null 2>&1 || { echo "Push access: NO - not logged in. Run: gh auth login   (choose GitHub.com, HTTPS, browser; sign in as peekskilltree)"; return 1; }
  [ "$(gh api "repos/$REPO" --jq .permissions.push 2>/dev/null)" = "true" ] || { echo "Push access: NO - this GitHub login can't write to $REPO. Sign in as peekskilltree: gh auth login"; return 1; }
  echo "Push access: yes ($(gh api user --jq .login))"
}

if [ "$cmd" = "get" ]; then can_push || true; exit 0; fi

if [ "$cmd" = "push" ]; then
  msg="${2:-knowledge: update}"
  can_push
  python3 "$DIR/scripts/kb-build.py"            # stops here if any rule is broken
  cp "$DIR/knowledge/index.html" "$DIR/knowledge.html" 2>/dev/null || true
  git -C "$DIR" add knowledge knowledge.html
  if git -C "$DIR" diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
  git -C "$DIR" -c user.name="peekskilltree" -c user.email="info@peekskilltree.com" commit -q -m "$msg"
  git -C "$DIR" pull -q --rebase --autostash origin main
  git -C "$DIR" push -q "https://x-access-token:$(gh auth token)@github.com/$REPO.git" HEAD:main
  echo "Pushed. Live at https://branchmanager.app/knowledge in about 90 seconds."
  exit 0
fi
echo "Usage: kb-sync.sh [get | push \"message\"]"; exit 1
