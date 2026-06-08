# Branch Manager — Jarvis + Agents

Local, on-prem AI agent stack for Branch Manager. Runs on a Mac (MacBook Air
now, Mac Mini later) under **OpenJarvis** with **local inference**. The agents
connect to Branch Manager's Supabase **as authenticated tenant users**, so
Row-Level Security scopes every read and write to one business. Nothing here
uses the service-role key. Nothing here bypasses RLS.

Week-one scope: **Jarvis (router) + Sarah (intake) only.** Tom (customer
service) and Markus (crew dispatch) drop in later behind the same pattern —
their own `<name>/<name>.toml` + the shared tools.

```
agents/
  jarvis.toml              ← the router. Stays warm, owns the inbound line,
                             routes new-customer intake to Sarah, then sleeps her.
  config.example.toml      ← copy to config.toml, fill in secrets/numbers. gitignored.
  sarah/
    sarah.toml             ← Sarah's spec: identity, model/engine (swappable),
                             the locked phone script, lead-field mapping, handoff.
  shared/
    supabase_client.py     ← RLS-authenticated Supabase client factory (all agents).
    leads_tool.py          ← the data tool: dedupe → write a `requests` lead → SMS handoff.
    sms.py                 ← Twilio SMS handoff helper (config-driven recipients).
  provisioning/
    sarah_agent_user.sql   ← one-time: create Sarah's auth user + tenant membership.
```

## Architecture, in one breath

```
 Inbound PHONE call ─┐                                  ┌─ dedupe (clients + requests)
 (Twilio Voice,      ├─▶ JARVIS (warm router) ─▶ SARAH ─┤─ write requests row (status='new')  ── RLS ──▶ Supabase
  STT in / TTS out)  │     classifies the caller   (local │─ SMS handoff → Doug + Catherine
 Web form (peekskill─┘     "new customer?" → Sarah  model) └─ go back to sleep
  tree.com)
```

- **Jarvis** is the only thing that stays resident. It answers the line, decides
  *who* should handle the contact, and hands new-customer intake to Sarah. After
  Sarah finishes a lead she sleeps; Jarvis stays warm for the next call.
- **Sarah** does intake **only**. She creates a **Lead** — a `requests` row with
  `status='new'` — and nothing else. She never makes a Client, Quote, or Job, and
  never invents pricing. A human promotes the lead in BM's **Leads Center** when
  it's worth a site visit (the ✓ Qualify button). That promotion *is* Lead→Request.
- **Same TOML runs on both machines.** Move from MacBook Air → Mac Mini by editing
  only the `[model]` block in each agent spec (engine + model name + endpoint).
  Script, tools, mapping, and handoff are identical.

## Where Sarah writes (confirmed against the live schema)

Branch Manager has **no `leads` table**. The funnel `Lead → Request → Quote → Job
→ Invoice` is a set of stages. A raw inbound lead lives in the **`requests`**
table at `status='new'` — that is BM's lead inbox and what the Leads Center
triages. Field mapping (verified in `src/pages/requests.js`,
`supabase/functions/request-notify`, and `bm-receptionist`):

