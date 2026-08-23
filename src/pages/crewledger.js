/**
 * Branch Manager — Crew Ledger
 *
 * Answers one question the app could not answer before v1211:
 * "What do I owe each person right now?"
 *
 * balance = hours earned  −  payments made  +  cash they fronted
 *
 * Sources (all existing tables — no new schema):
 *   earned         time_entries.hours × team_members.rate
 *   payments       expenses, category 'Crew Payment', employee = the person
 *   reimbursements expenses, any other category, employee = the person
 *
 * The `employee` column carries the convention "this person paid out of
 * pocket and is owed it back". A company-card expense leaves it blank.
 *
 * HONESTY RULE: a person with no recorded payments is NOT shown as being
 * owed their full gross — that would read as a real debt when it only means
 * nothing was written down. They show "not reconciled" until a first
 * payment is recorded. Never present a gap in the records as a number.
 */
var CrewLedgerPage = {

  _CREW_PAYMENT: 'Crew Payment',

  _money: function(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _esc: function(s) {
    return (typeof UI !== 'undefined' && UI.esc) ? UI.esc(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
  },

  // team_members carries duplicate rows per person (inactive twins with a null
  // rate) — the same duplication that double-counted hours before payroll
  // v1209. Collapse by name and keep the highest rate seen.
  _rates: function() {
    var out = {};
    try {
      (DB.team.getAll() || []).forEach(function(t) {
        var nm = String(t.name || '').trim();
        if (!nm) return;
        var r = Number(t.rate || t.hourly_rate || 0);
        if (!(nm in out) || r > out[nm]) out[nm] = r;
      });
    } catch (e) {}
    return out;
  },

  _nameOf: function(e) {
    return String(e.userName || e.user_name || e.userId || e.user || '').trim();
  },

  _rows: function() {
    var rates = CrewLedgerPage._rates();
    var agg = {};
    function slot(nm) {
      if (!agg[nm]) agg[nm] = { name: nm, hours: 0, estHours: 0, rate: rates[nm] || 0,
                                paid: 0, paidN: 0, reimb: 0, reimbN: 0, first: null, last: null };
      return agg[nm];
    }

    try {
      (DB.timeEntries.getAll() || []).forEach(function(e) {
        var nm = CrewLedgerPage._nameOf(e);
        var h = Number(e.hours) || 0;
        if (!nm || h <= 0) return;
        var a = slot(nm);
        // Only hours a person stands behind become money owed. A GPS-derived
        // row is an estimate: truck movement attributed to whoever was assigned
        // to that vehicle. That attribution is known to be wrong sometimes —
        // Catherine's ledger picked up 4.00h on Aug 22 2026 from Doug's Ram
        // 2500, on a day her own log had ended. Counting that as debt invents
        // money. Estimated hours are carried separately and surfaced for
        // confirmation instead of being silently banked.
        if (e.source === 'manual' || e.locked === true) a.hours += h;
        else { a.estHours += h; }
        var d = String(e.date || '').slice(0, 10);
        if (d) {
          if (!a.first || d < a.first) a.first = d;
          if (!a.last || d > a.last) a.last = d;
        }
      });
    } catch (e) {}

    try {
      (DB.expenses.getAll() || []).forEach(function(x) {
        var nm = String(x.employee || '').trim();
        if (!nm) return;                       // blank employee = company paid it
        var amt = Number(x.amount) || 0;
        if (!amt) return;
        var a = slot(nm);
        if (String(x.category || '') === CrewLedgerPage._CREW_PAYMENT) { a.paid += amt; a.paidN++; }
        else { a.reimb += amt; a.reimbN++; }
      });
    } catch (e) {}

    return Object.keys(agg).map(function(k) {
      var a = agg[k];
      a.earned = a.hours * a.rate;
      a.estValue = a.estHours * a.rate;
      a.balance = a.earned - a.paid + a.reimb;
      // No payment on file means the record is incomplete, not that the full
      // gross is outstanding. Flag it instead of asserting a balance.
      a.reconciled = a.paidN > 0;
      return a;
    }).sort(function(x, y) { return y.balance - x.balance; });
  },

  render: function() {
    var rows = CrewLedgerPage._rows();
    var owed = rows.filter(function(r) { return r.reconciled; })
                   .reduce(function(s, r) { return s + r.balance; }, 0);

    var h = '<div style="max-width:900px;">';

    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;">'
      +   '<div>'
      +     '<h2 style="margin:0 0 2px;">Crew Ledger</h2>'
      +     '<div style="font-size:12px;color:var(--text-light);">Earned, minus paid, plus cash they fronted.</div>'
      +   '</div>'
      +   '<div style="text-align:right;">'
      +     '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;">Owed (reconciled)</div>'
      +     '<div style="font-size:24px;font-weight:800;color:' + (owed > 0 ? 'var(--red,#c0392b)' : 'var(--green-dark)') + ';">' + CrewLedgerPage._money(owed) + '</div>'
      +   '</div>'
      + '</div>';

    h += '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">'
      +   '<button class="btn btn-primary" onclick="CrewLedgerPage.openEntry(\'payment\')" style="flex:1;min-width:150px;">+ Record Payment</button>'
      +   '<button class="btn btn-outline" onclick="CrewLedgerPage.openEntry(\'reimbursement\')" style="flex:1;min-width:150px;">+ Reimbursement</button>'
      + '</div>';

    if (!rows.length) {
      h += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;color:var(--text-light);font-size:14px;">'
        +  'No hours or payments recorded yet.</div></div>';
      return h;
    }

    rows.forEach(function(r) {
      var e = CrewLedgerPage._esc(r.name);
      h += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;">'
        +   '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;">'
        +     '<div style="font-size:15px;font-weight:700;">' + e + '</div>'
        +     (r.reconciled
              ? '<div style="font-size:20px;font-weight:800;color:' + (r.balance > 0 ? 'var(--red,#c0392b)' : 'var(--green-dark)') + ';">' + CrewLedgerPage._money(r.balance) + '</div>'
              : '<div style="font-size:12px;font-weight:700;color:#b45309;background:#fef3c7;border-radius:999px;padding:3px 10px;">not reconciled</div>')
        +   '</div>';

      h += '<div style="margin-top:10px;display:grid;grid-template-columns:1fr auto;gap:4px 10px;font-size:13px;">'
        +   '<div style="color:var(--text-light);">' + r.hours.toFixed(2) + ' h confirmed'
        +     (r.rate ? ' &times; ' + CrewLedgerPage._money(r.rate) : ' <span style="color:#b45309;">(no rate set)</span>') + '</div>'
        +   '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + CrewLedgerPage._money(r.earned) + '</div>'
        +   '<div style="color:var(--text-light);">paid' + (r.paidN ? ' (' + r.paidN + ')' : '') + '</div>'
        +   '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + (r.paid ? '-' + CrewLedgerPage._money(r.paid).replace('$', '$') : CrewLedgerPage._money(0)) + '</div>';

      if (r.reimb) {
        h += '<div style="color:var(--text-light);">cash they fronted (' + r.reimbN + ')</div>'
          +  '<div style="text-align:right;font-variant-numeric:tabular-nums;">+' + CrewLedgerPage._money(r.reimb) + '</div>';
      }
      h += '</div>';

      if (r.estHours > 0) {
        h += '<div style="margin-top:10px;font-size:12px;color:var(--text-light);background:var(--bg);border:1px dashed var(--border);border-radius:8px;padding:8px 10px;">'
          +  '<strong>' + r.estHours.toFixed(2) + ' h estimated from truck GPS</strong> (' + CrewLedgerPage._money(r.estValue) + ') is <em>not</em> in the balance. '
          +  'GPS attributes a moving truck to whoever is assigned to it, which is not always who was working. '
          +  'Confirm or clear these on the Timesheets tab and they will move into the balance.'
          +  '</div>';
      }

      if (!r.reconciled) {
        h += '<div style="margin-top:10px;font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;">'
          +  'No payments recorded for ' + e + ', so no balance is shown. This almost certainly means the payments were never written down — not that the full '
          +  CrewLedgerPage._money(r.earned) + ' is outstanding. Record a payment to start the balance.'
          +  '</div>';
      }
      if (r.first) {
        h += '<div style="margin-top:8px;font-size:11px;color:var(--text-light);">hours on file: ' + r.first + ' to ' + r.last + '</div>';
      }
      h += '</div>';
    });

    h += CrewLedgerPage._modal();
    h += '</div>';
    return h;
  },

  _modal: function() {
    var names = CrewLedgerPage._rows().map(function(r) { return r.name; });
    try {
      (DB.team.getAll() || []).forEach(function(t) {
        var nm = String(t.name || '').trim();
        if (nm && names.indexOf(nm) === -1) names.push(nm);
      });
    } catch (e) {}
    var opts = names.map(function(n) { return '<option value="' + CrewLedgerPage._esc(n) + '">' + CrewLedgerPage._esc(n) + '</option>'; }).join('');
    var today = new Date().toISOString().split('T')[0];
    var f = 'width:100%;padding:9px;border:2px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;';
    var lab = 'font-size:12px;font-weight:600;display:block;margin-bottom:4px;';

    return '<div id="cl-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;">'
      + '<div style="background:var(--white);border-radius:14px;padding:22px;width:min(96vw,460px);max-height:90vh;overflow-y:auto;">'
      + '<h3 id="cl-title" style="margin:0 0 14px;">Record Payment</h3>'
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      + '<div><label style="' + lab + '">Person</label><select id="cl-who" style="' + f + '">' + opts + '</select></div>'
      + '<div><label style="' + lab + '">Date</label><input id="cl-date" type="date" value="' + today + '" style="' + f + '"></div>'
      + '<div><label style="' + lab + '">Amount</label><input id="cl-amt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" style="' + f + '"></div>'
      + '<div id="cl-cat-wrap" style="display:none;"><label style="' + lab + '">What was it for</label>'
      +   '<select id="cl-cat" style="' + f + '"><option value="Disposal">Disposal / dump</option><option value="Equipment">Equipment / parts</option>'
      +   '<option value="Fuel">Fuel</option><option value="Materials">Materials</option><option value="Other">Other</option></select></div>'
      + '<div><label style="' + lab + '">Note <span style="font-weight:400;color:var(--text-light);">(optional)</span></label>'
      +   '<input id="cl-note" type="text" placeholder="cash, Zelle, which job…" style="' + f + '"></div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:18px;">'
      + '<button class="btn btn-primary" onclick="CrewLedgerPage.saveEntry()" style="flex:1;">Save</button>'
      + '<button class="btn btn-outline" onclick="CrewLedgerPage.closeEntry()" style="flex:1;">Cancel</button>'
      + '</div></div></div>';
  },

  _mode: 'payment',

  openEntry: function(mode, who) {
    CrewLedgerPage._mode = (mode === 'reimbursement') ? 'reimbursement' : 'payment';
    var m = document.getElementById('cl-modal');
    if (!m) return;
    var isReimb = CrewLedgerPage._mode === 'reimbursement';
    var t = document.getElementById('cl-title');
    if (t) t.textContent = isReimb ? 'Record Reimbursement' : 'Record Payment';
    var cw = document.getElementById('cl-cat-wrap');
    if (cw) cw.style.display = isReimb ? '' : 'none';
    if (who) { var w = document.getElementById('cl-who'); if (w) w.value = who; }
    m.style.display = 'flex';
  },

  closeEntry: function() {
    var m = document.getElementById('cl-modal');
    if (m) m.style.display = 'none';
  },

  saveEntry: function() {
    var who  = (document.getElementById('cl-who')  || {}).value || '';
    var date = (document.getElementById('cl-date') || {}).value || '';
    var amt  = parseFloat((document.getElementById('cl-amt') || {}).value || '0');
    var note = (document.getElementById('cl-note') || {}).value || '';
    var isReimb = CrewLedgerPage._mode === 'reimbursement';
    var cat  = isReimb ? ((document.getElementById('cl-cat') || {}).value || 'Other') : CrewLedgerPage._CREW_PAYMENT;

    if (!who)  { UI.toast('Pick a person', 'error'); return; }
    if (!date) { UI.toast('Pick a date', 'error'); return; }
    if (!(amt > 0)) { UI.toast('Enter an amount greater than zero', 'error'); return; }

    DB.expenses.create({
      date: date,
      vendor: who,
      category: cat,
      amount: amt,
      employee: who,       // the convention: this person is owed it back / was paid
      description: isReimb ? (cat + ' — paid out of pocket by ' + who) : ('Paid to ' + who),
      notes: note
    });

    UI.toast((isReimb ? 'Reimbursement' : 'Payment') + ' recorded: ' + CrewLedgerPage._money(amt) + ' — ' + who);
    CrewLedgerPage.closeEntry();
    loadPage(window._currentPage);
  }
};
