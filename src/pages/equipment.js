/**
 * Branch Manager — Equipment Inventory & Maintenance Tracker
 * Track all equipment, maintenance schedules, hours, repair history
 */
var EquipmentPage = {
  render: function() {
    var equipment = EquipmentPage.getAll();
    var needsMaint = equipment.filter(function(e) { return EquipmentPage._needsMaintenance(e); });

    // Total maintenance cost from all history
    var totalMaintCost = 0;
    equipment.forEach(function(e) {
      var histKey = 'bm-equipment-history-' + e.id;
      try {
        var hist = JSON.parse(localStorage.getItem(histKey)) || [];
        hist.forEach(function(h) { totalMaintCost += (h.cost || 0); });
      } catch(err) {}
    });

    // v796: downtime tracking — count of equipment currently flagged "down"
    // by the most recent Pre-Trip inspection (pass=false with no clean
    // inspection following). Computed by EquipmentPage._currentlyDown().
    var downtime = EquipmentPage._currentlyDown();
    var downCount = downtime.length;

    var html = '<div class="stat-grid">'
      + UI.statCard('Equipment', equipment.length.toString(), 'Total items tracked', '', '')
      + UI.statCard('Needs Service', needsMaint.length.toString(), needsMaint.length > 0 ? '⚠️ Overdue' : 'All good ✅', needsMaint.length > 0 ? 'down' : 'up', '')
      + UI.statCard('Down', downCount.toString(), downCount > 0 ? '🛠 Defect flagged' : 'All up ✅', downCount > 0 ? 'down' : 'up', '')
      + UI.statCard('Total Value', UI.moneyInt(equipment.reduce(function(s, e) { return s + (e.value || 0); }, 0)), 'Replacement cost', '', '')
      + '</div>';

    // v796: down-equipment detail strip — shows each currently-down piece,
    // days down, and what was flagged. Auto-clears when next clean Pre-Trip
    // inspection lands. Lives above the legacy "Maintenance Due" callout
    // because Pre-Trip failures are the most-recent signal.
    if (downCount) {
      html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin-bottom:16px;">'
        + '<div style="font-weight:700;font-size:14px;color:#991b1b;margin-bottom:8px;">🛠 Currently down — ' + downCount + ' item' + (downCount === 1 ? '' : 's') + '</div>';
      downtime.forEach(function(d) {
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-top:1px solid #fde2e2;font-size:13px;">'
          + '<div style="flex:1;min-width:0;">'
          +   '<div style="font-weight:600;">' + UI.esc(d.label) + '</div>'
          +   (d.notes ? '<div style="font-size:11px;color:#7f1d1d;margin-top:2px;">' + UI.esc(d.notes) + '</div>' : '')
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;margin-left:10px;">'
          +   '<div style="font-weight:800;color:#991b1b;">' + d.daysDown + 'd</div>'
          +   '<div style="font-size:10px;color:#7f1d1d;">since ' + UI.dateShort(d.firstFailDate) + '</div>'
          + '</div>'
          + '</div>';
      });
      html += '<div style="font-size:11px;color:#7f1d1d;margin-top:8px;font-style:italic;">Auto-clears when a clean Pre-Trip inspection lands.</div>'
        + '</div>';
    }

    // Maintenance alerts
    if (needsMaint.length) {
      html += '<div style="background:#fff3e0;border-radius:12px;padding:16px;border-left:4px solid #e65100;margin-bottom:16px;">'
        + '<h4 style="color:#e65100;margin-bottom:8px;">⚠️ Maintenance Due</h4>';
      needsMaint.forEach(function(e) {
        html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;">'
          + '<span><strong>' + e.name + '</strong> — ' + (e.nextService || 'Service needed') + '</span>'
          + '<button onclick="EquipmentPage.logService(\'' + e.id + '\')" style="background:#e65100;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;">Mark Done</button>'
          + '</div>';
      });
      html += '</div>';
    }

    // Equipment checkout log
    var checkouts = [];
    try { checkouts = JSON.parse(localStorage.getItem('bm-equipment-checkouts') || '[]'); } catch(e) {}
    var activeCheckouts = checkouts.filter(function(c) { return !c.returnedAt; });

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:16px;">Checked Out</h3>'
      + '<button onclick="EquipmentPage.showCheckout()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">+ Check Out</button></div>';

    if (activeCheckouts.length === 0) {
      html += '<div style="text-align:center;padding:16px;color:var(--text-light);font-size:13px;">No equipment currently checked out.</div>';
    } else {
      activeCheckouts.forEach(function(c) {
        var dur = Math.round((Date.now() - new Date(c.checkedOutAt).getTime()) / 3600000);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;">'
          + '<div><div style="font-size:14px;font-weight:600;">' + UI.esc(c.equipmentName) + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(c.crewMember) + ' · ' + dur + 'h ago' + (c.jobName ? ' · ' + UI.esc(c.jobName) : '') + '</div></div>'
          + '<button onclick="EquipmentPage.returnEquipment(\'' + c.id + '\')" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Return</button>'
          + '</div>';
      });
    }
    html += '</div>';

    // Equipment list
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:16px;">Equipment</h3>'
      + '<button onclick="EquipmentPage.showForm()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">+ Add Equipment</button></div>';

    var categories = {};
    equipment.forEach(function(e) {
      var cat = e.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(e);
    });

    Object.keys(categories).sort().forEach(function(cat) {
      html += '<div style="margin-bottom:16px;">'
        + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px;">' + cat + '</h4>';
      categories[cat].forEach(function(e) {
        var statusColor = e.status === 'active' ? '#4caf50' : e.status === 'repair' ? '#f44336' : '#999';
        var lastInsp = EquipmentPage._lastInspection(e.id);
        var inspLabel = lastInsp
          ? 'Last checked: ' + UI.dateShort(lastInsp.date) + (lastInsp.checkedBy ? ' · ' + UI.esc(lastInsp.checkedBy) : '')
          : '⚠️ Not inspected yet';
        var inspColor = lastInsp ? 'var(--text-light)' : '#c0392b';
        html += '<div style="padding:8px 0;border-bottom:1px solid #f5f5f5;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<div style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;" onclick="EquipmentPage.showDetail(\'' + e.id + '\')">'
          + '<span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';flex-shrink:0;"></span>'
          + '<div><strong style="font-size:14px;">' + e.name + '</strong>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (e.make || '') + ' ' + (e.model || '') + (e.year ? ' · ' + e.year : '') + (e.serial ? ' · SN: ' + e.serial : '') + '</div>'
          + '<div style="font-size:11px;color:' + inspColor + ';margin-top:2px;">' + inspLabel + '</div>'
          + '</div></div>'
          + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
          + '<div style="text-align:right;font-size:12px;min-width:60px;">'
          + '<div style="font-weight:600;">' + (e.hours ? e.hours + ' hrs' : '') + '</div>'
          + '<div style="color:var(--text-light);">' + (e.value ? UI.money(e.value) : '') + '</div></div>'
          + '<button onclick="event.stopPropagation();EquipmentPage.toggleChecklist(\'' + e.id + '\')" style="background:#fffbe6;color:#8a6d00;border:1px solid #f0d874;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">📋 Checklist</button>'
          + '<button onclick="event.stopPropagation();EquipmentPage.logHours(\'' + e.id + '\')" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Hrs</button>'
          + '</div></div>'
          // Collapsible checklist panel (hidden by default)
          + '<div id="eq-checklist-' + e.id + '" style="display:none;margin-top:10px;padding:12px;background:#fafafa;border:1px solid var(--border);border-radius:8px;">'
          +   EquipmentPage._renderChecklistPanel(e)
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    });

    if (equipment.length === 0) {
      html += '<div style="text-align:center;padding:24px;color:var(--text-light);">'
        + '<p>No equipment tracked yet. Add your trucks, saws, and gear.</p></div>';
    }
    html += '</div>';

    return html;
  },

  getAll: function() {
    var stored = localStorage.getItem('bm-equipment');
    if (stored) {
      var list = JSON.parse(stored);
      var dirty = false;

      // Migration A (May 1 2026): eq4b was originally seeded as "Bandit 254 Chipper"
      // but the Kubota D902-E4B engine + Giant manuals actually belong to the
      // Giant 254T Loader. Rename in place, then add a separate eq4c for the
      // real Bandit 254 Chipper that Doug also owns.
      var eq4b = list.find(function(e) { return e.id === 'eq4b'; });
      if (eq4b && eq4b.name === 'Bandit 254 Chipper') {
        eq4b.name = 'Giant 254T Loader';
        eq4b.category = 'Equipment';
        eq4b.make = 'Giant';
        eq4b.model = '254T';
        dirty = true;
      }
      if (!eq4b) {
        list.push({ id: 'eq4b', name: 'Giant 254T Loader', category: 'Equipment', make: 'Giant', model: '254T', status: 'active', value: 35000, hours: 0, nextService: 'Hydraulic fluid + cooling kit' });
        dirty = true;
      }
      if (!list.find(function(e) { return e.id === 'eq4c'; })) {
        list.push({ id: 'eq4c', name: 'Bandit 254 Chipper', category: 'Equipment', make: 'Bandit', model: '254', status: 'active', value: 35000, hours: 0, nextService: 'Blade sharpen @ 50 hrs' });
        dirty = true;
      }

      // Migration B (May 1 2026): backfill VINs / serials / years that Doug provided.
      // Migration C (May 2 2026): registration #, registration_exp, last inspection
      // date + cert + mileage from windshield sticker photos. Bouncie GPS now
      // installed in eq1, eq2, eq3 (OBD-II dongle, takes ~5 min running to pair).
      // Only set if currently blank — never overwrite values Doug edited himself.
      var fleet = {
        'eq1':  { year: '2011', make: 'Ford', model: 'F-750', name: '2011 Ford F-750 Bucket Truck (Altec)', serial: '3FRPF7FC9BV085425', loanRef: '155642', notes: 'Forestry Package · Altec Elevator Bucket',
                  registration: '747508ES', registration_exp: '2026-11-30',
                  last_inspection: '2026-01-31', inspection_exp: '2027-01-31', inspection_cert: '0073700024', inspection_mileage: 80367,
                  bouncie_installed: true, bouncie_class: 'HD' },
        'eq2':  { year: '2004', make: 'Ford', model: 'F-550', name: '2004 Ford F-550 Chip Truck',          serial: '1FDAF57P24EB71582',
                  registration: '487181ES', registration_exp: '2026-10-31',
                  last_inspection: '2025-07-31', inspection_exp: '2026-07-31', inspection_cert: '0073700416', inspection_mileage: 76300,
                  bouncie_installed: true, bouncie_class: 'HD' },
        'eq3':  { year: '2019', make: 'Ram',  model: '2500',  name: '2019 Ram 2500',                       serial: '3C6UR5JL1KG623338',
                  registration: 'JK554987', registration_exp: '2027-06-30',
                  last_inspection: '2025-06-30', inspection_exp: '2026-06-30', inspection_cert: '1120400112', inspection_mileage: 60561,
                  bouncie_installed: true, bouncie_class: 'PASS', notes: 'Diesel emissions inspection required' },
        'eq4':  { year: '2005', make: 'Bandit', model: '200XP', name: '2005 Bandit 200XP Chipper',         serial: '020785' },
        'eq4c': {                make: 'Bandit', model: '254',   name: 'Bandit 254 Chipper',                serial: '4FMUS151191R001171' }
      };
      Object.keys(fleet).forEach(function(eid) {
        var item = list.find(function(e) { return e.id === eid; });
        if (!item) return;
        Object.keys(fleet[eid]).forEach(function(k) {
          if (!item[k]) { item[k] = fleet[eid][k]; dirty = true; }
        });
      });

      // Add Eastonmade 22-28 log splitter w/ conveyor (May 1 2026)
      if (!list.find(function(e) { return e.id === 'eq11'; })) {
        list.push({ id: 'eq11', name: 'Eastonmade 22-28 Log Splitter', category: 'Equipment', make: 'Eastonmade', model: '22-28', status: 'active', value: 18000, hours: 0, notes: 'Attached conveyor', nextService: 'Hydraulic fluid check' });
        dirty = true;
      }

      // Add Cub Cadet 54" deck mower (May 6 2026) — spindle PN 618-04608A
      if (!list.find(function(e) { return e.id === 'eq12'; })) {
        list.push({ id: 'eq12', name: 'Cub Cadet 54" Mower', category: 'Equipment', make: 'Cub Cadet', model: '54" deck (RZT/GT/ZT)', status: 'active', value: 3500, hours: 0, notes: '54" deck spindle PN 618-04608A · 3 spindles per deck', nextService: 'Inspect spindles + belt' });
        dirty = true;
      }

      if (dirty) localStorage.setItem('bm-equipment', JSON.stringify(list));
      return list;
    }
    // Seed with common tree service equipment
    var defaults = [
      { id: 'eq1', name: 'Bucket Truck', category: 'Trucks', make: '', model: '', status: 'active', value: 85000, hours: 0, nextService: 'Oil change @ 5000 mi' },
      { id: 'eq2', name: 'Chip Truck', category: 'Trucks', make: '', model: '', status: 'active', value: 45000, hours: 0 },
      { id: 'eq3', name: 'Ram 2500', category: 'Trucks', make: 'Ram', model: '2500', status: 'active', value: 45000, hours: 0 },
      { id: 'eq4', name: 'Bandit 200XP Chipper', category: 'Equipment', make: 'Bandit', model: '200XP', status: 'active', value: 35000, hours: 0, nextService: 'Blade sharpen @ 50 hrs' },
      { id: 'eq4b', name: 'Giant 254T Loader', category: 'Equipment', make: 'Giant', model: '254T', status: 'active', value: 35000, hours: 0, nextService: 'Hydraulic fluid + cooling kit' },
      { id: 'eq4c', name: 'Bandit 254 Chipper', category: 'Equipment', make: 'Bandit', model: '254', status: 'active', value: 35000, hours: 0, nextService: 'Blade sharpen @ 50 hrs' },
      { id: 'eq6', name: 'Loader', category: 'Equipment', make: '', model: '', status: 'active', value: 25000, hours: 0 },
      { id: 'eq7', name: 'Climbing Gear Set', category: 'Safety', make: '', model: '', status: 'active', value: 3000, nextService: 'Annual inspection' },
      { id: 'eq8', name: 'Stihl MS 462', category: 'Saws', make: 'Stihl', model: 'MS 462', status: 'active', value: 1100, hours: 0 },
      { id: 'eq9', name: 'Stihl MS 261', category: 'Saws', make: 'Stihl', model: 'MS 261', status: 'active', value: 700, hours: 0 },
      { id: 'eq10', name: 'Trailer', category: 'Trucks', make: '', model: '', status: 'active', value: 5000 },
      { id: 'eq12', name: 'Cub Cadet 54" Mower', category: 'Equipment', make: 'Cub Cadet', model: '54" deck (RZT/GT/ZT)', status: 'active', value: 3500, hours: 0, notes: '54" deck spindle PN 618-04608A · 3 spindles per deck', nextService: 'Inspect spindles + belt' }
    ];
    localStorage.setItem('bm-equipment', JSON.stringify(defaults));
    return defaults;
  },

  _needsMaintenance: function(e) {
    if (!e.lastService) return !!e.nextService;
    var daysSince = (Date.now() - new Date(e.lastService).getTime()) / 86400000;
    return daysSince > (e.serviceIntervalDays || 90);
  },

  // v796: which DailyInspection vehicles/equipment are currently flagged
  // down? Walks bm-inspection-history (newest-first). For each vehicle:
  //   - Find the most recent inspection.
  //   - If it's pass=true → vehicle is up, skip.
  //   - If it's pass=false → walk back to find the OLDEST consecutive
  //     fail (i.e. how long since the most recent clean inspection).
  //   - "Down since" = that oldest consecutive fail's completedAt date.
  // Returns array of { vehicleId, label, daysDown, firstFailDate, notes }.
  _currentlyDown: function() {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem('bm-inspection-history') || '[]'); } catch(e) { return []; }
    if (!hist.length) return [];

    // Group inspections by vehicleId newest-first (history is already newest-
    // first per dailyinspection.js: history.unshift(record)).
    var byVeh = {};
    hist.forEach(function(r) {
      if (!r || !r.vehicleId) return;
      var arr = byVeh[r.vehicleId] || (byVeh[r.vehicleId] = []);
      arr.push(r);
    });

    var down = [];
    var nowMs = Date.now();
    Object.keys(byVeh).forEach(function(vid) {
      var inspections = byVeh[vid];
      if (!inspections.length) return;
      // Sort newest-first defensively
      inspections.sort(function(a, b) {
        return new Date(b.completedAt || b.date).getTime() - new Date(a.completedAt || a.date).getTime();
      });
      var newest = inspections[0];
      if (newest.pass) return; // currently up
      // Walk back to find the oldest CONSECUTIVE failure in the current
      // run (stop at the first pass that bisects).
      var firstFail = newest;
      for (var i = 1; i < inspections.length; i++) {
        if (inspections[i].pass) break;
        firstFail = inspections[i];
      }
      var ts = new Date(firstFail.completedAt || firstFail.date).getTime();
      if (isNaN(ts)) return;
      var daysDown = Math.max(0, Math.floor((nowMs - ts) / 86400000));
      down.push({
        vehicleId: vid,
        label: newest.vehicleLabel || vid,
        daysDown: daysDown,
        firstFailDate: ts,
        notes: newest.notes || ''
      });
    });
    // Sort by daysDown desc — chronic issues at the top
    down.sort(function(a, b) { return b.daysDown - a.daysDown; });
    return down;
  },

  showForm: function(id) {
    var e = id ? EquipmentPage.getAll().find(function(eq) { return eq.id === id; }) : null;
    var categories = ['Trucks', 'Equipment', 'Saws', 'Safety', 'Rigging', 'Other'];

    var html = '<form id="eq-form" onsubmit="EquipmentPage.save(event, ' + (id ? '\'' + id + '\'' : 'null') + ')">'
      + UI.formField('Name', 'text', 'eq-name', e ? e.name : '', { placeholder: 'e.g., Stihl MS 462' })
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + UI.formField('Category', 'select', 'eq-cat', e ? e.category : '', { options: categories })
      + UI.formField('Status', 'select', 'eq-status', e ? e.status : 'active', { options: ['active', 'repair', 'retired'] })
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'
      + UI.formField('Make', 'text', 'eq-make', e ? e.make : '', { placeholder: 'Stihl' })
      + UI.formField('Model', 'text', 'eq-model', e ? e.model : '', { placeholder: 'MS 462' })
      + UI.formField('Year', 'text', 'eq-year', e ? e.year : '', { placeholder: '2024' })
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + UI.formField('Value ($)', 'number', 'eq-value', e ? e.value : '', { placeholder: '5000' })
      + UI.formField('Serial Number', 'text', 'eq-serial', e ? e.serial : '', { placeholder: 'SN12345' })
      + '</div>'
      + UI.formField('Service Notes', 'text', 'eq-service', e ? e.nextService : '', { placeholder: 'e.g., Oil change every 100 hours' })
      + '</form>';

    UI.showModal(id ? 'Edit Equipment' : 'Add Equipment', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'eq-form\').requestSubmit()">Save</button>'
    });
  },

  save: function(e, id) {
    e.preventDefault();
    var all = EquipmentPage.getAll();
    var data = {
      name: document.getElementById('eq-name').value,
      category: document.getElementById('eq-cat').value,
      status: document.getElementById('eq-status').value,
      make: document.getElementById('eq-make').value,
      model: document.getElementById('eq-model').value,
      year: document.getElementById('eq-year').value,
      value: parseFloat(document.getElementById('eq-value').value) || 0,
      serial: document.getElementById('eq-serial').value,
      nextService: document.getElementById('eq-service').value
    };

    if (id) {
      var idx = all.findIndex(function(eq) { return eq.id === id; });
      if (idx >= 0) Object.assign(all[idx], data);
    } else {
      data.id = Date.now().toString(36);
      data.hours = 0;
      data.createdAt = new Date().toISOString();
      all.push(data);
    }
    localStorage.setItem('bm-equipment', JSON.stringify(all));
    UI.closeModal();
    UI.toast(id ? 'Equipment updated' : 'Equipment added');
    loadPage('equipment');
  },

  showDetail: function(id) {
    var e = EquipmentPage.getAll().find(function(eq) { return eq.id === id; });
    if (!e) return;

    // Load service history
    var histKey = 'bm-equipment-history-' + id;
    var history = [];
    try { history = JSON.parse(localStorage.getItem(histKey)) || []; } catch(err) {}

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">'
      + '<div><h4 style="margin-bottom:8px;">Details</h4>'
      + '<div style="font-size:14px;line-height:2;">'
      + '<div>Make: <strong>' + (e.make || '—') + '</strong></div>'
      + '<div>Model: <strong>' + (e.model || '—') + '</strong></div>'
      + '<div>Year: <strong>' + (e.year || '—') + '</strong></div>'
      + '<div>Serial: <strong>' + (e.serial || '—') + '</strong></div>'
      + '<div>Value: <strong>' + UI.money(e.value || 0) + '</strong></div>'
      + '<div>Hours: <strong>' + (e.hours || 0) + '</strong></div></div></div>'
      + '<div><h4 style="margin-bottom:8px;">Service</h4>'
      + '<div style="font-size:14px;line-height:2;">'
      + '<div>Status: ' + UI.statusBadge(e.status) + '</div>'
      + '<div>Next Service: <strong>' + (e.nextService || 'None set') + '</strong></div>'
      + '<div>Last Service: <strong>' + (e.lastService ? UI.dateShort(e.lastService) : 'Never') + '</strong></div></div></div></div>';

    // Service history section
    html += '<div style="margin-top:20px;">'
      + '<h4 style="font-size:14px;font-weight:700;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;">Service History</h4>';
    if (history.length === 0) {
      html += '<div style="font-size:13px;color:var(--text-light);padding:8px 0;">No service logged yet.</div>';
    } else {
      var recent = history.slice(0, 5);
      recent.forEach(function(h) {
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f5f5f5;font-size:13px;">'
          + '<div>'
          + '<div style="font-weight:600;">' + UI.esc(h.type) + '</div>'
          + (h.notes ? '<div style="color:var(--text-light);margin-top:2px;">' + UI.esc(h.notes) + '</div>' : '')
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;margin-left:12px;">'
          + '<div style="font-weight:600;color:var(--green-dark);">' + (h.cost > 0 ? UI.money(h.cost) : '') + '</div>'
          + '<div style="color:var(--text-light);">' + UI.dateShort(h.date) + '</div>'
          + '</div></div>';
      });
      if (history.length > 5) {
        html += '<div style="font-size:12px;color:var(--text-light);padding:6px 0;">+ ' + (history.length - 5) + ' more entries</div>';
      }
    }
    html += '</div>';

    if (typeof Photos !== 'undefined') {
      html += Photos.renderGallery('equipment', id);
    }

    html += EquipmentPage._renderDocs(id);
    html += EquipmentPage._renderCompliance(id);

    UI.showModal(e.name, html, {
      wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-outline" onclick="EquipmentPage.logHours(\'' + id + '\')">⏱ Log Hours</button>'
        + ' <button class="btn btn-outline" onclick="EquipmentPage.logService(\'' + id + '\')">✅ Log Service</button>'
        + ' <button class="btn btn-primary" onclick="UI.closeModal();EquipmentPage.showForm(\'' + id + '\')">Edit</button>'
    });
  },

  logService: function(id, preset) {
    var all = EquipmentPage.getAll();
    var eq = all.find(function(e) { return e.id === id; });
    if (!eq) return;
    preset = preset || {};

    var html = '<div style="display:grid;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Service Type</label>'
      + '<select id="svc-type" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option>Oil Change</option><option>Blade Sharpen</option><option>Filter Replace</option>'
      + '<option>Annual Inspection</option><option' + (preset.type === 'Repair' ? ' selected' : '') + '>Repair</option><option>Other</option>'
      + '</select></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Notes</label>'
      + '<input type="text" id="svc-notes" value="' + UI.esc(preset.notes || '') + '" placeholder="What was done?" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Cost ($)</label>'
      + '<input type="number" id="svc-cost" value="' + (preset.cost || '') + '" placeholder="0" step="0.01" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="EquipmentPage._saveService(\'' + id + '\')">Log Service</button>'
      + '</div></div>';
    UI.showModal('Log Service — ' + eq.name, html);
  },

  // Pre-filled service log for the Bandit 254 cooling kit order — click in the
  // 🔩 parts box, fill in the cost when the R&L invoice arrives.
  _logCoolingKit: function(id, vendor) {
    EquipmentPage.logService(id, {
      type: 'Repair',
      notes: 'Cooling kit ordered from ' + vendor + ': water pump (1E051-73036), W/P gasket (16871-73430), thermostat (19434-73015), T-stat gasket (16221-73270)'
    });
  },

  // Pre-filled service log for the Bandit 254 chipper knife order from Stephenson.
  _logChipperKnives: function(id, vendor) {
    EquipmentPage.logService(id, {
      type: 'Blade Sharpen',
      notes: 'Chipper knives ordered from ' + vendor + ' for Bandit 254 (verify OEM by serial: 900-9900-02 set / 900-9901-18 single / 900-9902-00 bedknife)'
    });
  },

  _saveService: function(id) {
    var type = document.getElementById('svc-type').value;
    var notes = document.getElementById('svc-notes').value;
    var cost = parseFloat(document.getElementById('svc-cost').value) || 0;

    // Save to history
    var histKey = 'bm-equipment-history-' + id;
    var history = [];
    try { history = JSON.parse(localStorage.getItem(histKey)) || []; } catch(e) {}
    history.unshift({ type: type, notes: notes, cost: cost, date: new Date().toISOString() });
    localStorage.setItem(histKey, JSON.stringify(history));

    // Update equipment lastService
    var all = EquipmentPage.getAll();
    var eq = all.find(function(e) { return e.id === id; });
    if (eq) {
      eq.lastService = new Date().toISOString();
      localStorage.setItem('bm-equipment', JSON.stringify(all));
    }

    UI.closeModal();
    UI.toast('Service logged for ' + (eq ? eq.name : 'equipment'));
    loadPage('equipment');
  },

  logHours: function(id) {
    var eq = EquipmentPage.getAll().find(function(e) { return e.id === id; });
    if (!eq) return;
    var html = '<div style="display:grid;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Hours Used Today</label>'
      + '<input type="number" id="hours-used" value="8" step="0.5" min="0.5" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:18px;font-weight:700;text-align:center;"></div>'
      + '<div style="font-size:13px;color:var(--text-light);text-align:center;">Current total: <strong>' + (eq.hours || 0) + ' hrs</strong></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="EquipmentPage._saveHours(\'' + id + '\')">Add Hours</button>'
      + '</div></div>';
    UI.showModal('Log Hours — ' + eq.name, html);
  },

  _saveHours: function(id) {
    var add = parseFloat(document.getElementById('hours-used').value) || 0;
    var all = EquipmentPage.getAll();
    var eq = all.find(function(e) { return e.id === id; });
    if (eq && add > 0) {
      eq.hours = (eq.hours || 0) + add;
      localStorage.setItem('bm-equipment', JSON.stringify(all));
      UI.closeModal();
      UI.toast(add + ' hrs logged for ' + eq.name + ' (' + eq.hours + ' total)');
      loadPage('equipment');
    }
  },

  // Checkout / Return
  showCheckout: function() {
    var equipment = EquipmentPage.getAll().filter(function(e) { return e.status === 'active'; });
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
    if (team.length === 0) team = [{ name: CompanyInfo.get('ownerName') || 'Owner' }];
    var todayJobs = DB.jobs.getAll().filter(function(j) {
      var today = new Date().toISOString().split('T')[0];
      return j.scheduledDate && j.scheduledDate.substring(0, 10) === today;
    });

    var html = '<form id="checkout-form">'
      + '<div class="form-group"><label>Equipment *</label><select id="co-equip" required style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;">';
    equipment.forEach(function(e) { html += '<option value="' + e.id + '">' + e.name + ' (' + (e.category || '') + ')</option>'; });
    html += '</select></div>'
      + '<div class="form-group"><label>Crew Member *</label><select id="co-crew" required style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;">';
    team.forEach(function(t) { html += '<option>' + (t.name || '') + '</option>'; });
    html += '</select></div>'
      + '<div class="form-group"><label>Job (optional)</label><select id="co-job" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;"><option value="">— None —</option>';
    todayJobs.forEach(function(j) { html += '<option value="' + j.id + '">' + (j.clientName || '') + ' (#' + (j.jobNumber || '') + ')</option>'; });
    html += '</select></div>'
      + '<div class="form-group"><label>Notes</label><input type="text" id="co-notes" placeholder="e.g., Took 2 saws, extra chain" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;"></div>'
      + '</form>';

    UI.showModal('Check Out Equipment', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="EquipmentPage.saveCheckout()">Check Out</button>'
    });
  },

  saveCheckout: function() {
    var equipId = document.getElementById('co-equip').value;
    var crew = document.getElementById('co-crew').value;
    if (!equipId || !crew) { alert('Select equipment and crew member'); return; }

    var equip = EquipmentPage.getAll().find(function(e) { return e.id === equipId; });
    var jobEl = document.getElementById('co-job');
    var jobId = jobEl ? jobEl.value : '';
    var jobName = jobId ? jobEl.options[jobEl.selectedIndex].text : '';
    var notes = (document.getElementById('co-notes') || {}).value || '';

    var checkouts = [];
    try { checkouts = JSON.parse(localStorage.getItem('bm-equipment-checkouts') || '[]'); } catch(e) {}
    checkouts.unshift({
      id: Date.now().toString(36),
      equipmentId: equipId,
      equipmentName: equip ? equip.name : equipId,
      crewMember: crew,
      jobId: jobId,
      jobName: jobName,
      notes: notes,
      checkedOutAt: new Date().toISOString(),
      returnedAt: null
    });
    localStorage.setItem('bm-equipment-checkouts', JSON.stringify(checkouts));
    UI.closeModal();
    UI.toast(equip.name + ' checked out to ' + crew);
    loadPage('equipment');
  },

  returnEquipment: function(checkoutId) {
    var checkouts = [];
    try { checkouts = JSON.parse(localStorage.getItem('bm-equipment-checkouts') || '[]'); } catch(e) {}
    var co = checkouts.find(function(c) { return c.id === checkoutId; });
    if (co) {
      co.returnedAt = new Date().toISOString();
      localStorage.setItem('bm-equipment-checkouts', JSON.stringify(checkouts));
      UI.toast(co.equipmentName + ' returned by ' + co.crewMember);
      loadPage('equipment');
    }
  },

  // ═══ Pre-use Safety Checklists ═══
  // Default checklists keyed by a normalized "kind" string derived from name/category/model.
  _checklistDefaults: {
    'bucket-truck': ['Boom extends/retracts smoothly','Outriggers deploy + lock','Hydraulic fluid level OK','Emergency descent works','Upper controls responsive','Lower controls responsive','Safety harness anchor points','Insulator bucket clean + dry','Horn + backup alarm','Tires (pressure, tread)','Lights (head/brake/turn)','Insurance + registration in cab'],
    'chipper': ['Blades sharp + bolts tight','Safety bar engages + kills blade','Feed wheel rotates freely','Discharge chute clear + rotates','Fuel level + oil','PTO shield in place','Kill switch accessible','Hose + clamps intact','Hitch secure'],
    'crane': ['Outriggers level + locked','Boom extends full range','Load line + hook inspected for wear','Anti-two-block working','Hydraulic system (no leaks)','Radio remote paired + charged','Load chart posted','Operator cert valid + in cab','Fire extinguisher + first aid'],
    'stump-grinder': ['Teeth sharp + bolts tight','Guard in place','Kill switch accessible','Fuel + oil','Tires/tracks OK','Trailer lights + safety chains (if towed)','PPE: face shield + chaps on rig'],
    'mini-skid': ['Tracks or tires OK','Hydraulic fluid level','Seatbelt functional','Horn + backup alarm','Bucket/attachment secure','Quick-attach pins engaged','Lights + mirrors','Fuel level'],
    'dump-truck': ['Body raises + locks','Tailgate latches + releases','Brakes firm','Tires (pressure + tread)','Lights + turn signals','Load cover/tarp','Registration + insurance','Pre-trip DOT walkaround complete'],
    'chainsaw': ['Chain sharp + tension correct','Bar oil full','Fuel mix correct','Chain brake engages','Throttle trigger interlock works','Muffler + heat shield intact','PPE: chaps + helmet + ears + eyes'],
    'trailer': ['Hitch secure + pin + clip','Safety chains crossed','Breakaway cable attached','Lights (running, brake, turn)','Tires (pressure + tread)','Load secured + strapped','License plate + registration'],
    'generic': ['Fluid levels OK','Tires / tracks OK','Controls functional','Safety features (brakes, kill switches) tested','Fuel level','Visual inspection — no damage/leaks','Documentation in vehicle']
  },

  _detectKind: function(e) {
    var hay = ((e.name || '') + ' ' + (e.make || '') + ' ' + (e.model || '') + ' ' + (e.category || '')).toLowerCase();
    if (/bucket/.test(hay)) return 'bucket-truck';
    if (/dump/.test(hay)) return 'dump-truck';
    if (/chipper/.test(hay)) return 'chipper';
    if (/crane/.test(hay)) return 'crane';
    if (/stump/.test(hay)) return 'stump-grinder';
    if (/(mini[- ]?skid|loader|skid.?steer)/.test(hay)) return 'mini-skid';
    if (/(chainsaw|stihl|husq|saw)/.test(hay)) return 'chainsaw';
    if (/trailer/.test(hay)) return 'trailer';
    return 'generic';
  },

  _checklistItemsFor: function(e) {
    var kind = EquipmentPage._detectKind(e);
    return EquipmentPage._checklistDefaults[kind] || EquipmentPage._checklistDefaults.generic;
  },

  _allInspections: function() {
    try { return JSON.parse(localStorage.getItem('bm-equipment-inspections') || '[]'); } catch(e) { return []; }
  },

  _lastInspection: function(equipmentId) {
    var all = EquipmentPage._allInspections().filter(function(r) { return r.equipmentId === equipmentId; });
    if (!all.length) return null;
    all.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    return all[0];
  },

  _renderChecklistPanel: function(e) {
    var items = EquipmentPage._checklistItemsFor(e);
    var kind = EquipmentPage._detectKind(e);
    var cbHtml = '';
    items.forEach(function(item, i) {
      var cid = 'chk-' + e.id + '-' + i;
      cbHtml += '<label for="' + cid + '" style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;font-size:13px;cursor:pointer;">'
        + '<input type="checkbox" id="' + cid + '" data-item="' + UI.esc(item) + '" style="margin-top:3px;flex-shrink:0;">'
        + '<span>' + UI.esc(item) + '</span>'
        + '</label>';
    });
    return '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">Pre-use safety check <span style="background:#eef;color:#334;padding:1px 6px;border-radius:10px;font-weight:600;margin-left:4px;">' + kind + '</span></div>'
      + '<div id="eq-checklist-items-' + e.id + '">' + cbHtml + '</div>'
      + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      +   '<input type="text" id="eq-chk-who-' + e.id + '" placeholder="Checked by (name)" style="flex:1;min-width:140px;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
      +   '<button onclick="EquipmentPage.markInspected(\'' + e.id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:8px 14px;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;">Mark Inspected</button>'
      + '</div>';
  },

  toggleChecklist: function(id) {
    var el = document.getElementById('eq-checklist-' + id);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  },

  markInspected: function(id) {
    var eq = EquipmentPage.getAll().find(function(e) { return e.id === id; });
    if (!eq) return;
    var wrap = document.getElementById('eq-checklist-items-' + id);
    if (!wrap) return;
    var boxes = wrap.querySelectorAll('input[type="checkbox"]');
    var items = EquipmentPage._checklistItemsFor(eq);
    var checked = [];
    var unchecked = [];
    boxes.forEach(function(b) {
      if (b.checked) checked.push(b.getAttribute('data-item'));
      else unchecked.push(b.getAttribute('data-item'));
    });
    if (checked.length !== items.length) {
      if (!confirm('Some items are unchecked (' + unchecked.length + '). Record anyway?')) return;
    }
    var whoEl = document.getElementById('eq-chk-who-' + id);
    var who = whoEl ? whoEl.value.trim() : '';
    var rec = {
      id: Date.now().toString(36),
      equipmentId: id,
      equipmentName: eq.name,
      date: new Date().toISOString(),
      checkedBy: who || 'Unknown',
      allItems: checked,
      skipped: unchecked
    };
    var all = EquipmentPage._allInspections();
    all.unshift(rec);
    localStorage.setItem('bm-equipment-inspections', JSON.stringify(all));
    UI.toast('✅ ' + eq.name + ' inspected (' + checked.length + '/' + items.length + ' items)');
    loadPage('equipment');
  },

  // ═══ Manuals & Documents ═══
  _getDocs: function(id) {
    try {
      var stored = localStorage.getItem('bm-equipment-docs-' + id);
      if (stored) {
        var docs = JSON.parse(stored);
        // Migration: ensure Giant 254T has the bro-1-g1200 parts breakdown email attachment
        if (id === 'eq4b' && !docs.find(function(d) { return d.id === 'doc-g6'; })) {
          docs.push({ id: 'doc-g6', name: 'Giant G1200 / Kubota D902-E4B Parts Breakdown', type: 'parts',
            url: 'https://ltpivkqahvplapyagljt.supabase.co/storage/v1/object/public/equipment-docs/giant-254t/kubota-d902-e4b-bro-1-g1200.pdf',
            addedAt: '2026-04-29', note: 'Email attachment from Dan Wojick @ Belfast Inc.' });
          EquipmentPage._saveDocs(id, docs);
        }
        return docs;
      }
    } catch(e) {}
    // Pre-seed Giant 254T Loader (Kubota D902-E4B engine) with Dan Wojick's manuals
    if (id === 'eq4b') {
      var seed = [
        { id: 'doc-g1', name: 'Operator Manual', type: 'manual',
          url: 'https://drive.google.com/file/d/1kVoAKtIUHbTxxWYZLzCkRPxpxvM_F_xj/view',
          addedAt: '2026-04-29', note: 'From Dan Wojick @ Belfast Inc.' },
        { id: 'doc-g2', name: 'Service Manual', type: 'manual',
          url: 'https://drive.google.com/file/d/1m4DUs5mDU_twd4fnDkCkvAO6yuxzGm3Q/view',
          addedAt: '2026-04-29', note: 'From Dan Wojick @ Belfast Inc.' },
        { id: 'doc-g3', name: 'Kubota D902-E4B Engine WSM', type: 'manual',
          url: 'https://drive.google.com/file/d/1WlenKBXvqM9TPj6XSCa405R4iOJBxf9P/view',
          addedAt: '2026-04-29', note: 'From Dan Wojick @ Belfast Inc.' },
        { id: 'doc-g4', name: 'Giant 254 Parts Diagrams', type: 'parts',
          url: 'https://drive.google.com/file/d/1xTNh5cOtAEbQlfWIry9pwaFGpcOvzod2/view',
          addedAt: '2026-04-29', note: 'From Dan Wojick @ Belfast Inc.' },
        { id: 'doc-g5', name: 'Kubota D902-E4B Parts List (PDF)', type: 'parts',
          url: 'https://ltpivkqahvplapyagljt.supabase.co/storage/v1/object/public/equipment-docs/giant-254t/kubota-d902-e4b-parts-list.pdf',
          addedAt: '2026-04-29', note: 'Uploaded to BM storage' },
        { id: 'doc-g6', name: 'Giant G1200 / Kubota D902-E4B Parts Breakdown', type: 'parts',
          url: 'https://ltpivkqahvplapyagljt.supabase.co/storage/v1/object/public/equipment-docs/giant-254t/kubota-d902-e4b-bro-1-g1200.pdf',
          addedAt: '2026-04-29', note: 'Email attachment from Dan Wojick @ Belfast Inc.' }
      ];
      EquipmentPage._saveDocs(id, seed);
      return seed;
    }
    // Pre-seed Bandit 254 Chipper (eq4c) — Stephenson Equipment manual
    if (id === 'eq4c') {
      var seed4c = [
        { id: 'doc-b1', name: 'Bandit 250-254 Hand-Fed Chipper Manual', type: 'manual',
          url: 'https://www.stephensonequipment.com/wp-content/uploads/2023/08/bandit-handfed-chipper-250-254-manual-8-07.pdf',
          addedAt: '2026-05-01', note: 'Stephenson Equipment — operator + parts diagrams' }
      ];
      EquipmentPage._saveDocs(id, seed4c);
      return seed4c;
    }
    // Pre-seed Eastonmade 22-28 (eq11) — manufacturer site link.
    // No public PDF manual — the company ships printed manuals with each
    // unit. Doug should scan + drop into Supabase Storage when he gets a
    // chance; this seed at least makes the brand site one tap away.
    if (id === 'eq11') {
      var seed11 = [
        { id: 'doc-em1', name: 'Eastonmade Wood Splitters — Manuals & Parts', type: 'manual',
          url: 'https://eastonmadewoodsplitters.com/dealer-locator/',
          addedAt: '2026-05-01', note: 'Call mfr (931) 670-5557 for PDF · printed copy ships with unit' },
        { id: 'doc-em2', name: 'Honda GX390 Engine Owner\'s Manual', type: 'manual',
          url: 'https://cdn.powerequipment.honda.com/engines/pdf/manuals/31Z5T617.pdf',
          addedAt: '2026-05-01', note: 'Standard 13hp engine on 22-28 builds' }
      ];
      EquipmentPage._saveDocs(id, seed11);
      return seed11;
    }
    // Pre-seed Stihl MS 462 (eq8) — operator manual from Stihl USA
    if (id === 'eq8') {
      var seed8 = [
        { id: 'doc-ms462-1', name: 'Stihl MS 462 Operator Manual', type: 'manual',
          url: 'https://www.stihlusa.com/WebContent/CMSFileLibrary/OwnersManuals/MS-462C-M-Owners-Manual.pdf',
          addedAt: '2026-05-01', note: 'Stihl USA — operator + maintenance' }
      ];
      EquipmentPage._saveDocs(id, seed8);
      return seed8;
    }
    // Pre-seed Stihl MS 261 (eq9) — operator manual from Stihl USA
    if (id === 'eq9') {
      var seed9 = [
        { id: 'doc-ms261-1', name: 'Stihl MS 261 Operator Manual', type: 'manual',
          url: 'https://www.stihlusa.com/WebContent/CMSFileLibrary/OwnersManuals/MS-261-Owners-Manual.pdf',
          addedAt: '2026-05-01', note: 'Stihl USA — operator + maintenance' }
      ];
      EquipmentPage._saveDocs(id, seed9);
      return seed9;
    }
    // Pre-seed Bandit 200XP Chipper (eq4) — Stephenson Equipment manual
    if (id === 'eq4') {
      var seed4 = [
        { id: 'doc-b200-1', name: 'Bandit 90XP / 150XP / 200XP Hand-Fed Chipper Manual', type: 'manual',
          url: 'https://www.stephensonequipment.com/wp-content/uploads/2023/08/bandit-handfed-chipper-90XP-150XP-200XP.pdf',
          addedAt: '2026-05-01', note: 'Stephenson Equipment — operator + parts diagrams' }
      ];
      EquipmentPage._saveDocs(id, seed4);
      return seed4;
    }
    return [];
  },

  _saveDocs: function(id, docs) {
    localStorage.setItem('bm-equipment-docs-' + id, JSON.stringify(docs));
  },

  // ── Compliance & Inspections tracker ──
  // Per-equipment list of recurring required inspections (annual dielectric
  // for insulated aerial devices, ANSI Z133 for climbing gear, DOT, etc.).
  // Each item has an interval and a lastDone date — card shows green/yellow/
  // red based on how close to due. Storage: bm-equipment-compliance-{id}.
  _getCompliance: function(id) {
    try {
      var stored = localStorage.getItem('bm-equipment-compliance-' + id);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    // Pre-seed insulated bucket truck (eq1, 2011 Ford F-750) — ANSI A92.2 +
    // dielectric, NY HD safety inspection, registration. May 2 2026 stickers:
    // Inspection cert 0073700024, exp 01-2027, mileage 80367. Reg 747508ES exp 11/30/2026.
    if (id === 'eq1') {
      var seed1 = [
        { id: 'cmp-bt-1', label: 'Annual Dielectric Test',          intervalDays: 365, lastDone: '', criticality: 'critical', vendor: 'Altec / Versalift / TerexUtilities certified lab', notes: 'Required by ANSI A92.2 for insulated aerial devices. ~$1500-2500. Schedule mid-winter when crew demand is low.' },
        { id: 'cmp-bt-2', label: 'Annual ANSI A92.2 Inspection',    intervalDays: 365, lastDone: '', criticality: 'critical', vendor: 'Qualified inspector',                                notes: 'Boom integrity, hydraulic system, controls, leveling. Often bundled with dielectric.' },
        { id: 'cmp-bt-3', label: 'NY HD Safety Inspection',         intervalDays: 365, lastDone: '2026-01-31', criticality: 'critical', vendor: 'NY HD-certified inspection station',         notes: 'Cert# 0073700024 · expires 01-2027 · last reading 80367 mi. Required annually for HD commercial vehicles.' },
        { id: 'cmp-bt-4', label: 'Vehicle Registration Renewal',    intervalDays: 365, lastDone: '2025-11-30', criticality: 'critical', vendor: 'NY DMV',                                     notes: 'Reg# 747508ES · expires 11/30/2026.' },
        { id: 'cmp-bt-5', label: 'DOT Annual Inspection (FHWA)',    intervalDays: 365, lastDone: '', criticality: 'critical', vendor: 'NY DOT-certified shop',                              notes: 'Required for commercial vehicles ≥10,001 lbs GVWR.' },
        { id: 'cmp-bt-6', label: '250-hour Service',                intervalDays: 90,  lastDone: '', criticality: 'normal',   vendor: 'Self / Stephenson',                                  notes: 'Hyd fluid + filter, slewing ring lube, boom pivot grease.' }
      ];
      EquipmentPage._saveCompliance(id, seed1);
      return seed1;
    }
    // Pre-seed F-550 chip truck (eq2) — May 2 2026 stickers:
    // Inspection cert 0073700416, exp 07-2026, mileage 76300. Reg 487181ES exp 10/31/2026.
    if (id === 'eq2') {
      var seed2 = [
        { id: 'cmp-cs-1', label: 'NY HD Safety Inspection',         intervalDays: 365, lastDone: '2025-07-31', criticality: 'critical', vendor: 'NY HD-certified inspection station',         notes: 'Cert# 0073700416 · expires 07-2026 · last reading 76300 mi. Schedule before July.' },
        { id: 'cmp-cs-2', label: 'Vehicle Registration Renewal',    intervalDays: 365, lastDone: '2025-10-31', criticality: 'critical', vendor: 'NY DMV',                                     notes: 'Reg# 487181ES · expires 10/31/2026.' },
        { id: 'cmp-cs-3', label: 'DOT Annual Inspection (FHWA)',    intervalDays: 365, lastDone: '', criticality: 'critical', vendor: 'NY DOT-certified shop',                              notes: 'Required for commercial vehicles ≥10,001 lbs GVWR.' },
        { id: 'cmp-cs-4', label: 'Oil Change',                      intervalDays: 180, lastDone: '', criticality: 'normal',   vendor: 'Self / shop',                                          notes: 'Diesel — every ~5000 mi or 6 months.' }
      ];
      EquipmentPage._saveCompliance(id, seed2);
      return seed2;
    }
    // Pre-seed Ram 2500 (eq3) — May 2 2026 stickers:
    // Diesel inspection cert 1120400112, exp 06-2026, mileage 60561. Reg JK554987 exp 06/30/2027.
    if (id === 'eq3') {
      var seed3 = [
        { id: 'cmp-rm-1', label: 'NY Safety + Diesel Emissions',    intervalDays: 365, lastDone: '2025-06-30', criticality: 'critical', vendor: 'NY-certified diesel inspection station',     notes: 'Cert# 1120400112 · expires 06-2026 · last reading 60561 mi. Diesel-specific — needs OBD-II + emissions check.' },
        { id: 'cmp-rm-2', label: 'Vehicle Registration Renewal',    intervalDays: 730, lastDone: '2025-06-30', criticality: 'critical', vendor: 'NY DMV',                                     notes: 'Reg# JK554987 · expires 06/30/2027 · NY passenger 2-year cycle (PAS class).' },
        { id: 'cmp-rm-3', label: 'Oil Change',                      intervalDays: 180, lastDone: '', criticality: 'normal',   vendor: 'Self / shop',                                          notes: 'Cummins 6.7L diesel — every ~10000 mi or 6 months.' }
      ];
      EquipmentPage._saveCompliance(id, seed3);
      return seed3;
    }
    // Pre-seed climbing gear (eq7) with ANSI Z133 inspection cycle.
    if (id === 'eq7') {
      var seed7 = [
        { id: 'cmp-cg-1', label: 'Annual Z133 Inspection',       intervalDays: 365, lastDone: '', criticality: 'critical', vendor: 'Competent person / mfr',  notes: 'ANSI Z133 requires annual documented inspection of all climbing PPE. Sherrilltree offers send-in service.' },
        { id: 'cmp-cg-2', label: 'Monthly Visual Check',         intervalDays: 30,  lastDone: '', criticality: 'normal',   vendor: 'Self',                   notes: 'Look at rope sheath, harness webbing, hardware action. Bag failed items immediately.' },
        { id: 'cmp-cg-3', label: 'Helmet 5-year Replacement',    intervalDays: 1825, lastDone: '', criticality: 'critical', vendor: 'Petzl / Kask / Pfanner', notes: 'Tree-rated helmets retire 5 yrs from mfg date regardless of condition.' },
        { id: 'cmp-cg-4', label: 'Rope Retirement Review',       intervalDays: 365, lastDone: '', criticality: 'critical', vendor: 'Self',                   notes: 'Check cumulative use hours, sheath wear, sun damage. 10 yrs max from mfg even with light use.' }
      ];
      EquipmentPage._saveCompliance(id, seed7);
      return seed7;
    }
    return [];
  },

  _saveCompliance: function(id, items) {
    localStorage.setItem('bm-equipment-compliance-' + id, JSON.stringify(items));
  },

  // Returns { color, label, daysUntilDue } based on lastDone + intervalDays.
  // Red = overdue, yellow = due within 30 days, green = comfortable.
  _complianceStatus: function(item) {
    if (!item.lastDone) return { color: '#dc3545', label: 'NEVER LOGGED',     days: -9999 };
    var last = new Date(item.lastDone).getTime();
    var dueAt = last + (item.intervalDays * 86400 * 1000);
    var daysUntil = Math.floor((dueAt - Date.now()) / 86400000);
    if (daysUntil < 0)  return { color: '#dc3545', label: 'OVERDUE ' + Math.abs(daysUntil) + 'd',                   days: daysUntil };
    if (daysUntil < 30) return { color: '#e65100', label: 'DUE IN ' + daysUntil + 'd',                              days: daysUntil };
    if (daysUntil < 90) return { color: '#e6a817', label: 'DUE ' + Math.round(daysUntil/30) + 'mo',                 days: daysUntil };
    return { color: '#2e7d32', label: 'OK · ' + Math.round(daysUntil/30) + 'mo',                                    days: daysUntil };
  },

  _renderCompliance: function(id) {
    var items = EquipmentPage._getCompliance(id);
    if (!items.length) return '';
    var html = '<div style="margin-top:12px;background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:12px;">'
      + '<div style="font-size:12px;font-weight:700;color:#7e2d10;margin-bottom:8px;">⚠️ Compliance &amp; Required Inspections</div>';

    items.forEach(function(item) {
      var st = EquipmentPage._complianceStatus(item);
      var critBadge = item.criticality === 'critical'
        ? '<span style="background:#dc3545;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;">REQUIRED</span>' : '';
      html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #ffcc80;font-size:12px;">'
        +   '<div style="flex:1;min-width:0;">'
        +     '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
        +       '<strong>' + UI.esc(item.label) + '</strong> ' + critBadge
        +       '<span style="background:' + st.color + ';color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;">' + st.label + '</span>'
        +     '</div>'
        +     (item.lastDone ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Last: ' + UI.dateShort(item.lastDone) + ' · every ' + item.intervalDays + 'd · ' + UI.esc(item.vendor || '') + '</div>'
                              : '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Every ' + item.intervalDays + 'd · ' + UI.esc(item.vendor || '') + '</div>')
        +     (item.notes ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;font-style:italic;">' + UI.esc(item.notes) + '</div>' : '')
        +   '</div>'
        +   '<button onclick="EquipmentPage._logCompliance(\'' + id + '\',\'' + item.id + '\')" style="background:var(--green-dark);color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 10px;border-radius:5px;cursor:pointer;flex-shrink:0;">Mark Done</button>'
        + '</div>';
    });

    html += '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Tap "Mark Done" when you complete each — sets last-done to today, recalculates next due.</div>'
      + '</div>';
    return html;
  },

  _logCompliance: function(id, itemId) {
    var items = EquipmentPage._getCompliance(id);
    var idx = items.findIndex(function(i) { return i.id === itemId; });
    if (idx < 0) return;
    items[idx].lastDone = new Date().toISOString();
    EquipmentPage._saveCompliance(id, items);
    UI.toast('✅ ' + items[idx].label + ' logged for today');
    EquipmentPage.showDetail(id);
  },

  // Render a Stihl-style wear-parts box. Stihl OEM #s deep-link to Bailey's
  // search (most reliable third-party Stihl-OEM retailer); NGK plugs deep-link
  // to Amazon since Bailey's stocking is spotty. Same visual pattern as the
  // Giant 254T cooling-kit and Bandit 254 chipper-knife boxes for consistency.
  _renderStihlPartsCard: function(title, parts) {
    var box = '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;">'
      + '<div style="font-size:12px;font-weight:700;color:#8a6d00;margin-bottom:8px;">🪚 ' + title + '</div>';

    parts.forEach(function(p) {
      var bUrl = 'https://www.baileysonline.com/search?searchTerm=' + encodeURIComponent(p.pn);
      var sUrl = 'https://www.sherrilltree.com/search?q=' + encodeURIComponent(p.pn);
      box += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #ffe082;font-size:12px;">'
        +   '<div style="flex:1;min-width:0;"><strong>' + p.name + '</strong>'
        +     '<div style="font-family:ui-monospace,monospace;font-size:11px;color:#8a6d00;">' + p.pn + ' · <span style="font-family:inherit;color:var(--text-light);">' + p.desc + '</span></div></div>'
        +   '<a href="' + bUrl + '" target="_blank" rel="noopener" style="background:#e65100;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Bailey\'s</a>'
        +   '<a href="' + sUrl + '" target="_blank" rel="noopener" style="background:#1565c0;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Sherrill</a>'
        + '</div>';
    });

    var bUrls = parts.map(function(p) { return 'https://www.baileysonline.com/search?searchTerm=' + encodeURIComponent(p.pn); });
    box += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
      +   '<button onclick="EquipmentPage._openAll(' + JSON.stringify(bUrls).replace(/"/g, '&quot;') + ')" style="background:#e65100;color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">🛒 Open All at Bailey\'s</button>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Bailey\'s ships Stihl OEM nationwide · or call your local Stihl dealer</div>'
      + '</div>';
    return box;
  },

  // Pop a list of URLs in new tabs, staggered ~150ms so popup-blockers don't
  // collapse them into one. Used by the "Order all 4" parts buttons.
  _openAll: function(urls) {
    if (!urls || !urls.length) return;
    urls.forEach(function(u, i) {
      setTimeout(function() { window.open(u, '_blank', 'noopener'); }, i * 150);
    });
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('Opening ' + urls.length + ' tabs…');
  },

  _renderDocs: function(id) {
    var docs = EquipmentPage._getDocs(id);
    var typeIcon  = { manual: '📕', parts: '🔧', diagram: '📐', cert: '📋', other: '📄' };
    var typeColor = { manual: '#1565c0', parts: '#e65100', diagram: '#6a1b9a', cert: '#2e7d32', other: '#555' };

    var html = '<div style="margin-top:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:10px;">'
      + '<h4 style="font-size:14px;font-weight:700;">📚 Manuals & Documents</h4>'
      + '<button onclick="EquipmentPage.addDoc(\'' + id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">+ Add</button>'
      + '</div>';

    if (docs.length === 0) {
      html += '<div style="font-size:13px;color:var(--text-light);padding:8px 0;">No documents saved yet.</div>';
    } else {
      html += '<div style="display:grid;gap:6px;">';
      docs.forEach(function(doc) {
        var icon  = typeIcon[doc.type]  || '📄';
        var color = typeColor[doc.type] || '#555';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8f9fa;border-radius:8px;border:1px solid #e8eaed;">'
          + '<span style="font-size:20px;flex-shrink:0;">' + icon + '</span>'
          + '<div style="flex:1;min-width:0;">'
          + '<a href="' + doc.url + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:var(--green-dark);text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(doc.name) + '</a>'
          + (doc.note ? '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(doc.note) + '</div>' : '')
          + '</div>'
          + '<span style="font-size:10px;font-weight:700;color:' + color + ';background:' + color + '18;padding:2px 7px;border-radius:10px;text-transform:uppercase;flex-shrink:0;">' + UI.esc(doc.type || 'doc') + '</span>'
          + '</div>';
      });
      html += '</div>';
    }

    // OEM part number quick-reference for the Giant 254T Loader / Kubota D902-E4B.
    // Each row deep-links to the Messick's product page so Add-to-Cart is one tap.
    // R&L still uses search since their slugs aren't predictable.
    // v811: PNs cross-checked May 11 2026 against the official Kubota
    // D902-E4B-PBS-1 Illustrated Parts List PDF (in this equipment's docs as
    // doc-g5) — section 050000 WATER FLANGE AND THERMOSTAT, page 29:
    //   • REF 100 ASSY THERMOSTAT     = 19434-7301-4 (= 19434-73014)
    //     19434-73015 is the current supersession Messick's ships.
    //   • REF 120 GASKET, THERMOSTAT  = 16221-7327-0 (= 16221-73270)
    //   • REF 030 SWITCH,ASSY (THERMO)= 19498-8304-0 (= 19498-83040)
    //     16222-83040 is the documented cross-reference — interchange part.
    // Note: Kubota labels it a "SWITCH" not a "SENSOR" — single-wire overheat
    // threshold device for the warning light. If the Giant has an analog
    // gauge with a needle, that's a SECOND Giant-installed sender (not in
    // Kubota's IPL — call dealer with engine + machine serials).
    if (id === 'eq4b') {
      var parts = [
        { name: 'Water Pump',           pn: '1E051-73036' },
        { name: 'W/P Gasket',           pn: '16871-73430' },
        { name: 'Thermostat',           pn: '19434-73015' },
        { name: 'T-stat Gasket',        pn: '16221-73270' },
        // v644: added after May 6 2026 conversation — repeated overheats may
        // have fried the coolant temp sender; gauge reads low → easy to
        // re-cook the engine. ~$25-40, 5-min swap.
        // v811: PN updated 16222-83040 → 19498-83040 to match the official
        // D902-E4B IPL (16222-83040 is a valid cross-reference / interchange).
        { name: 'Coolant Temp Switch',  pn: '19498-83040' }
      ];
      html += '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;">'
        + '<div style="font-size:12px;font-weight:700;color:#8a6d00;margin-bottom:8px;">🔩 Giant 254T · Kubota D902-E4B Cooling Kit · OEM Part Numbers</div>';

      // Per-part rows with direct Messick's product URL (verified Apr 30 — all 4
      // parts live at /parts/kubota/{PN} with Add-to-Cart on the page itself).
      // R&L still uses search since their product slugs aren't predictable.
      parts.forEach(function(p) {
        var msUrl = 'https://www.messicks.com/parts/kubota/' + encodeURIComponent(p.pn);
        var rlUrl = 'https://rlpartssupply.com/?s=' + encodeURIComponent(p.pn) + '&post_type=product';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #ffe082;font-size:12px;">'
          +   '<div style="flex:1;min-width:0;"><strong>' + p.name + '</strong>'
          +     '<div style="font-family:ui-monospace,monospace;font-size:11px;color:#8a6d00;">' + p.pn + '</div></div>'
          +   '<a href="' + msUrl + '" target="_blank" rel="noopener" style="background:#1565c0;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Messick\'s</a>'
          +   '<a href="' + rlUrl + '" target="_blank" rel="noopener" style="background:#e65100;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">R&amp;L</a>'
          + '</div>';
      });

      // "Open all 4" — pops 4 tabs in one click for Messick's, then 4 for R&L
      var msUrls = parts.map(function(p) { return 'https://www.messicks.com/parts/kubota/' + encodeURIComponent(p.pn); });
      var rlUrls = parts.map(function(p) { return 'https://rlpartssupply.com/?s=' + encodeURIComponent(p.pn) + '&post_type=product'; });
      html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
        +   '<button onclick="EquipmentPage._openAll(' + JSON.stringify(msUrls).replace(/"/g, '&quot;') + ')" style="background:#1565c0;color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">🛒 Order All 5 · Messick\'s</button>'
        +   '<button onclick="EquipmentPage._openAll(' + JSON.stringify(rlUrls).replace(/"/g, '&quot;') + ')" style="background:#e65100;color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">🛒 Order All 5 · R&amp;L</button>'
        +   '<button onclick="EquipmentPage._logCoolingKit(\'eq4b\',\'R&amp;L Parts Supply\')" style="background:var(--green-dark);color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">📝 Log This Order (R&amp;L)</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Both sell Kubota OEM by part # · Dan Wojick @ Belfast Inc. (844) 344-3478</div>'
        + '</div>';

      // v644: Cooling system field-notes card — gathered May 6 2026 from the
      // overheating troubleshoot conversation. Lives next to the parts card
      // so anyone wrenching on the loader gets the reminders without
      // re-Googling.
      html += '<div style="margin-top:12px;background:#eef5ff;border:1px solid #b6d4fe;border-radius:8px;padding:12px;">'
        +   '<div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">🩺 Cooling system · field notes</div>'
        +   '<div style="font-size:12px;color:#1f2937;line-height:1.55;">'
        +     '<div style="font-weight:700;margin-bottom:4px;">Thermostat install (PN 19434-73015)</div>'
        +     '<ul style="margin:0 0 10px;padding-left:20px;">'
        +       '<li>Spring side faces <em>down</em> (toward the cylinder head / coolant)</li>'
        +       '<li>Sensing pellet + valve face the union outlet (axis in line with outlet)</li>'
        +       '<li>Jiggle valve / vent hole at <strong>12 o\'clock</strong> so air bleeds out as it fills</li>'
        +       '<li>New gasket every install (PN 16221-73270) — never re-use</li>'
        +       '<li>Bolts in cross/star pattern: snug, then torque to WSM spec (see Service Manual ▸ Cooling)</li>'
        +     '</ul>'
        +     '<div style="font-weight:700;margin-bottom:4px;">Coolant temp switch (PN 19498-83040 · cross-ref 16222-83040)</div>'
        +     '<div style="margin:0 0 6px;">Kubota labels this a SWITCH not a sender — single-wire overheat threshold on the water flange. Trips the dash warning light when coolant exceeds set temp. Repeated overheats can also kill it.</div>'
        +     '<ul style="margin:0 0 10px;padding-left:20px;">'
        +       '<li><strong>1 wire to it</strong> = it\'s this switch (PN above)</li>'
        +       '<li><strong>2 wires to it</strong> = analog sender installed by Giant downstream of Kubota — NOT in Kubota IPL. Call Tobroco-Giant with engine + machine serials</li>'
        +       '<li><strong>Quick test (multimeter):</strong> cold engine ≈ open circuit · at op-temp threshold ≈ closes</li>'
        +       '<li>~$25–40, 5-min job · ordered with the cooling kit above</li>'
        +     '</ul>'
        +     '<div style="font-size:11px;color:#1e40af;font-style:italic;">Source: Kubota D902-E4B-PBS-1 IPL (97898-80830, Mar 2013) — section 050000 · page 29 · in this equipment\'s docs as <code>doc-g5</code>.</div>'
        +   '</div>'
        + '</div>';
    }

    // ── Eastonmade 22-28 wear parts card (eq11) ──
    // The 22-28 ships with a Honda GX390 13hp standard. Common consumables:
    // hydraulic filter, hydraulic fluid (AW-46), conveyor belt + drive chain,
    // engine wear parts (plug, air filter, oil filter). Eastonmade's parts
    // line goes through dealers; Honda engine parts via Honda dealers / NAPA.
    if (id === 'eq11') {
      var partsEM = [
        { name: 'Hydraulic Filter (10-mic)',  pn: 'Donaldson P164164', desc: 'spin-on · most 22-28 builds' },
        { name: 'Hydraulic Fluid AW-46',      pn: 'AW-46 ISO',          desc: '5 gal pail · 22-28 takes ~10 gal total' },
        { name: 'Honda GX390 Air Filter',     pn: '17210-ZE3-505',      desc: 'engine: standard pleated paper element' },
        { name: 'Honda GX390 Spark Plug',     pn: 'BPR6ES (NGK)',       desc: 'gap 0.028"-0.031"' },
        { name: 'Honda GX390 Oil Filter',     pn: '15400-PLM-A02',      desc: 'cartridge style' },
        { name: 'Conveyor V-Belt',            pn: 'A-section · 4L-series', desc: 'measure run before ordering — model-dependent' },
        { name: 'Conveyor Drive Chain',       pn: '#50 roller chain',   desc: 'cut to length per Eastonmade spec' }
      ];

      html += '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;">'
        + '<div style="font-size:12px;font-weight:700;color:#8a6d00;margin-bottom:8px;">🪓 Eastonmade 22-28 + Honda GX390 · Wear Parts</div>';

      partsEM.forEach(function(p) {
        var aUrl = 'https://www.amazon.com/s?k=' + encodeURIComponent(p.pn);
        var nUrl = 'https://www.napaonline.com/en/search?q=' + encodeURIComponent(p.pn);
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #ffe082;font-size:12px;">'
          +   '<div style="flex:1;min-width:0;"><strong>' + p.name + '</strong>'
          +     '<div style="font-family:ui-monospace,monospace;font-size:11px;color:#8a6d00;">' + p.pn + ' · <span style="font-family:inherit;color:var(--text-light);">' + p.desc + '</span></div></div>'
          +   '<a href="' + aUrl + '" target="_blank" rel="noopener" style="background:#ff9900;color:#000;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Amazon</a>'
          +   '<a href="' + nUrl + '" target="_blank" rel="noopener" style="background:#c62828;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">NAPA</a>'
          + '</div>';
      });

      html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
        +   '<a href="tel:+19316705557" style="background:#7e2d10;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">📞 Call Eastonmade</a>'
        +   '<a href="https://eastonmadewoodsplitters.com/dealer-locator/" target="_blank" rel="noopener" style="background:#0d47a1;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">Find Dealer</a>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Eastonmade · (931) 670-5557 · TN-based · ships nationwide via dealer network</div>'
        + '</div>';
    }

    // ── Cub Cadet 54" deck spindle parts card (eq12, May 6 2026) ──
    // Spindle PN 618-04608A pulled off the deck label. Cross-references:
    //   918-04608A · 618-0671 · 618-0671B · 618-0671D · 918-0671 · 918-0671B
    // Fits 54" decks: RZT-54, GT1054, GT1554, ZT54, ZTL8000, Troy-Bilt Big Red.
    // The internal cartridge bearing (if you swap just the bearing) is
    // a standard sealed 6203-2RS. Whole spindle is the smart move — housing
    // wears, threads strip, second bearing is on borrowed time anyway.
    if (id === 'eq12') {
      html += '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;">'
        + '<div style="font-size:12px;font-weight:700;color:#8a6d00;margin-bottom:8px;">🔩 Cub Cadet 54" Deck · Spindle &amp; Bearing Parts</div>';

      var cubParts = [
        { name: 'Spindle Assembly (whole)', pn: '618-04608A',
          desc: 'OEM Cub Cadet/MTD · cross: 918-04608A · 618-0671B · fits all 54" decks',
          aUrl: 'https://www.amazon.com/Henkeyi-Assembly-618-04608A-918-04608A-918-0671B/dp/B09N8R6R8F',
          mUrl: 'https://www.mowmore.com/products/spindle-assembly-for-mtd-and-cub-cadet-618-04608a-918-0671-91804608a-so12612' },
        { name: 'Bearing only (sealed)', pn: '6203-2RS',
          desc: '17 × 40 × 12mm · standard cartridge · 2 per spindle (top + bottom)',
          aUrl: 'https://www.amazon.com/s?k=6203-2RS+bearing',
          mUrl: 'https://www.grainger.com/search?searchQuery=6203-2RS' }
      ];

      cubParts.forEach(function(p) {
        html += '<div style="padding:8px 0;border-bottom:1px solid #ffe082;font-size:12px;">'
          +   '<div style="display:flex;align-items:center;gap:8px;">'
          +     '<div style="flex:1;min-width:0;"><strong>' + p.name + '</strong>'
          +       '<div style="font-family:ui-monospace,monospace;font-size:11px;color:#8a6d00;">' + p.pn + '</div></div>'
          +     '<a href="' + p.aUrl + '" target="_blank" rel="noopener" style="background:#232f3e;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Amazon</a>'
          +     '<a href="' + p.mUrl + '" target="_blank" rel="noopener" style="background:#1565c0;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Alt</a>'
          +   '</div>'
          +   '<div style="font-size:11px;color:#8a6d00;margin-top:4px;">' + p.desc + '</div>'
          + '</div>';
      });

      html += '<div style="font-size:11px;color:var(--text-light);margin-top:6px;line-height:1.5;">'
        +   '💡 <strong>3 spindles per deck</strong> — while the deck is off, eyeball the other two. '
        +   'Combo 3-pack on Amazon ~$110 saves a second teardown in 6 months.'
        + '</div>'
        + '</div>';

      // Field-notes card — quick reminders for the next time the deck is open
      html += '<div style="margin-top:12px;background:#eef5ff;border:1px solid #b6d4fe;border-radius:8px;padding:12px;">'
        +   '<div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">🩺 54" Deck · field notes</div>'
        +   '<div style="font-size:12px;color:#1f2937;line-height:1.55;">'
        +     '<ul style="margin:0;padding-left:20px;">'
        +       '<li>3 spindles total · all use PN 618-04608A · all interchangeable</li>'
        +       '<li>Spindle nut torque per MTD spec (typically 60-80 ft-lb) — check with manual</li>'
        +       '<li>Replace deck belt at the same time if it\'s glazed or cracked</li>'
        +       '<li>Symptom of bad spindle: deck vibration, rumble at idle, side play in pulley by hand</li>'
        +       '<li>Pull blade first → impact wrench on the spindle nut → remove pulley → 3 housing bolts under deck</li>'
        +     '</ul>'
        +   '</div>'
        + '</div>';
    }

    // ── Bandit 200XP chipper knife OEM box (eq4) ──
    // Bandit's 150/200/250/254 XP family all share the same knife — Modern
    // Group lists 900-9901-18 as fitting the 200XP. Bedknife is universal.
    if (id === 'eq4') {
      html += '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;">'
        + '<div style="font-size:12px;font-weight:700;color:#8a6d00;margin-bottom:8px;">🔪 Bandit 200XP · Chipper Knives · OEM Part Numbers</div>';

      var knifeParts200 = [
        { name: 'Knife (single)',           pn: '900-9901-18', desc: '7-1/4" x 4-1/2" x 1/2" · fits 150/200/250/254 XP' },
        { name: 'Knife Set (4 + hardware)', pn: '900-9900-02', desc: 'Gen 1 alt set · 7-1/4" x 4" x 3/8"' },
        { name: 'Bedknife',                 pn: '900-9902-00', desc: 'Simonds 7.2" x 4" x 1/2" · all gens' }
      ];

      knifeParts200.forEach(function(p) {
        var sUrl = 'https://www.sherrilltree.com/search?q=' + encodeURIComponent(p.pn);
        var bUrl = 'https://www.baileysonline.com/search?searchTerm=' + encodeURIComponent(p.pn);
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #ffe082;font-size:12px;">'
          +   '<div style="flex:1;min-width:0;"><strong>' + p.name + '</strong>'
          +     '<div style="font-family:ui-monospace,monospace;font-size:11px;color:#8a6d00;">' + p.pn + ' · <span style="font-family:inherit;color:var(--text-light);">' + p.desc + '</span></div></div>'
          +   '<a href="' + sUrl + '" target="_blank" rel="noopener" style="background:#1565c0;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Sherrill</a>'
          +   '<a href="' + bUrl + '" target="_blank" rel="noopener" style="background:#e65100;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Bailey\'s</a>'
          + '</div>';
      });

      html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        +   '<a href="tel:+18002523949" style="background:#7e2d10;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">📞 Call Stephenson</a>'
        +   '<button onclick="EquipmentPage._logChipperKnives(\'eq4\',\'Stephenson Equipment\')" style="background:var(--green-dark);color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">📝 Log Knife Order</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Stephenson is the Bandit dealer · 1-800-252-3949</div>'
        + '</div>';
    }

    // ── Truck VIN-based Parts Lookup card (eq1, eq2, eq3 — any Trucks-category) ──
    // Generic launcher: takes the truck's VIN/serial and pops up retailer
    // shortcuts. RockAuto + NAPA accept VIN in their search; FleetPride is
    // for the heavy-duty F-750. Doug picks whichever vendor has the part.
    var eqRow = EquipmentPage.getAll().find(function(e) { return e.id === id; });
    if (eqRow && eqRow.category === 'Trucks' && eqRow.serial && eqRow.serial.length >= 11) {
      var vin = eqRow.serial;
      // RockAuto's URL pattern: yymmnewline-style; their landing page accepts
      // the VIN as a query string but the catalog UI auto-disambiguates.
      var raUrl = 'https://www.rockauto.com/en/catalog?vin=' + encodeURIComponent(vin);
      var napaUrl = 'https://www.napaonline.com/en/search?searchType=vin&query=' + encodeURIComponent(vin);
      var oreillyUrl = 'https://www.oreillyauto.com/search?q=' + encodeURIComponent(vin);
      var fleetUrl = 'https://www.fleetpride.com/search?q=' + encodeURIComponent(vin);

      html += '<div style="margin-top:12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:12px;">'
        + '<div style="font-size:12px;font-weight:700;color:#0d47a1;margin-bottom:8px;">🛻 Quick Parts Lookup by VIN</div>'
        + '<div style="font-size:12px;font-family:ui-monospace,monospace;color:#0d47a1;margin-bottom:10px;background:#fff;padding:6px 10px;border-radius:6px;border:1px solid #90caf9;">VIN: ' + UI.esc(vin) + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
        +   '<a href="' + raUrl + '" target="_blank" rel="noopener" style="background:#0d47a1;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">RockAuto</a>'
        +   '<a href="' + napaUrl + '" target="_blank" rel="noopener" style="background:#c62828;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">NAPA</a>'
        +   '<a href="' + oreillyUrl + '" target="_blank" rel="noopener" style="background:#388e3c;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">O\'Reilly</a>';
      // FleetPride only for HD trucks (F-750, F-550 chassis cab)
      if (/F[-]?750|F[-]?550|F[-]?650|F[-]?450/i.test(eqRow.name + ' ' + eqRow.model)) {
        html += '<a href="' + fleetUrl + '" target="_blank" rel="noopener" style="background:#5d4037;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">FleetPride (HD)</a>';
      }
      html += '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">VIN auto-fills the search · click your usual vendor first</div>'
        + '</div>';
    }

    // ── Stihl MS 462 wear-parts card (eq8) ──
    // Standard high-frequency consumables for the climber's saw. Chain
    // depends on bar length; we show all 3 common options (25"/28"/32")
    // and let Doug click whichever matches his bar. Plug + air filter +
    // fuel filter are universal across bar configs.
    if (id === 'eq8') {
      var partsMS462 = [
        { name: 'Spark Plug',           pn: 'NGK BPMR7A',        desc: 'cross: Bosch WSR6F · Stihl 0000-400-7000' },
        { name: 'Air Filter HD2',       pn: '1142-120-1604',     desc: 'pleated, replaces foam 1142-120-1600' },
        { name: 'Fuel Filter',          pn: '0000-350-3504',     desc: 'inline + tank pickup, fits all Stihl' },
        { name: '7T 3/8" Rim Sprocket', pn: '1142-642-1252',     desc: 'split-rim, change w/ every 2-3 chains' },
        { name: 'Chain · 25" / 84DL',   pn: '33 RS3 84',         desc: '3/8" pitch · .063 gauge · OEM 3614-005-0084' },
        { name: 'Chain · 28" / 92DL',   pn: '33 RS3 92',         desc: '3/8" pitch · .063 gauge' },
        { name: 'Bar · 25" Rollomatic', pn: '3003-008-6817',     desc: 'Light bar · 3/8" .063 std mount' }
      ];
      html += EquipmentPage._renderStihlPartsCard('Stihl MS 462 — Wear Parts', partsMS462);
    }

    // ── Stihl MS 261 wear-parts card (eq9) ──
    // The lighter limbing/midsized saw. Same plug + fuel filter as MS 462.
    // Air filter is a different HD2 part. Chains in 18"/20" bar configs.
    if (id === 'eq9') {
      var partsMS261 = [
        { name: 'Spark Plug',           pn: 'NGK BPMR7A',        desc: 'cross: Bosch WSR6F · Stihl 0000-400-7000' },
        { name: 'Air Filter HD2',       pn: '1141-120-1610',     desc: 'pleated, fits MS 261 / 271 / 291' },
        { name: 'Fuel Filter',          pn: '0000-350-3504',     desc: 'same as MS 462' },
        { name: '7T 3/8" Rim Sprocket', pn: '1141-640-2002',     desc: 'split-rim · for 3/8" P chain' },
        { name: 'Chain · 18" / 66DL',   pn: '63 PS3 66',         desc: '3/8" P pitch · .050 gauge' },
        { name: 'Chain · 20" / 72DL',   pn: '63 PS3 72',         desc: '3/8" P pitch · .050 gauge' },
        { name: 'Bar · 18" Rollomatic', pn: '3005-000-4717',     desc: 'Light bar · 3/8" P .050 std mount' }
      ];
      html += EquipmentPage._renderStihlPartsCard('Stihl MS 261 — Wear Parts', partsMS261);
    }

    // Bandit 254 Chipper (eq4c) — chipper knife OEM box.
    // The 254 has TWO knife generations depending on serial #:
    //   • Pre-SN1080 ("Gen 1"): 7-1/4" x 4" x 3/8", 4-knife set kit OEM 900-9900-02
    //   • SN1080+ ("254XP"):    7-1/4" x 4-1/2" x 1/2", single knife OEM 900-9901-18
    // Both shown here until Doug confirms his serial #. Bedknife OEM 900-9902-00
    // is the same across generations.
    if (id === 'eq4c') {
      html += '<div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;">'
        + '<div style="font-size:12px;font-weight:700;color:#8a6d00;margin-bottom:8px;">🔪 Bandit 254 · Chipper Knives · OEM Part Numbers</div>'
        + '<div style="font-size:11px;color:#8a6d00;margin-bottom:8px;font-style:italic;">Two generations — check serial # plate. Pre-SN1080 = Gen 1, SN1080+ = XP.</div>';

      var knifeParts = [
        { name: 'Knife Kit (Gen 1, pre-SN1080)', pn: '900-9900-02', desc: '4 blades + hardware · 7-1/4" x 4" x 3/8"' },
        { name: 'Knife (SN1080+ / 254XP)',       pn: '900-9901-18', desc: 'single blade · 7-1/4" x 4-1/2" x 1/2"' },
        { name: 'Bedknife (both gens)',          pn: '900-9902-00', desc: 'Simonds 7.2" x 4" x 1/2"' }
      ];

      knifeParts.forEach(function(p) {
        // Sherrilltree carries Bandit OEMs by part #; eBay/Bailey's are alternates.
        // Stephenson is Bandit dealer — call/email for OEM at dealer pricing.
        var sUrl = 'https://www.sherrilltree.com/search?q=' + encodeURIComponent(p.pn);
        var bUrl = 'https://www.baileysonline.com/search?searchTerm=' + encodeURIComponent(p.pn);
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #ffe082;font-size:12px;">'
          +   '<div style="flex:1;min-width:0;"><strong>' + p.name + '</strong>'
          +     '<div style="font-family:ui-monospace,monospace;font-size:11px;color:#8a6d00;">' + p.pn + ' · <span style="font-family:inherit;color:var(--text-light);">' + p.desc + '</span></div></div>'
          +   '<a href="' + sUrl + '" target="_blank" rel="noopener" style="background:#1565c0;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Sherrill</a>'
          +   '<a href="' + bUrl + '" target="_blank" rel="noopener" style="background:#e65100;color:#fff;text-decoration:none;font-size:10px;font-weight:700;padding:4px 8px;border-radius:5px;flex-shrink:0;">Bailey\'s</a>'
          + '</div>';
      });

      html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        +   '<a href="tel:+18002523949" style="background:#7e2d10;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;">📞 Call Stephenson</a>'
        +   '<a href="https://www.stephensonequipment.com/parts/" target="_blank" rel="noopener" style="background:#7e2d10;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;">Stephenson Parts Page</a>'
        +   '<button onclick="EquipmentPage._logChipperKnives(\'eq4c\',\'Stephenson Equipment\')" style="background:var(--green-dark);color:#fff;border:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;">📝 Log Knife Order (Stephenson)</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Stephenson is the Bandit dealer · 1-800-252-3949 · best for OEM at dealer pricing</div>'
        + '</div>';
    }

    html += '</div>';
    return html;
  },

  addDoc: function(id) {
    var eq = EquipmentPage.getAll().find(function(e) { return e.id === id; });
    if (!eq) return;
    var html = '<div style="display:grid;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Document Name *</label>'
      + '<input type="text" id="doc-name" placeholder="e.g., Operator Manual" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">URL *</label>'
      + '<input type="url" id="doc-url" placeholder="https://drive.google.com/..." style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Type</label>'
      + '<select id="doc-type" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="manual">Manual</option><option value="parts">Parts List / Diagram</option>'
      + '<option value="diagram">Wiring / Schematic</option><option value="cert">Certificate</option><option value="other">Other</option>'
      + '</select></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Note (optional)</label>'
      + '<input type="text" id="doc-note" placeholder="e.g., From Dan @ Belfast Inc." style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '</div>';
    UI.showModal('Add Document — ' + eq.name, html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="EquipmentPage._saveDoc(\'' + id + '\')">Save</button>'
    });
  },

  _saveDoc: function(id) {
    var nameEl = document.getElementById('doc-name');
    var urlEl  = document.getElementById('doc-url');
    var name = nameEl ? nameEl.value.trim() : '';
    var url  = urlEl  ? urlEl.value.trim()  : '';
    if (!name || !url) { UI.toast('Name and URL are required'); return; }
    var docs = EquipmentPage._getDocs(id);
    docs.push({
      id: 'doc-' + Date.now().toString(36),
      name: name,
      type: (document.getElementById('doc-type') || {}).value || 'other',
      url:  url,
      note: ((document.getElementById('doc-note') || {}).value || '').trim(),
      addedAt: new Date().toISOString().split('T')[0]
    });
    EquipmentPage._saveDocs(id, docs);
    UI.closeModal();
    UI.toast('Document saved');
    EquipmentPage.showDetail(id);
  }
};
