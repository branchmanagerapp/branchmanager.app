# Regenerates today-snt-9d4b1e.html (/today) and schedule-snt-c47a2e.html (/runsheet)
# from what is actually current: texts (Messages), Fieldy transcripts, Dialpad, Gmail, Branch Manager.
import html, sys
UPDATED = "Sunday, Sept 13, 2026"
BM = "https://branchmanager.app/"
def rec(kind, uid, page): return f"{BM}?rec={kind}-{uid}#{page}"

CSS = '''
:root{--bg:#f7f6f2;--card:#fff;--ink:#161a15;--mut:#5f6b60;--faint:#8b968c;--line:rgba(20,30,20,.10);--line2:rgba(20,30,20,.17);--acc:#2f7d52;--warn:#b0702a;--red:#b33a3a;--glow:rgba(47,125,82,.10);
--serif:ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;--sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0a0d0b;--card:rgba(255,255,255,.03);--ink:#edf1ed;--mut:#8a968d;--faint:#5c6860;--line:rgba(255,255,255,.075);--line2:rgba(255,255,255,.14);--acc:#6fbf8f;--warn:#d9a05b;--red:#e07070;--glow:rgba(111,191,143,.10)}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.45;-webkit-font-smoothing:antialiased;padding-bottom:60px;background-image:radial-gradient(900px 380px at 50% -170px,var(--glow),transparent 72%)}
.wrap{max-width:660px;margin:0 auto;padding:0 18px}a{color:inherit;text-decoration:none}
header{padding:26px 90px 0 0}.mark{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--acc);font-weight:600}
h1{font-family:var(--serif);font-size:32px;line-height:1.05;font-weight:500;letter-spacing:-.02em;margin:8px 0 0}
.lede{color:var(--mut);font-size:13.5px;margin-top:6px}.lede b{color:var(--ink)}
.nav{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 4px}
.nav a{font-size:12px;font-weight:600;color:var(--mut);border:1px solid var(--line2);border-radius:20px;padding:5px 10px;background:var(--card)}
.nav a.on{background:var(--acc);border-color:var(--acc);color:#fff}
h2{font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:var(--acc);margin:26px 0 4px;padding-top:14px;border-top:1px solid var(--line);display:flex;align-items:baseline;gap:8px}
h2 small{font-weight:500;letter-spacing:0;text-transform:none;color:var(--faint);font-size:12px}
.row{display:block;padding:10px 0 11px;border-top:1px solid var(--line)}.row:first-of-type{border-top:none}
.rt{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.rn{font-size:15px;font-weight:600;letter-spacing:-.005em}
.amt{font-variant-numeric:tabular-nums;color:var(--acc);font-weight:600;font-size:14px}
.rd{display:block;font-size:12.5px;color:var(--mut);margin-top:2px;line-height:1.4}.rd b{color:var(--ink);font-weight:600}
.tag{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border:1px solid;border-radius:20px;padding:1.5px 6px;flex:none}
.t-go{color:var(--acc);border-color:var(--acc)}.t-call{color:var(--warn);border-color:var(--warn)}.t-red{color:var(--red);border-color:var(--red)}.t-off{color:var(--faint);border-color:var(--line2)}.t-src{color:var(--faint);border-color:var(--line2);letter-spacing:.06em;text-transform:none;font-weight:500}
.lnk{color:var(--acc);font-weight:600;font-size:12.5px}
.day{margin-top:18px}.dh{font-family:var(--serif);font-size:20px;letter-spacing:-.01em;display:flex;align-items:baseline;gap:10px}.dh small{font-family:var(--sans);font-size:12px;color:var(--faint)}
.note{background:var(--card);border:1px solid var(--line2);border-radius:12px;padding:12px 14px;font-size:13px;color:var(--mut);margin-top:16px;line-height:1.5}.note b{color:var(--ink)}
.print{position:fixed;right:14px;top:12px;font-size:12px;border:1px solid var(--line2);background:var(--card);border-radius:20px;padding:6px 11px;color:var(--mut)}
.foot{color:var(--faint);font-size:11px;text-align:center;margin-top:30px;line-height:1.7}
@media print{.print,.nav{display:none}body{padding:0}}
'''
def tag(cls, txt): return f'<span class="tag {cls}">{html.escape(txt)}</span>' if txt else ''
SRC = {"text":"text","fieldy":"recorded","bm":"BM","dialpad":"Dialpad","gmail":"email","jobber":"Jobber"}

