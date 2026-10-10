/**
 * Branch Manager — Built-in Estimator
 * Integrated pricing calculator for quotes
 * Combines field estimate (DBH, complexity) + job cost (crew, equipment, insurance)
 * Auto-populates quote line items when done
 */
var Estimator = {
  RATES: {
    climber:   { half: 200, full: 400, hr: 50, label: 'Climber' },
    bucketop:  { half: 200, full: 400, hr: 50, label: 'Bucket Operator' },
    ground:    { half: 120, full: 240, hr: 30, label: 'Groundsperson' },
    chipper:   { half: 175, full: 350, hr: 44, label: 'Chipper' },
    chiptruck: { half: 175, full: 350, hr: 44, label: 'Chip Truck' },
    bucket:    { half: 300, full: 600, hr: 75, label: 'Bucket Truck' },
    loader:    { half: 200, full: 400, hr: 50, label: 'Loader' },
    stump:     { half: 175, full: 325, hr: 41, label: 'Stump Grinder' },
    ram:       { half: 75,  full: 150, hr: 19, label: 'Ram 2500' },
    crane:     { half: 1250,full: 2500,hr: 313,label: 'Crane' },
    trailer:   { half: 50,  full: 100, hr: 13, label: 'Trailer' }
  },

  PRESETS: {
    removal: {
      label: '🌲 Tree Removal',
      duration: 'full',
      crew: { climber: 1, ground: 2 },
      equip: { chipper: 1, chiptruck: 1, ram: 1, loader: 1 }
    },
    pruning: {
      label: '✂️ Pruning',
      duration: 'half',
      crew: { climber: 1, ground: 1 },
      equip: { chipper: 1, chiptruck: 1 }
    },
    clearing: {
      label: '🌳 Land Clearing',
      duration: 'full',
      crew: { climber: 1, ground: 2 },
      equip: { chipper: 1, chiptruck: 1, ram: 1, loader: 1, trailer: 1 }
    },
    bucket_job: {
      label: '🚛 Bucket Job',
      duration: 'full',
      crew: { climber: 1, ground: 2, bucketop: 1 },
      equip: { chipper: 1, chiptruck: 1, ram: 1, bucket: 1, loader: 1, trailer: 1 }
    }
  },

  INS_RATES: { wc: 9, gl: 5, dis: 2, payroll: 8, auto: 3 },

  // Full-page render (for /estimator page nav)
  render: function() {
    var html = '<div style="max-width:720px;margin:0 auto;">'
      + '<h2 style="font-size:22px;font-weight:700;margin-bottom:16px;">🧮 Job Estimator</h2>'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:20px;">Quickly price a job: crew + equipment + insurance + markup → suggested quote</div>'
      + Estimator._buildFormHTML()
      + '</div>';
    // Apply default preset after render
    setTimeout(function() { Estimator.applyPreset('removal'); }, 150);
    return html;
  },

  _buildFormHTML: function() {
    // Extracted from show() so both modal + page use same HTML
    var html = '<div id="est-calc">';
    html += '<div style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:8px;">Job Type</div><div style="display:flex;gap:6px;flex-wrap:wrap;">';
    Object.keys(Estimator.PRESETS).forEach(function(key) {
      var p = Estimator.PRESETS[key];
      html += '<button class="btn btn-outline est-preset" data-preset="' + key + '" onclick="Estimator.applyPreset(\'' + key + '\')" style="font-size:13px;">' + p.label + '</button>';
    });
    html += '</div></div>';
    html += '<div style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:8px;">Duration</div><div style="display:flex;gap:6px;">'
      + '<button class="btn btn-outline est-dur" data-dur="half" onclick="Estimator.setDuration(\'half\')">Half Day (4hr)</button>'
      + '<button class="btn btn-primary est-dur" data-dur="full" onclick="Estimator.setDuration(\'full\')">Full Day (8hr)</button>'
      + '<button class="btn btn-outline est-dur" data-dur="custom" onclick="Estimator.setDuration(\'custom\')">Custom</button>'
      + '</div><div id="est-custom-hrs" style="display:none;margin-top:8px;">'
      + '<input type="number" id="est-hrs" value="6" min="1" max="16" style="width:80px;padding:6px;border:2px solid var(--border);border-radius:8px;font-size:14px;" oninput="Estimator.calc()"> hours'
      + '</div></div>';
    html += '<div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:10px;"><div style="font-weight:700;margin-bottom:8px;">Crew</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    ['climber','bucketop','ground'].forEach(function(key) {
      var r = Estimator.RATES[key];
      html += '<div style="display:flex;align-items:center;gap:8px;"><input type="number" class="est-crew" data-key="' + key + '" value="0" min="0" max="10" style="width:50px;padding:6px;border:2px solid var(--border);border-radius:8px;font-size:14px;text-align:center;" oninput="Estimator.calc()"><span style="font-size:13px;">' + r.label + ' <span style="color:var(--text-light);">$' + r.hr + '/hr</span></span></div>';
    });
    html += '</div></div>';
    html += '<div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:10px;"><div style="font-weight:700;margin-bottom:8px;">Equipment</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    ['chipper','chiptruck','bucket','ram','loader','trailer','stump','crane'].forEach(function(key) {
      var r = Estimator.RATES[key];
      html += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;"><input type="checkbox" class="est-equip" data-key="' + key + '" onchange="Estimator.calc()" style="width:18px;height:18px;">' + r.label + ' <span style="color:var(--text-light);">$' + r.hr + '/hr</span></label>';
    });
    html += '</div></div>';
    html += '<div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:10px;"><div style="font-weight:700;margin-bottom:8px;">Insurance & Overhead</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;">';
    [['wc','WC',9],['gl','GL',5],['dis','Disab',2],['payroll','Payroll',8],['auto','Auto',3]].forEach(function(ins) {
      html += '<div style="display:flex;align-items:center;gap:4px;"><span>' + ins[1] + ':</span><input type="number" class="est-ins" data-key="' + ins[0] + '" value="' + ins[2] + '" min="0" max="30" style="width:45px;padding:4px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;" oninput="Estimator.calc()">%</div>';
    });
    html += '</div></div>';
    html += '<div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;"><span style="font-weight:700;">Profit Markup:</span><input type="number" id="est-markup" value="30" min="0" max="200" step="5" style="width:70px;padding:6px;border:2px solid var(--border);border-radius:8px;font-size:14px;text-align:center;" oninput="Estimator.calc()">%</div>';
    html += '<div id="est-results" style="background:var(--green-dark);border-radius:12px;padding:20px;color:#fff;"></div>';
    html += '</div>';
    return html;
  },

  // Show the estimator modal — optionally with a callback to populate quote
  show: function(callback) {
    var html = '<div id="est-calc">';

    // Job type presets
    html += '<div style="margin-bottom:16px;">'
      + '<div style="font-weight:700;margin-bottom:8px;">Job Type</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    Object.keys(Estimator.PRESETS).forEach(function(key) {
      var p = Estimator.PRESETS[key];
      html += '<button class="btn btn-outline est-preset" data-preset="' + key + '" onclick="Estimator.applyPreset(\'' + key + '\')" style="font-size:13px;">' + p.label + '</button>';
    });
    html += '</div></div>';

    // Duration
    html += '<div style="margin-bottom:16px;">'
      + '<div style="font-weight:700;margin-bottom:8px;">Duration</div>'
      + '<div style="display:flex;gap:6px;">'
      + '<button class="btn btn-outline est-dur" data-dur="half" onclick="Estimator.setDuration(\'half\')">Half Day (4hr)</button>'
      + '<button class="btn btn-primary est-dur" data-dur="full" onclick="Estimator.setDuration(\'full\')">Full Day (8hr)</button>'
      + '<button class="btn btn-outline est-dur" data-dur="custom" onclick="Estimator.setDuration(\'custom\')">Custom</button>'
      + '</div>'
      + '<div id="est-custom-hrs" style="display:none;margin-top:8px;">'
      + '<input type="number" id="est-hrs" value="6" min="1" max="16" style="width:80px;padding:6px;border:2px solid var(--border);border-radius:8px;font-size:14px;" oninput="Estimator.calc()"> hours'
      + '</div></div>';

    // Crew
    html += '<div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:10px;">'
      + '<div style="font-weight:700;margin-bottom:8px;">Crew</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    ['climber', 'bucketop', 'ground'].forEach(function(key) {
      var r = Estimator.RATES[key];
      html += '<div style="display:flex;align-items:center;gap:8px;">'
        + '<input type="number" class="est-crew" data-key="' + key + '" value="0" min="0" max="10" style="width:50px;padding:6px;border:2px solid var(--border);border-radius:8px;font-size:14px;text-align:center;" oninput="Estimator.calc()">'
        + '<span style="font-size:13px;">' + r.label + ' <span style="color:var(--text-light);">$' + r.hr + '/hr</span></span>'
        + '</div>';
    });
    html += '</div></div>';

    // Equipment
    html += '<div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:10px;">'
      + '<div style="font-weight:700;margin-bottom:8px;">Equipment</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    ['chipper', 'chiptruck', 'bucket', 'ram', 'loader', 'trailer', 'stump', 'crane'].forEach(function(key) {
      var r = Estimator.RATES[key];
      html += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">'
        + '<input type="checkbox" class="est-equip" data-key="' + key + '" onchange="Estimator.calc()" style="width:18px;height:18px;">'
        + r.label + ' <span style="color:var(--text-light);">$' + r.hr + '/hr</span>'
        + '</label>';
    });
    html += '</div></div>';

    // Insurance
    html += '<div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:10px;">'
      + '<div style="font-weight:700;margin-bottom:8px;">Insurance & Overhead</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;">';
    [['wc','WC',9],['gl','GL',5],['dis','Disab',2],['payroll','Payroll',8],['auto','Auto',3]].forEach(function(ins) {
      html += '<div style="display:flex;align-items:center;gap:4px;">'
        + '<span>' + ins[1] + ':</span>'
        + '<input type="number" class="est-ins" data-key="' + ins[0] + '" value="' + ins[2] + '" min="0" max="30" style="width:45px;padding:4px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;" oninput="Estimator.calc()">%'
        + '</div>';
    });
    html += '</div></div>';

    // Profit markup
    html += '<div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;">'
      + '<span style="font-weight:700;">Profit Markup:</span>'
      + '<input type="number" id="est-markup" value="30" min="0" max="200" step="5" style="width:70px;padding:6px;border:2px solid var(--border);border-radius:8px;font-size:14px;text-align:center;" oninput="Estimator.calc()">%'
      + '</div>';

    // Results
    html += '<div id="est-results" style="background:var(--green-dark);border-radius:12px;padding:20px;color:#fff;"></div>';

    html += '</div>';

    Estimator._callback = callback || null;

    UI.showModal('Job Estimator', html, {
      wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + (callback ? ' <button class="btn btn-primary" onclick="Estimator.applyToQuote()">Apply to Quote</button>' : '')
    });

    // Apply default preset
    setTimeout(function() { Estimator.applyPreset('removal'); }, 100);
  },

  _duration: 'full',
  _callback: null,

  setDuration: function(dur) {
    Estimator._duration = dur;
    document.querySelectorAll('.est-dur').forEach(function(b) {
      b.classList.toggle('btn-primary', b.dataset.dur === dur);
      b.classList.toggle('btn-outline', b.dataset.dur !== dur);
    });
    document.getElementById('est-custom-hrs').style.display = dur === 'custom' ? 'block' : 'none';
    Estimator.calc();
  },

  applyPreset: function(key) {
    var p = Estimator.PRESETS[key];
    if (!p) return;

    // Highlight preset button
    document.querySelectorAll('.est-preset').forEach(function(b) {
      b.classList.toggle('btn-primary', b.dataset.preset === key);
      b.classList.toggle('btn-outline', b.dataset.preset !== key);
    });

    // Set duration
    Estimator.setDuration(p.duration);

    // Set crew
    document.querySelectorAll('.est-crew').forEach(function(el) {
      el.value = p.crew[el.dataset.key] || 0;
    });

    // Set equipment
    document.querySelectorAll('.est-equip').forEach(function(el) {
      el.checked = !!p.equip[el.dataset.key];
    });

    Estimator.calc();
  },

  calc: function() {
    var dur = Estimator._duration;
    var hours = dur === 'half' ? 4 : dur === 'full' ? 8 : (parseInt(document.getElementById('est-hrs').value) || 6);
    var durKey = dur === 'half' ? 'half' : dur === 'full' ? 'full' : null;

    var laborCost = 0, equipCost = 0;
    var lineItems = [];

    // Crew
    document.querySelectorAll('.est-crew').forEach(function(el) {
      var qty = parseInt(el.value) || 0;
      if (qty <= 0) return;
      var key = el.dataset.key;
      var r = Estimator.RATES[key];
      var cost = durKey ? r[durKey] * qty : r.hr * hours * qty;
      laborCost += cost;
      lineItems.push({ service: r.label, description: (qty > 1 ? qty + '× ' : '') + (durKey === 'half' ? 'Half Day' : durKey === 'full' ? 'Full Day' : hours + ' hrs'), qty: qty, rate: durKey ? r[durKey] : r.hr * hours, amount: cost, type: 'labor' });
    });

    // Equipment
    document.querySelectorAll('.est-equip:checked').forEach(function(el) {
      var key = el.dataset.key;
      var r = Estimator.RATES[key];
      var cost = durKey ? r[durKey] : r.hr * hours;
      equipCost += cost;
      lineItems.push({ service: r.label, description: durKey === 'half' ? 'Half Day' : durKey === 'full' ? 'Full Day' : hours + ' hrs', qty: 1, rate: cost, amount: cost, type: 'equipment' });
    });

    // Insurance
    var insRates = {};
    document.querySelectorAll('.est-ins').forEach(function(el) { insRates[el.dataset.key] = parseFloat(el.value) || 0; });
    var laborIns = Math.round(laborCost * (insRates.wc + insRates.gl + insRates.dis + insRates.payroll) / 100);
    var equipIns = Math.round(equipCost * insRates.auto / 100);
    var totalIns = laborIns + equipIns;

    var subtotal = laborCost + equipCost + totalIns;
    var markupPct = parseFloat(document.getElementById('est-markup').value) || 0;
    var markup = Math.round(subtotal * markupPct / 100);
    var total = subtotal + markup;
    var profit = markup;
    var margin = total > 0 ? Math.round((profit / total) * 100) : 0;

    // Store for quote application
    Estimator._lastCalc = { lineItems: lineItems, laborCost: laborCost, equipCost: equipCost, insurance: totalIns, markup: markup, total: total, profit: profit, margin: margin };

    // Render results
    var el = document.getElementById('est-results');
    if (!el) return;

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;opacity:.85;margin-bottom:12px;">'
      + '<div>Labor: $' + laborCost.toLocaleString() + '</div>'
      + '<div>Equipment: $' + equipCost.toLocaleString() + '</div>'
      + '<div>Insurance: $' + totalIns.toLocaleString() + '</div>'
      + '<div>Markup (' + markupPct + '%): $' + markup.toLocaleString() + '</div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(255,255,255,.2);padding-top:12px;">'
      + '<div>'
      + '<div style="font-size:1rem;font-weight:600;">Quote to Client</div>'
      + '<div style="font-size:.8rem;opacity:.6;">' + (durKey === 'half' ? 'Half Day' : durKey === 'full' ? 'Full Day' : hours + ' hours') + '</div>'
      + '</div>'
      + '<div style="font-size:2.2rem;font-weight:800;">$' + total.toLocaleString() + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:16px;margin-top:8px;font-size:.82rem;opacity:.6;">'
      + '<span>Cost: $' + subtotal.toLocaleString() + '</span>'
      + '<span>Profit: <strong style="color:#4ade80;">$' + profit.toLocaleString() + '</strong></span>'
      + '<span>Margin: <strong>' + margin + '%</strong></span>'
      + '</div>';

    el.innerHTML = html;
  },

  // Render the estimator inline (no modal wrapper) for embedding in quote form
  renderInline: function() {
    var html = '';
    // Job type presets
    html += '<div style="margin-bottom:12px;">'
      + '<div style="font-weight:600;margin-bottom:6px;font-size:13px;">Quick Select</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
    Object.keys(Estimator.PRESETS).forEach(function(key) {
      var p = Estimator.PRESETS[key];
      html += '<button type="button" class="btn btn-outline est-preset" data-preset="' + key + '" onclick="Estimator.applyPreset(\'' + key + '\')" style="font-size:12px;padding:5px 10px;">' + p.label + '</button>';
    });
    html += '</div></div>';

    // Duration
    html += '<div style="margin-bottom:12px;">'
      + '<div style="font-weight:600;margin-bottom:6px;font-size:13px;">Duration</div>'
      + '<div style="display:flex;gap:4px;">'
      + '<button type="button" class="btn btn-outline est-dur" data-dur="half" onclick="Estimator.setDuration(\'half\')" style="font-size:12px;padding:5px 10px;">Half Day</button>'
      + '<button type="button" class="btn btn-primary est-dur" data-dur="full" onclick="Estimator.setDuration(\'full\')" style="font-size:12px;padding:5px 10px;">Full Day</button>'
      + '<button type="button" class="btn btn-outline est-dur" data-dur="custom" onclick="Estimator.setDuration(\'custom\')" style="font-size:12px;padding:5px 10px;">Custom</button>'
      + '</div>'
      + '<div id="est-custom-hrs" style="display:none;margin-top:6px;">'
      + '<input type="number" id="est-hrs" value="6" min="1" max="16" style="width:60px;padding:4px;border:2px solid var(--border);border-radius:6px;font-size:13px;" oninput="Estimator.calc()"> hours</div></div>';

    // Crew + Equipment side by side
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    // Crew
    html += '<div style="padding:12px;background:#fff;border-radius:8px;border:1px solid var(--border);">'
      + '<div style="font-weight:600;margin-bottom:6px;font-size:13px;">Crew</div>';
    ['climber', 'bucketop', 'ground'].forEach(function(key) {
      var r = Estimator.RATES[key];
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'
        + '<input type="number" class="est-crew" data-key="' + key + '" value="0" min="0" max="10" style="width:40px;padding:3px;border:1px solid var(--border);border-radius:4px;font-size:13px;text-align:center;" oninput="Estimator.calc()">'
        + '<span style="font-size:12px;">' + r.label + '</span></div>';
    });
    html += '</div>';
    // Equipment
    html += '<div style="padding:12px;background:#fff;border-radius:8px;border:1px solid var(--border);">'
      + '<div style="font-weight:600;margin-bottom:6px;font-size:13px;">Equipment</div>';
    ['chipper', 'chiptruck', 'bucket', 'ram', 'loader', 'stump', 'crane', 'trailer'].forEach(function(key) {
      var r = Estimator.RATES[key];
      html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;margin-bottom:2px;">'
        + '<input type="checkbox" class="est-equip" data-key="' + key + '" onchange="Estimator.calc()" style="width:14px;height:14px;">'
        + r.label + '</label>';
    });
    html += '</div></div>';

    // Insurance (collapsed)
    html += '<div style="margin-top:8px;"><div style="display:flex;gap:6px;font-size:11px;color:var(--text-light);">';
    [['wc','WC',9],['gl','GL',5],['dis','Dis',2],['payroll','Tax',8],['auto','Auto',3]].forEach(function(ins) {
      html += '<span>' + ins[1] + ':<input type="number" class="est-ins" data-key="' + ins[0] + '" value="' + ins[2] + '" min="0" max="30" style="width:30px;padding:1px;border:1px solid var(--border);border-radius:3px;font-size:11px;text-align:center;" oninput="Estimator.calc()">%</span>';
    });
    html += '</div></div>';

    // Markup
    html += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;">'
      + '<span style="font-weight:600;font-size:13px;">Markup:</span>'
      + '<input type="number" id="est-markup" value="30" min="0" max="200" step="5" style="width:55px;padding:4px;border:2px solid var(--border);border-radius:6px;font-size:13px;text-align:center;" oninput="Estimator.calc()">%</div>';

    // Results
    html += '<div id="est-results" style="background:var(--green-dark);border-radius:8px;padding:14px;color:#fff;margin-top:10px;font-size:13px;"></div>';

    return html;
  },

  applyToQuote: function() {
    var calc = Estimator._lastCalc;
    if (!calc || !Estimator._callback) return;

    // Build quote line items from the calculation
    var items = calc.lineItems.map(function(li) {
      return { service: li.service, description: li.description, qty: li.qty, rate: li.rate, amount: li.amount };
    });

    // Add insurance as a line item
    if (calc.insurance > 0) {
      items.push({ service: 'Insurance & Compliance', description: 'WC, GL, Disability, Payroll, Auto', qty: 1, rate: calc.insurance, amount: calc.insurance });
    }

    // Add markup as a line item
    if (calc.markup > 0) {
      items.push({ service: 'Service Fee', description: 'Coordination, scheduling, management', qty: 1, rate: calc.markup, amount: calc.markup });
    }

    Estimator._callback(items, calc.total);
    UI.closeModal();
  }
};
