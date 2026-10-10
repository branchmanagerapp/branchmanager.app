# Regenerates today-snt-9d4b1e.html (/today) and schedule-snt-c47a2e.html (/runsheet)
# from what is actually current: texts (Messages), Fieldy transcripts, Dialpad, Gmail, Branch Manager.
import html, sys
UPDATED = "Friday, Sept 18, 2026"
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
B.append('<div class="note"><b>Where this comes from.</b> Jobber live (quotes, jobs, invoices — pulled Fri 9/18 morning), your texts through Fri 9/18, Branch Manager, Dialpad and the inbox. <b>Two jobs are now in Jobber</b> (Continental Village 9/28–29, Bohannon-Sacci 10/5). <b>The Mohegan Lake beech (9/22–24) is still only "on the dash"</b> — no record anywhere.</div>')

B.append('<h2>🚚 Jobs on the calendar <small>texts + Jobber</small></h2>')
B.append(row("Fri 9/18 8:00am — on the job with Austin","Firewood cut + split to clear room for the bucket truck. Austin: 'Meeting u on the job at 8?'",tags=[("t-go","today")],src=["text"]))
B.append(row("Thu 9/17 → today — Dominic's, bucket truck","You went up with truck + chipper after dumping the cedar; Austin met you 3:30. If it isn't wrapped, finish it today and bring the bucket back to the yard.",tags=[("t-go","finish")],src=["text"]))
B.append(row("Fri 9/19 — Andrew Brink powerwash jobs (you offered)","You texted 'I can work tomorrow' Thu morning. No reply yet.",tags=[("t-off","waiting on Andrew")],src=["text"]))
B.append(row("Mon 9/21 — Julie Melagrano (Michelle's aunt), Scarsdale — BM job #339","Michelle asked for this date and wants to be there. NO PRICE on #339 — price it before Monday.",href=BM+"#jobs",tags=[("t-go","confirmed")],src=["text","bm"]))
B.append(row("Tue 9/22 – Thu 9/24 — Mohegan Lake beech tree","Catherine: 'it's on the dash.' Three days blocked. Still no client name, no quote, no job in Jobber or BM. Nick?",tags=[("t-red","name it")],src=["text","jobber"]))
B.append(row("Sat 9/26 – Sun 9/27 — Jimmy Cottrell wants the chipper + bucket truck","He asked Wed 9/16. Unanswered. Yes or no by text.",tags=[("t-call","answer")],src=["text"]))
B.append(row("Mon 9/28 – Tue 9/29 — Continental Village Park District, hillside","Jobber job #329 · $2,700 · 50 Highland Dr. Scheduled Wed 9/16.","$2,700",tags=[("t-go","in Jobber")],src=["jobber"]))
B.append(row("Mon 10/5 — Joann Bohannon-Sacci, 101 Leda Dr, Peekskill","Jobber job #328 · $2,276 · from quote #562.","$2,276",tags=[("t-go","in Jobber")],src=["jobber"]))
B.append(row("Post office (Angela, postmaster) — bid the original scope now","Catherine walked it 9/17. The extra tree work over the lot can't be bid until Angela files a request. Quote the original scope first.",tags=[("t-call","write it")],src=["text"]))

