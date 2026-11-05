// Low-Cost Sea Salt Mix Calculator: agricultural / technical salts to reach the major-ion
// composition of natural seawater (Millero et al. 2008) scaled to a target salinity, or to
// correct an inland well water at its own salinity. Source water subtracted, optional
// reduced-magnesium target, Lawson–Hanson NNLS solver, costs vs a commercial sea salt,
// live SVG (ion bars, salt mass and cost bars), shareable URL state.
(function () {
  'use strict';

  // ---------- Constants ----------
  // IUPAC 2021 standard atomic weights (abridged), Prohaska et al. 2022.
  const AW = { H: 1.008, C: 12.011, O: 15.999, Na: 22.990, Mg: 24.305, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078 };
  const H2O = 2 * AW.H + AW.O;
  const M_SO4 = AW.S + 4 * AW.O;
  const M_HCO3 = AW.H + AW.C + 3 * AW.O;
  const M_CACO3 = AW.Ca + AW.C + 3 * AW.O;
  // 1 mg/L alkalinity as CaCO3 = 2 × 61.017 / 100.086 mg/L HCO3 (1.2193).
  const ALK_FACTOR = 2 * M_HCO3 / M_CACO3;
  const HARD_CA = M_CACO3 / AW.Ca, HARD_MG = M_CACO3 / AW.Mg; // 2.497, 4.118

  // Reference-Composition seawater, Millero et al. (2008), Table 4: g per kg of seawater at
  // S_R = 35.16504 g/kg (Practical Salinity 35). Alkalinity = carbonate alkalinity
  // (HCO3⁻ + 2 CO3²⁻ = 2.1957 mmol/kg), kept as mg/L of HCO3 equivalent internally.
  const S_REF = 35.16504;
  const SEAWATER = { na: 10.78145, mg: 1.28372, ca: 0.41208, k: 0.39910, cl: 19.35271, so4: 2.71235,
    alk: 2.1957e-3 * M_HCO3 };

  // Ions the calculator balances. w = solver weight on the relative error; floor (mg/L) keeps
  // the scale finite when a target is tiny. Cations first, anions lighter.
  const IONS = [
    { id: 'na', sym: 'Na', name: 'Sodium', w: 1, floor: 1, mw: AW.Na },
    { id: 'k', sym: 'K', name: 'Potassium', w: 1, floor: 1, mw: AW.K },
    { id: 'ca', sym: 'Ca', name: 'Calcium', w: 1, floor: 1, mw: AW.Ca },
    { id: 'mg', sym: 'Mg', name: 'Magnesium', w: 1, floor: 1, mw: AW.Mg },
    { id: 'cl', sym: 'Cl', name: 'Chloride', w: 0.5, floor: 1, mw: AW.Cl },
    { id: 'so4', sym: 'SO₄', name: 'Sulfate', w: 0.4, floor: 1, mw: M_SO4 },
    { id: 'alk', sym: 'Alk', name: 'Alkalinity (as HCO₃)', w: 0.5, floor: 1, mw: M_HCO3 }
  ];
  const ION = {};
  IONS.forEach(function (e) { ION[e.id] = e; });

  // Salts. comp: formula mass; el: moles of each ion per mole of salt.
  function salt(key, name, formula, mw, el, price, extra) {
    const frac = {};
    Object.keys(el).forEach(function (k) { frac[k] = el[k] * ION[k].mw / mw; });
    return Object.assign({ key: key, name: name, formula: formula, mw: mw, frac: frac, price: price, pct: 100 }, extra || {});
  }
  // Default prices are EDITABLE EXAMPLES in currency units per kg, not quotes.
  const SALTS = [
    salt('nacl', 'Sodium chloride (non-iodised)', 'NaCl', AW.Na + AW.Cl, { na: 1, cl: 1 }, 0.20, { short: 'NaCl' }),
    salt('mgso4', 'Magnesium sulfate heptahydrate (Epsom salt)', 'MgSO₄·7H₂O', AW.Mg + M_SO4 + 7 * H2O, { mg: 1, so4: 1 }, 0.70, { short: 'MgSO₄·7H₂O' }),
    salt('mgcl2', 'Magnesium chloride hexahydrate (flake)', 'MgCl₂·6H₂O', AW.Mg + 2 * AW.Cl + 6 * H2O, { mg: 1, cl: 2 }, 0.80, { short: 'MgCl₂·6H₂O' }),
    salt('cacl2d', 'Calcium chloride dihydrate', 'CaCl₂·2H₂O', AW.Ca + 2 * AW.Cl + 2 * H2O, { ca: 1, cl: 2 }, 0.60, { short: 'CaCl₂·2H₂O' }),
    salt('cacl2a', 'Calcium chloride, anhydrous', 'CaCl₂', AW.Ca + 2 * AW.Cl, { ca: 1, cl: 2 }, 0.80, { short: 'CaCl₂', hot: true }),
    salt('kcl', 'Potassium chloride (muriate of potash)', 'KCl', AW.K + AW.Cl, { k: 1, cl: 1 }, 0.80, { short: 'KCl' }),
    salt('nahco3', 'Sodium bicarbonate', 'NaHCO₃', AW.Na + M_HCO3, { na: 1, alk: 1 }, 0.60, { short: 'NaHCO₃' }),
    salt('k2so4', 'Potassium sulfate', 'K₂SO₄', 2 * AW.K + M_SO4, { k: 2, so4: 1 }, 1.20, { short: 'K₂SO₄' }),
    salt('na2so4', 'Sodium sulfate, anhydrous', 'Na₂SO₄', 2 * AW.Na + M_SO4, { na: 2, so4: 1 }, 0.50, { short: 'Na₂SO₄' })
  ];
  const DEFAULT_USE = ['nacl', 'mgso4', 'mgcl2', 'cacl2d', 'kcl', 'nahco3'];
  const COLORS = ['#2b7fd1', '#2fa37a', '#8a6fd1', '#e08a2e', '#d46a9a', '#c0504d', '#93b024', '#4cb8c4', '#b07a52'];
  const TOL = 0.10; // ±10 % display band, a rule of thumb rather than a shrimp tolerance

  // Price per mass unit. Base = per kg; factor = how many "per kg" one of this unit is.
  CalcUnits.GROUPS.pricemass = CalcUnits.GROUPS.pricemass || {
    base: 'kg',
    units: [
      { id: 'kg', label: 'per kg', factor: 1 },
      { id: 'lb', label: 'per lb', factor: 1 / 0.45359237 },
      { id: 'bag25', label: 'per 25 kg bag', factor: 1 / 25 },
      { id: 'bag50lb', label: 'per 50 lb bag', factor: 1 / (50 * 0.45359237) },
      { id: 't', label: 'per t', factor: 1 / 1000 }
    ]
  };

  // Currency symbols are display only: no exchange rates (as fcr.js / cost-benefit.js).
  const CURRENCIES = [
    { id: 'usd', sym: '$', label: '$ (dollar)' },
    { id: 'eur', sym: '€', label: '€ (euro)' },
    { id: 'gbp', sym: '£', label: '£ (pound)' },
    { id: 'jpy', sym: '¥', label: '¥ (yen / yuan)' },
    { id: 'inr', sym: '₹', label: '₹ (rupee)' },
    { id: 'aud', sym: 'A$', label: 'A$ (Australian dollar)' },
    { id: 'brl', sym: 'R$', label: 'R$ (real)' },
    { id: 'mxn', sym: 'MX$', label: 'MX$ (Mexican peso)' },
    { id: 'thb', sym: '฿', label: '฿ (baht)' },
    { id: 'vnd', sym: '₫', label: '₫ (dong)' },
    { id: 'none', sym: '', label: 'No symbol' }
  ];

  const DEFAULTS = {
    mode: 'make', sal: 5, sal_u: 'gL', vol: 10, vol_u: 'm3', mgmode: 'sw', mg_t: 100, mg_t_u: 'mgL', mgca: 1,
    alk_t: '', alk_t_u: 'mgL', alk: 'caco3', cur: 'usd', comm: 0.90, comm_u: 'kg', mout: 'kg'
  };
  const WATER_IDS = ['na', 'k', 'ca', 'mg', 'cl', 'so4', 'alk'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');

  // ---------- Formatting ----------
  function fixed(n, d) {
    return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
  }
  function sig(n) {
    if (!isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a === 0) return '0';
    if (a >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return n.toLocaleString(undefined, { maximumSignificantDigits: a < 10 ? 3 : 4 });
  }
  function conc(n) {
    if (!isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a === 0) return '0';
    if (a >= 100) return fixed(n, 0);
    if (a >= 10) return fixed(n, 1);
    return fixed(n, 2);
  }
  function sym() {
    const c = CURRENCIES.filter(function (x) { return x.id === $('cur').value; })[0];
    return c ? c.sym : '$';
  }
  function money(n) {
    if (!isFinite(n)) return '–';
    const d = Math.abs(n) >= 1000 ? 0 : 2;
    return (n < 0 ? '−' : '') + sym() + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function massOut(kg) {
    const u = $('mout').value || 'kg';
    return sig(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }
  function raw(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : '–') + (u ? ' ' + u : '');
  }
  function ratio(a, b) { return a > 0 && b > 0 ? a / b : NaN; }

  // ---------- Salt list UI ----------
  function analysisText(s) {
    return s.formula + ' · M ' + fixed(s.mw, 2) + ' · ' + Object.keys(s.frac).map(function (k) {
      return (k === 'alk' ? 'HCO₃' : ION[k].sym) + ' ' + fixed(s.frac[k] * 100, 1) + '%';
    }).join(', ');
  }
  function buildSaltList() {
    const box = $('salt-list');
    SALTS.forEach(function (s) {
      const row = document.createElement('div');
      row.className = 'salt-row';
      const lab = document.createElement('label');
      lab.className = 'salt-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'use_' + s.key;
      lab.appendChild(cb);
      const nm = document.createElement('span');
      nm.className = 'salt-name';
      nm.textContent = s.name;
      const an = document.createElement('span');
      an.className = 'salt-an';
      an.textContent = analysisText(s);
      nm.appendChild(an);
      lab.appendChild(nm);
      row.appendChild(lab);

      const pr = document.createElement('div');
      pr.className = 'input-row salt-pct';
      const pin = document.createElement('input');
      pin.type = 'number'; pin.id = 'pct_' + s.key; pin.min = '0'; pin.max = '100'; pin.step = 'any';
      pin.setAttribute('inputmode', 'decimal');
      pin.setAttribute('aria-label', s.name + ' purity, percent');
      const pu = document.createElement('span');
      pu.className = 'unit';
      pu.textContent = '%';
      pr.appendChild(pin); pr.appendChild(pu);
      row.appendChild(pr);

      const cr = document.createElement('div');
      cr.className = 'input-row salt-price';
      const cp = document.createElement('span');
      cp.className = 'unit cur-pre';
      cp.setAttribute('aria-hidden', 'true');
      cp.textContent = '$';
      const cin = document.createElement('input');
      cin.type = 'number'; cin.id = 'price_' + s.key; cin.min = '0'; cin.step = 'any';
      cin.setAttribute('inputmode', 'decimal');
      cin.setAttribute('aria-label', s.name + ' price');
      const cs = document.createElement('select');
      cs.className = 'unit-select';
      cs.dataset.unitGroup = 'pricemass';
      cs.dataset.unitFor = 'price_' + s.key;
      cs.dataset.unitDefault = 'kg';
      cs.setAttribute('aria-label', s.name + ' price unit');
      cr.appendChild(cp); cr.appendChild(cin); cr.appendChild(cs);
      row.appendChild(cr);
      box.appendChild(row);
    });
  }

  // ---------- Solver: Lawson–Hanson non-negative least squares ----------
  // Minimises ||A x − b||² subject to x ≥ 0. A is m×n (array of rows). Deterministic.
  // Copied from nutrient-additions.js.
  function solveSym(M, v) {
    const n = v.length;
    const a = M.map(function (r, i) { return r.slice().concat([v[i]]); });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (Math.abs(a[p][c]) < 1e-300) return null;
      const t = a[c]; a[c] = a[p]; a[p] = t;
      for (let r = c + 1; r < n; r++) {
        const f = a[r][c] / a[c][c];
        if (f === 0) continue;
        for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = a[r][n];
      for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
      x[r] = s / a[r][r];
    }
    return x;
  }
  function lsq(A, b, cols) {
    const k = cols.length;
    const M = [], v = [];
    for (let i = 0; i < k; i++) {
      M.push(new Array(k).fill(0));
      let s = 0;
      for (let r = 0; r < A.length; r++) s += A[r][cols[i]] * b[r];
      v.push(s);
    }
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        let s = 0;
        for (let r = 0; r < A.length; r++) s += A[r][cols[i]] * A[r][cols[j]];
        M[i][j] = M[j][i] = s;
      }
      M[i][i] += 1e-10;
    }
    return solveSym(M, v);
  }
  function nnls(A, b, n) {
    const m = A.length;
    const x = new Array(n).fill(0);
    const P = new Array(n).fill(false);
    function grad() {
      const r = b.map(function (bi, i) { let s = bi; for (let j = 0; j < n; j++) s -= A[i][j] * x[j]; return s; });
      const w = new Array(n).fill(0);
      for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) w[j] += A[i][j] * r[i];
      return w;
    }
    const tol = 1e-10;
    for (let outer = 0; outer < 3 * n + 10; outer++) {
      const w = grad();
      let jmax = -1, wmax = tol;
      for (let j = 0; j < n; j++) if (!P[j] && w[j] > wmax) { wmax = w[j]; jmax = j; }
      if (jmax < 0) break;
      P[jmax] = true;
      for (let inner = 0; inner < 3 * n + 10; inner++) {
        const cols = [];
        for (let j = 0; j < n; j++) if (P[j]) cols.push(j);
        const zs = lsq(A, b, cols);
        if (!zs) { P[jmax] = false; break; }
        const z = new Array(n).fill(0);
        cols.forEach(function (c, i) { z[c] = zs[i]; });
        let allPos = true;
        cols.forEach(function (c) { if (z[c] <= 1e-14) allPos = false; });
        if (allPos) { for (let j = 0; j < n; j++) x[j] = z[j]; break; }
        let alpha = Infinity;
        cols.forEach(function (c) {
          if (z[c] <= 1e-14) { const d = x[c] - z[c]; if (d > 0) alpha = Math.min(alpha, x[c] / d); }
        });
        if (!isFinite(alpha)) alpha = 0;
        for (let j = 0; j < n; j++) x[j] += alpha * (z[j] - x[j]);
        cols.forEach(function (c) { if (x[c] <= 1e-12) { x[c] = 0; P[c] = false; } });
      }
    }
    return x.map(function (v) { return v > 0 && isFinite(v) ? v : 0; });
  }

  // ---------- Compute ----------
  function readWater() {
    const w = {};
    WATER_IDS.forEach(function (id) { w[id] = CalcUnits.base('w_' + id); });
    if ($('alk').value === 'caco3') w.alk *= ALK_FACTOR;
    return w;
  }
  function ionSum(c) { // mg/L, alkalinity counted as HCO3
    return IONS.reduce(function (a, e) { return a + (c[e.id] || 0); }, 0);
  }

  function compute() {
    const r = { msgs: [], notes: {} };
    let negative = false;
    document.querySelectorAll('.calc-layout input[type=number]').forEach(function (i) { if (parseFloat(i.value) < 0) negative = true; });
    r.negative = negative;
    r.mode = $('mode').value === 'correct' ? 'correct' : 'make';
    r.vol = CalcUnits.base('vol'); // L
    r.water = readWater();
    r.waterSal = ionSum(r.water) / 1000; // g/L
    r.sal = r.mode === 'correct' ? r.waterSal : CalcUnits.base('sal') / 1000; // g/L

    // target: seawater scaled to the target salinity
    const f = r.sal / S_REF;
    r.sw = {};
    IONS.forEach(function (e) { r.sw[e.id] = SEAWATER[e.id] * f * 1000; });
    r.target = Object.assign({}, r.sw);
    r.mgmode = $('mgmode').value;
    if (r.mgmode === 'mg') r.target.mg = CalcUnits.base('mg_t');
    else if (r.mgmode === 'ratio') { const q = raw('mgca'); r.mgca = q; r.target.mg = q > 0 ? q * r.target.ca : 0; }
    const alkT = CalcUnits.base('alk_t');
    r.alkOverride = alkT > 0;
    if (alkT > 0) r.target.alk = alkT * ALK_FACTOR;

    // ticked salts with purity
    r.salts = [];
    SALTS.forEach(function (s) {
      if (!$('use_' + s.key).checked) return;
      let p = raw('pct_' + s.key);
      if (!(p > 0)) { r.notes.zero = (r.notes.zero || []).concat([s.short]); return; }
      if (p > 100) { r.notes.bad = true; p = 100; }
      const fr = {};
      Object.keys(s.frac).forEach(function (k) { fr[k] = s.frac[k] * p / 100; });
      const pv = raw('price_' + s.key);
      r.salts.push({ s: s, frac: fr, pct: p, priceKg: pv >= 0 ? CalcUnits.base('price_' + s.key) : NaN });
    });

    // weighted NNLS on relative error
    const rows = [], b = [];
    IONS.forEach(function (e) {
      const scale = e.w / Math.max(r.target[e.id], e.floor);
      rows.push(r.salts.map(function (x) { return (x.frac[e.id] || 0) * scale; }));
      b.push((r.target[e.id] - r.water[e.id]) * scale);
    });
    const n = r.salts.length;
    const norms = [];
    for (let j = 0; j < n; j++) {
      let s = 0;
      rows.forEach(function (row) { s += row[j] * row[j]; });
      norms.push(Math.sqrt(s) || 1);
    }
    const A = rows.map(function (row) { return row.map(function (v, j) { return v / norms[j]; }); });
    const y = n && r.sal > 0 && r.sal <= 100 ? nnls(A, b, n) : new Array(n).fill(0);
    r.salts.forEach(function (x, j) { x.mgL = y[j] / norms[j]; x.kgm3 = x.mgL / 1000; });

    r.added = {}; r.total = {};
    IONS.forEach(function (e) {
      r.added[e.id] = r.salts.reduce(function (a, x) { return a + (x.frac[e.id] || 0) * x.mgL; }, 0);
      r.total[e.id] = r.water[e.id] + r.added[e.id];
    });
    r.supplied = {};
    IONS.forEach(function (e) { r.supplied[e.id] = r.salts.some(function (x) { return (x.frac[e.id] || 0) > 0; }); });

    r.used = r.salts.filter(function (x) { return x.mgL > 1e-9; });
    r.totalKgm3 = r.used.reduce(function (a, x) { return a + x.kgm3; }, 0);
    r.missingPrice = r.used.filter(function (x) { return !isFinite(x.priceKg); }).map(function (x) { return x.s.short; });
    r.costM3 = r.missingPrice.length ? NaN : r.used.reduce(function (a, x) { return a + x.kgm3 * x.priceKg; }, 0);
    r.resultSal = ionSum(r.total) / 1000;   // g/L, sum of the seven ions
    r.addedSal = ionSum(r.added) / 1000;    // salinity the salts add (water of crystallisation excluded)
    const cp = raw('comm');
    r.commPrice = cp >= 0 ? CalcUnits.base('comm') : NaN;
    r.commKgm3 = r.addedSal; // commercial salt for the same added salinity, 1 kg per kg (moisture ignored)
    // In correction mode the salts fix ratios rather than add salinity, so a commercial-salt
    // comparison by salinity is not meaningful.
    r.commCostM3 = r.mode === 'correct' ? NaN : r.commKgm3 * r.commPrice;
    r.saving = r.commCostM3 > 0 && isFinite(r.costM3) ? (1 - r.costM3 / r.commCostM3) * 100 : NaN;
    r.hard = r.total.ca * HARD_CA + r.total.mg * HARD_MG;
    r.alkCaCO3 = r.total.alk / ALK_FACTOR;
    return r;
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const msgs = [];
    const correct = r.mode === 'correct';
    $('sal-field').hidden = correct;
    $('sal-auto').hidden = !correct;
    $('sal-auto-v').textContent = r.waterSal > 0 ? fixed(r.waterSal, 2) + ' g/L (sum of the ions you entered)' : 'enter the well-water analysis below';
    $('mg-t-field').hidden = r.mgmode !== 'mg';
    $('mgca-field').hidden = r.mgmode !== 'ratio';
    $('mg-caveat').hidden = r.mgmode === 'sw';
    $('water-hint').textContent = correct
      ? 'Your well-water analysis. The target is seawater at this water\'s own salinity, so the calculator adds only what is missing.'
      : 'From your water report. Leave at 0 for fresh, RO or rain water. These ions count towards the target, so less salt is needed.';
    $('r-main-label').textContent = correct ? 'Salts to add to the well water' : 'Salt mix for the batch';

    if (r.negative) msgs.push('Negative values are treated as zero.');
    if (!(r.vol > 0)) msgs.push('Enter the batch volume to get amounts per batch (amounts per m³ are still shown).');
    if (correct && !(r.waterSal > 0)) msgs.push('Enter your well-water analysis: in "correct my well water" mode the target salinity comes from the ions in the water.');
    if (!correct && !(r.sal > 0)) msgs.push('Enter a target salinity above 0.');
    if (r.sal > 100) msgs.push('A salinity of ' + sig(r.sal) + ' g/L is far above seawater (about 35 g/L); check the value and unit. No amounts are shown above 100 g/L.');
    else if (r.sal > 45) msgs.push('A salinity of ' + fixed(r.sal, 1) + ' g/L is above full-strength seawater (about 35 g/L); check the value and unit.');
    if (!r.salts.length) msgs.push('Tick at least one salt with a purity above 0.');
    if (r.notes.zero) msgs.push('Ignored (purity 0 or empty): ' + r.notes.zero.join(', ') + '.');
    if (r.notes.bad) msgs.push('A purity above 100% was entered and treated as 100%.');
    if (!correct && r.sal > 0 && r.waterSal > r.sal * 1.02) msgs.push('Your source water (' + fixed(r.waterSal, 2) + ' g/L by its ions) is already saltier than the target. Dilute it, raise the target, or use "correct my well water".');
    if (r.mgmode === 'mg' && !(r.target.mg > 0)) msgs.push('Enter the magnesium target, or choose "seawater ratio".');
    if (r.mgmode === 'ratio' && !(r.mgca > 0)) msgs.push('Enter the Mg:Ca ratio, or choose "seawater ratio".');

    const ok = r.sal > 0 && r.sal <= 100 && r.salts.length > 0;
    const unmet = [], short = [], over = [], already = [];
    if (ok) {
      IONS.forEach(function (e) {
        const t = r.target[e.id], tot = r.total[e.id], need = t - r.water[e.id];
        if (t > 0 && need > t * TOL && !r.supplied[e.id]) unmet.push(e.sym);
        else if (t > 0 && tot < t * (1 - TOL)) short.push(e.sym);
        if (r.water[e.id] > t * (1 + TOL) && r.water[e.id] > 0) already.push(e.sym);
        else if (tot > t * (1 + TOL) && tot - t > 1) over.push(e.sym);
      });
      if (unmet.length) msgs.push('None of the ticked salts supply ' + unmet.join(', ') + '. Tick a salt that contains ' + (unmet.length > 1 ? 'them' : 'it') + '.');
      if (short.length) msgs.push('Below target by more than 10%: ' + short.join(', ') + '. The ticked salts cannot supply this without overshooting other ions; tick another salt.');
      if (over.length) msgs.push('Above target by more than 10%: ' + over.join(', ') + ' (a by-product of the ticked salts).');
      if (already.length) msgs.push('Your water already holds more ' + already.join(', ') + ' than the target. Salts cannot remove it; only dilution with lower-mineral water lowers it.');
      // K and Mg against the seawater ratio at the target salinity
      const kLow = r.total.k < r.sw.k * (1 - TOL);
      const mgLow = r.total.mg < r.sw.mg * (1 - TOL);
      if (kLow || mgLow) {
        msgs.push((kLow && mgLow ? 'Potassium and magnesium are' : kLow ? 'Potassium is' : 'Magnesium is') +
          ' more than 10% below the seawater ratio at ' + fixed(r.sal, 2) + ' g/L' +
          (r.mgmode !== 'sw' && mgLow && !kLow ? ', because you set a reduced magnesium target. Read the caveats under the magnesium setting.' :
            '. Inland waters short of K and Mg have given poor shrimp survival and growth in several studies (see Sources).'));
      }
      if (r.mgmode !== 'sw' && r.target.mg > 0 && r.target.mg < r.sw.mg && r.resultSal < r.sal * 0.98) {
        msgs.push('With the reduced magnesium the salts add up to ' + fixed(r.resultSal, 2) + ' g/L instead of ' + fixed(r.sal, 2) + ' g/L.');
      }
      if (r.used.some(function (x) { return x.s.hot; })) msgs.push('Anhydrous calcium chloride gives off a lot of heat as it dissolves. Add it slowly to a large volume of water while stirring, never water onto the dry salt, and wear gloves and eye protection.');
    }
    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    // main result
    const batchKg = r.totalKgm3 * r.vol / 1000;
    $('r-main').textContent = !ok ? '–' : r.vol > 0 ? massOut(batchKg) : massOut(r.totalKgm3) + ' / m³';
    $('r-main-sub').textContent = ok ? r.used.length + ' salt' + (r.used.length === 1 ? '' : 's') + ', ' +
      massOut(r.totalKgm3) + ' per m³' + (isFinite(r.costM3) ? ' · ' + money(r.costM3 * (r.vol > 0 ? r.vol / 1000 : 1)) + (r.vol > 0 ? ' per batch' : ' per m³') : '') : '';

    // salt table
    const tb = $('salt-table');
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    if (ok) {
      r.used.forEach(function (x) {
        addRow(tb, [x.s.short + (x.pct < 100 ? ' (' + sig(x.pct) + '%)' : ''), r.vol > 0 ? massOut(x.kgm3 * r.vol / 1000) : '–', massOut(x.kgm3),
          isFinite(x.priceKg) ? money(x.kgm3 * x.priceKg * (r.vol > 0 ? r.vol / 1000 : 1)) : '–']);
      });
      const unused = r.salts.filter(function (x) { return !(x.mgL > 1e-9); }).map(function (x) { return x.s.short; });
      $('unused').textContent = unused.length ? 'Not needed with this target: ' + unused.join(', ') + '.' : '';
    } else $('unused').textContent = '';
    $('cost-col').textContent = r.vol > 0 ? 'Cost / batch' : 'Cost / m³';

    // results list
    $('r-cost').textContent = ok && isFinite(r.costM3) && r.vol > 0 ? money(r.costM3 * r.vol / 1000) : '–';
    $('r-costm3').textContent = ok ? (isFinite(r.costM3) ? money(r.costM3) : 'enter a price for ' + r.missingPrice.join(', ')) : '–';
    $('r-comm').textContent = ok && isFinite(r.commCostM3) ? massOut(r.commKgm3) + ', ' + money(r.commCostM3) + ' per m³' : ok && correct ? 'not compared when correcting' : ok ? 'enter a price' : '–';
    $('r-save').textContent = ok && isFinite(r.saving) ? (r.saving >= 0 ? fixed(r.saving, 0) + '% cheaper' : fixed(-r.saving, 0) + '% dearer') + ' (' + money(r.commCostM3 - r.costM3) + ' per m³)' : '–';
    $('r-sal').textContent = ok || r.waterSal > 0 ? fixed(r.resultSal, 2) + ' g/L' + (r.waterSal > 0 ? ' (water ' + fixed(r.waterSal, 2) + ')' : '') : '–';
    $('r-hard').textContent = ok || r.waterSal > 0 ? sig(r.hard) + ' mg/L as CaCO₃' : '–';
    $('r-alk').textContent = ok || r.waterSal > 0 ? sig(r.alkCaCO3) + ' mg/L as CaCO₃' : '–';

    // ion table
    const et = $('ion-table');
    while (et.firstChild) et.removeChild(et.firstChild);
    IONS.forEach(function (e) {
      const t = r.target[e.id];
      const cvt = e.id === 'alk' ? 1 / ALK_FACTOR : 1;
      const diff = t > 0 ? (r.total[e.id] - t) / t * 100 : NaN;
      addRow(et, [e.id === 'alk' ? 'Alk (CaCO₃)' : e.sym, conc(r.water[e.id] * cvt), conc(r.added[e.id] * cvt), conc(r.total[e.id] * cvt), t > 0 ? conc(t * cvt) : '–',
        t > 0 && ok ? (Math.abs(diff) < 0.05 ? '0.0' : (diff > 0 ? '+' : '') + fixed(diff, 1)) + '%' : '–'], t > 0 && ok && Math.abs(diff) > TOL * 100 ? 'off' : '');
    });

    // ratio table (mass ratios)
    const rt = $('ratio-table');
    while (rt.firstChild) rt.removeChild(rt.firstChild);
    [['Na', 'K', 'na', 'k'], ['Mg', 'Ca', 'mg', 'ca'], ['Mg', 'K', 'mg', 'k'], ['Na', 'Mg', 'na', 'mg'], ['Ca', 'K', 'ca', 'k']].forEach(function (q) {
      const v = ratio(r.total[q[2]], r.total[q[3]]);
      const s = SEAWATER[q[2]] / SEAWATER[q[3]];
      const dev = isFinite(v) ? Math.abs(v / s - 1) : 0;
      addRow(rt, [q[0] + ':' + q[1], isFinite(v) ? fixed(v, 2) : '–', fixed(s, 2), isFinite(v) ? (v / s * 100 < 99.95 || v / s * 100 > 100.05 ? fixed(v / s * 100, 0) + '%' : '100%') : '–'], dev > 0.2 ? 'off' : '');
    });

    document.querySelectorAll('.cur-pre').forEach(function (e) { e.textContent = sym().trim() || '#'; });

    $('viz-caption').textContent = ok
      ? fixed(r.resultSal, 2) + ' g/L from ' + r.used.length + ' salts' + (isFinite(r.costM3) ? ' · ' + money(r.costM3) + ' per m³' : '') +
        (isFinite(r.saving) ? ' · ' + (r.saving >= 0 ? fixed(r.saving, 0) + '% below' : fixed(-r.saving, 0) + '% above') + ' commercial salt' : '')
      : 'Enter a salinity and tick salts to draw the chart';
    drawViz(r, ok);
    CalcShare.writeParams(getState());
  }

  function addRow(tb, cells, cls) {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    cells.forEach(function (t) { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    tb.appendChild(tr);
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 400;
  function el(name, attrs, txt) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (txt !== undefined) e.textContent = txt;
    svg.appendChild(e);
    return e;
  }
  function text(x, y, t, anchor, extra) {
    const a = { x: x, y: y, 'text-anchor': anchor || 'start', class: 'dim-text' };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return el('text', a, t);
  }

  function drawViz(r, ok) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const x0 = 46, x1 = 270, W = x1 - x0, MAXP = 1.5;
    const sx = function (f) { return x0 + Math.min(Math.max(f, 0), MAXP) / MAXP * W; };
    text(6, 16, 'Each ion: water + added vs target', 'start', { 'font-weight': 600, fill: 'var(--text)' });
    el('rect', { x: 6, y: 25, width: 10, height: 10, rx: 2, fill: 'var(--tank-back)' });
    text(20, 34, 'water');
    el('rect', { x: 70, y: 25, width: 10, height: 10, rx: 2, fill: 'var(--accent)' });
    text(84, 34, 'added');
    el('line', { x1: 136, y1: 24, x2: 136, y2: 36, stroke: 'var(--text)', 'stroke-width': 2 });
    text(142, 34, 'target');
    text(VW - 6, 34, 'mg/L', 'end');

    const top = 44, rh = 21;
    IONS.forEach(function (e, i) {
      const y = top + i * rh;
      const t = r.target[e.id];
      const cvt = e.id === 'alk' ? 1 / ALK_FACTOR : 1;
      text(x0 - 6, y + 14, e.sym, 'end', { fill: 'var(--text)' });
      el('rect', { x: x0, y: y + 3, width: W, height: rh - 6, rx: 3, fill: 'var(--surface-2)' });
      if (t > 0) {
        const fw = r.water[e.id] / t, fa = r.added[e.id] / t;
        const xw = sx(fw), xa = sx(fw + fa);
        if (xw > x0) el('rect', { x: x0, y: y + 3, width: xw - x0, height: rh - 6, fill: 'var(--tank-back)' });
        if (xa > xw) el('rect', { x: xw, y: y + 3, width: xa - xw, height: rh - 6, fill: 'var(--accent)' });
        if (fw + fa > MAXP) text(x1 - 4, y + 14, '▸', 'end', { fill: '#fff' });
        const off = ok && Math.abs(fw + fa - 1) > TOL;
        text(VW - 6, y + 14, conc(r.total[e.id] * cvt) + ' / ' + conc(t * cvt), 'end', off ? { fill: 'var(--warn-text)', 'font-weight': 700 } : undefined);
      } else {
        text(x0 + 6, y + 14, 'no target', 'start');
      }
    });
    const yEnd = top + IONS.length * rh;
    el('line', { x1: sx(1), y1: top, x2: sx(1), y2: yEnd + 2, stroke: 'var(--text)', 'stroke-width': 2 });
    [0, 0.5, 1, 1.5].forEach(function (f) {
      el('path', { class: 'dim', d: 'M' + sx(f) + ',' + (yEnd + 2) + ' v4' });
      text(sx(f), yEnd + 17, fixed(f * 100, 0) + '%', 'middle');
    });
    text(VW - 6, yEnd + 17, 'Alk as CaCO₃', 'end');

    // salt mass per m3
    const used = ok ? r.used : [];
    let y = yEnd + 44;
    text(6, y, 'Salt per m³ of water', 'start', { 'font-weight': 600, fill: 'var(--text)' });
    text(VW - 6, y, ok ? massOut(r.totalKgm3) : '', 'end');
    const bw = VW - 12, bh = 24;
    let by = y + 8;
    el('rect', { x: 6, y: by, width: bw, height: bh, rx: 6, fill: 'var(--surface-2)' });
    let x = 6;
    used.forEach(function (u, i) {
      const w = u.kgm3 / r.totalKgm3 * bw;
      el('rect', { x: x, y: by, width: Math.max(w, 0), height: bh, fill: COLORS[SALTS.indexOf(u.s) % COLORS.length], stroke: 'var(--surface)', 'stroke-width': 1 });
      if (w > 22) el('text', { x: x + w / 2, y: by + 16, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, 'font-weight': 700, 'font-family': 'var(--font)' }, String(i + 1));
      x += w;
    });
    used.forEach(function (u, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const lx = 6 + col * 198, ly = by + bh + 18 + row * 18;
      el('rect', { x: lx, y: ly - 10, width: 10, height: 10, rx: 2, fill: COLORS[SALTS.indexOf(u.s) % COLORS.length] });
      text(lx + 14, ly, (i + 1) + ' ' + u.s.short + ' ' + massOut(u.kgm3));
    });
    y = by + bh + 18 + Math.ceil(used.length / 2) * 18 + 22;

    // cost per m3: mix vs commercial
    const showCost = ok && (isFinite(r.costM3) || isFinite(r.commCostM3));
    if (showCost) {
      text(6, y, 'Salt cost per m³', 'start', { 'font-weight': 600, fill: 'var(--text)' });
      const maxC = Math.max(isFinite(r.costM3) ? r.costM3 : 0, isFinite(r.commCostM3) ? r.commCostM3 : 0) || 1;
      const cx0 = 92, cw = VW - 6 - cx0 - 70;
      by = y + 10;
      text(cx0 - 6, by + 15, 'This mix', 'end', { fill: 'var(--text)' });
      el('rect', { x: cx0, y: by, width: cw, height: 20, rx: 4, fill: 'var(--surface-2)' });
      if (isFinite(r.costM3)) {
        let cx = cx0;
        used.forEach(function (u) {
          const w = u.kgm3 * u.priceKg / maxC * cw;
          if (w > 0) el('rect', { x: cx, y: by, width: w, height: 20, fill: COLORS[SALTS.indexOf(u.s) % COLORS.length], stroke: 'var(--surface)', 'stroke-width': 1 });
          cx += w;
        });
        text(VW - 6, by + 15, money(r.costM3), 'end', { fill: 'var(--text)', 'font-weight': 600 });
      } else text(VW - 6, by + 15, 'no price', 'end');
      by += 28;
      text(cx0 - 6, by + 15, 'Commercial', 'end', { fill: 'var(--text)' });
      el('rect', { x: cx0, y: by, width: cw, height: 20, rx: 4, fill: 'var(--surface-2)' });
      if (isFinite(r.commCostM3)) {
        el('rect', { x: cx0, y: by, width: r.commCostM3 / maxC * cw, height: 20, rx: 4, fill: 'var(--tank-back)' });
        text(VW - 6, by + 15, money(r.commCostM3), 'end', { fill: 'var(--text)', 'font-weight': 600 });
      } else text(VW - 6, by + 15, r.mode === 'correct' ? 'n/a' : 'no price', 'end');
      y = by + 20 + 22;
      text(6, y, 'Example prices: enter your own.', 'start');
      y += 8;
    }
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + Math.max(y, 200));
  }

  // ---------- State ----------
  const UNIT_INPUTS = ['sal', 'vol', 'mg_t', 'alk_t', 'comm'].concat(WATER_IDS.map(function (id) { return 'w_' + id; }));
  const PLAIN_INPUTS = ['mgca'];
  const SELECTS = ['mode', 'mgmode', 'alk', 'cur', 'mout'];
  function v(id) { return $(id).value === '' ? 'none' : $(id).value; } // keep deliberate blanks in links
  function getState() {
    const st = {};
    SELECTS.forEach(function (id) { st[id] = $(id).value; });
    UNIT_INPUTS.forEach(function (id) { st[id] = v(id); st[id + '_u'] = CalcUnits.unit(id); });
    PLAIN_INPUTS.forEach(function (id) { st[id] = v(id); });
    SALTS.forEach(function (s) {
      st['use_' + s.key] = $('use_' + s.key).checked ? 1 : 0;
      st['pct_' + s.key] = v('pct_' + s.key);
      st['price_' + s.key] = v('price_' + s.key);
      st['price_' + s.key + '_u'] = CalcUnits.unit('price_' + s.key);
    });
    return st;
  }
  function applyDefaults() {
    $('mode').value = DEFAULTS.mode; $('mgmode').value = DEFAULTS.mgmode; $('alk').value = DEFAULTS.alk;
    $('cur').value = DEFAULTS.cur;
    $('mout').value = DEFAULTS.mout; $('mout').dataset.prev = DEFAULTS.mout;
    ['sal', 'vol', 'mg_t', 'alk_t', 'comm'].forEach(function (id) { CalcUnits.set(id, DEFAULTS[id], DEFAULTS[id + '_u']); });
    $('mgca').value = DEFAULTS.mgca;
    WATER_IDS.forEach(function (id) { CalcUnits.set('w_' + id, 0, 'mgL'); });
    SALTS.forEach(function (s) {
      $('use_' + s.key).checked = DEFAULT_USE.indexOf(s.key) >= 0;
      $('pct_' + s.key).value = s.pct;
      CalcUnits.set('price_' + s.key, s.price, 'kg');
    });
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Low-Cost Sea Salt Mix Calculator'];
    lines.push('Mode: ' + (r.mode === 'correct' ? 'correct well water at its own salinity' : 'make up to a target salinity'));
    lines.push('Target salinity: ' + fixed(r.sal, 2) + ' g/L · Batch: ' + typed('vol'));
    lines.push('Magnesium: ' + (r.mgmode === 'sw' ? 'seawater ratio' : r.mgmode === 'mg' ? 'set to ' + conc(r.target.mg) + ' mg/L' : 'Mg:Ca ' + $('mgca').value));
    const w = WATER_IDS.filter(function (id) { return r.water[id] > 0; });
    if (w.length) lines.push('Source water (mg/L): ' + w.map(function (id) { return (id === 'alk' ? 'Alk as CaCO3' : ION[id].sym) + ' ' + conc(id === 'alk' ? r.water[id] / ALK_FACTOR : r.water[id]); }).join(', '));
    lines.push('Salts:');
    r.used.forEach(function (x) {
      lines.push('  ' + x.s.name + ' (' + sig(x.pct) + '% pure): ' + (r.vol > 0 ? massOut(x.kgm3 * r.vol / 1000) + ' per batch, ' : '') + massOut(x.kgm3) + ' per m³');
    });
    if (r.vol > 0) lines.push('Total: ' + massOut(r.totalKgm3 * r.vol / 1000) + ' per batch');
    if (isFinite(r.costM3)) lines.push('Cost: ' + money(r.costM3) + ' per m³' + (r.vol > 0 ? ', ' + money(r.costM3 * r.vol / 1000) + ' per batch' : '') + ' (prices as entered)');
    if (isFinite(r.saving)) lines.push('Commercial salt for the same salinity: ' + money(r.commCostM3) + ' per m³; difference ' + fixed(r.saving, 0) + '%');
    lines.push('Result vs target (mg/L):');
    IONS.forEach(function (e) {
      const c = e.id === 'alk' ? 1 / ALK_FACTOR : 1;
      lines.push('  ' + (e.id === 'alk' ? 'Alkalinity as CaCO3' : e.sym) + ': ' + conc(r.total[e.id] * c) + ' / ' + conc(r.target[e.id] * c));
    });
    lines.push('Estimated salinity (sum of ions): ' + fixed(r.resultSal, 2) + ' g/L');
    lines.push('Check purity and hydrate on each bag; verify with a refractometer or conductivity meter and a lab ion analysis.');
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  buildSaltList();
  CURRENCIES.forEach(function (c) {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.label;
    $('cur').appendChild(o);
  });
  document.querySelectorAll('.calc-layout input').forEach(function (i) {
    i.addEventListener('input', render);
    if (i.type === 'checkbox') i.addEventListener('change', render);
  });
  ['mode', 'mgmode', 'alk', 'cur'].forEach(function (id) { $(id).addEventListener('change', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Low-Cost Sea Salt Mix Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    applyDefaults();
    const p = CalcShare.readParams();
    function okOpt(sel, v) { return v !== undefined && Array.prototype.some.call(sel.options, function (o) { return o.value === v; }); }
    SELECTS.forEach(function (id) { if (okOpt($(id), p[id])) { $(id).value = p[id]; if (id === 'mout') $(id).dataset.prev = p[id]; } });
    function setUnitInput(id) {
      const u = p[id + '_u'];
      const sel = document.querySelector('select[data-unit-for="' + id + '"]');
      const uOk = sel && okOpt(sel, u) ? u : undefined;
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) CalcUnits.set(id, p[id], uOk);
      else if (p[id] === 'none') CalcUnits.set(id, '', uOk);
      else if (uOk) CalcUnits.set(id, $(id).value, uOk);
    }
    UNIT_INPUTS.forEach(setUnitInput);
    PLAIN_INPUTS.forEach(function (id) {
      if (p[id] === 'none') $(id).value = '';
      else if (p[id] !== undefined && isFinite(parseFloat(p[id]))) $(id).value = p[id];
    });
    SALTS.forEach(function (s) {
      if (p['use_' + s.key] === '1' || p['use_' + s.key] === '0') $('use_' + s.key).checked = p['use_' + s.key] === '1';
      if (p['pct_' + s.key] === 'none') $('pct_' + s.key).value = '';
      else if (p['pct_' + s.key] !== undefined && isFinite(parseFloat(p['pct_' + s.key]))) $('pct_' + s.key).value = p['pct_' + s.key];
      setUnitInput('price_' + s.key);
    });
    render();
  })();
})();
