// Biofilter Surface Area Calculator: TAN from feed, biofilm area, media volume, vessel fill.
(function () {
  'use strict';

  // Areal nitrification rate is not in units.js; add it here (base g TAN / m² / day).
  if (!CalcUnits.GROUPS.arealrate) {
    CalcUnits.GROUPS.arealrate = {
      base: 'gm2d',
      units: [
        { id: 'gm2d', label: 'g/m²/day', factor: 1 },
        { id: 'mgm2d', label: 'mg/m²/day', factor: 0.001 },
        { id: 'gft2d', label: 'g/ft²/day', factor: 1 / 0.09290304 }
      ]
    };
  }

  const TAN_FACTOR = 0.092; // 0.16 × 0.8 × 0.8 × 0.9 (Timmons et al. 2002; Ebeling et al. 2006)

  // Specific surface areas in m²/m³. maxFill = fraction of vessel the media may occupy.
  const MEDIA = {
    k1: { ssa: 500, moving: true, name: 'K1-type moving-bed carrier', hint: 'Protected surface of K1-type carrier (Rusten et al., 2006).' },
    bioballs: { ssa: 250, moving: false, name: 'Plastic bio-balls', hint: 'Typical manufacturer range 200–300 m²/m³; check your product.' },
    lava: { ssa: 300, moving: false, name: 'Volcanic gravel / lava rock', hint: 'Volcanic tuff, 300 m²/m³ (Somerville et al., 2014).' },
    clay: { ssa: 250, moving: false, name: 'Expanded clay pebbles', hint: 'Commonly quoted figure (rule of thumb), not a measured value.' },
    sand: { ssa: 3600, moving: false, name: 'Sand, 1 mm grains', hint: 'Geometric estimate 6(1 − ε)/d with ε = 0.4, d = 1 mm.' },
    custom: { ssa: null, moving: false, name: 'Custom media', hint: 'Enter the value from the media data sheet.' }
  };
  const MOVING_MAX = 0.70;   // Rusten et al. 2006: keep carrier fill below 70%
  const MOVING_NORMAL = [0.50, 0.65];

  const DEFAULTS = {
    method: 'feed', media: 'k1',
    feed: [1, 'kg'], protein: [35, ''], tan: [32.2, 'g'], rate: [0.5, 'gm2d'],
    safety: [1.25, ''], ssa: [500, 'm2m3'], vessel: [300, 'L'],
    outArea: 'm2', outVol: 'L', outTan: 'g'
  };
  const FIELDS = ['feed', 'protein', 'tan', 'rate', 'safety', 'ssa', 'vessel'];

  const $ = function (id) { return document.getElementById(id); };
  const methodSel = $('method');
  const mediaSel = $('media');
  const outArea = $('out-area'), outVol = $('out-vol'), outTan = $('out-tan');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function rawNum(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }
  function typed(id) {
    const v = rawNum(id);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? fmt(v, 4) : '–') + (u ? ' ' + u : '');
  }
  function showArea(m2) { return fmt(CalcUnits.convert('area', m2, 'm2', outArea.value)) + ' ' + CalcUnits.label('area', outArea.value); }
  function showVol(L) { return fmt(CalcUnits.convert('volume', L, 'L', outVol.value)) + ' ' + CalcUnits.label('volume', outVol.value); }
  function showTan(kg) { return fmt(CalcUnits.convert('mass', kg, 'kg', outTan.value)) + ' ' + CalcUnits.label('mass', outTan.value) + '/day'; }

  // ---------- Calculation (base units: kg, g/m²/d, m²/m³, L) ----------
  function compute() {
    const method = methodSel.value;
    const r = { method: method, errors: [], warnings: [] };
    if (method === 'feed') {
      const feedKg = CalcUnits.base('feed');
      const prot = rawNum('protein');
      r.feedKg = feedKg; r.protein = prot;
      if (!(feedKg > 0)) r.errors.push('Enter the daily feed.');
      if (!(prot > 0)) r.errors.push('Enter the feed protein %.');
      else if (prot > 100) r.errors.push('Feed protein cannot be more than 100%.');
      else if (prot < 15 || prot > 65) r.warnings.push('Feed protein of ' + fmt(prot, 1) + '% is unusual; most fish feeds are 25–55%.');
      r.tanKg = feedKg * (prot / 100) * TAN_FACTOR;
    } else {
      r.tanKg = CalcUnits.base('tan');
      if (!(r.tanKg > 0)) r.errors.push('Enter the TAN produced per day.');
    }
    r.rate = CalcUnits.base('rate');
    if (!(r.rate > 0)) r.errors.push('Enter the areal nitrification rate.');
    else if (r.rate < 0.1 || r.rate > 1.2) r.warnings.push('A nitrification rate of ' + fmt(r.rate, 3) + ' g/m²/day is outside the 0.1–1.2 g/m²/day usually reported for aquaculture biofilters.');

    const sfRaw = rawNum('safety');
    r.sf = isFinite(sfRaw) && sfRaw > 0 ? sfRaw : 1;
    if (isFinite(sfRaw) && sfRaw > 0 && sfRaw < 1) r.warnings.push('A safety factor below 1 makes the filter smaller than the calculation says it needs.');

    r.ssa = CalcUnits.base('ssa');
    if (!(r.ssa > 0)) r.errors.push('Enter the media specific surface area.');

    r.vesselL = CalcUnits.base('vessel');
    r.media = MEDIA[mediaSel.value] || MEDIA.custom;
    r.moving = r.media.moving;

    r.ok = r.errors.length === 0;
    if (!r.ok) return r;
    r.tanG = r.tanKg * 1000;
    r.areaBare = r.tanG / r.rate;            // m²
    r.area = r.areaBare * r.sf;              // m²
    r.mediaL = r.area / r.ssa * 1000;        // L
    r.maxFill = r.moving ? MOVING_MAX : 1;
    if (r.vesselL > 0) {
      r.fill = r.mediaL / r.vesselL;
      r.capArea = r.vesselL / 1000 * r.maxFill * r.ssa; // area the vessel can hold at max fill
    }
    return r;
  }

  // ---------- UI state ----------
  function setMethod(m) {
    methodSel.value = m;
    document.querySelectorAll('[data-method]').forEach(function (el) { el.hidden = el.dataset.method !== m; });
  }

  function setMediaHint() {
    const m = MEDIA[mediaSel.value] || MEDIA.custom;
    $('ssa-hint').textContent = m.hint;
  }

  // Selecting a preset writes its m²/m³ into the input, in the unit the user chose.
  function applyMediaPreset() {
    const m = MEDIA[mediaSel.value];
    if (m && m.ssa) {
      const u = CalcUnits.unit('ssa');
      $('ssa').value = +CalcUnits.convert('specificarea', m.ssa, 'm2m3', u).toPrecision(6);
    }
    setMediaHint();
  }

  function getState() {
    const st = { method: methodSel.value, media: mediaSel.value, oa: outArea.value, ov: outVol.value, ot: outTan.value };
    FIELDS.forEach(function (f) {
      const wrap = $(f).closest('.field');
      if (wrap.hidden) return;
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1] || undefined); });
    mediaSel.value = DEFAULTS.media;
    outArea.value = DEFAULTS.outArea; outVol.value = DEFAULTS.outVol; outTan.value = DEFAULTS.outTan;
    setMethod(DEFAULTS.method);
    setMediaHint();
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    const status = $('r-status');
    const msgs = r.ok ? r.warnings.slice() : r.errors;

    if (r.ok && r.vesselL > 0 && r.fill > 1) {
      msgs.push('The media (' + showVol(r.mediaL) + ') does not fit in the ' + typed('vessel') + ' vessel. Use a bigger vessel or media with more surface per volume.');
    }
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    if (!r.ok) {
      ['r-area', 'r-tan', 'r-vol', 'r-fill'].forEach(function (id) { $(id).textContent = '–'; });
      $('r-area-sub').textContent = '';
      $('r-fillbar').style.width = '0%';
      status.textContent = '';
      status.className = 'status';
      $('viz-caption').textContent = 'Enter the inputs to size the biofilter';
      drawViz(null);
      CalcShare.writeParams(getState());
      return;
    }

    $('r-area').textContent = showArea(r.area);
    $('r-area-sub').textContent = r.sf !== 1
      ? showArea(r.areaBare) + ' before the ×' + fmt(r.sf, 2) + ' safety factor'
      : 'No safety factor applied';
    $('r-tan').textContent = showTan(r.tanKg);
    $('r-vol').textContent = showVol(r.mediaL);

    if (r.vesselL > 0) {
      $('r-fill').textContent = fmt(r.fill * 100, 1) + '%';
      $('r-fillbar').style.width = Math.min(100, r.fill * 100) + '%';
      let cls = 'ok', txt;
      if (r.moving) {
        if (r.fill > MOVING_MAX) { cls = 'warn'; txt = 'Above the 70% maximum for moving-bed carriers; they will not circulate freely.'; }
        else if (r.fill > MOVING_NORMAL[1]) { txt = 'Within the 70% limit, above the usual 50–65% fill.'; }
        else if (r.fill >= MOVING_NORMAL[0]) { txt = 'Within the usual 50–65% fill for moving-bed carriers.'; }
        else { txt = 'Below 50% fill: room to add carriers as the fish grow.'; }
      } else {
        if (r.fill > 1) { cls = 'warn'; txt = 'Media does not fit in the vessel.'; }
        else { txt = 'Static media fits in the vessel (' + fmt((1 - r.fill) * 100, 0) + '% of the vessel left).'; }
      }
      status.textContent = txt;
      status.className = 'status ' + cls;
    } else {
      $('r-fill').textContent = 'enter vessel volume';
      $('r-fillbar').style.width = '0%';
      status.textContent = '';
      status.className = 'status';
    }

    $('viz-caption').textContent = showArea(r.area) + ' of biofilm needed · ' + showVol(r.mediaL) + ' of media' +
      (r.vesselL > 0 ? ' · ' + fmt(r.fill * 100, 0) + '% of the vessel' : '');

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';

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

  // Smallest "nice" square size (m²) so that n squares fit in maxCells.
  function niceCell(total, maxCells) {
    const steps = [1, 2, 5];
    let mag = Math.pow(10, Math.floor(Math.log10(Math.max(total, 1e-9) / maxCells)) - 1);
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < steps.length; j++) {
        const c = steps[j] * mag;
        if (total / c <= maxCells) return c;
      }
      mag *= 10;
    }
    return total / maxCells;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!r) return;

    // ----- Left: area squares -----
    const COLS = 10, ROWS = 10, CELL = 21, GAP = 3;
    const gx = 18, gy = 46;
    const hasCap = r.capArea > 0;
    const total = Math.max(r.area, hasCap ? r.capArea : 0);
    const cell = niceCell(total, COLS * ROWS);
    const needCells = r.area / cell;
    const capCells = hasCap ? r.capArea / cell : 0;
    const shown = Math.ceil(Math.max(needCells, capCells) - 1e-9);
    const rows = Math.max(1, Math.min(ROWS, Math.ceil(shown / COLS)));

    label(gx, 24, 'Biofilm area', 'start', 'head-text');
    const cellLabel = fmt(CalcUnits.convert('area', cell, 'm2', outArea.value), 3) + ' ' + CalcUnits.label('area', outArea.value);
    label(gx, 39, 'each square = ' + cellLabel, 'start');

    const fullNeed = Math.floor(needCells + 1e-9);
    for (let i = 0; i < rows * COLS; i++) {
      const cx = gx + (i % COLS) * (CELL + GAP);
      const cy = gy + Math.floor(i / COLS) * (CELL + GAP);
      const short = hasCap && i + 1 > capCells + 1e-9; // this square lies beyond what the vessel can hold
      let cls;
      if (i < fullNeed) cls = short ? 'cell-short' : 'cell-need';
      else if (i < capCells - 1e-9) cls = 'cell-cap';
      else cls = 'cell-empty';
      el('rect', { x: cx, y: cy, width: CELL, height: CELL, rx: 3, class: cls });
      const frac = needCells - i; // partial last needed square
      if (i === fullNeed && frac > 1e-6) {
        el('rect', { x: cx, y: cy, width: CELL * frac, height: CELL, rx: 2, class: short ? 'cell-short' : 'cell-need' });
      }
    }
    const gridBottom = gy + rows * (CELL + GAP);
    // legend
    let ly = gridBottom + 16;
    el('rect', { x: gx, y: ly - 10, width: 12, height: 12, rx: 2, class: 'cell-need' });
    label(gx + 18, ly, 'needed ' + showArea(r.area), 'start', 'big-text');
    if (hasCap) {
      ly += 18;
      el('rect', { x: gx, y: ly - 10, width: 12, height: 12, rx: 2, class: 'cell-cap' });
      label(gx + 18, ly, 'vessel holds up to ' + showArea(r.capArea), 'start');
      if (r.area > r.capArea) {
        ly += 18;
        el('rect', { x: gx, y: ly - 10, width: 12, height: 12, rx: 2, class: 'cell-short' });
        label(gx + 18, ly, 'shortfall ' + showArea(r.area - r.capArea), 'start', 'max-text');
      }
    }

    // ----- Right: vessel with media -----
    const vx = 300, vw = 150, vTop = 60, vBot = 270;
    const vh = vBot - vTop;
    label(vx + vw / 2, 24, 'Filter vessel', 'middle', 'head-text');

    let fill, mediaTopY;
    if (r.vesselL > 0) {
      fill = Math.min(r.fill, 1);
      label(vx + vw / 2, 39, typed('vessel'), 'middle');
    } else {
      fill = 0;
      label(vx + vw / 2, 39, 'enter vessel volume', 'middle');
    }
    const waterY = vTop + 10;

    el('rect', { x: vx, y: vTop, width: vw, height: vh, class: 'tank-glass' });
    // water
    el('rect', { x: vx, y: waterY, width: vw, height: vBot - waterY, class: 'water', style: 'fill-opacity:.35' });
    el('line', { x1: vx, y1: waterY, x2: vx + vw, y2: waterY, class: 'depth-line' });

    // media (as a settled bed from the bottom; moving-bed carriers are mixed in use)
    if (fill > 0) {
      const mh = (vBot - waterY) * fill;
      mediaTopY = vBot - mh;
      el('rect', { x: vx, y: mediaTopY, width: vw, height: mh, class: 'media-bg' });
      const clipId = 'media-clip';
      const defs = el('defs', {});
      const clip = el('clipPath', { id: clipId }, undefined, defs);
      el('rect', { x: vx, y: mediaTopY, width: vw, height: mh }, undefined, clip);
      const g = el('g', { 'clip-path': 'url(#' + clipId + ')' });
      const R = r.moving ? 6 : (mediaSel.value === 'sand' ? 2.2 : 5);
      const step = R * 2.6;
      let row = 0;
      for (let y = vBot - R - 1; y > mediaTopY - R; y -= step * 0.87) {
        const off = (row % 2) * step / 2;
        for (let x = vx + R + 2 + off; x < vx + vw - 1; x += step) {
          if (r.moving) {
            el('circle', { cx: x, cy: y, r: R, class: 'media' }, undefined, g);
            el('path', { d: 'M' + (x - R) + ',' + y + 'H' + (x + R) + 'M' + x + ',' + (y - R) + 'V' + (y + R), class: 'media', style: 'stroke-width:1' }, undefined, g);
          } else {
            el('circle', { cx: x, cy: y, r: R, class: 'media' }, undefined, g);
          }
        }
        row++;
      }
      // fill marker
      el('line', { x1: vx + vw + 4, y1: mediaTopY, x2: vx + vw + 4, y2: vBot, class: 'depth-line' });
      label(vx + vw / 2, Math.max(mediaTopY - 6, waterY + 22), fmt(r.fill * 100, 0) + '% media', 'middle', 'depth-text');
    }

    // max fill line for moving bed
    if (r.moving && r.vesselL > 0) {
      const my = vBot - (vBot - waterY) * MOVING_MAX;
      el('line', { x1: vx - 4, y1: my, x2: vx + vw + 4, y2: my, class: 'max-line' });
      label(vx + vw + 8, my + 4, 'max 70%', 'start', 'max-text');
    }

    el('path', { class: 'tank-line', d: 'M' + vx + ',' + vTop + ' L' + vx + ',' + vBot + ' L' + (vx + vw) + ',' + vBot + ' L' + (vx + vw) + ',' + vTop });
    label(vx + vw / 2, vBot + 20, 'media ' + showVol(r.mediaL), 'middle', 'big-text');
    if (r.vesselL > 0 && r.fill > 1) label(vx + vw / 2, vBot + 36, 'overflows vessel', 'middle', 'max-text');
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Biofilter Surface Area Calculator'];
    if (methodSel.value === 'feed') {
      lines.push('Daily feed: ' + typed('feed') + '/day, protein ' + typed('protein') + '%');
    } else {
      lines.push('TAN produced (entered): ' + typed('tan') + '/day');
    }
    lines.push('Nitrification rate: ' + typed('rate') + ', safety factor ×' + fmt(r.sf, 2));
    lines.push('Media: ' + r.media.name + ', ' + typed('ssa'));
    if (r.vesselL > 0) lines.push('Vessel volume: ' + typed('vessel'));
    if (r.ok) {
      lines.push('TAN produced: ' + showTan(r.tanKg));
      lines.push('Biofilm area needed: ' + showArea(r.area));
      lines.push('Media volume needed: ' + showVol(r.mediaL));
      if (r.vesselL > 0) lines.push('Media fill of vessel: ' + fmt(r.fill * 100, 1) + '%');
    } else {
      lines.push(r.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { $(f).addEventListener('input', function () {
    if (f === 'ssa' && mediaSel.value !== 'custom') {
      const m = MEDIA[mediaSel.value];
      const base = CalcUnits.base('ssa');
      if (!m.ssa || Math.abs(base - m.ssa) > 0.5) { mediaSel.value = 'custom'; setMediaHint(); }
    }
    render();
  }); });
  methodSel.addEventListener('change', function () {
    // carry the feed-based estimate across when switching to a direct TAN value
    if (methodSel.value === 'direct') {
      const est = CalcUnits.base('feed') * (rawNum('protein') / 100) * TAN_FACTOR;
      if (isFinite(est) && est > 0) $('tan').value = +CalcUnits.fromBase('tan', est).toPrecision(4);
    }
    setMethod(methodSel.value);
    render();
  });
  mediaSel.addEventListener('change', function () { applyMediaPreset(); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Biofilter Surface Area Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.media && MEDIA[p.media]) mediaSel.value = p.media;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (p[f] !== undefined && p[f] === '') CalcUnits.set(f, '', u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    // preset value in the restored unit if no explicit ssa in the link
    if (p.ssa === undefined && MEDIA[mediaSel.value].ssa) applyMediaPreset();
    [[outArea, p.oa, 'area'], [outVol, p.ov, 'volume'], [outTan, p.ot, 'mass']].forEach(function (a) {
      if (a[1] && CalcUnits.unitDef(a[2], a[1])) a[0].value = a[1];
    });
    setMethod(p.method === 'direct' ? 'direct' : 'feed');
    setMediaHint();
    render();
  })();
})();
