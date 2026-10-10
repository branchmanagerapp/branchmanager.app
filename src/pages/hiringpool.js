/**
 * Branch Manager — Hiring Pool
 *
 * Tree-service-specific contact rolodex for: subcontractors (cranes,
 * bucket trucks), tree workers (full + part time, untested + tried),
 * equipment-rental + repair vendors, and education/specialty contacts.
 *
 * Pre-seeded May 1 2026 from Doug's "Workers and Subs" Google Sheet
 * tab. Storage is local (bm-hiring-pool) — same pattern as equipment.js.
 *
 * Categories:
 *   crane         — Cranes for hire
 *   bucket        — Bucket trucks for hire
 *   worker        — Possible tree workers (vetted)
 *   try           — Workers to try (unvetted)
 *   equipment     — Equipment rental / repair contacts
 *   education     — Cornell, specialty consultants
 */
var HiringPool = {
  STORAGE_KEY: 'bm-hiring-pool',

  CATEGORIES: [
    { k: 'crane',     label: '🏗 Cranes for Hire',          color: '#1565c0' },
    { k: 'bucket',    label: '🪣 Bucket Trucks for Hire',   color: '#7e2d10' },
    { k: 'worker',    label: '🧑‍🌾 Possible Tree Workers',   color: '#2e7d32' },
    { k: 'try',       label: '👀 Workers to Try',           color: '#e65100' },
    { k: 'equipment', label: '🔧 Equipment Rent / Repair',  color: '#6a1b9a' },
    { k: 'education', label: '🎓 Education / Specialty',     color: '#0277bd' }
  ],

  _filter: 'all',

  // ── Seed from May 1 2026 sheet pull ──
  _seed: [
    // CRANES
    { name: 'Carlos Tree Services',     role: 'Has smaller crane',           phone: '+1 (914) 424-7272', address: '',                category: 'crane' },
    { name: 'Chris Krane Works',        role: '',                            phone: '1-203-523-9942',     address: 'Woodbury, CT',     category: 'crane' },
    { name: 'Antonio Atlas',            role: '',                            phone: '',                   address: 'New Rochelle',     category: 'crane' },
    { name: 'Tom Olori',                role: 'Olori Lifts — High Reach Rockland', phone: '1 (845) 629-1348',                       address: '',                category: 'crane', notes: 'Alt: 1 (888) 689-0898' },
    // BUCKETS
    { name: 'Brother Tree',             role: '55ft bucket',                 phone: '',                   address: '',                category: 'bucket' },
    { name: 'CeeTree',                  role: '75ft bucket',                 phone: '(914) 309-4504',     address: '',                category: 'bucket' },
    { name: 'Wilson Maldonado',         role: 'Bucket truck · WM Tree Service Corp', phone: '1 (914) 877-0106',          address: '',                category: 'bucket' },
    { name: 'Ed Marunek',               role: 'Tree bucket · Marunek Sales', phone: '1 (570) 401-7777',   address: '',                category: 'bucket' },
    { name: 'Ben Green',                role: 'Pens hat factory',            phone: '(914) 643-8389',     address: '',                category: 'bucket' },
    { name: 'Dennis',                   role: 'West Point bucket operator',  phone: '',                   address: '',                category: 'bucket', notes: 'Available Saturdays' },
    // EQUIPMENT REPAIR/RENTAL
    { name: 'Trevor',                   role: 'Chipper repair · Landmark Machinery', phone: '(989) 772-8818', address: '',           category: 'equipment' },
    { name: 'Freddy Martignetti',       role: 'Eastonmade splitter rental contact', phone: '+1 (914) 755-0457', address: 'New Rochelle', category: 'equipment' },
    { name: 'Dan Wojick',               role: 'Belfast Inc. — Giant 254T parts',     phone: '(844) 344-3478', address: '',            category: 'equipment' },
    // POSSIBLE TREE WORKERS
    { name: 'Julio',                    role: 'Firewood · Landscaper · Stone walls', phone: '+1 (914) 224-3262', address: '',        category: 'worker' },
    { name: 'Eddie',                    role: 'Log truck · Knows Sean\'s Lawns', phone: '1 (845) 260-8793', address: '',              category: 'worker' },
    { name: 'Jose',                     role: 'Laborer',                     phone: '382-0524',           address: '',                category: 'worker' },
    { name: 'Mike Lawson',              role: 'Painter · All around worker', phone: '+1 (845) 264-7687',  address: '',                category: 'worker' },
    { name: 'Jorge',                    role: 'Mi Amigo',                    phone: '(914) 800-5670',     address: '',                category: 'worker' },
    { name: 'Miguel',                   role: 'Tree worker',                 phone: '+1 (914) 469-0851',  address: '',                category: 'worker' },
    { name: 'Mike',                     role: 'Braxton friend',              phone: '+1 (914) 462-6531',  address: '',                category: 'worker' },
    { name: 'Omar',                     role: 'Tree worker',                 phone: '+1 (914) 252-6865',  address: '',                category: 'worker' },
    { name: 'Evan Ozaruk',              role: 'Worker · Labor Armand · Tree', phone: '1 (914) 552-7978', address: '',                category: 'worker' },
    { name: 'Danny Pillco',             role: 'Tree worker (Facebook)',      phone: '+1 (845) 543-8531',  address: '',                category: 'worker' },
    { name: 'Eric Shauffler',           role: '',                            phone: '',                   address: '',                category: 'worker' },
    { name: 'Letsgo1547',               role: '(handle only)',               phone: '',                   address: '',                category: 'worker' },
    { name: 'Shane',                    role: '',                            phone: '',                   address: '',                category: 'worker' },
    // WORKERS TO TRY
    { name: 'Dougie Brickhouse',        role: '',                            phone: '1 (845) 682-8841',   address: '',                category: 'try' },
    { name: 'Rosy Brothers Tree',       role: '',                            phone: '1 (914) 424-9116',   address: '',                category: 'try' },
    { name: 'Chris Cottle',             role: '',                            phone: '',                   address: '',                category: 'try' },
    { name: 'Shane Brophy',             role: '',                            phone: '',                   address: '',                category: 'try' },
    { name: 'George Leo',               role: '',                            phone: '',                   address: '',                category: 'try' },
    { name: 'Buck',                     role: 'Climber · Braxton friend',    phone: '+1 (914) 760-8658',  address: '',                category: 'try' },
    { name: 'Adrian Chomiw',            role: '',                            phone: '1 (914) 898-7996',   address: '',                category: 'try' },
    { name: 'George',                   role: 'JT Trees',                    phone: '1 (845) 721-7848',   address: '',                category: 'try' },
    { name: 'Jim',                      role: 'Part time tree work',         phone: '1 (845) 546-6192',   address: '',                category: 'try' },
    { name: 'Joe',                      role: 'Worker',                      phone: '1 (845) 573-1345',   address: '',                category: 'try' },
    { name: 'Joe Male',                 role: 'Funtime · Worker · Tree',     phone: '1 (914) 393-7291',   address: '',                category: 'try' },
    // EDUCATION / SPECIALTY
    { name: 'Jennifer Lerner',          role: 'Cornell · jjs95@cornell.edu', phone: '1 (845) 278-6738',   address: 'Cornell.edu',     category: 'education' },
    { name: 'Raul Matos',               role: 'Engineer',                    phone: '1 (845) 490-1253',   address: '',                category: 'education' },
    { name: 'Joe',                      role: 'Quality Design Painter · Met at American Tire', phone: '+1 (914) 330-3889', address: '', category: 'education' }
  ],

  getAll: function() {
    var stored = localStorage.getItem(HiringPool.STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    var seeded = HiringPool._seed.map(function(c, i) {
      return Object.assign({ id: 'hp' + (i + 1).toString(36).padStart(3, '0'), archived: false, addedAt: '2026-05-01' }, c);
    });
    localStorage.setItem(HiringPool.STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  },

  _save: function(list) {
    localStorage.setItem(HiringPool.STORAGE_KEY, JSON.stringify(list));
  },

  render: function() {
    var contacts = HiringPool.getAll().filter(function(c) { return !c.archived; });
    var html = '<div style="max-width:900px;">';

    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      +   '<h2 style="margin:0;font-size:20px;font-weight:700;">🤝 Hiring Pool</h2>'
      +   '<p style="margin:2px 0 0;font-size:12px;color:var(--text-light);">Subcontractors, tree workers, equipment vendors. Add a contact once, find them when you need them.</p>'
      + '</div>'
      + '<button onclick="HiringPool.add()" class="btn btn-primary" style="font-size:13px;">+ Add Contact</button>'
      + '</div>';

    // Filter pills
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">';
    html += HiringPool._filterPill('all', 'All', contacts.length);
    HiringPool.CATEGORIES.forEach(function(cat) {
      var n = contacts.filter(function(c) { return c.category === cat.k; }).length;
      if (n > 0) html += HiringPool._filterPill(cat.k, cat.label, n, cat.color);
    });
    html += '</div>';

    // Contact cards grouped by category
    var visible = HiringPool._filter === 'all'
      ? contacts
      : contacts.filter(function(c) { return c.category === HiringPool._filter; });

    if (visible.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:13px;">No contacts in this category yet. Tap "+ Add Contact" to log one.</div>';
    } else {
      var grouped = {};
      visible.forEach(function(c) {
        if (!grouped[c.category]) grouped[c.category] = [];
        grouped[c.category].push(c);
      });
      HiringPool.CATEGORIES.forEach(function(cat) {
        if (!grouped[cat.k]) return;
        html += '<div style="margin-bottom:18px;">'
          + '<h3 style="font-size:14px;font-weight:700;margin:0 0 8px;color:' + cat.color + ';">' + cat.label + ' <span style="color:var(--text-light);font-weight:400;">(' + grouped[cat.k].length + ')</span></h3>'
          + '<div style="display:grid;gap:8px;">';
        grouped[cat.k].forEach(function(c) {
          html += HiringPool._renderCard(c, cat.color);
        });
        html += '</div></div>';
      });
    }

    html += '</div>';
    return html;
  },

  _filterPill: function(k, label, count, color) {
    var on = HiringPool._filter === k;
    var bg = on ? (color || 'var(--green-dark)') : 'var(--white)';
    var fg = on ? '#fff' : 'var(--text)';
    return '<button onclick="HiringPool._setFilter(\'' + k + '\')" '
      + 'style="padding:6px 12px;border-radius:14px;border:1px solid ' + (on ? bg : 'var(--border)') + ';'
      + 'background:' + bg + ';color:' + fg + ';font-size:12px;font-weight:' + (on ? '700' : '500') + ';cursor:pointer;">'
      + label + ' (' + count + ')</button>';
  },

  _setFilter: function(k) {
    HiringPool._filter = k;
    if (typeof window._opsTab !== 'undefined') loadPage('operations'); else loadPage('hiringpool');
  },

  _renderCard: function(c, color) {
    var phoneHref = c.phone ? 'tel:' + c.phone.replace(/[^0-9+]/g, '') : '';
    var smsHref   = c.phone ? 'sms:' + c.phone.replace(/[^0-9+]/g, '') : '';
    return '<div style="background:var(--white);border:1px solid var(--border);border-left:4px solid ' + color + ';border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;">'
      +   '<div style="flex:1;min-width:0;">'
      +     '<div style="font-size:14px;font-weight:700;">' + UI.esc(c.name) + '</div>'
      +     (c.role    ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(c.role) + '</div>' : '')
      +     (c.address ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">📍 ' + UI.esc(c.address) + '</div>' : '')
      +     (c.notes   ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;font-style:italic;">' + UI.esc(c.notes) + '</div>' : '')
      +   '</div>'
      +   '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">'
      +     (c.phone ? '<a href="' + phoneHref + '" style="background:#1565c0;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:4px 10px;border-radius:5px;text-align:center;">📞 Call</a>' : '')
      +     (c.phone ? '<a href="' + smsHref +   '" style="background:var(--green-dark);color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:4px 10px;border-radius:5px;text-align:center;">💬 SMS</a>' : '')
      +     '<button onclick="HiringPool.edit(\'' + c.id + '\')" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;font-weight:600;padding:4px 10px;border-radius:5px;cursor:pointer;">Edit</button>'
      +   '</div>'
      + '</div>';
  },

  add: function() {
    HiringPool._showForm(null);
  },
  edit: function(id) {
    var c = HiringPool.getAll().find(function(x) { return x.id === id; });
    if (c) HiringPool._showForm(c);
  },

  _showForm: function(c) {
    var isEdit = !!c;
    c = c || { name: '', role: '', phone: '', address: '', category: 'worker', notes: '' };
    var catOpts = HiringPool.CATEGORIES.map(function(cat) {
      return '<option value="' + cat.k + '"' + (c.category === cat.k ? ' selected' : '') + '>' + cat.label + '</option>';
    }).join('');
    var html = '<div style="display:grid;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;">Name *</label>'
      + '<input id="hp-name" value="' + UI.esc(c.name) + '" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;">Role / What they do</label>'
      + '<input id="hp-role" value="' + UI.esc(c.role) + '" placeholder="e.g. Bucket truck, Crane, Climber" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      +   '<div><label style="font-size:12px;font-weight:600;">Phone</label>'
      +     '<input id="hp-phone" value="' + UI.esc(c.phone) + '" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      +   '<div><label style="font-size:12px;font-weight:600;">Category</label>'
      +     '<select id="hp-category" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;">' + catOpts + '</select></div>'
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;">Address / Location</label>'
      + '<input id="hp-address" value="' + UI.esc(c.address) + '" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;">Notes</label>'
      + '<textarea id="hp-notes" rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">' + UI.esc(c.notes || '') + '</textarea></div>'
      + '</div>';
    UI.showModal(isEdit ? 'Edit Contact' : 'Add Contact', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + (isEdit ? ' <button class="btn btn-outline" style="color:#dc3545;border-color:#dc3545;" onclick="HiringPool._archive(\'' + c.id + '\')">Archive</button>' : '')
        + ' <button class="btn btn-primary" onclick="HiringPool._saveForm(' + (isEdit ? '\'' + c.id + '\'' : 'null') + ')">Save</button>'
    });
  },

  _saveForm: function(id) {
    var rec = {
      name:     (document.getElementById('hp-name')    || {}).value || '',
      role:     (document.getElementById('hp-role')    || {}).value || '',
      phone:    (document.getElementById('hp-phone')   || {}).value || '',
      address:  (document.getElementById('hp-address') || {}).value || '',
      category: (document.getElementById('hp-category')|| {}).value || 'worker',
      notes:    (document.getElementById('hp-notes')   || {}).value || ''
    };
    rec.name = rec.name.trim();
    if (!rec.name) { UI.toast('Name required', 'error'); return; }
    var list = HiringPool.getAll();
    if (id) {
      var idx = list.findIndex(function(x) { return x.id === id; });
      if (idx >= 0) list[idx] = Object.assign(list[idx], rec);
    } else {
      rec.id = 'hp' + Date.now().toString(36);
      rec.addedAt = new Date().toISOString().split('T')[0];
      rec.archived = false;
      list.push(rec);
    }
    HiringPool._save(list);
    UI.closeModal();
    UI.toast(id ? 'Updated ✅' : 'Added ✅');
    if (typeof window._opsTab !== 'undefined') loadPage('operations'); else loadPage('hiringpool');
  },

  _archive: function(id) {
    var list = HiringPool.getAll();
    var idx = list.findIndex(function(x) { return x.id === id; });
    if (idx >= 0) { list[idx].archived = true; HiringPool._save(list); }
    UI.closeModal();
    UI.toast('Archived');
    if (typeof window._opsTab !== 'undefined') loadPage('operations'); else loadPage('hiringpool');
  }
};
