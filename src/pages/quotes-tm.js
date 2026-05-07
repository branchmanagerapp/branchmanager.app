/**
 * Branch Manager — Quotes T&M Module
 * Time & Material calculator + price comparison view + margin calc.
 * Extends the global QuotesPage object so all existing onclick handlers keep working.
 *
 * Loaded AFTER quotes.js in index.html.
 */
(function() {
  if (typeof QuotesPage === 'undefined') {
    console.warn('[quotes-tm] QuotesPage not defined yet — load order issue');
    return;
  }

  // Default rates — user can override in Settings → T&M Pricing Rates
  QuotesPage._TM_DEFAULTS = {
    climber: 175, ground: 125, foreman: 0,
    bucket: 75, chipper: 44, crane: 200, stumpGrinder: 50,
    miniSkid: 60, dumpTruck: 40, liftLadder: 60, trailer: 25,
    insurance: 0.31,  // WC 9% + GL 9% + disability 2% + payroll 8% + auto 3%
    markup: 1.5       // 50% markup on cost
  };

  // Read user-customized rates merged over defaults.
  // Key: bm-tm-rates (plain object in localStorage).
  QuotesPage.getTMRates = function() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('bm-tm-rates') || '{}'); } catch(e) {}
    var out = {};
    for (var k in QuotesPage._TM_DEFAULTS) out[k] = QuotesPage._TM_DEFAULTS[k];
    for (var k2 in saved) if (typeof saved[k2] === 'number') out[k2] = saved[k2];
    return out;
  };

  // Back-compat: code referencing QuotesPage._TM_RATES still works via getter
  Object.defineProperty(QuotesPage, '_TM_RATES', {
    get: function() { return QuotesPage.getTMRates(); },
    configurable: true
  });

  QuotesPage._showPricingMode = function(mode) {
    var pertree = document.getElementById('q-mode-pertree');
    var tm = document.getElementById('q-mode-tm');
    var tabPT = document.getElementById('q-tab-pertree');
    var tabTM = document.getElementById('q-tab-tm');
    if (mode === 'pertree') {
      pertree.style.display = 'block'; tm.style.display = 'none';
      tabPT.style.background = 'var(--green-dark)'; tabPT.style.color = '#fff';
      tabTM.style.background = 'var(--bg)'; tabTM.style.color = 'var(--text-light)';
    } else {
      pertree.style.display = 'none'; tm.style.display = 'block';
      tabTM.style.background = 'var(--accent)'; tabTM.style.color = '#fff';
      tabPT.style.background = 'var(--bg)'; tabPT.style.color = 'var(--text-light)';
    }
  };

  // Build a single equipment pill checkbox — rate read dynamically from settings
  QuotesPage._tmEquipPill = function(key, label, defaultRate, tmData) {
    var checked = !!tmData[key];
    var rates = QuotesPage.getTMRates();
    var rate = rates[key] || defaultRate;
    return '<label style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--white);border:2px solid ' + (checked ? 'var(--green-dark)' : 'var(--border)') + ';border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">'
      + '<input type="checkbox" id="q-tm-' + key.toLowerCase() + '" onchange="QuotesPage._calcTM();this.parentElement.style.borderColor=this.checked?\'var(--green-dark)\':\'var(--border)\';"' + (checked ? ' checked' : '') + ' style="width:18px;height:18px;">'
      + '<span style="flex:1;">' + label + '</span>'
      + '<span style="color:var(--text-light);font-size:12px;font-weight:500;">$' + rate + '/hr</span>'
      + '</label>';
  };

  QuotesPage._calcTM = function() {
    var r = QuotesPage._TM_RATES;
    function num(id) { var el = document.getElementById(id); return el ? (parseFloat(el.value) || 0) : 0; }
    function chk(id) { var el = document.getElementById(id); return !!(el && el.checked); }

    var climberCount = num('q-tm-climber-count');
    var groundCount  = num('q-tm-ground-count');
    var foremanCount = num('q-tm-foreman-count');
    var onSiteHrs = num('q-tm-total-hrs');
    var yardHrs   = num('q-tm-yard-hrs');
    var driveHrs  = num('q-tm-drive-hrs');
    var totalHrs  = onSiteHrs + yardHrs + driveHrs;
    var disposal  = num('q-tm-disposal');

    var EQUIP = [
      { key:'bucket',       id:'q-tm-bucket',       label:'Bucket truck',       rate:r.bucket },
      { key:'chipper',      id:'q-tm-chipper',      label:'Chipper',            rate:r.chipper },
      { key:'crane',        id:'q-tm-crane',        label:'Crane',              rate:r.crane },
      { key:'stumpGrinder', id:'q-tm-stumpgrinder', label:'Stump grinder',      rate:r.stumpGrinder },
      { key:'miniSkid',     id:'q-tm-miniskid',     label:'Mini-skid / loader', rate:r.miniSkid },
      { key:'dumpTruck',    id:'q-tm-dumptruck',    label:'Dump truck',         rate:r.dumpTruck },
      { key:'liftLadder',   id:'q-tm-liftladder',   label:'Man lift / ladder',  rate:r.liftLadder },
      { key:'trailer',      id:'q-tm-trailer',      label:'Trailer',            rate:r.trailer }
    ];
    var activeEquip = EQUIP.filter(function(e){ return chk(e.id); });
    var pinCounts = window._bmEquipCounts || {};

    var climberCost = climberCount * totalHrs * r.climber;
    var groundLaborCost = groundCount * totalHrs * r.ground;
    var foremanCost = foremanCount * totalHrs * r.foreman;
    var laborCost = climberCost + groundLaborCost + foremanCost;
    var equipCost = activeEquip.reduce(function(s,e){ var cnt = pinCounts[e.key] || 1; return s + (cnt * totalHrs * e.rate); }, 0);
    var insuranceCost = laborCost * r.insurance;
    var subtotalCost = laborCost + equipCost + insuranceCost + disposal;
    var tmTotal = Math.round(subtotalCost * r.markup);

    var breakdown = document.getElementById('q-tm-breakdown');
    if (breakdown) {
      function line(txt, amt, sub) {
        return '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--text-light);' + (sub ? 'padding-left:12px;' : '') + '"><span>' + txt + '</span><span>' + UI.money(amt) + '</span></div>';
      }
      function sectionHeader(txt) {
        return '<div style="font-size:11px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.04em;padding:8px 0 2px;">' + txt + '</div>';
      }
      function sectionTotal(txt, amt) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0 8px;border-bottom:1px dashed var(--border);font-weight:700;"><span>' + txt + '</span><span>' + UI.money(amt) + '</span></div>';
      }

      var hasLabor = laborCost > 0;
      var hasEquip = equipCost > 0;

      var html = '';

      // LABOR block
      if (hasLabor) {
        html += sectionHeader('Labor');
        if (climberCount > 0 && totalHrs > 0) html += line(climberCount + ' × Climber — ' + totalHrs + 'hr × $' + r.climber + '/hr', climberCost, true);
        if (groundCount > 0 && totalHrs > 0)  html += line(groundCount + ' × Groundsman — ' + totalHrs + 'hr × $' + r.ground + '/hr', groundLaborCost, true);
        if (foremanCount > 0 && totalHrs > 0) html += line(foremanCount + ' × Foreman — ' + totalHrs + 'hr × $' + r.foreman + '/hr', foremanCost, true);
        html += sectionTotal('Labor subtotal', laborCost);
      }

      // EQUIPMENT block
      if (hasEquip) {
        html += sectionHeader('Equipment');
        activeEquip.forEach(function(e) {
          if (totalHrs > 0) {
            var cnt = pinCounts[e.key] || 1;
            var label = (cnt > 1 ? cnt + ' × ' : '') + e.label + ' — ' + totalHrs + 'hr × $' + e.rate + '/hr';
            html += line(label, cnt * totalHrs * e.rate, true);
          }
        });
        html += sectionTotal('Equipment subtotal', equipCost);
      }

      if (!html) html = '<div style="font-size:12px;color:var(--text-light);padding:4px 0;">Enter crew counts + hours + pick equipment to see breakdown.</div>';

      // COMBINED
      if (hasLabor || hasEquip) {
        html += '<div style="display:flex;justify-content:space-between;padding:8px 0 3px;font-size:13px;"><span>Labor + Equipment</span><span style="font-weight:700;">' + UI.money(laborCost + equipCost) + '</span></div>';
        if (insuranceCost > 0) html += line('Insurance + overhead (' + Math.round((r.insurance || 0) * 100) + '%)', insuranceCost);
        if (disposal > 0) html += line('Disposal', disposal);
        if (subtotalCost > 0) html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border);font-weight:600;"><span>Cost</span><span>' + UI.money(subtotalCost) + '</span></div>';
        if (tmTotal > 0) html += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;color:var(--green-dark);"><span>T&M Price (' + r.markup + '× markup)</span><span>' + UI.money(tmTotal) + '</span></div>';
      }

      breakdown.innerHTML = html;
    }
    var tmTotalEl = document.getElementById('q-tm-total');
    if (tmTotalEl) tmTotalEl.textContent = 'T&M Total: ' + UI.money(tmTotal);

    var compareBtn = document.getElementById('q-compare-btn');
    if (compareBtn && tmTotal > 0) compareBtn.style.display = 'block';

    return tmTotal;
  };

  // ── Price Comparison Page ──
  QuotesPage._showPriceComparison = function() {
    // v642: was iterating .quote-item-row which is the Species/Location row,
    // not the wrapper — it has no .q-item-qty or .q-item-rate inside, so
    // querySelector('.q-item-qty').value crashed. Use .q-item-wrap.
    var perTreeTotal = 0;
    document.querySelectorAll('.q-item-wrap').forEach(function(wrap) {
      var qtyEl = wrap.querySelector('.q-item-qty');
      var rateEl = wrap.querySelector('.q-item-rate');
      var qty = qtyEl ? (parseFloat(qtyEl.value) || 0) : 0;
      var rate = rateEl ? (parseFloat(rateEl.value) || 0) : 0;
      perTreeTotal += qty * rate;
    });

    var tmTotal = QuotesPage._calcTM();
    var average = Math.round((perTreeTotal + tmTotal) / 2);
    var diff = Math.abs(perTreeTotal - tmTotal);
    var diffPct = perTreeTotal > 0 ? Math.round((diff / perTreeTotal) * 100) : 0;
    var higher = perTreeTotal >= tmTotal ? 'Per Tree' : 'T&M';
    var barMax = Math.max(perTreeTotal, tmTotal, 1);

    var panel = document.getElementById('q-comparison');
    if (!panel) return;

    panel.style.display = 'block';
    panel.innerHTML = '<div style="font-size:16px;font-weight:800;margin-bottom:16px;color:var(--green-dark);">📊 Price Comparison</div>'
      + '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px;"><span>Per Tree/Task</span><span>' + UI.money(perTreeTotal) + '</span></div>'
      + '<div style="background:#e2e8f0;border-radius:6px;height:8px;"><div style="background:var(--green-dark);border-radius:6px;height:100%;width:' + Math.round((perTreeTotal / barMax) * 100) + '%;"></div></div>'
      + '</div>'
      + '<div style="margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:4px;"><span>Time & Material</span><span>' + UI.money(tmTotal) + '</span></div>'
      + '<div style="background:#e2e8f0;border-radius:6px;height:8px;"><div style="background:var(--accent);border-radius:6px;height:100%;width:' + Math.round((tmTotal / barMax) * 100) + '%;"></div></div>'
      + '</div>'
      + '<div style="background:#fff;border-radius:8px;padding:14px;text-align:center;border:2px solid var(--accent);">'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">RECOMMENDED PRICE (Average)</div>'
      + '<div style="font-size:28px;font-weight:800;color:var(--green-dark);">' + UI.money(average) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">Difference: ' + UI.money(diff) + ' (' + diffPct + '%) — ' + higher + ' is higher</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button type="button" onclick="QuotesPage._usePrice(' + perTreeTotal + ')" class="btn btn-outline" style="flex:1;font-size:12px;">Use Per Tree (' + UI.money(perTreeTotal) + ')</button>'
      + '<button type="button" onclick="QuotesPage._usePrice(' + average + ')" class="btn btn-primary" style="flex:1;font-size:12px;background:var(--accent);">Use Average (' + UI.money(average) + ')</button>'
      + '<button type="button" onclick="QuotesPage._usePrice(' + tmTotal + ')" class="btn btn-outline" style="flex:1;font-size:12px;">Use T&M (' + UI.money(tmTotal) + ')</button>'
      + '</div>';

    panel.scrollIntoView({ behavior: 'smooth' });
  };

  QuotesPage._usePrice = function(price) {
    // v642: same .quote-item-row → .q-item-wrap fix as above.
    var currentTotal = 0;
    document.querySelectorAll('.q-item-wrap').forEach(function(wrap) {
      var qtyEl = wrap.querySelector('.q-item-qty');
      var rateEl = wrap.querySelector('.q-item-rate');
      var qty = qtyEl ? (parseFloat(qtyEl.value) || 0) : 0;
      var rate = rateEl ? (parseFloat(rateEl.value) || 0) : 0;
      currentTotal += qty * rate;
    });

    if (Math.abs(currentTotal - price) < 1) { UI.toast('Price already matches'); return; }

    var diff = price - currentTotal;
    if (diff > 0) {
      QuotesPage.addItem();
      setTimeout(function() {
        var wraps = document.querySelectorAll('.q-item-wrap');
        var last = wraps[wraps.length - 1];
        if (last) {
          var svc = last.querySelector('.q-item-service');
          var desc = last.querySelector('.q-item-desc');
          var qty = last.querySelector('.q-item-qty');
          var rate = last.querySelector('.q-item-rate');
          if (svc) svc.value = 'Price adjustment';
          if (desc) desc.value = 'Adjusted to match production estimate';
          if (qty) qty.value = '1';
          if (rate) rate.value = diff.toFixed(2);
        }
        QuotesPage.calcTotal();
        UI.toast('Price adjusted to ' + UI.money(price));
      }, 100);
    } else {
      UI.toast('To lower the price, edit individual line items');
    }
  };

  QuotesPage._updateMargin = function() {
    var costEl = document.getElementById('q-est-cost');
    var totalEl = document.getElementById('q-total-display');
    var profitEl = document.getElementById('q-profit-display');
    var pctEl = document.getElementById('q-margin-pct');
    if (!costEl || !totalEl || !profitEl) return;
    var cost = parseFloat(costEl.value) || 0;
    var total = parseFloat((totalEl.textContent || '').replace(/[^0-9.]/g, '')) || 0;
    var profit = total - cost;
    var margin = total > 0 ? Math.round((profit / total) * 100) : 0;
    profitEl.textContent = UI.money(profit);
    profitEl.style.color = profit >= 0 ? 'var(--green-dark)' : 'var(--red)';
    if (pctEl) {
      pctEl.textContent = '(' + margin + '%)';
      pctEl.style.color = margin >= 40 ? 'var(--green-dark)' : margin >= 20 ? '#e07c24' : 'var(--red)';
    }
  };
})();
