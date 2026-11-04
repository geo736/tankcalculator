// pH Up Adjustment Calculator: base / buffer dose to raise pH, from alkalinity and the
// carbonate system (closed tank or water equilibrated with air CO2), solubility checks for
// CaCO3 and Mg(OH)2, comparison of bases, live titration-curve SVG, shareable URL state.
(function () {
  'use strict';

  // ---------- Extra unit group (kept local; units.js is shared) ----------
  // Same definition as ph-adjustment.js. Base = mg/L as CaCO3; 1 meq/L = 50.04 mg/L CaCO3.
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

  // ---------- Bases ----------
  // Molar masses from IUPAC 2021 standard atomic weights (H 1.008, C 12.011, O 15.999,
  // Na 22.990, Mg 24.305, K 39.098, Ca 40.078).
  // e = equivalents of alkalinity per mol, c = mol of dissolved inorganic carbon per mol,
  // cat = cation added, ncat = mol cation per mol, pct = typical strength/purity (% w/w),
  // rho = typical density g/mL for liquids, sol = solubility limit checked.
  const CAT = {
    K: { name: 'potassium', sym: 'K', mw: 39.098 },
    Na: { name: 'sodium', sym: 'Na', mw: 22.990 },
    Ca: { name: 'calcium', sym: 'Ca', mw: 40.078 },
    Mg: { name: 'magnesium', sym: 'Mg', mw: 24.305 }
  };
  const BASES = {
    koh: { name: 'potassium hydroxide flakes', short: 'KOH flakes', formula: 'KOH', mw: 56.105, e: 1, c: 0, cat: 'K', ncat: 1, pct: 90, rho: null, fam: 'oh' },
    kohsol: { name: 'potassium hydroxide solution', short: 'KOH solution', formula: 'KOH', mw: 56.105, e: 1, c: 0, cat: 'K', ncat: 1, pct: 45, rho: 1.45, fam: 'oh' },
    k2co3: { name: 'potassium carbonate', short: 'K₂CO₃', formula: 'K₂CO₃', mw: 138.204, e: 2, c: 1, cat: 'K', ncat: 2, pct: 100, rho: null, fam: 'co3' },
    khco3: { name: 'potassium bicarbonate', short: 'KHCO₃', formula: 'KHCO₃', mw: 100.114, e: 1, c: 1, cat: 'K', ncat: 1, pct: 100, rho: null, fam: 'hco3' },
    caoh2: { name: 'calcium hydroxide (hydrated lime)', short: 'Ca(OH)₂', formula: 'Ca(OH)₂', mw: 74.092, e: 2, c: 0, cat: 'Ca', ncat: 1, pct: 100, rho: null, fam: 'oh' },
    caco3: { name: 'calcium carbonate', short: 'CaCO₃', formula: 'CaCO₃', mw: 100.086, e: 2, c: 1, cat: 'Ca', ncat: 1, pct: 100, rho: null, fam: 'co3', sol: 'calcite' },
    mgoh2: { name: 'magnesium hydroxide', short: 'Mg(OH)₂', formula: 'Mg(OH)₂', mw: 58.319, e: 2, c: 0, cat: 'Mg', ncat: 1, pct: 100, rho: null, fam: 'oh', sol: 'brucite' },
    naoh: { name: 'sodium hydroxide', short: 'NaOH', formula: 'NaOH', mw: 39.997, e: 1, c: 0, cat: 'Na', ncat: 1, pct: 100, rho: null, fam: 'oh' },
    nahco3: { name: 'sodium bicarbonate (baking soda)', short: 'NaHCO₃', formula: 'NaHCO₃', mw: 84.006, e: 1, c: 1, cat: 'Na', ncat: 1, pct: 100, rho: null, fam: 'hco3' }
  };
  const ORDER = ['koh', 'kohsol', 'k2co3', 'khco3', 'caoh2', 'caco3', 'mgoh2', 'naoh', 'nahco3'];
  const FAMS = {
    oh: { label: 'hydroxide (OH⁻)', tag: 'OH⁻', cPerEq: 0 },
    co3: { label: 'carbonate (CO₃²⁻)', tag: 'CO₃²⁻', cPerEq: 0.5 },
    hco3: { label: 'bicarbonate (HCO₃⁻)', tag: 'HCO₃⁻', cPerEq: 1 }
  };
  // Hoagland & Arnon (1950) full-strength solution, mg/L: context for cations added.
  const HOAGLAND = { K: 235, Ca: 200, Mg: 48 };
  // Solubility products at 25 °C (CRC Handbook): brucite Mg(OH)2 5.61e-12.
  // Calcite uses the Plummer & Busenberg (1982) temperature equation.
  const KSP_BRUCITE = 5.61e-12;
  const DAVIES_A = 0.51; // Davies equation constant near 25 °C (Stumm & Morgan 1996)
  const STEP_PH = 0.3;   // rule of thumb: pH change per dose
  const BIG_STEP = 0.5;  // warn above this change in one go

  const DEFAULTS = {
    vol: 1000, vol_u: 'L', alk: 30, alk_u: 'caco3', ph0: 6.4, ph1: 7.0, temp: 25, temp_u: 'C',
    mode: 'closed', co2: 420, ca: '', ca_u: 'mgL', base: 'koh'
  };
  const L_PER_GAL = 3.785411784;

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const baseSel = $('base');
  const modeSel = $('mode');
  const outVol = $('out-vol');
  const outMass = $('out-mass');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : '–') + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }
  function gText(g) { return g >= 1000 ? fmt(g / 1000) + ' kg' : fmt(g) + ' g'; }
  function mLText(mL) { return mL >= 1000 ? fmt(mL / 1000) + ' L' : fmt(mL) + ' mL'; }
  function alkText(eq) { return fmt(eq * 1000 * MG_CACO3_PER_MEQ, 1) + ' mg/L CaCO₃ (' + fmt(eq * 1000, 2) + ' meq/L)'; }

  // ---------- Chemistry ----------
  // K1, K2, KH (CO2 solubility) and calcite Ksp: Plummer & Busenberg (1982);
  // Kw: Harned & Owen as given by Stumm & Morgan (1996). Same as ph-adjustment.js.
  function constants(tC) {
    const T = tC + 273.15, L = Math.log10;
    const logK1 = -356.3094 - 0.06091964 * T + 21834.37 / T + 126.8339 * L(T) - 1684915 / (T * T);
    const logK2 = -107.8871 - 0.03252849 * T + 5151.79 / T + 38.92561 * L(T) - 563713.9 / (T * T);
    const logKH = 108.3865 + 0.01985076 * T - 6919.53 / T - 40.45154 * L(T) + 669365 / (T * T);
    const logKc = -171.9065 - 0.077993 * T + 2839.319 / T + 71.595 * L(T);
    const pKw = 4470.99 / T - 6.0875 + 0.01706 * T;
    return {
      pK1: -logK1, pK2: -logK2, pKw: pKw, pKH: -logKH, pKc: -logKc,
      K1: Math.pow(10, logK1), K2: Math.pow(10, logK2), Kw: Math.pow(10, -pKw),
      KH: Math.pow(10, logKH), Kc: Math.pow(10, logKc)
    };
  }

  function alphas(H, c) {
    const D = H * H + H * c.K1 + c.K1 * c.K2;
    return { a0: H * H / D, a1: H * c.K1 / D, a2: c.K1 * c.K2 / D };
  }
  // f = alkalinity carried per mol of total carbonate; w = water's own contribution (OH- − H+).
  function fAt(pH, c) { const a = alphas(Math.pow(10, -pH), c); return a.a1 + 2 * a.a2; }
  function wAt(pH, c) { const H = Math.pow(10, -pH); return c.Kw / H - H; }
  // Closed system: alkalinity (eq/L) of water with total carbonate CT at pH.
  function alkClosed(pH, CT, c) { return CT * fAt(pH, c) + wAt(pH, c); }
  // Open system: dissolved CO2 fixed by air, CO2* = KH·pCO2.
  function alkOpen(pH, co2s, c) {
    const H = Math.pow(10, -pH);
    return co2s * (c.K1 / H + 2 * c.K1 * c.K2 / (H * H)) + c.Kw / H - H;
  }
  function ctOpen(pH, co2s, c) {
    const H = Math.pow(10, -pH);
    return co2s * (1 + c.K1 / H + c.K1 * c.K2 / (H * H));
  }
  // Alkalinity rises monotonically with pH in both cases, so bisection is safe.
  function solvePH(fn, target) {
    let lo = 1, hi = 14;
    if (fn(lo) >= target) return lo;
    if (fn(hi) <= target) return hi;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (fn(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Water state after adding x mol/L of base b. env: {c, mode, CT0, alk0, co2s, ca0}
  function stateAt(b, x, env) {
    const c = env.c;
    const alk = env.alk0 + b.e * x;
    let pH, CT;
    if (env.mode === 'open') {
      pH = solvePH(function (p) { return alkOpen(p, env.co2s, c); }, alk);
      CT = ctOpen(pH, env.co2s, c);
    } else {
      CT = env.CT0 + b.c * x;
      pH = solvePH(function (p) { return alkClosed(p, CT, c); }, alk);
    }
    const H = Math.pow(10, -pH);
    const a = alphas(H, c);
    const hco3 = CT * a.a1, co3 = CT * a.a2, oh = c.Kw / H;
    const ca = (env.ca0 || 0) + (b.cat === 'Ca' ? x * b.ncat : 0);
    const mg = b.cat === 'Mg' ? x * b.ncat : 0;
    const mono = (b.cat === 'K' || b.cat === 'Na') ? x * b.ncat : 0;
    // Minimal ionic strength from the ions we know; unknown counter-ions taken as monovalent.
    const anionQ = hco3 + 2 * co3 + oh;
    const cationQ = 2 * ca + 2 * mg + mono + H;
    const other = Math.abs(anionQ - cationQ);
    const I = 0.5 * (hco3 + 4 * co3 + oh + 4 * ca + 4 * mg + mono + H + other);
    const sI = Math.sqrt(I);
    const lg1 = -DAVIES_A * (sI / (1 + sI) - 0.3 * I);
    const g1 = Math.pow(10, lg1), g2 = Math.pow(10, 4 * lg1);
    const siCal = ca > 0 && co3 > 0 ? Math.log10(g2 * ca * g2 * co3 / c.Kc) : -Infinity;
    const siBru = mg > 0 ? Math.log10(g2 * mg * Math.pow(g1 * oh, 2) / KSP_BRUCITE) : -Infinity;
    return { pH: pH, alk: alk, CT: CT, co3: co3, ca: ca, mg: mg, I: I, siCal: siCal, siBru: siBru };
  }

  // Largest dose (mol/L) that can dissolve before the solid's saturation index reaches 0.
  function solLimit(b, env) {
    if (!b.sol) return Infinity;
    const key = b.sol === 'calcite' ? 'siCal' : 'siBru';
    const si = function (x) { return stateAt(b, x, env)[key]; };
    if (si(0) >= 0) return 0;
    let lo = 0, hi = 1e-4;
    while (si(hi) < 0 && hi < 1) hi *= 2;
    if (si(hi) < 0) return Infinity;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (si(mid) < 0) lo = mid; else hi = mid;
    }
    return lo;
  }

  // Dose of base b (mol/L of pure substance) to reach target pH.
  function doseFor(b, ph1, env) {
    const c = env.c;
    const out = { b: b, x: 0, need: true, reachable: true, limitPH: null, xmax: Infinity };
    if (env.mode === 'open') {
      const alkT = alkOpen(ph1, env.co2s, c);
      const num = alkT - env.alk0;
      if (num <= 0) { out.need = false; return out; }
      out.x = num / b.e;
    } else {
      const f = fAt(ph1, c);
      const num = env.CT0 * f + wAt(ph1, c) - env.alk0;
      if (num <= 0) { out.need = false; return out; }
      const den = b.e - b.c * f;
      if (den <= 1e-9) {
        // bicarbonate cannot pass the pH where f = e/c (about (pK1+pK2)/2 for HCO3-)
        out.reachable = false;
        out.limitPH = solvePH(function (p) { return fAt(p, c) - b.e / b.c; }, 0);
        out.reason = 'buffer';
        return out;
      }
      out.x = num / den;
    }
    if (b.sol) {
      out.xmax = solLimit(b, env);
      if (out.x > out.xmax) {
        out.reachable = false;
        out.limitPH = stateAt(b, out.xmax, env).pH;
        out.reason = b.sol;
      }
    }
    return out;
  }

  function productAmounts(b, x, volL, pct, rho) {
    const molTotal = x * volL;
    const gPure = molTotal * b.mw;
    const gProduct = gPure / (pct / 100);
    return { molTotal: molTotal, gPure: gPure, gProduct: gProduct, mL: rho ? gProduct / rho : null };
  }

  function readInputs() {
    const volL = CalcUnits.base('vol');
    const alkRaw = CalcUnits.baseSigned('alk');
    const ph0 = parseFloat($('ph0').value);
    const ph1 = parseFloat($('ph1').value);
    let tC = CalcUnits.baseSigned('temp');
    let tempNote = '';
    if (!isFinite(tC)) { tC = 25; tempNote = 'default'; }
    else if (tC < 0 || tC > 50) { tC = Math.min(50, Math.max(0, tC)); tempNote = 'clamped'; }
    const co2Raw = parseFloat($('co2').value);
    const caRaw = CalcUnits.baseSigned('ca');
    const pctRaw = parseFloat($('pct').value);
    const densRaw = CalcUnits.base('dens');
    return {
      volL: volL, alkRaw: alkRaw, ph0: ph0, ph1: ph1, tC: tC, tempNote: tempNote,
      mode: modeSel.value === 'open' ? 'open' : 'closed',
      co2: co2Raw, caMgL: isFinite(caRaw) && caRaw > 0 ? caRaw : 0, caGiven: isFinite(caRaw) && caRaw >= 0,
      pct: pctRaw, rho: densRaw > 0 ? densRaw / 1000 : NaN, // kg/m3 -> g/mL
      b: BASES[baseSel.value] || BASES.koh, key: BASES[baseSel.value] ? baseSel.value : 'koh'
    };
  }

  function compute() {
    const inp = readInputs();
    const c = constants(inp.tC);
    const b = inp.b;
    const notes = [];
    const r = { ok: false, inp: inp, c: c, b: b, notes: notes };

    if (!(inp.volL > 0) || !isFinite(inp.alkRaw) || inp.alkRaw < 0 || !isFinite(inp.ph0) || !isFinite(inp.ph1)) {
      r.error = 'Enter the water volume, alkalinity, current pH and target pH to see the dose.';
      return r;
    }
    if (inp.ph0 < 3 || inp.ph0 > 10) { r.error = 'Current pH should be between 3 and 10.'; return r; }
    if (inp.ph1 < 4 || inp.ph1 > 10) { r.error = 'Target pH should be between 4 and 10.'; return r; }
    if (inp.mode === 'open' && !(inp.co2 > 0 && inp.co2 <= 100000)) { r.error = 'Enter the CO₂ level of the air (outdoor air is about 420 ppm).'; return r; }
    if (!(inp.pct > 0 && inp.pct <= 100)) { r.error = 'Enter the product strength or purity as a percentage between 0 and 100.'; return r; }
    if (b.rho && !(inp.rho > 0.5 && inp.rho < 3)) { r.error = 'Enter the density of the solution (typically 1–2 g/mL; see the product label or safety data sheet).'; return r; }

    let alk0 = inp.alkRaw / MG_CACO3_PER_MEQ / 1000; // eq/L
    const H0 = Math.pow(10, -inp.ph0);
    const a0 = alphas(H0, c);
    let CT0 = (alk0 - c.Kw / H0 + H0) / (a0.a1 + 2 * a0.a2);
    if (!(CT0 > 0)) {
      CT0 = 0;
      alk0 = wAt(inp.ph0, c);
      notes.push('This alkalinity is too low for pH ' + inp.ph0 + ' (water with no carbonate at all would have ' + fmt(Math.max(0, alk0) * 1000 * MG_CACO3_PER_MEQ, 1) + ' mg/L); check both readings.');
    }
    const co2s = inp.mode === 'open' ? c.KH * inp.co2 * 1e-6 : 0;
    const env = { c: c, mode: inp.mode, CT0: CT0, alk0: alk0, co2s: co2s, ca0: inp.caMgL / 1000 / CAT.Ca.mw };
    r.env = env;
    r.alkEq = alk0;
    r.CT0 = CT0;
    r.ok = true;

    if (inp.mode === 'open') {
      r.eqPH0 = solvePH(function (p) { return alkOpen(p, co2s, c); }, alk0);
    }

    const pct = inp.pct, rho = b.rho ? inp.rho : null;
    const d = doseFor(b, inp.ph1, env);
    r.dose = d;
    // comparison of all bases (each at its typical strength; the selected one at the user's)
    r.table = ORDER.map(function (k) {
      const bb = BASES[k];
      const dd = k === inp.key ? d : doseFor(bb, inp.ph1, env);
      const p = k === inp.key ? pct : bb.pct, rh = bb.rho ? (k === inp.key ? rho : bb.rho) : null;
      return { key: k, b: bb, d: dd, amt: productAmounts(bb, dd.x, inp.volL, p, rh) };
    });

    if (!d.need) {
      r.noBase = true;
      return r;
    }
    if (!d.reachable) {
      r.unreachable = true;
      return r;
    }
    const amt = productAmounts(b, d.x, inp.volL, pct, rho);
    r.amt = amt;
    r.x = d.x;
    r.eqAdded = b.e * d.x;
    r.alkFinal = alk0 + r.eqAdded;
    r.catMgL = d.x * b.ncat * CAT[b.cat].mw * 1000;
    r.final = stateAt(b, d.x, env);
    if (inp.mode === 'open') {
      // pH right after mixing, before CO2 exchange with the air
      const closedEnv = { c: c, mode: 'closed', CT0: CT0, alk0: alk0, co2s: 0, ca0: env.ca0 };
      r.immediatePH = stateAt(b, d.x, closedEnv).pH;
      r.ctBefore = CT0;
    }
    r.showSI = inp.caMgL > 0 || b.cat === 'Ca';

    // Notes and warnings
    // The sudden rise is what the dose itself does; in open water the later drift with air is slow.
    const startPH = inp.ph0;
    const peakPH = inp.mode === 'open' ? r.immediatePH : inp.ph1;
    r.rise = peakPH - startPH;
    r.steps = Math.max(1, Math.ceil(r.rise / STEP_PH - 1e-9));
    if (r.rise > BIG_STEP) {
      notes.push('This is a large pH change for one dose (' + $('ph0').value + ' → ' + (inp.mode === 'open' ? fmt(peakPH, 2) + ' right after mixing' : $('ph1').value) + '). Split it into about ' + r.steps + ' doses of no more than ~' + STEP_PH + ' pH units each (rule of thumb) and measure between doses: sudden pH rises stress fish and nitrifying bacteria, and raise the toxic NH₃ share of ammonia.');
    }
    if (inp.mode === 'open' && r.immediatePH > inp.ph1 + 0.2) {
      notes.push('Right after mixing the pH will be about ' + fmt(r.immediatePH, 2) + ', above the target, and fall towards ' + inp.ph1 + ' only as the water takes up CO₂ from the air (hours to days).');
    }
    if (inp.mode === 'open' && r.immediatePH < inp.ph1 - 0.2) {
      notes.push('Right after mixing the pH will only be about ' + fmt(r.immediatePH, 2) + '; it rises to ' + inp.ph1 + ' as excess CO₂ escapes to the air (faster with aeration).');
    }
    if (b.cat === 'Na') notes.push('Sodium is not a plant nutrient and is not used up in a recirculating system, so it builds up with every dose. Prefer a potassium or calcium base for aquaponics and hydroponics.');
    if (b === BASES.caco3) {
      notes.push('Calcium carbonate dissolves slowly and only while the water is undersaturated with calcite; it acts as a slow buffer (e.g. crushed limestone, shell or coral in a mesh bag in the sump) rather than a quick dose.');
    }
    if (b === BASES.mgoh2) notes.push('Magnesium hydroxide is only slightly soluble and dissolves slowly; stir it in as a fine slurry and allow hours to reach the full pH change.');
    if (b === BASES.caoh2) notes.push('Only about 1–2 g of hydrated lime dissolves per litre; mix it as a dilute slurry or limewater and add it slowly.');
    if (r.showSI && r.final.siCal > 0 && b !== BASES.caco3) {
      notes.push('After dosing the water is supersaturated with calcite (saturation index ' + fmt(r.final.siCal, 2) + '), so some calcium carbonate can precipitate as scale, taking back part of the alkalinity and calcium added.');
    }
    if (r.alkFinal * 1000 * MG_CACO3_PER_MEQ > 400) {
      notes.push('This leaves very high alkalinity (' + fmt(r.alkFinal * 1000 * MG_CACO3_PER_MEQ, 0) + ' mg/L as CaCO₃) and adds ' + fmt(r.catMgL, 0) + ' mg/L ' + CAT[b.cat].sym + '.' +
        (b.e === b.c && inp.mode === 'closed' ? ' In a closed tank a bicarbonate approaches its limit near pH ' + fmt(solvePH(function (p) { return fAt(p, c) - 1; }, 0), 2) + ', so the dose rises steeply; a hydroxide or carbonate is far more practical.' : ''));
    }
    if (inp.ph1 > 8.5) notes.push('A target above pH 8.5 is high for most fish, plants and nitrifiers; at this pH much more of the ammonia is in the toxic NH₃ form.');
    if (inp.tempNote === 'clamped') notes.push('Temperature was limited to 0–50 °C for the carbonate constants.');
    if (inp.alkRaw > 500) notes.push('Alkalinity above 500 mg/L CaCO₃ is unusual; check the units on your water test.');
    return r;
  }

  // ---------- State ----------
  function getState() {
    const b = BASES[baseSel.value];
    return {
      vol: $('vol').value, vol_u: CalcUnits.unit('vol'),
      ph0: $('ph0').value, ph1: $('ph1').value,
      alk: $('alk').value, alk_u: CalcUnits.unit('alk'),
      temp: $('temp').value, temp_u: CalcUnits.unit('temp'),
      mode: modeSel.value, co2: $('co2').value,
      ca: $('ca').value, ca_u: CalcUnits.unit('ca'),
      base: baseSel.value, pct: $('pct').value,
      dens: b && b.rho ? $('dens').value : '', dens_u: b && b.rho ? CalcUnits.unit('dens') : '',
      out: b && b.rho ? outVol.value : outMass.value
    };
  }

  function setProductDefaults(key) {
    const b = BASES[key];
    $('pct').value = b.pct;
    CalcUnits.set('dens', b.rho || '', 'kgL');
  }

  function applyDefaults() {
    CalcUnits.set('vol', DEFAULTS.vol, DEFAULTS.vol_u);
    CalcUnits.set('alk', DEFAULTS.alk, DEFAULTS.alk_u);
    $('ph0').value = DEFAULTS.ph0;
    $('ph1').value = DEFAULTS.ph1;
    CalcUnits.set('temp', DEFAULTS.temp, DEFAULTS.temp_u);
    modeSel.value = DEFAULTS.mode;
    $('co2').value = DEFAULTS.co2;
    CalcUnits.set('ca', DEFAULTS.ca, DEFAULTS.ca_u);
    baseSel.value = DEFAULTS.base;
    setProductDefaults(DEFAULTS.base);
    outVol.value = 'mL';
    outMass.value = 'g';
  }

  function amountText(r) {
    if (r.b.rho) {
      const u = outVol.value;
      return fmt(CalcUnits.convert('volume', r.amt.mL / 1000, 'L', u)) + ' ' + CalcUnits.label('volume', u);
    }
    const u = outMass.value;
    return fmt(CalcUnits.convert('mass', r.amt.gProduct / 1000, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }
  function productLabel(r) {
    return (r.b.rho || r.inp.pct < 100 ? fmt(r.inp.pct, 1) + '% ' : '') + r.b.name;
  }

  function cationText(r) {
    const cat = CAT[r.b.cat];
    let t = fmt(r.catMgL) + ' mg/L ' + cat.sym;
    if (r.b.cat === 'Na') t += ' (not a nutrient; accumulates)';
    else t += ' (' + fmt(r.catMgL / HOAGLAND[r.b.cat] * 100, 1) + '% of the ' + HOAGLAND[r.b.cat] + ' mg/L in Hoagland solution)';
    return t;
  }

  // ---------- Render ----------
  const RESULT_IDS = ['r-amount', 'r-per100', 'r-pergal', 'r-eq', 'r-alkadd', 'r-alkfinal', 'r-dic', 'r-cat', 'r-extra', 'r-si', 'r-steps'];

  function render() {
    const r = compute();
    const b = r.b;
    const liquid = !!b.rho;
    outVol.hidden = !liquid;
    outMass.hidden = liquid;
    $('dens-field').hidden = !liquid;
    $('co2-field').hidden = r.inp.mode !== 'open';
    $('pct-label').textContent = liquid ? 'Solution strength (% KOH by weight)' : 'Purity (% ' + b.formula + ' by weight)';
    $('pct-hint').textContent = (liquid
      ? 'Typical value for 45% potassium hydroxide solution: density about 1.45 g/mL. Commercial "pH Up" products vary widely; use the label or safety data sheet.'
      : b === BASES.koh ? 'Technical-grade KOH flakes are typically about 90% KOH (the rest is mostly water). Use your label value.'
        : 'Enter the purity from the label; 100% for reagent-grade product.');

    const alkB = CalcUnits.baseSigned('alk');
    $('alk-hint').textContent = isFinite(alkB) && alkB >= 0
      ? '= ' + fmt(alkB, 0) + ' mg/L as CaCO₃ = ' + fmt(alkB / MG_CACO3_PER_MEQ, 2) + ' meq/L. Total alkalinity (KH) from a water test.'
      : 'Total alkalinity (KH) from a water test.';
    $('temp-hint').textContent = (r.inp.tempNote === 'default' ? 'No temperature entered: using 25 °C. ' : '') +
      'Constants used: pK₁ ' + r.c.pK1.toFixed(2) + ', pK₂ ' + r.c.pK2.toFixed(2) + ' at ' + fmt(r.inp.tC, 1) + ' °C.';
    $('mode-hint').textContent = r.inp.mode === 'open'
      ? 'Final pH after the water has fully exchanged CO₂ with the air (aerated, hours to days).'
      : 'pH right after mixing, before any CO₂ escapes or dissolves. Use this for a dose into a tank or reservoir.';
    $('r-unit').textContent = 'of ' + productLabel(r);

    const notice = $('notice');
    function blank(msg) {
      RESULT_IDS.forEach(function (id) { $(id).textContent = '–'; });
      notice.textContent = msg;
      notice.hidden = false;
    }
    renderTable(r);

    if (!r.ok) {
      blank(r.error);
      $('viz-caption').textContent = 'Enter the inputs to draw the titration curve';
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }
    if (r.noBase) {
      let msg;
      if (r.inp.mode === 'open') {
        msg = 'No base needed: with ' + fmt(r.alkEq * 1000, 2) + ' meq/L alkalinity this water settles at about pH ' + fmt(r.eqPH0, 2) + ' once it is in balance with the air, which is at or above the target. If the pH is low now, excess CO₂ is the cause: aerate or degas the water instead of adding base.';
      } else {
        msg = 'The target pH is not above the current pH, so no base is needed. To lower pH use the pH Down Adjustment calculator.';
      }
      blank(msg);
      $('r-amount').textContent = '0';
      $('r-alkfinal').textContent = alkText(r.alkEq);
      $('viz-caption').textContent = r.inp.mode === 'open'
        ? 'Air-equilibrated pH ' + fmt(r.eqPH0, 2) + ' is already at or above target ' + r.inp.ph1
        : 'pH ' + r.inp.ph0 + ' is already at or above the target pH ' + r.inp.ph1;
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }
    if (r.unreachable) {
      const d = r.dose;
      let msg;
      if (d.reason === 'buffer') {
        msg = b.short + ' cannot raise pH this far in a closed tank: each molecule brings as much carbonate as alkalinity, so the pH levels off near ' + fmt(d.limitPH, 2) + '. Choose a carbonate or hydroxide (see the comparison below), or let the water equilibrate with air.';
      } else if (d.reason === 'calcite') {
        msg = d.xmax <= 0
          ? 'Calcium carbonate will not dissolve here: the water is already saturated with calcite at pH ' + (r.inp.mode === 'open' ? fmt(r.eqPH0, 2) + ' (after equilibrating with air)' : r.inp.ph0) + '. It only dissolves in more acidic or lower-calcium water.'
          : 'Calcium carbonate stops dissolving at about pH ' + fmt(d.limitPH, 2) + ', when the water becomes saturated with calcite (about ' + fmt(d.xmax * r.b.mw * 1000, 1) + ' mg/L dissolves). It cannot reach pH ' + r.inp.ph1 + '; use a hydroxide or potassium carbonate.';
        if (!r.inp.caGiven) msg += ' This assumes no calcium in the water already; enter your calcium to tighten the limit.';
      } else {
        msg = 'Magnesium hydroxide stops dissolving at about pH ' + fmt(d.limitPH, 2) + ' (brucite saturation), so it cannot reach pH ' + r.inp.ph1 + '.';
      }
      blank(msg);
      $('viz-caption').textContent = b.short + ' levels off near pH ' + fmt(d.limitPH, 2) + ', below the target ' + r.inp.ph1;
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }

    if (r.notes.length) { notice.textContent = r.notes.join(' '); notice.hidden = false; }
    else notice.hidden = true;

    $('r-amount').textContent = amountText(r);
    const perL = (liquid ? r.amt.mL : r.amt.gProduct) / r.inp.volL;
    $('r-per100').textContent = liquid ? mLText(perL * 100) : gText(perL * 100);
    $('r-pergal').textContent = liquid ? mLText(perL * 100 * L_PER_GAL) : gText(perL * 100 * L_PER_GAL);
    $('r-eq').textContent = fmt(r.x * 1000, 3) + ' mmol/L ' + b.formula + ' · ' + fmt(r.amt.molTotal) + ' mol total' + (liquid ? ' · ' + gText(r.amt.gProduct) + ' of solution' : '');
    $('r-alkadd').textContent = alkText(r.eqAdded);
    $('r-alkfinal').textContent = alkText(r.alkFinal);
    if (r.inp.mode === 'open') {
      $('r-dic').textContent = fmt(r.CT0 * 1000, 2) + ' → ' + fmt(r.final.CT * 1000, 2) + ' mmol/L after air exchange';
    } else {
      $('r-dic').textContent = fmt(r.CT0 * 1000, 2) + ' → ' + fmt(r.final.CT * 1000, 2) + ' mmol/L' + (b.c ? ' (+' + fmt(b.c * r.x * 1000, 3) + ')' : ' (unchanged)');
    }
    $('r-cat').textContent = cationText(r);
    $('r-extra-label').textContent = r.inp.mode === 'open' ? 'pH right after mixing → after air exchange' : 'pH if left to equilibrate with air';
    if (r.inp.mode === 'open') {
      $('r-extra').textContent = fmt(r.immediatePH, 2) + ' → ' + r.inp.ph1;
    } else {
      const ppm = r.inp.co2 > 0 ? r.inp.co2 : 420;
      const co2s = r.c.KH * ppm * 1e-6;
      const eqPH = solvePH(function (p) { return alkOpen(p, co2s, r.c); }, r.alkFinal);
      $('r-extra').textContent = 'about ' + fmt(eqPH, 2) + ' (at ' + fmt(ppm, 0) + ' ppm CO₂)';
    }
    $('r-si').textContent = r.showSI
      ? fmt(r.final.siCal, 2) + (r.final.siCal > 0 ? ' (supersaturated: scale possible)' : ' (undersaturated: no scale)')
      : 'enter calcium to check';
    $('r-steps').textContent = r.steps <= 1 ? '1 dose (change ≤ ' + STEP_PH + ' pH)' : r.steps + ' doses of about ' + (liquid ? mLText(r.amt.mL / r.steps) : gText(r.amt.gProduct / r.steps));

    $('viz-caption').textContent = 'pH ' + (r.inp.mode === 'open' ? fmt(r.eqPH0, 2) + ' (air-equilibrated)' : r.inp.ph0) + ' → ' + r.inp.ph1 + ' needs ' + fmt(r.eqAdded * 1000, 3) + ' meq/L · ' + amountText(r) + ' of ' + b.short + ' for ' + typed('vol');
    drawViz(r);
    CalcShare.writeParams(getState());
  }

  function renderTable(r) {
    const body = $('cmp-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    $('cmp-note').textContent = r.ok
      ? 'Same water, pH ' + (r.inp.mode === 'open' ? 'after air exchange' : r.inp.ph0) + ' → ' + r.inp.ph1 + ', ' + (r.inp.mode === 'open' ? 'open to air' : 'closed tank') + ', ' + typed('vol') + '. Typical strengths; your selected product uses your strength. Tap a row to choose it.'
      : '';
    if (!r.ok) return;
    r.table.forEach(function (row) {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.key = row.key;
      if (row.key === r.inp.key) tr.className = 'sel';
      const td = function (t) { const e = document.createElement('td'); e.textContent = t; tr.appendChild(e); return e; };
      const name = td(row.b.short + (row.b.rho || row.b.pct < 100 ? ' ' + (row.key === r.inp.key ? fmt(r.inp.pct, 1) : row.b.pct) + '%' : ''));
      name.className = 'cmp-name';
      if (!row.d.need) { td('0'); td('0'); td('0'); }
      else if (!row.d.reachable) {
        const e = td(row.d.limitPH ? 'levels off at pH ' + fmt(row.d.limitPH, 2) : 'cannot reach');
        e.colSpan = 3;
        e.className = 'cmp-na';
      } else {
        td(row.b.rho ? mLText(row.amt.mL) : gText(row.amt.gProduct));
        td(fmt(row.d.x * row.b.ncat * CAT[row.b.cat].mw * 1000) + ' ' + CAT[row.b.cat].sym);
        td(fmt(row.b.e * row.d.x * 1000 * MG_CACO3_PER_MEQ, 1));
      }
      const pick = function () {
        if (baseSel.value === row.key) return;
        baseSel.value = row.key;
        setProductDefaults(row.key);
        render();
      };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
      body.appendChild(tr);
    });
  }

  // ---------- SVG: titration curves ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 330;
  const PAD = { l: 50, r: 64, t: 18, b: 64 };

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function niceStep(range, n) {
    const raw = range / (n || 5);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const x0 = PAD.l, x1 = VW - PAD.r, yTop = PAD.t, yBot = VH - PAD.b;
    const yMid = (yTop + yBot) / 2;
    el('text', { x: 14, y: yMid, 'text-anchor': 'middle', class: 'dim-text', transform: 'rotate(-90 14 ' + yMid + ')' }, 'pH');
    el('text', { x: (x0 + x1) / 2, y: VH - 6, 'text-anchor': 'middle', class: 'dim-text' }, 'Base added (meq/L)  ·  ' + r.b.short + ' for this batch');
    if (!r.ok) {
      el('path', { d: 'M' + x0 + ',' + yTop + ' L' + x0 + ',' + yBot + ' L' + x1 + ',' + yBot, class: 'ph-axis' });
      return;
    }
    const env = r.env, inp = r.inp, b = r.b;
    const open = inp.mode === 'open';
    const startPH = open ? r.eqPH0 : inp.ph0;

    // x range in meq/L of base
    const ohDose = doseFor(BASES.naoh, inp.ph1, env);
    let ref = 0;
    if (r.dose.need && r.dose.reachable) ref = b.e * r.dose.x;
    else if (ohDose.need) ref = ohDose.x * 2;
    if (!(ref > 0)) ref = Math.max(0.2 * Math.max(r.alkEq * 1000, 0.5), 0.1) / 1000;
    let xMax = ref * 1000 * 1.45;
    const step = niceStep(xMax);
    xMax = Math.ceil(xMax / step - 1e-9) * step;

    // pH curve of each buffer family vs meq/L (pure, without solubility limits)
    function famPH(fam, q) {
      const eq = q / 1000;
      if (open) return solvePH(function (p) { return alkOpen(p, env.co2s, env.c); }, env.alk0 + eq);
      const CT = env.CT0 + FAMS[fam].cPerEq * eq;
      return solvePH(function (p) { return alkClosed(p, CT, env.c); }, env.alk0 + eq);
    }
    const N = 120;
    const curves = {};
    let hiPH = Math.max(startPH, inp.ph0, inp.ph1);
    Object.keys(FAMS).forEach(function (f) {
      const pts = [];
      for (let i = 0; i <= N; i++) { const q = xMax * i / N; pts.push([q, famPH(f, q)]); }
      curves[f] = pts;
    });
    curves[b.fam].forEach(function (p) { hiPH = Math.max(hiPH, p[1]); });
    const loPH = Math.min(startPH, inp.ph0, inp.ph1);
    const yMin = Math.max(3, Math.floor((loPH - 0.3) * 2) / 2);
    const yMax = Math.min(12, Math.max(yMin + 1, Math.ceil((Math.min(hiPH, inp.ph1 + 1.5) + 0.25) * 2) / 2));
    const X = function (v) { return x0 + (v / xMax) * (x1 - x0); };
    const Y = function (p) { return yBot - (p - yMin) / (yMax - yMin) * (yBot - yTop); };

    // grid and axes
    const yStep = yMax - yMin > 3 ? 1 : 0.5;
    for (let p = Math.ceil(yMin / yStep) * yStep; p <= yMax + 1e-9; p += yStep) {
      el('line', { x1: x0, y1: Y(p), x2: x1, y2: Y(p), class: 'ph-grid' });
      el('text', { x: x0 - 6, y: Y(p) + 4, 'text-anchor': 'end', class: 'dim-text' }, fmt(p, 1));
    }
    const perEqAmount = function (q) { // product amount for the batch at q meq/L
      const a = productAmounts(b, q / 1000 / b.e, inp.volL, inp.pct, b.rho ? inp.rho : null);
      return b.rho ? mLText(a.mL) : gText(a.gProduct);
    };
    for (let v = 0; v <= xMax + 1e-9; v += step) {
      el('line', { x1: X(v), y1: yBot, x2: X(v), y2: yBot + 4, class: 'dim' });
      el('text', { x: X(v), y: yBot + 16, 'text-anchor': 'middle', class: 'dim-text' }, fmt(v, step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0));
      el('text', { x: X(v), y: yBot + 31, 'text-anchor': 'middle', class: 'ph-amt' }, v === 0 ? '0' : perEqAmount(v));
    }
    el('path', { d: 'M' + x0 + ',' + yTop + ' L' + x0 + ',' + yBot + ' L' + x1 + ',' + yBot, class: 'ph-axis' });

    function pathOf(pts, qLimit) {
      let d = '', last = null;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i][0], p = pts[i][1];
        if (q > qLimit) break;
        if (p > yMax) {
          // finish exactly at the top edge
          if (last) { const t = (yMax - last[1]) / (p - last[1]); d += ' L' + X(last[0] + t * (q - last[0])).toFixed(1) + ',' + Y(yMax).toFixed(1); }
          last = null; break;
        }
        d += (d ? ' L' : 'M') + X(q).toFixed(1) + ',' + Y(p).toFixed(1);
        last = pts[i];
      }
      return { d: d, end: last };
    }
    function endLabel(end, text, cls) {
      if (!end) return;
      el('text', { x: Math.min(X(end[0]) + 4, VW - 2), y: Y(end[1]) + 4, 'text-anchor': 'start', class: cls }, text);
    }

    // faint curves of the other families (closed only: in open water they coincide)
    const fams = open ? [b.fam] : Object.keys(FAMS);
    fams.forEach(function (f) {
      if (f === b.fam) return;
      const pc = pathOf(curves[f], Infinity);
      if (pc.d) {
        el('path', { d: pc.d, class: 'ph-curve-faint' });
        const end = pc.end || null;
        if (end) endLabel(end, FAMS[f].tag, 'ph-tag');
        else {
          // curve left through the top: label at the top edge
          const cut = curves[f].find(function (p) { return p[1] > yMax; });
          if (cut) el('text', { x: Math.min(X(cut[0]) + 3, VW - 2), y: yTop + 10, class: 'ph-tag' }, FAMS[f].tag);
        }
      }
    });

    // selected base, limited by solubility for CaCO3 / Mg(OH)2
    const qLim = isFinite(r.dose.xmax) ? r.dose.xmax * b.e * 1000 : Infinity;
    const main = pathOf(curves[b.fam], qLim);
    if (main.d) el('path', { d: main.d, class: 'ph-curve' });
    const mainTag = open ? 'any base' : FAMS[b.fam].tag;
    if (main.end && main.end[0] < xMax * 0.999 && isFinite(qLim) && qLim < xMax) {
      el('circle', { cx: X(main.end[0]), cy: Y(main.end[1]), r: 4, class: 'ph-pt-lim' });
      el('text', { x: X(main.end[0]), y: Y(main.end[1]) - 9, 'text-anchor': 'middle', class: 'ph-label' }, 'saturated');
    } else if (main.end) {
      const ex = Math.min(X(main.end[0]) + 4, VW - 2);
      let ey = Y(main.end[1]) + 4;
      const ty = Y(inp.ph1) - 5;
      if (Math.abs(ey - ty) < 14) ey = ty + 20;
      el('text', { x: ex, y: ey, 'text-anchor': 'start', class: 'ph-tag-main' }, mainTag);
    } else {
      const cut = curves[b.fam].find(function (p) { return p[1] > yMax; });
      if (cut) el('text', { x: Math.min(X(cut[0]) + 3, VW - 2), y: yTop + 10, class: 'ph-tag-main' }, mainTag);
    }

    // bicarbonate limit (closed)
    if (!open && r.dose.reason === 'buffer' && r.dose.limitPH < yMax) {
      el('line', { x1: x0, y1: Y(r.dose.limitPH), x2: x1, y2: Y(r.dose.limitPH), class: 'ph-pk' });
    }

    // target line
    if (inp.ph1 <= yMax && inp.ph1 >= yMin) {
      el('line', { x1: x0, y1: Y(inp.ph1), x2: x1, y2: Y(inp.ph1), class: 'ph-target' });
      el('text', { x: x1 - 2, y: Y(inp.ph1) - 5, 'text-anchor': 'end', class: 'ph-label' }, 'target ' + inp.ph1);
    }

    // current point(s)
    el('circle', { cx: X(0), cy: Y(inp.ph0), r: 5.5, class: 'ph-pt-cur' });
    if (open && Math.abs(r.eqPH0 - inp.ph0) > 0.02) {
      el('line', { x1: X(0) + 8, y1: Y(inp.ph0), x2: X(0) + 8, y2: Y(r.eqPH0), class: 'depth-line' });
      el('circle', { cx: X(0), cy: Y(r.eqPH0), r: 4, class: 'ph-pt-eq' });
      el('text', { x: X(0) + 14, y: (Y(inp.ph0) + Y(r.eqPH0)) / 2 + 4, class: 'dim-text' }, 'air CO₂ exchange');
    }
    const lblY = Y(inp.ph0) + (inp.ph0 > (yMin + yMax) / 2 ? 18 : -9);
    el('text', { x: X(0) + 9, y: open && r.eqPH0 < inp.ph0 ? Y(inp.ph0) - 9 : lblY, 'text-anchor': 'start', class: 'ph-label' }, 'now ' + inp.ph0);

    // dose point
    if (r.dose.need && r.dose.reachable && !r.noBase) {
      const q = r.eqAdded * 1000;
      const tx = X(q), ty = Y(inp.ph1);
      el('line', { x1: tx, y1: ty, x2: tx, y2: yBot, class: 'depth-line' });
      el('circle', { cx: tx, cy: ty, r: 5.5, class: 'ph-pt-tgt' });
      const right = tx > (x0 + x1) / 2;
      el('text', { x: tx + (right ? -6 : 6), y: yBot - 8, 'text-anchor': right ? 'end' : 'start', class: 'depth-text' }, fmt(q, 3) + ' meq/L');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'pH Up Adjustment Calculator',
      'Water: ' + typed('vol') + ', alkalinity ' + typed('alk') + ', pH ' + $('ph0').value + ' → ' + $('ph1').value + ', ' + fmt(r.inp.tC, 1) + ' °C',
      'Mode: ' + (r.inp.mode === 'open' ? 'open to air (' + $('co2').value + ' ppm CO2)' : 'closed tank (no CO2 exchange)'),
      'Base: ' + productLabel(r)
    ];
    if (!r.ok) lines.push(r.error);
    else if (r.noBase) lines.push('No base needed.');
    else if (r.unreachable) lines.push(r.b.short + ' cannot reach the target; it levels off near pH ' + fmt(r.dose.limitPH, 2) + '.');
    else {
      const liquid = !!r.b.rho;
      const perL = (liquid ? r.amt.mL : r.amt.gProduct) / r.inp.volL;
      lines.push('Amount to add: ' + amountText(r) + ' (' + (liquid ? mLText(perL * 100) : gText(perL * 100)) + ' per 100 L)');
      lines.push('Alkalinity added: ' + alkText(r.eqAdded).replace('₃', '3'));
      lines.push('Final alkalinity: ' + alkText(r.alkFinal).replace('₃', '3'));
      lines.push('Cation added: ' + cationText(r));
      if (r.steps > 1) lines.push('Split into about ' + r.steps + ' doses and measure pH between them.');
      lines.push('Estimate only: add in steps, dilute first, and measure pH.');
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  ['vol', 'alk', 'ph0', 'ph1', 'temp', 'co2', 'ca', 'pct', 'dens'].forEach(function (id) { $(id).addEventListener('input', render); });
  modeSel.addEventListener('change', render);
  baseSel.addEventListener('change', function () { setProductDefaults(baseSel.value); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'pH Up Adjustment Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    const shared = p.vol !== undefined;
    ['vol', 'alk', 'temp', 'ca'].forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && (p[f] === '' || isFinite(parseFloat(p[f])))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (shared && p.temp === undefined) $('temp').value = '';
    if (shared && p.ca === undefined) $('ca').value = '';
    ['ph0', 'ph1', 'co2'].forEach(function (f) { if (p[f] !== undefined && isFinite(parseFloat(p[f]))) $(f).value = p[f]; });
    if (p.mode === 'open' || p.mode === 'closed') modeSel.value = p.mode;
    if (p.base && BASES[p.base]) { baseSel.value = p.base; setProductDefaults(p.base); }
    if (p.pct !== undefined && isFinite(parseFloat(p.pct))) $('pct').value = p.pct;
    if (BASES[baseSel.value].rho && p.dens !== undefined && isFinite(parseFloat(p.dens))) CalcUnits.set('dens', p.dens, p.dens_u);
    if (p.out) {
      if (CalcUnits.unitDef('volume', p.out)) outVol.value = p.out;
      else if (CalcUnits.unitDef('mass', p.out)) outMass.value = p.out;
    }
    render();
  })();
})();
