# Builds estimates-snt-4b8e2f.html (Estimate Board) from LIVE Jobber only.
# Oct 11 2026: replaces build-board-map.py's hand-typed September sections
# (they went stale — e.g. "Sarah owes $1,159" after she paid). Jobber is the
# source of truth; this page is just a phone-friendly view of it.
# usage: python3 scripts/build-estimate-board.py   (run from the BM repo root)
import sys, os, json, time, html, datetime
sys.path.insert(0, os.path.expanduser('~/Desktop/scripts'))
from jobber_api import gql

E = html.escape
TODAY = datetime.date.today()
UPD = TODAY.strftime('%a %b %-d, %Y')

def pull(kind, status, fields):
    out, after = [], None
    while True:
        q = f'''query($a:String){{{kind}(first:25, after:$a, filter:{{status:{status}}}){{nodes{{{fields}}} pageInfo{{hasNextPage endCursor}}}}}}'''
        for attempt in range(6):
            r = gql(q, {'a': after})
            if 'data' in r and r['data']: break
            time.sleep(8 * (attempt + 1))
        else:
            sys.exit(f'Jobber pull failed for {kind}/{status}: {json.dumps(r)[:300]}')
        d = r['data'][kind]; out += d['nodes']
        if not d['pageInfo']['hasNextPage']: return out
        after = d['pageInfo']['endCursor']; time.sleep(1)

CL = 'client{name phones{number}} property{address{street city}}'
QF = f'quoteNumber quoteStatus createdAt amounts{{total}} jobberWebUri {CL}'
quotes = {s: pull('quotes', s, QF) for s in ('draft', 'awaiting_response', 'changes_requested', 'approved')}
IF = f'invoiceNumber invoiceStatus issuedDate dueDate amounts{{total invoiceBalance}} jobberWebUri client{{name phones{{number}}}}'
invoices = {s: pull('invoices', s, IF) for s in ('past_due', 'awaiting_payment', 'draft')}
JF = f'jobNumber jobStatus title total startAt jobberWebUri {CL}'
jobs = {s: pull('jobs', s, JF) for s in ('requires_invoicing', 'late', 'today', 'upcoming', 'unscheduled', 'action_required')}
RF = f'title createdAt requestStatus jobberWebUri {CL}'
reqs = {s: pull('requests', s, RF) for s in ('new', 'overdue', 'unscheduled', 'upcoming', 'assessment_completed')}

def money(x): return f"${(x or 0):,.0f}"
def age(iso): return (TODAY - datetime.date.fromisoformat(iso[:10])).days
def addr(o):
    a = (o.get('property') or {}).get('address') or {}
    return ', '.join(x for x in (a.get('street'), a.get('city')) if x)
def phone(o):
    p = ((o.get('client') or {}).get('phones') or [])
    return p[0]['number'] if p else ''
def name(o): return (o.get('client') or {}).get('name') or '—'
def row(cls, num, link, who, where, meta, want=''):
    w = f'<div class="want">{E(want)}</div>' if want else ''
    n = f'<a class="q" href="{E(link)}">{E(num)}</a>' if num else ''
    return (f'<div class="it {cls}"><b>{n}{E(who)}{(" — " + E(where)) if where else ""}</b>'
            f'<div class="meta">{meta}</div>{w}</div>')
def ph(o):
    p = phone(o); return f' · <span class="ph">{E(p)}</span>' if p else ''

B = []
# 1. Money first
owed = invoices['past_due'] + invoices['awaiting_payment']
tot_owed = sum(i['amounts']['invoiceBalance'] for i in owed)
B.append(f'<h2 class="send">💰 Money owed — {len(owed)} invoices, {money(tot_owed)}</h2>')
for i in sorted(owed, key=lambda i: i['issuedDate'] or ''):
    late = ' · <b style="color:var(--bad)">past due</b>' if i['invoiceStatus'] == 'past_due' else ''
    B.append(row('hot', f"#{i['invoiceNumber']}", i['jobberWebUri'], name(i), '',
                 f"{money(i['amounts']['invoiceBalance'])} left of {money(i['amounts']['total'])} · sent {age(i['issuedDate'])} days ago{late}{ph(i)}"))
for i in invoices['draft']:
    B.append(row('hot', f"#{i['invoiceNumber']}", i['jobberWebUri'], name(i), '',
                 f"{money(i['amounts']['total'])} · DRAFT, never sent", 'Send it, or mark it paid if it already was.'))
ri = jobs['requires_invoicing']
if ri:
    B.append(f'<h2 class="send">🧾 Done, not invoiced — {len(ri)} jobs, {money(sum(j["total"] or 0 for j in ri))}</h2>')
    for j in ri:
        B.append(row('hot', f"Job #{j['jobNumber']}", j['jobberWebUri'], name(j), addr(j), f"{money(j['total'])}{ph(j)}", 'Done = invoice it.'))

