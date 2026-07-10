// Smart Lawn — the robotic-mower division of Second Nature Tree LLC (dba Smart
// Lawn) as a section INSIDE Branch Manager. Read-only roll-up: every record
// (client / quote / job / invoice) whose line_of_business = 'smartlawn' — or,
// until it's tagged, whose text matches the mower keyword classifier (same one
// Books/Break-even use) — gathered in one place with clickable rows.
// Deploy-safe before the quotes/clients line_of_business columns exist: it only
// READS, never writes. Jobs + invoices already carry line_of_business.
var SmartLawnPage = {
  _rx: /navimow|yarbo|segway|robotic ?mow|robot ?mow|smart ?lawn|lymow|mowgate|cadco/i,

  // A record belongs to Smart Lawn if explicitly tagged, else keyword-matched.
  _isLawn: function(rec, extraText) {
    if (!rec) return false;
    if (rec.line_of_business) return rec.line_of_business === 'smartlawn';
    var t = [rec.subject, rec.description, rec.title, rec.client_name, rec.name, extraText]
      .filter(Boolean).join(' ').toLowerCase();
    return SmartLawnPage._rx.test(t);
  },

  _all: function(store) {
    try {
      return (typeof DB !== 'undefined' && DB[store] && DB[store].getAll) ? (DB[store].getAll() || []) : [];
    } catch (e) { return []; }
  },
  _money: function(n) {
    n = Number(n) || 0;
    try { if (typeof UI !== 'undefined' && UI.money) return UI.money(n); } catch (e) {}
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },
  _esc: function(s) {
    try { if (typeof UI !== 'undefined' && UI.esc) return UI.esc(s == null ? '' : s); } catch (e) {}
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  },

  _rows: function(items, opts) {
    if (!items.length) return '<div style="padding:14px 16px;color:var(--text-light);font-size:13px;">Nothing here yet.</div>';
    var self = this;
    return items.map(function(it) {
      var amt = opts.amount ? self._money(opts.amount(it)) : '';
      var sub = opts.sub ? self._esc(opts.sub(it)) : '';
      return '<div onclick="' + opts.open(it) + '" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;">'
        + '<div style="min-width:0;"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + self._esc(opts.title(it)) + '</div>'
        + (sub ? '<div style="font-size:12px;color:var(--text-light);margin-top:1px;">' + sub + '</div>' : '') + '</div>'
        + (amt ? '<div style="font-weight:700;white-space:nowrap;">' + amt + '</div>' : '') + '</div>';
    }).join('');
  },

  _section: function(icon, label, count, bodyHtml) {
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px;">'
      + '<div style="padding:12px 16px;font-weight:700;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
      + '<span>' + icon + ' ' + label + '</span><span style="font-size:13px;color:var(--text-light);">' + count + '</span></div>'
      + bodyHtml + '</div>';
  },

  _stat: function(label, value, color) {
    return '<div style="flex:1;min-width:120px;background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;">'
      + '<div style="font-size:12px;color:var(--text-light);font-weight:700;text-transform:uppercase;letter-spacing:.03em;">' + label + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + color + ';margin-top:2px;">' + value + '</div></div>';
  },

  render: function() {
    var self = this;
    var clients  = this._all('clients').filter(function(c) { return self._isLawn(c, c.name); });
    var quotes   = this._all('quotes').filter(function(q) { return self._isLawn(q); });
    var jobs     = this._all('jobs').filter(function(j) { return self._isLawn(j); });
    var invoices = this._all('invoices').filter(function(i) { return self._isLawn(i); });

    var collected = 0, outstanding = 0;
    invoices.forEach(function(i) {
      if (i.status === 'paid') collected += Number(i.total) || 0;
      else outstanding += (i.balance != null ? Number(i.balance) : Number(i.total)) || 0;
    });

    var html = '<div style="max-width:760px;margin:0 auto;">'
      + '<div style="margin-bottom:14px;"><h2 style="font-size:24px;font-weight:800;margin:0;">🤖 Smart Lawn</h2>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">Robotic-mower division of Second Nature Tree LLC (dba Smart Lawn) — everything tagged or identified as Smart Lawn.</div></div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;">'
      + this._stat('Collected', this._money(collected), '#0a7d2c')
      + this._stat('Outstanding', this._money(outstanding), outstanding > 0 ? '#c0271d' : 'var(--text)')
      + this._stat('Records', (clients.length + quotes.length + jobs.length + invoices.length), 'var(--text)')
      + '</div>';

    html += this._section('🧾', 'Invoices', invoices.length, this._rows(invoices, {
      title: function(i) { return '#' + (i.invoice_number || '') + ' · ' + (i.client_name || 'Unknown'); },
      sub: function(i) { return (i.status || '') + (i.subject ? ' · ' + i.subject : ''); },
      amount: function(i) { return i.total; },
      open: function(i) { return "InvoicesPage.showDetail('" + i.id + "')"; }
    }));

    html += this._section('📄', 'Quotes', quotes.length, this._rows(quotes, {
      title: function(q) { return '#' + (q.quote_number || '') + ' · ' + (q.client_name || 'Unknown'); },
      sub: function(q) { return (q.status || '') + (q.subject ? ' · ' + q.subject : ''); },
      amount: function(q) { return q.total; },
      open: function(q) { return "QuotesPage.showDetail('" + q.id + "')"; }
    }));

    html += this._section('🔧', 'Jobs', jobs.length, this._rows(jobs, {
      title: function(j) { return (j.client_name || 'Unknown') + (j.subject ? ' · ' + j.subject : ''); },
      sub: function(j) { return j.status || ''; },
      open: function(j) { return "JobsPage.showDetail('" + j.id + "')"; }
    }));

    html += this._section('👥', 'Clients', clients.length, this._rows(clients, {
      title: function(c) { return c.name || ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Unnamed'; },
      sub: function(c) { return c.phone || c.email || ''; },
      open: function(c) { return "ClientsPage.showDetail('" + c.id + "')"; }
    }));

    html += '<div style="font-size:12px;color:var(--text-light);margin-top:6px;line-height:1.5;">Records show here when tagged <b>Smart Lawn</b> (line of business) or when their text matches mower keywords. Tag a quote/job/invoice/client as Smart Lawn to pin it here and split it out in Books.</div>';

    html += '</div>';
    return html;
  }
};
window.SmartLawnPage = SmartLawnPage;
