# Sarah rollout — phased, de-risk order (locked Jun 7 2026)

Decision: prove the cheap/reversible parts first; live local voice is LAST.
Each phase has a hard exit criterion. Don't start a phase until the prior one's
exit is met.

## Phase 0 — Data spine, zero telephony  ✅ DONE (Jun 7 2026)
Proved dedupe → lead write against REAL Second Nature data, no phone.

Steps:
- [x] Authenticated Sarah as an SNT tenant user (provisioning/sarah_agent_user.sql).
      RLS scopes her to Second Nature (sees exactly SNT's 545 clients).
- [x] Live READ-ONLY dedupe: signed in, matched a real client by phone
      (existing → attach; unknown → fresh lead).
- [x] Controlled live write: inserted a TEST `requests` row (status='new',
      correct tenant) → read back → deleted + verified gone. No SMS fired.
- [x] Schema correction: live `requests` has NO `service` column — service value
      goes in `title`. Fixed leads_tool.py / sarah.toml / README. selftest green.

Exit MET. Spine proven end-to-end against the live DB.

Note: Sarah's password currently lives ONLY in /tmp/.sarah_pw (Doug declined
config.toml). Needs a real home (config.toml or a secret manager) before Phase 1.

## Phase 1 — Voice on a proven brain
Stand up the phone channel and hear a real call before trusting a local model.
- [ ] Twilio number → Jarvis → Sarah.
- [ ] Brain = whatever is fastest/most-proven to validate the EXPERIENCE
      (cloud is fine here — this phase is about the call, not the model).
- [ ] Caller-ID pass-through tested (Dialpad overflow preserves caller number).
- [ ] Tune the locked script against real call feel + latency.

Exit: a test call captured a correct lead, the script feels human, latency is OK.

## Phase 2 — Local brain on the Mac Mini
Only now swap to local inference (the original OpenJarvis goal).
- [ ] Change [model] in sarah.toml/jarvis.toml to the local engine.
- [ ] Measure round-trip latency (STT → model → TTS) and TTS naturalness —
      the real "do they clock her as AI" bar.
- [ ] Fallback wired: if the Mac is down, Dialpad overflow → voicemail (or the
      dormant bm-receptionist) so no call is ever dropped.

Exit: local matches the cloud quality/latency bar. Cutover.

## Scope assumption (confirm, not blocking)
Sarah answers OVERFLOW-ONLY + after-hours to start — i.e. only calls Catherine
misses or that come in off-hours. Every one she catches is a call that would've
been lost, so the bar is "better than voicemail," not "better than Catherine."
Widen later if it's working.

## Notifications
SMS primary (Twilio → tenants.config.owner_alert_phones = Doug + Catherine).
Slack only added as a SECOND channel if the team actually lives in Slack.
