# Builds hub-570301.html — the "everything" hub. Edit the CATALOG, re-run, deploy.
import html, re, sys, datetime

UPDATED = "Sept 12, 2026"
BM = "https://branchmanager.app/"

# tags: L locked · X external site · T template · D older duplicate · P parked · S short link · PUB public · NEW
PANELS = [
 ("today","🛰","Today","Run the day", [
  ("Start here","the daily front door",[
   ("",[
    ("Ground Control","ground-control-7c3f9a.html","Calendar, agenda, estimates to send, what needs doing. Short link /gc.",["S"]),
    ("Home — one question","home-snt-3f8b12.html","What do you want to do right now? Tap it.",[]),
    ("Today sheet","today-snt-9d4b1e.html","Done · waiting on you · new leads. Short link /today.",["S"]),
    ("The Plan","plan-snt-8c31d7.html","Right-now → this-week → this-month, one step at a time.",[]),
    ("Run schedule — Catherine's order","schedule-snt-c47a2e.html","Straight down Catherine's note. Short link /runsheet.",["S"]),
    ("Estimate board","estimates-snt-4b8e2f.html","Every open estimate + lead, freshest first.",[]),
    ("Estimates & jobs map","estimates-map-3f9c21.html","Every quote & job plotted, color-coded by status. Short link /map.",["S"]),
    ("Day by Day — photo recaps","day-recap-7e31c9.html","What we were out doing — real days, real trees.",[]),
    ("Enough. — the breathe page","enough-snt-7b7e05.html","Read this instead of the feed, then come back and tap one thing.",[]),
   ]),
  ]),
  ("To-do lists","every list that exists — the queue is the accountability page",[
   ("Live lists",[
    ("Go-live queue (accountability page)","accountability-a1f7.html","THE queue. Failures, rules, and the prioritized go-live plan. Work it top-down.",[]),
    ("Master to-do","bm-todo-101167.html","Branch Manager, SmartLawn, books, equipment — one place.",[]),
    ("To-Do (locked)","todo-snt-7c21f4.html","Password-locked live to-do dashboard. Bookmarked on your phone.",["L"]),
    ("Tree to-dos · Fieldy Aug 26 – Sep 3","todo-tree-sep3-8b2f6d.html","What Fieldy heard across 11 recordings, as checkboxes.",[]),
   ]),
   ("Planners & apps",[
    ("Ground Control app (PWA)","gc-app.html","Installable shell: Hub / To-Do / Plan / Archive. Content lives on the pages it links.",[]),
    ("Planner — all businesses","planner-2ntr.html","Month / week / day, drag-and-drop, Tree · Lawn · Skate · Admin.",[]),
    ("Activity calendar Mar–Jun 2026","calendar-apr-jun-b7e21c.html","93 active days, 439 logged — tap a day.",[]),
    ("One Inbox — the task system","one-inbox.html","Why the to-dos felt scattered and the design that fixes it.",[]),
   ]),
   ("Older lists",[
    ("To-Do — Jul 1 (Tree / SmartLawn / Skate)","todo-c62a28.html","Snapshot from Jul 1 2026.",["D"]),
    ("2nd Nature command center (Jul)","command-center-2ntr-a91f3d.html","Status · calendar · to-do · pages, July version.",["D"]),
    ("Morning recap — Jul 6","recap-snt-7f2e4c.html","Money map from live BM data on Jul 6.",["D"]),
    ("BM update — Jul 7","update-jul7-3e91c4.html","Everything fixed + your 4 quick actions that day.",["D"]),
   ]),
  ]),
  ("How we work","rules, workflow, onboarding",[
   ("",[
    ("How we work — the workflow","workflow-snt-e82c4b.html","One system, three people: Doug, Catherine, Claude. Short link /work.",["S"]),
    ("Ground rules — how Claude works with you","ground-rules-c4e2.html","Enforced on every message and in long-term memory. Yours to change.",[]),
    ("Catherine — Branch Manager quick start","catherine-start-b7d3f2.html","One app on her phone for jobs, schedule, photos, invoices.",[]),
    ("SocialBranch in 5 minutes","socialbranch-guide-4e7b21.html","Claude drafts posts, Catherine approves. Nothing sends itself.",[]),
    ("Shop & fridge — clean & stocked","cleaning-4c8f21.html","A simple system that sticks with a busy crew.",[]),
    ("Photo → Claude pipeline","ops.html","iPhone photo → Save to Files → iCloud Desktop → Screenshots. Then say 'look at the photos.'",[]),
   ]),
  ]),
  ("Share with people","recaps and review pages built to send",[
   ("",[
    ("Hey Catherine & Ryan — the last couple weeks","recap-2wk-8b3d1a.html","Warm photo recap of the storm weeks.",[]),
    ("Catherine — your hours & pay, please review","catherine-hours-a7f3c2.html","Tap any number to fix it.",[]),
    ("Nextdoor Fave vote kit","nextdoor-fave-9d4c2e.html","Everything to send for the Fave Awards. Nothing here sends itself.",[]),
    ("Questions for Ryan","ryan-questions-4c8a2d.html","Set-aside and storm questions, printable.",[]),
   ]),
  ]),
 ]),

 ("tree","🌳","Tree","Second Nature Tree Service", [
  ("Operating picture","cash, budget, the honest numbers",[
   ("Dashboards",[
    ("Fleet & budget — the whole picture","fleet-budget-b1e454.html","What the business does, earns, and spends. The live operating numbers.",[]),
    ("Tree cash — 0606 checking","tree-cash-0606-9f2c.html","M&T checking picture and the Navimow payoff plan.",[]),
    ("Money audit — money sitting still","money-audit-8f3c21.html","Owed to you, unbilled, unsent — pulled live from Branch Manager (29 Aug).",[]),
    ("Pricing check — what a crew-hour is worth","pricing-check-7f3a91.html","Whether a quote covers the real cost. Corrected 24 Aug.",[]),
    ("SNT — what's really going on","snt-budget-9bfc05.html","It is NOT failing. The money's real; the timing isn't.",[]),
   ]),
   ("The honest plan — 8 steps",[
    ("The plan (overview)","snt-plan.html","Eight steps from 'why is there no money' to 'here's how to fix it'.",[]),
    ("1 · The two numbers","snt-plan-1-numbers.html","",[]),
    ("2 · Why it feels like it's failing","snt-plan-2-cashflow.html","",[]),
    ("3 · Where the money actually goes","snt-plan-3-fleet.html","",[]),
    ("4 · Truck & equipment calculator","snt-plan-4-trucks.html","",[]),
    ("5 · Minimum revenue per employee","snt-plan-5-employees.html","",[]),
    ("6 · How to fix the cash flow","snt-plan-6-fix.html","",[]),
    ("7 · Chuck it down, or scale up?","snt-plan-7-decision.html","",[]),
    ("8 · Your action plan","snt-plan-8-action.html","",[]),
   ]),
   ("Job math",[
    ("4 Terrace Dr — crane job calculator","brewster-calc-9e41d7.html","Silver maple + sugar maple, crane-assisted, Brewster.",[]),
    ("Are you actually making money? — calculator","calculator/","Tree business calculator (public, on branchmanager.app).",["PUB"]),
   ]),
  ]),
  ("Storm work","the playbook and everything hanging off it (Sept 10)",[
   ("",[
    ("The Storm Playbook","storm-work-4e7a21.html","Storm revenue strategy — the top page; the others share its nav.",["NEW"]),
    ("Andrew — the Storm Desk","andrew-storm-desk-5b8e31.html","Storms are the best-paying and worst-run work. Andrew runs the desk.",[]),
    ("Storm subcontractor agreement + rate schedule","sub-agreement-9d2e47.html","Draft v1, printable.",["NEW"]),
    ("$90k hook-lift — consolidate the fleet?","hooklift-8a6720.html","The fleet decision behind the storm play.",[]),
    ("Set-asides: Catherine's WBE & Ryan's SDVOB","storm-setasides-6b1f3e.html","What each cert can and can't do.",["NEW"]),
    ("Questions for Ryan","ryan-questions-4c8a2d.html","Why these questions.",["NEW"]),
    ("Tree Camp — storm relief, Jul 19–22","treeguysummercamp.html","Postcard Cabins deployment recap. Short link /tree-camp.",["S"]),
    ("Tree Guy Summer Camp — the pitch","treeguypitch.html","A modest proposal for Postcard Cabins.",[]),
   ]),
  ]),
  ("Bids, partners & line clearance","work with real money on it",[
   ("Bids",[
    ("Bid Command Center","bids-snt-4e7b2c.html","BPCA + Rye Brook · deadlines · arborist bench · checkboxes save on this phone.",[]),
    ("Bids & partners tracker","bids-partners-4e7a91.html","Who we're going after, with whom.",[]),
   ]),
   ("Line clearance & rates",[
    ("Market rates & line clearance — research","line-clearance-9f3a72.html","Clearway, Lewis, Asplundh, Davey · crew bill rates · prevailing wage · the path in.",[]),
    ("Operator network rate card","rate-card-2b610d.html","One sheet to rent iron and hire crew across the network.",[]),
    ("Line clearance research (older copy)","line-clearance-3e060b.html","Same research without the shared nav.",["D"]),
   ]),
   ("Partners",[
    ("Second Nature × BrinkStar — working together","snt-brinkstar-7e4a2c.html","Options, equipment values, next steps (shareable).",[]),
    ("Brink jobs — crew settle-up","brink-jobs-9e4c17.html","Doug × Brinkstar × Michelle, Aug 4–5.",[]),
    ("Work together — the co-op page","partners.html","How local crews swap work through Branch Manager (public).",["PUB"]),
    ("Crew profit-share — design for review","profit-share-design-4e7b21.html","Path-to-ownership design. No code yet.",[]),
   ]),
  ]),
  ("Trucks & equipment","decisions with a dollar attached",[
   ("",[
    ("Giant D254 — repair decision","giant-loader-8fd740.html","Cracked head: head-gasket fix and keep as backup vs replace.",[]),
    ("Ram 2500 — keep it or let it go?","ram2500-68c5d8.html","The honest math on an underwater work truck.",[]),
    ("Intrepid KM100 — financing","intrepid-financing-6b2e.html","$1,100/mo · 60 mo · Geneva Capital. Delivered Sept 4.",[]),
    ("KM100 parts & shipping","km100-parts-423a29.html","Genuine Kubota D1105 parts.",[]),
    ("Fleet — full detail","fleet-full-5e88b2.html","Every truck & machine.",["L"]),
    ("Hook-lift (private numbers)","hooklift-3a09d5.html","",["L"]),
    ("Ram 2500 (private loan detail)","ram2500-priv-7c41e9.html","",["L"]),
   ]),
  ]),
  ("People & payroll","Catherine, crew, how pay works",[
   ("Catherine",[
    ("Catherine — start here","catherine-start-b7d3f2.html","Branch Manager quick start.",[]),
    ("Catherine × Second Nature — the partnership, one page","catherine-agreement-1p-7c3f91.html","Plain-English summary of the operating agreement draft.",[]),
    ("Catherine — hours & pay review","catherine-hours-a7f3c2.html","",[]),
    ("Catherine + Branch Manager — the honest answer","catherine/","Scoping doc for a Catherine AI assistant. Short link /catherine.",["S"]),
   ]),
   ("Payroll",[
    ("How payroll & job costing work","how-payroll-works-4e91c7.html","Why the page exists (the 20 Aug automation lesson) and how it works now.",[]),
    ("Payroll worksheet — Aug 10–23","payroll-aug-4d81c3.html","Type hours, totals compute live.",[]),
    ("Payroll — legal setup status & plan","payroll-status-6d92c4.html","Prep for Kevin Fay, CPA.",[]),
    ("How to file payroll quarterly","payroll-quarterly-guide-3a7f.html","941s and quarterly filings, plain English.",[]),
   ]),
  ]),
  ("Customers & marketing","what the public sees",[
   ("peekskilltree.com — the site",[
    ("peekskilltree.com","https://peekskilltree.com/","The tree service website (GitHub Pages).",["X","PUB"]),
    ("Services","https://peekskilltree.com/services.html","",["X"]),
    ("Tree removal","https://peekskilltree.com/tree-removal.html","",["X"]),
    ("Tree pruning","https://peekskilltree.com/tree-pruning.html","",["X"]),
    ("Stump grinding","https://peekskilltree.com/stump-grinding.html","",["X"]),
    ("Emergency tree service","https://peekskilltree.com/emergency-tree-service.html","",["X"]),
    ("Land clearing","https://peekskilltree.com/land-clearing.html","",["X"]),
    ("Roof soft washing","https://peekskilltree.com/roof-soft-washing.html","New service page — slate / tile / asphalt.",["X"]),
    ("Our work","https://peekskilltree.com/our-work.html","",["X"]),
    ("Service areas","https://peekskilltree.com/service-areas.html","Westchester, Putnam & Dutchess — 36 town pages hang off this.",["X"]),
    ("FAQ","https://peekskilltree.com/faq.html","",["X"]),
    ("Contact","https://peekskilltree.com/contact.html","",["X"]),
    ("Request a free estimate","https://peekskilltree.com/book.html","",["X"]),
    ("AI discoverability — llm-info","https://peekskilltree.com/llm-info/","llms.txt + JSON API, no prices exposed.",["X"]),
    ("AI endpoints report","ai-endpoints-report-3224e1.html","What shipped Jul 15 and how it was verified.",[]),
   ]),
   ("peekskilltree.com — calculators (internal-ish)",[
    ("Quick estimate calculator","https://peekskilltree.com/estimate.html","",["X"]),
    ("Job cost estimator","https://peekskilltree.com/rates.html","",["X"]),
    ("Break-even calculator","https://peekskilltree.com/breakeven.html","",["X"]),
    ("Business costs","https://peekskilltree.com/costs.html","",["X"]),
    ("Advertising ROI calculator","https://peekskilltree.com/roi.html","",["X"]),
   ]),
   ("Pages on branchmanager.app",[
    ("Second Nature Tree — what we run","second-nature-tree.html","The crew, the services, and the iron.",["PUB"]),
    ("Areas we serve","service-area-2ntr.html","Towns & areas east of the Hudson.",["PUB"]),
    ("Request a free estimate (BM booking)","book.html","Customer booking form.",["PUB"]),
    ("Branch Cam","branchcam.html","Every tree job, on the record. GPS-stamped, shareable.",["PUB"]),
    ("How did we do? — satisfaction","sat.html","",["PUB"]),
    ("We've moved to Branch Manager","updates/","Customer notice.",["PUB"]),
   ]),
   ("Marketing",[
    ("Marketing plan — Second Nature Tree","marketing-plan.html","Margin over volume; review flywheel; no customer-facing rates.",[]),
    ("Marketing hub — three brands","marketing-hub.html","Brand tokens, channel board, post-in-advance system, weekly batch calendar.",[]),
    ("Yard sign — print-ready 24×18","sntree-signs-004491.html","Real site colors.",[]),
    ("Yard sign — source","sntree-sign-src.html","",["D"]),
    ("The CapCut playbook","capcut-playbook-9c2f4a.html","iPhone + GoPro → posted.",[]),
    ("Nextdoor Fave vote kit","nextdoor-fave-9d4c2e.html","",[]),
    ("Tracking my words — 24/7","word-tracker-9f2a1c.html","Word count + my share vs others — the real options.",[]),
   ]),
  ]),
  ("New lines & ideas","side doors, with honest status tags",[
   ("",[
    ("Business ideas — every side door","ideas-snt-6b3d91.html","One place, honest status on each.",[]),
    ("Soft washing — plan & budget","softwash-plan-5c2e88.html","Slate-roof B2B bolt-on; startup budget; insurance blocker.",[]),
    ("Septic pumping — the winter route","septic-winter-5d7c31.html","Per-job net, disposal fees, startup budget.",["P"]),
    ("Goat land clearing — 2-goat pilot","goat-clearing-9a4e17.html","",["P"]),
    ("Tree Guy Summer Camp","tree-camp.html","Redirect to the camp page.",["P"]),
   ]),
  ]),
 ]),

 ("lawn","🌱","SmartLawn","Smart Lawn NY — robotic mowers (dba of Second Nature Tree)", [
  ("Run it","the dealer business, day to day",[
   ("",[
    ("SmartLawn section inside Branch Manager","https://branchmanager.app/#smartlawn","Every Smart Lawn client / quote / job / invoice rolled up.",["X"]),
    ("Follow-ups — tap, review, send","smartlawn-followups-8d42c7.html","Every open lead + overdue receipt with a prewritten text.",[]),
    ("Navimow promo tracker","navimow-promos-8a3f.html","Live manufacturer deals and when they end.",[]),
    ("Forensic inventory audit","smartlawn-audit-4b7e.html","Every serialized unit: bought vs sold vs should-be-in-garage.",[]),
    ("Sales, receipts & tax audit","smartlawn-receipts-9c2f.html","Every unit → its sale → price, NY tax, receipt.",[]),
    ("Business plan — July 2026","smartlawn-plan-9e8220.html","Sales, install & service for homeowners and the trade.",[]),
    ("Property mapper — analyze a lawn","smartlawn-lawnmap.html","Trace the lawn, get acreage + which Navimow fits.",[]),
    ("Facebook Marketplace listings — ready to paste","smartlawn-fb-listings-a3d91c.html","Prices from your own catalog.",[]),
   ]),
  ]),
  ("Lucente / Dennis","the fleet deal — buys on cut width, X430 is his floor",[
   ("Send these",[
    ("Dennis — statement & payment","lucente-invoice-7b3e9c.html","Two-invoice statement + ACH panel. Short link /dennis.",["S"]),
    ("Dennis — your fleet quote","smartlawn-lucente-d4e91b.html","Prepared exclusively for Lucente Landscaping.",[]),
    ("Build your Navimow fleet (fleet builder)","lucente.html","Pick how many of each model. The MODELS array here = the real catalog.",[]),
    ("Fleet partner program (generic pitch)","smartlawn-fleet.html","Personalize with ?to=Company.",[]),
    ("0606 checking → Navimow payoff plan","tree-cash-0606-9f2c.html","How Dennis's order clears the CADCO bill.",[]),
   ]),
   ("Older copies",[
    ("Dennis — invoice, payment & resale cert","lucente-pay.html","",["D"]),
    ("Dennis — invoice variant 77a2e5","lucente-pay-77a2e5.html","",["D"]),
    ("Dennis — invoice variant 9c3f21","lucente-pay-9c3f21.html","",["D"]),
    ("Dennis — invoice variant b41d90","lucente-pay-b41d90.html","",["D"]),
    ("Dennis — invoice (Jul 4)","dennis-invoice-7c4a.html","",["D"]),
    ("Dennis — statement (unhashed copy)","lucente-invoice.html","",["D"]),
    ("Fleet builder copy 5ad0f9","lucente-5ad0f9.html","",["D"]),
    ("Fleet builder copy 07632f","lucente-fleet-07632f.html","",["D"]),
    ("Fleet builder copy e1360eb1","smartlawn-fleet-e1360eb1.html","",["D"]),
   ]),
  ]),
  ("Receipts","paid-in-full receipts sent to customers",[
   ("",[
    ("Receipt — Elizabeth Bynum","receipt-bynum-ac2c31.html","",[]),
    ("Receipt — Chris Vultaggio","receipt-viltaggio-7d1e42.html","",[]),
   ]),
  ]),
  ("Signs & brand","print-ready",[
   ("",[
    ("Yard signs — print-ready (all variants)","smartlawn-signs-ff5c5f.html","24×18, rev 8, real site navy.",[]),
    ("Sign A — Never Mow Again","smartlawn-sign-a-src.html","",["D"]),
    ("Sign B — Robotic Lawn Mowers","smartlawn-sign-b-src.html","",["D"]),
    ("Sign B1 — blue website","smartlawn-sign-b1-src.html","",["D"]),
    ("Sign B2 — blue bar","smartlawn-sign-b2-src.html","",["D"]),
    ("Sign B3 — blue tagline","smartlawn-sign-b3-src.html","",["D"]),
    ("Sign B4 — Doug spec","smartlawn-sign-b4-src.html","",["D"]),
    ("Site redesign preview","smartlawn-redesign-preview.html","Navimow, Yarbo and Terranox — sold, installed, serviced locally.",[]),
   ]),
  ]),
  ("smartlawnny.com — the site","public pages",[
   ("Main pages",[
    ("smartlawnny.com","https://smartlawnny.com/","Robotic mower showroom — Westchester.",["X","PUB"]),
    ("Services & pricing","https://smartlawnny.com/services.html","",["X"]),
    ("Best robotic mowers 2026 — buyer's guide","https://smartlawnny.com/guide.html","",["X"]),
    ("See them in action — videos","https://smartlawnny.com/videos.html","",["X"]),
    ("HOA program","https://smartlawnny.com/hoa/","",["X"]),
    ("Commercial calculator","https://smartlawnny.com/commercial-calculator/","",["X"]),
    ("Blog — is a robotic mower worth it in Westchester?","https://smartlawnny.com/blog/is-a-robotic-mower-worth-it-westchester.html","",["X"]),
    ("Sales rep program","https://smartlawnny.com/sales-rep.html","",["X"]),
    ("Catalog","https://smartlawnny.com/catalog.html","",["X"]),
    ("Marketing plan — Smart Lawn","https://smartlawnny.com/marketing-plan","Category education + landscaper fleet channel.",["X"]),
    ("AI discoverability — llms.txt","https://smartlawnny.com/llms.txt","13 real mowers with prices, 30 towns, 3 plans.",["X"]),
   ]),
   ("Products",[
    ("Navimow X450","https://smartlawnny.com/products/navimow-x450.html","",["X"]),
    ("Navimow X430","https://smartlawnny.com/products/navimow-x430.html","",["X"]),
    ("Navimow H220","https://smartlawnny.com/products/navimow-h220.html","",["X"]),
    ("Navimow i215 LiDAR","https://smartlawnny.com/products/navimow-i215-lidar.html","",["X"]),
    ("Navimow i105E","https://smartlawnny.com/products/navimow-i105e.html","",["X"]),
    ("Terranox CM240","https://smartlawnny.com/products/navimow-terranox-cm240m1.html","",["X"]),
    ("Terranox CM120","https://smartlawnny.com/products/navimow-terranox-cm120m1.html","",["X"]),
    ("FJD RM21","https://smartlawnny.com/products/fjd-rm21.html","",["X"]),
    ("Yarbo Core","https://smartlawnny.com/products/yarbo-core.html","",["X"]),
    ("Yarbo lawn mower","https://smartlawnny.com/products/yarbo-lawn-mower.html","",["X"]),
    ("Yarbo snow blower","https://smartlawnny.com/products/yarbo-snow-blower.html","",["X"]),
   ]),
   ("Admin (login side)",[
    ("SmartLawn POS","https://smartlawnny.com/admin/","Square-level POS + inventory.",["X"]),
    ("SocialBranch — SmartLawn social scheduler","https://smartlawnny.com/admin/social.html","Live Jul 5. Paste the lawn webhook in Accounts to enable publishing.",["X"]),
    ("Invoice portal","https://smartlawnny.com/admin/portal.html","",["X"]),
   ]),
  ]),
 ]),

 ("bm","💻","Branch Manager","The software — app, customer pages, co-op, status", [
  ("The app","branchmanager.app — crews log in here",[
   ("Open the app",[
    ("Branch Manager — sign in","https://branchmanager.app/","The daily driver. Dashboard Today board is the front door.",["X"]),
    ("Client portal (clients.branchmanager.app)","https://clients.branchmanager.app/","Where customers land.",["X"]),
    ("Approve drafts","approvals.html","Review customer emails before they go out.",[]),
    ("Import legacy data","import-legacy.html","Pushes line items + payments to Supabase.",[]),
   ]),
   ("Jump to a section",[
    ("Dashboard","https://branchmanager.app/#dashboard","",["X"]),
    ("Schedule","https://branchmanager.app/#schedule","",["X"]),
    ("Requests","https://branchmanager.app/#requests","",["X"]),
    ("Quotes","https://branchmanager.app/#quotes","",["X"]),
    ("Jobs","https://branchmanager.app/#jobs","",["X"]),
    ("Invoices","https://branchmanager.app/#invoices","",["X"]),
    ("Payments","https://branchmanager.app/#payments","",["X"]),
    ("Clients","https://branchmanager.app/#clients","",["X"]),
    ("Pipeline","https://branchmanager.app/#pipeline","",["X"]),
    ("Books","https://branchmanager.app/#books","",["X"]),
    ("Expenses","https://branchmanager.app/#expenses","",["X"]),
    ("Payroll","https://branchmanager.app/#payroll","",["X"]),
    ("Reports","https://branchmanager.app/#reports","",["X"]),
    ("Insights","https://branchmanager.app/#insights","",["X"]),
    ("Messaging","https://branchmanager.app/#messaging","",["X"]),
    ("Call center","https://branchmanager.app/#callcenter","",["X"]),
    ("SocialBranch (social posts)","https://branchmanager.app/#socialbranch","",["X"]),
    ("Marketing site","https://branchmanager.app/#marketingsite","",["X"]),
    ("Smart Lawn","https://branchmanager.app/#smartlawn","",["X"]),
    ("Permits","https://branchmanager.app/#permits","",["X"]),
    ("Insurance","https://branchmanager.app/#insurance","",["X"]),
    ("Task reminders","https://branchmanager.app/#taskreminders","",["X"]),
    ("Tools","https://branchmanager.app/#tools","",["X"]),
    ("Settings","https://branchmanager.app/#settings","",["X"]),
   ]),
  ]),
  ("Customer-facing pages","what a customer or crew member sees",[
   ("",[
    ("Quote / estimate approval","approve.html","The link customers get. Valid-token links always resolve.",["PUB"]),
    ("Pay invoice","pay.html","",["PUB"]),
    ("Payment received","paid.html","",["PUB"]),
    ("Client portal page","client.html","",["PUB"]),
    ("My Portal (tenant template)","portal.html","",["T"]),
    ("Portal sign-in","portal/","",["PUB"]),
    ("Request a free estimate","book.html","",["PUB"]),
    ("How did we do?","sat.html","",["PUB"]),
    ("Branch Cam — project photos","share-photos.html","",["PUB"]),
    ("Branch Cam — before / after slider","share-slider.html","",["PUB"]),
    ("Your Branch Manager invite","invite.html","Locked-in pricing for life.",["PUB"]),
    ("Set your password","set-password.html","",["PUB"]),
    ("Onboarding (tenant template)","onboarding/","",["T"]),
    ("Job cost estimator (tenant template)","sub.html","",["T"]),
    ("Privacy policy (template)","privacy.html","",["T"]),
    ("Terms of service (template)","terms.html","",["T"]),
    ("Data deletion (template)","data-deletion.html","",["T"]),
   ]),
  ]),
  ("Selling the software","landing pages, pricing, the SaaS side",[
   ("",[
    ("Landing — field service operations software","landing.html","",["PUB"]),
    ("Landing — for tree services","landing-tree.html","Built by tree operators.",["PUB"]),
    ("Pricing — everything included","pricing.html","Less than their starter.",["PUB"]),
    ("Branch Manager — LLM info","llm-info/","AI-discoverability page for the software.",["PUB"]),
    ("Branch Cam","branchcam.html","",["PUB"]),
    ("Sign up (friends code)","https://branchmanager.app/?signup=solo&code=FRIENDS2026","Self-serve white-label tenant, 14-day trial.",["X"]),
    ("TapCard — digital business card (demo)","tapcard-demo-cccc65a3.html","White-label demo.",["PUB"]),
    ("Tap to Share — setup & how it works","tapcard-guide-9e4b27.html","",[]),
   ]),
  ]),
  ("Operator network / co-op","the shared back office for independent tree companies",[
   ("",[
    ("The operating system for employee-owned tree co-ops","collective/","",["PUB"]),
    ("How it works — try it free","how-it-works/","Your own workspace + the co-op hub.",["PUB"]),
    ("Join — grow together, not alone","join/","",["PUB"]),
    ("Founding agreement","agreement/","",["PUB"]),
    ("Standard rates & accountability","rates/","",["PUB"]),
    ("Ground rules — what we settle before we start","ground-rules/","",["PUB"]),
    ("Work together — co-op page","partners.html","",["PUB"]),
    ("Operator network rate card","rate-card-2b610d.html","",[]),
   ]),
  ]),
  ("Status, audits & plans","how the software is doing",[
   ("Right now",[
    ("Go-live queue (accountability)","accountability-a1f7.html","The queue. Failures, rules, prioritized plan.",[]),
    ("Monthly costs","costs-b3d9.html","What it costs to keep it stable and secure, tiered.",[]),
    ("System map — schema + architecture","system-map.html","Every table, file location, server function.",[]),
    ("Back office — ops home","ops.html","Three storefronts, one back office.",[]),
    ("Marketing hub — three brands","marketing-hub.html","",[]),
    ("AI agents — status & to-do","ai-agents-9e3f72.html","Agents read, analyze, draft — never touch customers or money.",[]),
   ]),
   ("Reports & audits",[
    ("Hardening sprint — Aug 1 report","hardening-report-3e8b2f.html","All claims verified against live production.",[]),
    ("App Store readiness audit","appstore-audit-9f2c.html","Code-verified, Aug 8.",[]),
    ("iOS App Store plan","appstore-plan-7d41c9.html","Capacitor shell + native pieces. Scoping only.",[]),
    ("BM cutover — to 99.999%","cutover.html","Trust blockers, Jobber parity, data cutover.",[]),
    ("The cutover — Jobber off by Aug 14","jobber-cutover-4e7b21.html","",[]),
    ("Dialpad replacement — research","dialpad-alternatives-4c81a2.html","OpenPhone wins — when you're ready.",[]),
    ("Quote editor — final layout","quote-layout-preview.html","",[]),
   ]),
   ("Proposals built on BM",[
    ("Catherine AI assistant — proposal","catherine/","Plan-first scoping. /catherine.",["S"]),
    ("Ireland Lacrosse — digital growth pitch","ireland/","Pitch site, not portal replacement. /ireland.",["S"]),
   ]),
   ("Moved / retired",[
    ("Operating architecture → System map","operating-architecture.html","",["D"]),
    ("Delivery audit → lives inside BM","ops-audit-4d9e21.html","",["D"]),
    ("Jobber OAuth callback","jobber-oauth-cb-3e7a91.html","Read-only Jobber app since Aug 13.",["D"]),
    ("Old BM mirror on peekskilltree.com","https://peekskilltree.com/branchmanager/","Stale copy — do not use.",["X","D"]),
   ]),
  ]),
 ]),

 ("money","💰","Money","Books, tax, loans, private numbers", [
  ("Books & tax","for Kevin Fay, CPA, and the state",[
   ("",[
    ("2025 books for Kevin Fay, CPA","cpa2025-1aefb4.html","Both entities reconciled. Locked with Kevin's password.",["L"]),
    ("NY sales tax — where we stand","sales-tax-status-4b7e2d.html","Tree + Skate current through Jun–Aug 2026; the '$4k paid twice' story.",["NEW"]),
    ("How payroll & job costing work","how-payroll-works-4e91c7.html","",[]),
    ("Payroll — legal setup status & plan","payroll-status-6d92c4.html","",[]),
    ("How to file payroll quarterly","payroll-quarterly-guide-3a7f.html","",[]),
    ("Money audit — money sitting still","money-audit-8f3c21.html","",[]),
    ("Branch Manager monthly costs","costs-b3d9.html","",[]),
   ]),
  ]),
  ("Loans & big purchases","what's financed and why",[
   ("",[
    ("Intrepid KM100 — Geneva Capital","intrepid-financing-6b2e.html","$1,100/mo, 60 months from Sept 5 2026.",[]),
    ("Ram 2500 — Chase loan math","ram2500-68c5d8.html","",[]),
    ("Giant D254 — repair vs replace","giant-loader-8fd740.html","",[]),
    ("$90k hook-lift decision","hooklift-8a6720.html","",[]),
    ("0606 checking → Navimow (CADCO) payoff","tree-cash-0606-9f2c.html","",[]),
   ]),
  ]),
  ("Private — locked","one password, decrypts in your browser only",[
   ("",[
    ("Vault","vault-0e5a3f.html","Portfolio, net worth, debt, Jon deal — one login.",["L"]),
    ("Everything (private)","everything-6d12aa.html","Doug — everything I do, private edition.",["L"]),
    ("Portfolio","portfolio-7e21a9.html","Robinhood picture.",["L"]),
    ("Net worth","networth-4a91c7.html","The full balance sheet.",["L"]),
    ("Debt page","debt-2c77e1.html","The restructure plan.",["L"]),
    ("Jon deal","jon-deal-8b3f04.html","The 50/50 structure.",["L"]),
    ("Fleet — full detail","fleet-full-5e88b2.html","",["L"]),
    ("Hook-lift (private)","hooklift-3a09d5.html","",["L"]),
    ("Ram 2500 (private)","ram2500-priv-7c41e9.html","",["L"]),
    ("To-Do (locked)","todo-snt-7c21f4.html","",["L"]),
   ]),
  ]),
 ]),

 ("doug","👤","Doug","Personal pages, Northeast Intrepid, side projects", [
  ("Me","the person behind the org chart",[
   ("",[
    ("Doug Brown — what I build & run","doug-d21f41.html","The public map of the businesses. Shareable.",["PUB"]),
    ("Everything I do (private)","everything-6d12aa.html","",["L"]),
    ("Enough.","enough-snt-7b7e05.html","You're not behind. Finish and close, don't start.",[]),
    ("Ground rules — how Claude works with you","ground-rules-c4e2.html","",[]),
    ("Tracking my words — 24/7","word-tracker-9f2a1c.html","",[]),
   ]),
   ("Business cards",[
    ("Tap to share — card 1","card-8ffd3bc4.html","Tree · SmartLawn · Skate in one contact.",["PUB"]),
    ("Tap to share — card 2","card-929f84c5.html","",["PUB"]),
    ("Tap to share — card 3 (white-label)","card-f8cee7a8.html","",["PUB"]),
    ("Tap to Share — how it works","tapcard-guide-9e4b27.html","",[]),
   ]),
  ]),
  ("Northeast Intrepid","the loader dealership — parked, machine bought",[
   ("The plan",[
    ("Dealer plan","northeast-intrepid-c83567.html","Demo center, demos, delivery, service. Pitch + show circuit.",["P"]),
    ("The whole plan, for Chris","ni-walkthrough-e77eaa.html","For Chris Sleurink, the importer.",["P"]),
    ("5-year plan & budget","intrepid-5yr-448e0b.html","",["P"]),
    ("Year-1 P&L projection","intrepid-pnl-1faf77.html","",["P"]),
    ("Show circuit budget — 2026","intrepid-show-budget-ea07eb.html","",["P"]),
    ("KM100 financing","intrepid-financing-6b2e.html","This part is live: machine delivered Sept 4.",[]),
    ("KM100 parts & shipping","km100-parts-423a29.html","",[]),
   ]),
   ("Sites & pitches",[
    ("Northeast Intrepid — dealer site","ni-site-87a456.html","Machines · Demo · Rentals · Service · Parts · Financing.",["P"]),
    ("Northeast Intrepid — compact loaders for the green industry","northeast-intrepid-8c3e8d.html","",["P"]),
    ("Intrepid websites — built by Doug","intrepid-websites-63b284.html","Pitch to Chris for dealer sites.",["P"]),
    ("The numbers, and why I want you in — for Kevin","northeast-intrepid-kevin-995ead.html","",["P"]),
    ("A spot for Ron's Rescue Repair","northeast-intrepid-ron-8ac4b8.html","",["P"]),
    ("Ron's Rescue Repair — site","rons-rescue-repair-ed2dcd.html","Small engine · powersports · Lake Peekskill.",["P"]),
    ("Todd + Northeast Intrepid","todd-intrepid-d1a2e1.html","",["P"]),
   ]),
  ]),
  ("Side projects","apps and sites outside the three businesses",[
   ("Published",[
    ("Ground Control — original PWA","https://peekskilltree.com/ground-control/","The wellness check-in app that became the business shell.",["X"]),
    ("dinner — what's for dinner, actually","https://peekskilltree.com/dinner/","Fridge scan, neighbors, budget. Supabase-backed.",["X"]),
    ("dinner — doug admin","https://peekskilltree.com/dinner/doug.html","",["X"]),
    ("Alex Mosely — Watermelonism","https://peekskilltree.com/alex/","2nd Nature team page.",["X"]),
    ("consult.skateos.com — AI consulting with Jon Marchand","https://consult.skateos.com/","",["X"]),
   ]),
   ("On this Mac only (not published)",[
    ("Baseline — Daily Command Center","","~/Desktop/Folders/Personal/Side-projects/Claude-baseline",[]),
    ("Habit tracker — Doug monthly tracker","","~/Desktop/Folders/Personal/Side-projects/habit-tracker",[]),
    ("So I Got That Going For Me — Expo app","","~/Desktop/Folders/Personal/Side-projects/so-i-got-that",[]),
    ("CineIsles Adventure — Roblox, for your daughter","","~/Desktop/Folders/Personal/Side-projects/CineIsles-daughter",[]),
    ("Earth Tone Farm website","","~/Desktop/Folders/Earth Tone Farm Website",[]),
    ("Doc templates (receipt / statement / review)","","~/Desktop/_doc-templates — use these for any customer or staff doc",[]),
   ]),
  ]),
 ]),

 ("skate","🛹","Skate","2nd Nature skate park — separate project, links only", [
  ("Heads up","",[
   ("",[
    ("Skate work lives in its own chat and repo","","Open the skate session for anything here (~/Desktop/Skate/SKATE-TO-MIGRATE/Claude-2ntr-skatepark). This tab is links only.",[]),
   ]),
  ]),
  ("skateos.com","the live site",[
   ("Public",[
    ("skateos.com","https://skateos.com/","",["X","PUB"]),
    ("2nd Nature — landing","https://skateos.com/2ntr/","",["X"]),
    ("Shop","https://skateos.com/2ntr/shop/","",["X"]),
    ("Team wall","https://skateos.com/team/","27 rider pages hang off this.",["X"]),
    ("Legends","https://skateos.com/legends","",["X"]),
    ("Picks","https://skateos.com/picks","",["X"]),
    ("Rider portal","https://skateos.com/rider/","",["X"]),
    ("Cardiel","https://skateos.com/cardiel","",["X"]),
   ]),
   ("Crew / internal",[
    ("Staff tutorial","https://skateos.com/tutorial","Door, register, members.",["X"]),
    ("Door setup","https://skateos.com/door","",["X"]),
    ("Inventory → Square (/j2)","https://skateos.com/j2","",["X"]),
    ("For Jon — partner recap","https://skateos.com/for-jon","",["X"]),
    ("Team looks — design hub","https://skateos.com/team/looks/","",["X"]),
    ("Playbook","https://skateos.com/team/playbook","",["X"]),
    ("Credits / referrals","https://skateos.com/team/credits","",["X"]),
    ("Square vs skateOS — POS memo","https://skateos.com/team/square-vs-skateos/","",["X"]),
    ("Build notes","https://skateos.com/team/notes-b7e4c2/","",["X"]),
    ("Skate to-do","https://skateos.com/team/todo-4c9e1a/","",["X"]),
    ("Systems report for Jon Marchand","https://skateos.com/marchand/","",["X"]),
    ("Marketing plan — skate","https://skateos.com/marketing-plan","",["X"]),
    ("app.skateos.com","https://app.skateos.com/","",["X"]),
    ("skateOS task board (GitHub project)","https://github.com/users/peekskilltree/projects/1","",["X"]),
   ]),
  ]),
  ("Skate pages on branchmanager.app","older decision briefs and hubs",[
   ("",[
    ("Skate park — macro financials","skate-macro-f36585.html","2nd Nature 3 Inc, built Aug 7.",[]),
    ("For Jon — everything in one place","for-jon-7b3e91.html","",[]),
    ("Park entry automation (door)","hvskate-door-a04a13.html","",[]),
    ("Square vs Shopify — decision brief","shop-decision-6b2f19.html","",[]),
    ("— skateOS architecture","shop-decision-6b2f19-architecture.html","",[]),
    ("— Is skateOS ready?","shop-decision-6b2f19-audit.html","",[]),
    ("— Square as the back end","shop-decision-6b2f19-migration.html","",[]),
    ("— What each one really costs","shop-decision-6b2f19-pricing.html","",[]),
    ("— The processor question","shop-decision-6b2f19-processor.html","",[]),
    ("— How the site actually works","shop-decision-6b2f19-stack.html","",[]),
    ("2nd Nature hub — everything we built (Jul 2)","hub-2ntr-8c31a9.html","",["D"]),
    ("2nd Nature hub — links + to-do (Jul 1)","hub-5803129f.html","",["D"]),
    ("Jon deal (locked)","jon-deal-8b3f04.html","",["L"]),
   ]),
  ]),
 ]),

 ("office","🔧","Back office","Accounts, dashboards, repos, short links", [
  ("Short links","type these on the phone — branchmanager.app/…",[
   ("",[
    ("/gc → Ground Control","ground-control-7c3f9a.html","",["S"]),
    ("/today → Today sheet","today-snt-9d4b1e.html","",["S"]),
    ("/work → How we work","workflow-snt-e82c4b.html","",["S"]),
    ("/runsheet → Run schedule","schedule-snt-c47a2e.html","",["S"]),
    ("/map → Estimates map","estimates-map-3f9c21.html","",["S"]),
    ("/dennis → Lucente statement","lucente-invoice-7b3e9c.html","",["S"]),
    ("/tree-camp → Tree camp","treeguysummercamp.html","",["S"]),
    ("/catherine → Catherine AI proposal","catherine/","",["S"]),
    ("/ireland → Ireland Lacrosse pitch","ireland/","",["S"]),
    ("Adding a short link","","Worker source drifted from deployed — recover the deployed worker first, never wrangler deploy from a fresh clone.",[]),
   ]),
  ]),
  ("Dashboards & accounts","sign in as info@peekskilltree.com unless noted",[
   ("Data & hosting",[
    ("Supabase — Branch Manager project","https://supabase.com/dashboard/project/ltpivkqahvplapyagljt","GitHub login as peekskilltree.",["X"]),
    ("Supabase — SQL editor","https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/sql/new","",["X"]),
    ("Supabase — auth users","https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/auth/users","",["X"]),
    ("Supabase — API settings","https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/settings/api","",["X"]),
    ("Cloudflare — branchmanager.app analytics","https://dash.cloudflare.com/3af289e3ec693fde8fcfec341424a343/web-analytics","",["X"]),
    ("Cloudflare — peekskilltree.com zone","https://dash.cloudflare.com/8176609b9b31328f34c4b52bf4054114/peekskilltree.com","AI-bot robots.txt toggle lives here.",["X"]),
    ("Cloudflare — purge cache (branchmanager.app)","https://dash.cloudflare.com/?to=/:account/branchmanager.app/caching/configuration","Fixes stuck-404 pages.",["X"]),
    ("UptimeRobot","https://dashboard.uptimerobot.com","8 monitors.",["X"]),
    ("GitHub Pages origin for branchmanager.app","https://branchmanagerapp.github.io/branchmanager.app/","Fallback if the worker misbehaves.",["X"]),
   ]),
   ("Business tools",[
    ("Gmail — info@peekskilltree.com","https://mail.google.com/mail/u/0/","",["X"]),
    ("Google Business Profile","https://business.google.com","",["X"]),
    ("Dialpad","https://dialpad.com","Being replaced by OpenPhone.",["X"]),
    ("Mailgun","https://app.mailgun.com","",["X"]),
    ("Robinhood agentic trading (read-only)","https://agent.robinhood.com/mcp/trading","Never trade from here.",["X"]),
   ]),
   ("Code repos",[
    ("branchmanagerapp/branchmanager.app","https://github.com/branchmanagerapp/branchmanager.app","The live BM repo. Always fresh-clone before deploying.",["X"]),
    ("smartlawnny-cloud/peekskilltree.com","https://github.com/smartlawnny-cloud/peekskilltree.com","The LIVE tree site (GitHub Pages).",["X"]),
    ("smartlawnny-cloud/smartlawnny.com","https://github.com/smartlawnny-cloud/smartlawnny.com","",["X"]),
    ("peekskilltree/claude-sync","https://github.com/peekskilltree/claude-sync","Nightly chats + memory sync between Macs.",["X"]),
    ("peekskilltree/skateos-site","https://github.com/peekskilltree/skateos-site","Skate deploy snapshots.",["X"]),
    ("peekskilltree/skateOS-mini","https://github.com/peekskilltree/skateOS-mini","Skate source of truth.",["X"]),
   ]),
  ]),
  ("On this Mac","files that run the operation (no secrets listed here)",[
   ("",[
    ("Accounts & infrastructure map","","~/Desktop/_Credentials/ACCOUNTS-MAP.md — read first for any account, ID, repo, token question",[]),
    ("Claude ground rules","","~/Desktop/CLAUDE-GROUND-RULES.md",[]),
    ("Claude to-dos","","~/Desktop/CLAUDE-TODOS.md",[]),
    ("BM deploy credential clone (stale code, do not edit)","","~/Desktop/TREE FOLDER/Tree/branchmanager-app — only for the remote URL",[]),
    ("peekskilltree.com push clone","","~/Desktop/TREE FOLDER/Tree/_legacy-archive/peekskilltree-deploy",[]),
    ("Scripts","","~/Desktop/scripts — preflight.sh, bm375.sh, smoke tests, skate deploy",[]),
    ("Screenshots","","~/Desktop/Screenshots — say 'check my screenshot'",[]),
    ("Tree business files","","~/Desktop/TREE FOLDER — clients, finance, insurance, HR, media",[]),
   ]),
  ]),
 ]),
]

