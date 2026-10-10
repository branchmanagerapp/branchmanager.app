# Meta App Review Submission Packet
**App:** Branch Manager (Second Nature Tree Service internal tool)
**Target networks:** Facebook Page, Instagram Business Account
**Date prepared:** April 23, 2026

---

## 1. Copy-Paste Fields

### App name
```
Branch Manager — Second Nature Tree
```

### App contact email
```
info@peekskilltree.com
```

### Privacy Policy URL
```
https://peekskilltree.com/branchmanager/privacy.html
```

### Terms of Service URL
```
https://peekskilltree.com/branchmanager/terms.html
```

### Data Deletion Instructions URL
```
https://peekskilltree.com/branchmanager/data-deletion.html
```

### App category
```
Business
```

### Business vertical
```
Home Services / Landscaping
```

### App domain
```
peekskilltree.com
```

### OAuth Redirect URI
```
https://peekskilltree.com/branchmanager/
```

---

## 2. App Description (short, ~150 chars)

```
Branch Manager is Second Nature Tree Service's internal CRM. It posts our completed-job photos and manages our own Facebook Page and Instagram feed.
```

## 3. App Description (long)

```
Branch Manager is a custom-built customer relationship and operations tool used exclusively by the staff of Second Nature Tree Service, a licensed and insured tree-service company based in Peekskill, NY. It manages clients, quotes, invoices, scheduling, and team coordination.

As part of its media workflow, Branch Manager connects to the company's own Facebook Page and Instagram Business account to:
  - Publish photos and captions of completed jobs directly to our own social profiles
  - Read comments and direct messages on our own posts so our team can respond from one place
  - Schedule posts for off-hours

This is not a consumer-facing app and is not distributed to users. Only authenticated employees of Second Nature Tree Service use it, and it only accesses business assets we own and administer. No end-user (customer) data flows into Facebook or Instagram via this integration.
```

---

## 4. Permissions We Request & Why

| Permission | Why we need it |
|---|---|
| `pages_show_list` | Select which of our own Pages to post to (we have one Page but Meta requires this scope to list and pick). |
| `pages_read_engagement` | Read our own Page's posts, comments, and insights so our team can respond without switching apps. |
| `pages_manage_posts` | Publish job-completion photos and updates to our own Page. |
| `pages_messaging` | Receive and reply to customer DMs that come to our own Page. |
| `instagram_basic` | Identify our own IG Business account linked to our Page. |
| `instagram_content_publish` | Publish job-completion photos to our own IG feed. |
| `instagram_manage_comments` | Reply to comments on our own IG posts. |
| `instagram_manage_messages` | Receive and reply to DMs on our own IG account. |

**We do NOT request:**
- `user_*` scopes — we don't access individual user profiles or friend lists.
- `ads_*` scopes — we're not managing paid advertising through this integration.
- `business_management` — we don't manage the Meta Business account structure.

---

## 5. Use-Case Narratives for Each Permission

### pages_manage_posts
> A crew finishes a big storm-damage removal in Cortlandt. On-site they snap 3 "after" photos with the Branch Manager app. Back at the office, the foreman opens BM → SocialBranch → Compose, selects those photos, types "Storm cleanup on Maple — always glad to help our neighbors. Call (914) 391-5233 for 24-hour emergency service." and taps Publish to Facebook. BM calls `POST /{page-id}/photos` with the image and caption, then confirms success.

### pages_read_engagement
> The next morning, three customers have commented on that post asking for similar service. BM pulls the comments via `GET /{post-id}/comments` and shows them to Doug in the SocialBranch Inbox alongside DMs and IG comments. He clicks "Reply" on each and sends a quoted response without leaving BM.

### pages_messaging
> A new prospect DMs the Page: "Can you come out to look at a leaning pine this week?" BM receives the webhook, creates a provisional request in the CRM linked to that DM, and lets Doug respond from the BM interface: "Absolutely — what's the address?"

### instagram_content_publish
> For visual jobs (climbs, rigging, crane removals) we post to our IG. Same flow as FB, just with `POST /{ig-user-id}/media` then `/media_publish`.

### instagram_manage_comments / manage_messages
> Mirror of the FB flows for our IG account. One unified inbox.

---

## 6. Test Credentials

Meta's review team requires valid test credentials. We'll provide:
- **Test Page:** (create a Meta test app in Dev Portal; it generates test pages/users that reviewers can use)
- **Test IG account:** linked to the test Page
- **Access instructions:** reviewers log into the Meta test user → click "Connect Facebook" in Branch Manager demo → authenticate via OAuth → land in SocialBranch.

