/**
 * BMUpload — shared Storage upload helper.
 * Returns { url, path } on success. Uses job-photos bucket so we don't
 * need a new RLS setup. Caller chooses the prefix (e.g. "vehicle-docs/<id>"
 * or "permit-docs/<id>") to keep things organized.
 */
var BMUpload = {
  uploadFile: async function(file, prefix) {
    if (!file) throw new Error('No file selected');
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client || !SupabaseDB.ready) {
      throw new Error('Supabase not connected — sign in and retry');
    }
    var BUCKET = (typeof Photos !== 'undefined' && Photos.BUCKET) ? Photos.BUCKET : 'job-photos';
    var safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = (prefix || 'misc').replace(/^\/+|\/+$/g, '') + '/' + Date.now() + '_' + safeName;
    var up = await SupabaseDB.client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (up.error) throw up.error;
    var pub = SupabaseDB.client.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub && pub.data && pub.data.publicUrl, path: path };
  }
};

/**
 * ExpiringDocsAlert — dashboard banner for insurance / permit / vehicle
 * documents within 30 days of expiry. Mirrors the v760 SalesTaxCounter
 * pattern (red ≤7 days, amber ≤30 days, hidden otherwise).
 *
 * Pulls from three sources and merges:
 *   1. compliance_documents_with_status (cloud, status='expired'|'expiring_soon')
 *   2. vehicle_documents (cloud, expires_date)
 *   3. job_permits (cloud, expires_at)
 *
 * Each pull is best-effort — if a table doesn't exist yet or the query
 * fails, we just skip that bucket. Banner never blocks dashboard render.
 *
 * v764.
 */
