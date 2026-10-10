/**
 * OnboardingSig — Shared digital signature + auto-fill library
 * Reusable canvas signature pads for all onboarding documents
 * Based on the proven e-signature implementation in approve.html
 */
var OnboardingSig = {

  // ── Get employee data from intake form ──
  getEmployee: function() {
    try { return JSON.parse(localStorage.getItem('new-hire-data') || '{}'); } catch(e) { return {}; }
  },

  // ── Show "Pre-filled for X" banner ──
  showBanner: function(name) {
    if (document.getElementById('sig-autofill-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'sig-autofill-banner';
    banner.style.cssText = 'background:#e8f5e9;border:1px solid #22c55e;border-radius:8px;padding:10px 16px;text-align:center;margin:0 0 16px;font-size:13px;color:#166534;font-weight:600;';
    banner.textContent = '\u2705 Pre-filled for ' + name + ' from intake form. Review and sign below.';
    var first = document.querySelector('.wrap') || document.querySelector('.container') || document.body;
    if (first && first.firstChild) first.insertBefore(banner, first.firstChild);
    else document.body.insertBefore(banner, document.body.children[1] || null);
  },

  // ── Auto-fill DOM elements from employee data ──
  autoFill: function(mappings) {
    var emp = OnboardingSig.getEmployee();
    if (!emp || !emp.fullName) return null;
    Object.keys(mappings).forEach(function(selector) {
      var el = document.querySelector(selector) || document.getElementById(selector);
      if (!el) return;
      var val = typeof mappings[selector] === 'function' ? mappings[selector](emp) : emp[mappings[selector]];
      if (val === undefined || val === null) return;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        el.value = val;
      } else {
        el.textContent = val;
      }
    });
    OnboardingSig.showBanner(emp.fullName);
    return emp;
  },

  // ── Auto-fill any name-ish input on the page (no per-file mapping needed) ──
  // For docs that just need the employee's name in their signature input,
  // call OnboardingSig.autoFillAll() once — it sweeps inputs with id/name/
  // placeholder matching name|signature|employee and fills with fullName.
  // Idempotent: skips fields that already have a value.
  autoFillAll: function() {
    var emp = OnboardingSig.getEmployee();
    if (!emp || !emp.fullName) return null;
    var filled = 0;
    var inputs = document.querySelectorAll('input[type=text], input:not([type]), input[type=email]');
    inputs.forEach(function(el) {
      if (el.value && el.value.trim()) return;
      if (el.readOnly || el.disabled) return;
      var hay = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '')).toLowerCase();
      if (/(^|[^a-z])(sig|name|employee|fullname|signature|signed)/i.test(hay)) {
        if (/email/i.test(hay) && emp.email) { el.value = emp.email; filled++; }
        else { el.value = emp.fullName; filled++; }
      }
    });
    // Date fields → today's date
    var dateInputs = document.querySelectorAll('input[type=date]');
    var todayIso = new Date().toISOString().slice(0,10);
    dateInputs.forEach(function(el) {
      if (!el.value) { el.value = todayIso; filled++; }
    });
    if (filled) OnboardingSig.showBanner(emp.fullName);
    return { filled: filled, employee: emp };
  },

  // ── Create a signature pad inside a container ──
  createPad: function(containerId, options) {
    options = options || {};
    var docKey = options.docKey || 'doc';
    var padId = options.id || containerId;
    var label = options.label || 'Signature';
    var prefillName = options.prefillName || '';
    var showConsent = options.showConsent !== false;
    var onComplete = options.onComplete || function() {};
    var storageKey = 'sig-' + docKey + '-' + padId;

    var container = document.getElementById(containerId);
    if (!container) return;

    // Check if already signed — show read-only
    if (OnboardingSig.restore(storageKey, container)) return;

    var canvasId = 'sig-canvas-' + padId;
    var nameId = 'sig-name-' + padId;
    var consentId = 'sig-consent-' + padId;

    var html = '<div class="sig-pad-wrap" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-top:16px;">'
      + '<div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:10px;">\u270e ' + label + '</div>'
      + '<canvas id="' + canvasId + '" width="700" height="200" style="width:100%;height:150px;border:2px solid #1a3c12;border-radius:8px;background:#fff;touch-action:none;cursor:crosshair;display:block;"></canvas>'
      + '<button type="button" onclick="OnboardingSig._clearCanvas(\'' + canvasId + '\')" style="margin-top:6px;padding:4px 12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;color:#64748b;cursor:pointer;">Clear</button>'
      + '<div style="margin-top:10px;">'
      + '<input type="text" id="' + nameId + '" value="' + (prefillName || '').replace(/"/g, '&quot;') + '" placeholder="Print full name" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:14px;">'
      + '</div>';

    if (showConsent) {
      html += '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:12px;color:#64748b;cursor:pointer;">'
        + '<input type="checkbox" id="' + consentId + '" style="margin-top:2px;width:16px;height:16px;accent-color:#1b5e20;flex-shrink:0;">'
        + ' I consent to signing electronically. My electronic signature has the same legal effect as a handwritten signature under the federal ESIGN Act.'
        + '</label>';
    }

    html += '<button type="button" onclick="OnboardingSig._submit(\'' + storageKey + '\',\'' + canvasId + '\',\'' + nameId + '\',\'' + consentId + '\',\'' + containerId + '\')" '
      + 'style="width:100%;margin-top:12px;padding:12px;background:#1b5e20;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">'
      + 'Sign & Complete</button>'
      + '</div>';

    container.innerHTML = html;

    // Init canvas drawing
    setTimeout(function() { OnboardingSig._initCanvas(canvasId); }, 50);
  },

  // ── Init canvas drawing (mouse + touch) ──
  _initCanvas: function(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || canvas._inited) return;
    canvas._inited = true;
    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1a3c12';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var drawing = false;

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var sx = canvas.width / r.width, sy = canvas.height / r.height;
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      var cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
    }
    canvas.addEventListener('mousedown', function(e) { drawing = true; ctx.beginPath(); var p = pos(e); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', function(e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mouseup', function() { drawing = false; });
    canvas.addEventListener('mouseleave', function() { drawing = false; });
    canvas.addEventListener('touchstart', function(e) { e.preventDefault(); drawing = true; ctx.beginPath(); var p = pos(e); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove', function(e) { e.preventDefault(); if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchend', function() { drawing = false; });
  },

  // ── Clear canvas ──
  _clearCanvas: function(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  },

  // ── Check if canvas is empty ──
  _isEmpty: function(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return true;
    var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (var i = 3; i < data.length; i += 4) { if (data[i] > 0) return false; }
    return true;
  },

  // ── Submit signature ──
  _submit: function(storageKey, canvasId, nameId, consentId, containerId) {
    var nameEl = document.getElementById(nameId);
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) { alert('Please type your full name.'); return; }
    if (OnboardingSig._isEmpty(canvasId)) { alert('Please draw your signature above.'); return; }
    var consentEl = document.getElementById(consentId);
    if (consentEl && !consentEl.checked) { alert('Please check the consent box.'); return; }

    var canvas = document.getElementById(canvasId);
    var record = {
      signaturePNG: canvas ? canvas.toDataURL('image/png') : '',
      printedName: name,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    // Save immediately (IP updates async)
    localStorage.setItem(storageKey, JSON.stringify(record));

    // Cloud-backup signatures so they survive a browser-cache wipe.
    // Added May 2 — onboarding_signatures table, RLS-scoped to SNT tenant.
    var pushToCloud = function(rec) {
      try {
        var emp = JSON.parse(localStorage.getItem('new-hire-data') || '{}');
        var parts = storageKey.split('-');
        var docKey = parts[1] || 'unknown';
        var padId  = parts.slice(2).join('-') || 'main';
        var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
        fetch('https://ltpivkqahvplapyagljt.supabase.co/rest/v1/onboarding_signatures', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': ANON,
            'Authorization': 'Bearer ' + ANON,
            'Prefer': 'return=minimal,resolution=merge-duplicates'
          },
          body: JSON.stringify({
            tenant_id: '93af4348-8bba-4045-ac3e-5e71ec1cc8c5',
            employee_name: emp.fullName || rec.printedName,
            doc_key: docKey,
            pad_id: padId,
            signature_png: rec.signaturePNG,
            printed_name: rec.printedName,
            ip: rec.ip || '',
            user_agent: rec.userAgent,
            signed_at: rec.timestamp
          })
        }).then(function(r) {
          if (!r.ok) r.text().then(function(t) { console.warn('[OnboardingSig] cloud push ' + r.status + ': ' + t.slice(0, 200)); });
        }).catch(function(e) { console.warn('[OnboardingSig] offline — local only:', e); });
      } catch(e) { console.warn('[OnboardingSig] cloud push error:', e); }
    };

    // Async: capture IP, then push to cloud
    try {
      fetch('https://api.ipify.org?format=json').then(function(r) { return r.json(); }).then(function(d) {
        record.ip = d.ip || '';
        localStorage.setItem(storageKey, JSON.stringify(record));
        pushToCloud(record);
      }).catch(function() {
        pushToCloud(record);
      });
    } catch(e) {
      pushToCloud(record);
    }

    // Show saved state
    var container = document.getElementById(containerId);
    if (container) OnboardingSig._showSaved(container, record);

    // Notify parent iframe
    try { window.parent.postMessage('step-complete', '*'); } catch(e) {}
  },

  // ── Show saved signature (read-only) ──
  _showSaved: function(container, record) {
    var date = new Date(record.timestamp);
    var dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    container.innerHTML = '<div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:10px;padding:16px;margin-top:16px;">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
      + '<span style="font-size:18px;">\u2705</span>'
      + '<span style="font-size:14px;font-weight:700;color:#166534;">Signed by ' + record.printedName + '</span>'
      + '</div>'
      + '<img src="' + record.signaturePNG + '" style="width:100%;max-width:400px;height:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;display:block;">'
      + '<div style="font-size:11px;color:#64748b;margin-top:8px;">' + dateStr + '</div>'
      + '</div>';
  },

  // ── Restore saved signature into container ──
  restore: function(storageKey, container) {
    try {
      var saved = localStorage.getItem(storageKey);
      if (!saved) return false;
      var record = JSON.parse(saved);
      if (!record.signaturePNG) return false;
      OnboardingSig._showSaved(container, record);
      return true;
    } catch(e) { return false; }
  }
};