Doug: create these via [developers.facebook.com → My Apps → Your App → Roles → Test Users].

---

## 7. Demo Video Script

**Length:** 2–3 min. Shot on iPhone screen recording. Voice-over on top.

**Shots:**

| Time | What's on screen | Narration |
|---|---|---|
| 0:00–0:10 | BM dashboard | "This is Branch Manager, the internal CRM we use to run Second Nature Tree Service. Today I'll show how we post to our company Facebook and Instagram from within the app." |
| 0:10–0:30 | Navigate to Settings → SocialBranch card → Connect Facebook | "First-time setup: click Connect Facebook. It opens Facebook's OAuth dialog. I sign in with our company admin account and grant Branch Manager the permissions listed in the dialog." |
| 0:30–0:50 | Facebook OAuth consent screen, then back to BM | "Facebook shows exactly what we're authorizing — post to our own Page, manage our own IG, read our own comments. I accept. Branch Manager now stores the access token." |
| 0:50–1:30 | SocialBranch → Compose | "Now the daily workflow. I type a caption, pick a photo from our Media Center — this is a tree-removal we finished this morning — select Facebook and Instagram, and hit Publish." |
| 1:30–1:50 | Confirmation toast + shot of actual FB Page showing the new post | "Here's the post live on our Facebook Page. Same photo appears on our Instagram feed." |
| 1:50–2:20 | SocialBranch → Inbox showing a comment | "A customer just commented. I read it in BM's inbox and reply — no switching apps." |
| 2:20–2:40 | SocialBranch → Calendar view with scheduled post | "We also schedule posts ahead of time. This one's queued for 8am tomorrow." |
| 2:40–3:00 | Closing shot of BM dashboard | "That's the entire Meta integration — internal use only, our own accounts, no customer data flows out. Thanks for reviewing." |

---

## 8. Business Verification

Meta will ask for business verification. Have ready:
- **EIN / Tax ID** (ask accountant if unsure)
- **Business license** (WC-32079 on file)
- **Utility bill or bank statement** showing "Second Nature Tree Service, LLC" at our address
- **Website** showing a working contact form (book.html ✅), valid privacy and terms links ✅
- **Domain ownership** — Meta will send a DNS TXT record to add to peekskilltree.com

**Domain TXT step:** Since peekskilltree.com is on Wix, you'll:
1. Log into Wix
2. Manage → Domains → DNS Records → Add TXT
3. Paste the record Meta gives you
4. Wait 10 min, click "Verify" on Meta's side

---

## 9. Step-by-Step Submission Checklist

- [ ] Go to [developers.facebook.com](https://developers.facebook.com) → log in with Doug's FB account that admins the Page
- [ ] My Apps → **Create App**
  - Type: **Business**
  - Name: `Branch Manager — Second Nature Tree`
  - Contact email: `info@peekskilltree.com`
- [ ] Dashboard → **Settings → Basic**:
  - Privacy Policy URL: `https://peekskilltree.com/branchmanager/privacy.html`
  - Terms of Service URL: `https://peekskilltree.com/branchmanager/terms.html`
  - Data Deletion URL: `https://peekskilltree.com/branchmanager/data-deletion.html`
  - App Domain: `peekskilltree.com`
  - Category: Business
  - Upload app icon (1024×1024 — use the tree logo)
- [ ] **Add Product → Facebook Login**
  - Settings → Valid OAuth Redirect URIs: `https://peekskilltree.com/branchmanager/`
- [ ] **Add Product → Instagram Graph API**
- [ ] **App Review → Permissions and Features** → request each permission from §4 above. For each, paste the use-case narrative from §5.
- [ ] Upload the demo video.
- [ ] **Business Verification** (Business Manager → Security Center → Verify business).
- [ ] **Submit for review.**

---

## 10. Expected Timeline

- **App creation + config:** 30 min
- **Business verification:** 2–5 business days (Meta reviews documents)
- **App Review:** 5–10 business days after business verification completes
- **Total:** plan for 2 weeks from submission to approval

During the review window, the webhook fallback in SocialBranch keeps you posting through SocialPilot, so there's no downtime.

---

## 11. After Approval

Once approved, Branch Manager code needs:
1. **Meta OAuth client ID + secret** added to `supabase/functions/meta-oauth/` edge function
2. Replace the webhook routing in `socialbranch.js` `_publishNow()` with direct Graph API calls
3. Wire the `/{page-id}/photos` and `/{ig-user-id}/media` endpoints
4. Handle token refresh (Meta tokens are short-lived)

I'll do all of that when the time comes. For now: get the submission in.
