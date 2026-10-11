// Fish Hauling Calculator: safe transport load from published catfish loading tables,
// temperature correction, displacement, oxygen, salt and tempering. Live SVG truck + chart.
(function () {
  'use strict';

  // ---------- Constants ----------
  const KG_PER_LB = 0.45359237;
  const L_PER_GAL = 3.785411784;
  const LBGAL_TO_KGL = KG_PER_LB / L_PER_GAL;        // 0.119826...
  // SRAC 393 rule of thumb: 12 US gal of water displaced per 100 lb of fish.
  const DISP_GAL_PER_LB = 0.12;
  // Ideal gas: 1 kg O2 = 1000/31.9988 mol × (8.314462618 × 294.261 K / 101325 Pa) m³/mol, at 70 °F and 1 atm.
  const O2_L_PER_KG = 1000 / 31.9988 * (8.314462618 * 294.261 / 101325) * 1000;
  // Kentucky (Wynne & Wurts): about 4 lb food-size catfish per gallon with air (21% O2) aeration.
  const AIR_CAP_LBGAL = 4.0;

  // Channel catfish, lb of fish per US gal at 65 °F (Piper et al. 1982, after McCraren 1978;
  // as reprinted by Wyatt et al., TPWD, Table 9 and NCRAC 444, Table 3).
  const CAT_ROWS = [
    { fpl: 1,   r: [6.30, 5.50, 4.80] },
    { fpl: 2,   r: [5.90, 4.80, 3.45] },
    { fpl: 4,   r: [5.00, 4.10, 2.95] },
    { fpl: 50,  r: [3.45, 2.50, 2.05] },
    { fpl: 125, r: [2.95, 2.20, 1.80] },
    { fpl: 250, r: [2.20, 1.75, 1.50] }
  ];
  const CAT_HOURS = [8, 12, 16];
  const T_REF_F = 65;
  const T_CHART_F = [45, 85];

  // Fish counts per unit of mass: a unit group that units.js does not have.
  // Base = fish per kg. Must be registered before CalcUnits.init().
  CalcUnits.GROUPS.fishcount = {
    base: 'perkg',
    units: [
      { id: 'perlb', label: 'per lb', factor: 1 / KG_PER_LB },
      { id: 'perkg', label: 'per kg', factor: 1 },
      { id: 'per100g', label: 'per 100 g', factor: 10 },
      { id: 'perg', label: 'per g', factor: 1000 }
    ]
  };

  const DEFAULTS = {
    species: 'catfish', crate: [1, 'lbgal'], ctemp: '1', tank: 'vol',
    water: [500, 'gal'], tl: [8, 'ft'], tw: [4, 'ft'], td: [2, 'ft'],
    sizemode: 'weight', fishw: [0.1, 'lb'], fishn: [10, 'perlb'], fishl: [7, 'in'],
    planned: 12000, temp: [75, 'F'], trip: [10, 'h'], o2: 'oxygen',
    dest: [80, 'F'], salt: 0.5, o2rate: 500, mout: 'lb', dout: 'lbgal'
  };
  const UNIT_FIELDS = ['crate', 'water', 'tl', 'tw', 'td', 'fishw', 'fishn', 'fishl', 'temp', 'trip', 'dest'];
  const PLAIN_FIELDS = ['planned', 'salt', 'o2rate'];
  const SELECTS = ['species', 'ctemp', 'sizemode', 'o2', 'mout', 'dout'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const tankButtons = document.querySelectorAll('#tank-group button');
  let tank = 'vol';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function fmtInt(n) { return isFinite(n) ? Math.floor(n).toLocaleString() : '–'; }
  function massOut(kg) {
    const u = $('mout').value;
    return fmt(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }
  function densOut(kgL) {
    const u = $('dout').value;
    return fmt(CalcUnits.convert('density', kgL * 1000, 'kgm3', u), 3) + ' ' + CalcUnits.label('density', u);
  }
  function volOut(L) {
    // Show volumes in the unit chosen for the tank water when possible.
    const u = tank === 'vol' ? CalcUnits.unit('water') : (['ft', 'in', 'yd'].indexOf(CalcUnits.unit('tl')) !== -1 ? 'gal' : 'L');
    return fmt(CalcUnits.convert('volume', L, 'L', u)) + ' ' + CalcUnits.label('volume', u);
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : '–') + ' ' + CalcUnits.unitLabel(id);
  }
  function cToF(c) { return c * 9 / 5 + 32; }
  function fToC(f) { return (f - 32) * 5 / 9; }

  // ---------- Model ----------
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Table rate (lb/gal at 65 °F) for fish-per-lb and trip hours, with clamping info.
  function catRate(fpl, hours) {
    const fc = Math.min(250, Math.max(1, fpl));
    const hc = Math.min(16, Math.max(8, hours));
    let i = 0;
    while (i < CAT_ROWS.length - 2 && fc > CAT_ROWS[i + 1].fpl) i++;
    const a = CAT_ROWS[i], b = CAT_ROWS[i + 1];
    const t = (Math.log(fc) - Math.log(a.fpl)) / (Math.log(b.fpl) - Math.log(a.fpl));
    const j = hc <= 12 ? 0 : 1;
    const th = (hc - CAT_HOURS[j]) / 4;
    const ra = lerp(a.r[j], a.r[j + 1], th);
    const rb = lerp(b.r[j], b.r[j + 1], th);
    return { rate: lerp(ra, rb, t), sizeClamp: fpl < 1 ? 'big' : fpl > 250 ? 'small' : '', hourClamp: hours < 8 ? 'short' : hours > 16 ? 'long' : '' };
  }

  function tempFactor(tF) {
    const f = 1 + 0.25 * (T_REF_F - tF) / 10;
    return Math.min(1.5, f);
  }

  function fishWeightKg() {
    const mode = $('sizemode').value;
    if (mode === 'weight') return CalcUnits.base('fishw');
    if (mode === 'count') { const n = CalcUnits.base('fishn'); return n > 0 ? 1 / n : 0; }
    const mm = CalcUnits.base('fishl') * 1000;
    if (!(mm > 0)) return 0;
    return Math.pow(10, -5.800 + 3.294 * Math.log10(mm)) / 1000; // Brown et al. 1995, g → kg
  }

  function waterL() {
    if (tank === 'vol') return CalcUnits.base('water');
    return CalcUnits.base('tl') * CalcUnits.base('tw') * CalcUnits.base('td') * 1000;
  }

  // Rate (lb/gal) at a given °F, for the current inputs — used by results and the chart.
  function rateAt(tF, ctx) {
    const f = ctx.useTemp ? tempFactor(tF) : 1;
    let r = ctx.base65 * f;
    if (ctx.airCap) r = Math.min(r, AIR_CAP_LBGAL * f);
    return Math.max(0, r);
  }

  function compute() {
    const species = $('species').value;
    const w = fishWeightKg();
    const fpl = w > 0 ? KG_PER_LB / w : NaN;
    const hours = CalcUnits.base('trip') / 3600;
    const tC = CalcUnits.baseSigned('temp');
    const tF = cToF(tC);
    const W = waterL();
    const air = $('o2').value === 'air';
    const res = { species: species, w: w, fpl: fpl, hours: hours, tC: tC, tF: tF, W: W, air: air, errors: [], warns: [] };

    let base65 = 0, clamp = { sizeClamp: '', hourClamp: '' };
    if (species === 'catfish') {
      if (w > 0 && hours > 0) { clamp = catRate(fpl, hours); base65 = clamp.rate; }
      res.useTemp = true;
      res.airCap = air;
    } else {
      base65 = CalcUnits.base('crate') / 1000 / LBGAL_TO_KGL; // kg/m³ → kg/L → lb/gal
      res.useTemp = $('ctemp').value === '1';
      res.airCap = false;
    }
    res.base65 = base65;
    res.clamp = clamp;

    if (!(W > 0)) res.errors.push('Enter the water volume (or all three tank dimensions).');
    if (!(w > 0)) res.errors.push('Enter the fish size.');
    if (!(hours > 0)) res.errors.push('Enter the trip duration.');
    if (!isFinite(tC)) res.errors.push('Enter the hauling water temperature.');
    if (species === 'custom' && !(base65 > 0)) res.errors.push('Enter the loading rate from your species guide.');

    if (res.errors.length) { res.ok = false; return res; }

    res.fT = res.useTemp ? tempFactor(tF) : 1;
    res.rate = rateAt(tF, res);                    // lb/gal
    if (!(res.rate > 0)) {
      res.ok = false;
      res.errors.push('At ' + fmt(tF, 0) + ' °F the 25%-per-10 °F rule leaves no safe load. Haul in cooler water.');
      return res;
    }
    res.rateKgL = res.rate * LBGAL_TO_KGL;
    res.maxKg = res.rateKgL * W;
    res.maxN = res.maxKg / w;

    const planned = parseFloat($('planned').value);
    res.plannedN = isFinite(planned) && planned > 0 ? Math.round(planned) : 0;
    res.plannedKg = res.plannedN * w;
    res.ratio = res.plannedN ? res.plannedKg / res.maxKg : 0;
    res.needL = res.plannedKg / res.rateKgL;
    res.dispL = res.plannedKg / KG_PER_LB * DISP_GAL_PER_LB * L_PER_GAL;

    const bio = res.plannedN ? res.plannedKg : res.maxKg;
    res.bioKg = bio;
    const o2rate = parseFloat($('o2rate').value);
    res.o2rate = isFinite(o2rate) && o2rate > 0 ? o2rate : 0;
    res.o2kg = bio * res.o2rate * hours / 1e6;
    res.o2L = res.o2kg * O2_L_PER_KG;

    const salt = parseFloat($('salt').value);
    res.saltPct = isFinite(salt) && salt > 0 ? salt : 0;
    res.saltKg = W * res.saltPct / 100;

    const dC = CalcUnits.baseSigned('dest');
    res.destOk = isFinite(dC);
    res.dF = Math.abs(tF - cToF(dC));
    res.temperMin = res.dF * 2; // 20 min per 10 °F

    // Warnings
    if (species === 'catfish') {
      if (clamp.sizeClamp === 'big') res.warns.push('Fish heavier than 1 lb are beyond the table; the 1-per-pound row is used.');
      if (clamp.sizeClamp === 'small') res.warns.push('Fish smaller than 250 per pound (under about 1.8 g) are beyond the table; the 250-per-pound row is used and is probably too high for fry.');
      if (clamp.hourClamp === 'long') res.warns.push('Trips longer than 16 h are beyond the table; the 16-hour rate is shown and is likely too high. Reduce the load.');
    }
    if (res.useTemp && tF < 45) res.warns.push('Below 45 °F the temperature increase is capped at +50%.');
    if (res.useTemp && tF > 85) res.warns.push('Above 85 °F is outside the range the 25%-per-10 °F rule is normally used for. Cool the hauling water if you can.');
    if (air && species === 'catfish' && res.airCap && res.base65 * res.fT > AIR_CAP_LBGAL * res.fT) res.warns.push('Air only: rate capped at 4 lb/gal (adjusted for temperature).');
    if (air && species === 'catfish' && !(res.base65 > AIR_CAP_LBGAL)) res.warns.push('Air only: the table assumes good aeration; with small fish and no bottled oxygen, haul less than this.');
    if (air && species === 'custom') res.warns.push('Air only: make sure your loading rate was published for air-aerated tanks.');
    if (res.ratio > 1) res.warns.push('The planned load is ' + fmt(res.ratio * 100, 0) + '% of the safe maximum. Use more water, fewer fish or more trips.');
    if ($('sizemode').value === 'length' && species === 'custom') res.warns.push('The length-to-weight equation is for channel catfish; weigh a sample of other species instead.');

    res.ok = true;
    return res;
  }

  // ---------- UI state ----------
  function setTank(t) {
    tank = t;
    tankButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tank === t)); });
    document.querySelectorAll('[data-tank-for]').forEach(function (el) { el.hidden = el.dataset.tankFor !== t; });
  }

  function syncVisibility() {
    const sp = $('species').value;
    document.querySelectorAll('[data-sp]').forEach(function (el) { el.hidden = el.dataset.sp !== sp; });
    const sm = $('sizemode').value;
    document.querySelectorAll('[data-size]').forEach(function (el) { el.hidden = el.dataset.size !== sm; });
    $('species-hint').textContent = sp === 'catfish'
      ? 'Rates for 65 °F with good aeration, interpolated by fish size and trip length, then adjusted for temperature.'
      : 'Use a loading rate published for your species, size and trip (e.g. SRAC 392/393, Piper et al. 1982).';
  }

  function isVisible(id) {
    const f = $(id).closest('.field');
    let n = f;
    while (n && n !== document.body) { if (n.hidden) return false; n = n.parentElement; }
    return true;
  }

  function getState() {
    const st = { tank: tank };
    SELECTS.forEach(function (s) { st[s] = $(s).value; });
    if ($('species').value !== 'custom') delete st.ctemp;
    UNIT_FIELDS.forEach(function (f) {
      if (!isVisible(f)) return;
      st[f] = $(f).value;
      st[f + '_u'] = CalcUnits.unit(f);
    });
    PLAIN_FIELDS.forEach(function (f) { st[f] = $(f).value; });
    return st;
  }

  function applyDefaults() {
    UNIT_FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    PLAIN_FIELDS.forEach(function (f) { $(f).value = DEFAULTS[f]; });
    SELECTS.forEach(function (s) { $(s).value = DEFAULTS[s]; });
    setTank(DEFAULTS.tank);
  }

  // ---------- Render ----------
  function render() {
    syncVisibility();
    const r = compute();
    const notice = $('notice');
    const msgs = r.errors.concat(r.ok ? r.warns : []);
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const set = function (id, text) { $(id).textContent = text; };
    if (!r.ok) {
      ['r-max', 'r-maxn', 'r-rate', 'r-basis', 'r-plan', 'r-need', 'r-space', 'r-o2', 'r-salt', 'r-temper', 'r-size'].forEach(function (id) { set(id, '–'); });
      $('r-fillbar').style.width = '0%';
      set('viz-caption', 'Enter the tank, fish and trip details to see the load.');
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }

    set('r-max', massOut(r.maxKg));
    set('r-maxn', '≈ ' + fmtInt(r.maxN) + ' fish in ' + volOut(r.W) + ' of water');
    set('r-rate', densOut(r.rateKgL) + ' · ' + fmt(r.rateKgL * 1000, 0) + ' g/L');
    const basis = r.species === 'catfish'
      ? fmt(r.base65, 2) + ' lb/gal at 65 °F × ' + fmt(r.fT, 3) + ' (temp.)' + (r.airCap && r.base65 > AIR_CAP_LBGAL ? ', air cap 4 lb/gal' : '')
      : (r.useTemp ? 'Your rate × ' + fmt(r.fT, 3) + ' (temp.)' : 'Your rate, no temperature change');
    set('r-basis', basis);

    $('r-fillbar').style.width = Math.min(100, r.ratio * 100) + '%';
    $('r-fillbar').style.background = r.ratio > 1 ? 'var(--warn-text)' : '';
    if (r.plannedN) {
      set('r-plan', fmtInt(r.plannedN) + ' fish = ' + massOut(r.plannedKg) + ' · ' + fmt(r.ratio * 100, 0) + '% of max');
      set('r-need', volOut(r.needL));
      set('r-space', volOut(r.W + r.dispL) + ' with your water (' + volOut(r.dispL) + ' displaced) · minimum ' + volOut(r.needL + r.dispL));
    } else {
      set('r-plan', 'Enter fish to haul');
      set('r-need', '–');
      const dispMax = r.maxKg / KG_PER_LB * DISP_GAL_PER_LB * L_PER_GAL;
      set('r-space', volOut(r.W + dispMax) + ' at the max load (' + volOut(dispMax) + ' displaced)');
    }
    set('r-o2', r.o2rate
      ? massOut(r.o2kg) + ' ≈ ' + fmt(r.o2L, 0) + ' L (' + fmt(r.o2L / 28.316846592, 1) + ' ft³) gas absorbed (est.)'
      : 'Enter an oxygen use rate');
    set('r-salt', r.saltPct
      ? massOut(r.saltKg) + ' for ' + fmt(r.saltPct, 2) + '% (' + fmt(r.saltPct * 10, 1) + ' g/L)'
      : 'None');
    set('r-temper', r.destOk
      ? (r.dF < 0.5 ? 'Temperatures match; still acclimate gradually' : 'At least ' + fmt(Math.ceil(r.temperMin), 0) + ' min for a ' + fmt(r.dF, 1) + ' °F (' + fmt(r.dF * 5 / 9, 1) + ' °C) difference')
      : '–');
    const sizeTxt = fmt(r.w * 1000, r.w * 1000 >= 100 ? 0 : 1) + ' g (' + fmt(r.w / KG_PER_LB, 3) + ' lb) · ' + fmt(r.fpl, r.fpl >= 10 ? 0 : 2) + ' per lb';
    set('r-size', sizeTxt);

    set('viz-caption', r.plannedN
      ? 'Planned ' + massOut(r.plannedKg) + ' is ' + fmt(r.ratio * 100, 0) + '% of the ' + massOut(r.maxKg) + ' safe maximum at ' + tempText(r.tC) + ', ' + fmt(r.hours, 1) + ' h trip'
      : 'Safe maximum ' + massOut(r.maxKg) + ' at ' + tempText(r.tC) + ', ' + fmt(r.hours, 1) + ' h trip');

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  function tempText(c) {
    const u = CalcUnits.unit('temp');
    return fmt(CalcUnits.convert('temperature', c, 'C', u), 1) + ' ' + CalcUnits.label('temperature', u);
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }
  function txt(x, y, s, anchor, cls) { return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, s); }

  function fishPath(x, y, s) {
    // small fish facing right, body centred at (x, y), length ~ 2.4s
    return 'M' + (x - 1.2 * s) + ',' + y +
      ' Q' + (x - 0.2 * s) + ',' + (y - 0.75 * s) + ' ' + (x + 1.0 * s) + ',' + y +
      ' Q' + (x - 0.2 * s) + ',' + (y + 0.75 * s) + ' ' + (x - 1.2 * s) + ',' + y + 'Z' +
      ' M' + (x - 1.1 * s) + ',' + y + ' L' + (x - 1.7 * s) + ',' + (y - 0.5 * s) + ' L' + (x - 1.7 * s) + ',' + (y + 0.5 * s) + 'Z';
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawTruck(r);
    drawGauge(r);
    drawChart(r);
  }

  function drawTruck(r) {
    // Tank on a flatbed, cab on the right.
    const tx = 16, ty = 52, tw = 236, th = 96;
    const roadY = 176;
    el('line', { x1: 8, y1: roadY, x2: 350, y2: roadY, class: 'road' });
    el('rect', { x: tx - 6, y: ty + th, width: 330, height: 12, rx: 3, class: 'truck-body' });
    // cab
    el('path', { class: 'truck-body', d: 'M262,' + (ty + th) + ' L262,' + (ty + 26) + ' L300,' + (ty + 26) + ' L322,' + (ty + 58) + ' L330,' + (ty + 62) + ' L330,' + (ty + th) + 'Z' });
    el('path', { class: 'tank-glass', d: 'M270,' + (ty + 34) + ' L296,' + (ty + 34) + ' L313,' + (ty + 58) + ' L270,' + (ty + 58) + 'Z' });
    el('path', { class: 'tank-line', d: 'M270,' + (ty + 34) + ' L296,' + (ty + 34) + ' L313,' + (ty + 58) + ' L270,' + (ty + 58) + 'Z' });
    // tank
    el('rect', { x: tx, y: ty, width: tw, height: th, rx: 10, class: 'tank-glass' });
    const wy = ty + 14;
    el('rect', { x: tx + 2, y: wy, width: tw - 4, height: th - 16, rx: 8, class: 'water' });
    el('line', { x1: tx + 4, y1: wy, x2: tx + tw - 4, y2: wy, class: 'water-top' });
    el('rect', { x: tx, y: ty, width: tw, height: th, rx: 10, class: 'tank-line' });
    // wheels
    [52, 120, 300].forEach(function (x) { el('circle', { cx: x, cy: roadY - 12, r: 12, class: 'wheel' }); });

    // Fish: each icon = 10% of the safe maximum. 5 columns × 3 rows.
    const cols = 5, rows = 3, slots = cols * rows;
    const n = r.ok ? Math.round((r.plannedN ? r.ratio : 1) * 10) : 0;
    const cw = (tw - 24) / cols, rh = (th - 24) / rows;
    for (let i = 0; i < Math.max(10, Math.min(n, slots)); i++) {
      const c = i % cols, row = rows - 1 - Math.floor(i / cols);
      const x = tx + 12 + cw * (c + 0.5), y = wy + 6 + rh * (row + 0.5);
      const cls = i >= n ? 'fish-empty' : i >= 10 ? 'fish-over' : 'fish-ok';
      el('path', { d: fishPath(x, y, 11), class: cls });
    }
    if (r.ok) {
      const head = r.plannedN ? 'Planned ' + massOut(r.plannedKg) : 'Loaded to safe max';
      txt(tx, 22, head, 'start', 'big-text');
      txt(tx, 40, 'Safe max ' + massOut(r.maxKg) + ' · each fish icon = 10%', 'start', 'dim-text');
    } else {
      txt(tx, 30, 'Enter inputs to load the truck', 'start', 'dim-text');
    }
  }

  function arcPt(cx, cy, rad, frac) {
    const a = Math.PI * (1 - frac); // frac 0 → left, 1 → right
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  }
  function arc(cx, cy, rad, f0, f1) {
    const p0 = arcPt(cx, cy, rad, f0), p1 = arcPt(cx, cy, rad, f1);
    return 'M' + p0[0] + ',' + p0[1] + ' A' + rad + ',' + rad + ' 0 0 1 ' + p1[0] + ',' + p1[1];
  }

  function drawGauge(r) {
    const cx = 412, cy = 124, rad = 50, maxPct = 150;
    el('path', { d: arc(cx, cy, rad, 0, 1), class: 'gauge-track' });
    el('path', { d: arc(cx, cy, rad, 0, 100 / maxPct), class: 'gauge-ok' });
    el('path', { d: arc(cx, cy, rad, 100 / maxPct, 1), class: 'gauge-over' });
    const pct = r.ok ? (r.plannedN ? r.ratio * 100 : 100) : 0;
    const f = Math.min(1, Math.max(0, pct / maxPct));
    const tip = arcPt(cx, cy, rad - 4, f);
    el('line', { x1: cx, y1: cy, x2: tip[0], y2: tip[1], class: 'needle' });
    el('circle', { cx: cx, cy: cy, r: 5, class: 'hub' });
    txt(cx - rad, cy + 16, '0', 'middle');
    const p100 = arcPt(cx, cy, rad + 14, 100 / maxPct);
    txt(p100[0] + 4, p100[1], '100%', 'middle');
    txt(cx + rad, cy + 16, '150', 'middle');
    txt(cx, cy + 34, r.ok ? fmt(pct, 0) + '% of max' : '–', 'middle', pct > 100 ? 'warn-text' : 'big-text');
    txt(cx, cy - rad - 22, 'Load', 'middle');
  }

  function niceStep(range) {
    const raw = range / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function drawChart(r) {
    const x0 = 58, x1 = 464, yT = 226, yB = 366;
    const tu = CalcUnits.unit('temp');
    const du = $('dout').value;
    txt(x0 - 50, 210, 'Safe loading rate vs. water temperature', 'start', 'dim-text');
    if (!r.ok || !(r.base65 > 0)) {
      el('path', { class: 'axis', d: 'M' + x0 + ',' + yT + ' L' + x0 + ',' + yB + ' L' + x1 + ',' + yB });
      return;
    }
    const lo = Math.min(T_CHART_F[0], isFinite(r.tF) ? r.tF : 99), hi = Math.max(T_CHART_F[1], isFinite(r.tF) ? r.tF : 0);
    const tLo = Math.max(32, Math.min(lo, 45)), tHi = Math.min(104, Math.max(hi, 85));
    const toD = function (lbgal) { return CalcUnits.convert('density', lbgal * LBGAL_TO_KGL * 1000, 'kgm3', du); };
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const tF = tLo + (tHi - tLo) * i / 40;
      pts.push([tF, toD(rateAt(tF, r))]);
    }
    const planD = r.plannedN ? toD(r.plannedKg / KG_PER_LB / (r.W / L_PER_GAL)) : 0;
    let yMax = Math.max.apply(null, pts.map(function (p) { return p[1]; }).concat([planD]));
    const step = niceStep(yMax || 1);
    yMax = Math.ceil((yMax * 1.05) / step) * step || step;
    const X = function (tF) { return x0 + (tF - tLo) / (tHi - tLo) * (x1 - x0); };
    const Y = function (v) { return yB - Math.min(v, yMax) / yMax * (yB - yT); };

    // grid + y labels
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: x0, y1: Y(v), x2: x1, y2: Y(v), class: 'grid' });
      txt(x0 - 6, Y(v) + 4, fmt(v, step < 0.1 ? 2 : step < 1 ? 1 : 0), 'end');
    }
    // x ticks in user's unit
    const toU = function (tF) { return CalcUnits.convert('temperature', fToC(tF), 'C', tu); };
    const fromU = function (v) { return cToF(CalcUnits.convert('temperature', v, tu, 'C')); };
    const uLo = toU(tLo), uHi = toU(tHi);
    const xs = niceStep(uHi - uLo);
    for (let v = Math.ceil(uLo / xs) * xs; v <= uHi + 1e-9; v += xs) {
      const x = X(fromU(v));
      el('line', { x1: x, y1: yB, x2: x, y2: yB + 5, class: 'axis' });
      txt(x, yB + 18, fmt(v, 0), 'middle');
    }
    el('path', { class: 'axis', d: 'M' + x0 + ',' + yT + ' L' + x0 + ',' + yB + ' L' + x1 + ',' + yB });
    txt((x0 + x1) / 2, yB + 36, 'Water temperature (' + CalcUnits.label('temperature', tu) + ')', 'middle', 'axis-title');
    el('text', { x: 14, y: (yT + yB) / 2, 'text-anchor': 'middle', class: 'axis-title', transform: 'rotate(-90 14 ' + ((yT + yB) / 2) + ')' }, CalcUnits.label('density', du));

    // curve
    el('path', { class: 'curve', d: pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') });
    // planned density line
    if (planD > 0) {
      el('line', { x1: x0, y1: Y(planD), x2: x1, y2: Y(planD), class: 'plan-line' });
      txt(x0 + 6, Y(planD) - 5, 'planned ' + fmt(planD, 2), 'start', 'plan-text');
    }
    // user's point
    const px = X(Math.min(tHi, Math.max(tLo, r.tF))), py = Y(toD(r.rate));
    el('circle', { cx: px, cy: py, r: 6, class: 'point' });
    const lab = fmt(toD(r.rate), 2) + ' at ' + tempText(r.tC);
    txt(px > (x0 + x1) / 2 ? px - 8 : px + 8, py - 12, lab, px > (x0 + x1) / 2 ? 'end' : 'start', 'depth-text');
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Fish Hauling Calculator'];
    lines.push('Guide: ' + ($('species').value === 'catfish' ? 'Channel catfish table (Piper et al. 1982)' : 'Custom rate ' + typed('crate') + ($('ctemp').value === '1' ? ' at 65 °F' : '')));
    lines.push('Tank water: ' + (tank === 'vol' ? typed('water') : typed('tl') + ' × ' + typed('tw') + ' × ' + typed('td') + ' deep'));
    const sm = $('sizemode').value;
    lines.push('Fish size: ' + (sm === 'weight' ? typed('fishw') : sm === 'count' ? typed('fishn') : typed('fishl') + ' long'));
    lines.push('Water ' + typed('temp') + ', trip ' + typed('trip') + ', ' + ($('o2').value === 'air' ? 'air only' : 'bottled/liquid oxygen'));
    if (!r.ok) { lines.push(r.errors.join(' ')); lines.push(CalcShare.buildUrl(getState())); return lines.join('\n'); }
    lines.push('Maximum safe load: ' + massOut(r.maxKg) + ' (≈ ' + fmtInt(r.maxN) + ' fish)');
    lines.push('Safe loading rate: ' + densOut(r.rateKgL) + ' (' + fmt(r.rateKgL, 3) + ' kg/L)');
    if (r.plannedN) {
      lines.push('Planned: ' + fmtInt(r.plannedN) + ' fish = ' + massOut(r.plannedKg) + ' (' + fmt(r.ratio * 100, 0) + '% of max)');
      lines.push('Water needed: ' + volOut(r.needL) + '; tank space incl. displacement: ' + volOut(r.needL + r.dispL));
    }
    if (r.o2rate) lines.push('Oxygen used by fish (estimate): ' + massOut(r.o2kg) + ' ≈ ' + fmt(r.o2L, 0) + ' L gas');
    if (r.saltPct) lines.push('Salt: ' + massOut(r.saltKg) + ' for ' + fmt(r.saltPct, 2) + '%');
    if (r.destOk) lines.push('Temper at least ' + fmt(Math.ceil(r.temperMin), 0) + ' min');
    if (r.warns.length) lines.push('Notes: ' + r.warns.join(' '));
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  tankButtons.forEach(function (b) { b.addEventListener('click', function () { setTank(b.dataset.tank); render(); }); });
  UNIT_FIELDS.concat(PLAIN_FIELDS).forEach(function (f) { $(f).addEventListener('input', render); });
  ['species', 'ctemp', 'sizemode', 'o2'].forEach(function (s) { $(s).addEventListener('change', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Fish Hauling Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    SELECTS.forEach(function (s) {
      if (p[s] !== undefined && Array.prototype.some.call($(s).options, function (o) { return o.value === p[s]; })) $(s).value = p[s];
    });
    UNIT_FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    PLAIN_FIELDS.forEach(function (f) { if (p[f] !== undefined) $(f).value = p[f]; });
    setTank(p.tank === 'dims' ? 'dims' : 'vol');
    render();
  })();
})();
