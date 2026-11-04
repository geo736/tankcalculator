// Foam Fractionator (Protein Skimmer) Sizing Calculator: contact volume, column diameter/height,
// hydraulic loading, air flow and air pump pressure (via window.Aeration), turnover, ozone;
// live column cross-section; shareable URL state.
(function () {
  'use strict';

  const A = window.Aeration;

  // Hydraulic loading (flow per unit column cross-section = down-flow speed) is not in units.js.
  // Base unit: m³/m²/h (= m/h).
  if (!CalcUnits.GROUPS.hydload) {
    CalcUnits.GROUPS.hydload = {
      base: 'm3m2h',
      units: [
        { id: 'm3m2h', label: 'm³/m²/h', factor: 1 },
        { id: 'm3m2d', label: 'm³/m²/day', factor: 1 / 24 },
        { id: 'Lminm2', label: 'L/min/m²', factor: 0.06 },
        { id: 'cmps', label: 'cm/s', factor: 36 },
        { id: 'gpmft2', label: 'US gpm/ft²', factor: 3.785411784e-3 * 60 / 0.09290304 }
      ]
    };
  }

  // Water-type starting values. Salt contact time: Kovács et al. 2023 (1.8 and 2.2 min in commercial
  // seawater skimmers). Everything else here is a rule of thumb (labelled on the page).
  const TYPES = {
    salt: { S: 35, t: 2, ratio: 0.5, tMin: 1.5,
      tHint: 'Commercial seawater skimmers have been run at 1.8–2.2 min (Kovács et al., 2023). 2 min is used here.',
      rHint: 'Air flow ÷ water flow. 0.5 is a rule-of-thumb starting value for seawater; use the maker’s rating.' },
    fresh: { S: 0, t: 4, ratio: 1.0, tMin: 3,
      tHint: 'Rule of thumb: about twice the seawater time, to make up for weaker foaming in fresh water.',
      rHint: 'Air flow ÷ water flow. 1.0 is a rule-of-thumb value (twice the seawater default); use the maker’s rating.' }
  };
  const RATIO_RANGE = [0.2, 3];      // rule of thumb, warn outside
  const HLR_MAX = 90;                // m/h (2.5 cm/s), rule of thumb
  const PUMP_RESERVE = 0.85;         // use at most 85% of a pump's max pressure when suggesting
  const TSS_PER_FEED = 0.25;         // Timmons & Ebeling design value
  const O3_HIGH = 25;                // g/kg feed, warn above (Summerfelt et al. 2009 used ≈29 for full disinfection)

  const DEFAULTS = {
    sal: [35], vol: [20, 'm3'], feed: [10, 'kg'], turns: [1], sysflow: [40, 'm3ph'], pct: [50],
    flow: [20, 'm3ph'], units: [1], ctime: [2, 'min'], ratio: [0.5], depth: [1.5, 'm'],
    hlr: [45, 'm3m2h'], diam: [0.8, 'm'], riser: [0.5, 'm'], adepth: [1.5, 'm'], ddrop: [2, 'kPa'],
    line: [1, 'kPa'], o3dose: [10]
  };
  const FIELDS = Object.keys(DEFAULTS);
  const MODES = { wtype: 'salt', fmode: 'turns', smode: 'depth', inj: 'diffuser' };
  const SELECT_DEFAULTS = { pump: 'auto', ozone: 'off', outlen: 'm', outvol: 'L', outhlr: 'm3m2h', outp: 'kPa' };
  const SELECTS = Object.keys(SELECT_DEFAULTS);

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const mode = {};

  // Pump select
  (function () {
    const sel = $('pump');
    const add = function (v, t) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    add('auto', 'Suggest from presets (lowest power)');
    A.PUMP_ORDER.forEach(function (id) { add(id, A.PUMPS[id].name); });
  })();

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function raw(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function typed(id) {
    const v = raw(id);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : '–') + (u ? ' ' + u : '');
  }
  function conv(group, v, from, sel) { return fmt(CalcUnits.convert(group, v, from, $(sel).value)) + ' ' + CalcUnits.label(group, $(sel).value); }
  function len(m) { return conv('length', m, 'm', 'outlen'); }
  function lenUp(m) {
    const u = $('outlen').value;
    const v = CalcUnits.convert('length', m, 'm', u);
    const step = { mm: 10, cm: 1, m: 0.01, in: 0.5, ft: 0.05, yd: 0.02 }[u] || 0.01;
    return fmt(Math.ceil(v / step - 1e-9) * step, 2) + ' ' + CalcUnits.label('length', u);
  }
  function vol(L) { return conv('volume', L, 'L', 'outvol'); }
  function hl(mh) { return conv('hydload', mh, 'm3m2h', 'outhlr'); }
  function pa(p) { return conv('pressure', p, 'Pa', 'outp'); }
  function wflow(Lps) {
    // water flow in the unit chosen for whichever flow input is active
    const id = mode.fmode === 'pct' ? 'sysflow' : 'flow';
    const u = CalcUnits.unit(id) || 'm3ph';
    return fmt(CalcUnits.convert('flow', Lps, 'Lps', u)) + ' ' + CalcUnits.label('flow', u);
  }
  function air3(Lps) {
    return fmt(Lps * 60) + ' L/min · ' + fmt(CalcUnits.convert('airflow', Lps, 'Lps', 'cfm')) + ' CFM · ' + fmt(Lps * 3.6) + ' m³/h';
  }
  function timeTxt(s) {
    if (!isFinite(s)) return '–';
    return s < 120 ? fmt(s, 0) + ' s' : s < 7200 ? fmt(s / 60, 2) + ' min' : fmt(s / 3600, 2) + ' h';
  }

  // ---------- Calculation (base units: L, L/s, s, m, Pa, kg) ----------
  function compute() {
    const r = { errors: [], warns: [] };
    r.type = TYPES[mode.wtype];
    r.Vsys = CalcUnits.base('vol');
    r.feed = CalcUnits.base('feed');
    const S = raw('sal');
    r.S = isFinite(S) && S >= 0 ? S : NaN;
    if (!isFinite(r.S)) r.errors.push('Enter the salinity (0 for fresh water).');
    r.rho = A.waterDensity(isFinite(r.S) ? Math.min(r.S, 60) : 0);

    if (mode.fmode === 'turns') {
      const n = CalcUnits.base('turns');
      r.Q = r.Vsys * n / 3600;
      if (!(r.Vsys > 0 && n > 0)) r.errors.push('Enter the system volume and how many times per hour it should pass through the fractionator.');
    } else if (mode.fmode === 'pct') {
      const pct = raw('pct');
      r.Q = CalcUnits.base('sysflow') * (pct > 0 ? Math.min(pct, 100) : 0) / 100;
      if (!(CalcUnits.base('sysflow') > 0)) r.errors.push('Enter the main system flow.');
      else if (!(pct > 0 && pct <= 100)) r.errors.push('The share sent to the skimmer must be between 0 and 100%.');
    } else {
      r.Q = CalcUnits.base('flow');
      if (!(r.Q > 0)) r.errors.push('Enter the water flow through the fractionator.');
    }

    const nu = raw('units');
    r.N = Math.floor(nu);
    if (!(nu >= 1) || r.N > 1000) r.errors.push('Number of fractionators must be a whole number from 1 to 1000.');
    else if (nu !== r.N) r.warns.push('Number of fractionators rounded down to ' + r.N + '.');

    r.t = CalcUnits.base('ctime');
    r.ratio = CalcUnits.base('ratio');
    r.riser = CalcUnits.base('riser');
    if (mode.smode !== 'check' && !(r.t > 0)) r.errors.push('Enter the contact time.');
    if (!(r.ratio > 0)) r.errors.push('Enter the air-to-water ratio.');

    if (mode.smode === 'depth') {
      r.H = CalcUnits.base('depth');
      if (!(r.H > 0)) r.errors.push('Enter the column water depth.');
    } else if (mode.smode === 'hlr') {
      r.hlr = CalcUnits.base('hlr');
      if (!(r.hlr > 0)) r.errors.push('Enter the hydraulic loading.');
    } else {
      r.D = CalcUnits.base('diam');
      r.H = CalcUnits.base('depth');
      if (!(r.D > 0 && r.H > 0)) r.errors.push('Enter the column inside diameter and water depth to check it.');
    }

    if (mode.inj === 'diffuser') {
      r.adepth = CalcUnits.base('adepth');
      if (!(r.adepth > 0)) r.errors.push('Enter the depth of the air stones / diffuser below the water surface.');
    }
    r.ozone = $('ozone').value === 'on';
    r.dose = r.ozone ? CalcUnits.base('o3dose') : 0;
    if (r.ozone && !(r.dose > 0)) r.errors.push('Enter the ozone dose, or choose “No ozone”.');

    if (r.errors.length) return r;

    // Water and column
    r.Qu = r.Q / r.N;                              // L/s per unit
    const Qum3h = r.Qu * 3.6;
    if (mode.smode === 'depth') {
      r.V = r.Qu * r.t / 1000;                    // m³
      r.A = r.V / r.H;
      r.hlr = r.H / r.t * 3600;                   // m/h
      r.tAct = r.t;
    } else if (mode.smode === 'hlr') {
      r.A = Qum3h / r.hlr;
      r.H = r.hlr * r.t / 3600;
      r.V = r.A * r.H;
      r.tAct = r.t;
    } else {
      r.A = Math.PI * r.D * r.D / 4;
      r.V = r.A * r.H;
      r.tAct = r.V * 1000 / r.Qu;
      r.hlr = Qum3h / r.A;
    }
    if (mode.smode !== 'check') r.D = Math.sqrt(4 * r.A / Math.PI);
    r.Htot = r.H + r.riser;
    r.slender = r.H / r.D;

    // Air
    r.airLps = r.ratio * r.Q;
    r.airUnitLps = r.airLps / r.N;
    r.airLpm = r.airLps * 60;
    if (mode.inj === 'diffuser') {
      r.press = A.requiredPressure({ depthM: r.adepth, rho: r.rho, diffuserPa: CalcUnits.base('ddrop'), linePa: CalcUnits.base('line') });
      const sel = $('pump').value;
      if (sel === 'auto') {
        let best = null;
        A.PUMP_ORDER.forEach(function (id) {
          const P = A.PUMPS[id];
          if (r.press.total > PUMP_RESERVE * P.pmaxPa) return;
          const p = A.pumpsFor(P, r.airLpm, r.press.total);
          if (p.ok && (!best || p.watts < best.watts - 1e-9)) best = { id: id, each: p.each, count: p.count, watts: p.watts, ok: true };
        });
        if (!best) {
          const b = A.bestPump(r.airLpm, r.press.total);
          if (b) best = { id: b.id, each: b.each, count: b.count, watts: b.watts, ok: true, tight: true };
        }
        r.pump = best || { ok: false };
      } else {
        const P = A.PUMPS[sel];
        const p = A.pumpsFor(P, r.airLpm, r.press.total);
        r.pump = { id: sel, each: p.each, count: p.count, watts: p.watts, ok: p.ok };
      }
      if (r.pump.id) {
        r.pmax = A.PUMPS[r.pump.id].pmaxPa;
        r.pumpName = A.PUMPS[r.pump.id].name;
      }
    }

    // Turnover, solids, ozone
    r.passesDay = r.Vsys > 0 ? r.Q * 86400 / r.Vsys : NaN;
    r.tss = TSS_PER_FEED * r.feed;
    r.o3gh = r.dose * r.feed / 24;
    r.o3mgL = r.Q > 0 ? r.o3gh / (r.Q * 3.6) : NaN;

    // Warnings
    const lowSal = r.S < 10;
    if (lowSal) r.warns.push('Fresh / low-salinity water (' + fmt(r.S, 1) + ' ppt): foam fractionation works much less well than in seawater because bubbles merge and the foam is weaker. Expect less foam and lower removal; compensate with a longer contact time, more air and ozone (see the article).');
    else if (r.S < 25) r.warns.push('Brackish water (' + fmt(r.S, 1) + ' ppt): foaming is between fresh-water and seawater behaviour. Jafari et al. (2022) roughly doubled fresh-water particle removal at 10 ppt.');
    if (r.S > 45) r.warns.push('Salinity of ' + fmt(r.S, 1) + ' ppt is above normal seawater (about 35 ppt); check the value. Water density is capped at 60 ppt.');
    if (mode.wtype === 'salt' && lowSal) r.warns.push('Water type is “Salt water” but the salinity is under 10 ppt; consider the fresh-water settings.');
    if (mode.wtype === 'fresh' && r.S >= 25) r.warns.push('Water type is “Fresh / brackish” but the salinity is seawater-like.');
    const tMin = lowSal ? TYPES.fresh.tMin : TYPES.salt.tMin;
    if (r.tAct < tMin) r.warns.push('Contact time of ' + timeTxt(r.tAct) + ' is short for ' + (lowSal ? 'fresh' : 'salt') + ' water (this page warns below ' + tMin + ' min, a rule of thumb).');
    if (mode.smode === 'check' && r.t > 0) {
      if (r.tAct < r.t) r.warns.push('This column gives ' + timeTxt(r.tAct) + ' of contact, less than the ' + timeTxt(r.t) + ' you set. It needs ' + vol(r.Qu * r.t) + ' of water per unit.');
    }
    if (r.ratio < RATIO_RANGE[0] || r.ratio > RATIO_RANGE[1]) r.warns.push('Air-to-water ratio ' + fmt(r.ratio) + ' is outside the 0.2–3 range this page treats as typical (rule of thumb). Check the maker’s rating; too much air makes bubbles merge (Barrut et al., 2013).');
    if (r.hlr > HLR_MAX) r.warns.push('Down-flow of ' + hl(r.hlr) + ' (' + fmt(r.hlr / 36, 2) + ' cm/s) is fast: fine bubbles may be dragged down to the outlet. This page warns above 90 m/h (2.5 cm/s), a rule of thumb. Use a wider column or more units.');
    if (r.H < 0.5) r.warns.push('Water depth of ' + len(r.H) + ' is shallow; bubbles have little time to collect material. Most columns are deeper (rule of thumb).');
    if (r.slender < 1) r.warns.push('The column is wider than it is deep (depth ÷ diameter = ' + fmt(r.slender, 2) + '). Tall, slender columns give the bubbles a longer path; consider more units or more depth.');
    if (r.H > 6) r.warns.push('Water depth over 6 m is unusual for a fractionator; check the design.');
    if (mode.inj === 'diffuser') {
      if (r.adepth > r.H * 1.001) r.warns.push('The diffuser depth (' + len(r.adepth) + ') is deeper than the column water depth (' + len(r.H) + ').');
      if (!r.pump.ok) r.warns.push('No preset pump can supply ' + pa(r.press.total) + '. Use a blower or pump rated for this pressure, or a venturi injector.');
      else if (r.pump.tight || r.press.total > PUMP_RESERVE * r.pmax) r.warns.push('The pressure needed is within 15% of the pump’s maximum. Air flow will fall as the stones clog; pick a pump with more pressure in hand.');
    }
    if (r.ozone) {
      if (!(r.feed > 0)) r.warns.push('Enter the daily feed to size the ozone generator (dose is per kg of feed).');
      if (r.dose > O3_HIGH) r.warns.push('An ozone dose above 25 g/kg feed is high. Summerfelt et al. (2009) needed about 29 g/kg for full-flow disinfection under ORP control. Residual ozone is toxic to fish.');
      if (!lowSal) r.warns.push('In seawater ozone forms bromine-based oxidants that are also toxic; control by ORP and keep oxidants out of the fish tanks.');
    }
    return r;
  }

  // ---------- UI state ----------
  function setMode(name, value) {
    mode[name] = value;
    document.querySelectorAll('#' + name + '-group button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset[name] === value));
    });
    syncVisibility();
  }
  function syncVisibility() {
    ['fmode', 'smode', 'inj'].forEach(function (name) {
      document.querySelectorAll('[data-' + name + '-for]').forEach(function (el) {
        el.hidden = el.getAttribute('data-' + name + '-for').split(' ').indexOf(mode[name]) === -1;
      });
    });
    document.querySelectorAll('[data-ozone-for]').forEach(function (el) { el.hidden = $('ozone').value !== 'on'; });
    const p = A.PUMPS[$('pump').value];
    $('pump-hint').textContent = $('pump').value === 'auto'
      ? 'Picks the preset with the lowest total power that gives the air at the pressure needed, keeping 15% of the pump’s maximum pressure in reserve.'
      : p ? p.basis : '';
    const T = TYPES[mode.wtype];
    $('ctime-hint').textContent = T.tHint;
    $('ratio-hint').textContent = T.rHint;
  }
  function loadType(id) {
    const T = TYPES[id];
    $('sal').value = T.S;
    $('ctime').value = +CalcUnits.convert('time', T.t * 60, 's', CalcUnits.unit('ctime')).toPrecision(6);
    $('ratio').value = T.ratio;
  }

  function visible(id) {
    const f = $(id).closest('.field');
    return !(f && f.hidden);
  }
  function getState() {
    const st = {};
    Object.keys(MODES).forEach(function (m) { st[m] = mode[m]; });
    SELECTS.forEach(function (s) { if (visible(s)) st[s] = $(s).value; });
    FIELDS.forEach(function (f) {
      if (!visible(f)) return;
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }
  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    SELECTS.forEach(function (s) { $(s).value = SELECT_DEFAULTS[s]; });
    Object.keys(MODES).forEach(function (m) { mode[m] = MODES[m]; });
    Object.keys(MODES).forEach(function (m) { setMode(m, MODES[m]); });
  }

  // ---------- Render ----------
  const RESULT_IDS = ['r-qunit', 'r-diam', 'r-height', 'r-ctime', 'r-hlr', 'r-air', 'r-airunit', 'r-press', 'r-pump', 'r-turn', 'r-tss', 'r-o3'];
  function setText(id, t, cls) { const e = $(id); e.textContent = t; e.className = 'v' + (cls ? ' ' + cls : ''); }

  function render() {
    syncVisibility();
    const r = compute();
    const notice = $('notice');
    const check = mode.smode === 'check';
    $('r-main-label').textContent = check ? 'Contact time in this column' : 'Column water volume needed' + (r.N > 1 ? ' (each)' : '');

    if (r.errors.length) {
      notice.textContent = r.errors[0];
      notice.hidden = false;
      $('r-main').textContent = '–';
      $('r-main-sub').textContent = '';
      RESULT_IDS.forEach(function (id) { setText(id, '–'); });
      $('viz-caption').textContent = 'Enter the inputs to draw the column';
      drawViz(null);
      CalcShare.writeParams(getState());
      return;
    }

    notice.textContent = r.warns.join(' ');
    notice.hidden = r.warns.length === 0;

    if (check) {
      $('r-main').textContent = timeTxt(r.tAct);
      $('r-main-sub').textContent = r.t > 0
        ? (r.tAct >= r.t ? 'Meets the ' + timeTxt(r.t) + ' target' : 'Below the ' + timeTxt(r.t) + ' target') + ' · column holds ' + vol(r.V * 1000) + ' of water'
        : 'Column holds ' + vol(r.V * 1000) + ' of water';
    } else {
      $('r-main').textContent = vol(r.V * 1000);
      $('r-main-sub').textContent = 'for ' + timeTxt(r.t) + ' of contact at ' + wflow(r.Qu) + (r.N > 1 ? ' per unit, ' + r.N + ' units' : '');
    }

    setText('r-qunit', wflow(r.Qu) + (r.N > 1 ? ' × ' + r.N + ' units (' + wflow(r.Q) + ' total)' : ''));
    setText('r-diam', check ? len(r.D) + ' (cross-section ' + fmt(r.A, 3) + ' m²)' : len(r.D) + ' → build ' + lenUp(r.D) + ' (cross-section ' + fmt(r.A, 3) + ' m²)');
    setText('r-height', len(r.H) + ' water · ' + len(r.Htot) + ' total');
    setText('r-ctime', timeTxt(r.tAct) + (check && r.t > 0 ? ' (target ' + timeTxt(r.t) + ')' : ''), check && r.t > 0 ? (r.tAct >= r.t ? 'verdict-ok' : 'verdict-bad') : '');
    setText('r-hlr', hl(r.hlr) + ' = ' + fmt(r.hlr / 36, 2) + ' cm/s down', r.hlr > HLR_MAX ? 'verdict-bad' : '');
    setText('r-air', air3(r.airLps) + ' (' + fmt(r.ratio) + ' : 1)');
    setText('r-airunit', r.N > 1 ? air3(r.airUnitLps) : 'Same (1 unit)');
    if (mode.inj === 'diffuser') {
      setText('r-press', pa(r.press.total) + ' = water ' + pa(r.press.hydro) + ' + diffuser ' + pa(r.press.diffuser) + ' + line ' + pa(r.press.line));
      if (r.pump.ok) {
        setText('r-pump', r.pump.count + ' × ' + r.pumpName + ': ≈ ' + fmt(r.pump.each, 1) + ' L/min each at this pressure, ' + fmt(r.pump.watts, 0) + ' W total (max ' + pa(r.pmax) + ')',
          r.press.total > PUMP_RESERVE * r.pmax ? 'verdict-bad' : 'verdict-ok');
      } else {
        setText('r-pump', $('pump').value === 'auto' ? 'No preset pump reaches ' + pa(r.press.total) : 'This pump cannot reach ' + pa(r.press.total), 'verdict-bad');
      }
    } else {
      setText('r-press', 'Not needed: the venturi / injector draws its own air');
      setText('r-pump', 'Size the injector pump from its air-draw curve: ' + fmt(r.airUnitLps * 60) + ' L/min of air per unit');
    }
    setText('r-turn', isFinite(r.passesDay) ? fmt(r.passesDay, 1) + ' passes per day (once every ' + timeTxt(86400 / r.passesDay) + ')' : 'Enter the system volume');
    setText('r-tss', r.feed > 0 ? fmt(r.tss) + ' kg/day dry solids (0.25 × feed)' : 'Enter the daily feed');
    if (r.ozone) {
      setText('r-o3', r.feed > 0 ? fmt(r.o3gh) + ' g O₃/h (' + fmt(r.o3gh * 24) + ' g/day) ≈ ' + fmt(r.o3mgL, 3) + ' mg/L of skimmer flow' : 'Enter the daily feed');
    } else {
      setText('r-o3', 'No ozone selected');
    }

    drawViz(r);
    $('viz-caption').textContent = (r.N > 1 ? 'One of ' + r.N + ' columns' : 'Column') + ': D ' + len(r.D) + ', water ' + len(r.H) + ', ' +
      timeTxt(r.tAct) + ' contact, air ' + fmt(r.airUnitLps * 60) + ' L/min' + (r.notToScale ? ' · proportions clamped, not to scale' : '');
    CalcShare.writeParams(getState());
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
  function label(x, y, text, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }
  function arrowHead(x, y, dir, cls) {
    // small triangle pointing in dir: 'left' | 'right' | 'up' | 'down'
    const s = 6;
    const pts = {
      left: [[x, y], [x + s, y - s * 0.7], [x + s, y + s * 0.7]],
      right: [[x, y], [x - s, y - s * 0.7], [x - s, y + s * 0.7]],
      up: [[x, y], [x - s * 0.7, y + s], [x + s * 0.7, y + s]],
      down: [[x, y], [x - s * 0.7, y - s], [x + s * 0.7, y - s]]
    }[dir];
    el('polygon', { class: cls || 'arrow-head', points: pts.map(function (p) { return p.join(','); }).join(' ') });
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ok = !!r;
    const D = ok ? r.D : 0.75, H = ok ? r.H : 1.5, R = ok ? r.riser : 0.5;
    const yBottom = 236, maxH = 196, maxW = 104, minW = 34;
    let s = Math.min(maxH / (H + R), maxW / D);
    let w = D * s, hBody = H * s, hRiser = R * s;
    let clamped = false;
    if (w < minW) { w = minW; clamped = true; }
    if (hBody < 40) { hBody = 40; clamped = true; }
    if (hBody + hRiser > maxH) { hRiser = Math.max(18, maxH - hBody); hBody = Math.min(hBody, maxH - hRiser); clamped = true; }
    if (hRiser < 18) { hRiser = 18; hBody = Math.min(hBody, maxH - hRiser); clamped = true; }
    if (ok) r.notToScale = clamped;
    const cx = 104, xL = cx - w / 2, xR = cx + w / 2;
    const yTop = yBottom - hBody;          // water surface
    const neckW = Math.max(16, w * 0.38);
    const nL = cx - neckW / 2, nR = cx + neckW / 2;
    const yNeckTop = yTop - hRiser;
    const cupW = Math.min(w * 0.95, neckW + 40);
    const cL = cx - cupW / 2, cR = cx + cupW / 2;
    const yCupBot = yNeckTop + Math.min(26, hRiser * 0.7);

    // column body (water) and riser glass
    el('rect', { class: 'tank-glass', x: nL, y: yNeckTop, width: neckW, height: hRiser });
    el('rect', { class: 'water', x: xL, y: yTop, width: w, height: hBody });
    el('line', { class: 'water-top', x1: xL, y1: yTop, x2: xR, y2: yTop });

    // foam: head on the water and up the riser
    const rand = rng(7);
    el('rect', { class: 'foam-bg', x: nL, y: yNeckTop, width: neckW, height: hRiser });
    for (let y = yTop - 3; y > yNeckTop + 2; y -= 6) {
      for (let x = nL + 4; x < nR - 2; x += 6) el('circle', { class: 'foam', cx: x + (rand() - 0.5) * 2, cy: y + (rand() - 0.5) * 2, r: 2.6 });
    }
    // foam spilling into cup
    for (let i = 0; i < 6; i++) el('circle', { class: 'foam', cx: nL - 4 - (i % 3) * 5, cy: yNeckTop + 4 + Math.floor(i / 3) * 6, r: 2.4 });
    for (let i = 0; i < 6; i++) el('circle', { class: 'foam', cx: nR + 4 + (i % 3) * 5, cy: yNeckTop + 4 + Math.floor(i / 3) * 6, r: 2.4 });

    // bubbles rising in the water
    const nb = ok ? Math.max(8, Math.min(70, Math.round(14 + 28 * r.ratio * (w / 80)))) : 20;
    const yDiff = ok && mode.inj === 'diffuser' ? Math.min(yBottom - 8, yTop + Math.min(r.adepth, r.H) * (hBody / r.H)) : yBottom - 22;
    for (let i = 0; i < nb; i++) {
      const by = yTop + 6 + rand() * Math.max(4, yDiff - yTop - 10);
      const bx = xL + 6 + rand() * (w - 12);
      el('circle', { class: 'bubble', cx: bx, cy: by, r: 1.5 + rand() * 2.2 });
    }

    // column outline: body, shoulder into neck, neck
    el('path', { class: 'tank-line', d: 'M' + nL + ',' + yNeckTop + ' V' + yTop + ' H' + xL + ' V' + yBottom + ' H' + xR + ' V' + yTop + ' H' + nR + ' V' + yNeckTop });
    // collection cup (U around the neck top) and lid
    el('path', { class: 'tank-line', d: 'M' + cL + ',' + (yNeckTop - 8) + ' V' + yCupBot + ' H' + cR + ' V' + (yNeckTop - 8) });
    el('line', { class: 'tank-line', x1: cL - 3, y1: yNeckTop - 12, x2: cR + 3, y2: yNeckTop - 12 });

    // pipes on the right: water in (near top), water out (bottom), foamate (cup)
    const xP = Math.max(xR, cR) + 34;
    const yIn = yTop + Math.min(22, hBody * 0.15);
    el('path', { class: 'pipe', d: 'M' + xP + ',' + yIn + ' H' + (xR + 7) });
    arrowHead(xR + 1, yIn, 'left');
    el('path', { class: 'pipe', d: 'M' + (cx + w * 0.25) + ',' + yBottom + ' V' + (yBottom + 8) + ' H' + (xP - 6) });
    arrowHead(xP, yBottom + 8, 'right');
    el('path', { class: 'pipe', d: 'M' + cR + ',' + (yCupBot - 4) + ' H' + (xP - 6) });
    arrowHead(xP, yCupBot - 4, 'right', 'air-head');
    // down-flow arrow inside the water
    el('line', { class: 'flow-arrow', x1: xR - 10, y1: yIn + 10, x2: xR - 10, y2: yBottom - 14 });
    arrowHead(xR - 10, yBottom - 8, 'down');

    // air
    if (!ok || mode.inj === 'diffuser') {
      el('rect', { class: 'diffuser', x: xL + w * 0.2, y: yDiff - 2, width: w * 0.6, height: 5, rx: 2 });
      el('path', { class: 'air-line', d: 'M14,' + (yBottom + 22) + ' H' + (xL - 10) + ' V' + yDiff + ' H' + (xL + w * 0.2) });
      label(14, yBottom + 38, 'air in', 'start', 'accent-text');
    } else {
      // venturi: pump loop from bottom to an injector on the left wall
      const yInj = yBottom - Math.min(40, hBody * 0.3);
      el('path', { class: 'pipe', d: 'M' + (cx - w * 0.25) + ',' + yBottom + ' V' + (yBottom + 14) + ' H' + (xL - 22) + ' V' + yInj + ' H' + xL });
      el('rect', { class: 'diffuser', x: xL - 28, y: yInj - 6, width: 12, height: 12, rx: 3 });
      el('path', { class: 'air-line', d: 'M8,' + (yInj - 22) + ' H' + (xL - 22) + ' V' + (yInj - 6) });
      label(8, yInj - 28, 'air → venturi', 'start', 'accent-text');
    }

    // dimensions: D under the column, H on the left
    const yD = yBottom + 22;
    el('path', { class: 'dim', d: 'M' + xL + ',' + (yD + 6) + ' H' + xR + ' M' + xL + ',' + (yD + 1) + ' v10 M' + xR + ',' + (yD + 1) + ' v10' });
    label(cx, yD + 24, ok ? 'D ' + len(r.D) : 'D –', 'middle', 'viz-strong');
    const xH = xL - 4 - (mode.inj === 'diffuser' || !ok ? 14 : 30);
    el('path', { class: 'dim', d: 'M' + xH + ',' + yTop + ' V' + yBottom + ' M' + (xH - 4) + ',' + yTop + ' h8 M' + (xH - 4) + ',' + yBottom + ' h8' });
    el('text', { class: 'depth-text', x: xH - 6, y: (yTop + yBottom) / 2, 'text-anchor': 'middle', transform: 'rotate(-90 ' + (xH - 6) + ' ' + ((yTop + yBottom) / 2) + ')' },
      ok ? 'H ' + len(r.H) : 'H –');

    // right-hand panel
    const px = Math.max(xP + 8, 226);
    label(xP + 4, yIn + 4, 'in', 'start', 'depth-text');
    label(xP + 4, yBottom + 12, 'out', 'start', 'depth-text');
    label(xP + 4, yCupBot, 'foamate', 'start', 'accent-text');
    const lines = [];
    if (ok) {
      lines.push(['Water ' + wflow(r.Qu), 'viz-strong']);
      lines.push(['Contact time ' + timeTxt(r.tAct), r.t > 0 && r.tAct < r.t ? 'warn-text' : 'viz-strong']);
      lines.push(['Volume ' + vol(r.V * 1000), 'dim-text']);
      lines.push(['Down-flow ' + fmt(r.hlr, 1) + ' m/h', r.hlr > HLR_MAX ? 'warn-text' : 'dim-text']);
      lines.push(['Air ' + fmt(r.airUnitLps * 60) + ' L/min (' + fmt(r.ratio) + ':1)', 'accent-text']);
      lines.push([mode.inj === 'diffuser' ? 'Air pressure ' + pa(r.press.total) : 'Venturi draws the air', 'dim-text']);
      lines.push(['Total height ' + len(r.Htot), 'dim-text']);
      if (r.N > 1) lines.push(['1 of ' + r.N + ' units', 'dim-text']);
      if (r.ozone && r.feed > 0) lines.push(['Ozone ' + fmt(r.o3gh / r.N) + ' g/h', 'dim-text']);
    } else {
      lines.push(['Enter the inputs', 'dim-text']);
    }
    let y = 30;
    const panelX = Math.max(px, xP + 52);
    lines.forEach(function (l) { label(panelX, y, l[0], 'start', l[1]); y += 19; });
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const L = ['Foam Fractionator (Protein Skimmer) Sizing Calculator'];
    L.push('Water: ' + (mode.wtype === 'salt' ? 'salt water' : 'fresh / brackish') + ', ' + typed('sal') + ' ppt; system ' + typed('vol') + ', feed ' + typed('feed') + '/day');
    L.push('Flow: ' + (mode.fmode === 'turns' ? typed('turns') + ' system volumes per hour' : mode.fmode === 'pct' ? typed('pct') + '% of ' + typed('sysflow') : typed('flow')) + ', ' + typed('units') + ' unit(s)');
    L.push('Contact time ' + typed('ctime') + ', air-to-water ratio ' + typed('ratio') + ' (rule of thumb unless from the maker)');
    L.push('Column: ' + (mode.smode === 'depth' ? 'water depth ' + typed('depth') : mode.smode === 'hlr' ? 'hydraulic loading ' + typed('hlr') : 'check D ' + typed('diam') + ' × water depth ' + typed('depth')) + ', riser/cup ' + typed('riser'));
    L.push('Air: ' + (mode.inj === 'diffuser' ? 'diffuser at ' + typed('adepth') + ', drop ' + typed('ddrop') + ', line ' + typed('line') : 'venturi / injector pump') + (r.ozone ? '; ozone ' + typed('o3dose') + ' g O₃/kg feed' : ''));
    L.push('');
    if (r.errors.length) {
      L.push(r.errors.join(' '));
    } else {
      L.push($('r-main-label').textContent + ': ' + $('r-main').textContent + ' (' + $('r-main-sub').textContent + ')');
      const items = document.querySelectorAll('.result-list li');
      items.forEach(function (li) { L.push(li.children[0].textContent + ': ' + li.children[1].textContent); });
      r.warns.forEach(function (w) { L.push('Note: ' + w); });
    }
    L.push('Use manufacturer data for final selection.');
    L.push(CalcShare.buildUrl(getState()));
    return L.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  ['pump', 'ozone'].forEach(function (s) { $(s).addEventListener('change', render); });
  Object.keys(MODES).forEach(function (m) {
    document.querySelectorAll('#' + m + '-group button').forEach(function (b) {
      b.addEventListener('click', function () {
        const v = b.dataset[m];
        if (m === 'wtype' && v !== mode.wtype) { setMode(m, v); loadType(v); }
        else setMode(m, v);
        render();
      });
    });
  });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Foam Fractionator (Protein Skimmer) Sizing Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    Object.keys(MODES).forEach(function (m) {
      if (p[m] && document.querySelector('#' + m + '-group button[data-' + m + '="' + p[m] + '"]')) setMode(m, p[m]);
    });
    // a fresh-water link without explicit values still gets fresh-water starting values
    if (mode.wtype !== 'salt') loadType(mode.wtype);
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
