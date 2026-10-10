#!/usr/bin/env python3
"""
Jobber → Branch Manager sync script
Reads downloaded Jobber JSON exports and updates Supabase (BM's cloud store).

Sources:
  ~/Desktop/jobber-clients.json  — 540 clients
  ~/Desktop/jobber-jobs.json     — 261 jobs
  ~/Desktop/jobber-invoices.json — 350 invoices

Operations:
  1. Jobs: set status='invoiced' where Jobber job has invoices and BM has matching job_number
  2. Invoices: set status='paid', balance=0, amount_paid=total where Jobber invoice is paid
"""

import json, os, time, urllib.request, urllib.parse

# ── Config ──
SUPA_URL  = "https://ltpivkqahvplapyagljt.supabase.co"
# Fetch service role key at runtime
import subprocess, sys

def get_service_key():
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not tok:
        raise SystemExit("SUPABASE_ACCESS_TOKEN env var required — get a PAT at https://supabase.com/dashboard/account/tokens and `export SUPABASE_ACCESS_TOKEN=sbp_...` (never hardcode it)")
    result = subprocess.run([
        "curl", "-s", "https://api.supabase.com/v1/projects/ltpivkqahvplapyagljt/api-keys",
        "-H", f"Authorization: Bearer {tok}"
    ], capture_output=True, text=True)
    data = json.loads(result.stdout)
    for k in data:
        if k.get("name") == "service_role":
            return k["api_key"]
    raise Exception("service_role key not found")

SERVICE_KEY = get_service_key()
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

DESKTOP = os.path.expanduser("~/Desktop")

# ── Helpers ──
def supa_get(path, params=""):
    url = f"{SUPA_URL}/rest/v1/{path}{'?' + params if params else ''}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def supa_patch(table, filter_str, data):
    url = f"{SUPA_URL}/rest/v1/{table}?{filter_str}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="PATCH")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# ── Load Jobber exports ──
print("Loading Jobber exports…")
with open(f"{DESKTOP}/jobber-jobs.json")     as f: j_jobs     = json.load(f)
with open(f"{DESKTOP}/jobber-invoices.json") as f: j_invoices = json.load(f)
with open(f"{DESKTOP}/jobber-clients.json")  as f: j_clients  = json.load(f)
print(f"  Jobs: {len(j_jobs)}  Invoices: {len(j_invoices)}  Clients: {len(j_clients)}")

# ── Build Jobber lookup maps ──
# job_number → has_invoice
j_jobs_invoiced = set()
for job in j_jobs:
    nodes = job.get("invoices", {}).get("nodes", [])
    if nodes:
        j_jobs_invoiced.add(job["jobNumber"])

# invoice_number → {status, total, balance}
j_inv_map = {}
for inv in j_invoices:
    num = inv.get("invoiceNumber")
    if num:
        amounts = inv.get("amounts", {})
        j_inv_map[str(num)] = {
            "status": inv.get("invoiceStatus", ""),
            "total": amounts.get("total", 0),
            "balance": amounts.get("invoiceBalance", 0),
            "paid": amounts.get("paymentsTotal", 0)
        }

print(f"\nJobber jobs with invoices: {len(j_jobs_invoiced)}")
print(f"Jobber invoices by status: paid={sum(1 for v in j_inv_map.values() if v['status']=='paid')}, "
      f"past_due={sum(1 for v in j_inv_map.values() if v['status']=='past_due')}, "
      f"draft={sum(1 for v in j_inv_map.values() if v['status']=='draft')}")

# ── Fetch all BM jobs from Supabase ──
print("\n─── JOBS SYNC ───")
print("Fetching BM jobs from Supabase…")
bm_jobs = []
offset = 0
while True:
    batch = supa_get("jobs", f"select=id,job_number,status&order=job_number&limit=1000&offset={offset}")
    bm_jobs.extend(batch)
    if len(batch) < 1000: break
    offset += 1000
print(f"  BM jobs in Supabase: {len(bm_jobs)}")

# Jobs to update: BM status != 'invoiced' AND Jobber has an invoice for this job_number
jobs_to_update = [
    j for j in bm_jobs
    if j.get("status") not in ("invoiced",)
    and j.get("job_number") in j_jobs_invoiced
]
print(f"  Jobs to mark invoiced: {len(jobs_to_update)}")

