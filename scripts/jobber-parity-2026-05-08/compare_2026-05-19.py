#!/usr/bin/env python3
"""
One-off comparator for the 2026-05-19 Jobber sync.

Reads the 4 fresh CSVs Doug downloaded from Gmail today (which arrive in
Jobber's NEWER UI format — totals block at top, "Report totals:" footer,
different column names than the May-8 baseline export) and compares to
the freshly-pulled BM cache (bm-*.json in this folder).

Reports the delta in plain English. No writes. Doug decides what to
apply manually after seeing the report.

Jobber's new format → BM mapping:
  Invoices: #            → invoice_number
            Total $      → total
            Balance $    → balance
            Status       → status (Draft/Past Due/Paid/Bad Debt)
            Client name  → client_name
  Quotes:   #            → quote_number
            Status       → status (Draft/Awaiting response/Approved/Converted/Archived)
            Total $      → total
  Jobs:     Job #        → job_number   (already old-format, no skipping needed)
  Clients:  Contact      → name
            Phone        → phone (any format)
"""
import csv, json, os, re, sys

DESK = '/Users/dougbrown/Desktop'
CACHE = os.path.dirname(os.path.abspath(__file__))

# ── helpers ──────────────────────────────────────────────────────────
def money(s):
    if not s: return 0.0
    return float(str(s).replace('$','').replace(',','').replace(' ',''))

def phone10(s):
    return ''.join(c for c in str(s or '') if c.isdigit())[-10:]

def read_new_format_csv(path):
    """New Jobber report format: skip the top totals block + bottom Report
    totals: row. Returns list of dict rows from the actual data section."""
    with open(path) as f:
        lines = f.readlines()
    # Find the real header — first line with many commas AND no leading "Total"
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith('Total') or line.startswith('Created Within') or line.startswith('Sent Within') or line.startswith('Won Within') or line.startswith('Draft') or line.startswith('Outstanding') or line.startswith('Received') or line.startswith('Bad Debt'):
            continue
        if line.count(',') >= 4 and not line.lower().startswith('totals'):
            header_idx = i
            break
    if header_idx is None:
        return []
    reader = csv.DictReader(lines[header_idx:])
    rows = []
    for r in reader:
        # Skip the "Report totals:" footer row
        if any((v or '').startswith('Report totals') for v in r.values()):
            continue
        # Skip blank lines
        if not any((v or '').strip() for v in r.values()):
            continue
        rows.append(r)
    return rows

def read_clean_csv(path):
    """Old-style flat CSV (no totals block) — e.g. Client Contact Info."""
    with open(path) as f:
        return list(csv.DictReader(f))

# ── load CSVs ────────────────────────────────────────────────────────
J_INV  = read_new_format_csv(f'{DESK}/Invoices Report (Legacy).csv')
J_Q    = read_new_format_csv(f'{DESK}/Quotes Report (Legacy).csv')
J_C    = read_clean_csv(f'{DESK}/Client Contact Info.csv')
# One-off jobs from the newer UI uses the old dated naming pattern
import glob
j_jobs_files = sorted(glob.glob(f'{DESK}/One-off jobs_Report_1_of_1_*.csv'))
J_J = read_clean_csv(j_jobs_files[-1]) if j_jobs_files else []

print(f"Jobber CSV rows loaded:  {len(J_INV)} invoices · {len(J_C)} clients · {len(J_Q)} quotes · {len(J_J)} jobs")

# ── load BM cache ────────────────────────────────────────────────────
BM_INV  = json.load(open(f'{CACHE}/bm-invoices.json'))
BM_C    = json.load(open(f'{CACHE}/bm-clients.json'))
BM_Q    = json.load(open(f'{CACHE}/bm-quotes.json'))
BM_J    = json.load(open(f'{CACHE}/bm-jobs.json'))

print(f"BM cache rows:           {len(BM_INV)} invoices · {len(BM_C)} clients · {len(BM_Q)} quotes · {len(BM_J)} jobs")
print()

