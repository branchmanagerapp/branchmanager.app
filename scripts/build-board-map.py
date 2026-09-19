# Builds estimates-snt-4b8e2f.html (board) + estimates-map-3f9c21.html (map) from Jobber (jobber3.json), geocoded points (map-points.json), and BM.
# usage: python3 scripts/build-board-map.py <scratchpad> <outdir>
import json,sys,html,datetime,re,os,urllib.request,urllib.parse,time
SC,OUT=sys.argv[1],sys.argv[2]
TODAY=datetime.date(2026,9,19); UPD="Sat Sept 19, 2026"
J=json.load(open(SC+'/jobber3.json')); P=json.load(open(SC+'/map-points.json'))
cache_p=SC+'/geo-cache.json'; cache=json.load(open(cache_p))
def geocode(addr):
    if addr in cache: return cache[addr]
    u='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode({'q':addr,'format':'json','limit':1,'countrycodes':'us'})
    try:
        r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'SecondNatureTree-estimate-map/1.0 (info@peekskilltree.com)'}),timeout=20)); cache[addr]=(float(r[0]['lat']),float(r[0]['lon'])) if r else None
    except Exception: cache[addr]=None
    time.sleep(1.1); return cache[addr]
E=html.escape
quotes=J['quotes']['data']['quotes']['nodes']
def age(q): return (TODAY-datetime.date.fromisoformat(q['createdAt'][:10])).days
def addr(q):
    a=(q.get('property') or {}).get('address') or {}; return f"{a.get('street') or ''}, {a.get('city') or ''}".strip(', ')
def phone(q):
    p=(q.get('client') or {}).get('phones') or []; return p[0]['number'] if p else ''
def money(x): return f"${x:,.0f}"
JL='https://secure.getjobber.com/quotes'
open_q=[q for q in quotes if q['quoteStatus'] in ('awaiting_response','changes_requested') and q['createdAt']>='2026-06-01']
drafts=[q for q in quotes if q['quoteStatus']=='draft' and q['createdAt']>='2026-05-01']
older=[q for q in quotes if q['quoteStatus'] in ('awaiting_response','changes_requested') and q['createdAt']<'2026-06-01']
dups={'571':'duplicate of #572 (Max)','555':'duplicate of #560 (Delorenzo)'}
B=[]
B.append(f'<h2 class="send">🔴 Finish + send — drafts and missing quotes</h2>')
notes={'568':'Crane oaks — written by Claude 9/14 from Doug\'s notes. Review, then Send.','565':'$0 with photos since 9/11. White-oak lead prune + locust over the roof.','561':'Draft since 9/3.','548':'Website lead, priced $2,168, never sent.','533':'Draft since June.','518':'Draft since May (Sprout Brook).'}
for q in sorted(drafts,key=lambda q:q['createdAt'],reverse=True):
    n=q['quoteNumber']; extra=dups.get(n); 
    cls='done' if extra else 'hot'
    B.append(f'<div class="it {cls}"><b><span class="q">#{n}</span>{E(q["client"]["name"])} — {E(addr(q))}</b><div class="meta">{money(q["amounts"]["total"])} · draft {age(q)} days · <span class="ph">{E(phone(q))}</span></div><div class="want">{E(extra+" — archive it." if extra else notes.get(n,"Finish and send."))}</div></div>')
B.append('<div class="it hot"><b>Dawn — Brewster — NO QUOTE EXISTS</b><div class="meta">$1,000 agreed by phone 9/11 · no last name or address on file</div><div class="want">Text Doug her last name + address → the quote gets drafted in Jobber the same hour.</div></div>')
B.append('<div class="it hot"><b>(516) 233-0861 — 16 Dean Drive — NO QUOTE EXISTS</b><div class="meta">Voicemail 9/10: Catherine came out, they never got it</div><div class="want">Nothing for Dean Drive in Jobber. Which visit was this? Write it and call to confirm.</div></div>')
B.append('<div class="it hot"><b>Catherine Scott\'s husband — wants a fresh copy</b><div class="meta"><span class="ph">(516) 232-5298</span> · per Catherine 9/16</div><div class="want">Resend from Jobber.</div></div>')
B.append('<div class="it hot"><b>Post office — Angela (postmaster) — original scope</b><div class="meta">Catherine walked it 9/17</div><div class="want">Quote the original scope now; the tree work over the lot waits for her request.</div></div>')

