/**
 * Branch Manager — UI Components
 * Reusable modal, form builder, table builder, status badges
 */
var UI = (function() {

  // ── Modal / Full-Page Dialog ──
  // v201: by default, "modals" render as a full page (no more popups).
  // Pass { keepModal: true } to keep the old popup behavior (used by UI.confirm).
  window._bmPageStack = window._bmPageStack || [];

  function _renderAsPage(title, content, options) {
    options = options || {};
    var pageTitleEl = document.getElementById('pageTitle');
    var pageContentEl = document.getElementById('pageContent');
    var pageActionEl = document.getElementById('pageAction');
    if (!pageContentEl) {
      // Fallback — render as modal if the page shell isn't available
      return _renderAsModal(title, content, options);
    }
    // Snapshot current page so closeModal() can restore it
    window._bmPageStack.push({
      page: window._currentPage || null,
      title: pageTitleEl ? pageTitleEl.textContent : '',
      content: pageContentEl.innerHTML,
      actionDisplay: pageActionEl ? pageActionEl.style.display : 'none',
      actionText: pageActionEl ? pageActionEl.textContent : '',
      actionOnclick: pageActionEl ? pageActionEl.onclick : null
    });

    var backBtn = '<button class="btn btn-outline" onclick="UI.closeModal()" style="padding:6px 12px;font-size:12px;">← Back</button>';
    var footerHtml = options.footer
      ? '<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">' + options.footer + '</div>'
      : '';
    var pageHtml = '<div class="bm-dialog-page" style="max-width:' + (options.wide ? '1000px' : '760px') + ';margin:0 auto;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap;">'
      +   backBtn
      + '</div>'
      + '<div>' + content + '</div>'
      + footerHtml
      + '</div>';

    if (pageTitleEl) pageTitleEl.textContent = title;
    pageContentEl.innerHTML = pageHtml;
    if (pageActionEl) pageActionEl.style.display = 'none';
    // Scroll to top so user sees the back button
    try { window.scrollTo(0, 0); } catch(e){}
    if (typeof lucide !== 'undefined') { try { lucide.createIcons(); } catch(e){} }
    return null;
  }

  function _renderAsModal(title, content, options) {
    options = options || {};
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal' + (options.wide ? ' modal-wide' : '') + (options.full ? ' modal-full' : '') + '">'
      + '<div class="modal-header">'
      + '<h3>' + title + '</h3>'
      + '<button class="modal-close" onclick="UI.closeModal()">&times;</button>'
      + '</div>'
      + '<div class="modal-body">' + content + '</div>'
      + (options.footer ? '<div class="modal-footer">' + options.footer + '</div>' : '')
      + '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) UI.closeModal(); });

    // ESC key closes the modal
    var escHandler = function(e) { if (e.key === 'Escape') UI.closeModal(); };
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('open'); });
    return overlay;
  }

  function showModal(title, content, options) {
    options = options || {};
    if (options.keepModal) return _renderAsModal(title, content, options);
    return _renderAsPage(title, content, options);
  }

  function closeModal() {
    // If there's an actual modal overlay, close it first
    var m = document.querySelector('.modal-overlay');
    if (m) {
      if (m._escHandler) document.removeEventListener('keydown', m._escHandler);
      m.classList.remove('open');
      setTimeout(function() { m.remove(); }, 200);
      return;
    }
    // Otherwise pop the page stack (full-page dialog -> previous page)
    var stack = window._bmPageStack || [];
    // v631: if stack is empty BUT there's a dialog still rendered in
    // #pageContent (the bm-dialog-page wrapper), Cancel/Back was clicked
    // after page-stack state was lost (reload, edge case). Fall back to
    // loading the previous page from localStorage, or dashboard.
    if (stack.length === 0) {
      var dialogStillThere = document.querySelector('.bm-dialog-page');
      if (dialogStillThere && typeof loadPage === 'function') {
        var fallback = 'dashboard';
        try { var last = localStorage.getItem('bm-last-page'); if (last && last !== window._currentPage) fallback = last; } catch(e){}
        loadPage(fallback, { force: true });
      }
      return;
    }
    var prev = stack.pop();
    // v632: restore the snapshot UNCONDITIONALLY first — wipes the dialog
    // out of pageContent immediately. Then attempt loadPage as a refresh
    // for fresh data. If loadPage fails (auth, render error, etc.) the
    // user STILL sees the underlying page from the snapshot, never a
    // stuck dialog. v631 fix had a bug: it relied on loadPage succeeding
    // to clear the dialog, so any loadPage failure left the form visible.
    var pageTitleEl = document.getElementById('pageTitle');
    var pageContentEl = document.getElementById('pageContent');
    var pageActionEl = document.getElementById('pageAction');
    if (pageTitleEl) pageTitleEl.textContent = prev.title;
    if (pageContentEl) pageContentEl.innerHTML = prev.content;
    if (pageActionEl) {
      pageActionEl.style.display = prev.actionDisplay;
      if (prev.actionText) pageActionEl.textContent = prev.actionText;
      pageActionEl.onclick = prev.actionOnclick;
    }
    // Now refresh with fresh data — but don't depend on it
    if (prev.page && typeof loadPage === 'function') {
      try { loadPage(prev.page, { force: true }); } catch(e){}
    }
  }

  // ── Status Badge ──
  function statusBadge(status) {
    var map = {
      active: 'status-active', lead: 'status-lead', new: 'status-new',
      scheduled: 'status-sent', late: 'status-late', completed: 'status-active',
      cancelled: 'status-draft', draft: 'status-draft', sent: 'status-sent',
      awaiting: 'status-sent', approved: 'status-active', declined: 'status-late',
      paid: 'status-paid', overdue: 'status-late', upcoming: 'status-sent'
    };
    return '<span class="status-badge ' + (map[status] || 'status-draft') + '">' + (status || '—') + '</span>';
  }

  // ── HTML Escaping (XSS protection) ──
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Format helpers ──
  function money(n) { return '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function moneyInt(n) { return '$' + Math.round(n || 0).toLocaleString(); }
  function dateShort(d) {
    if (!d) return '—';
    var dt;
    // Handle ISO timestamps (from Supabase) and plain dates
    if (d.length > 10) {
      dt = new Date(d);
    } else {
      dt = new Date(d + 'T12:00:00');
    }
    if (isNaN(dt.getTime())) return '—';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear();
  }
  function dateRelative(d) {
    if (!d) return '—';
    var now = new Date(); var dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    var diff = Math.floor((now - dt) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return diff + ' days ago';
    return dateShort(d);
  }
  function phone(p) {
    if (!p) return '—';
    var d = p.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.substr(1);
    if (d.length === 10) return '(' + d.substr(0,3) + ') ' + d.substr(3,3) + '-' + d.substr(6);
    return p;
  }

  // ── Form Builder ──
  // v623: address autocomplete via Photon (https://photon.komoot.io/) — free
  // OSM-based geocoder, no API key required, CORS-enabled. Mirrors the Google
  // Places dropdown that Jobber uses on its property-address field.
  //
  // Bind with: UI.bindAddressAutocomplete('input-id', { onPick: function(addr,feat){...} })
  // Behavior: 250ms debounce, 5 results, biased to the US, dropdown anchored
  // below the input, keyboard ↑↓⏎ navigable, click outside to close.
  function bindAddressAutocomplete(inputId, opts) {
    opts = opts || {};
    var input = document.getElementById(inputId);
    if (!input) return;
    if (input._addrAutocompleteBound) return; // idempotent
    input._addrAutocompleteBound = true;

    // Position dropdown anchored to input's parent
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;box-shadow:0 4px 12px rgba(0,0,0,.08);z-index:20;max-height:280px;overflow-y:auto;display:none;';
    var parent = input.parentNode;
    // Make parent the positioning context
    if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(wrap);

    var sel = -1;
    var feats = [];

    function close() { wrap.style.display = 'none'; sel = -1; }

    function fmt(props) {
      var hn = (props.housenumber || '').trim();
      var st = (props.street || props.name || '').trim();
      var line1 = (hn + ' ' + st).trim();
      var city = props.city || props.county || '';
      var state = props.state || '';
      var zip = props.postcode || '';
      var line2 = [city, state, zip].filter(Boolean).join(', ');
      return { line1: line1, line2: line2, full: [line1, city, state, zip].filter(Boolean).join(', ') };
    }

    function render() {
      if (!feats.length) { close(); return; }
      wrap.innerHTML = feats.map(function(f, i) {
        var p = fmt(f.properties);
        var bg = i === sel ? 'var(--green-bg)' : '#fff';
        return '<div data-idx="' + i + '" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:' + bg + ';">'
          + '<div style="font-size:14px;font-weight:600;">' + esc(p.line1 || (f.properties.name || '')) + '</div>'
          + (p.line2 ? '<div style="font-size:12px;color:var(--text-light);">' + esc(p.line2) + '</div>' : '')
          + '</div>';
      }).join('');
      wrap.style.display = 'block';
    }

    function pick(i) {
      var f = feats[i]; if (!f) return;
      var p = fmt(f.properties);
      input.value = p.full;
      close();
      if (typeof opts.onPick === 'function') opts.onPick(p.full, f);
    }

    var debounce;
    input.addEventListener('input', function() {
      clearTimeout(debounce);
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      debounce = setTimeout(function() {
        // Bias to US; client-side fetch — no key needed
        var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=5&lang=en';
        fetch(url).then(function(r) { return r.json(); }).then(function(d) {
          // Filter to US results when possible
          var all = (d && d.features) || [];
          var us = all.filter(function(f) { return (f.properties && f.properties.country === 'United States'); });
          feats = us.length ? us : all;
          sel = -1;
          render();
        }).catch(function() { /* network error — silently no-op */ });
      }, 250);
    });

    input.addEventListener('keydown', function(e) {
      if (wrap.style.display === 'none') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(feats.length - 1, sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'Enter') { if (sel >= 0) { e.preventDefault(); pick(sel); } }
      else if (e.key === 'Escape') { close(); }
    });

    wrap.addEventListener('mousedown', function(e) {
      var target = e.target.closest('[data-idx]');
      if (!target) return;
      e.preventDefault(); // keep input focus
      pick(parseInt(target.getAttribute('data-idx'), 10));
    });

    document.addEventListener('mousedown', function(e) {
      if (e.target !== input && !wrap.contains(e.target)) close();
    });
  }

  // v634: searchable client picker — replaces the no-search native <select>
  // that became unusable as the client list grew.
  //
  // Bind: UI.bindClientPicker(inputId, { clients: [...], onPick: function(client){...} })
  // The input doubles as filter (debounced) + display ("Picked: Doug Brown").
  // Clear via the X button — restores empty state and calls onPick(null).
  function bindClientPicker(inputId, opts) {
    opts = opts || {};
    var input = document.getElementById(inputId);
    if (!input) return;
    if (input._clientPickerBound) return;
    input._clientPickerBound = true;
    var clients = (opts.clients || []).slice();

    // Build dropdown wrapper
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;box-shadow:0 4px 12px rgba(0,0,0,.08);z-index:30;max-height:280px;overflow-y:auto;display:none;';
    var parent = input.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(wrap);

    function close() { wrap.style.display = 'none'; }

    function render(matches) {
      if (!matches.length) { close(); return; }
      wrap.innerHTML = matches.slice(0, 8).map(function(c, i) {
        var line2 = [c.phone, (c.address || '').split(',')[0]].filter(Boolean).join(' · ');
        return '<div data-cid="' + esc(c.id) + '" style="padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--border);">'
          + '<div style="font-size:14px;font-weight:600;">' + esc(c.name || '(no name)') + '</div>'
          + (line2 ? '<div style="font-size:12px;color:var(--text-light);">' + esc(line2) + '</div>' : '')
          + '</div>';
      }).join('');
      wrap.style.display = 'block';
    }

    function filter(q) {
      q = (q || '').toLowerCase().trim();
      if (!q) { close(); return; }
      var matches = clients.filter(function(c) {
        if (!c) return false;
        return ((c.name || '').toLowerCase().indexOf(q) >= 0)
          || ((c.phone || '').toLowerCase().indexOf(q) >= 0)
          || ((c.email || '').toLowerCase().indexOf(q) >= 0)
          || ((c.address || '').toLowerCase().indexOf(q) >= 0);
      });
      render(matches);
    }

    var debounce;
    input.addEventListener('input', function() {
      clearTimeout(debounce);
      debounce = setTimeout(function() { filter(input.value); }, 100);
    });
    input.addEventListener('focus', function() { if (input.value) filter(input.value); });

    wrap.addEventListener('mousedown', function(e) {
      var target = e.target.closest('[data-cid]');
      if (!target) return;
      e.preventDefault(); // keep input focus so blur doesn't close
      var cid = target.getAttribute('data-cid');
      var c = clients.find(function(x) { return x.id === cid; });
      if (c) {
        input.value = c.name;
        close();
        if (typeof opts.onPick === 'function') opts.onPick(c);
      }
    });

    document.addEventListener('mousedown', function(e) {
      if (e.target !== input && !wrap.contains(e.target)) close();
    });
  }

  // v621: Jobber-style muted section label for grouping form fields.
  // Use to break a long form (quote, client intake) into scannable chunks
  // separated by a thin top border + small caps muted heading.
  // Pass `hint` for an optional sub-label, `tight` to skip the top margin
  // (use on the first section after a card opens).
  function formSection(label, opts) {
    opts = opts || {};
    var marginTop = opts.tight ? '0' : '20px';
    return '<div style="margin:' + marginTop + ' 0 10px;padding-top:' + (opts.tight ? '0' : '14px') + ';'
      + (opts.tight ? '' : 'border-top:1px solid var(--border);')
      + 'display:flex;align-items:baseline;justify-content:space-between;gap:8px;">'
      +   '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-light);">' + esc(label) + '</div>'
      +   (opts.hint ? '<div style="font-size:11px;color:var(--text-light);">' + esc(opts.hint) + '</div>' : '')
      + '</div>';
  }

  function formField(label, type, id, value, options) {
    options = options || {};
    // v626: when icon is provided, render a left-icon row (Jobber pattern).
    //       when noLabel: true, skip the label entirely (placeholder doubles as label).
    //       Use a sensible default placeholder = the label minus trailing " *" if not given.
    var placeholder = options.placeholder;
    if (placeholder == null && options.noLabel) {
      placeholder = String(label || '').replace(/\s*\*\s*$/, '');
    }

    var inputHtml;
    if (type === 'textarea') {
      inputHtml = '<textarea id="' + id + '" rows="' + (options.rows || 3) + '" placeholder="' + esc(placeholder || '') + '">' + esc(value || '') + '</textarea>';
    } else if (type === 'select') {
      inputHtml = '<select id="' + id + '"' + (options.onchange ? ' onchange="' + esc(options.onchange) + '"' : '') + '>';
      (options.options || []).forEach(function(o) {
        var val = typeof o === 'object' ? o.value : o;
        var lab = typeof o === 'object' ? o.label : o;
        inputHtml += '<option value="' + val + '"' + (val === value ? ' selected' : '') + '>' + lab + '</option>';
      });
      inputHtml += '</select>';
    } else {
      inputHtml = '<input type="' + type + '" id="' + id + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"' + (options.required ? ' required' : '') + (options.onchange ? ' onchange="' + esc(options.onchange) + '"' : '') + '>';
    }

    var html = '<div class="form-group">';
    if (!options.noLabel) {
      html += '<label for="' + id + '">' + label + '</label>';
    }
    if (options.icon) {
      // Icon to the LEFT of the input — flex row with 24px icon column + flex:1 input column.
      html += '<div style="display:flex;align-items:center;gap:12px;">'
        +   '<i data-lucide="' + esc(options.icon) + '" style="width:22px;height:22px;color:var(--text-light);flex-shrink:0;"></i>'
        +   '<div style="flex:1;min-width:0;">' + inputHtml + '</div>'
        + '</div>';
    } else {
      html += inputHtml;
    }
    html += '</div>';
    return html;
  }

  // ── Stat Card ──
  function statCard(label, value, sub, trend, trendText, onclick) {
    return '<div class="stat-card"' + (onclick ? ' onclick="' + onclick + '" style="cursor:pointer;"' : '') + '>'
      + '<div class="stat-label">' + label + '</div>'
      + '<div class="stat-value">' + value + '</div>'
      + (sub ? '<div class="stat-sub">' + sub + (trendText ? ' <span class="stat-trend ' + trend + '">' + trendText + '</span>' : '') + '</div>' : '')
      + '</div>';
  }

  // ── Empty State ──
  function emptyState(icon, title, desc, actionText, actionFn) {
    return '<div class="empty-state">'
      + '<div class="empty-icon">' + icon + '</div>'
      + '<h3>' + title + '</h3>'
      + '<p>' + desc + '</p>'
      + (actionText ? '<button class="btn btn-primary" style="margin-top:16px;" onclick="' + actionFn + '">' + actionText + '</button>' : '')
      + '</div>';
  }

  // ── Confirm Dialog ──
  function confirm(message, onYes, onNo) {
    window._uiConfirmYes = onYes;
    window._uiConfirmNo = onNo;
    showModal('Confirm', '<p style="font-size:15px;margin-bottom:16px;">' + message + '</p>',
      { keepModal: true, footer: '<button class="btn btn-outline" onclick="UI.closeModal();if(window._uiConfirmNo)window._uiConfirmNo();">Cancel</button> <button class="btn btn-primary" onclick="UI.closeModal();if(window._uiConfirmYes)window._uiConfirmYes();">Yes, Continue</button>' });
  }

  // ── Toast / Notification ──
  function toast(message, type) {
    type = type || 'success';
    var t = document.createElement('div');
    t.className = 'toast toast-' + type;
    // Error toasts stay until the user dismisses them so they can copy the message.
    // (v386: previous behavior auto-dismissed after 3s, which made cloud-save
    // failures hard to debug — Doug couldn't read fast enough to copy them.)
    var sticky = (type === 'error');
    if (sticky) {
      t.style.cursor = 'text';
      t.title = 'Click X to dismiss';
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '\u00d7';
      closeBtn.setAttribute('aria-label', 'Dismiss');
      closeBtn.style.cssText = 'background:none;border:none;color:inherit;font-size:18px;font-weight:700;cursor:pointer;margin-left:12px;padding:0 4px;line-height:1;opacity:.7;';
      closeBtn.onmouseover = function(){ this.style.opacity = '1'; };
      closeBtn.onmouseout  = function(){ this.style.opacity = '.7'; };
      closeBtn.onclick = function(e){ e.stopPropagation(); t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 300); };
      var msgEl = document.createElement('span');
      msgEl.textContent = message;
      msgEl.style.userSelect = 'text';
      t.appendChild(msgEl);
      t.appendChild(closeBtn);
    } else {
      t.textContent = message;
    }
    document.body.appendChild(t);
    requestAnimationFrame(function() { t.classList.add('show'); });
    if (!sticky) {
      setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
    }
  }

  // ── Loading Spinner ──
  function showLoading(text) {
    var el = document.getElementById('pageContent');
    if (el) el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;gap:16px;">'
      + '<div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;"></div>'
      + '<span style="font-size:14px;color:var(--text-light);">' + (text || 'Loading...') + '</span></div>';
  }

  // ── Validate Required Fields ──
  function validateForm(fields) {
    var errors = [];
    fields.forEach(function(f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      var val = el.value.trim();
      if (f.required && !val) {
        errors.push(f.label + ' is required');
        el.style.borderColor = '#e53e3e';
        el.style.background = '#fff5f5';
      } else if (f.type === 'email' && val && !/\S+@\S+\.\S+/.test(val)) {
        errors.push(f.label + ' must be a valid email');
        el.style.borderColor = '#e53e3e';
      } else if (f.type === 'phone' && val && val.replace(/\D/g,'').length < 10) {
        errors.push(f.label + ' must be a valid phone number');
        el.style.borderColor = '#e53e3e';
      } else {
        el.style.borderColor = '';
        el.style.background = '';
      }
    });
    if (errors.length) {
      toast(errors[0], 'error');
      return false;
    }
    return true;
  }

  // ── Time Ago (short) ──
  function timeAgo(d) {
    if (!d) return '';
    var s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    if (s < 604800) return Math.floor(s/86400) + 'd ago';
    return dateShort(d.split('T')[0]);
  }

  return {
    showModal: showModal,
    closeModal: closeModal,
    statusBadge: statusBadge,
    money: money,
    moneyInt: moneyInt,
    dateShort: dateShort,
    dateRelative: dateRelative,
    timeAgo: timeAgo,
    phone: phone,
    formField: formField,
    formSection: formSection,
    bindAddressAutocomplete: bindAddressAutocomplete,
    bindClientPicker: bindClientPicker,
    statCard: statCard,
    emptyState: emptyState,
    confirm: confirm,
    toast: toast,
    showLoading: showLoading,
    validateForm: validateForm,
    esc: esc
  };
})();
