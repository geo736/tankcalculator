// Grow Light Fixture Layout: fixture count from target PPFD/DLI (lumen method with photons),
// grid layout, spacings, power and cost, plus a to-scale plan with an approximate
// Lambertian PPFD heat map. Shareable URL state.
(function () {
  'use strict';

  const DLI_K = 3600 / 1e6;        // µmol/m²/s × h → mol/m²/day (same as the DLI page)
  const FT2 = 0.09290304;          // m² per ft² (exact)
  const DAYS_PER_MONTH = 30.44;    // same convention as the Pump & Turnover page
  const SUB = 4;                   // each fixture = SUB × SUB Lambertian sub-sources
  const MAX_DRAW = 1500;           // above this many fixtures the plan is not drawn
  const SMH_OK = 1.0, SMH_MAX = 1.5; // spacing ÷ mounting height rule of thumb
  const UNIF_MIN = 0.7;            // min ÷ avg rule of thumb

  // Illustrative presets (not real products). Base units: µmol/s, W, m.
  const PRESETS = {
    led: { ppf: 1700, watts: 680, fl: 1.1, fw: 1.1, note: 'Illustrative LED bar fixture (2.5 µmol/J), not a specific product. Replace with your datasheet values.' },
    hps: { ppf: 1800, watts: 1060, fl: 0.65, fw: 0.5, note: 'Illustrative 1000 W double-ended HPS with electronic ballast and reflector (≈1.7 µmol/J). Replace with your datasheet values.' },
    t5: { ppf: 230, watts: 230, fl: 1.2, fw: 0.6, note: 'Illustrative 4-lamp T5 HO fluorescent fixture (≈1.0 µmol/J, our estimate). Replace with your datasheet values.' },
    custom: { note: 'Enter PPF, input power and size from your fixture’s datasheet or test report.' }
  };

  const DEFAULTS = {
    len: 6.5, len_u: 'm', wid: 4, wid_u: 'm', tmode: 'ppfd', ppfd: 600, dli: 25.92,
    hours: 12, hours_u: 'h', preset: 'led', ppf: 1700, watts: 680, watts_u: 'W',
    fl: 1.1, fl_u: 'm', fw: 1.1, fw_u: 'm', mh: 1.1, mh_u: 'm', cu: 85, mf: 90, price: 0.15, sp_u: 'm'
  };

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const presetSel = $('preset');
  const tmodeButtons = document.querySelectorAll('#tmode-group button');
  const UNIT_INPUTS = ['len', 'wid', 'hours', 'watts', 'fl', 'fw', 'mh'];
  const PLAIN_INPUTS = ['ppfd', 'dli', 'ppf', 'cu', 'mf', 'price'];
  let tmode = 'ppfd';
  let last = null; // last computed result (for hover probe)

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function money(n) {
    if (!isFinite(n)) return '–';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function spUnit() { return $('sp_u').value || 'm'; }
  function len(m) { return fmt(CalcUnits.convert('length', m, 'm', spUnit()), 3) + ' ' + CalcUnits.label('length', spUnit()); }
  function lenShort(m) { return fmt(CalcUnits.convert('length', m, 'm', spUnit()), 2) + ' ' + CalcUnits.label('length', spUnit()); }
  function num(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function pos(id) { const v = num(id); return v > 0 ? v : 0; }

  // ---------- Model ----------
  // Fraction of a downward Lambertian point source's flux landing on the rectangle
  // [0,a]×[0,b] whose corner is directly below it at height h (view factor, signed in a and b).
  function cornerF(a, b, h) {
    const sa = Math.sqrt(a * a + h * h), sb = Math.sqrt(b * b + h * h);
    return (a / sa * Math.atan(b / sa) + b / sb * Math.atan(a / sb)) / (2 * Math.PI);
  }
  function rectFraction(px, py, L, W, h) {
    return cornerF(L - px, W - py, h) - cornerF(-px, W - py, h) - cornerF(L - px, -py, h) + cornerF(-px, -py, h);
  }

  // Pick rows × cols ≥ n: few extra fixtures and similar spacing in both directions.
  function chooseGrid(n, L, W) {
    let best = null;
    const maxC = Math.min(n, 200000);
    for (let c = 1; c <= maxC; c++) {
      const r = Math.ceil(n / c);
      const score = 2 * (r * c - n) / n + Math.abs(Math.log((L / c) / (W / r)));
      if (!best || score < best.score - 1e-12) best = { r: r, c: c, score: score };
    }
    return best;
  }

  function compute() {
    const L = CalcUnits.base('len'), W = CalcUnits.base('wid');
    const hours = CalcUnits.base('hours') / 3600;
    const ppf = pos('ppf'), watts = CalcUnits.base('watts');
    const fl = CalcUnits.base('fl'), fw = CalcUnits.base('fw'), mh = CalcUnits.base('mh');
    const cu = pos('cu') / 100, mf = pos('mf') / 100;
    const price = num('price');
    const r = { L: L, W: W, A: L * W, hours: hours, ppf: ppf, watts: watts, fl: fl, fw: fw, mh: mh, cu: cu, mf: mf, price: price, errors: [], warns: [] };

    if (!L || !W) r.errors.push('Enter the grow area length and width.');
    if (!hours) r.errors.push('Enter the hours of light per day.');
    if (tmode === 'ppfd') {
      r.target = pos('ppfd');
      if (!r.target) r.errors.push('Enter the target PPFD.');
    } else {
      r.dliTarget = pos('dli');
      if (!r.dliTarget) r.errors.push('Enter the target DLI.');
      r.target = hours ? r.dliTarget / (hours * DLI_K) : 0;
    }
    if (!ppf) r.errors.push('Enter the fixture photon output (PPF).');
    if (!cu || !mf) r.errors.push('Enter the utilization and maintenance factors.');
    if (cu > 1 || mf > 1) r.errors.push('Utilization and maintenance factors cannot be more than 100%.');
    if (hours > 24 + 1e-9) r.errors.push('A day has only 24 hours. Check the photoperiod.');
    r.ok = r.errors.length === 0;
    if (!r.ok) return r;

    r.perFixture = ppf * cu * mf / r.A;            // µmol/m²/s added by one fixture
    r.exact = r.target / r.perFixture;
    r.n = Math.max(1, Math.ceil(r.exact - 1e-9));
    if (r.n > 1e6) { r.ok = false; r.errors.push('That needs more than a million fixtures. Check the area units and the fixture PPF.'); return r; }
    const g = chooseGrid(r.n, L, W);
    r.rows = g.r; r.cols = g.c; r.m = g.r * g.c;
    r.sx = L / g.c; r.sy = W / g.r;
    r.ppfd = r.m * r.perFixture;
    r.dli = r.ppfd * hours * DLI_K;
    r.eff = watts ? ppf / watts : NaN;
    r.power = r.m * watts;
    r.dens = r.power / r.A;
    r.kwhDay = r.power * hours / 1000;
    r.kwhMonth = r.kwhDay * DAYS_PER_MONTH;
    r.kwhYear = r.kwhDay * 365;
    r.smh = mh ? Math.max(r.sx, r.sy) / mh : NaN;

    // Fixture orientation: long side along the direction with more room.
    const fitsAsIs = fl <= r.sx + 1e-9 && fw <= r.sy + 1e-9;
    const fitsRot = fw <= r.sx + 1e-9 && fl <= r.sy + 1e-9;
    r.rotated = !fitsAsIs && fitsRot;
    r.fx = r.rotated ? fw : fl; r.fy = r.rotated ? fl : fw;
    r.overlap = !fitsAsIs && !fitsRot;

    if (mh && r.m <= MAX_DRAW) model(r);
    return r;
  }

  // Lambertian sub-sources, direct-capture fraction, heat-map grid and central uniformity.
  function model(r) {
    const h = r.mh, h2 = h * h;
    const ns = r.m * SUB * SUB > 6000 ? 1 : SUB;
    const src = [];
    for (let i = 0; i < r.cols; i++) {
      for (let j = 0; j < r.rows; j++) {
        const cx = r.sx * (i + 0.5), cy = r.sy * (j + 0.5);
        for (let a = 0; a < ns; a++) for (let b = 0; b < ns; b++) {
          src.push(cx + r.fx * ((a + 0.5) / ns - 0.5), cy + r.fy * ((b + 0.5) / ns - 0.5));
        }
      }
    }
    const nSrc = src.length / 2;
    let cap = 0;
    for (let k = 0; k < src.length; k += 2) cap += rectFraction(src[k], src[k + 1], r.L, r.W, h);
    r.capture = cap / nSrc;

    function raw(x, y) {
      let e = 0;
      for (let k = 0; k < src.length; k += 2) {
        const dx = x - src[k], dy = y - src[k + 1];
        const d2 = dx * dx + dy * dy + h2;
        e += 1 / (d2 * d2);
      }
      return e;
    }
    // Heat-map grid, cells roughly square, longest side 48 cells.
    const nx = r.L >= r.W ? 48 : Math.max(4, Math.round(48 * r.L / r.W));
    const ny = r.L >= r.W ? Math.max(4, Math.round(48 * r.W / r.L)) : 48;
    const vals = new Float64Array(nx * ny);
    let sum = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = raw((i + 0.5) * r.L / nx, (j + 0.5) * r.W / ny);
      vals[j * nx + i] = v; sum += v;
    }
    const scale = r.ppfd / (sum / (nx * ny)); // map average = lumen-method average
    let mn = Infinity, mx = 0;
    for (let k = 0; k < vals.length; k++) { vals[k] *= scale; if (vals[k] < mn) mn = vals[k]; if (vals[k] > mx) mx = vals[k]; }
    r.grid = { nx: nx, ny: ny, vals: vals, min: mn, max: mx };
    r.probe = function (x, y) { return raw(x, y) * scale; };

    // Uniformity in the central area bounded by the outer fixture centers.
    const x0 = r.cols > 1 ? r.sx / 2 : r.L / 2 - r.sx / 4, x1 = r.cols > 1 ? r.L - r.sx / 2 : r.L / 2 + r.sx / 4;
    const y0 = r.rows > 1 ? r.sy / 2 : r.W / 2 - r.sy / 4, y1 = r.rows > 1 ? r.W - r.sy / 2 : r.W / 2 + r.sy / 4;
    const K = 24;
    let cmin = Infinity, csum = 0;
    for (let i = 0; i <= K; i++) for (let j = 0; j <= K; j++) {
      const v = raw(x0 + (x1 - x0) * i / K, y0 + (y1 - y0) * j / K);
      csum += v; if (v < cmin) cmin = v;
    }
    r.unif = cmin / (csum / ((K + 1) * (K + 1)));
  }

  // ---------- UI ----------
  function setTmode(m) {
    tmode = m;
    tmodeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tmode === m)); });
    document.querySelectorAll('[data-tfor]').forEach(function (el) { el.hidden = el.dataset.tfor !== m; });
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (p && p.ppf) {
      $('ppf').value = p.ppf;
      $('watts').value = +CalcUnits.convert('power', p.watts, 'W', CalcUnits.unit('watts')).toPrecision(6);
      $('fl').value = +CalcUnits.convert('length', p.fl, 'm', CalcUnits.unit('fl')).toPrecision(6);
      $('fw').value = +CalcUnits.convert('length', p.fw, 'm', CalcUnits.unit('fw')).toPrecision(6);
    }
  }

  function smhBand(v) {
    if (!isFinite(v)) return '';
    if (v <= SMH_OK + 1e-9) return 'even (≤ 1.0)';
    if (v <= SMH_MAX + 1e-9) return 'usually acceptable (1.0–1.5)';
    return 'large (> 1.5)';
  }

  function getState() {
    const st = { tmode: tmode, preset: presetSel.value, sp_u: spUnit() };
    UNIT_INPUTS.forEach(function (id) { st[id] = $(id).value; st[id + '_u'] = CalcUnits.unit(id); });
    PLAIN_INPUTS.forEach(function (id) {
      if ((id === 'ppfd' && tmode !== 'ppfd') || (id === 'dli' && tmode !== 'dli')) return;
      st[id] = $(id).value;
    });
    return st;
  }

  function applyDefaults() {
    UNIT_INPUTS.forEach(function (id) { CalcUnits.set(id, DEFAULTS[id], DEFAULTS[id + '_u']); });
    PLAIN_INPUTS.forEach(function (id) { $(id).value = DEFAULTS[id]; });
    presetSel.value = DEFAULTS.preset;
    $('sp_u').value = DEFAULTS.sp_u;
    setTmode(DEFAULTS.tmode);
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    last = r;
    $('preset-note').textContent = PRESETS[presetSel.value].note;
    const hh = CalcUnits.base('hours') / 3600;
    const need = function (d) { return fmt(d / (hh * DLI_K), 0); };
    $('ppfd-hint').innerHTML = hh > 0 && hh <= 24
      ? 'Rule of thumb at ' + fmt(hh, 1) + ' h/day: lettuce (DLI 12–17) needs about ' + need(12) + '–' + need(17) + ', fruiting crops (DLI 20–30) about ' + need(20) + '–' + need(30) + ' µmol/m²/s. Ranges from the <a href="daily-light-integral.html">DLI calculator</a>.'
      : 'See the <a href="daily-light-integral.html">DLI calculator</a> for crop light needs.';
    const msgs = r.errors.slice();
    if (r.ok) {
      if (!r.watts) msgs.push('Enter the fixture input power to get efficacy, power and cost.');
      if (!r.mh) msgs.push('Enter the mounting height to get the spacing ratio and light map.');
      if (r.overlap && r.m === 1) msgs.push('The fixture (' + lenShort(r.fl) + ' × ' + lenShort(r.fw) + ') is bigger than the grow area.');
      else if (r.overlap) msgs.push('The fixtures (' + lenShort(r.fl) + ' × ' + lenShort(r.fw) + ') are bigger than the grid spacing, so they would overlap. Use fewer, brighter fixtures or a bigger area.');
      if (r.m > r.n) msgs.push('An even ' + r.rows + ' × ' + r.cols + ' grid needs ' + r.m + ' fixtures, ' + (r.m - r.n) + ' more than the minimum, so the light level ends up ' + fmt((r.ppfd / r.target - 1) * 100, 1) + '% above target. Dim the fixtures or adjust the layout if you can.');
      if (r.ppfd > 1.5 * r.target && r.m - r.n <= 0) msgs.push('Even ' + (r.m === 1 ? 'one fixture gives' : 'this many fixtures give') + ' ' + fmt(r.ppfd, 0) + ' µmol/m²/s, well above the target. Choose a smaller fixture or dim it.');
      if (r.target > 2000) msgs.push('That target is brighter than full summer sun (about 2,000 µmol/m²/s). Check the value.');
      if (r.eff > 4.2) msgs.push('An efficacy above about 4 µmol/J is beyond what current LED fixtures can reach (Kusuma et al. 2020). Check the PPF and wattage.');
      if (r.smh > SMH_MAX && isFinite(r.unif) && r.unif < UNIF_MIN) msgs.push('Spacing is large compared with the mounting height (ratio ' + fmt(r.smh, 2) + '). Expect dim strips between fixtures: raise the fixtures, or use more, smaller fixtures.');
      if (isFinite(r.capture) && r.cu > r.capture + 0.25) msgs.push('Your utilization factor (' + fmt(r.cu * 100, 0) + '%) is much higher than the ' + fmt(r.capture * 100, 0) + '% the model puts directly on the canopy. That needs very reflective walls; check it.');
      if (r.m > MAX_DRAW) msgs.push('Too many fixtures to draw the plan. Results are still calculated.');
    }
    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const set = function (id, t) { $(id).textContent = t; };
    if (!r.ok) {
      ['r-main', 'r-grid', 'r-space', 'r-wall', 'r-smh', 'r-unif', 'r-ppfd', 'r-dli', 'r-target', 'r-eff', 'r-cap', 'r-power', 'r-dens', 'r-kwh-d', 'r-kwh-m', 'r-kwh-y', 'r-cost'].forEach(function (id) { set(id, '–'); });
      set('r-status', ''); set('r-sub', '');
      set('viz-caption', 'Enter the room, target and fixture to draw the layout');
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }
    const hasW = r.watts > 0, hasCost = hasW && isFinite(r.price) && r.price >= 0;
    set('r-main', r.n + (r.n === 1 ? ' fixture' : ' fixtures'));
    set('r-status', 'Grid ' + r.rows + ' × ' + r.cols + (r.m > r.n ? ' (' + r.m + ' fixtures)' : '') + ' · ' + fmt(r.ppfd, 0) + ' µmol/m²/s · DLI ' + fmt(r.dli, 1));
    $('r-status').style.color = 'var(--accent)';
    set('r-sub', fmt(r.exact, 3) + ' fixtures exactly, rounded up' + (hasW ? ' · ' + fmt(r.power / 1000, 2) + ' kW' : ''));
    set('r-grid', r.rows + ' × ' + r.cols + ' = ' + r.m + (r.rotated ? ' (fixtures turned 90°)' : ''));
    set('r-space', len(r.sx) + ' × ' + len(r.sy));
    set('r-wall', len(r.sx / 2) + ' × ' + len(r.sy / 2));
    set('r-smh', isFinite(r.smh) ? fmt(r.smh, 2) + ' · ' + smhBand(r.smh) : '–');
    set('r-unif', isFinite(r.unif) ? fmt(r.unif, 2) + (r.unif >= UNIF_MIN ? ' · OK (≥ 0.7 rule of thumb)' : ' · below 0.7 rule of thumb') : '–');
    set('r-ppfd', fmt(r.ppfd, 1) + ' µmol/m²/s');
    set('r-dli', fmt(r.dli, 2) + ' mol/m²/day');
    set('r-target', fmt(r.target, 1) + ' µmol/m²/s' + (tmode === 'dli' ? ' (from DLI ' + fmt(r.dliTarget, 2) + ' over ' + fmt(r.hours, 2) + ' h)' : ''));
    set('r-eff', hasW ? fmt(r.eff, 2) + ' µmol/J' : '–');
    set('r-cap', isFinite(r.capture) ? fmt(r.capture * 100, 0) + '%' : '–');
    set('r-power', hasW ? fmt(r.power, 0) + ' W (' + fmt(r.power / 1000, 2) + ' kW)' : '–');
    set('r-dens', hasW ? fmt(r.dens, 1) + ' W/m² · ' + fmt(r.dens * FT2, 1) + ' W/ft²' : '–');
    set('r-kwh-d', hasW ? fmt(r.kwhDay, 2) + ' kWh' : '–');
    set('r-kwh-m', hasW ? fmt(r.kwhMonth, 1) + ' kWh' : '–');
    set('r-kwh-y', hasW ? fmt(r.kwhYear, 0) + ' kWh' : '–');
    set('r-cost', hasCost ? money(r.kwhDay * r.price) + ' / ' + money(r.kwhMonth * r.price) + ' / ' + money(r.kwhYear * r.price) : '–');

    const cuHint = 'Utilization: share of fixture photons reaching the canopy (rule of thumb 80–90% for a walled room with reflective walls, 60–80% for open benches or racks). Maintenance: output kept as fixtures age and get dirty (rule of thumb 85–95%).';
    $('cu-hint').textContent = cuHint + (isFinite(r.capture) ? ' The model puts ' + fmt(r.capture * 100, 0) + '% directly on this canopy with no wall reflection.' : '');

    set('viz-caption', r.m > MAX_DRAW || !r.grid
      ? r.rows + ' × ' + r.cols + ' grid · ' + fmt(r.ppfd, 0) + ' µmol/m²/s average'
      : 'Approximate PPFD map (Lambertian model, scaled to the ' + fmt(r.ppfd, 0) + ' µmol/m²/s average). Tap or hover to read a spot.');
    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, PAD_L = 30, PAD_R = 14, TOP = 34, MAX_PH = 300;
  let plan = null; // {x, y, s} for pointer mapping

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function txt(x, y, t, anchor, cls, extra) {
    const a = { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return el('text', a, t);
  }

  // Sequential single-hue ramp between two theme colors (pale→dark in light mode, dark→bright in dark mode).
  function parseColor(c) {
    c = (c || '').trim();
    let m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) return m[1].split(',').slice(0, 3).map(function (v) { return parseFloat(v); });
    return null;
  }
  function ramp() {
    const cs = getComputedStyle(document.documentElement);
    const lo = parseColor(cs.getPropertyValue('--warn-bg')) || [255, 244, 220];
    const hi = parseColor(cs.getPropertyValue('--warn-text')) || [122, 83, 0];
    return function (t) {
      t = Math.max(0, Math.min(1, t));
      return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(lo[i] + (hi[i] - lo[i]) * t); }).join(',') + ')';
    };
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    plan = null;
    if (!r.ok || !r.L || !r.W) {
      svg.setAttribute('viewBox', '0 0 ' + VW + ' 200');
      txt(VW / 2, 100, 'Enter values to draw the layout', 'middle', 'msg-text');
      return;
    }
    // Draw with the longer side across the screen (transpose when the room is deeper than long).
    const rot = r.W > r.L;
    const g = r.grid;
    const v = rot
      ? { L: r.W, W: r.L, sx: r.sy, sy: r.sx, cols: r.rows, rows: r.cols, fx: r.fy, fy: r.fx, nL: 'Width', nW: 'Length',
          nx: g ? g.ny : 0, ny: g ? g.nx : 0, val: function (i, j) { return g.vals[i * g.nx + j]; } }
      : { L: r.L, W: r.W, sx: r.sx, sy: r.sy, cols: r.cols, rows: r.rows, fx: r.fx, fy: r.fy, nL: 'Length', nW: 'Width',
          nx: g ? g.nx : 0, ny: g ? g.ny : 0, val: function (i, j) { return g.vals[j * g.nx + i]; } };
    const availW = VW - PAD_L - PAD_R;
    const s = Math.min(availW / v.L, MAX_PH / v.W);
    const pw = v.L * s, ph = v.W * s;
    const x0 = PAD_L + (availW - pw) / 2, y0 = TOP;
    plan = { x: x0, y: y0, s: s, w: pw, h: ph, rot: rot };
    const legendY = y0 + ph + (r.m <= MAX_DRAW ? 62 : 30);
    const VH = legendY + (r.grid ? 48 : 0);
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);

    const col = ramp();
    const vmax = g ? Math.max(g.max, 1e-9) : 1;
    if (g) {
      const cw = pw / v.nx, chh = ph / v.ny;
      const grp = el('g', { 'shape-rendering': 'crispEdges' });
      for (let j = 0; j < v.ny; j++) for (let i = 0; i < v.nx; i++) {
        el('rect', { x: (x0 + i * cw).toFixed(2), y: (y0 + j * chh).toFixed(2), width: (cw + 0.6).toFixed(2), height: (chh + 0.6).toFixed(2), fill: col(v.val(i, j) / vmax) }, undefined, grp);
      }
    } else {
      el('rect', { x: x0, y: y0, width: pw, height: ph, fill: 'var(--surface-2)' });
    }

    // Fixtures to scale
    if (r.m <= MAX_DRAW) {
      const fx = v.fx * s, fy = v.fy * s;
      const dot = Math.max(1.2, Math.min(3, Math.min(v.sx, v.sy) * s / 8));
      for (let i = 0; i < v.cols; i++) for (let j = 0; j < v.rows; j++) {
        const cx = x0 + v.sx * (i + 0.5) * s, cy = y0 + v.sy * (j + 0.5) * s;
        if (fx >= 2 && fy >= 2) el('rect', { class: 'fixture', x: (cx - fx / 2).toFixed(2), y: (cy - fy / 2).toFixed(2), width: fx.toFixed(2), height: fy.toFixed(2), rx: 1.5 });
        el('circle', { class: 'fixture-dot', cx: cx.toFixed(2), cy: cy.toFixed(2), r: dot });
      }
    }
    el('rect', { class: 'room', x: x0, y: y0, width: pw, height: ph });

    // Overall dimensions
    el('path', { class: 'dim', d: 'M' + x0 + ',' + (y0 - 12) + 'H' + (x0 + pw) + 'M' + x0 + ',' + (y0 - 17) + 'v10M' + (x0 + pw) + ',' + (y0 - 17) + 'v10' });
    const sideFits = ph >= 110;
    txt(x0 + pw / 2, y0 - 17, v.nL + ' ' + lenShort(v.L) + (sideFits ? '' : ' × ' + v.nW.toLowerCase() + ' ' + lenShort(v.W)));
    const lx = x0 - 12;
    el('path', { class: 'dim', d: 'M' + lx + ',' + y0 + 'V' + (y0 + ph) + 'M' + (lx - 5) + ',' + y0 + 'h10M' + (lx - 5) + ',' + (y0 + ph) + 'h10' });
    if (sideFits) txt(lx - 5, y0 + ph / 2, v.nW + ' ' + lenShort(v.W), 'middle', 'dim-text', { transform: 'rotate(-90 ' + (lx - 5) + ' ' + (y0 + ph / 2) + ')' });

    // Spacing dimensions below the plan: wall gap and one center spacing
    if (r.m <= MAX_DRAW) {
      const yb = y0 + ph + 14;
      const c1 = x0 + v.sx * 0.5 * s;
      el('path', { class: 'dim', d: 'M' + x0 + ',' + yb + 'H' + c1 + 'M' + c1 + ',' + (yb - 5) + 'v10' });
      if (v.cols > 1) {
        const c2 = x0 + v.sx * 1.5 * s;
        el('path', { class: 'dim', d: 'M' + c1 + ',' + yb + 'H' + c2 + 'M' + c2 + ',' + (yb - 5) + 'v10' });
        txt(c2 + 6, yb + 18, 'spacing ' + lenShort(v.sx), 'start', 'depth-text');
      }
      if (c1 - x0 > 60 || v.cols === 1) txt((x0 + c1) / 2, yb + 18, lenShort(v.sx / 2), v.cols === 1 ? 'start' : 'middle', 'dim-text');
    }

    // Legend (color bar)
    if (g) {
      const lx0 = 20, lx1 = VW - 20, lh = 10;
      const defs = el('defs', {});
      const grad = el('linearGradient', { id: 'lfl-grad', x1: 0, y1: 0, x2: 1, y2: 0 }, undefined, defs);
      for (let k = 0; k <= 10; k++) el('stop', { offset: (k * 10) + '%', 'stop-color': col(k / 10) }, undefined, grad);
      txt(lx0, legendY - 9, 'PPFD at canopy, µmol/m²/s (approximate)', 'start');
      el('rect', { x: lx0, y: legendY, width: lx1 - lx0, height: lh, fill: 'url(#lfl-grad)', rx: 3 });
      el('rect', { class: 'legend-box', x: lx0, y: legendY, width: lx1 - lx0, height: lh, rx: 3 });
      const LX = function (v) { return lx0 + (lx1 - lx0) * Math.max(0, Math.min(1, v / vmax)); };
      const ticks = [{ v: g.min, t: 'min ' + fmt(g.min, 0) }, { v: r.ppfd, t: 'avg ' + fmt(r.ppfd, 0), cls: 'val-text' }, { v: g.max, t: 'max ' + fmt(g.max, 0) }];
      ticks.forEach(function (tk, i) {
        const x = LX(tk.v);
        el('line', { class: 'tick', x1: x, y1: legendY - 2, x2: x, y2: legendY + lh + 3 });
        const anchor = i === 0 ? 'start' : i === 2 ? 'end' : 'middle';
        const tx = i === 0 ? lx0 : i === 2 ? lx1 : Math.max(lx0 + 105, Math.min(lx1 - 105, x));
        txt(tx, legendY + lh + 19, tk.t, anchor, tk.cls || 'dim-text');
      });
    }
  }

  // Hover / tap readout
  function probeAt(evt) {
    if (!plan || !last || !last.ok || !last.probe) return;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const old = $('lfl-probe');
    if (old) old.remove();
    if (p.x < plan.x || p.x > plan.x + plan.w || p.y < plan.y || p.y > plan.y + plan.h) return;
    const ax = (p.x - plan.x) / plan.s, ay = (p.y - plan.y) / plan.s;
    const v = plan.rot ? last.probe(ay, ax) : last.probe(ax, ay);
    const g = el('g', { id: 'lfl-probe', 'pointer-events': 'none' });
    el('circle', { class: 'probe', cx: p.x, cy: p.y, r: 5 }, undefined, g);
    const label = '≈' + fmt(v, 0) + ' µmol/m²/s';
    const bw = 150, bh = 26;
    const bx = Math.min(VW - bw - 4, Math.max(4, p.x - bw / 2));
    const by = p.y - 34 < 2 ? p.y + 12 : p.y - 34;
    el('rect', { class: 'probe-bg', x: bx, y: by, width: bw, height: bh, rx: 6 }, undefined, g);
    el('text', { x: bx + bw / 2, y: by + 18, 'text-anchor': 'middle', class: 'val-text' }, label, g);
  }
  svg.addEventListener('pointermove', probeAt);
  svg.addEventListener('pointerdown', probeAt);
  svg.addEventListener('pointerleave', function () { const o = $('lfl-probe'); if (o) o.remove(); });

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const u = function (id) { return $(id).value + ' ' + CalcUnits.unitLabel(id); };
    const lines = ['Grow Light Fixture Layout Calculator'];
    lines.push('Grow area: ' + u('len') + ' × ' + u('wid'));
    lines.push(tmode === 'ppfd' ? 'Target PPFD: ' + $('ppfd').value + ' µmol/m²/s' : 'Target DLI: ' + $('dli').value + ' mol/m²/day');
    lines.push('Lights on: ' + u('hours'));
    lines.push('Fixture: ' + presetSel.options[presetSel.selectedIndex].text + ' · PPF ' + $('ppf').value + ' µmol/s · ' + u('watts') + ' · ' + u('fl') + ' × ' + u('fw'));
    lines.push('Mounting height: ' + u('mh') + ' · Utilization ' + $('cu').value + '% · Maintenance ' + $('mf').value + '%');
    lines.push('Electricity: ' + $('price').value + ' per kWh');
    if (!r.ok) { lines.push(r.errors.join(' ')); }
    else {
      lines.push('Fixtures needed: ' + r.n + ' (' + fmt(r.exact, 2) + ' exactly)');
      lines.push('Grid: ' + r.rows + ' rows × ' + r.cols + ' columns = ' + r.m + ' fixtures' + (r.rotated ? ' (fixtures turned 90°)' : ''));
      lines.push('Spacing: ' + len(r.sx) + ' × ' + len(r.sy) + ' · to walls ' + len(r.sx / 2) + ' × ' + len(r.sy / 2));
      if (isFinite(r.smh)) lines.push('Spacing ÷ mounting height: ' + fmt(r.smh, 2) + ' (' + smhBand(r.smh) + ', rule of thumb)');
      if (isFinite(r.unif)) lines.push('Model uniformity (central area, min ÷ avg): ' + fmt(r.unif, 2));
      lines.push('Average PPFD: ' + fmt(r.ppfd, 1) + ' µmol/m²/s · DLI ' + fmt(r.dli, 2) + ' mol/m²/day');
      if (r.watts) {
        lines.push('Efficacy: ' + fmt(r.eff, 2) + ' µmol/J · Total power ' + fmt(r.power, 0) + ' W · ' + fmt(r.dens, 1) + ' W/m² (' + fmt(r.dens * FT2, 1) + ' W/ft²)');
        lines.push('Energy: ' + fmt(r.kwhDay, 2) + ' kWh/day · ' + fmt(r.kwhMonth, 1) + ' kWh/month · ' + fmt(r.kwhYear, 0) + ' kWh/year');
        if (isFinite(r.price)) lines.push('Cost: ' + money(r.kwhDay * r.price) + '/day · ' + money(r.kwhMonth * r.price) + '/month · ' + money(r.kwhYear * r.price) + '/year');
      }
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  tmodeButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      // Carry the current target across so the result does not jump.
      const h = CalcUnits.base('hours') / 3600;
      if (b.dataset.tmode === 'dli' && tmode === 'ppfd' && pos('ppfd') && h) $('dli').value = +(pos('ppfd') * h * DLI_K).toPrecision(4);
      if (b.dataset.tmode === 'ppfd' && tmode === 'dli' && pos('dli') && h) $('ppfd').value = +(pos('dli') / (h * DLI_K)).toPrecision(4);
      setTmode(b.dataset.tmode);
      render();
    });
  });
  UNIT_INPUTS.concat(PLAIN_INPUTS).forEach(function (id) { $(id).addEventListener('input', render); });
  ['ppf', 'watts', 'fl', 'fw'].forEach(function (id) {
    $(id).addEventListener('input', function () { if (presetSel.value !== 'custom') { presetSel.value = 'custom'; render(); } });
  });
  presetSel.addEventListener('change', function () { applyPreset(presetSel.value); render(); });

  CalcUnits.init(render);

  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Grow Light Fixture Layout Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.preset && PRESETS[p.preset]) presetSel.value = p.preset;
    UNIT_INPUTS.forEach(function (id) {
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) CalcUnits.set(id, p[id], p[id + '_u']);
      else if (p[id + '_u']) {
        // Unit only: keep the physical default by converting it.
        const sel = document.querySelector('select[data-unit-for="' + id + '"]');
        const grp = sel && sel.dataset.unitGroup;
        if (grp && CalcUnits.unitDef(grp, p[id + '_u'])) CalcUnits.set(id, +CalcUnits.convert(grp, DEFAULTS[id], DEFAULTS[id + '_u'], p[id + '_u']).toPrecision(6), p[id + '_u']);
      }
    });
    PLAIN_INPUTS.forEach(function (id) { if (p[id] !== undefined && isFinite(parseFloat(p[id]))) $(id).value = p[id]; });
    if (p.sp_u && CalcUnits.unitDef('length', p.sp_u)) $('sp_u').value = p.sp_u;
    setTmode(p.tmode === 'dli' ? 'dli' : 'ppfd');
    render();
  })();
})();
