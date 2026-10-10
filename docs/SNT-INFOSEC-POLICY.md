# Second Nature Tree Service LLC — Information Security Policy

**Effective Date:** 2026-05-23
**Owner:** Doug Brown, Managing Member
**Review Cadence:** Annually, or upon material change to systems
**Contact:** info@peekskilltree.com · +1 (914) 391-5233

---

## 1. Purpose & Scope

Second Nature Tree Service LLC ("SNT") is a New York-based single-member LLC providing commercial tree services. This policy governs the protection of:

- **Consumer financial data** retrieved via Plaid Transactions for our internal bookkeeping (Branch Manager).
- **Customer personally identifiable information** (names, addresses, phone numbers, emails, invoice/payment history).
- **Operational systems**: Branch Manager (BM), Supabase (data), Stripe (payments), Resend (email), Dialpad (SMS/calls), Cloudflare (DNS + WAF), GitHub (source code).

Scope covers all data SNT collects, stores, or processes in the course of operating its business and the Branch Manager platform.

---

## 2. Roles & Responsibilities

SNT operates as a single-member LLC with one operator. **Doug Brown serves as:**

- Information Security Officer
- Data Protection Officer
- Incident Response Lead
- Primary System Administrator

There are no additional employees or contractors with access to production systems. Any future hires will be added to this policy with their access scope explicitly documented before being granted credentials.

---

## 3. Asset Inventory

| Asset Class | Sensitivity | System of Record |
|---|---|---|
| Consumer bank transactions | High | Supabase `bank_transactions` table (RLS-locked) |
| Customer PII (name/address/phone) | Medium | Supabase `clients` table (RLS-locked) |
| Invoice + payment history | Medium | Supabase `invoices`, `payments` tables |
| Stripe Payment Links + customer payment events | Medium | Stripe + Supabase `stripe_events` table |
| Operator credentials (API keys, secrets) | High | Supabase Secrets Manager (env vars), 1Password |

---

## 4. Access Control

### 4.1 Role-Based Access Control (RBAC)
- Database access is mediated by Supabase Postgres **Row-Level Security (RLS)** policies. Every tenant-scoped table requires `tenant_id` match against the authenticated user's JWT claim.
- Anon role has read-only access only on explicit allow-listed columns. Post-incident audit (May 2026) confirmed lockdown on all 44 tables.
- Service-role key is used only by edge functions; never exposed to client.

### 4.2 Authentication
- Owner login: email + password via Supabase Auth.
- Owner-only edge functions (e.g. `stripe-create-link`, `plaid-save-keys`) gate by verifying the caller's Supabase JWT and matching email against an `OWNER_EMAILS` allow-list.
- Customer portal: passwordless magic-link email auth, 7-day session expiry.

### 4.3 Multi-Factor Authentication
- **Supabase dashboard:** TOTP MFA enabled on the owner account (screenshot available on request).
- **GitHub:** TOTP MFA + 2-factor recovery codes enabled on the deploy account.
- **Stripe dashboard:** TOTP MFA enabled.
- **Plaid dashboard:** TOTP MFA enabled (to be confirmed upon account creation).
- **Cloudflare:** TOTP MFA enabled.

MFA on the BM operator login itself is on the near-term roadmap (planned alongside adding additional team members).

### 4.4 Periodic Access Reviews
- Personal Access Tokens (GitHub PATs, Supabase access tokens) are rotated when leaked, when team membership changes, and reviewed quarterly.
- All third-party API keys (Plaid, Stripe, Resend, Dialpad) are inventoried in Supabase Secrets Manager and reviewed quarterly.
- A breach audit (May 17 2026) identified and remediated over-broad RLS policies; all 44 tables verified locked.

---

## 5. Data Handling

### 5.1 In Transit
- All traffic between clients and BM runs over HTTPS via Cloudflare with TLS 1.3 (TLS 1.2 minimum).
- HSTS, CSP, and X-Content-Type-Options headers enforced via Cloudflare Worker.
- Plaid API calls use HTTPS with token-based auth from server-side edge functions only.

