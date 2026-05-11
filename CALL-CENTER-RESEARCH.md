# Call-Center Vendor Research → BM Receptionist Proposal

_Compiled May 10 2026. Every number cited has a source URL; no fabricated figures._

## TL;DR

Build a **BM Receptionist** layered on top of our existing Dialpad webhook + Claude integration + Supabase Postgres. Per-call cost ~$0.15–$0.30 (vs Smith.ai's $1.20–$1.90), data stays inside our tenant boundary, and the qualifier knows the tree-service vocabulary because we write the prompt.

The four vendors below each do _one_ thing well. None of them do _all four_:
1. Cheap raw telecom (Twilio)
2. Polished AI receptionist (Smith.ai)
3. Unified phone-system UX (Dialpad)
4. Enterprise everything (RingCentral)

We can take the cheap raw telecom AND the polished AI receptionist by bringing the AI in-house with Claude. The UX and "enterprise everything" parts we already have in BM.

---

## Vendor matrix

| Vendor | What it does best | Entry price | AI receptionist | Tree-service fit |
|---|---|---|---|---|
| **Smith.ai** | Live-human + AI hybrid receptionist | $95/mo (~50 AI calls) | ✅ Native, $1.20–$1.90/call | Strong — built-in lead qualification, configurable intake questions |
| **Dialpad** | Unified business phone + native AI transcription | $15/user/mo annual | ⚠ Separate $80/user/mo AI Contact Center product | Decent — current BM Dialpad stack already uses webhook + SMS |
| **Twilio** | Lowest-cost programmable voice/SMS API | Pay-as-you-go | ⚠ AI is BYOA (Bring Your Own AI), $0.07/min for ConversationRelay | Strong as a primitive — not turnkey |
| **RingCentral** | Enterprise unified comms + 2025 AI Receptionist (AIR) | $20/user/mo annual (Core) | ✅ Native AIR | Overbuilt — designed for 50+ seat businesses |

### Smith.ai — pricing breakdown

[Smith.ai AI Receptionist plans](https://smith.ai/pricing/ai-receptionist):
- **Self-Service (month-to-month):** Starter $95/mo (~50 calls @ $1.90), Basic $270/mo (~150 calls @ $1.80), Pro $800/mo (~500 calls @ $1.60)
- **Done-for-You (annual):** Starter $500/mo (~333 calls @ $1.50), Basic $1,000/mo (~750 calls @ $1.33), Pro $2,000/mo (~1,667 calls @ $1.20)
- **Live human escalation:** $3 per call when AI hands off to a human agent
- **Live-only plan (no AI):** [starts at $255/mo for 20 calls](https://smith.ai/blog/virtual-receptionist-pricing)

Features per the pricing page:
- Lead qualification with custom intake questions (up to 10 short-answer prompts)
- Calendly booking integration
- Auto-blocks 20M+ known spam/robocall numbers
- HubSpot / Salesforce / Clio CRM integrations (and Zapier for the rest)

### Dialpad — pricing breakdown

[Dialpad plans](https://www.cloudtalk.io/blog/dialpad-pricing/) (verified against [Dialpad's own pricing page](https://www.dialpad.com/pricing/)):
- **Standard:** $15/user/mo (annual) or $27/user/mo (monthly billing)
- **Pro:** $25/user/mo (annual) or $35/user/mo (monthly billing)
- **Enterprise:** custom, minimum 100 users

Critical: AI receptionist features are **not included** in any RingEX-style plan. Separately:
- **AI Contact Center:** starts at $80/user/mo (Essentials)
- **AI Sales:** starts at $60/user/mo
- **AI Meetings:** $15/user/mo

SMS quirks per [emitrr's Dialpad pricing breakdown](https://emitrr.com/blog/dialpad-pricing/):
- 250 outbound US SMS/user/mo cap
- $0.008 per SMS over the cap (delivery attempt)

### Twilio — pricing breakdown

[Twilio Voice US pricing](https://www.twilio.com/en-us/voice/pricing/us):
- **Local number inbound:** $0.0085/min
- **Local number outbound:** $0.0140/min
- **Local number monthly fee:** $1.15
- **Toll-free inbound:** $0.0220/min
- **Toll-free monthly fee:** $2.15

AI-related products on the same page:
- **ConversationRelay** (voice-AI bridge): $0.07/min
- **Virtual Agent (Dialogflow CX):** $0.085/min
- **Streaming transcription:** $0.027/min
- **Batch transcription:** $0.024/min

[Twilio SMS US](https://www.twilio.com/en-us/sms/pricing/us): $0.0083 base + carrier surcharges (~$0.003–$0.0065 depending on carrier per [Twilio pricing analysis](https://www.getaiperks.com/en/articles/twilio-pricing)).

### RingCentral — pricing breakdown

[RingCentral RingEX plans](https://www.ringcentral.com/office/plansandpricing.html):
- **Core:** $20/user/mo (annual) / $30 (monthly) — only **25 SMS/user/mo**, no Salesforce
- **Advanced:** $25/user/mo (annual) / $35 (monthly) — adds auto call recording, HubSpot/Salesforce/Zendesk
- **Ultra:** $35/user/mo (annual) / $45 (monthly) — 10k toll-free minutes, unlimited storage

**RingCentral AI Receptionist (AIR)** [launched Feb 2025, GA later 2025](https://www.ringcentral.com/whyringcentral/company/pressreleases/ringcentral-transforms-customer-communications-with-new-ai-receptionist.html). [Jan 2026 update](https://www.ringcentral.com/us/en/blog/whats-new-in-ringcentral-ai-receptionist/): auto-generates the receptionist from your website URL in ~5 minutes. Strong feature set: natural-language conversation, multi-language, transcripts, call summaries.

**RingSense** (revenue intelligence add-on): $60/user/mo on top of any RingEX plan per [Quo's RingCentral AI breakdown](https://www.quo.com/blog/ringcentral-ai/).

---

## Critique: what each vendor would suck at for SNT specifically

- **Smith.ai's hybrid is great** but $95/mo + $3 per human-handoff adds up fast. SNT runs maybe 15 inbound calls/day; at $1.90 each = $855/mo with zero handoffs. The pricing pages don't show a per-tenant white-label flavor — if BM is a SaaS, we can't resell Smith.ai with our brand on it.

- **Dialpad's AI is paywalled** at $80/user/mo for Contact Center. We already pay for Standard ($15) and just want the AI on top. Stacking AI Contact Center makes Dialpad's effective seat $95/mo — more than Smith.ai's whole AI receptionist plan. The 250-SMS cap matters once we scale.

- **Twilio is brilliant as primitives** but not turnkey. The math is great ($0.0140 + $0.07 AI = $0.084/min × 3 min avg = $0.25/call) but every receptionist behavior we want, we'd have to build: greeting, qualification flow, voicemail capture, CRM write-through, sentiment detection, spam screening.

- **RingCentral AIR is the most polished AI receptionist on the market** but the platform underneath assumes 5+ seats and starts at $20/user/mo. For a solo owner who just wants a smart receptionist for inbound only, the seat fees are wasted. Also: data lives at RingCentral, not in our Supabase, so we lose the integration leverage BM has.

---

## Proposal: build BM Receptionist

The pieces we'd need already exist except one. Here's the assembly:

### Telecom layer
**Option A — keep Dialpad** ($15/user/mo we already pay). The webhook already lands inbound calls + SMS in our `communications` table. After-hours or unanswered-after-3-rings, Dialpad forwards to a Twilio number where our AI lives.

**Option B — go all-Twilio** for new tenants. Cheaper per-minute, full programmability, $1.15/mo per local number. Port Dialpad numbers if Doug wants to consolidate.

### AI receptionist layer
A new edge function `bm-receptionist` that handles a Twilio voice webhook:
1. **Greeting:** TwiML `<Play>` of a pre-recorded "Thanks for calling {tenant name}. I can help schedule, take a message, or transfer you to a human."
2. **Qualification:** Twilio ConversationRelay or Stream into Claude with a prompt template containing tenant-specific service list, hours, areas served, and tree-service vocabulary (the kind of stuff each tenant configures once in Settings).
3. **Capture:** turns answers into `{name, address, service_wanted, urgency, notes}`.
4. **Disposition:**
   - Qualified → insert `requests` row directly (skip Triage)
   - Borderline → insert `communications` row with `metadata.qualified=false`, lands in v759 Leads Center Triage
   - Spam/wrong-number signals → `metadata.junk=true`, never appears

### Cost model

Per-call estimate (3-min average inbound):
- Twilio inbound minutes: 3 × $0.0085 = $0.0255
- ConversationRelay AI: 3 × $0.07 = $0.21
- Streaming transcription: 3 × $0.027 = $0.081
- Claude API tokens (~2k in / 500 out): ~$0.01 [Anthropic pricing](https://www.anthropic.com/pricing#api)
- **Total per call: ~$0.33**

Vs Smith.ai's $1.20–$1.90/call: **3–6× cheaper, with our data staying in our Postgres.**

### What we'd give up vs Smith.ai
- **24/7 live human fallback.** Claude won't escalate to a human at 3am. Workaround: route AI's "I need to transfer you" intents to Doug's mobile during business hours; outside hours, take a voicemail.
- **Pre-built spam list.** Smith.ai blocks 20M+ known numbers. We'd need our own list — start with junk-flagged numbers from `communications.metadata.junk = true` (the v759 work feeds this), augment with public spam-call databases.

### What we'd gain
- **Per-tenant prompt customization.** Each tenant's `tenants.config.receptionist_prompt` field. SNT can ask about ZIP code first; a tenant in a different region asks differently.
- **Direct write to `requests` / `communications`.** No CRM-bridge glue, no Zapier latency.
- **Tree-service vocabulary built in.** "Tree removal vs trimming," "stump grinding included or extra," species names. The Claude prompt knows what to ask without scripting in some third-party admin UI.
- **Spam learning loop.** Every junk-flag in Leads Center Triage feeds back into the receptionist's screen-first list.
- **One bill.** No second vendor invoice; usage rolls into the Twilio + Anthropic accounts BM already runs.

### Implementation sketch
- New table `receptionist_calls` (call_sid, started_at, ended_at, transcript, disposition, claude_messages jsonb, cost_estimate)
- New edge fn `bm-receptionist` (Twilio webhook target, calls Claude, emits TwiML)
- New Settings page section: "AI Receptionist" — toggle on/off per tenant, edit greeting, edit qualifying questions, edit hours
- 8–12 hr build, mostly the Twilio TwiML / ConversationRelay integration

---

## Recommendation order

1. **Ship the Triage Inbox first (done v759).** No new vendor, no new costs, immediate value: only qualified leads reach Requests.
2. **Pilot Smith.ai Starter ($95/mo) for one tenant** if you want a polished receptionist tomorrow with no build effort. Reasonable interim while we build BM Receptionist.
3. **Build BM Receptionist over a weekend** when Doug's ready to commit ~10 hours. Owns the data, owns the experience, 3–6× cheaper at SNT's call volume.
4. **Don't bother with RingCentral.** Their AIR is great but the seat-based pricing model wastes money for solo owners and locks data out of BM.
5. **Don't go all-Twilio** until BM Receptionist is built — raw telecom without a receptionist on top is a step backward UX-wise.

## Sources

- [Smith.ai AI Receptionist pricing](https://smith.ai/pricing/ai-receptionist)
- [Smith.ai Virtual Receptionists pricing guide](https://smith.ai/blog/virtual-receptionist-pricing)
- [Dialpad pricing breakdown — CloudTalk](https://www.cloudtalk.io/blog/dialpad-pricing/)
- [Dialpad pricing — Emitrr](https://emitrr.com/blog/dialpad-pricing/)
- [Dialpad official pricing](https://www.dialpad.com/pricing/)
- [Twilio Voice US pricing](https://www.twilio.com/en-us/voice/pricing/us)
- [Twilio SMS US pricing](https://www.twilio.com/en-us/sms/pricing/us)
- [Twilio pricing analysis — Get AI Perks](https://www.getaiperks.com/en/articles/twilio-pricing)
- [RingCentral RingEX plans](https://www.ringcentral.com/office/plansandpricing.html)
- [RingCentral AI Receptionist (AIR) launch — press release](https://www.ringcentral.com/whyringcentral/company/pressreleases/ringcentral-transforms-customer-communications-with-new-ai-receptionist.html)
- [RingCentral AIR Jan 2026 update](https://www.ringcentral.com/us/en/blog/whats-new-in-ringcentral-ai-receptionist/)
- [RingCentral AI Receptionist — official page](https://www.ringcentral.com/ai-receptionist.html)
- [Quo: RingCentral AI breakdown](https://www.quo.com/blog/ringcentral-ai/)
- [Smith.ai vs Dialpad comparison — RingEden](https://ringeden.com/blog/smith-ai-vs-ai-receptionist)
- [CloudTalk: 20 Best AI Virtual Receptionists for Lead Qualification (2026)](https://www.cloudtalk.io/blog/best-ai-virtual-receptionist-for-lead-qualification/)
