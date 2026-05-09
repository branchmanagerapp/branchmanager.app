#!/usr/bin/env python3
"""
Jobber → BM parity apply (2026-05-08 first daily-parity run)

Applies the dry-run delta:
  • DELETE: invoice #400 (Doug $0.54 test, BM-only, confirmed safe)
  • UPDATE: 133 invoices (per-invoice total/balance fix from Jobber CSV)
  • INSERT: 64 quotes  +  10 clients  +  18 jobs  (Jobber-only)
  • All inserts tagged notes='Mirrored from Jobber 2026-05-08 parity sync'

NOT applied (held for review):
  • 55 BM-only quotes (real history, would lose paper trail)
  • 105 BM-only jobs (mostly recurring-scope mismatch)
  • 6 BM-only clients (BM-side intake leads)
"""
import csv, json, os, sys, urllib.request, urllib.parse
from datetime import datetime

DESK = '/Users/dougbrown/Desktop'
CACHE = '/Users/dougbrown/Desktop/Tree/branchmanager-app/scripts/jobber-parity-2026-05-08'
TENANT_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
SUPA_URL = 'https://ltpivkqahvplapyagljt.supabase.co'
SK = open('/tmp/.bm-svc-key').read().strip()
HEADERS = {'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
PARITY_TAG = 'Mirrored from Jobber 2026-05-08 parity sync'
TODAY = '2026-05-08'

DRY = '--apply' not in sys.argv
print(f"Mode: {'APPLY (writes will happen)' if not DRY else 'DRY-RUN (no writes)'}")
print()

def supa_request(method, path, data=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code}: {body}")

def parse_money(s):
    if not s or s == '-': return 0.0
    return float(str(s).replace('$','').replace(',','').strip())

def parse_jobber_date(s):
    if not s or s.strip() in ('','-'): return None
    for fmt in ('%b %d, %Y', '%Y-%m-%d'):
        try: return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError: continue
    return None

def map_inv_status(s):
    s = (s or '').lower().strip()
    return {'paid':'paid','past due':'overdue','draft':'draft','awaiting payment':'sent','bad debt':'archived'}.get(s, s)

def map_quote_status(s):
    s = (s or '').lower().strip()
    return {'awaiting response':'sent','draft':'draft','converted':'converted','approved':'approved','changes requested':'changes_requested','archived':'archived'}.get(s, s)

# ─────────────────────────────────────
# 1. DELETE invoice #400
# ─────────────────────────────────────
print("="*70)
print("STEP 1 — DELETE invoice #400 (Doug $0.54 test)")
print("="*70)
if not DRY:
    r = supa_request('DELETE', 'invoices?invoice_number=eq.400')
    print(f"  Deleted: {len(r) if r else 0} row(s)")
else:
    print("  [dry-run] Would DELETE FROM invoices WHERE invoice_number=400")

# ─────────────────────────────────────
# 2. UPDATE invoices — fix per-invoice total/balance from Jobber CSV
# ─────────────────────────────────────
print()
print("="*70)
print("STEP 2 — UPDATE invoices (totals/balances from Jobber)")
print("="*70)

J_INV = list(csv.DictReader(open(f'{DESK}/Invoices_Report_1_of_1_2026-05-08.csv')))
BM_INV = json.load(open(f'{CACHE}/bm-invoices.json'))
bm_by_num = {int(i['invoice_number']): i for i in BM_INV if i.get('invoice_number')}

updated, errors = 0, 0
for jr in J_INV:
    if not jr['Invoice #'].isdigit(): continue
    n = int(jr['Invoice #'])
    if n not in bm_by_num: continue  # would-be insert, but we said 0 inserts
    bm = bm_by_num[n]
    j_total = parse_money(jr['Total ($)'])
    j_balance = parse_money(jr['Balance ($)'])
    j_subtotal = parse_money(jr['Pre-tax total ($)'])
    j_tax = parse_money(jr['Tax amount ($)'])
    j_status = map_inv_status(jr['Status'])
    j_paid_date = parse_jobber_date(jr['Marked paid date'])
    j_due = parse_jobber_date(jr['Due date'])
    
    bm_total = float(bm.get('total') or 0)
    bm_bal = float(bm.get('balance') or 0)
    bm_status = (bm.get('status') or '').lower()
    
    patch = {}
    if abs(bm_total - j_total) > 0.01:
        patch['total'] = j_total
    if abs(bm_bal - j_balance) > 0.01:
        patch['balance'] = j_balance
    if bm_status != j_status:
        patch['status'] = j_status
    if j_subtotal and abs(float(bm.get('subtotal') or 0) - j_subtotal) > 0.01:
        patch['subtotal'] = j_subtotal
    if j_tax and abs(float(bm.get('tax_amount') or 0) - j_tax) > 0.01:
        patch['tax_amount'] = j_tax
    # Recompute amount_paid: total - balance
    j_amount_paid = max(0.0, j_total - j_balance)
    if abs(float(bm.get('amount_paid') or 0) - j_amount_paid) > 0.01:
        patch['amount_paid'] = j_amount_paid
    if j_paid_date and bm.get('paid_date') != j_paid_date:
        patch['paid_date'] = j_paid_date
    if j_due and bm.get('due_date') != j_due:
        patch['due_date'] = j_due
    
    if not patch: continue
    
    if not DRY:
        try:
            r = supa_request('PATCH', f'invoices?invoice_number=eq.{n}', patch)
            if r: updated += 1
        except Exception as e:
            errors += 1
            print(f"  ✗ #{n}: {str(e)[:120]}")
    else:
        updated += 1

print(f"  Updated: {updated}  Errors: {errors}")

# ─────────────────────────────────────
# 3. INSERT clients (10 missing in BM)
# ─────────────────────────────────────
print()
print("="*70)
print("STEP 3 — INSERT clients (10 Jobber-only)")
print("="*70)
JC = list(csv.DictReader(open(f'{DESK}/Clients_Report_1_of_1_2026-05-08.csv')))
BMC = json.load(open(f'{CACHE}/bm-clients.json'))

def np(p): return ''.join(c for c in (p or '') if c.isdigit())[-10:]
def ne(e): return (e or '').strip().lower()
def nn(n): return ' '.join((n or '').strip().lower().split())
bm_phones = {np(c.get('phone','')) for c in BMC if np(c.get('phone',''))}
bm_emails = {ne(c.get('email','')) for c in BMC if ne(c.get('email',''))}
bm_names  = {nn(c.get('name','')) for c in BMC if nn(c.get('name',''))}

inserts_c = []
for r in JC:
    p = np(r['Phone']); e = ne(r['Email']); n = nn(r['Client name'])
    if p and p in bm_phones: continue
    if e and e in bm_emails: continue
    if n and n in bm_names: continue
    inserts_c.append(r)

inserted_c = 0
client_id_by_name = {}  # so quotes/jobs can FK these
for r in inserts_c:
    name = r['Client name'].strip()
    parts = name.split(None, 1)
    first = parts[0] if parts else ''
    last = parts[1] if len(parts) > 1 else ''
    status = (r['Status'] or 'lead').lower().strip()
    if status not in ('lead','active','archived','inactive'): status = 'lead'
    payload = {
        'tenant_id': TENANT_ID,
        'name': name,
        'first_name': first, 'last_name': last,
        'phone': r['Phone'].strip() or None,
        'email': r['Email'].strip().lower() or None,
        'status': status,
        'source': r.get('Lead source','').strip() or None,
        'notes': PARITY_TAG,
        'import_source': 'jobber-parity-2026-05-08',
    }
    if not DRY:
        try:
            res = supa_request('POST', 'clients', payload)
            if res:
                inserted_c += 1
                client_id_by_name[nn(name)] = res[0]['id']
                print(f"  ✓ {name}  → {res[0]['id'][:8]}")
        except Exception as e:
            print(f"  ✗ {name}: {str(e)[:120]}")
    else:
        inserted_c += 1
        print(f"  [dry-run] {name}  status={status}")

print(f"  Inserted: {inserted_c}/{len(inserts_c)}")

# Refresh client lookups (now includes inserted ones)
if not DRY:
    fresh_clients = supa_request('GET', f'clients?select=id,name,phone,email&tenant_id=eq.{TENANT_ID}&limit=2000')
else:
    fresh_clients = BMC + [{'id': f'NEW-{i}', 'name': r['Client name'], 'phone': r['Phone'], 'email': r['Email']} for i,r in enumerate(inserts_c)]

bm_client_lookup = {}
for c in fresh_clients:
    if nn(c.get('name','')): bm_client_lookup[nn(c['name'])] = c['id']

def find_client_id(name, phone='', email=''):
    n = nn(name); p = np(phone); e = ne(email)
    if n in bm_client_lookup: return bm_client_lookup[n]
    # Fallbacks via phone/email
    for c in fresh_clients:
        if p and np(c.get('phone','')) == p: return c['id']
        if e and ne(c.get('email','')) == e: return c['id']
    return None

# ─────────────────────────────────────
# 4. INSERT quotes (64 missing)
# ─────────────────────────────────────
print()
print("="*70)
print("STEP 4 — INSERT quotes (64 Jobber-only)")
print("="*70)
JQ = list(csv.DictReader(open(f'{DESK}/Quotes_Report_1_of_1_2026-05-08.csv')))
BMQ = json.load(open(f'{CACHE}/bm-quotes.json'))
bm_q_nums = {int(q['quote_number']) for q in BMQ if q.get('quote_number')}

inserted_q, errors_q = 0, 0
for r in JQ:
    if not r['Quote #'].isdigit(): continue
    n = int(r['Quote #'])
    if n in bm_q_nums: continue
    cid = find_client_id(r['Client name'], r['Client phone'], r['Client email'])
    payload = {
        'tenant_id': TENANT_ID,
        'quote_number': n,
        'client_name': r['Client name'].strip() or None,
        'client_email': (r['Client email'] or '').strip().lower() or None,
        'client_phone': r['Client phone'].strip() or None,
        'client_id': cid,
        'subject': r['Title'].strip() or None,
        'status': map_quote_status(r['Status']),
        'subtotal': parse_money(r['Subtotal ($)']),
        'total': parse_money(r['Total ($)']),
        'discount': parse_money(r['Discount ($)']),
        'deposit_required': parse_money(r['Required deposit ($)']) > 0,
        'deposit_amount': parse_money(r['Required deposit ($)']) or None,
        'sent_at': parse_jobber_date(r['Sent date']),
        'approved_at': parse_jobber_date(r['Approved date']),
        'created_at': parse_jobber_date(r['Drafted date']) or TODAY,
        'notes': PARITY_TAG,
        'import_source': 'jobber-parity-2026-05-08',
    }
    if not DRY:
        try:
            res = supa_request('POST', 'quotes', payload)
            if res: inserted_q += 1
        except Exception as e:
            errors_q += 1
            print(f"  ✗ Q#{n}: {str(e)[:140]}")
    else:
        inserted_q += 1
print(f"  Inserted: {inserted_q}/{64}  Errors: {errors_q}")

# ─────────────────────────────────────
# 5. INSERT jobs (18 missing)
# ─────────────────────────────────────
print()
print("="*70)
print("STEP 5 — INSERT jobs (18 Jobber-only)")
print("="*70)
JJ = list(csv.DictReader(open(f'{DESK}/One-off jobs_Report_1_of_1_2026-05-08.csv')))
BMJ = json.load(open(f'{CACHE}/bm-jobs.json'))
bm_j_nums = {int(j['job_number']) for j in BMJ if j.get('job_number')}

inserted_j, errors_j = 0, 0
for r in JJ:
    if not r['Job #'].isdigit(): continue
    n = int(r['Job #'])
    if n in bm_j_nums: continue
    cid = find_client_id(r['Client name'], r['Client phone'], r['Client email'])
    closed = parse_jobber_date(r['Closed date'])
    sched = parse_jobber_date(r['Scheduled start date'])
    status = 'completed' if closed else ('scheduled' if sched else 'active')
    payload = {
        'tenant_id': TENANT_ID,
        'job_number': n,
        'client_name': r['Client name'].strip() or None,
        'client_email': (r['Client email'] or '').strip().lower() or None,
        'client_phone': r['Client phone'].strip() or None,
        'client_id': cid,
        'description': r['Title'].strip() or None,
        'status': status,
        'scheduled_date': sched,
        'completed_at': closed,
        'completed_date': closed,
        'total': parse_money(r['Total revenue ($)']),
        'discount': parse_money(r['Quote discount ($)']),
        'created_at': sched or TODAY,
        'notes': PARITY_TAG,
        'import_source': 'jobber-parity-2026-05-08',
    }
    if not DRY:
        try:
            res = supa_request('POST', 'jobs', payload)
            if res: inserted_j += 1
        except Exception as e:
            errors_j += 1
            print(f"  ✗ J#{n}: {str(e)[:140]}")
    else:
        inserted_j += 1
print(f"  Inserted: {inserted_j}/{18}  Errors: {errors_j}")

# ─────────────────────────────────────
# Summary
# ─────────────────────────────────────
print()
print("="*70)
print("SUMMARY")
print("="*70)
print(f"  invoices: -1 deleted  {updated} updated")
print(f"  clients:  +{inserted_c} inserted")
print(f"  quotes:   +{inserted_q} inserted")
print(f"  jobs:     +{inserted_j} inserted")
print(f"  Mode: {'APPLIED' if not DRY else 'DRY-RUN ONLY'}")
