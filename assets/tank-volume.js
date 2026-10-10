// Tank Volume Calculator: geometry, live SVG diagram, shareable URL state.
(function () {
  'use strict';

  const TO_M = { in: 0.0254, ft: 0.3048, cm: 0.01, m: 1 };
  const L_PER = { L: 1, gal: 3.785411784, impgal: 4.54609, ft3: 28.316846592, m3: 1000 };
  const OUT_LABEL = { L: 'L', gal: 'US gal', impgal: 'imp gal', ft3: 'ft³', m3: 'm³' };
  const DENSITY = { fresh: 0.998, salt: 1.025 }; // kg/L at 20 °C
  const KG_PER_LB = 0.45359237;

  const DEFAULTS = {
    in: { length: 48, width: 24, height: 24, diameter: 36, hlength: 48, wall: 36, coneh: 12, depth: 20 },
    ft: { length: 4, width: 2, height: 2, diameter: 3, hlength: 4, wall: 3, coneh: 1, depth: 1.7 },
    cm: { length: 120, width: 60, height: 60, diameter: 90, hlength: 120, wall: 90, coneh: 30, depth: 50 },
    m: { length: 1.2, width: 0.6, height: 0.6, diameter: 0.9, hlength: 1.2, wall: 0.9, coneh: 0.3, depth: 0.5 }
  };

  const DIM_FIELDS = ['length', 'width', 'height', 'diameter', 'hlength', 'wall', 'coneh', 'depth'];

  const $ = function (id) { return document.getElementById(id); };
  const inputs = {};
  DIM_FIELDS.forEach(function (f) { inputs[f] = $(f); });
  const unitSel = $('unit');
  const waterSel = $('water');
  const outSel = $('out');
  const shapeButtons = document.querySelectorAll('#shape-group button');
  const svg = $('viz');

  let shape = 'rect';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function num(field) {
    const v = parseFloat(inputs[field].value);
    return isFinite(v) && v > 0 ? v : 0;
  }

  // ---------- Geometry (all in meters, returns m³) ----------
  function compute() {
    const k = TO_M[unitSel.value];
    const d = num('depth') * k;
    let cap = 0, water = 0, fullHeight = 0;

    if (shape === 'rect') {
      const L = num('length') * k, W = num('width') * k, H = num('height') * k;
      fullHeight = H;
      cap = L * W * H;
      water = L * W * Math.min(d, H);
    } else if (shape === 'cyl') {
      const r = num('diameter') * k / 2, H = num('height') * k;
      fullHeight = H;
      cap = Math.PI * r * r * H;
      water = Math.PI * r * r * Math.min(d, H);
    } else if (shape === 'cone') {
      const r = num('diameter') * k / 2, Hw = num('wall') * k, hc = num('coneh') * k;
      fullHeight = Hw + hc;
      const coneVol = Math.PI * r * r * hc / 3;
      cap = coneVol + Math.PI * r * r * Hw;
      const dd = Math.min(d, fullHeight);
      if (hc > 0 && dd <= hc) {
        const rw = r * dd / hc;
        water = Math.PI * rw * rw * dd / 3;
      } else {
        water = coneVol + Math.PI * r * r * (dd - hc);
      }
    } else if (shape === 'hcyl') {
      const r = num('diameter') * k / 2, L = num('hlength') * k;
      fullHeight = 2 * r;
      cap = Math.PI * r * r * L;
      water = segmentArea(r, Math.min(d, 2 * r)) * L;
    }

    return { capM3: cap, waterM3: water, overfill: d > fullHeight + 1e-9 && fullHeight > 0, fullHeight: fullHeight / k };
  }

  function segmentArea(r, d) {
    if (r <= 0 || d <= 0) return 0;
    if (d >= 2 * r) return Math.PI * r * r;
    return r * r * Math.acos((r - d) / r) - (r - d) * Math.sqrt(2 * r * d - d * d);
  }

  // ---------- UI state ----------
  function setShape(s) {
    shape = s;
    shapeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shape === s)); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for.split(' ').indexOf(s) === -1;
    });
    $('depth-hint').textContent = s === 'cone'
      ? 'Measured from the tip of the cone.'
      : 'Measured from the bottom of the tank.';
  }

  function updateUnitLabels() {
    document.querySelectorAll('[data-unit]').forEach(function (el) { el.textContent = unitSel.value; });
  }

  function getState() {
    const st = { shape: shape, unit: unitSel.value, water: waterSel.value, out: outSel.value };
    const visible = DIM_FIELDS.filter(function (f) {
      const wrap = inputs[f].closest('.field');
      return !wrap.hidden;
    });
    visible.forEach(function (f) { st[f] = inputs[f].value; });
    return st;
  }

  function applyDefaults(unit) {
    const d = DEFAULTS[unit];
    DIM_FIELDS.forEach(function (f) { inputs[f].value = d[f]; });
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const out = outSel.value;
    const waterL = r.waterM3 * 1000;
    const capL = r.capM3 * 1000;
    const hasData = capL > 0;
    const fill = hasData ? Math.min(100, waterL / capL * 100) : 0;
    const kg = waterL * DENSITY[waterSel.value];

    const notice = $('notice');
    if (!hasData) {
      notice.textContent = 'Enter every tank dimension to see the result.';
      notice.hidden = false;
    } else if (r.overfill) {
      notice.textContent = 'Water depth is more than the tank height (' + fmt(r.fullHeight) + ' ' + unitSel.value + '). Showing a full tank.';
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }

    $('r-water').textContent = hasData ? fmt(waterL / L_PER[out]) + ' ' + OUT_LABEL[out] : '–';
    $('r-cap').textContent = hasData ? fmt(capL / L_PER[out]) + ' ' + OUT_LABEL[out] : '–';
    $('r-fill').textContent = hasData ? fmt(fill, 1) + '%' : '–';
    $('r-fillbar').style.width = fill + '%';
    $('r-weight').textContent = hasData ? fmt(kg) + ' kg · ' + fmt(kg / KG_PER_LB) + ' lb' : '–';

    const alts = ['L', 'gal', 'm3', 'ft3', 'impgal'].filter(function (u) { return u !== out; }).slice(0, 2);
    $('r-alt').textContent = hasData
      ? alts.map(function (u) { return fmt(waterL / L_PER[u]) + ' ' + OUT_LABEL[u]; }).join(' · ')
      : '–';

    $('viz-caption').textContent = hasData
      ? fmt(waterL / L_PER[out]) + ' ' + OUT_LABEL[out] + ' of ' + fmt(capL / L_PER[out]) + ' ' + OUT_LABEL[out] + ' · ' + fmt(fill, 0) + '% full'
      : 'Enter dimensions to draw the tank';

    drawViz();
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 320;
  const PAD = { l: 92, r: 100, t: 28, b: 44 };

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }

  function label(x, y, text, anchor, cls) {
    el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }

  function dimLabel(v) {
    return fmt(v) + ' ' + unitSel.value;
  }

  function depthMarker(xLine, yTop, yWater, yBottom, depthVal) {
    el('line', { x1: xLine, y1: yWater, x2: xLine + 14, y2: yWater, class: 'depth-line' });
    el('line', { x1: xLine + 7, y1: yWater, x2: xLine + 7, y2: yBottom, class: 'depth-line' });
    label(xLine + 18, (yWater + yBottom) / 2 + 4, 'd ' + dimLabel(depthVal), 'start', 'depth-text');
  }

  function drawViz() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const availW = VW - PAD.l - PAD.r;
    const availH = VH - PAD.t - PAD.b;
    const depth = num('depth');

    if (shape === 'rect') drawRect(availW, availH, depth);
    else if (shape === 'cyl') drawCyl(availW, availH, depth, false);
    else if (shape === 'cone') drawCyl(availW, availH, depth, true);
    else drawHcyl(availW, availH, depth);
  }

  function drawRect(availW, availH, depth) {
    const L = num('length'), W = num('width'), H = num('height');
    if (!(L && W && H)) return;
    const ox = W * 0.5, oy = W * 0.32; // oblique projection of the width
    const s = Math.min(availW / (L + ox), availH / (H + oy));
    const x0 = PAD.l + (availW - (L + ox) * s) / 2;
    const yb = PAD.t + oy * s + (availH - (H + oy) * s) / 2 + H * s;
    const Ls = L * s, Hs = H * s, oxs = ox * s, oys = oy * s;
    const d = Math.min(depth, H) * s;
    const yw = yb - d;

    // back edges
    el('path', { class: 'tank-back', d: 'M' + (x0 + oxs) + ',' + (yb - oys) + ' L' + (x0 + oxs) + ',' + (yb - Hs - oys) +
      ' M' + (x0 + oxs) + ',' + (yb - oys) + ' L' + (x0 + Ls + oxs) + ',' + (yb - oys) +
      ' M' + (x0 + oxs) + ',' + (yb - oys) + ' L' + x0 + ',' + yb });
    // glass
    el('path', { class: 'tank-glass', d: 'M' + x0 + ',' + yb + ' L' + (x0 + Ls) + ',' + yb + ' L' + (x0 + Ls + oxs) + ',' + (yb - oys) +
      ' L' + (x0 + Ls + oxs) + ',' + (yb - Hs - oys) + ' L' + (x0 + oxs) + ',' + (yb - Hs - oys) + ' L' + x0 + ',' + (yb - Hs) + 'Z' });

    if (d > 0) {
      el('rect', { class: 'water', x: x0, y: yw, width: Ls, height: d });
      el('path', { class: 'water-side', d: 'M' + (x0 + Ls) + ',' + yb + ' L' + (x0 + Ls + oxs) + ',' + (yb - oys) +
        ' L' + (x0 + Ls + oxs) + ',' + (yw - oys) + ' L' + (x0 + Ls) + ',' + yw + 'Z' });
      el('path', { class: 'water-top', d: 'M' + x0 + ',' + yw + ' L' + (x0 + Ls) + ',' + yw + ' L' + (x0 + Ls + oxs) + ',' + (yw - oys) +
        ' L' + (x0 + oxs) + ',' + (yw - oys) + 'Z' });
    }

    // front edges
    el('path', { class: 'tank-line', d: 'M' + x0 + ',' + (yb - Hs) + ' L' + x0 + ',' + yb + ' L' + (x0 + Ls) + ',' + yb + ' L' + (x0 + Ls) + ',' + (yb - Hs) + 'Z' +
      ' M' + (x0 + Ls) + ',' + yb + ' L' + (x0 + Ls + oxs) + ',' + (yb - oys) + ' L' + (x0 + Ls + oxs) + ',' + (yb - Hs - oys) +
      ' L' + (x0 + oxs) + ',' + (yb - Hs - oys) + ' L' + x0 + ',' + (yb - Hs) +
      ' M' + (x0 + Ls) + ',' + (yb - Hs) + ' L' + (x0 + Ls + oxs) + ',' + (yb - Hs - oys) });

    // dimensions
    el('path', { class: 'dim', d: 'M' + x0 + ',' + (yb + 12) + ' L' + (x0 + Ls) + ',' + (yb + 12) });
    label(x0 + Ls / 2, yb + 28, 'L ' + dimLabel(L));
    el('path', { class: 'dim', d: 'M' + (x0 - 12) + ',' + yb + ' L' + (x0 - 12) + ',' + (yb - Hs) });
    label(x0 - 16, yb - Hs / 2 + 4, 'H ' + dimLabel(H), 'end');
    label(x0 + oxs / 2 - 4, yb - Hs - oys / 2 - 6, 'W ' + dimLabel(W), 'end');
    if (d > 0) depthMarker(x0 + Ls + oxs + 6, yb - Hs, yw - oys, yb - oys, Math.min(depth, H));
  }

  function drawCyl(availW, availH, depth, cone) {
    const D = num('diameter');
    const Hw = cone ? num('wall') : num('height');
    const hc = cone ? num('coneh') : 0;
    if (!(D && (Hw || hc))) return;
    const totalH = Hw + hc;
    const ryRatio = 0.18;
    const s = Math.min(availW / D, availH / (totalH + D * ryRatio * 2));
    const rx = D * s / 2, ry = D * ryRatio * s / 2;
    const cx = PAD.l + availW / 2;
    const yTop = PAD.t + ry + (availH - (totalH * s + 2 * ry)) / 2;
    const yWallBottom = yTop + Hw * s;          // where straight wall ends
    const yBottom = yWallBottom + hc * s;       // tip of cone (or flat bottom)
    const dd = Math.min(depth, totalH);
    const yw = yBottom - dd * s;
    const left = cx - rx, right = cx + rx;

    // glass body
    if (cone) {
      el('path', { class: 'tank-glass', d: 'M' + left + ',' + yTop + ' L' + left + ',' + yWallBottom + ' L' + cx + ',' + yBottom +
        ' L' + right + ',' + yWallBottom + ' L' + right + ',' + yTop + 'Z' });
    } else {
      el('path', { class: 'tank-glass', d: 'M' + left + ',' + yTop + ' L' + left + ',' + yBottom +
        ' A' + rx + ',' + ry + ' 0 0 0 ' + right + ',' + yBottom + ' L' + right + ',' + yTop + 'Z' });
    }

    // back half of bottom rim
    if (!cone) el('path', { class: 'tank-back', d: 'M' + left + ',' + yBottom + ' A' + rx + ',' + ry + ' 0 0 1 ' + right + ',' + yBottom });
    else el('path', { class: 'tank-back', d: 'M' + left + ',' + yWallBottom + ' A' + rx + ',' + ry + ' 0 0 1 ' + right + ',' + yWallBottom });

    // water
    if (dd > 0) {
      if (cone && yw >= yWallBottom) {
        const rw = hc > 0 ? rx * (yBottom - yw) / (hc * s) : rx;
        const ryw = ry * rw / rx;
        el('path', { class: 'water', d: 'M' + cx + ',' + yBottom + ' L' + (cx - rw) + ',' + yw +
          ' A' + rw + ',' + ryw + ' 0 0 0 ' + (cx + rw) + ',' + yw + 'Z' });
        el('ellipse', { class: 'water-top', cx: cx, cy: yw, rx: rw, ry: ryw });
      } else if (cone) {
        el('path', { class: 'water', d: 'M' + cx + ',' + yBottom + ' L' + left + ',' + yWallBottom + ' L' + left + ',' + yw +
          ' A' + rx + ',' + ry + ' 0 0 0 ' + right + ',' + yw + ' L' + right + ',' + yWallBottom + 'Z' });
        el('ellipse', { class: 'water-top', cx: cx, cy: yw, rx: rx, ry: ry });
      } else {
        el('path', { class: 'water', d: 'M' + left + ',' + yw + ' L' + left + ',' + yBottom +
          ' A' + rx + ',' + ry + ' 0 0 0 ' + right + ',' + yBottom + ' L' + right + ',' + yw +
          ' A' + rx + ',' + ry + ' 0 0 1 ' + left + ',' + yw + 'Z' });
        el('ellipse', { class: 'water-top', cx: cx, cy: yw, rx: rx, ry: ry });
      }
    }

    // outline
    el('ellipse', { class: 'tank-line', cx: cx, cy: yTop, rx: rx, ry: ry });
    if (cone) {
      el('path', { class: 'tank-line', d: 'M' + left + ',' + yTop + ' L' + left + ',' + yWallBottom + ' L' + cx + ',' + yBottom +
        ' L' + right + ',' + yWallBottom + ' L' + right + ',' + yTop +
        ' M' + left + ',' + yWallBottom + ' A' + rx + ',' + ry + ' 0 0 0 ' + right + ',' + yWallBottom });
    } else {
      el('path', { class: 'tank-line', d: 'M' + left + ',' + yTop + ' L' + left + ',' + yBottom +
        ' A' + rx + ',' + ry + ' 0 0 0 ' + right + ',' + yBottom + ' L' + right + ',' + yTop });
    }

    // dimensions
    el('path', { class: 'dim', d: 'M' + left + ',' + yTop + ' L' + right + ',' + yTop });
    label(cx, yTop - ry - 6, 'D ' + dimLabel(D));
    el('path', { class: 'dim', d: 'M' + (left - 12) + ',' + yTop + ' L' + (left - 12) + ',' + yWallBottom });
    label(left - 16, (yTop + yWallBottom) / 2 + 4, (cone ? 'wall ' : 'H ') + dimLabel(Hw), 'end');
    if (cone && hc > 0) {
      el('path', { class: 'dim', d: 'M' + (left - 12) + ',' + yWallBottom + ' L' + (left - 12) + ',' + yBottom });
      label(left - 16, (yWallBottom + yBottom) / 2 + 4, 'cone ' + dimLabel(hc), 'end');
    }
    if (dd > 0) depthMarker(right + 8, yTop, yw, yBottom, dd);
  }

  function drawHcyl(availW, availH, depth) {
    const D = num('diameter'), L = num('hlength');
    if (!(D && L)) return;
    const exRatio = 0.22; // end ellipse half-width as a fraction of D
    const s = Math.min(availW / (L + D * exRatio * 2), availH / D);
    const ex = D * exRatio * s, r = D * s / 2;
    const x0 = PAD.l + ex + (availW - (L * s + 2 * ex)) / 2;
    const x1 = x0 + L * s;
    const cy = PAD.t + availH / 2;
    const yTop = cy - r, yBottom = cy + r;
    const dd = Math.min(depth, D);
    const yw = yBottom - dd * s;

    const clipId = 'hcyl-clip';
    const defs = el('defs', {});
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const body = document.createElementNS(NS, 'path');
    body.setAttribute('d', 'M' + x0 + ',' + yTop + ' L' + x1 + ',' + yTop + ' A' + ex + ',' + r + ' 0 0 1 ' + x1 + ',' + yBottom +
      ' L' + x0 + ',' + yBottom + ' A' + ex + ',' + r + ' 0 0 1 ' + x0 + ',' + yTop + 'Z');
    clip.appendChild(body);
    defs.appendChild(clip);

    el('path', { class: 'tank-glass', d: body.getAttribute('d') });
    el('path', { class: 'tank-back', d: 'M' + x0 + ',' + yTop + ' A' + ex + ',' + r + ' 0 0 1 ' + x0 + ',' + yBottom });

    if (dd > 0) {
      el('rect', { class: 'water', x: x0 - ex - 2, y: yw, width: L * s + 2 * ex + 4, height: yBottom - yw + 2, 'clip-path': 'url(#' + clipId + ')' });
      // water surface across the visible end cap
      const t = (yw - cy) / r;
      const half = ex * Math.sqrt(Math.max(0, 1 - t * t));
      el('path', { class: 'water-top', d: 'M' + x0 + ',' + yw + ' L' + x1 + ',' + yw + ' L' + (x1 + half) + ',' + yw });
    }

    el('path', { class: 'tank-line', d: body.getAttribute('d') });
    el('ellipse', { class: 'tank-line', cx: x1, cy: cy, rx: ex, ry: r });

    el('path', { class: 'dim', d: 'M' + x0 + ',' + (yBottom + 12) + ' L' + x1 + ',' + (yBottom + 12) });
    label((x0 + x1) / 2, yBottom + 28, 'L ' + dimLabel(L));
    el('path', { class: 'dim', d: 'M' + (x0 - ex - 10) + ',' + yTop + ' L' + (x0 - ex - 10) + ',' + yBottom });
    label(x0 - ex - 14, cy + 4, 'D ' + dimLabel(D), 'end');
    if (dd > 0) depthMarker(x1 + ex + 6, yTop, yw, yBottom, dd);
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const out = outSel.value;
    const waterL = r.waterM3 * 1000, capL = r.capM3 * 1000;
    const shapeName = { rect: 'Rectangular', cyl: 'Round', cone: 'Cone-bottom', hcyl: 'Horizontal cylinder' }[shape];
    const u = unitSel.value;
    const dims = {
      rect: 'L ' + num('length') + ' × W ' + num('width') + ' × H ' + num('height') + ' ' + u,
      cyl: 'D ' + num('diameter') + ' × H ' + num('height') + ' ' + u,
      cone: 'D ' + num('diameter') + ', wall ' + num('wall') + ', cone ' + num('coneh') + ' ' + u,
      hcyl: 'D ' + num('diameter') + ' × L ' + num('hlength') + ' ' + u
    }[shape];
    const kg = waterL * DENSITY[waterSel.value];
    return [
      'Tank Volume Calculator',
      shapeName + ' tank: ' + dims + ', water depth ' + num('depth') + ' ' + u,
      'Water volume: ' + fmt(waterL / L_PER[out]) + ' ' + OUT_LABEL[out] + ' (' + fmt(waterL) + ' L)',
      'Total capacity: ' + fmt(capL / L_PER[out]) + ' ' + OUT_LABEL[out],
      'Fill level: ' + fmt(capL ? waterL / capL * 100 : 0, 1) + '%',
      'Water weight (' + waterSel.value + 'water): ' + fmt(kg) + ' kg / ' + fmt(kg / KG_PER_LB) + ' lb',
      CalcShare.buildUrl(getState())
    ].join('\n');
  }

  // ---------- Events ----------
  shapeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setShape(b.dataset.shape); render(); });
  });

  DIM_FIELDS.forEach(function (f) { inputs[f].addEventListener('input', render); });
  [waterSel, outSel].forEach(function (s) { s.addEventListener('change', render); });

  unitSel.addEventListener('change', function () {
    // Convert existing values so the tank stays the same size in the new unit.
    const from = unitSel.dataset.prev || 'in';
    const factor = TO_M[from] / TO_M[unitSel.value];
    DIM_FIELDS.forEach(function (f) {
      const v = parseFloat(inputs[f].value);
      if (isFinite(v)) inputs[f].value = +(v * factor).toPrecision(4);
    });
    unitSel.dataset.prev = unitSel.value;
    updateUnitLabels();
    render();
  });

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Tank Volume Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    unitSel.value = 'in';
    unitSel.dataset.prev = 'in';
    waterSel.value = 'fresh';
    outSel.value = 'gal';
    applyDefaults('in');
    setShape('rect');
    updateUnitLabels();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    if (p.unit && TO_M[p.unit]) unitSel.value = p.unit;
    if (p.water && DENSITY[p.water]) waterSel.value = p.water;
    if (p.out && L_PER[p.out]) outSel.value = p.out;
    applyDefaults(unitSel.value);
    DIM_FIELDS.forEach(function (f) {
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) inputs[f].value = p[f];
    });
    unitSel.dataset.prev = unitSel.value;
    setShape(['rect', 'cyl', 'cone', 'hcyl'].indexOf(p.shape) !== -1 ? p.shape : 'rect');
    updateUnitLabels();
    render();
  })();
})();
