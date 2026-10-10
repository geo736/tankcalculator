// Growing Media Fill Calculator: bed volume, bags, cost, dry/saturated weight, live SVG.
(function () {
  'use strict';

  const WATER_KG_PER_L = 0.998; // freshwater at 20 °C (USGS)
  const KGM2_TO_LBFT2 = 0.09290304 / 0.45359237; // kg/m² → lb/ft²

  // Typical values (rule of thumb; see the table in the article). density kg/m³, porosity %.
  const MEDIA = {
    leca: { name: 'Expanded clay (LECA)', density: 350, porosity: 40,
      hint: 'Light, pH-neutral and reusable. The usual choice for aquaponic flood-and-drain beds.',
      bg: '#b8693d', fg: '#d48a57', edge: '#7d4223' },
    lava: { name: 'Lava rock / scoria', density: 900, porosity: 45,
      hint: 'Rough, porous surface; heavier than clay. Rinse off the dust before use.',
      bg: '#5e2a24', fg: '#8a3e31', edge: '#3a1915' },
    gravel: { name: 'River gravel', density: 1650, porosity: 38,
      hint: 'Very heavy. Use siliceous (non-limestone) gravel; limestone and marble raise pH.',
      bg: '#7f7c75', fg: '#aaa69c', edge: '#5b5852' },
    perlite: { name: 'Perlite', density: 100, porosity: 70,
      hint: 'Floats when flooded. Better suited to drip, wick and bucket systems than flood-and-drain beds.',
      bg: '#d9d6cd', fg: '#f6f4ef', edge: '#a29e93' },
    coir: { name: 'Coco coir', density: 70, porosity: 90,
      hint: 'Hydroponic substrate; holds a lot of water and breaks down, so rarely used in aquaponic beds. Enter the expanded volume as the bag size.',
      bg: '#6b4024', fg: '#9a6236', edge: '#4a2b17' },
    rockwool: { name: 'Rockwool', density: 70, porosity: 95,
      hint: 'Hydroponic substrate (cubes, slabs, granulate). Pre-soak and adjust pH as the manufacturer says.',
      bg: '#c7bb86', fg: '#e2d8a6', edge: '#968a57' },
    custom: { name: 'Custom media', density: 500, porosity: 40,
      hint: 'Enter the bulk density and pore space from your bag label or data sheet.',
      bg: '#8d9894', fg: '#b3bcb8', edge: '#5f6966' }
  };

  const DEFAULTS = {
    length: [120, 'cm'], width: [60, 'cm'], diameter: [45, 'cm'], height: [35, 'cm'], fill: [30, 'cm'],
    bag: [50, 'L'], beds: '1', price: '30', extra: '5', media: 'leca', vout: 'L', mout: 'kg'
  };
  const LEN_FIELDS = ['length', 'width', 'diameter', 'height', 'fill'];

  const $ = function (id) { return document.getElementById(id); };
  const shapeButtons = document.querySelectorAll('#shape-group button');
  const mediaSel = $('media');
  const voutSel = $('vout');
  const moutSel = $('mout');
  const svg = $('viz');

  let shape = 'rect';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function money(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function vol(L) {
    const u = voutSel.value;
    return fmt(CalcUnits.convert('volume', L, 'L', u)) + ' ' + CalcUnits.label('volume', u);
  }
  function mass(kg) {
    const u = moutSel.value;
    return fmt(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + ' ' + CalcUnits.unitLabel(id);
  }
  function inUnitOf(id, base) {
    return fmt(CalcUnits.fromBase(id, base)) + ' ' + CalcUnits.unitLabel(id);
  }
  function rawNum(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }

  // ---------- Calculation (base units: m, L, kg, kg/m³) ----------
  function compute() {
    const H = CalcUnits.base('height');
    const fillIn = CalcUnits.base('fill');
    const d = H > 0 ? Math.min(fillIn, H) : fillIn;
    let area = 0; // footprint, m²
    if (shape === 'rect') area = CalcUnits.base('length') * CalcUnits.base('width');
    else { const r = CalcUnits.base('diameter') / 2; area = Math.PI * r * r; }

    const bedsRaw = rawNum('beds');
    const beds = isFinite(bedsRaw) && bedsRaw >= 1 ? Math.floor(bedsRaw) : 0;
    const extraRaw = rawNum('extra');
    const extra = isFinite(extraRaw) && extraRaw > 0 ? extraRaw : 0;
    const rho = CalcUnits.base('density');             // kg/m³
    const porRaw = rawNum('porosity');
    const por = isFinite(porRaw) ? Math.min(Math.max(porRaw, 0), 100) / 100 : NaN;
    const bagL = CalcUnits.base('bag');
    const priceRaw = rawNum('price');
    const price = isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : NaN;

    const bedL1 = area * d * 1000;                     // one bed, L
    const bedL = bedL1 * beds;
    const buyL = bedL * (1 + extra / 100);
    const bags = bagL > 0 ? Math.ceil(buyL / bagL - 1e-9) : NaN;
    const dryKg = buyL / 1000 * rho;
    const waterL = isFinite(por) ? por * bedL : NaN;
    const satKg = dryKg + waterL * WATER_KG_PER_L;
    const sat1Kg = beds > 0 ? (dryKg + waterL * WATER_KG_PER_L) / beds : NaN;
    const loadKgm2 = area > 0 ? sat1Kg / area : NaN;

    return {
      H: H, fillIn: fillIn, d: d, area: area, beds: beds, extra: extra, rho: rho, por: por,
      bagL: bagL, price: price, bedL1: bedL1, bedL: bedL, buyL: buyL, bags: bags,
      dryKg: dryKg, waterL: waterL, satKg: satKg, sat1Kg: sat1Kg, loadKgm2: loadKgm2,
      overfill: H > 0 && fillIn > H + 1e-9
    };
  }

  function depthBand(dM) {
    const cm = dM * 100;
    if (cm < 15) return 'Shallower than typical (under 15 cm)';
    if (cm < 25) return 'Leafy greens band (~15–20 cm)';
    if (cm <= 35) return 'Standard ~30 cm bed, fits fruiting crops';
    return 'Deeper than typical (over 35 cm)';
  }

  // ---------- UI state ----------
  function setShape(s) {
    shape = s;
    shapeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shape === s)); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for.split(' ').indexOf(s) === -1;
    });
  }

  function roundSig(v) { return +(+v).toPrecision(4); }

  function applyPreset(key) {
    const m = MEDIA[key];
    const du = CalcUnits.unit('density') || 'kgm3';
    CalcUnits.set('density', roundSig(CalcUnits.convert('density', m.density, 'kgm3', du)), du);
    CalcUnits.set('porosity', m.porosity);
  }

  function presetEdited() {
    const m = MEDIA[mediaSel.value];
    if (!m || mediaSel.value === 'custom') return false;
    const rho = CalcUnits.base('density');
    const por = rawNum('porosity');
    return Math.abs(rho - m.density) > m.density * 0.002 || Math.abs(por - m.porosity) > 0.05;
  }

  function getState() {
    const st = { shape: shape, media: mediaSel.value, vout: voutSel.value, mout: moutSel.value };
    LEN_FIELDS.concat(['bag', 'density']).forEach(function (f) {
      if ($(f).closest('.field').hidden) return;
      st[f] = $(f).value;
      st[f + '_u'] = CalcUnits.unit(f);
    });
    ['beds', 'porosity', 'price', 'extra'].forEach(function (f) { st[f] = $(f).value; });
    return st;
  }

  function applyDefaults() {
    LEN_FIELDS.concat(['bag']).forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    ['beds', 'price', 'extra'].forEach(function (f) { $(f).value = DEFAULTS[f]; });
    mediaSel.value = DEFAULTS.media;
    voutSel.value = DEFAULTS.vout;
    moutSel.value = DEFAULTS.mout;
    CalcUnits.set('density', MEDIA.leca.density, 'kgm3');
    CalcUnits.set('porosity', MEDIA.leca.porosity);
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const m = MEDIA[mediaSel.value] || MEDIA.custom;
    $('media-hint').textContent = m.hint;
    $('preset-hint').textContent = mediaSel.value === 'custom'
      ? 'Use your supplier’s figures.'
      : (presetEdited() ? 'Edited from the preset. ' : 'Typical values for ' + m.name + ' (rule of thumb). ') +
        'Check the bag label or data sheet.';

    const problems = [];
    if (!(r.area > 0) || !(r.fillIn > 0)) problems.push('Enter the bed size and fill depth.');
    if (!(r.beds >= 1)) problems.push('Enter at least 1 bed.');
    if (!(r.bagL > 0)) problems.push('Enter a bag size.');
    if (!(r.rho > 0)) problems.push('Enter the bulk density of the media.');
    const porRaw = rawNum('porosity');
    if (!isFinite(porRaw) || porRaw < 0 || porRaw > 100) problems.push('Pore space must be between 0 and 100%.');
    const ok = r.area > 0 && r.fillIn > 0 && r.beds >= 1;

    const notes = [];
    if (r.overfill) notes.push('Fill depth is more than the bed wall height (' + inUnitOf('fill', r.H) + '). Calculating with the bed filled to the rim.');
    if (!(r.H > 0) && ok) notes.push('Enter the bed wall height to check the fill depth against it.');
    if (rawNum('extra') > 30) notes.push('More than 30% extra is unusual; check the settling allowance.');

    const notice = $('notice');
    const msgs = problems.concat(notes);
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const vOK = ok;
    const bagOK = vOK && r.bagL > 0;
    const wOK = vOK && r.rho > 0;
    const pOK = vOK && isFinite(r.por) && porRaw >= 0 && porRaw <= 100;

    $('r-buy').textContent = vOK ? vol(r.buyL) : '–';
    $('r-bed').textContent = vOK
      ? vol(r.bedL) + (r.beds > 1 ? ' (' + vol(r.bedL1) + ' × ' + r.beds + ')' : '')
      : '–';
    if (bagOK) {
      const spare = r.bags * r.bagL - r.buyL;
      $('r-bags').textContent = r.bags + ' × ' + typed('bag') + ' (' + vol(spare) + ' spare)';
    } else {
      $('r-bags').textContent = '–';
    }
    $('r-cost').textContent = bagOK && isFinite(r.price) ? money(r.bags * r.price) : '–';
    $('r-dry').textContent = wOK ? mass(r.dryKg) : '–';
    $('r-water').textContent = pOK ? vol(r.waterL) : '–';
    $('r-sat').textContent = wOK && pOK
      ? mass(r.satKg) + (r.beds > 1 ? ' (' + mass(r.sat1Kg) + ' per bed)' : '')
      : '–';
    $('r-load').textContent = wOK && pOK && isFinite(r.loadKgm2)
      ? fmt(r.loadKgm2, 0) + ' kg/m² · ' + fmt(r.loadKgm2 * KGM2_TO_LBFT2, 1) + ' lb/ft²'
      : '–';
    $('r-depth').textContent = r.d > 0 ? depthBand(r.d) : '–';

    $('viz-caption').textContent = vOK
      ? vol(r.bedL1) + ' of media per bed' + (r.beds > 1 ? ' × ' + r.beds + ' beds' : '') +
        (bagOK ? ' · ' + r.bags + (r.bags === 1 ? ' bag' : ' bags') : '')
      : 'Enter the bed size to draw it';

    drawViz(r, m);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 320;
  const BED = { l: 62, r: 286, t: 50, b: 280 };  // bed drawing area
  const BAGS = { l: 360, r: 476, t: 40, b: 290 }; // bag stack area

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined && text !== null) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) {
    el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }

  // Seeded pseudo-random so the texture does not flicker between renders.
  function rng(seed) {
    let s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function makePattern(defs, key, m) {
    const size = 18;
    const p = el('pattern', { id: 'media-tex', patternUnits: 'userSpaceOnUse', width: size, height: size }, null, defs);
    el('rect', { width: size, height: size, fill: m.bg }, null, p);
    const rand = rng(7);
    if (key === 'leca') {
      [[4, 4, 3.8], [13, 6, 3.6], [8, 13, 4], [17, 15, 3.4], [0, 15, 3.4]].forEach(function (c) {
        el('circle', { cx: c[0], cy: c[1], r: c[2], fill: m.fg, stroke: m.edge, 'stroke-width': 0.8 }, null, p);
      });
    } else if (key === 'lava') {
      el('path', { d: 'M1 2l6-1 2 5-4 3-4-2zM10 8l6-1 2 4-3 5-5-2zM2 12l5 0 1 5-6 1z', fill: m.fg, stroke: m.edge, 'stroke-width': 0.7 }, null, p);
      [[4, 4], [13, 11], [5, 15], [15, 3]].forEach(function (c) {
        el('circle', { cx: c[0], cy: c[1], r: 0.9, fill: m.edge }, null, p);
      });
    } else if (key === 'gravel') {
      [[5, 4, 4, 3, 20], [13, 5, 3.5, 2.5, -15], [9, 12, 4.5, 3, 5], [2, 15, 2.5, 2, 0], [16, 14, 3, 2.4, 30]].forEach(function (e, i) {
        el('ellipse', { cx: e[0], cy: e[1], rx: e[2], ry: e[3], transform: 'rotate(' + e[4] + ' ' + e[0] + ' ' + e[1] + ')',
          fill: i % 2 ? m.fg : '#959189', stroke: m.edge, 'stroke-width': 0.7 }, null, p);
      });
    } else if (key === 'perlite') {
      for (let i = 0; i < 9; i++) {
        el('circle', { cx: (rand() * size).toFixed(1), cy: (rand() * size).toFixed(1), r: (1.2 + rand() * 1.6).toFixed(1),
          fill: m.fg, stroke: m.edge, 'stroke-width': 0.5 }, null, p);
      }
    } else if (key === 'coir') {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const x = rand() * size, y = rand() * size, a = rand() * Math.PI, len = 3 + rand() * 4;
        d += 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'l' + (Math.cos(a) * len).toFixed(1) + ' ' + (Math.sin(a) * len).toFixed(1);
      }
      el('path', { d: d, stroke: m.fg, 'stroke-width': 1.1, 'stroke-linecap': 'round', fill: 'none' }, null, p);
    } else if (key === 'rockwool') {
      el('path', { d: 'M0 3h18M0 8c4-2 8 2 12 0s4-1 6 0M0 13h18M0 17c5-1 9 1 18 0', stroke: m.fg, 'stroke-width': 1, fill: 'none' }, null, p);
      el('path', { d: 'M0 5h18M0 11c6 1 10-1 18 0M0 15h18', stroke: m.edge, 'stroke-width': 0.5, fill: 'none' }, null, p);
    } else {
      [[4, 4], [13, 7], [8, 14], [16, 15]].forEach(function (c) {
        el('circle', { cx: c[0], cy: c[1], r: 2.5, fill: m.fg, stroke: m.edge, 'stroke-width': 0.6 }, null, p);
      });
    }
  }

  // Draw, then crop the viewBox to the drawing so flat beds do not leave empty bands.
  function drawViz(r, m) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
    drawScene(r, m);
    let box = null;
    try { box = svg.getBBox(); } catch (e) { box = null; }
    if (box && box.height > 0) {
      const minH = 180;
      let h = Math.min(VH, Math.max(minH, box.height + 24));
      let y = box.y + box.height / 2 - h / 2;
      y = Math.max(0, Math.min(VH - h, y));
      svg.setAttribute('viewBox', '0 ' + y.toFixed(1) + ' ' + VW + ' ' + h.toFixed(1));
    }
  }

  function drawScene(r, m) {
    const defs = el('defs', {});
    makePattern(defs, mediaSel.value, m);

    const span = shape === 'rect' ? CalcUnits.base('length') : CalcUnits.base('diameter');
    const H = r.H > 0 ? r.H : r.fillIn;
    if (!(span > 0) || !(H > 0)) return;

    // ----- bed cross-section -----
    const availW = BED.r - BED.l, availH = BED.b - BED.t;
    const s = Math.min(availW / span, availH / H);
    const w = span * s, h = H * s;
    const x0 = BED.l + (availW - w) / 2;
    const yb = BED.b;
    const yTop = yb - h;
    const dS = r.d * s;
    const yFill = yb - dS;

    el('rect', { class: 'tank-glass', x: x0, y: yTop, width: w, height: h });
    if (dS > 0) {
      el('rect', { x: x0, y: yFill, width: w, height: dS, fill: 'url(#media-tex)' });
      el('line', { x1: x0, y1: yFill, x2: x0 + w, y2: yFill, stroke: m.edge, 'stroke-width': 1.5 });
    }
    if (shape === 'round') {
      const ry = Math.min(10, w * 0.12);
      el('path', { class: 'tank-back', d: 'M' + x0 + ',' + yTop + ' A' + w / 2 + ',' + ry + ' 0 0 1 ' + (x0 + w) + ',' + yTop });
      el('path', { class: 'tank-line', d: 'M' + x0 + ',' + yTop + ' L' + x0 + ',' + yb + ' L' + (x0 + w) + ',' + yb + ' L' + (x0 + w) + ',' + yTop +
        ' A' + w / 2 + ',' + ry + ' 0 0 1 ' + x0 + ',' + yTop });
    } else {
      el('path', { class: 'tank-line', d: 'M' + x0 + ',' + yTop + ' L' + x0 + ',' + yb + ' L' + (x0 + w) + ',' + yb + ' L' + (x0 + w) + ',' + yTop });
    }

    // dimensions
    el('path', { class: 'dim', d: 'M' + x0 + ',' + (yb + 12) + ' L' + (x0 + w) + ',' + (yb + 12) });
    label(x0 + w / 2, yb + 28, (shape === 'rect' ? 'L ' + typed('length') : 'D ' + typed('diameter')));
    if (r.H > 0) {
      el('path', { class: 'dim', d: 'M' + (x0 - 12) + ',' + yb + ' L' + (x0 - 12) + ',' + yTop });
      label(x0 - 16, yb - h / 2 - 3, 'H', 'end');
      label(x0 - 16, yb - h / 2 + 11, typed('height'), 'end');
    }
    if (dS > 0) {
      const xl = x0 + w + 6;
      el('line', { x1: xl, y1: yFill, x2: xl + 14, y2: yFill, class: 'depth-line' });
      el('line', { x1: xl + 7, y1: yFill, x2: xl + 7, y2: yb, class: 'depth-line' });
      label(xl + 12, Math.max(yFill + 4, Math.min(yb - 4, (yFill + yb) / 2)) - 4, 'fill', 'start', 'depth-text');
      label(xl + 12, Math.max(yFill + 4, Math.min(yb - 4, (yFill + yb) / 2)) + 10, inUnitOf('fill', r.d), 'start', 'depth-text');
    }
    label(x0 + w / 2, yTop - (shape === 'round' ? Math.min(10, w * 0.12) : 0) - 10, m.name + (r.beds > 1 ? ' · ×' + r.beds + ' beds' : ''));

    // ----- bag stack -----
    if (!(r.bags > 0) || !isFinite(r.bags)) return;
    const maxShown = 24;
    const shown = Math.min(r.bags, maxShown);
    const cols = shown <= 4 ? 2 : shown <= 9 ? 3 : 4;
    const rows = Math.ceil(shown / cols);
    const bw = 24, bh = 30, gx = 5, gy = 6;
    const gridW = cols * bw + (cols - 1) * gx;
    const bx0 = BAGS.l + (BAGS.r - BAGS.l - gridW) / 2;
    const by0 = yb; // stack sits on the same floor as the bed
    // fraction of the last bag actually used
    const lastFrac = r.bags <= maxShown ? (r.buyL - (r.bags - 1) * r.bagL) / r.bagL : 1;
    for (let i = 0; i < shown; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = bx0 + col * (bw + gx);
      const y = by0 - (row + 1) * bh - row * gy;
      const frac = i === shown - 1 ? Math.max(0, Math.min(1, lastFrac)) : 1;
      const clipId = 'bag-clip-' + i;
      const cp = el('clipPath', { id: clipId }, null, defs);
      const bagPath = 'M' + (x + 4) + ',' + (y + 6) + ' L' + (x + bw - 4) + ',' + (y + 6) + ' Q' + (x + bw) + ',' + (y + 10) + ' ' + (x + bw) + ',' + (y + 16) +
        ' L' + (x + bw) + ',' + (y + bh - 3) + ' Q' + (x + bw) + ',' + (y + bh) + ' ' + (x + bw - 3) + ',' + (y + bh) +
        ' L' + (x + 3) + ',' + (y + bh) + ' Q' + x + ',' + (y + bh) + ' ' + x + ',' + (y + bh - 3) +
        ' L' + x + ',' + (y + 16) + ' Q' + x + ',' + (y + 10) + ' ' + (x + 4) + ',' + (y + 6) + 'Z';
      el('path', { d: bagPath }, null, cp);
      el('path', { class: 'tank-glass', d: bagPath });
      const fillH = (bh - 6) * frac;
      el('rect', { x: x, y: y + bh - fillH, width: bw, height: fillH, fill: 'url(#media-tex)', 'clip-path': 'url(#' + clipId + ')' });
      el('path', { class: 'tank-line', d: bagPath, 'stroke-width': 1.5 });
      el('path', { class: 'tank-line', d: 'M' + (x + 8) + ',' + (y + 6) + ' L' + (x + bw / 2) + ',' + (y + 1) + ' L' + (x + bw - 8) + ',' + (y + 6), 'stroke-width': 1.5 });
    }
    const topRowY = by0 - rows * bh - (rows - 1) * gy;
    label((BAGS.l + BAGS.r) / 2, topRowY - 10, r.bags + (r.bags === 1 ? ' bag' : ' bags') + (r.bags > maxShown ? ' (24 shown)' : ''));
    label((BAGS.l + BAGS.r) / 2, by0 + 28, typed('bag') + ' each');
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const m = MEDIA[mediaSel.value] || MEDIA.custom;
    const dims = shape === 'rect'
      ? 'Rectangular bed ' + typed('length') + ' × ' + typed('width')
      : 'Round container, diameter ' + typed('diameter');
    const lines = [
      'Growing Media Fill Calculator',
      dims + ', wall height ' + typed('height') + ', fill depth ' + typed('fill') + ', ' + (r.beds || 0) + ' bed(s)',
      'Media: ' + m.name + ', bulk density ' + typed('density') + ', water-filled pore space ' + $('porosity').value + '%',
      'Bag size ' + typed('bag') + ', price per bag ' + $('price').value + ', extra for settling ' + (r.extra) + '%',
      'Media to buy: ' + vol(r.buyL),
      'Bags to buy: ' + $('r-bags').textContent,
      'Total cost: ' + $('r-cost').textContent,
      'Bed volume filled: ' + $('r-bed').textContent,
      'Dry weight of media: ' + $('r-dry').textContent,
      'Water held when flooded: ' + $('r-water').textContent,
      'Weight when saturated: ' + $('r-sat').textContent,
      'Floor load, saturated: ' + $('r-load').textContent,
      CalcShare.buildUrl(getState())
    ];
    return lines.join('\n');
  }

  // ---------- Events ----------
  shapeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setShape(b.dataset.shape); render(); });
  });
  LEN_FIELDS.concat(['bag', 'density', 'porosity', 'beds', 'price', 'extra']).forEach(function (f) {
    $(f).addEventListener('input', render);
  });
  mediaSel.addEventListener('change', function () { applyPreset(mediaSel.value); render(); });
  // vout / mout are output unit pickers handled by CalcUnits.init (no data-unit-for).

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Growing Media Fill Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    setShape('rect');
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.media && MEDIA[p.media]) { mediaSel.value = p.media; applyPreset(p.media); }
    LEN_FIELDS.concat(['bag', 'density']).forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    ['beds', 'porosity', 'price', 'extra'].forEach(function (f) {
      if (p[f] !== undefined) $(f).value = p[f];
    });
    if (p.vout && CalcUnits.unitDef('volume', p.vout)) voutSel.value = p.vout;
    if (p.mout && CalcUnits.unitDef('mass', p.mout)) moutSel.value = p.mout;
    setShape(p.shape === 'round' ? 'round' : 'rect');
    render();
  })();
})();