B.append(f'<h2 class="run">🟢 Out and waiting — {len(open_q)} quotes, {money(sum(q["amounts"]["total"] for q in open_q))} · newest first</h2>')
B.append('<p class="note">Live from Jobber. <b>Days</b> = since created. Anything over 21 days gets one follow-up text; over 60, archive or one last call.</p>')
for q in sorted(open_q,key=lambda q:q['createdAt'],reverse=True):
    d=age(q); cls='go' if d<=21 else ''
    st=' · <b style="color:var(--warn)">changes requested</b>' if q['quoteStatus']=='changes_requested' else ''
    tot=q['amounts']['total']; t=money(tot) if tot else '<span style="color:var(--bad)">$0 — needs a price</span>'
    B.append(f'<div class="it {cls}"><b><span class="q">#{q["quoteNumber"]}</span>{E(q["client"]["name"])} — {E(addr(q))}</b><div class="meta">{t} · {d} days · <span class="ph">{E(phone(q))}</span>{st}</div></div>')

B.append('<h2 class="run">📞 Website leads — no quote, no call</h2>')
for n,ph,svc,d,extra in [("Andrew Kaplan","516-606-9686","Pruning — 322 Sprout Brook Rd","9/10","next door to the three June Sprout Brook quotes"),("Mark Cassidy","516-518-8711","Other — 25 Melville Park Rd, Melville (Long Island)","9/8","probably out of area — one call"),("Roger Phillips","845-216-2665","Pruning — 161 Tanglewylde Rd, Lake Peekskill","9/2","in Jobber as a request, no quote"),("Jordan Visser","385-213-6179","Other","8/24",""),("Jeff Monohan","805-801-5896","Tree removal","8/12","")]:
    B.append(f'<div class="it go"><b>{E(n)} — {E(svc)}</b><div class="meta"><span class="ph">{ph}</span> · requested {d}{(" · "+E(extra)) if extra else ""}</div></div>')

B.append('<h2 class="run">🚗 Booked — where the crew goes next</h2>')
for lab,meta,want in [
 ("Mon 9/21 — Julie Melagrano (Michelle\'s aunt) — Malverne Rd, Scarsdale","BM job #339 · house # TBD · Michelle on site","NO PRICE on the job yet. Price it before Monday."),
 ("Tue 9/22 – Thu 9/24 — Mohegan Lake beech tree","3 days · 'on the dash' · no client name","Not in Jobber or BM. Nick? Put a name and a price on it."),
 ("Sat 9/26 – Sun 9/27 — Jimmy Cottrell — chipper + bucket truck","asked 9/16, unanswered","Yes or no by text."),
 ("Mon 9/28 – Tue 9/29 — Continental Village Park District — 50 Highland Dr, Philipstown","Jobber job #329 · $2,700 · hillside clearing","Scheduled 9/16."),
 ("Mon 10/5 — Joann Bohannon-Sacci — 101 Leda Dr, Peekskill","Jobber job #328 · $2,276","Scheduled 9/16."),
 ("Unscheduled in Jobber — Tom Brown — 25 Old Sleepy Hollow Rd, Pleasantville","Jobber job #316 · $3,600 · since May","Sold, never dated. Schedule or archive."),
]:
    B.append(f'<div class="it go"><b>{E(lab)}</b><div class="meta">{E(meta)}</div><div class="want">{E(want)}</div></div>')

