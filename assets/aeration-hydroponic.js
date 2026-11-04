// Air Pump & Air Stone Sizing (Hydroponic Systems): DWC canals, SWC troughs, or the reservoir /
// sump of NFT, media-bed and other systems. Air flow from aeration intensity (L air per L of
// solution per min; Baiyin et al. 2021), stones by flow rating and by spacing, pump pressure at
// the stone depth, pump choice and power. Uses window.Aeration (aeration-common.js) for all the
// shared physics, diffuser and pump data, so it agrees with the fish-system calculator.
// Live SVG cross-section per system type, shareable URL state.
(function () {
  'use strict';

  const A = window.Aeration;

  // ---------- Local unit group (not in units.js or aeration-common.js) ----------
  // Aeration intensity: volume of air per volume of solution per minute. Base: L air per L per min.
  if (!CalcUnits.GROUPS.aerint) {
    CalcUnits.GROUPS.aerint = {
      base: 'LLmin',
      units: [
        { id: 'LLmin', label: 'L air per L per min', factor: 1 },
        { id: 'L100L', label: 'L/min per 100 L', factor: 0.01 },
        { id: 'Lm3', label: 'L/min per m³', factor: 0.001 },
        { id: 'Lgal', label: 'L/min per US gal', factor: 1 / 3.785411784 },
        { id: 'cfm100gal', label: 'CFM per 100 US gal', factor: 28.316846592 / 378.5411784 },
        { id: 'LLh', label: 'L air per L per hour', factor: 1 / 60 }
      ]
    };
  }

  // ---------- System types ----------
  // geo 'canal': the canals / troughs themselves are aerated (L × W × depth × count).
  // geo 'res':   only the reservoir / sump is aerated (volume + water depth).
  // preset values are in base units (m, L) and are applied when the user switches system type.
  const SYS = {
    dwc: { short: 'DWC', geo: 'canal', word: 'canal', words: 'canals',
      preset: { cl: 2.4, cwid: 1.2, cd: 0.30, cn: 2, sdepth: 0.30 } },
    swc: { short: 'SWC', geo: 'canal', word: 'trough', words: 'troughs',
      preset: { cl: 2.4, cwid: 1.2, cd: 0.10, cn: 2, sdepth: 0.10 } },
    nft: { short: 'NFT', geo: 'res', word: 'reservoir', words: 'reservoirs',
      preset: { rvol: 200, rdepth: 0.5, sdepth: 0.5 } },
    media: { short: 'Media bed', geo: 'res', word: 'sump', words: 'sumps',
      preset: { rvol: 300, rdepth: 0.5, sdepth: 0.5 } },
    res: { short: 'Reservoir', geo: 'res', word: 'reservoir', words: 'reservoirs',
      preset: { rvol: 100, rdepth: 0.4, sdepth: 0.4 } }
  };
  const SYS_HINT = {
    dwc: 'Rafts float on canals 20–40 cm deep (or more). Roots hang in the solution all the time, so the canals themselves are aerated, with stones on the floor.',
    swc: 'This page uses “SWC” for shallow water culture: shallow troughs or rafts with a few cm up to about 15 cm of solution. The troughs themselves are aerated; stones are only a few cm deep, so little pressure is needed.',
    nft: 'In NFT the channels are not aerated: a thin film runs along the channel floor and the upper roots sit in the humid air above it. An air stone in the reservoir keeps the solution that is pumped back to the channels well oxygenated.',
    media: 'In a flood-and-drain media bed the roots get air each time the bed drains, so the beds are not aerated. An air stone in the sump keeps the stored solution oxygenated between floods.',
    res: 'Any system where only a tank of solution is aerated: drip or Dutch-bucket reservoirs, a separate DWC sump, a mixing tank.'
  };

  // UVI raft design (Rakocy et al. 2004): 10 L/min diffusers every 1.2 m along the centre of each
  // raft tank. Used as the default stone spacing (rule of thumb, one documented design).
  const SPACING_UVI = 1.2;
  // Baiyin et al. (2021) bands, L air per L of solution per min.
  const INT_LO = 0.07, INT_MID = 0.15, INT_HI = 1.18, INT_MAX_TESTED = 2.35;
  const DO_PLANT_MIN = 3;          // mg/L, FAO TP 589 Table 3.1 (Dissolved Oxygen calculator)
  const WARM_T = 26;               // °C, the hydroponic guide's warm-solution flag
  const RZT_COMPROMISE = 24;       // °C, Carotti et al. (2021)

  const DEFAULTS = {
    cl: [2.4, 'm'], cwid: [1.2, 'm'], cd: [30, 'cm'], cn: [2],
    rvol: [200, 'L'], rdepth: [50, 'cm'],
    sdepth: [30, 'cm'], temp: [20, 'C'], elev: [0, 'm'], dotarget: [DO_PLANT_MIN, 'mgL'],
    aint: [0.07, 'LLmin'], sf: [1.5], spacing: [SPACING_UVI, 'm'],
    dq: [10, 'Lpm'], dql: [5, 'Lpm_m'], ddrop: [2, 'kPa'], sote: [5, 'pct_m'], line: [1, 'kPa'],
    pq: [60, 'Lpm'], ppmax: [20, 'kPa'], pw: [50, 'W']
  };
  const SELECT_DEFAULTS = { sys: 'dwc', diffuser: 'fine10', pump: 'auto', outflow: 'Lpm', outp: 'kPa' };
  const FIELDS = Object.keys(DEFAULTS);
  const SELECTS = Object.keys(SELECT_DEFAULTS);

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function lpmTo(lpm, u) { return CalcUnits.convert('airflow', lpm, 'Lpm', u); }
  function flowStr(lpm, u) {
    const unit = u || $('outflow').value || 'Lpm';
    return fmt(lpmTo(lpm, unit)) + ' ' + CalcUnits.label('airflow', unit);
  }
  function flowTriple(lpm) {
    return ['Lpm', 'cfm', 'm3ph'].map(function (u) {
      return fmt(lpmTo(lpm, u)) + ' ' + (u === 'cfm' ? 'CFM' : CalcUnits.label('airflow', u));
    }).join(' · ');
  }
  function pStr(pa, u) {
    const unit = u || $('outp').value || 'kPa';
    return fmt(CalcUnits.convert('pressure', pa, 'Pa', unit)) + ' ' + CalcUnits.label('pressure', unit);
  }
  function volStr(L) {
    return L >= 1000 ? fmt(L / 1000, 2) + ' m³ (' + fmt(L, 0) + ' L, ' + fmt(L / 3.785411784, 0) + ' US gal)'
      : fmt(L, 1) + ' L (' + fmt(L / 3.785411784, 1) + ' US gal)';
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : '–') + (u ? ' ' + u : '');
  }
  function plain(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function inUnitOf(id, base) { return fmt(CalcUnits.fromBase(id, base)) + ' ' + CalcUnits.unitLabel(id); }
  function plural(n, one, many) { return n === 1 ? one : many; }

  function sys() { return SYS[$('sys').value] || SYS.dwc; }
  function sysId() { return SYS[$('sys').value] ? $('sys').value : 'dwc'; }
  function diffuser() { return A.DIFFUSERS[$('diffuser').value] || A.DIFFUSERS.fine10; }
  function isTube() { return diffuser().kind === 'length'; }

  // Whole count of positive input (NaN if not a whole number ≥ 1).
  function count(id) {
    const v = plain(id);
    return v >= 1 && Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : NaN;
  }

  // ---------- Compute ----------
  function compute() {
    const r = { errors: [], warns: [], notes: [] };
    const s = sys();
    r.sysId = sysId(); r.geo = s.geo; r.word = s.word; r.words = s.words;

    // Aerated water
    if (s.geo === 'canal') {
      r.L = CalcUnits.base('cl'); r.W = CalcUnits.base('cwid'); r.D = CalcUnits.base('cd');
      r.n = count('cn');
      if (!r.L) r.errors.push('Enter the ' + s.word + ' length.');
      else if (r.L > 500) r.errors.push('The ' + s.word + ' length must be 500 m or less.');
      if (!r.W) r.errors.push('Enter the ' + s.word + ' width.');
      else if (r.W > 50) r.errors.push('The ' + s.word + ' width must be 50 m or less.');
      if (!r.D) r.errors.push('Enter the solution depth in the ' + s.word + '.');
      else if (r.D > 3) r.errors.push('The solution depth must be 3 m or less.');
      if (!(r.n >= 1)) r.errors.push('Number of ' + s.words + ' must be a whole number, 1 or more.');
      else if (r.n > 1000) r.errors.push('Number of ' + s.words + ' must be 1,000 or less.');
      r.volEach = r.L * r.W * r.D * 1000;            // L
      r.waterDepth = r.D;
      r.floor = r.L * r.W;                            // m² per canal
    } else {
      r.volEach = CalcUnits.base('rvol');             // L
      r.waterDepth = CalcUnits.base('rdepth');
      r.n = 1;
      if (!r.volEach) r.errors.push('Enter the volume of solution in the ' + s.word + '.');
      else if (r.volEach > 1e6) r.errors.push('The ' + s.word + ' volume must be 1,000 m³ or less.');
      if (!r.waterDepth) r.errors.push('Enter the solution depth in the ' + s.word + '.');
      else if (r.waterDepth > 5) r.errors.push('The solution depth must be 5 m or less.');
      r.floor = r.waterDepth > 0 ? r.volEach / 1000 / r.waterDepth : 0;  // m²
    }
    r.sdepth = CalcUnits.base('sdepth');
    if (!r.sdepth) r.errors.push('Enter the depth of the air stones below the solution surface.');
    else if (r.waterDepth > 0 && r.sdepth > r.waterDepth * 1.0001) r.errors.push('The stones cannot be deeper than the solution (' + inUnitOf('sdepth', r.waterDepth) + ').');

    // Solution
    const t = CalcUnits.baseSigned('temp');
    const h = CalcUnits.baseSigned('elev');
    const doT = CalcUnits.baseSigned('dotarget');
    if (!isFinite(t) || t < 0 || t > 40) r.errors.push('Solution temperature must be between 0 and 40 °C (32–104 °F).');
    if (!isFinite(h) || h < -500 || h > 6000) r.errors.push('Elevation must be between −500 m and 6,000 m (−1,640 to 19,685 ft).');
    if (!isFinite(doT) || doT < 0 || doT > 20) r.errors.push('Enter the dissolved oxygen to keep, between 0 and 20 mg/L.');
    r.t = t; r.h = h; r.doT = doT;

    // Sizing
    r.aint = CalcUnits.base('aint');                   // L/L/min
    if (!r.aint) r.errors.push('Enter the aeration intensity (L of air per L of solution per minute).');
    else if (r.aint > 5) r.errors.push('An aeration intensity above 5 L of air per L per minute is far beyond anything tested. Check the unit.');
    r.sf = plain('sf');
    if (!(r.sf >= 1 && r.sf <= 5)) r.errors.push('Safety factor must be between 1 and 5.');
    r.spacing = CalcUnits.base('spacing');
    if (!r.spacing) r.errors.push('Enter the largest spacing between stones.');

    // Diffuser
    const d = diffuser();
    r.tube = d.kind === 'length';
    r.rating = r.tube ? CalcUnits.base('dql') * 60 : CalcUnits.base('dq') * 60;  // L/min per unit or per m
    if (!r.rating) r.errors.push(r.tube ? 'Enter the air flow per metre of tube.' : 'Enter the air flow per air stone.');
    r.ddrop = CalcUnits.baseSigned('ddrop');
    if (!isFinite(r.ddrop) || r.ddrop < 0) r.errors.push('Enter the stone pressure drop (0 or more).');
    r.linePa = CalcUnits.baseSigned('line');
    if (!isFinite(r.linePa) || r.linePa < 0) r.errors.push('Enter the air line allowance (0 or more).');
    r.sotePerM = CalcUnits.base('sote');
    if (!r.sotePerM) r.errors.push('Enter the stone’s standard oxygen transfer efficiency (SOTE) per metre.');
    else if (r.sotePerM > 15) r.errors.push('SOTE above 15% per metre is beyond published values for bubble diffusers. Check the unit.');

    r.ok = r.errors.length === 0;
    if (!r.ok) return r;

    // Air flow (method: aeration intensity × solution volume × safety factor)
    r.volTotal = r.volEach * r.n;
    r.aintDesign = r.aint * r.sf;
    r.airLpm = r.aintDesign * r.volTotal;
    r.perEach = r.airLpm / r.n;

    // Stones: by flow rating and by spacing / coverage; the larger governs
    r.byFlow = A.diffuserCount(r.perEach, r.rating);
    if (r.geo === 'canal') {
      r.rowsAcross = Math.max(1, Math.ceil(r.W / r.spacing - 1e-9));
      r.alongLen = Math.max(1, Math.ceil(r.L / r.spacing - 1e-9));
      r.bySpace = r.tube ? Math.ceil(r.rowsAcross * r.L - 1e-9) : r.rowsAcross * r.alongLen;
    } else {
      r.bySpace = r.tube ? Math.max(1, Math.ceil(r.floor / r.spacing - 1e-9))
        : Math.max(1, Math.ceil(r.floor / (r.spacing * r.spacing) - 1e-9));
    }
    r.units = Math.max(r.byFlow, r.bySpace);
    r.governs = r.byFlow >= r.bySpace ? 'flow' : 'spacing';
    r.unitsTotal = r.units * r.n;
    r.perUnit = r.units ? r.perEach / r.units : 0;

    // Pressure at the pump
    r.rho = A.waterDensity(0);
    r.press = A.requiredPressure({ depthM: r.sdepth, rho: r.rho, diffuserPa: r.ddrop, linePa: r.linePa });

    // Oxygen saturation and a clean-water estimate of the oxygen this air can dissolve
    r.Pa = A.pressureFromElevation(r.h);
    r.Patm = r.Pa / A.P_ATM;
    r.csat = A.csat(t, 0, r.Patm);
    const ff = A.fieldFactor({ alpha: 1, tC: t, S: 0, Patm: r.Patm, doTarget: doT });
    r.sote = A.soteAtDepth(r.sotePerM, r.sdepth);
    r.fieldOte = ff.factor > 0 ? r.sote * ff.factor : 0;
    r.o2gPerL = A.o2PerLitreAir(r.Pa, A.AIR_T_STD);
    r.o2gph = A.oxygenFromAir(r.airLpm, r.fieldOte, r.o2gPerL);    // g/h
    r.o2mgLh = r.o2gph * 1000 / r.volTotal;                         // mg/L per hour of solution

    // Pump
    const pumpSel = $('pump').value;
    r.pumpSel = pumpSel;
    if (pumpSel === 'custom') {
      const pq = CalcUnits.base('pq') * 60, pmax = CalcUnits.base('ppmax'), pw = CalcUnits.base('pw');
      if (!pq || !pmax || !pw) { r.errors.push('Enter the custom pump’s flow, maximum pressure and power.'); r.ok = false; return r; }
      r.pumpName = 'your pump'; r.pmax = pmax;
      if (r.press.total > pmax) r.pump = { ok: false, reason: 'pressure', each: 0, count: 0, watts: 0 };
      else { const c = Math.max(1, Math.ceil(r.airLpm / pq - 1e-9)); r.pump = { ok: true, each: pq, count: c, watts: c * pw }; }
    } else if (pumpSel === 'auto') {
      const b = A.bestPump(r.airLpm, r.press.total);
      if (b) { r.pump = { ok: true, each: b.each, count: b.count, watts: b.watts }; r.pumpId = b.id; r.pumpName = A.PUMPS[b.id].name; r.pmax = A.PUMPS[b.id].pmaxPa; }
      else { r.pump = { ok: false, reason: 'pressure', each: 0, count: 0, watts: 0 }; r.pumpName = 'none of the presets'; }
    } else {
      const P = A.PUMPS[pumpSel];
      r.pumpId = pumpSel; r.pumpName = P.name; r.pmax = P.pmaxPa;
      r.pump = A.pumpsFor(P, r.airLpm, r.press.total);
    }
    r.options = A.PUMP_ORDER.map(function (id) { return { id: id, r: A.pumpsFor(A.PUMPS[id], r.airLpm, r.press.total) }; });
    r.kwhDay = r.pump.watts * 24 / 1000;
    r.kwhYear = r.kwhDay * 365;

    // ---------- Checks ----------
    if (r.aintDesign < INT_LO) r.warns.push('The design intensity (' + fmt(r.aintDesign, 3) + ' L/L/min) is below the lowest Baiyin et al. (2021) tested (0.07). Check DO with a meter.');
    else if (r.aintDesign > INT_HI) r.warns.push('The design intensity (' + fmt(r.aintDesign, 2) + ' L/L/min) is above 1.18, where Baiyin et al. (2021) saw growth decrease. More air also costs power.');
    if (ff.factor <= 0) r.warns.push('The DO to keep (' + fmt(doT, 2) + ' mg/L) is at or above saturation (' + fmt(r.csat, 2) + ' mg/L) at this temperature and elevation. Air cannot reach it; cool the solution or lower the target.');
    else if (doT < DO_PLANT_MIN) r.warns.push('The DO to keep is below the 3 mg/L minimum FAO TP 589 gives for plants (rule of thumb).');
    if (t > WARM_T) r.warns.push('Warm solution: at ' + fmt(t, 1) + ' °C it holds at most ' + fmt(r.csat, 2) + ' mg/L of oxygen while roots use more. Consider cooling; about ' + RZT_COMPROMISE + ' °C is a reasonable compromise (Carotti et al., 2021).');
    if (r.sysId === 'swc' && r.D > 0.15) r.notes.push('More than about 15 cm of solution is deep water culture rather than shallow (this page’s definition).');
    if (r.sysId === 'dwc' && r.D < 0.15) r.notes.push('Less than about 15 cm of solution is shallow water culture; consider the SWC option (same maths, different guidance).');
    if (r.geo === 'canal' && r.sdepth < r.waterDepth * 0.5) r.notes.push('The stones are in the top half of the solution; on the floor they mix the whole depth and dissolve more oxygen.');
    if (!r.pump.ok) r.warns.push(pumpSel === 'auto'
      ? 'None of the preset pumps can push air to ' + pStr(r.press.total) + '. Use a pump rated for this pressure (choose “Other pump”).'
      : 'The pump cannot supply ' + pStr(r.press.total) + ': its maximum is ' + pStr(r.pmax) + '. Choose a pump with a higher pressure rating, or put the stones shallower.');
    else if (r.pmax && r.press.total > 0.85 * r.pmax)
      r.warns.push('The pressure needed is within 15% of the pump’s maximum. Air flow will fall as the stones clog; pick a pump with more pressure in hand.');
    if (r.pump.ok && r.pump.count > 6) r.notes.push(r.pump.count + ' pumps is a lot to run and maintain; a larger pump (or “Pump options” below) may be simpler, even if it draws a little more power.');
    if (r.governs === 'spacing' && r.perUnit < 0.25 * r.rating) r.notes.push('Spacing needs more stones than the air can feed well (each gets ' + flowStr(r.perUnit) + ', a quarter of its rating or less). Use smaller stones or porous tubing.');
    return r;
  }

  // ---------- Visibility and presets ----------
  function syncVisibility() {
    const s = sys();
    document.querySelectorAll('[data-geo]').forEach(function (e) { e.hidden = e.dataset.geo !== s.geo; });
    const word = s.word;
    $('lab-cl').textContent = (word === 'trough' ? 'Trough' : 'Canal') + ' length';
    $('lab-cwid').textContent = (word === 'trough' ? 'Trough' : 'Canal') + ' width';
    $('lab-cd').textContent = 'Solution depth in the ' + word;
    $('lab-cn').textContent = 'Number of ' + s.words;
    $('lab-rvol').textContent = 'Solution volume in the ' + word;
    $('lab-rdepth').textContent = 'Solution depth in the ' + word;
    $('sys-hint').textContent = SYS_HINT[sysId()];
    const tube = isTube();
    $('f-dq').hidden = tube;
    $('f-dql').hidden = !tube;
    $('spacing-hint').textContent = tube
      ? 'Distance between parallel runs of tubing. Rule of thumb: the UVI raft design put stones every 1.2 m (Rakocy et al., 2004).'
      : (s.geo === 'canal'
        ? 'Largest gap between stones, along and across the ' + word + '. Rule of thumb: the UVI raft design put 10 L/min stones every 1.2 m along the centre of each raft tank (Rakocy et al., 2004).'
        : 'One stone per spacing × spacing of floor. Rule of thumb based on the UVI raft design’s 1.2 m (Rakocy et al., 2004).');
    const custom = $('pump').value === 'custom';
    document.querySelectorAll('[data-pump="custom"]').forEach(function (e) { e.hidden = !custom; });
    $('diffuser-hint').textContent = diffuser().basis;
    const p = A.PUMPS[$('pump').value];
    $('pump-hint').textContent = $('pump').value === 'auto'
      ? 'Picks the preset with the lowest total power that can deliver the air at the pressure needed (same rule as the fish-system calculator).'
      : p ? p.basis : 'Read the flow at the pressure shown below from your pump’s performance curve.';
  }

  // Put a base-unit value into an input, in whatever unit that input currently shows.
  function setBase(id, baseVal) {
    const sel = document.querySelector('select[data-unit-for="' + id + '"]');
    if (!sel) { CalcUnits.set(id, baseVal); return; }
    const grp = sel.dataset.unitGroup;
    const baseId = CalcUnits.GROUPS[grp].base;
    const u = sel.value;
    CalcUnits.set(id, +CalcUnits.convert(grp, baseVal, baseId, u).toPrecision(4), u);
  }
  function applySystemPreset() {
    const pr = sys().preset;
    Object.keys(pr).forEach(function (k) { setBase(k, pr[k]); });
  }
  function applyDiffuserPreset() {
    const d = diffuser();
    if (d.qLpm === null) return;
    const qId = d.kind === 'length' ? 'dql' : 'dq';
    const grp = d.kind === 'length' ? 'airflowlen' : 'airflow';
    const qUnit = CalcUnits.unit(qId);
    CalcUnits.set(qId, +CalcUnits.convert(grp, d.qLpm, d.kind === 'length' ? 'Lpm_m' : 'Lpm', qUnit).toPrecision(4), qUnit);
    CalcUnits.set('ddrop', +CalcUnits.convert('pressure', d.dropPa, 'Pa', CalcUnits.unit('ddrop')).toPrecision(4), CalcUnits.unit('ddrop'));
    CalcUnits.set('sote', +CalcUnits.convert('sotedepth', d.sotePerM, 'pct_m', CalcUnits.unit('sote')).toPrecision(4), CalcUnits.unit('sote'));
  }

  function visible(id) {
    let e = $(id).closest('.field');
    while (e && e !== document.body) { if (e.hidden) return false; e = e.parentElement; }
    return true;
  }

  function getState() {
    const st = {};
    SELECTS.forEach(function (s) { st[s] = $(s).value; });
    FIELDS.forEach(function (f) {
      if (!visible(f)) return;
      st[f] = $(f).value;
      if (CalcUnits.unit(f)) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    SELECTS.forEach(function (s) { $(s).value = SELECT_DEFAULTS[s]; });
  }

  // ---------- Render ----------
  function setText(id, t) { $(id).textContent = t; }

  function intensityBand(x) {
    if (x < INT_LO) return 'below the lowest intensity Baiyin et al. (2021) tested (0.07)';
    if (x <= INT_MID) return 'in the 0.07–0.15 range where growth rose with more air (Baiyin et al., 2021)';
    if (x <= INT_HI) return 'in the 0.15–1.18 range with little further gain (Baiyin et al., 2021)';
    if (x <= INT_MAX_TESTED) return 'in the 1.18–2.35 range where growth fell (Baiyin et al., 2021)';
    return 'above anything Baiyin et al. (2021) tested (2.35)';
  }

  function rootNote(id) {
    switch (id) {
      case 'dwc': return 'Roots are always submerged: the air stones in the canals are their only oxygen supply. Keep the pump on a backup supply.';
      case 'swc': return 'Roots sit in a shallow layer; stones only a few cm deep need little pressure but dissolve less oxygen per litre of air.';
      case 'nft': return 'Channels not aerated: roots above the thin film take oxygen from the air gap. The reservoir stone keeps the returning solution oxygenated.';
      case 'media': return 'Beds not aerated: each drain pulls fresh air into the media around the roots. The sump stone keeps the stored solution oxygenated.';
      default: return 'Only the reservoir is aerated; the solution it feeds carries that oxygen to the roots.';
    }
  }

  function render() {
    syncVisibility();
    const r = compute();
    const notice = $('notice');
    const msgs = r.errors.concat(r.warns, r.ok ? r.notes : []);
    notice.innerHTML = '';
    msgs.forEach(function (m, i) {
      if (i) notice.appendChild(document.createElement('br'));
      notice.appendChild(document.createTextNode(m));
    });
    notice.hidden = msgs.length === 0;

    const ids = ['r-air', 'r-air-alt', 'r-vol', 'r-int', 'r-per', 'r-sflow', 'r-sspace', 'r-units', 'r-press', 'r-press-parts',
      'r-pump', 'r-pcheck', 'r-options', 'r-power', 'r-sat', 'r-o2', 'r-root'];
    if (!r.ok) {
      ids.forEach(function (id) { setText(id, '–'); });
      setText('viz-caption', 'Enter the inputs to draw the system');
      drawViz(null);
      CalcShare.writeParams(getState());
      return;
    }
    const W = r.word, Ws = r.words;
    const uWord = r.tube ? 'm of tube' : plural(r.units, 'stone', 'stones');
    setText('r-air', flowStr(r.airLpm));
    setText('r-air-alt', flowTriple(r.airLpm));
    setText('r-vol', r.n > 1 ? volStr(r.volTotal) + ' in ' + r.n + ' ' + Ws + ' (' + volStr(r.volEach) + ' each)' : volStr(r.volTotal) + ' in the ' + W);
    setText('r-int', fmt(r.aintDesign, 3) + ' L/L/min (' + fmt(r.aint, 3) + ' × ' + fmt(r.sf, 2) + ' safety) · ' + intensityBand(r.aintDesign));
    setText('r-per', flowStr(r.perEach) + ' per ' + W + (r.n > 1 ? ' × ' + r.n : ''));
    setText('r-sflow', r.tube ? fmt(r.byFlow, 0) + ' m per ' + W + ' at ' + flowStr(r.rating) + ' per m'
      : fmt(r.byFlow, 0) + ' per ' + W + ' at ' + flowStr(r.rating) + ' each');
    setText('r-sspace', r.geo === 'canal'
      ? (r.tube ? fmt(r.rowsAcross, 0) + ' ' + plural(r.rowsAcross, 'run', 'runs') + ' × ' + inUnitOf('cl', r.L) + ' = ' + fmt(r.bySpace, 0) + ' m per ' + W
        : fmt(r.alongLen, 0) + ' along × ' + fmt(r.rowsAcross, 0) + ' across = ' + fmt(r.bySpace, 0) + ' per ' + W) + ' at ' + inUnitOf('spacing', r.spacing)
      : fmt(r.bySpace, 0) + (r.tube ? ' m' : '') + ' for ' + fmt(r.floor, 2) + ' m² of floor at ' + inUnitOf('spacing', r.spacing));
    setText('r-units', fmt(r.units, 0) + ' ' + uWord + ' per ' + W + (r.n > 1 ? ' (' + fmt(r.unitsTotal, 0) + ' total)' : '') +
      ' · ' + (r.byFlow === r.bySpace ? 'flow and spacing agree' : (r.governs === 'flow' ? 'flow rating governs' : 'spacing governs')) +
      ' · ' + flowStr(r.perUnit) + (r.tube ? ' per m' : ' each'));
    setText('r-press', pStr(r.press.total));
    const pi = A.pressureIn(r.press.total);
    setText('r-press-parts', 'water ' + pStr(r.press.hydro) + ' + stone ' + pStr(r.press.diffuser) + ' + line ' + pStr(r.press.line) +
      '; total ' + fmt(pi.kPa, 2) + ' kPa = ' + fmt(pi.psi, 2) + ' psi = ' + fmt(pi.inH2O, 1) + ' in H₂O = ' + fmt(pi.cmH2O, 0) + ' cm H₂O');
    if (r.pump.ok) {
      setText('r-pump', r.pump.count + ' × ' + r.pumpName + ' (≈ ' + flowStr(r.pump.each) + ' each at this pressure, ' + flowStr(r.pump.each * r.pump.count) + ' total)');
      setText('r-pcheck', 'OK: needs ' + pStr(r.press.total) + ', pump maximum ' + pStr(r.pmax));
      setText('r-power', fmt(r.pump.watts, 0) + ' W · ' + fmt(r.kwhDay, 2) + ' kWh/day · ' + fmt(r.kwhYear, 0) + ' kWh/year');
    } else {
      setText('r-pump', r.pumpSel === 'auto' ? 'No preset pump can reach this pressure' : 'No: ' + r.pumpName + ' cannot reach this pressure');
      setText('r-pcheck', 'Too high: needs ' + pStr(r.press.total) + (r.pmax ? ', pump maximum ' + pStr(r.pmax) : ''));
      setText('r-power', '–');
    }
    setText('r-options', r.options.map(function (o) {
      const P = A.PUMPS[o.id];
      const nm = o.id === 'aquarium' ? 'aquarium' : fmt(P.qrLpm, 0) + ' L/min linear';
      return o.r.ok ? nm + ': ' + o.r.count + ' × (' + fmt(o.r.watts, 0) + ' W)' : nm + ': cannot reach';
    }).join(' · '));
    setText('r-sat', fmt(r.csat, 2) + ' mg/L at ' + inUnitOf('temp', r.t) + (r.csat > r.doT ? ' · target is ' + fmt(r.doT / r.csat * 100, 0) + '% of saturation' : ' · target not reachable with air'));
    setText('r-o2', r.fieldOte > 0
      ? '≈ ' + fmt(r.o2gph * 24, 0) + ' g/day (' + fmt(r.o2gph, 1) + ' g/h, ' + fmt(r.o2mgLh, 2) + ' mg/L per hour) at ' + fmt(r.fieldOte * 100, 2) + '% transfer; clean-water upper estimate'
      : '0: target at or above saturation');
    setText('r-root', rootNote(r.sysId));

    setText('viz-caption', (r.geo === 'canal' ? r.n + ' ' + plural(r.n, W, Ws) + ' × ' : 'The ' + W + ': ') +
      fmt(r.units, 0) + ' ' + uWord + ' at ' + inUnitOf('sdepth', r.sdepth) + ' · ' + flowStr(r.perEach) + ' per ' + W +
      ' · pump must supply ' + pStr(r.press.total));
    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  // Stones with bubble plumes on a floor at y=sy between x0 and x1, bubbles rising to y=top.
  function stones(r, x0, x1, sy, top, maxShow) {
    const n = r ? (r.tube ? 1 : Math.max(1, Math.min(maxShow, r.units))) : 3;
    const xs = [];
    if (r && r.tube) {
      el('rect', { class: 'stone', x: x0 + 6, y: sy - 3, width: x1 - x0 - 12, height: 6, rx: 3 });
      const k = Math.max(3, Math.min(9, Math.round((x1 - x0) / 26)));
      for (let i = 0; i < k; i++) xs.push(x0 + 14 + (x1 - x0 - 28) * (k === 1 ? 0.5 : i / (k - 1)));
    } else {
      for (let i = 0; i < n; i++) xs.push(x0 + 16 + (x1 - x0 - 32) * (n === 1 ? 0.5 : i / (n - 1)));
    }
    const hgt = Math.max(8, sy - top);
    const nb = Math.max(2, Math.min(9, Math.round(hgt / 13)));
    xs.forEach(function (x, i) {
      const spread = Math.min(12, (x1 - x0 - 32) / Math.max(1, xs.length - 1) * 0.5 + 4);
      el('path', { class: 'plume', d: 'M' + (x - 3) + ',' + (sy - 3) + ' L' + (x - spread) + ',' + top + ' L' + (x + spread) + ',' + top + ' L' + (x + 3) + ',' + (sy - 3) + 'Z' });
      const step = (hgt - 6) / nb;
      for (let k = 0; k < nb; k++) {
        const yy = sy - 7 - k * step - (i % 2) * step / 2;
        if (yy < top + 1) continue;
        const dx = Math.sin((i * 7 + k) * 1.7) * (2 + k * 0.7);
        el('circle', { class: 'bubble', cx: x + dx, cy: yy, r: 1.4 + k * 0.22 });
      }
      if (!(r && r.tube)) el('rect', { class: 'stone', x: x - 7, y: sy - 4, width: 14, height: 7, rx: 3 });
    });
    return xs;
  }

  function depthMarker(x, y0, y1, label) {
    el('line', { class: 'depth-line', x1: x, y1: y0, x2: x, y2: y1 });
    el('line', { class: 'depth-line', x1: x - 5, y1: y0, x2: x + 5, y2: y0 });
    el('line', { class: 'depth-line', x1: x - 5, y1: y1, x2: x + 5, y2: y1 });
    el('text', { class: 'depth-text', x: x - 8, y: (y0 + y1) / 2 + 4, 'text-anchor': 'end' }, label);
  }

  function plant(x, y, rootLen) {
    el('path', { class: 'root', d: 'M' + x + ',' + y + ' l-4,' + rootLen * 0.8 + ' M' + x + ',' + y + ' l0,' + rootLen + ' M' + x + ',' + y + ' l4,' + rootLen * 0.85 });
    el('rect', { class: 'netpot', x: x - 5, y: y - 6, width: 10, height: 8, rx: 1.5 });
    el('path', { class: 'leaf', d: 'M' + x + ',' + (y - 6) + ' c-10,-2 -12,-12 -6,-16 c2,6 5,8 6,16 z M' + x + ',' + (y - 6) + ' c10,-2 12,-12 6,-16 c-2,6 -5,8 -6,16 z' });
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const id = r ? r.sysId : sysId();
    const geo = SYS[id].geo;

    // Pump
    el('rect', { class: 'pump-box', x: 10, y: 22, width: 82, height: 40, rx: 6 });
    el('text', { class: 'viz-strong', x: 51, y: 40, 'text-anchor': 'middle' }, 'Air pump');
    el('text', { class: 'dim-text', x: 51, y: 55, 'text-anchor': 'middle' }, r && r.pump.ok ? r.pump.count + ' × ' + fmt(r.pump.watts / r.pump.count, 0) + ' W' : '–');
    el('text', { class: 'air-text', x: 98, y: 34, 'text-anchor': 'start' }, r ? flowStr(r.airLpm) : '');

    const X0 = 130, X1 = 360;
    let sy, wy, lineX, label2;
    if (geo === 'canal') {
      // Canal / trough: solution height drawn in proportion to depth (clamped)
      const TB = 268;
      const hW = r ? Math.max(26, Math.min(150, r.waterDepth * 450)) : (id === 'swc' ? 45 : 135);
      wy = TB - hW;
      const top = wy - 14;
      el('rect', { class: 'tank-glass', x: X0, y: top, width: X1 - X0, height: TB - top });
      el('rect', { class: 'water', x: X0, y: wy, width: X1 - X0, height: TB - wy });
      el('path', { class: 'tank-line', d: 'M' + X0 + ',' + top + ' L' + X0 + ',' + TB + ' L' + X1 + ',' + TB + ' L' + X1 + ',' + top });
      // Raft floating on the surface, with plants
      el('rect', { class: 'raft', x: X0 + 16, y: wy - 5, width: X1 - X0 - 18, height: 9 });
      const rootLen = Math.min(hW * 0.55, 40);
      for (let i = 0; i < 5; i++) plant(X0 + 38 + i * 44, wy - 2, rootLen);
      sy = TB - 8;
      lineX = X0 + 8;
      el('path', { class: 'air-line', d: 'M92,42 L' + lineX + ',42 L' + lineX + ',' + sy });
      const xs = stones(r, X0 + 4, X1, sy, wy + 6, 8);
      el('path', { class: 'air-line', d: 'M' + lineX + ',' + sy + ' L' + Math.max(lineX, xs[xs.length - 1]) + ',' + sy });
      depthMarker(X0 - 8, wy, sy, r ? inUnitOf('sdepth', r.sdepth) : '');
      el('text', { class: 'dim-text', x: (X0 + X1) / 2, y: top - 28, 'text-anchor': 'middle' },
        id === 'swc' ? 'Shallow trough (SWC): raft over a thin layer' : 'Deep water canal (DWC): raft over solution');
      label2 = r ? (r.n > 1 ? 'one of ' + r.n + ' ' + r.words + ' · ' : '') + fmt(r.units, 0) + ' ' + (r.tube ? 'm of tube' : plural(r.units, 'stone', 'stones')) + ' · ' + flowStr(r.perEach) : 'Canal';
      el('text', { class: 'dim-text', x: (X0 + X1) / 2, y: TB + 18, 'text-anchor': 'middle' }, label2);
      if (r && !r.tube && r.units > 8) el('text', { class: 'dim-text', x: (X0 + X1) / 2, y: top - 12, 'text-anchor': 'middle' }, 'drawing shows 8 of ' + r.units + ' stones');
      else if (r) el('text', { class: 'dim-text', x: (X0 + X1) / 2, y: top - 12, 'text-anchor': 'middle' }, (r.governs === 'flow' ? 'flow rating governs' : 'spacing governs') + ' the stone count');
    } else {
      // Upper unit (NFT channel, media bed, or a pot fed by drip), then the aerated reservoir below
      const RT = 170, RB = 270, RX0 = 170, RX1 = X1;
      if (id === 'nft') {
        // Sloped channel: thin film on the floor, air gap above, plants in the lid
        const cx0 = X0, cx1 = X1, cy0 = 88, cy1 = 98, ch = 22;
        el('path', { class: 'tank-glass', d: 'M' + cx0 + ',' + cy0 + ' L' + cx1 + ',' + cy1 + ' L' + cx1 + ',' + (cy1 + ch) + ' L' + cx0 + ',' + (cy0 + ch) + 'Z' });
        el('path', { class: 'water', d: 'M' + cx0 + ',' + (cy0 + ch - 4) + ' L' + cx1 + ',' + (cy1 + ch - 4) + ' L' + cx1 + ',' + (cy1 + ch) + ' L' + cx0 + ',' + (cy0 + ch) + 'Z' });
        el('path', { class: 'tank-line', d: 'M' + cx0 + ',' + cy0 + ' L' + cx1 + ',' + cy1 + ' M' + cx0 + ',' + (cy0 + ch) + ' L' + cx1 + ',' + (cy1 + ch) + ' M' + cx0 + ',' + cy0 + ' L' + cx0 + ',' + (cy0 + ch) });
        for (let i = 0; i < 5; i++) {
          const px = cx0 + 28 + i * 44, py = cy0 + (cy1 - cy0) * (px - cx0) / (cx1 - cx0);
          plant(px, py + 2, ch - 6);
        }
        el('text', { class: 'dim-text', x: (cx0 + cx1) / 2, y: cy0 - 26, 'text-anchor': 'middle' }, 'NFT channel: not aerated');
        el('text', { class: 'note-text', x: cx0 + 4, y: cy0 + ch + 16, 'text-anchor': 'start' }, 'air gap + thin film');
        // Return to the reservoir
        el('path', { class: 'pipe', d: 'M' + (cx1 - 6) + ',' + (cy1 + ch) + ' L' + (cx1 - 6) + ',' + (RT + 6) });
      } else if (id === 'media') {
        const by0 = 76, by1 = 132;
        el('rect', { class: 'tank-glass', x: X0, y: by0, width: X1 - X0, height: by1 - by0 });
        for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) {
          el('circle', { class: 'gravel', cx: X0 + 16 + i * 33 + (j % 2) * 14, cy: by0 + 18 + j * 15, r: 6 });
        }
        el('path', { class: 'tank-line', d: 'M' + X0 + ',' + by0 + ' L' + X0 + ',' + by1 + ' L' + X1 + ',' + by1 + ' L' + X1 + ',' + by0 });
        el('text', { class: 'dim-text', x: (X0 + X1) / 2, y: by0 - 10, 'text-anchor': 'middle' }, 'Media bed: air enters as it drains');
        el('path', { class: 'pipe', d: 'M' + (X1 - 14) + ',' + by1 + ' L' + (X1 - 14) + ',' + (RT + 6) });
      } else {
        el('text', { class: 'dim-text', x: (X0 + X1) / 2, y: 110, 'text-anchor': 'middle' }, 'Solution goes on to the plants');
        el('path', { class: 'pipe', d: 'M' + (X1 - 14) + ',' + (RT + 6) + ' L' + (X1 - 14) + ',' + 122 + ' L' + (X1 + 10) + ',' + 122 });
      }
      // Reservoir / sump
      const hW = r ? Math.max(30, Math.min(RB - RT - 10, r.waterDepth * 140)) : 70;
      wy = RB - hW;
      el('rect', { class: 'tank-glass', x: RX0, y: RT, width: RX1 - RX0, height: RB - RT });
      el('rect', { class: 'water', x: RX0, y: wy, width: RX1 - RX0, height: RB - wy });
      el('line', { class: 'water-top', x1: RX0, y1: wy, x2: RX1, y2: wy });
      el('path', { class: 'tank-line', d: 'M' + RX0 + ',' + RT + ' L' + RX0 + ',' + RB + ' L' + RX1 + ',' + RB + ' L' + RX1 + ',' + RT });
      sy = RB - 8;
      lineX = RX0 + 8;
      el('path', { class: 'air-line', d: 'M92,42 L' + (X0 - 30) + ',42 L' + (X0 - 30) + ',' + (RT - 10) + ' L' + lineX + ',' + (RT - 10) + ' L' + lineX + ',' + sy });
      const xs = stones(r, RX0 + 4, RX1, sy, wy + 3, 6);
      el('path', { class: 'air-line', d: 'M' + lineX + ',' + sy + ' L' + Math.max(lineX, xs[xs.length - 1]) + ',' + sy });
      depthMarker(RX0 - 8, wy, sy, r ? inUnitOf('sdepth', r.sdepth) : '');
      label2 = r ? fmt(r.units, 0) + ' ' + (r.tube ? 'm of tube' : plural(r.units, 'stone', 'stones')) + ' in the ' + r.word + ' · ' + flowStr(r.perEach) : SYS[id].word;
      el('text', { class: 'dim-text', x: (RX0 + RX1) / 2, y: RB + 18, 'text-anchor': 'middle' }, label2);
      if (r && !r.tube && r.units > 6) el('text', { class: 'dim-text', x: (RX0 + RX1) / 2, y: RT - 16, 'text-anchor': 'middle' }, 'shows 6 of ' + r.units);
    }

    // Pressure stack
    const BX = 438, BW = 22, BT = 80, BB = 270;
    el('text', { class: 'axis-title', x: BX + BW / 2, y: BT - 22, 'text-anchor': 'middle' }, 'Pump');
    el('text', { class: 'axis-title', x: BX + BW / 2, y: BT - 9, 'text-anchor': 'middle' }, CalcUnits.label('pressure', $('outp').value));
    if (r && r.press.total > 0) {
      const total = r.press.total;
      const parts = [[r.press.hydro, 'p-water', 'water'], [r.press.diffuser, 'p-diff', 'stone'], [r.press.line, 'p-line', 'line']];
      let y = BB;
      const H = BB - BT;
      parts.forEach(function (p) {
        const hh = p[0] / total * H;
        if (hh <= 0) return;
        el('rect', { class: p[1], x: BX, y: y - hh, width: BW, height: hh });
        if (hh >= 14) el('text', { class: 'dim-text', x: BX - 4, y: y - hh / 2 + 4, 'text-anchor': 'end' }, p[2] + ' ' + fmt(CalcUnits.convert('pressure', p[0], 'Pa', $('outp').value), 1));
        y -= hh;
      });
      el('rect', { class: 'gauge-frame', x: BX, y: BT, width: BW, height: H });
      el('text', { class: 'viz-strong', x: 476, y: BB + 18, 'text-anchor': 'end' }, pStr(total));
    } else {
      el('rect', { class: 'gauge-frame', x: BX, y: BT, width: BW, height: BB - BT });
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const s = sys();
    const lines = ['Air Pump & Air Stone Sizing (Hydroponic Systems)'];
    lines.push('System: ' + $('sys').options[$('sys').selectedIndex].text);
    lines.push(s.geo === 'canal'
      ? 'Aerated ' + s.words + ': ' + typed('cn') + ' × ' + typed('cl') + ' × ' + typed('cwid') + ', solution ' + typed('cd') + ' deep'
      : 'Aerated ' + s.word + ': ' + typed('rvol') + ', solution ' + typed('rdepth') + ' deep');
    lines.push('Stones at ' + typed('sdepth') + '; solution ' + typed('temp') + ', elevation ' + typed('elev') + ', keep DO at ' + typed('dotarget'));
    lines.push('Aeration intensity ' + typed('aint') + ', safety ×' + typed('sf') + ', stone spacing ' + typed('spacing'));
    lines.push('Stone: ' + diffuser().name + ' — ' + (isTube() ? typed('dql') : typed('dq')) + ', drop ' + typed('ddrop') + ', SOTE ' + typed('sote') + '; line allowance ' + typed('line'));
    if (r.ok) {
      lines.push('Air flow required: ' + flowTriple(r.airLpm) + ' (' + fmt(r.aintDesign, 3) + ' L/L/min on ' + fmt(r.volTotal, 0) + ' L)');
      lines.push('Per ' + r.word + ': ' + flowStr(r.perEach) + '; ' + r.units + (r.tube ? ' m of tube' : ' stones') + ' per ' + r.word + ' (' + r.unitsTotal + ' total; by flow ' + r.byFlow + ', by spacing ' + r.bySpace + ')');
      lines.push('Pressure at pump: ' + pStr(r.press.total) + ' (water ' + pStr(r.press.hydro) + ' + stone ' + pStr(r.press.diffuser) + ' + line ' + pStr(r.press.line) + ')');
      lines.push(r.pump.ok ? 'Pump: ' + r.pump.count + ' × ' + r.pumpName + ', ' + fmt(r.pump.watts, 0) + ' W, ' + fmt(r.kwhDay, 2) + ' kWh/day, ' + fmt(r.kwhYear, 0) + ' kWh/year' : 'Pump: none suitable at this pressure');
      lines.push('DO saturation: ' + fmt(r.csat, 2) + ' mg/L');
      r.warns.concat(r.notes).forEach(function (w) { lines.push('Note: ' + w); });
    } else {
      lines.push(r.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  A.DIFFUSER_ORDER.forEach(function (id) {
    const o = document.createElement('option');
    o.value = id; o.textContent = A.DIFFUSERS[id].name;
    $('diffuser').appendChild(o);
  });
  (function () {
    const sel = $('pump');
    const add = function (v, t) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    add('auto', 'Suggest from presets (lowest power)');
    A.PUMP_ORDER.forEach(function (id) { add(id, A.PUMPS[id].name); });
    add('custom', 'Other pump (enter its data)');
  })();

  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  ['pump', 'outflow', 'outp'].forEach(function (s) { $(s).addEventListener('change', render); });
  $('sys').addEventListener('change', function () { applySystemPreset(); render(); });
  $('diffuser').addEventListener('change', function () { syncVisibility(); applyDiffuserPreset(); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Air Pump & Air Stone Sizing (Hydroponic Systems)', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    SELECTS.forEach(function (s) {
      if (p[s] !== undefined && Array.prototype.some.call($(s).options, function (o) { return o.value === p[s]; })) $(s).value = p[s];
    });
    if ($('sys').value !== SELECT_DEFAULTS.sys) applySystemPreset();
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    render();
  })();
})();
