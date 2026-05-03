# App Store Submission Checklist

Owner: Doug · Started: May 2 2026 · Bundle: `app.branchmanager.bm` · Version: 1.0.0 (572)

## Phase A — Project / assets (autonomous, ✅ done in v572 commit)

- [x] iOS Capacitor project synced with v572 bundle
- [x] Full app icon set generated (19 sizes for iPhone + iPad + marketing)
- [x] Splash screens generated
- [x] Bundle version pinned: MARKETING_VERSION=1.0.0, CURRENT_PROJECT_VERSION=572
- [x] Info.plist permission strings present (camera/photo/location/contacts/microphone)
- [x] capacitor.config.json points at https://branchmanager.app (live PWA mode)

## Phase B — Apple Developer Program (Doug's hands required)

### Enrollment (skip if already enrolled)
- [ ] Apple Developer Program: $99/yr at https://developer.apple.com/programs/
  - Use the same Apple ID as the one signed into Xcode on the build Mac
  - Individual membership is fine for "Branch Manager" — Org membership ($299) only needed if multiple developers / business name required
- [ ] Wait for Apple to approve enrollment (~24-48h)

### App Store Connect setup (after enrollment)
- [ ] Sign into https://appstoreconnect.apple.com with the same Apple ID
- [ ] **My Apps → +** → New App
  - Name: **Branch Manager**
  - Primary language: English (U.S.)
  - Bundle ID: select `app.branchmanager.bm` (auto-registered when you first archive in Xcode)
  - SKU: `BM-001`
  - User Access: Full Access

### Bundle ID + signing (in Xcode)
- [ ] Open `ios/App/App.xcodeproj` in Xcode
- [ ] Project navigator → App target → Signing & Capabilities
- [ ] Team: select your developer team (auto-creates provisioning profile)
- [ ] If "Failed to register bundle identifier" — Apple Developer → Identifiers → "+" → App ID → `app.branchmanager.bm`

## Phase C — Listing content

### Screenshots (required)
- [ ] **6.7" iPhone** (iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max): 1290×2796 — at least 2, up to 10
- [ ] **6.5" iPhone** (iPhone 14 Plus / 11 Pro Max): 1242×2688 OR 1284×2778
- [ ] **iPad 13"** (iPad Pro 13"): 2064×2752 — required if app supports iPad
- [ ] Easiest path: open simulator (iPhone 16 Pro Max) → run app → Cmd+S to save screenshot
- [ ] Capture 5+ screens: Dashboard, Schedule, Quote builder, Property map, Payment

### Promotional copy
- [ ] **Subtitle (30 chars)**: "Tree Service Operations Hub"
- [ ] **Promotional text (170 chars, can update without re-review)**:
      "All-in-one ops platform for tree service companies — schedule, quote, invoice,
       track crews via GPS, manage clients, fleet & tools."
- [ ] **Description (4000 chars)**: see template at end of this doc
- [ ] **Keywords (100 chars, comma-sep)**:
      `tree service,arborist,landscaping,job scheduling,invoicing,crew tracking,quotes,B2B`
- [ ] **Category**: Primary = Business; Secondary = Productivity
- [ ] **Support URL**: https://branchmanager.app
- [ ] **Marketing URL** (optional): https://branchmanager.app/compare-jobber.html
- [ ] **Privacy Policy URL**: https://peekskilltree.com/privacy-policy.html

### Privacy nutrition label (App Privacy section)
Apple uses this to show the "Data Collected" section on the App Store. Be honest.

- [ ] **Contact Info** → Name, Email, Phone, Physical Address — **Linked to user, used for App Functionality**
- [ ] **Location** → Precise Location — **Linked to user, used for App Functionality**
       (BM uses GPS for crew tracking + property mapping)
- [ ] **User Content** → Photos — **Linked to user, used for App Functionality**
- [ ] **Identifiers** → User ID — **Linked to user, used for App Functionality**
- [ ] **Usage Data** → Product Interaction — **Linked to user, used for Analytics** (Sentry crash reports)
- [ ] **Diagnostics** → Crash Data, Performance Data — **Not linked, used for App Functionality**