TAGLABEL = {"L":"locked","X":"↗","T":"template","D":"older","P":"parked","S":"short link","PUB":"public","NEW":"new"}

def esc(s): return html.escape(s, quote=True)
def slug(s): return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')

def href(h):
    if not h: return ""
    return h  # relative stays relative (works on the worker + GH Pages origin)

out=[]
total=0
tabs=[]
panels_html=[]
for pid,ic,name,sub,sections in PANELS:
    n=sum(len(items) for _,_,groups in sections for _,items in groups)
    total+=n
    tabs.append(f'<button class="tab" data-p="{pid}" type="button"><span class="ti">{ic}</span>{esc(name)}</button>')
    chips=[]
    secs=[]
    for si,(sname,ssub,groups) in enumerate(sections):
        sid=f"{pid}-{slug(sname)}"
        cnt=sum(len(items) for _,items in groups)
        chips.append(f'<a class="chip" href="#{sid}" data-sec="{sid}">{esc(sname)}<b>{cnt}</b></a>')
        rows=[]
        for gname,items in groups:
            if gname: rows.append(f'<div class="grp">{esc(gname)}</div>')
            for iname,ih,idesc,tags in items:
                tg=''.join(f'<i class="tag t-{t}">{TAGLABEL[t]}</i>' for t in tags if t!="X")
                ext=' target="_blank" rel="noopener"' if ih.startswith('http') else ''
                arrow='<span class="ext">↗</span>' if 'X' in tags else ''
                crumb=f'{ic} {esc(name)} › {esc(sname)}'
                desc=f'<span class="rd">{esc(idesc)}</span>' if idesc else ''
                if ih:
                    rows.append(f'<a class="row" href="{esc(href(ih))}"{ext} data-crumb="{crumb}"><span class="rt"><span class="rn">{esc(iname)}</span>{arrow}{tg}</span>{desc}</a>')
                else:
                    rows.append(f'<div class="row nolink" data-crumb="{crumb}"><span class="rt"><span class="rn">{esc(iname)}</span>{tg}</span>{desc}</div>')
        secs.append(f'<details class="sec" id="{sid}"{" open" if si==0 else ""}><summary><span class="sl">{esc(sname)}</span><span class="ss">{esc(ssub)}</span><span class="sc">{cnt}</span></summary><div class="rows">{"".join(rows)}</div></details>')
    panels_html.append(f'<section class="panel" id="p-{pid}" data-p="{pid}"><div class="phead"><div class="pk">{ic} {esc(name)}</div><div class="ps">{esc(sub)}</div></div><nav class="chips">{"".join(chips)}</nav>{"".join(secs)}</section>')

