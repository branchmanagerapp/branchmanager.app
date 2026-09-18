# Knowledge base

Sourced, dated facts about the outside world that Second Nature Tree / Branch Manager
relies on: what vendors charge, what New York requires, what OSHA says. One place, so a
fact gets researched once, and pages, people and agents all read the same answer.

**This folder is PUBLIC.** The repo is public on GitHub and every file is served at
branchmanager.app. Never put in here: our own prices or costs, anything about a named
customer or partner, insurance premiums, payroll, credentials. Those live elsewhere.

## Layout

- `facts/<topic>.json` — one file per topic. Edit these.
- `kb.json` — the compiled bundle. Do not edit; run the build.
- `index.html` — the viewer, at branchmanager.app/knowledge/
- `../scripts/kb-build.py` — checks the rules below and writes `kb.json`.

## Rules (the build enforces them)

1. **Every entry has a source with a URL, a tier, and the date we read it.**
   Add `published` when the source itself is dated. Undated sources get a warning.
2. **Source tiers.** 1 = the vendor's or agency's own site. 2 = primary artifacts
   (official repo, filing, live technical check). 3 = reputable dated press.
   4 = aggregators, listicles, content farms.
3. **A Tier 4 source can never back a `fact`.** Record it as a `note` so nobody
   rediscovers it and mistakes it for evidence.
4. **Negative findings are `gap` entries and must list what was searched.**
   "We couldn't find it, here is what we searched" - never "it doesn't exist".
5. **Every entry has a `review_by` date.** Prices: about 3 months. Rules and laws:
   about 6 months. Past that date the viewer marks it stale until someone re-reads
   the source and updates `read`.
6. **`confidence`** is high / medium / low, and **`caveat`** says what would make it wrong.
7. **`used_on`** lists the pages that quote the entry, so when a fact changes we know
   which pages to fix.

## Adding a fact

Search this folder and the rest of the repo first. Then add an entry to the right
topic file (or a new one), run `python3 scripts/kb-build.py`, commit both the topic
file and `kb.json`.
