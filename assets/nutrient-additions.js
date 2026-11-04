// Hydroponic Nutrient Additions Calculator: fertilizer salts for a target recipe,
// source water / current solution subtracted, non-negative least-squares solver,
// A/B stock split, EC estimate (Nutrient EC method), live SVG bars, shareable URL state.
(function () {
  'use strict';

  // ---------- Constants ----------
  // IUPAC 2021 standard atomic weights (abridged), Prohaska et al. 2022.
  const AW = { H: 1.008, B: 10.81, N: 14.007, O: 15.999, Na: 22.990, Mg: 24.305, P: 30.974, S: 32.06,
    Cl: 35.45, K: 39.098, Ca: 40.078, Mn: 54.938, Fe: 55.845, Cu: 63.546, Zn: 65.38, Mo: 95.95 };
  const H2O = { H: 2, O: 1 };
  function molar(comp) {
    return Object.keys(comp).reduce(function (s, k) { return s + AW[k] * comp[k]; }, 0);
  }
  function plus(a, b, nb) {
    const out = {};
    Object.keys(a).forEach(function (k) { out[k] = (out[k] || 0) + a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = (out[k] || 0) + b[k] * nb; });
    return out;
  }
  // Mass of one "element unit" as reported (NO3-N and NH4-N as N, P as P, S as S ...).
  const ELMASS = { no3: AW.N, nh4: AW.N, p: AW.P, k: AW.K, ca: AW.Ca, mg: AW.Mg, s: AW.S,
    fe: AW.Fe, mn: AW.Mn, zn: AW.Zn, cu: AW.Cu, b: AW.B, mo: AW.Mo, na: AW.Na, cl: AW.Cl };

  // Elements that have targets. w = solver weight on the relative error, floor = smallest
  // concentration (mg/L) used to scale the error so a zero target still has a scale.
  const EL = [
    { id: 'no3', sym: 'NO₃-N', name: 'Nitrate-N', w: 1, floor: 5 },
    { id: 'nh4', sym: 'NH₄-N', name: 'Ammonium-N', w: 0.5, floor: 5 },
    { id: 'p', sym: 'P', name: 'Phosphorus', w: 1, floor: 5 },
    { id: 'k', sym: 'K', name: 'Potassium', w: 1, floor: 5 },
    { id: 'ca', sym: 'Ca', name: 'Calcium', w: 1, floor: 5 },
    { id: 'mg', sym: 'Mg', name: 'Magnesium', w: 1, floor: 5 },
    { id: 's', sym: 'S', name: 'Sulfur', w: 0.7, floor: 5 },
    { id: 'fe', sym: 'Fe', name: 'Iron', w: 1, floor: 0.01, micro: true },
    { id: 'mn', sym: 'Mn', name: 'Manganese', w: 1, floor: 0.01, micro: true },
    { id: 'zn', sym: 'Zn', name: 'Zinc', w: 1, floor: 0.01, micro: true },
    { id: 'cu', sym: 'Cu', name: 'Copper', w: 1, floor: 0.01, micro: true },
    { id: 'b', sym: 'B', name: 'Boron', w: 1, floor: 0.01, micro: true },
    { id: 'mo', sym: 'Mo', name: 'Molybdenum', w: 1, floor: 0.01, micro: true }
  ];
  // Unwanted ions: no target, a small penalty so the solver prefers salts without them.
  const EXTRA = [
    { id: 'na', sym: 'Na', name: 'Sodium', w: 0.3, scale: 100 },
    { id: 'cl', sym: 'Cl', name: 'Chloride', w: 0.3, scale: 100 }
  ];
  const WATER_IDS = EL.map(function (e) { return e.id; }).concat(['na', 'cl', 'hco3']);
  // 1 mg/L alkalinity as CaCO3 = 2 × 61.017 / 100.086 mg/L HCO3 (1.2193).
  const MW_HCO3 = AW.H + 12.011 + 3 * AW.O;
  const MW_CACO3 = AW.Ca + 12.011 + 3 * AW.O;
  const ALK_FACTOR = 2 * MW_HCO3 / MW_CACO3;

  // Oxide → element factors from the same atomic weights.
  const OX = {
    p: 2 * AW.P / (2 * AW.P + 5 * AW.O),      // P2O5 → P  0.4364
    k: 2 * AW.K / (2 * AW.K + AW.O),          // K2O  → K  0.8301
    ca: AW.Ca / (AW.Ca + AW.O),               // CaO  → Ca 0.7147
    mg: AW.Mg / (AW.Mg + AW.O),               // MgO  → Mg 0.6030
    s: AW.S / (AW.S + 3 * AW.O)               // SO3  → S  0.4005
  };

  // Fertilizer salts. comp = formula for the molar mass, el = moles of each reported
  // element per mole of salt. tank = suggested A/B stock tank.
  function salt(key, name, formula, comp, el, tank, extra) {
    const mw = molar(comp);
    const frac = {};
    Object.keys(el).forEach(function (k) { frac[k] = el[k] * ELMASS[k] / mw; });
    return Object.assign({ key: key, name: name, formula: formula, mw: mw, frac: frac, tank: tank, kind: 'pure', pct: 100 }, extra || {});
  }
  const SALTS = [
    salt('cn4', 'Calcium nitrate tetrahydrate', 'Ca(NO₃)₂·4H₂O', plus({ Ca: 1, N: 2, O: 6 }, H2O, 4), { ca: 1, no3: 2 }, 'A'),
    { key: 'cnc', name: 'Calcium nitrate, commercial grade', formula: 'label analysis', tank: 'A', kind: 'label' },
    salt('kno3', 'Potassium nitrate', 'KNO₃', { K: 1, N: 1, O: 3 }, { k: 1, no3: 1 }, 'B'),
    salt('mkp', 'Monopotassium phosphate (MKP)', 'KH₂PO₄', { K: 1, H: 2, P: 1, O: 4 }, { k: 1, p: 1 }, 'B'),
    salt('map', 'Monoammonium phosphate (MAP)', 'NH₄H₂PO₄', { N: 1, H: 6, P: 1, O: 4 }, { nh4: 1, p: 1 }, 'B'),
    salt('mgs', 'Magnesium sulfate heptahydrate', 'MgSO₄·7H₂O', plus({ Mg: 1, S: 1, O: 4 }, H2O, 7), { mg: 1, s: 1 }, 'B'),
    salt('sop', 'Potassium sulfate', 'K₂SO₄', { K: 2, S: 1, O: 4 }, { k: 2, s: 1 }, 'B'),
    salt('mgn', 'Magnesium nitrate hexahydrate', 'Mg(NO₃)₂·6H₂O', plus({ Mg: 1, N: 2, O: 6 }, H2O, 6), { mg: 1, no3: 2 }, 'A'),
    salt('an', 'Ammonium nitrate', 'NH₄NO₃', { N: 2, H: 4, O: 3 }, { nh4: 1, no3: 1 }, 'A'),
    salt('kcl', 'Potassium chloride', 'KCl', { K: 1, Cl: 1 }, { k: 1, cl: 1 }, 'B'),
    { key: 'fedtpa', name: 'Iron chelate Fe-DTPA', formula: 'typ. 11% Fe, check label', tank: 'A', kind: 'fe', pct: 11, frac: { fe: 1 } },
    { key: 'feeddha', name: 'Iron chelate Fe-EDDHA', formula: 'typ. 6% Fe, check label', tank: 'A', kind: 'fe', pct: 6, frac: { fe: 1 } },
    { key: 'feedta', name: 'Iron chelate Fe-EDTA', formula: 'typ. 13% Fe, check label', tank: 'A', kind: 'fe', pct: 13, frac: { fe: 1 } },
    salt('ba', 'Boric acid', 'H₃BO₃', { H: 3, B: 1, O: 3 }, { b: 1 }, 'B'),
    salt('mns', 'Manganese sulfate monohydrate', 'MnSO₄·H₂O', plus({ Mn: 1, S: 1, O: 4 }, H2O, 1), { mn: 1, s: 1 }, 'B'),
    salt('mncl', 'Manganese chloride tetrahydrate', 'MnCl₂·4H₂O', plus({ Mn: 1, Cl: 2 }, H2O, 4), { mn: 1, cl: 2 }, 'B'),
    salt('zns', 'Zinc sulfate heptahydrate', 'ZnSO₄·7H₂O', plus({ Zn: 1, S: 1, O: 4 }, H2O, 7), { zn: 1, s: 1 }, 'B'),
    salt('cus', 'Copper sulfate pentahydrate', 'CuSO₄·5H₂O', plus({ Cu: 1, S: 1, O: 4 }, H2O, 5), { cu: 1, s: 1 }, 'B'),
    salt('namo', 'Sodium molybdate dihydrate', 'Na₂MoO₄·2H₂O', plus({ Na: 2, Mo: 1, O: 4 }, H2O, 2), { na: 2, mo: 1 }, 'B'),
    { key: 'cf', name: 'Custom fertilizer', formula: 'from label analysis', tank: 'A', kind: 'custom' }
  ];
  const SALT = {};
  SALTS.forEach(function (s) { SALT[s.key] = s; });
  const COLORS = ['#2fa37a', '#3b82c4', '#e08a2e', '#d46a9a', '#8a6fd1', '#93b024', '#d1b02a', '#4cb8c4', '#b07a52', '#c0504d', '#8c99a6', '#5b8c5a'];

  // Presets, mg/L. Hoagland & Arnon (1950) No. 2 exactly as the Nutrient EC page.
  // No. 1: 1 mM KH2PO4, 5 mM KNO3, 5 mM Ca(NO3)2, 2 mM MgSO4 + the same micronutrients.
  const MICRO = { fe: 1, mn: 0.5, zn: 0.05, cu: 0.02, b: 0.5, mo: 0.01 };
  const PRESETS = {
    hoagland2: Object.assign({ no3: 196.1, nh4: 14.0, p: 31.0, k: 234.6, ca: 160.3, mg: 48.6, s: 64.1 }, MICRO),
    half2: { no3: 98.05, nh4: 7.0, p: 15.5, k: 117.3, ca: 80.15, mg: 24.3, s: 32.05, fe: 1, mn: 0.25, zn: 0.025, cu: 0.01, b: 0.25, mo: 0.005 },
    hoagland1: Object.assign({ no3: 210.1, nh4: 0, p: 31.0, k: 234.6, ca: 200.4, mg: 48.6, s: 64.1 }, MICRO)
  };
  const DEFAULT_PRESET = 'hoagland2';
  const DEFAULT_USE = ['cn4', 'kno3', 'map', 'mgs', 'fedtpa', 'ba', 'mncl', 'zns', 'cus', 'namo'];

  // Nutrient EC constants (nutrient-ec.js): λ° S·cm²/mol, mass the ion is reported as, charge.
  const EC_IONS = [
    { id: 'no3', mw: 14.007, lambda: 71.4, z: -1 }, { id: 'nh4', mw: 14.007, lambda: 74.4, z: 1 },
    { id: 'p', mw: 30.97, lambda: 31.8, z: -1 }, { id: 'k', mw: 39.10, lambda: 73.6, z: 1 },
    { id: 'ca', mw: 40.08, lambda: 119.1, z: 2 }, { id: 'mg', mw: 24.31, lambda: 105.1, z: 2 },
    { id: 's', mw: 32.06, lambda: 160.7, z: -2 }, { id: 'na', mw: 22.99, lambda: 50.0, z: 1 },
    { id: 'cl', mw: 35.45, lambda: 76.2, z: -1 }, { id: 'hco3', mw: 61.02, lambda: 44.3, z: -1 },
    { id: 'mn', mw: 54.94, lambda: 103.4, z: 2 }, { id: 'zn', mw: 65.38, lambda: 107.4, z: 2 },
    { id: 'cu', mw: 63.55, lambda: 110.1, z: 2 }, { id: 'mo', mw: 95.96, lambda: 298.0, z: -2 },
    { id: 'fe', mw: 55.85, lambda: 0, z: 0 }, { id: 'b', mw: 10.81, lambda: 0, z: 0 }
  ];
  const EC_CORRECTION = 0.90;
  const L_PER_GAL = 3.785411784;
  const TOL = 0.10; // ±10 % display band for "on target" (rule of thumb, not a standard)

  const DEFAULTS = {
    mode: 'new', preset: DEFAULT_PRESET, vol: 100, vol_u: 'L', alk: 'hco3', mout: 'g',
    cn_no3: 14.4, cn_nh4: 1.1, cn_ca: 19,
    cf_no3: 0, cf_nh4: 0, cf_p2o5: 0, cf_k2o: 0, cf_ca: 0, cf_mg: 0, cf_s: 0, cf_ox: 'el',
    dil: 100, sv: 10, sv_u: 'L'
  };

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');

  // ---------- Salt list UI ----------
  function analysisText(s) {
    if (s.kind === 'pure') {
      return s.formula + ' · M ' + fixed(s.mw, 2) + ' · ' + Object.keys(s.frac).map(function (k) {
        return symOf(k) + ' ' + fixed(s.frac[k] * 100, 1) + '%';
      }).join(', ');
    }
    return s.formula;
  }
  function symOf(k) {
    const e = EL.filter(function (x) { return x.id === k; })[0] || EXTRA.filter(function (x) { return x.id === k; })[0];
    return e ? e.sym : k;
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
      if (s.kind === 'pure' || s.kind === 'fe') {
        const ir = document.createElement('div');
        ir.className = 'input-row salt-pct';
        const inp = document.createElement('input');
        inp.type = 'number'; inp.id = 'pct_' + s.key; inp.min = '0'; inp.max = '100'; inp.step = 'any';
        inp.setAttribute('inputmode', 'decimal');
        inp.setAttribute('aria-label', s.name + (s.kind === 'fe' ? ' iron content' : ' purity'));
        const u = document.createElement('span');
        u.className = 'unit';
        u.textContent = s.kind === 'fe' ? '% Fe' : '% pure';
        ir.appendChild(inp); ir.appendChild(u);
        row.appendChild(ir);
      }
      box.appendChild(row);
      if (s.key === 'cnc') box.appendChild($('cn-box'));
      if (s.key === 'cf') box.appendChild($('cf-box'));
    });
  }

  // ---------- Formatting ----------
  function fixed(n, d) {
    return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
  }
  function sig(n) {
    if (!isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a === 0) return '0';
    if (a >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return n.toLocaleString(undefined, { maximumSignificantDigits: 4 });
  }
  function conc(n) { // mg/L for tables
    if (!isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a === 0) return '0';
    if (a >= 100) return fixed(n, 1);
    if (a >= 1) return fixed(n, 2);
    return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
  }
  function num(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function massOut(gramsVal) {
    const u = $('mout').value || 'g';
    const v = CalcUnits.convert('mass', gramsVal / 1000, 'kg', u);
    return sig(v) + ' ' + CalcUnits.label('mass', u);
  }

  // ---------- Solver: Lawson–Hanson non-negative least squares ----------
  // Minimises ||A x − b||² subject to x ≥ 0. A is m×n (array of rows). Deterministic.
  function solveSym(M, v) { // Gaussian elimination with partial pivoting
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
  function lsq(A, b, cols) { // unconstrained LS on a subset of columns, tiny ridge for collinear salts
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

  // ---------- Inputs ----------
  function saltFractions(s, notes) {
    // returns element mass fractions of the product as used (purity / analysis applied)
    const out = {};
    if (s.kind === 'pure' || s.kind === 'fe') {
      let p = num('pct_' + s.key);
      if (!(p > 0)) return null;
      if (p > 100) { notes.bad = true; p = 100; }
      Object.keys(s.frac).forEach(function (k) { out[k] = s.frac[k] * p / 100; });
      return out;
    }
    if (s.kind === 'label') {
      const no3 = Math.max(0, num('cn_no3') || 0), nh4 = Math.max(0, num('cn_nh4') || 0), ca = Math.max(0, num('cn_ca') || 0);
      if (no3 + nh4 + ca > 100) notes.bad = true;
      if (no3 + nh4 + ca <= 0) return null;
      out.no3 = no3 / 100; out.nh4 = nh4 / 100; out.ca = ca / 100;
      return out;
    }
    // custom fertilizer
    const ox = $('cf_ox').value === 'ox';
    const v = function (id) { return Math.max(0, num(id) || 0) / 100; };
    out.no3 = v('cf_no3'); out.nh4 = v('cf_nh4');
    out.p = v('cf_p2o5') * OX.p; out.k = v('cf_k2o') * OX.k;
    out.ca = v('cf_ca') * (ox ? OX.ca : 1); out.mg = v('cf_mg') * (ox ? OX.mg : 1); out.s = v('cf_s') * (ox ? OX.s : 1);
    const tot = Object.keys(out).reduce(function (a, k) { return a + out[k]; }, 0);
    if (tot > 1) notes.bad = true;
    if (tot <= 0) return null;
    return out;
  }

  function readWater() {
    const w = {};
    WATER_IDS.forEach(function (id) { w[id] = CalcUnits.base('w_' + id); });
    if ($('alk').value === 'caco3') w.hco3 *= ALK_FACTOR;
    return w;
  }

  function compute() {
    const r = { msgs: [], notes: {} };
    let negative = false;
    document.querySelectorAll('input[type=number]').forEach(function (i) { if (parseFloat(i.value) < 0) negative = true; });
    if (negative) r.msgs.push('Negative values are treated as zero.');
    r.vol = CalcUnits.base('vol'); // L
    r.target = {};
    EL.forEach(function (e) { r.target[e.id] = CalcUnits.base('t_' + e.id); });
    r.water = readWater();
    r.mode = $('mode').value;

    // selected salts with usable analyses
    r.salts = [];
    SALTS.forEach(function (s) {
      if (!$('use_' + s.key).checked) return;
      const fr = saltFractions(s, r.notes);
      if (!fr) { r.notes.zero = (r.notes.zero || []).concat([s.name]); return; }
      r.salts.push({ s: s, frac: fr });
    });

    // build weighted system
    const rows = [], b = [];
    EL.forEach(function (e) {
      const scale = e.w / Math.max(r.target[e.id], e.floor);
      rows.push(r.salts.map(function (x) { return (x.frac[e.id] || 0) * scale; }));
      b.push((r.target[e.id] - r.water[e.id]) * scale);
    });
    EXTRA.forEach(function (e) {
      const scale = e.w / e.scale;
      rows.push(r.salts.map(function (x) { return (x.frac[e.id] || 0) * scale; }));
      b.push(0);
    });
    const n = r.salts.length;
    // normalise columns for conditioning
    const norms = [];
    for (let j = 0; j < n; j++) {
      let s = 0;
      rows.forEach(function (row) { s += row[j] * row[j]; });
      norms.push(Math.sqrt(s) || 1);
    }
    const A = rows.map(function (row) { return row.map(function (v, j) { return v / norms[j]; }); });
    const y = n ? nnls(A, b, n) : [];
    r.salts.forEach(function (x, j) { x.mgL = y[j] / norms[j]; });

    // resulting concentrations
    r.added = {}; r.total = {};
    EL.concat(EXTRA).forEach(function (e) {
      r.added[e.id] = r.salts.reduce(function (a, x) { return a + (x.frac[e.id] || 0) * x.mgL; }, 0);
      r.total[e.id] = r.water[e.id] + r.added[e.id];
    });
    r.total.hco3 = r.water.hco3;
    r.supplied = {};
    EL.concat(EXTRA).forEach(function (e) {
      r.supplied[e.id] = r.salts.some(function (x) { return (x.frac[e.id] || 0) > 0; });
    });

    // EC (Nutrient EC method)
    let theo = 0, cat = 0, an = 0;
    EC_IONS.forEach(function (ion) {
      const mmol = (r.total[ion.id] || 0) / ion.mw;
      theo += ion.lambda * mmol / 1000;
      if (ion.z > 0) cat += mmol * ion.z; else if (ion.z < 0) an += mmol * -ion.z;
    });
    r.ecTheo = theo; r.ec = theo * EC_CORRECTION; r.cat = cat; r.an = an;
    r.ecWater = EC_IONS.reduce(function (a, ion) { return a + ion.lambda * (r.water[ion.id] || 0) / ion.mw / 1000; }, 0) * EC_CORRECTION;
    r.totalMgL = r.salts.reduce(function (a, x) { return a + x.mgL; }, 0);
    return r;
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const msgs = r.msgs.slice();
    const anyTarget = EL.some(function (e) { return r.target[e.id] > 0; });
    const topup = r.mode === 'topup';
    $('water-head').textContent = topup ? 'Current solution (lab test or meter)' : 'Source water analysis';
    $('water-hint').textContent = topup
      ? 'Enter what the solution in the tank contains now, after topping it up with water to the batch volume. The calculator adds only what is missing.'
      : 'From your water report. Leave at 0 for RO, rain or distilled water. These ions are already in the water, so less fertilizer is needed.';
    $('r-main-label').textContent = topup ? 'Fertilizer to add to the tank' : 'Fertilizer for the batch';

    if (!(r.vol > 0)) msgs.push('Enter the batch volume to get grams per batch (doses per 100 L and per 100 US gal are still shown).');
    if (!anyTarget) msgs.push('Enter at least one target concentration or pick a recipe.');
    if (!r.salts.length) msgs.push('Tick at least one fertilizer salt with a purity or analysis above 0.');
    if (r.notes.zero) msgs.push('Ignored (purity or analysis is 0 or empty): ' + r.notes.zero.join(', ') + '.');
    if (r.notes.bad) msgs.push('A purity above 100% or a label analysis adding up to more than 100% was entered; check the numbers.');

    // per-element status
    const unmet = [], short = [], over = [], already = [];
    EL.forEach(function (e) {
      const t = r.target[e.id], tot = r.total[e.id], need = t - r.water[e.id];
      if (t > 0 && need > 0 && !r.supplied[e.id]) unmet.push(e.sym);
      else if (t > 0 && tot < t * (1 - TOL)) short.push(e.sym);
      if (r.water[e.id] > t * (1 + TOL) && r.water[e.id] > 0) already.push(e.sym);
      else if (tot > Math.max(t * (1 + TOL), t + (e.micro ? 0.005 : 1))) over.push(e.sym);
    });
    if (anyTarget && r.salts.length) {
      if (unmet.length) msgs.push('None of the ticked products supply ' + unmet.join(', ') + '. Tick a salt that contains ' + (unmet.length > 1 ? 'them' : 'it') + '.');
      if (short.length) msgs.push('Below target by more than 10%: ' + short.join(', ') + '. The ticked salts cannot supply this without overshooting other elements; tick another salt.');
      if (over.length) msgs.push('Above target by more than 10%: ' + over.join(', ') + ' (an unavoidable by-product of the ticked salts).');
    }
    if (already.length) msgs.push((topup ? 'The solution' : 'Your water') + ' already holds more ' + already.join(', ') + ' than the target. Nothing is added for ' + (already.length > 1 ? 'these' : 'it') + '.' +
      (topup ? ' Dilute with fresh water or replace the solution if this keeps building up.' : ''));
    if (r.added.cl > 0.05) msgs.push('The ticked salts add ' + conc(r.added.cl) + ' mg/L chloride. Chloride is needed only in traces and builds up in recirculating systems; avoid potassium chloride for chloride-sensitive crops.');
    if (r.added.na > 0.05) msgs.push('The ticked salts add ' + conc(r.added.na) + ' mg/L sodium, which plants hardly use and which builds up in recirculating systems.');
    const cf = r.salts.filter(function (x) { return x.s.key === 'cf'; })[0];
    if (cf && cf.frac.ca > 0 && (cf.frac.p > 0 || cf.frac.s > 0) && cf.mgL > 0) msgs.push('The custom fertilizer contains calcium together with phosphate or sulfate, so it cannot be kept safely in either concentrated stock tank. Dissolve it in the final solution.');
    if (r.ec > 5) msgs.push('The estimated EC is above 5 mS/cm, too strong for most crops; check the targets and units.');
    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const ok = anyTarget && r.salts.length > 0;
    const used = r.salts.filter(function (x) { return x.mgL > 1e-9; });
    const totalG = r.totalMgL * r.vol / 1000;
    $('r-main').textContent = !ok ? '–' : r.vol > 0 ? massOut(totalG) : sig(r.totalMgL / 10) + ' g / 100 L';
    $('r-main-sub').textContent = ok ? used.length + ' product' + (used.length === 1 ? '' : 's') + ', ' + sig(r.totalMgL) + ' mg/L in total' : '';

    // salt table
    const tb = $('salt-table');
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    if (ok) {
      r.salts.forEach(function (x) {
        if (!(x.mgL > 1e-9)) return;
        addRow(tb, [x.s.name, x.s.tank, r.vol > 0 ? massOut(x.mgL * r.vol / 1000) : '–', massOut(x.mgL * 100 / 1000), massOut(x.mgL * 100 * L_PER_GAL / 1000)]);
      });
      const unused = r.salts.filter(function (x) { return !(x.mgL > 1e-9); }).map(function (x) { return x.s.name; });
      $('unused').textContent = unused.length ? 'Not needed with these targets: ' + unused.join(', ') + '.' : '';
    } else $('unused').textContent = '';

    // element table
    const et = $('el-table');
    while (et.firstChild) et.removeChild(et.firstChild);
    EL.concat(EXTRA).forEach(function (e) {
      const t = r.target[e.id];
      if (!(t > 0) && !(r.total[e.id] > 0)) return;
      const diff = t > 0 ? (r.total[e.id] - t) / t * 100 : NaN;
      addRow(et, [e.sym, conc(r.water[e.id]), conc(r.added[e.id]), conc(r.total[e.id]), t > 0 ? conc(t) : '–',
        t > 0 ? (diff >= 0 ? '+' : '') + fixed(diff, 1) + '%' : 'no target'], t > 0 && Math.abs(diff) > TOL * 100 ? 'off' : '');
    });
    if (r.water.hco3 > 0) addRow(et, ['HCO₃', conc(r.water.hco3), '0', conc(r.water.hco3), '–', 'from water']);

    // results list
    const macros = EL.filter(function (e) { return !e.micro && r.target[e.id] > 0; });
    const maxDev = macros.reduce(function (a, e) { return Math.max(a, Math.abs(r.total[e.id] - r.target[e.id]) / r.target[e.id]); }, 0);
    $('r-fit').textContent = ok && macros.length ? 'within ±' + fixed(maxDev * 100, maxDev < 0.1 ? 1 : 0) + '%' : '–';
    $('r-ec').textContent = ok || r.ecWater > 0 ? fixed(r.ec, 2) + ' mS/cm' : '–';
    $('r-ecw').textContent = r.ecWater > 0 ? fixed(r.ecWater, 2) + ' mS/cm' : '0';
    $('r-bal').textContent = r.cat + r.an > 0 ? fixed(r.cat, 2) + ' / ' + fixed(r.an, 2) + ' meq/L' : '–';
    $('r-extra').textContent = ok ? 'Na ' + conc(r.added.na) + ', Cl ' + conc(r.added.cl) + ', S over target ' +
      conc(Math.max(0, r.total.s - r.target.s)) + ' mg/L' : '–';
    $('ec-link').href = ecLink(r);

    // A/B stocks
    renderStock(r, ok);

    $('viz-caption').textContent = ok
      ? (topup ? 'Top-up: ' : '') + 'macronutrients within ±' + fixed(maxDev * 100, maxDev < 0.1 ? 1 : 0) + '% of target · estimated EC ' + fixed(r.ec, 2) + ' mS/cm'
      : 'Pick targets and tick fertilizer salts to draw the chart';
    drawViz(r, ok);
    CalcShare.writeParams(getState());
  }

  function renderStock(r, ok) {
    const dil = num('dil');
    const sv = CalcUnits.base('sv');
    const tb = $('stock-table');
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    const st = $('stock-notice');
    const m = [];
    if (!(dil >= 2)) m.push('Enter a dilution of at least 1:2.');
    if (!(sv > 0)) m.push('Enter the volume of each stock tank.');
    if (dil > 500) m.push('Above about 1:200 the stocks become very concentrated; check every salt dissolves completely.');
    let sumA = 0, sumB = 0, k2so4 = 0;
    if (ok && dil >= 2) {
      r.salts.forEach(function (x) {
        if (!(x.mgL > 1e-9)) return;
        const gL = x.mgL * dil / 1000; // g per L of stock
        if (x.s.tank === 'A') sumA += gL; else sumB += gL;
        if (x.s.key === 'sop') k2so4 = gL / (num('pct_sop') / 100 || 1);
        addRow(tb, [x.s.name, x.s.tank, sig(gL) + ' g/L', sv > 0 ? massOut(gL * sv) : '–']);
      });
    }
    if (sumA > 0 || sumB > 0) {
      $('r-stockA').textContent = sig(sumA) + ' g/L';
      $('r-stockB').textContent = sig(sumB) + ' g/L';
      $('r-stockmake').textContent = sv > 0 && dil >= 2 ? sig(CalcUnits.convert('volume', sv * dil, 'L', CalcUnits.unit('sv'))) + ' ' + CalcUnits.unitLabel('sv') + ' of final solution' : '–';
      $('r-stockdose').textContent = dil >= 2 ? (r.vol > 0 ? sig(CalcUnits.convert('volume', r.vol / dil, 'L', CalcUnits.unit('vol'))) + ' ' + CalcUnits.unitLabel('vol') + ' of A and of B per batch' : sig(1000 / dil) + ' mL of each per L') : '–';
    } else ['r-stockA', 'r-stockB', 'r-stockmake', 'r-stockdose'].forEach(function (id) { $(id).textContent = '–'; });
    if (k2so4 > 100) m.push('Potassium sulfate at ' + sig(k2so4) + ' g/L is close to or above its solubility in cold water (roughly 110 g/L at 20 °C); use a weaker stock or replace part of it with potassium nitrate.');
    if (sumA > 0 || sumB > 0) m.push('Solubility drops in cold water and when several salts share a tank. If anything stays undissolved, use a lower ratio (for example 1:50).');
    st.textContent = m.join(' ');
    st.hidden = m.length === 0;
  }

  function addRow(tb, cells, cls) {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    cells.forEach(function (t) { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    tb.appendChild(tr);
  }

  function ecLink(r) {
    const p = new URLSearchParams();
    p.set('preset', 'custom'); p.set('no3form', 'n'); p.set('out', 'mScm');
    EC_IONS.forEach(function (ion) {
      const v = r.total[ion.id] || 0;
      p.set(ion.id, String(+v.toPrecision(5)));
      p.set(ion.id + '_u', 'mgL');
    });
    return 'nutrient-ec.html?' + p.toString();
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;
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
    const x0 = 62, x1 = 372, W = x1 - x0, MAXP = 1.5;
    const sx = function (f) { return x0 + Math.min(f, MAXP) / MAXP * W; };
    text(8, 16, 'Each element: water + added vs target', 'start', { 'font-weight': 600 });
    // legend
    el('rect', { x: 8, y: 24, width: 10, height: 10, rx: 2, fill: 'var(--tank-back)' });
    text(22, 33, r.mode === 'topup' ? 'in tank now' : 'source water');
    el('rect', { x: 120, y: 24, width: 10, height: 10, rx: 2, fill: 'var(--accent)' });
    text(134, 33, 'added');
    el('line', { x1: 190, y1: 23, x2: 190, y2: 35, stroke: 'var(--text)', 'stroke-width': 2 });
    text(196, 33, 'target (100%)');
    text(VW - 8, 33, 'total / target, mg/L', 'end');

    const rows = EL.concat(EXTRA).filter(function (e) { return r.target[e.id] > 0 || r.total[e.id] > 0.0005; });
    const top = 44, rh = 19;
    rows.forEach(function (e, i) {
      const y = top + i * rh;
      const t = r.target[e.id];
      text(x0 - 6, y + 13, e.sym, 'end', { fill: 'var(--text)' });
      el('rect', { x: x0, y: y + 3, width: W, height: rh - 6, rx: 3, fill: 'var(--surface-2)' });
      if (t > 0) {
        const fw = r.water[e.id] / t, fa = r.added[e.id] / t;
        const xw = sx(fw), xa = sx(fw + fa);
        if (xw > x0) el('rect', { x: x0, y: y + 3, width: xw - x0, height: rh - 6, fill: 'var(--tank-back)' });
        if (xa > xw) el('rect', { x: xw, y: y + 3, width: xa - xw, height: rh - 6, fill: 'var(--accent)' });
        if (fw + fa > MAXP) text(x1 - 4, y + 13, '▸', 'end', { fill: '#fff' });
        const off = Math.abs(fw + fa - 1) > TOL;
        text(VW - 8, y + 13, conc(r.total[e.id]) + ' / ' + conc(t), 'end', off ? { fill: 'var(--warn-text)', 'font-weight': 700 } : undefined);
      } else {
        text(x0 + 6, y + 13, 'no target', 'start');
        text(VW - 8, y + 13, conc(r.total[e.id]) + ' mg/L', 'end', r.added[e.id] > 0.05 ? { fill: 'var(--warn-text)', 'font-weight': 700 } : undefined);
      }
    });
    const yEnd = top + rows.length * rh;
    if (rows.length) {
      el('line', { x1: sx(1), y1: top, x2: sx(1), y2: yEnd + 2, stroke: 'var(--text)', 'stroke-width': 2 });
      [0, 0.5, 1, 1.5].forEach(function (f) {
        el('path', { class: 'dim', d: 'M' + sx(f) + ',' + (yEnd + 2) + ' v4' });
        text(sx(f), yEnd + 17, fixed(f * 100, 0) + '%', 'middle');
      });
    } else {
      text(VW / 2, top + 30, 'No targets entered', 'middle');
    }

    // salt mass stacked bar
    const sTop = yEnd + (rows.length ? 40 : 60);
    const used = ok ? r.salts.filter(function (x) { return x.mgL > 1e-9; }) : [];
    text(8, sTop, 'Product mass per litre of final solution', 'start', { 'font-weight': 600 });
    text(VW - 8, sTop, ok ? sig(r.totalMgL) + ' mg/L' : '', 'end');
    const by = sTop + 8, bh = 26, bw = VW - 16;
    el('rect', { x: 8, y: by, width: bw, height: bh, rx: 6, fill: 'var(--surface-2)' });
    let x = 8;
    used.forEach(function (u, i) {
      const w = u.mgL / r.totalMgL * bw;
      el('rect', { x: x, y: by, width: Math.max(w, 0), height: bh, fill: COLORS[i % COLORS.length], stroke: 'var(--surface)', 'stroke-width': 1 });
      if (w > 30) el('text', { x: x + w / 2, y: by + 17, 'text-anchor': 'middle', fill: '#fff', 'font-size': 11, 'font-weight': 600, 'font-family': 'var(--font)' }, String(i + 1));
      x += w;
    });
    // legend 2 columns
    used.forEach(function (u, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const lx = 8 + col * 236, ly = by + bh + 18 + row * 17;
      el('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 2, fill: COLORS[i % COLORS.length] });
      text(lx + 14, ly, (i + 1) + ' ' + shortName(u.s) + ' ' + sig(u.mgL));
    });
    const end = by + bh + 18 + Math.ceil(used.length / 2) * 17;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + Math.max(end, sTop + 50));
  }
  function shortName(s) {
    return s.kind === 'pure' ? s.formula : { cnc: 'Ca nitrate (comm.)', fedtpa: 'Fe-DTPA', feeddha: 'Fe-EDDHA', feedta: 'Fe-EDTA', cf: 'Custom fert.' }[s.key];
  }

  // ---------- State ----------
  const UNIT_INPUTS = ['vol', 'sv'].concat(EL.map(function (e) { return 't_' + e.id; }), WATER_IDS.map(function (id) { return 'w_' + id; }));
  const PLAIN_INPUTS = ['cn_no3', 'cn_nh4', 'cn_ca', 'cf_no3', 'cf_nh4', 'cf_p2o5', 'cf_k2o', 'cf_ca', 'cf_mg', 'cf_s', 'dil'];
  const SELECTS = ['mode', 'preset', 'alk', 'cf_ox'];
  function getState() {
    const st = {};
    SELECTS.forEach(function (id) { st[id] = $(id).value; });
    UNIT_INPUTS.forEach(function (id) { st[id] = $(id).value; st[id + '_u'] = CalcUnits.unit(id); });
    PLAIN_INPUTS.forEach(function (id) { st[id] = $(id).value; });
    SALTS.forEach(function (s) {
      st['use_' + s.key] = $('use_' + s.key).checked ? 1 : 0;
      if ($('pct_' + s.key)) st['pct_' + s.key] = $('pct_' + s.key).value;
    });
    st.mout = $('mout').value;
    return st;
  }
  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    EL.forEach(function (e) { CalcUnits.set('t_' + e.id, p[e.id], 'mgL'); });
  }
  function applyDefaults() {
    $('mode').value = DEFAULTS.mode; $('preset').value = DEFAULTS.preset; $('alk').value = DEFAULTS.alk; $('cf_ox').value = DEFAULTS.cf_ox;
    applyPreset(DEFAULT_PRESET);
    CalcUnits.set('vol', DEFAULTS.vol, DEFAULTS.vol_u);
    CalcUnits.set('sv', DEFAULTS.sv, DEFAULTS.sv_u);
    WATER_IDS.forEach(function (id) { CalcUnits.set('w_' + id, 0, 'mgL'); });
    PLAIN_INPUTS.forEach(function (id) { $(id).value = DEFAULTS[id]; });
    SALTS.forEach(function (s) {
      $('use_' + s.key).checked = DEFAULT_USE.indexOf(s.key) >= 0;
      if ($('pct_' + s.key)) $('pct_' + s.key).value = s.pct;
    });
    $('mout').value = DEFAULTS.mout; $('mout').dataset.prev = DEFAULTS.mout;
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Hydroponic Nutrient Additions Calculator'];
    lines.push('Mode: ' + (r.mode === 'topup' ? 'top-up of an existing solution' : 'new batch'));
    lines.push('Batch volume: ' + typed('vol'));
    lines.push('Targets (mg/L): ' + EL.filter(function (e) { return r.target[e.id] > 0; }).map(function (e) { return e.sym + ' ' + conc(r.target[e.id]); }).join(', '));
    const w = WATER_IDS.filter(function (id) { return r.water[id] > 0; });
    if (w.length) lines.push((r.mode === 'topup' ? 'Current solution' : 'Source water') + ' (mg/L): ' + w.map(function (id) { return symOf(id) + ' ' + conc(r.water[id]); }).join(', '));
    lines.push('Products:');
    r.salts.forEach(function (x) {
      if (!(x.mgL > 1e-9)) return;
      lines.push('  ' + x.s.name + ' [tank ' + x.s.tank + ']: ' + (r.vol > 0 ? massOut(x.mgL * r.vol / 1000) + ' per batch, ' : '') + massOut(x.mgL / 10) + ' per 100 L');
    });
    lines.push('Result vs target (mg/L):');
    EL.forEach(function (e) {
      if (r.target[e.id] > 0 || r.total[e.id] > 0) lines.push('  ' + e.sym + ': ' + conc(r.total[e.id]) + ' / ' + conc(r.target[e.id]));
    });
    lines.push('Extra ions added: Na ' + conc(r.added.na) + ', Cl ' + conc(r.added.cl) + ' mg/L');
    lines.push('Estimated EC (Kohlrausch × 0.90, 25 °C): ' + fixed(r.ec, 2) + ' mS/cm');
    lines.push('Check the salts against your labels and measure EC and pH after mixing.');
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  buildSaltList();
  document.querySelectorAll('input').forEach(function (i) {
    i.addEventListener('input', function () {
      if (i.id.indexOf('t_') === 0) $('preset').value = 'custom';
      render();
    });
    if (i.type === 'checkbox') i.addEventListener('change', render);
  });
  $('preset').addEventListener('change', function () {
    if (PRESETS[$('preset').value]) applyPreset($('preset').value);
    render();
  });
  ['mode', 'alk', 'cf_ox'].forEach(function (id) { $(id).addEventListener('change', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Hydroponic Nutrient Additions Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    applyDefaults();
    const p = CalcShare.readParams();
    if (p.mode === 'new' || p.mode === 'topup') $('mode').value = p.mode;
    if (p.alk === 'hco3' || p.alk === 'caco3') $('alk').value = p.alk;
    if (p.cf_ox === 'el' || p.cf_ox === 'ox') $('cf_ox').value = p.cf_ox;
    if (PRESETS[p.preset] || p.preset === 'custom') { $('preset').value = p.preset; if (PRESETS[p.preset]) applyPreset(p.preset); }
    UNIT_INPUTS.forEach(function (id) {
      const u = p[id + '_u'];
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) CalcUnits.set(id, p[id], u);
      else if (p[id] === '' ) CalcUnits.set(id, '', u);
      else if (u) CalcUnits.set(id, $(id).value, u);
    });
    PLAIN_INPUTS.forEach(function (id) { if (p[id] !== undefined && isFinite(parseFloat(p[id]))) $(id).value = p[id]; });
    SALTS.forEach(function (s) {
      if (p['use_' + s.key] === '1' || p['use_' + s.key] === '0') $('use_' + s.key).checked = p['use_' + s.key] === '1';
      if ($('pct_' + s.key) && p['pct_' + s.key] !== undefined && isFinite(parseFloat(p['pct_' + s.key]))) $('pct_' + s.key).value = p['pct_' + s.key];
    });
    if (p.mout && CalcUnits.unitDef('mass', p.mout)) { $('mout').value = p.mout; $('mout').dataset.prev = p.mout; }
    render();
  })();
})();
