/**
 * Branch Manager — Materials & Supplies Tracker
 * Track materials inventory, per-job usage, and costs
 * Something legacy system does NOT have — exact cost tracking for profitability
 */
var Materials = {

  // ─── Default Catalog ───────────────────────────────────────
  _defaults: [
    { id: 'mat1',  name: 'Climbing Rope (150ft)',    category: 'Rigging',      unitCost: 280,  unit: 'each',   currentStock: 3, reorderPoint: 1 },
    { id: 'mat2',  name: 'Rigging Rope (200ft)',     category: 'Rigging',      unitCost: 190,  unit: 'each',   currentStock: 2, reorderPoint: 1 },
    { id: 'mat3',  name: 'Bull Rope (150ft)',         category: 'Rigging',      unitCost: 150,  unit: 'each',   currentStock: 2, reorderPoint: 1 },
    { id: 'mat4',  name: 'Chainsaw Chain 16"',       category: 'Cutting',      unitCost: 22,   unit: 'each',   currentStock: 6, reorderPoint: 3 },
    { id: 'mat5',  name: 'Chainsaw Chain 18"',       category: 'Cutting',      unitCost: 25,   unit: 'each',   currentStock: 6, reorderPoint: 3 },
    { id: 'mat6',  name: 'Chainsaw Chain 20"',       category: 'Cutting',      unitCost: 28,   unit: 'each',   currentStock: 4, reorderPoint: 2 },
    { id: 'mat7',  name: 'Chainsaw Chain 24"',       category: 'Cutting',      unitCost: 34,   unit: 'each',   currentStock: 3, reorderPoint: 2 },
    { id: 'mat8',  name: 'Bar & Chain Oil',           category: 'Fuel',         unitCost: 18,   unit: 'gallon', currentStock: 8, reorderPoint: 4 },
    { id: 'mat9',  name: '2-Stroke Mix Oil',          category: 'Fuel',         unitCost: 8,    unit: 'bottle', currentStock: 12, reorderPoint: 6 },
    { id: 'mat10', name: 'Gas / Fuel',                category: 'Fuel',         unitCost: 4.50, unit: 'gallon', currentStock: 20, reorderPoint: 10 },
    { id: 'mat11', name: 'Felling Wedges',            category: 'Cutting',      unitCost: 14,   unit: 'each',   currentStock: 6, reorderPoint: 3 },
    { id: 'mat12', name: 'Carabiners (steel)',         category: 'Hardware',     unitCost: 32,   unit: 'each',   currentStock: 8, reorderPoint: 4 },
    { id: 'mat13', name: 'Slings / Straps',           category: 'Rigging',      unitCost: 45,   unit: 'each',   currentStock: 4, reorderPoint: 2 },
    { id: 'mat14', name: 'Hard Hat w/ Face Shield',   category: 'Safety',       unitCost: 55,   unit: 'each',   currentStock: 4, reorderPoint: 2 },
    { id: 'mat15', name: 'Chainsaw Chaps',            category: 'Safety',       unitCost: 95,   unit: 'each',   currentStock: 3, reorderPoint: 1 },
    { id: 'mat16', name: 'Work Gloves',               category: 'Safety',       unitCost: 18,   unit: 'pair',   currentStock: 10, reorderPoint: 4 },
    { id: 'mat17', name: 'Safety Glasses',            category: 'Safety',       unitCost: 12,   unit: 'each',   currentStock: 8, reorderPoint: 4 },
    { id: 'mat18', name: 'Cabling Hardware Kit',      category: 'Hardware',     unitCost: 120,  unit: 'each',   currentStock: 2, reorderPoint: 1 },
    { id: 'mat19', name: 'Brace Rod (3/8")',          category: 'Hardware',     unitCost: 35,   unit: 'each',   currentStock: 4, reorderPoint: 2 },
    { id: 'mat20', name: 'Wound Sealant / Paint',     category: 'Consumables',  unitCost: 14,   unit: 'can',    currentStock: 4, reorderPoint: 2 },
    { id: 'mat21', name: 'Stump Grinder Teeth',       category: 'Cutting',      unitCost: 9,    unit: 'each',   currentStock: 16, reorderPoint: 8 },
    { id: 'mat22', name: 'Chipper Knives (set)',      category: 'Cutting',      unitCost: 85,   unit: 'set',    currentStock: 2, reorderPoint: 1 },
    { id: 'mat23', name: 'Throwline (180ft)',          category: 'Rigging',      unitCost: 40,   unit: 'each',   currentStock: 2, reorderPoint: 1 },
    { id: 'mat24', name: 'Throw Bag (14oz)',           category: 'Rigging',      unitCost: 22,   unit: 'each',   currentStock: 3, reorderPoint: 1 },
    { id: 'mat25', name: 'Ear Protection',            category: 'Safety',       unitCost: 28,   unit: 'each',   currentStock: 6, reorderPoint: 3 }
  ],

  // ─── Catalog CRUD ──────────────────────────────────────────
  _getCatalog: function() {
    var stored = localStorage.getItem('bm-materials-catalog');
    if (stored) {
      try { return JSON.parse(stored); } catch(e) { /* fall through */ }
    }
    localStorage.setItem('bm-materials-catalog', JSON.stringify(Materials._defaults));
    return JSON.parse(JSON.stringify(Materials._defaults));
  },

  _saveCatalog: function(items) {
    localStorage.setItem('bm-materials-catalog', JSON.stringify(items));
  },

  // ─── Usage CRUD ────────────────────────────────────────────
  _getUsage: function() {
    try { return JSON.parse(localStorage.getItem('bm-materials-usage')) || []; }
    catch(e) { return []; }
  },

  _saveUsage: function(records) {
    localStorage.setItem('bm-materials-usage', JSON.stringify(records));
  },

  // ─── Helpers ───────────────────────────────────────────────
  _genId: function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  _catIcon: function(cat) {
    var map = { Cutting: '🪚', Rigging: '🪢', Fuel: '⛽', Safety: '🦺', Hardware: '🔩', Consumables: '🧴' };
    return map[cat] || '📦';
  },

  _categories: ['Cutting', 'Rigging', 'Fuel', 'Safety', 'Hardware', 'Consumables'],

  // ─── Total Materials Cost for a Job ────────────────────────
  getJobCost: function(jobId) {
    return Materials._getUsage()
      .filter(function(u) { return u.jobId === jobId; })
      .reduce(function(s, u) { return s + (u.totalCost || 0); }, 0);
  },

  // ─── Full Inventory Dashboard ──────────────────────────────
  render: function() {
    var catalog = Materials._getCatalog();
    var usage = Materials._getUsage();
    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    var monthUsage = usage.filter(function(u) { return new Date(u.date) >= thisMonthStart; });
    var quarterUsage = usage.filter(function(u) { return new Date(u.date) >= qStart; });
    var monthCost = monthUsage.reduce(function(s, u) { return s + (u.totalCost || 0); }, 0);
    var quarterCost = quarterUsage.reduce(function(s, u) { return s + (u.totalCost || 0); }, 0);
    var lowStock = catalog.filter(function(m) { return m.currentStock <= m.reorderPoint; });
    var totalValue = catalog.reduce(function(s, m) { return s + (m.currentStock * m.unitCost); }, 0);

    // ── Stat cards ──
    var html = '<div class="stat-grid">'
      + UI.statCard('Inventory Items', catalog.length.toString(), lowStock.length > 0 ? lowStock.length + ' low stock' : 'All stocked', lowStock.length > 0 ? 'down' : 'up', '')
      + UI.statCard('Inventory Value', UI.moneyInt(totalValue), 'Current stock on hand', '', '')
      + UI.statCard('This Month', UI.moneyInt(monthCost), monthUsage.length + ' items used', '', '')
      + UI.statCard('This Quarter', UI.moneyInt(quarterCost), quarterUsage.length + ' items used', '', '')
      + '</div>';

    // ── Low stock alerts ──
    if (lowStock.length > 0) {
      html += '<div style="background:#fff3e0;border-radius:12px;padding:16px;border-left:4px solid #e65100;margin-bottom:16px;">'
        + '<h4 style="color:#e65100;margin-bottom:8px;">⚠️ Reorder Alerts</h4>';
      lowStock.forEach(function(m) {
        var urgent = m.currentStock === 0;
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;">'
          + '<span>' + (urgent ? '🔴' : '🟡') + ' <strong>' + m.name + '</strong> — '
          + m.currentStock + ' ' + m.unit + (m.currentStock !== 1 ? 's' : '') + ' left (reorder at ' + m.reorderPoint + ')</span>'
          + '<button onclick="Materials.quickRestock(\'' + m.id + '\')" style="background:#e65100;color:#fff;border:none;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;">Restock</button>'
          + '</div>';
      });
      html += '</div>';
    }

    // ── Top 5 most-used materials ──
    var usageCounts = {};
    usage.forEach(function(u) {
      if (!usageCounts[u.materialId]) usageCounts[u.materialId] = { qty: 0, cost: 0 };
      usageCounts[u.materialId].qty += u.qty;
      usageCounts[u.materialId].cost += u.totalCost || 0;
    });
    var top5 = Object.keys(usageCounts).map(function(mid) {
      var mat = catalog.find(function(m) { return m.id === mid; });
      return { id: mid, name: mat ? mat.name : 'Unknown', qty: usageCounts[mid].qty, cost: usageCounts[mid].cost };
    }).sort(function(a, b) { return b.qty - a.qty; }).slice(0, 5);

    if (top5.length > 0) {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';

      // Top 5 card
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
        + '<h3 style="font-size:15px;margin-bottom:12px;">Top 5 Most Used</h3>';
      var maxQty = top5[0] ? top5[0].qty : 1;
      top5.forEach(function(item, i) {
        var pct = Math.round(item.qty / maxQty * 100);
        html += '<div style="margin-bottom:10px;">'
          + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">'
          + '<span>' + (i + 1) + '. ' + item.name + '</span>'
          + '<span style="font-weight:600;">' + item.qty + ' used / ' + UI.money(item.cost) + '</span></div>'
          + '<div style="background:#e8f5e9;border-radius:4px;height:8px;overflow:hidden;">'
          + '<div style="background:var(--green-dark);height:100%;width:' + pct + '%;border-radius:4px;"></div>'
          + '</div></div>';
      });
      html += '</div>';

      // Cost by category bar chart
      var catCosts = {};
      usage.forEach(function(u) {
        var mat = catalog.find(function(m) { return m.id === u.materialId; });
        var cat = mat ? mat.category : 'Other';
        catCosts[cat] = (catCosts[cat] || 0) + (u.totalCost || 0);
      });
      var catEntries = Object.keys(catCosts).map(function(c) { return { cat: c, cost: catCosts[c] }; })
        .sort(function(a, b) { return b.cost - a.cost; });
      var maxCatCost = catEntries[0] ? catEntries[0].cost : 1;
      var catColors = { Cutting: '#f44336', Rigging: '#2196f3', Fuel: '#ff9800', Safety: '#4caf50', Hardware: '#9c27b0', Consumables: '#795548' };

      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
        + '<h3 style="font-size:15px;margin-bottom:12px;">Cost by Category</h3>';
      if (catEntries.length > 0) {
        catEntries.forEach(function(entry) {
          var pct = Math.round(entry.cost / maxCatCost * 100);
          var color = catColors[entry.cat] || '#607d8b';
          html += '<div style="margin-bottom:10px;">'
            + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">'
            + '<span>' + Materials._catIcon(entry.cat) + ' ' + entry.cat + '</span>'
            + '<span style="font-weight:600;">' + UI.money(entry.cost) + '</span></div>'
            + '<div style="background:#f5f5f5;border-radius:4px;height:8px;overflow:hidden;">'
            + '<div style="background:' + color + ';height:100%;width:' + pct + '%;border-radius:4px;"></div>'
            + '</div></div>';
        });
      } else {
        html += '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:13px;">No usage data yet. Add materials to jobs to see cost breakdown.</div>';
      }
      html += '</div></div>';
    }

    // ── Catalog table ──
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:16px;">Materials Catalog</h3>'
      + '<button onclick="Materials.showAddMaterial()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">+ Add Material</button></div>';

    // Group by category
    var grouped = {};
    catalog.forEach(function(m) {
      var cat = m.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m);
    });

    Materials._categories.forEach(function(cat) {
      var items = grouped[cat];
      if (!items || items.length === 0) return;
      html += '<div style="margin-bottom:16px;">'
        + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px;">'
        + Materials._catIcon(cat) + ' ' + cat + '</h4>';
      items.forEach(function(m) {
        var isLow = m.currentStock <= m.reorderPoint;
        var stockColor = m.currentStock === 0 ? '#f44336' : isLow ? '#ff9800' : '#4caf50';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;cursor:pointer;" onclick="Materials.showDetail(\'' + m.id + '\')">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="width:8px;height:8px;border-radius:50%;background:' + stockColor + ';flex-shrink:0;"></span>'
          + '<div><strong style="font-size:14px;">' + m.name + '</strong>'
          + '<div style="font-size:12px;color:var(--text-light);display:flex;align-items:center;gap:6px;">' + UI.money(m.unitCost) + ' / ' + m.unit + ' ' + Materials.trendPill(m.id) + '</div></div></div>'
          + '<div style="text-align:right;">'
          + '<div style="font-size:14px;font-weight:600;color:' + stockColor + ';">' + m.currentStock + ' ' + m.unit + (m.currentStock !== 1 ? 's' : '') + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);">Reorder at ' + m.reorderPoint + '</div></div></div>';
      });
      html += '</div>';
    });

    // Handle any uncategorized
    if (grouped['Other'] && grouped['Other'].length > 0) {
      html += '<div style="margin-bottom:16px;">'
        + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px;">📦 Other</h4>';
      grouped['Other'].forEach(function(m) {
        var isLow = m.currentStock <= m.reorderPoint;
        var stockColor = m.currentStock === 0 ? '#f44336' : isLow ? '#ff9800' : '#4caf50';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;cursor:pointer;" onclick="Materials.showDetail(\'' + m.id + '\')">'
          + '<div><strong style="font-size:14px;">' + m.name + '</strong>'
          + '<div style="font-size:12px;color:var(--text-light);display:flex;align-items:center;gap:6px;">' + UI.money(m.unitCost) + ' / ' + m.unit + ' ' + Materials.trendPill(m.id) + '</div></div>'
          + '<div style="text-align:right;">'
          + '<div style="font-size:14px;font-weight:600;color:' + stockColor + ';">' + m.currentStock + '</div></div></div>';
      });
      html += '</div>';
    }

    if (catalog.length === 0) {
      html += '<div style="text-align:center;padding:24px;color:var(--text-light);">'
        + '<p>No materials in catalog. Add your supplies above.</p></div>';
    }
    html += '</div>';

    // ── Recent usage log ──
    var recentUsage = usage.slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 15);
    if (recentUsage.length > 0) {
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
        + '<h3 style="font-size:15px;margin-bottom:12px;">Recent Usage</h3>'
        + '<table class="data-table"><thead><tr>'
        + '<th>Date</th><th>Material</th><th>Job</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Cost</th>'
        + '</tr></thead><tbody>';
      recentUsage.forEach(function(u) {
        var mat = catalog.find(function(m) { return m.id === u.materialId; });
        var job = DB.jobs ? DB.jobs.getAll().find(function(j) { return j.id === u.jobId; }) : null;
        html += '<tr>'
          + '<td style="font-size:12px;">' + UI.dateShort(u.date) + '</td>'
          + '<td>' + (mat ? mat.name : 'Unknown') + '</td>'
          + '<td style="font-size:12px;color:var(--text-light);">' + (job ? (job.clientName || '') : u.jobId) + '</td>'
          + '<td style="text-align:right;">' + u.qty + '</td>'
          + '<td style="text-align:right;font-weight:600;">' + UI.money(u.totalCost) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }

    return html;
  },

  // ─── Materials section for Job Detail page ─────────────────
  renderForJob: function(jobId) {
    var catalog = Materials._getCatalog();
    var usage = Materials._getUsage().filter(function(u) { return u.jobId === jobId; });
    var totalCost = usage.reduce(function(s, u) { return s + (u.totalCost || 0); }, 0);
    var job = DB.jobs ? DB.jobs.getAll().find(function(j) { return j.id === jobId; }) : null;
    var revenue = job ? (job.total || 0) : 0;

    var html = '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h4 style="font-size:15px;">🪵 Materials Used</h4>'
      + '<button onclick="Materials.addToJob(\'' + jobId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">+ Add Material</button></div>';

    if (usage.length > 0) {
      html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">'
        + '<thead><tr style="border-bottom:2px solid var(--border);">'
        + '<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Material</th>'
        + '<th style="text-align:right;padding:4px 8px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Qty</th>'
        + '<th style="text-align:right;padding:4px 8px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Unit Cost</th>'
        + '<th style="text-align:right;padding:4px 8px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Total</th>'
        + '<th style="width:30px;"></th>'
        + '</tr></thead><tbody>';

      usage.forEach(function(u) {
        var mat = catalog.find(function(m) { return m.id === u.materialId; });
        html += '<tr style="border-bottom:1px solid #f5f5f5;">'
          + '<td style="padding:6px 8px;">' + (mat ? mat.name : 'Unknown') + '</td>'
          + '<td style="text-align:right;padding:6px 8px;">' + u.qty + '</td>'
          + '<td style="text-align:right;padding:6px 8px;color:var(--text-light);">' + UI.money(u.unitCost) + '</td>'
          + '<td style="text-align:right;padding:6px 8px;font-weight:600;">' + UI.money(u.totalCost) + '</td>'
          + '<td style="text-align:right;padding:6px 8px;">'
          + '<button onclick="Materials.removeFromJob(\'' + u.id + '\', \'' + jobId + '\')" style="background:none;border:none;color:#f44336;cursor:pointer;font-size:14px;" title="Remove">✕</button></td>'
          + '</tr>';
      });

      html += '</tbody><tfoot><tr style="border-top:2px solid var(--border);">'
        + '<td colspan="3" style="padding:8px;font-weight:700;">Total Materials Cost</td>'
        + '<td style="text-align:right;padding:8px;font-weight:700;color:var(--green-dark);">' + UI.money(totalCost) + '</td>'
        + '<td></td></tr></tfoot></table>';

      // Profitability comparison
      if (revenue > 0) {
        var matPct = Math.round(totalCost / revenue * 100);
        var profitColor = matPct <= 15 ? '#4caf50' : matPct <= 30 ? '#ff9800' : '#f44336';
        html += '<div style="margin-top:12px;padding:10px;background:#f8f9fa;border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-size:13px;">'
          + '<span>Materials = <strong style="color:' + profitColor + ';">' + matPct + '%</strong> of job revenue (' + UI.money(revenue) + ')</span>'
          + '<span style="font-size:11px;color:var(--text-light);">Target: under 15%</span></div>';
      }
    } else {
      html += '<div style="text-align:center;padding:16px;color:var(--text-light);font-size:13px;">'
        + 'No materials logged for this job. Track what you use for accurate profitability.</div>';
    }

    html += '</div>';
    return html;
  },

  // ─── Add Material to Job (modal) ───────────────────────────
  addToJob: function(jobId) {
    var catalog = Materials._getCatalog();
    var categoryGroups = {};
    catalog.forEach(function(m) {
      var cat = m.category || 'Other';
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push(m);
    });

    var html = '<form id="mat-job-form" onsubmit="Materials._saveToJob(event, \'' + jobId + '\')">'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Material</label>'
      + '<select id="mat-select" onchange="Materials._updateUnitCost()" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="">Select a material...</option>';
    Materials._categories.concat(['Other']).forEach(function(cat) {
      var items = categoryGroups[cat];
      if (!items || items.length === 0) return;
      html += '<optgroup label="' + Materials._catIcon(cat) + ' ' + cat + '">';
      items.forEach(function(m) {
        html += '<option value="' + m.id + '" data-cost="' + m.unitCost + '" data-unit="' + m.unit + '">' + m.name + ' (' + UI.money(m.unitCost) + '/' + m.unit + ' — ' + m.currentStock + ' in stock)</option>';
      });
      html += '</optgroup>';
    });
    html += '</select></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Quantity</label>'
      + '<input type="number" id="mat-qty" min="0.5" step="0.5" value="1" onchange="Materials._updateTotal()" oninput="Materials._updateTotal()" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Unit Cost ($)</label>'
      + '<input type="number" id="mat-cost" step="0.01" value="" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;"></div></div>'
      + '<div style="margin-top:12px;padding:12px;background:#f8f9fa;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">'
      + '<span style="font-size:14px;font-weight:600;">Total Cost:</span>'
      + '<span id="mat-total-preview" style="font-size:18px;font-weight:700;color:var(--green-dark);">$0.00</span></div>'
      + '</form>';

    UI.showModal('Add Material to Job', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'mat-job-form\').requestSubmit()">Add Material</button>'
    });
  },

  _updateUnitCost: function() {
    var sel = document.getElementById('mat-select');
    var opt = sel.options[sel.selectedIndex];
    if (opt && opt.getAttribute('data-cost')) {
      document.getElementById('mat-cost').value = opt.getAttribute('data-cost');
      Materials._updateTotal();
    }
  },

  _updateTotal: function() {
    var qty = parseFloat(document.getElementById('mat-qty').value) || 0;
    var cost = parseFloat(document.getElementById('mat-cost').value) || 0;
    var total = qty * cost;
    var el = document.getElementById('mat-total-preview');
    if (el) el.textContent = UI.money(total);
  },

  _saveToJob: function(e, jobId) {
    e.preventDefault();
    var materialId = document.getElementById('mat-select').value;
    var qty = parseFloat(document.getElementById('mat-qty').value);
    var unitCost = parseFloat(document.getElementById('mat-cost').value);

    if (!materialId) { UI.toast('Select a material', 'error'); return; }
    if (!qty || qty <= 0) { UI.toast('Enter a quantity', 'error'); return; }
    if (!unitCost && unitCost !== 0) { UI.toast('Enter unit cost', 'error'); return; }

    var totalCost = Math.round(qty * unitCost * 100) / 100;

    // Save usage record
    var usage = Materials._getUsage();
    usage.push({
      id: Materials._genId(),
      jobId: jobId,
      materialId: materialId,
      qty: qty,
      unitCost: unitCost,
      totalCost: totalCost,
      date: new Date().toISOString()
    });
    Materials._saveUsage(usage);

    // Deduct from stock
    var catalog = Materials._getCatalog();
    var mat = catalog.find(function(m) { return m.id === materialId; });
    if (mat) {
      mat.currentStock = Math.max(0, mat.currentStock - qty);
      Materials._saveCatalog(catalog);
    }

    UI.closeModal();
    UI.toast('Added ' + qty + ' ' + (mat ? mat.name : 'item') + ' — ' + UI.money(totalCost));
    loadPage(window.currentPage || 'materials');
  },

  // ─── Remove material from job ──────────────────────────────
  removeFromJob: function(usageId, jobId) {
    var usage = Materials._getUsage();
    var record = usage.find(function(u) { return u.id === usageId; });

    // Restore stock
    if (record) {
      var catalog = Materials._getCatalog();
      var mat = catalog.find(function(m) { return m.id === record.materialId; });
      if (mat) {
        mat.currentStock += record.qty;
        Materials._saveCatalog(catalog);
      }
    }

    usage = usage.filter(function(u) { return u.id !== usageId; });
    Materials._saveUsage(usage);
    UI.toast('Material removed');
    loadPage(window.currentPage || 'materials');
  },

  // ─── Add new item to catalog (modal) ──────────────────────
  showAddMaterial: function(editId) {
    var catalog = Materials._getCatalog();
    var existing = editId ? catalog.find(function(m) { return m.id === editId; }) : null;

    var html = '<form id="mat-form" onsubmit="Materials._saveMaterial(event, ' + (editId ? '\'' + editId + '\'' : 'null') + ')">'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Material Name</label>'
      + '<input type="text" id="mat-name" value="' + (existing ? existing.name : '') + '" placeholder="e.g., Rigging Rope 200ft" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;" required></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Category</label>'
      + '<select id="mat-cat" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    Materials._categories.forEach(function(c) {
      html += '<option value="' + c + '"' + (existing && existing.category === c ? ' selected' : '') + '>' + Materials._catIcon(c) + ' ' + c + '</option>';
    });
    html += '</select></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Unit</label>'
      + '<select id="mat-unit" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    ['each', 'gallon', 'foot', 'pair', 'set', 'bottle', 'bag', 'can', 'box', 'roll'].forEach(function(u) {
      html += '<option value="' + u + '"' + (existing && existing.unit === u ? ' selected' : '') + '>' + u + '</option>';
    });
    html += '</select></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Unit Cost ($)</label>'
      + '<input type="number" id="mat-ucost" step="0.01" value="' + (existing ? existing.unitCost : '') + '" placeholder="0.00" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;" required></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Current Stock</label>'
      + '<input type="number" id="mat-stock" min="0" step="1" value="' + (existing ? existing.currentStock : '0') + '" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Reorder Point</label>'
      + '<input type="number" id="mat-reorder" min="0" step="1" value="' + (existing ? existing.reorderPoint : '1') + '" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;"></div>'
      + '</div></form>';

    UI.showModal(editId ? 'Edit Material' : 'Add Material', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + (editId ? ' <button class="btn" style="background:#f44336;color:#fff;" onclick="Materials._deleteMaterial(\'' + editId + '\')">Delete</button>' : '')
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'mat-form\').requestSubmit()">Save</button>'
    });
  },

  _saveMaterial: function(e, editId) {
    e.preventDefault();
    var catalog = Materials._getCatalog();
    var data = {
      name: document.getElementById('mat-name').value.trim(),
      category: document.getElementById('mat-cat').value,
      unit: document.getElementById('mat-unit').value,
      unitCost: parseFloat(document.getElementById('mat-ucost').value) || 0,
      currentStock: parseInt(document.getElementById('mat-stock').value) || 0,
      reorderPoint: parseInt(document.getElementById('mat-reorder').value) || 1
    };

    if (!data.name) { UI.toast('Enter a material name', 'error'); return; }

    if (editId) {
      var idx = -1;
      for (var i = 0; i < catalog.length; i++) {
        if (catalog[i].id === editId) { idx = i; break; }
      }
      if (idx >= 0) {
        // v771: capture price history before we overwrite the row
        var prev = catalog[idx];
        if (prev && Number(prev.unitCost) !== Number(data.unitCost)) {
          Materials._appendPriceHistory(editId, prev.unitCost, data.unitCost);
        }
        data.id = editId;
        catalog[idx] = data;
      }
    } else {
      data.id = 'mat_' + Materials._genId();
      catalog.push(data);
      // v771: seed history with the initial price so even brand-new items
      // have at least one history point.
      Materials._appendPriceHistory(data.id, null, data.unitCost);
    }

    Materials._saveCatalog(catalog);
    UI.closeModal();
    UI.toast(editId ? 'Material updated' : 'Material added');
    loadPage('materials');
  },

  // v771: price-history capture. Stored in a single localStorage key
  // keyed by material id → array of { from, to, changedAt, deltaPct }.
  // Kept lightweight (no Supabase table) — most tenants have <50
  // materials and price changes happen monthly, not hourly.
  _historyKey: 'bm-materials-price-history',
  _allHistory: function() {
    try { return JSON.parse(localStorage.getItem(Materials._historyKey) || '{}') || {}; }
    catch(e) { return {}; }
  },
  _appendPriceHistory: function(materialId, fromPrice, toPrice) {
    if (!materialId) return;
    var all = Materials._allHistory();
    var arr = (all[materialId] || []).slice();
    var fromN = (fromPrice == null) ? null : Number(fromPrice) || 0;
    var toN = Number(toPrice) || 0;
    var delta = (fromN && fromN > 0) ? Math.round(((toN - fromN) / fromN) * 1000) / 10 : null;
    arr.push({ from: fromN, to: toN, changedAt: new Date().toISOString(), deltaPct: delta });
    // Cap at 50 entries per material — anything older falls off.
    if (arr.length > 50) arr = arr.slice(arr.length - 50);
    all[materialId] = arr;
    try { localStorage.setItem(Materials._historyKey, JSON.stringify(all)); } catch(e) {}
  },
  _getPriceHistory: function(materialId) {
    var all = Materials._allHistory();
    return (all[materialId] || []).slice();
  },
  // 90-day trend percentage for a material. Returns null if no baseline
  // 90 days ago. Positive number = price went UP (margin pressure).
  _trend90d: function(materialId) {
    var hist = Materials._getPriceHistory(materialId);
    if (!hist.length) return null;
    var cutoff = Date.now() - 90 * 86400000;
    // Latest price = most recent entry
    var latest = hist[hist.length - 1].to;
    // Baseline = the price at or before 90 days ago. If no entry that
    // old, no trend (item is too new).
    var baseline = null;
    for (var i = 0; i < hist.length; i++) {
      var ts = new Date(hist[i].changedAt).getTime();
      if (ts <= cutoff) baseline = hist[i].to;
      else break;
    }
    if (baseline == null || baseline <= 0) return null;
    return Math.round(((latest - baseline) / baseline) * 1000) / 10;
  },
  // Compact trend pill (↑ +X% / ↓ -X% / —) for the catalog list.
  trendPill: function(materialId) {
    var t = Materials._trend90d(materialId);
    if (t == null) return '<span style="font-size:10px;color:var(--text-light);">—</span>';
    if (Math.abs(t) < 0.5) return '<span title="No meaningful 90-day change" style="font-size:10px;color:var(--text-light);background:var(--bg);padding:1px 6px;border-radius:8px;">flat</span>';
    var up = t > 0;
    var color = up ? '#c2410c' : '#16a34a';
    var arrow = up ? '↑' : '↓';
    return '<span title="90-day change" style="font-size:10px;font-weight:700;color:' + color + ';background:' + color + '15;padding:1px 6px;border-radius:8px;">' + arrow + ' ' + (up ? '+' : '') + t + '%</span>';
  },

  _deleteMaterial: function(id) {
    if (!confirm('Delete this material from the catalog?')) return;
    var catalog = Materials._getCatalog().filter(function(m) { return m.id !== id; });
    Materials._saveCatalog(catalog);
    UI.closeModal();
    UI.toast('Material deleted');
    loadPage('materials');
  },

  // ─── Material detail modal ────────────────────────────────
  showDetail: function(id) {
    var catalog = Materials._getCatalog();
    var mat = catalog.find(function(m) { return m.id === id; });
    if (!mat) return;

    var usage = Materials._getUsage().filter(function(u) { return u.materialId === id; });
    var totalUsed = usage.reduce(function(s, u) { return s + u.qty; }, 0);
    var totalCost = usage.reduce(function(s, u) { return s + (u.totalCost || 0); }, 0);
    var isLow = mat.currentStock <= mat.reorderPoint;

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">'
      + '<div>'
      + '<div style="font-size:13px;line-height:2;">'
      + '<div>Category: <strong>' + Materials._catIcon(mat.category) + ' ' + mat.category + '</strong></div>'
      + '<div>Unit Cost: <strong>' + UI.money(mat.unitCost) + ' / ' + mat.unit + '</strong></div>'
      + '<div>Stock Value: <strong>' + UI.money(mat.currentStock * mat.unitCost) + '</strong></div></div></div>'
      + '<div>'
      + '<div style="font-size:13px;line-height:2;">'
      + '<div>In Stock: <strong style="color:' + (isLow ? '#f44336' : '#4caf50') + ';">' + mat.currentStock + ' ' + mat.unit + (mat.currentStock !== 1 ? 's' : '') + '</strong>' + (isLow ? ' ⚠️' : '') + '</div>'
      + '<div>Reorder At: <strong>' + mat.reorderPoint + '</strong></div>'
      + '<div>Total Used: <strong>' + totalUsed + '</strong> (' + UI.money(totalCost) + ')</div></div></div></div>';

    // v771: Price history block — shows when this material's price changed.
    // Hidden if there's only one entry (the seed) since there's nothing to compare.
    var priceHist = Materials._getPriceHistory(id);
    if (priceHist.length > 1) {
      var first = priceHist[0];
      var last = priceHist[priceHist.length - 1];
      var totalDelta = (first.to && first.to > 0)
        ? Math.round(((last.to - first.to) / first.to) * 1000) / 10
        : null;
      var trend90 = Materials._trend90d(id);
      html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">'
        +   '<h4 style="margin:0;font-size:13px;">💵 Price history</h4>'
        +   '<div style="font-size:11px;color:var(--text-light);">'
        +     (trend90 != null ? '90d: ' + Materials.trendPill(id) + ' · ' : '')
        +     (totalDelta != null ? 'all-time ' + (totalDelta >= 0 ? '+' : '') + totalDelta + '%' : '')
        +   '</div>'
        + '</div>'
        + '<table style="width:100%;font-size:12px;border-collapse:collapse;">'
        + '<thead><tr style="border-bottom:1px solid var(--border);">'
        +   '<th style="text-align:left;padding:4px 0;">Changed</th>'
        +   '<th style="text-align:right;padding:4px 0;">From</th>'
        +   '<th style="text-align:right;padding:4px 0;">To</th>'
        +   '<th style="text-align:right;padding:4px 0;">Δ</th>'
        + '</tr></thead><tbody>';
      priceHist.slice().reverse().forEach(function(p) {
        var dColor = p.deltaPct == null ? 'var(--text-light)' : p.deltaPct > 0 ? '#c2410c' : p.deltaPct < 0 ? '#16a34a' : 'var(--text-light)';
        var dLabel = p.deltaPct == null ? '—' : (p.deltaPct > 0 ? '+' : '') + p.deltaPct + '%';
        html += '<tr style="border-bottom:1px solid #f5f5f5;">'
          + '<td style="padding:4px 0;">' + UI.dateShort(p.changedAt) + '</td>'
          + '<td style="text-align:right;padding:4px 0;color:var(--text-light);">' + (p.from == null ? '—' : UI.money(p.from)) + '</td>'
          + '<td style="text-align:right;padding:4px 0;font-weight:600;">' + UI.money(p.to) + '</td>'
          + '<td style="text-align:right;padding:4px 0;color:' + dColor + ';font-weight:600;">' + dLabel + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // Usage history for this material
    if (usage.length > 0) {
      var recent = usage.slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 10);
      html += '<h4 style="font-size:13px;margin-bottom:8px;">Recent Usage</h4>'
        + '<table style="width:100%;font-size:12px;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border);">'
        + '<th style="text-align:left;padding:4px;">Date</th><th style="text-align:left;padding:4px;">Job</th>'
        + '<th style="text-align:right;padding:4px;">Qty</th><th style="text-align:right;padding:4px;">Cost</th></tr></thead><tbody>';
      // Build a jobId → job lookup once (was doing a full getAll().find() per row — N² over all jobs)
      var _jobMap = {};
      if (DB.jobs) { DB.jobs.getAll().forEach(function(j) { _jobMap[j.id] = j; }); }
      recent.forEach(function(u) {
        var job = _jobMap[u.jobId] || null;
        html += '<tr style="border-bottom:1px solid #f5f5f5;">'
          + '<td style="padding:4px;">' + UI.dateShort(u.date) + '</td>'
          + '<td style="padding:4px;">' + (job ? (job.clientName || '') : '') + '</td>'
          + '<td style="text-align:right;padding:4px;">' + u.qty + '</td>'
          + '<td style="text-align:right;padding:4px;font-weight:600;">' + UI.money(u.totalCost) + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    UI.showModal(mat.name, html, {
      wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-outline" onclick="Materials.quickRestock(\'' + id + '\')">📦 Restock</button>'
        + ' <button class="btn btn-primary" onclick="UI.closeModal();Materials.showAddMaterial(\'' + id + '\')">Edit</button>'
    });
  },

  // ─── Quick restock (prompt for qty) ───────────────────────
  quickRestock: function(id) {
    var catalog = Materials._getCatalog();
    var mat = catalog.find(function(m) { return m.id === id; });
    if (!mat) return;

    var qty = prompt('Restock ' + mat.name + '\nCurrent: ' + mat.currentStock + ' ' + mat.unit + (mat.currentStock !== 1 ? 's' : '') + '\n\nHow many to add?');
    if (qty === null) return;
    qty = parseFloat(qty);
    if (isNaN(qty) || qty <= 0) { UI.toast('Enter a valid quantity', 'error'); return; }

    mat.currentStock += qty;
    Materials._saveCatalog(catalog);
    UI.toast('Restocked ' + mat.name + ': +' + qty + ' (now ' + mat.currentStock + ')');
    loadPage('materials');
  },

  // ─── Dashboard Widget (compact low-stock alerts) ──────────
  renderWidget: function() {
    var catalog = Materials._getCatalog();
    var lowStock = catalog.filter(function(m) { return m.currentStock <= m.reorderPoint; });
    var usage = Materials._getUsage();
    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var monthCost = usage.filter(function(u) { return new Date(u.date) >= thisMonthStart; })
      .reduce(function(s, u) { return s + (u.totalCost || 0); }, 0);

    var html = '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<h4 style="font-size:14px;">🪵 Materials</h4>'
      + '<a onclick="loadPage(\'materials\')" style="font-size:12px;color:var(--green-dark);cursor:pointer;font-weight:600;">View All</a></div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:8px;">Materials cost this month: <strong style="color:var(--green-dark);">' + UI.money(monthCost) + '</strong></div>';

    if (lowStock.length > 0) {
      html += '<div style="font-size:12px;color:#e65100;font-weight:600;margin-bottom:4px;">⚠️ ' + lowStock.length + ' item' + (lowStock.length !== 1 ? 's' : '') + ' low on stock:</div>';
      lowStock.slice(0, 4).forEach(function(m) {
        html += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;">'
          + '<span>' + m.name + '</span>'
          + '<span style="color:#f44336;font-weight:600;">' + m.currentStock + ' left</span></div>';
      });
      if (lowStock.length > 4) {
        html += '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">+ ' + (lowStock.length - 4) + ' more...</div>';
      }
    } else {
      html += '<div style="font-size:12px;color:#4caf50;">All materials stocked</div>';
    }

    html += '</div>';
    return html;
  }
};
