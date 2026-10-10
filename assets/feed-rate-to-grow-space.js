// Feed Rate to Grow Space Calculator: feed rate ratio (g feed / m² / day), live SVG, shareable URL state.
(function () {
  'use strict';

  // Feed rate ratio unit group, added here (not in units.js). Base: g per m² per day.
  CalcUnits.GROUPS.feedratio = {
    base: 'gm2d',
    units: [
      { id: 'gm2d', label: 'g/m²/day', factor: 1 },
      { id: 'gft2d', label: 'g/ft²/day', factor: 1 / 0.09290304 },
      { id: 'ozyd2d', label: 'oz/yd²/day', factor: 28.349523125 / 0.83612736 },
      { id: 'ozft2d', label: 'oz/ft²/day', factor: 28.349523125 / 0.09290304 }
    ]
  };

  // Guideline ranges in g/m²/day. leafy/fruiting: Somerville et al. 2014 (FAO TP 589);
  // raft: Rakocy, Masser & Losordo 2006 (SRAC 454).
  const PRESETS = {
    leafy: { min: 40, max: 50, name: 'Leafy greens' },
    fruiting: { min: 50, max: 80, name: 'Fruiting vegetables' },
    raft: { min: 60, max: 100, name: 'Raft / DWC (UVI)' },
    custom: { name: 'Custom crop' }
  };

  const DEFAULTS = {
    mode: 'feed', crop: 'leafy', amethod: 'total',
    feed: [500, 'g'], area: [12, 'm2'], blen: [4, 'm'], bwid: [1, 'm'], nbeds: [3], pct: [1.5],
    rmin: [40, 'gm2d'], rmax: [50, 'gm2d'],
    outa: 'm2', outf: 'g', outb: 'kg'
  };

  const INPUT_FIELDS = ['feed', 'area', 'blen', 'bwid', 'nbeds', 'pct', 'rmin', 'rmax'];

  const $ = function (id) { return document.getElementById(id); };
  const modeButtons = document.querySelectorAll('#mode-group button');
  const cropSel = $('crop'), methodSel = $('amethod');
  const outA = $('outa'), outF = $('outf'), outB = $('outb');
  const svg = $('viz');

  let mode = 'feed';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function numVal(id) { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }

  // area m² → display; feed g/day → display; biomass kg → display
  function showA(m2) { return fmt(CalcUnits.convert('area', m2, 'm2', outA.value)) + ' ' + CalcUnits.label('area', outA.value); }
  function showF(g) { return fmt(CalcUnits.convert('mass', g / 1000, 'kg', outF.value)) + ' ' + CalcUnits.label('mass', outF.value) + '/day'; }
  function showB(kg) { return fmt(CalcUnits.convert('mass', kg, 'kg', outB.value)) + ' ' + CalcUnits.label('mass', outB.value); }
  function rangeA(a, b) { return fmt(CalcUnits.convert('area', a, 'm2', outA.value)) + '–' + showA(b); }
  function rangeF(a, b) { return fmt(CalcUnits.convert('mass', a / 1000, 'kg', outF.value)) + '–' + showF(b); }
  function rangeB(a, b) { return fmt(CalcUnits.convert('mass', a, 'kg', outB.value)) + '–' + showB(b); }
  function showR(r) { return fmt(r, 1) + ' g/m²/day'; }

  // ---------- Calculation (g, m², g/m²/day, kg) ----------
  function ratioRange() {
    if (cropSel.value !== 'custom') {
      const p = PRESETS[cropSel.value];
      return { lo: p.min, hi: p.max, swapped: false };
    }
    let lo = CalcUnits.base('rmin'), hi = CalcUnits.base('rmax');
    let swapped = false;
    if (lo > 0 && hi > 0 && lo > hi) { const t = lo; lo = hi; hi = t; swapped = true; }
    if (lo > 0 && !hi) hi = lo;
    if (hi > 0 && !lo) lo = hi;
    return { lo: lo, hi: hi, swapped: swapped };
  }

  function userArea() {
    if (methodSel.value === 'dims') {
      const n = Math.floor(numVal('nbeds'));
      return CalcUnits.base('blen') * CalcUnits.base('bwid') * n;
    }
    return CalcUnits.base('area');
  }

  function compute() {
    const r = ratioRange();
    const F = CalcUnits.base('feed') * 1000;   // g/day
    const A = userArea();                         // m²
    const pct = numVal('pct');
    const c = { r: r, F: F, A: A, pct: pct, ok: r.lo > 0 };
    if (!c.ok) return c;
    const mid = (r.lo + r.hi) / 2;
    c.mid = mid;
    if (F > 0) {
      c.Amin = F / r.hi; c.Amax = F / r.lo; c.Amid = F / mid;
    }
    if (A > 0) {
      c.Fmin = A * r.lo; c.Fmax = A * r.hi; c.Fmid = A * mid;
    }
    if (F > 0 && A > 0) {
      c.actual = F / A;
      c.status = c.actual > r.hi + 1e-9 ? 'under' : c.actual < r.lo - 1e-9 ? 'over' : 'ok';
    }
    if (pct > 0) {
      if (F > 0) c.bio = F / 1000 / (pct / 100);
      if (A > 0) { c.bioMin = c.Fmin / 1000 / (pct / 100); c.bioMax = c.Fmax / 1000 / (pct / 100); }
    }
    return c;
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    $('feed-label').textContent = m === 'feed' ? 'Daily fish feed (per day)' : 'Your current daily feed (optional, to check)';
    $('area-label').textContent = m === 'feed' ? 'Your grow area (optional, to check)' : 'Grow area';
  }

  function setMethod() {
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for !== methodSel.value;
    });
  }

  function setCrop(prev) {
    const custom = cropSel.value === 'custom';
    // When switching to custom, start from the preset that was selected.
    if (custom && prev && PRESETS[prev] && PRESETS[prev].min) {
      ['rmin', 'rmax'].forEach(function (f) {
        const g = f === 'rmin' ? PRESETS[prev].min : PRESETS[prev].max;
        $(f).value = +CalcUnits.convert('feedratio', g, 'gm2d', CalcUnits.unit(f)).toPrecision(6);
      });
    }
    $('custom-fields').hidden = !custom;
  }

  function getState() {
    const st = { mode: mode, crop: cropSel.value, amethod: methodSel.value, outa: outA.value, outf: outF.value, outb: outB.value };
    const fields = ['feed', 'pct'];
    if (methodSel.value === 'dims') fields.push('blen', 'bwid', 'nbeds'); else fields.push('area');
    if (cropSel.value === 'custom') fields.push('rmin', 'rmax');
    fields.forEach(function (f) {
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    INPUT_FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    cropSel.value = DEFAULTS.crop;
    methodSel.value = DEFAULTS.amethod;
    outA.value = DEFAULTS.outa; outF.value = DEFAULTS.outf; outB.value = DEFAULTS.outb;
  }

  // ---------- Render ----------
  function render() {
    const c = compute();
    const notes = [];
    const primaryOk = mode === 'feed' ? c.F > 0 : c.A > 0;

    if (!c.ok) notes.push('Enter a feed rate ratio greater than zero.');
    else if (c.r.swapped) notes.push('The low end of the ratio was larger than the high end, so the two were swapped.');
    if (c.ok && !primaryOk) notes.push(mode === 'feed' ? 'Enter the daily fish feed to see the grow area.' : 'Enter the grow area to see the feed it supports.');
    if (!(c.pct > 0)) notes.push('Enter a feeding rate (% of body weight) to estimate fish biomass.');
    else if (c.pct > 10) notes.push('A feeding rate above 10% of body weight per day is only typical of very small fry. Check the value.');
    if (methodSel.value === 'dims' && numVal('nbeds') > 0 && numVal('nbeds') < 1) notes.push('Number of beds must be at least 1.');
    const notice = $('notice');
    notice.textContent = notes.join(' ');
    notice.hidden = notes.length === 0;

    const ready = c.ok && primaryOk;
    const st = $('r-status');

    if (mode === 'feed') {
      $('r-main-label').textContent = 'Grow area needed';
      $('r-main').textContent = ready ? rangeA(c.Amin, c.Amax) : '–';
      $('r-main-sub').textContent = ready ? 'Design point ' + showA(c.Amid) + ' at ' + showR(c.mid) : '';
    } else {
      $('r-main-label').textContent = 'Daily feed supported';
      $('r-main').textContent = ready ? rangeF(c.Fmin, c.Fmax) : '–';
      $('r-main-sub').textContent = ready ? 'Design point ' + showF(c.Fmid) + ' at ' + showR(c.mid) : '';
    }

    $('r-arange').textContent = c.ok && c.F > 0 ? rangeA(c.Amin, c.Amax) : '–';
    $('r-amid-label').textContent = mode === 'feed' ? 'Design area (mid ratio)' : 'Design feed (mid ratio)';
    $('r-amid').textContent = !c.ok ? '–' : mode === 'feed' ? (c.F > 0 ? showA(c.Amid) : '–') : (c.A > 0 ? showF(c.Fmid) : '–');
    $('r-frange').textContent = c.ok && c.A > 0 ? rangeF(c.Fmin, c.Fmax) : '–';
    let bio = '–';
    if (c.ok && c.pct > 0) {
      if (mode === 'feed' && c.bio) bio = showB(c.bio);
      else if (mode === 'area' && c.A > 0) bio = c.F > 0 ? rangeB(c.bioMin, c.bioMax) + ' (now ' + showB(c.bio) + ')' : rangeB(c.bioMin, c.bioMax);
    }
    $('r-bio').textContent = bio;
    $('r-ratio').textContent = c.ok ? (c.r.lo === c.r.hi ? showR(c.r.lo) : fmt(c.r.lo, 1) + '–' + showR(c.r.hi)) : '–';
    $('r-actual').textContent = c.actual ? showR(c.actual) : '–';

    if (c.ok && c.status) {
      st.hidden = false;
      st.className = 'status ' + (c.status === 'ok' ? 'ok' : 'warn');
      if (c.status === 'ok') {
        st.textContent = 'Balanced: your ' + showR(c.actual) + ' is inside the guideline range.';
      } else if (c.status === 'under') {
        st.textContent = mode === 'feed'
          ? 'Too little grow area: add at least ' + showA(c.Amin - c.A) + ' or feed less.'
          : 'Too much feed for this area: feed at most ' + showF(c.Fmax) + ' or add grow area.';
      } else {
        st.textContent = mode === 'feed'
          ? 'More grow area than the feed supports: ' + showA(c.A - c.Amax) + ' extra; plants may run short of nutrients.'
          : 'Too little feed for this area: plants may run short; the area can use at least ' + showF(c.Fmin) + '.';
      }
    } else {
      st.hidden = true;
    }

    // caption
    let cap = 'Enter values to draw the system';
    if (ready && mode === 'feed') {
      cap = showF(c.F) + ' of feed fertilizes ' + rangeA(c.Amin, c.Amax) + ' of ' + PRESETS[cropSel.value].name.toLowerCase();
      if (c.A > 0) cap += ' · your beds: ' + showA(c.A);
    } else if (ready) {
      cap = showA(c.A) + ' of ' + PRESETS[cropSel.value].name.toLowerCase() + ' uses ' + rangeF(c.Fmin, c.Fmax);
      if (c.F > 0) cap += ' · you feed ' + showF(c.F);
    }
    $('viz-caption').textContent = cap;

    drawViz(c, ready);
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
  function text(x, y, t, anchor, cls) { return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, t); }

  // Short number for SVG labels in the chosen output units.
  function aShort(m2) { return fmt(CalcUnits.convert('area', m2, 'm2', outA.value), CalcUnits.convert('area', m2, 'm2', outA.value) >= 100 ? 0 : 1); }
  function fShort(g) { const v = CalcUnits.convert('mass', g / 1000, 'kg', outF.value); return fmt(v, v >= 100 ? 0 : v >= 10 ? 1 : 2); }

  function drawViz(c, ready) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!ready) return;

    // --- Fish tank (left) ---
    const tx = 18, ty = 52, tw = 104, th = 92;
    el('rect', { class: 'tank-glass', x: tx, y: ty, width: tw, height: th });
    el('rect', { class: 'water', x: tx, y: ty + 16, width: tw, height: th - 16 });
    el('line', { class: 'water-top', x1: tx, y1: ty + 16, x2: tx + tw, y2: ty + 16 });
    el('path', { class: 'tank-line', d: 'M' + tx + ',' + ty + ' V' + (ty + th) + ' H' + (tx + tw) + ' V' + ty });
    // fish
    [[tx + 34, ty + 46, 1], [tx + 70, ty + 70, 0.8], [tx + 40, ty + 78, 0.65]].forEach(function (f) {
      const s = f[2];
      el('path', { class: 'fish', d: 'M' + (f[0] - 14 * s) + ',' + f[1] + ' q' + (14 * s) + ',' + (-10 * s) + ' ' + (26 * s) + ',0 q' + (-12 * s) + ',' + (10 * s) + ' ' + (-26 * s) + ',0z M' + (f[0] + 12 * s) + ',' + f[1] + ' l' + (8 * s) + ',' + (-6 * s) + ' v' + (12 * s) + 'z' });
    });
    // feed pellets dropping in
    [[tx + 30, ty + 4], [tx + 46, ty + 9], [tx + 60, ty + 3], [tx + 76, ty + 8]].forEach(function (p) {
      el('circle', { class: 'pellet', cx: p[0], cy: p[1], r: 2.6 });
    });
    text(tx + tw / 2, ty - 26, 'Fish tank', 'middle', 'name-text');
    const feedTxt = mode === 'feed' || c.F > 0
      ? fShort(c.F) + ' ' + CalcUnits.label('mass', outF.value) + '/day'
      : fShort(c.Fmin) + '–' + fShort(c.Fmax) + ' ' + CalcUnits.label('mass', outF.value) + '/day';
    text(tx + tw / 2, ty - 10, feedTxt, 'middle', 'marker-text');
    let bioTxt = '';
    if (c.pct > 0) {
      const bkg = c.F > 0 ? c.bio : null;
      const lbl = CalcUnits.label('mass', outB.value);
      const conv = function (kg) { const v = CalcUnits.convert('mass', kg, 'kg', outB.value); return fmt(v, v >= 100 ? 0 : 1); };
      bioTxt = bkg ? '≈ ' + conv(bkg) + ' ' + lbl + ' fish' : '≈ ' + conv(c.bioMin) + '–' + conv(c.bioMax) + ' ' + lbl;
    }
    if (bioTxt) text(tx + tw / 2, ty + th + 16, bioTxt, 'middle', 'dim-text');
    text(tx + tw / 2, ty + th + 31, 'at ' + fmt(c.pct, 2) + '% BW/day', 'middle', 'dim-text');

    // arrow tank → bed
    const ax0 = tx + tw + 8, ax1 = 170, ay = ty + th / 2;
    el('path', { class: 'feed-arrow', d: 'M' + ax0 + ',' + ay + ' H' + ax1 + ' M' + (ax1 - 7) + ',' + (ay - 6) + ' L' + ax1 + ',' + ay + ' L' + (ax1 - 7) + ',' + (ay + 6) });

    // --- Grow bed, plan view drawn to scale (right) ---
    // Bed rectangles keep a 2:1 aspect and share the top-left corner, so their drawn area is proportional.
    const bx = 182, by = 38, bwMax = 280, bhMax = 140;
    const areas = [];
    if (c.Amax) areas.push(c.Amax);
    if (c.A > 0) areas.push(c.A);
    const maxA = Math.max.apply(null, areas);
    const k = Math.min(bwMax, bhMax * 2) / Math.sqrt(2 * maxA); // px per sqrt(m²) on the long side
    function dims(a) { const w = Math.sqrt(2 * a) * k; return { w: w, h: w / 2 }; }

    if (c.Amax) {
      const dMax = dims(c.Amax), dMin = dims(c.Amin);
      el('rect', { class: 'bed-zone', x: bx, y: by, width: dMax.w, height: dMax.h });
      el('rect', { class: 'bed-min', x: bx, y: by, width: dMin.w, height: dMin.h });
      el('rect', { class: 'bed-max', x: bx, y: by, width: dMax.w, height: dMax.h });
      // plants in the minimum bed
      const cols = Math.max(2, Math.min(8, Math.round(dMin.w / 26))), rows = Math.max(1, Math.min(4, Math.round(dMin.h / 26)));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const px = bx + dMin.w * (i + 0.5) / cols, py = by + dMin.h * (j + 0.5) / rows;
          el('path', { class: 'plant', d: 'M' + px + ',' + (py + 5) + ' v-6 m0,0 q-6,-1 -7,-6 q5,0 7,6 q1,-6 7,-6 q-1,5 -7,6' });
        }
      }
    }
    if (c.A > 0) {
      const dU = dims(c.A);
      el('rect', { class: 'bed-user', x: bx, y: by, width: dU.w, height: dU.h });
      if (!c.Amax) {
        const cols = Math.max(2, Math.min(8, Math.round(dU.w / 26))), rows = Math.max(1, Math.min(4, Math.round(dU.h / 26)));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const px = bx + dU.w * (i + 0.5) / cols, py = by + dU.h * (j + 0.5) / rows;
            el('path', { class: 'plant', d: 'M' + px + ',' + (py + 5) + ' v-6 m0,0 q-6,-1 -7,-6 q5,0 7,6 q1,-6 7,-6 q-1,5 -7,6' });
          }
        }
      }
    }
    text(bx, by - 10, 'Grow bed (drawn to scale)', 'start', 'name-text');

    // legend under bed
    let ly = by + bhMax + 18;
    let lx = bx;
    function legend(cls, label) {
      el('rect', { class: cls, x: lx, y: ly - 9, width: 14, height: 10 });
      const t = text(lx + 19, ly, label, 'start', 'dim-text');
      lx += 19 + t.getComputedTextLength() + 12;
    }
    if (c.Amax) { legend('bed-min', 'min'); legend('bed-max', 'max for this feed'); }
    if (c.A > 0) legend('bed-user', 'your area');

    // --- Range bar (bottom) ---
    const isFeed = mode === 'feed';
    const lo = isFeed ? c.Amin : c.Fmin, hi = isFeed ? c.Amax : c.Fmax;
    const user = isFeed ? (c.A > 0 ? c.A : null) : (c.F > 0 ? c.F : null);
    const x0 = 34, x1 = 446, yb = 262, bh = 14;
    const top = Math.max(hi, user || 0) * 1.25;
    const X = function (v) { return x0 + (x1 - x0) * Math.min(v, top) / top; };
    text(x0, yb - 40, isFeed ? 'Grow area range (' + CalcUnits.label('area', outA.value) + ')' : 'Daily feed range (' + CalcUnits.label('mass', outF.value) + '/day)', 'start', 'name-text');
    el('rect', { class: 'bar-bg', x: x0, y: yb, width: x1 - x0, height: bh, rx: 7 });
    el('rect', { class: 'bar-zone', x: X(lo), y: yb, width: Math.max(2, X(hi) - X(lo)), height: bh });
    const sh = isFeed ? aShort : fShort;
    // Min / max labels; push apart if they would overlap.
    let xl = X(lo), xh = X(hi);
    if (xh - xl < 56) { const m = (xl + xh) / 2; xl = m - 28; xh = m + 28; }
    xl = Math.max(x0 + 10, xl); xh = Math.min(x1 - 10, xh);
    text(xl, yb + bh + 15, sh(lo), 'middle', 'zone-text');
    text(xh, yb + bh + 15, sh(hi), 'middle', 'zone-text');
    text(x0, yb + bh + 32, '0', 'start', 'dim-text');
    text((X(lo) + X(hi)) / 2, yb + bh + 32, 'guideline', 'middle', 'dim-text');
    if (user) {
      const ux = X(user);
      el('line', { class: 'marker-line', x1: ux, y1: yb - 4, x2: ux, y2: yb + bh + 2 });
      el('path', { class: 'marker', d: 'M' + (ux - 6) + ',' + (yb - 12) + ' L' + (ux + 6) + ',' + (yb - 12) + ' L' + ux + ',' + (yb - 4) + 'Z' });
      const lbl = 'you ' + sh(user);
      const anchor = ux > x1 - 50 ? 'end' : ux < x0 + 50 ? 'start' : 'middle';
      text(ux, yb - 16, lbl, anchor, 'marker-text');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const c = compute();
    const lines = ['Feed Rate to Grow Space Calculator'];
    lines.push('Mode: ' + (mode === 'feed' ? 'daily feed → grow area' : 'grow area → daily feed'));
    lines.push('Crop: ' + PRESETS[cropSel.value].name + ', ratio ' + (c.ok ? fmt(c.r.lo, 1) + '–' + showR(c.r.hi) : '–'));
    if (c.F > 0) lines.push('Daily feed: ' + typed('feed') + '/day');
    if (c.A > 0) lines.push('Grow area: ' + (methodSel.value === 'dims'
      ? typed('nbeds') + ' × ' + typed('blen') + ' × ' + typed('bwid') + ' = ' + showA(c.A)
      : typed('area')));
    lines.push('Feeding rate: ' + typed('pct') + '% body weight/day');
    if (c.ok && c.F > 0) lines.push('Grow area needed: ' + rangeA(c.Amin, c.Amax) + ' (design ' + showA(c.Amid) + ')');
    if (c.ok && c.A > 0) lines.push('Daily feed supported: ' + rangeF(c.Fmin, c.Fmax) + ' (design ' + showF(c.Fmid) + ')');
    if (c.ok && c.pct > 0) {
      if (c.bio) lines.push('Fish biomass for this feed: ' + showB(c.bio));
      if (c.A > 0) lines.push('Fish biomass the area supports: ' + rangeB(c.bioMin, c.bioMax));
    }
    if (c.actual) lines.push('Actual ratio: ' + showR(c.actual) + ' → ' + $('r-status').textContent);
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); render(); });
  });
  INPUT_FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  let prevCrop = cropSel.value;
  cropSel.addEventListener('change', function () { setCrop(prevCrop); prevCrop = cropSel.value; render(); });
  methodSel.addEventListener('change', function () {
    // Carry the area across when switching to total area.
    if (methodSel.value === 'total') {
      const a = CalcUnits.base('blen') * CalcUnits.base('bwid') * Math.floor(numVal('nbeds'));
      if (a > 0) $('area').value = +CalcUnits.convert('area', a, 'm2', CalcUnits.unit('area')).toPrecision(6);
    }
    setMethod(); render();
  });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Feed Rate to Grow Space Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    prevCrop = cropSel.value;
    setMode(DEFAULTS.mode); setMethod(); setCrop(); render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.crop && PRESETS[p.crop]) cropSel.value = p.crop;
    if (p.amethod === 'total' || p.amethod === 'dims') methodSel.value = p.amethod;
    [[outA, 'outa', 'area'], [outF, 'outf', 'mass'], [outB, 'outb', 'mass']].forEach(function (o) {
      if (p[o[1]] && CalcUnits.unitDef(o[2], p[o[1]])) o[0].value = p[o[1]];
    });
    INPUT_FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && p[f] !== '' && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (p[f] !== undefined) CalcUnits.set(f, '', u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    prevCrop = cropSel.value;
    setMode(p.mode === 'area' ? 'area' : 'feed');
    setMethod();
    setCrop();
    render();
  })();
})();