### 5.2 At Rest
- Supabase Postgres uses AES-256 encryption at rest (provided by Supabase).
- Supabase Storage (file uploads: photos, contracts, logos) uses server-side encryption.
- Sensitive secrets (API keys, OAuth tokens) live in Supabase Secrets Manager (encrypted env vars), never in source control.
- Plaid `access_token` per linked bank is stored in `bank_accounts.plaid_access_token` with RLS scoped to the owning tenant; never exposed to client.

### 5.3 Data Minimization
- We do not retain Plaid raw responses beyond what's required for the bookkeeping P&L (transaction date, amount, description, category).
- We do not store consumer bank credentials at any point. Plaid Link handles the credential exchange and returns an opaque access token.
- Sensitive consumer SSNs, full account numbers, etc. are never requested or stored.

### 5.4 Retention
- Bank transactions: retained for 7 years for tax purposes (IRS standard).
- Customer PII: retained while the customer relationship is active, then archived in cold storage.
- API request logs: 30 days (Supabase default).

---

## 6. Infrastructure Security

- All production assets behind Cloudflare (WAF + DDoS).
- Source code in private GitHub repos; deploy via PATs with `repo` scope only.
- Production database (Supabase) requires service-role-key or authenticated JWT for any write; anon role denied.
- Background tasks via Supabase pg_cron, inventoried in `pg_cron_state.md`.
- All edge functions require `--no-verify-jwt` only for explicit public webhooks (Stripe, Dialpad, Plaid); other edge functions verify JWT.

---

## 7. Vendor Risk Management

Before integrating a third-party vendor, SNT verifies:
- Vendor publishes a current SOC 2 Type 2 report or equivalent (Supabase: SOC 2 Type 2 ✓; Stripe: PCI-DSS Level 1 ✓; Resend: SOC 2 Type 2 ✓; Plaid: SOC 2 Type 2 + ISO 27001 ✓; Cloudflare: SOC 2 Type 2 ✓; Dialpad: SOC 2 Type 2 ✓).
- Vendor offers data residency in the US.
- Vendor offers signed Data Processing Agreement (DPA) on request.

---

## 8. Incident Response

Single-operator incident response plan:

1. **Detect** — Sentry SDK alerts on runtime errors via email to info@peekskilltree.com. Supabase logs reviewed weekly.
2. **Triage** — Owner determines blast radius (which tenants/data affected).
3. **Contain** — Revoke leaked credentials (rotate PATs, regenerate Supabase service-role key, revoke Plaid access tokens via `/item/remove`).
4. **Eradicate** — Patch the root cause (push fix to main → GitHub Actions deploy).
5. **Recover** — Verify normal operations resumed; document via post-mortem markdown in `~/Desktop/Tree/branchmanager-app/docs/`.
6. **Notify** — If consumer financial data was exposed: notify affected users within 72 hours, notify Plaid + Stripe per their breach-notification requirements, notify NY DFS if required under 23 NYCRR 500.

**Past incidents documented:**
- May 17 2026 — Anonymous + over-broad-authed RLS breach. Closed via supervised 3-step cutover. Owner verified all 44 tables locked; anon + portal denied. Rollback scripts retained in `security/`.

---

## 9. Business Continuity

- Source code mirrored on GitHub (off-site).
- Supabase performs daily backups (7-day retention on free tier; longer on pro).
- Owner maintains a Mac laptop + iCloud backup of operational notes.

---

## 10. Compliance & Review

- This policy is reviewed annually on the anniversary of the Effective Date, or sooner if material system changes occur.
- All vendor SOC 2 reports re-fetched annually.
- All access tokens audited annually.

---

## 11. Acknowledgement

By signing below, the Owner acknowledges authorship and adoption of this policy.

**Doug Brown** — Managing Member, Second Nature Tree Service LLC
Date: 2026-05-23
Signature: ___________________________

---

*Document version 1.0 · Last updated 2026-05-23*
