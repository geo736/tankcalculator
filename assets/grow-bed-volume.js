// Grow Bed Volume Calculator: media bed, DWC raft and NFT channel volumes,
// water held, planting area and plant sites, with a live cross-section.
(function () {
  'use strict';

  const WATER_KG_PER_L = 0.998; // freshwater at 20 °C (USGS)
  const KG_PER_LB = 0.45359237;

  // Typical water-filled pore space (%) – same presets as Growing Media Fill.
  const MEDIA = { clay: 40, lava: 45, gravel: 38 };
  const MEDIA_NAME = { clay: 'Expanded clay', lava: 'Lava rock', gravel: 'Gravel', custom: 'Custom media' };

  // FAO TP 589 Appendix 1 spacing and density ranges; default spacing in cm.
  const CROPS = {
    lettuce: { name: 'Lettuce', spacing: 20, min: 20, max: 25, range: '18–30 cm, 20–25 heads per m²' },
    basil: { name: 'Basil', spacing: 20, min: 8, max: 40, range: '15–25 cm, 8–40 plants per m²' },
    tomato: { name: 'Tomato', spacing: 50, min: 3, max: 5, range: '40–60 cm, 3–5 plants per m²' }
  };

  const NFT_MIN_HOLE_SPACING = 0.21; // m, FAO TP 589

  const FIELDS = {
    'm-length': 120, 'm-width': 100, 'm-depth': 30, 'm-beds': 1, 'm-por': 40,
    'd-length': 240, 'd-width': 120, 'd-water': 30, 'd-raft': 4, 'd-beds': 1,
    'n-count': 6, 'n-length': 300, 'n-width': 10, 'n-height': 7.5, 'n-diam': 11, 'n-film': 5, 'n-pitch': 20,
    spacing: 20
  };
  const DEFAULT_UNITS = { 'n-film': 'mm' }; // everything else cm (counts and % have no unit)
  const TYPES = ['media', 'dwc', 'nft'];

  const $ = function (id) { return document.getElementById(id); };
  const ids = Object.keys(FIELDS);
  const inputs = {};
  ids.forEach(function (f) { inputs[f] = $(f); });
  const mediaSel = $('m-media');
  const cropSel = $('crop');
  const profileSel = $('n-profile');
  const outV = $('out-v');
  const outA = $('out-a');
  const typeButtons = document.querySelectorAll('#type-group button');
  const svg = $('viz');

  let type = 'media';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function vol(L) { return fmt(CalcUnits.convert('volume', L, 'L', outV.value)) + ' ' + CalcUnits.label('volume', outV.value); }
  function area(m2) { return fmt(CalcUnits.convert('area', m2, 'm2', outA.value)) + ' ' + CalcUnits.label('area', outA.value); }
  function typed(f) {
    const v = parseFloat(inputs[f].value);
    const u = CalcUnits.unitLabel(f);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function inUnitOf(f, meters) { return fmt(CalcUnits.fromBase(f, meters)) + ' ' + CalcUnits.unitLabel(f); }
  function count(f) {
    const v = parseFloat(inputs[f].value);
    return isFinite(v) && v > 0 ? Math.floor(v + 1e-9) : 0;
  }
  function m(f) { return CalcUnits.base(f); }

  // Circular segment area of depth h in a circle of radius r (m²).
  function segmentArea(r, h) {
    if (r <= 0 || h <= 0) return 0;
    if (h >= 2 * r) return Math.PI * r * r;
    return r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h);
  }

  // Whole plants along a length with spacing s (each plant gets one s-wide cell).
  function fit(len, s) { return s > 0 ? Math.floor(len / s + 1e-9) : 0; }

  // ---------- Calculation (SI: m, m², m³; water in L) ----------
  function compute() {
    const s = m('spacing');
    const r = { ok: false, warn: [], s: s };

    if (type === 'media') {
      const L = m('m-length'), W = m('m-width'), D = m('m-depth'), n = count('m-beds');
      let por = parseFloat(inputs['m-por'].value);
      if (!isFinite(por) || por < 0) por = NaN;
      if (por > 100) { r.warn.push('Pore space cannot be more than 100%. Using 100%.'); por = 100; }
      if (!(L && W && D && n) || !isFinite(por)) return r;
      r.n = n;
      r.grossM3 = L * W * D * n;
      r.waterL = r.grossM3 * (por / 100) * 1000;
      r.areaM2 = L * W * n;
      r.perRow = fit(L, s); r.rows = fit(W, s);
      r.sites = r.perRow * r.rows * n;
      r.dims = { L: L, W: W, D: D, por: por };
    } else if (type === 'dwc') {
      const L = m('d-length'), W = m('d-width'), d = m('d-water'), t = m('d-raft'), n = count('d-beds');
      if (!(L && W && d && n)) return r;
      r.n = n;
      r.waterL = L * W * d * n * 1000;
      r.grossM3 = L * W * (d + t) * n;
      r.minDepth = d + t;
      r.areaM2 = L * W * n;
      r.perRow = fit(L, s); r.rows = fit(W, s);
      r.sites = r.perRow * r.rows * n;
      r.dims = { L: L, W: W, d: d, t: t };
    } else {
      const n = count('n-count'), Lc = m('n-length'), pitch = m('n-pitch');
      let h = m('n-film');
      const round = profileSel.value === 'round';
      const w = round ? m('n-diam') : m('n-width');
      const H = round ? m('n-diam') : m('n-height');
      if (!(n && Lc && w && H && h)) return r;
      if (h > H) { r.warn.push('Film depth is more than the channel height (' + inUnitOf('n-film', H) + '). Showing a full channel.'); h = H; }
      const filmA = round ? segmentArea(w / 2, h) : w * h;
      const chanA = round ? Math.PI * w * w / 4 : w * H;
      r.n = n;
      r.waterL = filmA * Lc * n * 1000;
      r.grossM3 = chanA * Lc * n;
      r.areaM2 = pitch > 0 ? Lc * pitch * n : 0;
      r.perRow = fit(Lc, s); r.rows = 1;
      r.sites = r.perRow * n;
      if (pitch > 0 && pitch < w) r.warn.push('Channel spacing is less than the channel width; the channels would overlap.');
      if (!(pitch > 0)) r.warn.push('Enter the channel spacing to get the planting area and density.');
      if (s > 0 && s < NFT_MIN_HOLE_SPACING - 1e-9) r.warn.push('FAO suggests at least 21 cm between NFT plant hole centres.');
      r.dims = { n: n, Lc: Lc, w: w, H: H, h: h, pitch: pitch, round: round };
    }

    r.ok = true;
    if (!(s > 0)) r.warn.push('Enter a plant spacing to count plant sites.');
    else if (r.sites === 0) r.warn.push('The plant spacing is larger than the bed, so no whole plant fits.');
    r.density = r.areaM2 > 0 && s > 0 ? r.sites / r.areaM2 : NaN;
    return r;
  }

  // ---------- UI state ----------
  function setType(t) {
    type = t;
    typeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.type === t)); });
    updateVisibility();
  }

  function updateVisibility() {
    document.querySelectorAll('[data-for]').forEach(function (el) {
      let show = el.dataset.for.split(' ').indexOf(type) !== -1;
      if (show && el.dataset.profile) show = el.dataset.profile === profileSel.value;
      el.hidden = !show;
    });
    $('spacing-hint').textContent = type === 'nft'
      ? 'Between plant holes along each channel. FAO: at least 21 cm.'
      : 'Centre to centre, on a square grid.';
  }

  function visibleFields() {
    return ids.filter(function (f) { return !inputs[f].closest('.field').hidden; });
  }

  function getState() {
    const st = { type: type, crop: cropSel.value, outv: outV.value, outa: outA.value };
    if (type === 'media') st.media = mediaSel.value;
    if (type === 'nft') st.profile = profileSel.value;
    visibleFields().forEach(function (f) {
      st[f] = inputs[f].value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    ids.forEach(function (f) { CalcUnits.set(f, FIELDS[f], DEFAULT_UNITS[f] || 'cm'); });
    mediaSel.value = 'clay';
    cropSel.value = 'lettuce';
    profileSel.value = 'rect';
    outV.value = 'L';
    outA.value = 'm2';
  }

  // Keep the preset selects in step with the numbers typed.
  function syncMediaPreset() {
    const v = parseFloat(inputs['m-por'].value);
    const match = Object.keys(MEDIA).filter(function (k) { return MEDIA[k] === v; });
    if (mediaSel.value !== 'custom' && MEDIA[mediaSel.value] === v) return;
    mediaSel.value = match.length ? match[0] : 'custom';
  }
  function syncCropPreset() {
    const c = CROPS[cropSel.value];
    if (c && Math.abs(m('spacing') - c.spacing / 100) < 1e-9) return;
    cropSel.value = 'custom';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    const msgs = r.ok ? r.warn : ['Enter every dimension and count for the ' + typeName() + ' to see the result.'];
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const nameEach = { media: 'Water per bed', dwc: 'Water per canal', nft: 'Water per channel' }[type];
    const nameGross = { media: 'Gross bed volume (media)', dwc: 'Gross canal volume (water + raft)', nft: 'Gross channel volume' }[type];
    $('r-each-label').textContent = nameEach;
    $('r-gross-label').textContent = nameGross;
    $('r-area-label').textContent = type === 'dwc' ? 'Raft (planting) area' : type === 'nft' ? 'Planting area (channel footprint)' : 'Planting area';
    $('r-main-label').textContent = { media: 'Water in the beds (flooded)', dwc: 'Water in the canals', nft: 'Water in the channels (pump running)' }[type];

    const extraRow = $('r-extra-row');
    extraRow.hidden = type === 'media';
    $('r-extra-label').textContent = type === 'dwc' ? 'Minimum canal depth' : 'Plants per channel';

    if (!r.ok) {
      ['r-water', 'r-gross', 'r-each', 'r-fill', 'r-weight', 'r-area', 'r-sites', 'r-density', 'r-perplant', 'r-extra'].forEach(function (k) { $(k).textContent = '–'; });
      $('r-fillbar').style.width = '0%';
      $('r-status').textContent = '';
      $('viz-caption').textContent = 'Enter dimensions to draw the bed';
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      CalcShare.writeParams(getState());
      return;
    }

    const grossL = r.grossM3 * 1000;
    const share = grossL > 0 ? r.waterL / grossL * 100 : 0;
    const kg = r.waterL * WATER_KG_PER_L;

    $('r-water').textContent = vol(r.waterL);
    $('r-gross').textContent = vol(grossL);
    $('r-each').textContent = vol(r.waterL / r.n);
    $('r-fill').textContent = fmt(share, 1) + '%';
    $('r-fillbar').style.width = Math.min(100, share) + '%';
    $('r-weight').textContent = fmt(kg) + ' kg · ' + fmt(kg / KG_PER_LB) + ' lb';
    $('r-area').textContent = r.areaM2 > 0 ? area(r.areaM2) : '–';
    $('r-sites').textContent = r.s > 0 ? fmt(r.sites, 0) + (type === 'nft' ? '' : ' (' + r.perRow + ' × ' + r.rows + (r.n > 1 ? ' × ' + r.n : '') + ')') : '–';
    $('r-density').textContent = isFinite(r.density) ? fmt(r.density, 1) + ' per m² · ' + fmt(r.density * 0.09290304, 2) + ' per ft²' : '–';
    $('r-perplant').textContent = r.sites > 0 ? vol(r.waterL / r.sites) : '–';
    if (type === 'dwc') $('r-extra').textContent = inUnitOf('d-water', r.minDepth);
    if (type === 'nft') $('r-extra').textContent = r.s > 0 ? fmt(r.perRow, 0) : '–';

    // Density check against the FAO range for the chosen crop.
    const status = $('r-status');
    const crop = CROPS[cropSel.value];
    if (crop && isFinite(r.density)) {
      const d = r.density;
      const where = d < crop.min - 0.05 ? 'below' : d > crop.max + 0.05 ? 'above' : 'within';
      status.textContent = crop.name + ': ' + fmt(d, 1) + ' plants per m² is ' + where + ' the FAO guide range (' + crop.range + ').';
      status.className = 'status ' + (where === 'within' ? 'ok' : 'warn');
    } else {
      status.textContent = '';
      status.className = 'status';
    }

    $('viz-caption').textContent = vol(r.waterL) + ' of water · ' + (r.s > 0 ? fmt(r.sites, 0) + ' plant sites' : 'no spacing') +
      (r.areaM2 > 0 ? ' on ' + area(r.areaM2) : '');

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  function typeName() {
    return { media: 'media bed', dwc: 'deep water culture canal', nft: 'NFT channels' }[type];
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 320;
  let exaggerated = false;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) {
    el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }
  function dimLabel(f) { return fmt(parseFloat(inputs[f].value)) + ' ' + CalcUnits.unitLabel(f); }

  // A plant whose base sits at (x, y); leaves rise `size` px, roots hang `root` px.
  function plant(x, y, size, root) {
    if (root > 0) {
      el('path', { class: 'root', d: 'M' + x + ',' + y + ' l0,' + root + ' M' + x + ',' + (y + 2) + ' q' + (-size * 0.25) + ',' + root * 0.5 + ' ' + (-size * 0.3) + ',' + root * 0.85 +
        ' M' + x + ',' + (y + 2) + ' q' + (size * 0.25) + ',' + root * 0.5 + ' ' + (size * 0.3) + ',' + root * 0.85 });
    }
    el('path', { class: 'stem', d: 'M' + x + ',' + y + ' L' + x + ',' + (y - size * 0.75) });
    const w = size * 0.42, h = size * 0.5;
    el('path', { class: 'leaf', d: 'M' + x + ',' + (y - size * 0.35) + ' q' + (-w) + ',' + (-h * 0.2) + ' ' + (-w) + ',' + (-h) + ' q' + (w * 0.8) + ',' + (h * 0.1) + ' ' + w + ',' + h + 'z' });
    el('path', { class: 'leaf', d: 'M' + x + ',' + (y - size * 0.5) + ' q' + w + ',' + (-h * 0.2) + ' ' + w + ',' + (-h) + ' q' + (-w * 0.8) + ',' + (h * 0.1) + ' ' + (-w) + ',' + h + 'z' });
  }

  // Draw n plants along [x0, x0 + lenPx] at spacing spPx, centred like the calculation.
  function plantRow(x0, lenPx, n, spPx, y, root) {
    if (n <= 0) return;
    const start = x0 + (lenPx - n * spPx) / 2 + spPx / 2;
    if (spPx < 7 || n > 120) {
      // Too dense to draw leaves: show ticks, thinned if needed.
      const step = Math.max(1, Math.ceil(3 / Math.max(spPx, 0.01)));
      for (let i = 0; i < n; i += step) {
        const x = start + i * spPx;
        el('line', { class: 'tick', x1: x, y1: y, x2: x, y2: y - 10 });
      }
      return;
    }
    const size = Math.max(10, Math.min(40, spPx * 0.95));
    for (let i = 0; i < n; i++) plant(start + i * spPx, y, size, root);
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    exaggerated = false;
    if (type === 'media') drawMedia(r);
    else if (type === 'dwc') drawDwc(r);
    else drawNft(r);
    if (exaggerated) label(VW - 8, VH - 6, 'depth exaggerated', 'end');
  }

  // Shared box layout: horizontal scale from length, vertical may be exaggerated.
  function layout(lenM, depthM, box) {
    const sx = Math.min(box.w / lenM, box.h / depthM);
    let sy = sx;
    const minH = Math.min(box.h, 70);
    if (depthM * sy < minH) { sy = minH / depthM; exaggerated = true; }
    const w = lenM * sx, h = depthM * sy;
    return { sx: sx, sy: sy, x0: box.x + (box.w - w) / 2, w: w, h: h };
  }

  function drawMedia(r) {
    const D = r.dims;
    const box = { x: 70, y: 80, w: 310, h: 190 };
    const g = layout(D.L, D.D, box);
    const yTop = box.y + (box.h - g.h) / 2 + 10, yb = yTop + g.h;
    const x0 = g.x0, x1 = x0 + g.w;

    el('rect', { class: 'bed-inside', x: x0, y: yTop, width: g.w, height: g.h });
    el('rect', { class: 'water', x: x0, y: yTop, width: g.w, height: g.h });
    // Media particles on a jittered grid.
    const step = Math.max(9, Math.sqrt(g.w * g.h / 700));
    const rad = step * 0.42;
    let k = 0;
    for (let y = yTop + step / 2; y < yb - rad * 0.5; y += step * 0.87) {
      const off = (k++ % 2) * step / 2;
      for (let x = x0 + step / 2 + off; x < x1 - rad * 0.5; x += step) {
        const j = Math.sin(x * 12.9898 + y * 78.233) * 0.18 * step;
        el('circle', { class: 'pebble', cx: x + j, cy: y - j * 0.6, r: rad });
      }
    }
    el('path', { class: 'water-top', d: 'M' + x0 + ',' + yTop + ' L' + x1 + ',' + yTop, 'stroke-width': 2 });
    el('path', { class: 'bed-wall', d: 'M' + x0 + ',' + (yTop - 6) + ' L' + x0 + ',' + yb + ' L' + x1 + ',' + yb + ' L' + x1 + ',' + (yTop - 6) });

    plantRow(x0, g.w, r.perRow, r.s * g.sx, yTop, Math.min(g.h * 0.6, 40));

    el('path', { class: 'dim', d: 'M' + x0 + ',' + (yb + 12) + ' L' + x1 + ',' + (yb + 12) });
    label((x0 + x1) / 2, yb + 28, 'L ' + dimLabel('m-length'));
    el('path', { class: 'dim', d: 'M' + (x0 - 12) + ',' + yTop + ' L' + (x0 - 12) + ',' + yb });
    label(x0 - 16, (yTop + yb) / 2 + 4, 'D ' + dimLabel('m-depth'), 'end');
    label(x1 + 10, (yTop + yb) / 2 - 4, 'flooded', 'start', 'depth-text');
    label(x1 + 10, (yTop + yb) / 2 + 12, 'φ ' + fmt(D.por, 1) + '%', 'start', 'depth-text');
    label(VW / 2, 22, r.perRow + ' plants per row at ' + dimLabel('spacing') + ' · side view', 'middle', 'name-text');
  }

  function drawDwc(r) {
    const D = r.dims;
    const wallH = D.d + Math.max(D.t, 0) + Math.max(D.d * 0.12, 0.02);
    const box = { x: 70, y: 80, w: 310, h: 190 };
    const g = layout(D.L, wallH, box);
    const yTop = box.y + (box.h - g.h) / 2 + 10, yb = yTop + g.h;
    const x0 = g.x0, x1 = x0 + g.w;
    const yw = yb - D.d * g.sy;
    const tPx = Math.max(D.t * g.sy, D.t > 0 ? 4 : 0);
    const draft = tPx * 0.15;

    el('rect', { class: 'bed-inside', x: x0, y: yTop, width: g.w, height: g.h });
    el('rect', { class: 'water', x: x0, y: yw, width: g.w, height: yb - yw });
    el('path', { class: 'water-top', d: 'M' + x0 + ',' + yw + ' L' + x1 + ',' + yw, 'stroke-width': 2 });
    const raftTop = yw + draft - tPx;
    plantRow(x0, g.w, r.perRow, r.s * g.sx, raftTop, Math.min((yb - yw) * 0.7, 80) + tPx);
    if (tPx > 0) el('rect', { class: 'raft', x: x0 + 2, y: raftTop, width: g.w - 4, height: tPx });
    el('path', { class: 'bed-wall', d: 'M' + x0 + ',' + yTop + ' L' + x0 + ',' + yb + ' L' + x1 + ',' + yb + ' L' + x1 + ',' + yTop });

    el('path', { class: 'dim', d: 'M' + x0 + ',' + (yb + 12) + ' L' + x1 + ',' + (yb + 12) });
    label((x0 + x1) / 2, yb + 28, 'L ' + dimLabel('d-length'));
    if (tPx > 0) label(x0 - 8, raftTop + tPx / 2 + 4, 'raft ' + dimLabel('d-raft'), 'end');
    el('line', { x1: x1 + 6, y1: yw, x2: x1 + 20, y2: yw, class: 'depth-line' });
    el('line', { x1: x1 + 13, y1: yw, x2: x1 + 13, y2: yb, class: 'depth-line' });
    label(x1 + 24, (yw + yb) / 2 + 4, 'd ' + dimLabel('d-water'), 'start', 'depth-text');
    label(VW / 2, 22, r.perRow + ' plants per row at ' + dimLabel('spacing') + ' · side view', 'middle', 'name-text');
  }

  function drawNft(r) {
    const D = r.dims;
    // Top panel: one channel along its length.
    const x0 = 40, lenPx = 400;
    const sx = lenPx / D.Lc;
    let chH = D.H * sx;
    if (chH < 16) { chH = 16; exaggerated = true; }
    const yCh = 92;
    const filmPx = Math.max(2, D.h / D.H * chH);
    label(VW / 2, 22, '1 of ' + D.n + ' channels · ' + r.perRow + ' plants at ' + dimLabel('spacing'), 'middle', 'name-text');
    el('rect', { class: 'bed-inside', x: x0, y: yCh, width: lenPx, height: chH });
    el('rect', { class: 'water', x: x0, y: yCh + chH - filmPx, width: lenPx, height: filmPx });
    plantRow(x0, lenPx, r.perRow, r.s * sx, yCh, chH - 2);
    el('rect', { class: 'bed-wall', x: x0, y: yCh, width: lenPx, height: chH });
    el('path', { class: 'dim', d: 'M' + x0 + ',' + (yCh + chH + 10) + ' L' + (x0 + lenPx) + ',' + (yCh + chH + 10) });
    label(x0 + lenPx / 2, yCh + chH + 25, 'L ' + dimLabel('n-length'));

    // Bottom panel: end view of the channels (to scale) with the film.
    const top = 160, panelH = 105;
    const shown = Math.min(D.n, 8);
    const pitch = D.pitch > 0 ? Math.max(D.pitch, D.w) : D.w * 1.5;
    const totalW = (shown - 1) * pitch + D.w;
    const s = Math.min(380 / totalW, panelH / D.H);
    const wPx = D.w * s, hPx = D.H * s;
    const startX = VW / 2 - totalW * s / 2;
    const yb = top + (panelH + hPx) / 2;
    for (let i = 0; i < shown; i++) {
      const cx = startX + i * pitch * s + wPx / 2;
      if (D.round) {
        const rr = wPx / 2, cy = yb - rr;
        const hh = Math.min(D.h * s, 2 * rr);
        el('circle', { class: 'bed-inside', cx: cx, cy: cy, r: rr });
        if (hh > 0) {
          const yw = yb - hh;
          if (hh >= 2 * rr - 1e-6) el('circle', { class: 'water', cx: cx, cy: cy, r: rr });
          else {
            const a = Math.sqrt(Math.max(0, rr * rr - (rr - hh) * (rr - hh)));
            el('path', { class: 'water', d: 'M' + (cx - a) + ',' + yw + ' A' + rr + ',' + rr + ' 0 ' + (hh > rr ? 1 : 0) + ' 0 ' + (cx + a) + ',' + yw + 'Z' });
          }
        }
        el('circle', { class: 'bed-wall', cx: cx, cy: cy, r: rr });
      } else {
        const fh = Math.max(1.5, D.h * s);
        el('rect', { class: 'bed-inside', x: cx - wPx / 2, y: yb - hPx, width: wPx, height: hPx });
        el('rect', { class: 'water', x: cx - wPx / 2, y: yb - fh, width: wPx, height: fh });
        el('rect', { class: 'bed-wall', x: cx - wPx / 2, y: yb - hPx, width: wPx, height: hPx });
      }
    }
    const profile = D.round ? 'Ø ' + dimLabel('n-diam') : dimLabel('n-width') + ' × ' + dimLabel('n-height');
    label(VW / 2, top - 6, 'End view · ' + profile + ' · film ' + dimLabel('n-film') + (D.n > shown ? ' · ' + (D.n - shown) + ' more not shown' : ''));
    if (shown > 1 && D.pitch > 0) {
      const a = startX + wPx / 2, b = a + pitch * s;
      el('path', { class: 'dim', d: 'M' + a + ',' + (yb + 10) + ' L' + b + ',' + (yb + 10) + ' M' + a + ',' + (yb + 6) + ' L' + a + ',' + (yb + 14) + ' M' + b + ',' + (yb + 6) + ' L' + b + ',' + (yb + 14) });
      label(a, yb + 26, 'spacing ' + dimLabel('n-pitch'), 'start');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Grow Bed Volume Calculator'];
    if (type === 'media') {
      lines.push('Media bed: ' + typed('m-beds') + ' bed(s), L ' + typed('m-length') + ' × W ' + typed('m-width') + ' × media depth ' + typed('m-depth') +
        ', ' + MEDIA_NAME[mediaSel.value] + ' pore space ' + typed('m-por') + '%');
    } else if (type === 'dwc') {
      lines.push('Deep water culture: ' + typed('d-beds') + ' canal(s), L ' + typed('d-length') + ' × W ' + typed('d-width') + ', water depth ' + typed('d-water') + ', raft ' + typed('d-raft'));
    } else {
      const prof = profileSel.value === 'round' ? 'round pipe Ø ' + typed('n-diam') : 'rectangular ' + typed('n-width') + ' × ' + typed('n-height');
      lines.push('NFT: ' + typed('n-count') + ' channel(s), length ' + typed('n-length') + ', ' + prof + ', film ' + typed('n-film') + ', channel spacing ' + typed('n-pitch'));
    }
    lines.push('Plant spacing: ' + typed('spacing') + (CROPS[cropSel.value] ? ' (' + CROPS[cropSel.value].name + ')' : ''));
    if (r.ok) {
      const grossL = r.grossM3 * 1000;
      lines.push('Water in beds: ' + vol(r.waterL) + ' (' + fmt(r.waterL) + ' L, ' + fmt(r.waterL * WATER_KG_PER_L) + ' kg)');
      lines.push('Gross volume: ' + vol(grossL));
      if (r.areaM2 > 0) lines.push('Planting area: ' + area(r.areaM2));
      lines.push('Plant sites: ' + (r.s > 0 ? fmt(r.sites, 0) : '–') + (isFinite(r.density) ? ' (' + fmt(r.density, 1) + ' per m²)' : ''));
      if (type === 'dwc') lines.push('Minimum canal depth: ' + inUnitOf('d-water', r.minDepth));
    } else {
      lines.push('Incomplete inputs');
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  typeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setType(b.dataset.type); render(); });
  });
  ids.forEach(function (f) {
    inputs[f].addEventListener('input', function () {
      if (f === 'm-por') syncMediaPreset();
      if (f === 'spacing') syncCropPreset();
      render();
    });
  });
  mediaSel.addEventListener('change', function () {
    if (MEDIA[mediaSel.value] !== undefined) inputs['m-por'].value = MEDIA[mediaSel.value];
    render();
  });
  cropSel.addEventListener('change', function () {
    const c = CROPS[cropSel.value];
    if (c) inputs.spacing.value = +CalcUnits.fromBase('spacing', c.spacing / 100).toPrecision(6);
    render();
  });
  profileSel.addEventListener('change', function () { updateVisibility(); render(); });

  CalcUnits.init(function (changed) {
    if (changed === 'spacing') syncCropPreset();
    render();
  });

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Grow Bed Volume Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    setType('media');
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    ids.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, inputs[f].value, u);
    });
    if (p.media && (MEDIA[p.media] !== undefined || p.media === 'custom')) mediaSel.value = p.media;
    else syncMediaPreset();
    if (p.crop && (CROPS[p.crop] || p.crop === 'custom')) cropSel.value = p.crop;
    syncCropPreset();
    if (p.profile === 'rect' || p.profile === 'round') profileSel.value = p.profile;
    if (p.outv && CalcUnits.unitDef('volume', p.outv)) outV.value = p.outv;
    if (p.outa && CalcUnits.unitDef('area', p.outa)) outA.value = p.outa;
    setType(TYPES.indexOf(p.type) !== -1 ? p.type : 'media');
    render();
  })();
})();