B.append('<h2>📨 Estimates — live from Jobber <small>Fri 9/18 · newest first</small></h2>')
B.append(row("Jen Zawolski — 608 Nelson Ave — #568 crane oaks","DRAFT $11,800 written 9/14 from your 9/10 notes (front oak $4,800 · rear oak $5,800 · milling estimate · transport). Review + send.","$11,800 draft",href="https://secure.getjobber.com/quotes/65649225",tags=[("t-red","send")],src=["jobber"]))
B.append(row("Max — 16 Bell Air Ln, Wappingers — #572","Sent Thu 9/17. #571 is a duplicate draft — archive it.","$2,384 sent",tags=[("t-off","waiting")],src=["jobber"]))
B.append(row("Nicolette Coan — 16 Jean Dr, Cortlandt Manor — #570","Sent Wed 9/16.","$4,768 sent",tags=[("t-off","waiting")],src=["jobber"]))
B.append(row("Joe Sorrentino — 2921 Saddle Ridge, Yorktown — #569","Sent Wed 9/16.","$2,384 sent",tags=[("t-off","waiting")],src=["jobber"]))
B.append(row("Joe Ariano — 14 Owens Farm Rd, Fort Montgomery — #567","Sent Sun 9/13. Second-biggest open quote. Nudge next week.","$11,271 sent",tags=[("t-off","waiting")],src=["jobber"]))
B.append(row("Mary Stark — 128 Pine St, Peekskill — #566","Sent Sun 9/13 after two voicemails. Confirmed she got it? If not, one call: 917-373-5060.","$2,384 sent",tags=[("t-call","confirm")],src=["jobber","dialpad"]))
B.append(row("Mike Badia — 287 Daisy Ln, Carmel — #565","Still a $0 DRAFT with photos, a week old. Price the front-yard line (white-oak lead prune + locust over the roof) and send.","$0 draft",tags=[("t-red","price + send")],src=["jobber","text"]))
B.append(row("Tom Ho #564 $3,360 · Jeff Schwartz #563 $8,562","Both sent Fri 9/11. Nudge Schwartz next week.",tags=[("t-off","waiting")],src=["jobber"]))
B.append(row("Michael Spector — 58 Twin Ridges Rd — #561","Draft since 9/3. Finish and send.","$1,626 draft",tags=[("t-call","send")],src=["jobber"]))
B.append(row("Dawn (Brewster) — no quote exists","$1,000 agreed by phone 9/11. Text Doug her last name + address → Claude drafts the quote in Jobber.","$1,000 verbal",tags=[("t-red","create")],src=["text","fieldy"]))
B.append(row("Catherine Scott's husband — wants a fresh copy of the estimate","(516) 232-5298 per Catherine 9/16. Resend from Jobber.",tags=[("t-call","resend")],src=["text"]))
B.append(row("(516) 233-0861 — 16 Dean Drive","Voicemail 9/10: Catherine came out, they never got a quote. Nothing for Dean Drive in Jobber. Which visit was this?",tags=[("t-red","missing quote")],src=["dialpad","jobber"]))
B.append(row("Jean Mortimer — 218 Gallagher St, Buchanan — #552","Biggest open quote. Sent 8/25, silent since. Call.","$14,522 sent",tags=[("t-call","follow up")],src=["jobber"]))
B.append(row("John Surette — 303 Myers Corners — #546","Waiting on his insurance company (texted 9/2). He also wants to look at your truck door — get together.","$9,429 sent",tags=[("t-off","insurance")],src=["jobber","text"]))
B.append(row("Tricia Leardi #559 $5,961 · Rob McCray #558 $3,360 · Valarie Manca #556 $2,601 · Mark Delorenzo #560 $2,601 · Todd Cammisa #553 $1,951 · Jennifer Colandrea #550 $1,951","All sent late Aug – early Sept, no reply. One follow-up text each. Delorenzo also has an old draft #555 to archive.",tags=[("t-off","follow-up texts")],src=["jobber"]))
B.append(row("Needs a price: Shawn Grant #554 · Alex Duran #549 · Roshan James #548 (draft $2,168)","Website leads Catherine turned into quotes; two sit at $0.",tags=[("t-call","price")],src=["jobber","bm"]))
B.append(row("Still open from spring/summer","Kraus #545/#544 · Liz #538 $6,015 · Katz #534 · Manner #533 draft · Sprout Brook trio (Zadra / Rigby / Higgins) · Carlucci · Zerello · Beck · Stabulas #541 · Nicholas 25 Cayuga #543 $650 · Dana Lanza #542 $867. One text each, or archive.",tags=[("t-off","clean-up list")],src=["jobber"]))

B.append('<h2>📞 Website leads with no quote and no call <small>5</small></h2>')
for n,ph,svc,d,extra in [("Andrew Kaplan","516-606-9686","Pruning — 322 Sprout Brook Rd, cutting back","9/10","next door to the three Sprout Brook quotes from June"),("Mark Cassidy","516-518-8711","Other — 25 Melville Park Rd, Melville","9/8","Long Island — probably out of area; one call to confirm"),("Roger Phillips","845-216-2665","Pruning — 161 Tanglewylde Rd, Lake Peekskill","9/2–9/3","in Jobber as a request, no quote; Catherine lives right there"),("Jordan Visser","385-213-6179","Other","8/24",""),("Jeff Monohan","805-801-5896","Tree removal","8/12","")]:
    B.append(row(f"{n} — {ph}",f"{svc} · requested {d}. {extra}",href=BM+"#requests",tags=[("t-call","call")],src=["bm","jobber","dialpad"]))

