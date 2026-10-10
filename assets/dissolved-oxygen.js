// Dissolved Oxygen Calculator: Benson & Krause (1980, 1984) oxygen solubility as used by
// USGS (OWQ Tech. Memo 2011.03 / DOTABLES), percent saturation, deficit, live SVG chart + gauge.
(function () {
  'use strict';

  // Extra pressure units used only on this page (atm and hPa/mbar are common for barometers).
  (function addPressureUnits() {
    const g = CalcUnits.group('pressure');
    if (!CalcUnits.unitDef('pressure', 'atm')) g.units.push({ id: 'atm', label: 'atm', factor: 101325 });
    if (!CalcUnits.unitDef('pressure', 'hPa')) g.units.push({ id: 'hPa', label: 'hPa (mbar)', factor: 100 });
  })();

  const ATM_PA = 101325;
  const MMHG_PA = 133.322387415;

  const DEFAULTS = { temp: 25, sal: 0, elev: 0, baro: 760, meas: 6.5 };
  const DEFAULT_UNITS = { temp: 'C', elev: 'm', baro: 'mmHg', meas: 'mgL' };
  const FIELDS = ['temp', 'sal', 'elev', 'baro', 'meas'];

  // DO guidance in mg/L: below `low` = danger, between = marginal, at/above `ok` = OK (rules of thumb, see article).
  const GROUPS = {
    warm: { name: 'Warm-water fish', low: 3, ok: 5 },
    cold: { name: 'Cold-water fish', low: 4, ok: 6.5 },
    plant: { name: 'Hydroponic plants', low: 3, ok: 3 }
  };

  const $ = function (id) { return document.getElementById(id); };
  const modeSel = $('pmode');
  const groupSel = $('group');
  const outSel = $('out');
  const svg = $('viz');

  // ---------- Science ----------
  // Fresh-water solubility at 1 atm, mg/L (Benson & Krause 1984; USGS 2011).
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

  // U.S. Standard Atmosphere 1976, troposphere. h in m, returns Pa.
  function pressureFromElevation(h) {
    return ATM_PA * Math.pow(1 - 2.25577e-5 * h, 5.25588);
  }

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function conc(mgL) {
    const u = outSel.value || 'mgL';
    const v = CalcUnits.convert('concentration', mgL, 'mgL', u);
    const label = u === 'mgL' ? 'mg/L' : CalcUnits.label('concentration', u);
    return fmt(v, u === 'ugL' ? 0 : u === 'mgL' ? 2 : 5) + ' ' + label;
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : '–') + ' ' + CalcUnits.unitLabel(id);
  }
  function tempLabel(c) {
    const u = CalcUnits.unit('temp');
    return fmt(CalcUnits.convert('temperature', c, 'C', u), 1) + ' ' + CalcUnits.label('temperature', u);
  }

  // ---------- Compute ----------
  function compute() {
    const r = { errors: [] };
    const t = CalcUnits.baseSigned('temp');
    const salRaw = parseFloat($('sal').value);
    const S = isFinite(salRaw) ? salRaw : NaN;
    r.t = t; r.S = S;

    if (!isFinite(t)) r.errors.push('Enter the water temperature.');
    else if (t < 0 || t > 40) r.errors.push('Temperature must be between 0 and 40 °C (32–104 °F), the range the solubility equations were fitted for.');
    if (!isFinite(S)) r.errors.push('Enter the salinity (0 for fresh water).');
    else if (S < 0 || S > 40) r.errors.push('Salinity must be between 0 and 40 ppt.');

    let Pa = NaN;
    if (modeSel.value === 'elev') {
      const h = CalcUnits.baseSigned('elev');
      if (!isFinite(h)) r.errors.push('Enter the site elevation (0 for sea level).');
      else if (h < -500 || h > 6000) r.errors.push('Elevation must be between −500 m and 6,000 m (−1,640 to 19,685 ft).');
      else Pa = pressureFromElevation(h);
      r.h = h;
    } else {
      const p = CalcUnits.base('baro');
      if (!p) r.errors.push('Enter the barometric pressure.');
      else if (p < 0.45 * ATM_PA || p > 1.1 * ATM_PA) r.errors.push('Barometric pressure should be between about 340 and 836 mm Hg (45–111 kPa). Check the unit.');
      else Pa = p;
    }
    r.Pa = Pa;
    r.Patm = Pa / ATM_PA;

    r.ok = r.errors.length === 0;
    if (r.ok) {
      r.c0 = c0(t);
      r.fs = salFactor(t, S);
      r.fp = pressFactor(t, r.Patm);
      r.csat = r.c0 * r.fs * r.fp;
    }

    const mv = parseFloat($('meas').value);
    r.hasMeas = $('meas').value.trim() !== '' && isFinite(mv) && mv >= 0;
    if ($('meas').value.trim() !== '' && !r.hasMeas) r.errors.push('Measured DO must be zero or more.');
    r.meas = r.hasMeas ? (mv === 0 ? 0 : CalcUnits.base('meas')) : NaN;
    if (r.hasMeas && r.meas > 60) { r.errors.push('Measured DO looks too high. Check its unit (mg/L).'); r.hasMeas = false; }
    if (r.ok && r.hasMeas) {
      r.pct = r.meas / r.csat * 100;
      r.deficit = r.csat - r.meas;
      const g = GROUPS[groupSel.value];
      r.status = r.meas < g.low ? 'low' : r.meas < g.ok ? 'mid' : 'ok';
    }
    return r;
  }

  function statusText(r) {
    const g = GROUPS[groupSel.value];
    if (r.status === 'low') return 'Low: below ' + fmt(g.low) + ' mg/L';
    if (r.status === 'mid') return 'Marginal: ' + fmt(g.low) + '–' + fmt(g.ok) + ' mg/L';
    return 'OK: ' + fmt(g.ok) + ' mg/L or more';
  }

  // ---------- State ----------
  function setMode(m) {
    modeSel.value = m;
    document.querySelectorAll('[data-mode]').forEach(function (el) { el.hidden = el.dataset.mode !== m; });
  }

  function getState() {
    const st = { pmode: modeSel.value, group: groupSel.value, out: outSel.value };
    ['temp', 'sal', 'meas', modeSel.value === 'elev' ? 'elev' : 'baro'].forEach(function (f) {
      st[f] = $(f).value;
      if (CalcUnits.unit(f)) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f], DEFAULT_UNITS[f]); });
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    const msgs = r.errors.slice();
    if (r.ok && r.hasMeas && r.pct > 100.5) msgs.push('Measured DO is above 100% saturation (supersaturated). This happens with pure-oxygen injection or strong algae photosynthesis; very high gas supersaturation can harm fish.');
    notice.innerHTML = '';
    msgs.forEach(function (m, i) {
      if (i) notice.appendChild(document.createElement('br'));
      notice.appendChild(document.createTextNode(m));
    });
    notice.hidden = msgs.length === 0;

    $('r-sat').textContent = r.ok ? conc(r.csat) : '–';
    $('r-pct').textContent = r.ok && r.hasMeas ? fmt(r.pct, 1) + '%' : r.ok ? 'enter measured DO' : '–';
    $('r-def').textContent = r.ok && r.hasMeas
      ? (r.deficit >= 0 ? conc(r.deficit) : conc(-r.deficit) + ' above saturation')
      : '–';
    const st = $('r-status');
    st.textContent = '';
    if (r.ok && r.hasMeas) {
      const pill = document.createElement('span');
      pill.className = 'status-pill status-' + r.status;
      pill.textContent = statusText(r);
      st.appendChild(pill);
    } else st.textContent = '–';
    $('r-press').textContent = isFinite(r.Pa)
      ? fmt(r.Pa / MMHG_PA, 1) + ' mm Hg · ' + fmt(r.Pa / 1000, 2) + ' kPa · ' + fmt(r.Patm, 3) + ' atm'
      : '–';
    $('r-c0').textContent = r.ok ? conc(r.c0) : '–';
    $('r-fac').textContent = r.ok ? fmt(r.fs, 4) + ' × ' + fmt(r.fp, 4) : '–';

    $('viz-caption').textContent = r.ok
      ? 'Saturation ' + conc(r.csat) + ' at ' + tempLabel(r.t) +
        (r.hasMeas ? ' · measured ' + conc(r.meas) + ' = ' + fmt(r.pct, 0) + '% saturation' : '')
      : 'Enter temperature, salinity and pressure to draw the curve';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 320;
  const CH = { l: 50, r: 318, t: 22, b: 262 }; // chart plot area
  const GX = 372, GW = 26;                     // gauge bar

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }

  function niceStep(range) {
    const raw = range / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const S = r.ok ? r.S : 0, P = r.ok ? r.Patm : 1;
    const u = outSel.value || 'mgL';
    const toOut = function (mg) { return CalcUnits.convert('concentration', mg, 'mgL', u); };

    // y scale in mg/L shared by chart and gauge
    let yMaxMg = Math.max(c0(0), csat(0, S, P));
    if (r.ok && r.hasMeas) yMaxMg = Math.max(yMaxMg, r.meas * 1.08);
    const stepMg = niceStep(yMaxMg);
    yMaxMg = Math.ceil(yMaxMg / stepMg) * stepMg;
    const y = function (mg) { return CH.b - Math.max(0, Math.min(1, mg / yMaxMg)) * (CH.b - CH.t); };
    const x = function (t) { return CH.l + t / 40 * (CH.r - CH.l); };

    // grid + y labels
    for (let v = 0; v <= yMaxMg + 1e-9; v += stepMg) {
      el('line', { class: 'grid-line', x1: CH.l, y1: y(v), x2: CH.r, y2: y(v) });
      const lab = toOut(v);
      el('text', { class: 'dim-text', x: CH.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmt(lab, u === 'mgL' ? 1 : u === 'ugL' ? 0 : 4));
    }
    // x labels (0,10,...,40 °C in the chosen temperature unit)
    const tu = CalcUnits.unit('temp');
    for (let t = 0; t <= 40; t += 10) {
      el('line', { class: 'dim', x1: x(t), y1: CH.b, x2: x(t), y2: CH.b + 4 });
      el('text', { class: 'dim-text', x: x(t), y: CH.b + 17, 'text-anchor': 'middle' }, fmt(CalcUnits.convert('temperature', t, 'C', tu), 1));
    }
    el('path', { class: 'tank-line', d: 'M' + CH.l + ',' + CH.t + ' L' + CH.l + ',' + CH.b + ' L' + CH.r + ',' + CH.b });
    el('text', { class: 'axis-title', x: (CH.l + CH.r) / 2, y: CH.b + 34, 'text-anchor': 'middle' },
      'Water temperature (' + CalcUnits.label('temperature', tu) + ')');
    el('text', { class: 'axis-title', x: 14, y: (CH.t + CH.b) / 2, 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (CH.t + CH.b) / 2 + ')' }, 'DO at saturation (' + (u === 'mgL' ? 'mg/L' : CalcUnits.label('concentration', u)) + ')');

    // curves
    const path = function (fn) {
      let d = '';
      for (let t = 0; t <= 40.001; t += 1) d += (t ? ' L' : 'M') + x(t).toFixed(1) + ',' + y(fn(t)).toFixed(1);
      return d;
    };
    const isRef = Math.abs(S) < 1e-9 && Math.abs(P - 1) < 1e-4;
    if (!isRef) {
      el('path', { class: 'curve-ref', d: path(function (t) { return c0(t); }) });
      el('text', { class: 'dim-text', x: x(6), y: y(c0(6)) - 8, 'text-anchor': 'start' }, 'fresh, sea level');
    }
    el('path', { class: 'curve', d: path(function (t) { return csat(t, S, P); }) });

    if (r.ok) {
      const px = x(r.t), py = y(r.csat);
      el('line', { class: 'depth-line', x1: px, y1: py, x2: px, y2: CH.b });
      el('line', { class: 'depth-line', x1: px, y1: py, x2: GX, y2: py });
      el('circle', { class: 'point', cx: px, cy: py, r: 6 });
      const right = px < (CH.l + CH.r) / 2;
      el('text', { class: 'depth-text', x: px + (right ? 10 : -10), y: py - 10, 'text-anchor': right ? 'start' : 'end' }, conc(r.csat));
    }

    // gauge
    const gTop = y(yMaxMg), gBot = y(0);
    const g = GROUPS[groupSel.value];
    const band = function (from, to, cls) {
      if (to <= from) return;
      el('rect', { class: cls, x: GX, y: y(to), width: GW, height: Math.max(0, y(from) - y(to)) });
    };
    const satMg = r.ok ? r.csat : yMaxMg;
    band(0, Math.min(g.low, yMaxMg), 'zone-low');
    band(g.low, Math.min(g.ok, yMaxMg), 'zone-mid');
    band(g.ok, Math.min(Math.max(g.ok, satMg), yMaxMg), 'zone-ok');
    if (r.ok) band(Math.max(satMg, g.ok), yMaxMg, 'zone-super');
    el('rect', { class: 'gauge-frame', x: GX, y: gTop, width: GW, height: gBot - gTop, rx: 3 });
    el('text', { class: 'axis-title', x: GX + GW / 2, y: CH.t - 8, 'text-anchor': 'middle' }, 'Measured');

    // zone labels to the right of the gauge
    const zl = function (from, to, text) {
      const a = Math.min(to, yMaxMg);
      if (a <= from || y(from) - y(a) < 12) return;
      el('text', { class: 'dim-text', x: GX + GW + 6, y: (y(from) + y(a)) / 2 + 4, 'text-anchor': 'start' }, text);
    };
    zl(0, g.low, 'low');
    if (g.ok > g.low) zl(g.low, g.ok, 'marginal');
    zl(g.ok, Math.max(satMg, g.ok), 'ok');
    if (r.ok) zl(Math.max(satMg, g.ok), yMaxMg, 'super');

    if (r.ok) el('line', { class: 'sat-line', x1: GX - 4, y1: y(r.csat), x2: GX + GW + 4, y2: y(r.csat) });

    if (r.ok && r.hasMeas) {
      const my = y(r.meas);
      el('line', { class: 'meas-line', x1: GX - 8, y1: my, x2: GX + GW + 4, y2: my });
      el('path', { class: 'tank-line', d: 'M' + (GX - 16) + ',' + (my - 5) + ' L' + (GX - 8) + ',' + my + ' L' + (GX - 16) + ',' + (my + 5) + 'Z', style: 'fill: var(--text)' });
      el('text', { class: 'meas-text', x: GX - 20, y: my + 4, 'text-anchor': 'end' }, fmt(toOut(r.meas), u === 'mgL' ? 1 : u === 'ugL' ? 0 : 4));
      el('text', { class: 'meas-text', x: GX + GW / 2, y: gBot + 17, 'text-anchor': 'middle' }, fmt(r.pct, 0) + '%');
      el('text', { class: 'dim-text', x: GX + GW / 2, y: gBot + 32, 'text-anchor': 'middle' }, 'of saturation');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Dissolved Oxygen Calculator',
      'Water: ' + typed('temp') + ', salinity ' + ($('sal').value || '–') + ' ppt, ' +
      (modeSel.value === 'elev' ? 'elevation ' + typed('elev') : 'barometric pressure ' + typed('baro'))];
    if (r.ok) {
      lines.push('Air pressure used: ' + fmt(r.Pa / MMHG_PA, 1) + ' mm Hg (' + fmt(r.Patm, 3) + ' atm)');
      lines.push('Oxygen solubility (100% saturation): ' + conc(r.csat));
      if (r.hasMeas) {
        lines.push('Measured DO: ' + conc(r.meas) + ' = ' + fmt(r.pct, 1) + '% saturation');
        lines.push('Oxygen deficit: ' + (r.deficit >= 0 ? conc(r.deficit) : conc(-r.deficit) + ' above saturation'));
        lines.push('Status (' + GROUPS[groupSel.value].name + '): ' + statusText(r));
      }
    } else {
      lines.push(r.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  modeSel.addEventListener('change', function () { setMode(modeSel.value); render(); });
  groupSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Dissolved Oxygen Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    groupSel.value = 'warm';
    outSel.value = 'mgL';
    applyDefaults();
    setMode('elev');
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.group && GROUPS[p.group]) groupSel.value = p.group;
    if (p.out && CalcUnits.unitDef('concentration', p.out)) outSel.value = p.out;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && (p[f] === '' || isFinite(parseFloat(p[f])))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    // Measured DO is optional: a shared link without it means "no reading".
    if (Object.keys(p).length && p.meas === undefined) $('meas').value = '';
    setMode(p.pmode === 'baro' ? 'baro' : 'elev');
    render();
  })();
})();
