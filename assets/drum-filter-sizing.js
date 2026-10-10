// Drum Filter Sizing Calculator: submerged screen area, solids load, backwash water,
// live drum cross-section, shareable URL state.
(function () {
  'use strict';

  // Hydraulic loading (flow per unit screen area) is not in units.js; add it here.
  // Base unit: m³/m²/h (= m/h).
  CalcUnits.GROUPS.hydload = {
    base: 'm3m2h',
    units: [
      { id: 'm3m2h', label: 'm³/m²/h', factor: 1 },
      { id: 'm3m2d', label: 'm³/m²/day', factor: 1 / 24 },
      { id: 'Lminm2', label: 'L/min/m²', factor: 0.06 },
      { id: 'gpmft2', label: 'US gpm/ft²', factor: 3.785411784e-3 * 60 / 0.09290304 }
    ]
  };

  // Illustrative starting hydraulic loading rates (m³/m²/h) per mesh. Rules of thumb only.
  const HLR_BY_MESH = { 40: 10, 60: 15, 80: 18, 100: 20, 120: 24 };
  const HLR_RANGE = [5, 40];          // outside this, warn
  const SUB_TYPICAL = [60, 70];        // % of diameter, rule of thumb
  const BW_TRIAL = [0.06, 0.23];       // % of flow, Danish eel farm trial

  const DEFAULTS = {
    flow: [30, 'm3ph'], feed: [20, 'kg'], tssfrac: [25], hlr: [15, 'm3m2h'], sub: [65],
    diameter: [1, 'm'], length: [1.2, 'm'], bwvol: [10, 'L'], bwfreq: [6]
  };
  const DEFAULT_MESH = '60';
  const FIELDS = Object.keys(DEFAULTS);
  const UNIT_FIELDS = ['flow', 'feed', 'hlr', 'diameter', 'length', 'bwvol'];

  const $ = function (id) { return document.getElementById(id); };
  const meshSel = $('mesh');
  const outArea = $('out-area');
  const outVol = $('out-vol');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function raw(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function area(m2) { return fmt(CalcUnits.convert('area', m2, 'm2', outArea.value)) + ' ' + CalcUnits.label('area', outArea.value); }
  function vol(L) { return fmt(CalcUnits.convert('volume', L, 'L', outVol.value)) + ' ' + CalcUnits.label('volume', outVol.value); }
  function flowTxt(Lps) { const u = CalcUnits.unit('flow'); return fmt(CalcUnits.convert('flow', Lps, 'Lps', u)) + ' ' + CalcUnits.label('flow', u); }
  function lenUp(m) {
    // Round a length up in the diameter field's unit to a buildable figure.
    const u = CalcUnits.unit('diameter');
    const v = CalcUnits.convert('length', m, 'm', u);
    const step = { mm: 10, cm: 1, m: 0.01, in: 0.5, ft: 0.05, yd: 0.02 }[u] || 0.01;
    const r = Math.ceil(v / step - 1e-9) * step;
    return fmt(r, 2) + ' ' + CalcUnits.label('length', u);
  }
  function massTxt(kg) {
    const u = CalcUnits.unit('feed');
    return fmt(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }

  // ---------- Calculation (base units: m, m², m³/h, kg, L) ----------
  function compute() {
    const Qm3h = CalcUnits.base('flow') * 3.6;             // L/s → m³/h
    const feed = CalcUnits.base('feed');                     // kg/day
    const p = Math.max(0, raw('tssfrac')) / 100;
    const hlr = CalcUnits.base('hlr');                       // m³/m²/h
    const D = CalcUnits.base('diameter'), L = CalcUnits.base('length');
    const subPct = raw('sub');
    const s = Math.min(Math.max(subPct, 0), 100) / 100;
    const bwL = CalcUnits.base('bwvol');
    const n = Math.max(0, raw('bwfreq')) || 0;

    const theta = 2 * Math.acos(1 - 2 * s);                 // wetted central angle
    const f = theta / (2 * Math.PI);                         // wetted fraction of circumference
    const Ascreen = Math.PI * D * L;
    const Asub = f * Ascreen;
    const Areq = hlr > 0 ? Qm3h / hlr : NaN;
    const cap = hlr * Asub;                                  // m³/h

    const tss = p * feed;                                    // kg/day
    const Qday = Qm3h * 24;                                  // m³/day
    const bwDay = bwL * n * 24;                              // L/day

    const r = {
      Qm3h: Qm3h, feed: feed, p: p, hlr: hlr, D: D, L: L, s: s, subPct: subPct, theta: theta, f: f,
      Ascreen: Ascreen, Asub: Asub, Areq: Areq, cap: cap, tss: tss, Qday: Qday, bwDay: bwDay, n: n, bwL: bwL
    };
    r.ok = Asub >= Areq;
    r.tssPerArea = Asub > 0 ? tss / Asub : NaN;
    r.concMgL = Qday > 0 ? tss / Qday * 1000 : NaN;          // kg/m³ × 1000 = mg/L
    r.bwPct = Qday > 0 ? bwDay / 1000 / Qday * 100 : NaN;
    if (f > 0 && D > 0 && isFinite(Areq)) {
      r.Lneed = Areq / (f * Math.PI * D);
      const ratio = L > 0 ? L / D : 1;
      r.Dneed = Math.sqrt(Areq / (f * Math.PI * ratio));
      r.LforD = r.Dneed * ratio;
    }
    return r;
  }

  // ---------- State ----------
  function getState() {
    const st = { mesh: meshSel.value, oa: outArea.value, ov: outVol.value };
    FIELDS.forEach(function (f) {
      st[f] = $(f).value;
      if (UNIT_FIELDS.indexOf(f) !== -1) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    meshSel.value = DEFAULT_MESH;
  }

  function setMeshHlr() {
    const v = HLR_BY_MESH[meshSel.value];
    const u = CalcUnits.unit('hlr');
    $('hlr').value = +CalcUnits.convert('hydload', v, 'm3m2h', u).toPrecision(4);
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const ready = r.Qm3h > 0 && r.hlr > 0;
    const drumOk = r.D > 0 && r.L > 0 && r.s > 0 && isFinite(r.subPct);
    const msgs = [];

    if (!ready) msgs.push('Enter the flow and the screen hydraulic loading rate to size the filter.');
    if (!drumOk) msgs.push('Enter drum diameter, screen length and submergence to check a drum.');
    if (isFinite(r.subPct) && (r.subPct >= 100 || r.subPct <= 0)) msgs.push('Submergence must be between 0 and 100% of the diameter.');
    else if (isFinite(r.subPct) && (r.subPct < 40 || r.subPct > 80)) msgs.push('Submergence of ' + fmt(r.subPct, 0) + '% is unusual; drums are typically run about ' + SUB_TYPICAL[0] + '–' + SUB_TYPICAL[1] + '% submerged (rule of thumb).');
    if (r.hlr > 0 && (r.hlr < HLR_RANGE[0] || r.hlr > HLR_RANGE[1])) msgs.push('A loading of ' + fmt(r.hlr) + ' m³/m²/h is outside the 5–40 m³/m²/h range this page treats as plausible. Confirm it with the manufacturer.');
    if (raw('tssfrac') > 60) msgs.push('Solids above 60% of feed is unusually high; 25% is the common design value.');
    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    $('r-req').textContent = ready ? area(r.Areq) : '–';
    $('r-avail').textContent = drumOk ? area(r.Asub) + ' (' + fmt(r.f * 100, 1) + '% of ' + area(r.Ascreen) + ')' : '–';
    const both = ready && drumOk;
    const pctOfReq = both && r.Areq > 0 ? r.Asub / r.Areq * 100 : 0;
    $('r-bar').style.width = Math.min(100, pctOfReq) + '%';
    $('r-ok').textContent = both
      ? (r.ok ? 'Yes, ' + fmt(pctOfReq, 0) + '% of required' : 'No, only ' + fmt(pctOfReq, 0) + '% of required')
      : '–';
    $('r-cap').textContent = both ? flowTxt(r.cap / 3.6) : '–';
    if (both && r.ok) {
      $('r-suggest').textContent = 'This drum is large enough';
    } else if (both && isFinite(r.Lneed)) {
      $('r-suggest').textContent = 'Same D: length ≥ ' + lenUp(r.Lneed) + ' · or D ' + lenUp(r.Dneed) + ' × L ' + lenUp(r.LforD);
    } else {
      $('r-suggest').textContent = '–';
    }
    $('r-tss').textContent = r.feed > 0 ? massTxt(r.tss) + '/day' : '–';
    $('r-tssarea').textContent = r.feed > 0 && drumOk ? fmt(r.tssPerArea) + ' kg/m²/day' : '–';
    $('r-conc').textContent = r.feed > 0 && r.Qm3h > 0 ? fmt(r.concMgL) + ' mg/L' : '–';
    $('r-bw').textContent = r.bwDay > 0 ? vol(r.bwDay) + '/day' : (r.bwL > 0 || r.n > 0 ? '0' : '–');
    let bwTxt = '–';
    if (r.bwDay > 0 && r.Qm3h > 0) {
      bwTxt = fmt(r.bwPct, 2) + '%';
      if (r.bwPct < BW_TRIAL[0]) bwTxt += ' (below trial range)';
      else if (r.bwPct <= BW_TRIAL[1]) bwTxt += ' (within trial range)';
      else bwTxt += ' (above 0.06–0.23% trial range)';
    }
    $('r-bwpct').textContent = bwTxt;

    $('viz-caption').textContent = both
      ? 'Submerged screen ' + area(r.Asub) + ' vs ' + area(r.Areq) + ' required · ' + (r.ok ? 'drum is large enough' : 'drum is undersized')
      : 'Enter flow, loading rate and drum size to draw the filter';

    drawViz(r, ready, drumOk);
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

  function drawViz(r, ready, drumOk) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const cx = 150, cy = 122, R = 84;
    const hx0 = 34, hx1 = 266, hy0 = 22, hy1 = 222;   // filter housing
    const s = drumOk ? Math.min(Math.max(r.s, 0), 1) : 0.65;
    const yw = cy + R - 2 * R * s;                       // inside water level
    const drop = 12;                                     // outlet level shown lower (schematic)
    const yo = Math.min(yw + drop, hy1 - 4);

    // housing and outside (filtered) water
    el('rect', { class: 'tank-glass', x: hx0, y: hy0, width: hx1 - hx0, height: hy1 - hy0 });
    el('rect', { class: 'water', x: hx0, y: yo, width: hx1 - hx0, height: hy1 - yo, 'fill-opacity': 0.45 });
    el('line', { class: 'water-top', x1: hx0, y1: yo, x2: hx1, y2: yo });

    // drum interior and inside (unfiltered) water
    el('circle', { class: 'screen', cx: cx, cy: cy, r: R });
    const dy = yw - cy;
    const half = Math.sqrt(Math.max(0, R * R - dy * dy));
    if (s > 0) {
      const large = s > 0.5 ? 1 : 0;
      const seg = 'M' + (cx - half) + ',' + yw + ' A' + R + ',' + R + ' 0 ' + large + ' 0 ' + (cx + half) + ',' + yw;
      el('path', { class: 'water', d: s >= 1 ? 'M' + (cx - R) + ',' + cy + ' A' + R + ',' + R + ' 0 1 0 ' + (cx + R) + ',' + cy + ' A' + R + ',' + R + ' 0 1 0 ' + (cx - R) + ',' + cy : seg + 'Z' });
      el('line', { class: 'water-top', x1: cx - half, y1: yw, x2: cx + half, y2: yw });
      // submerged screen arc
      el('path', { class: 'screen-arc', d: seg });
    }
    el('circle', { cx: cx, cy: cy, r: R, fill: 'none', class: 'screen', style: 'fill:none' });

    // backwash trough (inside, top) and spray bar (outside, top)
    el('path', { class: 'trough', d: 'M' + (cx - 16) + ',' + (cy - R + 26) + ' l4,14 h24 l4,-14' });
    el('line', { class: 'tank-line', x1: cx - 30, y1: cy - R - 10, x2: cx + 30, y2: cy - R - 10 });
    for (let i = -2; i <= 2; i++) {
      el('line', { class: 'spray', x1: cx + i * 12, y1: cy - R - 8, x2: cx + i * 7, y2: cy - R + 24 });
    }
    el('circle', { cx: cx, cy: cy, r: 3, fill: 'currentColor', class: 'dim-text' });

    // housing outline
    el('rect', { class: 'tank-line', x: hx0, y: hy0, width: hx1 - hx0, height: hy1 - hy0 });

    // diameter dimension
    el('path', { class: 'dim', d: 'M' + (cx - R) + ',' + (hy1 + 10) + ' L' + (cx + R) + ',' + (hy1 + 10) +
      ' M' + (cx - R) + ',' + (hy1 + 5) + ' v10 M' + (cx + R) + ',' + (hy1 + 5) + ' v10' });
    label(cx, hy1 + 24, drumOk ? 'D ' + typed('diameter') + ' · L ' + typed('length') : 'D –');

    // level leaders and right-hand labels
    const lx = 276;
    el('line', { class: 'depth-line', x1: cx + half, y1: yw, x2: lx, y2: yw });
    el('line', { class: 'dim', x1: hx1, y1: yo, x2: lx, y2: yo });
    const yInside = Math.min(yw, yo - 16);
    label(lx + 4, yInside + 4, 'inside level (unfiltered)', 'start', 'depth-text');
    label(lx + 4, Math.max(yo, yInside + 16) + 4, 'outlet level (filtered)', 'start');
    label(lx + 4, 44, 'spray bar + sludge trough', 'start');
    label(lx + 4, 150, drumOk ? fmt(s * 100, 0) + '% of D submerged' : '', 'start', 'accent-text');
    label(lx + 4, 166, drumOk ? fmt(r.f * 100, 1) + '% of screen wet' : '', 'start', 'accent-text');
    label(lx + 4, 190, 'thick arc = filtering screen', 'start');

    // area bars
    const bx = 20, bw = 440, by = 262;
    if (ready && drumOk) {
      const max = Math.max(r.Areq, r.Asub) * 1.08;
      const wReq = bw * r.Areq / max, wAv = bw * r.Asub / max;
      el('rect', { class: 'bar-req', x: bx, y: by, width: wReq, height: 14, rx: 3 });
      el('rect', { class: r.ok ? 'bar-ok' : 'bar-bad', x: bx, y: by + 26, width: wAv, height: 14, rx: 3 });
      el('line', { class: 'depth-line', x1: bx + wReq, y1: by - 4, x2: bx + wReq, y2: by + 44 });
      label(bx, by - 5, 'Required ' + area(r.Areq), 'start');
      label(bx, by + 54, 'Available (submerged) ' + area(r.Asub), 'start', r.ok ? 'accent-text' : 'dim-text');
    } else {
      label(240, by + 20, 'Enter flow, loading and drum size to compare areas');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'Drum Filter Sizing Calculator',
      'Flow ' + typed('flow') + ', feed ' + typed('feed') + '/day, solids ' + typed('tssfrac') + '% of feed',
      'Mesh ' + meshSel.value + ' µm, hydraulic loading ' + typed('hlr') + ' (rule of thumb unless from manufacturer)',
      'Drum D ' + typed('diameter') + ' × L ' + typed('length') + ', ' + typed('sub') + '% of D submerged',
      'Backwash ' + typed('bwvol') + ' × ' + typed('bwfreq') + ' per hour',
      '',
      'Required submerged screen area: ' + $('r-req').textContent,
      'Submerged area of this drum: ' + $('r-avail').textContent,
      'Meets requirement: ' + $('r-ok').textContent,
      'Drum capacity at this loading: ' + $('r-cap').textContent,
      'Suggested drum: ' + $('r-suggest').textContent,
      'Solids load: ' + $('r-tss').textContent + ' (' + $('r-tssarea').textContent + ')',
      'Solids added per pass: ' + $('r-conc').textContent,
      'Backwash water: ' + $('r-bw').textContent + ', ' + $('r-bwpct').textContent + ' of flow',
      'Use manufacturer data for final selection.',
      CalcShare.buildUrl(getState())
    ];
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  meshSel.addEventListener('change', function () { setMeshHlr(); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Drum Filter Sizing Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    outArea.value = 'm2';
    outVol.value = 'L';
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.mesh && HLR_BY_MESH[p.mesh]) meshSel.value = p.mesh;
    if (p.oa && CalcUnits.unitDef('area', p.oa)) outArea.value = p.oa;
    if (p.ov && CalcUnits.unitDef('volume', p.ov)) outVol.value = p.ov;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    render();
  })();
})();
