/**
 * Branch Manager — Time & Location Tracking (Rewind-style)
 *
 * Rebuilt to mirror the "Rewind" automatic time-at-place tracker Doug uses:
 *   • Calendar — a vertical day-timeline (7-day week), color blocks per place
 *     with durations, plus a daily total under each column.
 *   • Charts   — Weeks / Months / Years. A donut of time-share by place (with
 *     a Total in the middle) and a line of time-per-day over the period.
 *   • Places   — a map with a colored pin per place + an address list; tap a
 *     place to rename it.
 *
 * Source data = `detected_locations` (the passive tracker's dwells: each row is
 * a visit with first_seen_at / last_seen_at / dwell_minutes / center coords).
 * Places are clustered by proximity (~110m). Names come from (1) a user rename,
 * (2) a cached Nominatim reverse-geocode, else the coordinates until geocoded.
 */
var TrackingPage = {

  _view:       'calendar',     // calendar | charts | places
  _weekStart:  null,           // Sunday 00:00 local of the displayed week
  _chartScope: 'months',       // weeks | months | years
  _periodRef:  null,           // Date anchoring the charts period
  _dwells:     [],             // raw detected_locations rows
  _places:     [],             // clustered: {key,lat,lng,name,addr,color,total,visits:[{start,end,min,place}]}
  _map:        null,
  _markers:    [],
  _loading:    false,
  _geoQueue:   [],
  _geoBusy:    false,

  // Rewind-ish palette — biggest place gets the lead cyan, then green, etc.
  _PALETTE: ['#34c3eb','#8bc34a','#7e57c2','#ff9800','#26a69a','#ec407a',
             '#5c6bc0','#ffb300','#ef5350','#8d6e63','#00897b','#c0ca33'],

  // ── Shell ────────────────────────────────────────────────────────────────
  render: function() {
    if (!TrackingPage._weekStart) TrackingPage._weekStart = TrackingPage._startOfWeek(new Date());
    if (!TrackingPage._periodRef) TrackingPage._periodRef = new Date();

    var html = ''
      + '<style>' + TrackingPage._css() + '</style>'
      + '<div class="trk-wrap">'
      +   '<div class="trk-head">'
      +     '<div><h2 class="trk-title">🛰 Time Tracking</h2>'
      +       '<div class="trk-sub" id="trk-status">Loading…</div></div>'
      +     '<button class="trk-refresh" onclick="TrackingPage._load(true)" title="Refresh">⟳</button>'
      +   '</div>'
      +   '<div class="trk-seg" id="trk-seg">'
      +     '<button data-v="calendar" onclick="TrackingPage._switch(\'calendar\')">Calendar</button>'
      +     '<button data-v="charts"   onclick="TrackingPage._switch(\'charts\')">Charts</button>'
      +     '<button data-v="places"   onclick="TrackingPage._switch(\'places\')">Places</button>'
      +   '</div>'
      +   '<div id="trk-body" class="trk-body"><div class="trk-empty">Loading…</div></div>'
      + '</div>';

    document.getElementById('pageContent').innerHTML = html;
    var pt = document.getElementById('pageTitle'); if (pt) pt.textContent = 'Time Tracking';
    var pa = document.getElementById('pageAction'); if (pa) pa.style.display = 'none';

    TrackingPage._paintSeg();
    TrackingPage._load();
  },

  _switch: function(v) {
    TrackingPage._view = v;
    TrackingPage._paintSeg();
    TrackingPage._renderView();
  },

  _paintSeg: function() {
    var seg = document.getElementById('trk-seg');
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b) {
      b.classList.toggle('on', b.getAttribute('data-v') === TrackingPage._view);
    });
  },

  // ── Data load + place clustering ───────────────────────────────────────────
  _load: function(force) {
    if (TrackingPage._loading) return;
    TrackingPage._loading = true;
    TrackingPage._renderStatus();

    if (!SupabaseDB || !SupabaseDB.ready) {
      TrackingPage._loading = false;
      var b = document.getElementById('trk-body');
      if (b) b.innerHTML = '<div class="trk-empty">Supabase not ready — refresh the app.</div>';
      return;
    }
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) { TrackingPage._loading = false; return; }

    SupabaseDB.client.from('detected_locations')
      .select('*')
      .eq('tenant_id', tid)
      .order('first_seen_at', { ascending: true })
      .limit(2000)
      .then(function(res) {
        TrackingPage._loading = false;
        if (res.error) {
          var b = document.getElementById('trk-body');
          if (b) b.innerHTML = '<div class="trk-empty" style="color:var(--red)">Error: ' + UI.esc(res.error.message)
            + '<br><small>Run migrate-location-tracking.sql if the table is missing.</small></div>';
          return;
        }
        TrackingPage._dwells = (res.data || []).filter(function(r){
          return r.status !== 'ignored' && r.center_lat && r.center_lng;
        });
        TrackingPage._buildPlaces();
        TrackingPage._renderStatus();
        TrackingPage._renderView();
      });
  },

  _buildPlaces: function() {
    var places = [];
    function find(lat, lng) {
      for (var i = 0; i < places.length; i++) {
        if (TrackingPage._haversine(lat, lng, places[i].lat, places[i].lng) <= 110) return places[i];
      }
      return null;
    }
    TrackingPage._dwells.forEach(function(d) {
      var start = d.first_seen_at ? new Date(d.first_seen_at) : null;
      if (!start) return;
      var end = d.last_seen_at ? new Date(d.last_seen_at)
              : new Date(start.getTime() + (d.dwell_minutes || 0) * 60000);
      var min = Math.max(1, Math.round((end - start) / 60000) || (d.dwell_minutes || 0));
      var p = find(d.center_lat, d.center_lng);
      if (!p) {
        p = { key: TrackingPage._nameKey(d.center_lat, d.center_lng),
              lat: d.center_lat, lng: d.center_lng, n: 0,
              name: null, addr: null, color: '#34c3eb', total: 0, visits: [],
              dwellLabel: d.label || null };
        places.push(p);
      }
      // running mean center
      p.n += 1;
      p.lat = p.lat + (d.center_lat - p.lat) / p.n;
      p.lng = p.lng + (d.center_lng - p.lng) / p.n;
      if (!p.dwellLabel && d.label) p.dwellLabel = d.label;
      p.total += min;
      p.visits.push({ start: start, end: end, min: min, place: p });
    });

    // Names: user rename > tagged label > cached reverse-geocode > coords
    places.forEach(function(p) {
      var override = null;
      try { override = localStorage.getItem('bm-place-name-' + p.key); } catch(e) {}
      var cached = null, cachedAddr = null;
      try {
        cached     = localStorage.getItem('bm-revgeo-name-' + p.key);
        cachedAddr = localStorage.getItem('bm-revgeo-addr-' + p.key);
      } catch(e) {}
      p.name = override || p.dwellLabel || cached || (p.lat.toFixed(4) + ', ' + p.lng.toFixed(4));
      p.addr = cachedAddr || (p.lat.toFixed(5) + ', ' + p.lng.toFixed(5));
      p.needsGeo = !override && !p.dwellLabel && !cached;
    });

    // Stable colors: biggest total = lead color
    places.sort(function(a, b){ return b.total - a.total; });
    places.forEach(function(p, i){ p.color = TrackingPage._PALETTE[i % TrackingPage._PALETTE.length]; });
    TrackingPage._places = places;

    // Queue reverse-geocoding for unnamed places
    TrackingPage._geoQueue = places.filter(function(p){ return p.needsGeo; });
    TrackingPage._drainGeo();
  },

  // Reverse-geocode one place/sec (Nominatim policy), cache, repaint when done
  _drainGeo: function() {
    if (TrackingPage._geoBusy) return;
    var p = TrackingPage._geoQueue.shift();
    if (!p) return;
    TrackingPage._geoBusy = true;
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&lat=' + p.lat + '&lon=' + p.lng)
      .then(function(r){ return r.json(); })
      .then(function(j) {
        var a = (j && j.address) || {};
        var line1 = (a.house_number ? a.house_number + ' ' : '') + (a.road || a.neighbourhood || a.hamlet || '');
        var town  = a.city || a.town || a.village || a.hamlet || a.county || '';
        var name  = (line1.trim() || town || (j && j.name) || '').trim();
        var full  = (j && j.display_name) ? j.display_name.split(',').slice(0, 4).join(',').trim() : '';
        if (name) { p.name = name; try { localStorage.setItem('bm-revgeo-name-' + p.key, name); } catch(e){} }
        if (full) { p.addr = full; try { localStorage.setItem('bm-revgeo-addr-' + p.key, full); } catch(e){} }
        p.needsGeo = false;
      })
      .catch(function(){})
      .then(function() {
        TrackingPage._geoBusy = false;
        // light repaint of the current view so new names show
        if (TrackingPage._view !== 'charts') TrackingPage._renderView();
        else TrackingPage._renderView();
        setTimeout(TrackingPage._drainGeo, 1100);
      });
  },

  _renderStatus: function() {
    var el = document.getElementById('trk-status');
    if (!el) return;
    var on = false; try { on = localStorage.getItem('bm-passive-track') === 'true'; } catch(e) {}
    var running = (typeof PassiveTracker !== 'undefined' && PassiveTracker.status) ? PassiveTracker.status().running : false;
    var nPlaces = TrackingPage._places.length;
    var dot = on && running ? '#22a559' : (on ? '#e07c24' : '#9aa6a0');
    var txt = on && running ? 'Tracking active' : (on ? 'Enabled · foreground only' : 'Tracking off');
    var toggle = on
      ? '<a class="trk-link" onclick="try{localStorage.setItem(\'bm-passive-track\',\'false\');PassiveTracker.stop();}catch(e){}; TrackingPage._renderStatus();">turn off</a>'
      : '<a class="trk-link" onclick="try{localStorage.setItem(\'bm-passive-track\',\'true\');PassiveTracker.start();}catch(e){}; TrackingPage._renderStatus();">turn on</a>';
    el.innerHTML = '<span class="trk-dot" style="background:' + dot + '"></span>' + txt
      + ' · ' + nPlaces + ' place' + (nPlaces === 1 ? '' : 's') + ' · ' + toggle;
  },

  _renderView: function() {
    if      (TrackingPage._view === 'charts') TrackingPage._renderCharts();
    else if (TrackingPage._view === 'places') TrackingPage._renderPlaces();
    else TrackingPage._renderCalendar();
  },

  // ── CALENDAR (week day-timeline) ───────────────────────────────────────────
  _renderCalendar: function() {
    var body = document.getElementById('trk-body');
    if (!body) return;
    var ws = TrackingPage._weekStart;
    var we = new Date(ws.getTime() + 7 * 86400000);

    // Build per-day segments (split visits at midnight)
    var days = [[],[],[],[],[],[],[]];
    var dayTotals = [0,0,0,0,0,0,0];
    TrackingPage._places.forEach(function(p) {
      p.visits.forEach(function(v) {
        if (v.end <= ws || v.start >= we) return;
        var s = v.start < ws ? new Date(ws) : v.start;
        var e = v.end   > we ? new Date(we) : v.end;
        var cur = new Date(s);
        while (cur < e) {
          var di = Math.floor((cur - ws) / 86400000);
          var dayEnd = new Date(ws.getTime() + (di + 1) * 86400000);
          var segEnd = e < dayEnd ? e : dayEnd;
          var startMin = (cur.getHours() * 60 + cur.getMinutes());
          var endMin   = startMin + (segEnd - cur) / 60000;
          if (di >= 0 && di < 7) {
            days[di].push({ s: startMin, e: endMin, p: p });
            dayTotals[di] += (segEnd - cur) / 60000;
          }
          cur = segEnd;
        }
      });
    });

    // Active hour range across the week (compact, data-driven)
    var minH = 24, maxH = 0, any = false;
    days.forEach(function(segs){ segs.forEach(function(g){ any = true;
      minH = Math.min(minH, Math.floor(g.s / 60));
      maxH = Math.max(maxH, Math.ceil(g.e / 60)); }); });
    if (!any) { minH = 6; maxH = 20; }
    minH = Math.max(0, minH - 1); maxH = Math.min(24, maxH + 1);
    if (maxH - minH < 6) maxH = Math.min(24, minH + 6);
    var HPX = 46, rows = maxH - minH, gridH = rows * HPX;

    var now = new Date();
    var todayIdx = (now >= ws && now < we) ? Math.floor((now - ws) / 86400000) : -1;
    var dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // header (Today / range / Date)
    var label = ws.toLocaleDateString([], { month: 'long', year: 'numeric' });
    var html = '<div class="trk-nav">'
      + '<button class="trk-pill" onclick="TrackingPage._calToday()">Today</button>'
      + '<div class="trk-navmid"><button class="trk-arrow" onclick="TrackingPage._calWeek(-1)">‹</button>'
      +   '<span>' + label + '</span>'
      +   '<button class="trk-arrow" onclick="TrackingPage._calWeek(1)">›</button></div>'
      + '<button class="trk-pill" onclick="TrackingPage._calPickDate()">Date</button>'
      + '</div>';

    // day headers
    html += '<div class="cal-headrow"><div class="cal-gutter"></div>';
    for (var d = 0; d < 7; d++) {
      var day = new Date(ws.getTime() + d * 86400000);
      html += '<div class="cal-dhead' + (d === todayIdx ? ' today' : '') + '">'
        + '<div class="cal-dn">' + dn[d] + '</div>'
        + '<div class="cal-dd">' + day.getDate() + '</div></div>';
    }
    html += '</div>';

    // scroll body: hour gutter + 7 columns
    html += '<div class="cal-scroll"><div class="cal-grid" style="height:' + gridH + 'px;">';
    html += '<div class="cal-gutter">';
    for (var h = minH; h < maxH; h++) {
      var hr = h % 12 === 0 ? 12 : h % 12, ap = h < 12 ? 'AM' : 'PM';
      html += '<div class="cal-hr" style="height:' + HPX + 'px;"><span>' + hr + ' ' + ap + '</span></div>';
    }
    html += '</div>';

    for (var c = 0; c < 7; c++) {
      html += '<div class="cal-col' + (c === todayIdx ? ' today' : '') + '">';
      for (var hh = minH; hh < maxH; hh++) html += '<div class="cal-cell" style="height:' + HPX + 'px;"></div>';
      days[c].forEach(function(g) {
        var top = (g.s / 60 - minH) * HPX;
        var ht  = Math.max(15, (g.e - g.s) / 60 * HPX);
        var tall = ht > 70;
        var dur = TrackingPage._fmtDur(g.e - g.s);
        html += '<div class="cal-block' + (tall ? ' tall' : '') + '" style="top:' + top + 'px;height:' + ht + 'px;background:'
          + g.p.color + ';" onclick="TrackingPage._switch(\'places\')" title="' + UI.esc(g.p.name) + ' · ' + dur + '">'
          + (tall ? '<span class="cb-name-v">' + UI.esc(g.p.name) + '</span>' : '<span class="cb-name">' + UI.esc(g.p.name) + '</span>')
          + '<span class="cb-dur">' + dur + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div></div>';

    // daily totals
    html += '<div class="cal-totrow"><div class="cal-gutter"></div>';
    for (var t = 0; t < 7; t++) {
      html += '<div class="cal-tot' + (t === todayIdx ? ' today' : '') + '">'
        + (dayTotals[t] > 0 ? TrackingPage._fmtDur(dayTotals[t]) : '–') + '</div>';
    }
    html += '</div>';

    if (!any) html += '<div class="trk-empty" style="margin-top:14px;">No tracked time this week. The tracker logs places you stay 60+ min while Branch Manager is open.</div>';

    body.innerHTML = html;
    // auto-scroll to first activity
    var sc = body.querySelector('.cal-scroll'); if (sc) sc.scrollTop = 0;
  },

  _calWeek: function(dir) {
    TrackingPage._weekStart = new Date(TrackingPage._weekStart.getTime() + dir * 7 * 86400000);
    TrackingPage._renderCalendar();
  },
  _calToday: function() {
    TrackingPage._weekStart = TrackingPage._startOfWeek(new Date());
    TrackingPage._renderCalendar();
  },
  _calPickDate: function() {
    var html = '<input type="date" id="trk-datepick" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:16px;">';
    UI.showModal('Jump to week', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="TrackingPage._calGo()">Go</button>'
    });
    var i = document.getElementById('trk-datepick');
    if (i) i.value = TrackingPage._weekStart.toISOString().slice(0, 10);
  },
  _calGo: function() {
    var v = (document.getElementById('trk-datepick') || {}).value;
    if (v) { var parts = v.split('-'); TrackingPage._weekStart = TrackingPage._startOfWeek(new Date(+parts[0], +parts[1]-1, +parts[2])); }
    UI.closeModal(); TrackingPage._renderCalendar();
  },

  // ── CHARTS (donut by place + line by day) ──────────────────────────────────
  _renderCharts: function() {
    var body = document.getElementById('trk-body');
    if (!body) return;
    var scope = TrackingPage._chartScope, ref = TrackingPage._periodRef;
    var range = TrackingPage._periodRange(scope, ref);

    // aggregate by place within range
    var totals = {}, grand = 0;
    TrackingPage._places.forEach(function(p) {
      var m = 0;
      p.visits.forEach(function(v) {
        var s = v.start < range.start ? range.start : v.start;
        var e = v.end   > range.end   ? range.end   : v.end;
        if (e > s) m += (e - s) / 60000;
      });
      if (m > 0) { totals[p.key] = { p: p, min: m }; grand += m; }
    });
    var rows = Object.keys(totals).map(function(k){ return totals[k]; })
      .sort(function(a, b){ return b.min - a.min; });

    // segmented + period nav
    var html = '<div class="trk-seg sub" id="trk-cscope">'
      + ['weeks','months','years'].map(function(s){
          return '<button class="' + (s === scope ? 'on' : '') + '" onclick="TrackingPage._setScope(\'' + s + '\')">'
            + s.charAt(0).toUpperCase() + s.slice(1) + '</button>'; }).join('')
      + '</div>'
      + '<div class="trk-nav slim"><button class="trk-arrow" onclick="TrackingPage._chartNav(-1)">‹</button>'
      +   '<span class="trk-period">' + range.label + '</span>'
      +   '<button class="trk-arrow" onclick="TrackingPage._chartNav(1)">›</button></div>';

    if (!rows.length) {
      body.innerHTML = html + '<div class="trk-empty" style="margin-top:18px;">No tracked time in this ' + scope.slice(0, -1) + '.</div>';
      return;
    }

    // donut
    var R = 54, C = 2 * Math.PI * R, off = 0;
    var slices = rows.map(function(r) {
      var frac = r.min / grand, dash = frac * C;
      var seg = '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + r.p.color
        + '" stroke-width="26" stroke-dasharray="' + dash + ' ' + (C - dash)
        + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 80 80)"></circle>';
      off += dash; return seg;
    }).join('');
    html += '<div class="chart-donutwrap"><svg viewBox="0 0 160 160" class="chart-donut">' + slices
      + '<text x="80" y="74" text-anchor="middle" class="dn-tl">Total</text>'
      + '<text x="80" y="94" text-anchor="middle" class="dn-tv">' + TrackingPage._fmtDur(grand) + '</text>'
      + '</svg>'
      + '<div class="chart-legend">' + rows.map(function(r) {
          var pct = Math.round(r.min / grand * 100);
          return '<div class="lg-row"><span class="lg-dot" style="background:' + r.p.color + '"></span>'
            + '<div class="lg-meta"><div class="lg-name">' + UI.esc(r.p.name) + '</div>'
            + '<div class="lg-sub">' + pct + '% · ' + TrackingPage._fmtDur(r.min) + '</div></div></div>';
        }).join('') + '</div></div>';

    // line/bar over the period buckets
    html += TrackingPage._periodLine(scope, range, rows);

    body.innerHTML = html;
  },

  _periodLine: function(scope, range, rows) {
    // bucket the whole period's tracked minutes
    var buckets = TrackingPage._buckets(scope, range);
    TrackingPage._places.forEach(function(p) {
      p.visits.forEach(function(v) {
        var s = v.start < range.start ? range.start : v.start;
        var e = v.end   > range.end   ? range.end   : v.end;
        if (e <= s) return;
        // attribute to the bucket of the visit start (good enough for a trend)
        for (var i = 0; i < buckets.length; i++) {
          if (v.start >= buckets[i].start && v.start < buckets[i].end) { buckets[i].min += (e - s) / 60000; break; }
        }
      });
    });
    var max = buckets.reduce(function(m, b){ return Math.max(m, b.min); }, 0) || 1;
    var W = 320, H = 120, n = buckets.length, gap = W / n;
    var pts = buckets.map(function(b, i) {
      var x = gap * i + gap / 2, y = H - 10 - (b.min / max) * (H - 30);
      return { x: x, y: y, b: b };
    });
    var poly = pts.map(function(p){ return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var area = '0,' + H + ' ' + poly + ' ' + W + ',' + H;
    var dots = pts.map(function(p){ return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="#34c3eb"/>'; }).join('');
    var labels = '<div class="line-x">' + buckets.map(function(b){ return '<span>' + b.label + '</span>'; }).join('') + '</div>';
    return '<div class="chart-line">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="line-svg">'
      +   '<polygon points="' + area + '" fill="rgba(52,195,235,.16)"/>'
      +   '<polyline points="' + poly + '" fill="none" stroke="#34c3eb" stroke-width="2.5"/>' + dots
      + '</svg>' + labels + '</div>';
  },

  _setScope: function(s) { TrackingPage._chartScope = s; TrackingPage._periodRef = new Date(); TrackingPage._renderCharts(); },
  _chartNav: function(dir) {
    var r = TrackingPage._periodRef, s = TrackingPage._chartScope;
    if (s === 'weeks') TrackingPage._periodRef = new Date(r.getTime() + dir * 7 * 86400000);
    else if (s === 'months') TrackingPage._periodRef = new Date(r.getFullYear(), r.getMonth() + dir, 15);
    else TrackingPage._periodRef = new Date(r.getFullYear() + dir, r.getMonth(), 15);
    TrackingPage._renderCharts();
  },

  // ── PLACES (map + address list) ────────────────────────────────────────────
  _renderPlaces: function() {
    var body = document.getElementById('trk-body');
    if (!body) return;
    var places = TrackingPage._places;
    var html = '<div id="trk-map" class="pl-map"></div><div class="pl-list">';
    if (!places.length) html += '<div class="trk-empty">No places yet.</div>';
    else html += places.map(function(p) {
      return '<div class="pl-row" onclick="TrackingPage._renamePlace(\'' + p.key + '\')">'
        + '<span class="pl-dot" style="background:' + p.color + '"></span>'
        + '<div class="pl-meta"><div class="pl-name">' + UI.esc(p.name) + '</div>'
        + '<div class="pl-addr">' + UI.esc(p.addr) + '</div></div>'
        + '<div class="pl-time">' + TrackingPage._fmtDur(p.total) + '</div>'
        + '<span class="pl-i">ⓘ</span></div>';
    }).join('');
    html += '</div>';
    body.innerHTML = html;
    TrackingPage._initMap();
  },

  _initMap: function() {
    if (typeof maplibregl === 'undefined') {
      setTimeout(TrackingPage._initMap, 400); return;
    }
    var el = document.getElementById('trk-map');
    if (!el || !TrackingPage._places.length) return;
    try { if (TrackingPage._map) { TrackingPage._map.remove(); TrackingPage._map = null; } } catch(e) {}
    var pls = TrackingPage._places;
    var map = new maplibregl.Map({
      container: 'trk-map',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [pls[0].lng, pls[0].lat], zoom: 11, attributionControl: false
    });
    TrackingPage._map = map;
    map.on('load', function() {
      var b = new maplibregl.LngLatBounds();
      pls.forEach(function(p) {
        var d = document.createElement('div');
        d.style.cssText = 'width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);background:' + p.color + ';cursor:pointer;';
        d.title = p.name + ' · ' + TrackingPage._fmtDur(p.total);
        d.onclick = function(){ TrackingPage._renamePlace(p.key); };
        new maplibregl.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(map);
        b.extend([p.lng, p.lat]);
      });
      try { if (pls.length > 1) map.fitBounds(b, { padding: 50, maxZoom: 14 }); } catch(e) {}
    });
  },

  _renamePlace: function(key) {
    var p = TrackingPage._places.find(function(x){ return x.key === key; });
    if (!p) return;
    var html = '<div class="trk-rn-name">' + UI.esc(p.name) + '</div>'
      + '<div class="trk-rn-addr">' + UI.esc(p.addr) + ' · ' + TrackingPage._fmtDur(p.total) + ' total · ' + p.visits.length + ' visits</div>'
      + '<label class="trk-rn-lbl">Rename this place</label>'
      + '<input type="text" id="trk-rn-input" value="' + UI.esc(p.name) + '" placeholder="e.g. The Shop, Smith job" '
      + 'style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:16px;box-sizing:border-box;">'
      + '<div style="margin-top:8px;"><a class="trk-link" href="https://maps.apple.com/?q=' + p.lat + ',' + p.lng + '" target="_blank" rel="noopener">📍 Open in Maps</a></div>';
    UI.showModal('Place', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="TrackingPage._saveName(\'' + key + '\')">Save</button>'
    });
  },
  _saveName: function(key) {
    var v = ((document.getElementById('trk-rn-input') || {}).value || '').trim();
    var p = TrackingPage._places.find(function(x){ return x.key === key; });
    if (p && v) {
      p.name = v;
      try { localStorage.setItem('bm-place-name-' + key, v); } catch(e) {}
    }
    UI.closeModal();
    TrackingPage._renderView();
  },

  // ── helpers ────────────────────────────────────────────────────────────────
  _haversine: function(la1, lo1, la2, lo2) {
    var R = 6371000, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
    var a = Math.sin(dLa/2)*Math.sin(dLa/2) + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },
  _nameKey: function(lat, lng) { return lat.toFixed(3) + '_' + lng.toFixed(3); },
  _fmtDur: function(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    var hh = h < 10 ? '0' + h : '' + h, mm = m < 10 ? '0' + m : '' + m;
    return hh + ':' + mm;
  },
  _startOfWeek: function(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay()); // back to Sunday
    return x;
  },
  _periodRange: function(scope, ref) {
    if (scope === 'weeks') {
      var s = TrackingPage._startOfWeek(ref), e = new Date(s.getTime() + 7 * 86400000);
      return { start: s, end: e, label: s.toLocaleDateString([], {month:'short',day:'numeric'}) + ' – ' + new Date(e-86400000).toLocaleDateString([], {month:'short',day:'numeric'}) };
    }
    if (scope === 'years') {
      var ys = new Date(ref.getFullYear(), 0, 1), ye = new Date(ref.getFullYear() + 1, 0, 1);
      return { start: ys, end: ye, label: '' + ref.getFullYear() };
    }
    var ms = new Date(ref.getFullYear(), ref.getMonth(), 1), me = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
    return { start: ms, end: me, label: ref.toLocaleDateString([], {month:'long', year:'numeric'}) };
  },
  _buckets: function(scope, range) {
    var out = [];
    if (scope === 'years') {
      for (var m = 0; m < 12; m++) {
        var s = new Date(range.start.getFullYear(), m, 1), e = new Date(range.start.getFullYear(), m + 1, 1);
        out.push({ start: s, end: e, min: 0, label: ['J','F','M','A','M','J','J','A','S','O','N','D'][m] });
      }
      return out;
    }
    // weeks + months → per day
    var cur = new Date(range.start);
    while (cur < range.end) {
      var ne = new Date(cur.getTime() + 86400000);
      out.push({ start: new Date(cur), end: ne, min: 0, label: '' + cur.getDate() });
      cur = ne;
    }
    // thin day labels for month so they don't crowd
    if (out.length > 12) out.forEach(function(b, i){ if (i % 5 !== 0) b.label = ''; });
    return out;
  },

  _css: function() {
    return ''
    + '.trk-wrap{max-width:900px;margin:0 auto;padding:0 12px 90px;}'
    + '.trk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 2px 4px;}'
    + '.trk-title{margin:0;font-size:21px;font-weight:800;}'
    + '.trk-sub{font-size:12px;color:var(--text-light);margin-top:3px;}'
    + '.trk-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle;}'
    + '.trk-link{color:var(--accent);cursor:pointer;text-decoration:none;}'
    + '.trk-refresh{border:1px solid var(--border);background:var(--white);border-radius:9px;width:38px;height:38px;font-size:18px;cursor:pointer;color:var(--text);}'
    + '.trk-seg{display:flex;background:#eef1ef;border-radius:11px;padding:4px;gap:4px;margin:10px 0 4px;}'
    + '.trk-seg.sub{margin-top:4px;}'
    + '.trk-seg button{flex:1;border:none;background:none;padding:9px 6px;border-radius:8px;font-size:14px;font-weight:600;color:var(--text-light);cursor:pointer;}'
    + '.trk-seg button.on{background:var(--white);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.12);}'
    + '.trk-body{margin-top:8px;}'
    + '.trk-empty{padding:40px 16px;text-align:center;color:var(--text-light);font-size:14px;}'
    // nav
    + '.trk-nav{display:flex;align-items:center;justify-content:space-between;margin:10px 0 8px;}'
    + '.trk-nav.slim{justify-content:center;gap:18px;}'
    + '.trk-navmid{display:flex;align-items:center;gap:12px;font-weight:700;font-size:16px;}'
    + '.trk-pill{border:1px solid var(--border);background:var(--white);border-radius:18px;padding:7px 16px;font-size:14px;font-weight:600;cursor:pointer;color:var(--text);}'
    + '.trk-arrow{border:none;background:none;font-size:24px;line-height:1;cursor:pointer;color:var(--accent);padding:0 6px;}'
    + '.trk-period{font-weight:700;font-size:16px;min-width:150px;text-align:center;}'
    // calendar
    + '.cal-headrow,.cal-totrow{display:flex;}'
    + '.cal-gutter{width:42px;flex:none;}'
    + '.cal-dhead{flex:1;text-align:center;padding:4px 0;background:#dff4fb;border-left:1px solid #eef1ef;}'
    + '.cal-dhead:first-of-type{border-radius:8px 0 0 0;}.cal-dhead:last-of-type{border-radius:0 8px 0 0;}'
    + '.cal-dhead.today{background:#34c3eb;color:#fff;}'
    + '.cal-dn{font-size:11px;font-weight:700;text-transform:uppercase;}.cal-dd{font-size:15px;font-weight:800;}'
    + '.cal-scroll{max-height:60vh;overflow-y:auto;border:1px solid #eef1ef;border-top:none;}'
    + '.cal-grid{display:flex;position:relative;}'
    + '.cal-grid .cal-gutter{position:relative;}'
    + '.cal-hr{position:relative;border-top:1px solid #f0f3f1;}'
    + '.cal-hr span{position:absolute;top:-7px;right:4px;font-size:10px;color:var(--text-light);background:var(--white);padding:0 2px;}'
    + '.cal-col{flex:1;position:relative;border-left:1px solid #eef1ef;}'
    + '.cal-col.today{background:rgba(52,195,235,.05);}'
    + '.cal-cell{border-top:1px solid #f0f3f1;}'
    + '.cal-block{position:absolute;left:2px;right:2px;border-radius:5px;color:#fff;overflow:hidden;padding:3px 4px;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-start;line-height:1.1;}'
    + '.cal-block.tall{align-items:center;justify-content:space-between;}'
    + '.cb-name{font-size:10px;font-weight:700;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}'
    + '.cb-name-v{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;margin:3px 0;max-height:75%;overflow:hidden;}'
    + '.cb-dur{font-size:10px;opacity:.92;font-weight:600;}'
    + '.cal-totrow{border:1px solid #eef1ef;border-top:none;border-radius:0 0 8px 8px;}'
    + '.cal-tot{flex:1;text-align:center;font-size:12px;font-weight:800;color:var(--text);padding:7px 0;border-left:1px solid #eef1ef;}'
    + '.cal-tot.today{background:rgba(52,195,235,.12);}'
    // charts
    + '.chart-donutwrap{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:8px 0 6px;}'
    + '.chart-donut{width:170px;height:170px;flex:none;}'
    + '.dn-tl{font-size:13px;fill:var(--text-light);}.dn-tv{font-size:19px;font-weight:800;fill:var(--text);}'
    + '.chart-legend{flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px;}'
    + '.lg-row{display:flex;align-items:center;gap:9px;}'
    + '.lg-dot{width:11px;height:11px;border-radius:50%;flex:none;}'
    + '.lg-name{font-size:14px;font-weight:600;}.lg-sub{font-size:12px;color:var(--text-light);}'
    + '.chart-line{margin-top:16px;background:#e9f8fd;border-radius:12px;padding:10px 8px 4px;}'
    + '.line-svg{width:100%;height:120px;display:block;}'
    + '.line-x{display:flex;justify-content:space-between;font-size:10px;color:var(--text-light);padding:2px 4px 0;}'
    + '.line-x span{flex:1;text-align:center;}'
    // places
    + '.pl-map{width:100%;height:230px;border-radius:12px;overflow:hidden;margin:8px 0 4px;background:#eef1ef;}'
    + '.pl-list{display:flex;flex-direction:column;}'
    + '.pl-row{display:flex;align-items:center;gap:11px;padding:13px 4px;border-bottom:1px solid #eef1ef;cursor:pointer;}'
    + '.pl-dot{width:12px;height:12px;border-radius:50%;flex:none;}'
    + '.pl-meta{flex:1;min-width:0;}'
    + '.pl-name{font-size:15px;font-weight:700;}'
    + '.pl-addr{font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.pl-time{font-size:13px;font-weight:700;color:var(--text);}'
    + '.pl-i{color:var(--accent);font-size:15px;}'
    + '.trk-rn-name{font-size:17px;font-weight:800;}.trk-rn-addr{font-size:12px;color:var(--text-light);margin:2px 0 14px;}'
    + '.trk-rn-lbl{font-size:12px;font-weight:700;display:block;margin-bottom:5px;}';
  }
};
