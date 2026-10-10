// TAN Conversion (Ammonia): ammonia species conversions, un-ionized fraction
// (Emerson et al. 1975, optional ionic-strength correction), nitrite/nitrate
// conversions, live SVG chart and shareable URL state.
(function () {
  'use strict';

  // Standard atomic weights (IUPAC/CIAAW conventional values)
  const N = 14.007, H = 1.008, O = 15.999;
  const NH3_PER_N = (N + 3 * H) / N;   // 1.2159
  const NH4_PER_N = (N + 4 * H) / N;   // 1.2879
  const NO2_PER_N = (N + 2 * O) / N;   // 3.2844
  const NO3_PER_N = (N + 3 * O) / N;   // 4.4266

  // Status bands for un-ionized ammonia, mg/L as NH3
  const BANDS = [
    { max: 0.02, level: 'ok', text: 'Low: below the conservative 0.02 mg/L long-term target' },
    { max: 0.06, level: 'caution', text: 'Caution: above 0.02 mg/L target (rule of thumb)' },
    { max: 0.6, level: 'harm', text: 'Harmful: chronic gill damage reported from ~0.06 mg/L' },
    { max: Infinity, level: 'danger', text: 'Dangerous: short-term lethal levels from ~0.6 mg/L' }
  ];

  const BASIS = {
    tan: 'TAN (mg/L as N)', totnh3: 'total ammonia as NH₃', totnh4: 'total ammonia as NH₄⁺',
    nh3: 'free NH₃ (as NH₃)', nh3n: 'free NH₃ as N (NH₃-N)', nh4: 'NH₄⁺ only (as NH₄⁺)', nh4n: 'NH₄⁺ only as N (NH₄-N)'
  };

  const DEFAULTS = { amm: 1, ph: 7.5, temp: 25, sal: 0, no2: 0.25, no3: 40 };
  const DEFAULT_UNITS = { amm: 'mgL', temp: 'C', sal: 'ppt', no2: 'mgL', no3: 'mgL' };
  const FIELDS = ['amm', 'ph', 'temp', 'sal', 'no2', 'no3'];
  const SELECTS = ['basis', 'no2basis', 'no3basis'];

  // Salinity is not in units.js; add it here (base = g/kg, ppt).
  CalcUnits.GROUPS.salinity = {
    base: 'ppt',
    units: [
      { id: 'ppt', label: 'ppt (g/kg)', factor: 1 },
      { id: 'psu', label: 'PSU', factor: 1 },
      { id: 'pct', label: '%', factor: 10 }
    ]
  };

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const outSel = $('out');

  // ---------- Formatting ----------
  function fmt(n) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    if (abs === 0) return '0';
    let digits;
    if (abs >= 100) digits = 1;
    else if (abs >= 1) digits = 3;
    else digits = Math.min(6, Math.max(3, 2 - Math.floor(Math.log10(abs)))); // 3 significant figures
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function pctFmt(p) {
    if (!isFinite(p)) return '–';
    return (p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(3) : p.toExponential(1)) + '%';
  }
  function shortLabel(label) { return label.replace(/ \((ppm|ppt)\)$/, ''); }
  function out(mgL) {
    const u = outSel.value || 'mgL';
    return fmt(CalcUnits.convert('concentration', mgL, 'mgL', u)) + ' ' + shortLabel(CalcUnits.label('concentration', u));
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + ' ' + CalcUnits.unitLabel(id);
  }

  // ---------- Chemistry ----------
  function ionicStrength(S) { return 19.9273 * S / (1000 - 1.005109 * S); }

  function pKa(tC, S) {
    const T = tC + 273.15;
    let p = 0.09018 + 2729.92 / T;
    if (S > 0) p += (0.1552 - 0.0003142 * tC) * ionicStrength(S);
    return p;
  }

  function fraction(pH, tC, S) { return 1 / (Math.pow(10, pKa(tC, S) - pH) + 1); }

  function compute() {
    const v = CalcUnits.base('amm');           // mg/L in the kit's basis
    const pH = parseFloat($('ph').value);
    const t = CalcUnits.baseSigned('temp');    // °C
    const S = CalcUnits.base('sal');           // g/kg
    const basis = $('basis').value;
    const r = { ok: false, msgs: [], pH: pH, t: t, S: S };

    if (!isFinite(pH) || pH < 0 || pH > 14) r.msgs.push('Enter a pH between 0 and 14.');
    if (!isFinite(t)) r.msgs.push('Enter the water temperature.');
    else if (t + 273.15 <= 0) r.msgs.push('Temperature must be above absolute zero.');
    if (r.msgs.length) return r;

    r.pKa = pKa(t, S);
    r.f = fraction(pH, t, S);

    let tan = 0;
    switch (basis) {
      case 'tan': tan = v; break;
      case 'totnh3': tan = v / NH3_PER_N; break;
      case 'totnh4': tan = v / NH4_PER_N; break;
      case 'nh3': tan = v / NH3_PER_N / r.f; break;
      case 'nh3n': tan = v / r.f; break;
      case 'nh4': tan = v / NH4_PER_N / (1 - r.f); break;
      case 'nh4n': tan = v / (1 - r.f); break;
    }
    if (!isFinite(tan)) tan = 0;
    r.tan = tan;
    r.nh3n = r.f * tan;
    r.nh3 = r.nh3n * NH3_PER_N;
    r.nh4n = (1 - r.f) * tan;
    r.nh4 = r.nh4n * NH4_PER_N;
    r.hasAmm = v > 0;
    r.ok = true;

    if (!r.hasAmm) r.msgs.push('Enter an ammonia test result to see the conversions.');
    if (t < 0 || t > 40) r.msgs.push('The Emerson et al. (1975) equation was fitted for 0–30 °C; results outside 0–40 °C are extrapolated.');
    if (S > 45) r.msgs.push('Salinity above 45 ppt is outside the range of the ionic-strength correction.');
    if (pH < 5 || pH > 11) r.msgs.push('pH outside 5–11 is unusual for culture water. Check the reading.');
    if ((basis === 'nh3' || basis === 'nh3n') && r.f < 0.001 && r.hasAmm) {
      r.msgs.push('At this pH almost no ammonia is un-ionized, so back-calculating TAN from a free-NH₃ reading is very sensitive to pH.');
    }
    return r;
  }

  function band(nh3) {
    for (let i = 0; i < BANDS.length; i++) if (nh3 < BANDS[i].max) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }

  function nitro(id, basisId, perN) {
    const v = CalcUnits.base(id);
    const isN = $(basisId).value === 'n';
    const nVal = isN ? v : v / perN;
    return { has: v > 0, ion: nVal * perN, n: nVal };
  }

  // ---------- State ----------
  function getState() {
    const st = { out: outSel.value };
    FIELDS.forEach(function (f) {
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    SELECTS.forEach(function (s) { st[s] = $(s).value; });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f], DEFAULT_UNITS[f]); });
    $('basis').value = 'tan';
    $('no2basis').value = 'ion';
    $('no3basis').value = 'ion';
    outSel.value = 'mgL';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    notice.textContent = r.msgs.join(' ');
    notice.hidden = r.msgs.length === 0;

    const show = r.ok && r.hasAmm;
    const st = $('r-status');
    if (show) {
      const b = band(r.nh3);
      $('r-nh3').textContent = out(r.nh3);
      $('r-nh3sub').textContent = 'as NH₃ · ' + out(r.nh3n) + ' as N';
      st.textContent = b.text;
      st.dataset.level = b.level;
    } else {
      $('r-nh3').textContent = '–';
      $('r-nh3sub').textContent = '';
      st.textContent = '–';
      st.dataset.level = '';
    }
    $('r-pct').textContent = r.ok ? pctFmt(r.f * 100) : '–';
    $('r-nh3n').textContent = show ? out(r.nh3n) : '–';
    $('r-tan').textContent = show ? out(r.tan) + ' N' : '–';
    $('r-totnh3').textContent = show ? out(r.tan * NH3_PER_N) : '–';
    $('r-totnh4').textContent = show ? out(r.tan * NH4_PER_N) : '–';
    $('r-nh4').textContent = show ? out(r.nh4) + ' (' + out(r.nh4n) + ' N)' : '–';
    $('r-pka').textContent = r.ok ? r.pKa.toFixed(3) : '–';

    const n2 = nitro('no2', 'no2basis', NO2_PER_N);
    const n3 = nitro('no3', 'no3basis', NO3_PER_N);
    const u2 = shortLabel(CalcUnits.unitLabel('no2')), u3 = shortLabel(CalcUnits.unitLabel('no3'));
    const c2 = function (x) { return fmt(CalcUnits.fromBase('no2', x)) + ' ' + u2; };
    const c3 = function (x) { return fmt(CalcUnits.fromBase('no3', x)) + ' ' + u3; };
    $('r-no2').textContent = n2.has ? c2(n2.ion) : '–';
    $('r-no2n').textContent = n2.has ? c2(n2.n) : '–';
    $('r-no3').textContent = n3.has ? c3(n3.ion) : '–';
    $('r-no3n').textContent = n3.has ? c3(n3.n) : '–';

    $('viz-caption').textContent = r.ok
      ? pctFmt(r.f * 100) + ' un-ionized at pH ' + r.pH + ', ' + fmt(r.t) + ' °C' + (r.S > 0 ? ', ' + fmt(r.S) + ' ppt' : '') +
        (show ? ' · NH₃ ' + out(r.nh3) : '')
      : 'Enter pH and temperature to draw the curve';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const CH = { l: 50, r: 466, t: 22, b: 222 };   // chart box
  const PH_MIN = 6, PH_MAX = 10;
  const LOG_MIN = -2, LOG_MAX = 2;               // 0.01% .. 100%

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }
  function xOf(pH) { return CH.l + (pH - PH_MIN) / (PH_MAX - PH_MIN) * (CH.r - CH.l); }
  function yOf(pct) {
    const lg = Math.log10(Math.max(pct, Math.pow(10, LOG_MIN)));
    return CH.b - (Math.min(lg, LOG_MAX) - LOG_MIN) / (LOG_MAX - LOG_MIN) * (CH.b - CH.t);
  }
  function curvePath(tC, S) {
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const pH = PH_MIN + (PH_MAX - PH_MIN) * i / 80;
      d += (i ? ' L' : 'M') + xOf(pH).toFixed(1) + ',' + yOf(fraction(pH, tC, S) * 100).toFixed(1);
    }
    return d;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // grid + axes
    [0.01, 0.1, 1, 10, 100].forEach(function (p) {
      const y = yOf(p);
      el('line', { x1: CH.l, y1: y, x2: CH.r, y2: y, class: 'grid' });
      el('text', { x: CH.l - 6, y: y + 4, 'text-anchor': 'end', class: 'dim-text' }, p + '%');
    });
    for (let p = PH_MIN; p <= PH_MAX; p++) {
      const x = xOf(p);
      el('line', { x1: x, y1: CH.t, x2: x, y2: CH.b, class: 'grid' });
      el('text', { x: x, y: CH.b + 16, 'text-anchor': 'middle', class: 'dim-text' }, String(p));
    }
    el('path', { class: 'axis', d: 'M' + CH.l + ',' + CH.t + ' L' + CH.l + ',' + CH.b + ' L' + CH.r + ',' + CH.b });
    el('text', { x: (CH.l + CH.r) / 2, y: CH.b + 32, 'text-anchor': 'middle', class: 'dim-text' }, 'pH');
    el('text', { x: CH.l + 4, y: CH.t - 8, 'text-anchor': 'start', class: 'dim-text' }, '% of TAN un-ionized (log scale)');

    if (!r.ok) return;

    // NH3 = 0.02 mg/L at this TAN, as a % line
    if (r.hasAmm && r.tan > 0) {
      const pctLim = 0.02 / NH3_PER_N / r.tan * 100;
      if (pctLim > 0.01 && pctLim < 100) {
        const y = yOf(pctLim);
        el('line', { x1: CH.l, y1: y, x2: CH.r, y2: y, class: 'limit' });
        const pointLeft = r.pH < (PH_MIN + PH_MAX) / 2;
        el('text', { x: pointLeft ? CH.r - 4 : CH.l + 4, y: y + 14, 'text-anchor': pointLeft ? 'end' : 'start', class: 'limit-text' }, '0.02 mg/L NH₃ at this TAN');
      }
    }

    // comparison curve
    const tAlt = r.t >= 20 ? r.t - 10 : r.t + 10;
    el('path', { class: 'curve-alt', d: curvePath(tAlt, r.S) });
    el('path', { class: 'curve', d: curvePath(r.t, r.S) });

    // legend (bottom-right inside chart)
    const lx = CH.r - 120, ly = CH.b - 34;
    el('line', { x1: lx, y1: ly, x2: lx + 22, y2: ly, class: 'curve' });
    el('text', { x: lx + 28, y: ly + 4, class: 'curve-text' }, fmt(r.t) + ' °C (yours)');
    el('line', { x1: lx, y1: ly + 18, x2: lx + 22, y2: ly + 18, class: 'curve-alt' });
    el('text', { x: lx + 28, y: ly + 22, class: 'alt-text' }, fmt(tAlt) + ' °C');

    // user point
    const pc = r.f * 100;
    if (r.pH >= PH_MIN && r.pH <= PH_MAX) {
      const x = xOf(r.pH), y = yOf(pc);
      el('line', { x1: x, y1: y, x2: x, y2: CH.b, class: 'depth-line' });
      el('circle', { cx: x, cy: y, r: 6, class: 'point' });
      // Curve rises to the right, so the area above-left of the point is clear.
      const left = x - CH.l > 120 && y > CH.t + 16;
      el('text', { x: left ? x - 10 : x + 10, y: left ? y - 8 : y + 20, 'text-anchor': left ? 'end' : 'start', class: 'strong-text' },
        'pH ' + r.pH + ': ' + pctFmt(pc));
    } else {
      el('text', { x: (CH.l + CH.r) / 2, y: CH.t + 20, 'text-anchor': 'middle', class: 'strong-text' },
        'pH ' + r.pH + ' is off this chart (' + pctFmt(pc) + ')');
    }

    // stacked bar: NH3 vs NH4+
    const bx = 20, bw = 440, by = 288, bh = 24;
    el('text', { x: bx, y: by - 10, class: 'strong-text' }, 'Split of total ammonia (TAN)');
    const wNH3 = Math.max(r.f > 0 ? 2 : 0, bw * r.f);
    el('rect', { x: bx, y: by, width: bw, height: bh, rx: 4, class: 'bar-nh4' });
    el('rect', { x: bx, y: by, width: wNH3, height: bh, class: 'bar-nh3' });
    el('line', { x1: bx, y1: by, x2: bx, y2: by + bh, class: 'axis' });
    const nh3Txt = 'NH₃ ' + pctFmt(pc) + (r.hasAmm ? ' · ' + out(r.nh3) : '');
    const nh4Txt = 'NH₄⁺ ' + pctFmt(100 - pc) + (r.hasAmm ? ' · ' + out(r.nh4) : '');
    el('text', { x: bx, y: by + bh + 18, 'text-anchor': 'start', class: 'dim-text' }, nh3Txt);
    el('text', { x: bx + bw, y: by + bh + 36, 'text-anchor': 'end', class: 'dim-text' }, nh4Txt);
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['TAN Conversion (Ammonia) Calculator',
      'Input: ' + typed('amm') + ' reported as ' + BASIS[$('basis').value] + ', pH ' + $('ph').value +
      ', ' + typed('temp') + ', salinity ' + typed('sal')];
    if (r.ok && r.hasAmm) {
      lines.push('Un-ionized ammonia: ' + out(r.nh3) + ' as NH3 (' + out(r.nh3n) + ' as N), ' + pctFmt(r.f * 100) + ' of TAN');
      lines.push('Status: ' + band(r.nh3).text);
      lines.push('TAN: ' + out(r.tan) + ' as N · total as NH3: ' + out(r.tan * NH3_PER_N) + ' · total as NH4+: ' + out(r.tan * NH4_PER_N));
      lines.push('Ionized NH4+: ' + out(r.nh4) + ' (' + out(r.nh4n) + ' as N) · pKa ' + r.pKa.toFixed(3));
    }
    const n2 = nitro('no2', 'no2basis', NO2_PER_N), n3 = nitro('no3', 'no3basis', NO3_PER_N);
    if (n2.has) lines.push('Nitrite: ' + fmt(CalcUnits.fromBase('no2', n2.ion)) + ' ' + CalcUnits.unitLabel('no2') + ' NO2- = ' + fmt(CalcUnits.fromBase('no2', n2.n)) + ' ' + CalcUnits.unitLabel('no2') + ' NO2-N');
    if (n3.has) lines.push('Nitrate: ' + fmt(CalcUnits.fromBase('no3', n3.ion)) + ' ' + CalcUnits.unitLabel('no3') + ' NO3- = ' + fmt(CalcUnits.fromBase('no3', n3.n)) + ' ' + CalcUnits.unitLabel('no3') + ' NO3-N');
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  SELECTS.forEach(function (s) { $(s).addEventListener('change', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'TAN Conversion (Ammonia) Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    SELECTS.forEach(function (s) {
      const sel = $(s);
      if (p[s] && Array.prototype.some.call(sel.options, function (o) { return o.value === p[s]; })) sel.value = p[s];
    });
    if (p.out && CalcUnits.unitDef('concentration', p.out)) outSel.value = p.out;
    render();
  })();
})();
