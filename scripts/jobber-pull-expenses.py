#!/usr/bin/env python3
"""
One-time pull of Jobber expenses → BM expenses table.

Jobber's public GraphQL API exposes Job.expenses (ExpenseConnection).
This script:
  1. Loads OAuth Client ID + Secret from ~/.config/jobber-oauth.env
  2. Either reads cached access_token, or opens browser for OAuth
  3. Paginates through Job nodes, pulling their expenses
  4. INSERTs into BM expenses table with import_source tag

Prereqs (one-time setup by Doug):
  1. developer.getjobber.com → Create Custom Integration
  2. Note Client ID + Secret + set redirect_uri to http://localhost:8765/callback
  3. Required scopes: read_jobs, write_expenses (write isn't needed if you
     only want to read — but Jobber doesn't have a read-only expenses scope
     per current docs)
  4. Save creds to ~/.config/jobber-oauth.env:
       JOBBER_CLIENT_ID=...
       JOBBER_CLIENT_SECRET=...
       JOBBER_REDIRECT_URI=http://localhost:8765/callback

Usage:
  python3 scripts/jobber-pull-expenses.py           # dry-run, prints counts
  python3 scripts/jobber-pull-expenses.py --apply   # insert into BM
"""
import json, os, sys, time, urllib.parse, urllib.request, http.server, socketserver, threading, webbrowser, base64
from datetime import datetime

# ── Config ──
TENANT_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
SUPA_URL  = 'https://ltpivkqahvplapyagljt.supabase.co'
SK_PATH   = '/tmp/.bm-svc-key'
JOBBER_API = 'https://api.getjobber.com/api/graphql'
JOBBER_OAUTH = 'https://api.getjobber.com/api/oauth/authorize'
JOBBER_TOKEN = 'https://api.getjobber.com/api/oauth/token'
ENV_PATH  = os.path.expanduser('~/.config/jobber-oauth.env')
TOKEN_CACHE = os.path.expanduser('~/.config/jobber-token.json')
TAG = 'Mirrored from Jobber 2026-05-20 expenses backfill'

DRY = '--apply' not in sys.argv
print(f"Mode: {'APPLY (writes)' if not DRY else 'DRY-RUN (no writes)'}\n")

# ── Load OAuth env ──
def load_env():
    if not os.path.exists(ENV_PATH):
        print(f"ERROR: {ENV_PATH} missing. Create with JOBBER_CLIENT_ID/SECRET/REDIRECT_URI.")
        sys.exit(2)
    env = {}
    for line in open(ENV_PATH):
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v.strip('"').strip("'")
    return env

# ── OAuth: browser flow on first run, cached token on later runs ──
def get_access_token():
    if os.path.exists(TOKEN_CACHE):
        try:
            tok = json.load(open(TOKEN_CACHE))
            if tok.get('expires_at', 0) > time.time() + 60:
                return tok['access_token']
            # Try refresh
            if tok.get('refresh_token'):
                return refresh_token(tok['refresh_token'])
        except Exception:
            pass
    return browser_oauth_flow()