page=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#0a0d0b" media="(prefers-color-scheme:dark)"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Everything"><link rel="apple-touch-icon" href="apple-touch-icon.png"><title>Everything — Doug Brown / Second Nature</title>
<style>
:root{{
 --bg:#f7f6f2;--card:#ffffff;--ink:#161a15;--mut:#5f6b60;--faint:#8b968c;
 --line:rgba(20,30,20,.10);--line2:rgba(20,30,20,.17);--acc:#2f7d52;
 --glow:rgba(47,125,82,.10);--shadow:0 1px 2px rgba(20,30,20,.05),0 6px 18px rgba(20,30,20,.05);
 --serif:ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
 --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
 --bar:rgba(247,246,242,.92);
}}
@media (prefers-color-scheme:dark){{:root{{
 --bg:#0a0d0b;--card:rgba(255,255,255,.028);--ink:#edf1ed;--mut:#8a968d;--faint:#5c6860;
 --line:rgba(255,255,255,.075);--line2:rgba(255,255,255,.14);--acc:#6fbf8f;
 --glow:rgba(111,191,143,.10);--shadow:none;--bar:rgba(10,13,11,.92);
}}}}
*{{box-sizing:border-box;-webkit-tap-highlight-color:transparent}}
html{{-webkit-text-size-adjust:100%;scroll-padding-top:118px}}
body{{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;padding-bottom:72px;
 background-image:radial-gradient(900px 380px at 50% -170px,var(--glow),transparent 72%)}}
