/**
 * Branch Manager — Insurance Manager
 * Store company policies, request COIs, track certificate status.
 *
 * Data persisted to localStorage (no Supabase table needed — policy info
 * is a handful of records; cert requests link to job IDs stored locally).
 *
 * Keys:
 *   bm-ins-policies  → [ { id, type, carrier, policyNum, limit, expiry, notes } ]
 *   bm-ins-certs     → [ { id, jobId, jobTitle, clientName, holderName, holderAddr,
 *                           description, requested, received, sentToClient,
 *                           status, notes, additionalInsured, waiverSubrogation } ]
 *   bm-ins-agent     → { name, email, phone, agency }
 */
var InsurancePage = {
  _tab: 'compliance',     // 'compliance' | 'certs' | 'policies' | 'agent'
  _compliance: null,      // cached cloud compliance_documents_with_status rows

  // ── Storage helpers ───────────────────────────────────────────────────
  _getPolicies: function() { try { return JSON.parse(localStorage.getItem('bm-ins-policies') || '[]'); } catch(e) { return []; } },
  _savePolicies: function(d) { localStorage.setItem('bm-ins-policies', JSON.stringify(d)); },
  _getCerts: function() { try { return JSON.parse(localStorage.getItem('bm-ins-certs') || '[]'); } catch(e) { return []; } },
  _saveCerts: function(d) { localStorage.setItem('bm-ins-certs', JSON.stringify(d)); },
  _getAgent: function() { try { return JSON.parse(localStorage.getItem('bm-ins-agent') || '{}'); } catch(e) { return {}; } },
  _saveAgent: function(d) { localStorage.setItem('bm-ins-agent', JSON.stringify(d)); },
  _id: function() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); },

  // ── Cloud compliance_documents (v578+) ────────────────────────────────
  // Async fetch then re-render. Uses tenant-scoped RLS via SupabaseDB.client.
  _fetchCompliance: function() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client || !SupabaseDB.ready) {
      InsurancePage._compliance = []; return;
    }
    SupabaseDB.client
      .from('compliance_documents_with_status')
      .select('*')
      .order('expires_date', { ascending: true, nullsFirst: false })
      .then(function(res) {
        if (res && !res.error) {
          var prevLen = (InsurancePage._compliance || []).length;
          InsurancePage._compliance = res.data || [];
          // Re-render only if we're still on the insurance page + data changed
          if (typeof loadPage === 'function' && window._currentPage === 'insurance' && prevLen !== InsurancePage._compliance.length) {
            loadPage('insurance');
          }
        } else {
          console.warn('[insurance] compliance_documents fetch failed', res && res.error);
          InsurancePage._compliance = [];
        }
      });
  },

  // Friendly labels for compliance kinds
  _kindLabel: function(k) {
    var map = {
      'wc_policy': 'Workers Comp Policy',
      'db_policy': 'Disability Benefits',
      'pfl_policy': 'Paid Family Leave',
      'general_liability': 'General Liability',
      'auto_liability': 'Commercial Auto',
      'umbrella': 'Umbrella / Excess',
      'pesticide_cert': 'Pesticide Cert',
      'tcia_member': 'TCIA Membership',
      'isa_member': 'ISA Membership',
      'usdot_registration': 'US DOT Registration',
      'mcs150_biennial': 'MCS-150 Biennial',
      'dos_biennial': 'NY DOS Biennial',
      'sales_tax_cert': 'Sales Tax Cert',
      'vehicle_registration': 'Vehicle Registration',
      'vehicle_inspection': 'NY Inspection',
      'driver_license': 'Driver License',
      'cdl': 'CDL',
      'dot_medical_card': 'DOT Medical Card',
      'osha_z133_training': 'ANSI Z133 Training',
      'first_aid_cpr_cert': 'First Aid / CPR',
      'business_license_local': 'Local Business License',
      'home_improvement_contractor': 'HIC License'
    };
    return map[k] || k.replace(/_/g, ' ');
  },

  // ── Render ────────────────────────────────────────────────────────────
  render: function() {
    var policies = InsurancePage._getPolicies();
    var certs = InsurancePage._getCerts();
    var agent = InsurancePage._getAgent();

    // Kick async compliance fetch — re-renders when data lands
    if (InsurancePage._compliance === null) {
      InsurancePage._compliance = []; // prevent duplicate fetches
      InsurancePage._fetchCompliance();
    }
    var compliance = InsurancePage._compliance || [];
    var compExpired = compliance.filter(function(c) { return c.status === 'expired'; });
    var compExpiringSoon = compliance.filter(function(c) { return c.status === 'expiring_soon'; });
    var compNoExpiry = compliance.filter(function(c) { return c.status === 'no_expiry' && c.active; });

    // Expiry warnings (legacy localStorage policies)
    var now = Date.now();
    var expiring = policies.filter(function(p) {
      if (!p.expiry) return false;
      var d = new Date(p.expiry).getTime() - now;
      return d > 0 && d < 60 * 86400000; // within 60 days
    });
    var expired = policies.filter(function(p) {
      return p.expiry && new Date(p.expiry).getTime() < now;
    });

    var html = '<div style="max-width:900px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">'
      + '<h2 style="margin:0;">🛡️ Insurance & Compliance</h2>'
      + '<div style="display:flex;gap:8px;">'
      +   '<button onclick="InsurancePage._editCompliance(null)" style="background:var(--bg);color:var(--text);border:1px solid var(--border);padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">+ Add License/Cert</button>'
      +   '<button onclick="InsurancePage._newCert()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">+ Request COI</button>'
      + '</div>'
      + '</div>';

    // Combined alerts (legacy policies + cloud compliance)
    var totalExpired = expired.length + compExpired.length;
    var totalExpiringSoon = expiring.length + compExpiringSoon.length;
    if (totalExpired) {
      var labels = expired.map(function(p) { return p.type + ' (' + (p.carrier || '') + ')'; })
        .concat(compExpired.map(function(c) { return InsurancePage._kindLabel(c.kind) + ' #' + (c.number || ''); }));
      html += '<div style="background:#fdecea;border:1px solid #e57373;border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#c62828;">'
        + '⚠️ <strong>' + totalExpired + ' EXPIRED:</strong> ' + labels.join(', ')
        + ' — renew immediately.</div>';
    }
    if (totalExpiringSoon) {
      var labels2 = expiring.map(function(p) {
        var d = Math.ceil((new Date(p.expiry).getTime() - now) / 86400000);
        return p.type + ' (' + d + 'd)';
      }).concat(compExpiringSoon.map(function(c) {
        return InsurancePage._kindLabel(c.kind) + ' (' + (c.days_until_expiry != null ? c.days_until_expiry + 'd' : '?') + ')';
      }));
      html += '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#e65100;">'
        + '⏳ <strong>' + totalExpiringSoon + ' expiring soon:</strong> ' + labels2.join(', ')
        + '</div>';
    }
    if (compNoExpiry.length) {
      html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#1e40af;">'
        + 'ℹ ' + compNoExpiry.length + ' license/cert with no expiry on file — '
        + '<a onclick="InsurancePage._tab=\'compliance\';loadPage(\'insurance\')" style="color:#1e40af;text-decoration:underline;cursor:pointer;">add expiration dates</a> for renewal alerts.</div>';
    }

    // Tabs
    var tabs = [
      ['compliance','🛂 Compliance (' + compliance.length + ')'],
      ['certs','📄 Certificates (' + certs.length + ')'],
      ['policies','🗂️ Policies (' + policies.length + ')'],
      ['agent','👤 Agent']
    ];
    html += '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px;overflow-x:auto;">';
    tabs.forEach(function(t) {
      var active = InsurancePage._tab === t[0];
      html += '<button onclick="InsurancePage._tab=\'' + t[0] + '\';loadPage(\'insurance\')" style="padding:10px 18px;border:none;background:none;font-size:14px;font-weight:' + (active?'700':'500') + ';color:' + (active?'var(--green-dark)':'var(--text-light)') + ';border-bottom:2px solid ' + (active?'var(--green-dark)':'transparent') + ';margin-bottom:-2px;cursor:pointer;white-space:nowrap;">' + t[1] + '</button>';
    });
    html += '</div>';

    if (InsurancePage._tab === 'compliance') html += InsurancePage._renderCompliance(compliance);
    else if (InsurancePage._tab === 'certs') html += InsurancePage._renderCerts(certs);
    else if (InsurancePage._tab === 'policies') html += InsurancePage._renderPolicies(policies);
    else html += InsurancePage._renderAgent(agent);

    html += '</div>';
    return html;
  },

  // ── Compliance tab — cloud-backed (compliance_documents_with_status) ──
  _renderCompliance: function(rows) {
    if (!rows.length) {
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:48px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:12px;">🛂</div>'
        + '<h3 style="margin:0 0 8px;">No compliance docs yet</h3>'
        + '<p style="color:var(--text-light);font-size:14px;margin:0 0 20px;">Track WC, DBL, GL, Auto, Pesticide Cert, TCIA, ISA, USDOT, NY DOS, vehicle reg, CDL, etc. in one place. Renewal alerts at 30/60/90 days.</p>'
        + '<button onclick="InsurancePage._editCompliance(null)" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">+ Add First License/Cert</button>'
        + '</div>';
    }

    // Group by status: expired → expiring_soon → no_expiry → active
    var statusOrder = { 'expired': 0, 'expiring_soon': 1, 'no_expiry': 2, 'active': 3, 'archived': 4 };
    var sorted = rows.slice().sort(function(a, b) {
      var d = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      if (d !== 0) return d;
      // Same bucket — order by expires asc (sooner first)
      if (a.expires_date && b.expires_date) return new Date(a.expires_date) - new Date(b.expires_date);
      return (a.kind || '').localeCompare(b.kind || '');
    });

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">';
    sorted.forEach(function(c) {
      var statusMeta = ({
        'expired':       { color: '#dc2626', bg: '#fee2e2', label: '⚠ EXPIRED' },
        'expiring_soon': { color: '#b45309', bg: '#fef3c7', label: '⏳ ' + (c.days_until_expiry || '?') + 'd left' },
        'active':        { color: '#15803d', bg: '#dcfce7', label: '✓ Active (' + (c.days_until_expiry || '?') + 'd)' },
        'no_expiry':     { color: '#475569', bg: '#f1f5f9', label: '— No expiry set' },
        'archived':      { color: '#94a3b8', bg: '#f8fafc', label: 'Archived' }
      })[c.status] || { color: '#475569', bg: '#f1f5f9', label: c.status };

      html += '<div style="background:#fff;border:1px solid var(--border);border-left:4px solid ' + statusMeta.color + ';border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px;">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
        +   '<div style="flex:1;min-width:0;">'
        +     '<div style="font-weight:700;font-size:14px;">' + UI.esc(InsurancePage._kindLabel(c.kind)) + '</div>'
        +     (c.number ? '<div style="font-size:12px;color:var(--text-light);font-family:monospace;">' + UI.esc(c.number) + '</div>' : '')
        +   '</div>'
        +   '<span style="background:' + statusMeta.bg + ';color:' + statusMeta.color + ';padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;">' + statusMeta.label + '</span>'
        + '</div>'
        + (c.issuer ? '<div style="font-size:12px;color:var(--text-light);">Issuer: <strong style="color:var(--text);">' + UI.esc(c.issuer) + '</strong></div>' : '')
        + (c.expires_date ? '<div style="font-size:12px;color:var(--text-light);">Expires: <strong style="color:' + statusMeta.color + ';">' + InsurancePage._fmtDate(c.expires_date) + '</strong></div>' : '')
        + (c.notes ? '<div style="font-size:11px;color:var(--text-light);line-height:1.4;margin-top:2px;">' + UI.esc(c.notes) + '</div>' : '')
        + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">'
        +   '<button onclick="InsurancePage._editCompliance(\'' + c.id + '\')" style="flex:1;background:var(--bg);border:1px solid var(--border);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;">' + (c.expires_date ? 'Edit' : '+ Set expiry') + '</button>'
        +   (c.renewal_url ? '<a href="' + UI.esc(c.renewal_url) + '" target="_blank" rel="noopener" style="background:var(--bg);border:1px solid var(--border);padding:6px 10px;border-radius:6px;font-size:12px;text-decoration:none;color:var(--text);">↗ Renew</a>' : '')
        +   '<button onclick="InsurancePage._archiveCompliance(\'' + c.id + '\')" title="Archive — stop tracking renewal" style="background:none;border:1px solid #fecaca;color:#b91c1c;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;">📦</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    return html;
  },

  // ── Compliance edit modal ──────────────────────────────────────────────
  _editCompliance: function(id) {
    var existing = id ? (InsurancePage._compliance || []).find(function(c) { return c.id === id; }) : null;
    var kinds = [
      ['wc_policy','Workers Comp Policy'], ['db_policy','Disability Benefits'], ['pfl_policy','Paid Family Leave'],
      ['general_liability','General Liability'], ['auto_liability','Commercial Auto'], ['umbrella','Umbrella / Excess'],
      ['pesticide_cert','Pesticide Cert'], ['tcia_member','TCIA Membership'], ['isa_member','ISA Membership'],
      ['usdot_registration','US DOT Registration'], ['mcs150_biennial','MCS-150 Biennial'],
      ['dos_biennial','NY DOS Biennial'], ['sales_tax_cert','Sales Tax Cert'],
      ['vehicle_registration','Vehicle Registration'], ['vehicle_inspection','NY Inspection'],
      ['driver_license','Driver License'], ['cdl','CDL'], ['dot_medical_card','DOT Medical Card'],
      ['osha_z133_training','ANSI Z133 Training'], ['first_aid_cpr_cert','First Aid / CPR'],
      ['business_license_local','Local Business License'], ['home_improvement_contractor','HIC License']
    ];
    var html = '<div style="max-width:540px;">'
      + '<h3 style="margin:0 0 14px;">' + (existing ? 'Edit license/cert' : 'Add license/cert') + '</h3>'
      + '<label style="display:block;margin-bottom:10px;font-size:12px;font-weight:600;color:#475569;">Type'
      +   '<select id="cd-kind" ' + (existing ? 'disabled' : '') + ' style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">'
      +     kinds.map(function(k) { return '<option value="' + k[0] + '"' + (existing && existing.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('')
      +   '</select>'
      + '</label>'
      + '<label style="display:block;margin-bottom:10px;font-size:12px;font-weight:600;color:#475569;">Number / Policy ID'
      +   '<input type="text" id="cd-number" value="' + UI.esc((existing && existing.number) || '') + '" placeholder="e.g. WC-32079-H19" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">'
      + '</label>'
      + '<label style="display:block;margin-bottom:10px;font-size:12px;font-weight:600;color:#475569;">Issuer'
      +   '<input type="text" id="cd-issuer" value="' + UI.esc((existing && existing.issuer) || '') + '" placeholder="e.g. NYSIF, NY DEC, FMCSA" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">'
      + '</label>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">'
      +   '<label style="font-size:12px;font-weight:600;color:#475569;">Issued date'
      +     '<input type="date" id="cd-issued" value="' + ((existing && existing.issued_date) || '') + '" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">'
      +   '</label>'
      +   '<label style="font-size:12px;font-weight:600;color:#475569;">Expires date'
      +     '<input type="date" id="cd-expires" value="' + ((existing && existing.expires_date) || '') + '" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">'
      +   '</label>'
      + '</div>'
      + '<label style="display:block;margin-bottom:10px;font-size:12px;font-weight:600;color:#475569;">Renewal URL (deep link to issuer portal)'
      +   '<input type="url" id="cd-renewal" value="' + UI.esc((existing && existing.renewal_url) || '') + '" placeholder="https://..." style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">'
      + '</label>'
      + '<label style="display:block;margin-bottom:14px;font-size:12px;font-weight:600;color:#475569;">Notes'
      +   '<textarea id="cd-notes" rows="2" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;font-family:inherit;resize:vertical;">' + UI.esc((existing && existing.notes) || '') + '</textarea>'
      + '</label>'
      + '<div style="display:flex;justify-content:space-between;gap:8px;">'
      +   (existing ? '<button onclick="InsurancePage._archiveCompliance(\'' + existing.id + '\')" style="background:none;border:1px solid #fecaca;color:#b91c1c;padding:9px 14px;border-radius:6px;font-size:13px;cursor:pointer;">Archive</button>' : '<span></span>')
      +   '<div style="display:flex;gap:8px;">'
      +     '<button onclick="UI.closeModal()" style="background:var(--bg);border:1px solid var(--border);padding:9px 14px;border-radius:6px;font-size:13px;cursor:pointer;">Cancel</button>'
      +     '<button onclick="InsurancePage._saveCompliance(' + (existing ? '\'' + existing.id + '\'' : 'null') + ')" style="background:var(--green-dark);color:#fff;border:none;padding:9px 18px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">Save</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
    UI.modal(html);
  },

  _saveCompliance: function(id) {
    var row = {
      kind: document.getElementById('cd-kind').value,
      number: document.getElementById('cd-number').value.trim() || null,
      issuer: document.getElementById('cd-issuer').value.trim() || null,
      issued_date: document.getElementById('cd-issued').value || null,
      expires_date: document.getElementById('cd-expires').value || null,
      renewal_url: document.getElementById('cd-renewal').value.trim() || null,
      notes: document.getElementById('cd-notes').value.trim() || null,
    };
    if (!row.kind) { UI.toast('Pick a type', 'error'); return; }
    if (id) {
      bmSafeCall(SupabaseDB.client.from('compliance_documents').update(row).eq('id', id), 'update compliance')
        .then(function(res) {
          if (!res.error) {
            UI.toast('✓ Saved', 'success');
            UI.closeModal();
            InsurancePage._compliance = null; // force re-fetch
            loadPage('insurance');
          }
        });
    } else {
      row.tenant_id = window.resolveTenantId ? window.resolveTenantId() : '93af4348-8bba-4045-ac3e-5e71ec1cc8c5';
      bmSafeCall(SupabaseDB.client.from('compliance_documents').insert(row), 'add compliance')
        .then(function(res) {
          if (!res.error) {
            UI.toast('✓ Added', 'success');
            UI.closeModal();
            InsurancePage._compliance = null;
            loadPage('insurance');
          }
        });
    }
  },

  _archiveCompliance: function(id) {
    if (!confirm('Archive this license/cert? It will stop appearing in the list and stop firing renewal alerts. (Soft-archive — data preserved.)')) return;
    bmSafeCall(SupabaseDB.client.from('compliance_documents').update({ active: false }).eq('id', id), 'archive compliance')
      .then(function(res) {
        if (!res.error) {
          UI.toast('✓ Archived', 'success');
          UI.closeModal();
          InsurancePage._compliance = null;
          loadPage('insurance');
        }
      });
  },

  // ── Certificates tab ──────────────────────────────────────────────────
  _renderCerts: function(certs) {
    if (!certs.length) {
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:48px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:12px;">📄</div>'
        + '<h3 style="margin:0 0 8px;">No certificate requests yet</h3>'
        + '<p style="color:var(--text-light);font-size:14px;margin:0 0 20px;">When a client or job site requires proof of insurance, click "+ Request COI" to email your agent and track the certificate.</p>'
        + '<button onclick="InsurancePage._newCert()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">+ Request First COI</button>'
        + '</div>';
    }

    var statusOrder = { 'requested': 0, 'received': 1, 'sent': 2 };
    var sorted = certs.slice().sort(function(a, b) { return (statusOrder[a.status]||0) - (statusOrder[b.status]||0) || new Date(b.requested) - new Date(a.requested); });

    var html = '<div style="display:flex;flex-direction:column;gap:10px;">';
    sorted.forEach(function(c) {
      var statusColor = c.status === 'sent' ? '#2e7d32' : c.status === 'received' ? '#1565c0' : '#e65100';
      var statusLabel = c.status === 'sent' ? '✓ Sent to Client' : c.status === 'received' ? '📬 Received' : '📤 Requested';
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:200px;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
        + '<span style="font-weight:700;font-size:15px;">' + UI.esc(c.holderName || c.clientName || 'Unknown') + '</span>'
        + '<span style="font-size:11px;font-weight:700;color:' + statusColor + ';background:' + statusColor + '18;padding:2px 8px;border-radius:20px;">' + statusLabel + '</span>'
        + (c.additionalInsured ? '<span style="font-size:11px;color:#1565c0;background:#e3f2fd;padding:2px 8px;border-radius:20px;">Additional Insured</span>' : '')
        + '</div>'
        + (c.jobTitle ? '<div style="font-size:13px;color:var(--text-light);margin-bottom:2px;">Job: ' + UI.esc(c.jobTitle) + '</div>' : '')
        + (c.holderAddr ? '<div style="font-size:13px;color:var(--text-light);margin-bottom:2px;">📍 ' + UI.esc(c.holderAddr) + '</div>' : '')
        + (c.description ? '<div style="font-size:13px;color:var(--text-light);">Work: ' + UI.esc(c.description) + '</div>' : '')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">'
        + '<div style="font-size:11px;color:var(--text-light);">Requested ' + InsurancePage._fmtDate(c.requested) + '</div>'
        + '<div style="display:flex;gap:6px;">';

      if (c.status === 'requested') {
        html += '<button onclick="InsurancePage._markStatus(\'' + c.id + '\',\'received\')" style="background:#e3f2fd;color:#1565c0;border:none;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📬 Mark Received</button>';
        html += '<button onclick="InsurancePage._resendRequest(\'' + c.id + '\')" title="Re-send email to agent" style="background:var(--bg);border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">↻ Resend</button>';
      } else if (c.status === 'received') {
        html += '<button onclick="InsurancePage._markStatus(\'' + c.id + '\',\'sent\')" style="background:#e8f5e9;color:#2e7d32;border:none;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✓ Mark Sent to Client</button>';
      }
      html += '<button onclick="InsurancePage._deleteCert(\'' + c.id + '\')" style="background:none;border:1px solid var(--border);padding:5px 8px;border-radius:6px;font-size:12px;color:var(--text-light);cursor:pointer;">✕</button>';
      html += '</div></div></div>';
    });
    html += '</div>';
    return html;
  },

  // ── Policies tab ──────────────────────────────────────────────────────
  _renderPolicies: function(policies) {
    var policyTypes = ['General Liability', 'Workers Compensation', 'Commercial Auto', 'Umbrella / Excess', 'Inland Marine / Equipment', 'Other'];
    var now = Date.now();

    // v764: nudge toward the cloud-synced Compliance tab. The legacy
    // bm-ins-policies localStorage list is single-device; compliance_documents
    // is multi-device + has the expiring-soon banner feeding the dashboard.
    var html = '';
    if (policies.length) {
      html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;color:#1e40af;">'
        + '<div style="flex:1;min-width:240px;"><b>Heads up:</b> Policies on this tab are stored locally on this device. The <b>Compliance</b> tab syncs across devices + feeds the dashboard "expiring soon" alert. Migrate any policies below to keep everything in one place.</div>'
        + '<button onclick="InsurancePage._migratePoliciesToCloud()" style="font-size:12px;padding:6px 12px;background:#1e40af;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">↑ Migrate to cloud</button>'
        + '</div>';
    }

    html += '<div style="margin-bottom:14px;display:flex;justify-content:flex-end;">'
      + '<button onclick="InsurancePage._showPolicyForm(null)" style="background:var(--green-dark);color:#fff;border:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">+ Add Policy</button>'
      + '</div>';

    if (!policies.length) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:12px;">🗂️</div>'
        + '<h3 style="margin:0 0 8px;">No policies yet</h3>'
        + '<p style="color:var(--text-light);font-size:14px;margin:0 0 16px;">Add your GL, WC, and Auto policies so the info is instantly available when needed.</p>'
        + '<button onclick="InsurancePage._showPolicyForm(null)" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">+ Add First Policy</button>'
        + '</div>';
      return html;
    }

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">';
    policies.forEach(function(p) {
      var expDate = p.expiry ? new Date(p.expiry) : null;
      var daysLeft = expDate ? Math.ceil((expDate.getTime() - now) / 86400000) : null;
      var expiryColor = daysLeft === null ? 'var(--text-light)' : daysLeft < 0 ? '#c62828' : daysLeft < 60 ? '#e65100' : '#2e7d32';
      var expiryLabel = daysLeft === null ? '' : daysLeft < 0 ? '⚠ EXPIRED' : daysLeft < 60 ? '⏳ ' + daysLeft + 'd left' : '✓ ' + daysLeft + 'd left';

      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">'
        + '<div>'
        + '<div style="font-weight:700;font-size:14px;margin-bottom:2px;">' + UI.esc(p.type || 'Policy') + '</div>'
        + '<div style="font-size:13px;color:var(--text-light);">' + UI.esc(p.carrier || 'Carrier not set') + '</div>'
        + '</div>'
        + (expiryLabel ? '<span style="font-size:11px;font-weight:700;color:' + expiryColor + ';">' + expiryLabel + '</span>' : '')
        + '</div>'
        + (p.policyNum ? '<div style="font-size:12px;margin-bottom:4px;"><span style="color:var(--text-light);">Policy #</span> <span style="font-family:monospace;font-weight:600;">' + UI.esc(p.policyNum) + '</span></div>' : '')
        + (p.limit ? '<div style="font-size:12px;margin-bottom:4px;"><span style="color:var(--text-light);">Limit</span> <strong>' + UI.esc(p.limit) + '</strong></div>' : '')
        + (p.expiry ? '<div style="font-size:12px;margin-bottom:4px;"><span style="color:var(--text-light);">Expires</span> <strong style="color:' + expiryColor + ';">' + InsurancePage._fmtDate(p.expiry) + '</strong></div>' : '')
        + (p.notes ? '<div style="font-size:12px;color:var(--text-light);margin-top:6px;line-height:1.4;">' + UI.esc(p.notes) + '</div>' : '')
        + '<div style="margin-top:10px;display:flex;gap:6px;">'
        + '<button onclick="InsurancePage._showPolicyForm(\'' + p.id + '\')" style="flex:1;background:var(--bg);border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">Edit</button>'
        + '<button onclick="InsurancePage._deletePolicy(\'' + p.id + '\')" style="background:none;border:1px solid var(--border);padding:5px 8px;border-radius:6px;font-size:12px;color:var(--text-light);cursor:pointer;">✕</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    return html;
  },

  // ── Agent tab ─────────────────────────────────────────────────────────
  _renderAgent: function(agent) {
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:480px;">'
      + '<h3 style="margin:0 0 16px;font-size:16px;">Insurance Agent Contact</h3>'
      + '<div style="display:flex;flex-direction:column;gap:12px;">'
      + InsurancePage._field('Agent Name', 'agent-name', agent.name || '', 'e.g. John Smith')
      + InsurancePage._field('Agency', 'agent-agency', agent.agency || '', 'e.g. State Farm / Lockton')
      + InsurancePage._field('Email', 'agent-email', agent.email || '', 'agent@example.com', 'email')
      + InsurancePage._field('Phone', 'agent-phone', agent.phone || '', '(xxx) xxx-xxxx', 'tel')
      + '</div>'
      + '<div style="margin-top:20px;display:flex;gap:10px;">'
      + '<button onclick="InsurancePage._saveAgentForm()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Save</button>'
      + (agent.email ? '<a href="mailto:' + UI.esc(agent.email) + '" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);padding:10px 16px;border-radius:8px;font-size:13px;text-decoration:none;color:var(--text);">✉️ Email Agent</a>' : '')
      + (agent.phone ? '<a href="tel:' + UI.esc(agent.phone.replace(/\D/g,'')) + '" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);padding:10px 16px;border-radius:8px;font-size:13px;text-decoration:none;color:var(--text);">📞 Call Agent</a>' : '')
      + '</div>'
      + '</div>';
    return html;
  },

  _field: function(label, id, value, placeholder, type) {
    return '<div>'
      + '<label style="display:block;font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;">' + label + '</label>'
      + '<input id="' + id + '" type="' + (type || 'text') + '" value="' + UI.esc(value) + '" placeholder="' + UI.esc(placeholder || '') + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;outline:none;" onfocus="this.style.borderColor=\'var(--green-dark)\'" onblur="this.style.borderColor=\'var(--border)\'">'
      + '</div>';
  },

  // ── New COI request form ──────────────────────────────────────────────
  _newCert: function(prefillJobId) {
    var agent = InsurancePage._getAgent();
    var policies = InsurancePage._getPolicies();
    var policyList = policies.map(function(p) { return UI.esc(p.type); }).join(', ') || 'General Liability, Workers Compensation, Commercial Auto';

    // Try to get recent jobs for dropdown
    var jobOptions = '<option value="">— No specific job —</option>';
    try {
      var jobs = JSON.parse(localStorage.getItem('bm-jobs') || '[]');
      jobs.filter(function(j) { return j.status !== 'completed' && j.status !== 'cancelled'; })
          .slice(0, 30)
          .forEach(function(j) {
            var sel = j.id === prefillJobId ? ' selected' : '';
            jobOptions += '<option value="' + UI.esc(j.id) + '"' + sel + '>' + UI.esc((j.clientName || '') + (j.property ? ' — ' + j.property : '') + (j.title ? ' (' + j.title + ')' : '')) + '</option>';
          });
    } catch(e) {}

    var body = '<div style="display:flex;flex-direction:column;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">LINK TO JOB (optional)</label>'
      + '<select id="coi-job" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" onchange="InsurancePage._autofillCertJob(this.value)">' + jobOptions + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">CERTIFICATE HOLDER NAME *</label>'
      + '<input id="coi-holder-name" placeholder="Client or company name" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">HOLDER ADDRESS</label>'
      + '<input id="coi-holder-addr" placeholder="Street, City, State" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">WORK DESCRIPTION</label>'
      + '<input id="coi-desc" placeholder="e.g. Tree removal at 19 Donald Lane, Ossining NY" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div style="display:flex;gap:16px;align-items:center;">'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" id="coi-addl-insured"> Additional Insured required</label>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" id="coi-waiver"> Waiver of Subrogation</label>'
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">DATE NEEDED BY</label>'
      + '<input id="coi-needed-by" type="date" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + (agent.email ? '' : '<div style="background:#fff3e0;border-radius:8px;padding:10px 12px;font-size:12px;color:#e65100;">⚠️ No agent email saved — <a onclick="InsurancePage._tab=\'agent\';UI.closeModal();loadPage(\'insurance\')" style="color:var(--accent);cursor:pointer;">add agent info first</a> to email the request automatically.</div>')
      + '</div>';

    var btnLabel = agent.email ? '📧 Send to Agent + Track' : '📄 Track Only';
    UI.modal('Request Certificate of Insurance', body, [
      { label: btnLabel, fn: 'InsurancePage._submitCertRequest()' },
      { label: 'Cancel', fn: 'UI.closeModal()' }
    ]);
  },

  _autofillCertJob: function(jobId) {
    if (!jobId) return;
    try {
      var jobs = JSON.parse(localStorage.getItem('bm-jobs') || '[]');
      var job = jobs.find(function(j) { return j.id === jobId; });
      if (!job) return;
      var nameEl = document.getElementById('coi-holder-name');
      var addrEl = document.getElementById('coi-holder-addr');
      var descEl = document.getElementById('coi-desc');
      if (nameEl && !nameEl.value) nameEl.value = job.clientName || '';
      if (addrEl && !addrEl.value) addrEl.value = job.property || '';
      if (descEl && !descEl.value) descEl.value = job.title || job.description || '';
    } catch(e) {}
  },

  _submitCertRequest: function() {
    var holderName = (document.getElementById('coi-holder-name') || {}).value || '';
    var holderAddr = (document.getElementById('coi-holder-addr') || {}).value || '';
    var description = (document.getElementById('coi-desc') || {}).value || '';
    var jobId = (document.getElementById('coi-job') || {}).value || '';
    var addlInsured = (document.getElementById('coi-addl-insured') || {}).checked || false;
    var waiver = (document.getElementById('coi-waiver') || {}).checked || false;
    var neededBy = (document.getElementById('coi-needed-by') || {}).value || '';

    if (!holderName.trim()) { UI.toast('Certificate holder name is required', 'error'); return; }

    var agent = InsurancePage._getAgent();
    var policies = InsurancePage._getPolicies();
    var policyList = policies.length ? policies.map(function(p) { return p.type; }).join(', ') : 'General Liability, Workers Compensation, Commercial Auto';

    // Build cert record
    var cert = {
      id: InsurancePage._id(),
      jobId: jobId,
      jobTitle: InsurancePage._jobTitle(jobId),
      clientName: holderName,
      holderName: holderName,
      holderAddr: holderAddr,
      description: description,
      additionalInsured: addlInsured,
      waiverSubrogation: waiver,
      neededBy: neededBy,
      requested: new Date().toISOString(),
      status: 'requested',
      notes: ''
    };

    var certs = InsurancePage._getCerts();
    certs.unshift(cert);
    InsurancePage._saveCerts(certs);
    UI.closeModal();

    // Send email to agent if configured
    if (agent.email) {
      // v764: COI auto-fill — expand "Policies to include" into a full
      // detailed list with carrier + policy # + limit + expiry pulled
      // from both localStorage bm-ins-policies AND cloud compliance_documents.
      // Agent doesn't have to look anything up — body has everything.
      var detailedPolicies = InsurancePage._buildPolicyListForCOI();
      var subject = 'COI Request — ' + holderName + (description ? ' / ' + description : '');
      var bodyLines = [
        'Hi ' + (agent.name || 'there') + ',',
        '',
        'Please send a Certificate of Insurance for the following:',
        '',
        'Certificate Holder: ' + holderName,
        holderAddr ? 'Address: ' + holderAddr : '',
        description ? 'Project / Work Description: ' + description : '',
        neededBy ? 'Needed By: ' + neededBy : '',
        '',
        '── Policies to include ──',
        detailedPolicies || ('  ' + policyList),
        '',
        addlInsured ? '→ Please list the certificate holder as ADDITIONAL INSURED.' : '',
        waiver ? '→ Please include a Waiver of Subrogation in favor of the holder.' : '',
        '',
        'Thank you,',
        CompanyInfo.get('name'),
        CompanyInfo.get('phone')
      ].filter(function(l) { return l !== ''; }).join('\n');

      window.location.href = 'mailto:' + encodeURIComponent(agent.email)
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(bodyLines);
    }

    InsurancePage._tab = 'certs';
    loadPage('insurance');
    UI.toast('COI request created' + (agent.email ? ' — email opened to agent' : ''));
  },

  _jobTitle: function(jobId) {
    if (!jobId) return '';
    try {
      var jobs = JSON.parse(localStorage.getItem('bm-jobs') || '[]');
      var job = jobs.find(function(j) { return j.id === jobId; });
      return job ? (job.clientName || '') + (job.title ? ' — ' + job.title : '') : '';
    } catch(e) { return ''; }
  },

  _markStatus: function(certId, status) {
    var certs = InsurancePage._getCerts();
    var cert = certs.find(function(c) { return c.id === certId; });
    if (!cert) return;
    cert.status = status;
    if (status === 'received') cert.received = new Date().toISOString();
    if (status === 'sent') cert.sentToClient = new Date().toISOString();
    InsurancePage._saveCerts(certs);
    loadPage('insurance');
    UI.toast(status === 'received' ? 'Marked as received' : 'Marked as sent to client');
  },

  _resendRequest: function(certId) {
    var certs = InsurancePage._getCerts();
    var cert = certs.find(function(c) { return c.id === certId; });
    if (!cert) return;
    var agent = InsurancePage._getAgent();
    if (!agent.email) { UI.toast('No agent email saved', 'error'); return; }
    var detailedPolicies = InsurancePage._buildPolicyListForCOI();
    var subject = 'COI Request (Follow-up) — ' + (cert.holderName || cert.clientName);
    var bodyLines = [
      'Hi ' + (agent.name || 'there') + ',',
      '',
      'Following up on my COI request for:',
      '',
      'Certificate Holder: ' + (cert.holderName || ''),
      cert.holderAddr ? 'Address: ' + cert.holderAddr : '',
      cert.description ? 'Project: ' + cert.description : '',
      '',
      '── Policies to include ──',
      detailedPolicies || 'General Liability, Workers Compensation, Commercial Auto',
      '',
      cert.additionalInsured ? '→ Additional Insured required' : '',
      cert.waiverSubrogation ? '→ Waiver of Subrogation required' : '',
      '',
      'Thank you,',
      CompanyInfo.get('name'),
      CompanyInfo.get('phone')
    ].filter(function(l) { return l !== ''; }).join('\n');
    window.location.href = 'mailto:' + encodeURIComponent(agent.email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyLines);
  },

  // v764: produce the policy block used in COI agent emails — merges
  // localStorage policies AND cloud compliance_documents into one
  // human-readable list with carrier · policy # · limit · expiry.
  _buildPolicyListForCOI: function() {
    var lines = [];
    var seenKey = {};
    // 1. localStorage policies (legacy)
    InsurancePage._getPolicies().forEach(function(p) {
      var line = '  • ' + (p.type || 'Policy');
      if (p.carrier) line += ' — ' + p.carrier;
      if (p.policyNum) line += ' (Policy #' + p.policyNum + ')';
      if (p.limit) line += ' — limit ' + p.limit;
      if (p.expiry) line += ' — expires ' + p.expiry;
      var key = (p.carrier || '') + '|' + (p.policyNum || '');
      if (key !== '|' && seenKey[key]) return; // dedupe vs cloud
      if (key !== '|') seenKey[key] = true;
      lines.push(line);
    });
    // 2. Cloud compliance docs (preferred)
    var INSURANCE_KINDS = ['general_liability','auto_liability','umbrella','wc_policy','db_policy','pfl_policy'];
    (InsurancePage._compliance || []).forEach(function(d) {
      if (!d || !d.kind || INSURANCE_KINDS.indexOf(d.kind) === -1) return;
      if (!d.active) return;
      var key = (d.carrier || '') + '|' + (d.policy_number || '');
      if (key !== '|' && seenKey[key]) return;
      if (key !== '|') seenKey[key] = true;
      var line = '  • ' + InsurancePage._kindLabel(d.kind);
      if (d.carrier) line += ' — ' + d.carrier;
      if (d.policy_number) line += ' (Policy #' + d.policy_number + ')';
      if (d.coverage_limit) line += ' — limit ' + d.coverage_limit;
      if (d.expires_date) line += ' — expires ' + d.expires_date;
      lines.push(line);
    });
    return lines.join('\n');
  },

  // v764: Push localStorage bm-ins-policies up to cloud compliance_documents.
  // Maps policy type → compliance kind, copies carrier/policyNum/limit/expiry/notes.
  // Per Doug rules: never auto-fabricate kind for an unrecognized policy type;
  // skip those and report so user can re-classify.
  _migratePoliciesToCloud: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) { UI.toast('Supabase not connected', 'error'); return; }
    var policies = InsurancePage._getPolicies();
    if (!policies.length) { UI.toast('No local policies to migrate'); return; }
    var KIND_MAP = {
      'general liability': 'general_liability',
      'workers compensation': 'wc_policy',
      'commercial auto': 'auto_liability',
      'umbrella / excess': 'umbrella',
      'umbrella': 'umbrella',
      'inland marine / equipment': 'general_liability',
      'inland marine': 'general_liability'
    };
    var rows = [];
    var skipped = [];
    policies.forEach(function(p) {
      var key = (p.type || '').toLowerCase().trim();
      var kind = KIND_MAP[key];
      if (!kind) { skipped.push(p.type || '(no type)'); return; }
      rows.push({
        tenant_id: tenantId,
        kind: kind,
        active: true,
        carrier: p.carrier || null,
        policy_number: p.policyNum || null,
        coverage_limit: p.limit || null,
        expires_date: p.expiry || null,
        notes: p.notes || null
      });
    });
    if (!rows.length) { UI.toast('No mappable policies to migrate (skipped: ' + skipped.join(', ') + ')', 'error'); return; }
    if (!confirm('Migrate ' + rows.length + ' polic' + (rows.length === 1 ? 'y' : 'ies') + ' to the cloud Compliance tab?\n\nLocal policies will remain visible here until you delete them. Migrated rows are cloud-synced and feed the dashboard alert.' + (skipped.length ? '\n\nSkipped (unknown type): ' + skipped.join(', ') : ''))) return;
    sb.from('compliance_documents').insert(rows).then(function(r) {
      if (r.error) { UI.toast('Migrate failed: ' + r.error.message, 'error'); return; }
      InsurancePage._compliance = null; // bust cache so next render pulls fresh
      InsurancePage._fetchCompliance();
      if (typeof ExpiringDocsAlert !== 'undefined' && ExpiringDocsAlert.refresh) ExpiringDocsAlert.refresh();
      UI.toast('Migrated ' + rows.length + ' → Compliance' + (skipped.length ? ' (skipped ' + skipped.length + ')' : ''));
      InsurancePage._tab = 'compliance';
      loadPage('insurance');
    });
  },

  _deleteCert: function(certId) {
    if (!confirm('Delete this certificate request?')) return;
    InsurancePage._saveCerts(InsurancePage._getCerts().filter(function(c) { return c.id !== certId; }));
    loadPage('insurance');
  },

  // ── Policy form (add/edit) ────────────────────────────────────────────
  _showPolicyForm: function(policyId) {
    var policies = InsurancePage._getPolicies();
    var p = policyId ? (policies.find(function(x) { return x.id === policyId; }) || {}) : {};
    var types = ['General Liability', 'Workers Compensation', 'Commercial Auto', 'Umbrella / Excess', 'Inland Marine / Equipment', 'Other'];
    var typeOpts = types.map(function(t) { return '<option' + (p.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('');

    var body = '<div style="display:flex;flex-direction:column;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">POLICY TYPE</label>'
      + '<select id="pol-type" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;">' + typeOpts + '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">CARRIER</label>'
      + '<input id="pol-carrier" value="' + UI.esc(p.carrier || '') + '" placeholder="e.g. Travelers, Hartford" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">POLICY NUMBER</label>'
      + '<input id="pol-num" value="' + UI.esc(p.policyNum || '') + '" placeholder="Policy #" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:monospace;"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">COVERAGE LIMIT</label>'
      + '<input id="pol-limit" value="' + UI.esc(p.limit || '') + '" placeholder="e.g. $1,000,000 per occ." style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">EXPIRATION DATE</label>'
      + '<input id="pol-expiry" type="date" value="' + UI.esc(p.expiry || '') + '" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">NOTES</label>'
      + '<input id="pol-notes" value="' + UI.esc(p.notes || '') + '" placeholder="Any notes (deductible, special endorsements, etc.)" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '</div>';

    UI.modal(policyId ? 'Edit Policy' : 'Add Policy', body, [
      { label: 'Save Policy', fn: 'InsurancePage._savePolicyForm("' + (policyId || '') + '")' },
      { label: 'Cancel', fn: 'UI.closeModal()' }
    ]);
  },

  _savePolicyForm: function(policyId) {
    var policies = InsurancePage._getPolicies();
    var row = {
      id: policyId || InsurancePage._id(),
      type: (document.getElementById('pol-type') || {}).value || 'General Liability',
      carrier: (document.getElementById('pol-carrier') || {}).value || '',
      policyNum: (document.getElementById('pol-num') || {}).value || '',
      limit: (document.getElementById('pol-limit') || {}).value || '',
      expiry: (document.getElementById('pol-expiry') || {}).value || '',
      notes: (document.getElementById('pol-notes') || {}).value || ''
    };
    if (policyId) {
      var idx = policies.findIndex(function(p) { return p.id === policyId; });
      if (idx >= 0) policies[idx] = row; else policies.push(row);
    } else {
      policies.push(row);
    }
    InsurancePage._savePolicies(policies);
    UI.closeModal();
    loadPage('insurance');
    UI.toast('Policy saved');
  },

  _deletePolicy: function(policyId) {
    if (!confirm('Delete this policy?')) return;
    InsurancePage._savePolicies(InsurancePage._getPolicies().filter(function(p) { return p.id !== policyId; }));
    loadPage('insurance');
  },

  _saveAgentForm: function() {
    InsurancePage._saveAgent({
      name: (document.getElementById('agent-name') || {}).value || '',
      agency: (document.getElementById('agent-agency') || {}).value || '',
      email: (document.getElementById('agent-email') || {}).value || '',
      phone: (document.getElementById('agent-phone') || {}).value || ''
    });
    loadPage('insurance');
    UI.toast('Agent info saved');
  },

  // ── Helpers ───────────────────────────────────────────────────────────
  _fmtDate: function(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch(e) { return iso; }
  }
};
