#!/usr/bin/env python3
"""Branch Manager — schema-drift check.
Pulls the LIVE PostgREST schema (all tables' real columns) and diffs it against
every .from('X').update/insert/upsert({...}) write in the codebase. Flags any
column written that doesn't exist — the exact bug class that broke customer quote
approval (missing signed_ip) and online payments (missing stripe_payment_id).
Run before any deploy that touches DB writes:  python3 scripts/schema-drift-check.py
Requires ~/Desktop/_Credentials/supabase-service-role.txt (SUPABASE_URL/SERVICE_KEY).
Exit 0 = clean, 1 = drift found."""
import json, re, os, sys, urllib.request
CRED=os.path.expanduser("~/Desktop/_Credentials/supabase-service-role.txt")
env=dict(l.strip().split("=",1) for l in open(CRED) if l.startswith("SUPABASE_") and "=" in l)
SB,KEY=env["SUPABASE_URL"],env["SUPABASE_SERVICE_KEY"]
spec=json.load(urllib.request.urlopen(urllib.request.Request(SB+"/rest/v1/",headers={"apikey":KEY,"Authorization":"Bearer "+KEY})))
cols={t:set(v.get("properties",{}).keys()) for t,v in spec.get("definitions",{}).items()}
NOISE={"true","false","null","method","headers","body"}
def balanced(s,i):
    d=0
    for j in range(i,len(s)):
        if s[j]=="{":d+=1
        elif s[j]=="}":
            d-=1
            if d==0:return s[i:j+1]
    return s[i:]
def keys(o):
    ks=set();d=0;i=0
    while i<len(o):
        c=o[i]
        if c in "{[":d+=1
        elif c in "}]":d-=1
        elif d==1 and (i==0 or o[i-1] in "{,"):
            m=re.match(r"\s*([A-Za-z_]\w*)\s*:",o[i:])
            if m:ks.add(m.group(1));i+=m.end()-1
        i+=1
    return ks
pat=re.compile(r"\.from\(\s*['\"]([a-z_]+)['\"]\s*\)\s*\.\s*(update|insert|upsert)\(\s*(\{)")
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
findings=[]
for base in ("src","supabase/functions"):
    for r,_,fs in os.walk(os.path.join(root,base)):
        for f in fs:
            if not f.endswith((".js",".ts")):continue
            fp=os.path.join(r,f);txt=open(fp,encoding="utf-8",errors="ignore").read()
            for m in pat.finditer(txt):
                t=m.group(1)
                if t not in cols:continue
                bad={k for k in (keys(balanced(txt,m.start(3)))-NOISE) if not k.startswith("_")}-cols[t]
                if bad:
                    findings.append((os.path.relpath(fp,root),txt[:m.start()].count("\n")+1,t,m.group(2),sorted(bad)))
if findings:
    print("SCHEMA DRIFT FOUND:")
    for fp,ln,t,meth,bad in sorted(findings):print(f"  {fp}:{ln}  {t}.{meth} writes missing cols: {bad}")
    sys.exit(1)
print("No schema drift ✅");sys.exit(0)