# ── INVOICES ─────────────────────────────────────────────────────────
print('=' * 70)
print('INVOICES — Jobber vs BM')
print('=' * 70)
bm_inv_by_num = {int(i['invoice_number']): i for i in BM_INV if i.get('invoice_number')}
new_inv, mismatch_inv = [], []
for j in J_INV:
    raw_num = (j.get('#') or '').strip()
    if not raw_num.isdigit():
        continue
    num = int(raw_num)
    j_total = money(j.get('Total $') or j.get('Total ($)'))
    j_balance = money(j.get('Balance $') or j.get('Balance ($)'))
    j_status_map = {'paid':'paid','past due':'overdue','draft':'draft','awaiting payment':'sent','bad debt':'archived'}
    j_status = j_status_map.get((j.get('Status') or '').lower().strip(), (j.get('Status') or '').lower().strip())
    bm = bm_inv_by_num.get(num)
    if not bm:
        new_inv.append({'num': num, 'client': j.get('Client name'), 'total': j_total, 'status': j_status})
    else:
        bm_total = float(bm.get('total') or 0)
        bm_balance = float(bm.get('balance') or 0)
        bm_status = (bm.get('status') or '').lower()
        diffs = []
        if abs(bm_total - j_total) > 0.01:    diffs.append(f"total {bm_total} → {j_total}")
        if abs(bm_balance - j_balance) > 0.01: diffs.append(f"balance {bm_balance} → {j_balance}")
        if bm_status != j_status and j_status: diffs.append(f"status {bm_status} → {j_status}")
        if diffs:
            mismatch_inv.append({'num': num, 'client': j.get('Client name'), 'diffs': diffs})

print(f"  NEW in Jobber (missing in BM): {len(new_inv)}")
for x in new_inv[:10]:
    print(f"    #{x['num']:<5} {x['client']:<30} ${x['total']:<10.2f} {x['status']}")
print(f"  MISMATCH (field drift): {len(mismatch_inv)}")
for x in mismatch_inv[:10]:
    print(f"    #{x['num']:<5} {x['client']:<30} {', '.join(x['diffs'])}")
print()

# ── QUOTES ───────────────────────────────────────────────────────────
print('=' * 70)
print('QUOTES — Jobber vs BM')
print('=' * 70)
bm_q_by_num = {int(q['quote_number']): q for q in BM_Q if q.get('quote_number')}
new_q = []
for j in J_Q:
    raw_num = (j.get('#') or '').strip()
    if not raw_num.isdigit():
        continue
    num = int(raw_num)
    if num not in bm_q_by_num:
        new_q.append({'num': num, 'client': j.get('Client name'), 'total': money(j.get('Total $') or j.get('Total ($)')), 'status': j.get('Status')})

print(f"  NEW in Jobber (missing in BM): {len(new_q)}")
for x in new_q[:20]:
    print(f"    #{x['num']:<5} {x['client']:<30} ${x['total']:<10.2f} {x['status']}")
print()

# ── JOBS ─────────────────────────────────────────────────────────────
print('=' * 70)
print('JOBS — Jobber vs BM')
print('=' * 70)
bm_j_by_num = {int(j['job_number']): j for j in BM_J if j.get('job_number')}
new_j = []
for j in J_J:
    raw_num = (j.get('Job #') or '').strip()
    if not raw_num.isdigit():
        continue
    num = int(raw_num)
    if num not in bm_j_by_num:
        new_j.append({'num': num, 'client': j.get('Client name'), 'title': j.get('Title'), 'total': money(j.get('Total revenue ($)'))})

print(f"  NEW in Jobber (missing in BM): {len(new_j)}")
for x in new_j[:20]:
    print(f"    #{x['num']:<5} {x['client']:<30} {x['title'][:40]:<40} ${x['total']:<10.2f}")
print()

# ── CLIENTS ──────────────────────────────────────────────────────────
print('=' * 70)
print('CLIENTS — Jobber vs BM (matched by phone last-10)')
print('=' * 70)
bm_c_by_phone = {}
for c in BM_C:
    p = phone10(c.get('phone'))
    if p: bm_c_by_phone[p] = c
bm_c_names = {(c.get('name') or '').strip().lower() for c in BM_C}
new_c = []
for j in J_C:
    name = (j.get('Contact') or '').strip()
    phone = phone10(j.get('Phone'))
    if not name and not phone:
        continue
    matched = (phone in bm_c_by_phone) or (name.lower() in bm_c_names)
    if not matched:
        new_c.append({'name': name, 'phone': phone, 'created': j.get('Created date'), 'email': j.get('Email')})

print(f"  NEW in Jobber (missing in BM): {len(new_c)}")
for x in new_c[:30]:
    print(f"    {x['created'][:12] if x['created'] else '-':<12} {x['name']:<30} {x['phone']:<12} {x['email'] or '-'}")
print()
print('=' * 70)
print(f'SUMMARY: {len(new_inv)} inv-new · {len(mismatch_inv)} inv-drift · {len(new_q)} q-new · {len(new_j)} j-new · {len(new_c)} c-new')
print('=' * 70)