def browser_oauth_flow():
    env = load_env()
    auth_code_holder = {}
    class CallbackHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if 'code' in qs:
                auth_code_holder['code'] = qs['code'][0]
                self.send_response(200); self.send_header('Content-Type','text/html'); self.end_headers()
                self.wfile.write(b'<h1>OK</h1><p>You can close this window.</p>')
            else:
                self.send_response(400); self.end_headers()
        def log_message(self, *a): pass

    port = int(env['JOBBER_REDIRECT_URI'].split(':')[2].split('/')[0])
    server = socketserver.TCPServer(("", port), CallbackHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    auth_url = (JOBBER_OAUTH + '?' + urllib.parse.urlencode({
        'response_type': 'code',
        'client_id': env['JOBBER_CLIENT_ID'],
        'redirect_uri': env['JOBBER_REDIRECT_URI'],
    }))
    print(f"Opening browser for Jobber OAuth: {auth_url}")
    webbrowser.open(auth_url)
    while 'code' not in auth_code_holder:
        time.sleep(0.5)
    server.shutdown()

    # Exchange code for token
    body = urllib.parse.urlencode({
        'client_id': env['JOBBER_CLIENT_ID'],
        'client_secret': env['JOBBER_CLIENT_SECRET'],
        'grant_type': 'authorization_code',
        'code': auth_code_holder['code'],
        'redirect_uri': env['JOBBER_REDIRECT_URI'],
    }).encode()
    req = urllib.request.Request(JOBBER_TOKEN, data=body, method='POST')
    with urllib.request.urlopen(req) as r:
        tok = json.loads(r.read())
    tok['expires_at'] = time.time() + int(tok.get('expires_in', 3600))
    os.makedirs(os.path.dirname(TOKEN_CACHE), exist_ok=True)
    with open(TOKEN_CACHE, 'w') as f: json.dump(tok, f)
    os.chmod(TOKEN_CACHE, 0o600)
    print(f"OAuth token cached, expires in {tok.get('expires_in')}s")
    return tok['access_token']

def refresh_token(rt):
    env = load_env()
    body = urllib.parse.urlencode({
        'client_id': env['JOBBER_CLIENT_ID'],
        'client_secret': env['JOBBER_CLIENT_SECRET'],
        'grant_type': 'refresh_token',
        'refresh_token': rt,
    }).encode()
    req = urllib.request.Request(JOBBER_TOKEN, data=body, method='POST')
    with urllib.request.urlopen(req) as r:
        tok = json.loads(r.read())
    tok['expires_at'] = time.time() + int(tok.get('expires_in', 3600))
    with open(TOKEN_CACHE, 'w') as f: json.dump(tok, f)
    return tok['access_token']

# ── GraphQL helper ──
def gql(query, token, variables=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    req = urllib.request.Request(JOBBER_API, data=body, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'X-JOBBER-GRAPHQL-VERSION': '2024-09-13',
    }, method='POST')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# ── Pull expenses via Job.expenses ──
PULL_QUERY = """
query JobsWithExpenses($cursor: String) {
  jobs(first: 50, after: $cursor) {
    pageInfo { endCursor hasNextPage }
    nodes {
      id
      jobNumber
      client { id firstName lastName }
      expenses {
        nodes {
          id
          title
          description
          total
          enteredOn
          paidBy { name }
          reimbursableTo { name }
        }
      }
    }
  }
}
"""

def pull_all_expenses(token):
    expenses = []
    cursor = None
    pages = 0
    while True:
        pages += 1
        res = gql(PULL_QUERY, token, {'cursor': cursor})
        if 'errors' in res:
            print(f"GraphQL errors: {res['errors']}")
            break
        jobs = (res.get('data') or {}).get('jobs') or {}
        for j in jobs.get('nodes', []):
            for e in (j.get('expenses') or {}).get('nodes', []):
                e['_job_number'] = j.get('jobNumber')
                e['_job_id'] = j.get('id')
                client = j.get('client') or {}
                e['_client_name'] = (client.get('firstName','') + ' ' + client.get('lastName','')).strip() or None
                expenses.append(e)
        page = jobs.get('pageInfo', {})
        if not page.get('hasNextPage'): break
        cursor = page.get('endCursor')
        print(f"  page {pages}: {len(expenses)} expenses so far…")
    return expenses

# ── Insert into BM ──
def insert_into_bm(expenses):
    if not os.path.exists(SK_PATH):
        print(f"ERROR: BM service key missing at {SK_PATH}. Re-cache via prior pipeline.")
        sys.exit(3)
    sk = open(SK_PATH).read().strip()
    headers = {'apikey': sk, 'Authorization': f'Bearer {sk}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
    rows = []
    for e in expenses:
        rows.append({
            'tenant_id': TENANT_ID,
            'date': e.get('enteredOn'),
            'amount': float(e.get('total') or 0),
            'category': None,
            'description': e.get('description') or e.get('title') or '',
            'vendor': (e.get('paidBy') or {}).get('name'),
            'job': e.get('_client_name') or None,
            'job_id': str(e.get('_job_id') or ''),
            'employee': (e.get('reimbursableTo') or {}).get('name'),
            'notes': TAG,
        })
    if DRY:
        print(f"  [dry-run] would insert {len(rows)} expense rows")
        for r in rows[:5]:
            print(f"    {r['date'][:10] if r['date'] else '-':<12} ${r['amount']:<8.2f} {r['description'][:40]:<40} {r['vendor'] or '-'}")
        return
    # Batch insert
    body = json.dumps(rows).encode()
    req = urllib.request.Request(f'{SUPA_URL}/rest/v1/expenses', data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            print(f"  ✅ Inserted {len(rows)} expense rows")
    except urllib.error.HTTPError as e:
        print(f"  ❌ HTTP {e.code}: {e.read().decode()[:200]}")

# ── Main ──
if __name__ == '__main__':
    token = get_access_token()
    print(f"Pulling Jobber expenses…")
    expenses = pull_all_expenses(token)
    print(f"\n{'=' * 60}\nFound {len(expenses)} total expenses across all jobs")
    print('=' * 60)
    insert_into_bm(expenses)