var ExpiringDocsAlert = {
  _cache: null,
  _loadInFlight: false,

  // Reused by the dashboard render. Returns banner HTML or '' to hide.
  renderBanner: function() {
    // Kick a lazy fetch — first call returns empty, second call (after
    // fetch resolves and dashboard re-renders on _setCache) shows data.
    if (ExpiringDocsAlert._cache === null && !ExpiringDocsAlert._loadInFlight) {
      ExpiringDocsAlert._fetch();
    }
    var items = ExpiringDocsAlert._cache || [];
    if (!items.length) return '';

    // Worst-case days-to-expiry across all items drives the color.
    var minDays = items.reduce(function(m, i) {
      return (i.daysUntil != null && i.daysUntil < m) ? i.daysUntil : m;
    }, 9999);
    var color, bg, border, icon;
    if (minDays < 0)       { color = '#991b1b'; bg = '#fee2e2'; border = '#fecaca'; icon = '🚨'; }
    else if (minDays <= 7) { color = '#9a3412'; bg = '#fed7aa'; border = '#fdba74'; icon = '⚠'; }
    else                   { color = '#92400e'; bg = '#fef3c7'; border = '#fde68a'; icon = '📅'; }

    var html = '<div style="background:' + bg + ';border:1px solid ' + border + ';color:' + color + ';border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
      + '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px;">'
      +   '<div style="font-size:22px;">' + icon + '</div>'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Expiring documents · ' + items.length + '</div>'
      +     '<div style="font-size:12px;margin-top:2px;">' + (minDays < 0 ? '<b>OVERDUE</b> — some documents have already expired.' : (minDays === 0 ? '<b>Expires today.</b>' : 'Soonest expires in <b>' + minDays + ' day' + (minDays === 1 ? '' : 's') + '</b>.')) + '</div>'
      +   '</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">';

    items.slice(0, 5).forEach(function(it) {
      var rel = it.daysUntil < 0
        ? '<b style="color:#991b1b;">' + Math.abs(it.daysUntil) + 'd overdue</b>'
        : it.daysUntil === 0 ? '<b>today</b>'
        : 'in ' + it.daysUntil + 'd';
      var goto = it.kind === 'permit'
        ? "loadPage('permits')"
        : it.kind === 'vehicle'
          ? "FleetPage.showDetail('" + (it.refId || '') + "')"
          : "loadPage('insurance')";
      html += '<a onclick="' + goto + '" style="display:flex;justify-content:space-between;gap:8px;padding:4px 8px;background:rgba(255,255,255,.5);border-radius:6px;cursor:pointer;text-decoration:none;color:inherit;">'
        + '<span><b>' + UI.esc(it.label) + '</b>' + (it.detail ? ' <span style="opacity:.75;">· ' + UI.esc(it.detail) + '</span>' : '') + '</span>'
        + '<span>' + rel + '</span>'
        + '</a>';
    });
    if (items.length > 5) {
      html += '<div style="font-size:11px;opacity:.75;margin-top:2px;">+ ' + (items.length - 5) + ' more</div>';
    }
    html += '</div></div>';
    return html;
  },

  _fetch: function() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) {
      ExpiringDocsAlert._cache = [];
      return;
    }
    ExpiringDocsAlert._loadInFlight = true;
    var horizon = new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);
    var pulls = [];

    // 1. Compliance docs — view computes status server-side
    pulls.push(SupabaseDB.client
      .from('compliance_documents_with_status')
      .select('id,kind,expires_date,status,carrier,policy_number')
      .in('status', ['expired', 'expiring_soon'])
      .then(function(r) {
        if (r.error || !r.data) return [];
        return r.data.map(function(d) {
          var label = (typeof InsurancePage !== 'undefined' && InsurancePage._kindLabel) ? InsurancePage._kindLabel(d.kind) : d.kind;
          return {
            kind: 'compliance',
            refId: d.id,
            label: label,
            detail: d.carrier || d.policy_number || '',
            expiresOn: d.expires_date,
            daysUntil: ExpiringDocsAlert._daysUntil(d.expires_date)
          };
        });
      }));

    // 2. Vehicle documents
    pulls.push(SupabaseDB.client
      .from('vehicle_documents')
      .select('id,vehicle_id,kind,expires_date,issuer')
      .lte('expires_date', horizon)
      .then(function(r) {
        if (r.error || !r.data) return [];
        return r.data.map(function(d) {
          return {
            kind: 'vehicle',
            refId: d.vehicle_id,
            label: ExpiringDocsAlert._vehicleDocLabel(d.kind),
            detail: d.issuer || '',
            expiresOn: d.expires_date,
            daysUntil: ExpiringDocsAlert._daysUntil(d.expires_date)
          };
        });
      }));

    // 3. Job permits — expiring soon
    pulls.push(SupabaseDB.client
      .from('job_permits')
      .select('id,job_id,jurisdiction,permit_number,expires_at,status')
      .lte('expires_at', horizon)
      .in('status', ['approved', 'inspected'])
      .then(function(r) {
        if (r.error || !r.data) return [];
        return r.data.map(function(d) {
          return {
            kind: 'permit',
            refId: d.job_id,
            label: 'Permit · ' + (d.jurisdiction || 'unknown'),
            detail: d.permit_number || '',
            expiresOn: d.expires_at,
            daysUntil: ExpiringDocsAlert._daysUntil(d.expires_at)
          };
        });
      }));

    Promise.all(pulls).then(function(buckets) {
      var all = [].concat.apply([], buckets);
      all.sort(function(a, b) { return (a.daysUntil || 0) - (b.daysUntil || 0); });
      ExpiringDocsAlert._cache = all;
      ExpiringDocsAlert._loadInFlight = false;
      if (window._currentPage === 'dashboard' && typeof loadPage === 'function') {
        // Re-render only if we actually have items to show (avoid render thrash).
        if (all.length > 0) loadPage('dashboard');
      }
    }).catch(function() {
      ExpiringDocsAlert._loadInFlight = false;
      ExpiringDocsAlert._cache = [];
    });
  },

  _daysUntil: function(dateStr) {
    if (!dateStr) return null;
    var t = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(t)) return null;
    return Math.ceil((t.getTime() - Date.now()) / 86400000);
  },

  _vehicleDocLabel: function(kind) {
    var map = {
      registration: 'Vehicle registration',
      inspection: 'NY inspection',
      insurance_card: 'Insurance ID card',
      lease: 'Lease document',
      other: 'Vehicle document'
    };
    return map[kind] || ('Vehicle ' + kind);
  },

  // Public refresh — used after edits to docs so the banner reflects
  // the change on the next dashboard render without waiting for boot.
  refresh: function() {
    ExpiringDocsAlert._cache = null;
    ExpiringDocsAlert._loadInFlight = false;
  }
};
