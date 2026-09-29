(function () {
  'use strict';

  var USER_NAME = 'Viktor Huynh';

  // Florida Atlantic University, Boca Raton campus
  var DEFAULT_LOCATION = {
    name: 'Boca Raton',
    region: 'Florida',
    latitude: 26.3705,
    longitude: -80.1024,
    timezone: 'America/New_York'
  };

  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var REFRESH_MS = 10 * 60 * 1000;

  // WMO weather interpretation codes -> [label, day icon, night icon]
  var WEATHER_CODES = {
    0: ['Clear sky', '☀️', '🌙'],
    1: ['Mainly clear', '🌤️', '🌙'],
    2: ['Partly cloudy', '⛅', '☁️'],
    3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'],
    48: ['Rime fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'],
    53: ['Drizzle', '🌦️', '🌧️'],
    55: ['Heavy drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'],
    57: ['Freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'],
    63: ['Rain', '🌧️', '🌧️'],
    65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌧️', '🌧️'],
    67: ['Freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'],
    73: ['Snow', '🌨️', '🌨️'],
    75: ['Heavy snow', '❄️', '❄️'],
    77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Rain showers', '🌦️', '🌧️'],
    81: ['Rain showers', '🌧️', '🌧️'],
    82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'],
    86: ['Snow showers', '🌨️', '🌨️'],
    95: ['Thunderstorm', '⛈️', '⛈️'],
    96: ['Thunderstorm, hail', '⛈️', '⛈️'],
    99: ['Thunderstorm, hail', '⛈️', '⛈️']
  };

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    location: DEFAULT_LOCATION,
    unit: storageGet('unit') === 'C' ? 'C' : 'F',
    data: null,
    refreshTimer: null
  };

  // ---------- storage (guarded: may be unavailable in private mode) ----------
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
  }

  // ---------- theme ----------
  function applyTheme(choice) {
    var root = document.documentElement;
    if (choice === 'light' || choice === 'dark') {
      root.setAttribute('data-theme', choice);
      storageSet('theme', choice);
    } else {
      choice = 'system';
      root.removeAttribute('data-theme');
      storageSet('theme', null);
    }
    var buttons = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.setAttribute('aria-checked', String(b.getAttribute('data-theme-choice') === choice));
    }
  }

  function initTheme() {
    applyTheme(storageGet('theme') || 'system');
    var buttons = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        applyTheme(e.currentTarget.getAttribute('data-theme-choice'));
      });
    }
  }

  // ---------- greeting ----------
  function renderGreeting() {
    var h = new Date().getHours();
    var part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = part + ', ' + USER_NAME + ' 👋';
    var today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('greeting-sub').textContent = 'Happy ' + today + '. Here’s your live forecast.';
  }

  // ---------- helpers ----------
  function describe(code, isDay) {
    var entry = WEATHER_CODES[code] || ['Unknown', '🌡️', '🌡️'];
    return { label: entry[0], icon: isDay === 0 ? entry[2] : entry[1] };
  }

  function round(n) { return Math.round(n); }

  function tempUnitParam() { return state.unit === 'F' ? 'fahrenheit' : 'celsius'; }
  function windUnitParam() { return state.unit === 'F' ? 'mph' : 'kmh'; }

  function compass(deg) {
    var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  // Open-Meteo returns local times like "2026-09-29T14:00" in the location's timezone.
  function localHour(iso) {
    var h = parseInt(iso.slice(11, 13), 10);
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ' ' + suffix;
  }
  function localClock(iso) {
    var h = parseInt(iso.slice(11, 13), 10);
    var m = iso.slice(14, 16);
    return (h % 12 === 0 ? 12 : h % 12) + ':' + m + (h >= 12 ? ' PM' : ' AM');
  }
  function dayName(isoDate, index) {
    if (index === 0) return 'Today';
    var parts = isoDate.split('-');
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12));
    return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  }

  function uvLabel(uv) {
    if (uv == null) return '--';
    var v = Math.round(uv);
    var level = v <= 2 ? 'Low' : v <= 5 ? 'Moderate' : v <= 7 ? 'High' : v <= 10 ? 'Very high' : 'Extreme';
    return v + ' · ' + level;
  }

  function setStatus(message, isError) {
    var el = $('status');
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('error', !!isError);
  }

  // ---------- data ----------
  function fetchWeather() {
    var loc = state.location;
    var params = new URLSearchParams({
      latitude: loc.latitude,
      longitude: loc.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
      temperature_unit: tempUnitParam(),
      wind_speed_unit: windUnitParam(),
      precipitation_unit: state.unit === 'F' ? 'inch' : 'mm',
      timezone: 'auto',
      forecast_days: 7
    });

    $('updated').textContent = 'Updating…';
    return fetch(FORECAST_URL + '?' + params.toString())
      .then(function (res) {
        if (!res.ok) throw new Error('Weather service returned ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.data = data;
        setStatus('');
        render();
      })
      .catch(function (err) {
        console.error(err);
        setStatus('Couldn’t load the weather right now. Check your connection and try again.', true);
        $('updated').textContent = 'Update failed';
      });
  }

  function scheduleRefresh() {
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(function () {
      renderGreeting();
      fetchWeather();
    }, REFRESH_MS);
  }

  // ---------- render ----------
  function render() {
    var d = state.data;
    if (!d) return;
    var c = d.current;
    var u = '°';
    var windUnit = state.unit === 'F' ? 'mph' : 'km/h';

    var loc = state.location;
    $('location-name').textContent = loc.region ? loc.name + ', ' + loc.region : loc.name;
    $('updated').textContent = 'Updated ' + localClock(c.time) + ' local time';

    var cur = describe(c.weather_code, c.is_day);
    $('current-icon').textContent = cur.icon;
    $('current-temp').textContent = round(c.temperature_2m) + u + state.unit;
    $('current-desc').textContent = cur.label;
    $('current-feels').textContent = 'Feels like ' + round(c.apparent_temperature) + u;
    $('current-hilo').textContent = 'H ' + round(d.daily.temperature_2m_max[0]) + u + ' · L ' + round(d.daily.temperature_2m_min[0]) + u;

    $('m-humidity').textContent = c.relative_humidity_2m + '%';
    $('m-wind').textContent = round(c.wind_speed_10m) + ' ' + windUnit + ' ' + compass(c.wind_direction_10m) +
      (c.wind_gusts_10m ? ' · gusts ' + round(c.wind_gusts_10m) : '');
    var pp = d.daily.precipitation_probability_max[0];
    $('m-precip').textContent = pp == null ? '--' : pp + '%';
    $('m-uv').textContent = uvLabel(d.daily.uv_index_max[0]);
    $('m-pressure').textContent = state.unit === 'F'
      ? (c.surface_pressure * 0.02953).toFixed(2) + ' inHg'
      : round(c.surface_pressure) + ' hPa';
    $('m-sun').textContent = localClock(d.daily.sunrise[0]) + ' / ' + localClock(d.daily.sunset[0]);

    renderHourly(d);
    renderDaily(d);
  }

  function renderHourly(d) {
    var h = d.hourly;
    // Find the first hour at or after the current observation hour.
    var nowHour = d.current.time.slice(0, 13);
    var start = 0;
    for (var i = 0; i < h.time.length; i++) {
      if (h.time[i].slice(0, 13) >= nowHour) { start = i; break; }
    }
    var html = '';
    for (var j = start; j < Math.min(start + 24, h.time.length); j++) {
      var w = describe(h.weather_code[j], h.is_day[j]);
      var p = h.precipitation_probability[j];
      html += '<div class="hour" title="' + w.label + '">' +
        '<div class="t">' + (j === start ? 'Now' : localHour(h.time[j])) + '</div>' +
        '<div class="i" aria-hidden="true">' + w.icon + '</div>' +
        '<div class="v">' + round(h.temperature_2m[j]) + '°</div>' +
        '<div class="p">' + (p ? '💧' + p + '%' : '') + '</div>' +
        '</div>';
    }
    $('hourly').innerHTML = html;
  }

  function renderDaily(d) {
    var dd = d.daily;
    var min = Math.min.apply(null, dd.temperature_2m_min);
    var max = Math.max.apply(null, dd.temperature_2m_max);
    var span = Math.max(max - min, 1);
    var html = '';
    for (var i = 0; i < dd.time.length; i++) {
      var w = describe(dd.weather_code[i], 1);
      var lo = dd.temperature_2m_min[i];
      var hi = dd.temperature_2m_max[i];
      var left = ((lo - min) / span) * 100;
      var width = Math.min(Math.max(((hi - lo) / span) * 100, 4), 100 - left);
      var p = dd.precipitation_probability_max[i];
      html += '<li class="day">' +
        '<span class="name">' + dayName(dd.time[i], i) + '</span>' +
        '<span class="icon" title="' + w.label + '" aria-label="' + w.label + '">' + w.icon + '</span>' +
        '<span class="rain">' + (p ? p + '%' : '') + '</span>' +
        '<span class="bar-cell"><span class="lo">' + round(lo) + '°</span>' +
        '<span class="range"><span style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></span></span></span>' +
        '<span class="hi">' + round(hi) + '°</span>' +
        '</li>';
    }
    $('daily').innerHTML = html;
  }

  // ---------- location ----------
  function setLocation(loc) {
    state.location = loc;
    if (loc === DEFAULT_LOCATION) storageSet('location', null);
    else storageSet('location', JSON.stringify(loc));
    fetchWeather();
    scheduleRefresh();
  }

  function restoreLocation() {
    var saved = storageGet('location');
    if (!saved) return DEFAULT_LOCATION;
    try {
      var loc = JSON.parse(saved);
      if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number' && loc.name) return loc;
    } catch (e) { /* fall through */ }
    return DEFAULT_LOCATION;
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus('Location isn’t supported by this browser.', true);
      return;
    }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      setLocation({
        name: 'My location',
        region: '',
        latitude: +pos.coords.latitude.toFixed(4),
        longitude: +pos.coords.longitude.toFixed(4)
      });
    }, function () {
      setStatus('Couldn’t get your location. You can search for a city instead.', true);
    }, { timeout: 10000, maximumAge: 300000 });
  }

  // ---------- search ----------
  function initSearch() {
    var input = $('search-input');
    var list = $('search-results');
    var debounce = null;
    var results = [];
    var active = -1;
    var requestId = 0;

    function close() {
      list.hidden = true;
      list.innerHTML = '';
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function choose(i) {
      var r = results[i];
      if (!r) return;
      setLocation({
        name: r.name,
        region: [r.admin1, r.country_code === 'US' ? '' : r.country].filter(Boolean).join(', '),
        latitude: r.latitude,
        longitude: r.longitude
      });
      input.value = '';
      input.blur();
      close();
    }

    function highlight() {
      var items = list.querySelectorAll('li');
      for (var i = 0; i < items.length; i++) {
        items[i].setAttribute('aria-selected', String(i === active));
      }
    }

    function show() {
      if (!results.length) {
        list.innerHTML = '<li class="sub">No matches found</li>';
        list.hidden = false;
        return;
      }
      list.innerHTML = results.map(function (r, i) {
        var sub = [r.admin1, r.country].filter(Boolean).join(', ');
        return '<li role="option" data-i="' + i + '" aria-selected="false">' +
          escapeHtml(r.name) + '<div class="sub">' + escapeHtml(sub) + '</div></li>';
      }).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function search(q) {
      var id = ++requestId;
      var params = new URLSearchParams({ name: q, count: 6, language: 'en', format: 'json' });
      fetch(GEOCODE_URL + '?' + params.toString())
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (id !== requestId) return;
          results = data.results || [];
          active = -1;
          show();
        })
        .catch(function () { if (id === requestId) close(); });
    }

    input.addEventListener('input', function () {
      clearTimeout(debounce);
      var q = input.value.trim();
      if (q.length < 2) { requestId++; close(); return; }
      debounce = setTimeout(function () { search(q); }, 250);
    });

    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); highlight(); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });

    $('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (results.length) choose(active >= 0 ? active : 0);
    });

    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); choose(+li.getAttribute('data-i')); }
    });

    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---------- units ----------
  function initUnits() {
    var btn = $('unit-btn');
    function label() {
      btn.textContent = state.unit === 'F' ? '°F' : '°C';
      btn.setAttribute('aria-label', 'Units: ' + (state.unit === 'F' ? 'Fahrenheit' : 'Celsius') + '. Click to switch.');
    }
    label();
    btn.addEventListener('click', function () {
      state.unit = state.unit === 'F' ? 'C' : 'F';
      storageSet('unit', state.unit);
      label();
      fetchWeather();
    });
  }

  // ---------- boot ----------
  function init() {
    initTheme();
    renderGreeting();
    initSearch();
    initUnits();
    $('locate-btn').addEventListener('click', useMyLocation);
    $('home-btn').addEventListener('click', function () { setLocation(DEFAULT_LOCATION); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { renderGreeting(); fetchWeather(); }
    });
    setLocation(restoreLocation());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
