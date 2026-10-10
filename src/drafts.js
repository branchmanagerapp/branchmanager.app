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

  // ── v1068: Jobber-style preview-before-send modal ─────────────────────────
  // Shows exactly what the customer will receive (rendered HTML in a sandboxed
  // iframe) with editable To + Subject; nothing sends until the final Send tap.
  // Used by the record-page draft banner below AND InvoicesPage._sendInvoiceEmail.
  var _previewCtx = null;

  function previewEmail(opts) {
    // opts: { to, subject, html, sendLabel?, onSend(to, subject) }
    _previewCtx = opts || {};
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
    var html = ''
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      +   '<div>'
      +     '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">To</label>'
      +     '<input id="drafts-prev-to" type="email" value="' + esc(opts.to || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      +   '</div>'
      +   '<div>'
      +     '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">Subject</label>'
      +     '<input id="drafts-prev-subject" type="text" value="' + esc(opts.subject || '') + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      +   '</div>'
      +   '<div>'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">What the customer sees</div>'
      +     '<iframe id="drafts-prev-frame" sandbox="" style="width:100%;height:52vh;border:1px solid var(--border);border-radius:10px;background:#fff;box-sizing:border-box;"></iframe>'
      +   '</div>'
      +   '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      +     '<button type="button" class="btn btn-primary" onclick="Drafts._previewSend()" style="flex:1;min-width:150px;padding:13px;font-size:15px;font-weight:800;background:#2e7d32;color:#fff;border:none;border-radius:10px;cursor:pointer;">' + esc(opts.sendLabel || '📤 Send') + '</button>'
      +     '<button type="button" class="btn btn-outline" onclick="UI.closeModal()" style="flex:0 0 auto;padding:13px 18px;font-size:14px;border-radius:10px;cursor:pointer;">Cancel</button>'
      +   '</div>'
      + '</div>';
    UI.showModal('Review before sending', html, { keepModal: true });
    // srcdoc set via JS (not attribute) so the email HTML needs no escaping
    setTimeout(function() {
      var f = document.getElementById('drafts-prev-frame');
      if (f) f.srcdoc = _previewCtx.html || '<p style="font-family:sans-serif;color:#666;">(no preview available)</p>';
    }, 60);
  }

  function _previewSend() {
    var ctx = _previewCtx;
    if (!ctx || typeof ctx.onSend !== 'function') { UI.closeModal(); return; }
    var to = (document.getElementById('drafts-prev-to') || {}).value || ctx.to;
    var subj = (document.getElementById('drafts-prev-subject') || {}).value || ctx.subject;
    if (!to || to.indexOf('@') === -1) { UI.toast('Enter a valid email address', 'error'); return; }
    UI.closeModal();
    ctx.onSend(to.trim(), subj);
    _previewCtx = null;
  }

  // ── v1068: pending-draft banner on the record it belongs to ───────────────
  // Doug (Jul 25 2026): staged emails must be reviewable from the invoice/quote
  // itself, not hidden under Marketing. Call after a detail page renders; it
  // prepends a banner into #pageContent only when a pending draft points at
  // this record. Approve/Reject reuse MarketingPage's functions (single queue).
  function renderPendingBanner(recordType, recordId) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tid = _tenantId();
    if (!sb || !tid || !recordId) return;
    sb.from('marketing_drafts').select('*')
      .eq('tenant_id', tid).eq('status', 'pending')
      .eq('source_record_type', recordType).eq('source_record_id', recordId)
      .order('created_at', { ascending: false })
      .then(function(r) {
        var drafts = (r && r.data) || [];
        var host = document.getElementById('pageContent');
        var old = document.getElementById('bm-record-draft-banner');
        if (old) old.remove();
        if (!drafts.length || !host) return;
        _bannerCache = {};
        var esc = UI.esc;
        var box = document.createElement('div');
        box.id = 'bm-record-draft-banner';
        box.innerHTML = drafts.map(function(d) {
          _bannerCache[d.id] = d;
          return '<div style="background:#fff8e1;border:1px solid #ffcc80;border-radius:12px;padding:14px 16px;margin-bottom:14px;">'
            + '<div style="font-size:12px;font-weight:800;color:#7e2d10;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">📧 Email awaiting your review</div>'
            + '<div style="font-size:14px;font-weight:700;margin-bottom:2px;">' + esc(d.subject || '(no subject)') + '</div>'
            + '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;">To: ' + esc(d.to_email || '—') + '</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
            +   '<button type="button" onclick="Drafts._bannerReview(\'' + d.id + '\')" style="flex:1;min-width:140px;background:#2e7d32;color:#fff;border:none;border-radius:9px;padding:11px 14px;font-size:14px;font-weight:800;cursor:pointer;">👁 Review &amp; Send</button>'
            +   '<button type="button" onclick="Drafts._bannerReject(\'' + d.id + '\')" style="flex:0 0 auto;background:none;border:1px solid var(--border);border-radius:9px;padding:11px 14px;font-size:13px;cursor:pointer;color:var(--text);">Reject</button>'
            + '</div>'
            + '</div>';
        }).join('');
        host.insertBefore(box, host.firstChild);
        box._ctx = { recordType: recordType, recordId: recordId };
      });
  }

  var _bannerCache = {};

  function _bannerReview(draftId) {
    var d = _bannerCache[draftId];
    if (!d) { UI.toast('Draft not found — reload the page', 'error'); return; }
    previewEmail({
      to: d.to_email,
      subject: d.subject,
      html: d.body_html || ('<pre style="font-family:sans-serif;white-space:pre-wrap;padding:16px;">' + UI.esc(d.body_text || '') + '</pre>'),
      sendLabel: '📤 Approve & Send',
      onSend: function(to, subj) {
        var patched = Object.assign({}, d, { to_email: to, subject: subj });
        if (typeof MarketingPage !== 'undefined' && MarketingPage.approveDraft) {
          MarketingPage.approveDraft(d.id, patched);
          var banner = document.getElementById('bm-record-draft-banner');
          var ctx = banner && banner._ctx;
          setTimeout(function(){ if (ctx) renderPendingBanner(ctx.recordType, ctx.recordId); else if (banner) banner.remove(); }, 1500);
        } else {
          UI.toast('Approve unavailable — use Marketing > Drafts to Review', 'error');
        }
      }
    });
  }

  function _bannerReject(draftId) {
    if (typeof MarketingPage === 'undefined' || !MarketingPage.rejectDraft) return;
    MarketingPage.rejectDraft(draftId);
    var banner = document.getElementById('bm-record-draft-banner');
    var ctx = banner && banner._ctx;
    setTimeout(function(){ if (ctx) renderPendingBanner(ctx.recordType, ctx.recordId); else if (banner) banner.remove(); }, 800);
  }

  window.Drafts = {
    queue: queue,
    queueWithToast: queueWithToast,
    queueMany: queueMany,
    previewEmail: previewEmail,
    renderPendingBanner: renderPendingBanner,
    _previewSend: _previewSend,
    _bannerReview: _bannerReview,
    _bannerReject: _bannerReject
  };
})();
