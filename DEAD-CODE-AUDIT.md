# Dead-Code Audit — Orphaned Page Renderers

Generated: May 10 2026 (post-v736)

## Scope

The audit started from 32 page renderers in `pageRenderers` (index.html) that don't show up in direct `loadPage('xxx')` calls in the source. Verdicts here are evidence-based; do NOT delete anything labeled "uncertain" without opening the file and reading cross-references.

## Verdicts

| Page | Verdict | Reasoning |
|---|---|---|
| ai | uncertain | AI module wired to topbar sparkle icon (`AI.toggle()`), but pageRenderers entry may be redundant |
| aitreeid | uncertain | Tree-ID AI module; reached via Photos / AI menu probably |
| branchcam | reachable | `loadPage('branchcam')` called from inline HTML strings |
| calculators | uncertain | Calculator hub — its renderer body links to estimator/treemeasure |
| campaigns | uncertain | Marketing campaigns module; reached via Marketing Hub tabs |
| checklists | uncertain | Per-job checklist module; reached via Jobs detail |
| clienthub | uncertain | Customer self-service portal; reached from client pages |
| clientmap | reachable | `loadPage('clientmap')` from inline strings |
| collectpayment | reachable | Payment collection flow; `loadPage('collectpayment')` from invoices |
| customfields | reachable | Settings sub-page |
| emailtemplates | uncertain | Marketing module |
| estimator | reachable | `loadPage('estimator')` from calculators hub |
| help | reachable | `loadPage('help')` from Settings + topbar (per v731 Activity Feed Support section) |
| insights | reachable | Linked from Reports / Insights hub |
| marketingsite | sidebar | Direct sidebar entry |
| mediacenter | reachable | Several `loadPage('mediacenter')` from inline HTML strings |
| modeselector | uncertain | Possibly reached via mode-switcher topbar UI |
| payments | uncertain | "payments" pageRenderer entry sets `InvoicesPage._activeTab='payments'` — likely reached as Invoices sub-tab |
| permissions | reachable | RBAC module; reached from Settings |
| photomap | reachable | `loadPage('photomap')` from inline strings |
| profitloss | reachable | Reports sub-page |
| propertymap | uncertain | Property tree-inventory map; reached from client detail Property tab |
| receptionist | reachable | Receptionist hub from sidebar |
| referrals | uncertain | Marketing referrals submodule |
| satisfaction | uncertain | Post-job satisfaction survey flow |
| tools | sidebar | Direct sidebar entry |
| treemeasure | reachable | Tree measurement; reached from calculators / quote flow |
| visits | uncertain | pageRenderer entry sets `JobsPage._activeTab='visits'` — Jobs sub-tab |
| voicequote | uncertain | Voice-to-quote flow; reached from quote creation |
| weather | reachable | `loadPage('weather')` from schedule weather toggle |
| weeklysummary | uncertain | Weekly summary email/page; possibly cron-driven |
| workflow | uncertain | `Workflow` module is heavily used as a helper, but the page renderer redirects to dashboard — likely a stub |

## Recommendation

Real dead-code prune requires opening each "uncertain" candidate and:
1. Confirming the module file has zero outside references (grep for the module name, not just the page slug)
2. Checking hub modules (Reports, Tools, Marketing, Operations) for tab definitions that load this page
3. Searching for the page slug in HTML template strings (the escaped `loadPage(\'xxx\')` form)

A reliable prune would be 1–2 hours of careful per-module review, not a one-shot grep. Want me to take one specific module (e.g. `workflow` since its renderer redirects to dashboard — strongest "stub" signal) and prove the prune end-to-end as a template?

## What this audit ISN'T

This is not a "safe to delete" list. The pure-grep approach missed:
- Hub-tab routing patterns (e.g. `r.tab === 'cardone'` in reports.js)
- Inline HTML `loadPage(\'xxx\')` strings with escape characters
- Modules invoked through other namespaces (e.g. `Workflow.quoteToJob()` doesn't surface "workflow" as a page slug)
- Sidebar entries with conditional rendering

Use as a starting point, not a verdict.