updated_jobs = 0
for job in jobs_to_update:
    jn = job["job_number"]
    try:
        rows = supa_patch("jobs", f"job_number=eq.{jn}", {"status": "invoiced"})
        if rows:
            updated_jobs += 1
            print(f"  ✓ Job #{jn}: completed → invoiced")
        else:
            print(f"  ✗ Job #{jn}: no rows updated")
    except Exception as e:
        print(f"  ✗ Job #{jn}: {e}")

print(f"\nJobs updated: {updated_jobs}/{len(jobs_to_update)}")

# ── Fetch all BM invoices from Supabase ──
print("\n─── INVOICES SYNC ───")
print("Fetching BM invoices from Supabase…")
bm_invoices = []
offset = 0
while True:
    batch = supa_get("invoices", f"select=id,invoice_number,status,balance,amount_paid&limit=1000&offset={offset}")
    bm_invoices.extend(batch)
    if len(batch) < 1000: break
    offset += 1000
print(f"  BM invoices in Supabase: {len(bm_invoices)}")

# Group BM invoice status for reporting
bm_inv_statuses = {}
for inv in bm_invoices:
    s = inv.get("status", "?")
    bm_inv_statuses[s] = bm_inv_statuses.get(s, 0) + 1
print(f"  BM invoice statuses: {bm_inv_statuses}")

# Invoices to update: BM status != 'paid' AND Jobber says 'paid'
invoices_to_update = []
for inv in bm_invoices:
    num = str(inv.get("invoice_number", ""))
    if not num: continue
    j_inv = j_inv_map.get(num)
    if j_inv and j_inv["status"] == "paid" and inv.get("status") != "paid":
        invoices_to_update.append((inv, j_inv))

print(f"  Invoices to mark paid: {len(invoices_to_update)}")

# Also fix invoices that are 'paid' in BM but have amount_paid=0 (from Jobber data)
invoices_to_fix_amount = []
for inv in bm_invoices:
    num = str(inv.get("invoice_number", ""))
    if not num: continue
    j_inv = j_inv_map.get(num)
    if j_inv and j_inv["status"] == "paid" and inv.get("status") == "paid":
        # Check if amount_paid is missing/wrong
        bm_paid = float(inv.get("amount_paid") or 0)
        j_paid  = float(j_inv.get("paid") or j_inv.get("total") or 0)
        if bm_paid == 0 and j_paid > 0:
            invoices_to_fix_amount.append((inv, j_inv))

print(f"  Paid invoices with amount_paid=0 to fix: {len(invoices_to_fix_amount)}")

updated_invoices = 0
for inv, j_inv in invoices_to_update:
    num = inv["invoice_number"]
    paid_amt = float(j_inv.get("paid") or j_inv.get("total") or 0)
    try:
        rows = supa_patch("invoices", f"invoice_number=eq.{num}", {
            "status": "paid",
            "balance": 0,
            "amount_paid": paid_amt
        })
        if rows:
            updated_invoices += 1
            print(f"  ✓ Invoice #{num}: → paid (${paid_amt:.2f})")
        else:
            print(f"  ✗ Invoice #{num}: no rows updated")
    except Exception as e:
        print(f"  ✗ Invoice #{num}: {e}")

fixed_amounts = 0
for inv, j_inv in invoices_to_fix_amount:
    num = inv["invoice_number"]
    paid_amt = float(j_inv.get("paid") or j_inv.get("total") or 0)
    try:
        rows = supa_patch("invoices", f"invoice_number=eq.{num}", {
            "amount_paid": paid_amt,
            "balance": 0
        })
        if rows:
            fixed_amounts += 1
    except Exception as e:
        print(f"  ✗ Fix amount Invoice #{num}: {e}")

print(f"\nInvoices marked paid: {updated_invoices}/{len(invoices_to_update)}")
print(f"Invoice amounts corrected: {fixed_amounts}/{len(invoices_to_fix_amount)}")

# ── Summary ──
print("\n═══════════════════════════════")
print(f"SYNC COMPLETE")
print(f"  Jobs marked invoiced:   {updated_jobs}")
print(f"  Invoices marked paid:   {updated_invoices}")
print(f"  Invoice amounts fixed:  {fixed_amounts}")
print("═══════════════════════════════")
print("\nNext: hard-reload BM in browser to pull fresh data from Supabase.")
