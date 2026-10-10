// Hydrostatic Pressure Calculator: p = rho g z, wall force, live SVG pressure diagram, shareable URL state.
(function () {
  'use strict';

  const G = 9.80665;          // m/s², standard acceleration of gravity (NIST SP 811 / SP 330)
  const P_ATM = 101325;       // Pa, one standard atmosphere (exact)
  const N_PER_LBF = 4.4482216152605; // exact (NIST SP 811)
  const M_PER_FT = 0.3048;    // exact
  const PA_PER_PSF = N_PER_LBF / (M_PER_FT * M_PER_FT); // 47.880259 Pa per lb/ft²
  const DENSITY = { fresh: 998, salt: 1025 }; // kg/m³ at 20 °C (USGS; Millero & Poisson 1981)

  const FORCE = {
    lbf: { per: N_PER_LBF, label: 'lbf', perLen: M_PER_FT, perLabel: 'lbf/ft' },
    N: { per: 1, label: 'N', perLen: 1, perLabel: 'N/m' },
    kN: { per: 1000, label: 'kN', perLen: 1, perLabel: 'kN/m' }
  };

  const DEFAULTS = { depth: 4, width: 8, point: 2, rho: 1000 };
  const DEFAULT_UNITS = { depth: 'ft', width: 'ft', point: 'ft', rho: 'kgm3' };
  const FIELDS = ['depth', 'width', 'point', 'rho'];
  const P_ALTS = ['psi', 'kPa', 'bar', 'ftH2O', 'mH2O'];

  const $ = function (id) { return document.getElementById(id); };
  const inputs = {};
  FIELDS.forEach(function (f) { inputs[f] = $(f); });
  const waterSel = $('water');
  const poutSel = $('pout');
  const foutSel = $('fout');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    if (maxFrac === undefined && abs > 0 && abs < 1) {
      return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
    }
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function pUnit() { return poutSel.value || 'psi'; }
  function fUnit() { return FORCE[foutSel.value] ? foutSel.value : 'lbf'; }

  // A pressure in Pa shown in a pressure unit.
  function pStr(pa, unitId) {
    const u = unitId || pUnit();
    return fmt(CalcUnits.convert('pressure', pa, 'Pa', u)) + ' ' + CalcUnits.label('pressure', u);
  }

  function forceStr(n) {
    const f = FORCE[fUnit()];
    return fmt(n / f.per) + ' ' + f.label;
  }

  function forcePerStr(nPerM) {
    const f = FORCE[fUnit()];
    return fmt(nPerM * f.perLen / f.per) + ' ' + f.perLabel;
  }

  // A length in meters, shown in the unit chosen for `field`.
  function inUnitOf(field, meters) {
    return fmt(CalcUnits.fromBase(field, meters)) + ' ' + CalcUnits.unitLabel(field);
  }

  function typed(field) {
    const v = parseFloat(inputs[field].value);
    return (isFinite(v) ? v : 0) + ' ' + CalcUnits.unitLabel(field);
  }

  // ---------- Physics (SI) ----------
  function density() {
    return waterSel.value === 'custom' ? CalcUnits.base('rho') : DENSITY[waterSel.value];
  }

  function compute() {
    const rho = density();
    const h = CalcUnits.base('depth');
    const w = CalcUnits.base('width');
    const z = CalcUnits.base('point');
    const rg = rho * G;
    const pBottom = rg * h;                   // Pa, gauge
    return {
      rho: rho, h: h, w: w, z: z,
      ok: rho > 0 && h > 0,
      pBottom: pBottom,
      pAbs: pBottom + P_ATM,
      pPoint: rg * z,
      pAvg: pBottom / 2,
      fPer: 0.5 * rg * h * h,                 // N per m of wall width
      force: 0.5 * rg * h * h * w,            // N
      cp: h / 3                               // m above the floor
    };
  }

  // ---------- UI state ----------
  function syncWater() {
    $('rho-field').hidden = waterSel.value !== 'custom';
  }

  function getState() {
    const st = { water: waterSel.value, pout: pUnit(), fout: fUnit() };
    FIELDS.forEach(function (f) {
      if (f === 'rho' && waterSel.value !== 'custom') return;
      st[f] = inputs[f].value;
      st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f], DEFAULT_UNITS[f]); });
  }

  // ---------- Render ----------
  function render() {
    syncWater();
    const r = compute();
    const msgs = [];

    if (waterSel.value === 'custom' && !(r.rho > 0)) msgs.push('Enter the water density.');
    else if (waterSel.value === 'custom' && (r.rho < 900 || r.rho > 1300)) {
      msgs.push('A density of ' + fmt(r.rho, 0) + ' kg/m³ is unusual for water (fresh ≈ 998, sea ≈ 1025, saturated salt brine ≈ 1200 kg/m³). Check the value and unit.');
    }
    if (!(r.h > 0)) msgs.push('Enter the water depth to see the pressure.');
    if (r.ok && r.z > r.h + 1e-9) {
      msgs.push('The point is below the tank floor, for example an outlet pipe below the tank. Its pressure assumes a full pipe connected to the tank with no water flowing.');
    }

    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const out = pUnit();
    const alts = P_ALTS.filter(function (u) { return u !== out; }).slice(0, 2);

    $('r-bottom').textContent = r.ok ? pStr(r.pBottom) : '–';
    $('r-bottom-alt').textContent = r.ok ? alts.map(function (u) { return pStr(r.pBottom, u); }).join(' · ') : '';
    $('r-abs').textContent = r.ok ? pStr(r.pAbs) : '–';

    $('r-point-label').textContent = r.z > 0 ? 'Pressure at ' + typed('point') + ' depth' : 'Pressure at the point';
    $('r-point').textContent = r.rho > 0 && r.z > 0 ? pStr(r.pPoint) + ' gauge' : '–';

    const floorLoad = fUnit() === 'lbf'
      ? fmt(r.pBottom / PA_PER_PSF) + ' lb/ft²'
      : fmt(r.pBottom / G) + ' kg/m²';
    $('r-floor').textContent = r.ok ? pStr(r.pBottom) + ' · ' + floorLoad : '–';
    $('r-avg').textContent = r.ok ? pStr(r.pAvg) : '–';
    $('r-fper').textContent = r.ok ? forcePerStr(r.fPer) : '–';
    $('r-force').textContent = r.ok ? (r.w > 0 ? forceStr(r.force) : 'enter wall width') : '–';
    $('r-cp').textContent = r.ok ? inUnitOf('depth', r.cp) + ' above floor' : '–';

    $('viz-caption').textContent = r.ok
      ? 'Pressure grows from 0 at the surface to ' + pStr(r.pBottom) + ' at the floor. ' +
        (r.w > 0 ? 'Resultant ' + forceStr(r.force) + ' on a wall ' + inUnitOf('width', r.w) + ' wide' : 'Resultant ' + forcePerStr(r.fPer)) +
        ', acting ' + inUnitOf('depth', r.cp) + ' above the floor.'
      : 'Enter a water depth to draw the pressure diagram';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 320;
  const TANK = { l: 44, r: 196, top: 30, bottom: 252 };
  const MAX_TRI = 150; // px of pressure-diagram width at full drawn depth and density 1025

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }

  function label(x, y, text, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }

  // Smallest "nice" number (1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ) that is ≥ x.
  function niceCeil(x) {
    const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    for (let i = 0; i < steps.length; i++) if (steps[i] * p >= x - 1e-12) return steps[i] * p;
    return 10 * p;
  }

  // Horizontal arrow from x1 to x2 at y with a triangular head at x2.
  function hArrow(x1, x2, y, lineCls, headCls, head) {
    const dir = x2 >= x1 ? 1 : -1;
    const len = Math.abs(x2 - x1);
    const hs = Math.min(head, len);
    el('line', { x1: x1, y1: y, x2: x2 - dir * hs * 0.8, y2: y, class: lineCls });
    if (len > 1) {
      el('path', { class: headCls, d: 'M' + x2 + ',' + y + ' L' + (x2 - dir * hs) + ',' + (y - hs * 0.55) + ' L' + (x2 - dir * hs) + ',' + (y + hs * 0.55) + 'Z' });
    }
  }

  function vArrow(x, y1, y2, lineCls, headCls, head) {
    el('line', { x1: x, y1: y1, x2: x, y2: y2 - head * 0.8, class: lineCls });
    el('path', { class: headCls, d: 'M' + x + ',' + y2 + ' L' + (x - head * 0.55) + ',' + (y2 - head) + ' L' + (x + head * 0.55) + ',' + (y2 - head) + 'Z' });
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const x0 = TANK.l, x1 = TANK.r, yt = TANK.top, yb = TANK.bottom;

    // Tank body (drawn even without data)
    el('rect', { class: 'tank-glass', x: x0, y: yt, width: x1 - x0, height: yb - yt });

    if (!r.ok) {
      el('path', { class: 'tank-line', d: 'M' + x0 + ',' + yt + ' L' + x0 + ',' + yb + ' L' + x1 + ',' + yb + ' L' + x1 + ',' + yt });
      return;
    }

    // Vertical scale: the drawn tank height is a nice number a bit above the water depth,
    // so the water level and pressure triangle visibly grow as the depth changes.
    const Hdraw = niceCeil(r.h * 1.12);
    const s = (yb - yt) / Hdraw;              // px per m
    const yw = yb - r.h * s;                  // water surface
    const pxPerPa = MAX_TRI / (Math.max(r.rho, 1025) * G * Hdraw);
    const base = r.pBottom * pxPerPa;         // triangle width at the floor
    const xr = x1 + 3;                        // outer face of the right wall

    // Water
    el('rect', { class: 'water', x: x0, y: yw, width: x1 - x0, height: yb - yw });
    el('line', { class: 'water-top', x1: x0, y1: yw, x2: x1, y2: yw, 'stroke-width': 2 });

    // Tank outline (open top)
    el('path', { class: 'tank-line', d: 'M' + x0 + ',' + yt + ' L' + x0 + ',' + yb + ' L' + x1 + ',' + yb + ' L' + x1 + ',' + yt });

    // Pressure triangle on the wall
    el('path', { class: 'p-area', d: 'M' + xr + ',' + yw + ' L' + xr + ',' + yb + ' L' + (xr + base) + ',' + yb + 'Z' });
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const zi = r.h * i / (n + 1);
      const len = base * zi / r.h;
      if (len > 2) hArrow(xr, xr + len, yw + zi * s, 'p-arrow', 'p-head', 6);
    }
    hArrow(xr, xr + base, yb, 'p-arrow', 'p-head', 6);
    label(xr + base / 2, yb + 16, 'p ' + pStr(r.pBottom), 'middle', 'p-text');

    // Resultant force at h/3 above the floor
    const yF = yb - r.cp * s;
    const fEnd = xr + base + 22;
    hArrow(xr, fEnd, yF, 'f-arrow', 'f-head', 11);
    label(fEnd + 6, yF - 2, r.w > 0 ? 'F ' + forceStr(r.force) : 'F/w ' + forcePerStr(r.fPer), 'start', 'f-text');
    label(fEnd + 6, yF + 13, 'at h/3 = ' + inUnitOf('depth', r.cp), 'start', 'dim-text');

    // Uniform floor pressure
    const nf = 6;
    for (let j = 0; j < nf; j++) {
      const xf = x0 + (x1 - x0) * (j + 0.5) / nf;
      vArrow(xf, yb + 5, yb + 22, 'floor-arrow', 'floor-head', 6);
    }
    label((x0 + x1) / 2, yb + 38, 'floor: ' + pStr(r.pBottom) + ' everywhere', 'middle', 'depth-text');

    // Depth dimension
    el('path', { class: 'dim', d: 'M' + (x0 - 12) + ',' + yw + ' L' + (x0 - 12) + ',' + yb +
      ' M' + (x0 - 17) + ',' + yw + ' L' + (x0 - 7) + ',' + yw + ' M' + (x0 - 17) + ',' + yb + ' L' + (x0 - 7) + ',' + yb });
    const hx = x0 - 18, hy = (yw + yb) / 2;
    label(hx, hy, 'h ' + inUnitOf('depth', r.h), 'middle').setAttribute('transform', 'rotate(-90 ' + hx + ' ' + hy + ')');

    // Point of interest
    if (r.z > 0) {
      const below = r.z > r.h + 1e-9;
      const yp = below ? yb - 4 : yw + r.z * s;
      const xp = x0 + 26;
      el('line', { class: 'pt-line', x1: xp, y1: yp, x2: x1, y2: yp });
      el('circle', { class: 'pt-dot', cx: xp, cy: yp, r: 4.5 });
      const ty = yp - 7 < yw + 13 ? yp + 16 : yp - 7;
      if (below) {
        label(xp + 9, yp - 21, 'p ' + pStr(r.pPoint), 'start', 'pt-text');
        label(xp + 9, yp - 7, 'point below floor', 'start', 'pt-text');
      } else {
        label(xp + 9, ty, 'p ' + pStr(r.pPoint), 'start', 'pt-text');
      }
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const waterName = { fresh: 'freshwater, 998 kg/m³', salt: 'seawater, 1025 kg/m³', custom: 'custom density ' + typed('rho') }[waterSel.value];
    const lines = [
      'Hydrostatic Pressure Calculator',
      'Water depth ' + typed('depth') + ' (' + waterName + ')' +
        (r.w > 0 ? ', wall width ' + typed('width') : '') +
        (r.z > 0 ? ', point depth ' + typed('point') : '')
    ];
    if (r.ok) {
      lines.push('Gauge pressure at bottom: ' + pStr(r.pBottom) + ' (' + fmt(r.pBottom / 1000) + ' kPa)');
      lines.push('Absolute pressure at bottom: ' + pStr(r.pAbs));
      if (r.z > 0) lines.push('Pressure at ' + typed('point') + ' depth: ' + pStr(r.pPoint) + ' gauge');
      lines.push('Floor pressure: ' + pStr(r.pBottom) + ' (' + fmt(r.pBottom / PA_PER_PSF) + ' lb/ft², ' + fmt(r.pBottom / G) + ' kg/m²)');
      lines.push('Wall force per unit width: ' + forcePerStr(r.fPer));
      if (r.w > 0) lines.push('Total force on wall: ' + forceStr(r.force));
      lines.push('Center of pressure: ' + inUnitOf('depth', r.cp) + ' above the floor');
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { inputs[f].addEventListener('input', render); });
  [waterSel, foutSel].forEach(function (s) { s.addEventListener('change', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Hydrostatic Pressure Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    waterSel.value = 'fresh';
    poutSel.value = 'psi';
    foutSel.value = 'lbf';
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    if (p.water && (DENSITY[p.water] || p.water === 'custom')) waterSel.value = p.water;
    if (p.pout && CalcUnits.unitDef('pressure', p.pout)) poutSel.value = p.pout;
    if (p.fout && FORCE[p.fout]) foutSel.value = p.fout;
    applyDefaults();
    const hasState = Object.keys(p).length > 0;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined) CalcUnits.set(f, p[f], u);
      else if (hasState && (f === 'width' || f === 'point')) CalcUnits.set(f, '', u); // optional field left empty
      else if (u) CalcUnits.set(f, inputs[f].value, u);
    });
    render();
  })();
})();
