// Aquaponic Buffer Blend Calculator: designs a dry blend of base and mineral salts, dosed per kg
// of fish feed, that tops up the fish waste to a hydroponic nutrient ratio (after W. Lennard's
// "Aquaponic System Sizing & Buffer Formulation Model"), with element/ion basis, solids handling,
// non-negative least-squares fit, ratio checks, alkalinity balance, plants supported,
// live SVG and shareable URL state.
(function () {
  'use strict';

  // ---------- Extra unit groups (kept local; units.js is shared) ----------
  CalcUnits.GROUPS.feedrate = CalcUnits.GROUPS.feedrate || {
    base: 'kgd',
    units: [
      { id: 'gd', label: 'g/day', factor: 0.001 },
      { id: 'kgd', label: 'kg/day', factor: 1 },
      { id: 'ozd', label: 'oz/day', factor: 0.028349523125 },
      { id: 'lbd', label: 'lb/day', factor: 0.45359237 }
    ]
  };
  // Nutrient retained per kg of fish gain; base g/kg.
  CalcUnits.GROUPS.gperkg = CalcUnits.GROUPS.gperkg || {
    base: 'gkg',
    units: [
      { id: 'gkg', label: 'g/kg', factor: 1 },
      { id: 'pct', label: '% of fish', factor: 10 }
    ]
  };
  CalcUnits.GROUPS.waterrate = CalcUnits.GROUPS.waterrate || {
    base: 'Ld',
    units: [
      { id: 'Ld', label: 'L/day', factor: 1 },
      { id: 'm3d', label: 'm³/day', factor: 1000 },
      { id: 'gald', label: 'US gal/day', factor: 3.785411784 },
      { id: 'impgald', label: 'imp gal/day', factor: 4.54609 }
    ]
  };
  CalcUnits.GROUPS.plantn = CalcUnits.GROUPS.plantn || {
    base: 'mgpd',
    units: [
      { id: 'mgpd', label: 'mg N/plant/day', factor: 1 },
      { id: 'gpd', label: 'g N/plant/day', factor: 1000 }
    ]
  };
  // Same definition as plant-fish-ratio.js / sea-salt-mix.js. Base: price per kg.
  CalcUnits.GROUPS.pricemass = CalcUnits.GROUPS.pricemass || {
    base: 'kg',
    units: [
      { id: 'kg', label: 'per kg', factor: 1 },
      { id: 'lb', label: 'per lb', factor: 1 / 0.45359237 }
    ]
  };

  // ---------- Constants ----------
  // IUPAC 2021 standard atomic weights (abridged), Prohaska et al. 2022.
  const AW = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, Mg: 24.305, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078 };
  function molar(comp) { return Object.keys(comp).reduce(function (s, k) { return s + AW[k] * comp[k]; }, 0); }
  function hyd(comp, n) { const o = Object.assign({}, comp); o.H = (o.H || 0) + 2 * n; o.O = (o.O || 0) + n; return o; }
  const ELMASS = { n: AW.N, p: AW.P, k: AW.K, ca: AW.Ca, mg: AW.Mg, s: AW.S, cl: AW.Cl };
  // Ion masses for the "ions" (original spreadsheet) reading of the reference values.
  const ION = { n: molar({ N: 1, O: 3 }), p: molar({ P: 1, O: 4 }), s: molar({ S: 1, O: 4 }) };
  const ION_F = { n: ION.n / AW.N, p: ION.p / AW.P, s: ION.s / AW.S, k: 1, ca: 1, mg: 1 }; // ion mass per element mass
  const CACO3_EQ = 50.04;           // g CaCO3 per equivalent of alkalinity
  const UPTAKE_ALK = CACO3_EQ / AW.N; // 3.57 g CaCO3 per g nitrate-N taken up (1 eq per mol)

  const NUT = [
    { id: 'n', el: 'N', ion: 'NO₃', name: 'Nitrogen' },
    { id: 'p', el: 'P', ion: 'PO₄', name: 'Phosphorus' },
    { id: 'k', el: 'K', ion: 'K', name: 'Potassium' },
    { id: 'ca', el: 'Ca', ion: 'Ca', name: 'Calcium' },
    { id: 'mg', el: 'Mg', ion: 'Mg', name: 'Magnesium' },
    { id: 's', el: 'S', ion: 'SO₄', name: 'Sulfur' }
  ];
  const FIT = ['p', 'k', 'ca', 'mg', 's']; // N comes only from the fish
  const WATER = ['k', 'ca', 'mg', 's'];

  // Buffer salts. el = moles of each element per mole; alk = equivalents of alkalinity per mole.
  function salt(key, name, formula, comp, el, alk, pct) {
    const mw = molar(comp);
    const frac = {};
    Object.keys(el).forEach(function (k) { frac[k] = el[k] * ELMASS[k] / mw; });
    return { key: key, name: name, formula: formula, mw: mw, frac: frac, alk: alk, pct: pct || 100 };
  }
  const SALTS = [
    salt('caoh2', 'Calcium hydroxide (hydrated lime)', 'Ca(OH)₂', { Ca: 1, O: 2, H: 2 }, { ca: 1 }, 2),
    salt('k2co3', 'Potassium carbonate', 'K₂CO₃', { K: 2, C: 1, O: 3 }, { k: 2 }, 2),
    salt('mgs', 'Magnesium sulfate heptahydrate (Epsom salt)', 'MgSO₄·7H₂O', hyd({ Mg: 1, S: 1, O: 4 }, 7), { mg: 1, s: 1 }, 0),
    salt('mgcl6', 'Magnesium chloride hexahydrate', 'MgCl₂·6H₂O', hyd({ Mg: 1, Cl: 2 }, 6), { mg: 1, cl: 2 }, 0),
    salt('mkp', 'Monopotassium phosphate (MKP)', 'KH₂PO₄', { K: 1, H: 2, P: 1, O: 4 }, { k: 1, p: 1 }, 0),
    salt('sop', 'Potassium sulfate', 'K₂SO₄', { K: 2, S: 1, O: 4 }, { k: 2, s: 1 }, 0),
    salt('khco3', 'Potassium bicarbonate', 'KHCO₃', { K: 1, H: 1, C: 1, O: 3 }, { k: 1 }, 1),
    salt('koh', 'Potassium hydroxide flakes', 'KOH', { K: 1, O: 1, H: 1 }, { k: 1 }, 1, 90),
    salt('mgcl0', 'Magnesium chloride, anhydrous', 'MgCl₂', { Mg: 1, Cl: 2 }, { mg: 1, cl: 2 }, 0),
    salt('cacl2', 'Calcium chloride dihydrate', 'CaCl₂·2H₂O', hyd({ Ca: 1, Cl: 2 }, 2), { ca: 1, cl: 2 }, 0),
    salt('caco3', 'Calcium carbonate (agricultural limestone)', 'CaCO₃', { Ca: 1, C: 1, O: 3 }, { ca: 1 }, 2),
    salt('dolo', 'Dolomite (dolomitic limestone)', 'CaMg(CO₃)₂', { Ca: 1, Mg: 1, C: 2, O: 6 }, { ca: 1, mg: 1 }, 4),
    // Potassium silicate: composition from the label (K2O, SiO2); dosed for silicon, not fitted.
    { key: 'ksil', name: 'Potassium silicate', formula: 'K silicate', kind: 'silicate', frac: {}, alk: 0, pct: 100 }
  ];
  const SI_PER_SIO2 = 28.085 / (28.085 + 2 * AW.O);           // 0.4674
  const K_PER_K2O = 2 * AW.K / (2 * AW.K + AW.O);              // 0.8301
  // Which salts can share a dry container. base: alkaline salts; min: neutral salts with no calcium;
  // carb: slow-dissolving carbonates; sep: each in its own container.
  const MIXGROUP = { caoh2: 'base', k2co3: 'base', khco3: 'base', mgs: 'min', mkp: 'min', sop: 'min',
    caco3: 'carb', dolo: 'carb', koh: 'sep', mgcl6: 'sep', mgcl0: 'sep', cacl2: 'sep', ksil: 'sep' };
  const MIXINFO = {
    base: { name: 'Base blend', note: 'Alkaline salts that can share one container. Keep it dry and sealed: with moisture, calcium hydroxide reacts with the carbonates to calcium carbonate and caustic potassium hydroxide, and the blend cakes. Dose slowly into the sump.' },
    min: { name: 'Mineral blend', note: 'Neutral salts with no calcium, so the phosphate cannot precipitate as calcium phosphate. They can share one container; dissolve in water before adding.' },
    carb: { name: 'Slow-release carbonates', note: 'Calcium carbonate and dolomite barely dissolve at neutral pH; they dissolve as nitrification acidifies the water, so they cannot push pH up the way hydroxides can. Put them in a mesh bag, media bed or reactor in the water flow rather than dosing them, and expect the calcium and magnesium to arrive slowly.' }
  };
  const SEPWHY = {
    koh: 'very hygroscopic and caustic, and it gets hot as it dissolves; it would pull water into a blend.',
    mgcl6: 'absorbs moisture from the air and would cake a blend.',
    mgcl0: 'absorbs moisture from the air (and heats as it dissolves) and would cake a blend.',
    cacl2: 'absorbs moisture, and its calcium would react with the phosphate and sulfate in the mineral blend.',
    ksil: 'is strongly alkaline and forms insoluble silicates with calcium and magnesium; dissolve and dose it on its own.'
  };
  // Containers in use, in order: base, min, carb, then one per separate salt.
  function mixPlan(used) {
    const out = [];
    ['base', 'min', 'carb'].forEach(function (g) {
      const xs = used.filter(function (x) { return MIXGROUP[x.s.key] === g; });
      if (xs.length) out.push({ name: MIXINFO[g].name + (xs.length > 1 ? '' : ' (' + xs[0].s.formula + ' only)'), note: MIXINFO[g].note, salts: xs });
    });
    used.filter(function (x) { return MIXGROUP[x.s.key] === 'sep'; }).forEach(function (x) {
      out.push({ name: x.s.formula + ', separate', note: 'Keep ' + x.s.formula + ' in its own container: it ' + SEPWHY[x.s.key], salts: [x] });
    });
    return out;
  }
  // The spreadsheet's five salts plus potassium sulfate, so S and Mg can both be met on the element basis.
  const DEFAULT_USE = ['caoh2', 'k2co3', 'mgs', 'mgcl6', 'mkp', 'sop'];
  const COLORS = ['var(--accent)', 'var(--water-deep)', 'var(--c-hydroponics)', 'var(--warn-text)', 'var(--c-aquaculture)',
    'var(--accent-strong)', 'var(--tank-back)', 'var(--water)', 'var(--text-muted)', 'var(--tank-stroke)'];

  // Reference solutions, mg/L. Resh: the values in the Lennard spreadsheet (Resh 2013, p. 53),
  // N, P and S as elements. Hoagland & Arnon No. 2 as on the nutrient additions page (elements;
  // N = 196.1 nitrate-N + 14.0 ammonium-N).
  const PRESETS = {
    resh: { raw: true, n: 121, p: 36, k: 240, ca: 87, mg: 61, s: 98 },
    hoagland2: { raw: false, n: 210.1, p: 31.0, k: 234.6, ca: 160.3, mg: 48.6, s: 64.1 }
  };
  const CROPS = [
    { id: 'lettl', name: 'Lettuce (large)', n: 16 },
    { id: 'lettf', name: 'Lettuce (fancy)', n: 14 },
    { id: 'herbs', name: 'Herbs', n: 10 },
    { id: 'tom', name: 'Tomato (fruiting)', n: 150 },
    { id: 'cuc', name: 'Cucumber (fruiting)', n: 160 },
    { id: 'pep', name: 'Bell pepper (fruiting)', n: 140 },
    { id: 'egg', name: 'Eggplant (fruiting)', n: 150 },
    { id: 'straw', name: 'Strawberry (fruiting)', n: 30 }
  ];
  const RATIOS = [['n', 'p'], ['n', 'k'], ['n', 'ca'], ['n', 'mg'], ['n', 's'], ['ca', 'k'], ['ca', 'mg'], ['ca', 's'], ['ca', 'p'], ['mg', 'k'], ['s', 'k']];

  const DEFAULTS = {
    ks_k2o: 61.06, ks_sio2: 38.94, ks_si: 2, // pure K2SiO3; enter your label. Si dose in g per kg feed (example)
    prot: 32, pfeed: 0.8, fcr: 1.5, feed: [1, 'kgd'], nret: [28.8, 'gkg'], pret: [4.1, 'gkg'],
    solids: 'total', sn: 10, sp: 40, preset: 'resh', basis: 'el', tol: 5, alkf: 7.14,
    wvol: [0, 'Ld'], perfeed: 'kg', mout: 'g'
  };

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
  function g2(n) { // grams in tables: 2 decimals up to 1000
    if (!isFinite(n)) return '–';
    if (Math.abs(n) < 0.005) return '0';
    return Math.abs(n) >= 1000 ? fixed(n, 0) : fixed(n, 2);
  }
  function num(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function pos(id) { const v = num(id); return v > 0 ? v : 0; }
  function sym(id, basis) { const e = NUT.filter(function (x) { return x.id === id; })[0]; return basis === 'ion' ? e.ion : e.el; }
  function perFeedFactor() { return $('perfeed').value === 'lb' ? 0.45359237 : 1; } // kg of feed per chosen unit
  function perFeedLabel() { return $('perfeed').value === 'lb' ? 'lb feed' : 'kg feed'; }
  function massOut(grams) {
    const u = $('mout').value || 'g';
    return sig(CalcUnits.convert('mass', grams / 1000, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }

  // ---------- Solver: Lawson–Hanson non-negative least squares (as nutrient-additions.js) ----------
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

  // ---------- Build dynamic UI ----------
  function buildSaltList() {
    const box = $('salt-list');
    SALTS.forEach(function (s) {
      const row = document.createElement('div');
      row.className = 'salt-row';
      const lab = document.createElement('label');
      lab.className = 'salt-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'use_' + s.key;
      lab.appendChild(cb);
      const nm = document.createElement('span');
      nm.className = 'salt-name';
      nm.textContent = s.name;
      const an = document.createElement('span');
      an.className = 'salt-an';
      if (s.kind === 'silicate') an.textContent = 'composition from your label (K₂O, SiO₂) · dosed for silicon · base';
      else an.textContent = s.formula + ' · M ' + fixed(s.mw, 2) + ' · ' + Object.keys(s.frac).map(function (k) {
        return (k === 'cl' ? 'Cl' : sym(k, 'el')) + ' ' + fixed(s.frac[k] * 100, 1) + '%';
      }).join(', ') + (s.alk ? ' · base' : '');
      nm.appendChild(an);
      lab.appendChild(nm);
      row.appendChild(lab);

      const opts = document.createElement('div');
      opts.className = 'salt-opts';
      const ir = document.createElement('div');
      ir.className = 'input-row';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.id = 'pct_' + s.key; inp.min = '0'; inp.max = '100'; inp.step = 'any';
      inp.setAttribute('inputmode', 'decimal');
      inp.setAttribute('aria-label', s.name + ' purity');
      const u = document.createElement('span');
      u.className = 'unit'; u.textContent = '% pure';
      ir.appendChild(inp); ir.appendChild(u);
      const pr = document.createElement('div');
      pr.className = 'input-row';
      const pin = document.createElement('input');
      pin.type = 'number'; pin.id = 'price_' + s.key; pin.min = '0'; pin.step = 'any'; pin.placeholder = 'price';
      pin.setAttribute('inputmode', 'decimal');
      pin.setAttribute('aria-label', s.name + ' price');
      const ps = document.createElement('select');
      ps.className = 'unit-select';
      ps.dataset.unitGroup = 'pricemass'; ps.dataset.unitFor = 'price_' + s.key; ps.dataset.unitDefault = 'kg';
      ps.setAttribute('aria-label', s.name + ' price unit');
      pr.appendChild(pin); pr.appendChild(ps);
      opts.appendChild(ir); opts.appendChild(pr);
      row.appendChild(opts);
      if (s.kind === 'silicate') { ir.hidden = true; opts.style.gridTemplateColumns = 'minmax(0, 1fr)'; row.appendChild($('ks-box')); }
      box.appendChild(row);
    });
  }
  function buildCrops() {
    const box = $('crop-list');
    CROPS.forEach(function (c) {
      const f = document.createElement('div');
      f.className = 'field';
      const l = document.createElement('label');
      l.htmlFor = 'cn_' + c.id; l.textContent = c.name;
      const ir = document.createElement('div');
      ir.className = 'input-row';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.id = 'cn_' + c.id; inp.min = '0'; inp.step = 'any';
      inp.setAttribute('inputmode', 'decimal');
      const sel = document.createElement('select');
      sel.className = 'unit-select';
      sel.dataset.unitGroup = 'plantn'; sel.dataset.unitFor = 'cn_' + c.id; sel.dataset.unitDefault = 'mgpd';
      sel.setAttribute('aria-label', c.name + ' nitrogen use unit');
      ir.appendChild(inp); ir.appendChild(sel);
      f.appendChild(l); f.appendChild(ir);
      box.appendChild(f);
    });
  }

  // ---------- Reference values and basis ----------
  function presetValues(name, basis) {
    const p = PRESETS[name];
    const out = {};
    NUT.forEach(function (e) { out[e.id] = p.raw || basis === 'el' ? p[e.id] : +(p[e.id] * ION_F[e.id]).toPrecision(5); });
    return out;
  }
  function applyPreset(name) {
    if (!PRESETS[name]) return;
    const v = presetValues(name, $('basis').value);
    NUT.forEach(function (e) { CalcUnits.set('r_' + e.id, v[e.id], 'mgL'); });
  }
  function relabel() {
    const ion = $('basis').value === 'ion';
    $('lab-r_n').textContent = ion ? 'Nitrate (NO₃⁻)' : 'Nitrogen (N, as NO₃-N)';
    $('lab-r_p').textContent = ion ? 'Phosphate (PO₄)' : 'Phosphorus (P)';
    $('lab-r_s').textContent = ion ? 'Sulfate (SO₄)' : 'Sulfur (S)';
    $('basis-note').hidden = !ion;
  }

  // ---------- Model ----------
  function compute() {
    const r = { msgs: [] };
    let negative = false;
    document.querySelectorAll('input[type=number]').forEach(function (i) { if (parseFloat(i.value) < 0) negative = true; });
    if (negative) r.msgs.push('Negative values are treated as zero.');
    r.basis = $('basis').value === 'ion' ? 'ion' : 'el';
    r.prot = pos('prot'); r.pfeed = pos('pfeed'); r.fcr = pos('fcr');
    r.feed = CalcUnits.base('feed'); // kg/day
    r.nret = CalcUnits.base('nret'); r.pret = CalcUnits.base('pret'); // g per kg fish
    r.solids = $('solids').value === 'dissolved' ? 'dissolved' : 'total';
    r.sn = Math.min(pos('sn'), 100); r.sp = Math.min(pos('sp'), 100);
    r.tol = pos('tol') / 100 || 0.05;
    r.alkf = pos('alkf');
    if (r.prot > 100 || r.pfeed > 100) r.msgs.push('Feed protein and phosphorus are percentages of the feed; values above 100% are not possible.');
    r.prot = Math.min(r.prot, 100); r.pfeed = Math.min(r.pfeed, 100);

    r.ok = r.prot > 0 && r.fcr > 0;
    if (!(r.prot > 0)) r.msgs.push('Enter the feed protein content.');
    if (!(r.fcr > 0)) r.msgs.push('Enter the fish FCR (kg feed per kg fish gain).');
    if (r.fcr > 0 && (r.fcr < 0.6 || r.fcr > 4)) r.msgs.push('An FCR of ' + sig(r.fcr) + ' is outside the usual 0.8–2.4 range for farmed fish; check the value.');

    // Feed N and P (per kg feed and per kg fish)
    r.nFedFeed = r.prot * 10 / 6.25;
    r.nFedFish = r.nFedFeed * r.fcr;
    r.nWasteFish = r.nFedFish - r.nret;
    r.nWasteFeed = r.fcr > 0 ? r.nWasteFish / r.fcr : 0;
    r.pFedFeed = r.pfeed * 10;
    r.pWasteFish = r.pFedFeed * r.fcr - r.pret;
    r.pWasteFeed = r.fcr > 0 ? r.pWasteFish / r.fcr : 0;
    r.nSolid = r.sn / 100 * r.nFedFeed;
    r.pSolid = r.sp / 100 * r.pFedFeed;
    if (r.ok && r.nWasteFeed <= 0) { r.msgs.push('The fish retain all the feed nitrogen with these numbers (N retained ≥ N fed), so there is no waste N to balance. Check protein, FCR and N retained.'); r.ok = false; }
    if (r.ok && r.pWasteFeed < 0) r.msgs.push('P retained by the fish is more than the P fed; fish-waste P is taken as zero.');
    r.nAvail = Math.max(0, r.solids === 'total' ? r.nWasteFeed : r.nWasteFeed - r.nSolid);
    r.pAvail = Math.max(0, r.solids === 'total' ? r.pWasteFeed : r.pWasteFeed - r.pSolid);
    if (r.ok && r.solids === 'dissolved' && r.nAvail <= 0) { r.msgs.push('The N in removed solids is as large as all the waste N, so nothing is left for the plants. Lower the solids share.'); r.ok = false; }

    // Reference ratios
    r.raw = {}; r.refE = {};
    NUT.forEach(function (e) {
      r.raw[e.id] = CalcUnits.base('r_' + e.id);
      r.refE[e.id] = r.raw[e.id] / (r.basis === 'ion' ? ION_F[e.id] : 1);
    });
    if (!(r.refE.n > 0)) { r.msgs.push('Enter the nitrogen value of the reference solution; every target is a ratio to it.'); r.ok = false; }
    r.target = {};
    NUT.forEach(function (e) { r.target[e.id] = r.ok ? r.nAvail * r.refE[e.id] / r.refE.n : 0; });

    // Fish waste and make-up water contributions, g per kg feed
    r.fish = { n: r.nAvail, p: r.pAvail, k: 0, ca: 0, mg: 0, s: 0 };
    r.water = { n: 0, p: 0, k: 0, ca: 0, mg: 0, s: 0 };
    r.wvol = CalcUnits.base('wvol');
    const anyW = WATER.some(function (k) { return CalcUnits.base('w_' + k) > 0; });
    if (r.wvol > 0 && anyW) {
      if (r.feed > 0) WATER.forEach(function (k) { r.water[k] = CalcUnits.base('w_' + k) * r.wvol / 1000 / r.feed; });
      else r.msgs.push('Enter the feed rate to count the minerals in the make-up water.');
    }

    // Salts
    r.salts = []; r.zero = [];
    SALTS.forEach(function (s) {
      if (!$('use_' + s.key).checked) return;
      if (s.kind === 'silicate') {
        const k2o = Math.max(0, num('ks_k2o') || 0), sio2 = Math.max(0, num('ks_sio2') || 0), dose = Math.max(0, num('ks_si') || 0);
        if (k2o + sio2 > 100) r.badPct = true;
        if (!(sio2 > 0) || !(dose > 0)) { r.msgs.push('Potassium silicate is ticked: enter its SiO₂ content and a silicon dose (g Si per kg feed), or untick it.'); return; }
        const fr = { k: k2o / 100 * K_PER_K2O, si: sio2 / 100 * SI_PER_SIO2 };
        r.salts.push({ s: s, frac: fr, pct: 100, fixed: true, g: dose / fr.si, alkPerG: fr.k / AW.K * CACO3_EQ, price: CalcUnits.base('price_' + s.key) });
        return;
      }
      let p = num('pct_' + s.key);
      if (!(p > 0)) { r.zero.push(s.name); return; }
      if (p > 100) { r.badPct = true; p = 100; }
      const fr = {};
      Object.keys(s.frac).forEach(function (k) { fr[k] = s.frac[k] * p / 100; });
      r.salts.push({ s: s, frac: fr, pct: p, price: CalcUnits.base('price_' + s.key) });
    });

    // Weighted NNLS on relative error; tiny chloride penalty picks the low-chloride solution
    // when several salt combinations fit equally well.
    const fit = r.salts.filter(function (x) { return !x.fixed; });
    const fixedC = {};
    FIT.forEach(function (k) { fixedC[k] = r.salts.reduce(function (a, x) { return a + (x.fixed ? (x.frac[k] || 0) * x.g : 0); }, 0); });
    const n = fit.length;
    if (r.ok && n) {
      const rows = [], b = [];
      const floor = 0.02 * r.nAvail;
      FIT.forEach(function (k) {
        const sc = 1 / Math.max(r.target[k], floor);
        rows.push(fit.map(function (x) { return (x.frac[k] || 0) * sc; }));
        b.push((r.target[k] - r.fish[k] - r.water[k] - fixedC[k]) * sc);
      });
      const clw = 1e-3 / r.nAvail;
      rows.push(fit.map(function (x) { return (x.frac.cl || 0) * clw; }));
      b.push(0);
      const norms = [];
      for (let j = 0; j < n; j++) { let s = 0; rows.forEach(function (row) { s += row[j] * row[j]; }); norms.push(Math.sqrt(s) || 1); }
      const A = rows.map(function (row) { return row.map(function (v, j) { return v / norms[j]; }); });
      let y = nnls(A, b, n);
      // Drop numerical crumbs (< 0.01% of the blend) and refit without those salts.
      const tot = y.reduce(function (acc, v, j) { return acc + v / norms[j]; }, 0);
      const keep = y.map(function (v, j) { return v / norms[j] > 1e-4 * tot; });
      if (keep.some(function (k, j) { return !k && y[j] > 0; })) {
        const idx = [];
        keep.forEach(function (k, j) { if (k) idx.push(j); });
        const y2 = nnls(A.map(function (row) { return idx.map(function (j) { return row[j]; }); }), b, idx.length);
        y = new Array(n).fill(0);
        idx.forEach(function (j, i) { y[j] = y2[i]; });
      }
      // Polish: refit the salts in use without the chloride row, so an exact fit stays exact.
      const act = [];
      y.forEach(function (v, j) { if (v > 0) act.push(j); });
      if (act.length) {
        const A0 = A.slice(0, FIT.length), b0 = b.slice(0, FIT.length);
        const z = lsq(A0, b0, act);
        const res = function (vec) {
          return A0.reduce(function (acc, row, i) { let e = b0[i]; act.forEach(function (j, k) { e -= row[j] * vec[k]; }); return acc + e * e; }, 0);
        };
        if (z && z.every(function (v) { return v > 0 && isFinite(v); }) && res(z) <= res(act.map(function (j) { return y[j]; })) + 1e-12) {
          act.forEach(function (j, k) { y[j] = z[k]; });
        }
      }
      fit.forEach(function (x, j) { x.g = y[j] / norms[j]; });
    } else fit.forEach(function (x) { x.g = 0; });
    if (!r.ok) r.salts.forEach(function (x) { x.g = 0; });

    r.buffer = {}; r.total = {};
    NUT.concat([{ id: 'cl' }, { id: 'si' }]).forEach(function (e) {
      r.buffer[e.id] = r.salts.reduce(function (a, x) { return a + (x.frac[e.id] || 0) * x.g; }, 0);
    });
    NUT.forEach(function (e) { r.total[e.id] = r.fish[e.id] + r.water[e.id] + r.buffer[e.id]; });
    r.blend = r.salts.reduce(function (a, x) { return a + x.g; }, 0);
    r.cl = r.buffer.cl;
    r.si = r.buffer.si;
    r.alkSupplied = r.salts.reduce(function (a, x) { return a + (x.fixed ? x.g * x.alkPerG : x.g * x.pct / 100 / x.s.mw * x.s.alk * CACO3_EQ); }, 0);
    r.alkUsed = r.nAvail * r.alkf;
    r.alkUptake = r.nAvail * UPTAKE_ALK;
    const priced = r.salts.filter(function (x) { return x.g > 1e-9; });
    r.costKnown = priced.length > 0 && priced.every(function (x) { return x.price > 0; });
    r.costAny = priced.some(function (x) { return x.price > 0; });
    r.cost = priced.reduce(function (a, x) { return a + x.g / 1000 * x.price; }, 0);
    return r;
  }

  // ---------- Render ----------
  function render() {
    relabel();
    $('ks-box').hidden = !$('use_ksil').checked;
    const r = compute();
    const msgs = r.msgs.slice();
    const pf = perFeedFactor(), pfl = perFeedLabel();
    if (r.basis === 'ion') msgs.push('Compatibility setting: the reference values are read as ions (NO₃, PO₄, SO₄), as in the original spreadsheet. This is not recommended: it overstates K, Ca and Mg about 4.4-fold relative to N.');
    if (!r.salts.length) msgs.push('Tick at least one salt with a purity above 0.');
    if (r.zero.length) msgs.push('Ignored (purity 0 or empty): ' + r.zero.join(', ') + '.');
    if (r.badPct) msgs.push('A purity above 100% was entered and is treated as 100%.');
    if (!(r.feed > 0)) msgs.push('Enter the feed rate to get daily amounts and plants supported (amounts per kg of feed are still shown).');

    const off = { over: [], under: [], unmet: [], keys: {} };
    const ok = r.ok && r.salts.length > 0;
    if (ok) {
      FIT.forEach(function (k) {
        const t = r.target[k];
        if (!(t > 0)) return;
        const d = r.total[k] / t - 1;
        const need = t - r.fish[k] - r.water[k];
        if (need > 0 && !r.salts.some(function (x) { return x.frac[k] > 0; })) off.unmet.push(sym(k, 'el'));
        else if (d < -r.tol) { off.under.push(sym(k, 'el') + ' ' + fixed(d * 100, 0) + '%'); off.keys[k] = -1; }
        if (d > r.tol) { off.over.push(sym(k, 'el') + ' +' + fixed(d * 100, 0) + '%'); off.keys[k] = 1; }
      });
      if (off.unmet.length) msgs.push('None of the ticked salts supply ' + off.unmet.join(', ') + '.');
      if (off.under.length || off.over.length) {
        const sop = $('use_sop').checked;
        msgs.push('The ticked salts cannot meet every target at once' +
          (off.under.length ? '; under target: ' + off.under.join(', ') : '') +
          (off.over.length ? '; over target: ' + off.over.join(', ') : '') + ' (tolerance ±' + fixed(r.tol * 100, 0) + '%).' +
          (!sop && (off.keys.s === -1 || off.keys.mg === 1) ? ' Magnesium sulfate alone brings more Mg per unit of S than this recipe asks for: tick potassium sulfate so S and Mg can be met separately.' : ''));
      }
      const tooMuch = FIT.filter(function (k) { return r.fish[k] + r.water[k] > r.target[k] * (1 + r.tol) && r.target[k] > 0; });
      if (tooMuch.length) msgs.push('Fish waste and make-up water already supply more ' + tooMuch.map(function (k) { return sym(k, 'el'); }).join(', ') + ' than the target; nothing is added for it.');
      if (r.cl > 0.05 * r.nAvail) msgs.push('The blend adds ' + g2(r.cl) + ' g chloride per kg feed (' + sig(r.cl / r.nAvail) + ' g per g of plant-available N). Chloride is needed only in traces and builds up in a recirculating system; prefer sulfate salts where you can.');
    }
    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    // Headline
    $('r-main').textContent = ok ? massOut(r.blend * pf) + ' per ' + pfl : '–';
    $('r-main-sub').textContent = ok
      ? (r.feed > 0 ? massOut(r.blend * r.feed) + ' of blend per day at ' + sig(CalcUnits.convert('feedrate', r.feed, 'kgd', CalcUnits.unit('feed'))) + ' ' + CalcUnits.unitLabel('feed') + ' of feed · ' : '') +
        sig(r.blend / 10) + '% of the feed weight · ' + mixPlan(r.salts.filter(function (x) { return x.g > 1e-9; })).length + ' container(s), see "How to mix it"'
      : '';

    // Salt table
    const tb = $('salt-table');
    clear(tb);
    $('th-perfeed').textContent = 'Per ' + pfl;
    const used = ok ? r.salts.filter(function (x) { return x.g > 1e-9; }) : [];
    used.forEach(function (x) {
      addRow(tb, [x.s.formula, massOut(x.g * pf), r.feed > 0 ? massOut(x.g * r.feed) : '–', fixed(x.g / r.blend * 100, 1) + '%']);
    });
    if (used.length) addRow(tb, ['Total blend', massOut(r.blend * pf), r.feed > 0 ? massOut(r.blend * r.feed) : '–', '100%'], 'sum');
    const unused = ok ? r.salts.filter(function (x) { return !(x.g > 1e-9); }).map(function (x) { return x.s.formula; }) : [];
    $('unused').textContent = unused.length ? 'Not needed with these targets: ' + unused.join(', ') + '.' : '';

    // Mixing plan: which salts share a container
    const mt = $('mix-table'), mn = $('mix-notes');
    clear(mt); clear(mn);
    $('th-mix').textContent = 'Per ' + pfl;
    mixPlan(used).forEach(function (c, i) {
      const tot = c.salts.reduce(function (a, x) { return a + x.g; }, 0);
      addRow(mt, [(i + 1) + '. ' + c.name, massOut(tot * pf), r.feed > 0 ? massOut(tot * r.feed) : '–', fixed(tot / r.blend * 100, 1) + '%'], 'sum');
      if (c.salts.length > 1) c.salts.forEach(function (x) {
        addRow(mt, ['   ' + x.s.formula + ' (' + fixed(x.g / tot * 100, 1) + '% of this container)', massOut(x.g * pf), r.feed > 0 ? massOut(x.g * r.feed) : '–', fixed(x.g / r.blend * 100, 1) + '%']);
      });
      const li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + c.name + ': ' + c.note;
      mn.appendChild(li);
    });

    // Nutrient table (elements, g per kg feed)
    const nt = $('nut-table');
    clear(nt);
    const showW = NUT.some(function (e) { return r.water[e.id] > 0; });
    $('th-water').hidden = !showW;
    if (r.ok) {
      NUT.forEach(function (e) {
        const t = r.target[e.id];
        const d = t > 0 ? (r.total[e.id] / t - 1) * 100 : NaN;
        const cells = [e.el, g2(r.fish[e.id] * pf)];
        if (showW) cells.push(g2(r.water[e.id] * pf));
        cells.push(g2(r.buffer[e.id] * pf), g2(r.total[e.id] * pf), g2(t * pf), isFinite(d) ? (Math.abs(d) < 0.05 ? '0.0' : (d > 0 ? '+' : '') + fixed(d, 1)) + '%' : '–');
        addRow(nt, cells, isFinite(d) && Math.abs(d) > r.tol * 100 ? 'off' : '');
      });
    }

    // Ratio table
    const rt = $('ratio-table');
    clear(rt);
    if (ok) {
      RATIOS.forEach(function (pr) {
        const a = pr[0], b = pr[1];
        if (!(r.raw[b] > 0) || !(r.total[b] > 0)) return;
        const fa = r.basis === 'ion' ? ION_F[a] : 1, fb = r.basis === 'ion' ? ION_F[b] : 1;
        const prod = (r.total[a] * fa) / (r.total[b] * fb);
        const targ = r.raw[a] / r.raw[b];
        const dev = prod / targ - 1;
        const good = Math.abs(dev) <= r.tol;
        addRow(rt, [sym(a, r.basis) + ':' + sym(b, r.basis), fixed(targ, 4), fixed(prod, 4), good ? 'Yes' : 'No (' + (dev > 0 ? '+' : '') + fixed(dev * 100, 1) + '%)'], good ? '' : 'off');
      });
    }
    $('ratio-head').textContent = 'Ratio check (' + (r.basis === 'ion' ? 'ion masses, as in the spreadsheet' : 'element masses') + ', tolerance ±' + fixed(r.tol * 100, 1) + '%)';

    // Results list
    $('r-nfeed').textContent = r.ok ? fixed(r.nAvail * pf, 2) + ' g N per ' + pfl : '–';
    $('r-nwaste').textContent = r.prot > 0 && r.fcr > 0 ? fixed(r.nFedFish, 1) + ' fed · ' + fixed(r.nWasteFish, 1) + ' waste g N/kg fish' : '–';
    $('r-pfeed').textContent = r.fcr > 0 ? fixed(r.pAvail * pf, 3) + ' g P per ' + pfl : '–';
    $('r-solid').textContent = r.prot > 0 ? fixed(r.nSolid * pf, 2) + ' g N, ' + fixed(r.pSolid * pf, 2) + ' g P per ' + pfl + (r.solids === 'total' ? ' (counted: remineralised)' : ' (removed)') : '–';
    $('r-nday').textContent = r.ok && r.feed > 0 ? sig(r.nAvail * r.feed) + ' g N/day' : '–';
    $('r-cl').textContent = ok ? massOut(r.cl * pf) + ' per ' + pfl : '–';
    $('r-si').textContent = ok && r.si > 0 ? massOut(r.si * pf) + ' Si per ' + pfl + (r.feed > 0 ? ' · ' + massOut(r.si * r.feed) + '/day' : '') : 'none (tick potassium silicate)';
    $('r-cost').textContent = ok && r.costAny
      ? (r.costKnown ? '' : 'priced salts only: ') + fixed(r.cost * pf, 2) + ' per ' + pfl + (r.feed > 0 ? ' · ' + fixed(r.cost * r.feed, 2) + ' per day' : '') + (r.blend > 0 ? ' · ' + fixed(r.cost / r.blend * 1000, 2) + ' per kg blend' : '')
      : 'enter prices to see';
    $('r-alk-sup').textContent = ok ? sig(r.alkSupplied * pf) + ' g CaCO₃ per ' + pfl : '–';
    $('r-alk-use').textContent = r.ok ? sig(r.alkUsed * pf) + ' g CaCO₃ per ' + pfl : '–';
    $('r-alk-up').textContent = r.ok ? 'up to ' + sig(r.alkUptake * pf) + ' g CaCO₃ per ' + pfl : '–';
    const bal = r.alkSupplied - r.alkUsed;
    $('r-alk-bal').textContent = ok ? (bal >= 0 ? '+' : '−') + sig(Math.abs(bal) * pf) + ' g CaCO₃ per ' + pfl + ' (' + fixed(r.alkUsed > 0 ? r.alkSupplied / r.alkUsed * 100 : 0, 0) + '% of nitrification)' : '–';

    // Plants supported
    const ct = $('crop-table');
    clear(ct);
    CROPS.forEach(function (c) {
      const use = CalcUnits.base('cn_' + c.id); // mg N/plant/day
      const nday = r.nAvail * r.feed; // g/day
      addRow(ct, [c.name, use > 0 ? sig(use) + ' mg' : '–', r.ok && r.feed > 0 && use > 0 ? Math.floor(nday / (use / 1000) + 1e-9).toLocaleString() : '–']);
    });

    $('viz-caption').textContent = ok
      ? 'Blend ' + sig(r.blend * pf) + ' g per ' + pfl + ' · ' + (off.under.length || off.over.length ? 'not every nutrient within ±' + fixed(r.tol * 100, 0) + '%' : 'all nutrients within ±' + fixed(r.tol * 100, 0) + '% of target') + ' · base covers ' + fixed(r.alkUsed > 0 ? r.alkSupplied / r.alkUsed * 100 : 0, 0) + '% of nitrification'
      : 'Enter the feed and tick salts to draw the chart';
    drawViz(r, ok);
    CalcShare.writeParams(getState());
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function addRow(tb, cells, cls) {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    cells.forEach(function (t) { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    tb.appendChild(tr);
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
    clear(svg);
    const x0 = 40, x1 = 360, W = x1 - x0, MAXP = 1.5;
    const sx = function (f) { return x0 + Math.min(Math.max(f, 0), MAXP) / MAXP * W; };
    text(8, 16, 'Each nutrient: fish waste + water + buffer vs target', 'start', { 'font-weight': 600 });
    el('rect', { x: 8, y: 24, width: 10, height: 10, rx: 2, fill: 'var(--water-deep)' });
    text(22, 33, 'fish waste');
    el('rect', { x: 98, y: 24, width: 10, height: 10, rx: 2, fill: 'var(--tank-back)' });
    text(112, 33, 'water');
    el('rect', { x: 162, y: 24, width: 10, height: 10, rx: 2, fill: 'var(--accent)' });
    text(176, 33, 'buffer');
    el('line', { x1: 232, y1: 23, x2: 232, y2: 35, stroke: 'var(--text)', 'stroke-width': 2 });
    text(238, 33, 'target');
    text(VW - 8, 33, 'g / kg feed', 'end');
    const top = 44, rh = 22;
    NUT.forEach(function (e, i) {
      const y = top + i * rh;
      const t = r.target[e.id];
      text(x0 - 6, y + 15, e.el, 'end', { fill: 'var(--text)', 'font-weight': 600 });
      el('rect', { x: x0, y: y + 4, width: W, height: rh - 8, rx: 3, fill: 'var(--surface-2)' });
      if (r.ok && t > 0) {
        const f1 = r.fish[e.id] / t, f2 = f1 + r.water[e.id] / t, f3 = f2 + r.buffer[e.id] / t;
        if (sx(f1) > x0) el('rect', { x: x0, y: y + 4, width: sx(f1) - x0, height: rh - 8, fill: 'var(--water-deep)' });
        if (sx(f2) > sx(f1)) el('rect', { x: sx(f1), y: y + 4, width: sx(f2) - sx(f1), height: rh - 8, fill: 'var(--tank-back)' });
        if (sx(f3) > sx(f2)) el('rect', { x: sx(f2), y: y + 4, width: sx(f3) - sx(f2), height: rh - 8, fill: 'var(--accent)' });
        if (f3 > MAXP) text(x1 - 4, y + 15, '▸', 'end', { fill: 'var(--surface)' });
        const bad = Math.abs(f3 - 1) > r.tol;
        text(VW - 8, y + 15, sig(r.total[e.id]) + ' / ' + sig(t), 'end', bad ? { fill: 'var(--warn-text)', 'font-weight': 700 } : undefined);
      } else text(VW - 8, y + 15, '–', 'end');
    });
    const yEnd = top + NUT.length * rh;
    el('line', { x1: sx(1), y1: top, x2: sx(1), y2: yEnd + 2, stroke: 'var(--text)', 'stroke-width': 2 });
    [0, 0.5, 1, 1.5].forEach(function (f) {
      el('path', { class: 'dim', d: 'M' + sx(f) + ',' + (yEnd + 2) + ' v4' });
      text(sx(f), yEnd + 17, fixed(f * 100, 0) + '%', 'middle');
    });

    // Blend composition
    const sTop = yEnd + 44;
    const used = ok ? r.salts.filter(function (x) { return x.g > 1e-9; }) : [];
    text(8, sTop, 'Dry blend composition (% by weight)', 'start', { 'font-weight': 600 });
    text(VW - 8, sTop, ok ? sig(r.blend) + ' g / kg feed' : '', 'end');
    const by = sTop + 8, bh = 26, bw = VW - 16;
    el('rect', { x: 8, y: by, width: bw, height: bh, rx: 6, fill: 'var(--surface-2)' });
    let x = 8;
    used.forEach(function (u, i) {
      const w = u.g / r.blend * bw;
      el('rect', { x: x, y: by, width: Math.max(w, 0), height: bh, fill: COLORS[i % COLORS.length], stroke: 'var(--surface)', 'stroke-width': 1 });
      if (w > 22) el('text', { x: x + w / 2, y: by + 17, 'text-anchor': 'middle', fill: 'var(--surface)', 'font-size': 12, 'font-weight': 700, 'font-family': 'var(--font)' }, String(i + 1));
      x += w;
    });
    used.forEach(function (u, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const lx = 8 + col * 236, ly = by + bh + 18 + row * 18;
      el('rect', { x: lx, y: ly - 10, width: 11, height: 11, rx: 2, fill: COLORS[i % COLORS.length] });
      text(lx + 15, ly, (i + 1) + ' ' + u.s.formula + ' ' + fixed(u.g / r.blend * 100, 1) + '%');
    });
    if (!used.length) text(VW / 2, by + 17, 'No salts in the blend', 'middle');

    // Alkalinity
    const aTop = by + bh + 18 + Math.max(1, Math.ceil(used.length / 2)) * 18 + 22;
    text(8, aTop, 'Alkalinity, g CaCO₃ per kg feed', 'start', { 'font-weight': 600 });
    const maxA = Math.max(r.alkUsed, r.alkSupplied, 1e-9);
    const ax0 = 120, aW = 260;
    const bars = [
      ['Nitrification', r.alkUsed, 'var(--warn-text)'],
      ['Buffer blend', ok ? r.alkSupplied : 0, 'var(--accent)'],
      ['Plant NO₃ uptake', r.alkUptake, 'var(--water-deep)']
    ];
    bars.forEach(function (b, i) {
      const y = aTop + 10 + i * 22;
      text(ax0 - 6, y + 13, b[0], 'end', { fill: 'var(--text)' });
      el('rect', { x: ax0, y: y + 3, width: aW, height: 14, rx: 3, fill: 'var(--surface-2)' });
      const w = r.ok ? Math.min(b[1] / maxA, 1.6) * aW / 1.0 : 0;
      if (w > 0) el('rect', { x: ax0, y: y + 3, width: Math.min(w, aW), height: 14, rx: 3, fill: b[2], 'fill-opacity': i === 2 ? 0.45 : 1 });
      text(VW - 8, y + 13, r.ok ? (i === 0 ? '−' : i === 2 ? 'up to +' : '+') + sig(b[1]) : '–', 'end');
    });
    const end = aTop + 10 + 3 * 22 + 6;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + end);
  }

  // ---------- State ----------
  const UNIT_INPUTS = ['feed', 'nret', 'pret', 'wvol'].concat(NUT.map(function (e) { return 'r_' + e.id; }), WATER.map(function (k) { return 'w_' + k; }), CROPS.map(function (c) { return 'cn_' + c.id; }));
  const PLAIN_INPUTS = ['prot', 'pfeed', 'fcr', 'sn', 'sp', 'tol', 'alkf', 'ks_k2o', 'ks_sio2', 'ks_si'];
  const SELECTS = ['solids', 'preset', 'basis', 'perfeed'];
  function getState() {
    const st = {};
    SELECTS.forEach(function (id) { st[id] = $(id).value; });
    PLAIN_INPUTS.forEach(function (id) { st[id] = $(id).value; });
    UNIT_INPUTS.forEach(function (id) { st[id] = $(id).value; st[id + '_u'] = CalcUnits.unit(id); });
    SALTS.forEach(function (s) {
      st['use_' + s.key] = $('use_' + s.key).checked ? 1 : 0;
      st['pct_' + s.key] = $('pct_' + s.key).value;
      if ($('price_' + s.key).value !== '') { st['price_' + s.key] = $('price_' + s.key).value; st['price_' + s.key + '_u'] = CalcUnits.unit('price_' + s.key); }
    });
    st.mout = $('mout').value;
    return st;
  }
  function applyDefaults() {
    ['solids', 'preset', 'basis', 'perfeed'].forEach(function (id) { $(id).value = DEFAULTS[id]; });
    PLAIN_INPUTS.forEach(function (id) { $(id).value = DEFAULTS[id]; });
    ['feed', 'nret', 'pret', 'wvol'].forEach(function (id) { CalcUnits.set(id, DEFAULTS[id][0], DEFAULTS[id][1]); });
    applyPreset(DEFAULTS.preset);
    WATER.forEach(function (k) { CalcUnits.set('w_' + k, 0, 'mgL'); });
    CROPS.forEach(function (c) { CalcUnits.set('cn_' + c.id, c.n, 'mgpd'); });
    SALTS.forEach(function (s) {
      $('use_' + s.key).checked = DEFAULT_USE.indexOf(s.key) >= 0;
      $('pct_' + s.key).value = s.pct;
      CalcUnits.set('price_' + s.key, '', 'kg');
    });
    $('mout').value = DEFAULTS.mout; $('mout').dataset.prev = DEFAULTS.mout;
  }
  function hasOption(sel, v) { return Array.prototype.some.call(sel.options, function (o) { return o.value === v; }); }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const pf = perFeedFactor(), pfl = perFeedLabel();
    const L = ['Aquaponic Buffer Blend Calculator (after W. Lennard\'s buffer formulation model)'];
    L.push('Feed: ' + $('prot').value + '% protein, ' + $('pfeed').value + '% P, FCR ' + $('fcr').value + ', ' + $('feed').value + ' ' + CalcUnits.unitLabel('feed'));
    L.push('Retained by fish: ' + $('nret').value + ' ' + CalcUnits.unitLabel('nret') + ' N, ' + $('pret').value + ' ' + CalcUnits.unitLabel('pret') + ' P');
    L.push('Plant-available N and P: ' + (r.solids === 'total' ? 'total waste (solids remineralised)' : 'dissolved only (solids removed: ' + r.sn + '% of N fed, ' + r.sp + '% of P fed)'));
    L.push('Reference (' + $('preset').options[$('preset').selectedIndex].text + ', read as ' + (r.basis === 'ion' ? 'ions [spreadsheet compatibility]' : 'elements') + '): ' +
      NUT.map(function (e) { return sym(e.id, r.basis) + ' ' + sig(r.raw[e.id]); }).join(', ') + ' mg/L');
    L.push('Plant-available N: ' + fixed(r.nAvail, 2) + ' g per kg feed');
    L.push('Blend per ' + pfl + ':');
    r.salts.forEach(function (x) {
      if (!(x.g > 1e-9)) return;
      L.push('  ' + x.s.name + ' (' + x.s.formula + '): ' + massOut(x.g * pf) + (r.feed > 0 ? ', ' + massOut(x.g * r.feed) + '/day' : '') + ', ' + fixed(x.g / r.blend * 100, 1) + '% of blend');
    });
    L.push('  Total: ' + massOut(r.blend * pf) + (r.feed > 0 ? ', ' + massOut(r.blend * r.feed) + '/day' : ''));
    L.push('How to mix it:');
    mixPlan(r.salts.filter(function (x) { return x.g > 1e-9; })).forEach(function (c, i) {
      const tot = c.salts.reduce(function (a, x) { return a + x.g; }, 0);
      L.push('  ' + (i + 1) + '. ' + c.name + ' (' + massOut(tot * pf) + ' per ' + pfl + '): ' + c.salts.map(function (x) { return x.s.formula; }).join(' + '));
    });
    L.push('Supplied vs target, g per kg feed (elements):');
    NUT.forEach(function (e) { L.push('  ' + e.el + ': ' + g2(r.total[e.id]) + ' / ' + g2(r.target[e.id])); });
    L.push('Chloride added: ' + g2(r.cl) + ' g per kg feed');
    if (r.si > 0) L.push('Silicon dosed: ' + g2(r.si) + ' g Si per kg feed (potassium silicate)');
    L.push('Alkalinity: blend ' + sig(r.alkSupplied) + ', nitrification uses ' + sig(r.alkUsed) + ' g CaCO3 per kg feed (plant nitrate uptake may return up to ' + sig(r.alkUptake) + '). Measure pH.');
    L.push(CalcShare.buildUrl(getState()));
    return L.join('\n');
  }

  // ---------- Events ----------
  buildSaltList();
  buildCrops();
  CalcUnits.init(render);
  document.querySelectorAll('input').forEach(function (i) {
    i.addEventListener('input', function () {
      if (i.id.indexOf('r_') === 0) $('preset').value = 'custom';
      render();
    });
    if (i.type === 'checkbox') i.addEventListener('change', render);
  });
  $('preset').addEventListener('change', function () { applyPreset($('preset').value); render(); });
  $('basis').addEventListener('change', function () {
    const prev = $('basis').dataset.prev || 'el';
    const now = $('basis').value;
    if (PRESETS[$('preset').value]) applyPreset($('preset').value);
    else if (prev !== now) {
      // Custom values: keep the same physical solution when switching the reading.
      ['n', 'p', 's'].forEach(function (k) {
        const v = num('r_' + k);
        if (isFinite(v)) $('r_' + k).value = +(now === 'ion' ? v * ION_F[k] : v / ION_F[k]).toPrecision(5);
      });
    }
    $('basis').dataset.prev = now;
    render();
  });
  ['solids', 'perfeed'].forEach(function (id) { $(id).addEventListener('change', render); });

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Aquaponic Buffer Blend Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); $('basis').dataset.prev = DEFAULTS.basis; render(); });

  // ---------- Init from URL ----------
  (function init() {
    applyDefaults();
    const p = CalcShare.readParams();
    SELECTS.forEach(function (id) { if (p[id] !== undefined && hasOption($(id), p[id])) $(id).value = p[id]; });
    $('basis').dataset.prev = $('basis').value;
    if (PRESETS[$('preset').value]) applyPreset($('preset').value);
    PLAIN_INPUTS.forEach(function (id) {
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) $(id).value = p[id];
      else if (p[id] === '') $(id).value = '';
    });
    UNIT_INPUTS.concat(SALTS.map(function (s) { return 'price_' + s.key; })).forEach(function (id) {
      const u = p[id + '_u'];
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) CalcUnits.set(id, p[id], u);
      else if (p[id] === '') CalcUnits.set(id, '', u);
      else if (u) CalcUnits.set(id, $(id).value, u);
    });
    SALTS.forEach(function (s) {
      if (p['use_' + s.key] === '1' || p['use_' + s.key] === '0') $('use_' + s.key).checked = p['use_' + s.key] === '1';
      if (p['pct_' + s.key] !== undefined && isFinite(parseFloat(p['pct_' + s.key]))) $('pct_' + s.key).value = p['pct_' + s.key];
    });
    if (p.mout && hasOption($('mout'), p.mout)) { $('mout').value = p.mout; $('mout').dataset.prev = p.mout; }
    render();
  })();
})();
