// Air Pump & Air Stone Sizing (Fish Systems): oxygen demand → field oxygen transfer → air flow,
// diffusers, pump pressure and pump choice. Uses window.Aeration (aeration-common.js).
// Live SVG tank cross-section, shareable URL state.
(function () {
  'use strict';

  const A = window.Aeration;

  const DEFAULTS = {
    feed: [1, 'kg'], o2feed: [0.5], biomass: [50, 'kg'], o2rate: [300, 'mgkgh'],
    tanks: [2], vol: [1000, 'L'], depth: [0.9, 'm'], temp: [25, 'C'], sal: [0], elev: [0, 'm'],
    dotarget: [5, 'mgL'], dq: [10, 'Lpm'], dql: [5, 'Lpm_m'], ddrop: [2, 'kPa'], sote: [5, 'pct_m'],
    alpha: [0.8], sf: [1.5], airshare: [100], line: [1, 'kPa'],
    cq: [60, 'Lpm'], cpmax: [20, 'kPa'], cw: [50, 'W']
  };
  const SELECT_DEFAULTS = { method: 'feed', diffuser: 'fine10', pump: 'auto', outflow: 'Lpm', outp: 'kPa' };
  const FIELDS = Object.keys(DEFAULTS);
  const SELECTS = Object.keys(SELECT_DEFAULTS);
  const AIR_ONLY_DENSITY = 30;    // kg/m³, rule of thumb (Ebeling 2000; Fish Stocking Density page)
  const MIX_REF = 20;             // L/min per m³ (Texas 30 TAC §217.155 coarse-bubble mixing minimum, 20 scfm/1000 ft³)
  const HIGH_AIR = 100;           // L/min per m³, this page's own "very high" flag (rule of thumb)
  const M3_PER_GAL = 3.785411784 / 1000;

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
    const out = $('outflow').value;
    return ['Lpm', 'cfm', 'm3ph'].filter(function (u) { return u !== out; })
      .map(function (u) { return fmt(lpmTo(lpm, u)) + ' ' + (u === 'cfm' ? 'CFM' : CalcUnits.label('airflow', u)); }).join(' · ');
  }
  function pStr(pa, u) {
    const unit = u || $('outp').value || 'kPa';
    return fmt(CalcUnits.convert('pressure', pa, 'Pa', unit)) + ' ' + CalcUnits.label('pressure', unit);
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : '–') + (u ? ' ' + u : '');
  }
  function plain(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function inUnitOf(id, base) { return fmt(CalcUnits.fromBase(id, base)) + ' ' + CalcUnits.unitLabel(id); }

  function diffuser() { return A.DIFFUSERS[$('diffuser').value] || A.DIFFUSERS.fine10; }
  function isTube() { return diffuser().kind === 'length'; }

  // ---------- Compute ----------
  function compute() {
    const r = { errors: [], warns: [] };
    const method = $('method').value;
    r.method = method;

    // Oxygen demand, g/h
    r.biomass = CalcUnits.base('biomass');                     // kg
    if (method === 'feed') {
      const feed = CalcUnits.base('feed');                     // kg/day
      const f = plain('o2feed');
      if (!feed) r.errors.push('Enter the daily feed.');
      if (!(f > 0)) r.errors.push('Enter the oxygen used per kg of feed (0.5 is a common planning value).');
      else if (f > 2) r.warns.push('More than 2 kg O₂ per kg of feed is far above published design values (0.3–1.0).');
      r.baseGph = feed * (f > 0 ? f : 0) * 1000 / 24;
    } else {
      const rate = CalcUnits.base('o2rate');                   // mg/kg/h
      if (!r.biomass) r.errors.push('Enter the fish biomass.');
      if (!rate) r.errors.push('Enter the fish oxygen use rate.');
      else if (rate > 2000) r.warns.push('An oxygen use rate above 2,000 mg/kg/h is far above the 200–500 usually reported for adult fish. Check the unit.');
      r.baseGph = r.biomass * rate / 1000;
    }
    const sf = plain('sf');
    if (!(sf >= 1)) r.errors.push('Safety factor must be 1 or more.');
    const share = plain('airshare');
    if (!(share > 0 && share <= 100)) r.errors.push('Share of oxygen supplied by air must be more than 0 and at most 100%.');
    r.sf = sf; r.share = share;
    r.designGph = r.baseGph * (sf >= 1 ? sf : 1);
    r.airGph = r.designGph * (share > 0 && share <= 100 ? share / 100 : 1);

    // Tanks and water
    const n = plain('tanks');
    if (!(n >= 1 && Math.floor(n) === n)) r.errors.push('Number of tanks must be a whole number, 1 or more.');
    r.n = n >= 1 ? Math.floor(n) : 1;
    r.volL = CalcUnits.base('vol');
    if (!r.volL) r.errors.push('Enter the water volume per tank.');
    r.depth = CalcUnits.base('depth');
    if (!r.depth) r.errors.push('Enter the depth of the air stones below the water surface.');
    else if (r.depth > 10) r.errors.push('Diffuser depth must be 10 m (33 ft) or less.');

    // Water conditions
    const t = CalcUnits.baseSigned('temp');
    const S = plain('sal');
    const h = CalcUnits.baseSigned('elev');
    if (!isFinite(t) || t < 0 || t > 40) r.errors.push('Water temperature must be between 0 and 40 °C (32–104 °F).');
    if (!isFinite(S) || S < 0 || S > 40) r.errors.push('Salinity must be between 0 and 40 ppt.');
    if (!isFinite(h) || h < -500 || h > 6000) r.errors.push('Elevation must be between −500 m and 6,000 m (−1,640 to 19,685 ft).');
    const doT = CalcUnits.baseSigned('dotarget');
    if (!isFinite(doT) || doT < 0) r.errors.push('Enter the dissolved oxygen to maintain (mg/L).');
    r.t = t; r.S = S; r.h = h; r.doT = doT;

    // Diffuser
    const d = diffuser();
    r.tube = d.kind === 'length';
    r.rating = r.tube ? CalcUnits.base('dql') * 60 : CalcUnits.base('dq') * 60; // L/min per unit or per m
    if (!r.rating) r.errors.push(r.tube ? 'Enter the air flow per metre of tube.' : 'Enter the air flow per air stone.');
    const ddrop = CalcUnits.baseSigned('ddrop');
    if (!isFinite(ddrop) || ddrop < 0) r.errors.push('Enter the diffuser pressure drop (0 or more).');
    const line = CalcUnits.baseSigned('line');
    if (!isFinite(line) || line < 0) r.errors.push('Enter the air line allowance (0 or more).');
    const sotePerM = CalcUnits.base('sote');                 // %/m
    if (!sotePerM) r.errors.push('Enter the diffuser’s standard oxygen transfer efficiency (SOTE) per metre.');
    else if (sotePerM > 15) r.errors.push('SOTE above 15% per metre is beyond published values for bubble diffusers. Check the unit.');
    const alpha = plain('alpha');
    if (!(alpha > 0 && alpha <= 1.2)) r.errors.push('Alpha factor must be between 0 and 1.2.');

    r.ok = r.errors.length === 0;
    if (!r.ok) return r;

    r.Pa = A.pressureFromElevation(h);
    r.Patm = r.Pa / A.P_ATM;
    const ff = A.fieldFactor({ alpha: alpha, tC: t, S: S, Patm: r.Patm, doTarget: doT });
    r.csat = ff.csat; r.ff = ff;
    if (ff.factor <= 0) {
      r.errors.push('The DO to maintain (' + fmt(doT, 2) + ' mg/L) is at or above saturation (' + fmt(ff.csat, 2) + ' mg/L) for this water. Air cannot raise DO to saturation; lower the target or use pure oxygen.');
      r.ok = false;
      return r;
    }
    r.soteRaw = sotePerM / 100 * r.depth;
    r.sote = A.soteAtDepth(sotePerM, r.depth);
    if (r.soteRaw > A.SOTE_CAP) r.warns.push('SOTE × depth is ' + fmt(r.soteRaw * 100, 0) + '%; capped at ' + fmt(A.SOTE_CAP * 100, 0) + '% (the per-metre rule does not hold for very deep diffusers).');
    r.fieldOte = r.sote * ff.factor;
    r.o2gPerL = A.o2PerLitreAir(r.Pa, A.AIR_T_STD);
    r.gPerM3 = r.o2gPerL * 1000 * r.fieldOte;                    // g O₂ transferred per m³ of air
    r.airLpm = A.airForOxygen(r.airGph, r.fieldOte, r.o2gPerL);
    r.perTank = r.airLpm / r.n;
    r.unitsPerTank = A.diffuserCount(r.perTank, r.rating);
    r.unitsTotal = r.unitsPerTank * r.n;
    r.perUnit = r.unitsPerTank ? r.perTank / r.unitsPerTank : 0;

    r.rho = A.waterDensity(S);
    r.press = A.requiredPressure({ depthM: r.depth, rho: r.rho, diffuserPa: ddrop, linePa: line });

    // Pump
    const pumpSel = $('pump').value;
    r.pumpSel = pumpSel;
    if (pumpSel === 'custom') {
      const cq = CalcUnits.base('cq') * 60, cpmax = CalcUnits.base('cpmax'), cw = CalcUnits.base('cw');
      if (!cq || !cpmax || !cw) { r.errors.push('Enter the custom pump’s flow, maximum pressure and power.'); r.ok = false; return r; }
      r.pumpName = 'your pump';
      if (r.press.total > cpmax) { r.pump = { ok: false, reason: 'pressure', each: 0, count: 0, watts: 0 }; r.pmax = cpmax; }
      else { const c = Math.max(1, Math.ceil(r.airLpm / cq - 1e-9)); r.pump = { ok: true, each: cq, count: c, watts: c * cw }; r.pmax = cpmax; }
    } else if (pumpSel === 'auto') {
      const b = A.bestPump(r.airLpm, r.press.total);
      if (b) { r.pump = { ok: true, each: b.each, count: b.count, watts: b.watts }; r.pumpId = b.id; r.pumpName = A.PUMPS[b.id].name; r.pmax = A.PUMPS[b.id].pmaxPa; }
      else { r.pump = { ok: false, reason: 'pressure', each: 0, count: 0, watts: 0 }; r.pumpName = 'none of the presets'; }
    } else {
      const P = A.PUMPS[pumpSel];
      r.pumpId = pumpSel; r.pumpName = P.name; r.pmax = P.pmaxPa;
      r.pump = A.pumpsFor(P, r.airLpm, r.press.total);
    }
    r.kwhDay = r.pump.watts * 24 / 1000;

    // Checks
    const volM3 = r.volL / 1000;
    r.airPerM3 = r.perTank / volM3;                              // L/min per m³
    r.density = r.biomass ? r.biomass / (volM3 * r.n) : NaN;
    if (r.share >= 100 && isFinite(r.density) && r.density > AIR_ONLY_DENSITY)
      r.warns.push('At ' + fmt(r.density, 0) + ' kg/m³ you will most likely need pure oxygen: aeration with air alone is usually quoted as good for about ' + AIR_ONLY_DENSITY + ' kg/m³ (rule of thumb). Lower “Share of oxygen supplied by air” to size the air for the rest.');
    if (r.airPerM3 > HIGH_AIR)
      r.warns.push('That is ' + fmt(r.airPerM3, 0) + ' L/min of air per m³ of water, a very turbulent tank (this page flags more than ' + HIGH_AIR + ' L/min per m³; rule of thumb). Air alone is becoming impractical: deeper diffusers, finer bubbles, fewer fish or pure oxygen would help.');
    if (r.depth < 0.3) r.warns.push('Diffusers less than 30 cm (1 ft) deep transfer little oxygen; the bubbles reach the surface too quickly.');
    if (!r.pump.ok) r.warns.push(pumpSel === 'auto'
      ? 'None of the preset pumps can push air to ' + pStr(r.press.total) + '. Use a blower or pump rated for this pressure (choose “Other pump”).'
      : 'The pump cannot supply ' + pStr(r.press.total) + ': its maximum is ' + pStr(r.pmax) + '. Choose a pump with a higher pressure rating, or put the diffusers shallower.');
    else if (r.pmax && r.press.total > 0.85 * r.pmax)
      r.warns.push('The pressure needed is within 15% of the pump’s maximum. Air flow will fall as the stones clog; pick a pump with more pressure in hand.');
    if (r.share < 100) r.warns.push('Air supplies ' + fmt(r.share, 0) + '% of the demand. The other ' + fmt((r.designGph - r.airGph) * 24 / 1000, 3) + ' kg O₂/day must come from pure oxygen or another source.');
    return r;
  }

  // ---------- State ----------
  function syncVisibility() {
    const m = $('method').value;
    document.querySelectorAll('[data-method]').forEach(function (e) { e.hidden = e.dataset.method !== m; });
    const tube = isTube();
    $('f-dq').hidden = tube;
    $('f-dql').hidden = !tube;
    const custom = $('pump').value === 'custom';
    document.querySelectorAll('[data-pump="custom"]').forEach(function (e) { e.hidden = !custom; });
    $('diffuser-hint').textContent = diffuser().basis;
    const p = A.PUMPS[$('pump').value];
    $('pump-hint').textContent = $('pump').value === 'auto'
      ? 'Picks the preset with the lowest total power that can deliver the air at the pressure needed.'
      : p ? p.basis : 'Read the flow at the pressure shown below from your pump’s performance curve.';
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

  function visible(id) { const f = $(id).closest('.field'); return !f.hidden && !(f.parentElement && f.parentElement.hidden); }

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

  function render() {
    syncVisibility();
    const r = compute();
    const notice = $('notice');
    const msgs = r.errors.concat(r.warns);
    notice.innerHTML = '';
    msgs.forEach(function (m, i) {
      if (i) notice.appendChild(document.createElement('br'));
      notice.appendChild(document.createTextNode(m));
    });
    notice.hidden = msgs.length === 0;

    const ids = ['r-air', 'r-air-alt', 'r-demand', 'r-sat', 'r-ote', 'r-o2air', 'r-pertank', 'r-units', 'r-press', 'r-press-parts', 'r-pump', 'r-pcheck', 'r-power', 'r-airvol', 'r-dens'];
    if (!r.ok) {
      ids.forEach(function (id) { setText(id, '–'); });
      setText('viz-caption', 'Enter the inputs to draw the tank');
      drawViz(null);
      CalcShare.writeParams(getState());
      return;
    }
    const unitWord = r.tube ? 'm of tube' : (r.unitsPerTank === 1 ? 'diffuser' : 'diffusers');
    setText('r-air', flowStr(r.airLpm));
    setText('r-air-alt', flowTriple(r.airLpm));
    setText('r-demand', fmt(r.designGph * 24 / 1000, 3) + ' kg/day · ' + fmt(r.designGph, 1) + ' g/h' +
      (r.sf > 1 ? ' (incl. ×' + fmt(r.sf, 2) + ' safety)' : '') + (r.share < 100 ? ' · from air ' + fmt(r.airGph, 1) + ' g/h' : ''));
    setText('r-sat', fmt(r.csat, 2) + ' mg/L (deficit ' + fmt(r.csat - r.doT, 2) + ' mg/L)');
    setText('r-ote', fmt(r.sote * 100, 2) + '% standard → ' + fmt(r.fieldOte * 100, 2) + '% in the tank');
    setText('r-o2air', fmt(r.gPerM3, 2) + ' g O₂ per m³ of air (' + fmt(r.gPerM3 * 28.316846592 / 1000, 3) + ' g per ft³)');
    setText('r-pertank', flowStr(r.perTank) + ' × ' + r.n + (r.n === 1 ? ' tank' : ' tanks'));
    setText('r-units', (r.tube ? fmt(r.unitsPerTank, 0) + ' m of tube per tank (' + fmt(r.unitsTotal, 0) + ' m total)'
      : fmt(r.unitsPerTank, 0) + ' per tank (' + fmt(r.unitsTotal, 0) + ' total)') + ', each at ' + flowStr(r.perUnit) + (r.tube ? ' per m' : ''));
    setText('r-press', pStr(r.press.total));
    const pi = A.pressureIn(r.press.total);
    setText('r-press-parts', 'water ' + pStr(r.press.hydro) + ' + diffuser ' + pStr(r.press.diffuser) + ' + line ' + pStr(r.press.line) +
      '; total ' + fmt(pi.kPa, 2) + ' kPa = ' + fmt(pi.psi, 2) + ' psi = ' + fmt(pi.inH2O, 1) + ' in H₂O = ' + fmt(pi.cmH2O, 0) + ' cm H₂O');
    if (r.pump.ok) {
      setText('r-pump', r.pump.count + ' × ' + r.pumpName + ' (≈ ' + flowStr(r.pump.each) + ' each at this pressure, ' + flowStr(r.pump.each * r.pump.count) + ' total)');
      setText('r-pcheck', 'OK: needs ' + pStr(r.press.total) + ', pump maximum ' + pStr(r.pmax));
      setText('r-power', fmt(r.pump.watts, 0) + ' W · ' + fmt(r.kwhDay, 2) + ' kWh/day');
    } else {
      setText('r-pump', r.pumpSel === 'auto' ? 'No preset pump can reach this pressure' : 'No: ' + r.pumpName + ' cannot reach this pressure');
      setText('r-pcheck', 'Too high: needs ' + pStr(r.press.total) + (r.pmax ? ', pump maximum ' + pStr(r.pmax) : ''));
      setText('r-power', '–');
    }
    const band = r.airPerM3 < MIX_REF ? 'below' : r.airPerM3 <= HIGH_AIR ? 'above' : 'far above';
    setText('r-airvol', fmt(r.airPerM3, 1) + ' L/min per m³ (' + fmt(r.airPerM3 * M3_PER_GAL * 100, 2) + ' L/min per 100 US gal) · ' + band + ' the 20 L/min per m³ wastewater mixing reference');
    setText('r-dens', isFinite(r.density) ? fmt(r.density, 1) + ' kg/m³ · ' + (r.density > AIR_ONLY_DENSITY ? 'above' : 'within') + ' the ≈ 30 kg/m³ air-only rule of thumb' : 'enter biomass to check');

    setText('viz-caption', r.n + (r.n === 1 ? ' tank' : ' tanks') + ' × ' + fmt(r.unitsPerTank, 0) + ' ' + unitWord + ' at ' + inUnitOf('depth', r.depth) +
      ' · ' + flowStr(r.perTank) + ' per tank · pump must supply ' + pStr(r.press.total));
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

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    // Tank
    const TX = 120, TW = 220, TY = 70, TB = 290;
    const wy = 92;                       // water surface
    el('rect', { class: 'tank-glass', x: TX, y: TY, width: TW, height: TB - TY });
    el('rect', { class: 'water', x: TX, y: wy, width: TW, height: TB - wy });
    el('line', { class: 'water-top', x1: TX, y1: wy, x2: TX + TW, y2: wy });
    el('path', { class: 'tank-line', d: 'M' + TX + ',' + TY + ' L' + TX + ',' + TB + ' L' + (TX + TW) + ',' + TB + ' L' + (TX + TW) + ',' + TY });

    // Pump
    el('rect', { class: 'pump-box', x: 14, y: 26, width: 78, height: 40, rx: 6 });
    el('text', { class: 'viz-strong', x: 53, y: 44, 'text-anchor': 'middle' }, 'Air pump');
    el('text', { class: 'dim-text', x: 53, y: 59, 'text-anchor': 'middle' }, r && r.pump.ok ? r.pump.count + ' × ' + fmt(r.pump.watts / r.pump.count, 0) + ' W' : '–');

    // Stones: depth in drawing proportional to the depth (bottom of tank = deepest drawn)
    const maxShow = 7;
    const nShow = r ? Math.max(1, Math.min(maxShow, r.unitsPerTank)) : 3;
    const sy = TB - 14;                  // stones near the floor; the label gives their real depth
    const xs = [];
    for (let i = 0; i < nShow; i++) xs.push(TX + 22 + (TW - 44) * (nShow === 1 ? 0.5 : i / (nShow - 1)));

    // Air line: pump → over rim → down → manifold
    const lineX = TX + 10;
    el('path', { class: 'air-line', d: 'M92,46 L' + lineX + ',46 L' + lineX + ',' + sy + ' L' + xs[xs.length - 1] + ',' + sy });
    el('text', { class: 'air-text', x: 96, y: 40, 'text-anchor': 'start' }, r ? flowStr(r.airLpm) : '');

    // Bubble plumes (deterministic pattern)
    xs.forEach(function (x, i) {
      const top = wy + 6, spread = Math.min(16, (TW - 44) / Math.max(1, nShow - 1) * 0.6 + 6);
      el('path', { class: 'plume', d: 'M' + (x - 4) + ',' + (sy - 4) + ' L' + (x - spread) + ',' + top + ' L' + (x + spread) + ',' + top + ' L' + (x + 4) + ',' + (sy - 4) + 'Z' });
      const step = (sy - wy - 14) / 9;
      for (let k = 0; k < 9; k++) {
        const yy = sy - 10 - k * step - (i % 2) * step / 2;
        const dx = Math.sin((i * 7 + k) * 1.7) * (3 + k * 0.9);
        el('circle', { class: 'bubble', cx: x + dx, cy: yy, r: 1.6 + k * 0.28 });
      }
      el('rect', { class: 'stone', x: x - 8, y: sy - 4, width: 16, height: 8, rx: 3 });
    });
    if (r && r.unitsPerTank > maxShow) el('text', { class: 'dim-text', x: TX + TW / 2, y: TY - 8, 'text-anchor': 'middle' }, r.tube ? '' : 'drawing shows ' + maxShow + ' of ' + r.unitsPerTank);

    // Depth marker
    el('line', { class: 'depth-line', x1: TX + TW + 6, y1: wy, x2: TX + TW + 6, y2: sy });
    el('line', { class: 'depth-line', x1: TX + TW + 1, y1: wy, x2: TX + TW + 11, y2: wy });
    el('line', { class: 'depth-line', x1: TX + TW + 1, y1: sy, x2: TX + TW + 11, y2: sy });
    el('text', { class: 'depth-text', x: TX + TW + 14, y: (wy + sy) / 2 + 4, 'text-anchor': 'start' }, r ? inUnitOf('depth', r.depth) : 'depth');

    // Per-tank label
    el('text', { class: 'dim-text', x: TX + TW / 2, y: TB + 18, 'text-anchor': 'middle' },
      r ? (r.n > 1 ? 'one of ' + r.n + ' tanks · ' : '') + flowStr(r.perTank) + ' per tank' : 'Tank');

    // Pressure stack
    const BX = 410, BW = 22, BT = 80, BB = 290;
    el('text', { class: 'axis-title', x: BX + BW / 2, y: BT - 22, 'text-anchor': 'middle' }, 'Pump');
    el('text', { class: 'axis-title', x: BX + BW / 2, y: BT - 9, 'text-anchor': 'middle' }, 'pressure, ' + CalcUnits.label('pressure', $('outp').value));
    if (r && r.press.total > 0) {
      const total = r.press.total;
      const parts = [['hydro', r.press.hydro, 'p-water', 'water'], ['diffuser', r.press.diffuser, 'p-diff', 'stone'], ['line', r.press.line, 'p-line', 'line']];
      let y = BB;
      const H = BB - BT;
      parts.forEach(function (p) {
        const hh = p[1] / total * H;
        if (hh <= 0) return;
        el('rect', { class: p[2], x: BX, y: y - hh, width: BW, height: hh });
        if (hh >= 14) {
          el('text', { class: 'dim-text', x: BX - 4, y: y - hh / 2 + 4, 'text-anchor': 'end' }, p[3] + ' ' + fmt(CalcUnits.convert('pressure', p[1], 'Pa', $('outp').value), 1));
        }
        y -= hh;
      });
      el('rect', { class: 'gauge-frame', x: BX, y: BT, width: BW, height: H });
      el('text', { class: 'viz-strong', x: BX + BW / 2, y: BB + 18, 'text-anchor': 'middle' }, pStr(total));
    } else {
      el('rect', { class: 'gauge-frame', x: BX, y: BT, width: BW, height: BB - BT });
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Air Pump & Air Stone Sizing (Fish Systems)'];
    lines.push($('method').value === 'feed'
      ? 'Oxygen demand from feed: ' + typed('feed') + '/day × ' + typed('o2feed') + ' kg O₂/kg feed'
      : 'Oxygen demand from biomass: ' + typed('biomass') + ' × ' + typed('o2rate'));
    lines.push('Tanks: ' + typed('tanks') + ' × ' + typed('vol') + ', diffusers at ' + typed('depth') + ' depth');
    lines.push('Water: ' + typed('temp') + ', ' + typed('sal') + ' ppt, elevation ' + typed('elev') + ', keep DO at ' + typed('dotarget'));
    lines.push('Diffuser: ' + diffuser().name + ' — ' + (isTube() ? typed('dql') : typed('dq')) + ', drop ' + typed('ddrop') + ', SOTE ' + typed('sote') +
      '; alpha ' + typed('alpha') + ', safety ×' + typed('sf') + ', air share ' + typed('airshare') + '%, line allowance ' + typed('line'));
    if (r.ok) {
      lines.push('Oxygen demand (design): ' + fmt(r.designGph * 24 / 1000, 3) + ' kg/day (' + fmt(r.designGph, 1) + ' g/h)');
      lines.push('Field oxygen transfer: ' + fmt(r.fieldOte * 100, 2) + '% of the O₂ in the air (' + fmt(r.gPerM3, 2) + ' g O₂ per m³ air)');
      lines.push('Air flow required: ' + flowStr(r.airLpm) + ' (' + flowTriple(r.airLpm) + ')');
      lines.push('Per tank: ' + flowStr(r.perTank) + '; ' + (r.tube ? r.unitsPerTank + ' m of tube' : r.unitsPerTank + ' diffusers') + ' per tank, ' + r.unitsTotal + ' total');
      lines.push('Pressure at pump: ' + pStr(r.press.total) + ' (water ' + pStr(r.press.hydro) + ' + diffuser ' + pStr(r.press.diffuser) + ' + line ' + pStr(r.press.line) + ')');
      lines.push(r.pump.ok ? 'Pump: ' + r.pump.count + ' × ' + r.pumpName + ', ' + fmt(r.pump.watts, 0) + ' W, ' + fmt(r.kwhDay, 2) + ' kWh/day' : 'Pump: none suitable at this pressure');
      lines.push('Air per water volume: ' + fmt(r.airPerM3, 1) + ' L/min per m³');
      r.warns.forEach(function (w) { lines.push('Note: ' + w); });
    } else {
      lines.push(r.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  function fillSelect(sel, order, map) {
    order.forEach(function (id) {
      const o = document.createElement('option');
      o.value = id; o.textContent = map[id].name;
      sel.appendChild(o);
    });
  }
  fillSelect($('diffuser'), A.DIFFUSER_ORDER, A.DIFFUSERS);
  (function () {
    const sel = $('pump');
    const add = function (v, t) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    add('auto', 'Suggest from presets (lowest power)');
    A.PUMP_ORDER.forEach(function (id) { add(id, A.PUMPS[id].name); });
    add('custom', 'Other pump (enter its data)');
  })();

  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  ['method', 'pump', 'outflow', 'outp'].forEach(function (s) { $(s).addEventListener('change', render); });
  $('diffuser').addEventListener('change', function () { syncVisibility(); applyDiffuserPreset(); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Air Pump & Air Stone Sizing (Fish Systems)', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    SELECTS.forEach(function (s) {
      if (p[s] !== undefined && Array.prototype.some.call($(s).options, function (o) { return o.value === p[s]; })) $(s).value = p[s];
    });
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    render();
  })();
})();
