// src/drafts.js — v842
// One canonical helper for staging customer comms into `marketing_drafts`
// (status='pending'). The hard rule (May 19 2026 in MEMORY.md):
//
//   NEVER auto-send to clients. Any AI-staged email or SMS to a customer
//   must be reviewed + approved by Doug in-app before it actually leaves
//   BM. The Approve Comms card on the dashboard surfaces these drafts.
//
// Transactional auto-replies (booking confirmation, "we received your
// request") are EXEMPT — they were explicitly carved out by Doug ("you can
// leave some of the notifications like we had set for jobber"). This helper
// is only for AI / scheduled / bulk outreach.
//
// Callers: staleclients.js (90+d outreach), reviewtools.js (review request),
// marketing-automation edge fn (already uses this table directly). New
// AI-generated comm paths should go through here, not Email.send / Dialpad.sendSMS.
(function() {
  'use strict';

  function _tenantId() {
    try { return (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null; }
    catch (e) { return null; }
  }

  function _sb() {
    return (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
  }

  // Queue a single draft. Returns a Promise that resolves with {ok, error?, id?}.
  // Required: trigger, client_id OR (to_email OR to_phone), channel
  // Recommended: client_name, subject (email), body_text
  function queue(opts) {
    opts = opts || {};
    var sb = _sb();
    var tid = _tenantId();
    if (!sb || !tid) return Promise.resolve({ ok: false, error: 'No cloud sync — draft not queued' });
    var trigger = opts.trigger || 'manual_outreach';
    var channel = opts.channel || (opts.to_email ? 'email' : 'sms');

    // Dedup: if a non-rejected draft for the same (tenant, trigger, client_id)
    // already exists, don't insert a second one. The dedup_key column has a
    // unique index per (tenant_id, dedup_key) so a deterministic key blocks
    // duplicates at the DB level too.
    var dedupKey = opts.dedup_key || [trigger, opts.client_id || opts.to_email || opts.to_phone || 'na'].join(':');

    var row = {
      tenant_id: tid,
      trigger: trigger,
      source_record_type: opts.source_record_type || null,
      source_record_id: opts.source_record_id || null,
      client_id: opts.client_id || null,
      client_name: opts.client_name || null,
      to_email: opts.to_email || null,
      to_phone: opts.to_phone || null,
      channel: channel,
      subject: opts.subject || null,
      body_text: opts.body_text || opts.body || null,
      body_html: opts.body_html || null,
      status: 'pending',
      dedup_key: dedupKey,
      metadata: opts.metadata || null
    };

    return sb.from('marketing_drafts')
      .upsert(row, { onConflict: 'tenant_id,dedup_key' })
      .select('id')
      .then(function(r) {
        if (r && r.error) return { ok: false, error: r.error.message || String(r.error) };
        var id = (r && r.data && r.data[0] && r.data[0].id) || null;
        return { ok: true, id: id };
      })
      .catch(function(e) { return { ok: false, error: String(e) }; });
  }

  // Toast convenience for callers that want the standard "staged, go review" UX.
  function queueWithToast(opts) {
    return queue(opts).then(function(res) {
      if (res.ok) {
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast('Staged for review — open Approve Comms on Home to send', 'success');
        }
      } else {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('Draft failed: ' + res.error, 'error');
      }
      return res;
    });
  }

  // Batch helper for bulk-outreach paths. Returns Promise<{queued, failed}>.
  function queueMany(list) {
    list = Array.isArray(list) ? list : [];
    if (!list.length) return Promise.resolve({ queued: 0, failed: 0 });
    var queued = 0, failed = 0;
    return list.reduce(function(p, opts) {
      return p.then(function() {
        return queue(opts).then(function(res) {
          if (res.ok) queued++; else failed++;
        });
      });
    }, Promise.resolve()).then(function() {
      if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast('Staged ' + queued + ' draft' + (queued === 1 ? '' : 's')
          + (failed ? ' (' + failed + ' failed)' : '')
          + ' — open Approve Comms on Home to review', 'success');
      }
      return { queued: queued, failed: failed };
    });
  }

  window.Drafts = {
    queue: queue,
    queueWithToast: queueWithToast,
    queueMany: queueMany
  };
})();
