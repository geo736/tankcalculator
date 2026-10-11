// Internal Tank Velocity Calculator: inlet jet velocity, estimated rotational
// velocity (15–20% rule of thumb), body lengths per second, live SVG, share state.
(function () {
  'use strict';

  // Rotational velocity ≈ k × inlet velocity, k ≈ 0.15–0.20 (Timmons et al. 1998, citing Paul et al. 1991).
  const K_LOW = 0.15, K_HIGH = 0.20, K_MID = (K_LOW + K_HIGH) / 2;
  const CLEAN_LOW = 0.15, CLEAN_HIGH = 0.30;   // m/s, solids to drain (Timmons et al. 1998)
  const BL_LOW = 0.5, BL_HIGH = 2.0;            // body lengths/s (Losordo & Westers 1994)
  const RATIO_LOW = 5, RATIO_HIGH = 10;         // diameter:depth (Timmons et al. 1998)
  const G = 9.80665;                            // m/s², standard gravity
  // Square tanks with corner radius ≥ 20% of the side rotate about as fast as circular tanks;
  // sharp-cornered square tanks about half as fast (Zhang et al. 2022).
  const RB_GOOD = 0.2, SHARP_FACTOR = 0.5;

  const FIELDS = ['diameter', 'side', 'corner', 'rlen', 'rwid', 'depth', 'flow', 'ports', 'portd', 'fish', 'target'];
  const DEFAULTS = {
    diameter: [4, 'm'], side: [3, 'm'], corner: [75, 'cm'], rlen: [12, 'm'], rwid: [3, 'm'],
    depth: [0.8, 'm'], flow: [400, 'Lpm'], ports: [8, ''],
    portd: [25, 'mm'], fish: [20, 'cm'], target: [30, 'cmps']
  };
  const SHAPES = ['round', 'square', 'rect'];
  const shapeButtons = document.querySelectorAll('#shape-group button');
  let shape = 'round';

  const $ = function (id) { return document.getElementById(id); };
  const vout = $('vout');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  // Velocity in m/s shown in the chosen output unit.
  function vNum(mps) { return CalcUnits.convert('velocity', mps, 'mps', vout.value); }
  function vUnit() { return CalcUnits.label('velocity', vout.value); }
  function fmtV(mps) { return fmt(vNum(mps)) + ' ' + vUnit(); }
  function fmtVRange(a, b) { return fmt(vNum(a)) + '–' + fmt(vNum(b)) + ' ' + vUnit(); }
  function inUnitOf(field, meters) { return fmt(CalcUnits.fromBase(field, meters)) + ' ' + CalcUnits.unitLabel(field); }
  function typed(field) {
    const v = parseFloat($(field).value);
    const u = CalcUnits.unitLabel(field);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function fmtTime(s) {
    if (s < 120) return fmt(s, 0) + ' s';
    if (s < 7200) return fmt(s / 60, 1) + ' min';
    return fmt(s / 3600, 2) + ' h';
  }

  // ---------- Calculation (SI) ----------
  function portCount() {
    const v = parseFloat($('ports').value);
    return isFinite(v) && v >= 1 ? Math.round(v) : 0;
  }

  function compute() {
    const d = CalcUnits.base('depth');             // m
    const Q = CalcUnits.base('flow') / 1000;       // m³/s
    const n = portCount();
    const dp = CalcUnits.base('portd');            // m
    const L = CalcUnits.base('fish');              // m
    const vTarget = CalcUnits.base('target');      // m/s

    const r = { shape: shape, d: d, Q: Q, n: n, dp: dp, L: L, vTarget: vTarget, cells: 1, kf: 1 };
    // span = width of one rotating body of water (diameter, side or cell width), m
    if (shape === 'square') {
      const B = CalcUnits.base('side');
      const Rc = Math.min(Math.max(CalcUnits.base('corner') || 0, 0), B / 2);
      r.B = B; r.Rc = Rc; r.rb = B > 0 ? Rc / B : NaN; r.span = B;
      r.plan = B * B - (4 - Math.PI) * Rc * Rc;
      if (B > 0 && r.rb < RB_GOOD) r.kf = SHARP_FACTOR;
    } else if (shape === 'rect') {
      const a = CalcUnits.base('rlen'), b = CalcUnits.base('rwid');
      r.long = Math.max(a, b); r.short = Math.min(a, b);
      r.cells = r.short > 0 ? Math.max(1, Math.round(r.long / r.short)) : 1;
      r.cellLen = r.long / r.cells;
      r.aspect = r.short > 0 ? r.cellLen / r.short : NaN;
      r.span = r.short;
      r.plan = a * b;
    } else {
      const D = CalcUnits.base('diameter');
      r.D = D; r.span = D;
      r.plan = Math.PI * D * D / 4;
    }
    r.vol = r.plan * d;                            // m³
    r.hrt = Q > 0 && r.vol > 0 ? r.vol / Q : NaN;  // s
    r.area = n * Math.PI * dp * dp / 4;            // m²
    r.okJet = Q > 0 && r.area > 0;
    r.vin = r.okJet ? Q / r.area : NaN;            // m/s
    r.kLow = K_LOW * r.kf; r.kHigh = K_HIGH * r.kf;
    r.vLow = r.kLow * r.vin;
    r.vHigh = r.kHigh * r.vin;
    r.vMid = (r.kLow + r.kHigh) / 2 * r.vin;
    r.qCell = Q / r.cells;
    r.portsCell = n / r.cells;
    r.head = r.vin * r.vin / (2 * G);              // m
    r.blLow = L > 0 ? r.vLow / L : NaN;
    r.blHigh = L > 0 ? r.vHigh / L : NaN;
    r.blMid = L > 0 ? r.vMid / L : NaN;
    r.ratio = d > 0 ? r.span / d : NaN;
    if (vTarget > 0) {
      r.reqLow = vTarget / r.kHigh;                // jet needed at the high k
      r.reqHigh = vTarget / r.kLow;                // jet needed at the low k
      if (Q > 0 && n > 0) {
        r.dpBig = Math.sqrt(4 * Q / (n * Math.PI * r.reqLow));   // slower jet → bigger port
        r.dpSmall = Math.sqrt(4 * Q / (n * Math.PI * r.reqHigh));
      }
    }
    return r;
  }

  function blStatus(r) {
    if (!isFinite(r.blLow)) return null;
    if (r.blHigh < BL_LOW) return { ok: false, text: 'slow (< 0.5 BL/s)' };
    if (r.blLow > BL_HIGH) return { ok: false, text: 'fast (> 2 BL/s)' };
    if (r.blLow >= BL_LOW && r.blHigh <= BL_HIGH) return { ok: true, text: 'in 0.5–2 BL/s' };
    return { ok: false, text: 'partly outside 0.5–2 BL/s' };
  }

  function cleanStatus(r) {
    if (!isFinite(r.vLow)) return null;
    if (r.vLow >= CLEAN_HIGH) return { ok: true, text: 'Yes, above 30 cm/s' };
    if (r.vLow >= CLEAN_LOW) return { ok: true, text: 'Likely, ' + (r.vHigh >= CLEAN_HIGH ? 'in or above' : 'in') + ' the band' };
    if (r.vHigh >= CLEAN_LOW) return { ok: false, text: 'Borderline, near 15 cm/s' };
    return { ok: false, text: 'Unlikely, below 15 cm/s' };
  }

  function ratioStatus(r) {
    if (!isFinite(r.ratio)) return null;
    if (r.ratio < RATIO_LOW) return { ok: false, text: 'deep (guide 5–10)' };
    if (r.ratio > RATIO_HIGH) return { ok: false, text: 'shallow (guide 5–10)' };
    return { ok: true, text: 'in 5–10 guide' };
  }

  function pill(st) {
    return '<span class="pill ' + (st.ok ? 'pill-ok' : 'pill-warn') + '">' + st.text + '</span>';
  }

  // ---------- State ----------
  function setShape(s) {
    shape = SHAPES.indexOf(s) >= 0 ? s : 'round';
    shapeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shape === shape)); });
    document.querySelectorAll('[data-shape-for]').forEach(function (el) { el.hidden = el.dataset.shapeFor !== shape; });
  }

  function getState() {
    const st = { vout: vout.value, shape: shape };
    FIELDS.forEach(function (f) {
      if ($(f).closest('.field').hidden) return;
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    if (st.target.trim() === '') st.target = 'off'; // keep "no target" in shared links
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1] || undefined); });
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notes = [];
    const tankOk = r.vol > 0;
    const sizeName = { round: 'tank diameter', square: 'side length', rect: 'tank length and width' }[shape];
    if (!(r.plan > 0 && r.d > 0)) notes.push('Enter the ' + sizeName + ' and water depth.');
    if (!(r.Q > 0)) notes.push('Enter the total inflow.');
    if (!(r.n > 0)) notes.push('Enter at least one inlet port.');
    else if (Math.abs(parseFloat($('ports').value) - r.n) > 1e-9) notes.push('Number of ports rounded to ' + r.n + '.');
    if (!(r.dp > 0)) notes.push('Enter the port diameter.');
    if (r.dp > 0 && r.span > 0 && r.dp * 10 > r.span) notes.push('Port diameter looks too large for this tank; check the units.');
    if (shape === 'square' && r.B > 0 && r.kf < 1) notes.push('Sharp or small corners (radius ' + fmt(r.rb * 100, 0) + '% of the side): rotation is roughly half that of a round tank. Rounding the corners to 20–40% of the side roughly doubles it.');
    if (shape === 'rect' && r.short > 0) {
      if (r.aspect > 1.2 || r.aspect < 0.85) notes.push('Length ÷ width is ' + fmt(r.long / r.short, 2) + ', so each of the ' + r.cells + ' cells is ' + fmt(r.aspect, 2) + ' times as long as it is wide. Square cells rotate best.');
      if (r.n > 0 && Math.abs(r.portsCell - Math.round(r.portsCell)) > 1e-9) notes.push(r.n + ' ports do not divide evenly among ' + r.cells + ' cells.');
      notes.push('Each cell needs its own inlet pipes and center drain.');
    }
    if (r.okJet && r.vin < 0.3) notes.push('The jets are very slow (' + fmtV(r.vin) + '). Smaller or fewer ports would raise the velocity.');
    const notice = $('notice');
    notice.textContent = notes.join(' ');
    notice.hidden = notes.length === 0;

    $('r-vt').textContent = r.okJet ? fmtVRange(r.vLow, r.vHigh) : '–';
    const kTxt = fmt(r.kLow * 100, 1) + '–' + fmt(r.kHigh * 100, 1) + '%';
    $('r-vt-sub').textContent = r.okJet ? kTxt + ' of the inlet jet velocity' + (shape === 'rect' ? ', in each cell' : '') + ' · mid estimate ' + fmtV(r.vMid) : '';
    $('r-vin').textContent = r.okJet ? fmtV(r.vin) + ' · ' + fmt(r.vin, 2) + ' m/s' : '–';
    if (vout.value === 'mps') $('r-vin').textContent = r.okJet ? fmtV(r.vin) : '–';

    const bs = r.okJet ? blStatus(r) : null;
    $('r-bl').innerHTML = bs ? r.blLow.toFixed(2) + '–' + r.blHigh.toFixed(2) + ' BL/s ' + pill(bs) : (r.okJet ? 'enter fish length' : '–');

    const cs = r.okJet ? cleanStatus(r) : null;
    $('r-clean').innerHTML = cs ? pill(cs) : '–';

    $('r-vol').textContent = tankOk ? fmt(r.vol) + ' m³ · ' + fmt(r.vol * 1000, 0) + ' L · ' + fmt(r.vol * 1000 / 3.785411784, 0) + ' US gal' : '–';
    $('r-hrt').textContent = isFinite(r.hrt) ? fmtTime(r.hrt) + ' · ' + fmt(3600 / r.hrt, 2) + ' exchanges/h' : '–';
    const rs = ratioStatus(r);
    $('r-ratio-label').textContent = { round: 'Diameter : depth', square: 'Side : depth', rect: 'Cell width : depth' }[shape];
    $('r-ratio').innerHTML = rs ? fmt(r.ratio, 1) + ' : 1 ' + pill(rs) : '–';
    const cellsLi = $('r-cells').closest('li');
    cellsLi.hidden = shape === 'round';
    if (shape === 'square') {
      $('r-cells-label').textContent = 'Corner radius : side';
      $('r-cells').innerHTML = r.B > 0 ? fmt(r.rb, 2) + ' ' + pill(r.kf < 1 ? { ok: false, text: 'sharp (guide 0.2–0.4)' } : r.rb > 0.4 ? { ok: true, text: 'very round' } : { ok: true, text: 'in 0.2–0.4 guide' }) : '–';
    } else if (shape === 'rect') {
      $('r-cells-label').textContent = 'Rotating cells';
      $('r-cells').textContent = r.short > 0
        ? r.cells + ' × ' + inUnitOf('rwid', r.cellLen) + ' by ' + inUnitOf('rwid', r.short) +
          (r.Q > 0 ? ' · ' + fmt(CalcUnits.fromBase('flow', r.qCell * 1000)) + ' ' + CalcUnits.unitLabel('flow') + (r.n > 0 ? ', ' + fmt(r.portsCell, 1) + ' ports' : '') + ' each' : '')
        : '–';
    }
    $('r-head').textContent = r.okJet ? inUnitOf('depth', r.head) : '–';

    if (r.vTarget > 0) {
      $('r-req-label').textContent = 'Jet velocity for ' + fmtV(r.vTarget);
      $('r-req').textContent = fmtVRange(r.reqLow, r.reqHigh);
      $('r-reqd-label').textContent = 'Port diameter for ' + fmtV(r.vTarget) + (r.n > 0 ? ' (' + r.n + ' ports)' : '');
      $('r-reqd').textContent = isFinite(r.dpSmall) ? fmt(CalcUnits.fromBase('portd', r.dpSmall)) + '–' + inUnitOf('portd', r.dpBig) : '–';
    } else {
      $('r-req-label').textContent = 'Jet velocity for target';
      $('r-req').textContent = 'enter a target';
      $('r-reqd-label').textContent = 'Port diameter for target';
      $('r-reqd').textContent = '–';
    }

    $('viz-caption').textContent = r.okJet
      ? 'Jets ' + fmtV(r.vin) + ' → ' + (shape === 'rect' ? 'each cell' : 'tank') + ' ≈ ' + fmtVRange(r.vLow, r.vHigh) + (isFinite(r.blLow) ? ' · ' + r.blLow.toFixed(2) + '–' + r.blHigh.toFixed(2) + ' BL/s' : '')
      : 'Enter flow and port size to draw the jets';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  let root = svg;   // default parent; the right panel is drawn into a moved group for rectangular tanks
  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || root).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }
  function p(x, y) { return x.toFixed(1) + ',' + y.toFixed(1); }

  // Triangle arrowhead at (x, y) pointing along unit vector (ux, uy).
  function head(x, y, ux, uy, size, cls) {
    const bx = x - ux * size, by = y - uy * size;
    const nx = -uy * size * 0.55, ny = ux * size * 0.55;
    el('path', { class: cls, d: 'M' + p(x, y) + ' L' + p(bx + nx, by + ny) + ' L' + p(bx - nx, by - ny) + 'Z' });
  }

  // Fish outline, nose at (x, y) pointing right, total length len px.
  function fish(x, y, len) { fishIn(svg, x, y, len); }

  function fishIn(parent, x, y, len) {
    const b = len * 0.78, h = len * 0.12, t = len * 0.22;
    const bx = x - b;
    el('path', { class: 'fish', d:
      'M' + p(x, y) + ' Q' + p(x - b * 0.45, y - h * 2) + ' ' + p(bx, y) +
      ' L' + p(bx - t, y - h * 1.1) + ' L' + p(bx - t, y + h * 1.1) + ' L' + p(bx, y) +
      ' Q' + p(x - b * 0.45, y + h * 2) + ' ' + p(x, y) + 'Z' }, undefined, parent);
  }

  // Swirl arrows around (cx, cy) at radius rr. dir 1 = counter-clockwise on screen, -1 = clockwise.
  function swirl(cx, cy, rr, count, span, offset, dir) {
    for (let i = 0; i < count; i++) {
      const a0 = i * 2 * Math.PI / count + offset;
      const a1 = a0 + span;
      const x0 = cx + rr * Math.cos(a0), y0 = cy - dir * rr * Math.sin(a0);
      const x1 = cx + rr * Math.cos(a1), y1 = cy - dir * rr * Math.sin(a1);
      const large = span > Math.PI ? 1 : 0;
      el('path', { class: 'swirl', d: 'M' + p(x0, y0) + ' A' + rr.toFixed(1) + ',' + rr.toFixed(1) + ' 0 ' + large + ' ' + (dir > 0 ? 0 : 1) + ' ' + p(x1, y1) });
      const ux = -Math.sin(a1), uy = -dir * Math.cos(a1);
      head(x1 + ux * 4, y1 + uy * 4, ux, uy, 9, 'swirl-head');
    }
  }

  // Tangential inlet jets on a circle of radius rp around (cx, cy).
  function jets(r, cx, cy, rp, shown, dir, maxLen) {
    const jetLen = r.okJet ? Math.max(6, Math.min(maxLen, r.vin / 3 * maxLen)) : 0;
    for (let i = 0; i < shown; i++) {
      const a = Math.PI / 2 + i * 2 * Math.PI / shown + (shown === 4 ? Math.PI / 4 : 0);
      const x = cx + rp * Math.cos(a), y = cy - dir * rp * Math.sin(a);
      const ux = -Math.sin(a), uy = -dir * Math.cos(a);
      if (jetLen > 0) {
        el('path', { class: 'jet', d: 'M' + p(x, y) + ' L' + p(x + ux * (jetLen - 6), y + uy * (jetLen - 6)) });
        head(x + ux * jetLen, y + uy * jetLen, ux, uy, 8, 'jet-head');
      }
      el('circle', { cx: x, cy: y, r: 3.5, class: 'nozzle' });
    }
  }

  function swirlSpan(r, scale) { return Math.max(10, Math.min(110, r.vMid / 0.6 * 110)) * scale * Math.PI / 180; }

  function dimLine(x0, x1, y, text) {
    el('path', { class: 'dim', d: 'M' + p(x0, y) + ' L' + p(x1, y) +
      ' M' + p(x0, y - 5) + ' L' + p(x0, y + 5) + ' M' + p(x1, y - 5) + ' L' + p(x1, y + 5) });
    label((x0 + x1) / 2, y - 8, text);
  }

  function fishScale(r, x, y, spanPx) {
    if (r.L > 0 && r.span > 0) {
      const lenPx = Math.max(6, Math.min(80, r.L / r.span * spanPx));
      fish(x + lenPx / 2, y, lenPx);
    }
  }

  function depthTxt(r) { return r.d > 0 ? ' · depth ' + inUnitOf('depth', r.d) : ''; }

  function drawRound(r, cx, cy, R) {
    el('circle', { cx: cx, cy: cy, r: R, class: 'tank-water' });
    el('circle', { cx: cx, cy: cy, r: R, class: 'tank-line' });
    dimLine(cx - R, cx + R, cy - R - 12, r.D > 0 ? 'D ' + inUnitOf('diameter', r.D) + depthTxt(r) : 'Tank (top view)');
    if (r.okJet) {
      swirl(cx, cy, R * 0.76, 3, swirlSpan(r, 1), 0.3, 1);
      swirl(cx, cy, R * 0.5, 2, swirlSpan(r, 0.8), 1.2, 1);
    }
    el('circle', { cx: cx, cy: cy, r: 7, class: 'drain' });
    const shown = Math.min(r.n, 12);
    if (shown > 0) jets(r, cx, cy, R - 12, shown, 1, 50);
    if (r.n > 12) label(cx, cy + R + 22, r.n + ' ports (12 drawn)');
    fishScale(r, cx, cy + R * 0.3, 2 * R);
  }

  function drawSquare(r, cx, cy, R) {
    const rx = r.B > 0 ? Math.min(R, r.Rc / r.B * 2 * R) : 0;
    el('rect', { x: cx - R, y: cy - R, width: 2 * R, height: 2 * R, rx: rx, class: 'tank-water' });
    el('rect', { x: cx - R, y: cy - R, width: 2 * R, height: 2 * R, rx: rx, class: 'tank-line' });
    dimLine(cx - R, cx + R, cy - R - 12, r.B > 0 ? 'side ' + inUnitOf('side', r.B) + ' · corner ' + inUnitOf('corner', r.Rc) + depthTxt(r) : 'Tank (top view)');
    if (r.okJet) {
      swirl(cx, cy, R * 0.72, 3, swirlSpan(r, 1), 0.3, 1);
      swirl(cx, cy, R * 0.46, 2, swirlSpan(r, 0.8), 1.2, 1);
    }
    el('circle', { cx: cx, cy: cy, r: 7, class: 'drain' });
    const shown = Math.min(r.n, 12);
    // ports on the largest circle that fits inside the rounded square
    if (shown > 0) jets(r, cx, cy, R - 12, shown, 1, 44);
    if (r.n > 12) label(cx, cy + R + 22, r.n + ' ports (12 drawn)');
    fishScale(r, cx, cy + R * 0.3, 2 * R);
  }

  // Rectangular tank drawn lengthwise across the full width. Returns the y of its bottom edge.
  function drawRect(r) {
    const maxDraw = 8;
    const cells = r.short > 0 ? r.cells : 4;
    const drawn = Math.min(cells, maxDraw);
    const ratio = cells > maxDraw ? drawn * r.aspect : (r.short > 0 ? r.long / r.short : 4);
    let w = 440, h = w / ratio;
    if (h > 170) { h = 170; w = h * ratio; }
    const x0 = 240 - w / 2, y0 = 58;
    el('rect', { x: x0, y: y0, width: w, height: h, class: 'tank-water' });
    const cellW = w / drawn;
    for (let i = 1; i < drawn; i++) el('line', { x1: x0 + i * cellW, y1: y0, x2: x0 + i * cellW, y2: y0 + h, class: 'cell-line' });
    el('rect', { x: x0, y: y0, width: w, height: h, class: 'tank-line' });
    label(240, 30, r.short > 0 ? inUnitOf('rlen', r.long) + ' × ' + inUnitOf('rwid', r.short) + depthTxt(r) : 'Tank (top view)');
    if (r.short > 0) label(240, 46, r.cells + ' rotating cell' + (r.cells > 1 ? 's' : '') + (cells > maxDraw ? ' (' + maxDraw + ' drawn)' : '') + (r.cells > 1 ? ', neighbours turn opposite ways' : ''));
    const cr = Math.min(cellW, h) / 2;
    const perCell = r.n > 0 ? Math.min(Math.max(1, Math.round(r.portsCell)), 6) : 0;
    for (let i = 0; i < drawn; i++) {
      const ccx = x0 + cellW * (i + 0.5), ccy = y0 + h / 2;
      const dir = i % 2 ? -1 : 1;   // neighbouring cells counter-rotate
      if (r.okJet && cr > 18) swirl(ccx, ccy, cr * 0.6, 2, swirlSpan(r, 0.9), 0.3, dir);
      el('circle', { cx: ccx, cy: ccy, r: Math.max(3, Math.min(7, cr * 0.12)), class: 'drain' });
      if (perCell > 0) jets(r, ccx, ccy, cr - 9, perCell, dir, Math.max(10, Math.min(40, cr * 0.55)));
    }
    fishScale(r, x0 + cellW / 2, y0 + h * 0.8, h);
    return y0 + h;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const cx = 128, cy = 166, R = 108;
    let dy = 0;
    if (shape === 'square') drawSquare(r, cx, cy, R);
    else if (shape === 'rect') dy = drawRect(r) - 10;
    else drawRound(r, cx, cy, R);
    // rectangular tanks fill the top, so the gauges move below them to the left edge
    root = dy ? el('g', { transform: 'translate(-242,' + dy.toFixed(1) + ')' }) : svg;
    svg.setAttribute('viewBox', '0 0 480 ' + (dy ? Math.ceil(310 + dy) : 320));

    // ----- Right panel -----
    const X0 = 262, W = 200;

    // inlet jet arrow
    label(X0, 40, 'Inlet jet', 'start', 'title-text');
    if (r.okJet) {
      const jl = Math.max(14, Math.min(W - 8, r.vin / 3 * (W - 8)));
      el('path', { class: 'jet', d: 'M' + p(X0, 52) + ' L' + p(X0 + jl - 8, 52) });
      head(X0 + jl, 52, 1, 0, 10, 'jet-head');
      label(X0, 72, fmtV(r.vin), 'start');
    } else label(X0, 60, '–', 'start');

    // tank velocity gauge with self-cleaning band
    label(X0, 100, 'Tank velocity (estimate)', 'start', 'title-text');
    const vMax = Math.max(0.6, r.okJet ? r.vHigh * 1.15 : 0);
    const gx = function (v) { return X0 + Math.min(1, v / vMax) * W; };
    el('rect', { class: 'track', x: X0, y: 110, width: W, height: 16, rx: 4 });
    el('rect', { class: 'band', x: gx(CLEAN_LOW), y: 110, width: gx(CLEAN_HIGH) - gx(CLEAN_LOW), height: 16 });
    if (r.okJet) {
      el('rect', { class: 'range', x: gx(r.vLow), y: 113, width: Math.max(2, gx(r.vHigh) - gx(r.vLow)), height: 10, rx: 3 });
    }
    label(X0, 140, '0', 'start');
    label(X0 + W, 140, fmt(vNum(vMax), vNum(vMax) >= 10 ? 0 : 2) + ' ' + vUnit(), 'end');
    el('rect', { class: 'band', x: X0, y: 149, width: 12, height: 10 });
    label(X0 + 17, 158, 'self-cleaning > 15–30 cm/s', 'start');
    el('rect', { class: 'range', x: X0, y: 167, width: 12, height: 10, rx: 2 });
    label(X0 + 17, 176, r.okJet ? 'estimate ' + fmtVRange(r.vLow, r.vHigh) : 'estimate –', 'start');

    // fish-length scale: distance water moves in 1 s vs fish lengths
    label(X0, 206, 'Water travel in 1 s vs fish', 'start', 'title-text');
    if (r.okJet && r.L > 0) {
      const scale = (W - 4) / Math.max(r.vHigh, r.L * 1.2);   // px per m
      const travel = Math.max(2, r.vMid * scale);
      el('rect', { class: 'track', x: X0, y: 216, width: W, height: 12, rx: 3 });
      el('rect', { class: 'range', x: X0, y: 218, width: travel, height: 8, rx: 2 });
      const fl = r.L * scale;
      if (fl >= 6) {
        // fish laid nose to tail, clipped at the 1-second travel distance
        const defs = el('defs', {});
        const clip = el('clipPath', { id: 'travel-clip' }, undefined, defs);
        el('rect', { x: X0 - 1, y: 228, width: travel + 1, height: 40 }, undefined, clip);
        const g = el('g', { 'clip-path': 'url(#travel-clip)' });
        const nFish = Math.min(Math.ceil(r.blMid), 60);
        for (let i = 0; i < nFish; i++) fishIn(g, X0 + fl * (i + 1), 246, fl * 0.96);
        el('path', { class: 'dim', d: 'M' + p(X0 + travel, 214) + ' L' + p(X0 + travel, 264) });
      }
      label(X0, 282, fmtV(r.vMid) + ' ≈ ' + r.blMid.toFixed(2) + ' fish lengths/s', 'start');
      const bs = blStatus(r);
      label(X0, 300, (bs.ok ? 'within' : r.blHigh < BL_LOW ? 'slower than' : r.blLow > BL_HIGH ? 'faster than' : 'partly outside') + ' the 0.5–2 BL/s guide', 'start');
    } else {
      label(X0, 232, r.okJet ? 'Enter fish length' : '–', 'start');
    }
    root = svg;
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'Internal Tank Velocity Calculator',
      'Tank: ' + (shape === 'square' ? 'square, side ' + typed('side') + ', corner radius ' + typed('corner')
        : shape === 'rect' ? 'rectangular, ' + typed('rlen') + ' × ' + typed('rwid') + ' (' + r.cells + ' rotating cell' + (r.cells > 1 ? 's' : '') + ')'
        : 'circular, D ' + typed('diameter')) + ', water depth ' + typed('depth') + ', inflow ' + typed('flow'),
      'Inlet: ' + typed('ports') + ' × ' + typed('portd') + '; fish length ' + typed('fish')
    ];
    if (r.okJet) {
      lines.push('Inlet jet velocity: ' + fmtV(r.vin));
      lines.push('Estimated mean ' + (shape === 'rect' ? 'cell' : 'tank') + ' velocity (' + fmt(r.kLow * 100, 1) + '–' + fmt(r.kHigh * 100, 1) + '% of jet, rule of thumb): ' + fmtVRange(r.vLow, r.vHigh));
      if (isFinite(r.blLow)) lines.push('Fish swimming speed: ' + r.blLow.toFixed(2) + '–' + r.blHigh.toFixed(2) + ' BL/s (guide 0.5–2)');
      lines.push('Self-cleaning (> 15–30 cm/s): ' + cleanStatus(r).text);
      lines.push('Jet velocity head (minimum): ' + inUnitOf('depth', r.head));
    }
    if (r.vol > 0) lines.push('Tank volume: ' + fmt(r.vol) + ' m³ (' + fmt(r.vol * 1000, 0) + ' L)');
    if (isFinite(r.hrt)) lines.push('Retention time: ' + fmtTime(r.hrt) + ' (' + fmt(3600 / r.hrt, 2) + ' exchanges/h)');
    if (isFinite(r.ratio)) lines.push({ round: 'Diameter', square: 'Side', rect: 'Cell width' }[shape] + ':depth ' + fmt(r.ratio, 1) + ':1 (guide 5–10)');
    if (r.vTarget > 0) {
      lines.push('For target ' + fmtV(r.vTarget) + ': jet ' + fmtVRange(r.reqLow, r.reqHigh) +
        (isFinite(r.dpSmall) ? ', ports ' + fmt(CalcUnits.fromBase('portd', r.dpSmall)) + '–' + inUnitOf('portd', r.dpBig) : ''));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  shapeButtons.forEach(function (b) { b.addEventListener('click', function () { setShape(b.dataset.shape); render(); }); });
  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Internal Tank Velocity Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    vout.value = 'cmps';
    applyDefaults();
    setShape('round');
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const prm = CalcShare.readParams();
    applyDefaults();
    if (prm.vout && CalcUnits.unitDef('velocity', prm.vout)) vout.value = prm.vout;
    setShape(prm.shape);
    FIELDS.forEach(function (f) {
      const u = prm[f + '_u'];
      if (f === 'target' && prm.target === 'off') CalcUnits.set(f, '', u);
      else if (prm[f] !== undefined && (prm[f] === '' || isFinite(parseFloat(prm[f])))) CalcUnits.set(f, prm[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    render();
  })();
})();
