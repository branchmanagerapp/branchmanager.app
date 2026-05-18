/**
 * Branch Manager — Weather Widget
 * 5-day forecast for Peekskill, NY using Open-Meteo (free, no API key)
 */
var Weather = {
  LAT: 41.2901,
  LON: -73.9204,
  cache: null,
  cacheTime: 0,
  // v664: which day's hourly to show (0 = today, 1 = tomorrow, …). Used by
  // _renderPageContent and the inline expand under the dispatch map.
  _selectedDay: 0,
  _expanded: false,
  // v698: when true, hourly table shows all 24 hours instead of 6a–8p work-hours window.
  _showFullDay: false,

  isEnabled: function() {
    return localStorage.getItem('bm-weather-enabled') === 'true';
  },

  // White-label: location comes from the tenant's own geocoded address
  // (CompanyGeo), never SNT's hardcoded Peekskill coords.
  _geo: function() {
    try { return (typeof CompanyGeo !== 'undefined' && CompanyGeo.cached()) || null; }
    catch (e) { return null; }
  },
  _locLabel: function() {
    var g = Weather._geo();
    return (g && g.label) ? g.label : '';
  },
  _promptHtml: function() {
    return '<div style="font-size:12px;color:#8a6d00;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:10px 12px;">'
      + 'Set your <strong>business address</strong> in Settings to see your local forecast.'
      + ' <button onclick="try{TenantSetup._jumpToSettings(\'business\',\'co-address\')}catch(e){}" style="margin-left:6px;background:var(--green-dark);color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Set address</button>'
      + '</div>';
  },

  toggle: function() {
    var enabled = !Weather.isEnabled();
    localStorage.setItem('bm-weather-enabled', enabled ? 'true' : 'false');
    loadPage(currentPage);
  },

  // v664: expand the dispatch weather widget into the full forecast inline.
  toggleExpand: function() {
    Weather._expanded = !Weather._expanded;
    var inner = document.getElementById('weather-data');
    var btn = document.getElementById('weather-expand-btn');
    if (btn) btn.textContent = Weather._expanded ? 'Hide hourly ▴' : 'Show hourly ▾';
    if (Weather._expanded) {
      // Render full page content into the widget body.
      Weather._renderInto(inner, true);
    } else {
      // Back to compact 5-day grid.
      Weather._render(Weather.cache);
    }
  },

  // v664: pick a different day for the hourly breakdown on the full page.
  selectDay: function(idx) {
    Weather._selectedDay = +idx || 0;
    // Re-render whichever surface is open
    if (document.getElementById('weather-page-content')) {
      Weather._renderPageContent();
    } else if (Weather._expanded) {
      var inner = document.getElementById('weather-data');
      if (inner) Weather._renderInto(inner, true);
    }
  },

  // v698: flip between 6a–8p work-hours view and full 24-hour view of the
  // selected day's hourly table. Replaces the static "Tap a day for hourly"
  // hint with an action toggle (you already know how it works once you've
  // tapped a day once).
  toggleFullDay: function() {
    Weather._showFullDay = !Weather._showFullDay;
    if (document.getElementById('weather-page-content')) {
      Weather._renderPageContent();
    } else if (Weather._expanded) {
      var inner = document.getElementById('weather-data');
      if (inner) Weather._renderInto(inner, true);
    }
  },

  renderWidget: function() {
    var enabled = Weather.isEnabled();
    var expanded = Weather._expanded;
    var html = '<div id="weather-widget" style="background:var(--white);border-radius:12px;padding:' + (enabled ? '16px' : '12px 16px') + ';border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;' + (enabled ? 'margin-bottom:8px;' : '') + '">'
      + '<h4 style="font-size:14px;margin:0;">🌤 Weather' + (Weather._locLabel() ? ' — ' + Weather._locLabel() : '') + '</h4>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + (enabled ? '<button id="weather-expand-btn" onclick="Weather.toggleExpand()" style="background:none;border:1px solid var(--border);padding:4px 10px;font-size:11px;font-weight:600;color:var(--text-light);border-radius:6px;cursor:pointer;">' + (expanded ? 'Hide hourly ▴' : 'Show hourly ▾') + '</button>' : '')
      + '<button onclick="Weather.toggle()" title="Enable weather widget" style="position:relative;width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:' + (enabled ? 'var(--accent)' : '#ccc') + ';transition:background .2s;">'
      + '<span style="position:absolute;top:2px;' + (enabled ? 'left:18px' : 'left:2px') + ';width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span></button>'
      + '</div></div>';

    if (!enabled) {
      html += '</div>';
      return html;
    }

    html += '<div id="weather-data" style="font-size:13px;color:var(--text-light);">Loading...</div>'
      + '</div>';

    // Fetch weather after render. If expanded, kick the full render once data lands.
    setTimeout(function() {
      if (Weather.cache) {
        if (Weather._expanded) Weather._renderInto(document.getElementById('weather-data'), true);
        else Weather._render(Weather.cache);
      } else {
        Weather.fetch();
      }
    }, 100);
    return html;
  },

  fetch: function() {
    // Cache for 30 min
    if (Weather.cache && Date.now() - Weather.cacheTime < 1800000) {
      Weather._render(Weather.cache);
      return;
    }

    // First-fetch detection: schedule's per-day cells call Weather.getInline()
    // synchronously at render time. If cache is empty (cold load), they all
    // render blank, then this async fetch lands but there's no per-cell
    // element to update — the toggle off/on workaround re-renders the page.
    // We do that automatically: if cache was empty AND we're on schedule,
    // re-render once after data lands. Cap to once per cold start to avoid
    // infinite loops if fetch keeps populating an unstable cache.
    var firstFetch = !Weather.cache;

    // White-label: require the tenant's own geocoded location. Never fetch
    // (or display) SNT's Peekskill weather for another tenant.
    var _g = Weather._geo();
    if (!_g) {
      var _elp = document.getElementById('weather-data') || document.getElementById('weather-page-content');
      if (_elp) _elp.innerHTML = Weather._promptHtml();
      if (typeof CompanyGeo !== 'undefined') {
        CompanyGeo.resolve().then(function(g) {
          if (g) { Weather.cache = null; Weather.fetch(); }
          else {
            var e2 = document.getElementById('weather-data') || document.getElementById('weather-page-content');
            if (e2) e2.innerHTML = Weather._promptHtml();
          }
        });
      }
      return;
    }

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + _g.lat + '&longitude=' + _g.lon
      + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m'
      + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,wind_speed_10m_max'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7';

    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      Weather.cache = data;
      Weather.cacheTime = Date.now();
      Weather._render(data);
      // v684: refresh topbar chip on every fetch
      try { Weather._updateTopbar(); } catch(e) {}
      if (firstFetch && typeof window !== 'undefined' && window._currentPage === 'schedule' && typeof loadPage === 'function') {
        loadPage('schedule');
      }
    }).catch(function(e) {
      var el = document.getElementById('weather-data');
      if (el) el.innerHTML = '<span style="color:var(--text-light);">Unable to load weather</span>';
    });
  },

  _render: function(data) {
    var el = document.getElementById('weather-data');
    if (!el || !data || !data.daily) return;

    var days = data.daily;
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var html = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center;">';

    for (var i = 0; i < 5; i++) {
      var d = new Date(days.time[i] + 'T12:00:00');
      var dayName = i === 0 ? 'Today' : dayNames[d.getDay()];
      var hi = Math.round(days.temperature_2m_max[i]);
      var lo = Math.round(days.temperature_2m_min[i]);
      var rain = days.precipitation_probability_max[i];
      var code = days.weathercode[i];
      var icon = Weather._icon(code);
      var rainWarning = rain > 60;

      html += '<div style="padding:8px 4px;border-radius:8px;' + (rainWarning ? 'background:#fff3e0;' : '') + '">'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-light);">' + dayName + '</div>'
        + '<div style="font-size:22px;margin:4px 0;">' + icon + '</div>'
        + '<div style="font-size:14px;font-weight:700;">' + hi + '°</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + lo + '°</div>'
        + (rain > 0 ? '<div style="font-size:10px;color:' + (rainWarning ? '#e65100' : '#2196f3') + ';margin-top:2px;">💧 ' + rain + '%</div>' : '')
        + '</div>';
    }
    html += '</div>';

    // Rain warning for scheduling
    var rainyDays = [];
    for (var j = 0; j < 5; j++) {
      if (days.precipitation_probability_max[j] > 60) {
        var rd = new Date(days.time[j] + 'T12:00:00');
        rainyDays.push(j === 0 ? 'Today' : dayNames[rd.getDay()]);
      }
    }
    if (rainyDays.length) {
      html += '<div style="margin-top:8px;padding:8px;background:#fff3e0;border-radius:6px;font-size:12px;color:#e65100;">'
        + '⚠️ Rain likely: <strong>' + rainyDays.join(', ') + '</strong> — consider rescheduling outdoor work</div>';
    }

    // Wind warning for aerial work
    if (data.current && data.current.wind_gusts_10m > 25) {
      html += '<div style="margin-top:8px;padding:8px;background:#ffebee;border-radius:6px;font-size:12px;color:#c62828;">'
        + '💨 Wind gusts ' + Math.round(data.current.wind_gusts_10m) + ' mph — use caution with bucket truck and climbing</div>';
    }
    if (days.wind_speed_10m_max) {
      var windyDays = [];
      for (var w = 1; w < 5; w++) {
        if (days.wind_speed_10m_max[w] > 25) {
          var wd = new Date(days.time[w] + 'T12:00:00');
          windyDays.push(dayNames[wd.getDay()] + ' (' + Math.round(days.wind_speed_10m_max[w]) + ' mph)');
        }
      }
      if (windyDays.length) {
        html += '<div style="margin-top:6px;padding:8px;background:#e3f2fd;border-radius:6px;font-size:12px;color:#1565c0;">'
          + '💨 Windy days ahead: <strong>' + windyDays.join(', ') + '</strong></div>';
      }
    }

    el.innerHTML = html;
  },

  // Hourly inline for day view — returns "☀️ 62° · 💧20%" or ""
  getHourly: function(dateStr, hour) {
    if (!Weather.isEnabled() || !Weather.cache || !Weather.cache.hourly) return '';
    var h = Weather.cache.hourly;
    var hPad = (hour < 10 ? '0' : '') + hour;
    var needle = dateStr + 'T' + hPad + ':00';
    for (var i = 0; i < h.time.length; i++) {
      if (h.time[i] === needle) {
        var t = Math.round(h.temperature_2m[i]);
        var p = h.precipitation_probability ? h.precipitation_probability[i] : 0;
        var icon = Weather._icon(h.weather_code[i]);
        var rainPart = p > 10 ? ' · <span style="color:' + (p > 60 ? '#e65100' : '#1976d2') + ';">💧' + p + '%</span>' : '';
        return '<div style="font-size:10px;line-height:1.2;color:var(--text-light);margin-top:2px;font-weight:500;">' + icon + ' ' + t + '°' + rainPart + '</div>';
      }
    }
    return '';
  },

  // Get compact inline HTML for a specific date (for calendar headers)
  // Returns "☀️ 55°" or "" if no data
  getInline: function(dateStr) {
    if (!Weather.isEnabled() || !Weather.cache || !Weather.cache.daily) return '';
    var days = Weather.cache.daily;
    for (var i = 0; i < days.time.length; i++) {
      if (days.time[i] === dateStr) {
        var hi = Math.round(days.temperature_2m_max[i]);
        var icon = Weather._icon(days.weathercode[i]);
        var rain = days.precipitation_probability_max ? days.precipitation_probability_max[i] : 0;
        var rainStr = rain > 10 ? ' <span style="color:' + (rain > 60 ? '#e65100' : '#1976d2') + ';">' + rain + '%</span>' : '';
        return '<span style="font-size:11px;" title="' + hi + '°F · ' + rain + '% rain">' + icon + ' ' + hi + '°' + rainStr + '</span>';
      }
    }
    return '';
  },

  // Full weather page (used as Operations tab)
  renderPage: function() {
    setTimeout(function() { Weather._renderPageContent(); }, 80);
    return '<div id="weather-page-root" style="max-width:600px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
      + '<span style="font-size:22px;">🌤</span>'
      + '<div><h2 style="margin:0;font-size:20px;font-weight:700;">Weather</h2>'
      + '<div style="font-size:12px;color:var(--text-light);">' + (Weather._locLabel() ? Weather._locLabel() + ' — ' : '') + 'powered by Open-Meteo</div>'
      + '</div>'
      + '</div>'
      + '<div id="weather-page-content" style="font-size:13px;color:var(--text-light);">Loading…</div>'
      + '</div>';
  },

  _renderPageContent: function() {
    Weather._renderInto(document.getElementById('weather-page-content'), false);
  },

  // v664: shared full-forecast renderer. `compact` = true when rendering inline
  // inside the dispatch widget (hides current-conditions card + warnings, keeps
  // the 5-day picker + selected-day hourly table).
  _renderInto: function(el, compact) {
    if (!el) return;
    if (!Weather.cache) {
      if (!Weather._geo()) {
        // No tenant location — show the set-address prompt, kick a
        // background resolve, and stop (no SNT fallback, no retry spin).
        el.innerHTML = Weather._promptHtml();
        Weather.fetch();
        return;
      }
      Weather.fetch();
      setTimeout(function() { Weather._renderInto(el, compact); }, 2500);
      return;
    }
    var data = Weather.cache;
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var html = '';
    var sel = Math.max(0, Math.min(4, Weather._selectedDay || 0));

    // Current conditions (full page only — already shown in dashboard chip in compact)
    if (!compact && data.current) {
      var cur = data.current;
      var curIcon = Weather._icon(cur.weather_code);
      var curTemp = Math.round(cur.temperature_2m);
      var windSpd = Math.round(cur.wind_speed_10m);
      var gustSpd = Math.round(cur.wind_gusts_10m);
      var feelsTemp = cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null;
      html += '<div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);">'
        + '<div style="font-size:56px;line-height:1;">' + curIcon + '</div>'
        + '<div>'
        + '<div style="font-size:40px;font-weight:800;line-height:1;">' + curTemp + '°F</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:6px;">Wind ' + windSpd + ' mph' + (gustSpd > windSpd ? ' · Gusts ' + gustSpd + ' mph' : '') + (feelsTemp !== null ? ' · Feels ' + feelsTemp + '°F' : '') + '</div>'
        + (gustSpd > 25 ? '<div style="font-size:12px;color:#c62828;font-weight:600;margin-top:4px;">⚠ High gusts — caution with aerial work</div>' : '')
        + '</div>'
        + '</div>';
    }

    // 5-day forecast — clickable cards drive the hourly view below
    if (data.daily) {
      var days = data.daily;
      var wrapPad = compact ? '12px' : '16px';
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:' + wrapPad + ';margin-bottom:12px;' + (compact ? '' : 'box-shadow:0 1px 3px rgba(0,0,0,.04);') + '">';
      // v698: replaced the static "Tap a day for hourly" hint with a toggle
      // that flips the hourly table below between work-hours (6a–8p, default)
      // and full 24h view. The label communicates BOTH the tap-action and the
      // current scope.
      var fullDay = !!Weather._showFullDay;
      var toggleBg = fullDay ? 'var(--green-dark)' : 'var(--white)';
      var toggleColor = fullDay ? '#fff' : 'var(--green-dark)';
      var toggleBorder = fullDay ? 'var(--green-dark)' : 'var(--green-dark)';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">5-Day Forecast</div>'
        + '<button type="button" onclick="event.stopPropagation();Weather.toggleFullDay()" '
        +   'title="' + (fullDay ? 'Showing all 24 hours — tap to limit to 6a–8p work hours' : 'Showing 6a–8p work hours — tap to see all 24 hours') + '" '
        +   'style="font-size:11px;font-weight:700;background:' + toggleBg + ';color:' + toggleColor + ';border:1.5px solid ' + toggleBorder + ';border-radius:14px;padding:4px 12px;cursor:pointer;line-height:1;display:inline-flex;align-items:center;gap:5px;">'
        +   (fullDay ? '🌙 24h' : '☀️ Work hours') + (fullDay ? '' : ' · 6a–8p')
        + '</button>'
        + '</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center;">';
      for (var i = 0; i < 5; i++) {
        var d = new Date(days.time[i] + 'T12:00:00');
        var dName = i === 0 ? 'Today' : dayNames[d.getDay()];
        var dDate = monthNames[d.getMonth()] + ' ' + d.getDate();
        var hi = Math.round(days.temperature_2m_max[i]);
        var lo = Math.round(days.temperature_2m_min[i]);
        var rain = days.precipitation_probability_max[i];
        var ic = Weather._icon(days.weathercode[i]);
        var isSel = i === sel;
        var bg = isSel ? '#dcedc8' : (rain > 60 ? '#fff3e0' : (i === 0 ? '#f0faf0' : 'transparent'));
        var border = isSel ? '2px solid var(--green-dark)' : '1px solid var(--border)';
        html += '<div onclick="Weather.selectDay(' + i + ')" style="padding:10px 4px;border-radius:8px;background:' + bg + ';border:' + border + ';cursor:pointer;transition:background .15s;">'
          + '<div style="font-size:11px;font-weight:700;">' + dName + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-bottom:4px;">' + dDate + '</div>'
          + '<div style="font-size:' + (compact ? '22px' : '26px') + ';margin:4px 0;">' + ic + '</div>'
          + '<div style="font-size:14px;font-weight:700;">' + hi + '°</div>'
          + '<div style="font-size:11px;color:var(--text-light);">' + lo + '°</div>'
          + (rain > 0 ? '<div style="font-size:10px;color:' + (rain > 60 ? '#e65100' : '#1976d2') + ';margin-top:4px;">💧 ' + rain + '%</div>' : '')
          + '</div>';
      }
      html += '</div>';

      // Warnings (full page only — keeps the inline expand compact)
      if (!compact) {
        var rainyDays = [];
        for (var j = 0; j < 5; j++) {
          if (days.precipitation_probability_max[j] > 60) {
            var rd = new Date(days.time[j] + 'T12:00:00');
            rainyDays.push(j === 0 ? 'Today' : dayNames[rd.getDay()]);
          }
        }
        if (rainyDays.length) {
          html += '<div style="margin-top:12px;padding:10px;background:#fff3e0;border-radius:8px;font-size:12px;color:#e65100;">'
            + '⚠️ Rain likely: <strong>' + rainyDays.join(', ') + '</strong> — consider rescheduling outdoor work</div>';
        }
        if (data.daily.wind_speed_10m_max) {
          var windyDays = [];
          for (var w = 1; w < 5; w++) {
            if (days.wind_speed_10m_max[w] > 25) {
              var wd = new Date(days.time[w] + 'T12:00:00');
              windyDays.push(dayNames[wd.getDay()] + ' (' + Math.round(days.wind_speed_10m_max[w]) + ' mph)');
            }
          }
          if (windyDays.length) {
            html += '<div style="margin-top:8px;padding:10px;background:#e3f2fd;border-radius:8px;font-size:12px;color:#1565c0;">'
              + '💨 Windy days ahead: <strong>' + windyDays.join(', ') + '</strong></div>';
          }
        }
      }
      html += '</div>';
    }

    // Selected day's hourly table
    if (data.hourly && data.daily && data.daily.time[sel]) {
      var h = data.hourly;
      var dayStr = data.daily.time[sel];
      var todayStr = new Date().toISOString().split('T')[0];
      var nowHour = new Date().getHours();
      var isToday = dayStr === todayStr;
      var dayLabel = isToday ? 'Today' : (function() {
        var dd = new Date(dayStr + 'T12:00:00');
        return dayNames[dd.getDay()] + ', ' + monthNames[dd.getMonth()] + ' ' + dd.getDate();
      })();

      var colStyle = 'padding:8px 10px;text-align:center;font-size:13px;';
      var hdrStyle = 'padding:6px 10px;text-align:center;font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid var(--border);';
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;' + (compact ? '' : 'box-shadow:0 1px 3px rgba(0,0,0,.04);') + '">';
      html += '<div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;background:#f8f9fa;">' + dayLabel + ' — Hourly</div>';
      html += '<table style="width:100%;border-collapse:collapse;">';
      html += '<thead><tr style="background:#f8f9fa;">'
        + '<th style="' + hdrStyle + 'text-align:left;padding-left:16px;">Time</th>'
        + '<th style="' + hdrStyle + '"></th>'
        + '<th style="' + hdrStyle + '">Temp</th>'
        + '<th style="' + hdrStyle + '">Rain</th>'
        + '<th style="' + hdrStyle + '">Wind</th>'
        + '<th style="' + hdrStyle + '">Feels</th>'
        + '</tr></thead>';
      html += '<tbody>';
      var rowCount = 0;
      for (var k = 0; k < h.time.length; k++) {
        var tStr = h.time[k];
        if (tStr.indexOf(dayStr) !== 0) continue;
        var hour = parseInt(tStr.split('T')[1].split(':')[0], 10);
        // v698: respect Weather._showFullDay — when off, restrict to 6a–8p
        // (default work-hours window for tree crews).
        if (!Weather._showFullDay && (hour < 6 || hour > 20)) continue;
        var isPast = isToday && hour < nowHour;
        var isNow = isToday && hour === nowHour;
        var temp = Math.round(h.temperature_2m[k]);
        var precip = h.precipitation_probability ? h.precipitation_probability[k] : 0;
        var wind = h.wind_speed_10m ? Math.round(h.wind_speed_10m[k]) : null;
        var feels = h.apparent_temperature ? Math.round(h.apparent_temperature[k]) : null;
        var hIcon = Weather._icon(h.weather_code[k]);
        // v698: midnight = 12am (not 0am) once full-day view started showing the small hours
        var ampm = hour === 0 ? '12am' : hour < 12 ? hour + 'am' : hour === 12 ? '12pm' : (hour - 12) + 'pm';
        var rowBg = isNow ? '#f0faf0' : (rowCount % 2 === 0 ? '#fff' : '#fafafa');
        html += '<tr style="background:' + rowBg + ';' + (isPast ? 'opacity:0.4;' : '') + 'border-top:1px solid var(--border);">'
          + '<td style="' + colStyle + 'text-align:left;padding-left:16px;font-weight:' + (isNow ? '700' : '500') + ';color:' + (isNow ? 'var(--green-dark)' : 'var(--text)') + ';white-space:nowrap;">'
          + ampm + (isNow ? ' <span style="font-size:10px;background:var(--green-dark);color:#fff;padding:1px 6px;border-radius:8px;vertical-align:middle;">NOW</span>' : '')
          + '</td>'
          + '<td style="' + colStyle + 'font-size:18px;">' + hIcon + '</td>'
          + '<td style="' + colStyle + 'font-weight:600;">' + temp + '°</td>'
          + '<td style="' + colStyle + 'color:' + (precip > 60 ? '#e65100' : precip > 10 ? '#1976d2' : 'var(--text-light)') + ';">' + (precip > 0 ? precip + '%' : '—') + '</td>'
          + '<td style="' + colStyle + 'color:' + (wind !== null && wind > 20 ? '#c62828' : 'var(--text)') + ';">' + (wind !== null ? wind + ' mph' : '—') + '</td>'
          + '<td style="' + colStyle + 'color:var(--text-light);">' + (feels !== null ? feels + '°' : '—') + '</td>'
          + '</tr>';
        rowCount++;
      }
      html += '</tbody></table></div>';
    }

    el.innerHTML = html;
  },

  // Full detail modal — 5-day forecast + today's hourly breakdown
  showModal: function() {
    var data = Weather.cache;
    if (!data) {
      if (!Weather._geo()) {
        UI.showModal('🌤️ Weather', Weather._promptHtml());
        Weather.fetch();
        return;
      }
      Weather.fetch();
      setTimeout(function() { if (Weather.cache) Weather.showModal(); }, 2500);
      return;
    }
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var html = '';

    // ── Current conditions ──
    if (data.current) {
      var cur = data.current;
      var curIcon = Weather._icon(cur.weather_code);
      var curTemp = Math.round(cur.temperature_2m);
      var windSpd = Math.round(cur.wind_speed_10m);
      var gustSpd = Math.round(cur.wind_gusts_10m);
      html += '<div style="display:flex;align-items:center;gap:16px;padding:12px 16px;background:#f8f9fa;border-radius:10px;margin-bottom:16px;">'
        + '<div style="font-size:48px;line-height:1;">' + curIcon + '</div>'
        + '<div>'
        + '<div style="font-size:32px;font-weight:800;line-height:1;">' + curTemp + '°F</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">Wind ' + windSpd + ' mph' + (gustSpd > windSpd ? ' · Gusts ' + gustSpd + ' mph' : '') + '</div>'
        + (gustSpd > 25 ? '<div style="font-size:12px;color:#c62828;font-weight:600;margin-top:2px;">⚠ High gusts — caution with aerial work</div>' : '')
        + '</div>'
        + '</div>';
    }

    // ── 5-day forecast ──
    if (data.daily) {
      var days = data.daily;
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">5-Day Forecast</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center;margin-bottom:20px;">';
      for (var i = 0; i < 5; i++) {
        var d = new Date(days.time[i] + 'T12:00:00');
        var dName = i === 0 ? 'Today' : dayNames[d.getDay()];
        var dDate = monthNames[d.getMonth()] + ' ' + d.getDate();
        var hi = Math.round(days.temperature_2m_max[i]);
        var lo = Math.round(days.temperature_2m_min[i]);
        var rain = days.precipitation_probability_max[i];
        var code = days.weathercode[i];
        var ic = Weather._icon(code);
        var bg = rain > 60 ? '#fff3e0' : (i === 0 ? '#e8f5e9' : 'transparent');
        html += '<div style="padding:8px 4px;border-radius:8px;background:' + bg + ';border:1px solid var(--border);">'
          + '<div style="font-size:11px;font-weight:700;color:var(--text);">' + dName + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);">' + dDate + '</div>'
          + '<div style="font-size:24px;margin:6px 0;">' + ic + '</div>'
          + '<div style="font-size:14px;font-weight:700;">' + hi + '°</div>'
          + '<div style="font-size:11px;color:var(--text-light);">' + lo + '°</div>'
          + (rain > 0 ? '<div style="font-size:10px;color:' + (rain > 60 ? '#e65100' : '#1976d2') + ';margin-top:3px;">💧 ' + rain + '%</div>' : '<div style="font-size:10px;color:transparent;">·</div>')
          + '</div>';
      }
      html += '</div>';
    }

    // ── Today's hourly breakdown (6am–8pm) ──
    if (data.hourly) {
      var h = data.hourly;
      var todayStr = new Date().toISOString().split('T')[0];
      var nowHour = new Date().getHours();
      var hourRows = '';
      var count = 0;
      for (var j = 0; j < h.time.length; j++) {
        var tStr = h.time[j];
        if (tStr.indexOf(todayStr) !== 0) continue;
        var hour = parseInt(tStr.split('T')[1].split(':')[0], 10);
        if (hour < 6 || hour > 20) continue;
        var isPast = hour < nowHour;
        var temp = Math.round(h.temperature_2m[j]);
        var precip = h.precipitation_probability ? h.precipitation_probability[j] : 0;
        var hIcon = Weather._icon(h.weather_code[j]);
        var ampm = hour === 0 ? '12am' : hour < 12 ? hour + 'am' : hour === 12 ? '12pm' : (hour - 12) + 'pm';
        var isNow = hour === nowHour;
        hourRows += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;'
          + (count > 0 ? 'border-top:1px solid var(--border);' : '')
          + (isPast ? 'opacity:0.45;' : '')
          + (isNow ? 'background:#f0faf0;border-radius:6px;padding-left:8px;padding-right:8px;margin:0 -8px;' : '')
          + '">'
          + '<div style="width:36px;font-size:12px;font-weight:' + (isNow ? '700' : '500') + ';color:' + (isNow ? 'var(--green-dark)' : 'var(--text-light)') + ';flex-shrink:0;">' + ampm + '</div>'
          + '<div style="font-size:18px;flex-shrink:0;">' + hIcon + '</div>'
          + '<div style="font-size:14px;font-weight:600;flex-shrink:0;width:38px;">' + temp + '°</div>'
          + '<div style="flex:1;">'
          + (precip > 10 ? '<div style="font-size:11px;color:' + (precip > 60 ? '#e65100' : '#1976d2') + ';">💧 ' + precip + '% rain</div>' : '')
          + '</div>'
          + (isNow ? '<div style="font-size:10px;color:var(--green-dark);font-weight:700;">NOW</div>' : '')
          + '</div>';
        count++;
      }
      if (hourRows) {
        html += '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Today\'s Hourly</div>';
        html += '<div style="background:#f8f9fa;border-radius:10px;padding:8px 12px;">' + hourRows + '</div>';
      }
    }

    UI.showModal('🌤️ ' + (Weather._locLabel() ? Weather._locLabel() + ' — ' : '') + 'Weather', html);
  },

  _icon: function(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 49) return '🌫️';
    if (code <= 59) return '🌧️';
    if (code <= 69) return '🌨️';
    if (code <= 79) return '🌧️';
    if (code <= 82) return '⛈️';
    if (code <= 86) return '❄️';
    if (code >= 95) return '⛈️';
    return '☁️';
  },

  // v684: Clean SVG-style weather icons for the topbar chip + anywhere else
  // we want a non-emoji glyph. Open-Meteo weather code → 18x18 SVG.
  // Returns an inline <svg> string with stroke=currentColor for theme-friendliness.
  svgIcon: function(code, size) {
    size = size || 18;
    var s = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0;';
    var attr = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="' + s + '"';
    // Sun (clear)
    if (code === 0) return '<svg ' + attr + '><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    // Sun behind cloud (mostly clear / partly cloudy)
    if (code <= 2) return '<svg ' + attr + '><circle cx="8" cy="9" r="3"/><path d="M8 4v1M3.5 9H4.5M5 5.5l.7.7"/><path d="M14 18a4 4 0 0 0 0-8 5 5 0 0 0-9.7-1A4 4 0 1 0 5 18h9z"/></svg>';
    // Cloud (overcast)
    if (code === 3) return '<svg ' + attr + '><path d="M18 17H7A4 4 0 1 1 8 9a6 6 0 0 1 11.5 2A4 4 0 0 1 18 17z"/></svg>';
    // Fog
    if (code <= 49) return '<svg ' + attr + '><path d="M5 5h14M3 9h18M3 13h12M5 17h14M3 21h18"/></svg>';
    // Drizzle
    if (code <= 57) return '<svg ' + attr + '><path d="M18 14H7A4 4 0 1 1 8 6a6 6 0 0 1 11.5 2A4 4 0 0 1 18 14z"/><path d="M9 18l-1 2M14 18l-1 2M19 18l-1 2"/></svg>';
    // Rain (steady or freezing)
    if (code <= 67) return '<svg ' + attr + '><path d="M18 13H7A4 4 0 1 1 8 5a6 6 0 0 1 11.5 2A4 4 0 0 1 18 13z"/><path d="M8 17v3M12 17v3M16 17v3"/></svg>';
    // Snow
    if (code <= 77) return '<svg ' + attr + '><path d="M18 13H7A4 4 0 1 1 8 5a6 6 0 0 1 11.5 2A4 4 0 0 1 18 13z"/><path d="M8 18l.5.5M11 18v1M14 18l-.5.5M17 18v1"/></svg>';
    // Rain showers
    if (code <= 82) return '<svg ' + attr + '><path d="M18 13H7A4 4 0 1 1 8 5a6 6 0 0 1 11.5 2A4 4 0 0 1 18 13z"/><path d="M8 17l-1 3M13 17l-1 3M18 17l-1 3"/></svg>';
    // Snow showers
    if (code <= 86) return '<svg ' + attr + '><path d="M18 13H7A4 4 0 1 1 8 5a6 6 0 0 1 11.5 2A4 4 0 0 1 18 13z"/><path d="M9 17l1 1M13 17v2M17 17l-1 1"/></svg>';
    // Thunderstorm
    if (code >= 95) return '<svg ' + attr + '><path d="M18 13H7A4 4 0 1 1 8 5a6 6 0 0 1 11.5 2A4 4 0 0 1 18 13z"/><polyline points="13,14 11,18 14,18 12,22"/></svg>';
    // Default: cloud
    return '<svg ' + attr + '><path d="M18 17H7A4 4 0 1 1 8 9a6 6 0 0 1 11.5 2A4 4 0 0 1 18 17z"/></svg>';
  },

  // v689: Topbar weather chip — now includes hi/lo + rain when daily
  // forecast is loaded. Single-line, lives ABOVE the topbar/content
  // divider so it's visible everywhere. Doug ask: keep all weather above
  // the line, not duplicated next to the dashboard greeting.
  renderTopbarChip: function() {
    var c = Weather.cache && Weather.cache.current;
    if (!c) return ''; // No data yet — chip stays empty until fetch lands
    var temp = Math.round(c.temperature_2m);
    var feels = c.apparent_temperature != null ? Math.round(c.apparent_temperature) : null;
    var code = c.weather_code;
    var hot = temp >= 85, cold = temp <= 32, icy = temp <= 35 && code >= 51;
    var bg = icy ? '#dbeafe' : hot ? '#fee2e2' : cold ? '#dbeafe' : '#f0f9ff';
    var fg = icy ? '#1e3a8a' : hot ? '#991b1b' : cold ? '#1e40af' : '#075985';

    // Pull today's hi/lo + rain probability from the daily forecast.
    var hi = null, lo = null, rain = 0;
    if (Weather.cache.daily && Weather.cache.daily.time && Weather.cache.daily.time.length) {
      var todayStr = new Date().toISOString().split('T')[0];
      for (var i = 0; i < Weather.cache.daily.time.length; i++) {
        if (Weather.cache.daily.time[i] === todayStr) {
          hi = Math.round(Weather.cache.daily.temperature_2m_max[i]);
          lo = Math.round(Weather.cache.daily.temperature_2m_min[i]);
          rain = Weather.cache.daily.precipitation_probability_max
            ? Weather.cache.daily.precipitation_probability_max[i] || 0
            : 0;
          break;
        }
      }
    }

    var rainColor = rain >= 60 ? '#b45309' : '#1976d2';
    var rainHtml = rain >= 20
      ? '<span style="color:' + rainColor + ';font-weight:600;margin-left:6px;border-left:1px solid currentColor;padding-left:8px;opacity:.85;">' + rain + '% rain</span>'
      : '';
    var hiloHtml = (hi !== null) ? '<span style="opacity:.7;font-weight:500;margin-left:5px;">' + hi + '°/' + lo + '°</span>' : '';

    var title = 'Weather: ' + temp + '°F' + (feels !== null && Math.abs(feels - temp) > 2 ? ' (feels ' + feels + '°)' : '')
      + (hi !== null ? ' · today ' + hi + '°/' + lo + '°' : '')
      + (rain ? ' · ' + rain + '% rain' : '')
      + ' · click for forecast';

    return '<button id="topbar-weather-btn" onclick="window.location.hash=\'#weather\';loadPage(\'weather\')" '
      + 'title="' + title + '" '
      + 'style="display:inline-flex;align-items:center;gap:6px;background:' + bg + ';color:' + fg + ';border:none;padding:5px 12px;border-radius:14px;font-size:13px;font-weight:700;cursor:pointer;height:28px;line-height:1;white-space:nowrap;">'
      +   Weather.svgIcon(code, 16)
      +   '<span>' + temp + '°</span>'
      +   hiloHtml
      +   rainHtml
      + '</button>';
  },
  // Update the topbar chip placeholder. Called after fetch lands.
  _updateTopbar: function() {
    var slot = document.getElementById('topbar-weather');
    if (slot) slot.innerHTML = Weather.renderTopbarChip();
  }
};
