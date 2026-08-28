#!/usr/bin/env python3
"""Branch Manager — dead-handler check.
Scans every inline event handler (onclick/oninput/onchange/...) across index.html
and src/**.js, extracts the function/object each one calls, and flags any whose
target is defined NOWHERE — i.e. a button that throws 'X is not defined' and does
nothing when tapped. This is the class that broke the Receptionist/Campaigns/
Referrals filter buttons (App.render()). Run before deploy:  python3 scripts/dead-handler-check.py
Exit 0 = clean, 1 = dead handler found."""
import re, os, sys
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# JS/DOM builtins + globals that are always available (not app-defined)
BUILTINS=set("""window document localStorage sessionStorage console JSON Math Array Object Date String Number Boolean
setTimeout setInterval clearTimeout clearInterval fetch alert confirm prompt history location navigator event this
parseInt parseFloat isNaN encodeURIComponent decodeURIComponent Promise Map Set RegExp Error require module exports
return if else var let const true false null new typeof void delete for while function try catch throw switch case
break continue lucide FileReader Blob URL Intl Notification AbortController structuredClone""".split())
DOM_METHODS=set("""split trim replace test match forEach map filter reduce slice splice push pop shift join concat
toISOString toLocaleString toLocaleDateString toLocaleTimeString toFixed toUpperCase toLowerCase substring substr
querySelector querySelectorAll getElementById getElementsByClassName addEventListener removeEventListener
classList focus blur click select scrollIntoView scrollTo requestSubmit clearRect getContext preventDefault
stopPropagation appendChild removeChild setAttribute getAttribute bind call apply reload open close""".split())
IGNORE=BUILTINS|DOM_METHODS
defined=set()
files=['index.html']
for r,_,fs in os.walk(os.path.join(ROOT,'src')):
    for f in fs:
        if f.endswith('.js'): files.append(os.path.relpath(os.path.join(r,f),ROOT))
alltxt=""
for fp in files:
    try: t=open(os.path.join(ROOT,fp),encoding='utf-8',errors='ignore').read()
    except: continue
    alltxt+="\n"+t
    for m in re.finditer(r'\bfunction\s+([A-Za-z_]\w*)|\bvar\s+([A-Za-z_]\w*)|\b([A-Za-z_]\w*)\s*=\s*\{|window\.([A-Za-z_]\w*)\s*=|\b([A-Za-z_]\w*)\s*:\s*function',t):
        for g in m.groups():
            if g: defined.add(g)
handlers=re.findall(r'on(?:click|change|input|submit|keyup|keydown|blur|focus|mouseover)\s*=\s*(["\'])(.*?)\1',alltxt,re.S)
heads=set()
for _q,code in handlers:
    for m in re.finditer(r'(?:^|[^.\w])([A-Za-z_]\w*)\s*(?:\.[A-Za-z_]\w*)*\s*\(',code):
        heads.add(m.group(1))
missing=sorted(h for h in heads if h not in defined and h not in IGNORE)
if missing:
    print("DEAD HANDLERS — inline handlers call undefined targets:")
    for h in missing: print("  ⚠️",h,"(grep onclick for it)")
    sys.exit(1)
print("No dead handlers ✅");sys.exit(0)
