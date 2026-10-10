#!/usr/bin/env python3
"""Branch Manager — email data-hygiene check.

Flags clients whose email is missing, malformed, or bounce-flagged — but only
where it MATTERS: clients with an open quote or unpaid invoice (money in
flight that an email failure would silently strand — the Percy case).

Run alongside the other audit tools before deploys:
    python3 scripts/email-hygiene-check.py
Requires ~/Desktop/_Credentials/supabase-service-role.txt.
"""
import json, os, re, sys, urllib.request

CRED = os.path.expanduser("~/Desktop/_Credentials/supabase-service-role.txt")
TENANT = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

creds = {}
for line in open(CRED):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        creds[k.strip()] = v.strip()
URL, KEY = creds["SUPABASE_URL"], creds["SUPABASE_SERVICE_KEY"]

def get(path):
    req = urllib.request.Request(URL + path, headers={
        "apikey": KEY, "Authorization": "Bearer " + KEY})
    return json.load(urllib.request.urlopen(req))

clients = {c["id"]: c for c in get(
    f"/rest/v1/clients?select=id,name,email,email_status,phone&tenant_id=eq.{TENANT}")}
open_quotes = get(f"/rest/v1/quotes?select=id,quote_number,client_id,client_name,status,total"
                  f"&tenant_id=eq.{TENANT}&status=in.(draft,sent)")
open_invoices = get(f"/rest/v1/invoices?select=id,invoice_number,client_id,client_name,status,total"
                    f"&tenant_id=eq.{TENANT}&status=not.in.(paid,void,cancelled)")

def email_problem(c):
    if c is None:
        return "no client record"
    e = (c.get("email") or "").strip()
    if not e:
        return "no email on file"
    if not EMAIL_RE.match(e):
        return f"malformed email: {e!r}"
    if c.get("email_status") in ("bounced", "complained"):
        return f"email flagged {c['email_status']}: {e}"
    return None

problems = []
for kind, rows, num_key in (("quote", open_quotes, "quote_number"),
                            ("invoice", open_invoices, "invoice_number")):
    for r in rows:
        prob = email_problem(clients.get(r.get("client_id")))
        if prob:
            problems.append((kind, r.get(num_key), r.get("client_name") or "?",
                             float(r.get("total") or 0), prob))

if not problems:
    print("✅ email hygiene OK — every open quote/invoice has a deliverable client email")
    sys.exit(0)

problems.sort(key=lambda p: -p[3])
total_at_risk = sum(p[3] for p in problems)
print(f"⚠️  {len(problems)} open record(s) where email would silently fail "
      f"(${total_at_risk:,.2f} in flight):\n")
for kind, num, name, total, prob in problems:
    print(f"  {kind} #{num}  {name}  ${total:,.2f}  — {prob}")
sys.exit(1)