| Lead info (Sarah captures)     | `requests` column(s)                          |
|--------------------------------|-----------------------------------------------|
| Confirmed caller name          | `client_name`                                 |
| Phone (from caller ID)         | `client_phone` **and** `phone` (both written) |
| Email (blank if not given)     | `email`                                       |
| Property address               | `property` (street, city, state, ZIP)         |
| Service requested              | `title` (live `requests` has NO `service` column — verified; app's `service` field is localStorage-only) |
| How they heard about us        | `source`                                      |
| Preferred meeting time + summary | `notes` (no scheduling column exists — human books on the Schedule) |
| —                              | `status='new'`, `tenant_id=<SNT>`             |

Authoritative dropdown options (do **not** hardcode elsewhere — these come from
`src/pages/requests.js:494,522`):

- **Service Requested:** Tree Removal · Tree Pruning · Stump Grinding · Emergency
  Tree Work · Tree Assessment · Cabling & Bracing · Chipping / Brush Removal ·
  Lot Clearing · Firewood · Gutter Cleaning · Spring Clean Up · Snow Removal · Other
- **How did they hear about us?:** Google Search · Facebook · Instagram · Nextdoor
  · Friend / Referral · Yelp · Angi · Thumbtack · Drive-by · Repeat Client · Other
  (web-form leads use `source = "Website form"`.)

If the service is unclear from the call, Sarah leaves `service`/`title` generic
and notes it in Details — per the rule that everything else is figured out on the
site visit. She does not interrogate.

## RLS: how Sarah stays inside the tenant

`current_tenant_id()` resolves to `SELECT tenant_id FROM user_tenants WHERE
user_id = auth.uid()`. So Sarah:

1. Signs in to Supabase as a **dedicated agent user** (e.g. `sarah@peekskilltree.com`)
   whose `auth.uid()` is mapped to the Second Nature tenant in `user_tenants`.
2. Runs all dedupe reads and the lead insert under **that** JWT. RLS auto-scopes
   them to Second Nature. The insert's `tenant_id` must equal her membership or
   the `WITH CHECK` rejects it — RLS is the enforcer, not the app.

Provision once with `provisioning/sarah_agent_user.sql` (needs a human / SQL
editor — it touches `auth.users` and `user_tenants`).

## Handoff SMS

On a new lead, Sarah texts the configured recipients — **Doug + Catherine** —
simultaneously: `name · service · town`. Numbers are **not hardcoded**: they come
from `tenants.config.owner_alert_phones` (the same array BM's web-form notifier
already uses), read through Sarah's RLS client. One SMS provider (Twilio).

## Dialpad overflow → Sarah (catch Catherine's missed calls)

BM's `dialpad-webhook` only **logs** calls (ringing/completed/voicemail → the
`communications` table). It does **not** route calls — routing lives in Dialpad's
admin. To make Sarah the fallback instead of Doug's cell:

```
Inbound → Dialpad rings Catherine → no answer
   → Dialpad overflow forwards to → Sarah's Twilio number (Jarvis answers)
   → Sarah runs intake → writes the lead → SMS handoff to Doug + Catherine
```

Set-up (no agent code changes — Jarvis already answers an inbound number):
1. Provision Sarah's Twilio voice line and point it at Jarvis.
2. In Dialpad admin (https://dialpad.com/login → Admin Settings → Offices/
   Departments → **Call Routing → "If no one answers"**), change the no-answer /
   overflow destination from Doug's cell to **Sarah's number**.
3. Enable "preserve original caller ID" on the forward so Sarah can confirm
   identity from caller ID; if it isn't preserved she falls back to asking for
   name + number (the script handles both).

This needs Doug's Dialpad login — it's a Dialpad config change, not a BM deploy.

## Relationship to `bm-receptionist`

BM already ships `supabase/functions/bm-receptionist` — a Twilio + **cloud Claude**
phone receptionist. It is **built and deployable but currently dormant** (gated
behind `tenants.config.receptionist.enabled`, needs a registered Twilio number).
Sarah is the **local-model** replacement for the same job. Plan: run Sarah as
primary; keep `bm-receptionist` as a **hot fallback** you can flip on in seconds
if the Mac is down. Both write the same `requests` lead, so the Leads Center,
SMS, and the rest of BM don't care which engine took the call.

> Note: `bm-receptionist` inserts a `requests` row directly. Sarah does the same,
> at `status='new'`. This is BM's real lead stage; a human's ✓ Qualify in the
> Leads Center is the Lead→Request promotion you described.

## Run

```bash
cp config.example.toml config.toml          # fill in secrets + SNT numbers
python -m pip install -r requirements.txt   # supabase, twilio, tomli
# provision Sarah's tenant-scoped user once (see provisioning/)
openjarvis run jarvis.toml                   # router stays warm; routes to Sarah
```

Set `dry_run = true` in `config.toml` to exercise the whole path — dedupe, the
shape of the lead, the SMS body — **without** writing to the DB or sending texts.
Mirrors the `SMOKE_MARKER` escape hatch in `request-notify`.
