/**
 * Branch Manager — Payroll + Week View
 * Gusto-style weekly timesheet with approval system
 * Mobile-first, iPhone-optimized
 * v1
 */
var PayrollPage = {

  // "2026-08-18T16:17:00Z" -> "4:17 PM"
  _ampm: function(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  // Tapping a day in the grid header drives the truck panel below.
  _pickDay: function(d) {
    PayrollPage._bDate = d;
    if (typeof loadPage === 'function') loadPage('payroll');
  },
  _weekOffset: 0,
  _expandedCells: {},
  _selectedEmployees: {},
  _approvals: null,
  _approvalsLoaded: false,
  _lastRun: null,

  // ── Helpers ──
  // v1117: parse a 'YYYY-MM-DD' at NOON local. new Date('2026-08-10') parses as
  // UTC midnight → in the evening ET that's still Aug 9 locally, so getDate()
  // showed the wrong day (grid read "MON 9 … THU 12" for the Aug 10–16 week).
  _pDate: function(s) {
    return (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? new Date(s + 'T12:00:00') : new Date(s);
  },
  _getWeekDates: function(offset) {
    var now = new Date();
    now.setHours(12, 0, 0, 0);   // v1116: noon-anchor so toISOString/tz never rolls the day.
    now.setDate(now.getDate() + (offset || 0) * 7);
    var monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    var dates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      // Build the Y-M-D from LOCAL parts — NOT toISOString() (which is UTC and,
      // in the evening ET, shifted Monday to the 11th → whole week off by one).
      dates.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
    }
    return dates;
  },

  // v743: approvals are now cloud-synced via the payroll_approvals
  // table. localStorage is a write-through cache so the UI is instant
  // while a background insert/upsert hits Supabase. On page open we
  // also pull-merge cloud rows so iPhone↔desktop stays in sync.
  _getApprovals: function() {
    if (!PayrollPage._approvals) {
      try { PayrollPage._approvals = JSON.parse(localStorage.getItem('bm-payroll-approvals') || '{}'); } catch(e) { PayrollPage._approvals = {}; }
    }
    if (!PayrollPage._approvalsLoaded) {
      PayrollPage._approvalsLoaded = true;
      PayrollPage._pullCloudApprovals();
    }
    return PayrollPage._approvals;
  },

  _saveApprovals: function() {
    localStorage.setItem('bm-payroll-approvals', JSON.stringify(PayrollPage._approvals || {}));
  },

  _pullCloudApprovals: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    // Pull last 90 days so we don't bloat memory
    var cutoff = new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10);
    sb.from('payroll_approvals').select('*').gte('week_start', cutoff).then(function(r) {
      if (r.error || !r.data) return;
      var changed = false;
      r.data.forEach(function(row) {
        var key = row.day
          ? (row.employee_name + '_day_' + row.day)
          : (row.employee_name + '_' + row.week_start);
        var prev = PayrollPage._approvals[key];
        if (prev !== row.status) { PayrollPage._approvals[key] = row.status; changed = true; }
        if (row.edited_after) {
          var ea = key + '_editedAfter';
          if (!PayrollPage._approvals[ea]) { PayrollPage._approvals[ea] = true; changed = true; }
        }
      });
      if (changed) {
        PayrollPage._saveApprovals();
        // Only re-render if user is still on the payroll page
        if (window.currentPage === 'payroll') loadPage('payroll');
      }
    });
  },

  _pushCloudApproval: function(employeeName, weekStart, day, status, editedAfter) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!tenantId) return;
    var approvedBy = (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : null;
    var row = {
      tenant_id: tenantId,
      employee_name: employeeName,
      week_start: weekStart,
      day: day || null,
      status: status,
      edited_after: !!editedAfter,
      approved_by: approvedBy,
      approved_at: new Date().toISOString()
    };
    sb.from('payroll_approvals')
      .upsert(row, { onConflict: 'tenant_id,employee_name,week_start,day' })
      .then(function(r) {
        if (r.error) console.warn('payroll_approvals upsert failed:', r.error.message);
      });
  },

  _deleteCloudApproval: function(employeeName, weekStart, day) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    var q = sb.from('payroll_approvals').delete()
      .eq('employee_name', employeeName).eq('week_start', weekStart);
    q = day ? q.eq('day', day) : q.is('day', null);
    q.then(function(){});
  },

  _getEmployees: function() {
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
    if (team.length === 0) {
      team = [{ id: 'owner', name: CompanyInfo.get('ownerName') || 'Owner', role: 'owner', rate: 0, active: true }];
    }
    // v1086: commission roles (Michelle) are excluded from the hours grid —
    // they're paid per-sale, not per-hour (Doug 8/6). Commission enters
    // payroll as its own run line when a payout is recorded, never as time.
    // v1135: subcontractors (Braxton) likewise — a sub invoices us, he is not
    // on payroll at all (Doug 8/19). Payroll = people we cut a paycheck to.
    var OFF_PAYROLL = ['commission', 'subcontractor'];
    return team.filter(function(t) {
      // v1139: the cloud column is employment_type, but the snake->camel sync
      // hands the client employmentType — so reading only the snake_case name
      // returned undefined and NOBODY was ever filtered. Braxton (sub) and
      // Michelle (commission) kept showing in the hours grid. Read both.
      var et = t.employmentType || t.employment_type || '';
      return t.active !== false && OFF_PAYROLL.indexOf(et) === -1;
    });
  },

  // v1134: callers pass emp.name, but only ~1/3 of cloud time_entries carry the
  // name in user_id — the rest have user_id NULL and the name in user_name
  // (→ userName after snake→camel sync). Matching on userId alone made 211 of
  // 323 entries invisible, so every hours cell rendered 0.0.
  _getEntriesForDate: function(userId, date) {
    var hits = DB.timeEntries.getAll().filter(function(t) {
      var user = t.userId || t.user || t.userName || '';
      var entryDate = (t.date || (t.clockIn || '').substring(0, 10));
      return user === userId && entryDate === date;
    });

    // v1139: DE-DUPE AUTO ROWS.
    // The GPS sync deletes and re-inserts auto rows when crew attribution
    // changes, so the replacement gets a NEW id. A device holding the old row
    // in its local cache then showed BOTH — Doug's Wed Aug 19 rendered 7.0h
    // twice as 14.0, and David's stale 8.0 + new 7.0 read as 15.0. The cloud
    // table was correct the whole time; only the cached copy was stale.
    // Auto rows are one-per-person-per-day by design (partial unique index),
    // so more than one here is always a stale duplicate — keep the newest.
    // Manual entries are NEVER collapsed: a real split shift is legitimate.
    // v1141: match ANY auto-generated row, not just source==='auto-bouncie'.
    // David's stale Wed row carried a different/blank source (older sync format)
    // so it survived the first pass and his cell still read 15.0 (stale 8.0 +
    // new 7.0). Manual rows are still never collapsed.
    var autos = hits.filter(function(t) {
      var src = String(t.source || '');
      if (src === 'manual') return false;
      return src.indexOf('auto') === 0 || !!t.autoMeta || !!t.auto_meta || src === '';
    });
    if (autos.length > 1) {
      var newest = autos.slice().sort(function(a, b) {
        var at = a.updatedAt || a.createdAt || a.clockIn || '';
        var bt = b.updatedAt || b.createdAt || b.clockIn || '';
        return String(bt).localeCompare(String(at));
      })[0];
      var keepIds = {};
      keepIds[newest.id] = true;
      hits = hits.filter(function(t) {
        return autos.indexOf(t) === -1 || keepIds[t.id];
      });
      if (window.console && console.warn) {
        console.warn('[Payroll] dropped ' + (autos.length - 1) +
                     ' stale cached auto row(s) for ' + userId + ' ' + date);
      }
    }
    return hits;
  },

  _totalHours: function(entries) {
    return entries.reduce(function(s, e) { return s + (e.hours || 0); }, 0);
  },

  _hasIssues: function(entries, date) {
    var issues = [];
    if (entries.length === 0) return issues;
    entries.forEach(function(e) {
      if (e.clockIn && !e.clockOut) issues.push('Missing clock-out');
      if (!e.hours && !e.clockIn) issues.push('Missing hours');
    });
    return issues;
  },

  _approvalKey: function(userId, weekStart) {
    return userId + '_' + weekStart;
  },

  _dayApprovalKey: function(userId, date) {
    return userId + '_day_' + date;
  },

  // ── Main Render ──
  // ── v1096: Bouncie payroll panel ──────────────────────────────────────
  // Per-day, collapsible "what the truck did + suggested clock in/out",
  // reconstructed from vehicle_positions (the F-750 work truck). Rules:
  // hours start at the yard (commute/Ram excluded); suggest ±30 min yard
  // buffer around truck first/last movement; per-person, Doug confirms.
  // Lazy-loads on expand so it never queries unless opened.
  // v1103: ONE dropdown per DAY, sitting on top of each grid day (Doug: "Monday
  // on top of Monday") so the week grid stays visible. Each day chip shows a
  // peek (suggested clock); tapping opens a full-width detail panel below with
  // the truck window + suggested clock + a per-day note. Desktop chips align to
  // the grid columns; mobile = a horizontal-scroll strip.
  _bDayOpen: null,
  // v1116: "Truck yard times" — tap a day to see when EACH truck left and
  // returned to the yard (Peekskill HQ), computed server-side by the
  // bm_yard_trips RPC (geofence crossings on Bouncie positions, jitter under
  // 15 min hidden). Replaces the old single "suggested clock" that mixed all
  // vehicles together. Priority per Doug: F-750 / F-550 in/out of the yard.
  _renderBouncie: function(dates) {
    var self = PayrollPage;
    var p = function(x){ return (x < 10 ? '0' : '') + x; };
    var today = (function(){ var n = new Date(); return n.getFullYear() + '-' + p(n.getMonth()+1) + '-' + p(n.getDate()); })();
    if (!self._bDate) self._bDate = today;
    var lbl = new Date(self._bDate + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    // Auto-load the current date's truck data once the panel is in the DOM.
    self._bDayOpen = null;
    setTimeout(function(){ try { PayrollPage._bounceToggle(PayrollPage._bDate); } catch(e) {} }, 0);

    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:14px;">'
      + '<div id="bounce-date-label" style="display:none;">' + lbl + '</div>'
      + '<div id="bday-panel"></div>'
      + '</div>';
  },
  // Clean short label from the (nickname-swapped) vehicle record — key off model/name, never nickname.
  _truckLabel: function(name, model) {
    var s = ((name || '') + ' ' + (model || ''));
    if (/750/.test(s)) return 'F-750 Bucket';
    if (/550/.test(s)) return 'F-550 Chip';
    if (/ram|2500/i.test(s)) return 'Ram 2500';
    return name || 'Truck';
  },
  _truckIcon: function(name, model) {
    var s = ((name || '') + ' ' + (model || ''));
    if (/ram|2500/i.test(s)) return '🛻';
    return '🚚';
  },
  _truckRank: function(name, model) {
    var s = ((name || '') + ' ' + (model || ''));
    if (/750/.test(s)) return 0;
    if (/550/.test(s)) return 1;
    if (/ram|2500/i.test(s)) return 2;
    return 3;
  },
  _fmtDur: function(mins) {
    mins = Math.round(mins || 0);
    var h = Math.floor(mins / 60), m = mins % 60;
    return h ? (h + 'h' + (m ? ' ' + m + 'm' : '')) : (m + 'm');
  },
  _yardTrips: function(dateStr) {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C || !C.rpc) return Promise.resolve(null);
    return C.rpc('bm_yard_trips', { p_day: dateStr }).then(function(res) {
      if (res.error) { console.warn('[yard_trips]', res.error.message); return null; }
      return res.data || [];
    }).catch(function(){ return null; });
  },

  // v1142: Doug's OWN day, straight from his phone. Truck GPS badly undercounts
  // him — Mon Aug 17 read 3.8h and Tue 4.3h against a real 10-12h and 8:30-8:30,
  // because the trucks sat parked while he kept working. His phone is the
  // PRIMARY source for his hours; the trucks are corroboration.
  _loadPhoneDay: function(dateStr) {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C || !C.rpc) return Promise.resolve(null);
    return C.rpc('bm_phone_day', { p_day: dateStr }).then(function(res) {
      if (res.error) { console.warn('[phone_day]', res.error.message); return null; }
      return (res.data && res.data[0]) || null;
    }).catch(function(){ return null; });
  },

  _phoneBlock: function(ph, dateStr) {
    var t = function(iso) {
      if (!iso) return null;
      var d = new Date(iso);
      return isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    };
    if (!ph || !ph.pings) {
      return '<div style="background:#fff8e1;border:1px solid #f0e0a0;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12px;color:#7a6a1f;">'
           + '📱 <b>Your phone:</b> no location for this day — hours below come from truck GPS only, which undercounts you.'
           + '</div>';
    }
    var first = t(ph.first_ping), last = t(ph.last_ping);
    var yin = t(ph.yard_arrive), yout = t(ph.yard_leave);
    var bits = [];
    bits.push('<b>' + (first || '?') + '</b> → <b>' + (last || '?') + '</b>');
    if (ph.span_hours) bits.push('<b>' + (+ph.span_hours).toFixed(2) + 'h</b> span');
    bits.push(yin ? ('yard ' + yin + (yout ? ' → ' + yout : '')) : 'never at yard');
    bits.push(ph.pings + ' pings');
    // v1147: show EVERY source, not sources-minus-the-first. The old
    // .replace('foreground,','') stripped the dominant source and displayed the
    // leftover, so a day with 164 foreground pings and 13 dead owntracks pings
    // read as "owntracks" — making background tracking look alive when it was not.
    if (ph.sources) bits.push(String(ph.sources).split(',').filter(Boolean).join(' + '));
    return '<div style="background:#e8f5e9;border:1px solid #cfe5d6;border-left:3px solid var(--green-dark);'
      + 'border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12.5px;color:#14321f;">'
      + '📱 <b>Your phone</b> — ' + bits.join(' · ')
      + '<div style="font-size:11px;color:#4a6b55;margin-top:2px;">Your day, not the truck\'s. Use this to set your hours.</div>'
      + '</div>';
  },
  _bounceToggle: function(d) {
    var panel = document.getElementById('bday-panel'); if (!panel) return;
    Array.prototype.forEach.call(document.querySelectorAll('button[data-bday]'), function(b) { b.style.outline = ''; });
    if (PayrollPage._bDayOpen === d) { PayrollPage._bDayOpen = null; panel.innerHTML = ''; return; }
    PayrollPage._bDayOpen = d;
    var btn = document.querySelector('button[data-bday="' + d + '"]'); if (btn) btn.style.outline = '2px solid var(--green-dark)';
    var dnFull = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
    var note = ''; try { note = localStorage.getItem('bm-payroll-note-' + d) || ''; } catch(e) {}
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    panel.innerHTML = '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">'

      + '<div class="bday-sum" style="font-size:13px;color:var(--text-light);">loading truck data…</div>'
      + '</div>';
    // phone first — it is the primary source for Doug's own hours
    Promise.all([PayrollPage._yardTrips(d), PayrollPage._truckStops(d), PayrollPage._loadTeamAndDrivers(), PayrollPage._loadPhoneDay(d), PayrollPage._crewMessages(d)]).then(function(res) {
      var trips = res[0] || [], stops = res[1] || [], phone = res[3], msgs = res[4] || [];
      var sum = panel.querySelector('.bday-sum'); if (!sum) return;
      var byV = {};
      trips.forEach(function(r) { (byV[r.vehicle_id] = byV[r.vehicle_id] || { name:r.name, model:r.model, trips:[], stops:[] }).trips.push(r); });
      stops.forEach(function(r) { (byV[r.vehicle_id] = byV[r.vehicle_id] || { name:r.name, model:r.model, trips:[], stops:[] }).stops.push(r); });
      var ids = Object.keys(byV);
      if (!ids.length && !(phone && phone.pings) && !msgs.length) { sum.textContent = 'No truck, phone or message data for this day.'; return; }
      ids.sort(function(a,b){ return PayrollPage._truckRank(byV[a].name, byV[a].model) - PayrollPage._truckRank(byV[b].name, byV[b].model); });
      PayrollPage._dayCache[d] = byV;
      var et = function(ts) { return ts ? new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) : '—'; };
      // ── v1152: spreadsheet-style truck grid ────────────────────────────────
      // Doug: "if you could kinda make it more of, like, a spreadsheet style,
      // kinda like the payroll thing is... so the trucks would correlate to the
      // people." One permanent row per truck — NOT collapsible — because
      // left-yard → back-at-yard is the number he verifies hours against:
      // "that's the metric that I'm going to use to verify hours."
      var rows = ids.map(function(vid) {
        var v = byV[vid];
        var rid = 'trk-' + d + '-' + vid.slice(0, 8);
        var merged = PayrollPage._mergeStops(v.stops);
        v.merged = merged;
        var siteMins = v.stops.reduce(function(a,x){ return a + (x.mins || 0); }, 0);
        var outMins = v.trips.reduce(function(a,t){ return a + (t.mins_out || 0); }, 0);
        var firstOut = v.trips.length ? et(v.trips[0].left_yard) : '—';
        var lastBack = v.trips.length ? et(v.trips[v.trips.length - 1].back_yard) : '—';
        var td = 'padding:5px 7px;border-bottom:1px solid var(--border);white-space:nowrap;';
        var drid = rid + '-det';
        return '<tr onclick="PayrollPage._rowToggle(\'' + drid + '\')" style="cursor:pointer;">'
          + '<td style="' + td + 'font-weight:700;"><span id="' + drid + '-c" style="color:var(--text-light);font-size:10px;margin-right:3px;">▸</span>' + PayrollPage._truckIcon(v.name, v.model) + ' ' + PayrollPage._truckLabel(v.name, v.model) + '</td>'
          + '<td style="' + td + '">' + PayrollPage._driverSel(vid, v.name) + '</td>'
          + '<td style="' + td + 'color:var(--green-dark);font-weight:700;">' + firstOut + '</td>'
          + '<td style="' + td + 'color:var(--green-dark);font-weight:700;">' + lastBack + '</td>'
          + '<td style="' + td + '">' + (outMins ? PayrollPage._fmtDur(outMins) : '—') + '</td>'
          + '<td style="' + td + 'white-space:normal;min-width:120px;">'
              + (merged.length
                  ? '<span id="' + rid + '-hdaddr" style="color:var(--link,#1565c0);font-weight:600;">📍…</span>'
                    + (merged.length > 1 ? ' <span style="color:var(--text-light);">+' + (merged.length - 1) + '</span>'
                                         : '')
                  : '<span style="color:var(--text-light);">—</span>')
            + '</td>'
          + '<td style="' + td + 'font-weight:700;color:var(--green-dark);">' + (siteMins ? PayrollPage._fmtDur(siteMins) : '—') + '</td>'
          + '</tr>'
          + PayrollPage._truckDetailRow(drid, v);
      }).join('');
      var th = 'padding:4px 7px;text-align:left;font-size:10px;font-weight:700;color:var(--text-light);border-bottom:1px solid var(--border);white-space:nowrap;';
      sum.innerHTML = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + '<thead><tr>'
          + '<th style="' + th + '">TRUCK</th>'
          + '<th style="' + th + '">DRIVER</th>'
          + '<th style="' + th + '">LEFT YARD</th>'
          + '<th style="' + th + '">BACK</th>'
          + '<th style="' + th + '">OUT</th>'
          + '<th style="' + th + '">JOB SITE</th>'
          + '<th style="' + th + '">ON SITE</th>'
        + '</tr></thead><tbody>' + '<tbody id="jobrows-' + d + '"></tbody>' + PayrollPage._phoneRow(phone) + rows + PayrollPage._textRows(msgs) + '<tbody id="exprows-' + d + '"></tbody>' + '</tbody></table></div>'
        + '';
      // v1149: rows start COLLAPSED — the whole truck-day now fits on the header
      // line, so there is nothing to open unless you want the individual stops.
      // (This reverses v1142's auto-expand, per Doug: "Could fit on one line.
      // Would need to be collapsible.") We still resolve the primary address so
      // the collapsed line names the job site rather than showing coordinates.
      setTimeout(function() {
        Object.keys(PayrollPage._dayCache[d] || {}).forEach(function(vid) {
          var vv = PayrollPage._dayCache[d][vid];
          var rid = 'trk-' + d + '-' + vid.slice(0, 8);
          var top = (vv.merged || []).slice().sort(function(a,b){ return b.mins - a.mins; })[0];
          if (!top) return;
          PayrollPage._revGeo(top.lat, top.lon).then(function(addr) {
            var el = document.getElementById(rid + '-hdaddr');
            if (!el || !addr) return;
            var esc2 = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
            el.textContent = '📍 ' + esc2(String(addr).split(',')[0]);
            el.title = addr;
          }).catch(function(){});
        });
        // v1167: resolve the day's primary site once, then fill the job rows at
        // the top and the expenses + GPM rows at the bottom.
        var all2 = [];
        Object.keys(PayrollPage._dayCache[d] || {}).forEach(function(vid) {
          (PayrollPage._dayCache[d][vid].merged || []).forEach(function(x){ all2.push(x); });
        });
        all2.sort(function(a, b){ return b.mins - a.mins; });
        var jb = document.getElementById('jobrows-' + d), xb = document.getElementById('exprows-' + d);
        if (!all2.length) {
          if (xb) xb.innerHTML = PayrollPage._expenseRows(d, null, 1);
          return;
        }
        Promise.all([
          PayrollPage._revGeo(all2[0].lat, all2[0].lon),
          PayrollPage._jobDayCount(all2[0].lat, all2[0].lon)
        ]).then(function(r) {
          var a = r[0], n = r[1] || 1;
          if (jb) jb.innerHTML = PayrollPage._jobRows(a || null, n);
          if (xb) xb.innerHTML = PayrollPage._expenseRows(d, a || null, n);
        }).catch(function(){
          if (xb) xb.innerHTML = PayrollPage._expenseRows(d, null, 1);
        });

      }, 0);
    }).catch(function() {
      var sum = panel.querySelector('.bday-sum'); if (sum) sum.textContent = 'Could not load truck data.';
    });
  },
  _dayCache: {},
  // ── v1167: job rows on top, ONE collapsible expenses line, then GPM ──────
  // Doug: "I want new rows above employee... address and then client name and
  // amount made in revenue", then "one line of expenses and then GPM... I wanna
  // keep that really clean. So don't go crazy there. Just add the bare minimum
  // to show the picture."
  // v1168 — how many DAYS was this job actually worked, so revenue can be split.
  // Doug: a 3-day \$7,500 job reads \$2,500 a day. Derived from GPS presence at
  // the site rather than from the job record, which carries only one date.
  // THRESHOLD = 2 hours on site. Doug on Aug 8 at 4 Terrace Drive: "we were
  // just looking at the tree because it was down the road from another job. You
  // don't have to count that." That visit spanned 50 min; the three real work
  // days spanned 366-492 min. A 7x gap, so the rule is not finely tuned.
  _JOB_DAY_MIN_MINUTES: 120,
  _jobDayCount: function(lat, lon) {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C) return Promise.resolve(1);
    var dLat = 0.0023, dLon = 0.0028;                 // ~250 m box
    var from = new Date(Date.now() - 30 * 864e5).toISOString();
    return C.from('vehicle_positions').select('ts')
      .gte('lat', lat - dLat).lte('lat', lat + dLat)
      .gte('lon', lon - dLon).lte('lon', lon + dLon)
      .gte('ts', from).order('ts', { ascending: true }).limit(5000)
      .then(function(r) {
        if (r.error || !r.data || !r.data.length) return 1;
        var by = {};
        r.data.forEach(function(x) {
          var t = new Date(x.ts);
          var k = t.getFullYear() + '-' + (t.getMonth()+1) + '-' + t.getDate();
          if (!by[k]) by[k] = { a: t, b: t };
          if (t < by[k].a) by[k].a = t;
          if (t > by[k].b) by[k].b = t;
        });
        var n = 0;
        Object.keys(by).forEach(function(k) {
          if ((by[k].b - by[k].a) / 60000 >= PayrollPage._JOB_DAY_MIN_MINUTES) n++;
        });
        return n || 1;
      }).catch(function(){ return 1; });
  },
  _jobRows: function(addr, dayCount) {
    if (!addr) return '';
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var rev = PayrollPage._findRevenue(addr);
    var td = 'padding:5px 7px;border-bottom:1px solid var(--border);white-space:nowrap;background:#f4f8ff;';
    var n = dayCount && dayCount > 1 ? dayCount : 1;
    var share = rev ? rev.total / n : 0;
    var money = function(x){ return '$' + Math.round(x).toLocaleString(); };
    var h = '<tr><td style="' + td + 'font-weight:700;">📍 Address</td>'
      + '<td colspan="6" style="' + td + 'white-space:normal;font-weight:600;">' + esc(addr) + '</td></tr>';
    h += '<tr><td style="' + td + 'font-weight:700;">👤 Client</td>'
      + '<td colspan="6" style="' + td + 'white-space:normal;font-weight:600;">'
      + (rev ? ('#' + esc(String(rev.num || '')) + ' ' + esc(rev.client || ''))
             : '<span style="color:var(--text-light);font-weight:400;">no job matched this address</span>') + '</td></tr>';
    if (rev) {
      h += '<tr><td style="' + td + 'font-weight:700;">💵 Revenue</td>'
        + '<td colspan="6" style="' + td + 'white-space:normal;">'
        + '<b style="color:var(--green-dark);font-size:13px;">' + money(share) + '</b>'
        + (n > 1 ? ' <span style="color:var(--text-light);font-size:11px;">1 of ' + n + ' days · ' + money(rev.total) + ' job</span>' : '')
        + '</td></tr>';
    }
    return h;
  },
  _expenseRows: function(d, addr, dayCount) {
    var team = [];
    try { team = (typeof DB !== 'undefined' && DB.team && DB.team.getAll) ? DB.team.getAll() : []; } catch (e) {}
    var totH = 0, wages = 0;
    team.forEach(function(t) {
      var h = 0;
      PayrollPage._getEntriesForDate(t.name || t.id, d).forEach(function(e){ h += (e.hours || 0); });
      if (!h) return;
      totH += h; wages += h * Number(t.rate || t.payRate || 0);
    });
    var rev = PayrollPage._findRevenue(addr);
    var n = dayCount && dayCount > 1 ? dayCount : 1;
    var share = rev ? rev.total / n : 0;
    var burden = wages * PayrollPage._BURDEN_PCT;
    var sales  = share * PayrollPage._JOB_COMMISSION;
    var total  = wages + burden + sales;
    if (!total && !share) return '';
    var money = function(x){ return '$' + Math.round(x).toLocaleString(); };
    var td = 'padding:5px 7px;border-bottom:1px solid var(--border);white-space:nowrap;';
    var rid = 'exp-' + d;
    var lines = [['Employees (' + totH.toFixed(2) + 'h)', wages],
                 ['Payroll costs (' + Math.round(PayrollPage._BURDEN_PCT*100) + '%)', burden],
                 ['Sales (' + Math.round(PayrollPage._JOB_COMMISSION*100) + '%)', sales]];
    var detail = '<div style="padding:8px 10px;background:var(--bg);font-size:12px;line-height:1.7;">'
      + lines.map(function(l){
          return '<div style="display:flex;justify-content:space-between;"><span>' + l[0] + '</span><span>-' + money(l[1]) + '</span></div>';
        }).join('')
      + '<div style="color:var(--text-light);font-size:10.5px;margin-top:4px;">Other expenses and amortized yearly costs not in yet.</div></div>';
    var h = '<tr onclick="PayrollPage._rowToggle(\'' + rid + '\')" style="cursor:pointer;">'
      + '<td style="' + td + 'font-weight:700;"><span id="' + rid + '-c" style="color:var(--text-light);font-size:10px;margin-right:3px;">▸</span>💸 Expenses</td>'
      + '<td colspan="5" style="' + td + 'color:var(--text-light);white-space:normal;">employees · payroll costs · sales</td>'
      + '<td style="' + td + 'font-weight:700;text-align:right;">-' + money(total) + '</td></tr>'
      + '<tr id="' + rid + '" style="display:none;"><td colspan="7" style="padding:0;border-bottom:1px solid var(--border);">' + detail + '</td></tr>';
    if (share) {
      var gp = share - total;
      h += '<tr><td style="' + td + 'font-weight:800;background:#f4f8ff;">GPM</td>'
        + '<td colspan="5" style="' + td + 'background:#f4f8ff;"></td>'
        + '<td style="' + td + 'background:#f4f8ff;font-weight:800;text-align:right;color:' + (gp>=0?'var(--green-dark)':'var(--red,#dc3545)') + ';">'
        + money(gp) + ' <span style="font-size:11px;color:var(--text-light);">' + Math.round(gp/share*100) + '%</span></td></tr>';
    }
    return h;
  },
  // ── v1166: crew TEXTS as rows in the same grid ───────────────────────────
  // Doug: "add in relevant text messages as one of the trucks." A person's
  // messages bracket their day exactly the way a truck's yard times bracket
  // its day — and on days the tracker is dark (the Ram, repeatedly) the texts
  // are the ONLY evidence of when someone started and stopped.
  // Source is crew_messages: four verified crew numbers, synced from chat.db.
  _crewMessages: function(day) {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C) return Promise.resolve([]);
    return C.from('crew_messages').select('person,direction,ts,body')
      .eq('day', day).order('ts', { ascending: true })
      .then(function(r){ return (r.error || !r.data) ? [] : r.data; })
      .catch(function(){ return []; });
  },
  // What the day looked like, in their own words. No summarising engine here —
  // it picks the longest inbound message per two-hour window, which in practice
  // is the status update ("200 back together and tuned") rather than the "ok".
  _daySummary: function(msgs) {
    var picks = {}, esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    msgs.forEach(function(m) {
      var b = String(m.body || '').trim();
      if (b.length < 12) return;
      if (/^(ok|yes|no|thanks|great|perfect|love|lol|got it)\b/i.test(b)) return;
      if (/^https?:/i.test(b)) return;
      var slot = new Date(m.ts).getHours() >> 1;
      if (!picks[slot] || b.length > picks[slot].body.length) picks[slot] = { ts: m.ts, body: b, who: m.person };
    });
    var keys = Object.keys(picks).sort(function(a,b){ return a-b; });
    if (!keys.length) return '';
    var et = function(ts){ return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); };
    return '<div style="font-size:10.5px;font-weight:700;color:var(--text-light);margin-bottom:3px;">WHAT HAPPENED</div>'
      + keys.map(function(k){
          var p = picks[k];
          return '<div style="font-size:12px;padding:1px 0;"><span style="color:var(--text-light);">' + et(p.ts) + '</span> '
               + esc(p.body.slice(0, 120)) + (p.body.length > 120 ? '…' : '') + '</div>';
        }).join('');
  },
  _textRows: function(msgs) {
    if (!msgs || !msgs.length) return '';
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var et = function(ts){ return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); };
    var by = {};
    msgs.forEach(function(m){ (by[m.person] = by[m.person] || []).push(m); });
    var td = 'padding:5px 7px;border-bottom:1px solid var(--border);white-space:nowrap;background:#fffdf2;';
    return Object.keys(by).sort(function(a,b){ return by[b].length - by[a].length; }).map(function(person) {
      var v = by[person];
      var rid = 'txt-' + person.replace(/[^a-z0-9]/gi,'').slice(0,10);
      var mins = (new Date(v[v.length-1].ts) - new Date(v[0].ts)) / 60000;
      var body = '<div style="padding:8px 10px;background:#fffdf2;font-size:12px;line-height:1.6;">'
        + PayrollPage._daySummary(v)
        + '<div style="font-size:10.5px;font-weight:700;color:var(--text-light);margin:7px 0 3px;">ALL ' + v.length + ' MESSAGES</div>'
        + v.map(function(m){
            return '<div style="padding:1px 0;"><span style="color:var(--text-light);">' + et(m.ts) + '</span> '
                 + '<b style="color:' + (m.direction === 'out' ? 'var(--green-dark)' : 'var(--text)') + ';">'
                 + (m.direction === 'out' ? 'You' : esc(person.split(' ')[0])) + '</b> '
                 + esc(String(m.body).slice(0, 220)) + '</div>';
          }).join('')
        + '</div>';
      return '<tr onclick="PayrollPage._rowToggle(\'' + rid + '\')" style="cursor:pointer;">'
        + '<td style="' + td + 'font-weight:700;"><span id="' + rid + '-c" style="color:var(--text-light);font-size:10px;margin-right:3px;">▸</span>💬 Texts</td>'
        + '<td style="' + td + 'font-weight:600;">' + esc(person.split(' ')[0]) + '</td>'
        + '<td style="' + td + 'color:var(--green-dark);font-weight:700;">' + et(v[0].ts) + '</td>'
        + '<td style="' + td + 'color:var(--green-dark);font-weight:700;">' + et(v[v.length-1].ts) + '</td>'
        + '<td style="' + td + '">' + PayrollPage._fmtDur(mins) + '</td>'
        + '<td style="' + td + 'white-space:normal;min-width:120px;color:var(--text-light);">' + v.length + ' messages — tap to read</td>'
        + '<td style="' + td + 'color:var(--text-light);">—</td>'
        + '</tr>'
        + '<tr id="' + rid + '" style="display:none;"><td colspan="7" style="padding:0;border-bottom:1px solid var(--border);">' + body + '</td></tr>';
    }).join('');
  },
  // ── v1161: JOB COSTING right in the day panel ────────────────────────────
  // Doug: "Build the job costing right into the calendar here. Have the revenue
  // and the job on top as two lines, and then have lines below for the total
  // payroll cost for everyone." Dump fees and fuel deliberately left out for
  // now, at his call.
  //
  // Revenue is matched by ADDRESS: the day's primary work site is already
  // reverse-geocoded for the grid, so we normalise its house-number + street
  // and look for a job or invoice at the same address. No geocoding of the
  // whole job list, and no guessing — an unmatched day says so rather than
  // inventing a number.
  // v1162 — employer burden on top of wages: payroll taxes + workers' comp +
  // the insurance allocation. 28% is the CONSERVATIVE end of the range derived
  // from the 2025 books (10% employer payroll tax, plus WC at a real tree-class
  // rate). It is a PLACEHOLDER until the Erie declaration page settles what that
  // policy actually covers — the booked NYSIF premium is only 1.7% of payroll,
  // which is implausible for tree work. Erring high keeps jobs from looking
  // more profitable than they are. Belongs in Settings once there is a store
  // for it.
  _BURDEN_PCT: 0.28,
  // v1164 — COMMISSION and the TRUCK RATE.
  // Doug confirmed 10% ("Keep commission at ten percent. That's fine.").
  // NOTE: PayrollPage._COMMISSION_RATE elsewhere in this file is 0.08 and drives
  // the separate sales-commission roll-up; this is the job-costing figure.
  _JOB_COMMISSION: 0.10,
  // Truck cost per mile, derived from the 2025 books against ~31,000 est.
  // annual fleet miles:
  //     fuel            $7,972  = $0.26/mi
  //     repair + DMV   $31,844  = $1.03/mi   <- 4x the fuel
  //     truck loan      $6,065  = $0.20/mi
  //                              = $1.48/mi
  // Doug's call: fuel belongs INSIDE this rate rather than as per-transaction
  // line items, because a tank fill spans jobs — on Aug 17 a single day carried
  // $469 of fuel that was mostly consumed later. A blended rate also carries the
  // repair burden of ageing trucks, which is the cost he flagged as needing to
  // land somewhere. $1.48 sits mid-range for medium-duty (F-550/F-750 typically
  // $1.20-2.00/mi). Revisit yearly, or when odometer data starts accruing.
  _TRUCK_RATE_MI: 1.48,
  _normAddr: function(a) {
    var t = String(a || '').toLowerCase().split(',')[0];   // house number + street only
    // Expand abbreviations to a canonical full word so "4 Terrace Dr" and
    // "4 Terrace Drive" match. An earlier version collapsed them to a single
    // letter, which turned "4 Terrace Drive" into "4td" — short enough that the
    // min-length guard then threw the match away.
    var MAP = { rd:'road', st:'street', dr:'drive', ln:'lane', ave:'avenue', av:'avenue',
                ct:'court', pl:'place', ter:'terrace', trl:'trail', hwy:'highway',
                blvd:'boulevard', cir:'circle', pkwy:'parkway', n:'north', s:'south',
                e:'east', w:'west' };
    t = t.replace(/[^a-z0-9\s]/g, ' ')
         .split(/\s+/)
         .filter(Boolean)
         .map(function(w){ return MAP[w] || w; })
         .join('');
    return t;
  },
  _findRevenue: function(addr) {
    if (!addr) return null;
    var key = PayrollPage._normAddr(addr);
    if (key.length < 4) return null;
    var best = null;
    try {
      var jobs = (typeof DB !== 'undefined' && DB.jobs && DB.jobs.getAll) ? DB.jobs.getAll() : [];
      jobs.forEach(function(j) {
        if (!j.property) return;
        if (PayrollPage._normAddr(j.property) !== key) return;
        var t = Number(j.total || 0);
        if (!best || t > best.total) best = { kind:'job', num:j.jobNumber || j.job_number, client:j.clientName || j.client_name, total:t };
      });
      if (!best) {
        var invs = (typeof DB !== 'undefined' && DB.invoices && DB.invoices.getAll) ? DB.invoices.getAll() : [];
        invs.forEach(function(v) {
          if (!v.property) return;
          if (PayrollPage._normAddr(v.property) !== key) return;
          var t = Number(v.total || 0);
          if (!best || t > best.total) best = { kind:'invoice', num:v.invoiceNumber || v.invoice_number, client:v.clientName || v.client_name, total:t };
        });
      }
    } catch (e) {}
    return best;
  },
  _renderDayCost: function(d, addr) {
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var rev = PayrollPage._findRevenue(addr);
    var team = [];
    try { team = (typeof DB !== 'undefined' && DB.team && DB.team.getAll) ? DB.team.getAll() : []; } catch (e) {}
    var lines = [], totH = 0, totPay = 0;
    team.forEach(function(t) {
      var who = t.name || t.id;
      var h = 0;
      PayrollPage._getEntriesForDate(who, d).forEach(function(e){ h += (e.hours || 0); });
      if (!h) return;
      var rate = Number(t.rate || t.payRate || 0);
      var pay = h * rate;
      totH += h; totPay += pay;
      lines.push({ who: who, h: h, pay: pay, rate: rate });
    });
    if (!lines.length && !rev) return '';
    var money = function(n){ return '$' + Math.round(n).toLocaleString(); };
    var row = 'display:flex;justify-content:space-between;gap:10px;padding:2px 0;font-size:12.5px;';
    var h = '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:9px;">'
      + '<div style="font-size:10.5px;font-weight:700;color:var(--text-light);margin-bottom:5px;">JOB COSTING</div>';
    // two lines on top: the job, then the revenue
    h += '<div style="' + row + '"><span style="color:var(--text-light);">JOB</span>'
       + '<span style="font-weight:600;text-align:right;min-width:0;">'
       + (rev ? ('#' + esc(String(rev.num || '')) + ' ' + esc(rev.client || ''))
              : (addr ? esc(addr) + ' <span style="color:var(--text-light);font-weight:400;">(no job matched)</span>'
                      : '<span style="color:var(--text-light);font-weight:400;">no work site this day</span>'))
       + '</span></div>';
    h += '<div style="' + row + '"><span style="color:var(--text-light);">REVENUE</span>'
       + '<b style="color:var(--green-dark);">' + (rev ? money(rev.total) : '—') + '</b></div>';
    // payroll, one line per person
    // v1163: NO per-person repeat here. Every person's hours are already on the
    // grid directly above — Doug: "At no point in this bill do I want you to
    // duplicate things... You don't need to repeat the person's name as an
    // hours. Just keep it clean and just give me the total."
    if (lines.length) {
      h += '<div style="border-top:1px dashed var(--border);margin-top:6px;padding-top:5px;"></div>';
      h += '<div style="' + row + 'font-weight:700;">'
         + '<span>WAGES <span style="color:var(--text-light);font-weight:400;">' + totH.toFixed(2) + 'h</span></span>'
         + '<span>-' + money(totPay) + '</span></div>';
    }
    // v1162: the lines above are WHAT DOUG OWES THEM — flat hourly, no burden
    // baked in. Doug: "That should be what I owe them, what I'm paying them...
    // That should be thirty an hour set, and then payroll costs can go on this
    // line here as a separate line below dump fees."
    // Everything the employer pays ON TOP — payroll taxes, workers' comp, the
    // insurance allocation — is this one line.
    var burden = totPay * PayrollPage._BURDEN_PCT;
    if (totPay) {
      h += '<div style="' + row + 'margin-top:5px;"><span style="color:var(--text-light);">PAYROLL COSTS '
         + '<span style="font-size:10px;">taxes · WC · ins · ' + Math.round(PayrollPage._BURDEN_PCT * 100) + '%</span></span>'
         + '<span>-' + money(burden) + '</span></div>';
    }
    var comm = rev ? rev.total * PayrollPage._JOB_COMMISSION : 0;
    if (comm) {
      h += '<div style="' + row + '"><span style="color:var(--text-light);">COMMISSION '
         + '<span style="font-size:10px;">' + Math.round(PayrollPage._JOB_COMMISSION * 100) + '%</span></span>'
         + '<span>-' + money(comm) + '</span></div>';
    }
    if (rev) {
      var net = rev.total - totPay - burden - comm;
      h += '<div style="' + row + 'border-top:2px solid var(--border);margin-top:5px;padding-top:5px;font-weight:800;font-size:14px;">'
         + '<span>GROSS PROFIT</span><span style="color:' + (net >= 0 ? 'var(--green-dark)' : 'var(--red,#dc3545)') + ';">' + money(net)
         + ' <span style="font-size:11px;font-weight:600;color:var(--text-light);">' + Math.round(net / rev.total * 100) + '%</span></span></div>';
    }
    h += '<div style="font-size:10px;color:var(--text-light);margin-top:5px;">Gross profit — before yearly overhead. Wages = what you owe them; payroll costs = taxes/WC/insurance on top (placeholder %). Truck miles and dump fees not in this yet.</div>';
    return h + '</div>';
  },
  // v1160 — tap a truck (or the phone) row to expand the full day for it.
  // Doug: "If I click on a truck or the phone below the hours there, it should
  // expand to give me all of the information for that day for that truck."
  _rowToggle: function(rid) {
    var el = document.getElementById(rid); if (!el) return;
    var open = el.style.display !== 'none';
    el.style.display = open ? 'none' : '';
    var c = document.getElementById(rid + '-c'); if (c) c.textContent = open ? '▸' : '▾';
    if (!open && el.getAttribute('data-geo') !== '1') {
      el.setAttribute('data-geo', '1');
      var slots = el.querySelectorAll('[data-lat]');
      Array.prototype.forEach.call(slots, function(sp) {
        PayrollPage._revGeo(parseFloat(sp.getAttribute('data-lat')), parseFloat(sp.getAttribute('data-lon')))
          .then(function(a){ if (a) sp.textContent = '📍 ' + a; }).catch(function(){});
      });
    }
  },
  _truckDetailRow: function(rid, v) {
    var et = function(ts){ return ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'; };
    var fd = PayrollPage._fmtDur;
    var m = v.merged || PayrollPage._mergeStops(v.stops);
    var h = '<div style="padding:8px 10px;background:var(--bg);font-size:12px;line-height:1.6;">';
    h += '<div style="font-weight:700;font-size:10.5px;color:var(--text-light);">YARD TRIPS</div>';
    if (v.trips.length) {
      v.trips.forEach(function(t){
        h += '<div>left <b style="color:var(--green-dark);">' + et(t.left_yard) + '</b> → back <b style="color:var(--green-dark);">' + et(t.back_yard) + '</b> <span style="color:var(--text-light);">(' + fd(t.mins_out) + ')</span></div>';
      });
    } else h += '<div style="color:var(--text-light);">never crossed the yard line</div>';
    h += '<div style="font-weight:700;font-size:10.5px;color:var(--text-light);margin-top:6px;">SITES</div>';
    if (m.length) {
      m.forEach(function(x, i){
        var maps = 'https://maps.google.com/?q=' + x.lat + ',' + x.lon;
        h += '<div><a href="' + maps + '" target="_blank" rel="noopener" data-lat="' + x.lat + '" data-lon="' + x.lon + '" style="color:var(--link,#1565c0);font-weight:600;">📍 locating…</a> '
           + '<span style="color:var(--text-light);">' + et(x.arrive_ts) + '–' + et(x.depart_ts) + '</span> '
           + '<b style="color:var(--green-dark);">' + fd(x.mins) + '</b>'
           + (x.visits > 1 ? ' <span style="color:var(--text-light);">(' + x.visits + ' visits)</span>' : '') + '</div>';
      });
    } else h += '<div style="color:var(--text-light);">no stops away from the yard</div>';
    var raw = v.stops.length;
    if (raw > m.length) h += '<div style="color:var(--text-light);font-size:10.5px;margin-top:4px;">' + raw + ' raw stops merged into ' + m.length + ' site' + (m.length>1?'s':'') + ' (neighbouring addresses)</div>';
    h += '</div>';
    return '<tr id="' + rid + '" style="display:none;"><td colspan="7" style="padding:0;border-bottom:1px solid var(--border);">' + h + '</td></tr>';
  },
  _phoneDetailRow: function(rid, ph) {
    var et = function(ts){ return ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'; };
    var fd = PayrollPage._fmtDur;
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var h = '<div style="padding:8px 10px;background:#f2faf4;font-size:12px;line-height:1.6;">';
    h += '<div>first ping <b>' + et(ph.first_ping) + '</b> · last ping <b>' + et(ph.last_ping) + '</b>'
       + (ph.span_hours ? ' · span <b>' + (+ph.span_hours).toFixed(2) + 'h</b>' : '') + '</div>';
    h += '<div>' + (ph.yard_arrive ? 'at yard <b>' + et(ph.yard_arrive) + '</b>' + (ph.yard_leave ? ' → left <b>' + et(ph.yard_leave) + '</b>' : '') : 'never at the yard') + '</div>';
    if (ph.yard_hours != null && ph.yard_hours !== '') h += '<div>yard time <b>' + fd(Math.round(+ph.yard_hours * 60)) + '</b></div>';
    if (ph.commute_out_min) h += '<div>commute out <b>' + fd(ph.commute_out_min) + '</b>' + (ph.commute_back_min ? ' · back <b>' + fd(ph.commute_back_min) + '</b>' : '') + '</div>';
    h += '<div style="color:var(--text-light);">' + ph.pings + ' pings' + (ph.sources ? ' · ' + esc(String(ph.sources).split(',').filter(Boolean).join(' + ')) : '') + '</div>';
    h += '<div style="color:#4b6b4f;font-size:10.5px;margin-top:3px;">Doug\'s phone, not a truck. Covers time away from any tracked vehicle.</div>';
    h += '</div>';
    return '<tr id="' + rid + '" style="display:none;"><td colspan="7" style="padding:0;border-bottom:1px solid var(--border);">' + h + '</td></tr>';
  },
  // v1158 — what this person actually earned on this day, shown beside Details.
  // Doug: "instead of saying the hours seven point five... it can just say
  // details, and then to the right of that, it can say the amount of money that
  // employee made that day." Rate comes from team_members.rate, the same source
  // the weekly totals use.
  _dayPay: function(userId, date, emp) {
    var hrs = 0;
    PayrollPage._getEntriesForDate(userId, date).forEach(function(e){ hrs += (e.hours || 0); });
    if (!hrs) return '';
    // prefer the employee record the caller already has; fall back to a lookup
    var rate = Number((emp && (emp.rate || emp.payRate)) || 0);
    if (!rate) {
      try {
        var team = (typeof DB !== 'undefined' && DB.team && DB.team.getAll) ? DB.team.getAll() : [];
        var m = team.filter(function(t){ return (t.name || t.id) === userId; })[0];
        rate = Number((m && (m.rate || m.payRate)) || 0);
      } catch (e) {}
    }
    if (!rate) return '';
    // v1159: no cents — Doug: "take out the cent dot zero zero in the dollar
    // fields, so it's shorter."
    return '$' + Math.round(hrs * rate).toLocaleString();
  },
  // v1153 — Doug's phone as a ROW IN THE SAME TABLE as the trucks, with him as
  // the driver. Doug: "just list my phone same as you list the trucks, cleaner
  // this way. List me as the driver." Putting it on the same grid is what lets
  // him read his day-start against each truck's yard time on one line — the
  // gap between "phone on at 7:39" and "truck left yard at 11:07" is the yard
  // time the truck cannot see.
  _phoneRow: function(ph) {
    if (!ph || !ph.pings) return '';
    var et = function(ts){ return ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'; };
    var td = 'padding:5px 7px;border-bottom:1px solid var(--border);white-space:nowrap;background:#f2faf4;';
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var src = ph.sources ? String(ph.sources).split(',').filter(Boolean).join(' + ') : '';
    var span = ph.span_hours ? PayrollPage._fmtDur(Math.round(+ph.span_hours * 60)) : '—';
    var yard = (ph.yard_hours != null && ph.yard_hours !== '') ? PayrollPage._fmtDur(Math.round(+ph.yard_hours * 60)) : '—';
    var prid = 'phone-det-' + (ph.first_ping || '').replace(/[^0-9]/g, '').slice(0, 12);
    return '<tr onclick="PayrollPage._rowToggle(\'' + prid + '\')" style="cursor:pointer;">'
      + '<td style="' + td + 'font-weight:700;"><span id="' + prid + '-c" style="color:var(--text-light);font-size:10px;margin-right:3px;">▸</span>📱 My Phone</td>'
      + '<td style="' + td + 'color:var(--green-dark);font-weight:600;">Doug</td>'
      + '<td style="' + td + 'color:var(--green-dark);font-weight:700;">' + et(ph.first_ping) + '</td>'
      + '<td style="' + td + 'color:var(--green-dark);font-weight:700;">' + et(ph.last_ping) + '</td>'
      + '<td style="' + td + '">' + span + '</td>'
      + '<td style="' + td + 'white-space:normal;min-width:120px;color:var(--text-light);">'
          + (ph.yard_arrive ? 'at yard ' + et(ph.yard_arrive) : 'never at yard')
          + ' · ' + ph.pings + ' pings' + (src ? ' · ' + esc(src) : '')
        + '</td>'
      + '<td style="' + td + 'font-weight:700;color:var(--green-dark);">' + yard + '</td>'
      + '</tr>'
      + PayrollPage._phoneDetailRow(prid, ph);
  },
  // v1150 — keep GPS boilerplate OUT of the hours cells. Doug: "no gps data in
  // hours fields." The auto writer stamps every row with
  // "Auto from GPS — <truck> (N pings)", which buried the cell you actually
  // type in. That detail still lives in the truck panel below and in Details;
  // here we strip it and show only what a human would have written (e.g.
  // "overridden by Doug Aug 20"). Returns '' when nothing human remains.
  _cellNote: function(notes) {
    var n = String(notes || '');
    if (!n) return '';
    n = n.replace(/Auto from GPS\s*[—-][^·|]*/i, '');
    n = n.replace(/^[\s·|,-]+/, '').replace(/[\s·|,-]+$/, '');
    return n;
  },
  // ── v1149: merge neighbouring stops into ONE work address ─────────────────
  // Doug: "I don't need the neighbor's address. It's the same address. Open the
  // geofence wider or just if their neighbors lump it into the work address."
  // Reverse-geocoding two stops 40 m apart on the same property returned
  // "4 Terrace Drive" and "2 Terrace Drive" — one job, shown as two. Anything
  // within MERGE_M of an existing cluster folds into it: minutes add up, the
  // visit count is kept, and the address shown is the cluster's longest stop.
  _MERGE_M: 180,
  _metres: function(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.sin(dLat/2) * Math.sin(dLat/2)
          + Math.cos(a[0]*r) * Math.cos(b[0]*r) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  _mergeStops: function(stops) {
    var out = [];
    (stops || []).forEach(function(s) {
      for (var i = 0; i < out.length; i++) {
        if (PayrollPage._metres([out[i].lat, out[i].lon], [s.stop_lat, s.stop_lon]) <= PayrollPage._MERGE_M) {
          var c = out[i];
          c.mins += (s.mins || 0);
          c.visits += 1;
          if (new Date(s.arrive_ts) < new Date(c.arrive_ts)) c.arrive_ts = s.arrive_ts;
          if (new Date(s.depart_ts) > new Date(c.depart_ts)) c.depart_ts = s.depart_ts;
          if ((s.mins || 0) > c.bestMins) { c.bestMins = s.mins || 0; c.lat = s.stop_lat; c.lon = s.stop_lon; }
          return;
        }
      }
      out.push({ lat:s.stop_lat, lon:s.stop_lon, mins:s.mins || 0, visits:1,
                 arrive_ts:s.arrive_ts, depart_ts:s.depart_ts, bestMins:s.mins || 0 });
    });
    out.sort(function(a,b){ return new Date(a.arrive_ts) - new Date(b.arrive_ts); });
    return out;
  },
  // ── v1146: assumed driver per truck ──────────────────────────────────────
  // vehicles.default_driver_name is the "assumed to be driving" value. Doug
  // changes it from the dropdown right on the truck row; it saves immediately
  // and is what job-costing will attribute the labour hours to.
  _team: null,
  _drivers: {},
  _loadTeamAndDrivers: function() {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C) return Promise.resolve(null);
    var jobs = [
      C.from('team_members').select('name,active,role,employment_type').then(function(r){
        if (r.error || !r.data) return;
        // v1149 — only people who actually drive a company truck belong in this
        // dropdown. Doug: "Only Doug, David, or Catherine driving. Don't need
        // Braxton or [Michelle] or anyone else in there as an option."
        // Filtered by employment type rather than by name, so a future hourly
        // hire shows up on its own but a subcontractor or commission-only
        // salesperson never does.
        var seen = {}, out = [];
        r.data.forEach(function(t){
          if (t.active === false || !t.name || seen[t.name]) return;
          var et = String(t.employment_type || '').toLowerCase();
          var role = String(t.role || '').toLowerCase();
          if (et === 'subcontractor' || et === 'commission' || role === 'sales') return;
          seen[t.name] = 1; out.push(t.name);
        });
        out.sort(); PayrollPage._team = out;
      }),
      C.from('vehicles').select('id,default_driver_name').then(function(r){
        if (r.error || !r.data) return;
        r.data.forEach(function(v){ PayrollPage._drivers[v.id] = v.default_driver_name || ''; });
      })
    ];
    return Promise.all(jobs).catch(function(){ return null; });
  },
  _driverSel: function(vid, vname) {
    var cur = PayrollPage._drivers[vid] || '';
    var names = PayrollPage._team || [];
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var opts = '<option value="">— driver —</option>';
    names.forEach(function(n){
      opts += '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n.split(' ')[0]) + '</option>';
    });
    return '<select onclick="event.stopPropagation()" onchange="event.stopPropagation();PayrollPage._setDriver(\'' + vid + '\',this.value)" '
      + 'title="Assumed driver — change it here" '
      + 'style="font-size:11px;padding:1px 4px;border:1px solid var(--border);border-radius:5px;background:#fff;color:'
      + (cur ? 'var(--green-dark)' : 'var(--text-light)') + ';max-width:110px;">' + opts + '</select>';
  },
  _setDriver: function(vid, name) {
    PayrollPage._drivers[vid] = name;
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C) return;
    C.from('vehicles').update({ default_driver_name: name || null }).eq('id', vid).then(function(r){
      if (r.error) { console.warn('[setDriver]', r.error.message); if (typeof UI !== 'undefined') UI.toast('Could not save driver'); return; }
      if (typeof UI !== 'undefined') UI.toast(name ? ('Driver set to ' + name) : 'Driver cleared');
    });
  },
  _truckStops: function(dateStr) {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C || !C.rpc) return Promise.resolve(null);
    return C.rpc('bm_truck_stops', { p_day: dateStr }).then(function(res) {
      if (res.error) { console.warn('[truck_stops]', res.error.message); return null; }
      return res.data || [];
    }).catch(function(){ return null; });
  },
  // Reverse-geocode a stop to a street address (= the client's address). Cached
  // in localStorage so we hit Nominatim at most once per location.
  _revGeo: function(lat, lon) {
    var key = 'bm-revgeo-' + lat.toFixed(4) + ',' + lon.toFixed(4);
    try { var c = localStorage.getItem(key); if (c) return Promise.resolve(c); } catch(e) {}
    return fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=' + lat + '&lon=' + lon)
      .then(function(r){ return r.json(); })
      .then(function(d){
        var a = d.address || {};
        var road = ((a.house_number ? a.house_number + ' ' : '') + (a.road || '')).trim();
        var town = a.town || a.city || a.hamlet || a.village || a.suburb || '';
        var label = [road, town].filter(Boolean).join(', ') || d.display_name || (lat.toFixed(4) + ',' + lon.toFixed(4));
        try { localStorage.setItem(key, label); } catch(e) {}
        return label;
      }).catch(function(){ return null; });
  },
  _truckExpand: function(d, vid, rid) {
    var box = document.getElementById(rid); if (!box) return;
    var caret = document.getElementById(rid + '-caret');
    if (box.style.display !== 'none') { box.style.display = 'none'; if (caret) caret.textContent = '▸'; return; }
    box.style.display = 'block'; if (caret) caret.textContent = '▾';
    PayrollPage._truckFill(d, vid, rid);
  },

  // v1142: population split out of _truckExpand so rows can render already
  // expanded — the stops and time-on-site are the reason you open a day.
  _truckFill: function(d, vid, rid) {
    var box = document.getElementById(rid); if (!box) return;
    var v = (PayrollPage._dayCache[d] || {})[vid]; if (!v) { box.textContent = '—'; return; }
    if (box.getAttribute('data-loaded') === '1') return; // already rendered
    box.setAttribute('data-loaded', '1');
    var et = function(ts) { return ts ? new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) : '—'; };
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    // v1146: tightened + laid out ACROSS the page; the ADDRESS leads each site
    // line instead of an "ON SITE" label. Two flex columns on desktop, stacks
    // at phone width.
    var tripsHtml = v.trips.length
      ? v.trips.map(function(t){
          return '<div style="white-space:nowrap;">left yard <b style="color:var(--green-dark);">' + et(t.left_yard) + '</b> → back <b style="color:var(--green-dark);">' + et(t.back_yard) + '</b> <span style="color:var(--text-light);">(' + PayrollPage._fmtDur(t.mins_out) + ')</span></div>';
        }).join('')
      : '<div style="color:var(--text-light);">no yard trips</div>';
    // v1149: expanded view lists MERGED sites (neighbouring stops folded into
    // one work address), with a visit count when a site was returned to.
    var mstops = v.merged || PayrollPage._mergeStops(v.stops);
    var stopsHtml = mstops.length
      ? mstops.map(function(s, i){
          var sid = rid + '-s' + i;
          var maps = 'https://maps.google.com/?q=' + s.lat + ',' + s.lon;
          return '<div style="padding:1px 0;">'
            + '<span id="' + sid + '"><a href="' + maps + '" target="_blank" rel="noopener" style="color:var(--link,#1565c0);font-weight:600;">📍 locating…</a></span>'
            + ' <span style="white-space:nowrap;"><span style="color:var(--text-light);">' + et(s.arrive_ts) + '–' + et(s.depart_ts) + '</span>'
            + ' <b style="color:var(--green-dark);">' + PayrollPage._fmtDur(s.mins) + '</b>'
            + (s.visits > 1 ? ' <span style="color:var(--text-light);">(' + s.visits + ' visits)</span>' : '')
            + '</span></div>';
        }).join('')
      : '<div style="color:var(--text-light);">No stops away from the yard.</div>';
    box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:2px 18px;font-size:12px;line-height:1.5;">'
      + '<div style="flex:1 1 185px;min-width:0;">' + tripsHtml + '</div>'
      + '<div style="flex:1.7 1 235px;min-width:0;">' + stopsHtml + '</div>'
      + '</div>';
    mstops.forEach(function(s, i){
      var sid = rid + '-s' + i;
      PayrollPage._revGeo(s.lat, s.lon).then(function(addr){
        var el = document.getElementById(sid); if (!el || !addr) return;
        var maps = 'https://maps.google.com/?q=' + s.lat + ',' + s.lon;
        el.innerHTML = '<a href="' + maps + '" target="_blank" rel="noopener" style="color:var(--link,#1565c0);font-weight:600;">📍 ' + esc(addr) + '</a>';
      }).catch(function(){});
    });
  },
  _saveBouncieNote: function(d, v) { try { localStorage.setItem('bm-payroll-note-' + d, v); if (typeof UI !== 'undefined') UI.toast('Note saved'); } catch(e) {} },

  // ── v1122: inline quick-edit of clock in/out right in the calendar cell ──
  // Saves straight to the day's time entry (creates one if none). Recomputes
  // hours when both ends are set; keeps the cell expanded across the reload.
  _hm: function(ts) { if (!ts) return ''; var x = new Date(ts); return ('0' + x.getHours()).slice(-2) + ':' + ('0' + x.getMinutes()).slice(-2); },
  _saveInline: function(user, date, entryId, field, hhmm, mode) {
    if (!hhmm) return;
    var iso = date + 'T' + hhmm + ':00';
    var col = field === 'in' ? 'clockIn' : 'clockOut';
    var e = entryId ? DB.timeEntries.getAll().find(function(t) { return t.id === entryId; }) : null;
    if (e) {
      var upd = {}; upd[col] = iso;
      var ci = field === 'in' ? iso : e.clockIn, co = field === 'out' ? iso : e.clockOut;
      if (ci && co) upd.hours = Math.round((new Date(co) - new Date(ci)) / 3600000 * 100) / 100;
      DB.timeEntries.update(e.id, upd);
    } else {
      var ne = { userId: user, user: user, date: date }; ne[col] = iso;
      DB.timeEntries.create(ne);
    }
    var dk = PayrollPage._dayApprovalKey(user, date);
    if (PayrollPage._getApprovals()[dk] === 'approved') { PayrollPage._approvals[dk + '_editedAfter'] = true; PayrollPage._saveApprovals(); }
    PayrollPage._expandedCells[user + '_' + date] = true; // keep the cell open after re-render
    if (typeof UI !== 'undefined') UI.toast('Saved');
    if (mode === 'detail') {
      // re-open Details so the edit is visible and the evidence panel refreshes
      try { PayrollPage.showDayDetail(user, date); } catch (err) {}
      return;
    }
    if (typeof loadPage === 'function') loadPage('payroll');
  },
  // Inline in/out editor markup for one entry (or a blank creator row when e is null)
  _inlineTimeRow: function(user, date, e, mode) {
    var self = PayrollPage; e = e || {};
    // v1157: `mode` lets the SAME editor run inside the Details modal. Without
    // it the save ends in loadPage('payroll'), which tears the modal down
    // mid-edit. In 'detail' mode we re-open Details instead.
    var m = mode === 'detail' ? 'detail' : '';
    var mk = function(field, val) {
      return '<input type="time" value="' + val + '" onclick="event.stopPropagation()" onchange="PayrollPage._saveInline(\'' + user + '\',\'' + date + '\',\'' + (e.id || '') + '\',\'' + field + '\',this.value,\'' + m + '\')" style="font-size:' + (m ? '13' : '11') + 'px;border:1px solid var(--border);border-radius:4px;padding:' + (m ? '4px 6px' : '2px 2px') + ';width:100%;min-width:0;max-width:' + (m ? '120' : '104') + 'px;box-sizing:border-box;">';
    };
    // v1158: no dash between the fields and no hours restatement — Doug: "You
    // don't need a dash there... You can just have the in and out so it's
    // tighter." The day total is already at the top of the cell and the day's
    // pay now sits beside Details, so the per-entry hours had nothing to add.
    return '<div style="margin-top:3px;display:flex;align-items:center;gap:3px;flex-wrap:wrap;justify-content:center;min-width:0;">'
      + mk('in', self._hm(e.clockIn)) + mk('out', self._hm(e.clockOut))
      + '</div>';
    // v1155: the AM/PM restatement under the inputs is gone. It was added in
    // v1140 because the narrow time inputs clipped the meridiem; they no longer
    // do (they render "11:07 AM" in full), so the line only repeated what was
    // directly above it. Doug: "just details and 7.5 h. does not need to repeat
    // what is written above."
  },

  // ── v1122: Bouncie truck panel = single date + ‹ › arrows (was a 7-day strip) ──
  _bDate: null,
  _bounceDateShift: function(delta) {
    var base = PayrollPage._bDate || new Date().toISOString().slice(0, 10);
    var nd = new Date(base + 'T12:00:00'); nd.setDate(nd.getDate() + delta);
    var p = function(x) { return (x < 10 ? '0' : '') + x; };
    PayrollPage._bDate = nd.getFullYear() + '-' + p(nd.getMonth() + 1) + '-' + p(nd.getDate());
    var lbl = document.getElementById('bounce-date-label');
    if (lbl) lbl.textContent = nd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    PayrollPage._bDayOpen = null;           // force _bounceToggle to open (not toggle off)
    PayrollPage._bounceToggle(PayrollPage._bDate);
  },

  // ── v1097: Sales commissions (separate from hourly payroll) ──
  // 8% of the job total for work SOLD by each salesperson. Attribution:
  // a job.salesperson field if present, else the legacy "D —/C —/M —" name
  // prefix. Doug + Catherine + Michelle only. Computed live from jobs; no
  // new table (it's a read-only roll-up).
  _COMMISSION_RATE: 0.08,
  _salesPerson: function(job) {
    var s = (job.salesperson || job.sales_person || '').toString().toLowerCase();
    if (s) {
      if (s.indexOf('doug') >= 0) return 'Doug';
      if (s.indexOf('cath') >= 0 || s.indexOf('conway') >= 0) return 'Catherine';
      if (s.indexOf('mich') >= 0 || s.indexOf('melagrano') >= 0) return 'Michelle';
      if (s === 'd') return 'Doug'; if (s === 'c') return 'Catherine'; if (s === 'm') return 'Michelle';
    }
    var m = /^\s*([DCM])\s*[—\-]/.exec(job.clientName || job.client_name || '');
    return m ? { D:'Doug', C:'Catherine', M:'Michelle' }[m[1]] : null;
  },
  _renderCommissions: function() {
    var jobs = (typeof DB !== 'undefined' && DB.jobs) ? DB.jobs.getAll() : [];
    var agg = { Doug:{n:0,t:0}, Catherine:{n:0,t:0}, Michelle:{n:0,t:0} };
    var tagged = 0;
    jobs.forEach(function(j) {
      var w = PayrollPage._salesPerson(j);
      if (w && agg[w]) { agg[w].n++; agg[w].t += (parseFloat(j.total) || 0); tagged++; }
    });
    var money = (typeof UI !== 'undefined' && UI.money) ? UI.money : function(n){ return '$' + (n||0).toFixed(0); };
    var rows = ['Doug','Catherine','Michelle'].map(function(p) {
      var a = agg[p], comm = a.t * PayrollPage._COMMISSION_RATE;
      return '<div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:10px 14px;border-top:1px solid var(--border);align-items:baseline;">'
        + '<div style="font-weight:600;font-size:13px;">' + p + ' <span style="font-size:11px;color:var(--text-light);font-weight:400;">(' + a.n + ' sale' + (a.n === 1 ? '' : 's') + ')</span></div>'
        + '<div style="font-size:12px;color:var(--text-light);text-align:right;white-space:nowrap;">' + money(a.t) + '</div>'
        + '<div style="font-size:14px;font-weight:800;color:var(--green-dark);text-align:right;white-space:nowrap;">' + money(comm) + '</div>'
        + '</div>';
    }).join('');
    var lowTag = tagged < jobs.length * 0.5;
    return '<details style="margin-top:20px;background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">'
      + '<summary style="padding:12px 16px;cursor:pointer;font-weight:700;font-size:14px;list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span>🏷 Sales Commissions <span style="font-weight:500;color:var(--text-light);font-size:12px;">8% · separate from hourly pay</span></span><span style="font-size:11px;color:var(--text-light);font-weight:500;">tap ▾</span>'
      + '</summary>'
      + '<div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:8px 14px 2px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-light);letter-spacing:.4px;"><div>Salesperson</div><div style="text-align:right;">Sales $</div><div style="text-align:right;">8% comm</div></div>'
      + rows
      + '<div style="padding:10px 16px;font-size:11px;color:' + (lowTag ? '#b45309' : 'var(--text-light)') + ';line-height:1.5;border-top:1px solid var(--border);">'
      +   (lowTag ? '⚠ ' : '') + 'Counts jobs tagged to a salesperson (' + tagged + ' of ' + jobs.length + ' tagged). Untagged jobs are not counted — set a job\'s salesperson (or prefix its name &ldquo;M — …&rdquo;) to include it. Commission is 8% of job total; separate from hourly payroll.'
      + '</div>'
      + '</details>';
  },

  render: function() {
    var self = PayrollPage;
    self._bDayOpen = null;
    var dates = self._getWeekDates(self._weekOffset);
    var employees = self._getEmployees();
    var weekStart = dates[0];
    var weekEnd = dates[6];
    var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var today = new Date().toISOString().split('T')[0];
    var approvals = self._getApprovals();

    var html = '<div style="max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">';

    // ── Week Navigator ──
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<button onclick="PayrollPage._weekOffset--;loadPage(\'payroll\')" style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;">← Prev</button>'
      + '<div style="text-align:center;">'
      + '<div style="font-size:18px;font-weight:800;">Week of ' + PayrollPage._pDate(weekStart).toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' – ' + PayrollPage._pDate(weekEnd).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + '</div>'
      + (self._weekOffset === 0 ? '<span style="font-size:11px;color:var(--green-dark);font-weight:600;">Current Week</span>' : '<button onclick="PayrollPage._weekOffset=0;loadPage(\'payroll\')" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;text-decoration:underline;">Go to current week</button>')
      + '</div>'
      + '<button onclick="PayrollPage._weekOffset++;loadPage(\'payroll\')" style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;">Next →</button>'
      + '</div>';

    // ── Bulk Actions ──
    // v1142: built here but rendered BELOW the grid. On a phone this row of six
    // buttons pushed the actual hours off-screen — the numbers are the point of
    // the page, the actions are what you do after reading them.
    var bulkActionsHtml = '<div style="display:flex;gap:8px;margin-top:14px;margin-bottom:12px;flex-wrap:wrap;">'
      + '<button onclick="PayrollPage.approveAll(\'' + weekStart + '\')" class="btn btn-primary" style="font-size:12px;">✓ Approve All</button>'
      + '<button onclick="PayrollPage.showPayrollSummary(\'' + weekStart + '\')" class="btn btn-outline" style="font-size:12px;">📊 Payroll Summary</button>'
      + '<button onclick="PayrollPage.exportWeek(\'' + weekStart + '\')" class="btn btn-outline" style="font-size:12px;">📥 Export CSV</button>'
      + '<button onclick="TeamPage.showForm()" class="btn btn-outline" style="font-size:12px;">+ Add Crew</button>'
      + '<button onclick="window.open(\'onboarding/\',\'_blank\')" class="btn btn-outline" style="font-size:12px;">🎓 Onboarding</button>'
      + '<button onclick="window.open(\'payroll-quarterly-guide-3a7f.html\',\'_blank\')" class="btn btn-outline" style="font-size:12px;">📋 How to file quarterly</button>'
      + '</div>';

    // ── Week Grid ──
    // v1089: phones get a per-crew stacked card (the 9-col grid crushed at 375px);
    // desktop keeps the original grid untouched.
    var isMobile = (typeof window !== 'undefined') && window.innerWidth <= 700;
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';

    // Header row
    if (!isMobile)
    html += '<div style="display:grid;grid-template-columns:140px repeat(7,1fr) 70px;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">'
      + '<div style="padding:10px 12px;">Employee</div>';
    dates.forEach(function(d, i) {
      var isToday = d === today;
      // v1140: tapping a day header drives the truck panel below — the panel's
      // own < > date selector is gone, so there is ONE date in play, not two
      // that could disagree.
      var isSel = (PayrollPage._bDate === d);
      var bg = isSel ? 'background:var(--green-dark);color:#fff;'
                     : (isToday ? 'background:var(--green-bg);color:var(--green-dark);' : '');
      html += '<div onclick="PayrollPage._pickDay(\'' + d + '\')" title="Show this day\'s truck times below"'
        + ' style="padding:10px 6px;text-align:center;cursor:pointer;border-radius:6px 6px 0 0;' + bg + '">'
        + dayNames[i] + '<br><span style="font-weight:400;font-size:10px;">' + PayrollPage._pDate(d).getDate() + '</span></div>';
    });
    html += '<div style="padding:10px 6px;text-align:center;">Total</div>';
    html += '</div>';

    // Employee rows
    employees.forEach(function(emp) {
      if (isMobile) { html += self._mobileEmpCard(emp, dates, approvals, today, weekStart); return; }
      var weekTotal = 0;
      var weekIssues = 0;
      var empKey = self._approvalKey(emp.name || emp.id, weekStart);
      // v745: week-level approval = explicit week-approval OR every
      // working-day cell individually approved (computed below as we
      // walk the date cells).
      var weekExplicit = approvals[empKey] === 'approved';
      var workingDaysCount = 0;
      var daysApprovedCount = 0;

      html += '<div style="display:grid;grid-template-columns:140px repeat(7,1fr) 70px;border-bottom:1px solid #f0f0f0;align-items:stretch;">';

      // Employee name cell — click opens the crew profile (TeamPage.showDetail).
      // v743: avatar shows photo_url if present, falls back to first-letter monogram.
      var avatar;
      if (emp.photo_url) {
        avatar = '<img src="' + UI.esc(emp.photo_url) + '" alt="" '
          + 'style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#f3f4f6;">';
      } else {
        avatar = '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">'
          + (emp.name || '?').charAt(0).toUpperCase() + '</div>';
      }
      html += '<div onclick="if(typeof TeamPage!==\'undefined\')TeamPage.showDetail(\'' + UI.esc(emp.id) + '\')" '
        + 'title="View crew profile" '
        + 'style="padding:10px 12px;display:flex;align-items:center;gap:8px;border-right:1px solid #f0f0f0;cursor:pointer;">'
        + avatar
        + '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--accent);">' + UI.esc(emp.name || '') + '</div></div>'
        + '</div>';

      // Day cells
      dates.forEach(function(date) {
        var entries = self._getEntriesForDate(emp.name || emp.id, date);
        var dayHours = self._totalHours(entries);
        weekTotal += dayHours;
        var issues = self._hasIssues(entries, date);
        if (issues.length) weekIssues++;
        var isToday = date === today;
        var cellKey = (emp.name || emp.id) + '_' + date;
        var expanded = self._expandedCells[cellKey];
        var dayKey = self._dayApprovalKey(emp.name || emp.id, date);
        var dayApproved = approvals[dayKey] === 'approved';
        var barColor = issues.length > 0 ? '#ef4444' : (dayHours > 0 ? '#22c55e' : '#e5e7eb');
        var editedAfterApproval = dayApproved && approvals[dayKey + '_editedAfter'];
        // v745: track per-day rollup. Only days with hours OR entries count.
        if (dayHours > 0 || entries.length > 0) {
          workingDaysCount++;
          if (dayApproved && !editedAfterApproval) daysApprovedCount++;
        }

        if (editedAfterApproval) barColor = '#f59e0b';

        html += '<div onclick="PayrollPage._toggleCell(\'' + cellKey + '\')" style="padding:6px 4px;text-align:center;cursor:pointer;border-right:1px solid #f8f8f8;' + (isToday ? 'background:#f0fdf4;' : '') + 'position:relative;min-height:50px;">';

        // Hours
        html += '<div style="font-size:14px;font-weight:' + (dayHours > 0 ? '700' : '400') + ';color:' + (dayHours > 0 ? 'var(--text)' : '#ccc') + ';">' + (dayHours > 0 ? dayHours.toFixed(1) : '—') + '</div>';

        // Status bar (collapsed)
        html += '<div style="height:' + (expanded ? '0' : '4') + 'px;background:' + barColor + ';border-radius:2px;margin:4px 2px 0;transition:height .2s;"></div>';

        // Icons
        if (entries.some(function(e) { return PayrollPage._cellNote(e.notes); })) html += '<span style="font-size:9px;position:absolute;top:2px;right:3px;">📝</span>';

        // Expanded content
        if (expanded) {
          html += '<div style="margin-top:6px;text-align:left;font-size:11px;" onclick="event.stopPropagation()">';
          // Status bar expanded
          html += '<div style="height:6px;background:' + barColor + ';border-radius:3px;margin-bottom:6px;"></div>';
          if (issues.length) {
            issues.forEach(function(iss) {
              html += '<div style="color:#ef4444;font-size:10px;">⚠ ' + iss + '</div>';
            });
          }
          // v1156: the clock in/out inputs STAY — Doug only wanted the line that
          // REPEATED them underneath removed, not the entries themselves.
          entries.forEach(function(e) {
            html += PayrollPage._inlineTimeRow(emp.name || emp.id, date, e);
            var cn1 = PayrollPage._cellNote(e.notes);
            if (cn1) html += '<div style="font-size:10px;color:var(--text-light);font-style:italic;">' + UI.esc(cn1) + '</div>';
          });
          if (!entries.length) html += PayrollPage._inlineTimeRow(emp.name || emp.id, date, null);
          // Day detail button
          var _pay = PayrollPage._dayPay(emp.name || emp.id, date, emp);
          html += '<div style="margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">'
            + '<button onclick="event.stopPropagation();PayrollPage.showDayDetail(\'' + UI.esc(emp.name || emp.id) + '\',\'' + date + '\')" style="font-size:10px;background:var(--accent);color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">Details</button>'
            + (_pay ? '<span style="font-size:12px;font-weight:700;color:var(--green-dark);">' + _pay + '</span>' : '')
            + '</div>';
          // Approval indicator
          if (dayApproved && !editedAfterApproval) html += '<div style="font-size:9px;color:#22c55e;margin-top:2px;">✓ Approved</div>';
          if (editedAfterApproval) html += '<div style="font-size:9px;color:#f59e0b;margin-top:2px;">⚠ Re-approval needed</div>';
          html += '</div>';
        }

        html += '</div>';
      });

      // Weekly total (v745: derived approval — week tile shows ✓ if the
      // week is explicitly approved OR every working day is approved.
      // Partial day approvals show ✓ N/M).
      var overtime = Math.max(0, weekTotal - 40);
      var allDaysOk = workingDaysCount > 0 && daysApprovedCount === workingDaysCount;
      var weekApproved = weekExplicit || allDaysOk;
      var partialBadge = (!weekApproved && daysApprovedCount > 0)
        ? '<div style="font-size:9px;color:#16a34a;">✓ ' + daysApprovedCount + '/' + workingDaysCount + '</div>'
        : '';
      // v1159: week PAY under the week hours; OT line gone — Doug: "No
      // overtime. Yeah. There is no overtime."
      var _wRate = Number((emp.rate || emp.payRate) || 0);
      html += '<div style="padding:10px 6px;text-align:center;font-weight:800;font-size:15px;background:' + (weekApproved ? '#f0fdf4' : 'var(--bg)') + ';border-left:2px solid var(--border);">'
        + weekTotal.toFixed(1)
        + (_wRate ? '<div style="font-size:12px;color:var(--green-dark);font-weight:800;">$' + Math.round(weekTotal * _wRate).toLocaleString() + '</div>' : '')
        + (weekApproved ? '<div style="font-size:9px;color:#22c55e;">✓</div>' : partialBadge)
        + (weekIssues > 0 ? '<div style="font-size:9px;color:#ef4444;">' + weekIssues + ' issues</div>' : '')
        + '</div>';

      html += '</div>'; // end employee row
    });

    html += '</div>'; // end grid

    // ── Phone + truck data (v1149) — ABOVE the weekly review, per Doug:
    // "The data from the trucks and my phone should go above weekly review."
    // (v1147 had moved it below; this puts it back.) Order inside the block is
    // phone first, then the trucks under it. Action buttons still come last —
    // the v1143 rule: read the hours, then the detail, then approve. ──
    html += self._renderBouncie(dates);

    // ── Weekly Review Panel ──
    html += PayrollPage._renderWeeklyReview(dates, employees, weekStart);

    // v1143: action buttons sit BELOW the weekly review, per Doug. You read the
    // hours, then the truck/phone detail, then the review — and only then do you
    // approve or export. Actions come last because they are what you do after
    // you have checked the numbers, not before.
    html += bulkActionsHtml;

    // ── Earnings Ledger (v1082) — earned vs paid per member ──
    html += '<div id="pay-ledger" style="margin-top:20px;"><div style="font-size:12px;color:var(--text-light);">Loading earnings ledger…</div></div>';
    setTimeout(PayrollPage._loadLedger, 0);

    // ── Sales Commissions — DORMANT until spec settles (Catherine 10%/hourly
    // election + per-person rates). Methods kept below; not rendered yet.
    // html += self._renderCommissions();

    // v383: My Pay (employeecenter) folded under Payroll. Link at bottom for now;
    // will pull out to its own page once Crew View ships and crew-vs-admin nav splits.
    html += '<div style="margin-top:24px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +   '<div><strong style="font-size:13px;">My Pay & Hours</strong><div style="font-size:11px;color:var(--text-light);margin-top:2px;">Personal view: paystubs, hours worked, time off.</div></div>'
      +   '<button onclick="loadPage(\'employeecenter\')" class="btn btn-outline" style="font-size:12px;">Open My Pay &rarr;</button>'
      + '</div>';

    html += '</div>';
    return html;
  },

  // v1089: phone layout — one card per crew member, days stacked vertically.
  // Reuses the exact same data + approval logic as the desktop grid.
  _mobileEmpCard: function(emp, dates, approvals, today, weekStart) {
    var self = PayrollPage;
    var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var empKey = self._approvalKey(emp.name || emp.id, weekStart);
    var weekExplicit = approvals[empKey] === 'approved';
    var weekTotal = 0, weekIssues = 0, workingDaysCount = 0, daysApprovedCount = 0;
    var rows = '';
    dates.forEach(function(date, i) {
      var entries = self._getEntriesForDate(emp.name || emp.id, date);
      var dayHours = self._totalHours(entries);
      weekTotal += dayHours;
      var issues = self._hasIssues(entries, date);
      if (issues.length) weekIssues++;
      var cellKey = (emp.name || emp.id) + '_' + date;
      var expanded = self._expandedCells[cellKey];
      var dayKey = self._dayApprovalKey(emp.name || emp.id, date);
      var dayApproved = approvals[dayKey] === 'approved';
      var editedAfterApproval = dayApproved && approvals[dayKey + '_editedAfter'];
      var barColor = issues.length > 0 ? '#ef4444' : (dayHours > 0 ? '#22c55e' : '#e5e7eb');
      if (editedAfterApproval) barColor = '#f59e0b';
      if (dayHours > 0 || entries.length > 0) {
        workingDaysCount++;
        if (dayApproved && !editedAfterApproval) daysApprovedCount++;
      }
      var isToday = date === today;
      rows += '<div onclick="PayrollPage._toggleCell(\'' + cellKey + '\')" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid #f4f4f4;cursor:pointer;' + (isToday ? 'background:#f0fdf4;' : '') + '">'
        + '<div style="width:52px;font-size:12px;font-weight:700;color:var(--text-light);">' + dayNames[i] + ' ' + PayrollPage._pDate(date).getDate() + '</div>'
        + '<div style="width:6px;align-self:stretch;border-radius:3px;background:' + barColor + ';"></div>'
        + '<div style="flex:1;font-size:14px;font-weight:' + (dayHours > 0 ? '700' : '400') + ';color:' + (dayHours > 0 ? 'var(--text)' : '#bbb') + ';">' + (dayHours > 0 ? dayHours.toFixed(1) + ' h' : '—') + '</div>'
        + (entries.some(function(e) { return PayrollPage._cellNote(e.notes); }) ? '<span style="font-size:11px;">📝</span>' : '')
        + (dayApproved && !editedAfterApproval ? '<span style="font-size:11px;color:#22c55e;">✓</span>' : '')
        + (editedAfterApproval ? '<span style="font-size:11px;color:#f59e0b;">⚠</span>' : '')
        + '<span style="color:#ccc;font-size:12px;">' + (expanded ? '▾' : '▸') + '</span>'
        + '</div>';
      if (expanded) {
        rows += '<div style="padding:4px 12px 10px 68px;font-size:12px;" onclick="event.stopPropagation()">';
        issues.forEach(function(iss) { rows += '<div style="color:#ef4444;font-size:11px;">⚠ ' + iss + '</div>'; });
        entries.forEach(function(e) {
          rows += PayrollPage._inlineTimeRow(emp.name || emp.id, date, e);
          var cn2 = PayrollPage._cellNote(e.notes);
          if (cn2) rows += '<div style="color:var(--text-light);font-style:italic;">' + UI.esc(cn2) + '</div>';
        });
        if (!entries.length) rows += PayrollPage._inlineTimeRow(emp.name || emp.id, date, null);
        var _payM = PayrollPage._dayPay(emp.name || emp.id, date, emp);
        rows += '<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
          + '<button onclick="event.stopPropagation();PayrollPage.showDayDetail(\'' + UI.esc(emp.name || emp.id) + '\',\'' + date + '\')" style="font-size:12px;background:var(--accent);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Details</button>'
          + (_payM ? '<span style="font-size:13px;font-weight:700;color:var(--green-dark);">' + _payM + '</span>' : '')
          + '</div>';
        if (dayApproved && !editedAfterApproval) rows += '<div style="font-size:10px;color:#22c55e;margin-top:3px;">✓ Approved</div>';
        if (editedAfterApproval) rows += '<div style="font-size:10px;color:#f59e0b;margin-top:3px;">⚠ Re-approval needed</div>';
        rows += '</div>';
      }
    });
    var overtime = Math.max(0, weekTotal - 40);
    var allDaysOk = workingDaysCount > 0 && daysApprovedCount === workingDaysCount;
    var weekApproved = weekExplicit || allDaysOk;
    var avatar = emp.photo_url
      ? '<img src="' + UI.esc(emp.photo_url) + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#f3f4f6;">'
      : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">' + (emp.name || '?').charAt(0).toUpperCase() + '</div>';
    return '<div style="border-bottom:8px solid var(--bg);">'
      + '<div onclick="if(typeof TeamPage!==\'undefined\')TeamPage.showDetail(\'' + UI.esc(emp.id) + '\')" style="display:flex;align-items:center;gap:10px;padding:12px;background:' + (weekApproved ? '#f0fdf4' : 'var(--bg)') + ';cursor:pointer;">'
      + avatar
      + '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(emp.name || '') + '</div>'
      + (weekIssues > 0 ? '<div style="font-size:11px;color:#ef4444;">' + weekIssues + ' issue' + (weekIssues > 1 ? 's' : '') + '</div>' : '')
      + '</div>'
      + '<div style="text-align:right;"><div style="font-weight:800;font-size:17px;">' + weekTotal.toFixed(1) + '<span style="font-size:11px;font-weight:600;color:var(--text-light);"> h</span></div>'
      + ((Number((emp.rate || emp.payRate) || 0)) ? '<div style="font-size:13px;color:var(--green-dark);font-weight:800;">$' + Math.round(weekTotal * Number(emp.rate || emp.payRate)).toLocaleString() + '</div>' : '')
      + (weekApproved ? '<div style="font-size:10px;color:#22c55e;">✓ approved</div>' : (daysApprovedCount > 0 ? '<div style="font-size:10px;color:#16a34a;">✓ ' + daysApprovedCount + '/' + workingDaysCount + '</div>' : ''))
      + '</div></div>'
      + rows
      + '</div>';
  },

  // ── Weekly Review Panel ──
  _renderWeeklyReview: function(dates, employees, weekStart) {
    var approvals = PayrollPage._getApprovals();
    var totalHours = 0, totalOT = 0, totalPTO = 0;
    var warnings = [];
    var approved = 0, pending = 0;

    employees.forEach(function(emp) {
      var empWeek = 0;
      var workingDays = 0;
      var daysApproved = 0;
      dates.forEach(function(d) {
        var entries = PayrollPage._getEntriesForDate(emp.name || emp.id, d);
        var dayHrs = PayrollPage._totalHours(entries);
        empWeek += dayHrs;
        var issues = PayrollPage._hasIssues(entries, d);
        issues.forEach(function(iss) { warnings.push(emp.name + ' (' + d + '): ' + iss); });
        // v745: track per-day approvals so they can roll up to the week.
        // A day "needs approval" only if it has hours OR notes; days with
        // nothing don't count against the rollup.
        if (dayHrs > 0 || entries.length > 0) {
          workingDays++;
          var dayKey = PayrollPage._dayApprovalKey(emp.name || emp.id, d);
          if (approvals[dayKey] === 'approved' && !approvals[dayKey + '_editedAfter']) daysApproved++;
        }
      });
      totalHours += empWeek;
      var ot = Math.max(0, empWeek - 40);
      totalOT += ot;

      // Roll up: employee is "approved" if their week is explicitly approved
      // OR every one of their working days is individually approved.
      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      var weekExplicit = approvals[empKey] === 'approved';
      var allDaysApproved = workingDays > 0 && daysApproved === workingDays;
      if (weekExplicit || allDaysApproved) approved++;
      else pending++;
    });

    var allApproved = pending === 0 && approved > 0;
    var payrollReady = allApproved && warnings.length === 0;

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:16px;">';
    html += '<h3 style="font-size:16px;margin:0 0 16px;">Weekly Review</h3>';

    // Stats
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">';
    html += '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:10px;"><div style="font-size:22px;font-weight:800;">' + totalHours.toFixed(1) + '</div><div style="font-size:11px;color:var(--text-light);">Total Hours</div></div>';
    html += '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:10px;"><div style="font-size:22px;font-weight:800;">' + totalPTO.toFixed(1) + '</div><div style="font-size:11px;color:var(--text-light);">PTO</div></div>';
    html += '<div style="text-align:center;padding:12px;background:' + (warnings.length > 0 ? '#fef2f2' : 'var(--bg)') + ';border-radius:10px;"><div style="font-size:22px;font-weight:800;color:' + (warnings.length > 0 ? '#dc2626' : 'var(--text)') + ';">' + warnings.length + '</div><div style="font-size:11px;color:var(--text-light);">Warnings</div></div>';
    html += '<div style="text-align:center;padding:12px;background:' + (allApproved ? '#f0fdf4' : '#fef3c7') + ';border-radius:10px;"><div style="font-size:22px;font-weight:800;color:' + (allApproved ? '#16a34a' : '#d97706') + ';">' + approved + '/' + (approved + pending) + '</div><div style="font-size:11px;color:var(--text-light);">Approved</div></div>';
    html += '</div>';

    // Payroll readiness
    html += '<div style="padding:14px;border-radius:10px;background:' + (payrollReady ? '#f0fdf4;border:2px solid #22c55e' : '#fef3c7;border:2px solid #f59e0b') + ';display:flex;align-items:center;gap:12px;">'
      + '<div style="font-size:28px;">' + (payrollReady ? '✅' : '⏳') + '</div>'
      + '<div><div style="font-weight:700;font-size:14px;color:' + (payrollReady ? '#166534' : '#92400e') + ';">' + (payrollReady ? 'Payroll Ready' : 'Payroll Not Ready') + '</div>'
      + '<div style="font-size:12px;color:' + (payrollReady ? '#166534' : '#92400e') + ';">'
      + (payrollReady ? 'All hours approved, no warnings. Open the Payroll Summary to review hours and run payroll.' : (pending > 0 ? pending + ' employee(s) pending approval. ' : '') + (warnings.length > 0 ? warnings.length + ' warning(s) to resolve.' : ''))
      + '</div></div>'
      + (payrollReady ? '<button onclick="PayrollPage.showPayrollSummary(\'' + weekStart + '\')" class="btn btn-primary" style="margin-left:auto;white-space:nowrap;">💰 Run Payroll</button>' : '')
      + '</div>';

    // Warnings list
    if (warnings.length > 0) {
      html += '<div style="margin-top:12px;">';
      warnings.slice(0, 10).forEach(function(w) {
        html += '<div style="font-size:12px;color:#dc2626;padding:4px 0;border-bottom:1px solid #fef2f2;">⚠ ' + UI.esc(w) + '</div>';
      });
      if (warnings.length > 10) html += '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">+ ' + (warnings.length - 10) + ' more</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  // ── Cell Toggle ──
  _toggleCell: function(key) {
    PayrollPage._expandedCells[key] = !PayrollPage._expandedCells[key];
    loadPage('payroll');
  },

  // ── Day Detail Modal ──
  showDayDetail: function(userId, date) {
    var entries = PayrollPage._getEntriesForDate(userId, date);
    var dayName = PayrollPage._pDate(date).toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });

    var html = '<div style="margin-bottom:16px;font-size:14px;color:var(--text-light);">' + dayName + '</div>';

    // Hours list
    if (entries.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);">No hours recorded</div>';
    } else {
      entries.forEach(function(e, i) {
        html += '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<div><strong>' + (e.hours ? e.hours.toFixed(1) + ' hrs' : '—') + '</strong>'
          + (e.clockOut ? '' : '<span style="font-size:12px;color:var(--text-light);margin-left:8px;">(no clock-out)</span>')
          + '</div>'
          + '<div style="display:flex;gap:4px;">'
          + '<button onclick="PayrollPage.editHours(\'' + e.id + '\')" class="btn btn-outline" style="font-size:11px;padding:3px 8px;">Edit</button>'
          + '<button onclick="PayrollPage.deleteHours(\'' + e.id + '\',\'' + userId + '\',\'' + date + '\')" class="btn btn-outline" style="font-size:11px;padding:3px 8px;color:var(--red);">×</button>'
          + '</div></div>'
          // v1157: in/out editable right here, per Doug: "In and out time should
          // be editable on the details page also."
          + '<div style="display:flex;justify-content:flex-start;">' + PayrollPage._inlineTimeRow(userId, date, e, 'detail') + '</div>';
        if (e.jobId) {
          var job = DB.jobs.getById(e.jobId);
          html += '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">Job: ' + (job ? '#' + job.jobNumber + ' ' + (job.clientName || '') : e.jobId) + '</div>';
        }
        if (e.notes) html += '<div style="font-size:12px;color:var(--text-light);margin-top:4px;font-style:italic;">📝 ' + UI.esc(e.notes) + '</div>';
        html += '</div>';
      });
    }

    // ── v1151: EVIDENCE panel ────────────────────────────────────────────────
    // Doug: "The details page should be much more detailed. Have a lot of this
    // stuff. So in case there was a harder time figuring it out, all the info is
    // more laid out there." Everything we know about this person on this day,
    // in one place: the truck's yard in/out, each site with its address, the
    // yard / job / travel split, the phone span, and any reason to distrust the
    // number. Filled async — the RPCs are the same ones the day panel uses.
    var evId = 'dayev-' + Math.random().toString(36).slice(2, 9);
    html += '<div id="' + evId + '" style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-light);margin-bottom:6px;">EVIDENCE FOR THIS DAY</div>'
      + '<div style="font-size:12px;color:var(--text-light);">loading GPS + phone…</div></div>';
    setTimeout(function(){ PayrollPage._fillDayEvidence(evId, userId, date); }, 0);

    // Actions
    html += '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button onclick="PayrollPage.addHours(\'' + userId + '\',\'' + date + '\')" class="btn btn-primary" style="flex:1;">+ Add Hours</button>'
      + '<button onclick="PayrollPage.addNote(\'' + userId + '\',\'' + date + '\')" class="btn btn-outline" style="flex:1;">📝 Add Note</button>'
      + '</div>';

    // Approval
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    var dayApproved = PayrollPage._getApprovals()[dayKey] === 'approved';
    html += '<div style="margin-top:12px;text-align:center;">'
      + (dayApproved
        ? '<span style="color:#22c55e;font-weight:700;">✓ Day Approved</span>'
        : '<button onclick="PayrollPage.approveDay(\'' + userId + '\',\'' + date + '\')" class="btn btn-primary" style="width:100%;">✓ Approve Day</button>')
      + '</div>';

    UI.showModal(UI.esc(userId) + ' — ' + dayName, html);
  },

  // ── v1151: day evidence for the Details modal ─────────────────────────────
  _fillDayEvidence: function(elId, userId, date) {
    var box = document.getElementById(elId); if (!box) return;
    var esc = (typeof UI !== 'undefined' && UI.esc) ? UI.esc : function(x){return x;};
    var et = function(ts){ return ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'; };
    var fd = PayrollPage._fmtDur;
    Promise.all([
      PayrollPage._yardTrips(date),
      PayrollPage._truckStops(date),
      PayrollPage._loadPhoneDay(date),
      PayrollPage._loadTeamAndDrivers()
    ]).then(function(res) {
      var trips = res[0] || [], stops = res[1] || [], ph = res[2];
      // which trucks is THIS person the assumed driver of?
      var mine = {};
      Object.keys(PayrollPage._drivers || {}).forEach(function(vid) {
        if ((PayrollPage._drivers[vid] || '') === userId) mine[vid] = true;
      });
      var anyMine = Object.keys(mine).length > 0;
      var byV = {};
      trips.forEach(function(r){ (byV[r.vehicle_id] = byV[r.vehicle_id] || {name:r.name, model:r.model, trips:[], stops:[]}).trips.push(r); });
      stops.forEach(function(r){ (byV[r.vehicle_id] = byV[r.vehicle_id] || {name:r.name, model:r.model, trips:[], stops:[]}).stops.push(r); });
      var ids = Object.keys(byV).filter(function(vid){ return !anyMine || mine[vid]; });

      var h = '<div style="font-size:11px;font-weight:700;color:var(--text-light);margin-bottom:6px;">EVIDENCE FOR THIS DAY</div>';

      // ── the yard / job / travel split ──
      var jobMin = 0, siteMin = 0;
      ids.forEach(function(vid){
        byV[vid].trips.forEach(function(t){ jobMin += (t.mins_out || 0); });
        byV[vid].stops.forEach(function(x){ siteMin += (x.mins || 0); });
      });
      var travelMin = Math.max(0, jobMin - siteMin);
      var paidMin = 0;
      PayrollPage._getEntriesForDate(userId, date).forEach(function(e){ paidMin += (e.hours || 0) * 60; });
      var yardMin = Math.max(0, paidMin - jobMin);
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">'
        + '<div style="flex:1 1 96px;background:var(--bg);border-radius:8px;padding:7px 9px;">'
          + '<div style="font-size:10px;color:var(--text-light);">JOB TIME</div>'
          + '<div style="font-size:15px;font-weight:700;color:var(--green-dark);">' + fd(jobMin) + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);">on site ' + fd(siteMin) + ' + travel ' + fd(travelMin) + '</div>'
        + '</div>'
        + '<div style="flex:1 1 96px;background:var(--bg);border-radius:8px;padding:7px 9px;">'
          + '<div style="font-size:10px;color:var(--text-light);">YARD TIME</div>'
          + '<div style="font-size:15px;font-weight:700;">' + fd(yardMin) + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);">paid ' + fd(paidMin) + ' − job</div>'
        + '</div></div>';

      // ── per truck ──
      if (!ids.length) {
        h += '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">No truck movement recorded for '
          + esc(userId) + ' this day' + (anyMine ? '' : ' (no truck assigned to them)') + '.</div>';
      }
      ids.forEach(function(vid) {
        var v = byV[vid];
        var m = PayrollPage._mergeStops(v.stops);
        h += '<div style="border:1px solid var(--border);border-radius:8px;padding:7px 9px;margin-bottom:6px;">'
          + '<div style="font-weight:700;font-size:12.5px;margin-bottom:3px;">' + PayrollPage._truckIcon(v.name, v.model) + ' ' + PayrollPage._truckLabel(v.name, v.model) + '</div>';
        v.trips.forEach(function(t){
          h += '<div style="font-size:12px;">left yard <b style="color:var(--green-dark);">' + et(t.left_yard) + '</b> → back <b style="color:var(--green-dark);">' + et(t.back_yard) + '</b> <span style="color:var(--text-light);">(' + fd(t.mins_out) + ')</span></div>';
        });
        if (!v.trips.length) h += '<div style="font-size:12px;color:var(--text-light);">never crossed the yard line</div>';
        m.forEach(function(x, i) {
          var sid = elId + '-ev' + vid.slice(0,4) + i;
          h += '<div style="font-size:12px;padding:1px 0;"><span id="' + sid + '" style="color:var(--link,#1565c0);font-weight:600;">📍 locating…</span> '
            + '<span style="color:var(--text-light);">' + et(x.arrive_ts) + '–' + et(x.depart_ts) + '</span> <b style="color:var(--green-dark);">' + fd(x.mins) + '</b>'
            + (x.visits > 1 ? ' <span style="color:var(--text-light);">(' + x.visits + ' visits)</span>' : '') + '</div>';
        });
        h += '</div>';
        setTimeout(function(){
          m.forEach(function(x, i) {
            var sid = elId + '-ev' + vid.slice(0,4) + i;
            PayrollPage._revGeo(x.lat, x.lon).then(function(a){
              var el = document.getElementById(sid); if (el && a) el.textContent = '📍 ' + a;
            }).catch(function(){});
          });
        }, 0);
      });

      // ── phone ──
      if (ph && ph.pings) {
        h += '<div style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:7px 9px;font-size:12px;margin-bottom:6px;">'
          + '📱 <b>' + et(ph.first_ping) + '</b> → <b>' + et(ph.last_ping) + '</b>'
          + (ph.span_hours ? ' · <b>' + (+ph.span_hours).toFixed(2) + 'h</b> span' : '')
          + ' · ' + ph.pings + ' pings'
          + (ph.sources ? ' · ' + esc(String(ph.sources).split(',').filter(Boolean).join(' + ')) : '')
          + '<div style="font-size:10.5px;color:#4b6b4f;">Doug\'s phone, not the truck\'s. Covers time away from any tracked vehicle.</div>'
          + '</div>';
      }

      // ── why the number might be wrong ──
      var warn = [];
      var totalPings = ids.reduce(function(a,vid){
        return a + byV[vid].trips.length; }, 0);
      PayrollPage._getEntriesForDate(userId, date).forEach(function(e){
        if (e.confidence === 'low') warn.push('An entry is flagged <b>low confidence</b> by the auto writer.');
        var mm = /\((\d+) pings\)/.exec(e.notes || '');
        if (mm && +mm[1] < 200) warn.push('Only <b>' + mm[1] + ' GPS pings</b> behind this entry — the tracker was mostly silent, so the span is probably short.');
      });
      if (!ids.length && paidMin > 0) warn.push('Hours are recorded but <b>no truck data</b> backs them up.');
      if (jobMin > 0 && siteMin === 0) warn.push('The truck left the yard but <b>logged no stop</b> — either a short visit under the stop threshold, or it never parked.');
      if (jobMin > 60 && siteMin > 0 && siteMin < jobMin * 0.25) warn.push('The truck was out <b>' + fd(jobMin) + '</b> but logged only <b>' + fd(siteMin) + '</b> of stops — most of the day reads as travel.');
      if (ph && ph.pings && paidMin > 0) {
        var phMin = (+ph.span_hours || 0) * 60;
        if (phMin > paidMin + 60) warn.push('The phone shows a <b>' + fd(phMin) + '</b> day — <b>' + fd(phMin - paidMin) + '</b> longer than the hours recorded. Work off the truck is not counted.');
      }
      if (warn.length) {
        h += '<div style="background:#fff8e1;border:1px solid #f0e0a0;border-radius:8px;padding:7px 9px;font-size:11.5px;color:#7a6a1f;">'
          + '<b>⚠ Reasons to check this number</b>'
          + warn.map(function(w){ return '<div style="margin-top:3px;">• ' + w + '</div>'; }).join('')
          + '</div>';
      }
      box.innerHTML = h;
    }).catch(function(){
      box.innerHTML = '<div style="font-size:12px;color:var(--text-light);">Could not load GPS/phone evidence.</div>';
    });
  },

  // ── Add Hours Modal ──
  addHours: function(userId, date) {
    var jobs = DB.jobs.getAll().filter(function(j) { return j.status === 'scheduled' || j.status === 'in_progress' || j.status === 'active'; });
    var opts = '<option value="">— No job —</option>';
    jobs.forEach(function(j) { opts += '<option value="' + j.id + '">#' + (j.jobNumber || '') + ' ' + UI.esc(j.clientName || '') + '</option>'; });

    var html = UI.field('Hours', '<input type="number" id="ph-hours" step="0.25" min="0" max="24" placeholder="8.0">')
      + UI.field('Job', '<select id="ph-job">' + opts + '</select>')
      + UI.field('Clock In', '<input type="time" id="ph-in">')
      + UI.field('Clock Out', '<input type="time" id="ph-out">')
      + '<div id="ph-suggest-hint" style="font-size:11px;color:var(--text-light);margin:-6px 0 10px;"></div>'
      + UI.field('Notes', '<textarea id="ph-notes" placeholder="Optional notes..."></textarea>');

    UI.showModal('Add Hours — ' + UI.esc(userId), html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage._saveHours(\'' + userId + '\',\'' + date + '\')">Save</button>'
    });
    // v1119: pre-fill Clock In/Out with the Bouncie work-truck yard times for
    // this date (editable). Hours start at the yard, so ±30 min buffer around
    // the truck's first-out / last-back; Ram (commute) excluded.
    PayrollPage._prefillSuggested(date);
  },

  // Pre-fill the Add-Hours time inputs from the work truck's yard crossings.
  // Only fills blank inputs; the user can override. Non-blocking (async RPC).
  _prefillSuggested: function(date) {
    var hint = function(t) { var el = document.getElementById('ph-suggest-hint'); if (el) el.innerHTML = t; };
    PayrollPage._yardTrips(date).then(function(trips) {
      if (!trips || !trips.length) { hint('No Bouncie truck movement for this day — enter times manually.'); return; }
      // Prefer the F-550 chip truck (Doug's rule: the 550 leaving/entering the
      // yard IS the time on jobs). Fall back to F-750, then any non-Ram work
      // truck. The out-of-yard window (first left → last back) = job time and
      // is what pre-fills the clock; no buffer (yard prep is separate).
      var byRank = function(r) { return trips.filter(function(t) { return PayrollPage._truckRank(t.name, t.model) === r && t.left_yard; }); };
      var f550 = byRank(1), f750 = byRank(0);
      var use = f550.length ? f550 : (f750.length ? f750 : trips.filter(function(t) { return PayrollPage._truckRank(t.name, t.model) <= 1 && t.left_yard; }));
      if (!use.length) { hint('No work-truck yard trips — enter times manually.'); return; }
      var label = f550.length ? 'F-550 chip truck' : (f750.length ? 'F-750' : 'work truck');
      var lefts = use.map(function(t) { return new Date(t.left_yard); }).sort(function(a, b) { return a - b; });
      var backs = use.filter(function(t) { return t.back_yard; }).map(function(t) { return new Date(t.back_yard); }).sort(function(a, b) { return a - b; });
      var pad = function(x) { return (x < 10 ? '0' : '') + x; };
      var hhmm = function(dt) { return pad(dt.getHours()) + ':' + pad(dt.getMinutes()); };
      var et = function(dt) { return dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); };
      // Job time = total minutes the truck is OUT of the yard across all trips.
      var jobMins = use.reduce(function(s, t) { return s + (t.back_yard ? (new Date(t.back_yard) - new Date(t.left_yard)) / 60000 : 0); }, 0);
      var inDt = lefts[0];
      var inEl = document.getElementById('ph-in'); if (inEl && !inEl.value) inEl.value = hhmm(inDt);
      var outStr = '';
      if (backs.length) {
        var outDt = backs[backs.length - 1];
        var outEl = document.getElementById('ph-out'); if (outEl && !outEl.value) outEl.value = hhmm(outDt);
        outStr = '–' + et(outDt);
      }
      hint('🛰 ' + label + ' out of yard ' + et(inDt) + outStr + ' = ~' + PayrollPage._fmtDur(jobMins) + ' on jobs. Pre-filled as the clock — add yard time if you paid it. Edit if off.');
    }).catch(function() { hint(''); });
  },

  _saveHours: function(userId, date) {
    var hours = parseFloat(document.getElementById('ph-hours').value) || 0;
    var clockIn = document.getElementById('ph-in').value;
    var clockOut = document.getElementById('ph-out').value;
    if (!hours && !clockIn) { UI.toast('Enter hours or clock in time', 'error'); return; }

    var entry = {
      userId: userId, user: userId, date: date,
      hours: hours,
      jobId: document.getElementById('ph-job').value || null,
      notes: document.getElementById('ph-notes').value || ''
    };

    if (clockIn) {
      entry.clockIn = date + 'T' + clockIn + ':00';
      if (clockOut) {
        entry.clockOut = date + 'T' + clockOut + ':00';
        if (!hours) entry.hours = Math.round(((new Date(entry.clockOut) - new Date(entry.clockIn)) / 3600000) * 100) / 100;
      }
    }

    DB.timeEntries.create(entry);

    // Mark as edited after approval if day was approved
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    if (PayrollPage._getApprovals()[dayKey] === 'approved') {
      PayrollPage._approvals[dayKey + '_editedAfter'] = true;
      PayrollPage._saveApprovals();
    }

    UI.closeModal();
    UI.toast('Hours added');
    loadPage('payroll');
  },

  editHours: function(entryId) {
    var e = DB.timeEntries.getAll().find(function(t) { return t.id === entryId; });
    if (!e) return;
    var html = UI.field('Hours', '<input type="number" id="eh-hours" step="0.25" value="' + (e.hours || '') + '">')
      + UI.field('Notes', '<textarea id="eh-notes">' + UI.esc(e.notes || '') + '</textarea>');
    UI.showModal('Edit Hours', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage._updateHours(\'' + entryId + '\')">Save</button>'
    });
  },

  _updateHours: function(entryId) {
    DB.timeEntries.update(entryId, {
      hours: parseFloat(document.getElementById('eh-hours').value) || 0,
      notes: document.getElementById('eh-notes').value
    });
    UI.closeModal();
    UI.toast('Hours updated');
    loadPage('payroll');
  },

  deleteHours: function(entryId, userId, date) {
    if (!confirm('Delete these hours?')) return;
    var all = DB.timeEntries.getAll().filter(function(t) { return t.id !== entryId; });
    localStorage.setItem('bm-time-entries', JSON.stringify(all));
    UI.closeModal();
    UI.toast('Hours deleted');
    PayrollPage.showDayDetail(userId, date);
  },

  addNote: function(userId, date) {
    var html = UI.field('Note', '<textarea id="pn-note" placeholder="Add a note for this day..." style="min-height:80px;"></textarea>');
    UI.showModal('Add Note', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage._saveNote(\'' + userId + '\',\'' + date + '\')">Save</button>'
    });
  },

  _saveNote: function(userId, date) {
    var note = document.getElementById('pn-note').value;
    if (!note.trim()) return;
    DB.timeEntries.create({ userId: userId, user: userId, date: date, hours: 0, notes: note, type: 'note' });
    UI.closeModal();
    UI.toast('Note added');
    loadPage('payroll');
  },

  // ── Approvals (cloud-synced v743) ──
  approveDay: function(userId, date) {
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    PayrollPage._getApprovals();
    PayrollPage._approvals[dayKey] = 'approved';
    delete PayrollPage._approvals[dayKey + '_editedAfter'];
    PayrollPage._saveApprovals();
    // Derive week_start for cloud row (TZ-safe — was new Date(str)+toISOString,
    // which in the evening ET filed the approval under the wrong week).
    var d = PayrollPage._pDate(date);
    var monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    var _p2 = function(n) { return (n < 10 ? '0' : '') + n; };
    var weekStart = monday.getFullYear() + '-' + _p2(monday.getMonth() + 1) + '-' + _p2(monday.getDate());
    PayrollPage._pushCloudApproval(userId, weekStart, date, 'approved', false);
    UI.closeModal();
    UI.toast('Day approved ✓');
    loadPage('payroll');
  },

  approveEmployee: function(userId, weekStart) {
    var empKey = PayrollPage._approvalKey(userId, weekStart);
    PayrollPage._getApprovals();
    PayrollPage._approvals[empKey] = 'approved';
    PayrollPage._saveApprovals();
    PayrollPage._pushCloudApproval(userId, weekStart, null, 'approved', false);
    UI.toast(userId + ' approved for the week ✓');
    loadPage('payroll');
  },

  approveAll: function(weekStart) {
    var employees = PayrollPage._getEmployees();
    PayrollPage._getApprovals();
    employees.forEach(function(emp) {
      var name = emp.name || emp.id;
      var empKey = PayrollPage._approvalKey(name, weekStart);
      PayrollPage._approvals[empKey] = 'approved';
      PayrollPage._pushCloudApproval(name, weekStart, null, 'approved', false);
    });
    PayrollPage._saveApprovals();
    UI.toast('All employees approved ✓');
    loadPage('payroll');
  },

  // ── Payroll Summary Modal ──
  // v743: rates are editable inline (✏️ next to each rate); export
  // generates an ACH-ready CSV (employee name, hours, gross, blank
  // routing/account for the bank's batch importer to fill); "Mark Paid"
  // records the run in payroll_runs.
  showPayrollSummary: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var html = '<table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Employee</th><th>Regular</th><th>OT</th><th>Total Hrs</th><th>Rate</th><th>Gross Pay</th><th>Status</th></tr></thead><tbody>';

    var grandTotal = 0;
    var totalHours = 0;
    var totalOT = 0;
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      var regular = Math.min(weekHours, 40);
      var ot = Math.max(0, weekHours - 40);
      var rate = Number(emp.rate || emp.payRate || 0);
      var gross = (regular * rate) + (ot * rate * 1.5);
      grandTotal += gross;
      totalHours += weekHours;
      totalOT += ot;
      // v745: same rollup as the Payroll grid — week tile shows ✓ if
      // explicit week-approval OR every working day is individually approved.
      var apx = PayrollPage._getApprovals();
      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      var weekExp = apx[empKey] === 'approved';
      var wDays = 0, wDaysOk = 0;
      dates.forEach(function(d) {
        var ents = PayrollPage._getEntriesForDate(emp.name || emp.id, d);
        var dh = PayrollPage._totalHours(ents);
        if (dh > 0 || ents.length > 0) {
          wDays++;
          var dk = PayrollPage._dayApprovalKey(emp.name || emp.id, d);
          if (apx[dk] === 'approved' && !apx[dk + '_editedAfter']) wDaysOk++;
        }
      });
      var approved = weekExp || (wDays > 0 && wDays === wDaysOk);
      var partialNote = (!approved && wDaysOk > 0) ? ' <span style="color:var(--text-light);font-weight:400;">(' + wDaysOk + '/' + wDays + ')</span>' : '';

      html += '<tr>'
        + '<td style="font-weight:600;">' + UI.esc(emp.name || '') + '</td>'
        + '<td>' + regular.toFixed(1) + '</td>'
        + '<td style="color:' + (ot > 0 ? '#d97706' : 'var(--text)') + ';">' + ot.toFixed(1) + '</td>'
        + '<td style="font-weight:700;">' + weekHours.toFixed(1) + '</td>'
        + '<td>' + (rate ? '$' + rate.toFixed(2) + '/hr' : '<span style="color:var(--text-light);">— set —</span>')
        +   ' <button onclick="PayrollPage.editRate(\'' + UI.esc(emp.id) + '\')" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--text-light);padding:0 4px;" title="Edit rate">✏️</button></td>'
        + '<td style="font-weight:700;">' + (rate ? '$' + gross.toFixed(2) : '—') + '</td>'
        + '<td>' + (approved ? '<span style="color:#22c55e;font-weight:600;">✓ Approved</span>' : '<span style="color:#d97706;">Pending' + partialNote + '</span>') + '</td>'
        + '</tr>';
    });

    html += '<tr style="font-weight:800;border-top:2px solid var(--border);background:var(--bg);">'
      + '<td>TOTAL</td><td>' + Math.min(totalHours, totalHours - totalOT + 40 * employees.length).toFixed(1) + '</td>'
      + '<td>' + totalOT.toFixed(1) + '</td><td>' + totalHours.toFixed(1) + '</td><td></td>'
      + '<td>$' + grandTotal.toFixed(2) + '</td><td></td></tr>';
    html += '</tbody></table>';

    html += '<div style="margin-top:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-light);line-height:1.5;">'
      + '💡 <strong>To run payroll:</strong> enter each employee\'s <strong>Regular</strong> and <strong>OT</strong> hours above into your payroll provider (e.g. Gusto) — it calculates taxes and pays your team. '
      + 'The <strong>ACH-Ready CSV</strong> is a separate option: a bank batch file to pay employees directly <em>without</em> a payroll provider. <strong>Mark Paid</strong> records the run here once payment is sent.'
      + '</div>';

    // Last run banner if any payroll_run exists for this week
    html += '<div id="last-run-banner" style="margin-top:12px;"></div>';

    UI.showModal('Payroll Summary — Week of ' + PayrollPage._pDate(weekStart).toLocaleDateString(), html, { wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-outline" onclick="PayrollPage.exportACH(\'' + weekStart + '\')">📥 ACH-Ready CSV</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage.markPaid(\'' + weekStart + '\')">💰 Mark Paid</button>'
    });

    // Async: show "last run" banner if this week was already paid
    PayrollPage._loadLastRunBanner(weekStart);
  },

  // v743: edit an employee's hourly rate. Lives in team_members.rate
  // (cloud-synced via DB.team). Also updates the local cache so the
  // modal re-renders with the new number.
  editRate: function(empId) {
    var emp = PayrollPage._getEmployees().find(function(e) { return e.id === empId; });
    if (!emp) { UI.toast('Employee not found', 'error'); return; }
    var cur = (emp.rate || emp.payRate || 0);
    var val = prompt('Hourly rate for ' + (emp.name || '') + ' ($/hr):', cur.toString());
    if (val === null) return;
    var n = parseFloat(val);
    if (isNaN(n) || n < 0) { UI.toast('Invalid rate', 'error'); return; }
    // Update team_members via DB.team if available, else localStorage.
    if (typeof DB !== 'undefined' && DB.team && DB.team.update) {
      DB.team.update(empId, { rate: n });
    } else {
      var members = [];
      try { members = JSON.parse(localStorage.getItem('bm-team') || '[]'); } catch(e){}
      var idx = members.findIndex(function(m) { return m.id === empId; });
      if (idx >= 0) { members[idx].rate = n; localStorage.setItem('bm-team', JSON.stringify(members)); }
    }
    UI.toast('Rate set: $' + n.toFixed(2) + '/hr');
    // Re-render summary modal with new rate
    UI.closeModal();
    setTimeout(function() { PayrollPage.showPayrollSummary(PayrollPage._getWeekDates(PayrollPage._weekOffset)[0]); }, 60);
  },

  // v743: ACH-ready CSV export. Bank-friendly column order: employee
  // name, gross pay, hours, OT hours, plus blank routing/account so
  // Doug can paste the bank's saved values OR the bank can map them
  // from the file's header row.
  exportACH: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var rows = ['Employee Name,Routing Number,Account Number,Hours,Overtime Hours,Rate,Gross Pay,Pay Period Start,Pay Period End,Memo'];
    var weekEnd = dates[6];
    var grandTotal = 0;
    var employeeCount = 0;
    var totalHours = 0;
    var totalOT = 0;
    var batch = [];
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      if (weekHours <= 0) return;
      var ot = Math.max(0, weekHours - 40);
      var reg = Math.min(weekHours, 40);
      var rate = Number(emp.rate || emp.payRate || 0);
      var gross = (reg * rate) + (ot * rate * 1.5);
      grandTotal += gross;
      employeeCount++;
      totalHours += weekHours;
      totalOT += ot;
      var memo = 'BM Payroll ' + weekStart + ' to ' + weekEnd;
      // Escape commas inside name
      var csvName = (emp.name || '').indexOf(',') >= 0 ? '"' + emp.name.replace(/"/g, '""') + '"' : (emp.name || '');
      rows.push([csvName, '', '', weekHours.toFixed(2), ot.toFixed(2), rate.toFixed(2), gross.toFixed(2), weekStart, weekEnd, memo].join(','));
      batch.push({ name: emp.name, hours: weekHours, ot: ot, rate: rate, gross: gross });
    });
    if (!employeeCount) { UI.toast('No hours to export', 'error'); return; }

    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll-ach-' + weekStart + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);

    // Record the export as a payroll_run with status='exported'
    PayrollPage._recordRun(weekStart, weekEnd, batch, {
      totalHours: totalHours, totalOT: totalOT, totalGross: grandTotal,
      employeeCount: employeeCount, method: 'ach_csv', status: 'exported'
    });
    UI.toast('ACH CSV exported — $' + grandTotal.toFixed(2) + ' across ' + employeeCount + ' employee(s)');
  },

  // v743: Mark Paid records a payroll_run row. Doug confirms before
  // committing because reversing a paid run is manual.
  markPaid: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var weekEnd = dates[6];
    var totalHours = 0, totalOT = 0, totalGross = 0, employeeCount = 0;
    var batch = [];
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      if (weekHours <= 0) return;
      var ot = Math.max(0, weekHours - 40);
      var reg = Math.min(weekHours, 40);
      var rate = Number(emp.rate || emp.payRate || 0);
      var gross = (reg * rate) + (ot * rate * 1.5);
      employeeCount++;
      totalHours += weekHours;
      totalOT += ot;
      totalGross += gross;
      batch.push({ name: emp.name, hours: weekHours, ot: ot, rate: rate, gross: gross });
    });
    if (!employeeCount) { UI.toast('No hours to pay', 'error'); return; }

    if (!confirm('Mark week of ' + weekStart + ' as PAID?\n\n'
      + employeeCount + ' employee(s) · ' + totalHours.toFixed(1) + ' hrs · $' + totalGross.toFixed(2)
      + '\n\nThis records a payroll run. Reverse only if needed.')) return;

    PayrollPage._recordRun(weekStart, weekEnd, batch, {
      totalHours: totalHours, totalOT: totalOT, totalGross: totalGross,
      employeeCount: employeeCount, method: 'manual', status: 'paid'
    });
    UI.toast('Marked paid: $' + totalGross.toFixed(2));
    UI.closeModal();
  },

  _recordRun: function(weekStart, weekEnd, batch, meta) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) {
      // Fallback: localStorage cache only
      try {
        var local = JSON.parse(localStorage.getItem('bm-payroll-runs') || '[]');
        local.unshift({ weekStart: weekStart, weekEnd: weekEnd, batch: batch, meta: meta, at: new Date().toISOString() });
        localStorage.setItem('bm-payroll-runs', JSON.stringify(local.slice(0, 60)));
      } catch(e){}
      return;
    }
    var paidBy = (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : null;
    var row = {
      tenant_id: tenantId,
      week_start: weekStart,
      week_end: weekEnd,
      status: meta.status,
      total_hours: meta.totalHours,
      total_ot: meta.totalOT,
      total_gross: meta.totalGross,
      employee_count: meta.employeeCount,
      method: meta.method,
      batch_payload: batch,
      paid_by: paidBy
    };
    if (meta.status === 'paid') row.paid_at = new Date().toISOString();
    if (meta.status === 'exported') row.exported_at = new Date().toISOString();
    sb.from('payroll_runs').insert(row).then(function(r) {
      if (r.error) console.warn('payroll_runs insert failed:', r.error.message);
    });
  },

  _loadLastRunBanner: function(weekStart) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    sb.from('payroll_runs').select('*').eq('week_start', weekStart).order('created_at', { ascending: false }).limit(1).maybeSingle().then(function(r) {
      var el = document.getElementById('last-run-banner');
      if (!el || !r.data) return;
      var run = r.data;
      var label = run.status === 'paid' ? '💰 Marked paid' : '📥 Exported';
      var when = new Date(run.paid_at || run.exported_at || run.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      el.innerHTML = '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;font-size:12px;">'
        + label + ' ' + when + ' · $' + Number(run.total_gross || 0).toFixed(2)
        + ' across ' + (run.employee_count || 0) + ' employee(s) via ' + UI.esc(run.method || '?')
        + '</div>';
    });
  },

  // ── Export CSV ──
  exportWeek: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var rows = ['Employee,Mon,Tue,Wed,Thu,Fri,Sat,Sun,Total,OT,Rate,Gross'];

    employees.forEach(function(emp) {
      var cols = [emp.name];
      var total = 0;
      dates.forEach(function(d) {
        var h = PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
        cols.push(h.toFixed(1));
        total += h;
      });
      var ot = Math.max(0, total - 40);
      var rate = emp.rate || emp.payRate || 0;
      var gross = (Math.min(total, 40) * rate) + (ot * rate * 1.5);
      cols.push(total.toFixed(1), ot.toFixed(1), rate.toFixed(2), gross.toFixed(2));
      rows.push(cols.join(','));
    });

    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll-' + weekStart + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    UI.toast('Payroll exported');
  },

  // v743: triggerGusto kept as a thin shim so anything still wired to
  // the old button just opens the new Payroll Summary modal. Delete
  // once nothing in the codebase calls it.
  triggerGusto: function(weekStart) {
    PayrollPage.showPayrollSummary(weekStart);
  },

  // ── EARNINGS LEDGER (v1082) ─────────────────────────────
  // Server fn earnings-sync builds earned rows from time_entries nightly;
  // payments/adjustments are recorded here. Balance = earned − paid.
  // Until payments are recorded, balances are "earned on record", NOT owed —
  // the Settle-up button zeroes history so accrual starts clean.
  _ledgerRows: null,
  _loadLedger: function() {
    var el = document.getElementById('pay-ledger');
    if (!el || typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    SupabaseDB.client.from('earnings_ledger')
      .select('member_name, kind, amount, entry_date')
      .then(function(res) {
        if (!document.getElementById('pay-ledger')) return;
        if (res.error) {
          document.getElementById('pay-ledger').innerHTML =
            '<div style="font-size:12px;color:var(--red);">Ledger unavailable: ' + UI.esc(res.error.message) + '</div>';
          return;
        }
        PayrollPage._ledgerRows = res.data || [];
        PayrollPage._renderLedger();
      });
  },
  _renderLedger: function() {
    var el = document.getElementById('pay-ledger');
    if (!el) return;
    var rows = PayrollPage._ledgerRows || [];
    var agg = {};
    rows.forEach(function(r) {
      var a = agg[r.member_name] = agg[r.member_name] || { earned: 0, paid: 0, adj: 0 };
      var amt = +r.amount || 0;
      if (r.kind === 'earned') a.earned += amt;
      else if (r.kind === 'payment') a.paid += -amt;
      else a.adj += amt;
    });
    var names = Object.keys(agg).sort();
    var anyPayments = rows.some(function(r) { return r.kind === 'payment'; });
    var fmt = function(n) { return '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: 2 }); };
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;">'
      + '<strong style="font-size:14px;">💰 Earnings ledger</strong>'
      + '<span style="font-size:11px;color:var(--text-light);">earned from logged hours · payments count once recorded</span></div>';
    if (!anyPayments) {
      html += '<div style="font-size:12px;background:#fff8e6;border:1px solid #f0d97a;border-radius:8px;padding:8px 10px;margin-bottom:10px;">'
        + '⚠️ No payments recorded yet, so these are <b>earned-on-record totals since Jan 2024</b>, not amounts owed. '
        + 'Tap <b>Settle up</b> on anyone you\'re square with — the ledger starts counting fresh from today.</div>';
    }
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:430px;">'
      + '<tr style="text-align:left;color:var(--text-light);font-size:11px;"><th style="padding:6px 8px;">Member</th><th style="padding:6px 8px;text-align:right;">Earned</th><th style="padding:6px 8px;text-align:right;">Paid</th><th style="padding:6px 8px;text-align:right;">Balance</th><th style="padding:6px 8px;"></th></tr>';
    names.forEach(function(n) {
      var a = agg[n];
      var bal = Math.round((a.earned + a.adj - a.paid) * 100) / 100;
      var esc = n.replace(/'/g, "\\'");
      html += '<tr style="border-top:1px solid var(--border);">'
        + '<td style="padding:8px;font-weight:600;">' + UI.esc(n) + '</td>'
        + '<td style="padding:8px;text-align:right;">' + fmt(a.earned + a.adj) + '</td>'
        + '<td style="padding:8px;text-align:right;">' + fmt(a.paid) + '</td>'
        + '<td style="padding:8px;text-align:right;font-weight:700;color:' + (bal > 0.009 ? 'var(--red)' : 'var(--green-dark)') + ';">' + fmt(bal) + '</td>'
        + '<td style="padding:8px;white-space:nowrap;">'
        + '<button onclick="PayrollPage.recordPayment(\'' + esc + '\')" class="btn btn-outline" style="font-size:11px;padding:4px 8px;">Record payment</button> '
        + (bal > 0.009 ? '<button onclick="PayrollPage.settleUp(\'' + esc + '\',' + bal + ')" class="btn btn-outline" style="font-size:11px;padding:4px 8px;">Settle up</button>' : '')
        + '</td></tr>';
    });
    html += '</table></div></div>';
    el.innerHTML = html;
  },
  _insertLedgerRow: function(row, doneMsg) {
    row.tenant_id = DB.getTenantId();
    row.source = 'manual';
    row.source_key = 'man-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    SupabaseDB.client.from('earnings_ledger').insert(row).then(function(res) {
      if (res.error) { UI.toast('Save failed: ' + res.error.message, 'error'); return; }
      UI.toast(doneMsg);
      PayrollPage._loadLedger();
    });
  },
  recordPayment: function(name) {
    var amt = parseFloat(prompt('Amount paid to ' + name + ' (e.g. 600):') || '');
    if (!amt || amt <= 0) return;
    var note = prompt('Note (how/when — e.g. "Zelle 8/4"):') || '';
    PayrollPage._insertLedgerRow({
      member_name: name, entry_date: new Date().toISOString().slice(0, 10),
      kind: 'payment', amount: -Math.abs(amt), notes: note.slice(0, 200) || null
    }, 'Payment recorded — ' + name);
  },
  settleUp: function(name, bal) {
    if (!confirm('Mark ' + name + ' as fully settled through today? Records a payment of $' + bal.toFixed(2) + ' so the ledger starts fresh. (Does not move any money.)')) return;
    PayrollPage._insertLedgerRow({
      member_name: name, entry_date: new Date().toISOString().slice(0, 10),
      kind: 'payment', amount: -Math.abs(bal), notes: 'Settled up through today (opening-balance zero-out)'
    }, name + ' marked settled');
  }
};
