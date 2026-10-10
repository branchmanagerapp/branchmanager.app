/**
 * Branch Manager — Recurring Job Scheduling
 * Set up jobs that repeat on a schedule (weekly lawn, monthly pruning, etc.)
 */
var RecurringJobs = {
  render: function() {
    var recurring = RecurringJobs.getAll();
    var activeCount = recurring.filter(function(r) { return r.active; }).length;
    var monthlyRevenue = recurring.filter(function(r) { return r.active; }).reduce(function(s, r) {
      var multipliers = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 0.33, biannual: 0.17, annual: 0.08 };
      return s + (r.price || 0) * (multipliers[r.frequency] || 1);
    }, 0);
    var dueSoon7 = new Date(Date.now() + 7 * 86400000);
    var nextDueCount = recurring.filter(function(r) {
      return r.active && new Date(RecurringJobs._getNextDate(r)) <= dueSoon7;
    }).length;
    var annualValue = monthlyRevenue * 12;

    var html = '<div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">'
      + '<div><h2>Recurring Jobs' + (activeCount > 0 ? ' <span style="font-size:14px;font-weight:600;background:#e8f5e9;color:#2e7d32;padding:2px 10px;border-radius:12px;vertical-align:middle;">' + activeCount + ' active</span>' : '') + '</h2>'
      + '<p style="color:var(--text-light);margin-top:4px;">Jobs that repeat automatically on a schedule.</p></div>'
      + (recurring.length > 0 ? '<button onclick="RecurringJobs.generateAllDue()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap;">&#9889; Generate All Due</button>' : '')
      + '</div>';

    // Stats header
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">'
      + '<div style="background:var(--white);border-radius:12px;padding:14px 12px;border:1px solid var(--border);text-align:center;">'
      + '<div style="font-size:22px;font-weight:800;color:var(--green-dark);">' + activeCount + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Active Jobs</div></div>'
      + '<div style="background:var(--white);border-radius:12px;padding:14px 12px;border:1px solid var(--border);text-align:center;">'
      + '<div style="font-size:22px;font-weight:800;color:var(--green-dark);">' + UI.money(monthlyRevenue) + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Monthly Revenue</div></div>'
      + '<div style="background:var(--white);border-radius:12px;padding:14px 12px;border:1px solid var(--border);text-align:center;">'
      + '<div style="font-size:22px;font-weight:800;color:' + (nextDueCount > 0 ? '#e65100' : 'var(--text-light)') + ';">' + nextDueCount + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Due in 7 Days</div></div>'
      + '<div style="background:var(--white);border-radius:12px;padding:14px 12px;border:1px solid var(--border);text-align:center;">'
      + '<div style="font-size:22px;font-weight:800;color:var(--green-dark);">' + UI.money(annualValue) + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Annual Value</div></div>'
      + '</div>';

    // Add new recurring job
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Create Recurring Job</h3>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:3px;">Client</label>'
      + '<input type="text" id="rec-client" list="rec-client-list" placeholder="Start typing a client…" autocomplete="off" '
      +    'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<datalist id="rec-client-list">'
      +    DB.clients.getAll().filter(function(c){return c && c.name;}).sort(function(a,b){return (a.name||"").localeCompare(b.name||"");}).map(function(c){return "<option value=\"" + UI.esc(c.name) + "\">";}).join("")
      + '</datalist>'
      + '</div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:3px;">Service</label>'
      + '<select id="rec-service" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="tree_pruning">Tree Pruning</option>'
      + '<option value="tree_removal">Tree Removal</option>'
      + '<option value="stump_removal">Stump Removal</option>'
      + '<option value="gutter_clean">Gutter Clean Out</option>'
      + '<option value="spring_cleanup">Spring Clean Up</option>'
      + '<option value="snow_removal">Snow Removal</option>'
      + '<option value="inspection">Tree Inspection</option>'
      + '<option value="other">Other</option>'
      + '</select></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:3px;">Frequency</label>'
      + '<select id="rec-freq" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="weekly">Weekly</option>'
      + '<option value="biweekly">Every 2 Weeks</option>'
      + '<option value="monthly" selected>Monthly</option>'
      + '<option value="quarterly">Quarterly</option>'
      + '<option value="biannual">Every 6 Months</option>'
      + '<option value="annual">Annually</option>'
      + '</select></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:3px;">Start Date</label>'
      + '<input type="date" id="rec-start" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:3px;">Price</label>'
      + '<input type="number" id="rec-price" placeholder="0" step="1" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;"></div>'
      + '</div>'
      + '<div style="margin-bottom:8px;"><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:3px;">Notes</label>'
      + '<input type="text" id="rec-notes" placeholder="Special instructions..." style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<button onclick="RecurringJobs.create()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:700;cursor:pointer;">Create Recurring Job</button>'
      + '</div>';

    // List existing recurring jobs
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Active Recurring Jobs (' + recurring.length + ')</h3>';

    if (recurring.length) {
      var dueSoonCutoff = new Date(Date.now() + 7 * 86400000);
      recurring.forEach(function(r) {
        var freqLabels = { weekly: 'Weekly', biweekly: 'Every 2 Weeks', monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Every 6 Months', annual: 'Annually' };
        var nextDate = RecurringJobs._getNextDate(r);
        var statusColor = r.active ? '#4caf50' : '#999';
        var isDueSoon = r.active && new Date(nextDate) <= dueSoonCutoff;

        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f0f0f0;">'
          + '<div style="flex:1;">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
          + '<span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';flex-shrink:0;"></span>'
          + '<strong style="font-size:14px;">' + r.clientName + '</strong>'
          + '<span style="font-size:12px;background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:4px;">' + (freqLabels[r.frequency] || r.frequency) + '</span>'
          + (isDueSoon ? '<span style="font-size:11px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;padding:2px 8px;border-radius:4px;font-weight:700;">Due Soon</span>' : '')
          + '</div>'
          + '<div style="font-size:13px;color:var(--text-light);margin-top:3px;margin-left:16px;">'
          + r.service.replace(/_/g, ' ') + (r.notes ? ' — ' + r.notes : '') + '</div>'
          + '<div style="font-size:12px;color:' + (isDueSoon ? '#e65100' : 'var(--text-light)') + ';margin-left:16px;">Next: <strong>' + UI.dateShort(nextDate) + '</strong></div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="font-weight:700;color:var(--green-dark);font-size:15px;">' + UI.money(r.price) + '</span>'
          + '<button onclick="RecurringJobs.toggle(\'' + r.id + '\')" style="background:' + (r.active ? '#fff3e0' : '#e8f5e9') + ';border:none;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;">' + (r.active ? 'Pause' : 'Resume') + '</button>'
          + '<button onclick="RecurringJobs.generateJob(\'' + r.id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;">Generate Job</button>'
          + '<button onclick="RecurringJobs.delete(\'' + r.id + '\')" style="background:#ffebee;color:#c62828;border:none;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;">Delete</button>'
          + '</div></div>';
      });
    } else {
      html += '<div style="text-align:center;padding:24px;color:var(--text-light);font-size:13px;">No recurring jobs set up yet.</div>';
    }
    html += '</div>';

    return html;
  },

  create: function() {
    var clientName = document.getElementById('rec-client').value.trim();
    var service = document.getElementById('rec-service').value;
    var frequency = document.getElementById('rec-freq').value;
    var startDate = document.getElementById('rec-start').value;
    var price = parseFloat(document.getElementById('rec-price').value) || 0;
    var notes = document.getElementById('rec-notes').value;

    if (!clientName) { UI.toast('Enter a client name', 'error'); return; }
    if (!startDate) { UI.toast('Pick a start date', 'error'); return; }

    // v753: resolve clientName to clientId so generated jobs link back
    // to the real client record (was orphan-name-only before).
    var matchedClient = DB.clients.getAll().find(function(c) {
      return c && c.name && c.name.trim().toLowerCase() === clientName.toLowerCase();
    });

    var record = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      clientId: matchedClient ? matchedClient.id : null,
      clientName: clientName,
      service: service,
      frequency: frequency,
      startDate: startDate,
      price: price,
      notes: notes,
      active: true,
      lastGenerated: null,
      createdAt: new Date().toISOString()
    };

    var all = RecurringJobs.getAll();
    all.push(record);
    localStorage.setItem('bm-recurring', JSON.stringify(all));

    UI.toast('Recurring job created for ' + clientName);
    loadPage('recurring');
  },

  toggle: function(id) {
    var all = RecurringJobs.getAll();
    var item = all.find(function(r) { return r.id === id; });
    if (item) {
      item.active = !item.active;
      localStorage.setItem('bm-recurring', JSON.stringify(all));
      UI.toast(item.active ? 'Resumed' : 'Paused');
      loadPage('recurring');
    }
  },

  generateJob: function(id) {
    var all = RecurringJobs.getAll();
    var rec = all.find(function(r) { return r.id === id; });
    if (!rec) return;

    var nextDate = RecurringJobs._getNextDate(rec);
    // v753: backfill clientId from name if the rec was created before
    // we started recording clientId, so the new job links to the real
    // client. Otherwise jobs end up orphan and won't show on the client
    // detail timeline.
    if (!rec.clientId && rec.clientName) {
      var match = DB.clients.getAll().find(function(c) {
        return c && c.name && c.name.trim().toLowerCase() === rec.clientName.toLowerCase();
      });
      if (match) rec.clientId = match.id;
    }
    var job = DB.jobs.create({
      clientId: rec.clientId || null,
      clientName: rec.clientName,
      description: rec.service.replace(/_/g, ' ') + (rec.notes ? ' — ' + rec.notes : ''),
      scheduledDate: nextDate,
      total: rec.price,
      status: 'scheduled',
      source: 'recurring',
      recurringId: rec.id
    });
    // v753: stamp lastGenerated AFTER create, before return. The previous
    // version had a dead-code block after `return job;` so lastGenerated
    // never updated — generateAllDue would re-create the same job every
    // run within the window.
    rec.lastGenerated = new Date().toISOString();
    localStorage.setItem('bm-recurring', JSON.stringify(all));
    UI.toast('Job created for ' + rec.clientName + ' on ' + UI.dateShort(nextDate));
    return job;
  },

  delete: function(id) {
    if (!confirm('Remove this recurring job?')) return;
    var all = RecurringJobs.getAll().filter(function(r) { return r.id !== id; });
    localStorage.setItem('bm-recurring', JSON.stringify(all));
    UI.toast('Recurring job removed');
    loadPage('recurring');
  },

  generateAllDue: function() {
    var all = RecurringJobs.getAll();
    var cutoff = new Date(Date.now() + 7 * 86400000);
    var count = 0;
    all.forEach(function(r) {
      if (!r.active) return;
      var next = new Date(RecurringJobs._getNextDate(r));
      if (next <= cutoff) {
        RecurringJobs.generateJob(r.id);
        count++;
      }
    });
    if (count === 0) UI.toast('No jobs due in the next 7 days');
    else UI.toast(count + ' job' + (count > 1 ? 's' : '') + ' generated!', 'success');
  },

  getAll: function() {
    try { return JSON.parse(localStorage.getItem('bm-recurring')) || []; } catch(e) { return []; }
  },

  _getNextDate: function(rec) {
    var base = rec.lastGenerated ? new Date(rec.lastGenerated) : new Date(rec.startDate);
    var next = new Date(base);
    var intervals = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, biannual: 182, annual: 365 };
    var days = intervals[rec.frequency] || 30;
    next.setDate(next.getDate() + days);

    // Make sure it's in the future
    while (next < new Date()) {
      next.setDate(next.getDate() + days);
    }
    return next.toISOString();
  }
};