# 2. Quotes to finish
dr = sorted(quotes['draft'], key=lambda q: q['createdAt'], reverse=True)
B.append(f'<h2 class="send">🔴 Drafts — finish + send ({len(dr)})</h2>')
for q in dr:
    t = q['amounts']['total']
    price = money(t) if t else '<span style="color:var(--bad)">$0 — needs a price</span>'
    B.append(row('hot', f"#{q['quoteNumber']}", q['jobberWebUri'], name(q), addr(q),
                 f"{price} · draft {age(q['createdAt'])} days{ph(q)}"))
cr = quotes['changes_requested']
if cr:
    B.append(f'<h2 class="send">✏️ Customer asked for changes ({len(cr)})</h2>')
    for q in cr:
        B.append(row('hot', f"#{q['quoteNumber']}", q['jobberWebUri'], name(q), addr(q), f"{money(q['amounts']['total'])} · {age(q['createdAt'])} days{ph(q)}"))

# 3. Leads with no quote yet
rq = [r for s in reqs.values() for r in s]
if rq:
    B.append(f'<h2 class="run">📞 Requests — no quote yet ({len(rq)})</h2>')
    for r in sorted(rq, key=lambda r: r['createdAt'], reverse=True):
        B.append(row('go', '', r['jobberWebUri'], name(r), addr(r), f"{E(r.get('title') or '')} · {age(r['createdAt'])} days · {E(r['requestStatus'].replace('_', ' '))}{ph(r)}"))

# 4. Sold work
ap = quotes['approved']
if ap:
    B.append(f'<h2 class="run">✅ Approved — make it a job ({len(ap)}, {money(sum(q["amounts"]["total"] for q in ap))})</h2>')
    for q in sorted(ap, key=lambda q: q['createdAt'], reverse=True):
        B.append(row('go', f"#{q['quoteNumber']}", q['jobberWebUri'], name(q), addr(q), f"{money(q['amounts']['total'])} · {age(q['createdAt'])} days{ph(q)}"))
booked = jobs['late'] + jobs['today'] + jobs['upcoming'] + jobs['action_required'] + jobs['unscheduled']
if booked:
    B.append(f'<h2 class="run">🚗 Open jobs ({len(booked)})</h2>')
    for j in sorted(booked, key=lambda j: j['startAt'] or '9999'):
        when = ('Scheduled ' + datetime.date.fromisoformat(j['startAt'][:10]).strftime('%a %b %-d')) if j['startAt'] else 'UNSCHEDULED'
        B.append(row('go', f"Job #{j['jobNumber']}", j['jobberWebUri'], name(j), addr(j), f"{money(j['total'])} · {when} · {E(j['jobStatus'].replace('_', ' '))}"))

# 5. Out and waiting
aw = sorted(quotes['awaiting_response'], key=lambda q: q['createdAt'], reverse=True)
recent = [q for q in aw if age(q['createdAt']) <= 120]; old = [q for q in aw if age(q['createdAt']) > 120]
B.append(f'<h2 class="run">🟢 Out and waiting — {len(recent)} quotes, {money(sum(q["amounts"]["total"] for q in recent))}</h2>')
B.append('<p class="note"><b>Days</b> = since created. Over 21 days: one follow-up text. Over 60: archive or one last call.</p>')
for q in recent:
    d = age(q['createdAt'])
    B.append(row('go' if d <= 21 else '', f"#{q['quoteNumber']}", q['jobberWebUri'], name(q), addr(q), f"{money(q['amounts']['total'])} · {d} days{ph(q)}"))
if old:
    B.append(f'<h2 class="done">🗄 Older than 4 months — {len(old)} quotes, {money(sum(q["amounts"]["total"] for q in old))}</h2>')
    B.append('<div class="it done">' + ' · '.join(f'#{q["quoteNumber"]} {E(name(q))} {money(q["amounts"]["total"])}' for q in sorted(old, key=lambda q: -q["amounts"]["total"])) + '<div class="want">Archive as lost in Jobber, or one last text.</div></div>')

head = open('estimates-snt-4b8e2f.html').read(); head = head[:head.find('<body')]
page = head + f'''<body>
<button class="printbtn" onclick="window.print()">⎙ Print</button>
<div class="wrap">
<header>
  <span class="kicker">Private · Bookmark · Built for Doug + Catherine</span>
  <h1>Estimate Board</h1>
  <p class="sub">Money owed, drafts, requests, sold work and open quotes — <b>straight from Jobber</b>. Updated <b>{UPD}</b>. Tap a number to open it in Jobber.</p>
</header>
{''.join(B)}
<footer>Unlisted, bookmark-only. Source: Jobber only (pulled {UPD}). Regenerate: <code>python3 scripts/build-estimate-board.py</code> — say "update the board".</footer>
</div>
<script src="nav-snt.js?v=5" defer></script>
</body>
</html>'''
open('estimates-snt-4b8e2f.html', 'w').write(page)
print('owed', len(owed), round(tot_owed), '| drafts', len(dr), '| changes', len(cr), '| requests', len(rq),
      '| approved', len(ap), '| open jobs', len(booked), '| req-invoicing', len(ri), '| waiting', len(recent), '| old', len(old))
