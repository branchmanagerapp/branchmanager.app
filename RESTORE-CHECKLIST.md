# Branch Manager — Disaster Restore Checklist

_Generated 2026-05-19. The point of this file: a rebuild must not
discover missing pieces one failure at a time._

## What you have, and where

| Layer | Backup | How to restore |
|---|---|---|
| **Database** (all tenants: clients, invoices, payments, jobs, quotes, auth users) | 3 copies: Supabase daily (server-side) · `~/.bm-backups/` (daily, local) · GitHub `branchmanagerapp/bm-backups` (daily, AES-256, off-site) | decrypt + `psql` (below) or Supabase dashboard restore |
| **Source code** | GitHub `branchmanagerapp/branchmanager.app` (every commit) | `git clone` |
| **Photo JPEGs** | ⚠️ NOT backed up — only the URLs/metadata rows are in the DB dump | re-pull from the public URLs while they're live; otherwise lost |
| **Supabase secret VALUES** | ⚠️ NOT backed up anywhere (write-only; cannot be read back) | re-enter from the source-of-truth provider — see list below |

## Restore the database from the encrypted off-site copy

```bash
# 1. get latest.sql.gz.enc from github.com/branchmanagerapp/bm-backups (backups/)
# 2. passphrase = BM_BACKUP_ENC_PASS in ~/.config/bm-backup.env (or ~/Desktop/Tree/.bm-backup.env)
export BM_BACKUP_ENC_PASS='<from that env file>'
openssl enc -d -aes-256-cbc -pbkdf2 -in latest.sql.gz.enc -pass env:BM_BACKUP_ENC_PASS \
  | gunzip > restore.sql
# 3. into a fresh Supabase project (psql connection string from its dashboard):
psql "postgresql://postgres:<NEWPW>@db.<newref>.supabase.co:5432/postgres" < restore.sql
```
The local `~/.bm-backups/db-<date>.sql.gz` is the same content, unencrypted, if you're restoring on this Mac.

## Supabase secrets a rebuilt project must have re-entered

These are NOT in any backup by design (Supabase never exposes them
again). On a full rebuild, set each from its real source-of-truth
provider dashboard, then `supabase secrets set`.

**Critical (app broken without them):**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from the new Supabase project settings
- `STRIPE_SECRET_KEY`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO/CREW/PRO`, `STRIPE_CHECKOUT_SUCCESS_URL`, `STRIPE_CHECKOUT_CANCEL_URL` — Stripe dashboard
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_PLATFORM_FROM`, `RESEND_REPLY_TO`, `RESEND_WEBHOOK_SECRET` — Resend dashboard (also re-verify the `send.branchmanager.app` domain)
- `ANTHROPIC_API_KEY` — Anthropic console
- `COMP_CODES` (currently `FRIENDS2026`), `NPS_TOKEN_SALT`, `PROVISION_TENANT_TOKEN`, `MARKETING_APPROVE_SECRET` — regenerate/choose new values
- Supabase Auth: re-enable email confirmation + re-add the Resend SMTP (host `smtp.resend.com`, port "587" as a STRING, user `resend`, pass = Resend key), `site_url`/redirects

**Optional (feature degrades, app still runs):**
- `DIALPAD_API_KEY`, `DIALPAD_FROM_NUMBER`, `DIALPAD_WEBHOOK_SECRET`, `DIALPAD_AUTOCREATE_REQUESTS` — Dialpad
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — Twilio (AI receptionist)
- `BOUNCIE_CLIENT_ID/SECRET/REDIRECT_URI/TOKEN_URL/API_BASE/WEBHOOK_KEY/WEBHOOK_SECRET` — Bouncie (truck GPS)
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` — Plaid
- `SENDJIM_CLIENT_KEY`, `SENDJIM_CLIENT_SECRET` — SendJim (direct mail)
- `OWNER_ALERT_PHONE`, `OWNER_EMAILS_OVERRIDE`, `RESEND_FROM_EMAIL`, automation toggles (`AUTOMATION_*`, `DAILY_SUMMARY_DISABLED`, `WEEKLY_KPI_DIGEST_DISABLED`)

## Backup gaps still open (decide later)

- **Photo JPEGs** — periodic bucket export not yet automated (URLs in the DB are public while the project lives).
- **Backblaze B2** — optional 4th cloud; needs a B2 account + bucket + app key.
- **PITR** — Supabase add-on (~$100/mo) for point-in-time vs 24h granularity. Not needed at current scale.