B.append('<h2 class="send">💰 Money waiting</h2>')
for lab,meta,want in [
 ("Continental Village Park District — BM invoice #1019","$2,600 · due TODAY 9/19","Chase Fred Romer Monday if it hasn\'t landed."),
 ("Oswald Roche — BM #1017","$700 left · overdue since 9/11","Texted 8/31, called 9/4. Call again."),
 ("Sarah Moden-Alliston — Jobber #382","$1,159.13 left · past due since 5/23","Payment link or a call."),
 ("New Rochelle — 66 Laron Dr — BM #1011","$1,899 · still a DRAFT · due date was 8/25","Send it."),
 ("Jessica Bernadello — Jobber #378","$5,093.63 · DRAFT since 4/27 · job done 4/22","Send it."),
 ("Done, never invoiced","David Coats $2,200 · Meadow Lane $1,100 · Nicholas Anthony $800 · Emily\'s parents 8/26 · Matt Hait, Wilton 9/14","Done = invoice it."),
]:
    B.append(f'<div class="it hot"><b>{E(lab)}</b><div class="meta">{E(meta)}</div><div class="want">{E(want)}</div></div>')

B.append('<h2 class="done">✅ Closed since Aug — don\'t re-chase</h2>')
B.append('<div class="it done"><b>Converted to jobs:</b> Chaz #540 (done 8/27, paid) · Joann Bohannon-Sacci #562 → job 10/5 · Continental Village #557 → job 9/28</div>')
B.append('<div class="it done"><b>Paid:</b> Jen Zawolski #397 $1,083.75 · Chaz #394 $2,492.63 · Tricia Leardi #396 · 723 Hudson Ave LLC #395 $650.25 · Hope Bogart #387 $500 · Ken Phillips #393 · Julia Mack #391 · Delia Jurkowski #392</div>')
if older:
    B.append(f'<h2 class="done">🗄 Still open from spring — {len(older)} quotes, {money(sum(q["amounts"]["total"] for q in older))}</h2>')
    B.append('<div class="it done">'+' · '.join(f'#{q["quoteNumber"]} {E(q["client"]["name"])} {money(q["amounts"]["total"])} ({age(q)}d)' for q in sorted(older,key=lambda q:-q["amounts"]["total"]))+'<div class="want">One text each, or archive as lost.</div></div>')

head=open('estimates-snt-4b8e2f.html').read(); head=head[:head.find('<body')]
board=head+f'''<body>
<button class="printbtn" onclick="window.print()">⎙ Print</button>
<div class="wrap">
<header>
  <span class="kicker">Private · Bookmark · Built for Doug + Catherine</span>
  <h1>Estimate Board</h1>
  <p class="sub">Every open quote, draft, lead, booked job and unpaid invoice — <b>live from Jobber</b> plus Branch Manager and your texts. Updated <b>{UPD}</b>. Quote numbers open in Jobber; the <a href="estimates-map-3f9c21.html">map</a> shows the same list by location.</p>
</header>
{''.join(B)}
<footer>Unlisted, bookmark-only. Sources: Jobber (quotes/jobs/invoices, pulled {UPD} morning) · Branch Manager · Messages · Dialpad · Gmail. Regenerate: <code>scripts/build-board-map.py</code>. Say "update the board" and it rebuilds from live data.</footer>
</div>
<script src="nav-snt.js?v=5" defer></script>
</body>
</html>'''
open(OUT+'/estimates-snt-4b8e2f.html','w').write(board)