B.append('<h2>🧾 Invoices — send and collect <small>Jobber + Branch Manager</small></h2>')
B.append(row("Jessica Bernadello — Jobber #378 — Tree of Heaven removal","DRAFT since April 27, never issued. Job done 4/22. Send it.","$5,093.63 draft",tags=[("t-red","send")],src=["jobber"]))
B.append(row("New Rochelle — 66 Laron Drive — BM #1011","Still a DRAFT in Branch Manager. Due date was 8/25.","$1,899",href=BM+"#invoices",tags=[("t-red","send")],src=["bm"]))
B.append(row("Oswald Roche — BM #1017","Overdue since 9/11. Reminder texted 8/31, called 9/4.","$700 left",href=BM+"#invoices",tags=[("t-call","chase")],src=["bm","text","dialpad"]))
B.append(row("Sarah Moden-Alliston — Jobber #382","Past due since 5/23.","$1,159.13 left",tags=[("t-call","chase")],src=["jobber","bm"]))
B.append(row("Continental Village Park District — BM #1019","Sent 8/20, due TOMORROW Sat 9/19. Chase Fred Romer Monday if it hasn't landed.","$2,600",href=BM+"#invoices",tags=[("t-off","due 9/19")],src=["bm"]))
B.append(row("Paid this month (Jobber)","Jen Zawolski #397 $1,083.75 (9/11) · Chaz #394 $2,492.63 (9/2) · Tricia Leardi #396 $108.38 · 723 Hudson Ave LLC #395 $650.25 · Hope Bogart #387 $500.",tags=[("t-off","fyi")],src=["jobber"]))
B.append(row("Done, no invoice anywhere","David Coats $2,200 · Meadow Lane (Michelle-sold) $1,100 · Nicholas Anthony $800 (the $650.25 from 723 Hudson Ave LLC may be this one) · 8/26 tree + chipping at Emily's parents' · Matt Hait, Wilton 9/14 (12 photos, no job or invoice). Done = invoice it.",href=BM+"#jobs",tags=[("t-red","invoice")],src=["bm","jobber","text"]))

B.append('<h2>💸 Money & admin</h2>')
B.append(row("GL policy expires TODAY Fri 9/18 — Maria Trombetta (Tooher)","Renewal $9,483 rated on $87,630 of old pruning payroll; re-rate asked 9/11; KM100 to add (Geneva loss payee). Confirm it is bound today.",tags=[("t-red","today")],src=["gmail"]))
B.append(row("Nextdoor Fave Awards — voting closes Wed 9/30","The blast was NEVER sent — the 9/12 email to Catherine overstated it. Copy is on the kit page: paste into a Jobber campaign and send.",href="nextdoor-fave-9d4c2e.html",tags=[("t-red","paste + send")],src=["gmail"]))
B.append(row("Social: 15 photo drafts + the Wednesday series — nothing is posting","Facebook / Instagram / Google are not connected. Wed 9/16 post #1 did not go out. Approve drafts in SocialBranch; connect the accounts.",href=BM+"#socialbranch",tags=[("t-call","connect")],src=["bm"]))
B.append(row("CADCO past due (SmartLawn)","#108833 $16,303.55. Dennis's Lucente balance is the payoff plan.",href="tree-cash-0606-9f2c.html",tags=[("t-call","plan")],src=["gmail"]))
B.append(row("Kevin Fay — 2025 return","Met 9/11: Ram to depreciation, Catherine to payroll ~$1,000/mo from Oct 1, NYS-45 + 941 notices to answer. Nothing signed yet.",href="cpa2025-1aefb4.html",tags=[("t-off","in motion")],src=["fieldy","gmail"]))
B.append(row("John Surette — truck door","He wants to take another look and show you something he needs (texted 9/14 11:53pm). Set a time.",tags=[("t-call","schedule")],src=["text"]))

B.append('<h2>⚡ Storm / line work — moving <small>Brink, Optimal, Ryan</small></h2>')
B.append(row("Matt at Optimal","You emailed crew + equipment 9/8. Nothing now, you're on the list.",href="storm-work-4e7a21.html",tags=[("t-off","waiting")],src=["gmail","text"]))
B.append(row("Line up 3–4 bucket-truck crews to W-9","Johnny/JKE, Green Velvet, Optimal numbers are on the playbook.",href="storm-work-4e7a21.html",tags=[("t-call","this month")],src=["text"]))
B.append(row("Ryan — SDVOB path","Lawyer meeting was Wed 9/16 — ask him how it went.",href="storm-setasides-6b1f3e.html",tags=[("t-call","follow up")],src=["text"]))

BODY_TODAY=''.join(B)
FOOT_TODAY=f'Updated {UPDATED} · sources: Jobber (live) · Messages · Dialpad · Gmail · Branch Manager<br>Short links: /today · /runsheet · /gc · /map · /work'
open(sys.argv[1]+'/today-snt-9d4b1e.html','w').write(page("This Week — Second Nature Tree","This week","Fri Sept 18 – Sun Sept 27. What is booked, what to send, who is waiting, what to collect. Tap a row to open it.","today-snt-9d4b1e.html",BODY_TODAY,FOOT_TODAY))

