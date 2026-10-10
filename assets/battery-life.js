// Battery Life Estimator: backup runtime for critical loads, Peukert correction,
// live state-of-charge chart and load breakdown, shareable URL state.
(function () {
  'use strict';

  // Chemistry presets. DoD values are rules of thumb; k values are Victron's
  // suggested defaults when the real Peukert exponent is unknown.
  const CHEM = {
    flooded: { dod: 50, k: 1.25, hint: 'Rule of thumb: use about 50% of a lead-acid battery to keep its cycle life.' },
    agm: { dod: 50, k: 1.25, hint: 'Rule of thumb: use about 50% of a lead-acid battery to keep its cycle life.' },
    lfp: { dod: 80, k: 1.05, hint: 'Conservative: many LiFePO4 makers allow 90–100%. Check the BMS cutoff.' },
    custom: { dod: null, k: null, hint: 'Enter the depth of discharge and Peukert exponent from your datasheet.' }
  };

  // Typical power draws (W). Starting points only; the page tells users to read their nameplate.
  const PRESETS = [
    { id: 'airsmall', name: 'Small aquarium air pump', w: 3 },
    { id: 'dcair', name: 'DC backup air pump', w: 3 },
    { id: 'linear60', name: 'Linear air pump 60 L/min', w: 50 },
    { id: 'linear120', name: 'Linear air pump 120 L/min', w: 110 },
    { id: 'pumpsmall', name: 'Small water pump', w: 30 },
    { id: 'pumpmed', name: 'Water pump', w: 100 },
    { id: 'aerator', name: '1/4 hp surface aerator', w: 300 },
    { id: 'control', name: 'Controller / alarm / router', w: 10 },
    { id: 'custom', name: 'Other load', w: 20 }
  ];

  const DEFAULTS = {
    chem: 'agm', cap: 100, volt: 12, count: 2, wiring: 'parallel', dod: 50, health: 100,
    path: 'ac', eff: 85, idle: 0, target: 12, peuk: 1.25, rateh: 20,
    loads: [
      { name: 'Linear air pump 60 L/min', p: 50, q: 2, d: 100 },
      { name: 'Water pump', p: 100, q: 1, d: 50 }
    ]
  };

  const MAX_LOADS = 10;
  const MAX_BATTERIES = 500;
  const COLORS = ['var(--water)', 'var(--accent)', 'var(--c-hydroponics)', '#c7792b', '#8a63c9', 'var(--c-aquaculture)', '#c4537a', '#3aa7a0', '#9c8a2e', '#6c7fa8'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const listEl = $('load-list');
  const SIMPLE = ['cap', 'volt', 'count', 'dod', 'health', 'eff', 'idle', 'target', 'peuk', 'rateh'];

  let uid = 0;
  let rows = []; // [{ uid, el }]

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function hm(hours) {
    if (!isFinite(hours) || hours < 0) return '–';
    const mins = Math.round(hours * 60);
    if (mins < 60) return mins + ' min';
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h >= 72) return fmt(hours / 24, 1) + ' days';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  function num(id) { // plain number (unitless field), NaN if empty
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }

  function inUnit(group, baseValue, selId) {
    const u = $(selId).value;
    return fmt(CalcUnits.convert(group, baseValue, CalcUnits.GROUPS[group].base, u)) + ' ' + CalcUnits.label(group, u);
  }
  function timeOut(hours) { return inUnit('time', hours * 3600, 'out-time'); }
  function energyOut(wh) { return inUnit('energy', wh * 3600, 'out-energy'); }
  function powerOut(w) { return inUnit('power', w, 'out-power'); }

  // ---------- Load rows ----------
  // Unit selects in rows are added after CalcUnits.init, so wire them the same way units.js does.
  function wireUnitSelect(sel, inputId, unitId) {
    CalcUnits.GROUPS.power.units.forEach(function (u) {
      const o = document.createElement('option');
      o.value = u.id;
      o.textContent = u.label;
      sel.appendChild(o);
    });
    sel.value = CalcUnits.unitDef('power', unitId) ? unitId : 'W';
    sel.dataset.prev = sel.value;
    sel.addEventListener('change', function () {
      const input = $(inputId);
      const v = parseFloat(input.value);
      if (isFinite(v)) {
        const w = CalcUnits.convert('power', v, sel.dataset.prev, sel.value);
        input.value = +w.toPrecision(6);
      }
      sel.dataset.prev = sel.value;
      render();
    });
  }

  function addRow(load) {
    if (rows.length >= MAX_LOADS) return null;
    const id = ++uid;
    const el = document.createElement('div');
    el.className = 'load-row';
    el.innerHTML =
      '<div class="load-head"><span class="swatch" aria-hidden="true"></span>' +
      '<input type="text" id="ln' + id + '" aria-label="Load name" maxlength="40">' +
      '<button type="button" class="load-remove" aria-label="Remove load">×</button></div>' +
      '<div class="load-grid">' +
      '<div class="field f-power"><label for="lp' + id + '">Power</label><div class="input-row">' +
      '<input id="lp' + id + '" type="number" inputmode="decimal" min="0" step="any">' +
      '<select class="unit-select" data-unit-group="power" data-unit-for="lp' + id + '" aria-label="Power unit"></select></div></div>' +
      '<div class="field"><label for="lq' + id + '">Qty</label><div class="input-row">' +
      '<input id="lq' + id + '" type="number" inputmode="numeric" min="0" step="1"></div></div>' +
      '<div class="field"><label for="ld' + id + '">Duty cycle</label><div class="input-row">' +
      '<input id="ld' + id + '" type="number" inputmode="decimal" min="0" max="100" step="any"><span class="unit">%</span></div></div>' +
      '</div>';
    listEl.appendChild(el);
    wireUnitSelect(el.querySelector('select'), 'lp' + id, load.u || 'W');
    $('ln' + id).value = load.name;
    $('lp' + id).value = load.p;
    $('lq' + id).value = load.q;
    $('ld' + id).value = load.d;
    el.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', render); });
    el.querySelector('.load-remove').addEventListener('click', function () {
      rows = rows.filter(function (r) { return r.uid !== id; });
      listEl.removeChild(el);
      render();
    });
    rows.push({ uid: id, el: el });
    return id;
  }

  function clearRows() {
    rows = [];
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  }

  function readLoads() {
    return rows.map(function (r, i) {
      const id = r.uid;
      const w = CalcUnits.base('lp' + id);
      const q = Math.max(0, num('lq' + id) || 0);
      const dRaw = num('ld' + id);
      const d = isFinite(dRaw) ? dRaw : 0;
      const name = $('ln' + id).value.trim() || 'Load ' + (i + 1);
      return { uid: id, name: name, w: w, q: q, dRaw: d, d: Math.min(100, Math.max(0, d)) / 100, avg: w * q * Math.min(100, Math.max(0, d)) / 100, color: COLORS[i % COLORS.length] };
    });
  }

  // ---------- Model ----------
  function runtimeFor(n, m) {
    // Hours to reach the usable DoD with n batteries (same per-battery specs).
    const I = m.pBat / (n * m.V);
    const f = m.k > 1 && I > 0 ? Math.min(1, Math.pow(m.ratedI / I, m.k - 1)) : 1;
    const usable = n * m.C * m.V * m.health * m.dod * f;
    return { t: usable / m.pBat, I: I, f: f, usable: usable };
  }

  function compute() {
    const m = {};
    m.C = num('cap');
    m.V = num('volt');
    const countRaw = num('count');
    m.N = isFinite(countRaw) ? Math.floor(countRaw) : NaN;
    m.wiring = $('wiring').value;
    m.dod = num('dod') / 100;
    m.health = num('health') / 100;
    m.dc = $('path').value === 'dc';
    m.eff = m.dc ? 1 : num('eff') / 100;
    m.idle = m.dc ? 0 : CalcUnits.base('idle');
    const kRaw = num('peuk');
    m.k = isFinite(kRaw) ? kRaw : 1;
    m.H = CalcUnits.base('rateh') / 3600;
    m.ratedI = m.H > 0 ? m.C / m.H : Infinity;
    m.targetH = CalcUnits.base('target') / 3600;

    m.loads = readLoads();
    m.pAvg = m.loads.reduce(function (s, l) { return s + l.avg; }, 0);
    m.errors = [];
    m.warnings = [];

    if (!(m.C > 0)) m.errors.push('Enter the capacity of each battery in Ah.');
    if (!(m.V > 0)) m.errors.push('Enter the nominal battery voltage.');
    if (!(m.N >= 1)) m.errors.push('Enter at least 1 battery.');
    if (!(m.dod > 0 && m.dod <= 1)) m.errors.push('Usable depth of discharge must be between 0 and 100%.');
    if (!(m.health > 0 && m.health <= 1)) m.errors.push('Capacity available must be between 0 and 100%.');
    if (!m.dc && !(m.eff > 0 && m.eff <= 1)) m.errors.push('Inverter efficiency must be between 0 and 100%.');
    if (!(m.pAvg > 0) && !(m.idle > 0)) m.errors.push('Add at least one load with power, quantity and duty cycle above zero.');

    if (m.k < 1 || m.k > 1.6) m.warnings.push('A Peukert exponent outside 1.00–1.60 is unusual; check the datasheet.');
    if (!(m.H > 0) && m.k > 1) m.warnings.push('Enter the capacity rating period (usually 20 h) to apply the Peukert correction.');
    if (m.loads.some(function (l) { return l.dRaw > 100 || l.dRaw < 0; })) m.warnings.push('Duty cycle is limited to 0–100%.');
    if (m.wiring === 'series' && m.N > 1 && m.V > 0 && m.V * m.N > 60) m.warnings.push('A ' + fmt(m.V * m.N) + ' V series string is unusual for small inverters; check your inverter’s input voltage.');

    m.ok = m.errors.length === 0;
    if (!m.ok) return m;

    m.pBat = m.pAvg / m.eff + m.idle;
    m.loss = m.pAvg / m.eff - m.pAvg;
    m.nominal = m.N * m.C * m.V;
    m.usableRated = m.nominal * m.health * m.dod;
    const r = runtimeFor(m.N, m);
    m.I = r.I; m.f = r.f; m.usable = r.usable; m.t = r.t;
    m.tNoPeukert = m.usableRated / m.pBat;
    m.cRate = m.I / m.C; // fraction of C per hour

    if (m.f < 1 && m.k > 1.1 && m.cRate > 0.25) m.warnings.push('Discharge is faster than C/4 per battery. Lead-acid capacity drops sharply at high rates and Peukert’s law becomes less reliable; consider more batteries.');

    // Batteries needed for the target. Series banks grow in whole strings.
    m.string = m.wiring === 'series' ? m.N : 1;
    m.need = null;
    if (m.targetH > 0) {
      for (let n = m.string; n <= MAX_BATTERIES; n += m.string) {
        const rn = runtimeFor(n, m);
        if (rn.t >= m.targetH - 1e-9) { m.need = n; m.needT = rn.t; break; }
      }
    }
    // State of charge (percent of full) at the target time, linear for a constant load.
    const cut = 100 - m.dod * 100;
    m.cutSoc = cut;
    m.socAtTarget = m.targetH > 0 ? Math.max(cut, 100 - (100 - cut) * m.targetH / m.t) : null;
    return m;
  }

  function bankText(m) {
    if (m.wiring === 'series') return fmt(m.N * m.V) + ' V · ' + fmt(m.C) + ' Ah';
    if (m.wiring === 'parallel') return fmt(m.V) + ' V · ' + fmt(m.N * m.C) + ' Ah';
    return m.N + ' × ' + fmt(m.V) + ' V ' + fmt(m.C) + ' Ah';
  }

  function needText(m) {
    if (!(m.targetH > 0)) return '–';
    if (m.need === null) return 'more than ' + MAX_BATTERIES;
    let s = m.need + ' (' + hm(m.needT) + ')';
    if (m.wiring === 'series' && m.string > 1) s = m.need + ' = ' + (m.need / m.string) + ' string' + (m.need / m.string > 1 ? 's' : '') + ' of ' + m.string + ' (' + hm(m.needT) + ')';
    return s;
  }

  // ---------- UI state ----------
  function applyChem(c, setValues) {
    const def = CHEM[c] || CHEM.custom;
    $('chem-hint').textContent = def.hint;
    if (setValues && def.dod !== null) {
      $('dod').value = def.dod;
      $('peuk').value = def.k;
    }
  }

  function applyPath() {
    $('inv-fields').hidden = $('path').value === 'dc';
  }

  function getState() {
    const st = { chem: $('chem').value, wiring: $('wiring').value, path: $('path').value };
    SIMPLE.forEach(function (f) {
      if (($('path').value === 'dc') && (f === 'eff' || f === 'idle')) return;
      st[f] = $(f).value;
    });
    if ($('path').value !== 'dc') st.idle_u = CalcUnits.unit('idle');
    st.target_u = CalcUnits.unit('target');
    st.rateh_u = CalcUnits.unit('rateh');
    st.n = rows.length;
    rows.forEach(function (r, i) {
      st['ln' + i] = $('ln' + r.uid).value;
      st['lp' + i] = $('lp' + r.uid).value;
      st['lp' + i + '_u'] = CalcUnits.unit('lp' + r.uid);
      st['lq' + i] = $('lq' + r.uid).value;
      st['ld' + i] = $('ld' + r.uid).value;
    });
    st.ot = $('out-time').value;
    st.oe = $('out-energy').value;
    st.op = $('out-power').value;
    return st;
  }

  function applyDefaults() {
    $('chem').value = DEFAULTS.chem;
    $('wiring').value = DEFAULTS.wiring;
    $('path').value = DEFAULTS.path;
    ['cap', 'volt', 'count', 'dod', 'health', 'eff', 'peuk'].forEach(function (f) { $(f).value = DEFAULTS[f]; });
    CalcUnits.set('idle', DEFAULTS.idle, 'W');
    CalcUnits.set('target', DEFAULTS.target, 'h');
    CalcUnits.set('rateh', DEFAULTS.rateh, 'h');
    $('out-time').value = 'h';
    $('out-energy').value = 'Wh';
    $('out-power').value = 'W';
    clearRows();
    DEFAULTS.loads.forEach(addRow);
    applyChem(DEFAULTS.chem, false);
    applyPath();
  }

  // ---------- Render ----------
  function render() {
    const m = compute();
    const notice = $('notice');
    const msgs = m.errors.concat(m.ok ? m.warnings : []);
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    rows.forEach(function (r, i) {
      r.el.querySelector('.swatch').style.background = COLORS[i % COLORS.length];
      r.el.querySelector('.load-remove').disabled = false;
    });
    $('btn-add').disabled = rows.length >= MAX_LOADS;

    const set = function (id, t) { $(id).textContent = t; };
    if (!m.ok) {
      ['r-runtime', 'r-bank', 'r-usable', 'r-usable-p', 'r-load', 'r-draw', 'r-current', 'r-need'].forEach(function (id) { set(id, '–'); });
      set('r-runtime-alt', '');
      $('r-bar').style.width = '0%';
      set('viz-caption', 'Enter the battery and load details to draw the chart');
    } else {
      set('r-runtime', hm(m.t));
      set('r-runtime-alt', timeOut(m.t) + (m.f < 1 ? ' · ' + hm(m.tNoPeukert) + ' without Peukert loss' : ''));
      $('r-bar').style.width = (m.targetH > 0 ? Math.min(100, m.t / m.targetH * 100) : 100) + '%';
      set('r-bank', bankText(m) + ' · ' + energyOut(m.nominal));
      set('r-usable', energyOut(m.usableRated));
      set('r-usable-p', energyOut(m.usable) + (m.f < 1 ? ' (' + fmt(m.f * 100, 1) + '%)' : ''));
      set('r-load', powerOut(m.pAvg));
      set('r-draw', powerOut(m.pBat));
      set('r-current', fmt(m.I) + ' A (rated ' + (isFinite(m.ratedI) ? fmt(m.ratedI) + ' A' : '–') + ')');
      set('r-need', needText(m));
      let cap = hm(m.t) + ' to ' + fmt(m.cutSoc, 0) + '% charge at ' + powerOut(m.pBat);
      if (m.targetH > 0) cap += m.t >= m.targetH ? ' · meets the ' + hm(m.targetH) + ' target' : ' · short of the ' + hm(m.targetH) + ' target';
      set('viz-caption', cap);
    }

    drawViz(m);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function niceStep(max) {
    const raw = max / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function shortTime(h) {
    if (h >= 72) return fmt(h / 24, 1) + ' d';
    if (h < 1) return Math.round(h * 60) + ' min';
    return fmt(h, h < 10 ? 1 : 0) + ' h';
  }

  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function drawViz(m) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!m.ok) { svg.setAttribute('viewBox', '0 0 ' + VW + ' 260'); return; }

    // --- Battery icon (state of charge at target time, or at cutoff) ---
    const bx = 14, by = 40, bw = 50, bh = 130;
    const soc = m.socAtTarget !== null ? m.socAtTarget : m.cutSoc;
    const low = m.targetH > 0 && m.t < m.targetH;
    el('rect', { x: bx + bw / 2 - 10, y: by - 8, width: 20, height: 8, rx: 2, class: 'tank-line' });
    el('rect', { x: bx, y: by, width: bw, height: bh, rx: 6, class: 'tank-glass' });
    const fillH = (bh - 8) * soc / 100;
    el('rect', { x: bx + 4, y: by + bh - 4 - fillH, width: bw - 8, height: fillH, rx: 3, class: 'batt-fill' + (low ? ' low' : '') });
    const cutY = by + bh - 4 - (bh - 8) * m.cutSoc / 100;
    el('line', { x1: bx - 4, y1: cutY, x2: bx + bw + 4, y2: cutY, class: 'cutoff-line' });
    el('rect', { x: bx, y: by, width: bw, height: bh, rx: 6, class: 'tank-line' });
    el('text', { x: bx + bw / 2, y: by + bh + 18, 'text-anchor': 'middle', class: 'strong-text' }, fmt(soc, 0) + '%');
    el('text', { x: bx + bw / 2, y: by + bh + 33, 'text-anchor': 'middle', class: 'dim-text' },
      m.targetH > 0 ? (low ? 'cut off' : 'at ' + shortTime(m.targetH)) : 'at cutoff');

    // --- SOC vs time chart ---
    const cx0 = 112, cx1 = 462, cy0 = 30, cy1 = 190;
    const tMax0 = Math.max(m.t, m.targetH || 0) * 1.08;
    const step = niceStep(tMax0);
    const tMax = Math.ceil(tMax0 / step) * step;
    const X = function (h) { return cx0 + (cx1 - cx0) * h / tMax; };
    const Y = function (s) { return cy1 - (cy1 - cy0) * s / 100; };

    [0, 25, 50, 75, 100].forEach(function (s) {
      el('line', { x1: cx0, y1: Y(s), x2: cx1, y2: Y(s), class: 'grid-line' });
      el('text', { x: cx0 - 6, y: Y(s) + 4, 'text-anchor': 'end', class: 'dim-text' }, s + '%');
    });
    for (let t = 0; t <= tMax + 1e-9; t += step) {
      el('line', { x1: X(t), y1: cy1, x2: X(t), y2: cy1 + 4, class: 'axis' });
      el('text', { x: X(t), y: cy1 + 17, 'text-anchor': 'middle', class: 'dim-text' }, (t === 0 ? '0' : shortTime(t).replace(' h', '').replace(' d', '')));
    }
    el('text', { x: cx1, y: cy1 + 32, 'text-anchor': 'end', class: 'dim-text' }, 'time (' + (tMax >= 72 ? 'days' : tMax < 1 ? 'min' : 'hours') + ')');
    el('text', { x: cx0, y: cy0 - 12, 'text-anchor': 'start', class: 'dim-text' }, 'State of charge');
    el('line', { x1: cx0, y1: cy0, x2: cx0, y2: cy1, class: 'axis' });
    el('line', { x1: cx0, y1: cy1, x2: cx1, y2: cy1, class: 'axis' });

    // cutoff line
    el('line', { x1: cx0, y1: Y(m.cutSoc), x2: cx1, y2: Y(m.cutSoc), class: 'cutoff-line' });
    const cutLabelY = m.cutSoc > 12 ? Y(m.cutSoc) + 15 : Y(m.cutSoc) - 6;
    el('text', { x: cx1, y: cutLabelY, 'text-anchor': 'end', class: 'cutoff-text' }, 'cutoff · ' + fmt(m.dod * 100, 0) + '% DoD');

    // SOC line
    el('path', { class: 'soc-area', d: 'M' + X(0) + ',' + Y(100) + ' L' + X(m.t) + ',' + Y(m.cutSoc) + ' L' + X(m.t) + ',' + cy1 + ' L' + X(0) + ',' + cy1 + 'Z' });
    el('path', { class: 'soc-line', d: 'M' + X(0) + ',' + Y(100) + ' L' + X(m.t) + ',' + Y(m.cutSoc) });
    el('circle', { cx: X(m.t), cy: Y(m.cutSoc), r: 4.5, fill: 'var(--accent)' });
    const tx = X(m.t);
    const rtAnchor = tx > cx1 - 70 ? 'end' : tx < cx0 + 70 ? 'start' : 'middle';
    el('text', { x: tx, y: Y(m.cutSoc) - 10, 'text-anchor': rtAnchor, class: 'strong-text' }, hm(m.t));

    // target line
    if (m.targetH > 0) {
      const gx = X(m.targetH);
      el('line', { x1: gx, y1: cy0, x2: gx, y2: cy1, class: 'target-line' });
      const anchor = gx > cx1 - 60 ? 'end' : 'start';
      el('text', { x: gx + (anchor === 'end' ? -5 : 5), y: cy0 + 12, 'text-anchor': anchor, class: 'depth-text' }, 'target ' + shortTime(m.targetH));
    }

    // --- Stacked bar of battery draw ---
    const segs = m.loads.filter(function (l) { return l.avg > 0; }).map(function (l) {
      return { label: l.name, w: l.avg, color: l.color };
    });
    if (m.loss > 1e-9) segs.push({ label: 'Inverter loss', w: m.loss, color: 'var(--tank-back)' });
    if (m.idle > 0) segs.push({ label: 'Inverter no-load', w: m.idle, color: 'var(--warn-text)' });

    const sy = 246, sh = 24, sx0 = 14, sx1 = 466;
    el('text', { x: sx0, y: sy - 10, 'text-anchor': 'start', class: 'dim-text' }, 'Average draw from batteries');
    el('text', { x: sx1, y: sy - 10, 'text-anchor': 'end', class: 'strong-text' }, powerOut(m.pBat));
    let x = sx0;
    segs.forEach(function (s) {
      const w = (sx1 - sx0) * s.w / m.pBat;
      el('rect', { x: x, y: sy, width: Math.max(0, w), height: sh, fill: s.color, class: 'seg-gap' });
      x += w;
    });
    el('rect', { x: sx0, y: sy, width: sx1 - sx0, height: sh, rx: 3, fill: 'none', class: 'axis' });

    // legend in two columns
    const ly0 = sy + sh + 20, colW = (sx1 - sx0) / 2;
    segs.forEach(function (s, i) {
      const lx = sx0 + (i % 2) * colW, ly = ly0 + Math.floor(i / 2) * 18;
      el('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 2, fill: s.color });
      el('text', { x: lx + 15, y: ly, 'text-anchor': 'start', class: 'dim-text' },
        trunc(s.label, 20) + ' ' + fmt(s.w, s.w >= 100 ? 0 : 1) + ' W · ' + fmt(s.w / m.pBat * 100, 0) + '%');
    });
    const vh = ly0 + Math.ceil(segs.length / 2) * 18;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + Math.max(300, vh));
  }

  // ---------- Results text ----------
  function resultsText() {
    const m = compute();
    const chemName = $('chem').options[$('chem').selectedIndex].text;
    const lines = ['Battery Life Estimator',
      'Batteries: ' + $('count').value + ' × ' + $('volt').value + ' V ' + $('cap').value + ' Ah, ' + chemName + ', wiring: ' + $('wiring').value,
      'Usable depth of discharge ' + $('dod').value + '%, capacity available ' + $('health').value + '%, Peukert k ' + $('peuk').value + ' (rated at ' + $('rateh').value + ' ' + CalcUnits.unitLabel('rateh') + ')',
      $('path').value === 'dc' ? 'DC loads, no inverter' : 'Inverter efficiency ' + $('eff').value + '%, no-load draw ' + ($('idle').value || 0) + ' ' + CalcUnits.unitLabel('idle'),
      'Loads:'];
    rows.forEach(function (r) {
      lines.push('  ' + ($('ln' + r.uid).value || 'Load') + ': ' + $('lq' + r.uid).value + ' × ' + $('lp' + r.uid).value + ' ' + CalcUnits.unitLabel('lp' + r.uid) + ' at ' + $('ld' + r.uid).value + '% duty');
    });
    if (m.ok) {
      lines.push(
        'Runtime to cutoff: ' + hm(m.t) + ' (' + timeOut(m.t) + ')',
        'Bank: ' + bankText(m) + ', ' + energyOut(m.nominal) + ' nominal',
        'Usable energy: ' + energyOut(m.usableRated) + ' rated, ' + energyOut(m.usable) + ' at this load',
        'Average load: ' + powerOut(m.pAvg) + ', drawn from batteries: ' + powerOut(m.pBat),
        'Current per battery: ' + fmt(m.I) + ' A',
        'Batteries for ' + $('target').value + ' ' + CalcUnits.unitLabel('target') + ' target: ' + needText(m)
      );
    } else {
      lines.push(m.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  SIMPLE.forEach(function (f) { $(f).addEventListener('input', render); });
  $('chem').addEventListener('change', function () { applyChem($('chem').value, true); render(); });
  $('wiring').addEventListener('change', render);
  $('path').addEventListener('change', function () { applyPath(); render(); });

  CalcUnits.init(render);

  // Preset picker for adding loads
  PRESETS.forEach(function (p) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name + ' (' + p.w + ' W)';
    $('add-preset').appendChild(o);
  });
  $('btn-add').addEventListener('click', function () {
    const p = PRESETS.filter(function (x) { return x.id === $('add-preset').value; })[0] || PRESETS[0];
    const id = addRow({ name: p.name, p: p.w, q: 1, d: 100 });
    render();
    if (id) $('lp' + id).focus();
  });

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Battery Life Estimator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.chem && CHEM[p.chem]) $('chem').value = p.chem;
    if (['parallel', 'series', 'total'].indexOf(p.wiring) !== -1) $('wiring').value = p.wiring;
    if (p.path === 'ac' || p.path === 'dc') $('path').value = p.path;
    SIMPLE.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    const n = parseInt(p.n, 10);
    if (isFinite(n) && n >= 0) {
      clearRows();
      for (let i = 0; i < Math.min(n, MAX_LOADS); i++) {
        addRow({
          name: p['ln' + i] !== undefined ? p['ln' + i] : 'Load ' + (i + 1),
          p: p['lp' + i] !== undefined ? p['lp' + i] : '',
          u: p['lp' + i + '_u'],
          q: p['lq' + i] !== undefined ? p['lq' + i] : 1,
          d: p['ld' + i] !== undefined ? p['ld' + i] : 100
        });
      }
    }
    if (p.ot && CalcUnits.unitDef('time', p.ot)) $('out-time').value = p.ot;
    if (p.oe && CalcUnits.unitDef('energy', p.oe)) $('out-energy').value = p.oe;
    if (p.op && CalcUnits.unitDef('power', p.op)) $('out-power').value = p.op;
    applyChem($('chem').value, false);
    applyPath();
    render();
  })();
})();
