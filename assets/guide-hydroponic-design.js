// Guided design: a hydroponic system, step by step (crop and system type → plants and layout →
// solution volume → nutrients → pH and iron → root-zone oxygen → flow and pump → lighting →
// UV → backup power → reservoir drain-back → design sheet). Uses the CalcGuide framework
// (assets/guide.js). Every formula, constant, preset and rule-of-thumb band is copied from the
// calculator it comes from (named next to each block) so the guide and the calculators agree.
(function () {
  'use strict';

  const G = CalcGuide;
  const fmt = G.fmt, q = G.q, p = G.p;
  const GRAV = 9.80665;                  // m/s², standard gravity (NIST SP 811)
  const RHO_PUMP = 998.2;                // kg/m³, as pump-turnover.js
  const WATER_KG_PER_L = 0.998;          // grow-bed-volume.js / growing-media-fill.js (USGS, 20 °C)
  const IN = 0.0254;
  const FT2 = 0.09290304;
  const GAL = 3.785411784;               // L per US gallon (units.js)

  // ---------- Unit group units.js does not have (exactly as ph-adjustment.js) ----------
  const MG_CACO3_PER_MEQ = 50.04;
  if (!CalcUnits.GROUPS.alkalinity) {
    CalcUnits.GROUPS.alkalinity = {
      base: 'caco3',
      units: [
        { id: 'caco3', label: 'mg/L CaCO₃', factor: 1 },
        { id: 'meq', label: 'meq/L', factor: MG_CACO3_PER_MEQ },
        { id: 'hco3', label: 'mg/L HCO₃⁻', factor: MG_CACO3_PER_MEQ / 61.017 },
        { id: 'dkh', label: '°dKH', factor: MG_CACO3_PER_MEQ * 2 * 10 / 56.077 }
      ]
    };
  }

  // ---------- Crops ----------
  // Spacing / density: FAO TP 589 Appendix 1, exactly as grow-bed-volume.js (spacing in cm).
  // EC: Oklahoma State HLA-6722 optimum ranges as nutrient-ec.js (tomato = grower rule of thumb).
  // DLI group: the crop keys of daily-light-integral.js.
  const CROPS = {
    lettuce: { name: 'Lettuce', spacing: 20, min: 20, max: 25, range: '18–30 cm, 20–25 heads per m²', ecLo: 1.2, ecHi: 1.8, ecNote: 'Oklahoma State HLA-6722 optimum range', dli: 'lettuce' },
    basil: { name: 'Basil', spacing: 20, min: 8, max: 40, range: '15–25 cm, 8–40 plants per m²', ecLo: 1.0, ecHi: 1.6, ecNote: 'Oklahoma State HLA-6722 optimum range', dli: 'herbs' },
    tomato: { name: 'Tomato', spacing: 50, min: 3, max: 5, range: '40–60 cm, 3–5 plants per m²', ecLo: 2.0, ecHi: 4.0, ecNote: 'widely quoted grower range, not from HLA-6722', dli: 'fruiting' },
    custom: { name: 'Other crop', spacing: null, min: null, max: null, range: '', ecLo: null, ecHi: null, ecNote: '', dli: 'custom' }
  };
  function crop(ctx) { return CROPS[ctx.v.crop] || CROPS.custom; }

  const SYSTEMS = {
    dwc: { name: 'Deep water culture (floating rafts)', short: 'DWC rafts' },
    nft: { name: 'Nutrient film technique (NFT channels)', short: 'NFT' },
    media: { name: 'Media beds (flood and drain)', short: 'Media beds' },
    drip: { name: 'Drip to slabs or Dutch buckets', short: 'Drip' }
  };
  function sys(ctx) { return ctx.v.sys; }
  // Plain-language comparison (FAO TP 589 ch. 4; Maucieri et al. 2019; grow-bed-volume.html).
  const COMPARE = {
    dwc: { water: 'Large: canals about 30 cm deep buffer temperature and nutrients', air: 'Needed: roots sit in the solution, so air pumps run all the time', best: 'Lettuce, leafy greens and herbs (light plants a raft can carry)', stop: 'Roots stay wet; aeration is what must keep running' },
    nft: { water: 'Very little in the channels; most of it is in the reservoir', air: 'Usually none: the upper roots are in air above a thin film', best: 'Lettuce, leafy greens and herbs', stop: 'The film stops at once and roots can dry out; keep the pump on backup' },
    media: { water: 'Moderate: the beds flood and drain through gravel or clay', air: 'Draining pulls air into the media', best: 'Mixed crops, including fruiting plants in 30 cm beds', stop: 'Wet media buffers the plants for a while' },
    drip: { water: 'Held in slabs or buckets; the solution waits in the reservoir', air: 'Air reaches roots through the substrate between irrigations', best: 'Tomato, cucumber, pepper and other fruiting crops', stop: 'The substrate holds some water between irrigations' }
  };

  // ---------- Nutrient EC (nutrient-ec.js: Kohlrausch, PHREEQC/aqion λ°, ×0.90) ----------
  const IONS = [
    { id: 'no3', mw: 14.007, lambda: 71.4 }, { id: 'nh4', mw: 14.007, lambda: 74.4 }, { id: 'p', mw: 30.97, lambda: 31.8 },
    { id: 'k', mw: 39.10, lambda: 73.6 }, { id: 'ca', mw: 40.08, lambda: 119.1 }, { id: 'mg', mw: 24.31, lambda: 105.1 },
    { id: 's', mw: 32.06, lambda: 160.7 }, { id: 'na', mw: 22.99, lambda: 50.0 }, { id: 'cl', mw: 35.45, lambda: 76.2 },
    { id: 'hco3', mw: 61.02, lambda: 44.3 }, { id: 'mn', mw: 54.94, lambda: 103.4 }, { id: 'zn', mw: 65.38, lambda: 107.4 },
    { id: 'cu', mw: 63.55, lambda: 110.1 }, { id: 'mo', mw: 95.96, lambda: 298.0 }, { id: 'fe', mw: 55.85, lambda: 0 }, { id: 'b', mw: 10.81, lambda: 0 }
  ];
  const EC_CORRECTION = 0.90;
  // Hoagland & Arnon (1950) No. 2, mg/L (the nutrient-ec.js preset).
  const HOAG = { no3: 196.1, nh4: 14.0, p: 31.0, k: 234.6, ca: 160.3, mg: 48.6, s: 64.1, na: 0, cl: 0.65, hco3: 0,
    mn: 0.5, zn: 0.05, cu: 0.02, mo: 0.01, fe: 1, b: 0.5 };
  function theoEC(ions) {
    return IONS.reduce(function (s, ion) { return s + ion.lambda * (ions[ion.id] || 0) / ion.mw / 1000; }, 0);
  }
  const EC_FULL = theoEC(HOAG) * EC_CORRECTION;       // 2.302 mS/cm, as the Nutrient EC page
  // Hoagland No. 2 macronutrient salts, mmol/L at full strength (= mL of each 1 M stock per litre),
  // as stated on the Nutrient EC page. Molar masses from IUPAC 2021 standard atomic weights.
  const AW = { H: 1.008, N: 14.007, O: 15.999, P: 30.974, K: 39.098, Ca: 40.078, Mg: 24.305, S: 32.06 };
  const H2O = 2 * AW.H + AW.O;
  const SALTS = [
    { name: 'Potassium nitrate, KNO₃', mM: 6, mw: AW.K + AW.N + 3 * AW.O },
    { name: 'Calcium nitrate, Ca(NO₃)₂·4H₂O', mM: 4, mw: AW.Ca + 2 * (AW.N + 3 * AW.O) + 4 * H2O },
    { name: 'Ammonium dihydrogen phosphate, NH₄H₂PO₄', mM: 1, mw: AW.N + 6 * AW.H + AW.P + 4 * AW.O },
    { name: 'Magnesium sulfate, MgSO₄·7H₂O', mM: 2, mw: AW.Mg + AW.S + 4 * AW.O + 7 * H2O }
  ];

  // ---------- pH adjustment (ph-adjustment.js: carbonate system) ----------
  const ACIDS = {
    phos75: { name: '75% phosphoric acid', short: 'H₃PO₄ 75%', w: 0.75, rho: 1.579, mw: 97.994, pKa: [2.16, 7.21, 12.32], nut: 'P', nutMw: 30.974 },
    phos85: { name: '85% phosphoric acid', short: 'H₃PO₄ 85%', w: 0.85, rho: 1.685, mw: 97.994, pKa: [2.16, 7.21, 12.32], nut: 'P', nutMw: 30.974 },
    nitric67: { name: '67% nitric acid', short: 'HNO₃ 67%', w: 0.67, rho: 1.40, mw: 63.012, pKa: [-1.4], nut: 'N', nutMw: 14.007 },
    sulf35: { name: '35% sulfuric acid', short: 'H₂SO₄ 35%', w: 0.35, rho: 1.26, mw: 98.079, pKa: [-3, 1.99], nut: 'S', nutMw: 32.06 },
    sulf93: { name: '93% sulfuric acid', short: 'H₂SO₄ 93%', w: 0.93, rho: 1.83, mw: 98.079, pKa: [-3, 1.99], nut: 'S', nutMw: 32.06 },
    citric: { name: 'citric acid (anhydrous powder)', short: 'citric acid', w: 1, rho: null, mw: 192.12, pKa: [3.13, 4.76, 6.40], nut: null, nutMw: 0 }
  };
  const ACID_LABELS = { phos75: 'Phosphoric acid 75%', phos85: 'Phosphoric acid 85%', nitric67: 'Nitric acid 67%', sulf35: 'Sulfuric acid 35% (battery acid)', sulf93: 'Sulfuric acid 93%', citric: 'Citric acid, anhydrous (powder)' };
  function carbConstants(tC) {
    const T = tC + 273.15, L = Math.log10;
    const logK1 = -356.3094 - 0.06091964 * T + 21834.37 / T + 126.8339 * L(T) - 1684915 / (T * T);
    const logK2 = -107.8871 - 0.03252849 * T + 5151.79 / T + 38.92561 * L(T) - 563713.9 / (T * T);
    const pKw = 4470.99 / T - 6.0875 + 0.01706 * T;
    return { pK1: -logK1, pK2: -logK2, pKw: pKw, K1: Math.pow(10, logK1), K2: Math.pow(10, logK2), Kw: Math.pow(10, -pKw) };
  }
  function alphas(H, c) { const D = H * H + H * c.K1 + c.K1 * c.K2; return { a0: H * H / D, a1: H * c.K1 / D, a2: c.K1 * c.K2 / D }; }
  function alkAt(pH, CT, c) { const H = Math.pow(10, -pH); const a = alphas(H, c); return CT * (a.a1 + 2 * a.a2) + c.Kw / H - H; }
  function protonsPerMolecule(acid, pH) {
    const H = Math.pow(10, -pH);
    const K = acid.pKa.map(function (x) { return Math.pow(10, -x); });
    const n = K.length;
    const terms = [Math.pow(H, n)];
    let prod = 1;
    for (let i = 0; i < n; i++) { prod *= K[i]; terms.push(prod * Math.pow(H, n - i - 1)); }
    let sum = 0, wsum = 0;
    terms.forEach(function (t, i) { sum += t; wsum += i * t; });
    return wsum / sum;
  }
  // Same steps as compute() in ph-adjustment.js (base units: L, mg/L CaCO₃, °C).
  function acidDose(volL, alk, ph0, ph1, tC, acid) {
    const c = carbConstants(Math.min(50, Math.max(0, tC)));
    const r = { ok: false, acid: acid, c: c };
    if (!(volL > 0) || !(alk >= 0) || !fin(ph0) || !fin(ph1)) return r;
    const alkEq = alk / MG_CACO3_PER_MEQ / 1000;
    const H0 = Math.pow(10, -ph0);
    const a0 = alphas(H0, c);
    let CT = (alkEq - c.Kw / H0 + H0) / (a0.a1 + 2 * a0.a2);
    if (!(CT > 0)) CT = 0;
    r.alkEq = alkEq; r.CT = CT; r.ok = true;
    r.nbar = protonsPerMolecule(acid, ph1);
    if (ph1 >= ph0) { r.noAcid = true; r.acidEq = 0; r.alkLeftEq = alkEq; r.gProduct = 0; r.mL = acid.rho ? 0 : null; r.nutMgL = 0; return r; }
    r.alkLeftEq = alkAt(ph1, CT, c);
    r.acidEq = Math.max(0, alkEq - r.alkLeftEq);
    r.molAcidL = r.acidEq / r.nbar;
    r.gPure = r.molAcidL * volL * acid.mw;
    r.gProduct = r.gPure / acid.w;
    r.mL = acid.rho ? r.gProduct / acid.rho : null;
    r.nutMgL = acid.nut ? r.molAcidL * acid.nutMw * 1000 : 0;
    return r;
  }

  // ---------- Iron (iron-addition.js) ----------
  const FE_PRODUCTS = {
    dtpa: { name: 'Fe-DTPA', pct: 11, phMax: 7.5, label: 'Fe-DTPA chelate (typ. 11% Fe)' },
    eddha: { name: 'Fe-EDDHA', pct: 6, phMax: 9.0, label: 'Fe-EDDHA chelate (typ. 6% Fe)' },
    edta: { name: 'Fe-EDTA', pct: 13, phMax: 6.5, label: 'Fe-EDTA chelate (typ. 13% Fe)' },
    fes: { name: 'ferrous sulfate', pct: 20.1, phMax: 6.0, label: 'Ferrous sulfate heptahydrate (20.1% Fe, not chelated)' }
  };
  const FE_NEAR = 0.3;
  const FE_BAND = { lo: 1, hi: 3 };     // hydroponics band, iron-addition.js (rule of thumb)
  function phCheck(key, ph) {
    const pr = FE_PRODUCTS[key];
    if (ph > pr.phMax) return { level: 'bad', text: 'Not stable above pH ' + fmt(pr.phMax, 1) };
    if (ph > pr.phMax - FE_NEAR) return { level: 'near', text: 'Near limit (pH ' + fmt(pr.phMax, 1) + ')' };
    return { level: 'ok', text: 'OK (stable to ~pH ' + fmt(pr.phMax, 1) + ')' };
  }

  // ---------- Dissolved oxygen (dissolved-oxygen.js: Benson & Krause 1984 / USGS 2011) ----------
  function c0(t) {
    const T = t + 273.15;
    return Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / (T * T) + 1.243800e10 / Math.pow(T, 3) - 8.621949e11 / Math.pow(T, 4));
  }
  function salFactor(t, S) { const T = t + 273.15; return Math.exp(-S * (0.017674 - 10.754 / T + 2140.7 / (T * T))); }
  function vaporAtm(t) { const T = t + 273.15; return Math.exp(11.8571 - 3840.70 / T - 216961 / (T * T)); }
  function pressFactor(t, Patm) {
    const u = vaporAtm(t);
    const th = 0.000975 - 1.426e-5 * t + 6.436e-8 * t * t;
    return Patm * (1 - u / Patm) * (1 - th * Patm) / ((1 - u) * (1 - th));
  }
  function pressureFromElevation(h) { return 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588); }
  function csat(t, elev) {
    if (!(t >= 0 && t <= 40) || !(elev >= -500 && elev <= 6000)) return NaN;
    return c0(t) * salFactor(t, 0) * pressFactor(t, pressureFromElevation(elev) / 101325);
  }
  const DO_PLANT_MIN = 3;               // dissolved-oxygen.js "Hydroponic plants" (FAO TP 589 Table 3.1)

  // Air pumps (battery-life.js presets; nominal flow, read the pump curve at your depth).
  const AIR_PUMPS = {
    linear60: { name: 'Linear air pump 60 L/min (≈50 W)', lpm: 60, w: 50 },
    linear120: { name: 'Linear air pump 120 L/min (≈110 W)', lpm: 120, w: 110 }
  };

  // ---------- Pipes and head loss (head-loss.js / water-velocity.js; ASTM D1785 Schedule 40) ----------
  const PVC40 = [
    { id: '0.5', wv: '1/2', name: '½″', od: 0.840, wall: 0.109 },
    { id: '0.75', wv: '3/4', name: '¾″', od: 1.050, wall: 0.113 },
    { id: '1', wv: '1', name: '1″', od: 1.315, wall: 0.133 },
    { id: '1.25', wv: '1-1/4', name: '1¼″', od: 1.660, wall: 0.140 },
    { id: '1.5', wv: '1-1/2', name: '1½″', od: 1.900, wall: 0.145 },
    { id: '2', wv: '2', name: '2″', od: 2.375, wall: 0.154 },
    { id: '2.5', wv: '2-1/2', name: '2½″', od: 2.875, wall: 0.203 },
    { id: '3', wv: '3', name: '3″', od: 3.500, wall: 0.216 },
    { id: '4', wv: '4', name: '4″', od: 4.500, wall: 0.237 },
    { id: '6', wv: '6', name: '6″', od: 6.625, wall: 0.280 },
    { id: '8', wv: null, name: '8″', od: 8.625, wall: 0.322 }
  ];
  PVC40.forEach(function (x) { x.idIn = +(x.od - 2 * x.wall).toFixed(3); x.D = x.idIn * IN; });
  const WATER = [
    [0, 999.84, 1.7914], [5, 999.97, 1.5182], [10, 999.70, 1.3059], [15, 999.10, 1.1376],
    [20, 998.21, 1.0016], [25, 997.05, 0.8900], [30, 995.65, 0.7972], [35, 994.03, 0.7191],
    [40, 992.22, 0.6527], [45, 990.21, 0.5958], [50, 988.04, 0.5465]
  ];
  function water(tC) {
    const t = Math.min(50, Math.max(0, isFinite(tC) ? tC : 20));
    let i = 0;
    while (i < WATER.length - 2 && WATER[i + 1][0] < t) i++;
    const a = WATER[i], b = WATER[i + 1];
    const x = (t - a[0]) / (b[0] - a[0]);
    const rho = a[1] + (b[1] - a[1]) * x;
    const mu = Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * x) / 1000;
    return { rho: rho, mu: mu, nu: mu / rho };
  }
  const CRANE_FT_D = [0.01576, 0.02096, 0.02664, 0.03508, 0.04094, 0.05248, 0.06268,
    0.07792, 0.10226, 0.1282, 0.154, 0.20274, 0.25446, 0.33334, 0.381, 0.53994, 0.57504, 0.8759];
  const CRANE_FT = [0.026, 0.024, 0.022, 0.021, 0.020, 0.019, 0.018, 0.017, 0.016, 0.015, 0.015,
    0.014, 0.013, 0.013, 0.012, 0.012, 0.011, 0.011];
  function craneFT(D) {
    if (D <= CRANE_FT_D[0]) return CRANE_FT[0];
    const last = CRANE_FT_D.length - 1;
    if (D >= CRANE_FT_D[last]) return CRANE_FT[last];
    let i = 0;
    while (CRANE_FT_D[i + 1] < D) i++;
    const x = (D - CRANE_FT_D[i]) / (CRANE_FT_D[i + 1] - CRANE_FT_D[i]);
    return CRANE_FT[i] + (CRANE_FT[i + 1] - CRANE_FT[i]) * x;
  }
  function colebrook(Re, rel) {
    const sj = Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9));
    let x = 1 / Math.sqrt(0.25 / (sj * sj));
    for (let i = 0; i < 50; i++) {
      const nx = -2 * Math.log10(rel / 3.7 + 2.51 * x / Re);
      if (Math.abs(nx - x) < 1e-12) { x = nx; break; }
      x = nx;
    }
    return 1 / (x * x);
  }
  const EPS_PVC = 0.0015e-3;
  const FIT = { n90: 30, nTee: 20, nBall: 3, nCheck: 100 };
  const K_ENT = 0.5, K_EXIT = 1.0;

  // ---------- Lighting (daily-light-integral.js / light-fixture-layout.js) ----------
  const DLI_K = 3600 / 1e6;
  const DLI_CROPS = {
    lettuce: { name: 'Lettuce & leafy greens', lo: 12, hi: 17 },
    herbs: { name: 'Basil & culinary herbs', lo: 15, hi: 25 },
    fruiting: { name: 'Tomato & fruiting crops', lo: 20, hi: 30 },
    custom: { name: 'Custom target', lo: null, hi: null }
  };
  function dliCrop(ctx) { return DLI_CROPS[crop(ctx).dli] || DLI_CROPS.custom; }
  const FIXTURES = {
    led: { ppf: 1700, watts: 680, fl: 1.1, fw: 1.1, name: 'LED bar fixture (illustrative)', short: 'LED bar' },
    hps: { ppf: 1800, watts: 1060, fl: 0.65, fw: 0.5, name: 'HPS 1000 W double-ended (illustrative)', short: 'HPS 1000 W DE' },
    t5: { ppf: 230, watts: 230, fl: 1.2, fw: 0.6, name: 'T5 HO fluorescent, 4 × 54 W (illustrative)', short: 'T5 HO 4-lamp' },
    custom: { name: 'Custom (datasheet values)', short: 'Custom fixture' }
  };
  const SMH_MAX = 1.5;
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
  // Fixture count, grid and power: the same steps as compute() in light-fixture-layout.js.
  function lightLayout(o) {
    const r = { A: o.L * o.W, ok: false };
    if (!(r.A > 0) || !(o.hours > 0) || !(o.target > 0) || !(o.ppf > 0) || !(o.cu > 0) || !(o.mf > 0) || o.cu > 1 || o.mf > 1) return r;
    r.perFixture = o.ppf * o.cu * o.mf / r.A;
    r.exact = o.target / r.perFixture;
    r.n = Math.max(1, Math.ceil(r.exact - 1e-9));
    if (r.n > 1e6) { r.tooMany = true; return r; }
    const g = chooseGrid(r.n, o.L, o.W);
    r.rows = g.r; r.cols = g.c; r.m = g.r * g.c;
    r.sx = o.L / g.c; r.sy = o.W / g.r;
    r.ppfd = r.m * r.perFixture;
    r.dli = r.ppfd * o.hours * DLI_K;
    r.power = r.m * o.watts;
    r.kwhDay = r.power * o.hours / 1000;
    r.kwhYear = r.kwhDay * 365;
    r.ok = true;
    return r;
  }

  // ---------- UV (uv-sterilizer-sizing.js) ----------
  const UV_ORGS = [
    { id: 'bact', name: 'Bacterial fish pathogens (design dose)', dose: 30 },
    { id: 'isav', name: 'ISA virus, 3-log', dose: 7.7 },
    { id: 'crypto', name: 'Cryptosporidium, 3-log (drinking-water ref.)', dose: 12 },
    { id: 'ich', name: 'Ich free-swimming stages (rule of thumb)', dose: 100 },
    { id: 'noda', name: 'Nodavirus (AHNV), 3-log', dose: 105 },
    { id: 'virus4', name: 'Viruses, 4-log (EPA, adenovirus basis)', dose: 186 },
    { id: 'ipnv', name: 'IPN virus, 3-log', dose: 246 }
  ];
  function uvOrg(id) { return UV_ORGS.filter(function (o) { return o.id === id; })[0] || UV_ORGS[0]; }
  function waterFactor(uvtPct, gCm) {
    const a = -Math.log10(uvtPct / 100);
    const x = a * gCm;
    if (x < 1e-9) return 1;
    return (1 - Math.pow(10, -x)) / (x * Math.LN10);
  }

  // ---------- Battery (battery-life.js) ----------
  const CHEM = {
    agm: { name: 'AGM lead-acid', dod: 50, k: 1.25 },
    flooded: { name: 'Flooded lead-acid', dod: 50, k: 1.25 },
    lfp: { name: 'LiFePO4 (lithium iron phosphate)', dod: 80, k: 1.05 }
  };
  const RATE_H = 20;
  function runtimeFor(n, m) {
    const I = m.pBat / (n * m.V);
    const f = m.k > 1 && I > 0 ? Math.min(1, Math.pow(m.ratedI / I, m.k - 1)) : 1;
    return m.C * n * m.V * m.dod * f / m.pBat;
  }

  // ---------- Media (growing-media-fill.js / grow-bed-volume.js presets, typical values) ----------
  const BED_MEDIA = {
    clay: { name: 'Expanded clay (LECA)', por: 40, fill: 'leca' },
    lava: { name: 'Lava rock', por: 45, fill: 'lava' },
    gravel: { name: 'Gravel (siliceous)', por: 38, fill: 'gravel' },
    custom: { name: 'Custom media', por: null, fill: 'custom' }
  };
  const SUBSTRATES = {
    coir: { name: 'Coco coir (expanded)', por: 90 },
    rockwool: { name: 'Rockwool (slabs / cubes)', por: 95 },
    perlite: { name: 'Perlite (coarse)', por: 70 }
  };

  // ---------- Small helpers ----------
  function fin(x) { return typeof x === 'number' && isFinite(x); }
  function R(ctx, id) { return ctx.r[id] || {}; }
  function ceilTo(x, step) { return Math.ceil(x / step - 1e-9) * step; }
  function fit(len, s) { return s > 0 ? Math.floor(len / s + 1e-9) : 0; }     // grow-bed-volume.js
  function intCheck(label) { return function (x) { return Math.abs(x - Math.round(x)) > 1e-9 ? label + ' must be a whole number.' : ''; }; }
  function pctCheck(label, lo, hi) { return function (x) { return x < lo || x > hi ? label + ' must be between ' + lo + ' and ' + hi + '%.' : ''; }; }
  function money(n) { return fin(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'; }
  const volTxt = function (L) { return fin(L) ? q('volume', L, [L >= 10000 ? 'm3' : 'L', 'gal']) : '–'; };
  const areaTxt = function (a) { return fin(a) ? fmt(a, 1) + ' m² · ' + fmt(a / FT2, 0) + ' ft²' : '–'; };
  const lenTxt = function (m) { return q('length', m, ['m', 'ft']); };
  function flowTxt(Lps) { return !fin(Lps) ? '–' : Lps < 0.05 ? q('flow', Lps, ['Lph', 'gph'], 1) : q('flow', Lps, ['Lpm', 'm3ph', 'gpm']); }
  function hm(hours) {
    if (!fin(hours) || hours < 0) return '–';
    const mins = Math.round(hours * 60);
    if (mins < 60) return mins + ' min';
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  }
  function text(svg, x, y, t, anchor, cls, extra) {
    const a = { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return G.el(svg, 'text', a, t);
  }
  function arrow(svg, x1, y1, x2, y2) {
    G.el(svg, 'line', { class: 'g-arrow', x1: x1, y1: y1, x2: x2, y2: y2 });
    const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
    G.el(svg, 'path', { class: 'g-arrowhead', d: 'M' + x2 + ',' + y2 + ' L' + (x2 - s * Math.cos(a - 0.45)) + ',' + (y2 - s * Math.sin(a - 0.45)) +
      ' L' + (x2 - s * Math.cos(a + 0.45)) + ',' + (y2 - s * Math.sin(a + 0.45)) + 'Z' });
  }
  function hbars(svg, rows, opts) {
    const x0 = opts.x0 || 150, w = opts.w || 300, y0 = opts.y0 || 20, gap = opts.gap || 34, bh = opts.bh || 18;
    const max = opts.max || Math.max.apply(null, rows.map(function (r) { return fin(r.value) ? r.value : 0; }).concat([1e-12]));
    rows.forEach(function (r, i) {
      const y = y0 + i * gap;
      text(svg, x0 - 8, y + bh - 4, r.label, 'end', 'g-label');
      G.el(svg, 'rect', { class: 'g-track', x: x0, y: y, width: w, height: bh, rx: 3 });
      if (fin(r.value) && r.value > 0) {
        const bw = Math.max(2, Math.min(w, r.value / max * w * 0.6));
        G.el(svg, 'rect', { class: r.cls || 'g-bar', x: x0, y: y, width: bw, height: bh, rx: 3 });
        text(svg, x0 + bw + 6, y + bh - 5, r.text, 'start', 'g-label');
      } else {
        text(svg, x0 + 6, y + bh - 5, r.text || 'none', 'start', 'dim-text');
      }
    });
  }
  function rangeStatus(v, lo, hi) {
    if (!fin(v) || lo === null) return '';
    return v < lo - 1e-9 ? 'below' : v > hi + 1e-9 ? 'above' : 'within';
  }
  function plantDot(svg, cx, cy, r) { G.el(svg, 'circle', { class: 'g-media', cx: cx.toFixed(1), cy: cy.toFixed(1), r: r }); }

  // ---------- Shared derived values (used by later defaults, so computed from ctx.v) ----------
  function targetPlants(ctx) { const x = ctx.v; return x.plan === 'weekly' ? x.perWeek * x.weeks / 604800 : x.plants; }
  // System water held in the canals / channel film / flooded beds (L), drip: 0 (substrate not counted).
  function systemWater(ctx) {
    const x = ctx.v, s = sys(ctx);
    if (s === 'dwc') return x.canalL * x.canalW * x.dwcDepth * x.nCanals * 1000;
    if (s === 'nft') return x.chanWid * x.film * x.chanL * x.nChan * 1000;
    if (s === 'media') return x.bedL * x.bedW * x.bedDepth * x.nBeds * x.por / 100 * 1000;
    return 0;
  }
  function pipeOf(ctx) { return R(ctx, 'pump').pipe; }
  // Drain-back sources, the same items and formulas as sump-drainback.js.
  function drainRows(ctx) {
    const x = ctx.v, s = sys(ctx), rows = [];
    if (s === 'dwc') rows.push({ t: 'dwc', name: 'DWC canals (over outlet)', L: x.canalL * x.canalW * x.overHead * x.nCanals * 1000 });
    if (s === 'nft') rows.push({ t: 'nft', name: 'NFT channels (film)', L: x.nChan * x.chanL * x.chanWid * x.film * 1000 });
    if (s === 'media') rows.push({ t: 'media', name: 'Media beds (flooded)', L: x.bedL * x.bedW * x.bedDepth * x.por / 100 * x.nBeds * 1000 });
    const pp = pipeOf(ctx);
    rows.push({ t: 'pipe', name: 'Supply line', L: pp ? Math.PI * pp.D * pp.D / 4 * x.pipeLen * 1000 : NaN });
    if (x.otherDrain > 0) rows.push({ t: 'other', name: 'Other drain-back', L: x.otherDrain });
    return rows;
  }
  function drainTotal(ctx) { return drainRows(ctx).reduce(function (a, r) { return a + r.L; }, 0); }

  // ---------- Sources ----------
  const FAO589 = 'Somerville, C., Cohen, M., Pantanella, E., Stankus, A. &amp; Lovatelli, A. (2014). <em>Small-scale aquaponic food production: Integrated fish and plant farming</em>. FAO Fisheries and Aquaculture Technical Paper No. 589. Rome: FAO. Chapter 4 (media bed, NFT and DWC units), Table 3.1 and Appendix 1 (plant spacing). <a href="https://www.fao.org/3/i4021e/i4021e.pdf" rel="noopener" target="_blank">fao.org</a>';
  const SRC = {
    fao589: FAO589,
    maucieri2019: 'Maucieri, C., Nicoletto, C., van Os, E., Anseeuw, D., Van Havermaet, R. &amp; Junge, R. (2019). Hydroponic technologies. In S. Goddek, A. Joyce, B. Kotzen &amp; G. M. Burnell (Eds.), <em>Aquaponics Food Production Systems</em> (pp. 77–110). Cham: Springer (open access). <a href="https://doi.org/10.1007/978-3-030-15943-6_4" rel="noopener" target="_blank">doi:10.1007/978-3-030-15943-6_4</a>',
    cooper1979: 'Cooper, A. J. (1979). <em>The ABC of NFT: Nutrient Film Technique</em>. London: Grower Books.',
    osu6722: 'Singh, H. &amp; Dunn, B. (2016). <em>Electrical Conductivity and pH Guide for Hydroponics</em>. Oklahoma Cooperative Extension Service Fact Sheet HLA-6722. Oklahoma State University. <a href="https://extension.okstate.edu/fact-sheets/electrical-conductivity-and-ph-guide-for-hydroponics.html" rel="noopener" target="_blank">extension.okstate.edu</a>',
    stallknecht2025: 'Stallknecht, E. (2025). <em>Calculating and Using Daily Light Integral (DLI): An Introductory Guide</em>. Virginia Cooperative Extension, Virginia Tech, SPES-720NP. <a href="https://www.pubs.ext.vt.edu/SPES/spes-720/spes-720.html" rel="noopener" target="_blank">pubs.ext.vt.edu</a>',
    freeze1979: 'Freeze, R. A. &amp; Cherry, J. A. (1979). <em>Groundwater</em>. Englewood Cliffs, NJ: Prentice-Hall. Table 2.4, range of values of porosity.',
    abad2005: 'Abad, M., Fornes, F., Carrión, C., Noguera, V., Noguera, P., Maquieira, Á. &amp; Puchades, R. (2005). Physical properties of various coconut coir dusts compared to peat. <em>HortScience</em>, 40(7), 2138–2144. <a href="https://doi.org/10.21273/HORTSCI.40.7.2138" rel="noopener" target="_blank">doi:10.21273/HORTSCI.40.7.2138</a>',
    raviv2008: 'Raviv, M. &amp; Lieth, J. H. (Eds.) (2008). <em>Soilless Culture: Theory and Practice</em>. Amsterdam: Elsevier.',
    usgsdensity: 'U.S. Geological Survey, Water Science School. “Water Density.” <a href="https://www.usgs.gov/special-topics/water-science-school/science/water-density" rel="noopener" target="_blank">usgs.gov</a>',
    spes463: 'Virginia Cooperative Extension. <em>Hydroponic Production of Edible Crops: Nutrient Film Technique (NFT) Systems</em>. Publication SPES-463. Virginia Tech. <a href="https://pubs.ext.vt.edu/SPES/spes-463.html" rel="noopener" target="_blank">pubs.ext.vt.edu</a> (reservoir guidance of ¼ to 1 US gallon per plant; seen only in a search-result summary, the page itself could not be opened when this guide was written).',
    hoagland1950: 'Hoagland, D. R. &amp; Arnon, D. I. (1950). <em>The water-culture method for growing plants without soil</em>. California Agricultural Experiment Station Circular 347. Berkeley: University of California.',
    phreeqc2013: 'Parkhurst, D. L. &amp; Appelo, C. A. J. (2013). <em>Description of input and examples for PHREEQC version 3</em>. U.S. Geological Survey Techniques and Methods, book 6, chap. A43. <a href="https://pubs.usgs.gov/tm/06/a43/" rel="noopener" target="_blank">pubs.usgs.gov</a> (diffusion coefficients in <code>phreeqc.dat</code>).',
    aqion: 'aqion. “Table of Diffusion Coefficients” and “Electrical Conductivity based on Diffusion Coefficients.” <a href="https://www.aqion.de/sd/77?page=5" rel="noopener" target="_blank">aqion.de</a>',
    fernandez2020: 'Fernández, D. (2020). “Building a model to predict EC in hydroponic nutrient solutions.” <em>Science in Hydroponics</em>. <a href="https://scienceinhydroponics.com/2020/07/building-a-model-to-predict-ec-in-hydroponic-nutrient-solutions.html" rel="noopener" target="_blank">scienceinhydroponics.com</a>',
    iupac2022: 'Prohaska, T. et al. (2022). Standard atomic weights of the elements 2021 (IUPAC Technical Report). <em>Pure and Applied Chemistry</em>, 94(5), 573–600. <a href="https://www.ciaaw.org/atomic-weights.htm" rel="noopener" target="_blank">ciaaw.org</a>',
    bailey1997: 'Bailey, D. &amp; Bilderback, T. (1997). <em>Alkalinity Control for Irrigation Water Used in Nurseries and Greenhouses</em>. Horticulture Information Leaflet 558. Raleigh: North Carolina State University Cooperative Extension.',
    stumm1996: 'Stumm, W. &amp; Morgan, J. J. (1996). <em>Aquatic Chemistry: Chemical Equilibria and Rates in Natural Waters</em> (3rd ed.). New York: Wiley-Interscience.',
    plummer1982: 'Plummer, L. N. &amp; Busenberg, E. (1982). The solubilities of calcite, aragonite and vaterite in CO₂–H₂O solutions between 0 and 90 °C, and an evaluation of the aqueous model for the system CaCO₃–CO₂–H₂O. <em>Geochimica et Cosmochimica Acta</em>, 46(6), 1011–1040.',
    crc2016: 'Haynes, W. M. (ed.). <em>CRC Handbook of Chemistry and Physics</em> (97th ed., 2016). Boca Raton: CRC Press.',
    hershkowitz2025: 'Hershkowitz, J. A., Dey, M. G., Heins, R. &amp; Bugbee, B. (2025). Fertigation with Fe-EDTA, Fe-DTPA, and Fe-EDDHA chelates to prevent iron chlorosis of sensitive species in high-pH soilless media. <em>HortScience</em>, 60(3), 404–410. <a href="https://doi.org/10.21273/HORTSCI17892-24" rel="noopener" target="_blank">doi.org/10.21273/HORTSCI17892-24</a>',
    norvell1972: 'Norvell, W. A. (1972). Equilibria of metal chelates in soil solution. In J. J. Mortvedt, P. M. Giordano &amp; W. L. Lindsay (Eds.), <em>Micronutrients in Agriculture</em> (pp. 115–138). Madison, WI: Soil Science Society of America.',
    lindsay1979: 'Lindsay, W. L. (1979). <em>Chemical Equilibria in Soils</em>. New York: John Wiley &amp; Sons.',
    stummlee1961: 'Stumm, W. &amp; Lee, G. F. (1961). Oxygenation of ferrous iron. <em>Industrial &amp; Engineering Chemistry</em>, 53(2), 143–146.',
    usgs2011: 'U.S. Geological Survey (2011). <em>Change to solubility equations for oxygen in water</em>. Office of Water Quality Technical Memorandum 2011.03. <a href="https://water.usgs.gov/admin/memo/QW/qw11.03.pdf" rel="noopener" target="_blank">water.usgs.gov</a>',
    benson1984: 'Benson, B. B. &amp; Krause, D., Jr. (1984). The concentration and isotopic fractionation of oxygen dissolved in freshwater and seawater in equilibrium with the atmosphere. <em>Limnology and Oceanography</em>, 29(3), 620–632.',
    stdatm: 'National Oceanic and Atmospheric Administration, National Aeronautics and Space Administration &amp; U.S. Air Force (1976). <em>U.S. Standard Atmosphere, 1976</em>. Washington, DC: U.S. Government Printing Office.',
    baiyin2021: 'Baiyin, B., Tagawa, K., Yamada, M., Wang, X., Yamada, S., Yamamoto, S. &amp; Ibaraki, Y. (2021). Study on plant growth and nutrient uptake under different aeration intensity in hydroponics with the application of particle image velocimetry. <em>Agriculture</em>, 11(11), 1140. <a href="https://doi.org/10.3390/agriculture11111140" rel="noopener" target="_blank">doi:10.3390/agriculture11111140</a>',
    carotti2021: 'Carotti, L., et al. (2021). Plant factories are heating up: hunting for the best combination of light intensity, air temperature and root-zone temperature in lettuce production. <em>Frontiers in Plant Science</em>, 11, 592171. <a href="https://doi.org/10.3389/fpls.2020.592171" rel="noopener" target="_blank">doi:10.3389/fpls.2020.592171</a>',
    bu501: 'Battery University. “BU-501: Basics about Discharging.” Cadex Electronics. <a href="https://batteryuniversity.com/article/bu-501-basics-about-discharging" rel="noopener" target="_blank">batteryuniversity.com</a>',
    peukert1897: 'Peukert, W. (1897). Über die Abhängigkeit der Kapazität von der Entladestromstärke bei Bleiakkumulatoren. <em>Elektrotechnische Zeitschrift</em>, 18, 287–288.',
    victron: 'Victron Energy. <em>BMV-712 Smart battery monitor manual</em>, “Battery capacity and Peukert exponent”. <a href="https://www.victronenergy.com/media/pg/BMV-712_Smart/en/battery-capacity-and-peukert-exponent.html" rel="noopener" target="_blank">victronenergy.com</a>',
    ieee485: 'IEEE (2020). <em>IEEE Std 485-2020: IEEE Recommended Practice for Sizing Lead-Acid Batteries for Stationary Applications</em>. New York: IEEE.',
    rakocy2006: 'Rakocy, J. E., Masser, M. P. &amp; Losordo, T. M. (2006). <em>Recirculating Aquaculture Tank Production Systems: Aquaponics – Integrating Fish and Plant Culture</em>. Southern Regional Aquaculture Center, SRAC Publication No. 454.',
    munson2009: 'Munson, B. R., Young, D. F., Okiishi, T. H. &amp; Huebsch, W. W. (2009). <em>Fundamentals of Fluid Mechanics</em> (6th ed.). Hoboken, NJ: Wiley.',
    nist811: 'Thompson, A. &amp; Taylor, B. N. (2008). <em>Guide for the Use of the International System of Units (SI)</em>. NIST Special Publication 811. <a href="https://www.nist.gov/pml/special-publication-811" rel="noopener" target="_blank">nist.gov</a>',
    astm1785: 'ASTM International. <em>ASTM D1785: Standard Specification for Poly(Vinyl Chloride) (PVC) Plastic Pipe, Schedules 40, 80, and 120</em>. West Conshohocken, PA: ASTM International. <a href="https://www.astm.org/d1785" rel="noopener" target="_blank">astm.org</a>',
    tenstates: 'Great Lakes–Upper Mississippi River Board of State and Provincial Public Health and Environmental Managers. <em>Recommended Standards for Wastewater Facilities</em> (“Ten States Standards”), section 33.41: minimum velocity of 2.0 ft/s when flowing full. Albany, NY: Health Research, Inc.',
    clark828: 'Clark, G. A. &amp; Haman, D. Z. <em>Water Hammer in Irrigation Systems</em>. Circular 828 (AE066). Gainesville: University of Florida, IFAS Extension. <a href="https://edis.ifas.ufl.edu/publication/AE066" rel="noopener" target="_blank">edis.ifas.ufl.edu</a>',
    crane2009: 'Crane Co. (2009). <em>Flow of Fluids Through Valves, Fittings, and Pipe</em>. Technical Paper No. 410. Stamford, CT: Crane Co.',
    colebrook1939: 'Colebrook, C. F. (1939). Turbulent flow in pipes, with particular reference to the transition region between the smooth and rough pipe laws. <em>Journal of the Institution of Civil Engineers</em>, 11(4), 133–156.',
    huber2009: 'Huber, M. L., Perkins, R. A., Laesecke, A., Friend, D. G., Sengers, J. V., Assael, M. J., Metaxa, I. N., Vogel, E., Mareš, R. &amp; Miyagawa, K. (2009). New international formulation for the viscosity of H₂O. <em>Journal of Physical and Chemical Reference Data</em>, 38(2), 101–125.',
    faust2018: 'Faust, J. E. &amp; Logan, J. (2018). Daily light integral: A research review and high-resolution maps of the United States. <em>HortScience</em>, 53(9), 1250–1257. <a href="https://doi.org/10.21273/HORTSCI13144-18" rel="noopener" target="_blank">doi:10.21273/HORTSCI13144-18</a>',
    torres2010: 'Torres, A. P. &amp; Lopez, R. G. (2010). <em>Commercial Greenhouse Production: Measuring Daily Light Integral in a Greenhouse</em>. Purdue Extension HO-238-W. <a href="https://www.extension.purdue.edu/extmedia/ho/ho-238-w.pdf" rel="noopener" target="_blank">extension.purdue.edu</a>',
    dilaura2011: 'DiLaura, D. L., Houser, K. W., Mistrick, R. G. &amp; Steffy, G. R. (2011). <em>The Lighting Handbook: Reference and Application</em>, 10th ed. Illuminating Engineering Society of North America, New York. (Lumen method, coefficient of utilization and light loss factor.)',
    kusuma2020: 'Kusuma, P., Pattison, P. M. &amp; Bugbee, B. (2020). From physics to fixtures to food: current and potential LED efficacy. <em>Horticulture Research</em>, 7, 56. <a href="https://doi.org/10.1038/s41438-020-0283-7" rel="noopener" target="_blank">doi:10.1038/s41438-020-0283-7</a>',
    summerfelt2003: 'Summerfelt, S. T. (2003). Ozonation and UV irradiation—an introduction and examples of current applications. <em>Aquacultural Engineering</em>, 28(1–2), 21–36. doi:10.1016/S0144-8609(02)00069-9',
    bolton2003: 'Bolton, J. R. &amp; Linden, K. G. (2003). Standardization of methods for fluence (UV dose) determination in bench-scale UV experiments. <em>Journal of Environmental Engineering</em>, 129(3), 209–215.',
    epa2006uv: 'U.S. Environmental Protection Agency (2006). <em>Ultraviolet Disinfection Guidance Manual for the Final Long Term 2 Enhanced Surface Water Treatment Rule</em>. EPA 815-R-06-007. <a href="https://www.epa.gov/system/files/documents/2022-10/ultraviolet-disinfection-guidance-manual-2006.pdf" rel="noopener" target="_blank">epa.gov</a>',
    albano2001: 'Albano, J. P. &amp; Miller, W. B. (2001). Photodegradation of FeDTPA in nutrient solutions. I. Effects of irradiance, wavelength, and temperature. <em>HortScience</em>, 36.',
    cfr141: 'U.S. Code of Federal Regulations, 40 CFR 141.720(d), UV dose table for Cryptosporidium, Giardia lamblia, and virus inactivation credit. <a href="https://www.law.cornell.edu/cfr/text/40/141.720" rel="noopener" target="_blank">law.cornell.edu</a>',
    white2011: 'White, F. M. (2011). <em>Fluid Mechanics</em> (7th ed.). New York: McGraw-Hill.'
  };

  // =====================================================================================
  // Steps
  // =====================================================================================

  // ---------- 1. Crop and system type ----------
  const stepCrop = {
    id: 'crop', title: 'Crop and system type', short: 'Crop',
    intro: '<p>Pick the crop and the way the roots get their water and nutrients. The crop sets the plant spacing, the nutrient strength (EC) and the light it needs. The system type sets how much water the system holds, whether the roots need aeration, and what happens when the pump stops.</p>',
    fields: [
      { id: 'crop', label: 'Crop', type: 'select', def: 'lettuce',
        options: Object.keys(CROPS).map(function (k) { return { value: k, label: CROPS[k].name }; }),
        hint: function (ctx) {
          const c = crop(ctx);
          return c.spacing ? 'Typical spacing ' + c.range + ' (FAO, rule of thumb); EC ' + c.ecLo + '–' + c.ecHi + ' mS/cm (' + c.ecNote + ').' : 'No ranges for other crops on this site: you enter spacing, EC and light target yourself in the next steps.';
        } },
      { id: 'sys', label: 'System type', type: 'select', def: 'dwc',
        options: Object.keys(SYSTEMS).map(function (k) { return { value: k, label: SYSTEMS[k].name }; }),
        hint: function (ctx) { return COMPARE[sys(ctx)].best + '.'; } }
    ],
    compute: function (ctx) { return { crop: crop(ctx), sys: SYSTEMS[sys(ctx)], cmp: COMPARE[sys(ctx)] }; },
    notices: function (ctx) {
      const s = sys(ctx);
      return [ctx.v.crop === 'tomato' && s === 'dwc' ? 'Tomato is a large fruiting crop that a raft cannot carry well; DWC suits light leafy crops. Media beds or drip to slabs or buckets are the usual choice.' : '',
        ctx.v.crop === 'tomato' && s === 'nft' ? 'For fruiting crops in NFT, FAO recommends 11 cm channels (7.5 cm for leafy greens) and support for the plants.' : ''];
    },
    results: function (ctx, r) {
      const c = r.crop;
      return [
        { label: 'System', value: r.sys.name, main: true },
        { label: 'Water held', value: r.cmp.water },
        { label: 'Root aeration', value: r.cmp.air },
        { label: 'Suits', value: r.cmp.best },
        { label: 'If the pump stops', value: r.cmp.stop },
        { label: 'Crop spacing (FAO, rule of thumb)', value: c.spacing ? c.range : 'enter your own' },
        { label: 'Crop EC range (rule of thumb)', value: c.ecLo !== null ? c.ecLo + '–' + c.ecHi + ' mS/cm' : 'enter your own' },
        { label: 'Crop DLI range (rule of thumb)', value: dliCrop(ctx).lo !== null ? dliCrop(ctx).lo + '–' + dliCrop(ctx).hi + ' mol/m²/day' : 'enter your own' }
      ];
    },
    tips: [
      '<strong>DWC</strong> holds the most water, so temperature and nutrient strength change slowly, but the roots need air pumped in all the time (FAO TP 589; Maucieri et al., 2019).',
      '<strong>NFT</strong> holds very little water in the channels: most of it is in the reservoir, and the roots depend on the pump running (Cooper, 1979; grow-bed volume calculator).',
      '<strong>Media beds</strong> carry bigger plants and drain air into the root zone each cycle, but they are heavy. <strong>Drip</strong> to slabs or Dutch buckets is the usual choice for tall fruiting crops.',
      'The crop ranges are rules of thumb from the site’s calculators: spacing from FAO TP 589 Appendix 1, EC from Oklahoma State HLA-6722, DLI from the Daily Light Integral calculator.'
    ],
    viz: {
      viewBox: '0 0 480 240', label: 'Cross-section of the chosen hydroponic system',
      draw: function (svg, ctx) {
        const s = sys(ctx);
        const plants = function (xs, y, r) { xs.forEach(function (x) { plantDot(svg, x, y, r || 10); G.el(svg, 'line', { class: 'g-line', x1: x, y1: y + 8, x2: x, y2: y + 40 }); }); };
        if (s === 'dwc') {
          G.el(svg, 'rect', { class: 'water', x: 60, y: 110, width: 360, height: 80 });
          G.el(svg, 'rect', { class: 'g-box', x: 60, y: 100, width: 360, height: 14 });
          G.el(svg, 'path', { class: 'tank-line', d: 'M60,80 L60,190 L420,190 L420,80', fill: 'none' });
          plants([110, 180, 250, 320, 390], 86);
          for (let i = 0; i < 6; i++) G.el(svg, 'circle', { class: 'g-box', cx: 90 + i * 60, cy: 180 - (i % 2) * 14, r: 3 });
          text(svg, 240, 222, 'Raft floats on ~30 cm of aerated solution', 'middle', 'g-label');
        } else if (s === 'nft') {
          G.el(svg, 'path', { class: 'tank-line', d: 'M40,100 L440,140 L440,160 L40,120 Z', fill: 'none' });
          G.el(svg, 'path', { class: 'water', d: 'M40,116 L440,156 L440,160 L40,120 Z' });
          plants([100, 190, 280, 370], 70 + 0, 10);
          arrow(svg, 60, 140, 140, 148); text(svg, 240, 200, 'Thin film flows down a sloped channel', 'middle', 'g-label');
          text(svg, 240, 222, 'Upper roots stay in air', 'middle', 'dim-text');
        } else if (s === 'media') {
          G.el(svg, 'rect', { class: 'g-media', x: 60, y: 90, width: 360, height: 100 });
          G.el(svg, 'rect', { class: 'water', x: 60, y: 130, width: 360, height: 60 });
          G.el(svg, 'path', { class: 'tank-line', d: 'M60,80 L60,190 L420,190 L420,80', fill: 'none' });
          plants([110, 200, 290, 380], 56);
          text(svg, 240, 222, 'Bed floods, then drains; the media holds the plants', 'middle', 'g-label');
        } else {
          [90, 200, 310].forEach(function (x) {
            G.el(svg, 'path', { class: 'tank-line', d: 'M' + (x - 30) + ',110 L' + (x - 22) + ',190 L' + (x + 22) + ',190 L' + (x + 30) + ',110 Z', fill: 'none' });
            G.el(svg, 'rect', { class: 'g-media', x: x - 26, y: 120, width: 52, height: 66 });
            plants([x], 70);
            G.el(svg, 'line', { class: 'g-line-accent', x1: x + 10, y1: 60, x2: x + 10, y2: 116 });
          });
          G.el(svg, 'line', { class: 'g-line-accent', x1: 40, y1: 60, x2: 440, y2: 60 });
          text(svg, 400, 150, 'drain', 'middle', 'dim-text');
          text(svg, 240, 222, 'Emitters drip solution onto each bucket or slab', 'middle', 'g-label');
        }
      },
      caption: function (ctx, r) { return r.sys.name + ' · ' + r.crop.name; }
    },
    sources: ['fao589', 'maucieri2019', 'cooper1979', 'osu6722', 'stallknecht2025'],
    links: function (ctx) {
      const s = sys(ctx);
      const out = [];
      if (s !== 'drip') out.push({ slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: { type: s, crop: ctx.v.crop } });
      out.push({ slug: 'daily-light-integral', label: 'Daily Light Integral', params: { mode: 'ppfd', crop: crop(ctx).dli, pattern: 'const' } });
      return out;
    }
  };

  // ---------- 2. Plants and grow area ----------
  function isSys(k) { return function (ctx) { return sys(ctx) === k; }; }
  const stepPlants = {
    id: 'plants', title: 'Plants and grow area', short: 'Plants',
    intro: '<p>Set how many plants the system holds and how far apart they stand. The guide then lays out the rafts, channels, beds or buckets and works out the grow area and the planting density. Plant sites are whole plants on a square grid, the same rule as the Grow Bed Volume calculator.</p>',
    fields: [
      { id: 'plan', label: 'Plan from', type: 'select', def: 'sites',
        options: [{ value: 'sites', label: 'Number of plant sites' }, { value: 'weekly', label: 'Plants harvested per week' }] },
      { id: 'plants', label: 'Plant sites wanted', def: 720, check: intCheck('Plant sites'), show: function (ctx) { return ctx.v.plan === 'sites'; },
        hint: 'Example: 720 lettuce sites. The layout rounds up to whole rows.' },
      { id: 'perWeek', half: true, label: 'Harvest per week', suffix: 'plants', def: 180, check: intCheck('Harvest per week'), show: function (ctx) { return ctx.v.plan === 'weekly'; } },
      { id: 'weeks', half: true, label: 'Weeks in the system', group: 'time', unit: 'wk', def: 4 * 604800,
        show: function (ctx) { return ctx.v.plan === 'weekly'; },
        hint: 'Example value: time from transplant to harvest. Use your own crop schedule.' },
      { id: 'spacing', label: 'Plant spacing (centre to centre)', group: 'length', unit: 'cm',
        def: function (ctx) { return crop(ctx).spacing ? crop(ctx).spacing / 100 : 0.2; },
        hint: function (ctx) { const c = crop(ctx); return c.spacing ? 'Suggested ' + c.spacing + ' cm, the Grow Bed Volume default for ' + c.name.toLowerCase() + '. FAO guide (rule of thumb): ' + c.range + '.' : 'Example value of 20 cm: enter the spacing your crop needs.'; } },
      // DWC
      { id: 'canalW', half: true, label: 'Canal width', group: 'length', unit: 'm', def: 1.2, show: isSys('dwc'),
        hint: 'Example: two 0.6 m raft widths. The Grow Bed Volume default is 120 cm.' },
      { id: 'nCanals', half: true, label: 'Number of canals', def: 2, check: intCheck('Number of canals'), show: isSys('dwc') },
      { id: 'canalL', label: 'Canal length', group: 'length', unit: 'm', show: isSys('dwc'),
        def: function (ctx) {
          const x = ctx.v, per = fit(x.canalW, x.spacing), P = targetPlants(ctx);
          if (!(per > 0) || !(P > 0) || !(x.nCanals > 0)) return NaN;
          return Math.ceil(Math.ceil(P / per) / x.nCanals) * x.spacing;
        },
        hint: 'Suggested: just long enough for the plants wanted, in whole rows.' },
      // NFT
      { id: 'chanL', half: true, label: 'Channel length', group: 'length', unit: 'm', def: 3, show: isSys('nft'),
        hint: 'Grow Bed Volume default (300 cm). Long channels run short of oxygen and nutrients near the end.' },
      { id: 'chanPitch', half: true, label: 'Channel spacing (centre to centre)', group: 'length', unit: 'cm', show: isSys('nft'),
        def: function (ctx) { return ctx.v.spacing; }, hint: 'Suggested: the plant spacing, for a square grid.' },
      { id: 'nChan', label: 'Number of channels', check: intCheck('Number of channels'), show: isSys('nft'),
        def: function (ctx) { const per = fit(ctx.v.chanL, ctx.v.spacing), P = targetPlants(ctx); return per > 0 && P > 0 ? Math.ceil(P / per) : NaN; },
        hint: 'Suggested: enough channels for the plants wanted.' },
      // Media
      { id: 'bedW', half: true, label: 'Bed width', group: 'length', unit: 'm', def: 1.0, show: isSys('media'), hint: 'Grow Bed Volume default (100 cm).' },
      { id: 'nBeds', half: true, label: 'Number of beds', def: 4, check: intCheck('Number of beds'), show: isSys('media') },
      { id: 'bedL', label: 'Bed length', group: 'length', unit: 'm', show: isSys('media'),
        def: function (ctx) {
          const x = ctx.v, per = fit(x.bedW, x.spacing), P = targetPlants(ctx);
          if (!(per > 0) || !(P > 0) || !(x.nBeds > 0)) return NaN;
          return Math.ceil(Math.ceil(P / per) / x.nBeds) * x.spacing;
        }, hint: 'Suggested: just long enough for the plants wanted.' },
      // Drip
      { id: 'perCont', label: 'Plants per bucket or slab', def: function (ctx) { return ctx.v.crop === 'tomato' ? 2 : 1; }, check: intCheck('Plants per bucket'), show: isSys('drip'),
        hint: 'Example value; Dutch buckets often hold one or two plants, slabs several. Use your own.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = sys(ctx), sp = x.spacing;
      const r = { P: targetPlants(ctx) };
      if (s === 'dwc') {
        r.perRow = fit(x.canalW, sp); r.rows = fit(x.canalL, sp); r.n = x.nCanals;
        r.sites = r.perRow * r.rows * r.n; r.area = x.canalL * x.canalW * x.nCanals;
        r.layout = fmt(x.nCanals, 0) + ' canals of ' + fmt(x.canalL, 2) + ' × ' + fmt(x.canalW, 2) + ' m (' + r.rows + ' rows × ' + r.perRow + ' plants each)';
        r.L = x.canalL; r.W = x.canalW * x.nCanals;
      } else if (s === 'nft') {
        r.perRow = fit(x.chanL, sp); r.n = x.nChan;
        r.sites = r.perRow * x.nChan; r.area = x.chanL * x.chanPitch * x.nChan;
        r.layout = fmt(x.nChan, 0) + ' channels of ' + fmt(x.chanL, 2) + ' m, ' + r.perRow + ' plants each, ' + fmt(x.chanPitch * 100, 1) + ' cm apart';
        r.L = x.chanL; r.W = x.chanPitch * x.nChan;
      } else if (s === 'media') {
        r.perRow = fit(x.bedW, sp); r.rows = fit(x.bedL, sp); r.n = x.nBeds;
        r.sites = r.perRow * r.rows * x.nBeds; r.area = x.bedL * x.bedW * x.nBeds;
        r.layout = fmt(x.nBeds, 0) + ' beds of ' + fmt(x.bedL, 2) + ' × ' + fmt(x.bedW, 2) + ' m (' + r.rows + ' rows × ' + r.perRow + ' plants each)';
        r.L = x.bedL; r.W = x.bedW * x.nBeds;
      } else {
        r.cont = Math.ceil(r.P / x.perCont - 1e-9);
        r.sites = r.cont * x.perCont; r.area = r.sites * sp * sp;
        r.layout = fmt(r.cont, 0) + ' buckets or slabs × ' + fmt(x.perCont, 0) + ' plant' + (x.perCont === 1 ? '' : 's');
        r.L = Math.sqrt(r.area); r.W = r.L;
      }
      r.density = r.area > 0 ? r.sites / r.area : NaN;
      const c = crop(ctx);
      r.status = c.min !== null ? (r.density < c.min - 0.05 ? 'below' : r.density > c.max + 0.05 ? 'above' : 'within') : '';
      r.weekly = x.plan === 'weekly' ? r.sites / (x.weeks / 604800) : NaN;
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (fin(r.sites) && r.sites === 0) m.push('The plant spacing is larger than the canal, channel or bed, so no whole plant fits.');
      else if (fin(r.sites) && fin(r.P) && r.sites < r.P) m.push('This layout fits ' + fmt(r.sites, 0) + ' plants, fewer than the ' + fmt(r.P, 0) + ' wanted. Use “Use suggested” on the length or count.');
      if (sys(ctx) === 'nft' && ctx.v.chanPitch < 0.1 - 1e-9) m.push('Channels closer than about 10 cm (the channel width) would overlap.');
      return m;
    },
    results: function (ctx, r) {
      const c = crop(ctx);
      const out = [
        { label: 'Plant sites', value: fin(r.sites) ? fmt(r.sites, 0) : '–', main: true },
        { label: 'Layout', value: r.layout && fin(r.sites) ? r.layout : '–' },
        { label: 'Grow area', value: areaTxt(r.area) },
        { label: 'Planting density', value: fin(r.density) ? fmt(r.density, 1) + ' per m² · ' + fmt(r.density * FT2, 2) + ' per ft²' : '–' }
      ];
      if (r.status) out.push({ label: 'FAO guide range (rule of thumb)', value: c.name + ' ' + c.min + '–' + c.max + ' per m²: ' + r.status });
      if (ctx.v.plan === 'weekly') out.push({ label: 'Harvest per week at full capacity', value: fin(r.weekly) ? fmt(r.weekly, 0) + ' plants' : '–' });
      return out;
    },
    tips: [
      'A square grid at spacing s gives at most 1 ÷ s² plants per m² (20 cm gives 25 per m²); whole rows make small beds come out a little lower (Grow Bed Volume calculator).',
      'Typical spacing (FAO TP 589 Appendix 1, rules of thumb): lettuce 18–30 cm, 20–25 heads per m²; basil 15–25 cm, 8–40 plants per m²; tomato 40–60 cm, 3–5 plants per m². FAO gives at least 21 cm between NFT plant holes.',
      'For a weekly harvest, plants in the system = harvest per week × weeks from transplant to harvest. Seedlings raised elsewhere need their own nursery space.'
    ],
    viz: {
      viewBox: '0 0 480 260', label: 'Plan of the canals, channels, beds or buckets with the plant sites',
      draw: function (svg, ctx, r) {
        const x = ctx.v, s = sys(ctx);
        if (!fin(r.sites) || !(r.sites > 0) || !(r.L > 0) || !(r.W > 0)) { text(svg, 240, 120, 'Enter the layout to draw the plan', 'middle', 'dim-text'); return; }
        const strips = s === 'dwc' ? x.nCanals : s === 'nft' ? x.nChan : s === 'media' ? x.nBeds : 0;
        const availW = 440, maxH = 190;
        const sc = Math.min(availW / r.L, maxH / r.W);
        const pw = r.L * sc, ph = r.W * sc, x0 = 20 + (availW - pw) / 2, y0 = 24;
        svg.setAttribute('viewBox', '0 0 480 ' + Math.ceil(y0 + ph + 40));
        G.el(svg, 'rect', { class: 'g-track', x: x0, y: y0, width: pw, height: ph });
        const dotR = Math.max(1.2, Math.min(6, x.spacing * sc * 0.35));
        const many = r.sites > 1500;
        if (s === 'drip') {
          const n = Math.min(r.cont, 400), cols = Math.max(1, Math.round(Math.sqrt(n * pw / ph))), rows = Math.ceil(n / cols);
          const cw = pw / cols, ch = ph / rows;
          for (let i = 0; i < n; i++) {
            const cx = x0 + (i % cols + 0.5) * cw, cy = y0 + (Math.floor(i / cols) + 0.5) * ch;
            G.el(svg, 'rect', { class: 'g-box', x: cx - cw * 0.35, y: cy - ch * 0.35, width: cw * 0.7, height: ch * 0.7, rx: 2 });
          }
        } else {
          const sw = ph / strips;
          const drawN = Math.min(strips, 60);
          for (let i = 0; i < drawN; i++) {
            const yy = y0 + i * sw;
            const inner = s === 'nft' ? Math.min(sw * 0.6, Math.max(2, 0.1 * sc)) : sw * 0.92;
            G.el(svg, 'rect', { class: s === 'media' ? 'g-media' : 'water', x: x0, y: yy + (sw - inner) / 2, width: pw, height: inner, 'fill-opacity': s === 'media' ? 0.35 : 0.6 });
            if (!many) {
              const per = s === 'nft' ? 1 : r.perRow, rows = s === 'nft' ? r.perRow : r.rows;
              for (let a = 0; a < rows; a++) for (let b = 0; b < per; b++) {
                plantDot(svg, x0 + (a + 0.5) * x.spacing * sc, yy + (s === 'nft' ? sw / 2 : (b + 0.5) * (sw / per)), dotR);
              }
            }
          }
        }
        G.el(svg, 'rect', { class: 'tank-line', x: x0, y: y0, width: pw, height: ph, fill: 'none' });
        text(svg, x0 + pw / 2, y0 - 8, fmt(r.L, 2) + ' m', 'middle', 'dim-text');
        text(svg, 240, y0 + ph + 26, fmt(r.sites, 0) + ' plants · ' + fmt(r.area, 1) + ' m²' + (many ? ' (plants not drawn)' : ''), 'middle', 'g-label');
      },
      caption: function (ctx, r) { return fin(r.density) ? 'Plan view to scale · ' + fmt(r.density, 1) + ' plants per m²' : 'Enter the layout'; }
    },
    sources: ['fao589', 'maucieri2019', 'cooper1979'],
    links: function (ctx, r) {
      const x = ctx.v, s = sys(ctx);
      if (s === 'dwc') return [{ slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: { type: 'dwc', crop: x.crop, 'd-length': p(x.canalL, 6), 'd-length_u': 'm', 'd-width': p(x.canalW, 6), 'd-width_u': 'm', 'd-beds': x.nCanals, spacing: p(x.spacing * 100, 6), spacing_u: 'cm', outv: 'L', outa: 'm2' } }];
      if (s === 'nft') return [{ slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: { type: 'nft', crop: x.crop, profile: 'rect', 'n-count': x.nChan, 'n-length': p(x.chanL, 6), 'n-length_u': 'm', 'n-pitch': p(x.chanPitch * 100, 6), 'n-pitch_u': 'cm', spacing: p(x.spacing * 100, 6), spacing_u: 'cm', outv: 'L', outa: 'm2' } }];
      if (s === 'media') return [{ slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: { type: 'media', crop: x.crop, 'm-length': p(x.bedL, 6), 'm-length_u': 'm', 'm-width': p(x.bedW, 6), 'm-width_u': 'm', 'm-beds': x.nBeds, spacing: p(x.spacing * 100, 6), spacing_u: 'cm', outv: 'L', outa: 'm2' } }];
      return [];
    }
  };

  // ---------- 3. Solution volume ----------
  function waterLink(ctx) {
    const x = ctx.v, s = sys(ctx);
    const base = { crop: x.crop, spacing: p(x.spacing * 100, 6), spacing_u: 'cm', outv: 'L', outa: 'm2' };
    if (s === 'dwc') return { slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: Object.assign({ type: 'dwc', 'd-length': p(x.canalL, 6), 'd-length_u': 'm', 'd-width': p(x.canalW, 6), 'd-width_u': 'm', 'd-water': p(x.dwcDepth * 100, 6), 'd-water_u': 'cm', 'd-raft': p(x.raftT * 100, 6), 'd-raft_u': 'cm', 'd-beds': x.nCanals }, base) };
    if (s === 'nft') return { slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: Object.assign({ type: 'nft', profile: 'rect', 'n-count': x.nChan, 'n-length': p(x.chanL, 6), 'n-length_u': 'm', 'n-width': p(x.chanWid * 100, 6), 'n-width_u': 'cm', 'n-height': p(x.chanHt * 100, 6), 'n-height_u': 'cm', 'n-film': p(x.film * 1000, 6), 'n-film_u': 'mm', 'n-pitch': p(x.chanPitch * 100, 6), 'n-pitch_u': 'cm' }, base) };
    if (s === 'media') return { slug: 'grow-bed-volume', label: 'Grow Bed Volume', params: Object.assign({ type: 'media', media: x.media, 'm-length': p(x.bedL, 6), 'm-length_u': 'm', 'm-width': p(x.bedW, 6), 'm-width_u': 'm', 'm-depth': p(x.bedDepth * 100, 6), 'm-depth_u': 'cm', 'm-por': p(x.por, 6), 'm-beds': x.nBeds }, base) };
    return null;
  }
  const stepWater = {
    id: 'water', title: 'System and solution volume', short: 'Volume',
    intro: '<p>How much nutrient solution the system holds sets how much fertilizer and acid each batch takes, how fast the solution changes, and the pump size. It is the water in the canals, channels or beds plus the water in the reservoir (sump).</p>',
    fields: [
      { id: 'dwcDepth', half: true, label: 'Canal water depth', group: 'length', unit: 'cm', def: 0.30, show: isSys('dwc'), hint: 'FAO typical value about 30 cm.' },
      { id: 'raftT', half: true, label: 'Raft thickness', group: 'length', unit: 'cm', def: 0.04, show: isSys('dwc'), hint: 'Grow Bed Volume default.' },
      { id: 'chanWid', half: true, label: 'Channel floor width', group: 'length', unit: 'cm', def: 0.10, show: isSys('nft'), hint: 'Rectangular gully (Grow Bed Volume default).' },
      { id: 'chanHt', half: true, label: 'Channel height', group: 'length', unit: 'cm', def: 0.075, show: isSys('nft') },
      { id: 'film', label: 'Film depth', group: 'length', unit: 'mm', def: 0.005, show: isSys('nft'),
        check: function (v, ctx) { return v > ctx.v.chanHt ? 'Film depth cannot be more than the channel height.' : ''; },
        hint: 'A few millimetres; measure it with the pump running (Cooper, 1979).' },
      { id: 'bedDepth', half: true, label: 'Media depth (flooded)', group: 'length', unit: 'cm', def: 0.30, show: isSys('media'), hint: 'FAO typical value about 30 cm; 15–20 cm can do for small leafy greens.' },
      { id: 'media', half: true, label: 'Media', type: 'select', def: 'clay', show: isSys('media'),
        options: Object.keys(BED_MEDIA).map(function (k) { return { value: k, label: BED_MEDIA[k].name }; }) },
      { id: 'por', label: 'Water-filled pore space', suffix: '%', show: isSys('media'), check: pctCheck('Pore space', 1, 100),
        def: function (ctx) { const m = BED_MEDIA[ctx.v.media]; return m && m.por ? m.por : 40; },
        hint: 'Typical values (rule of thumb, as the Grow Bed Volume and Growing Media Fill calculators): expanded clay 40%, lava rock 45%, gravel 38%. Measure yours with a bucket.' },
      { id: 'substrate', label: 'Substrate', type: 'select', def: 'coir', show: isSys('drip'),
        options: Object.keys(SUBSTRATES).map(function (k) { return { value: k, label: SUBSTRATES[k].name }; }) },
      { id: 'subVol', label: 'Substrate per bucket or slab', group: 'volume', unit: 'L', def: 10, show: isSys('drip'),
        hint: 'Example value; use your bucket or slab size.' },
      { id: 'resVol', label: 'Reservoir (sump) water while running', group: 'volume', unit: 'L',
        def: function (ctx) {
          const s = sys(ctx), sites = R(ctx, 'plants').sites;
          if (s === 'nft' || s === 'drip') return sites * GAL;
          const w = systemWater(ctx);
          return s === 'dwc' ? 0.1 * w : w;
        },
        hint: function (ctx) {
          const s = sys(ctx);
          if (s === 'nft' || s === 'drip') return 'Suggested 1 US gallon (3.8 L) per plant, the top of the ¼–1 gallon per plant reservoir guidance found for Virginia Tech SPES-463 (rule of thumb, see the source note). A bigger reservoir buffers pH and EC.';
          if (s === 'dwc') return 'Example value: 10% of the canal water. The canals are the main reservoir in DWC; the sump only needs room for the pump and the drain-back (checked in the drain-back step).';
          return 'Example value: as much as the flooded beds hold, so the sump does not run dry while the beds fill. The drain-back step checks it has room.';
        } }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = sys(ctx), pl = R(ctx, 'plants');
      const r = { sys: systemWater(ctx), res: x.resVol };
      r.total = r.sys + r.res;
      r.perPlant = r.total / pl.sites;
      r.kg = r.total * WATER_KG_PER_L;
      if (s === 'dwc') { r.gross = x.canalL * x.canalW * (x.dwcDepth + x.raftT) * x.nCanals * 1000; r.minDepth = x.dwcDepth + x.raftT; }
      if (s === 'nft') r.gross = x.chanWid * x.chanHt * x.chanL * x.nChan * 1000;
      if (s === 'media') { r.gross = x.bedL * x.bedW * x.bedDepth * x.nBeds * 1000; r.buy = r.gross * 1.05; }
      if (s === 'drip') { r.substrate = pl.cont * x.subVol; r.subWater = r.substrate * (SUBSTRATES[x.substrate] || SUBSTRATES.coir).por / 100; }
      return r;
    },
    notices: function (ctx, r) {
      return [sys(ctx) === 'drip' ? 'Water held in the substrate is not counted as circulating solution.' : ''];
    },
    results: function (ctx, r) {
      const s = sys(ctx);
      const sysName = { dwc: 'Water in the canals', nft: 'Water in the channels (film)', media: 'Water in the flooded beds', drip: 'Water in the drip system' }[s];
      const out = [
        { label: 'Total nutrient solution', value: volTxt(r.total), main: true },
        { label: sysName, value: volTxt(r.sys) },
        { label: 'Reservoir (sump)', value: volTxt(r.res) },
        { label: 'Solution per plant', value: fin(r.perPlant) ? fmt(r.perPlant, 2) + ' L' : '–' },
        { label: 'Weight of the solution', value: fin(r.kg) ? q('mass', r.kg, ['kg', 'lb'], 0) : '–' }
      ];
      if (s === 'dwc') out.push({ label: 'Gross canal volume (water + raft) · min. canal depth', value: volTxt(r.gross) + ' · ' + q('length', r.minDepth, ['cm'], 1) });
      if (s === 'nft') out.push({ label: 'Gross channel volume', value: volTxt(r.gross) });
      if (s === 'media') out.push({ label: 'Media to buy (bed volume + 5%)', value: volTxt(r.buy) });
      if (s === 'drip') out.push({ label: 'Substrate in all buckets or slabs', value: volTxt(r.substrate) + ' (holds up to ' + volTxt(r.subWater) + ' when saturated)' });
      return out;
    },
    tips: [
      'DWC water = length × width × water depth × canals. NFT film = channel floor width × film depth × length × channels. Media beds = bed volume × pore space (Grow Bed Volume calculator).',
      'Reservoir: about ¼ to 1 US gallon per plant (1–3.8 L) is the guidance found for Virginia Tech SPES-463 (rule of thumb; seen only in a search summary). More water means slower swings in pH, EC and temperature.',
      'Water weighs about 1 kg per litre: check what the floor, benches or roof can carry.'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'Where the nutrient solution sits: grow units and reservoir',
      draw: function (svg, ctx, r) {
        hbars(svg, [
          { label: { dwc: 'Canals', nft: 'Channels', media: 'Beds', drip: 'Drip lines' }[sys(ctx)], value: r.sys, text: volTxt(r.sys), cls: 'g-bar-water' },
          { label: 'Reservoir', value: r.res, text: volTxt(r.res), cls: 'g-bar-soft' },
          { label: 'Total', value: r.total, text: volTxt(r.total), cls: 'g-bar' }
        ], { x0: 110, w: 340, y0: 30, gap: 48, bh: 24 });
      },
      caption: function (ctx, r) { return fin(r.total) ? volTxt(r.total) + ' of solution to mix, dose and pump' : 'Enter the inputs'; }
    },
    sources: ['fao589', 'cooper1979', 'freeze1979', 'abad2005', 'raviv2008', 'spes463', 'usgsdensity'],
    links: function (ctx) {
      const x = ctx.v, s = sys(ctx), out = [];
      const wl = waterLink(ctx);
      if (wl) out.push(wl);
      if (s === 'media') out.push({ slug: 'growing-media-fill', label: 'Growing Media Fill', params: { shape: 'rect', media: BED_MEDIA[x.media].fill, length: p(x.bedL, 6), length_u: 'm', width: p(x.bedW, 6), width_u: 'm', height: p(x.bedDepth, 6), height_u: 'm', fill: p(x.bedDepth, 6), fill_u: 'm', beds: x.nBeds, porosity: p(x.por, 6), extra: 5, vout: 'L', mout: 'kg' } });
      return out;
    }
  };

  // ---------- 4. Nutrient solution ----------
  const stepNutrient = {
    id: 'nutrient', title: 'Nutrient solution strength', short: 'Nutrients',
    intro: '<p>Growers set nutrient strength by <strong>electrical conductivity (EC)</strong>. The guide starts from the classic Hoagland &amp; Arnon No. 2 recipe and dilutes it to the crop’s target EC, predicts what an EC meter should read (the Nutrient EC calculator’s ion-sum method), and works out the fertilizer salts for one full batch of the system volume.</p>',
    fields: [
      { id: 'ecT', label: 'Target EC', suffix: 'mS/cm',
        def: function (ctx) { const c = crop(ctx); return c.ecLo !== null ? +((c.ecLo + c.ecHi) / 2).toFixed(2) : 1.5; },
        check: function (v) { return v > 5 ? 'Above about 5 mS/cm the ion-sum estimate is unreliable and few crops tolerate it.' : ''; },
        hint: function (ctx) { const c = crop(ctx); return c.ecLo !== null ? 'Suggested: the middle of ' + c.ecLo + '–' + c.ecHi + ' mS/cm (' + c.ecNote + ', rule of thumb).' : 'Example value of 1.5 mS/cm: use your crop’s target.'; } },
      { id: 'strength', label: 'Hoagland No. 2 strength', suffix: '%',
        def: function (ctx) { return ctx.v.ecT / EC_FULL * 100; },
        check: function (v) { return v > 300 ? 'More than three times full strength is not a realistic nutrient solution.' : ''; },
        hint: 'Suggested: the share of full strength (estimated ' + fmt(EC_FULL, 2) + ' mS/cm) that gives the target EC.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, w = R(ctx, 'water');
      const f = x.strength / 100;
      const r = { f: f, V: w.total, ions: {} };
      Object.keys(HOAG).forEach(function (k) { r.ions[k] = HOAG[k] * f; });
      r.theo = theoEC(r.ions);
      r.est = r.theo * EC_CORRECTION;
      r.salts = SALTS.map(function (s) { return { name: s.name, g: s.mM * f * s.mw / 1000 * w.total, mL: s.mM * f * w.total }; });
      const c = crop(ctx);
      r.status = rangeStatus(r.est, c.ecLo, c.ecHi);
      return r;
    },
    notices: function (ctx, r) {
      const c = crop(ctx);
      return [r.status === 'below' || r.status === 'above' ? 'The estimated EC is ' + r.status + ' the ' + c.ecLo + '–' + c.ecHi + ' mS/cm range for ' + c.name.toLowerCase() + '.' : ''];
    },
    results: function (ctx, r) {
      const out = [
        { label: 'Estimated EC (meter at 25 °C)', value: fin(r.est) ? fmt(r.est, 2) + ' mS/cm' + (r.status ? ' · ' + r.status + ' the crop range' : '') : '–', main: true },
        { label: 'TDS meter (500 / 700 scale)', value: fin(r.est) ? fmt(Math.round(r.est * 500), 0) + ' / ' + fmt(Math.round(r.est * 700), 0) + ' ppm' : '–' },
        { label: 'Nitrogen · potassium · calcium', value: fin(r.f) ? fmt(r.ions.no3 + r.ions.nh4, 1) + ' · ' + fmt(r.ions.k, 1) + ' · ' + fmt(r.ions.ca, 1) + ' mg/L' : '–' }
      ];
      r.salts.forEach(function (s) { out.push({ label: s.name + ' per batch', value: fin(s.g) ? q('mass', s.g / 1000, [s.g >= 1000 ? 'kg' : 'g'], s.g >= 1000 ? 2 : 1) + ' (' + fmt(s.mL / 1000, 2) + ' L of 1 M stock)' : '–' }); });
      out.push({ label: 'Batch volume', value: volTxt(r.V) });
      return out;
    },
    tips: [
      'EC = 0.90 × Σ λ°ᵢ × cᵢ: each ion’s limiting conductivity times its concentration, reduced 10% for ion interaction (rule of thumb), as the Nutrient EC calculator. Full-strength Hoagland No. 2 estimates ' + fmt(EC_FULL, 2) + ' mS/cm.',
      'Hoagland No. 2 per litre: 6 mmol KNO₃, 4 mmol Ca(NO₃)₂, 1 mmol NH₄H₂PO₄ and 2 mmol MgSO₄ (1, 6, 4 and 2 mL of 1 M stocks), plus micronutrients. Salt masses assume the common hydrates Ca(NO₃)₂·4H₂O and MgSO₄·7H₂O (IUPAC atomic weights); check your bag.',
      'Keep calcium nitrate apart from the sulfate and phosphate when making concentrated stocks; mix them only after dilution. Add your source water’s ions to the recipe, and always confirm with a calibrated EC meter.',
      'Micronutrients (iron, manganese, zinc, copper, boron, molybdenum) are dosed from a separate stock; the iron step checks the iron.'
    ],
    viz: {
      viewBox: '0 0 480 190', label: 'Estimated EC against the crop EC range',
      draw: function (svg, ctx, r) {
        const c = crop(ctx);
        if (!fin(r.est)) return;
        const max = Math.max(4, Math.ceil(r.est * 1.2));
        const x0 = 30, x1 = 450, X = function (e) { return x0 + (x1 - x0) * Math.min(e, max) / max; };
        text(svg, x0, 22, 'EC, mS/cm', 'start', 'dim-text');
        G.el(svg, 'rect', { class: 'g-track', x: x0, y: 70, width: x1 - x0, height: 34, rx: 6 });
        if (c.ecLo !== null) {
          G.el(svg, 'rect', { class: 'g-bar-soft', x: X(c.ecLo), y: 70, width: X(c.ecHi) - X(c.ecLo), height: 34, rx: 4 });
          text(svg, (X(c.ecLo) + X(c.ecHi)) / 2, 60, c.name + ' ' + c.ecLo + '–' + c.ecHi, 'middle', 'g-accent-text');
        }
        G.el(svg, 'line', { class: 'g-line', x1: X(r.est), y1: 62, x2: X(r.est), y2: 112 });
        text(svg, Math.min(Math.max(X(r.est), x0 + 40), x1 - 40), 132, 'estimate ' + fmt(r.est, 2), 'middle', 'g-strong');
        G.el(svg, 'line', { class: 'g-line-warn', x1: X(EC_FULL), y1: 66, x2: X(EC_FULL), y2: 108 });
        text(svg, Math.min(X(EC_FULL), x1 - 60), 160, 'full-strength Hoagland ' + fmt(EC_FULL, 2), 'middle', 'g-warn-text');
        for (let t = 0; t <= max; t++) text(svg, X(t), 182, String(t), 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.est) ? fmt(ctx.v.strength, 1) + '% Hoagland No. 2 ≈ ' + fmt(r.est, 2) + ' mS/cm' : 'Enter the inputs'; }
    },
    sources: ['hoagland1950', 'osu6722', 'phreeqc2013', 'aqion', 'fernandez2020', 'iupac2022'],
    links: function (ctx, r) {
      const prm = { preset: 'custom', no3form: 'n', out: 'mScm' };
      Object.keys(r.ions || {}).forEach(function (k) { prm[k] = p(r.ions[k], 6); prm[k + '_u'] = 'mgL'; });
      return [{ slug: 'nutrient-ec', label: 'Nutrient EC', params: prm }];
    }
  };

  // ---------- 5. pH, alkalinity and iron ----------
  const stepPh = {
    id: 'ph', title: 'pH, alkalinity and iron', short: 'pH & iron',
    intro: '<p>Most crops take up nutrients best at a root-zone pH of about 5.5–6.5. Tap and well water often carry alkalinity (bicarbonate) that pushes the pH up, so growers add acid to the batch. Iron is the micronutrient most often short at higher pH, so this step also doses chelated iron. Same chemistry as the pH Adjustment and Iron Addition calculators.</p>',
    fields: [
      { id: 'solT', label: 'Solution temperature', group: 'temperature', unit: 'C', signed: true, def: 20,
        check: function (t) { return t < 0 || t > 40 ? 'Solution temperature must be between 0 and 40 °C.' : ''; },
        hint: 'Example value (the pH Adjustment default). It sets the carbonate constants here and oxygen solubility in the next step.' },
      { id: 'alk', label: 'Source water alkalinity', group: 'alkalinity', unit: 'caco3', def: 150, allowZero: true,
        hint: 'Example value; use total alkalinity from your water test.' },
      { id: 'ph0', label: 'Source water pH', def: 7.8,
        check: function (v) { return v < 3 || v > 11 ? 'Source water pH should be between 3 and 11.' : ''; }, hint: 'Example value.' },
      { id: 'ph1', label: 'Target pH', def: 5.8,
        check: function (v) { return v < 3 || v > 9 ? 'Target pH should be between 3 and 9.' : ''; },
        hint: 'Suggested 5.8: NC State recommends acidifying to about pH 5.8 (Bailey &amp; Bilderback, 1997).' },
      { id: 'acid', label: 'Acid', type: 'select', def: 'nitric67',
        options: Object.keys(ACIDS).map(function (k) { return { value: k, label: ACID_LABELS[k] }; }),
        hint: 'Suggested: nitric acid, which adds nitrate. Phosphoric acid (the pH Adjustment default) adds phosphorus, often more than the recipe needs when the alkalinity is high; sulfuric acid adds sulfate.' },
      { id: 'feCur', label: 'Iron already in the solution', group: 'concentration', unit: 'mgL', allowZero: true,
        def: function (ctx) { return HOAG.fe * ctx.v.strength / 100; },
        hint: 'Suggested: the 1 mg/L iron of the Hoagland micronutrients at your strength. Use 0 if your micronutrient mix has no iron.' },
      { id: 'feT', label: 'Target iron', group: 'concentration', unit: 'mgL', def: 2,
        hint: 'Hydroponic recipes run about 1–3 mg/L (rule of thumb, Iron Addition calculator).' },
      { id: 'feProd', label: 'Iron product', type: 'select', def: 'dtpa',
        options: Object.keys(FE_PRODUCTS).map(function (k) { return { value: k, label: FE_PRODUCTS[k].label }; }) },
      { id: 'fePct', label: 'Iron content of the product', suffix: '% Fe', check: pctCheck('Iron content', 0, 100),
        def: function (ctx) { return FE_PRODUCTS[ctx.v.feProd].pct; }, hint: 'Typical label value; read your product label.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, w = R(ctx, 'water');
      const a = acidDose(w.total, x.alk, x.ph0, x.ph1, x.solT, ACIDS[x.acid]);
      const r = { a: a, V: w.total };
      r.rise = Math.max(0, x.feT - x.feCur);
      r.feG = r.rise * w.total / 1000;
      r.prodG = r.feG / (x.fePct / 100);
      r.fe = fin(x.ph1) ? phCheck(x.feProd, x.ph1) : null;
      return r;
    },
    notices: function (ctx, r) {
      const a = r.a, x = ctx.v, m = [];
      if (a.ok && a.noAcid) m.push('The target pH is not below the source water pH, so no acid is needed.');
      if (a.ok && !a.noAcid && x.ph1 < 5 && x.ph1 >= 4) m.push('A target below pH 5 removes almost all buffering; most crops are grown at pH 5.5–6.5.');
      if (a.ok && a.acid.nut === 'P' && a.nutMgL > 31) m.push('The acid adds ' + fmt(a.nutMgL, 0) + ' mg/L phosphorus, more than the 31 mg/L in full-strength Hoagland. Use nitric acid for part of the dose.');
      if (x.alk > 500) m.push('Alkalinity above 500 mg/L CaCO₃ is unusual; check the units on your water test.');
      if (fin(x.feCur) && fin(x.feT) && x.feT <= x.feCur) m.push('Iron is already at or above the target.');
      if (r.fe && r.fe.level === 'bad') m.push(FE_PRODUCTS[x.feProd].name + ' does not keep iron in solution at pH ' + fmt(x.ph1, 1) + '.');
      if (x.feProd === 'fes') m.push('Ferrous sulfate is not chelated: near neutral pH its iron oxidises and settles out. Use a chelate.');
      if (x.feT > FE_BAND.hi + 1) m.push('The iron target is well above the usual 1–3 mg/L.');
      return m;
    },
    results: function (ctx, r) {
      const a = r.a;
      if (!a.ok) return [{ label: 'Acid per batch', value: '–', main: true }];
      const liquid = !!a.acid.rho;
      const amt = liquid ? (a.mL >= 1000 ? fmt(a.mL / 1000, 2) + ' L' : fmt(a.mL, 1) + ' mL') : (a.gProduct >= 1000 ? fmt(a.gProduct / 1000, 2) + ' kg' : fmt(a.gProduct, 1) + ' g');
      const per100 = (liquid ? a.mL : a.gProduct) / r.V * 100;
      const names = { N: 'nitrate-N', P: 'phosphorus (P)', S: 'sulfate-S' };
      return [
        { label: 'Acid per batch (' + a.acid.name + ')', value: amt, main: true },
        { label: 'Per 100 L of solution', value: fin(per100) ? fmt(per100, 2) + (liquid ? ' mL' : ' g') : '–' },
        { label: 'Acid needed', value: fmt(a.acidEq * 1000, 2) + ' meq/L H⁺' },
        { label: 'Alkalinity left', value: fmt(Math.max(0, a.alkLeftEq) * 1000 * MG_CACO3_PER_MEQ, 0) + ' mg/L CaCO₃ (' + fmt(Math.max(0, a.alkLeftEq) * 1000, 2) + ' meq/L)' },
        { label: 'Nutrient the acid adds', value: a.acid.nut ? fmt(a.nutMgL, 1) + ' mg/L ' + names[a.acid.nut] : 'none' },
        { label: 'Iron product per batch', value: fin(r.prodG) ? fmt(r.prodG, 1) + ' g of ' + FE_PRODUCTS[ctx.v.feProd].name + ' (+' + fmt(r.rise, 2) + ' mg/L Fe)' : '–' },
        { label: 'Iron stability at the target pH', value: r.fe ? r.fe.text : '–' }
      ];
    },
    tips: [
      'Acid dose = alkalinity removed between the source pH and the target pH (carbonate system, Plummer &amp; Busenberg constants) ÷ protons each acid molecule gives up at the target pH (pH Adjustment calculator).',
      'NC State recommends acidifying irrigation water to about pH 5.8, or neutralizing about 80% of the alkalinity (Bailey &amp; Bilderback, 1997). Always add acid to water, in steps, and measure.',
      'Chelate stability (Iron Addition calculator): Fe-EDTA to about pH 6.5, Fe-DTPA to about 7.5, Fe-EDDHA to about 9. Above the limit the iron drops out of solution.'
    ],
    viz: {
      viewBox: '0 0 480 220', label: 'Alkalinity removed by the acid, and the iron level against the 1–3 mg/L band',
      draw: function (svg, ctx, r) {
        const a = r.a, x = ctx.v;
        if (!a.ok) return;
        const alk0 = a.alkEq * 1000 * MG_CACO3_PER_MEQ, left = Math.max(0, a.alkLeftEq) * 1000 * MG_CACO3_PER_MEQ;
        hbars(svg, [
          { label: 'Alkalinity in', value: alk0, text: fmt(alk0, 0) + ' mg/L', cls: 'g-bar-muted' },
          { label: 'Left at pH ' + fmt(x.ph1, 1), value: left, text: fmt(left, 0) + ' mg/L', cls: 'g-bar' }
        ], { x0: 140, w: 310, y0: 20, gap: 36 });
        const x0 = 140, x1 = 450, max = 4, X = function (v) { return x0 + (x1 - x0) * Math.min(v, max) / max; };
        const y = 130;
        text(svg, x0 - 8, y + 15, 'Iron, mg/L', 'end', 'g-label');
        G.el(svg, 'rect', { class: 'g-track', x: x0, y: y, width: x1 - x0, height: 20, rx: 3 });
        G.el(svg, 'rect', { class: 'g-bar-soft', x: X(FE_BAND.lo), y: y, width: X(FE_BAND.hi) - X(FE_BAND.lo), height: 20, rx: 3 });
        if (fin(x.feCur)) G.el(svg, 'rect', { class: 'g-bar-muted', x: x0, y: y + 5, width: Math.max(1, X(x.feCur) - x0), height: 10 });
        if (fin(x.feT)) { G.el(svg, 'line', { class: 'g-line', x1: X(x.feT), y1: y - 6, x2: X(x.feT), y2: y + 26 }); text(svg, X(x.feT), y + 44, 'target ' + fmt(x.feT, 1), 'middle', 'g-strong'); }
        [0, 1, 2, 3, 4].forEach(function (t) { text(svg, X(t), y - 10, String(t), 'middle', 'dim-text'); });
        text(svg, 240, 212, 'Shaded: 1–3 mg/L hydroponic band (rule of thumb)', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return r.a.ok && !r.a.noAcid ? 'pH ' + fmt(ctx.v.ph0, 1) + ' → ' + fmt(ctx.v.ph1, 1) + ' needs ' + fmt(r.a.acidEq * 1000, 2) + ' meq/L of acid' : 'Enter the inputs'; }
    },
    sources: ['bailey1997', 'stumm1996', 'plummer1982', 'crc2016', 'hershkowitz2025', 'norvell1972', 'lindsay1979', 'stummlee1961'],
    links: function (ctx, r) {
      const x = ctx.v, w = R(ctx, 'water');
      return [
        { slug: 'ph-adjustment', label: 'pH Adjustment', params: { vol: p(w.total, 6), vol_u: 'L', alk: p(x.alk, 6), alk_u: 'caco3', ph0: p(x.ph0, 6), ph1: p(x.ph1, 6), temp: p(x.solT, 6), temp_u: 'C', acid: x.acid, out: ACIDS[x.acid].rho ? 'mL' : 'g' } },
        { slug: 'iron-addition', label: 'Iron Addition', params: { sys: 'hyd', vol: p(w.total, 6), vol_u: 'L', cur: p(x.feCur, 6), cur_u: 'mgL', tgt: p(x.feT, 6), tgt_u: 'mgL', prod: x.feProd, form: 'powder', pct: p(x.fePct, 6), ph: p(x.ph1, 6), mout: 'g' } }
      ];
    }
  };

  // ---------- 6. Root-zone oxygen ----------
  const stepOxygen = {
    id: 'oxygen', title: 'Oxygen in the root zone', short: 'Oxygen',
    intro: '<p>Roots breathe. Water can only hold so much oxygen, and warm water holds less. This step works out the most oxygen the solution can hold at its temperature (saturation) and, for deep water culture, sizes the air pumps that keep the canals aerated.</p>',
    fields: [
      { id: 'elev', label: 'Site elevation', group: 'length', unit: 'm', signed: true, def: 0,
        check: function (h) { return h < -500 || h > 6000 ? 'Elevation must be between −500 and 6,000 m.' : ''; },
        hint: 'Lower air pressure at altitude means less oxygen at saturation.' },
      { id: 'doMin', label: 'Minimum dissolved oxygen', group: 'concentration', unit: 'mgL', def: DO_PLANT_MIN,
        hint: 'FAO TP 589 lists more than 3 mg/L for plants (rule of thumb, as the Dissolved Oxygen calculator). Many growers aim higher.' },
      { id: 'airInt', label: 'Aeration intensity', suffix: 'L air per L per min', def: 0.07, show: isSys('dwc'),
        hint: 'Example value: the lowest intensity Baiyin et al. (2021) tested (0.07–0.15 L/L/min improved growth; little extra benefit up to 1.18; less above). Their tests were small containers, so treat it as a starting point and check with a DO meter.' },
      { id: 'airPump', label: 'Air pump', type: 'select', def: 'linear120', show: isSys('dwc'),
        options: Object.keys(AIR_PUMPS).map(function (k) { return { value: k, label: AIR_PUMPS[k].name }; }),
        hint: 'Battery Life calculator presets. Nominal flow; the real flow falls with water depth and hose length.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, r = { cs: csat(x.solT, x.elev) };
      r.margin = r.cs - x.doMin;
      r.pct = x.doMin / r.cs * 100;
      if (sys(ctx) === 'dwc') {
        const pump = AIR_PUMPS[x.airPump];
        r.air = x.airInt * systemWater(ctx);              // L/min, canal water
        r.pumps = Math.max(1, Math.ceil(r.air / pump.lpm - 1e-9));
        r.airW = r.pumps * pump.w;
        r.airKwh = r.airW * 24 / 1000;
        r.pump = pump;
      } else r.airW = 0;
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (fin(r.margin) && r.margin <= 0) m.push('Saturation at this temperature is at or below your minimum: the target cannot be reached with air. Cool the solution.');
      if (ctx.v.solT > 26) m.push('Warm solution holds less oxygen and roots use more; consider cooling.');
      return m;
    },
    results: function (ctx, r) {
      const out = [
        { label: 'Oxygen saturation at ' + q('temperature', ctx.v.solT, ['C'], 1), value: fin(r.cs) ? fmt(r.cs, 2) + ' mg/L' : '–', main: true },
        { label: 'Minimum as a share of saturation', value: fin(r.pct) ? fmt(r.pct, 0) + '%' : '–' },
        { label: 'Room above the minimum', value: fin(r.margin) ? fmt(r.margin, 2) + ' mg/L' : '–' }
      ];
      if (sys(ctx) === 'dwc') {
        out.push({ label: 'Air flow for the canals', value: fin(r.air) ? fmt(r.air, 0) + ' L/min · ' + fmt(r.air / 28.316846592, 1) + ' ft³/min' : '–' });
        out.push({ label: 'Air pumps', value: fin(r.air) ? r.pumps + ' × ' + r.pump.lpm + ' L/min' : '–' });
        out.push({ label: 'Aeration power and energy', value: fin(r.air) ? fmt(r.airW, 0) + ' W · ' + fmt(r.airKwh, 2) + ' kWh/day' : '–' });
      } else {
        out.push({ label: 'Aeration', value: sys(ctx) === 'nft' ? 'Not usually needed: roots above the film are in air' : 'Comes from draining between irrigations' });
      }
      return out;
    },
    tips: function (ctx) {
      return [
        'Saturation: Benson &amp; Krause (1984) equations as used by USGS (2011), with pressure from the elevation (U.S. Standard Atmosphere), as the Dissolved Oxygen calculator. Aeration with air cannot push the solution above 100% saturation.',
        'Root-zone temperature: in a deep-water lettuce trial, Carotti et al. (2021) found about 28 °C best for growth but called 24 °C for both air and roots a reasonable compromise that avoids heating the solution. Warmer water holds less oxygen.',
        sys(ctx) === 'dwc' ? 'Aeration intensity = litres of air per litre of solution per minute. Baiyin et al. (2021) found growth rose up to about 0.15 L/L/min and then levelled off, so more air is not always better; it costs electricity.' : 'NFT and flood-and-drain roots get air directly; deep water culture needs air pumps.'
      ];
    },
    viz: {
      viewBox: '0 0 480 230', label: 'Oxygen saturation against temperature, with the solution temperature and the minimum marked',
      draw: function (svg, ctx, r) {
        const x = ctx.v;
        const x0 = 50, x1 = 450, y0 = 24, y1 = 180, tMax = 40, dMax = 15;
        const X = function (t) { return x0 + (x1 - x0) * t / tMax; };
        const Y = function (d) { return y1 - (y1 - y0) * Math.min(d, dMax) / dMax; };
        let d = '';
        for (let t = 0; t <= 40; t += 1) { const c = csat(t, fin(x.elev) ? x.elev : 0); if (fin(c)) d += (d ? ' L' : 'M') + X(t).toFixed(1) + ',' + Y(c).toFixed(1); }
        G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + y0 + ' L' + x0 + ',' + y1 + ' L' + x1 + ',' + y1 });
        G.el(svg, 'path', { class: 'g-line-accent', d: d });
        if (fin(x.doMin)) { G.el(svg, 'line', { class: 'g-line-warn', x1: x0, y1: Y(x.doMin), x2: x1, y2: Y(x.doMin) }); text(svg, x1, Y(x.doMin) - 6, 'minimum ' + fmt(x.doMin, 1) + ' mg/L', 'end', 'g-warn-text'); }
        if (fin(r.cs)) { G.el(svg, 'circle', { class: 'g-bar', cx: X(x.solT), cy: Y(r.cs), r: 5 }); text(svg, X(x.solT) + 10, Y(r.cs) - 8, fmt(r.cs, 2) + ' mg/L', 'start', 'g-strong'); }
        [0, 10, 20, 30, 40].forEach(function (t) { text(svg, X(t), y1 + 18, t + ' °C', 'middle', 'dim-text'); });
        [0, 5, 10, 15].forEach(function (v) { text(svg, x0 - 6, Y(v) + 4, String(v), 'end', 'dim-text'); });
        text(svg, 250, 222, 'Saturation (mg/L) vs solution temperature', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.cs) ? 'At ' + fmt(ctx.v.solT, 1) + ' °C the solution holds at most ' + fmt(r.cs, 2) + ' mg/L' : 'Enter the inputs'; }
    },
    sources: ['usgs2011', 'benson1984', 'stdatm', 'fao589', 'baiyin2021', 'carotti2021'],
    links: function (ctx) {
      const x = ctx.v;
      return [{ slug: 'dissolved-oxygen', label: 'Dissolved Oxygen', params: { temp: p(x.solT, 6), temp_u: 'C', sal: 0, pmode: 'elev', elev: p(x.elev, 6), elev_u: 'm', group: 'plant', meas: p(x.doMin, 6), meas_u: 'mgL', out: 'mgL' } }];
    }
  };

  // ---------- 7. Water flow and pump ----------
  function pumpHours(ctx) {
    const x = ctx.v, s = sys(ctx);
    if (s === 'media') return Math.min(24, x.floods * x.fillT / 3600);
    if (s === 'drip') return x.dripH / 3600;
    return 24;
  }
  const stepPump = {
    id: 'pump', title: 'Water flow and pump', short: 'Pump',
    intro: '<p>The pump moves the solution from the reservoir to the plants. How much flow it needs depends on the system: a recirculation rate for DWC, a flow per channel for NFT, a fill time for flood-and-drain beds, emitter flow for drip. The guide then picks a PVC pipe size, adds up the friction and fitting losses, and gives the pump duty, its power and its energy use.</p>',
    fields: [
      { id: 'turn', label: 'Turnovers per hour', suffix: '× per hour', def: 1, show: isSys('dwc'),
        check: function (v) { return v > 60 ? 'More than 60 turnovers per hour (once a minute) is not realistic for a hydroponic system.' : ''; },
        hint: 'Example value at the bottom of the Pump &amp; Turnover calculator’s 1–2× band; its table notes that below 1× can be fine for plant-only reservoirs (rule of thumb).' },
      { id: 'chanFlow', label: 'Flow per channel', group: 'flow', unit: 'Lpm', def: 1 / 60, show: isSys('nft'),
        hint: 'Example value; a grower rule of thumb, not from a cited source. Follow your channel maker’s figure and check the film depth.' },
      { id: 'slope', label: 'Channel slope', suffix: '%', def: 2, allowZero: true, show: isSys('nft'),
        hint: 'Example value; check your channel maker’s recommendation.' },
      { id: 'fillT', label: 'Bed fill time', group: 'time', unit: 'min', def: 15 * 60, show: isSys('media'), hint: 'Example value: time to flood the beds.' },
      { id: 'floods', label: 'Floods per day', def: 24, check: intCheck('Floods per day'), show: isSys('media'), hint: 'Example value; timer setting.' },
      { id: 'emit', label: 'Emitter flow', group: 'flow', unit: 'Lph', def: 2 / 3600, show: isSys('drip'), hint: 'Example value; from the emitter label.' },
      { id: 'emitPer', label: 'Emitters per bucket or slab', def: 1, check: intCheck('Emitters'), show: isSys('drip') },
      { id: 'dripH', label: 'Irrigation time per day', group: 'time', unit: 'h', def: 2 * 3600, show: isSys('drip'),
        check: function (v) { return v > 86400 + 1e-6 ? 'A day has only 24 hours.' : ''; }, hint: 'Example value; set it from the crop’s water use and the drain percentage you aim for.' },
      { id: 'vPipe', label: 'Target pipe velocity', group: 'velocity', unit: 'ftps', def: 4 * 0.3048,
        hint: 'Common band 2–5 ft/s (0.6–1.5 m/s); keep under 10 ft/s to limit water hammer (Pipe Water Velocity calculator).' },
      { id: 'pipe', label: 'Supply pipe (PVC Schedule 40)', type: 'select', def: 'auto',
        options: function () {
          return [{ value: 'auto', label: 'Auto: smallest at or under the target' }].concat(PVC40.map(function (x) { return { value: x.id, label: x.name + ' Sch 40 (ID ' + x.idIn.toFixed(3) + ' in)' }; }));
        } },
      { id: 'pipeLen', half: true, label: 'Pipe length', group: 'length', unit: 'm', def: 10, hint: 'Example value: supply line length.' },
      { id: 'lift', half: true, label: 'Static lift', group: 'length', unit: 'm', allowZero: true, def: 1,
        hint: 'Example value: from the reservoir water level to the highest outlet.' },
      { id: 'n90', half: true, label: '90° elbows', def: 4, allowZero: true, check: intCheck('90° elbows') },
      { id: 'nTee', half: true, label: 'Tees (flow through run)', def: 1, allowZero: true, check: intCheck('Tees') },
      { id: 'nBall', half: true, label: 'Ball valves (open)', def: 1, allowZero: true, check: intCheck('Ball valves') },
      { id: 'nCheck', half: true, label: 'Swing check valves', def: 0, allowZero: true, check: intCheck('Check valves') },
      { id: 'pumpEff', label: 'Pump wire-to-water efficiency', suffix: '%', def: 25, check: pctCheck('Pump efficiency', 0, 100),
        hint: 'Pump &amp; Turnover default: small submersible pumps are often 15–35% (rule of thumb). Read your pump curve.' },
      { id: 'price', label: 'Electricity price', suffix: 'per kWh', def: 0.15, allowZero: true }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = sys(ctx), w = R(ctx, 'water'), pl = R(ctx, 'plants');
      const r = { hours: pumpHours(ctx) };
      if (s === 'dwc') r.q = x.turn * w.total / 3600;
      else if (s === 'nft') { r.q = x.nChan * x.chanFlow; r.drop = x.chanL * x.slope / 100; }
      else if (s === 'media') r.q = w.sys / x.fillT;
      else r.q = pl.cont * x.emitPer * x.emit;
      r.turnover = r.q * 3600 / w.total;
      const Q = r.q / 1000;
      if (x.pipe === 'auto') {
        r.pipe = PVC40.filter(function (pp) { return Q / (Math.PI * pp.D * pp.D / 4) <= x.vPipe; })[0] || null;
        r.tooBig = !r.pipe && fin(Q);
        if (!r.pipe) r.pipe = PVC40[PVC40.length - 1];
      } else r.pipe = PVC40.filter(function (pp) { return pp.id === x.pipe; })[0];
      const D = r.pipe.D, wt = water(x.solT);
      r.V = Q / (Math.PI * D * D / 4);
      r.hv = r.V * r.V / (2 * GRAV);
      r.Re = r.V * D / wt.nu;
      r.f = r.Re < 2000 ? 64 / r.Re : colebrook(r.Re, EPS_PVC / D);
      r.hf = r.f * (x.pipeLen / D) * r.hv;
      r.fT = craneFT(D);
      r.K = (x.n90 * FIT.n90 + x.nTee * FIT.nTee + x.nBall * FIT.nBall + x.nCheck * FIT.nCheck) * r.fT + K_ENT + K_EXIT;
      r.hm = r.K * r.hv;
      r.tdh = x.lift + r.hf + r.hm;
      r.pHyd = RHO_PUMP * GRAV * Q * r.tdh;
      r.pElec = r.pHyd / (x.pumpEff / 100);
      r.kWhDay = r.pElec * r.hours / 1000;
      r.costYr = r.kWhDay * 365 * x.price;
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (r.tooBig) m.push('Even an 8″ pipe is faster than the target velocity at this flow. Use parallel lines.');
      if (fin(r.V) && r.V > 10 * 0.3048) m.push('Velocity above 10 ft/s (3 m/s) risks water hammer; use a larger pipe.');
      else if (fin(r.V) && r.V > 0 && (r.V < 2 * 0.3048 || r.V > 5 * 0.3048)) m.push('Pipe velocity ' + q('velocity', r.V, ['ftps'], 1) + ' is outside the common 2–5 ft/s band' + (r.V < 2 * 0.3048 && r.pipe === PVC40[0] ? ' (½″ is the smallest pipe listed; small flows run slower)' : '') + '.');
      if (sys(ctx) === 'media' && ctx.v.floods * ctx.v.fillT > 86400 + 1e-6) m.push('Floods × fill time is longer than a day; the pump would run all the time.');
      return m;
    },
    results: function (ctx, r) {
      const s = sys(ctx);
      const out = [
        { label: 'Pump duty', value: fin(r.tdh) ? flowTxt(r.q).split(' · ')[0] + ' at ' + q('length', r.tdh, ['m'], 2) + ' head' : '–', main: true },
        { label: 'Pump flow', value: flowTxt(r.q) },
        { label: 'Turnover of the solution', value: fin(r.turnover) ? fmt(r.turnover, 2) + '× per hour while running' : '–' }
      ];
      if (s === 'nft') out.push({ label: 'Channel drop over its length', value: fin(r.drop) ? q('length', r.drop, ['cm', 'in'], 1) : '–' });
      out.push(
        { label: 'Supply pipe', value: r.pipe ? r.pipe.name + ' Sch 40 PVC (ID ' + r.pipe.idIn.toFixed(3) + ' in)' : '–' },
        { label: 'Velocity in the pipe', value: fin(r.V) ? q('velocity', r.V, ['mps', 'ftps']) : '–' },
        { label: 'Pipe friction · fittings (ΣK = ' + fmt(r.K, 2) + ')', value: fin(r.hf) ? fmt(r.hf, 3) + ' m · ' + fmt(r.hm, 3) + ' m' : '–' },
        { label: 'Total dynamic head', value: fin(r.tdh) ? q('length', r.tdh, ['m', 'ft'], 2) : '–' },
        { label: 'Hydraulic · electrical power', value: fin(r.pElec) ? fmt(r.pHyd, 1) + ' W · ' + fmt(r.pElec, r.pElec < 100 ? 1 : 0) + ' W' : '–' },
        { label: 'Pump running time', value: hm(r.hours) + ' per day' },
        { label: 'Energy and cost', value: fin(r.kWhDay) ? fmt(r.kWhDay, 2) + ' kWh/day · ' + money(r.costYr) + ' per year' : '–' }
      );
      return out;
    },
    tips: function (ctx) {
      const s = sys(ctx);
      const flowRule = { dwc: 'DWC: flow = turnovers per hour × total solution volume (Pump &amp; Turnover calculator).',
        nft: 'NFT: flow = channels × flow per channel. The pump lifts to the high end of the channels; the slope carries the film back.',
        media: 'Flood and drain: flow = water held by the flooded beds ÷ fill time; the pump runs floods × fill time per day.',
        drip: 'Drip: flow = emitters × emitter flow while irrigating; the pump runs only the irrigation time.' }[s];
      return [flowRule,
        'Total dynamic head = static lift + pipe friction (Darcy–Weisbach with Colebrook) + fitting losses (Crane K = n × f<sub>T</sub>), as the Head Loss calculator. Electrical power = ρ g Q H ÷ efficiency (Pump &amp; Turnover).',
        'Pick a pump whose curve gives this flow at this head, near its best-efficiency point.'];
    },
    viz: {
      viewBox: '0 0 480 200', label: 'Pump head split into static lift, friction and fittings',
      draw: function (svg, ctx, r) {
        const parts = [['Static lift', ctx.v.lift, 'g-bar-muted'], ['Pipe friction', r.hf, 'g-bar-water'], ['Fittings', r.hm, 'g-bar']];
        if (!fin(r.tdh) || r.tdh <= 0) return;
        const x0 = 40, w = 400, y = 40, hh = 34;
        let xx = x0;
        parts.forEach(function (pt) { if (!(pt[1] > 0)) return; const bw = pt[1] / r.tdh * w; G.el(svg, 'rect', { class: pt[2], x: xx, y: y, width: bw, height: hh }); xx += bw; });
        G.el(svg, 'rect', { class: 'tank-line', x: x0, y: y, width: w, height: hh, fill: 'none' });
        text(svg, x0, y - 10, 'Total dynamic head ' + fmt(r.tdh, 2) + ' m', 'start', 'g-strong');
        parts.forEach(function (pt, i) {
          const ly = 110 + i * 26;
          G.el(svg, 'rect', { class: pt[2], x: 40, y: ly - 11, width: 14, height: 12 });
          text(svg, 60, ly, pt[0] + ' ' + (fin(pt[1]) ? fmt(pt[1], 3) + ' m' : '–'), 'start', 'g-label');
        });
      },
      caption: function (ctx, r) { return fin(r.pElec) ? fmt(r.pElec, 0) + ' W electrical at ' + fmt(ctx.v.pumpEff, 0) + '% efficiency' : 'Enter the inputs'; }
    },
    sources: ['fao589', 'rakocy2006', 'astm1785', 'tenstates', 'clark828', 'crane2009', 'colebrook1939', 'munson2009', 'huber2009', 'nist811'],
    links: function (ctx, r) {
      const x = ctx.v, w = R(ctx, 'water');
      const wvPipe = r.pipe && r.pipe.wv ? { pipe: '40:' + r.pipe.wv } : { pipe: 'custom', diam: r.pipe ? r.pipe.idIn : '', diam_u: 'in' };
      const flowU = r.q < 0.5 ? 'Lph' : 'm3ph';
      const flowV = flowU === 'Lph' ? p(r.q * 3600, 6) : p(r.q * 3.6, 6);
      const pt = sys(ctx) === 'dwc'
        ? { mode: 'size', volume: p(w.total, 6), volume_u: 'L', turnover: p(x.turn, 6), outflow: 'Lph' }
        : { mode: 'check', volume: p(w.total, 6), volume_u: 'L', pumpflow: p(r.q * 3600, 6), pumpflow_u: 'Lph' };
      return [
        { slug: 'water-velocity', label: 'Pipe Water Velocity', params: Object.assign({ mode: 'check', flow: flowV, flow_u: flowU, temp: p(x.solT, 6), temp_u: 'C', vmin: 2, vmin_u: 'ftps', vmax: 5, vmax_u: 'ftps', out: 'ftps' }, wvPipe) },
        { slug: 'head-loss', label: 'Head Loss', params: { method: 'dw', pipe: r.pipe ? r.pipe.id : '', mat: 'pvc', flow: flowV, flow_u: flowU, len: p(x.pipeLen, 6), len_u: 'm', lift: p(x.lift, 6), lift_u: 'm', temp: p(x.solT, 6), temp_u: 'C',
          n90: x.n90, n45: 0, nteer: x.nTee, nteeb: 0, nball: x.nBall, ncheck: x.nCheck, nent: 1, nexit: 1, out: 'm', outp: 'kPa' } },
        { slug: 'pump-turnover', label: 'Pump & Turnover', params: Object.assign(pt, { head: p(r.tdh, 6), head_u: 'm', eff: p(x.pumpEff, 6), hours: p(r.hours, 6), price: p(x.price, 6) }) }
      ];
    }
  };

  // ---------- 8. Lighting ----------
  function lightLink(ctx, r) {
    const x = ctx.v;
    const mh = r.L && r.L.ok ? Math.max(0.1, ceilTo(Math.max(r.L.sx, r.L.sy) / SMH_MAX, 0.05)) : '';
    const custom = x.fixture === 'custom' || ['ppf', 'watts'].some(function (k) { return ctx.overridden[k]; });
    const fx = FIXTURES[x.fixture];
    return { slug: 'light-fixture-layout', label: 'Light Fixture Layout', params: {
      tmode: 'dli', dli: p(r.suppl, 6), hours: p(x.hours / 3600, 6), hours_u: 'h', len: p(x.litL, 6), len_u: 'm', wid: p(x.litW, 6), wid_u: 'm',
      preset: custom ? 'custom' : x.fixture, ppf: p(x.ppf, 6), watts: p(x.watts, 6), watts_u: 'W',
      fl: fx.fl ? p(fx.fl, 6) : '', fl_u: 'm', fw: fx.fw ? p(fx.fw, 6) : '', fw_u: 'm', mh: mh ? p(mh, 6) : '', mh_u: 'm',
      cu: p(x.cu, 6), mf: p(x.mf, 6), price: fin(x.price) ? p(x.price, 6) : '', sp_u: 'm' } };
  }
  function lightingGuideUrl(ctx) {
    const x = ctx.v, qs = new URLSearchParams();
    const set = function (k, v) { if (fin(v) || (typeof v === 'string' && v)) qs.set(k, typeof v === 'number' ? p(v, 6) : v); };
    set('crop', crop(ctx).dli); set('setting', x.setting); set('target', x.target);
    if (x.setting === 'greenhouse') { set('natDli', x.natDli); set('trans', x.trans); }
    set('hours', x.hours / 3600); set('len', x.litL); set('wid', x.litW);
    return '../guides/lighting-design.html?' + qs.toString();
  }
  const stepLight = {
    id: 'light', title: 'Lighting', short: 'Light',
    intro: '<p>Plants respond to the total light they get in a day, the <strong>daily light integral (DLI)</strong>. Indoors the lights supply all of it; in a greenhouse they top up the daylight. This step gives the headline numbers (light intensity, a first fixture count, power and energy) with the same formulas as the lighting calculators. For the full design, continue in the <a href="../guides/lighting-design.html">Design a grow light system</a> guide.</p>',
    fields: [
      { id: 'setting', label: 'Setting', type: 'select', def: 'indoor',
        options: [{ value: 'indoor', label: 'Indoor, sole-source lighting' }, { value: 'greenhouse', label: 'Greenhouse, supplemental lighting' }] },
      { id: 'target', label: 'Target DLI', suffix: 'mol/m²/day',
        def: function (ctx) { const d = dliCrop(ctx); return d.lo !== null ? +((d.lo + d.hi) / 2).toFixed(2) : 14.5; },
        check: function (d) { return d > 65 ? 'A DLI above about 65 mol/m²/day is more than the sun gives on a clear summer day.' : ''; },
        hint: function (ctx) { const d = dliCrop(ctx); return d.lo !== null ? 'Suggested: the middle of the ' + d.lo + '–' + d.hi + ' mol/m²/day rule-of-thumb range (' + d.name + ', Daily Light Integral calculator).' : 'Example value; enter your crop’s target.'; } },
      { id: 'natDli', label: 'Outdoor DLI (darkest month)', suffix: 'mol/m²/day', def: 10, allowZero: true,
        show: function (ctx) { return ctx.v.setting === 'greenhouse'; }, hint: 'Example value; read it from the Faust &amp; Logan (2018) maps.' },
      { id: 'trans', label: 'Greenhouse light transmission', suffix: '%', def: 50, check: pctCheck('Transmission', 1, 100),
        show: function (ctx) { return ctx.v.setting === 'greenhouse'; }, hint: 'Your estimate; Purdue HO-238-W: glazing and structure can cut DLI by 40–70%.' },
      { id: 'hours', label: 'Hours of light per day', group: 'time', unit: 'h', def: 16 * 3600,
        check: function (v) { return v > 86400 + 1e-6 ? 'A day has only 24 hours.' : ''; }, hint: 'Suggested 16 h, the Daily Light Integral default (rule of thumb).' },
      { id: 'litL', half: true, label: 'Lit area length', group: 'length', unit: 'm', def: function (ctx) { return R(ctx, 'plants').L; },
        hint: 'Suggested: the grow units from the plants step. Add aisles if the lights cover them.' },
      { id: 'litW', half: true, label: 'Lit area width', group: 'length', unit: 'm', def: function (ctx) { return R(ctx, 'plants').W; } },
      { id: 'fixture', label: 'Fixture', type: 'select', def: 'led',
        options: Object.keys(FIXTURES).map(function (k) { return { value: k, label: FIXTURES[k].name }; }),
        hint: 'Illustrative round numbers from the Light Fixture Layout calculator, not products.' },
      { id: 'ppf', half: true, label: 'Fixture PPF', suffix: 'µmol/s', def: function (ctx) { return FIXTURES[ctx.v.fixture].ppf || NaN; } },
      { id: 'watts', half: true, label: 'Fixture input power', group: 'power', unit: 'W', def: function (ctx) { return FIXTURES[ctx.v.fixture].watts || NaN; } },
      { id: 'cu', half: true, label: 'Utilization factor', suffix: '%', def: function (ctx) { return ctx.v.setting === 'greenhouse' ? 70 : 80; }, check: pctCheck('Utilization factor', 1, 100),
        hint: 'Rule of thumb (Light Fixture Layout): 80–90% walled room with plants covering the floor, 60–80% open benches.' },
      { id: 'mf', half: true, label: 'Maintenance factor', suffix: '%', def: 90, check: pctCheck('Maintenance factor', 1, 100), hint: 'Rule of thumb 85–95%.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, gh = x.setting === 'greenhouse';
      const r = { gh: gh };
      r.inside = gh ? x.natDli * x.trans / 100 : 0;
      const raw = x.target - r.inside;
      r.none = fin(raw) && raw <= 1e-9;
      r.suppl = r.none ? NaN : raw;
      r.ppfd = r.suppl / (x.hours / 3600 * DLI_K);
      r.L = lightLayout({ L: x.litL, W: x.litW, hours: x.hours / 3600, ppf: x.ppf, watts: x.watts, cu: x.cu / 100, mf: x.mf / 100, target: r.ppfd });
      if (r.L.ok) r.costYr = r.L.kwhYear * x.price;
      return r;
    },
    notices: function (ctx, r) {
      return [r.none ? 'Daylight inside already meets the target in this month: no supplemental light is needed. Plan for the darkest month.' : '',
        r.L && r.L.tooMany ? 'That needs more than a million fixtures; check the area and the fixture PPF.' : '',
        r.L && r.L.ok && r.L.m > r.L.n ? 'An even ' + r.L.rows + ' × ' + r.L.cols + ' grid needs ' + r.L.m + ' fixtures, ' + (r.L.m - r.L.n) + ' more than the minimum.' : ''];
    },
    results: function (ctx, r) {
      const L = r.L || {};
      return [
        { label: (r.gh ? 'Supplemental PPFD' : 'PPFD') + ' needed at the canopy', value: fin(r.ppfd) ? fmt(r.ppfd, 1) + ' µmol/m²/s' : '–', main: true },
        { label: r.gh ? 'DLI the lights add' : 'DLI the lights deliver', value: fin(r.suppl) ? fmt(r.suppl, 2) + ' mol/m²/day' : '–' },
        { label: 'Lit area', value: areaTxt(ctx.v.litL * ctx.v.litW) },
        { label: 'Fixtures needed (lumen method)', value: L.ok ? L.n + ' · ' + L.rows + ' × ' + L.cols + ' grid = ' + L.m : '–' },
        { label: 'PPFD achieved', value: L.ok ? fmt(L.ppfd, 1) + ' µmol/m²/s (' + fmt(L.dli, 2) + ' mol/m²/day)' : '–' },
        { label: 'Lighting power', value: L.ok ? fmt(L.power, 0) + ' W · ' + fmt(L.power / (ctx.v.litL * ctx.v.litW), 1) + ' W/m²' : '–' },
        { label: 'Energy and cost', value: L.ok ? fmt(L.kwhDay, 2) + ' kWh/day · ' + fmt(L.kwhYear, 0) + ' kWh/year · ' + money(r.costYr) + '/year' : '–' }
      ];
    },
    tips: function (ctx) {
      return [
        'PPFD = DLI × 1,000,000 ÷ (hours × 3600). Fixtures N = ⌈PPFD × area ÷ (PPF × utilization × maintenance)⌉ and the grid with the fewest extra fixtures and the most even spacing (Daily Light Integral and Light Fixture Layout calculators).',
        'DLI ranges are rules of thumb: lettuce and leafy greens 12–17, basil and herbs 15–25, tomato and fruiting crops 20–30 mol/m²/day (Stallknecht, 2025).',
        '<a href="' + lightingGuideUrl(ctx) + '">Continue in the Design a grow light system guide</a> (opens with this crop, area and photoperiod) for the spacing, mounting height, heat load and a fixture comparison.'
      ];
    },
    viz: {
      viewBox: '0 0 480 230', label: 'Lights-on period over 24 hours at the PPFD needed',
      draw: function (svg, ctx, r) {
        const h = ctx.v.hours / 3600;
        const x0 = 52, x1 = 440, yT = 30, yB = 180;
        if (!fin(r.ppfd) || !(h > 0)) return;
        const yMax = Math.max(100, Math.ceil(r.ppfd * 1.3 / 100) * 100);
        const X = function (t) { return x0 + (x1 - x0) * t / 24; };
        const Y = function (v) { return yB - (yB - yT) * Math.min(v, yMax) / yMax; };
        text(svg, x0, 18, 'PPFD µmol/m²/s', 'start', 'dim-text');
        [0, yMax / 2, yMax].forEach(function (v) { text(svg, x0 - 6, Y(v) + 4, fmt(v, 0), 'end', 'dim-text'); });
        const st = 12 - h / 2, en = 12 + h / 2;
        G.el(svg, 'rect', { class: 'g-bar-soft', x: X(st), y: Y(r.ppfd), width: X(en) - X(st), height: yB - Y(r.ppfd) });
        text(svg, X(12), (Y(r.ppfd) + yB) / 2 + 5, 'DLI ' + fmt(r.suppl, 1), 'middle', 'g-strong');
        G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + yT + ' L' + x0 + ',' + yB + ' L' + x1 + ',' + yB });
        for (let t = 0; t <= 24; t += 6) text(svg, X(t), yB + 18, (t < 10 ? '0' : '') + t + ':00', 'middle', 'dim-text');
        text(svg, X(12), yB + 42, fmt(r.ppfd, 0) + ' µmol/m²/s for ' + fmt(h, 1) + ' h', 'middle', 'g-label');
      },
      caption: function (ctx, r) { return r.L && r.L.ok ? r.L.m + ' × ' + FIXTURES[ctx.v.fixture].short + ' · ' + fmt(r.L.power / 1000, 2) + ' kW' : 'Enter the inputs'; }
    },
    sources: ['stallknecht2025', 'faust2018', 'torres2010', 'dilaura2011', 'kusuma2020'],
    links: function (ctx, r) {
      const x = ctx.v;
      return [
        { slug: 'daily-light-integral', label: 'Daily Light Integral', params: { mode: 'ppfd', crop: x.setting === 'greenhouse' ? 'custom' : crop(ctx).dli, pattern: 'const', src: 'led', target: p(r.suppl, 6), hours: p(x.hours / 3600, 6), hours_u: 'h', out_u: 'umol' } },
        lightLink(ctx, r)
      ];
    }
  };

  // ---------- 9. UV disinfection (optional) ----------
  function uvOn(ctx) { return ctx.v.uvOn === 'yes'; }
  const stepUV = {
    id: 'uv', title: 'UV disinfection (optional)', short: 'UV',
    intro: '<p>In a recirculating system every plant shares the same solution, so a root disease can spread through it. A UV unit on the supply line kills free-floating microorganisms in the water that passes it. This step sizes the UV-C lamp power. Note that UV also breaks down some iron chelates.</p>',
    fields: [
      { id: 'uvOn', label: 'Include UV', type: 'select', def: 'yes', options: [{ value: 'yes', label: 'Yes, size a UV unit' }, { value: 'no', label: 'No UV' }] },
      { id: 'uvShare', label: 'Share of the pump flow treated', suffix: '%', def: 100, show: uvOn, check: pctCheck('Share treated', 0, 100) },
      { id: 'uvOrg', label: 'Design dose', type: 'select', def: 'bact', show: uvOn,
        options: UV_ORGS.map(function (o) { return { value: o.id, label: o.name + ' – ' + o.dose + ' mJ/cm²' }; }),
        hint: 'The UV calculator’s doses come from fish-farm and drinking-water references; it has no plant-pathogen doses. Check the dose for your target organism.' },
      { id: 'uvt', label: 'Solution UV transmittance (UVT)', suffix: '%/cm', def: 80, show: uvOn, check: pctCheck('UVT', 0, 100),
        hint: 'UV Filtration Sizing default. Coloured nutrient solution can be much lower; measure it.' },
      { id: 'uvGap', label: 'Water gap, sleeve to housing', group: 'length', unit: 'cm', def: 0.02, show: uvOn },
      { id: 'uvEol', label: 'Lamp output at end of life', suffix: '%', def: 80, show: uvOn, check: pctCheck('Lamp output at end of life', 0, 100) }
    ],
    compute: function (ctx) {
      const x = ctx.v, pm = R(ctx, 'pump');
      const r = { on: uvOn(ctx) };
      if (!r.on) return r;
      r.org = uvOrg(x.uvOrg);
      r.Q = pm.q * x.uvShare / 100;
      r.gCm = x.uvGap * 100;
      r.wf = waterFactor(x.uvt, r.gCm);
      r.uvcW = r.org.dose * r.Q * 1000 / (r.gCm * r.wf * x.uvEol / 100 * 1000);   // uv-sterilizer-sizing.js, lamp method
      return r;
    },
    notices: function (ctx, r) {
      const f = ctx.v.feProd;
      return [r.on && (f === 'dtpa' || f === 'edta') ? 'UV breaks down iron chelates in nutrient solution; ' + FE_PRODUCTS[f].name + ' is less stable than Fe-EDDHA (Albano & Miller, 2001). Check iron after adding UV.' : ''];
    },
    results: function (ctx, r) {
      if (!r.on) return [{ label: 'UV', value: 'Not included', main: true }];
      return [
        { label: 'UV-C lamp output needed', value: fin(r.uvcW) ? fmt(r.uvcW, 1) + ' W UV-C' : '–', main: true },
        { label: 'Electrical lamp power (approx.)', value: fin(r.uvcW) ? fmt(r.uvcW / 0.4, 0) + '–' + fmt(r.uvcW / 0.3, 0) + ' W' : '–' },
        { label: 'Flow through the UV', value: flowTxt(r.Q) },
        { label: 'Target dose at end of lamp life', value: r.org.dose + ' mJ/cm²' },
        { label: 'Water factor', value: fin(r.wf) ? fmt(r.wf, 3) : '–' }
      ];
    },
    tips: [
      'UV-C watts = dose × flow ÷ (water gap × water factor × end-of-life output): an average-dose energy balance (Bolton &amp; Linden, 2003; UV Filtration Sizing calculator). Use the maker’s validated rating when you have one.',
      'Put UV after the filter: particles shade organisms and absorb UV (Summerfelt, 2003). Electrical watts assume 30–40% UV-C conversion (US EPA, 2006).',
      'UV breaks down some iron chelates; Fe-EDTA and Fe-DTPA are less stable than Fe-EDDHA (Albano &amp; Miller, 2001). Check iron after adding UV.'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'UV-C lamp power needed and the electrical power it implies',
      draw: function (svg, ctx, r) {
        if (!r.on) { text(svg, 240, 100, 'No UV in this design', 'middle', 'g-label'); return; }
        G.el(svg, 'rect', { class: 'g-box', x: 40, y: 30, width: 400, height: 54, rx: 27 });
        G.el(svg, 'rect', { class: 'g-bar-soft', x: 70, y: 48, width: 340, height: 18, rx: 9 });
        text(svg, 240, 61, 'UV-C lamp', 'middle', 'g-accent-text');
        arrow(svg, 10, 57, 40, 57); arrow(svg, 440, 57, 470, 57);
        hbars(svg, [
          { label: 'UV-C', value: r.uvcW, text: fmt(r.uvcW, 1) + ' W', cls: 'g-bar' },
          { label: 'Electrical', value: r.uvcW / 0.3, text: fmt(r.uvcW / 0.4, 0) + '–' + fmt(r.uvcW / 0.3, 0) + ' W', cls: 'g-bar-muted' }
        ], { x0: 110, w: 330, y0: 112, gap: 36 });
      },
      caption: function (ctx, r) { return r.on && fin(r.uvcW) ? r.org.dose + ' mJ/cm² at ' + flowTxt(r.Q) + ', end of lamp life' : (r.on ? 'Enter the inputs' : 'UV skipped'); }
    },
    sources: ['summerfelt2003', 'bolton2003', 'epa2006uv', 'albano2001', 'cfr141'],
    links: function (ctx, r) {
      const x = ctx.v;
      if (!r.on) return [];
      return [{ slug: 'uv-sterilizer-sizing', label: 'UV Filtration Sizing', params: {
        flowmode: 'flow', flow: p(r.Q * 3600, 6), flow_u: 'Lph', org: r.org.id, target: r.org.dose, uvt: p(x.uvt, 6),
        spec: 'lamp', lampw: fin(r.uvcW) ? Math.ceil(r.uvcW) : '', lampw_u: 'W', gap: p(r.gCm, 6), gap_u: 'cm', eol: p(x.uvEol, 6), out: 'Lph' } }];
    }
  };

  // ---------- 10. Backup power ----------
  const stepBackup = {
    id: 'backup', title: 'Backup power for pumps and air', short: 'Backup',
    intro: '<p>A power cut stops the pump and the air. In NFT the film stops at once and the roots can dry out; in deep water culture the oxygen in the canals runs down. This step sizes a battery bank to keep the critical loads running until power returns or a generator starts. Same method as the Battery Life calculator.</p>',
    fields: [
      { id: 'pumpBackup', label: 'Keep the solution pump running on batteries', type: 'select',
        def: function (ctx) { return sys(ctx) === 'nft' ? 'yes' : 'no'; },
        options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
        hint: function (ctx) { return sys(ctx) === 'nft' ? 'Suggested for NFT: the roots depend on the film.' : sys(ctx) === 'dwc' ? 'DWC roots stay in the solution; the air pumps are the critical load.' : 'Wet media or substrate buffers the plants for a while.'; } },
      { id: 'otherW', label: 'Controller, alarm and router', group: 'power', unit: 'W', def: 10, allowZero: true, hint: 'Battery Life preset.' },
      { id: 'backupH', label: 'Backup time needed', group: 'time', unit: 'h', def: 12 * 3600, hint: 'How long until power is back or a generator takes over (example value).' },
      { id: 'chem', label: 'Battery type', type: 'select', def: 'agm', options: Object.keys(CHEM).map(function (k) { return { value: k, label: CHEM[k].name }; }) },
      { id: 'batAh', half: true, label: 'Capacity per battery', suffix: 'Ah', def: 100 },
      { id: 'batV', half: true, label: 'Battery voltage', suffix: 'V', def: 12 },
      { id: 'dod', label: 'Usable depth of discharge', suffix: '%', def: function (ctx) { return CHEM[ctx.v.chem].dod; }, check: pctCheck('Depth of discharge', 0, 100),
        hint: 'Rule of thumb: about 50% for lead-acid; 80% is conservative for LiFePO4.' },
      { id: 'invEff', label: 'Inverter efficiency', suffix: '%', def: 85, check: pctCheck('Inverter efficiency', 0, 100) }
    ],
    compute: function (ctx) {
      const x = ctx.v, o = R(ctx, 'oxygen'), pm = R(ctx, 'pump'), uv = R(ctx, 'uv');
      const r = { airW: o.airW || 0, pumpW: x.pumpBackup === 'yes' ? pm.pElec : 0 };
      r.pAvg = r.airW + x.otherW + r.pumpW;
      r.pBat = r.pAvg / (x.invEff / 100);
      const ch = CHEM[x.chem];
      const m = { pBat: r.pBat, V: x.batV, C: x.batAh, dod: x.dod / 100, k: ch.k, ratedI: x.batAh / RATE_H };
      r.need = null;
      if (fin(r.pBat) && r.pBat > 0 && x.batV > 0 && x.batAh > 0 && m.dod > 0) {
        for (let n = 1; n <= 500; n++) { const tt = runtimeFor(n, m); if (tt * 3600 >= x.backupH - 1e-6) { r.need = n; r.needT = tt; break; } }
      }
      r.k = ch.k;
      r.running = (pm.pElec || 0) + r.airW + (uv.on && fin(uv.uvcW) ? uv.uvcW / 0.35 : 0) + x.otherW;
      return r;
    },
    notices: function (ctx, r) { return [r.need === null && fin(r.pBat) && r.pBat > 0 ? 'More than 500 batteries would be needed; use a generator.' : '']; },
    results: function (ctx, r) {
      const x = ctx.v;
      return [
        { label: 'Batteries for the backup time', value: r.need ? r.need + ' × ' + fmt(x.batV) + ' V ' + fmt(x.batAh) + ' Ah in parallel (' + hm(r.needT) + ')' : '–', main: true },
        { label: 'Loads kept running', value: [r.airW ? 'air ' + fmt(r.airW, 0) + ' W' : '', r.pumpW ? 'pump ' + fmt(r.pumpW, 0) + ' W' : '', fin(x.otherW) && x.otherW > 0 ? 'controls ' + fmt(x.otherW, 0) + ' W' : ''].filter(Boolean).join(' · ') || 'none' },
        { label: 'Load on the batteries', value: fin(r.pBat) ? fmt(r.pBat, 0) + ' W (incl. inverter loss)' : '–' },
        { label: 'Bank energy', value: r.need ? fmt(r.need * x.batV * x.batAh / 1000, 2) + ' kWh nominal' : '–' },
        { label: 'Normal running load without lights', value: fin(r.running) ? fmt(r.running, 0) + ' W (pump, air, UV, controls; a generator must also cover motor starting surge)' : '–' }
      ];
    },
    tips: [
      'Runtime = battery energy × usable depth of discharge × Peukert correction ÷ load (Battery Life calculator). Lead-acid capacity drops at high discharge rates (Peukert, 1897; Battery University BU-501).',
      'Lights are left off the backup here: plants survive hours of darkness, but not dry roots or airless water.',
      'Fit an alarm that warns of a power or pump failure, and test the backup regularly.'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'Loads on the backup batteries',
      draw: function (svg, ctx, r) {
        hbars(svg, [
          { label: 'Air pumps', value: r.airW, text: fmt(r.airW, 0) + ' W', cls: 'g-bar-water' },
          { label: 'Solution pump', value: r.pumpW, text: fmt(r.pumpW, 0) + ' W', cls: 'g-bar' },
          { label: 'Controls', value: ctx.v.otherW, text: fmt(ctx.v.otherW, 0) + ' W', cls: 'g-bar-muted' },
          { label: 'From batteries', value: r.pBat, text: fmt(r.pBat, 0) + ' W', cls: 'g-bar-soft' }
        ], { x0: 130, w: 320, y0: 20, gap: 40, bh: 22 });
      },
      caption: function (ctx, r) { return r.need ? r.need + ' batteries keep ' + fmt(r.pAvg, 0) + ' W running for ' + hm(r.needT) : 'Enter the inputs'; }
    },
    sources: ['bu501', 'peukert1897', 'victron', 'ieee485'],
    links: function (ctx, r) {
      const x = ctx.v, pm = R(ctx, 'pump');
      const loads = [];
      if (r.airW) loads.push(['Air pumps', r.airW]);
      if (x.pumpBackup === 'yes') loads.push(['Solution pump', pm.pElec]);
      loads.push(['Controller / alarm / router', x.otherW]);
      const prm = { chem: x.chem, cap: p(x.batAh, 6), volt: p(x.batV, 6), count: r.need || 1, wiring: 'parallel', dod: p(x.dod, 6), health: 100,
        path: 'ac', eff: p(x.invEff, 6), idle: 0, idle_u: 'W', target: p(x.backupH / 3600, 6), target_u: 'h', peuk: r.k, rateh: RATE_H, rateh_u: 'h', n: loads.length };
      loads.forEach(function (l, i) { prm['ln' + i] = l[0]; prm['lp' + i] = p(l[1], 6); prm['lp' + i + '_u'] = 'W'; prm['lq' + i] = 1; prm['ld' + i] = 100; });
      return [{ slug: 'battery-life', label: 'Battery Life', params: prm }];
    }
  };

  // ---------- 11. Reservoir drain-back ----------
  const stepSump = {
    id: 'sump', title: 'Reservoir drain-back check', short: 'Drain-back',
    intro: '<p>When the pump stops, the water standing in the channels, over the canal outlets, in flooded beds and in the supply line runs back to the reservoir. If the reservoir cannot hold it, it overflows onto the floor. This step sizes the reservoir and checks it has room, with the Sump Drain-Back calculator’s method.</p>',
    fields: [
      { id: 'overHead', label: 'Water above the canal outlet', group: 'length', unit: 'cm', def: 0.02, allowZero: true, show: isSys('dwc'),
        hint: 'With an overflow standpipe only the water over it drains (1–2 cm, Sump Drain-Back calculator). With a bottom outlet use the whole water depth.' },
      { id: 'otherDrain', label: 'Other drain-back', group: 'volume', unit: 'L', def: 0, allowZero: true, hint: 'Return gutters, filters or anything else that drains to the reservoir.' },
      { id: 'margin', label: 'Safety margin', suffix: '%', def: 25, allowZero: true, hint: 'Rule of thumb: 20–25% extra.' },
      { id: 'sumpW', half: true, label: 'Reservoir width', group: 'length', unit: 'm', def: 1.0, hint: 'Example value.' },
      { id: 'sumpRun', half: true, label: 'Water depth while running', group: 'length', unit: 'm', def: 0.5, hint: 'Example value.' },
      { id: 'sumpL', half: true, label: 'Reservoir length', group: 'length', unit: 'm',
        def: function (ctx) { const x = ctx.v, w = R(ctx, 'water'); return Math.max(0.1, ceilTo(w.res / 1000 / (x.sumpW * x.sumpRun), 0.05)); },
        hint: 'Suggested: holds the reservoir volume from the volume step at the running depth.' },
      { id: 'sumpH', half: true, label: 'Depth to rim', group: 'length', unit: 'm',
        def: function (ctx) { const x = ctx.v; return ceilTo(x.sumpRun + drainTotal(ctx) * (1 + x.margin / 100) / (x.sumpL * x.sumpW * 1000), 0.05); },
        check: function (v, ctx) { return v <= ctx.v.sumpRun ? 'The running water depth must be below the rim.' : ''; },
        hint: 'Suggested: room for the drain-back plus the margin, rounded up to 5 cm.' }
    ],
    compute: function (ctx) {
      const x = ctx.v;
      const r = { rows: drainRows(ctx) };
      r.total = drainTotal(ctx);
      const A = x.sumpL * x.sumpW;
      r.runL = A * x.sumpRun * 1000;
      r.free = A * (x.sumpH - x.sumpRun) * 1000;
      r.need = r.total * (1 + x.margin / 100);
      r.after = x.sumpRun + r.total / (A * 1000);
      r.status = r.total > r.free + 1e-9 ? 'bad' : r.need > r.free + 1e-9 ? 'warn' : 'ok';
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (fin(r.free) && r.status === 'bad') m.push('The reservoir overflows when the pump stops: ' + fmt(r.free, 0) + ' L free but ' + fmt(r.total, 0) + ' L drains back. Use a bigger reservoir or run it lower.');
      else if (fin(r.free) && r.status === 'warn') m.push('The drain-back fits, but without the ' + fmt(ctx.v.margin, 0) + '% safety margin.');
      const w = R(ctx, 'water');
      if (fin(r.runL) && fin(w.res) && Math.abs(r.runL - w.res) > Math.max(1, 0.05 * w.res)) m.push('This reservoir holds ' + fmt(r.runL, 0) + ' L at the running depth, not the ' + fmt(w.res, 0) + ' L used for dosing in the volume step.');
      return m;
    },
    results: function (ctx, r) {
      const out = [{ label: 'Water that drains back', value: volTxt(r.total), main: true }];
      r.rows.forEach(function (row) { out.push({ label: row.name, value: volTxt(row.L) }); });
      out.push(
        { label: 'Reservoir water while running', value: volTxt(r.runL) },
        { label: 'Free capacity · needed with margin', value: fin(r.free) ? volTxt(r.free) + ' · ' + volTxt(r.need) : '–' },
        { label: 'Level after the pump stops', value: fin(r.after) ? fmt(r.after, 2) + ' m of ' + fmt(ctx.v.sumpH, 2) + ' m' : '–' },
        { label: 'Result', value: !fin(r.free) ? '–' : r.status === 'ok' ? 'Fits, with margin' : r.status === 'warn' ? 'Fits, below margin' : 'Overflows' }
      );
      return out;
    },
    tips: [
      'Drain-back = channel film + water over the canal outlets + flooded bed water × pore space + the supply line, counted full (Sump Drain-Back calculator).',
      'In flood-and-drain the reservoir must also give up the beds’ water each time they fill: keep the pump intake covered at the lowest level.',
      'Leave 20–25% spare volume, and use a float switch so the pump cannot run dry.'
    ],
    viz: {
      viewBox: '0 0 480 220', label: 'Side view of the reservoir with the running level and the level after drain-back',
      draw: function (svg, ctx, r) {
        const x = ctx.v;
        if (!(x.sumpH > 0) || !fin(x.sumpRun)) return;
        const x0 = 60, w = 240, y0 = 30, hgt = 150;
        const Y = function (d) { return y0 + hgt - Math.min(d, x.sumpH * 1.15) / x.sumpH * hgt; };
        G.el(svg, 'rect', { class: 'water', x: x0, y: Y(x.sumpRun), width: w, height: Y(0) - Y(x.sumpRun) });
        if (fin(r.after)) { const top = Math.max(y0 - 12, Y(r.after)); G.el(svg, 'rect', { class: r.status === 'bad' ? 'g-bar-warn' : 'g-bar-soft', x: x0, y: top, width: w, height: Math.max(0, Y(x.sumpRun) - top) }); }
        G.el(svg, 'path', { class: 'tank-line', d: 'M' + x0 + ',' + y0 + ' L' + x0 + ',' + (y0 + hgt) + ' L' + (x0 + w) + ',' + (y0 + hgt) + ' L' + (x0 + w) + ',' + y0, fill: 'none' });
        // right-hand labels, spread so they never overlap (top to bottom: rim, after stop, running)
        const labs = [{ y: y0, t: 'rim ' + fmt(x.sumpH, 2) + ' m', c: 'dim-text' }];
        if (fin(r.after)) labs.push({ y: Math.max(y0 - 12, Y(r.after)), t: 'after stop ' + fmt(r.after, 2) + ' m', c: r.status === 'bad' ? 'g-warn-text' : 'g-accent-text' });
        labs.push({ y: Y(x.sumpRun), t: 'running ' + fmt(x.sumpRun, 2) + ' m', c: 'g-label' });
        labs.sort(function (a, b2) { return a.y - b2.y; });
        let last = -Infinity;
        labs.forEach(function (l) { const yy = Math.max(l.y + 5, last + 18); last = yy; text(svg, x0 + w + 10, yy, l.t, 'start', l.c); });
        text(svg, x0 + w / 2, y0 + hgt + 22, 'Reservoir ' + fmt(x.sumpL, 2) + ' × ' + fmt(x.sumpW, 2) + ' m', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.total) ? volTxt(r.total) + ' drains back · ' + volTxt(r.free) + ' free' : 'Enter the inputs'; }
    },
    sources: ['white2011', 'astm1785', 'fao589'],
    links: function (ctx, r) {
      const x = ctx.v, s = sys(ctx), pp = pipeOf(ctx);
      const prm = { sshape: 'rect', slen: p(x.sumpL, 6), slen_u: 'm', swid: p(x.sumpW, 6), swid_u: 'm', sdepth: p(x.sumpH, 6), sdepth_u: 'm', srun: p(x.sumpRun, 6), srun_u: 'm', smargin: p(x.margin, 6), out: 'L' };
      let n = 0;
      if (s === 'dwc') { Object.assign(prm, { t0: 'dwc', n0: 'DWC canals', l0: p(x.canalL, 6), l0_u: 'm', w0: p(x.canalW, 6), w0_u: 'm', h0: p(x.overHead * 100, 6), h0_u: 'cm', q0: x.nCanals }); n = 1; }
      if (s === 'nft') { Object.assign(prm, { t0: 'nft', n0: 'NFT channels', q0: x.nChan, l0: p(x.chanL, 6), l0_u: 'm', w0: p(x.chanWid * 100, 6), w0_u: 'cm', h0: p(x.film * 1000, 6), h0_u: 'mm' }); n = 1; }
      if (s === 'media') { Object.assign(prm, { t0: 'media', n0: 'Media beds', l0: p(x.bedL, 6), l0_u: 'm', w0: p(x.bedW, 6), w0_u: 'm', h0: p(x.bedDepth * 100, 6), h0_u: 'cm', p0: p(x.por, 6), q0: x.nBeds }); n = 1; }
      prm['t' + n] = 'pipe'; prm['n' + n] = 'Supply line'; prm['l' + n] = p(x.pipeLen, 6); prm['l' + n + '_u'] = 'm'; prm['q' + n] = 1;
      if (pp && pp.wv) prm['s' + n] = pp.wv; else { prm['s' + n] = 'custom'; prm['d' + n] = pp ? pp.idIn : ''; prm['d' + n + '_u'] = 'in'; }
      n++;
      if (x.otherDrain > 0) { prm['t' + n] = 'other'; prm['n' + n] = 'Other drain-back'; prm['v' + n] = p(x.otherDrain, 6); prm['v' + n + '_u'] = 'L'; prm['q' + n] = 1; n++; }
      prm.ns = n;
      return [
        { slug: 'sump-drainback', label: 'Sump Drain-Back', params: prm },
        { slug: 'tank-volume', label: 'Tank Volume', params: { shape: 'rect', water: 'fresh', out: 'L', length: p(x.sumpL, 6), length_u: 'm', width: p(x.sumpW, 6), width_u: 'm', height: p(x.sumpH, 6), height_u: 'm', depth: p(x.sumpRun, 6), depth_u: 'm' } }
      ];
    }
  };

  // ---------- 12. Summary ----------
  const stepSummary = {
    id: 'summary', type: 'summary', title: 'Design sheet', short: 'Summary',
    intro: '<p>Every decision and number from the walkthrough, in one place. Use <strong>Edit</strong> to go back to any step; later steps update automatically. Copy, share or print the sheet, or keep the link to resume later.</p>',
    viz: {
      viewBox: '0 0 480 250', label: 'Solution loop: reservoir, pump, UV, grow units and back to the reservoir',
      draw: function (svg, ctx) {
        const s = sys(ctx), pl = R(ctx, 'plants'), w = R(ctx, 'water'), pm = R(ctx, 'pump'), uv = R(ctx, 'uv'), nu = R(ctx, 'nutrient'), lt = R(ctx, 'light');
        const boxes = [
          [20, 20, SYSTEMS[s].short, fin(pl.sites) ? fmt(pl.sites, 0) + ' plants' : '–', fin(pl.area) ? fmt(pl.area, 1) + ' m²' : ''],
          [175, 20, 'Lights', lt.L && lt.L.ok ? lt.L.m + ' fixtures' : '–', lt.L && lt.L.ok ? fmt(lt.L.power / 1000, 2) + ' kW' : ''],
          [330, 20, 'Nutrients', fin(nu.est) ? 'EC ' + fmt(nu.est, 2) : '–', 'pH ' + fmt(ctx.v.ph1, 1)],
          [330, 160, 'Reservoir', volTxt(w.res).split(' · ')[0], ''],
          [175, 160, 'Pump', fin(pm.q) ? flowTxt(pm.q).split(' · ')[0] : '–', fin(pm.tdh) ? fmt(pm.tdh, 2) + ' m head' : ''],
          [20, 160, uv.on ? 'UV' : 'Supply line', uv.on && fin(uv.uvcW) ? fmt(uv.uvcW, 1) + ' W UV-C' : (pm.pipe ? pm.pipe.name + ' PVC' : ''), '']
        ];
        boxes.forEach(function (bx, i) {
          G.el(svg, 'rect', { class: i === 0 ? 'g-box-accent' : 'g-box', x: bx[0], y: bx[1], width: 130, height: 64, rx: 10 });
          text(svg, bx[0] + 65, bx[1] + (bx[4] ? 22 : 26), bx[2], 'middle', 'g-strong');
          text(svg, bx[0] + 65, bx[1] + (bx[4] ? 40 : 46), bx[3], 'middle', 'dim-text');
          if (bx[4]) text(svg, bx[0] + 65, bx[1] + 56, bx[4], 'middle', 'dim-text');
        });
        arrow(svg, 330, 192, 307, 192); arrow(svg, 175, 192, 152, 192); arrow(svg, 85, 160, 85, 86);   // reservoir → pump → UV → plants
        arrow(svg, 175, 52, 152, 52);                                                                    // light → plants
        G.el(svg, 'path', { class: 'g-arrow', d: 'M120,84 V106 H360 V150' }); arrow(svg, 360, 148, 360, 158); // return to reservoir
        G.el(svg, 'path', { class: 'g-line-warn', d: 'M440,84 V158' });                                 // dosing
        text(svg, 240, 100, 'return flow', 'middle', 'dim-text');
        text(svg, 222, 136, fin(w.total) ? 'Solution ' + volTxt(w.total).split(' · ')[0] : '', 'middle', 'g-accent-text');
      },
      caption: function () { return 'The solution loop this design sizes (dashed: nutrient dosing into the reservoir)'; }
    },
    after: '<p><strong>Comparing options?</strong> Use the <a href="../calculators/cost-benefit.html">Cost Benefit Analysis calculator</a> to weigh purchase prices against running costs, for example LED against HPS lighting, DWC against NFT, or a bigger pipe against the pump’s lifetime energy (energy and cost figures are on the oxygen, pump and lighting steps).</p>' +
      '<p><strong>Lighting in detail:</strong> the <a href="../guides/lighting-design.html">Design a grow light system</a> guide covers fixture spacing, mounting height, heat load and a fixture comparison.</p>' +
      '<p>These are first-pass estimates from published rules of thumb and example values. Check them against your equipment data, water test and crop advice before you build.</p>'
  };

  G.create({
    root: 'guide',
    sourcesList: 'guide-sources',
    title: 'Design a hydroponic system',
    calcBase: '../calculators/',
    sources: SRC,
    steps: [stepCrop, stepPlants, stepWater, stepNutrient, stepPh, stepOxygen, stepPump, stepLight, stepUV, stepBackup, stepSump, stepSummary]
  });
})();
