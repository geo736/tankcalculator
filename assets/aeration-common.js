// Shared aeration data and maths for the air pump & air stone sizing calculators
// (aeration-aquaculture.html, and the hydroponic version that reuses this file).
// Load after units.js:  share.js → units.js → aeration-common.js → <page>.js
//
// ============================================================================
// API: window.Aeration   (all maths in SI: m, Pa, °C, kg, L, L/min for air)
// ============================================================================
// Constants
//   G (9.80665 m/s²), P_ATM (101325 Pa), R (8.314462618 J/mol/K), THETA (1.024),
//   O2_MOLE_FRACTION (0.209476), M_AIR (28.9644 g/mol), M_O2 (31.9988 g/mol),
//   O2_MASS_FRACTION (≈ 0.2314), AIR_T_STD (20 °C), CS20 (Benson & Krause DO at
//   20 °C, fresh, 1 atm ≈ 9.09 mg/L), SOTE_CAP (0.40, the most a page should allow)
//
// Dissolved-oxygen saturation (copied from dissolved-oxygen.js; Benson & Krause 1984, USGS 2011)
//   c0(tC)                         fresh water, 1 atm, mg/L
//   salFactor(tC, S)               salinity correction (S in ppt)
//   pressFactor(tC, Patm)          pressure correction (Patm in atm)
//   csat(tC, S, Patm)              saturation, mg/L
//   pressureFromElevation(hM)      U.S. Standard Atmosphere 1976, returns Pa
//
// Water and air
//   waterDensity(S)                kg/m³: 998 fresh → 1025 at 35 ppt (linear, 20 °C)
//   airDensity(pa, tC)             dry air, ideal gas, kg/m³ (tC defaults to 20 °C)
//   o2PerLitreAir(pa, tC)          g O₂ carried by 1 L of air at pa / tC
//
// Pressure the pump must supply (gauge, at the pump outlet)
//   requiredPressure({ depthM, rho, diffuserPa, linePa })
//        → { hydro, diffuser, line, total }   all Pa (hydro = rho·g·depth)
//   pressureIn(pa) → { kPa, psi, inH2O, cmH2O }
//
// Oxygen transfer: standard (clean water, 20 °C, 0 mg/L, 1 atm) → field
//   soteAtDepth(sotePerM, depthM)   fraction (e.g. 0.05 %/m … returns 0.045 at 0.9 m), capped at SOTE_CAP
//   fieldFactor({ alpha, tC, S, Patm, doTarget, theta })
//        → { factor, csat, cs20, tempCorr, deficitRatio }
//        factor = alpha · θ^(T−20) · (Csat(T,S,P) − DO) / Cs20
//        (beta and the pressure correction are inside Csat because it is computed at the
//         real salinity and pressure; factor ≤ 0 means the target DO is at/above saturation)
//   airForOxygen(gO2PerH, fieldOte, o2gPerL)  → air flow, L/min
//   oxygenFromAir(lpm, fieldOte, o2gPerL)     → O₂ transferred, g/h
//   diffuserCount(lpm, ratingLpm)             → whole diffusers (ceil), 0 if inputs bad
//
// Presets (typical / illustrative values; each has `basis` text saying where the number comes from)
//   DIFFUSERS: { id: { name, kind: 'unit'|'length', qLpm (per unit or per m), dropPa, sotePerM, basis } }
//   DIFFUSER_ORDER: ids in menu order
//   PUMPS:     { id: { name, q0Lpm, qrLpm, prPa, pmaxPa, watts, basis } }  (linear curve)
//   PUMP_ORDER
//   flowAtPressure(pump, pa)   → L/min one pump delivers at pa (0 if pa > pmaxPa)
//   pumpsFor(pump, lpm, pa)    → { each, count, watts, ok, reason }
//   bestPump(lpm, pa)          → { id, each, count, watts } lowest total watts using ≤ 4 pumps
//                                (lowest watts overall if none fits in 4), or null
//
// Unit groups added to CalcUnits.GROUPS (only if missing)
//   pressure  + 'cmH2O' (98.0665 Pa)
//   airflow   base L/s: Lpm, Lph, m3ph, m3min, cfm, Lps
//   airflowlen base L/s per m: Lpm_m (L/min per m), m3ph_m, cfm_ft (ft³/min per ft)
//   sotedepth base %/m: pct_m, pct_ft
//   o2rate    base mg O₂/kg/h: mgkgh, gkgd (g/kg/day), mgkgmin
// ============================================================================
(function () {
  'use strict';

  // ---------- Units ----------
  if (window.CalcUnits) {
    const G = CalcUnits.GROUPS;
    if (!CalcUnits.unitDef('pressure', 'cmH2O')) G.pressure.units.push({ id: 'cmH2O', label: 'cm H₂O', factor: 98.0665 });
    if (!G.airflow) {
      G.airflow = {
        base: 'Lps',
        units: [
          { id: 'Lpm', label: 'L/min', factor: 1 / 60 },
          { id: 'Lph', label: 'L/h', factor: 1 / 3600 },
          { id: 'm3ph', label: 'm³/h', factor: 1000 / 3600 },
          { id: 'm3min', label: 'm³/min', factor: 1000 / 60 },
          { id: 'cfm', label: 'CFM (ft³/min)', factor: 28.316846592 / 60 },
          { id: 'Lps', label: 'L/s', factor: 1 }
        ]
      };
    }
    if (!G.airflowlen) {
      G.airflowlen = {
        base: 'Lpsm',
        units: [
          { id: 'Lpm_m', label: 'L/min per m', factor: 1 / 60 },
          { id: 'm3ph_m', label: 'm³/h per m', factor: 1000 / 3600 },
          { id: 'cfm_ft', label: 'CFM per ft', factor: 28.316846592 / 60 / 0.3048 }
        ]
      };
    }
    if (!G.sotedepth) {
      G.sotedepth = {
        base: 'pct_m',
        units: [
          { id: 'pct_m', label: '% per m', factor: 1 },
          { id: 'pct_ft', label: '% per ft', factor: 1 / 0.3048 }
        ]
      };
    }
    if (!G.o2rate) {
      G.o2rate = {
        base: 'mgkgh',
        units: [
          { id: 'mgkgh', label: 'mg/kg/h', factor: 1 },
          { id: 'gkgd', label: 'g/kg/day', factor: 1000 / 24 },
          { id: 'mgkgmin', label: 'mg/kg/min', factor: 60 }
        ]
      };
    }
  }

  // ---------- Constants ----------
  const G_ACC = 9.80665;            // m/s², standard gravity (NIST)
  const P_ATM = 101325;             // Pa
  const R = 8.314462618;            // J/(mol·K), CODATA
  const THETA = 1.024;              // temperature correction for KLa (ASCE 2-06; Boyd 1998)
  const O2_MOLE_FRACTION = 0.209476; // dry air, U.S. Standard Atmosphere 1976
  const M_AIR = 28.9644;            // g/mol, U.S. Standard Atmosphere 1976 sea-level mean
  const M_O2 = 31.9988;             // g/mol (NIST)
  const O2_MASS_FRACTION = O2_MOLE_FRACTION * M_O2 / M_AIR; // ≈ 0.2314
  const AIR_T_STD = 20;             // °C, reference air temperature used for pump ratings here
  const SOTE_CAP = 0.40;

  // ---------- DO saturation (dissolved-oxygen.js) ----------
  function c0(t) {
    const T = t + 273.15;
    return Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / (T * T) +
      1.243800e10 / Math.pow(T, 3) - 8.621949e11 / Math.pow(T, 4));
  }
  function salFactor(t, S) {
    const T = t + 273.15;
    return Math.exp(-S * (0.017674 - 10.754 / T + 2140.7 / (T * T)));
  }
  function vaporAtm(t) {
    const T = t + 273.15;
    return Math.exp(11.8571 - 3840.70 / T - 216961 / (T * T));
  }
  function pressFactor(t, Patm) {
    const u = vaporAtm(t);
    const th = 0.000975 - 1.426e-5 * t + 6.436e-8 * t * t;
    return Patm * (1 - u / Patm) * (1 - th * Patm) / ((1 - u) * (1 - th));
  }
  function csat(t, S, Patm) { return c0(t) * salFactor(t, S) * pressFactor(t, Patm); }
  function pressureFromElevation(h) { return P_ATM * Math.pow(1 - 2.25577e-5 * h, 5.25588); }
  const CS20 = c0(20);

  // ---------- Water and air ----------
  function waterDensity(S) {
    const s = isFinite(S) ? Math.max(0, S) : 0;
    return 998 + (1025 - 998) * s / 35;
  }
  function airDensity(pa, tC) {
    const t = isFinite(tC) ? tC : AIR_T_STD;
    return pa * (M_AIR / 1000) / (R * (t + 273.15));
  }
  function o2PerLitreAir(pa, tC) {          // g O₂ per L of air
    return airDensity(pa, tC) * O2_MASS_FRACTION; // kg/m³ = g/L
  }

  // ---------- Pressure ----------
  function requiredPressure(o) {
    const hydro = Math.max(0, o.rho) * G_ACC * Math.max(0, o.depthM);
    const diffuser = Math.max(0, o.diffuserPa || 0);
    const line = Math.max(0, o.linePa || 0);
    return { hydro: hydro, diffuser: diffuser, line: line, total: hydro + diffuser + line };
  }
  function pressureIn(pa) {
    return { kPa: pa / 1000, psi: pa / 6894.757293168, inH2O: pa / 249.08891, cmH2O: pa / 98.0665 };
  }

  // ---------- Oxygen transfer ----------
  function soteAtDepth(sotePerM, depthM) {
    return Math.min(SOTE_CAP, Math.max(0, sotePerM / 100 * depthM));
  }
  function fieldFactor(o) {
    const theta = o.theta || THETA;
    const cs = csat(o.tC, o.S, o.Patm);
    const tempCorr = Math.pow(theta, o.tC - 20);
    const deficitRatio = (cs - o.doTarget) / CS20;
    return { factor: o.alpha * tempCorr * deficitRatio, csat: cs, cs20: CS20, tempCorr: tempCorr, deficitRatio: deficitRatio };
  }
  function airForOxygen(gO2PerH, fieldOte, o2gPerL) {
    if (!(fieldOte > 0 && o2gPerL > 0)) return NaN;
    return gO2PerH / (o2gPerL * fieldOte) / 60;
  }
  function oxygenFromAir(lpm, fieldOte, o2gPerL) { return lpm * 60 * o2gPerL * fieldOte; }
  function diffuserCount(lpm, ratingLpm) {
    if (!(lpm > 0 && ratingLpm > 0)) return 0;
    return Math.ceil(lpm / ratingLpm - 1e-9);
  }

  // ---------- Diffuser presets ----------
  // qLpm: typical air flow per unit (or per metre for kind 'length'); dropPa: typical pressure
  // drop across a clean diffuser at that flow; sotePerM: clean-water standard oxygen transfer
  // efficiency per metre of submergence (%/m). ALL are typical/illustrative: use the maker's data.
  const RT = 'Rule of thumb (no single published source); check the maker’s data.';
  const DIFFUSERS = {
    coarse: { name: 'Coarse bubble: open tube or drilled pipe (per outlet)', kind: 'unit', qLpm: 10, dropPa: 500, sotePerM: 2.5,
      basis: 'Wastewater practice quotes coarse-bubble SOTE at about 1% per ft (≈ 3% per m) or less; 2.5%/m used here. Flow and drop: ' + RT },
    medium: { name: 'Medium bubble: standard air stone, 2.5–5 cm', kind: 'unit', qLpm: 4, dropPa: 1500, sotePerM: 4,
      basis: 'Between coarse and fine bubbles. ' + RT },
    fine5: { name: 'Fine bubble: ceramic / glass-bonded stone, 5 cm (2 in)', kind: 'unit', qLpm: 4, dropPa: 2000, sotePerM: 5,
      basis: 'Below the ≈ 6–7.5%/m quoted for full-floor fine-pore grids, because single stones in small tanks do not cover the floor. ' + RT },
    fine10: { name: 'Fine bubble: ceramic / glass-bonded stone, 10 cm (4 in)', kind: 'unit', qLpm: 10, dropPa: 2000, sotePerM: 5,
      basis: 'Below the ≈ 6–7.5%/m quoted for full-floor fine-pore grids. ' + RT },
    fine30: { name: 'Fine bubble: glass-bonded silica bar, 30 cm (12 in)', kind: 'unit', qLpm: 25, dropPa: 2500, sotePerM: 5,
      basis: 'Below the ≈ 6–7.5%/m quoted for full-floor fine-pore grids. ' + RT },
    disc23: { name: 'Fine-pore membrane disc, 23 cm (9 in)', kind: 'unit', qLpm: 40, dropPa: 4000, sotePerM: 6,
      basis: 'Wastewater practice quotes about 2% per ft (≈ 6–7.5% per m) in clean water for full-floor fine-pore grids. Membrane disc wet pressure loss is roughly 2–6 kPa on maker curves. Flow: ' + RT },
    tubehobby: { name: 'Porous rubber aeration tubing (per m)', kind: 'length', qLpm: 5, dropPa: 3000, sotePerM: 5,
      basis: RT },
    tubemem: { name: 'Fine-pore membrane tube, 65 mm (per m)', kind: 'length', qLpm: 100, dropPa: 4000, sotePerM: 6,
      basis: 'Same fine-pore SOTE basis as the membrane disc. Flow: ' + RT },
    custom: { name: 'Other diffuser (enter its data)', kind: 'unit', qLpm: null, dropPa: null, sotePerM: null, basis: 'Enter the maker’s figures.' }
  };
  const DIFFUSER_ORDER = ['coarse', 'medium', 'fine5', 'fine10', 'fine30', 'disc23', 'tubehobby', 'tubemem', 'custom'];

  // ---------- Air pump presets ----------
  // Linear curve through (0, q0) and (pr, qr), cut off at pmax. Wattages for the linear pumps
  // are the Battery Life calculator's presets; pressures are from example datasheets.
  const PUMPS = {
    aquarium: { name: 'Small aquarium air pump (≈ 6.7 L/min, 4 W)', q0Lpm: 400 / 60, qrLpm: 0, prPa: 2 * 9806.65, pmaxPa: 2 * 9806.65, watts: 4,
      basis: 'Example: retail listings for the Eheim Air 400 give 400 L/h, about 2 m maximum depth and 4 W. Flow is assumed to fall in a straight line to zero at that depth.' },
    linear60: { name: 'Linear air pump 60 L/min (50 W)', q0Lpm: 99, qrLpm: 60, prPa: 2.13 * 6894.757293168, pmaxPa: 3.6 * 6894.757293168, watts: 50,
      basis: 'Example datasheet (Hiblow HP-60, from vendor spec sheets): 60 L/min at 2.13 psi (14.7 kPa), 3.5 CFM (99 L/min) at 0 psi, 3.6 psi (24.8 kPa) maximum continuous. 50 W as in the Battery Life calculator (datasheet 51 W).' },
    linear120: { name: 'Linear air pump 120 L/min (110 W)', q0Lpm: 147, qrLpm: 120, prPa: 17700, pmaxPa: 2.6 * 6894.757293168, watts: 110,
      basis: 'Example datasheet (Hiblow HP-120, from vendor spec sheets): 120 L/min at 17.7 kPa (2.57 psi), 5.2 CFM (147 L/min) at 0 psi, 2.6 psi (17.9 kPa) maximum continuous. 110 W as in the Battery Life calculator (listings give 100–115 W).' }
  };
  const PUMP_ORDER = ['aquarium', 'linear60', 'linear120'];

  function flowAtPressure(p, pa) {
    if (!p || !(pa >= 0) || pa > p.pmaxPa + 1e-9) return 0;
    const slope = (p.q0Lpm - p.qrLpm) / p.prPa;       // L/min lost per Pa
    return Math.max(0, p.q0Lpm - slope * pa);
  }
  function pumpsFor(p, lpm, pa) {
    const each = flowAtPressure(p, pa);
    if (!(each > 0)) return { each: 0, count: 0, watts: 0, ok: false, reason: 'pressure' };
    const count = Math.max(1, Math.ceil(lpm / each - 1e-9));
    return { each: each, count: count, watts: count * p.watts, ok: true, reason: '' };
  }
  // Lowest total power among presets needing at most MAX_PUMPS units (a dozen small aquarium pumps
  // is not a practical answer even if it saves a few watts); if none fits, lowest power overall.
  const MAX_PUMPS = 4;
  function bestPump(lpm, pa) {
    let best = null, bestAny = null;
    PUMP_ORDER.forEach(function (id) {
      const r = pumpsFor(PUMPS[id], lpm, pa);
      if (!r.ok) return;
      const cand = { id: id, each: r.each, count: r.count, watts: r.watts };
      if (!bestAny || r.watts < bestAny.watts - 1e-9) bestAny = cand;
      if (r.count <= MAX_PUMPS && (!best || r.watts < best.watts - 1e-9)) best = cand;
    });
    return best || bestAny;
  }

  window.Aeration = {
    G: G_ACC, P_ATM: P_ATM, R: R, THETA: THETA, O2_MOLE_FRACTION: O2_MOLE_FRACTION, M_AIR: M_AIR, M_O2: M_O2,
    O2_MASS_FRACTION: O2_MASS_FRACTION, AIR_T_STD: AIR_T_STD, CS20: CS20, SOTE_CAP: SOTE_CAP,
    c0: c0, salFactor: salFactor, pressFactor: pressFactor, csat: csat, pressureFromElevation: pressureFromElevation,
    waterDensity: waterDensity, airDensity: airDensity, o2PerLitreAir: o2PerLitreAir,
    requiredPressure: requiredPressure, pressureIn: pressureIn,
    soteAtDepth: soteAtDepth, fieldFactor: fieldFactor, airForOxygen: airForOxygen, oxygenFromAir: oxygenFromAir,
    diffuserCount: diffuserCount,
    DIFFUSERS: DIFFUSERS, DIFFUSER_ORDER: DIFFUSER_ORDER, PUMPS: PUMPS, PUMP_ORDER: PUMP_ORDER,
    flowAtPressure: flowAtPressure, pumpsFor: pumpsFor, bestPump: bestPump
  };
})();
