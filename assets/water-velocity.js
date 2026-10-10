// Pipe Water Velocity Calculator: v = Q / A, Reynolds number, PVC pipe sizing, live SVG.
(function () {
  'use strict';

  // ---------- Data ----------
  // ASTM D1785 PVC pipe: outside diameter and minimum wall (inches).
  // Inside diameter = OD - 2 x minimum wall.
  const PIPES = [
    { n: '1/2', label: '½″', od: 0.840, w40: 0.109, w80: 0.147 },
    { n: '3/4', label: '¾″', od: 1.050, w40: 0.113, w80: 0.154 },
    { n: '1', label: '1″', od: 1.315, w40: 0.133, w80: 0.179 },
    { n: '1-1/4', label: '1¼″', od: 1.660, w40: 0.140, w80: 0.191 },
    { n: '1-1/2', label: '1½″', od: 1.900, w40: 0.145, w80: 0.200 },
    { n: '2', label: '2″', od: 2.375, w40: 0.154, w80: 0.218 },
    { n: '2-1/2', label: '2½″', od: 2.875, w40: 0.203, w80: 0.276 },
    { n: '3', label: '3″', od: 3.500, w40: 0.216, w80: 0.300 },
    { n: '4', label: '4″', od: 4.500, w40: 0.237, w80: 0.337 },
    { n: '5', label: '5″', od: 5.563, w40: 0.258, w80: 0.375 },
    { n: '6', label: '6″', od: 6.625, w40: 0.280, w80: 0.432 }
  ];
  const IN = 0.0254;
  function pipeId(p, sched) { return +(p.od - 2 * (sched === '80' ? p.w80 : p.w40)).toFixed(3); }

  // Liquid water at 0.1 MPa, every 5 °C from 0 to 50 °C.
  // mu: dynamic viscosity, mPa·s (Kestin et al. 1978); rho: kg/m³ (Tanaka et al. 2001; IAPWS-95 above 40 °C).
  const MU = [1.792, 1.518, 1.306, 1.138, 1.002, 0.890, 0.797, 0.719, 0.653, 0.596, 0.547];
  const RHO = [999.84, 999.97, 999.70, 999.10, 998.21, 997.05, 995.65, 994.03, 992.22, 990.22, 988.04];
  function kinVisc(tC) {
    const t = Math.max(0, Math.min(50, tC));
    const i = Math.min(9, Math.floor(t / 5));
    const f = (t - i * 5) / 5;
    const mu = MU[i] + (MU[i + 1] - MU[i]) * f;
    const rho = RHO[i] + (RHO[i + 1] - RHO[i]) * f;
    return mu * 1e-3 / rho; // m²/s
  }

  const ABS_MAX = 10 * 0.3048; // 10 ft/s, never exceed (UF/IFAS)
  const DEFAULTS = { flow: [20, 'gpm'], diam: [1.38, 'in'], vt: [4, 'ftps'], temp: [20, 'C'], vmin: [2, 'ftps'], vmax: [5, 'ftps'] };
  const FIELDS = Object.keys(DEFAULTS);
  const DEFAULT_PIPE = '40:1-1/4';

  const $ = function (id) { return document.getElementById(id); };
  const pipeSel = $('pipe'), schedSel = $('sched'), outSel = $('out');
  const modeButtons = document.querySelectorAll('#mode-group button');
  const svg = $('viz');
  let mode = 'check';

  // Fill the pipe list and the reference table.
  (function buildPipes() {
    ['40', '80'].forEach(function (s) {
      const g = document.createElement('optgroup');
      g.label = 'PVC Schedule ' + s;
      PIPES.forEach(function (p) {
        const o = document.createElement('option');
        o.value = s + ':' + p.n;
        o.textContent = p.label + ' Sch ' + s + ' (ID ' + pipeId(p, s).toFixed(3) + ' in)';
        g.appendChild(o);
      });
      pipeSel.appendChild(g);
    });
    const c = document.createElement('option');
    c.value = 'custom';
    c.textContent = 'Custom inside diameter';
    pipeSel.appendChild(c);

    const tb = $('pipe-table');
    PIPES.forEach(function (p) {
      const tr = document.createElement('tr');
      [p.label, p.od.toFixed(3), pipeId(p, '40').toFixed(3), pipeId(p, '80').toFixed(3)].forEach(function (t) {
        const td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  })();

  function findPipe(value) {
    const parts = String(value).split(':');
    for (let i = 0; i < PIPES.length; i++) if (PIPES[i].n === parts[1] && (parts[0] === '40' || parts[0] === '80')) return { p: PIPES[i], s: parts[0] };
    return null;
  }

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function vel(mps) { return fmt(CalcUnits.convert('velocity', mps, 'mps', outSel.value)) + ' ' + CalcUnits.label('velocity', outSel.value); }
  function flowTxt(Lps) { const u = CalcUnits.unit('flow'); return fmt(CalcUnits.convert('flow', Lps, 'Lps', u)) + ' ' + CalcUnits.label('flow', u); }
  function lenTxt(m) { return fmt(m / IN, 3) + ' in · ' + fmt(m * 1000, 1) + ' mm'; }
  function typed(id) { const v = parseFloat($(id).value); return (isFinite(v) ? v : 0) + ' ' + CalcUnits.unitLabel(id); }
  function pipeName(p, s) { return p.label + ' Sch ' + s; }

  // ---------- Calculation (SI) ----------
  function smallestUnder(Qm3, vLimit, sched) {
    for (let i = 0; i < PIPES.length; i++) {
      const D = pipeId(PIPES[i], sched) * IN;
      const v = Qm3 / (Math.PI * D * D / 4);
      if (v <= vLimit) return { p: PIPES[i], s: sched, D: D, v: v };
    }
    return null;
  }

  function compute() {
    const Q = CalcUnits.base('flow') / 1000; // m³/s
    const tRaw = CalcUnits.baseSigned('temp');
    const t = isFinite(tRaw) ? tRaw : 20;
    const nu = kinVisc(t);
    const vmin = CalcUnits.base('vmin');
    const vmax = CalcUnits.base('vmax');
    const r = { Q: Q, t: t, tRaw: tRaw, nu: nu, vmin: vmin, vmax: vmax, D: 0, v: NaN, ok: false };

    if (mode === 'check') {
      const pick = findPipe(pipeSel.value);
      r.pipe = pick;
      r.D = pick ? pipeId(pick.p, pick.s) * IN : CalcUnits.base('diam');
    } else {
      const vt = CalcUnits.base('vt');
      r.vt = vt;
      if (Q > 0 && vt > 0) {
        r.Dreq = Math.sqrt(4 * Q / (Math.PI * vt));
        r.pick = smallestUnder(Q, vt, schedSel.value);
        if (r.pick) r.D = r.pick.D;
      }
    }
    if (Q > 0 && r.D > 0) {
      r.A = Math.PI * r.D * r.D / 4;
      r.v = Q / r.A;
      r.Re = r.v * r.D / nu;
      r.ok = true;
    }
    if (Q > 0 && vmax > 0) {
      r.s40 = smallestUnder(Q, vmax, '40');
      r.s80 = smallestUnder(Q, vmax, '80');
    }
    return r;
  }

  function regime(Re) {
    if (Re < 2300) return 'Laminar';
    if (Re <= 4000) return 'Transitional';
    return 'Turbulent';
  }

  // zone: low | ok | high | over
  function zoneOf(v, vmin, vmax) {
    if (vmax > 0 && v > Math.max(vmax, ABS_MAX)) return 'over';
    if (vmax > 0 && v > vmax) return 'high';
    if (vmin > 0 && v < vmin) return 'low';
    return 'ok';
  }
  const ZONE_TEXT = {
    low: 'Low: below minimum',
    ok: 'OK: within range',
    high: 'High: above maximum',
    over: 'Too high: over 10 ft/s'
  };

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-mode-only]').forEach(function (e) { e.hidden = e.dataset.modeOnly !== m; });
    syncPipe();
  }

  function syncPipe() {
    const custom = pipeSel.value === 'custom';
    $('id-field').hidden = mode !== 'check' || !custom;
    const pick = findPipe(pipeSel.value);
    $('pipe-hint').textContent = pick
      ? 'OD ' + pick.p.od.toFixed(3) + ' in, minimum wall ' + (pick.s === '80' ? pick.p.w80 : pick.p.w40).toFixed(3) + ' in (ASTM D1785).'
      : 'Enter the inside diameter of any pipe or tube.';
  }

  function getState() {
    const st = { mode: mode, out: outSel.value };
    const keys = ['flow', 'temp', 'vmin', 'vmax'];
    if (mode === 'check') {
      st.pipe = pipeSel.value;
      if (pipeSel.value === 'custom') keys.push('diam');
    } else {
      st.sched = schedSel.value;
      keys.push('vt');
    }
    keys.forEach(function (f) { st[f] = $(f).value; st[f + '_u'] = CalcUnits.unit(f); });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    pipeSel.value = DEFAULT_PIPE;
    schedSel.value = '40';
    outSel.value = 'ftps';
  }

  // ---------- Render ----------
  function render() {
    syncPipe();
    const r = compute();
    const notes = [];
    if (!(r.Q > 0)) notes.push('Enter a flow rate above zero.');
    if (mode === 'check' && !(r.D > 0)) notes.push('Enter the pipe inside diameter.');
    if (mode === 'size' && !(r.vt > 0)) notes.push('Enter a target velocity above zero.');
    if (mode === 'size' && r.Dreq && !r.pick) notes.push('No Schedule ' + schedSel.value + ' pipe up to 6″ is large enough. Use larger pipe or split the flow into parallel lines.');
    if (!isFinite(r.tRaw)) notes.push('Enter a water temperature (20 °C assumed).');
    else if (r.tRaw < 0 || r.tRaw > 50) notes.push('Viscosity data cover 0–50 °C; using ' + (r.tRaw < 0 ? 0 : 50) + ' °C.');
    if (r.vmin > 0 && r.vmax > 0 && r.vmin >= r.vmax) notes.push('Minimum velocity should be lower than the maximum.');
    if (!(r.vmax > 0)) notes.push('Enter a maximum velocity to get pipe recommendations.');
    const notice = $('notice');
    notice.textContent = notes.join(' ');
    notice.hidden = notes.length === 0;

    const z = r.ok ? zoneOf(r.v, r.vmin, r.vmax) : null;
    if (mode === 'check') {
      $('r-main-label').textContent = 'Water velocity';
      $('r-main').textContent = r.ok ? vel(r.v) : '–';
    } else {
      $('r-main-label').textContent = 'Minimum inside diameter for the target velocity' + (r.Dreq ? ' (' + fmt(r.Dreq * 1000, 1) + ' mm)' : '');
      $('r-main').textContent = r.Dreq ? fmt(r.Dreq / IN, 3) + ' in' : '–';
      $('r-pick').textContent = r.pick ? pipeName(r.pick.p, r.pick.s) : (r.Dreq ? 'none up to 6″' : '–');
      $('r-pickv').textContent = r.ok ? vel(r.v) : '–';
    }

    let rangeTxt = '–';
    if (r.ok) {
      rangeTxt = ZONE_TEXT[z];
      if (z === 'over' && r.vmax > ABS_MAX) rangeTxt = 'Too high: over maximum';
    }
    $('r-range').textContent = rangeTxt;
    $('r-range').style.color = z === 'ok' ? 'var(--accent)' : z === 'low' ? 'var(--water-deep)' : z ? 'var(--warn-text)' : '';
    $('r-id').textContent = r.D > 0 ? lenTxt(r.D) : '–';
    $('r-area').textContent = r.ok ? fmt(r.A / 0.00064516, r.A < 0.0064516 ? 3 : 2) + ' in² · ' + fmt(r.A * 1e4) + ' cm²' : '–';
    $('r-re').textContent = r.ok ? fmt(Math.round(r.Re), 0) : '–';
    $('r-regime').textContent = r.ok ? regime(r.Re) : '–';
    $('r-qmax').textContent = (r.D > 0 && r.vmax > 0) ? flowTxt(r.vmax * Math.PI * r.D * r.D / 4 * 1000) : '–';
    function rec(x) { return x ? pipeName(x.p, x.s) + ' (' + vel(x.v) + ')' : (r.Q > 0 && r.vmax > 0 ? 'none up to 6″' : '–'); }
    $('r-s40').textContent = rec(r.s40);
    $('r-s80').textContent = rec(r.s80);

    let cap = 'Enter a flow rate and pipe size';
    if (r.ok) {
      const which = mode === 'check' ? (r.pipe ? pipeName(r.pipe.p, r.pipe.s) : fmt(r.D / IN, 3) + ' in ID') : pipeName(r.pick.p, r.pick.s);
      cap = flowTxt(r.Q * 1000) + ' through ' + which + ' · ' + vel(r.v) + ' · Re ' + fmt(Math.round(r.Re), 0);
    }
    $('viz-caption').textContent = cap;

    drawViz(r, z);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined && text !== null) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) { return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text); }
  function shortVel(mps) {
    const u = outSel.value;
    return fmt(CalcUnits.convert('velocity', mps, 'mps', u), 1) + ' ' + CalcUnits.label('velocity', u);
  }

  function drawViz(r, z) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const vmax = r.vmax > 0 ? r.vmax : 1.524;
    const vmin = r.vmin > 0 ? Math.min(r.vmin, vmax) : 0;
    const gMax = vmax * 2; // gauge scale: 0 … 2 × maximum velocity
    drawPipe(r, gMax);
    drawGauge(r, z, vmin, vmax, gMax);
  }

  function drawPipe(r, gMax) {
    // End view (left) and side view (right), fixed drawing size.
    const cx = 50, cy = 66, R = 38;
    let wallFrac = 0.12;
    const pick = mode === 'check' ? r.pipe : r.pick;
    if (pick) wallFrac = (pick.s === '80' ? pick.p.w80 : pick.p.w40) / pick.p.od * 2;
    const ri = R * (1 - wallFrac);
    el('circle', { class: 'wv-pipe-wall', cx: cx, cy: cy, r: R });
    el('circle', { class: 'wv-bore', cx: cx, cy: cy, r: ri });
    el('path', { class: 'dim', d: 'M' + (cx - ri) + ',' + cy + ' L' + (cx + ri) + ',' + cy });
    label(cx, cy + R + 16, r.D > 0 ? 'ID ' + fmt(r.D / IN, 3) + ' in' : 'ID –');
    label(cx, cy - R - 8, pick ? pipeName(pick.p, pick.s) : 'Custom pipe');

    const x0 = 104, x1 = 352, top = cy - R, bot = cy + R, wt = R - ri;
    el('rect', { class: 'wv-pipe-wall', x: x0, y: top, width: x1 - x0, height: 2 * R });
    el('rect', { class: 'wv-bore', x: x0, y: top + wt, width: x1 - x0, height: 2 * ri });
    label((x0 + x1) / 2, top - 8, 'Side view: arrow length ∝ velocity');

    if (!r.ok) { label((x0 + x1) / 2, cy + 4, 'No flow'); return; }
    // Animated streamlines; speed on screen ∝ velocity.
    const pxPerSec = 40 * r.v;
    const dur = Math.max(0.12, Math.min(8, 24 / pxPerSec));
    [-0.55, 0, 0.55].forEach(function (k) {
      const y = cy + k * ri;
      el('path', { class: 'wv-stream', d: 'M' + (x0 + 4) + ',' + y + ' L' + (x1 - 4) + ',' + y, style: '--dur:' + dur.toFixed(3) + 's' });
    });
    // Arrows: length scales with velocity over the gauge range.
    const frac = Math.max(0, Math.min(1, r.v / gMax));
    const len = 20 + frac * 200;
    const ax = (x0 + x1) / 2 - len / 2;
    const head = Math.min(10, ri * 0.5);
    [-0.4, 0.4].forEach(function (k) {
      const y = cy + k * ri;
      el('path', { class: 'wv-arrow', d: 'M' + ax + ',' + y + ' L' + (ax + len) + ',' + y + ' M' + (ax + len - head) + ',' + (y - head * 0.7) + ' L' + (ax + len) + ',' + y + ' L' + (ax + len - head) + ',' + (y + head * 0.7) });
    });
  }

  function drawGauge(r, z, vmin, vmax, gMax) {
    const cx = 180, cy = 258, R = 104;
    function pt(v, rad) {
      const a = Math.PI * (1 - Math.max(0, Math.min(1, v / gMax)));
      return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
    }
    function arc(v0, v1, cls) {
      if (v1 <= v0) return;
      const p0 = pt(v0, R), p1 = pt(v1, R);
      el('path', { class: cls, d: 'M' + p0[0].toFixed(2) + ',' + p0[1].toFixed(2) + ' A' + R + ',' + R + ' 0 0 1 ' + p1[0].toFixed(2) + ',' + p1[1].toFixed(2) });
    }
    el('path', { class: 'wv-track', d: 'M' + (cx - R) + ',' + cy + ' A' + R + ',' + R + ' 0 0 1 ' + (cx + R) + ',' + cy });
    arc(0, vmin, 'wv-zone-low');
    arc(vmin, vmax, 'wv-zone-ok');
    arc(vmax, gMax, 'wv-zone-high');

    // Ticks and labels at 0, min, max, end.
    const ticks = [0, vmax, gMax];
    if (vmin > 0 && vmin < vmax) ticks.splice(1, 0, vmin);
    ticks.forEach(function (v) {
      const a = pt(v, R - 12), b = pt(v, R + 12), t = pt(v, R + 18);
      el('line', { class: 'wv-tick', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      const frac = v / gMax;
      const anchor = frac < 0.3 ? 'end' : frac > 0.7 ? 'start' : 'middle';
      label(t[0], t[1] + (frac > 0.3 && frac < 0.7 ? -2 : 4), shortVel(v), anchor);
    });
    // Zone names inside the arc.
    function zoneLabel(v0, v1, text) {
      if (v1 - v0 < gMax * 0.08) return;
      const p = pt((v0 + v1) / 2, R - 26);
      label(p[0], p[1] + 4, text, 'middle', 'wv-zone-text');
    }
    zoneLabel(0, vmin, 'low');
    zoneLabel(vmin, vmax, 'ok');
    zoneLabel(vmax, gMax, 'high');

    if (r.ok) {
      const tip = pt(r.v, R - 20);
      el('line', { class: 'wv-needle', x1: cx, y1: cy, x2: tip[0], y2: tip[1] });
      el('text', { x: cx, y: cy + 30, 'text-anchor': 'middle', class: 'wv-value' }, vel(r.v) + (r.v > gMax ? ' ▸' : ''));
    } else {
      el('text', { x: cx, y: cy + 30, 'text-anchor': 'middle', class: 'wv-value' }, '–');
    }
    el('circle', { class: 'wv-hub', cx: cx, cy: cy, r: 5 });
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Pipe Water Velocity Calculator', 'Flow rate: ' + typed('flow') + ', water ' + typed('temp')];
    if (mode === 'check') {
      lines.push('Pipe: ' + (r.pipe ? pipeName(r.pipe.p, r.pipe.s) + ' PVC' : 'custom') + ', inside diameter ' + (r.D > 0 ? lenTxt(r.D) : '–'));
    } else {
      lines.push('Target velocity: ' + typed('vt') + ', PVC Schedule ' + schedSel.value);
      lines.push('Minimum inside diameter: ' + (r.Dreq ? lenTxt(r.Dreq) : '–'));
      lines.push('Smallest pipe at or below target: ' + (r.pick ? pipeName(r.pick.p, r.pick.s) + ' (ID ' + lenTxt(r.pick.D) + ')' : 'none up to 6 in'));
    }
    if (r.ok) {
      lines.push('Velocity: ' + vel(r.v) + ' (' + fmt(r.v, 3) + ' m/s)');
      lines.push('Cross-sectional area: ' + fmt(r.A / 0.00064516) + ' in² (' + fmt(r.A * 1e4) + ' cm²)');
      lines.push('Reynolds number: ' + fmt(Math.round(r.Re), 0) + ' (' + regime(r.Re).toLowerCase() + ')');
      lines.push('Range check (min ' + typed('vmin') + ', max ' + typed('vmax') + '): ' + $('r-range').textContent);
    }
    lines.push('Smallest Sch 40 under max: ' + $('r-s40').textContent);
    lines.push('Smallest Sch 80 under max: ' + $('r-s80').textContent);
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); render(); }); });
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  [pipeSel, schedSel].forEach(function (s) { s.addEventListener('change', render); });

  CalcUnits.init(render); // also wires the output velocity select (#out)

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Pipe Water Velocity Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); setMode('check'); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.pipe && (p.pipe === 'custom' || findPipe(p.pipe))) pipeSel.value = p.pipe;
    if (p.sched === '40' || p.sched === '80') schedSel.value = p.sched;
    if (p.out && CalcUnits.unitDef('velocity', p.out)) outSel.value = p.out;
    setMode(p.mode === 'size' ? 'size' : 'check');
    render();
  })();
})();
