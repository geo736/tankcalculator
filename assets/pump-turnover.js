// Pump & Turnover Calculator: flow from turnover (or turnover from flow), hydraulic and
// electrical power, running cost, live SVG diagram, shareable URL state.
(function () {
  'use strict';

  const RHO = 998.2;      // kg/m³, fresh water at 20 °C (USGS)
  const G = 9.80665;      // m/s², standard gravity (NIST SP 811)
  const DAYS_PER_MONTH = 365.25 / 12;

  const DEFAULTS = {
    mode: 'size', volume: 1000, volume_u: 'L', turnover: 2, pumpflow: 2000, pumpflow_u: 'Lph',
    head: 1.5, head_u: 'm', eff: 25, watts: '', watts_u: 'W', hours: 24, price: 0.15, outflow: 'Lph'
  };
  const FIELDS = ['volume', 'turnover', 'pumpflow', 'head', 'eff', 'watts', 'hours', 'price'];
  const UNIT_FIELDS = ['volume', 'pumpflow', 'head', 'watts'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const outSel = $('outflow');
  const modeButtons = document.querySelectorAll('#mode-group button');
  let mode = 'size';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function fmtFlow(lps, unitId) {
    return fmt(CalcUnits.convert('flow', lps, 'Lps', unitId)) + ' ' + CalcUnits.label('flow', unitId);
  }
  function fmtW(w) {
    return w >= 1000 ? fmt(w / 1000) + ' kW' : fmt(w, w >= 100 ? 0 : w >= 10 ? 1 : 2) + ' W';
  }
  function fmtMinutes(min) {
    if (!isFinite(min)) return '–';
    if (min < 1) return fmt(min * 60, 0) + ' s';
    if (min < 120) return fmt(min, min < 10 ? 1 : 0) + ' min';
    return fmt(min / 60, 1) + ' h';
  }
  function fmtMoney(x) {
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }
  function plain(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }

  // Rule-of-thumb bands; see article table for sources.
  function band(n) {
    if (!(n > 0)) return '–';
    if (n < 1) return 'below 1×/h: slow';
    if (n <= 2) return '1–2×/h: typical aquaponics';
    if (n <= 6) return '2–6×/h: intensive / RAS';
    return 'above 6×/h: very fast';
  }

  // ---------- Calculation (base units: L, L/s, m, W) ----------
  function compute() {
    const V = CalcUnits.base('volume');                 // L
    let N, Q;                                            // per hour, L/s
    if (mode === 'size') {
      N = CalcUnits.base('turnover');
      Q = V * N / 3600;
    } else {
      Q = CalcUnits.base('pumpflow');
      N = V > 0 ? Q * 3600 / V : 0;
    }
    const H = CalcUnits.base('head');                   // m
    const effPct = plain('eff');
    const watts = CalcUnits.base('watts');              // W (0 if empty)
    let hours = plain('hours');
    const price = plain('price');

    const pHyd = RHO * G * (Q / 1000) * H;               // W
    const effOk = effPct > 0 && effPct <= 100;
    let pElec = NaN, elecFrom = '';
    if (watts > 0) { pElec = watts; elecFrom = 'label'; }
    else if (effOk && H > 0) { pElec = pHyd / (effPct / 100); elecFrom = 'eff'; }

    const hoursOk = hours >= 0 && hours <= 24;
    if (!hoursOk) hours = NaN;
    const kWhDay = pElec * hours / 1000;
    const kWhMonth = kWhDay * DAYS_PER_MONTH;
    const priceOk = price >= 0;

    return {
      V: V, N: N, Q: Q, H: H, effPct: effPct, effOk: effOk, watts: watts,
      pHyd: pHyd, pElec: pElec, elecFrom: elecFrom, hours: hours, hoursOk: hoursOk,
      kWhDay: kWhDay, kWhMonth: kWhMonth, price: price, priceOk: priceOk,
      ok: V > 0 && N > 0 && Q > 0
    };
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-mode-for]').forEach(function (el) { el.hidden = el.dataset.modeFor !== m; });
    $('out-row').hidden = m !== 'size';
  }

  function getState() {
    const st = { mode: mode };
    FIELDS.forEach(function (f) {
      if (f === 'turnover' && mode !== 'size') return;
      if (f === 'pumpflow' && mode !== 'check') return;
      st[f] = $(f).value;
      if (UNIT_FIELDS.indexOf(f) !== -1 && $(f).value !== '') st[f + '_u'] = CalcUnits.unit(f);
    });
    if (mode === 'size') st.outflow = outSel.value;
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f], DEFAULTS[f + '_u']); });
    outSel.value = DEFAULTS.outflow;
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const out = outSel.value;
    const notes = [];

    if (!(r.V > 0)) notes.push('Enter the total system water volume.');
    else if (mode === 'size' && !(r.N > 0)) notes.push('Enter how many turnovers per hour you want.');
    else if (mode === 'check' && !(r.Q > 0)) notes.push('Enter the pump flow read from its curve at your head.');
    if (r.ok) {
      if (!(r.H > 0)) notes.push('Enter the total head to estimate power and running cost.');
      else if (!(r.watts > 0) && !r.effOk) notes.push('Pump efficiency must be between 0 and 100%.');
      if (r.watts > 0 && r.H > 0 && r.watts < r.pHyd) notes.push('The pump power you entered is less than the hydraulic power. Check the flow, head and wattage.');
      if (!r.hoursOk) notes.push('Run time must be between 0 and 24 hours per day.');
    }
    const notice = $('notice');
    notice.textContent = notes.join(' ');
    notice.hidden = notes.length === 0;

    const powerOk = r.ok && r.H > 0;
    const elecOk = powerOk && isFinite(r.pElec);
    const energyOk = elecOk && isFinite(r.kWhDay);
    const costOk = energyOk && r.priceOk;
    const turnMin = r.N > 0 ? 60 / r.N : NaN;

    if (mode === 'size') {
      $('r-main-label').textContent = 'Required pump flow at your head';
      $('r-main').textContent = r.ok ? fmtFlow(r.Q, out) : '–';
      $('r-main-sub').textContent = r.ok
        ? 'Pick a pump whose curve gives at least this flow at ' + (r.H > 0 ? typed('head') : 'your total head') + '.'
        : '';
      $('r-second-label').textContent = 'Turnover time';
      $('r-second').textContent = r.ok ? fmtMinutes(turnMin) : '–';
    } else {
      $('r-main-label').textContent = 'Turnover rate with this pump';
      $('r-main').textContent = r.ok ? fmt(r.N, r.N >= 10 ? 1 : 2) + '× per hour' : '–';
      $('r-main-sub').textContent = r.ok ? 'One full turnover every ' + fmtMinutes(turnMin) + '.' : '';
      $('r-second-label').textContent = 'Pump flow';
      $('r-second').textContent = r.ok ? fmtFlow(r.Q, 'Lph') + ' · ' + fmtFlow(r.Q, 'gph') : '–';
    }

    $('r-band').textContent = r.ok ? band(r.N) : '–';
    const altBase = mode === 'size' ? out : 'Lph';
    const alts = ['gph', 'gpm', 'Lph', 'Lpm', 'm3ph'].filter(function (u) { return u !== altBase && !(mode === 'check' && u === 'gph'); }).slice(0, 2);
    $('r-alt').textContent = r.ok ? alts.map(function (u) { return fmtFlow(r.Q, u); }).join(' · ') : '–';
    $('r-hyd').textContent = powerOk ? fmtW(r.pHyd) : '–';
    $('r-elec-label').textContent = r.elecFrom === 'label' ? 'Electrical power (entered)' : 'Electrical power (estimated)';
    $('r-elec').textContent = elecOk
      ? fmtW(r.pElec) + (r.elecFrom === 'eff' ? ' at ' + fmt(r.effPct, 1) + '%' : ' · ' + fmt(r.pHyd / r.pElec * 100, 0) + '% eff.')
      : '–';
    $('r-energy').textContent = energyOk ? fmt(r.kWhDay) + ' kWh/day · ' + fmt(r.kWhMonth) + ' kWh/month' : '–';
    $('r-cost').textContent = costOk ? fmtMoney(r.kWhDay * r.price) + '/day · ' + fmtMoney(r.kWhMonth * r.price) + '/month' : '–';

    $('viz-caption').textContent = r.ok
      ? fmtFlow(r.Q, mode === 'size' ? out : 'Lph') + ' through ' + fmt(CalcUnits.fromBase('volume', r.V)) + ' ' + CalcUnits.unitLabel('volume') +
        ' = ' + fmt(r.N, 2) + ' turnovers per hour' + (r.H > 0 ? ', lifted ' + typed('head') : '')
      : 'Enter volume and flow to draw the system';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined && text !== null) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }
  function animateDash(path, period, dur) {
    if (reduceMotion || !(dur > 0)) return;
    el('animate', { attributeName: 'stroke-dashoffset', from: period, to: 0, dur: dur + 's', repeatCount: 'indefinite' }, null, path);
  }
  function polar(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function wedge(cx, cy, r, a0, a1, cls) {
    if (a1 - a0 >= 359.999) return el('circle', { cx: cx, cy: cy, r: r, class: cls });
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return el('path', { class: cls, d: 'M' + cx + ',' + cy + ' L' + p0[0] + ',' + p0[1] + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + p1[0] + ',' + p1[1] + 'Z' });
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // --- Left: sump/tank, pump, riser to the outlet at height H, return flow ---
    const tankL = 40, tankR = 210, tankT = 228, tankB = 296, waterY = 240;
    const H = r.H;
    const headPx = 50 + 128 * (H / (H + 3));             // schematic, saturating scale
    const yTop = waterY - headPx;
    const riserX = 186, outletX = 140;
    const flowing = r.ok;
    const dashDur = r.N > 0 ? Math.max(0.08, Math.min(6, 0.75 / r.N)) : 0;

    // tank
    el('rect', { class: 'tank-glass', x: tankL, y: tankT, width: tankR - tankL, height: tankB - tankT });
    el('rect', { class: 'water', x: tankL, y: waterY, width: tankR - tankL, height: tankB - waterY });
    el('line', { class: 'water-top', x1: tankL, y1: waterY, x2: tankR, y2: waterY });
    el('path', { class: 'tank-line', d: 'M' + tankL + ',' + tankT + ' L' + tankL + ',' + tankB + ' L' + tankR + ',' + tankB + ' L' + tankR + ',' + tankT });
    label((tankL + 160) / 2, 274, r.V > 0 ? fmt(CalcUnits.fromBase('volume', r.V)) + ' ' + CalcUnits.unitLabel('volume') : 'volume ?', 'middle', 'depth-text');

    // grow bed / filter at the outlet height
    const bedL = 56, bedR = 150, bedT = yTop + 12, bedB = yTop + 36;
    el('rect', { class: 'bed', x: bedL, y: bedT, width: bedR - bedL, height: bedB - bedT, rx: 3 });
    label((bedL + bedR) / 2, bedT + 16, 'beds / filters', 'middle', 'dim-text');

    // riser pipe
    const pipeD = 'M' + riserX + ',' + 276 + ' L' + riserX + ',' + yTop + ' L' + outletX + ',' + yTop + ' L' + outletX + ',' + (bedT + 2);
    el('path', { class: 'pipe', d: pipeD });
    el('path', { class: 'pipe-inner', d: pipeD });
    if (flowing) animateDash(el('path', { class: 'flow-dash', d: pipeD }), 15, dashDur);

    // return flow from bed back to the tank
    const retX = 118;
    if (flowing) animateDash(el('path', { class: 'flow-fall', d: 'M' + retX + ',' + (bedB + 2) + ' L' + retX + ',' + (waterY - 2) }), 10, dashDur);
    else el('path', { class: 'dim', d: 'M' + retX + ',' + (bedB + 2) + ' L' + retX + ',' + (waterY - 2), 'stroke-dasharray': '3 4' });

    // pump
    el('rect', { class: 'pump-body', x: riserX - 14, y: 274, width: 28, height: 18, rx: 4 });
    label(riserX, 288, 'P', 'middle', 'dim-text').setAttribute('style', 'fill:#fff;font-weight:700');

    // head dimension
    const dimX = 30;
    el('path', { class: 'dim', d: 'M' + (dimX - 5) + ',' + waterY + ' L' + (dimX + 5) + ',' + waterY + ' M' + dimX + ',' + waterY + ' L' + dimX + ',' + yTop +
      ' M' + (dimX - 5) + ',' + yTop + ' L' + (dimX + 5) + ',' + yTop });
    el('path', { class: 'depth-line', d: 'M' + (dimX + 6) + ',' + yTop + ' L' + (outletX - 6) + ',' + yTop });
    label(dimX + 6, yTop - 6, 'H ' + (H > 0 ? typed('head') : '?'), 'start', 'depth-text');

    // flow label beside the riser
    if (flowing) {
      const fy = Math.max(yTop + 22, (yTop + waterY) / 2);
      label(riserX + 10, fy, fmtFlow(r.Q, mode === 'size' ? outSel.value : 'Lph'), 'start', 'depth-text');
      label(riserX + 10, fy + 15, '↑ flow', 'start', 'dim-text');
    }

    // --- Right: 60-minute turnover clock ---
    const cx = 384, cy = 150, R = 78;
    el('circle', { class: 'clock-face', cx: cx, cy: cy, r: R });
    const N = r.ok ? r.N : 0;
    if (N > 0 && N < 1) {
      wedge(cx, cy, R, 0, N * 360, 'wedge-a');
    } else if (N >= 1 && N <= 24) {
      const step = 360 / N;
      let a = 0, i = 0;
      while (a < 359.999) {
        const b = Math.min(360, a + step);
        wedge(cx, cy, R, a, b, i % 2 ? 'wedge-b' : 'wedge-a');
        a = b; i++;
      }
    } else if (N > 24) {
      wedge(cx, cy, R, 0, 360, 'wedge-a');
    }
    for (let m = 0; m < 60; m += 5) {
      const p0 = polar(cx, cy, R - (m % 15 === 0 ? 10 : 5), m * 6), p1 = polar(cx, cy, R, m * 6);
      el('line', { class: 'clock-tick', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] });
    }
    el('circle', { cx: cx, cy: cy, r: R, fill: 'none', class: 'tank-line' });
    label(cx, cy - R - 8, '0 / 60 min');
    label(cx + R + 6, cy + 4, '15', 'start');
    label(cx, cy + R + 16, '30');
    label(cx - R - 6, cy + 4, '45', 'end');

    // sweeping hand: one simulated hour every 12 s
    const hand = el('g', {});
    el('line', { class: 'clock-hand', x1: cx, y1: cy, x2: cx, y2: cy - R + 4 }, null, hand);
    if (!reduceMotion && N > 0) {
      el('animateTransform', { attributeName: 'transform', type: 'rotate', from: '0 ' + cx + ' ' + cy, to: '360 ' + cx + ' ' + cy, dur: '12s', repeatCount: 'indefinite' }, null, hand);
    }

    el('circle', { class: 'center-pill', cx: cx, cy: cy, r: 34 });
    label(cx, cy + 4, N > 0 ? fmt(N, N >= 10 ? 0 : N >= 1 ? 1 : 2) + '×' : '–', 'middle', 'big-text');
    label(cx, cy + 20, 'per hour');
    label(cx, cy + R + 36, N > 0 ? 'one turnover every ' + fmtMinutes(60 / N) : 'turnovers per hour', 'middle', 'dim-text');
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Pump & Turnover Calculator', 'System volume: ' + typed('volume')];
    if (mode === 'size') lines.push('Desired turnover: ' + typed('turnover') + ' per hour');
    else lines.push('Pump flow at head: ' + typed('pumpflow'));
    lines.push('Total head: ' + typed('head'));
    if (r.watts > 0) lines.push('Pump power (entered): ' + typed('watts'));
    else lines.push('Pump efficiency: ' + typed('eff') + '%');
    lines.push('Run time: ' + typed('hours') + ' h/day, electricity price ' + typed('price') + ' per kWh');
    lines.push('');
    if (!r.ok) { lines.push('Incomplete inputs.'); }
    else {
      if (mode === 'size') lines.push('Required flow: ' + fmtFlow(r.Q, outSel.value) + ' (' + fmtFlow(r.Q, 'Lph') + ', ' + fmtFlow(r.Q, 'gph') + ')');
      else lines.push('Turnover: ' + fmt(r.N, 2) + ' per hour');
      lines.push('Turnover time: ' + fmtMinutes(60 / r.N) + ' (' + band(r.N) + ', rule of thumb)');
      if (r.H > 0) lines.push('Hydraulic power: ' + fmtW(r.pHyd));
      if (r.H > 0 && isFinite(r.pElec)) lines.push('Electrical power: ' + fmtW(r.pElec) + (r.elecFrom === 'eff' ? ' (estimated)' : ''));
      if (r.H > 0 && isFinite(r.kWhDay)) lines.push('Energy: ' + fmt(r.kWhDay) + ' kWh/day, ' + fmt(r.kWhMonth) + ' kWh/month');
      if (r.H > 0 && isFinite(r.kWhDay) && r.priceOk) lines.push('Running cost: ' + fmtMoney(r.kWhDay * r.price) + '/day, ' + fmtMoney(r.kWhMonth * r.price) + '/month');
      lines.push('Check the pump curve: flow must be met at the total head.');
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.mode === mode) return;
      // Carry the current flow across so the two modes describe the same system.
      const r = compute();
      if (b.dataset.mode === 'check' && r.Q > 0) {
        const pu = outSel.value;
        CalcUnits.set('pumpflow', +CalcUnits.convert('flow', r.Q, 'Lps', pu).toPrecision(4), pu);
      } else if (b.dataset.mode === 'size' && r.N > 0) {
        CalcUnits.set('turnover', +r.N.toPrecision(3));
      }
      setMode(b.dataset.mode);
      render();
    });
  });

  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Pump & Turnover Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    setMode(DEFAULTS.mode);
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && (p[f] === '' || isFinite(parseFloat(p[f])))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.outflow && CalcUnits.unitDef('flow', p.outflow)) outSel.value = p.outflow;
    setMode(p.mode === 'check' ? 'check' : 'size');
    render();
  })();
})();
