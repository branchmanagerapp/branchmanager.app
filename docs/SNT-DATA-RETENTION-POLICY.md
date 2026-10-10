# Second Nature Tree Service LLC — Data Retention & Disposal Policy

**Effective Date:** 2026-05-23
**Owner:** Doug Brown, Managing Member
**Review Cadence:** Annually, or upon material change to systems
**Contact:** info@peekskilltree.com · +1 (914) 391-5233

---

## 1. Purpose

This policy defines how Second Nature Tree Service LLC ("SNT") retains and disposes of data collected, stored, or processed in the course of operating its business and the Branch Manager ("BM") internal operations platform. It applies to all data classes including consumer financial data obtained via Plaid Transactions, customer personally identifiable information (PII), payment records, operator credentials, and operational logs.

This policy is designed to comply with applicable US federal record-keeping requirements (IRS 26 CFR 1.6001-1), New York State data security regulations (23 NYCRR 500 where applicable), and the contractual obligations of our third-party processors (Plaid, Stripe, Supabase, Resend).

---

## 2. Scope & Data Inventory

| Data Class | Source | Storage Location | Sensitivity |
|---|---|---|---|
| Consumer bank transactions | Plaid Transactions API | Supabase Postgres `bank_transactions` | High |
| Consumer bank account metadata (institution, last-4) | Plaid Item creation | Supabase Postgres `bank_accounts` | High |
| Plaid access tokens | Plaid `/item/public_token/exchange` | Supabase Postgres (RLS-locked) | Critical |
| Customer PII (name, address, phone, email) | Onboarding intake | Supabase Postgres `clients` | Medium |
| Invoices + payments | BM-generated, Stripe webhook | Supabase Postgres `invoices`, `payments` | Medium |
| File uploads (photos, contracts, logos) | User uploads | Supabase Storage | Medium |
| API request logs | Supabase default logging | Supabase platform | Low |
| Operator credentials (API keys, secrets) | Manual entry / vendor portals | Supabase Secrets Manager | Critical |

---

## 3. Retention Schedule

| Data Class | Retention Period | Rationale |
|---|---|---|
| Consumer bank transactions | **7 years** from last activity | IRS standard for business records (26 CFR 1.6001-1) |
| Bank account metadata | **7 years** or until customer disconnects | Tied to transaction records above |
| Plaid access tokens | **Until customer disconnects** or 90 days inactive | Operational requirement |
| Customer PII | **Active relationship + 3 years** post-final-job | NY business-records standard |
| Invoices + payments | **7 years** from invoice date | IRS / state sales-tax audit standard |
| File uploads (photos, contracts) | **Active relationship + 3 years** | Tied to client record above |
| API request logs | **30 days** | Supabase platform default |
| Backups (Supabase) | **7 days** rolling window | Supabase free-tier default; pro-tier extends to 30 days |
| Operator credentials | **Until rotated or revoked** | Security best practice — rotate quarterly |

---

## 4. Disposal Procedures

### 4.1 Consumer financial data
- **Plaid access tokens:** Deleted via Plaid `/item/remove` API call. SNT initiates this when a customer disconnects, when an account is closed, or when 90 days of inactivity elapse. The corresponding `bank_accounts.plaid_access_token` value is set to NULL in Supabase Postgres immediately after the Plaid API call succeeds.
- **Bank transactions:** Soft-deleted after 7 years via a scheduled pg_cron job (planned implementation). Permanent deletion follows 30 days later from soft-delete to allow accidental-deletion recovery.
- **On customer request:** SNT processes data-deletion requests within 30 days of receipt. The customer-facing endpoint at https://branchmanager.app/data-deletion.html documents the request process.

### 4.2 PII and customer records
- Cold-archived after 3 years of inactivity (no quotes, jobs, invoices, or payments). Cold archive is a separate Supabase Storage bucket with restricted access.
- Permanently deleted on written customer request.

### 4.3 Operator credentials
- Personal Access Tokens (GitHub, Supabase) rotated quarterly or upon any leak suspicion.
- API tokens (Plaid, Stripe, Resend, Dialpad) rotated upon any leak suspicion. Old tokens are revoked at the vendor portal before deletion from Supabase Secrets Manager.
- All deletion events logged via Supabase Audit Logs for compliance review.

### 4.4 Physical media
- The operator's MacBook is FileVault-encrypted (AES-256). On device retirement, the disk is securely erased via macOS Disk Utility's "Erase All Content and Settings" (cryptographic erasure).
- No paper records are retained; all customer correspondence is digital.

---

## 5. Roles & Responsibilities

SNT operates as a single-member LLC. **Doug Brown** is responsible for:

- Setting and reviewing this policy
- Executing data-deletion requests within the 30-day SLA
- Quarterly token rotation
- Annual policy review (on the anniversary of the Effective Date)
- Logging deletion events for compliance evidence

Future hires with system access will be trained on this policy and signed acknowledgements retained.

---

## 6. Customer Rights

Consumers (BM customer-portal users and SNT clients) have the right to:

1. **Request a copy** of all personal data SNT holds about them — fulfilled within 30 days.
2. **Request deletion** of personal data — fulfilled within 30 days, except records SNT is legally required to retain (e.g., 7-year IRS invoice retention).
3. **Disconnect Plaid** at any time — handled via the BM customer portal or by request to info@peekskilltree.com.
4. **Correct inaccurate data** — emailed corrections processed same-day where possible.

Requests are submitted to **info@peekskilltree.com** and logged with date, request type, and resolution date.

---

## 7. Third-Party Processor Retention

SNT verifies that all third-party processors offer compatible retention practices:

- **Plaid:** Tokens deleted on customer disconnect; transaction data not retained beyond Plaid's own SOC 2-defined window. (per [plaid.com/legal](https://plaid.com/legal))
- **Stripe:** PCI-DSS Level 1; payment records retained per Stripe's policy.
- **Supabase:** SOC 2 Type 2; backup window 7 days (free) / 30 days (pro); data deletion supported on account closure.
- **Resend:** SOC 2 Type 2; email logs retained 30 days.
- **Cloudflare:** SOC 2 Type 2; minimal logging at our request.

---

## 8. Periodic Review

This policy is reviewed annually on the anniversary of the Effective Date. The review includes:

- Re-verification of vendor SOC 2 reports (still current?)
- Audit of access-token inventory (still active, still needed?)
- Soft-delete cron job execution audit (running successfully?)
- Review of any customer-deletion requests received in the prior year (resolved within SLA?)

Review outcomes are documented in this policy's revision history.

---

## 9. Compliance References

- **Internal Revenue Code 26 CFR 1.6001-1:** business records retained 3-7 years
- **New York 23 NYCRR 500:** information security program requirements for covered financial entities (SNT not a covered entity; we apply applicable controls voluntarily)
- **Plaid Developer Policy:** [plaid.com/legal](https://plaid.com/legal)
- **NY State business records:** 6 years standard

---

## 10. Acknowledgement

By signing below, the Owner acknowledges authorship and adoption of this policy.

**Doug Brown** — Managing Member, Second Nature Tree Service LLC
Date: 2026-05-23
Signature: ___________________________

---

*Document version 1.0 · Last updated 2026-05-23*