def row(name, desc, amt=None, href=None, tags=(), src=()):
    t=''.join(tag(*x) for x in tags)+''.join(tag('t-src',SRC[s]) for s in src)
    a=f'<span class="amt">{html.escape(amt)}</span>' if amt else ''
    body=f'<span class="rt"><span class="rn">{html.escape(name)}</span>{a}{t}</span><span class="rd">{desc}</span>'
    return f'<a class="row" href="{html.escape(href)}">{body}</a>' if href else f'<div class="row">{body}</div>'

def page(title, h1, lede, active, body, foot):
    nav=[("today-snt-9d4b1e.html","This week"),("schedule-snt-c47a2e.html","Run sheet"),("ground-control-7c3f9a.html","Ground Control"),("estimates-snt-4b8e2f.html","Estimate board"),("hub-570301.html","Everything")]
    n=''.join(f'<a href="{h}"{" class=on" if h==active else ""}>{t}</a>' for h,t in nav)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#0a0d0b" media="(prefers-color-scheme:dark)"><title>{html.escape(title)}</title><style>{CSS}</style></head><body><a class="print" href="javascript:print()">⎙ Print</a><div class="wrap">
<header><div class="mark">Second Nature Tree · Doug + Catherine</div><h1>{h1}</h1><p class="lede">{lede}</p><nav class="nav">{n}</nav></header>
{body}
<p class="foot">{foot}</p></div></body></html>'''

# ---------------- THIS WEEK (/today) ----------------
B=[]
B.append('<div class="note"><b>Where this comes from.</b> Your texts through Sat 9/12 9:23pm, the Fieldy recordings Sept 10–11, Dialpad calls + voicemails, the inbox, and Branch Manager (last change Aug 28). <b>Quotes written since Aug 28 are in Jobber</b>, which I cannot read until you re-authorize it (one tap, link in the chat) — every Jobber-side number below is marked <span class="tag t-src">Jobber</span> and needs that check.</div>')

B.append('<h2>🚚 Jobs on the calendar <small>from texts + recordings</small></h2>')
B.append(row("Sun 9/13 — Jimmy Cantrell rents the chip truck + Bandit 254","Austin picked up ~7am for a Wappingers job. Chipper set; winch not fixed (wrap it). Catherine texted the chipper tray was left open and the registration is drying out.",href=None,tags=[("t-go","today")],src=["text","fieldy"]))
B.append(row("Mon 9/14 → Wed 9/16 — Continental Village Park District","Sycamore at the beach + locust, plus the hillside clearing. Anthony said one of Mon/Tue/Wed works ($300–350/day). Quote #562 sent 8/20; job #407 in BM has no date yet — put the date on it.","$2,600 + $4,600",href=BM+"#jobs",tags=[("t-go","pick the day")],src=["fieldy","bm"]))
B.append(row("Mon 9/14 4:00pm — RealWork Labs demo call (Eli)","Jobber geotag-reviews pitch. You said tentative. Calendar invite is in the inbox. Skip it if Monday is a work day — you told him that.",tags=[("t-off","optional")],src=["gmail","fieldy"]))
B.append(row("Wed 9/16 — Ryan's lawyer meeting","Ryan meets his lawyer about SDVOB + TDIU. Your 9-page questions packet is built — drop it to him before Wednesday.",href="ryan-questions-4c8a2d.html",tags=[("t-call","drop off packet")],src=["text","gmail"]))
B.append(row("Mon 9/21 — Michelle's aunt's job (Julie Melagrano, BM job #339)","Michelle asked for Sept 21 (her first day off, wants to be there). You said yes. No price on #339 yet — price it before you go.",href=BM+"#jobs",tags=[("t-go","confirmed by text")],src=["text","bm"]))
B.append(row("Tue 9/22 – Thu 9/24 — Mohegan Lake beech tree","Catherine: 'It's on the dash.' Three days blocked. Which client is this — Nick? Confirm the name and that it is on the schedule, not just the dash.","(Jobber)",tags=[("t-call","confirm who")],src=["text","jobber"]))
B.append(row("This weekend — split wood at Dominic's","Dominic asked 9/9 when you can split the wood at his house; you said this weekend.",tags=[("t-go","promised")],src=["text"]))
B.append(row("Sat 9/12 — Catherine: 'Sitting at 10k, so that week fully booked out'","She is booked through the Mohegan Lake week. Anything new goes after 9/24 unless it is a rain-day filler.",tags=[("t-off","capacity")],src=["text"]))

B.append('<h2>📨 Estimates — send, price, or chase <small>newest first</small></h2>')
B.append(row("Mike Badia — 287 Daisy Ln, Carmel","Catherine looked 9/10. You drafted it in Jobber 9/11 with all the photos as a line item. Front-yard property-line trees can go now; he owes you a callback by today (Sun) on the 2 trees on the neighbor's side. White oak lead prune ~$800–1,000 + locust over the roof ~$450–600.","≈$1,250–1,300 (Jobber draft)",tags=[("t-call","send front yard now")],src=["text","fieldy","jobber"]))
B.append(row("Dawn — Brewster (Brink's client)","Agreed to $1,000 by phone 9/11. She 'doesn't really email' — text or call her the confirmation and a date. Name is Dawn, D-A-W-N.","$1,000 agreed",tags=[("t-go","book it")],src=["text","fieldy"]))
B.append(row("Jeff — climbs, removals, Norway + sugar maple prune","Quote sent 9/11 at $6,900 (all-work discount) plus ~$800 dead tree by the driveway. Waiting on him.","$6,900 sent",tags=[("t-off","waiting")],src=["fieldy","jobber"]))
B.append(row("Jenny Zawolski — 608 Nelson Ave, Peekskill","Worked there 9/10 (deadwood, driveway overhang). Crane estimate for the two black oaks: $4,800 front + $5,800 back over the neighbor's house; sawmilling via Robbie at $100/hr +25%, transport 2 hrs. Send it as a high, honest estimate — 'sell the crane work first.'","$4,800 + $5,800",tags=[("t-call","send estimate")],src=["fieldy","gmail"]))
B.append(row("(516) 233-0861 — 16 Dean Drive","Voicemail Thu 9/10 11:26am: Catherine came to the house, they never got the quote, may have the wrong email. Catherine called back 9/10 3:37pm — confirm it went out.",tags=[("t-red","customer waiting")],src=["dialpad","gmail"]))
B.append(row("Mary Stark — (917) 373-5060","Two voicemails (9/8, 9/9): 'I didn't get your estimate, make sure you have the right number.' No outbound call to her on Dialpad since. Call her.",tags=[("t-red","call today")],src=["dialpad","gmail"]))
B.append(row("Roger Phillips — Lake Peekskill (referral 9/2)","Friend of a friend; you quoted his trees ~5 years ago, no work done since. Website request #667 came in 9/2. Catherine lives right there — has she been?",href=BM+"#requests",tags=[("t-call","Catherine to look")],src=["text","bm"]))
B.append(row("Tricia Leardi / Mike Stabulas — 32 Amalfi Dr (quote #559)","Replied 9/10 to the follow-up: waiting on another estimate. Separately, the 8/30 cat-in-tree call at their place was never invoiced — she gave her email for it.","$4,552 on hold",href=BM+"#quotes",tags=[("t-off","waiting"),("t-call","invoice the cat")],src=["gmail","text","bm"]))
B.append(row("Brink's second estimate — side of driveway + 2 trees over the neighbor's fence","Neighbor access coordinated. You texted Catherine 'the novel' about it 9/10. Price and send.",tags=[("t-call","price")],src=["fieldy","text"]))
B.append(row("Still open in Branch Manager (sent, no answer)","#548 Scott Manner $3,739 · #534 Amanda 100 Nassau $3,793 · #564 Catherine Scott, Garrison $9,320 · #561 Natasha, Lake Peekskill $3,251 · #558 Toni Rosen $3,902 · #543 Liz, Putnam Valley $6,015 · #537 Burchie Green $8,562 · #509 Abraham Kraus $11,704. Sprout Brook trio (Rigby/Higgins/Zadra) still 'awaiting' since June.",href=BM+"#quotes",tags=[("t-off","follow-up list")],src=["bm"]))

B.append('<h2>📞 Website leads nobody called <small>10 since Aug 12 — no Dialpad call on record to any of them</small></h2>')
for n,ph,svc,d,extra in [("Andrew Kaplan","516-606-9686","Pruning — 322 Sprout Brook Rd, cutting back","9/10","next to the Rigby/Higgins/Zadra houses you already quoted"),("Mark Cassidy","516-518-8711","Other","9/8",""),("Roger Phillips","845-216-2665","Pruning — Lake Peekskill","9/2","the referral above"),("Shawn Grant","347-554-4852","Pruning","8/25",""),("Jordan Visser","385-213-6179","Other","8/24",""),("Peter Bermudez","917-622-2436","Pruning","8/24",""),("Alex Duran","304-541-6311","Stump removal","8/18",""),("Roshan James","864-650-7120","Tree removal","8/15",""),("Jeff Monohan","805-801-5896","Tree removal","8/12","")]:
    B.append(row(f"{n} — {ph}",f"{svc} · requested {d}. {extra}",href=BM+"#requests",tags=[("t-call","call")],src=["bm","dialpad"]))
B.append(row("Hale — 800-877-5113","'Other' 9/2 — toll-free number, probably a vendor. Skip unless you recognize it.",href=BM+"#requests",tags=[("t-off","likely spam")],src=["bm"]))

B.append('<h2>🧾 Invoices — send and collect <small>live from Branch Manager</small></h2>')
B.append(row("Continental Village Park District — #1019","Sent 8/20, due Fri 9/19. Chase Fred Romer the week it is due.","$2,600",href=BM+"#invoices",tags=[("t-off","due 9/19")],src=["bm"]))
B.append(row("New Rochelle — 66 Laron Drive — #1011","Still a DRAFT. Due date was 8/25. Send it.","$1,899",href=BM+"#invoices",tags=[("t-red","send")],src=["bm"]))
B.append(row("Sarah Moden-Alliston — #395","Overdue since 5/23 on a $2,059 invoice. Payment link or a call.","$1,100 left",href=BM+"#invoices",tags=[("t-red","past due")],src=["bm"]))
B.append(row("Oswald Roche — #1017","You texted the $700 reminder 8/31; called 9/4. Overdue 9/11.","$700 left",href=BM+"#invoices",tags=[("t-call","chase")],src=["bm","text","dialpad"]))
B.append(row("Done but never invoiced","Jenny Zawolski 9/10 (608 Nelson) · cat rescue 8/30 (Leardi/Stabulas) · the 8/26 tree + chipping at Emily's parents' · Chaz $1,951 · Nicholas Anthony $800 · David Coats $2,200 · Meadow Lane $1,100 · plus older ones (Patrick Horn, Scott Carey, Palladino, Fedele). Done = invoice it.",href=BM+"#jobs",tags=[("t-red","invoice")],src=["bm","text","fieldy"]))
B.append(row("Paid this week","Catherine's referral job paid by card (8/29 text). Continental Village: Fred's #1019 pending. Ryan's Paychex check arrived 9/11.",tags=[("t-off","fyi")],src=["text"]))

B.append('<h2>💸 Money & admin due this week</h2>')
B.append(row("GL policy expires Fri 9/18 — Maria Trombetta (Tooher)","Renewal $9,483 is rated on $87,630 of old pruning payroll. You sent 2026 gross by class 9/11 and asked for a re-rate; she also needs the KM100 added (contractors equipment / inland marine, Geneva as loss payee) and payroll/gross for snow. Signed apps + premium needed before 9/18.",tags=[("t-red","by Friday")],src=["gmail"]))
B.append(row("Geneva Capital — KM100","Delivery DocuSign completed 9/10. $1,100/mo × 60 confirmed by Paige (addendum). First invoice was 9/5. Done.",tags=[("t-off","closed")],src=["gmail","text"]))
B.append(row("CADCO past due (SmartLawn)","Past-due statement again 9/8 (#108833, $16,303.55). Dennis's Lucente balance is the payoff plan.",href="tree-cash-0606-9f2c.html",tags=[("t-call","plan")],src=["gmail"]))
B.append(row("Kevin Fay — 2025 return","Met 9/11. Ram added to depreciation (~$11k → ~$8k), Catherine to payroll ~$1,000/mo from Oct 1, NYS-45 seasonal notice, 941 notice to answer. Nothing signed yet.",href="cpa2025-1aefb4.html",tags=[("t-off","in motion")],src=["fieldy","gmail"]))
B.append(row("Nextdoor Fave Awards — voting through 9/30","Catherine: 'lots of new Faves.' Kit + blast are drafted, nothing sends itself.",href="nextdoor-fave-9d4c2e.html",tags=[("t-off","running")],src=["text","gmail"]))
B.append(row("Paid out this week","Paul (roof) $2,000 cash 9/11 · Ron (splitter carb, wiring) $600 · HBA Automotive invoice 203315 paid · trailer at HBA done, Impreza done.",tags=[("t-off","fyi")],src=["text","fieldy","gmail"]))

B.append('<h2>⚡ Storm / line work — moving <small>Brink, Optimal, Ryan</small></h2>')
B.append(row("Matt at Optimal","You emailed crew + equipment 9/8. He has nothing now, you're on the list. Brink: 'that's the in, keep it low.'",href="storm-work-4e7a21.html",tags=[("t-off","waiting")],src=["gmail","text"]))
B.append(row("Line up 3–4 bucket-truck crews to W-9","Brink's ask: crews you trust, under you on contracts. Johnny/JKE, Green Velvet, Optimal numbers are on the playbook.",href="storm-work-4e7a21.html",tags=[("t-call","this month")],src=["text"]))
B.append(row("Ryan — SDVOB path","Lawyer Wed 9/16; Brink will help with the state registration. Packet is built.",href="storm-setasides-6b1f3e.html",tags=[("t-off","Wed")],src=["text"]))

BODY_TODAY=''.join(B)
FOOT_TODAY=f'Updated {UPDATED} · sources: Messages · Fieldy · Dialpad · Gmail · Branch Manager · <b>Jobber not yet re-authorized</b><br>Short links: /today · /runsheet · /gc · /map · /work'
open(sys.argv[1]+'/today-snt-9d4b1e.html','w').write(page("This Week — Second Nature Tree","This week","Sun Sept 13 – Sun Sept 20. What is booked, what to send, who is waiting, what to collect. Tap a row to open it in Branch Manager.","today-snt-9d4b1e.html",BODY_TODAY,FOOT_TODAY))

# ---------------- RUN SHEET (/runsheet) ----------------
R=[]
R.append('<div class="note"><b>Catherine —</b> this is the week in order, straight from your texts and the recordings. 🚚 = go to site · 📞 = call/text · 🗂️ = office. Anything marked <span class="tag t-src">Jobber</span> lives in Jobber and I could not verify it — check it there.</div>')
def day(title, sub, items):
    R.append(f'<div class="day"><div class="dh">{title}<small>{sub}</small></div>'+''.join(items)+'</div>')
day("Sun 13","today",[
 row("🚚 Jimmy Cantrell — chip truck + Bandit 254 out","Austin picked up early. Registration was drying in the open glovebox — make sure it made it back in the truck.",tags=[("t-off","equipment out")],src=["text"]),
 row("📞 Mike Badia — callback due today","He was calling back about the 2 trees on the neighbor's property by Sunday. If no call, send the front-yard property-line quote from Jobber as-is.",tags=[("t-call","if no call, send")],src=["text","jobber"]),
 row("📞 Dawn (Brewster) — confirm $1,000 and give her a date","She doesn't email. Text or call.",tags=[("t-call","")],src=["text","fieldy"]),
 row("🚚 Dominic — split the wood","Promised this weekend.",tags=[("t-go","")],src=["text"]),
])
day("Mon 14","'right and early'",[
 row("🚚 Continental Village Park District — beach sycamore + locust, hillside","Anthony can do Mon/Tue/Wed. Pick the day and text Fred Romer + Anthony. Quote #562 $2,600 + job #407 $4,600.",href=BM+"#jobs",tags=[("t-go","pick day")],src=["fieldy","bm"]),
 row("📞 Mary Stark — (917) 373-5060","Two voicemails, never called back. She is waiting on an estimate — check Jobber for it, then call.",tags=[("t-red","call")],src=["dialpad","jobber"]),
 row("📞 (516) 233-0861 — 16 Dean Drive","Never received the quote you did. Resend to the right email + confirm by phone.",tags=[("t-red","call")],src=["dialpad"]),
 row("🗂️ Send: Jenny Zawolski crane estimate ($4,800 + $5,800) · New Rochelle invoice #1011 ($1,899) · Zawolski 9/10 work invoice","",href=BM+"#invoices",tags=[("t-call","send")],src=["fieldy","bm"]),
 row("🗂️ 4:00pm RealWork Labs call — only if you're not on a job","",tags=[("t-off","optional")],src=["gmail"]),
])
day("Tue 15 · Wed 16","",[
 row("🚚 Continental Village (whichever day Anthony picks)","",tags=[("t-go","")],src=["fieldy"]),
 row("📞 Website leads — 9 uncalled","Kaplan (322 Sprout Brook) · Cassidy · Phillips · Grant · Visser · Bermudez · Duran · James · Monohan. Numbers on the This-week sheet. Two calls a day clears it by Friday.",href="today-snt-9d4b1e.html",tags=[("t-call","2/day")],src=["bm","dialpad"]),
 row("🗂️ Wed — Ryan's lawyer meeting; Doug drops the packet before","",href="ryan-questions-4c8a2d.html",tags=[("t-off","Doug")],src=["text"]),
 row("📞 Brink's second estimate — price the driveway side + 2 fence trees","",tags=[("t-call","price")],src=["fieldy"]),
])
day("Thu 17 · Fri 18","",[
 row("🗂️ Fri 9/18 — GL policy expires","Doug: signed apps + premium to Maria, re-rate pending, KM100 added.",tags=[("t-red","Doug")],src=["gmail"]),
 row("📞 Chase: Oswald Roche $700 · Sarah Moden-Alliston $1,100","",href=BM+"#invoices",tags=[("t-call","collect")],src=["bm"]),
 row("🗂️ Invoice the done jobs","Chaz · Nicholas Anthony · David Coats · Meadow Lane · cat rescue (Leardi) · 8/26 tree at Emily's parents'.",href=BM+"#jobs",tags=[("t-red","invoice")],src=["bm","text"]),
])
day("Sat 19 · Sun 20","",[
 row("📞 Continental Village invoice #1019 due 9/19 — $2,600","",href=BM+"#invoices",tags=[("t-off","due")],src=["bm"]),
])
day("Next week","booked",[
 row("🚚 Mon 9/21 — Julie Melagrano (Michelle's aunt), BM job #339","Michelle will be there. Price is not on the job yet.",href=BM+"#jobs",tags=[("t-go","confirmed")],src=["text","bm"]),
 row("🚚 Tue 9/22 – Thu 9/24 — Mohegan Lake beech tree","On the dash. Confirm the client name on the job.",tags=[("t-go","3 days")],src=["text","jobber"]),
])
BODY_RUN=''.join(R)
FOOT_RUN=f'Updated {UPDATED} · built from texts, recordings, Dialpad, email and Branch Manager · Jobber pending re-auth<br>Short links: /runsheet · /today · /gc'
open(sys.argv[1]+'/schedule-snt-c47a2e.html','w').write(page("Run Sheet — week of Sept 14","Run sheet","Week of Mon Sept 14, in order. Catherine's copy.","schedule-snt-c47a2e.html",BODY_RUN,FOOT_RUN))
print("wrote both")
