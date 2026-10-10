// Grow Bed Ratio Calculator: fish tank vs media grow bed volume, live SVG, shareable URL state.
(function () {
  'use strict';

  // Rule-of-thumb range (grow bed volume per unit of fish tank volume), see article sources.
  const RANGE_LOW = 1;   // 1 : 1
  const RANGE_HIGH = 2;  // 1 : 2
  const SUMP_HIGH = 3;   // 1 : 3, only with a sump

  const DEFAULTS = {
    tank: [1000, 'L'], beds: [2, ''], blen: [200, 'cm'], bwid: [100, 'cm'],
    bdep: [30, 'cm'], bvol: [1200, 'L'], custom: [1.25, '']
  };
  const FIELDS = Object.keys(DEFAULTS);
  const TARGETS = ['1', '1.5', '2', 'custom'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const modeButtons = document.querySelectorAll('#mode-group button');
  const targetSel = $('target');
  const outV = $('outv');
  const outA = $('outa');

  let mode = 'dims';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function vol(L) { return fmt(CalcUnits.convert('volume', L, 'L', outV.value)) + ' ' + CalcUnits.label('volume', outV.value); }
  function area(m2) { return fmt(CalcUnits.convert('area', m2, 'm2', outA.value)) + ' ' + CalcUnits.label('area', outA.value); }
  function ratioText(r) { return '1 : ' + fmt(r, r >= 10 ? 1 : 2); }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }

  function bedCount() {
    const n = parseFloat($('beds').value);
    return isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function targetRatio() {
    if (targetSel.value === 'custom') {
      const c = parseFloat($('custom').value);
      return isFinite(c) && c > 0 ? c : 0;
    }
    return parseFloat(targetSel.value);
  }

  // ---------- Math (L, m, m²) ----------
  function compute() {
    const tankL = CalcUnits.base('tank');
    const D = CalcUnits.base('bdep');
    let bedL = 0, areaM2 = 0, n = 0, L = 0, W = 0;
    if (mode === 'dims') {
      n = bedCount();
      L = CalcUnits.base('blen');
      W = CalcUnits.base('bwid');
      areaM2 = n * L * W;
      bedL = areaM2 * D * 1000;
    } else {
      bedL = CalcUnits.base('bvol');
      areaM2 = D > 0 ? bedL / 1000 / D : 0;
    }
    const rt = targetRatio();
    const ratio = tankL > 0 ? bedL / tankL : NaN;
    return {
      tankL: tankL, bedL: bedL, areaM2: areaM2, D: D, n: n, L: L, W: W, rt: rt, ratio: ratio,
      needL: tankL * rt,
      supportL: rt > 0 ? bedL / rt : NaN,
      areaNeed: D > 0 ? tankL * rt / 1000 / D : NaN
    };
  }

  function zone(r) {
    if (r < RANGE_LOW - 1e-9) return { ok: false, text: 'Below the 1:1 to 1:2 rule-of-thumb range: beds are small for this tank.' };
    if (r <= RANGE_HIGH + 1e-9) return { ok: true, text: 'Inside the 1:1 to 1:2 rule-of-thumb range for media beds.' };
    if (r <= SUMP_HIGH + 1e-9) return { ok: false, text: 'Above 1:2: workable with a sump, but check the feed rate can supply this much bed.' };
    return { ok: false, text: 'Well above 1:3: beds are very large for this tank; nutrients will likely run short.' };
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for.split(' ').indexOf(m) === -1;
    });
    $('depth-hint').textContent = m === 'vol'
      ? 'Used to work out the bed area. FAO suggests about 30 cm (12 in).'
      : 'FAO suggests about 30 cm (12 in) of media.';
  }

  function syncCustom() { $('custom-field').hidden = targetSel.value !== 'custom'; }

  function visible(id) { return !$(id).closest('.field').hidden; }

  function getState() {
    const st = { mode: mode, target: targetSel.value, outv: outV.value, outa: outA.value };
    FIELDS.forEach(function (f) {
      if (!visible(f)) return;
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1] || undefined); });
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    const msgs = [];
    const hasTank = r.tankL > 0;
    const hasBed = r.bedL > 0;
    const ok = hasTank && hasBed;

    if (!hasTank) msgs.push('Enter the fish tank volume.');
    if (!hasBed) msgs.push(mode === 'dims' ? 'Enter the number of beds and every bed dimension.' : 'Enter the total grow bed volume.');
    if (mode === 'vol' && !(r.D > 0)) msgs.push('Enter the bed depth to see the grow area.');
    if (!(r.rt > 0)) msgs.push('Enter a target ratio greater than zero.');
    if (mode === 'dims' && parseFloat($('beds').value) > 0 && Math.abs(parseFloat($('beds').value) - r.n) > 1e-9) {
      msgs.push('Number of beds rounded to ' + r.n + '.');
    }
    if (r.D > 0 && r.D < 0.15) msgs.push('Media depth is shallow: FAO suggests about 30 cm so there is room for the dry, root and solids zones.');
    if (msgs.length) { notice.textContent = msgs.join(' '); notice.hidden = false; } else notice.hidden = true;

    const status = $('r-status');
    if (ok) {
      const z = zone(r.ratio);
      $('r-ratio').textContent = ratioText(r.ratio);
      status.textContent = z.text;
      status.className = 'status ' + (z.ok ? 'ok' : 'warn');
    } else {
      $('r-ratio').textContent = '–';
      status.textContent = '';
      status.className = 'status';
    }

    const tOK = r.rt > 0;
    $('r-bvol').textContent = hasBed ? vol(r.bedL) : '–';
    $('r-need').textContent = hasTank && tOK ? vol(r.needL) + ' (' + ratioText(r.rt) + ')' : '–';
    if (ok && tOK) {
      const diff = r.bedL - r.needL;
      $('r-diff').textContent = Math.abs(diff) < 1e-6 * r.needL ? 'on target'
        : vol(Math.abs(diff)) + (diff > 0 ? ' more than needed' : ' short');
    } else $('r-diff').textContent = '–';
    $('r-support').textContent = hasBed && tOK ? vol(r.supportL) : '–';
    $('r-area').textContent = r.areaM2 > 0 ? area(r.areaM2) : '–';
    $('r-aneed').textContent = hasTank && tOK && r.D > 0 ? area(r.areaNeed) : '–';

    $('viz-caption').textContent = ok
      ? 'Shape areas are proportional to volume. Tank ' + vol(r.tankL) + ' · beds ' + vol(r.bedL) + ' · ' + ratioText(r.ratio)
      : 'Enter the tank and bed sizes to draw them';

    drawViz(r, ok);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }

  function drawViz(r, ok) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (ok) drawShapes(r);
    drawRangeBar(ok ? r.ratio : NaN, r.rt);
  }

  // Tank as a square and each bed as a rectangle (aspect = bed length : depth),
  // all with area proportional to volume at one common scale.
  function drawShapes(r) {
    const top = 30, bottom = 190;             // drawing band for shapes (labels above)
    const H = bottom - top;
    const left = 16, right = VW - 16;
    const W = right - left;
    const midGap = 36, g = 8;

    const MAXDRAW = 24;
    let n = mode === 'dims' ? r.n : 1;
    const combined = n > MAXDRAW;
    if (combined) n = 1;
    const perBed = r.bedL / n;
    let aspect;
    if (mode === 'dims' && !combined) aspect = r.L / r.D;
    else aspect = r.D > 0 ? Math.sqrt(r.areaM2 / n) / r.D : 4;
    if (!isFinite(aspect) || aspect <= 0) aspect = 4;
    aspect = Math.max(0.6, Math.min(8, aspect));

    const a = Math.sqrt(r.tankL);              // tank side in sqrt(L) units
    const bh = Math.sqrt(perBed / aspect);
    const bw = bh * aspect;

    let best = { k: 0, c: 1 };
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      const kW = (W - midGap - (c - 1) * g) / (a + c * bw);
      const kH = Math.min(H / a, (H - (rows - 1) * g) / (rows * bh));
      const k = Math.min(kW, kH);
      if (k > best.k) best = { k: k, c: c };
    }
    const k = best.k;
    if (!(k > 0)) return;
    const c = best.c, rows = Math.ceil(n / c);
    const tankS = a * k, bW = bw * k, bH = bh * k;
    const blockW = c * bW + (c - 1) * g, blockH = rows * bH + (rows - 1) * g;
    const totalW = tankS + midGap + blockW;
    const x0 = left + (W - totalW) / 2;

    // Tank
    const ty = bottom - tankS;
    el('rect', { class: 'tank-glass', x: x0, y: ty, width: tankS, height: tankS });
    el('rect', { class: 'water', x: x0, y: ty + tankS * 0.08, width: tankS, height: tankS * 0.92 });
    el('rect', { class: 'tank-line', x: x0, y: ty, width: tankS, height: tankS });
    label(x0 + tankS / 2, ty - 8, 'Fish tank', 'middle', 'name-text');
    label(x0 + tankS / 2, bottom + 16, vol(r.tankL));

    // Beds
    const bx0 = x0 + tankS + midGap;
    const by0 = bottom - blockH;
    for (let i = 0; i < n; i++) {
      const col = i % c, row = Math.floor(i / c);
      const x = bx0 + col * (bW + g), y = by0 + row * (bH + g);
      el('rect', { class: 'bed', x: x, y: y, width: bW, height: bH });
      el('rect', { class: 'media', x: x + 1, y: y + Math.min(bH * 0.25, 6), width: Math.max(0, bW - 2), height: Math.max(0, bH - 1 - Math.min(bH * 0.25, 6)) });
      // a few sprouts along the top edge
      const sprouts = Math.max(1, Math.min(6, Math.floor(bW / 24)));
      if (bH >= 8) {
        let d = '';
        for (let s = 0; s < sprouts; s++) {
          const sx = x + bW * (s + 0.5) / sprouts, sy = y + 2;
          const h = Math.min(10, bH * 0.6 + 4);
          d += 'M' + sx + ',' + sy + ' L' + sx + ',' + (sy - h) + ' M' + sx + ',' + (sy - h * 0.55) + ' l-4,-3 M' + sx + ',' + (sy - h * 0.75) + ' l4,-3 ';
        }
        el('path', { class: 'plant', d: d });
      }
    }
    const bedName = combined ? r.n + ' grow beds (combined)' : (n === 1 ? (mode === 'dims' ? '1 grow bed' : 'Grow beds') : n + ' grow beds');
    label(bx0 + blockW / 2, by0 - 18, bedName, 'middle', 'name-text');
    label(bx0 + blockW / 2, bottom + 16, vol(r.bedL) + (n > 1 ? ' (' + n + ' × ' + vol(perBed) + ')' : ''));
  }

  function drawRangeBar(ratio, rt) {
    const y = 244, h = 14, x0 = 36, x1 = VW - 36;
    const max = SUMP_HIGH;
    const X = function (v) { return x0 + (x1 - x0) * Math.min(v, max) / max; };
    el('rect', { class: 'zone-low', x: X(0), y: y, width: X(RANGE_LOW) - X(0), height: h });
    el('rect', { class: 'zone-ok', x: X(RANGE_LOW), y: y, width: X(RANGE_HIGH) - X(RANGE_LOW), height: h });
    el('rect', { class: 'zone-mid', x: X(RANGE_HIGH), y: y, width: X(SUMP_HIGH) - X(RANGE_HIGH), height: h });
    el('rect', { class: 'tank-line', x: x0, y: y, width: x1 - x0, height: h, rx: 2 });
    [0, 0.5, 1, 1.5, 2, 2.5, 3].forEach(function (v) {
      el('line', { class: 'dim', x1: X(v), y1: y + h, x2: X(v), y2: y + h + 4 });
      label(X(v), y + h + 16, v === 0 ? '0' : '1:' + v);
    });
    label((x0 + x1) / 2, y + h + 34, '▼ your ratio · ┆ target · green = 1:1–1:2 rule of thumb', 'middle');

    if (rt > 0 && rt <= max * 1.0001) {
      el('line', { class: 'target-line', x1: X(rt), y1: y - 6, x2: X(rt), y2: y + h + 2 });
    }
    if (isFinite(ratio)) {
      const over = ratio > max;
      const mx = X(ratio);
      el('path', { class: 'marker', d: 'M' + mx + ',' + (y - 1) + ' l-6,-9 h12 z' });
      let tx = mx, anchor = 'middle';
      if (mx > x1 - 30) { anchor = 'end'; tx = mx + 6; }
      if (mx < x0 + 30) { anchor = 'start'; tx = mx - 6; }
      label(tx, y - 13, (over ? '› ' : '') + ratioText(ratio), anchor, 'marker-text');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const beds = mode === 'dims'
      ? r.n + ' bed(s), each ' + typed('blen') + ' × ' + typed('bwid') + ' × ' + typed('bdep') + ' deep'
      : 'Total ' + typed('bvol') + ', ' + typed('bdep') + ' deep';
    const lines = [
      'Grow Bed Ratio Calculator',
      'Fish tank: ' + typed('tank'),
      'Grow beds: ' + beds,
      'Target ratio: ' + (r.rt > 0 ? ratioText(r.rt) : '–')
    ];
    if (r.tankL > 0 && r.bedL > 0) {
      lines.push('Ratio (fish tank : grow bed): ' + ratioText(r.ratio) + ' – ' + zone(r.ratio).text);
      lines.push('Total grow bed volume: ' + vol(r.bedL));
      if (r.rt > 0) {
        lines.push('Grow bed volume needed at target: ' + vol(r.needL));
        lines.push('Fish tank supported by these beds at target: ' + vol(r.supportL));
      }
      if (r.areaM2 > 0) lines.push('Grow bed area: ' + area(r.areaM2));
      if (r.rt > 0 && r.D > 0) lines.push('Bed area needed at target: ' + area(r.areaNeed));
    }
    lines.push('Rule of thumb only; check the feed rate ratio for a precise design.');
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); render(); });
  });
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  targetSel.addEventListener('change', function () { syncCustom(); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Grow Bed Ratio Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    targetSel.value = '1';
    outV.value = 'L'; outV.dataset.prev = 'L';
    outA.value = 'm2'; outA.dataset.prev = 'm2';
    syncCustom();
    setMode('dims');
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
    if (TARGETS.indexOf(p.target) !== -1) targetSel.value = p.target;
    if (p.outv && CalcUnits.unitDef('volume', p.outv)) outV.value = p.outv;
    if (p.outa && CalcUnits.unitDef('area', p.outa)) outA.value = p.outa;
    syncCustom();
    setMode(p.mode === 'vol' ? 'vol' : 'dims');
    render();
  })();
})();
