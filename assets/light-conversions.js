// Light Conversions: lux / foot-candles / PPFD / W/m² PAR, DLI, parallel-scale SVG, shareable URL state.
(function () {
  'use strict';

  const LUX_PER_FC = 1 / 0.09290304; // 1 fc = 1 lm/ft², exact: 10.7639104 lx
  const DLI_K = 3600 / 1e6;          // µmol/m²/s × h → mol/m²/day
  const FULL_SUN = 2000;             // µmol/m²/s, clear summer noon (rule of thumb)

  // flux: µmol/m²/s per lux; fw: µmol/J (400–700 nm). See the article for sources.
  const SOURCES = {
    sun: { name: 'Sunlight', flux: 0.0185, fw: 4.57, hint: 'Thimijan & Heins (1983): 54 lux per µmol/m²/s, 4.57 µmol/J.' },
    hps: { name: 'High-pressure sodium', flux: 0.0122, fw: 4.98, hint: 'Standard (mogul-base) HPS: 82 lux per µmol/m²/s, 4.98 µmol/J.' },
    mh: { name: 'Metal halide', flux: 0.0141, fw: 4.59, hint: '71 lux per µmol/m²/s, 4.59 µmol/J.' },
    cwf: { name: 'Cool-white fluorescent', flux: 0.0135, fw: 4.59, hint: '74 lux per µmol/m²/s, 4.59 µmol/J.' },
    warmled: { name: 'Warm white LED (3000 K, CRI 80)', flux: 0.0145, fw: 4.9, hint: 'Sharakshane (2018) regression: 14.5 µmol/m²/s per 1000 lx. W/m² factor is an estimate.' },
    coolled: { name: 'Cool white LED (5000 K, CRI 80)', flux: 0.0139, fw: 4.6, hint: 'Sharakshane (2018) regression: 13.9 µmol/m²/s per 1000 lx. W/m² factor is an estimate.' },
    custom: { name: 'Custom factors', flux: 0, fw: 0, hint: 'Enter factors from your fixture datasheet or a side-by-side lux and PAR meter reading.' }
  };

  // Local unit group for the light reading (conversion depends on the source).
  const LIGHT_UNITS = [
    { id: 'lx', label: 'lux' },
    { id: 'klx', label: 'klux' },
    { id: 'fc', label: 'fc' },
    { id: 'umol', label: 'µmol/m²/s' },
    { id: 'wpar', label: 'W/m² PAR' }
  ];

  // Rules of thumb in DLI (mol/m²/day); see article table.
  const BANDS = [
    { id: 'seed', name: 'Seedlings', lo: 6, hi: 15 },
    { id: 'leafy', name: 'Leafy greens', lo: 12, hi: 17 },
    { id: 'fruit', name: 'Fruiting crops', lo: 15, hi: 30 }
  ];

  const DEFAULTS = { src: 'warmled', light: 20000, light_u: 'lx', hours: 16, hours_u: 'h', flux: 0.0185, fw: 4.57 };

  const $ = function (id) { return document.getElementById(id); };
  const srcSel = $('src');
  const lightIn = $('light');
  const lightSel = $('light_u');
  const hoursIn = $('hours');
  const fluxIn = $('flux');
  const fwIn = $('fw');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function compact(n) {
    if (n >= 1e6) return +(n / 1e6).toPrecision(3) + 'M';
    if (n >= 1e4) return +(n / 1e3).toPrecision(3) + 'k';
    return fmt(n);
  }

  function unitLabel(id) {
    for (let i = 0; i < LIGHT_UNITS.length; i++) if (LIGHT_UNITS[i].id === id) return LIGHT_UNITS[i].label;
    return id;
  }

  // ---------- Factors and conversions ----------
  function factors() {
    const s = srcSel.value;
    if (s === 'custom') {
      const f = parseFloat(fluxIn.value), w = parseFloat(fwIn.value);
      return { flux: isFinite(f) && f > 0 ? f : 0, fw: isFinite(w) && w > 0 ? w : 0 };
    }
    return { flux: SOURCES[s].flux, fw: SOURCES[s].fw };
  }

  // Multiplier that turns one of `unit` into µmol/m²/s (0 if the factor is missing).
  function perUnit(unit, f) {
    switch (unit) {
      case 'lx': return f.flux;
      case 'klx': return 1000 * f.flux;
      case 'fc': return LUX_PER_FC * f.flux;
      case 'umol': return 1;
      case 'wpar': return f.fw;
    }
    return 0;
  }

  function hoursValue() { return CalcUnits.base('hours') / 3600; }

  function compute() {
    const f = factors();
    const v = parseFloat(lightIn.value);
    const unit = lightSel.value;
    const k = perUnit(unit, f);
    const valid = isFinite(v) && v > 0 && k > 0;
    const ppfd = valid ? v * k : 0;
    const h = hoursValue();
    return {
      f: f, unit: unit, raw: v, valid: valid, ppfd: ppfd,
      lux: f.flux > 0 ? ppfd / f.flux : NaN,
      fc: f.flux > 0 ? ppfd / f.flux / LUX_PER_FC : NaN,
      w: f.fw > 0 ? ppfd / f.fw : NaN,
      hours: h,
      dli: ppfd * Math.min(h, 24) * DLI_K
    };
  }

  // ---------- Light unit select (local group) ----------
  LIGHT_UNITS.forEach(function (u) {
    const o = document.createElement('option');
    o.value = u.id;
    o.textContent = u.label;
    lightSel.appendChild(o);
  });
  lightSel.value = 'lx';
  lightSel.dataset.prev = 'lx';

  lightSel.addEventListener('change', function () {
    const f = factors();
    const from = perUnit(lightSel.dataset.prev, f), to = perUnit(lightSel.value, f);
    const v = parseFloat(lightIn.value);
    if (isFinite(v) && from > 0 && to > 0) lightIn.value = +(v * from / to).toPrecision(6);
    lightSel.dataset.prev = lightSel.value;
    render();
  });

  function setLight(value, unit) {
    if (unit && perUnitKnown(unit)) { lightSel.value = unit; lightSel.dataset.prev = unit; }
    lightIn.value = value;
  }
  function perUnitKnown(u) { return LIGHT_UNITS.some(function (x) { return x.id === u; }); }

  // ---------- Range status ----------
  function bandHits(dli) {
    return BANDS.filter(function (b) { return dli >= b.lo && dli <= b.hi; });
  }

  function statusText(r) {
    if (!r.valid || !(r.hours > 0)) return '';
    const hits = bandHits(r.dli);
    if (r.ppfd > FULL_SUN) return 'Brighter than full sun (≈2000 µmol/m²/s)';
    if (hits.length) return 'In the ' + hits.map(function (b) { return b.name.toLowerCase(); }).join(' and ') + ' range at ' + fmt(r.hours) + ' h/day';
    if (r.dli < BANDS[0].lo) return 'Below the seedling range at ' + fmt(r.hours) + ' h/day';
    return 'Above the fruiting crop range at ' + fmt(r.hours) + ' h/day';
  }

  // ---------- State ----------
  function getState() {
    const st = { src: srcSel.value, light: lightIn.value, light_u: lightSel.value, hours: hoursIn.value, hours_u: CalcUnits.unit('hours') };
    if (srcSel.value === 'custom') { st.flux = fluxIn.value; st.fw = fwIn.value; }
    return st;
  }

  function applyDefaults() {
    srcSel.value = DEFAULTS.src;
    setLight(DEFAULTS.light, DEFAULTS.light_u);
    CalcUnits.set('hours', DEFAULTS.hours, DEFAULTS.hours_u);
    fluxIn.value = DEFAULTS.flux;
    fwIn.value = DEFAULTS.fw;
  }

  function syncSource() {
    const s = srcSel.value;
    $('custom-fields').hidden = s !== 'custom';
    $('src-hint').textContent = SOURCES[s].hint;
    const f = parseFloat(fluxIn.value);
    $('flux-hint').textContent = isFinite(f) && f > 0 ? '= ' + fmt(1 / f, 1) + ' lux per µmol/m²/s' : 'e.g. 0.0185 for sunlight';
  }

  // ---------- Render ----------
  function render() {
    syncSource();
    const r = compute();
    const notice = $('notice');
    const msgs = [];
    const v = r.raw;

    if (!isFinite(v) || v <= 0) msgs.push('Enter a light reading above zero.');
    else if (!r.valid) msgs.push('Enter the custom ' + (r.unit === 'wpar' ? 'PPFD per W/m² (µmol/J)' : 'PPFD per lux') + ' factor to convert this reading.');
    if (srcSel.value === 'custom' && r.valid) {
      if (!(r.f.flux > 0)) msgs.push('No PPFD-per-lux factor, so lux and foot-candles are not shown.');
      if (!(r.f.fw > 0)) msgs.push('No µmol/J factor, so W/m² is not shown.');
      if (r.f.flux > 0 && (r.f.flux < 0.008 || r.f.flux > 0.03)) msgs.push('Your PPFD-per-lux factor is outside the usual 0.01–0.02 range for white light. Check it.');
      if (r.f.fw > 0 && (r.f.fw < 3.34 || r.f.fw > 5.85)) msgs.push('A µmol/J factor must lie between 3.34 (400 nm) and 5.85 (700 nm) for 400–700 nm light.');
    }
    if (!(r.hours > 0)) msgs.push('Enter a photoperiod to see the DLI.');
    else if (r.hours > 24) msgs.push('A day has only 24 hours. DLI is shown for 24 h.');
    if (r.valid && r.ppfd > 2500) msgs.push('This is brighter than full sunlight. Check the reading and the unit.');
    notice.innerHTML = '';
    msgs.forEach(function (m, i) { if (i) notice.appendChild(document.createElement('br')); notice.appendChild(document.createTextNode(m)); });
    notice.hidden = msgs.length === 0;

    const ent = function (u) { return r.unit === u || (u === 'lx' && r.unit === 'klx') ? ' (entered)' : ''; };
    $('r-ppfd').textContent = r.valid ? fmt(r.ppfd) + ' µmol/m²/s' : '–';
    $('r-status').textContent = statusText(r);
    $('r-lux').textContent = r.valid && isFinite(r.lux) ? fmt(r.lux) + ' lx' + ent('lx') : '–';
    $('r-fc').textContent = r.valid && isFinite(r.fc) ? fmt(r.fc) + ' fc' + ent('fc') : '–';
    $('r-w').textContent = r.valid && isFinite(r.w) ? fmt(r.w) + ' W/m²' + ent('wpar') : '–';
    $('r-dli').textContent = r.valid && r.hours > 0 ? fmt(r.dli, 1) + ' mol/m²/day' : '–';
    $('r-factor').textContent = r.f.flux > 0 ? '1 µmol/m²/s ≈ ' + fmt(1 / r.f.flux, 1) + ' lx' : (r.f.fw > 0 ? fmt(r.f.fw) + ' µmol/J' : '–');

    $('viz-caption').textContent = r.valid
      ? fmt(r.ppfd) + ' µmol/m²/s' + (isFinite(r.lux) ? ' = ' + fmt(r.lux) + ' lx' : '') + (r.hours > 0 ? ' · DLI ' + fmt(r.dli, 1) + ' mol/m²/day' : '') + ' · ' + SOURCES[srcSel.value].name
      : 'Enter a light reading to compare units';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const AX0 = 118, AX1 = 462;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function niceStep(max, count) {
    const raw = max / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 8 ? 8 : 10) * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    el('text', { x: 8, y: 13, class: 'head-text' }, 'Same light on four scales (' + SOURCES[srcSel.value].name.replace(/ \(.*\)/, '') + ')');

    // Parallel scales: x position = physical PPFD, ticks in each unit.
    const pmax = r.valid ? niceMax(r.ppfd * 1.35) : 500;
    const xOf = function (ppfd) { return AX0 + (AX1 - AX0) * Math.min(ppfd / pmax, 1); };
    const rows = [
      { name: 'PPFD', unit: 'µmol/m²/s', k: 1, val: r.ppfd, entered: r.unit === 'umol' },
      { name: 'Illuminance', unit: 'lx', k: r.f.flux, val: r.lux, entered: r.unit === 'lx' || r.unit === 'klx' },
      { name: 'Illuminance', unit: 'fc', k: r.f.flux * LUX_PER_FC, val: r.fc, entered: r.unit === 'fc' },
      { name: 'PAR', unit: 'W/m²', k: r.f.fw, val: r.w, entered: r.unit === 'wpar' }
    ];
    const y0 = 46, dy = 44;
    rows.forEach(function (row, i) {
      const y = y0 + i * dy;
      el('text', { x: 8, y: y - 4, class: 'row-name' }, row.name + ' ' + row.unit);
      const ok = row.k > 0;
      el('text', { x: 8, y: y + 12, class: 'row-val' + (row.entered ? ' entered' : '') },
        ok && r.valid ? (row.val >= 1e6 ? compact(row.val) : fmt(row.val)) : (ok ? '–' : 'no factor'));
      el('line', { x1: AX0, y1: y, x2: AX1, y2: y, class: 'axis' });
      if (!ok) return;
      const umax = pmax / row.k; // axis end in this unit
      const step = niceStep(umax, 4);
      const xm = r.valid ? xOf(r.ppfd) : -999;
      for (let t = 0; t <= umax + 1e-9; t += step) {
        const x = AX0 + (AX1 - AX0) * (t / umax);
        el('line', { x1: x, y1: y - 4, x2: x, y2: y + 4, class: 'tick' });
        if (Math.abs(x - xm) < 16 && t > 0) continue; // keep labels clear of the marker
        el('text', { x: x, y: y + 17, 'text-anchor': t === 0 ? 'start' : 'middle', class: 'tick-text' }, compact(+t.toPrecision(6)));
      }
    });
    if (r.valid) {
      const x = xOf(r.ppfd);
      el('line', { x1: x, y1: y0 - 14, x2: x, y2: y0 + 3 * dy + 6, class: 'marker' });
      rows.forEach(function (row, i) { if (row.k > 0) el('circle', { cx: x, cy: y0 + i * dy, r: 4, class: 'marker-dot' }); });
    }

    // Range bar: PPFD needed for each crop band at this photoperiod, vs full sun.
    const top = 228;
    const h = Math.min(r.hours, 24);
    const rmax = Math.max(2200, r.valid ? Math.min(r.ppfd * 1.1, 5000) : 0);
    const xr = function (p) { return AX0 + (AX1 - AX0) * Math.min(p / rmax, 1); };
    el('text', { x: 8, y: top - 8, class: 'head-text' }, h > 0 ? 'PPFD vs typical needs at ' + fmt(h) + ' h/day (rule of thumb)' : 'PPFD vs typical needs (enter a photoperiod)');
    const laneH = 14, gap = 8;
    BANDS.forEach(function (b, i) {
      const y = top + 6 + i * (laneH + gap);
      el('text', { x: 8, y: y + 11, class: 'row-name' }, b.name);
      el('rect', { x: AX0, y: y, width: AX1 - AX0, height: laneH, rx: 4, class: 'track' });
      if (h > 0) {
        const lo = b.lo / (h * DLI_K), hi = b.hi / (h * DLI_K);
        const hit = r.valid && r.dli >= b.lo && r.dli <= b.hi;
        el('rect', { x: xr(lo), y: y, width: Math.max(2, xr(hi) - xr(lo)), height: laneH, rx: 4, class: 'band' + (hit ? ' hit' : '') });
      }
    });
    const axisY = top + 6 + 3 * (laneH + gap) + 2;
    el('line', { x1: AX0, y1: axisY, x2: AX1, y2: axisY, class: 'axis' });
    const rstep = niceStep(rmax, 4);
    for (let t = 0; t <= rmax + 1e-9; t += rstep) {
      const x = xr(t);
      el('line', { x1: x, y1: axisY - 4, x2: x, y2: axisY + 4, class: 'tick' });
      el('text', { x: x, y: axisY + 17, 'text-anchor': t === 0 ? 'start' : 'middle', class: 'tick-text' }, compact(t));
    }
    el('text', { x: 8, y: axisY + 17, class: 'tick-text' }, 'µmol/m²/s');
    const xs = xr(FULL_SUN);
    el('line', { x1: xs, y1: top, x2: xs, y2: axisY, class: 'sun-line' });
    el('text', { x: xs - 4, y: top + 6 + 3 * (laneH + gap) - 4, 'text-anchor': 'end', class: 'sun-text' }, 'Full sun ≈ 2000');
    if (r.valid) {
      const x = xr(r.ppfd);
      el('line', { x1: x, y1: top + 2, x2: x, y2: axisY, class: 'marker' });
      el('path', { d: 'M' + (x - 6) + ',' + (top - 4) + ' L' + (x + 6) + ',' + (top - 4) + ' L' + x + ',' + (top + 4) + 'Z', class: 'marker-dot' });
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'Light Conversions',
      'Light source: ' + SOURCES[srcSel.value].name + (srcSel.value === 'custom' ? ' (' + fluxIn.value + ' µmol/m²/s per lx, ' + fwIn.value + ' µmol/J)' : ''),
      'Reading: ' + lightIn.value + ' ' + unitLabel(lightSel.value) + ', photoperiod ' + hoursIn.value + ' ' + CalcUnits.unitLabel('hours'),
      'PPFD: ' + (r.valid ? fmt(r.ppfd) + ' µmol/m²/s' : '–'),
      'Illuminance: ' + (r.valid && isFinite(r.lux) ? fmt(r.lux) + ' lx / ' + fmt(r.fc) + ' fc' : '–'),
      'PAR irradiance: ' + (r.valid && isFinite(r.w) ? fmt(r.w) + ' W/m²' : '–'),
      'DLI: ' + (r.valid && r.hours > 0 ? fmt(r.dli, 1) + ' mol/m²/day' : '–')
    ];
    const st = statusText(r);
    if (st) lines.push(st + ' (rule of thumb)');
    lines.push('Lux-based conversions are approximate (lux is weighted for human vision).');
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  [lightIn, hoursIn, fluxIn, fwIn].forEach(function (i) { i.addEventListener('input', render); });
  srcSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Light Conversions', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.src && SOURCES[p.src]) srcSel.value = p.src;
    if (p.flux !== undefined && isFinite(parseFloat(p.flux))) fluxIn.value = p.flux;
    if (p.fw !== undefined && isFinite(parseFloat(p.fw))) fwIn.value = p.fw;
    if (p.light !== undefined && isFinite(parseFloat(p.light))) setLight(p.light, p.light_u);
    else if (p.light_u) setLight(lightIn.value, p.light_u);
    if (p.hours !== undefined && isFinite(parseFloat(p.hours))) CalcUnits.set('hours', p.hours, p.hours_u);
    else if (p.hours_u) CalcUnits.set('hours', hoursIn.value, p.hours_u);
    render();
  })();
})();
