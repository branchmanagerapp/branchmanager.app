#!/usr/bin/env python3
"""
Refresh the BM-side cache JSONs so apply.py compares against CURRENT
Branch Manager state, not the 2026-05-08 snapshot.

Pulls all rows for the SNT tenant from clients / invoices / quotes /
jobs / requests / payments and writes them into the cache dir. Idempotent.

Run BEFORE apply.py whenever you've just exported a fresh Jobber report
and are about to run a parity sync. Pure read-only against Supabase.

Usage:
  python3 scripts/jobber-parity-2026-05-08/pull_bm_cache.py
"""
import json, os, sys, urllib.request, urllib.parse

TENANT_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
SUPA_URL  = 'https://ltpivkqahvplapyagljt.supabase.co'
SK = open('/tmp/.bm-svc-key').read().strip()
HEADERS = {'apikey': SK, 'Authorization': f'Bearer {SK}'}
CACHE = os.path.dirname(os.path.abspath(__file__))

TABLES = [
    ('clients',  'bm-clients.json',  'id,name,phone,email,address,created_at,notes,import_source'),
    ('invoices', 'bm-invoices.json', 'id,invoice_number,client_id,client_name,total,balance,amount_paid,status,due_date,paid_date,created_at'),
    ('quotes',   'bm-quotes.json',   'id,quote_number,client_id,client_name,total,status,created_at,notes'),
    ('jobs',     'bm-jobs.json',     'id,job_number,client_id,client_name,description,total,status,scheduled_date,created_at,property'),
    ('payments', 'bm-payments.json', 'id,invoice_id,invoice_number,amount,method,date,status,source,created_at'),
    ('requests', 'bm-requests.json', 'id,request_number,client_id,client_name,client_phone,email,title,status,source,created_at'),
]

def fetch_all(table, cols):
    """Paginated full-table fetch for one tenant, PostgREST max 1000/row."""
    out, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            'select': cols,
            'tenant_id': f'eq.{TENANT_ID}',
            'order': 'created_at.desc',
            'limit': '1000',
            'offset': str(offset),
        })
        url = f"{SUPA_URL}/rest/v1/{table}?{q}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req) as r:
            page = json.loads(r.read())
        out.extend(page)
        if len(page) < 1000:
            break
        offset += 1000
    return out

def main():
    print(f"Pulling fresh BM cache to {CACHE}/")
    total = 0
    for table, fname, cols in TABLES:
        rows = fetch_all(table, cols)
        path = os.path.join(CACHE, fname)
        with open(path, 'w') as f:
            json.dump(rows, f, indent=2)
        print(f"  {table:10s} → {len(rows):5d} rows → {fname}")
        total += len(rows)
    print(f"Done. {total} rows total.")

if __name__ == '__main__':
    main()