.wrap{{max-width:660px;margin:0 auto;padding:0 18px}}
a{{text-decoration:none;color:inherit}}
header{{padding:30px 0 0}}
.mark{{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--acc);font-weight:600}}
h1{{font-family:var(--serif);font-size:36px;line-height:1.05;font-weight:500;letter-spacing:-.02em;margin:10px 0 0}}
.lede{{color:var(--mut);font-size:14px;margin-top:8px;max-width:34em}}
.lede b{{color:var(--ink);font-weight:600}}

/* level 1 — sticky tab bar + search */
.bar{{position:sticky;top:0;z-index:5;background:var(--bar);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);margin:18px -18px 0;padding:10px 18px 0}}
#q{{width:100%;padding:11px 14px;border-radius:11px;border:1px solid var(--line2);background:var(--card);color:var(--ink);font-size:16px;font-family:inherit;outline:none;transition:.15s;box-shadow:var(--shadow)}}
#q::placeholder{{color:var(--faint)}} #q:focus{{border-color:var(--acc)}}
.tabs{{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:10px 0 10px;margin:0 -18px;padding-left:18px;padding-right:18px;scroll-snap-type:x proximity}}
.tabs::-webkit-scrollbar{{display:none}}
.tab{{flex:none;scroll-snap-align:start;border:1px solid var(--line2);background:var(--card);color:var(--ink);border-radius:20px;padding:7px 12px 7px 9px;font:600 13px/1 var(--sans);letter-spacing:-.01em;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:var(--shadow)}}
.tab .ti{{font-size:14px}}
.tab.on{{background:var(--acc);border-color:var(--acc);color:#fff}}
@media (prefers-color-scheme:dark){{.tab.on{{color:#06110a}}}}

/* panels */
.panel{{display:none;padding-top:16px}} .panel.on{{display:block}}
.phead{{padding:6px 0 2px}}
.pk{{font-family:var(--serif);font-size:26px;letter-spacing:-.015em;line-height:1.1}}
.ps{{color:var(--mut);font-size:13px;margin-top:3px}}

/* level 2 — section chips + collapsible sections */
.chips{{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}}
.chip{{font-size:12px;font-weight:600;color:var(--mut);border:1px solid var(--line);border-radius:20px;padding:5px 9px;background:var(--card);display:inline-flex;gap:5px;align-items:center}}
.chip b{{font-weight:600;color:var(--faint);font-size:10.5px}}
.chip:active{{border-color:var(--acc);color:var(--acc)}}
details.sec{{border-top:1px solid var(--line)}}
details.sec:first-of-type{{margin-top:10px}}
summary{{list-style:none;cursor:pointer;padding:15px 0 14px;display:flex;align-items:baseline;gap:10px}}
summary::-webkit-details-marker{{display:none}}
.sl{{font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:var(--ink);flex:none}}
.ss{{font-size:12px;color:var(--faint);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.sc{{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;flex:none;border:1px solid var(--line2);border-radius:20px;padding:1px 8px}}
details[open] .sl{{color:var(--acc)}}

/* level 3 — groups + rows */
.rows{{padding-bottom:10px}}
.grp{{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc);font-weight:700;padding:10px 0 2px}}
.grp:first-child{{padding-top:0}}
.row{{display:block;padding:10px 0 11px;border-top:1px solid var(--line)}}
.rows>.row:first-child,.grp+.row{{border-top:none}}
.rt{{display:flex;align-items:center;gap:7px;flex-wrap:wrap}}
.rn{{font-size:15px;font-weight:500;letter-spacing:-.005em}}
.rd{{display:block;font-size:12.5px;color:var(--mut);margin-top:2px;line-height:1.4;word-break:break-word}}
.ext{{color:var(--faint);font-size:12px}}
.nolink .rn{{color:var(--mut)}}
.tag{{font-style:normal;font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--acc);border:1px solid var(--acc);opacity:.85;border-radius:20px;padding:1.5px 6px;flex:none}}
.tag.t-L{{color:#b0702a;border-color:#b0702a}} .tag.t-D,.tag.t-P{{color:var(--faint);border-color:var(--line2)}} .tag.t-T{{color:var(--faint);border-color:var(--line2)}}
.row:active .rn{{color:var(--acc)}}
.crumb{{display:none;font-size:10.5px;color:var(--faint);letter-spacing:.02em;margin-bottom:2px}}
body.searching .crumb{{display:block}}
body.searching .panel{{display:block}} body.searching .phead,body.searching .chips,body.searching .tabs{{display:none}}
body.searching summary{{pointer-events:none}}
.hide{{display:none!important}}
.none{{display:none;color:var(--mut);padding:24px 0;font-size:14px}} body.searching.empty .none{{display:block}}
.foot{{color:var(--faint);font-size:11px;text-align:center;margin-top:34px;letter-spacing:.03em;line-height:1.7}}
@media(min-width:620px){{h1{{font-size:44px}}}}
</style></head><body><div class="wrap">
<header><div class="mark">Doug Brown · Second Nature</div><h1>Everything</h1><p class="lede"><b>{total} pages, apps, dashboards and files</b> across every business — sorted three levels deep. Pick a business, open a section, tap a row. Or just type.</p></header>
<div class="bar"><input id="q" type="search" autocomplete="off" placeholder="Search everything — payroll, Dennis, storm, Supabase…"><div class="tabs">{"".join(tabs)}</div></div>
<div id="panels">{"".join(panels_html)}</div>
<p class="none">Nothing matches. Try a shorter word.</p>
<p class="foot">Unlisted · noindex · updated {UPDATED}<br>Daily front door is <a href="ground-control-7c3f9a.html" style="color:var(--acc)">Ground Control</a> (/gc). This page is the full index behind it.<br>Locked pages decrypt in your browser; this page prints no passwords.</p>
</div>
<script>
(function(){{
 var tabs=[].slice.call(document.querySelectorAll('.tab')),panels=[].slice.call(document.querySelectorAll('.panel'));
 var ids=tabs.map(function(t){{return t.getAttribute('data-p')}});
 function show(p,push){{
  if(ids.indexOf(p)<0)p=ids[0];
  tabs.forEach(function(t){{t.classList.toggle('on',t.getAttribute('data-p')===p)}});
  panels.forEach(function(s){{s.classList.toggle('on',s.getAttribute('data-p')===p)}});
  try{{localStorage.setItem('hub-tab',p)}}catch(e){{}}
  if(push){{try{{history.replaceState(null,'','#'+p)}}catch(e){{}}}}
  var t=document.querySelector('.tab.on');if(t&&t.scrollIntoView)t.scrollIntoView({{block:'nearest',inline:'center'}});
 }}
 tabs.forEach(function(t){{t.addEventListener('click',function(){{show(t.getAttribute('data-p'),true);window.scrollTo({{top:0}})}})}});
 // section chips (level 2): open the section, then scroll to it
 document.querySelectorAll('.chip').forEach(function(c){{c.addEventListener('click',function(e){{
  var d=document.getElementById(c.getAttribute('data-sec'));if(d){{d.open=true}}
 }})}});
 // initial tab: #hash → section id → saved → first
 var h=(location.hash||'').replace('#','');var start=null;
 if(ids.indexOf(h)>-1)start=h;
 else if(h&&document.getElementById(h)){{var el=document.getElementById(h);var p=el.closest('.panel');if(p){{start=p.getAttribute('data-p');el.open=true;setTimeout(function(){{el.scrollIntoView({{block:'start'}})}},50)}}}}
 if(!start){{try{{start=localStorage.getItem('hub-tab')}}catch(e){{}}}}
 show(start||ids[0],false);
 // search (all levels, all tabs)
 var q=document.getElementById('q'),rows=[].slice.call(document.querySelectorAll('.row')),secs=[].slice.call(document.querySelectorAll('details.sec')),grps=[].slice.call(document.querySelectorAll('.grp'));
 rows.forEach(function(r){{var c=document.createElement('span');c.className='crumb';c.textContent=r.getAttribute('data-crumb');r.insertBefore(c,r.firstChild)}});
 var openState=null;
 q.addEventListener('input',function(){{
  var v=q.value.toLowerCase().trim();
  if(v&&!document.body.classList.contains('searching')){{openState=secs.map(function(d){{return d.open}});}}
  document.body.classList.toggle('searching',!!v);
  if(!v){{rows.forEach(function(r){{r.classList.remove('hide')}});grps.forEach(function(g){{g.classList.remove('hide')}});secs.forEach(function(d,i){{d.classList.remove('hide');if(openState)d.open=openState[i]}});document.body.classList.remove('empty');return;}}
  var any=false;
  rows.forEach(function(r){{var hit=(r.textContent+' '+(r.getAttribute('href')||'')).toLowerCase().indexOf(v)>-1;r.classList.toggle('hide',!hit);if(hit)any=true}});
  grps.forEach(function(g){{g.classList.add('hide')}});
  secs.forEach(function(d){{var vis=d.querySelectorAll('.row:not(.hide)').length;d.open=vis>0;d.classList.toggle('hide',vis===0)}});
  document.body.classList.toggle('empty',!any);
 }});
}})();
</script></body></html>'''
open(sys.argv[1],'w').write(page)
print("wrote",sys.argv[1],"items:",total,"bytes:",len(page))
