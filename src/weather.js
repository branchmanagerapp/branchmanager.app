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

  isEnabled: function() {
    return localStorage.getItem('bm-weather-enabled') === 'true';
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

  renderWidget: function() {
    var enabled = Weather.isEnabled();
    var expanded = Weather._expanded;
    var html = '<div id="weather-widget" style="background:var(--white);border-radius:12px;padding:' + (enabled ? '16px' : '12px 16px') + ';border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;' + (enabled ? 'margin-bottom:8px;' : '') + '">'
      + '<h4 style="font-size:14px;margin:0;">🌤 Weather — Peekskill, NY</h4>'
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

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + Weather.LAT + '&longitude=' + Weather.LON
      + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m'
      + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,wind_speed_10m_max'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York&forecast_days=7';

    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      Weather.cache = data;
      Weather.cacheTime = Date.now();
      Weather._render(data);
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
      + '<div style="font-size:12px;color:var(--text-light);">Peekskill, NY — powered by Open-Meteo</div>'
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
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">5-Day Forecast</div>'
        + '<div style="font-size:11px;color:var(--text-light);">Tap a day for hourly</div>'
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
        if (hour < 6 || hour > 20) continue;
        var isPast = isToday && hour < nowHour;
        var isNow = isToday && hour === nowHour;
        var temp = Math.round(h.temperature_2m[k]);
        var precip = h.precipitation_probability ? h.precipitation_probability[k] : 0;
        var wind = h.wind_speed_10m ? Math.round(h.wind_speed_10m[k]) : null;
        var feels = h.apparent_temperature ? Math.round(h.apparent_temperature[k]) : null;
        var hIcon = Weather._icon(h.weather_code[k]);
        var ampm = hour < 12 ? hour + 'am' : hour === 12 ? '12pm' : (hour - 12) + 'pm';
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

    UI.showModal('🌤️ Peekskill, NY — Weather', html);
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
  }
};