# ---------------- RUN SHEET (/runsheet) ----------------
R=[]
R.append('<div class="note"><b>Catherine —</b> the next ten days in order. 🚚 = go to site · 📞 = call/text · 🗂️ = office. Quotes, jobs and invoices are live from Jobber as of Fri 9/18 morning.</div>')
def day(title, sub, items):
    R.append(f'<div class="day"><div class="dh">{title}<small>{sub}</small></div>'+''.join(items)+'</div>')
day("Fri 18","today",[
 row("🚚 8:00 — Doug + Austin: firewood, clear the bucket truck","Dominic's if anything is left from yesterday.",tags=[("t-go","")],src=["text"]),
 row("🗂️ GL policy expires today — Maria Trombetta","Doug confirms it is bound; re-rate + KM100 still pending.",tags=[("t-red","Doug")],src=["gmail"]),
 row("📞 Mike Badia #565 — price + send","A week as a $0 draft.",tags=[("t-red","")],src=["jobber"]),
 row("📞 Jimmy Cottrell — chipper + bucket 9/26–27, yes or no","Asked Wednesday.",tags=[("t-call","")],src=["text"]),
 row("🗂️ Post office — quote the original scope","Angela can't take the tree work until she files a request.",tags=[("t-call","write it")],src=["text"]),
])
day("Sat 19 · Sun 20","",[
 row("🚚 Andrew Brink powerwash — if he confirms","",tags=[("t-off","waiting")],src=["text"]),
 row("📞 Continental Village invoice #1019 due Sat 9/19 — $2,600","",href=BM+"#invoices",tags=[("t-off","due")],src=["bm"]),
 row("🗂️ Send: Zawolski #568 ($11,800) · Bernadello #378 ($5,094) · New Rochelle #1011 ($1,899) · Spector #561","",href="https://secure.getjobber.com/quotes/65649225",tags=[("t-call","send")],src=["jobber","bm"]),
 row("📞 Resend the estimate to Catherine Scott's husband — (516) 232-5298","",tags=[("t-call","")],src=["text"]),
])
day("Mon 21","booked",[
 row("🚚 Julie Melagrano (Michelle's aunt) — Scarsdale — BM job #339","Michelle on site. Price must be on the job before you go.",href=BM+"#jobs",tags=[("t-go","confirmed")],src=["text","bm"]),
 row("📞 Chase: Oswald Roche $700 · Sarah Moden-Alliston $1,159 · CVPD #1019 if unpaid","",href=BM+"#invoices",tags=[("t-call","collect")],src=["bm","jobber"]),
])
day("Tue 22 · Wed 23 · Thu 24","booked — 3 days",[
 row("🚚 Mohegan Lake beech tree","'On the dash.' Put the client name + price into Jobber so it exists.",tags=[("t-go","name it")],src=["text"]),
 row("📞 Wed — nudge Jean Mortimer ($14,522) · Joe Ariano ($11,271) · Jeff Schwartz ($8,562)","",tags=[("t-call","follow up")],src=["jobber"]),
 row("📞 Website leads — Kaplan · Cassidy · Roger Phillips · Visser · Monohan","Numbers on the This-week sheet. Two a day.",href="today-snt-9d4b1e.html",tags=[("t-call","2/day")],src=["bm","dialpad"]),
])
day("Fri 25 · Sat 26 · Sun 27","",[
 row("🚚 Jimmy Cottrell — chipper + bucket truck (if yes)","Sat–Sun.",tags=[("t-off","pending")],src=["text"]),
 row("🗂️ Invoice the done jobs","David Coats · Meadow Lane · Nicholas Anthony · Emily's parents' 8/26 · Matt Hait, Wilton 9/14.",href=BM+"#jobs",tags=[("t-red","invoice")],src=["bm","text"]),
])
day("Next week","in Jobber",[
 row("🚚 Mon 9/28 – Tue 9/29 — Continental Village Park District, hillside — job #329 $2,700","",tags=[("t-go","scheduled")],src=["jobber"]),
 row("🗂️ Wed 9/30 — Nextdoor Fave voting closes","Paste the kit copy into a Jobber campaign before then.",href="nextdoor-fave-9d4c2e.html",tags=[("t-red","send")],src=["gmail"]),
 row("🚚 Mon 10/5 — Joann Bohannon-Sacci, 101 Leda Dr — job #328 $2,276","",tags=[("t-go","scheduled")],src=["jobber"]),
])
BODY_RUN=''.join(R)
FOOT_RUN=f'Updated {UPDATED} · built from Jobber (live), texts, Dialpad, email and Branch Manager<br>Short links: /runsheet · /today · /gc'
open(sys.argv[1]+'/schedule-snt-c47a2e.html','w').write(page("Run Sheet — Sept 18–27","Run sheet","Fri Sept 18 through Sun Sept 27, in order. Catherine's copy.","schedule-snt-c47a2e.html",BODY_RUN,FOOT_RUN))
print("wrote both")