NO data is sold or shared with third parties for advertising. Stripe handles payment cards (we don't store them). Resend handles email delivery (we send addresses to them).

### Age rating
- [ ] Run questionnaire — answer "None" to all (no violence, no profanity, no gambling, no medical info, etc.)
- [ ] Result: 4+

### App Review Information (CRITICAL — skipping these = instant reject)
- [ ] **Sign-in Required**: Yes
- [x] **Demo account credentials** — created May 3 2026:
      Email:    `apple-reviewer@branchmanager.app`
      Password: `XLRAHksa64dBh1PImhCji4`
      Tenant:   Demo Tree Service (id `e7aa9287-8d56-4195-b54e-67ddc7737a52`, slug `demo`)
      Role:     owner of demo tenant (full read/write inside that sandbox)
      Auth uid: `09d5cfa2-0b26-4c6d-914b-d431a6dc7c34`
      ⚠️ Demo tenant currently has no seed data. Either populate it before
         submitting (recommended: copy a few clients/jobs/quotes from SNT
         and run a UPDATE to retag tenant_id, OR have Doug add 5-10 demo
         entries via the BM UI signed in as the reviewer) or include this
         in the Apple Reviewer Notes: "The demo tenant is empty by design;
         use the +Add buttons throughout to test create/edit flows."
- [ ] **Notes for reviewer**:
      "Branch Manager is a B2B operations platform for tree service companies.
       Sign in with the demo credentials above. The demo tenant is pre-populated
       with sample clients, quotes, jobs, and routes. Test scheduling by creating
       a job, test quoting by drafting a quote and approving via the customer
       portal link, test crew GPS via the Operations → Map tab.

       Multi-tenant architecture: each tree service company has isolated data
       via Supabase Row-Level Security. The demo account is scoped to a
       sandbox tenant. Real customers self-onboard via the company website."
- [ ] **Contact info**: your name + email + phone (Apple may call about issues)

## Phase D — Build + submit

### Test build (before review)
- [ ] In Xcode: Product → Destination → Any iOS Device (arm64)
- [ ] Product → Archive
- [ ] When done: Window → Organizer → select archive → Distribute App → App Store Connect → Upload
- [ ] Wait for processing (10-30 min)
- [ ] In App Store Connect → TestFlight → add internal testers (yourself + crew)
- [ ] Install via TestFlight, USE THE APP daily for 3-7 days, fix any crashes
- [ ] Sentry will show any crashes that happen in TestFlight

### Submit
- [ ] App Store Connect → App Store tab → "+ Version or Platform" → 1.0.0
- [ ] Attach the build that's been TestFlight tested
- [ ] Fill in Version Information (description, screenshots, promo, privacy URL)
- [ ] App Review Information (demo credentials!)
- [ ] Submit for Review
- [ ] Wait 24-72h for review

### After approval
- [ ] Manually release OR auto-release on approval
- [ ] Monitor Sentry for first-week crash spike
- [ ] Respond to early App Store reviews

## Phase E — Common rejection reasons (avoid)

1. **Guideline 4.2 Minimum Functionality** — "this is just a website wrapper"
   - **Mitigation**: app uses Camera, GPS, Photos natively. Highlight in description.
2. **Guideline 5.1.1(v) Account Sign-in** — sign-in required without demo credentials
   - **Mitigation**: Demo account in App Review Information.
3. **Guideline 2.3.10 Accurate Metadata** — screenshots don't match app
   - **Mitigation**: Take screenshots from the actual running app.
4. **Guideline 1.5 Developer Information** — no support URL or contact
   - **Mitigation**: branchmanager.app live, support email visible.
5. **Multi-tenant SaaS confusion** — "this looks like multiple businesses sharing one app"
   - **Mitigation**: Frame as "B2B platform" in description; demo only ONE tenant.

---

## App Store description (4000-char template)

```
Branch Manager is the all-in-one operations platform built specifically for
tree service companies. From the first phone call to the final invoice,
Branch Manager keeps your crew, customers, and equipment in sync.

## SCHEDULING
- Drag-and-drop weekly schedule
- Auto-routing to minimize drive time
- Crew assignment with skill matching
- Real-time GPS crew tracking on a live map

## QUOTING
- Photo-based property estimation
- AI-assisted tree identification (PlantNet)
- Send quotes via text or email
- Customers approve in one tap, no login required

## CLIENT MANAGEMENT
- Property history with before/after photos
- Tree inventory per property
- Service area mapping (Google Maps integration)
- Auto-detect repeat work locations from GPS

## INVOICING & PAYMENTS
- Generate professional PDF invoices
- Stripe integration: customers pay online (cards or ACH)
- Automatic receipt emails
- Payment plans + financing links

## CREW & FLEET
- Pre-trip vehicle inspections (DOT compliance)
- OBD-II GPS via Bouncie integration
- Equipment tracking (chainsaws, chippers, trucks)
- Maintenance scheduling

## COMMUNICATIONS
- Two-way SMS via Dialpad integration
- Email tracking (delivered, opened, replied)
- Call recording + voicemail transcription
- Lead inbox with auto-routing

## CUSTOMER PORTAL
- Branded portal for clients to view quotes/invoices/job history
- Pay any unpaid invoice
- Schedule next service
- Photo gallery of past work

## MARKETING
- Automated review requests after job completion
- Quote follow-ups + upsell emails
- Email/SMS blast campaigns
- Lead capture forms for your website

## INTEGRATIONS
Stripe · Resend · Dialpad · Bouncie · PlantNet · Google Maps · Cloudflare ·
Supabase · OpenStreetMap · USGS Elevation API

Branch Manager is built by a working tree service operator, not a software
company. Every feature exists because we needed it. We don't sell your data.
We don't run ads.

Privacy: https://peekskilltree.com/privacy-policy.html
Terms:   https://peekskilltree.com/terms-of-service.html
```
