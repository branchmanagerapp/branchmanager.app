/**
 * Branch Manager — Tree Measurement Tool
 * Measure tree height (tangent method) and DBH (circumference → diameter)
 * Links to estimator for instant price quotes
 */
var TreeMeasure = {

  // State
  height: null,
  dbh: null,

  render: function() {
    var html = '<div style="max-width:800px;margin:0 auto;">';

    // ── Height Calculator ──
    html += '<div class="card" style="margin-bottom:20px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
      + '<div style="width:40px;height:40px;background:var(--accent-light);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🌲</div>'
      + '<div><div style="font-weight:700;font-size:16px;">Tree Height</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Tangent method — stand back, measure the angle up</div></div>'
      + '</div>';

    // Method selector
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;">'
      + '<button class="btn btn-sm" id="method-angle" onclick="TreeMeasure.setMethod(\'angle\')" style="flex:1;padding:8px;font-size:13px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;">Phone Angle</button>'
      + '<button class="btn btn-sm" id="method-manual" onclick="TreeMeasure.setMethod(\'manual\')" style="flex:1;padding:8px;font-size:13px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Manual Entry</button>'
      + '</div>';

    // Phone angle method
    html += '<div id="angle-method">'
      + '<div style="background:var(--bg);border-radius:8px;padding:16px;margin-bottom:12px;">'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">'
      + '<strong>How it works:</strong> Stand a known distance from the tree. Point your phone at the top of the tree — the accelerometer reads the angle. Height = distance × tan(angle) + your eye height.'
      + '</div>'

      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div class="form-group"><label>Distance from tree (ft)</label>'
      + '<input type="number" id="tm-distance" value="50" min="1" step="1" onchange="TreeMeasure.calcHeight()" style="font-size:16px;"></div>'
      + '<div class="form-group"><label>Your eye height (ft)</label>'
      + '<input type="number" id="tm-eyeheight" value="5.5" min="1" step="0.5" onchange="TreeMeasure.calcHeight()" style="font-size:16px;"></div>'
      + '</div>'

      + '<div style="text-align:center;margin:16px 0;">'
      + '<div id="tm-angle-display" style="font-size:48px;font-weight:800;color:var(--accent);line-height:1;">0°</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">Tilt angle</div>'
      + '</div>'

      + '<button class="btn btn-primary" onclick="TreeMeasure.startAngleCapture()" id="tm-capture-btn" style="width:100%;padding:12px;font-size:15px;font-weight:600;">'
      + '📱 Point at Tree Top & Tap to Capture'
      + '</button>'
      + '<div id="tm-angle-status" style="font-size:12px;color:var(--text-light);text-align:center;margin-top:8px;"></div>'
      + '</div>'
      + '</div>';

    // Manual angle entry
    html += '<div id="manual-method" style="display:none;">'
      + '<div style="background:var(--bg);border-radius:8px;padding:16px;margin-bottom:12px;">'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">'
      + '<strong>Manual:</strong> Use a clinometer or protractor app to measure the angle to the tree top, then enter values below.'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
      + '<div class="form-group"><label>Distance (ft)</label>'
      + '<input type="number" id="tm-distance-m" value="50" min="1" step="1" onchange="TreeMeasure.calcHeightManual()" style="font-size:16px;"></div>'
      + '<div class="form-group"><label>Angle (°)</label>'
      + '<input type="number" id="tm-angle-m" value="45" min="1" max="89" step="1" onchange="TreeMeasure.calcHeightManual()" style="font-size:16px;"></div>'
      + '<div class="form-group"><label>Eye height (ft)</label>'
      + '<input type="number" id="tm-eyeheight-m" value="5.5" min="1" step="0.5" onchange="TreeMeasure.calcHeightManual()" style="font-size:16px;"></div>'
      + '</div>'
      + '</div>'
      + '</div>';

    // Height result
    html += '<div id="tm-height-result" style="display:none;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:10px;padding:16px;margin-bottom:8px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<div><div style="font-size:12px;color:#166534;font-weight:600;">ESTIMATED HEIGHT</div>'
      + '<div style="font-size:36px;font-weight:800;color:#15803d;" id="tm-height-val">—</div></div>'
      + '<div style="text-align:right;font-size:12px;color:#166534;" id="tm-height-detail"></div>'
      + '</div>'
      + '</div>';

    html += '</div>';

    // ── DBH Calculator ──
    html += '<div class="card" style="margin-bottom:20px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
      + '<div style="width:40px;height:40px;background:#fef3c7;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">📏</div>'
      + '<div><div style="font-weight:700;font-size:16px;">DBH (Diameter at Breast Height)</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Measured at 4.5 ft from ground — the industry standard</div></div>'
      + '</div>';

    // DBH method selector
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;">'
      + '<button class="btn btn-sm" id="dbh-tape" onclick="TreeMeasure.setDBHMethod(\'tape\')" style="flex:1;padding:8px;font-size:13px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;">Tape Measure</button>'
      + '<button class="btn btn-sm" id="dbh-direct" onclick="TreeMeasure.setDBHMethod(\'direct\')" style="flex:1;padding:8px;font-size:13px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Known Diameter</button>'
      + '</div>';

    // Tape method (circumference → diameter)
    html += '<div id="dbh-tape-method">'
      + '<div style="background:var(--bg);border-radius:8px;padding:16px;">'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">'
      + 'Wrap a tape measure around the trunk at <strong>4.5 feet</strong> from the ground. Enter the circumference — we\'ll calculate the diameter.'
      + '</div>'
      + '<div class="form-group"><label>Circumference (inches)</label>'
      + '<input type="number" id="tm-circumference" placeholder="e.g. 75" min="1" step="0.5" onchange="TreeMeasure.calcDBH()" style="font-size:16px;"></div>'
      + '</div>'
      + '</div>';

    // Direct diameter
    html += '<div id="dbh-direct-method" style="display:none;">'
      + '<div style="background:var(--bg);border-radius:8px;padding:16px;">'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">'
      + 'Enter the diameter directly if you already measured or estimated it.'
      + '</div>'
      + '<div class="form-group"><label>Diameter (inches)</label>'
      + '<input type="number" id="tm-diameter" placeholder="e.g. 24" min="1" step="0.5" onchange="TreeMeasure.calcDBHDirect()" style="font-size:16px;"></div>'
      + '</div>'
      + '</div>';

    // DBH result
    html += '<div id="tm-dbh-result" style="display:none;background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:10px;padding:16px;margin-top:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<div><div style="font-size:12px;color:#92400e;font-weight:600;">DBH</div>'
      + '<div style="font-size:36px;font-weight:800;color:#b45309;" id="tm-dbh-val">—</div></div>'
      + '<div style="text-align:right;" id="tm-dbh-detail">'
      + '<div style="font-size:12px;color:#92400e;" id="tm-dbh-class"></div>'
      + '</div>'
      + '</div>'
      + '</div>';

    html += '</div>';

    // ── Quick Estimate ──
    html += '<div class="card" style="margin-bottom:20px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
      + '<div style="width:40px;height:40px;background:var(--green-bg);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">💰</div>'
      + '<div><div style="font-weight:700;font-size:16px;">Quick Price Estimate</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Based on DBH × $100/inch rule of thumb</div></div>'
      + '</div>';

    html += '<div id="tm-estimate" style="display:none;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div class="form-group"><label>Complexity</label>'
      + '<select id="tm-complexity" onchange="TreeMeasure.calcEstimate()" style="font-size:14px;">'
      + '<option value="0.8">Easy — open area, no obstacles</option>'
      + '<option value="1" selected>Standard — typical residential</option>'
      + '<option value="1.3">Moderate — near structure/power lines</option>'
      + '<option value="1.6">Difficult — tight access, crane needed</option>'
      + '<option value="2">Hazardous — storm damage, hung up</option>'
      + '</select></div>'
      + '<div class="form-group"><label>Stump Grinding?</label>'
      + '<select id="tm-stump" onchange="TreeMeasure.calcEstimate()" style="font-size:14px;">'
      + '<option value="0">No</option>'
      + '<option value="1" selected>Yes — standard</option>'
      + '<option value="2">Yes — large/deep</option>'
      + '</select></div>'
      + '</div>'

      + '<div style="background:linear-gradient(135deg,var(--green-bg),var(--green-bg));border-radius:10px;padding:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<div><div style="font-size:12px;color:var(--green-dark);font-weight:600;">ESTIMATED REMOVAL PRICE</div>'
      + '<div style="font-size:36px;font-weight:800;color:var(--accent);" id="tm-price-val">—</div></div>'
      + '<div style="text-align:right;">'
      + '<div style="font-size:12px;color:var(--green-dark);" id="tm-price-breakdown"></div>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button class="btn btn-primary" onclick="TreeMeasure.openEstimator()" style="flex:1;">Open Full Estimator</button>'
      + '<button class="btn btn-outline" onclick="TreeMeasure.saveToQuote()" style="flex:1;">Add to Quote</button>'
      + '</div>'
      + '</div>';

    html += '<div id="tm-estimate-empty" style="text-align:center;padding:20px;color:var(--text-light);">'
      + '<p>Enter tree height or DBH above to see pricing estimate</p>'
      + '</div>';

    html += '</div>';

    // ── Reference Chart ──
    html += '<div class="card" style="margin-bottom:20px;">'
      + '<div style="font-weight:700;font-size:15px;margin-bottom:12px;">Quick Reference</div>'
      + '<table class="data-table" style="font-size:13px;">'
      + '<thead><tr><th>DBH</th><th>Tree Class</th><th>Typical Height</th><th>Base Price</th></tr></thead>'
      + '<tbody>'
      + '<tr><td>6-12"</td><td>Small</td><td>20-35 ft</td><td>$600-$1,200</td></tr>'
      + '<tr><td>12-18"</td><td>Medium</td><td>35-50 ft</td><td>$1,200-$1,800</td></tr>'
      + '<tr><td>18-24"</td><td>Large</td><td>50-70 ft</td><td>$1,800-$2,400</td></tr>'
      + '<tr><td>24-36"</td><td>Very Large</td><td>60-90 ft</td><td>$2,400-$3,600</td></tr>'
      + '<tr><td>36-48"</td><td>Massive</td><td>70-100+ ft</td><td>$3,600-$4,800</td></tr>'
      + '<tr><td>48"+</td><td>Heritage</td><td>80-120+ ft</td><td>$4,800+</td></tr>'
      + '</tbody></table>'
      + '</div>';

    html += '</div>';
    return html;
  },

  // ── Method Toggles ──
  setMethod: function(method) {
    document.getElementById('angle-method').style.display = method === 'angle' ? 'block' : 'none';
    document.getElementById('manual-method').style.display = method === 'manual' ? 'block' : 'none';
    document.getElementById('method-angle').style.background = method === 'angle' ? 'var(--accent)' : 'var(--bg)';
    document.getElementById('method-angle').style.color = method === 'angle' ? '#fff' : 'var(--text)';
    document.getElementById('method-angle').style.border = method === 'angle' ? 'none' : '1px solid var(--border)';
    document.getElementById('method-manual').style.background = method === 'manual' ? 'var(--accent)' : 'var(--bg)';
    document.getElementById('method-manual').style.color = method === 'manual' ? '#fff' : 'var(--text)';
    document.getElementById('method-manual').style.border = method === 'manual' ? 'none' : '1px solid var(--border)';
    if (method === 'manual') TreeMeasure.calcHeightManual();
  },

  setDBHMethod: function(method) {
    document.getElementById('dbh-tape-method').style.display = method === 'tape' ? 'block' : 'none';
    document.getElementById('dbh-direct-method').style.display = method === 'direct' ? 'block' : 'none';
    document.getElementById('dbh-tape').style.background = method === 'tape' ? 'var(--accent)' : 'var(--bg)';
    document.getElementById('dbh-tape').style.color = method === 'tape' ? '#fff' : 'var(--text)';
    document.getElementById('dbh-tape').style.border = method === 'tape' ? 'none' : '1px solid var(--border)';
    document.getElementById('dbh-direct').style.background = method === 'direct' ? 'var(--accent)' : 'var(--bg)';
    document.getElementById('dbh-direct').style.color = method === 'direct' ? '#fff' : 'var(--text)';
    document.getElementById('dbh-direct').style.border = method === 'direct' ? 'none' : '1px solid var(--border)';
  },

  // ── Phone Accelerometer for Angle ──
  _listening: false,
  _currentAngle: 0,

  startAngleCapture: function() {
    var btn = document.getElementById('tm-capture-btn');
    var status = document.getElementById('tm-angle-status');

    if (TreeMeasure._listening) {
      // Capture current angle
      TreeMeasure._listening = false;
      window.removeEventListener('deviceorientation', TreeMeasure._handleOrientation);
      btn.textContent = '📱 Point at Tree Top & Tap to Capture';
      btn.style.background = '';
      TreeMeasure.calcHeight();
      status.textContent = 'Angle captured! Tap again to re-measure.';
      return;
    }

    // Check for permission (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function(state) {
        if (state === 'granted') {
          TreeMeasure._startListening();
        } else {
          status.textContent = 'Permission denied. Use Manual Entry instead.';
          TreeMeasure.setMethod('manual');
        }
      }).catch(function() {
        status.textContent = 'Could not access sensors. Use Manual Entry.';
        TreeMeasure.setMethod('manual');
      });
    } else if (window.DeviceOrientationEvent) {
      TreeMeasure._startListening();
    } else {
      status.textContent = 'Device orientation not supported. Use Manual Entry.';
      TreeMeasure.setMethod('manual');
    }
  },

  _startListening: function() {
    TreeMeasure._listening = true;
    var btn = document.getElementById('tm-capture-btn');
    btn.textContent = '🎯 TAP to lock angle';
    btn.style.background = '#dc2626';
    document.getElementById('tm-angle-status').textContent = 'Point phone at tree top...';
    window.addEventListener('deviceorientation', TreeMeasure._handleOrientation);
  },

  _handleOrientation: function(e) {
    // beta = front-to-back tilt (-180 to 180), 0 = flat, 90 = vertical
    var angle = e.beta || 0;
    // When holding phone vertical and tilting up, beta decreases from 90
    // We want the angle from horizontal: 90 - beta
    var tiltAngle = Math.max(0, Math.min(89, 90 - angle));
    TreeMeasure._currentAngle = tiltAngle;

    var display = document.getElementById('tm-angle-display');
    if (display) display.textContent = Math.round(tiltAngle) + '°';
  },

  // ── Height Calculations ──
  calcHeight: function() {
    var dist = parseFloat(document.getElementById('tm-distance').value) || 0;
    var eyeH = parseFloat(document.getElementById('tm-eyeheight').value) || 5.5;
    var angle = TreeMeasure._currentAngle;
    if (!dist || !angle) return;

    var radians = angle * Math.PI / 180;
    var height = dist * Math.tan(radians) + eyeH;
    TreeMeasure._showHeight(height, dist, angle, eyeH);
  },

  calcHeightManual: function() {
    var dist = parseFloat(document.getElementById('tm-distance-m').value) || 0;
    var angle = parseFloat(document.getElementById('tm-angle-m').value) || 0;
    var eyeH = parseFloat(document.getElementById('tm-eyeheight-m').value) || 5.5;
    if (!dist || !angle) return;

    var radians = angle * Math.PI / 180;
    var height = dist * Math.tan(radians) + eyeH;
    TreeMeasure._showHeight(height, dist, angle, eyeH);
  },

  _showHeight: function(height, dist, angle, eyeH) {
    TreeMeasure.height = Math.round(height);
    document.getElementById('tm-height-result').style.display = 'block';
    document.getElementById('tm-height-val').textContent = Math.round(height) + ' ft';
    document.getElementById('tm-height-detail').innerHTML =
      dist + ' ft back<br>' + Math.round(angle) + '° angle<br>' + eyeH + ' ft eye height';
    TreeMeasure.calcEstimate();
  },

  // ── DBH Calculations ──
  calcDBH: function() {
    var circ = parseFloat(document.getElementById('tm-circumference').value) || 0;
    if (!circ) return;
    var diameter = circ / Math.PI;
    TreeMeasure._showDBH(diameter, circ);
  },

  calcDBHDirect: function() {
    var diameter = parseFloat(document.getElementById('tm-diameter').value) || 0;
    if (!diameter) return;
    TreeMeasure._showDBH(diameter, diameter * Math.PI);
  },

  _showDBH: function(diameter, circumference) {
    TreeMeasure.dbh = Math.round(diameter * 10) / 10;
    document.getElementById('tm-dbh-result').style.display = 'block';
    document.getElementById('tm-dbh-val').textContent = TreeMeasure.dbh + '"';
    // Size class
    var cls = '';
    if (diameter < 12) cls = 'Small tree';
    else if (diameter < 18) cls = 'Medium tree';
    else if (diameter < 24) cls = 'Large tree';
    else if (diameter < 36) cls = 'Very large tree';
    else if (diameter < 48) cls = 'Massive tree';
    else cls = 'Heritage tree';
    document.getElementById('tm-dbh-detail').innerHTML =
      Math.round(circumference * 10) / 10 + '" circumference<br><span style="font-weight:600;">' + cls + '</span>';

    TreeMeasure.calcEstimate();
  },

  // ── Price Estimate ──
  calcEstimate: function() {
    var dbh = TreeMeasure.dbh;
    if (!dbh) return;

    document.getElementById('tm-estimate').style.display = 'block';
    document.getElementById('tm-estimate-empty').style.display = 'none';

    var complexity = parseFloat(document.getElementById('tm-complexity').value) || 1;
    var stumpOpt = parseInt(document.getElementById('tm-stump').value) || 0;

    // Base: $100/inch DBH
    var base = dbh * 100;
    var adjusted = base * complexity;

    // Stump grinding
    var stumpCost = 0;
    if (stumpOpt === 1) stumpCost = Math.max(150, dbh * 8);
    if (stumpOpt === 2) stumpCost = Math.max(250, dbh * 15);
    var total = adjusted + stumpCost;

    // Round to nearest $50
    total = Math.round(total / 50) * 50;

    document.getElementById('tm-price-val').textContent = '$' + total.toLocaleString();
    var breakdown = 'DBH: ' + dbh + '" × $100 = $' + Math.round(base).toLocaleString();
    if (complexity !== 1) breakdown += '<br>Complexity: ×' + complexity;
    if (stumpCost > 0) breakdown += '<br>Stump: +$' + Math.round(stumpCost).toLocaleString();
    if (TreeMeasure.height) breakdown += '<br>Height: ~' + TreeMeasure.height + ' ft';
    document.getElementById('tm-price-breakdown').innerHTML = breakdown;
  },

  // ── Actions ──
  openEstimator: function() {
    Estimator.show();
  },

  saveToQuote: function() {
    var dbh = TreeMeasure.dbh || 0;
    var height = TreeMeasure.height || 0;
    var complexity = document.getElementById('tm-complexity') ?
      document.getElementById('tm-complexity').options[document.getElementById('tm-complexity').selectedIndex].text : 'Standard';

    // Store measurement for quote form to pick up
    localStorage.setItem('bm-tree-measure', JSON.stringify({
      dbh: dbh,
      height: height,
      complexity: complexity,
      timestamp: new Date().toISOString()
    }));

    UI.toast('Measurement saved — opening new quote');
    loadPage('quotes');
    setTimeout(function() { QuotesPage.showForm(); }, 300);
  }
};
