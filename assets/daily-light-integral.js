// Daily Light Integral calculator: DLI from PPFD and photoperiod, reverse modes,
// light-unit conversion by source, 24 h light-curve SVG and crop-range gauge.
(function () {
  'use strict';

  // Lux -> PPFD (µmol/m²/s per lux) and PAR W/m² -> PPFD (µmol/J).
  // Sun, HPS, MH, CWF: Thimijan & Heins (1983), as tabulated by Apogee Instruments.
  // White LED: lux factor from Sharakshane (2018) "1000 lx = 15 µmol/s/m²";
  // W/m² factor estimated from E = hc/λ at ~560 nm mean PAR wavelength.
  const SOURCES = {
    led: { name: 'White LED (typical)', lux: 0.015, w: 4.7 },
    // Same factors as the Light Conversions page (Sharakshane 2018 regression; W/m² estimated)
    warmled: { name: 'Warm white LED (3000 K)', lux: 0.0145, w: 4.9 },
    coolled: { name: 'Cool white LED (5000 K)', lux: 0.0139, w: 4.6 },
    sun: { name: 'Sunlight', lux: 0.0185, w: 4.57 },
    hps: { name: 'High-pressure sodium', lux: 0.0122, w: 4.98 },
    mh: { name: 'Metal halide', lux: 0.0141, w: 4.59 },
    cwf: { name: 'Cool-white fluorescent', lux: 0.0135, w: 4.59 }
  };
  const LUX_PER_FC = 1 / 0.09290304; // 1 fc = 1 lm/ft² = 10.7639 lux (exact)

  // Light-intensity units (not in units.js because the factor depends on the source).
  const LIGHT_UNITS = [
    { id: 'umol', label: 'µmol/m²/s' },
    { id: 'lux', label: 'lux' },
    { id: 'fc', label: 'foot-candles' },
    { id: 'wm2', label: 'W/m² (PAR)' }
  ];

  // Rule-of-thumb crop ranges, mol/m²/day (see article for sources).
  const CROPS = {
    lettuce: { name: 'Lettuce & leafy greens', lo: 12, hi: 17, hint: 'Rule of thumb 12–17 (Stallknecht 2025). High DLI raises tipburn risk.' },
    herbs: { name: 'Basil & culinary herbs', lo: 15, hi: 25, hint: 'Rule of thumb 15–25, based on basil (Stallknecht 2025).' },
    fruiting: { name: 'Tomato & fruiting crops', lo: 20, hi: 30, hint: 'Rule of thumb 20–30 or more (Stallknecht 2025; Purdue HO-303-W).' },
    seedlings: { name: 'Vegetable transplants / seedlings', lo: 10, hi: 12, hint: '10–12 is acceptable; more light gives faster growth (Purdue HO-303-W).' },
    microgreens: { name: 'Microgreens', lo: 6, hi: 18, hint: 'Range tested by Gerovac et al. (2016), not an established target.' },
    custom: { name: 'Custom target (no crop range)', lo: null, hi: null, hint: 'Enter your own target DLI below.' }
  };

  const DEFAULTS = { mode: 'dli', crop: 'lettuce', pattern: 'const', src: 'led', ppfd: 250, ppfd_u: 'umol', hours: 16, hours_u: 'h', out_u: 'umol' };

  const $ = function (id) { return document.getElementById(id); };
  const ppfdIn = $('ppfd'), hoursIn = $('hours'), targetIn = $('target');
  const ppfdUnit = $('ppfd_u'), outUnit = $('out_u');
  const cropSel = $('crop'), patternSel = $('pattern'), srcSel = $('src');
  const modeButtons = document.querySelectorAll('#mode-group button');
  const svg = $('viz');
  let mode = 'dli';

  // ---------- Setup selects ----------
  Object.keys(CROPS).forEach(function (k) {
    const o = document.createElement('option');
    o.value = k; o.textContent = CROPS[k].name; cropSel.appendChild(o);
  });
  [ppfdUnit, outUnit].forEach(function (sel) {
    LIGHT_UNITS.forEach(function (u) {
      const o = document.createElement('option');
      o.value = u.id; o.textContent = u.label; sel.appendChild(o);
    });
  });

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function lightLabel(id) {
    for (let i = 0; i < LIGHT_UNITS.length; i++) if (LIGHT_UNITS[i].id === id) return LIGHT_UNITS[i].label;
    return id;
  }
  function validLight(id) { return LIGHT_UNITS.some(function (u) { return u.id === id; }); }

  // ---------- Light conversion ----------
  function factor(unit) { // µmol/m²/s per one `unit`
    const s = SOURCES[srcSel.value];
    if (unit === 'lux') return s.lux;
    if (unit === 'fc') return s.lux * LUX_PER_FC;
    if (unit === 'wm2') return s.w;
    return 1;
  }
  function toPPFD(v, unit) { return v * factor(unit); }
  function fromPPFD(p, unit) { return p / factor(unit); }
  function showLight(ppfd, unit) {
    unit = unit || outUnit.value;
    const s = fmt(fromPPFD(ppfd, unit)) + ' ' + lightLabel(unit);
    return unit === 'umol' ? s : s + ' (' + fmt(ppfd) + ' µmol/m²/s)';
  }

  function posVal(input) {
    const v = parseFloat(input.value);
    return isFinite(v) && v > 0 ? v : 0;
  }

  // ---------- Model ----------
  function compute() {
    const k = patternSel.value === 'sine' ? 2 / Math.PI : 1;
    const crop = CROPS[cropSel.value];
    const target = posVal(targetIn);
    let ppfd = toPPFD(posVal(ppfdIn), ppfdUnit.value); // constant level, or sine peak
    let hours = CalcUnits.base('hours') / 3600;
    let dli = 0;
    let missing = '';

    if (mode === 'dli') {
      if (!ppfd || !hours) missing = 'Enter the light intensity and photoperiod.';
      dli = ppfd * hours * 3600 * k / 1e6;
    } else if (mode === 'ppfd') {
      if (!target || !hours) missing = 'Enter the target DLI and photoperiod.';
      ppfd = hours && target ? target * 1e6 / (k * hours * 3600) : 0;
      dli = target;
    } else {
      if (!target || !ppfd) missing = 'Enter the target DLI and light intensity.';
      hours = ppfd && target ? target * 1e6 / (k * ppfd * 3600) : 0;
      dli = target;
    }
    const needPPFD = target && hours ? target * 1e6 / (k * hours * 3600) : NaN;
    const needHours = target && ppfd ? target * 1e6 / (k * ppfd * 3600) : NaN;

    let status = '';
    if (!missing && crop.lo !== null) status = dli < crop.lo - 1e-9 ? 'below' : dli > crop.hi + 1e-9 ? 'above' : 'within';

    return { k: k, crop: crop, target: target, ppfd: ppfd, hours: hours, dli: dli, needPPFD: needPPFD, needHours: needHours, missing: missing, status: status };
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for.split(' ').indexOf(m) === -1;
    });
    updateLabels();
  }

  function updateLabels() {
    const sine = patternSel.value === 'sine';
    $('ppfd-label').textContent = sine ? 'Peak light intensity at midday' : 'Light intensity (PPFD at canopy)';
    $('hours-label').textContent = sine ? 'Day length (sunrise to sunset)' : 'Photoperiod (hours of light per day)';
    $('target-label').textContent = mode === 'dli' ? 'Target DLI (to work out light or hours needed)' : 'Target DLI';
    const u = ppfdUnit.value;
    $('ppfd-hint').textContent = u === 'umol'
      ? 'Light source only matters for lux, foot-candle or W/m² values.'
      : 'Converted with ≈' + fmt(factor(u), 4) + ' µmol/m²/s per ' + (u === 'wm2' ? 'W/m²' : lightLabel(u).replace(/s$/, '')) + ' for ' + SOURCES[srcSel.value].name.toLowerCase() + ' (approximate).';
    $('crop-hint').textContent = CROPS[cropSel.value].hint;
  }

  function cropTarget() {
    const c = CROPS[cropSel.value];
    return c.lo === null ? '' : String(+((c.lo + c.hi) / 2).toFixed(2));
  }

  function getState() {
    const st = { mode: mode, crop: cropSel.value, pattern: patternSel.value, src: srcSel.value, target: targetIn.value, out_u: outUnit.value };
    if (mode !== 'ppfd') { st.ppfd = ppfdIn.value; st.ppfd_u = ppfdUnit.value; }
    if (mode !== 'hours') { st.hours = hoursIn.value; st.hours_u = CalcUnits.unit('hours'); }
    return st;
  }

  function applyDefaults() {
    cropSel.value = DEFAULTS.crop;
    patternSel.value = DEFAULTS.pattern;
    srcSel.value = DEFAULTS.src;
    ppfdIn.value = DEFAULTS.ppfd;
    ppfdUnit.value = DEFAULTS.ppfd_u; ppfdUnit.dataset.prev = DEFAULTS.ppfd_u;
    outUnit.value = DEFAULTS.out_u;
    CalcUnits.set('hours', DEFAULTS.hours, DEFAULTS.hours_u);
    targetIn.value = cropTarget();
  }

  // ---------- Render ----------
  const STATUS_TEXT = { below: 'Below the crop range', within: 'Within the crop range', above: 'Above the crop range' };

  function render() {
    updateLabels();
    const r = compute();
    const notice = $('notice');
    const msgs = [];
    if (r.missing) msgs.push(r.missing);
    else {
      if (r.hours > 24 + 1e-9) msgs.push(mode === 'hours'
        ? 'More than 24 hours of light would be needed. Raise the light intensity to at least ' + showLight(r.target * 1e6 / (r.k * 24 * 3600)) + '.'
        : 'A day has only 24 hours. Check the photoperiod.');
      if (r.ppfd > 2500) msgs.push('That is brighter than full midday summer sun (about 2,000 µmol/m²/s). Check the light value and unit.');
      if (r.k !== 1 && r.hours > 18) msgs.push('A natural day longer than 18 hours only happens at high latitudes in summer.');
      if (ppfdUnit.value === 'lux' || ppfdUnit.value === 'fc') {
        if (mode !== 'ppfd') msgs.push('Lux readings are only rough guides to PPFD, and are badly wrong under red/blue grow lights.');
      }
    }
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const ok = !r.missing;
    const dliTxt = ok ? fmt(r.dli, 1) + ' mol/m²/day' : '–';
    if (mode === 'dli') {
      $('r-main-label').textContent = 'Daily light integral';
      $('r-main').textContent = dliTxt;
    } else if (mode === 'ppfd') {
      $('r-main-label').textContent = (r.k !== 1 ? 'Peak midday light needed' : 'Light intensity needed') + ' for ' + (ok ? fmt(r.target, 1) : '–') + ' mol/m²/day';
      $('r-main').textContent = ok ? fmt(fromPPFD(r.ppfd, outUnit.value)) + ' ' + lightLabel(outUnit.value) : '–';
    } else {
      $('r-main-label').textContent = 'Hours of light needed for ' + (ok ? fmt(r.target, 1) : '–') + ' mol/m²/day';
      $('r-main').textContent = ok ? fmt(r.hours, 1) + ' h/day' : '–';
    }

    const st = $('r-status');
    if (ok && r.status) {
      st.textContent = STATUS_TEXT[r.status] + ' (' + r.crop.lo + '–' + r.crop.hi + ')';
      st.style.color = r.status === 'within' ? 'var(--accent)' : 'var(--warn-text)';
    } else { st.textContent = ''; }

    $('r-dli').textContent = dliTxt;
    $('r-range').textContent = r.crop.lo !== null ? r.crop.lo + '–' + r.crop.hi + ' mol/m²/day' : 'none (custom)';
    $('r-ppfd').textContent = ok ? (r.k !== 1 ? 'peak ' : '') + showLight(r.ppfd) : '–';
    $('r-hours').textContent = ok ? fmt(r.hours, 2) + ' h' : '–';
    $('r-need-ppfd-label').textContent = (r.k !== 1 ? 'Peak PPFD' : 'PPFD') + ' for target DLI';
    $('r-need-ppfd').textContent = ok && isFinite(r.needPPFD) ? showLight(r.needPPFD) : '–';
    $('r-need-hours').textContent = ok && isFinite(r.needHours) ? fmt(r.needHours, 2) + ' h' + (r.needHours > 24 ? ' (not possible)' : '') : '–';

    $('viz-caption').textContent = ok
      ? fmt(r.dli, 1) + ' mol/m²/day' + (r.status ? ' · ' + STATUS_TEXT[r.status].toLowerCase() + ' for ' + r.crop.name.toLowerCase() : '')
      : 'Enter values to draw the light curve';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;
  const CH = { l: 52, r: 16, t: 26, b: 212 }; // chart box (b = baseline y)
  const G = { l: 20, r: 460, y: 302, h: 16 };  // gauge bar

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }
  function text(x, y, t, anchor, cls) { return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, t); }

  function niceMax(v) {
    if (!(v > 0)) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const x0 = CH.l, x1 = VW - CH.r, yB = CH.b, yT = CH.t;
    const ok = !r.missing && r.ppfd > 0 && r.hours > 0;
    const hrs = Math.min(r.hours, 24);
    const yMax = niceMax(Math.max(ok ? r.ppfd : 0, isFinite(r.needPPFD) && r.needPPFD < 3000 ? r.needPPFD : 0) * 1.12);
    const X = function (h) { return x0 + (x1 - x0) * h / 24; };
    const Y = function (p) { return yB - (yB - yT) * Math.min(p, yMax) / yMax; };

    // grid + axes
    for (let i = 1; i <= 4; i++) {
      const p = yMax * i / 4;
      el('line', { x1: x0, y1: Y(p), x2: x1, y2: Y(p), class: 'grid' });
      text(x0 - 6, Y(p) + 4, fmt(p, 0), 'end');
    }
    text(x0 - 6, yB + 4, '0', 'end');
    text(x0, 14, 'PPFD µmol/m²/s', 'start');
    for (let h = 0; h <= 24; h += 6) {
      el('line', { x1: X(h), y1: yB, x2: X(h), y2: yB + 5, class: 'axis' });
      text(X(h), yB + 19, (h < 10 ? '0' : '') + h + ':00');
    }

    if (ok) {
      const start = 12 - hrs / 2, end = 12 + hrs / 2;
      let d;
      if (r.k === 1) {
        d = 'M' + X(start) + ',' + yB + ' L' + X(start) + ',' + Y(r.ppfd) + ' L' + X(end) + ',' + Y(r.ppfd) + ' L' + X(end) + ',' + yB + 'Z';
      } else {
        d = 'M' + X(start) + ',' + yB;
        const n = 60;
        for (let i = 0; i <= n; i++) {
          const t = start + hrs * i / n;
          d += ' L' + X(t).toFixed(2) + ',' + Y(r.ppfd * Math.sin(Math.PI * i / n)).toFixed(2);
        }
        d += 'Z';
      }
      el('path', { class: 'light-area', d: d });
      const midY = r.k === 1 ? (Y(r.ppfd) + yB) / 2 : Y(r.ppfd * 0.45);
      const lbl = 'DLI ' + fmt(r.dli, 1);
      const inside = (X(end) - X(start)) > 110 && (yB - Y(r.ppfd)) > 34;
      if (inside) {
        text(X(12), midY, lbl, 'middle', 'light-text');
        text(X(12), midY + 16, 'mol/m²/day', 'middle', 'light-text');
      } else {
        text(X(12), Math.max(yT + 12, Y(r.ppfd) - 22), lbl + ' mol/m²/day', 'middle', 'light-text');
      }
      // level label
      const lvl = (r.k === 1 ? '' : 'peak ') + fmt(r.ppfd, 0);
      text(X(end) + 6 > x1 - 40 ? X(start) - 6 : X(end) + 6, Math.max(yT + 4, Y(r.ppfd)) + 4, lvl, X(end) + 6 > x1 - 40 ? 'end' : 'start', 'depth-text');
      // photoperiod dimension
      el('path', { class: 'dim', d: 'M' + X(start) + ',' + (yB + 30) + ' L' + X(end) + ',' + (yB + 30) + ' M' + X(start) + ',' + (yB + 25) + ' L' + X(start) + ',' + (yB + 35) + ' M' + X(end) + ',' + (yB + 25) + ' L' + X(end) + ',' + (yB + 35) });
      text(X(12), yB + 46, fmt(r.hours, 1) + ' h ' + (r.k === 1 ? 'lights on' : 'daylight'));

      // dashed line: level that would give the target over the same hours
      if (mode === 'dli' && isFinite(r.needPPFD) && r.needPPFD <= yMax && Math.abs(r.needPPFD - r.ppfd) / r.ppfd > 0.02) {
        el('line', { x1: x0, y1: Y(r.needPPFD), x2: x1, y2: Y(r.needPPFD), class: 'target-line' });
        text(x0 + 4, Y(r.needPPFD) - 5, 'target ' + fmt(r.needPPFD, 0), 'start', 'target-text');
      }
    }
    el('path', { class: 'axis', d: 'M' + x0 + ',' + yT + ' L' + x0 + ',' + yB + ' L' + x1 + ',' + yB });

    drawGauge(r, ok);
  }

  function drawGauge(r, ok) {
    const c = r.crop;
    const gMax = niceMax(Math.max(35, (c.hi || 0) * 1.3, ok ? r.dli * 1.1 : 0));
    const GX = function (v) { return G.l + (G.r - G.l) * Math.min(Math.max(v, 0), gMax) / gMax; };
    text(G.l, G.y - 30, 'DLI vs crop range (mol/m²/day)', 'start');
    el('rect', { class: 'gauge-track', x: G.l, y: G.y, width: G.r - G.l, height: G.h, rx: 8 });
    if (c.lo !== null) {
      el('rect', { class: 'gauge-band', x: GX(c.lo), y: G.y, width: GX(c.hi) - GX(c.lo), height: G.h, rx: 3 });
    }
    const bandMid = c.lo !== null ? (GX(c.lo) + GX(c.hi)) / 2 : -999;
    const ticks = [0, gMax / 2, gMax];
    ticks.forEach(function (t, i) {
      if (Math.abs(GX(t) - bandMid) < 44) return; // keep the band label readable
      text(GX(t), G.y + G.h + 16, fmt(t, 0), i === 0 ? 'start' : i === 2 ? 'end' : 'middle');
    });
    if (c.lo !== null) {
      text((GX(c.lo) + GX(c.hi)) / 2, G.y + G.h + 16, c.lo + '–' + c.hi, 'middle', 'target-text');
    }
    if (ok) {
      const mx = GX(r.dli);
      el('path', { class: 'gauge-marker', d: 'M' + mx + ',' + (G.y + G.h + 2) + ' L' + (mx - 7) + ',' + (G.y - 9) + ' L' + (mx + 7) + ',' + (G.y - 9) + 'Z' });
      const anchor = mx < G.l + 40 ? 'start' : mx > G.r - 40 ? 'end' : 'middle';
      text(mx, G.y - 13, fmt(r.dli, 1) + (r.dli > gMax ? '+' : ''), anchor, 'gauge-text');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Daily Light Integral (DLI) Calculator'];
    const sine = r.k !== 1;
    lines.push('Mode: ' + { dli: 'find DLI', ppfd: 'find light intensity needed', hours: 'find hours needed' }[mode] +
      ' · Light pattern: ' + (sine ? 'sunny day (sine)' : 'constant') + ' · Source: ' + SOURCES[srcSel.value].name);
    lines.push('Crop: ' + r.crop.name + (r.crop.lo !== null ? ' (rule-of-thumb range ' + r.crop.lo + '–' + r.crop.hi + ' mol/m²/day)' : ''));
    if (mode !== 'ppfd') lines.push((sine ? 'Peak light: ' : 'Light intensity: ') + ppfdIn.value + ' ' + lightLabel(ppfdUnit.value) + (ppfdUnit.value !== 'umol' ? ' ≈ ' + fmt(r.ppfd) + ' µmol/m²/s' : ''));
    if (mode !== 'hours') lines.push((sine ? 'Day length: ' : 'Photoperiod: ') + hoursIn.value + ' ' + CalcUnits.unitLabel('hours'));
    if (r.target) lines.push('Target DLI: ' + fmt(r.target, 2) + ' mol/m²/day');
    if (r.missing) { lines.push(r.missing); }
    else {
      lines.push('DLI: ' + fmt(r.dli, 2) + ' mol/m²/day' + (r.status ? ' (' + STATUS_TEXT[r.status].toLowerCase() + ')' : ''));
      if (mode === 'ppfd') lines.push('Light needed: ' + showLight(r.ppfd));
      if (mode === 'hours') lines.push('Hours needed: ' + fmt(r.hours, 2) + ' h/day');
      if (mode === 'dli' && isFinite(r.needPPFD)) lines.push('PPFD for target: ' + showLight(r.needPPFD) + ' · Hours for target: ' + fmt(r.needHours, 2) + ' h');
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); render(); }); });
  [ppfdIn, hoursIn, targetIn].forEach(function (i) { i.addEventListener('input', render); });
  cropSel.addEventListener('change', function () {
    if (CROPS[cropSel.value].lo !== null) targetIn.value = cropTarget();
    render();
  });
  // Source change keeps the typed meter reading; PPFD is re-derived.
  [patternSel, srcSel, outUnit].forEach(function (s) { s.addEventListener('change', render); });
  // Unit change keeps the physical light level (like CalcUnits does for other groups).
  ppfdUnit.addEventListener('change', function () {
    const v = parseFloat(ppfdIn.value);
    const prev = ppfdUnit.dataset.prev || 'umol';
    if (isFinite(v)) ppfdIn.value = +fromPPFD(toPPFD(v, prev), ppfdUnit.value).toPrecision(6);
    ppfdUnit.dataset.prev = ppfdUnit.value;
    render();
  });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Daily Light Integral (DLI) Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); setMode(DEFAULTS.mode); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.crop && CROPS[p.crop]) cropSel.value = p.crop;
    targetIn.value = cropTarget();
    if (p.pattern === 'const' || p.pattern === 'sine') patternSel.value = p.pattern;
    if (p.src && SOURCES[p.src]) srcSel.value = p.src;
    if (validLight(p.out_u)) outUnit.value = p.out_u;
    if (validLight(p.ppfd_u)) { ppfdUnit.value = p.ppfd_u; ppfdUnit.dataset.prev = p.ppfd_u; }
    if (p.ppfd !== undefined && isFinite(parseFloat(p.ppfd))) ppfdIn.value = p.ppfd;
    if (p.hours !== undefined && isFinite(parseFloat(p.hours))) CalcUnits.set('hours', p.hours, p.hours_u);
    else if (p.hours_u) CalcUnits.set('hours', hoursIn.value, p.hours_u);
    if (p.target !== undefined) targetIn.value = p.target;
    setMode(['dli', 'ppfd', 'hours'].indexOf(p.mode) !== -1 ? p.mode : DEFAULTS.mode);
    render();
  })();
})();