# ---------------- MAP ----------------
pins=[]
for p in P:
    o=p['obj']; a=p['addr']; ad=f"{a.get('street') or ''}, {a.get('city') or ''}, NY".strip(', ')
    apx=' (town-level pin)' if p['approx'] else ''
    if p['kind']=='quote':
        st=o['quoteStatus']; tot=o['amounts']['total']
        kind='draft' if st=='draft' else 'est'
        lab=f"#{o['quoteNumber']} {o['client']['name']} — {money(tot) if tot else '$0'}"
        det=('DRAFT — finish + send' if st=='draft' else ('changes requested' if st=='changes_requested' else f"sent, {age(o)} days"))+(' · '+phone(o) if phone(o) else '')+apx
    elif p['kind']=='job':
        lab=f"Job #{o['jobNumber']} {o['client']['name']} — {money(o['total'] or 0)}"; kind='job'
        det=(('Scheduled '+o['startAt'][:10]) if o['startAt'] else 'UNSCHEDULED since May')+apx
    else:
        lab=o['label']; kind='job' if 'Melagrano' in lab else ('draft' if 'Zawolski' in lab else 'lead'); det=('Mon 9/21 · BM job #339 · house # TBD' if 'Melagrano' in lab else ('website lead — no quote, no call' if 'lead' in lab else '#568 $11,800 draft — review + send'))+apx
    pins.append({'label':lab,'addr':ad,'kind':kind,'detail':det,'lat':p['lat'],'lon':p['lon'],'approx':p['approx']})
for lab,ad,det in [("Oswald Roche — $700 overdue","26 North 2nd Street, Cortlandt Manor, NY","BM #1017 · overdue 9/11"),("Continental Village Park District — $2,600 due 9/19","50 Highland Drive, Philipstown, NY","BM #1019"),("New Rochelle — $1,899 draft invoice","66 Laron Drive, New Rochelle, NY","BM #1011 · never sent"),("Sarah Moden-Alliston — $1,159 past due","39 Partridge Lane, Cortlandt Manor, NY","Jobber #382 · since 5/23"),("Jessica Bernadello — $5,094 draft invoice","420 Sprout Brook Road, Putnam Valley, NY","Jobber #378 · job done 4/22")]:
    ll=geocode(ad)
    if ll: pins.append({'label':lab,'addr':ad,'kind':'money','detail':det,'lat':ll[0],'lon':ll[1],'approx':False})
ll=geocode('Mohegan Lake, NY'); pins.append({'label':'Mohegan Lake beech — Tue 9/22–Thu 9/24','addr':'Mohegan Lake, NY','kind':'job','detail':'"On the dash" — no client name, no record. Town-level pin.','lat':ll[0],'lon':ll[1],'approx':True})
json.dump(cache,open(cache_p,'w'))
mp=open('estimates-map-3f9c21.html').read()
mp=re.sub(r'var PINS = \[.*?\];','var PINS = '+json.dumps(pins,ensure_ascii=False)+';',mp,flags=re.S)
mp=mp.replace('🌳 Work Map — updated Jul 29',f'🌳 Work Map — {len(pins)} pins · updated Sept 19')
mp=mp.replace('''<div class="legend">
 <span class="dot" style="background:#1565c0"></span>Scheduled job<br>
 <span class="dot" style="background:#1a9850"></span>Open estimate (quote out)<br>
 <span class="dot" style="background:#e6a817"></span>Money waiting
</div>''','''<div class="legend">
 <span class="dot" style="background:#1565c0"></span>Booked job<br>
 <span class="dot" style="background:#1a9850"></span>Quote out, waiting<br>
 <span class="dot" style="background:#e53935"></span>Draft — finish + send<br>
 <span class="dot" style="background:#7b7b7b"></span>Lead — no quote yet<br>
 <span class="dot" style="background:#e6a817"></span>Money waiting
</div>''')
mp=mp.replace("var colors = {job:'#1565c0', est:'#1a9850', money:'#e6a817'};","var colors = {job:'#1565c0', est:'#1a9850', draft:'#e53935', lead:'#7b7b7b', money:'#e6a817'};")
mp=mp.replace("radius:9,color:'#fff',weight:2","radius:(p.approx?7:9),color:'#fff',weight:2,dashArray:(p.approx?'3,3':null)")
open(OUT+'/estimates-map-3f9c21.html','w').write(mp)
print('board items',len(B),'| map pins',len(pins),'| open quotes',len(open_q),money(sum(q["amounts"]["total"] for q in open_q)),'| drafts',len(drafts),'| older',len(older))
