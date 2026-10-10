#!/usr/bin/env python3
"""
Apply the 2026-05-19 Jobber → BM delta (read-out by compare_2026-05-19.py):
  • INSERT 8 new clients
  • INSERT 6 new quotes (mapping client_id via name match after client insert)
  • All tagged import_source='jobber-csv' + notes='Mirrored from Jobber 2026-05-19 parity sync'

Defaults to DRY-RUN. Pass --apply to write.
"""
import csv, json, os, sys, urllib.request, urllib.parse

DESK = '/Users/dougbrown/Desktop/jobber-archive/2026-05-19'
TENANT_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
SUPA_URL = 'https://ltpivkqahvplapyagljt.supabase.co'
SK = open('/tmp/.bm-svc-key').read().strip()
HEADERS = {'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
TAG = 'Mirrored from Jobber 2026-05-19 parity sync'
DRY = '--apply' not in sys.argv
print(f"Mode: {'APPLY (writes)' if not DRY else 'DRY-RUN (no writes)'}\n")

def supa(method, path, data=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as r:
        t = r.read()
        return json.loads(t) if t else None

def phone10(s):
    return ''.join(c for c in str(s or '') if c.isdigit())[-10:]

# ── load + filter new-format invoices/quotes; clean clients/jobs ─────
def read_new_format(path):
    with open(path) as f: lines = f.readlines()
    hi = None
    for i, line in enumerate(lines):
        if any(line.startswith(p) for p in ('Total','Created Within','Sent Within','Won Within','Draft','Outstanding','Received','Bad Debt','Totals')):
            continue
        if line.count(',') >= 4:
            hi = i; break
    if hi is None: return []
    rows = []
    for r in csv.DictReader(lines[hi:]):
        if any((v or '').startswith('Report totals') for v in r.values()): continue
        if not any((v or '').strip() for v in r.values()): continue
        rows.append(r)
    return rows

J_Q = read_new_format(f'{DESK}/Quotes Report (Legacy).csv')
J_C = [r for r in csv.DictReader(open(f'{DESK}/Client Contact Info.csv'))
       if (r.get('Contact') or '').strip() and not (r.get('Contact') or '').startswith('Report totals')]

# ── identify which clients need inserting ────────────────────────────
BM_CACHE = '/Users/dougbrown/Desktop/Tree/branchmanager-app/scripts/jobber-parity-2026-05-08'
BM_C = json.load(open(f'{BM_CACHE}/bm-clients.json'))
bm_c_by_phone = {phone10(c.get('phone')): c for c in BM_C if phone10(c.get('phone'))}
bm_c_names = {(c.get('name') or '').strip().lower() for c in BM_C}

new_clients = []
for j in J_C:
    name = (j.get('Contact') or '').strip()
    phone = phone10(j.get('Phone'))
    email = (j.get('Email') or '').strip()
    addr = (j.get('Billing address') or '').strip()
    if not name: continue
    matched = (phone and phone in bm_c_by_phone) or (name.lower() in bm_c_names)
    if not matched:
        new_clients.append({
            'tenant_id': TENANT_ID,
            'name': name,
            'phone': phone or None,
            'email': email or None,
            'address': addr or None,
            'import_source': 'jobber-csv',
            'notes': TAG,
        })

print(f"CLIENTS to insert: {len(new_clients)}")
for c in new_clients: print(f"  → {c['name']:<28} {c['phone'] or '-':<12} {c['email'] or '-'}")
print()

# ── insert clients (or dry-run) ──────────────────────────────────────
inserted_client_by_name = {}  # name (lowercase) → id
if not DRY and new_clients:
    res = supa('POST', 'clients', new_clients)
    for r in (res or []):
        inserted_client_by_name[(r.get('name') or '').strip().lower()] = r.get('id')
    print(f"  ✅ Inserted {len(res or [])} clients")
elif DRY:
    print("  [dry-run] would insert these clients")
print()

# ── identify which quotes need inserting ─────────────────────────────
BM_Q = json.load(open(f'{BM_CACHE}/bm-quotes.json'))
bm_q_nums = {int(q['quote_number']) for q in BM_Q if q.get('quote_number')}

# rebuild client name → id index (existing BM clients + newly inserted)
all_client_by_name = {(c.get('name') or '').strip().lower(): c.get('id') for c in BM_C}
all_client_by_name.update(inserted_client_by_name)

new_quotes = []
status_map = {'awaiting response':'sent','draft':'draft','converted':'converted','approved':'approved','changes requested':'changes_requested','archived':'archived'}
for j in J_Q:
    raw_num = (j.get('#') or '').strip()
    if not raw_num.isdigit(): continue
    num = int(raw_num)
    if num in bm_q_nums: continue
    name = (j.get('Client name') or '').strip()
    cid = all_client_by_name.get(name.lower())
    total = float(str(j.get('Total $') or '0').replace(',','').replace('$','').strip())
    status = status_map.get((j.get('Status') or '').lower().strip(), 'draft')
    new_quotes.append({
        'tenant_id': TENANT_ID,
        'quote_number': num,
        'client_id': cid,
        'client_name': name,
        'total': total,
        'status': status,
        'notes': TAG,
    })

print(f"QUOTES to insert: {len(new_quotes)}")
for q in new_quotes: print(f"  → #{q['quote_number']:<5} {q['client_name']:<28} ${q['total']:<10.2f} {q['status']:<10} client_id={'set' if q['client_id'] else 'NULL'}")
print()

if not DRY and new_quotes:
    res = supa('POST', 'quotes', new_quotes)
    print(f"  ✅ Inserted {len(res or [])} quotes")
elif DRY:
    print("  [dry-run] would insert these quotes")
print()

print('=' * 60)
print(f"SUMMARY: {'WOULD INSERT' if DRY else 'INSERTED'} {len(new_clients)} clients + {len(new_quotes)} quotes")
print('=' * 60)
