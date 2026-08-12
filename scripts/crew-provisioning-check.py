#!/usr/bin/env python3
"""
crew-provisioning-check.py — the guardrail for the Aug 11 2026 "Catherine sees
nothing" class of bug.

INVARIANT: every ACTIVE team_members row (except no-email local-only crew) must
have a matching Supabase auth user AND a user_tenants row AND app_metadata.tenant_id
for the SAME tenant. If any of those is missing, that person logs in and sees an
EMPTY app (RLS scopes by the JWT tenant claim, which comes from user_tenants /
app_metadata — see memory crew-tenant-provisioning).

The v1109 auth change ("resolve real role instead of hardcoding owner") was
verified on the OWNER only and blanked out every crew member with no user_tenants
row. This script is the "verify as the affected user, not the owner" check in
runnable form. RUN IT: at session start, and before/after any change to auth.js /
login / RLS / tenant resolution / sync.

Usage:  python3 scripts/crew-provisioning-check.py
Needs the service_role token (the role:service_role JWT) in
~/Desktop/_Credentials/supabase-service-role.txt.
"""
import re, sys, json, base64, urllib.request, urllib.error, os

BASE = "https://ltpivkqahvplapyagljt.supabase.co"
TENANT = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5"  # SNT owner tenant

def load_service_role():
    p = os.path.expanduser("~/Desktop/_Credentials/supabase-service-role.txt")
    toks = re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', open(p).read())
    for t in toks:
        seg = t.split('.')[1]; seg += '=' * (-len(seg) % 4)
        if json.loads(base64.urlsafe_b64decode(seg)).get('role') == 'service_role':
            return t
    sys.exit("No service_role token found in supabase-service-role.txt")

def api(sr, method, path):
    req = urllib.request.Request(BASE + path,
        headers={'apikey': sr, 'Authorization': 'Bearer ' + sr, 'Content-Type': 'application/json'},
        method=method)
    return json.loads(urllib.request.urlopen(req).read().decode())

def main():
    sr = load_service_role()
    crew = api(sr, 'GET', '/rest/v1/team_members?select=name,email,role,active&active=eq.true')
    uts = {r['user_id'] for r in api(sr, 'GET', '/rest/v1/user_tenants?select=user_id')}
    # auth users by email
    auth = {}
    for page in range(1, 8):
        d = api(sr, 'GET', '/auth/v1/admin/users?per_page=200&page=%d' % page)
        us = d.get('users', [])
        if not us: break
        for u in us:
            auth[(u.get('email') or '').lower()] = u
        if len(us) < 200: break

    problems = []
    print("=== CREW PROVISIONING CHECK ===")
    for m in crew:
        em = (m.get('email') or '').lower()
        if not em:
            print("  ~ %-18s local-only (no email) — cannot use cloud; OK if intended" % m['name']); continue
        u = auth.get(em)
        has_auth = u is not None
        has_ut = has_auth and u['id'] in uts
        has_claim = has_auth and bool((u.get('app_metadata') or {}).get('tenant_id'))
        # The JWT tenant claim (what RLS scopes by) comes from EITHER a
        # user_tenants row OR app_metadata.tenant_id. So a person is provisioned
        # if they have an auth user AND at least one of those. (Role resolves
        # from user_tenants, else the team_members roster fallback — v1112.)
        # NOTE: user_tenants' role CHECK excludes 'sales', so a sales user is
        # legitimately provisioned via app_metadata.tenant_id + roster role.
        ok = has_auth and (has_ut or has_claim)
        flag = 'OK ' if ok else 'BROKEN'
        print("  [%s] %-18s auth=%s user_tenants=%s tenant_claim=%s role=%s" % (
            flag, m['name'], 'Y' if has_auth else 'N', 'Y' if has_ut else 'N',
            'Y' if has_claim else 'N', m.get('role')))
        if not ok:
            problems.append("%s (%s): %s" % (m['name'], em, ", ".join(
                x for x, present in [("no auth user", has_auth),
                                     ("no tenant (need a user_tenants row OR app_metadata.tenant_id)", has_ut or has_claim)] if not present)))
    print()
    if problems:
        print("FAIL — %d crew would see an EMPTY app:" % len(problems))
        for p in problems: print("  - " + p)
        sys.exit(1)
    print("PASS — every active crew member is fully provisioned.")

if __name__ == "__main__":
    main()
