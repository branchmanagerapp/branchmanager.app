#!/usr/bin/env python3
"""Build + check the knowledge base.

Reads knowledge/facts/*.json, enforces the source rules in knowledge/README.md,
and writes knowledge/kb.json (the single bundle the viewer and the agents read).

  python3 scripts/kb-build.py          # check, then write kb.json
  python3 scripts/kb-build.py --check  # check only; exit 1 on any error
"""
import json, sys, glob, os, re
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "knowledge")
KINDS = {"fact", "gap", "note"}
CONF = {"high", "medium", "low"}
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Never let private business numbers or secrets into this public folder.
PRIVATE = re.compile(r"(sbp_|ghp_|gho_|sk_live|rk_live|service_role|password|api[_-]?key\s*[:=])", re.I)

def main():
    errors, warnings, topics, ids = [], [], [], set()
    undated = 0
    today = date.today().isoformat()
    for path in sorted(glob.glob(os.path.join(ROOT, "facts", "*.json"))):
        name = os.path.basename(path)
        raw = open(path, encoding="utf-8").read()
        if PRIVATE.search(raw):
            errors.append(f"{name}: looks like it contains a credential. This folder is PUBLIC.")
        t = json.loads(raw)
        for k in ("topic", "title", "summary", "facts"):
            if k not in t: errors.append(f"{name}: missing '{k}'")
        tiers = []
        for f in t.get("facts", []):
            fid = f.get("id", "?"); where = f"{name}#{fid}"
            if fid in ids: errors.append(f"{where}: duplicate id")
            ids.add(fid)
            if f.get("kind") not in KINDS: errors.append(f"{where}: kind must be one of {sorted(KINDS)}")
            if not f.get("claim"): errors.append(f"{where}: no claim")
            if f.get("confidence") not in CONF: errors.append(f"{where}: confidence must be high/medium/low")
            if not ISO.match(f.get("review_by") or ""): errors.append(f"{where}: review_by must be YYYY-MM-DD")
            s = f.get("source") or {}
            if not s.get("url") or not s.get("name"): errors.append(f"{where}: every entry needs a source name + url")
            if s.get("tier") not in (1, 2, 3, 4): errors.append(f"{where}: source.tier must be 1-4")
            if not ISO.match(s.get("read") or ""): errors.append(f"{where}: source.read (date we read it) must be YYYY-MM-DD")
            if s.get("published") and not ISO.match(s["published"]): errors.append(f"{where}: source.published must be YYYY-MM-DD or null")
            if f.get("kind") == "fact" and s.get("tier") == 4:
                errors.append(f"{where}: a Tier 4 source can never back a fact. Use kind 'note'.")
            if f.get("kind") == "gap" and not f.get("searched"):
                errors.append(f"{where}: a gap must list what was searched")
            if f.get("kind") == "fact" and not s.get("published"):
                undated += 1  # live pages and rate cards: we only know when we read them
            f["stale"] = bool(ISO.match(f.get("review_by") or "") and f["review_by"] < today)
            if f["stale"]: warnings.append(f"{where}: past review_by {f['review_by']} - re-check the source")
            if f.get("kind") == "fact": tiers.append(s.get("tier"))
        if tiers and 1 not in tiers:
            warnings.append(f"{name}: no Tier 1 (vendor/agency) source in this topic yet")
        topics.append(t)

    for w in warnings: print("warn :", w)
    for e in errors: print("ERROR:", e)
    n = sum(len(t["facts"]) for t in topics)
    print(f"{len(topics)} topics, {n} entries, {undated} undated sources, {len(warnings)} warnings, {len(errors)} errors")
    if errors: sys.exit(1)
    if "--check" in sys.argv: return
    out = {"built": today, "topics": topics}
    json.dump(out, open(os.path.join(ROOT, "kb.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("wrote knowledge/kb.json")

if __name__ == "__main__":
    main()
