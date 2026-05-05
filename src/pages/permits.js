/**
 * Branch Manager — Permit Research
 * AI-powered tree work permit lookup by address.
 * First supported jurisdiction: Village of Ossining, NY (CitySquared portal).
 *
 * Usage from other pages:
 *   PermitsPage._pendingAddress = '19 Donald Lane, Ossining NY';
 *   loadPage('permits');
 */
var PermitsPage = {
  _pendingAddress: '',
  _result: null,       // last lookup result
  _loading: false,

  // ── Known jurisdictions — high-confidence, no AI needed ──────────────
  // Key: lowercase normalized city/town/village name
  _knownJurisdictions: {
    'ossining': {
      jurisdiction: 'Village of Ossining, NY',
      department: 'Building Department',
      permit_required: true,
      size_threshold: '10 inches DBH or larger (trunk diameter measured 4.5 ft from ground)',
      fee: '$75 for 1–2 trees · $10/tree additional · $115 maximum',
      processing_time: '10–15 business days (call to confirm)',
      phone: '(914) 941-3199',
      email: 'permits@villageofossining.org',
      portal_url: 'https://citysquared.com/#/app/OssiningVillageNY/landing',
      portal_name: 'CitySquared Online Portal',
      notes: 'Submit online only — in-person no longer accepted as of Sept 2023. Upload site sketch showing tree locations + replacement plan. Trimming/pruning that does not kill or remove the tree does not require a permit.',
      confidence: 'high',
      last_verified: 'Apr 2026'
    }
  },

  // ── Normalize city name for lookup ────────────────────────────────────
  _extractCity: function(address) {
    if (!address) return '';
    // Try to pull city from "123 Street, City ST zip" patterns
    var parts = address.split(',');
    for (var i = 1; i < parts.length; i++) {
      var part = parts[i].trim().toLowerCase().replace(/\s+\d{5}.*$/, '').replace(/\s+[a-z]{2}$/, '').trim();
      if (part.length > 1) return part;
    }
    // Last word fallback
    var words = address.trim().split(/\s+/);
    return words[words.length - 1].toLowerCase();
  },

  // ── AI lookup for unknown jurisdictions ───────────────────────────────
  _lookupViaAI: function(address, callback) {
    var apiKey = window.bmAIKey ? window.bmAIKey() : null;
    var edgeUrl = 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat';

    var prompt = 'You are a permit research assistant for a tree service company operating in New York State.\n\n'
      + 'Research tree removal and trimming permit requirements for this address:\n'
      + address + '\n\n'
      + 'Return ONLY a valid JSON object — no prose, no markdown, no code fences — in this exact shape:\n'
      + '{\n'
      + '  "jurisdiction": "Full municipality name, NY",\n'
      + '  "department": "e.g. Building Department",\n'
      + '  "permit_required": true,\n'
      + '  "size_threshold": "e.g. Trees 6 inches DBH or larger",\n'
      + '  "fee": "e.g. $100 first tree, $50 each additional",\n'
      + '  "processing_time": "e.g. 10 business days",\n'
      + '  "phone": "(xxx) xxx-xxxx or null",\n'
      + '  "email": "email or null",\n'
      + '  "portal_url": "direct application URL or null",\n'
      + '  "portal_name": "portal name or Building Dept website",\n'
      + '  "notes": "key rules, exemptions, or warnings in 1-2 sentences",\n'
      + '  "confidence": "high|medium|low"\n'
      + '}\n\n'
      + 'If you are unsure of exact fees or thresholds, use your best estimate and set confidence to "low". '
      + 'Always return valid JSON.';

    fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey,
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      var text = '';
      if (res.content && res.content[0] && res.content[0].text) {
        text = res.content[0].text.trim();
      } else if (res.choices && res.choices[0]) {
        text = (res.choices[0].message || res.choices[0]).content || '';
      } else if (typeof res === 'string') {
        text = res;
      }
      // Strip any accidental markdown fences
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      try {
        var result = JSON.parse(text);
        callback(null, result);
      } catch(e) {
        callback('Could not parse AI response. Raw: ' + text.substring(0, 200));
      }
    })
    .catch(function(err) {
      callback('AI lookup failed: ' + (err.message || err));
    });
  },

  // ── Main render ───────────────────────────────────────────────────────
  render: function() {
    var addr = PermitsPage._pendingAddress || '';

    var html = '<div style="max-width:820px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">'
      + '<h2 style="margin:0;">🏛️ Permit Research</h2>'
      + '<div style="font-size:12px;color:var(--text-light);">AI-powered tree work permit lookup</div>'
      + '</div>';

    // Search card
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;">'
      + '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-light);">JOB ADDRESS</label>'
      + '<div style="display:flex;gap:10px;align-items:stretch;">'
      + '<input id="permit-address" type="text" placeholder="e.g. 19 Donald Lane, Ossining NY" value="' + UI.esc(addr) + '" style="flex:1;padding:12px 14px;border:2px solid var(--border);border-radius:8px;font-size:15px;outline:none;transition:border-color .15s;" onfocus="this.style.borderColor=\'var(--green-dark)\'" onblur="this.style.borderColor=\'var(--border)\'" onkeydown="if(event.key===\'Enter\')PermitsPage._lookup()">'
      + '<button onclick="PermitsPage._lookup()" style="background:var(--green-dark);color:#fff;border:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;">🔍 Check Permits</button>'
      + '</div>'
      + '<div style="margin-top:8px;font-size:12px;color:var(--text-light);">Checks local tree removal / trimming permit requirements for the job address</div>'
      + '</div>';

    if (PermitsPage._loading) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:40px;text-align:center;">'
        + '<div style="font-size:28px;margin-bottom:12px;">⏳</div>'
        + '<div style="font-weight:600;margin-bottom:6px;">Researching permit requirements…</div>'
        + '<div style="font-size:13px;color:var(--text-light);">Checking jurisdiction rules for this address</div>'
        + '</div>';
    } else if (PermitsPage._result) {
      html += PermitsPage._renderResult(PermitsPage._result, PermitsPage._pendingAddress);
    } else {
      // Empty state / quick-start
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:12px;">🌳</div>'
        + '<h3 style="margin:0 0 8px;">Know before you cut</h3>'
        + '<p style="color:var(--text-light);font-size:14px;max-width:420px;margin:0 auto 20px;">Enter the job address above to look up whether a permit is required, the fee, and a direct link to apply.</p>'
        + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">'
        + '<button onclick="document.getElementById(\'permit-address\').value=\'19 Donald Lane, Ossining NY 10562\';PermitsPage._lookup()" style="background:var(--bg);border:1px solid var(--border);padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;">Try: 19 Donald Lane, Ossining</button>'
        + '</div>'
        + '</div>';
    }

    html += '</div>';
    return html;
  },

  // ── Render result card ────────────────────────────────────────────────
  _renderResult: function(r, address) {
    var confColor = r.confidence === 'high' ? '#2e7d32' : r.confidence === 'medium' ? '#e65100' : '#c62828';
    var confLabel = r.confidence === 'high' ? '✓ Verified' : r.confidence === 'medium' ? '~ Estimated' : '⚠ Low confidence — verify with jurisdiction';

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';

    // Result header banner
    html += '<div style="background:' + (r.permit_required ? '#fff8e1' : '#e8f5e9') + ';border-bottom:1px solid var(--border);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-bottom:2px;">' + UI.esc(address || '') + '</div>'
      + '<div style="font-size:18px;font-weight:700;">' + UI.esc(r.jurisdiction || 'Unknown jurisdiction') + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:11px;color:' + confColor + ';font-weight:600;background:' + confColor + '20;padding:3px 10px;border-radius:20px;">' + confLabel + '</span>'
      + '<div style="font-size:22px;">' + (r.permit_required ? '📋' : '✅') + '</div>'
      + '<div style="font-weight:700;font-size:16px;color:' + (r.permit_required ? '#e65100' : '#2e7d32') + ';">'
      + (r.permit_required ? 'Permit Required' : 'No Permit Required') + '</div>'
      + '</div>'
      + '</div>';

    // Detail grid
    html += '<div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;" class="detail-grid">';

    var fields = [
      { label: 'Department', value: r.department },
      { label: 'Size Threshold', value: r.size_threshold },
      { label: 'Permit Fee', value: r.fee },
      { label: 'Processing Time', value: r.processing_time },
      { label: 'Phone', value: r.phone ? '<a href="tel:' + r.phone.replace(/\D/g,'') + '" style="color:var(--accent);">' + UI.esc(r.phone) + '</a>' : null, raw: true },
      { label: 'Email', value: r.email ? '<a href="mailto:' + UI.esc(r.email) + '" style="color:var(--accent);">' + UI.esc(r.email) + '</a>' : null, raw: true }
    ];

    fields.forEach(function(f) {
      if (!f.value) return;
      html += '<div>'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">' + f.label + '</div>'
        + '<div style="font-size:14px;">' + (f.raw ? f.value : UI.esc(f.value)) + '</div>'
        + '</div>';
    });

    html += '</div>';

    // Notes
    if (r.notes) {
      html += '<div style="margin:0 20px 16px;background:var(--bg);border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.6;color:var(--text);">'
        + '<span style="font-weight:600;">📌 Notes: </span>' + UI.esc(r.notes) + '</div>';
    }

    // Action buttons
    html += '<div style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;flex-wrap:wrap;">';

    if (r.portal_url) {
      html += '<a href="' + UI.esc(r.portal_url) + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:var(--green-dark);color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">'
        + '🌐 Open ' + UI.esc(r.portal_name || 'Application Portal') + '</a>';
    }

    if (r.email) {
      html += '<a href="mailto:' + UI.esc(r.email) + '?subject=Tree%20Removal%20Permit%20Inquiry&body=Hello%2C%20I%20am%20a%20tree%20service%20contractor%20inquiring%20about%20a%20permit%20for%20work%20at%20' + encodeURIComponent(address || '') + '.%20Please%20advise%20on%20the%20application%20process.%20Thank%20you." style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);color:var(--text);text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">'
        + '✉️ Email Dept</a>';
    }

    html += '<button onclick="PermitsPage._saveToJob(\'' + UI.esc(address || '') + '\')" style="background:var(--bg);border:1px solid var(--border);padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">'
      + '💾 Save to Job / Quote</button>';

    html += '<button onclick="PermitsPage._result=null;loadPage(\'permits\')" style="background:none;border:none;padding:10px 14px;border-radius:8px;font-size:13px;color:var(--text-light);cursor:pointer;">↩ New search</button>';

    html += '</div></div>';

    if (r.confidence !== 'high') {
      html += '<div style="margin-top:12px;padding:10px 14px;background:#fff3e0;border-radius:8px;font-size:12px;color:#e65100;">'
        + '⚠️ AI-generated estimate — always confirm fees and requirements directly with the ' + UI.esc(r.department || 'building department') + ' before filing.</div>';
    }

    return html;
  },

  // ── Run lookup ────────────────────────────────────────────────────────
  _lookup: function() {
    var input = document.getElementById('permit-address');
    var address = (input ? input.value : PermitsPage._pendingAddress || '').trim();
    if (!address) { UI.toast('Enter a job address first', 'error'); return; }

    PermitsPage._pendingAddress = address;
    PermitsPage._result = null;
    PermitsPage._loading = true;
    loadPage('permits');

    // Check known jurisdictions first (instant)
    var city = PermitsPage._extractCity(address);
    var known = PermitsPage._knownJurisdictions[city];
    if (known) {
      PermitsPage._loading = false;
      PermitsPage._result = known;
      loadPage('permits');
      return;
    }

    // Fall back to AI
    PermitsPage._lookupViaAI(address, function(err, result) {
      PermitsPage._loading = false;
      if (err) {
        PermitsPage._result = {
          jurisdiction: 'Lookup failed',
          permit_required: true,
          notes: err,
          confidence: 'low',
          portal_url: null
        };
      } else {
        PermitsPage._result = result;
      }
      loadPage('permits');
    });
  },

  // ── Save permit info as a note on an existing job/quote ───────────────
  _saveToJob: function(address) {
    var r = PermitsPage._result;
    if (!r) return;

    var note = '🏛️ Permit Research (' + (new Date().toLocaleDateString()) + ')\n'
      + 'Address: ' + address + '\n'
      + 'Jurisdiction: ' + (r.jurisdiction || 'Unknown') + '\n'
      + 'Permit required: ' + (r.permit_required ? 'YES' : 'NO') + '\n'
      + (r.size_threshold ? 'Threshold: ' + r.size_threshold + '\n' : '')
      + (r.fee ? 'Fee: ' + r.fee + '\n' : '')
      + (r.processing_time ? 'Processing: ' + r.processing_time + '\n' : '')
      + (r.portal_url ? 'Portal: ' + r.portal_url + '\n' : '')
      + (r.notes ? 'Notes: ' + r.notes : '');

    // Find open jobs matching address
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (sb) {
      // Try to find a matching job by property address
      var addrKey = address.toLowerCase().replace(/[^a-z0-9]/g, '');
      sb.from('jobs').select('id, title, client_name, property').eq('status', 'scheduled')
        .then(function(res) {
          var jobs = (res.data || []).filter(function(j) {
            return j.property && j.property.toLowerCase().replace(/[^a-z0-9]/g, '').includes(addrKey.substring(0, 8));
          });
          if (jobs.length === 1) {
            // Auto-attach to the one matching job
            sb.from('jobs').update({ notes: note }).eq('id', jobs[0].id)
              .then(function() { UI.toast('Saved to job: ' + (jobs[0].title || jobs[0].client_name)); });
          } else if (jobs.length > 1) {
            // Let user pick
            var opts = jobs.map(function(j) { return { label: (j.client_name || '') + ' — ' + (j.title || ''), fn: 'PermitsPage._attachNote("' + j.id + '","' + encodeURIComponent(note) + '")' }; });
            opts.push({ label: 'Cancel', fn: 'UI.closeModal()' });
            UI.modal('Attach to which job?', '<p style="color:var(--text-light);font-size:13px;">Multiple open jobs found for this address.</p>', opts);
          } else {
            // No job found — copy to clipboard
            UI.toast('No matching job found — note copied to clipboard');
            try { navigator.clipboard.writeText(note); } catch(e) {}
          }
        });
    } else {
      // No Supabase — just copy
      try { navigator.clipboard.writeText(note); UI.toast('Permit info copied to clipboard'); } catch(e) { UI.toast('Copied to clipboard'); }
    }
  },

  _attachNote: function(jobId, encodedNote) {
    var note = decodeURIComponent(encodedNote);
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    UI.closeModal();
    if (!sb) return;
    sb.from('jobs').update({ notes: note }).eq('id', jobId)
      .then(function(res) {
        if (res.error) UI.toast('Failed to save', 'error');
        else UI.toast('Permit info saved to job');
      });
  }
};
