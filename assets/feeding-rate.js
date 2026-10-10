// Fish Feeding Rate Calculator: daily ration from biomass and % body weight,
// growth from FCR, live SVG (ration split + %BW-vs-size chart), shareable URL state.
(function () {
  'use strict';

  // Size-based daily feeding guide for tilapia at 28 °C (Riche & Garling 2003,
  // NCRAC Fact Sheet 114, Table 2, adapted from NRC 1993). Weights in grams.
  const GUIDE = [
    { lo: 0, hi: 1, max: 30, min: 10, name: 'fry under 1 g' },
    { lo: 1, hi: 5, max: 10, min: 6, name: 'fry 1–5 g' },
    { lo: 5, hi: 20, max: 6, min: 4, name: 'fingerlings 5–20 g' },
    { lo: 20, hi: 100, max: 4, min: 3, name: 'juveniles 20–100 g' },
    { lo: 100, hi: Infinity, max: 3, min: 1.5, name: 'grow-out over 100 g' }
  ];
  const PRESET_RATE = [20, 8, 5, 3.5, 2.25];
  // FAO TP 589 feed rate ratio for leafy greens, g feed per m² per day.
  const FRR_LEAFY = [40, 50];

  const DEFAULTS = { count: 100, weight: 250, weight_u: 'g', biomass: 25, biomass_u: 'kg', rate: 2, feeds: 3, fcr: 1.5 };

  const $ = function (id) { return document.getElementById(id); };
  const modeButtons = document.querySelectorAll('#mode-group button');
  const presetSel = $('preset');
  const outSel = $('out');
  const svg = $('viz');
  const FIELDS = ['count', 'weight', 'biomass', 'rate', 'feeds', 'fcr'];

  let mode = 'count';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  // Mass in kg -> text in the chosen output unit.
  function mass(kg) {
    if (!isFinite(kg)) return '–';
    let u = outSel.value;
    if (u === 'auto-m') u = kg < 1 ? 'g' : 'kg';
    else if (u === 'auto-us') u = kg < 16 * 0.028349523125 ? 'oz' : 'lb';
    return fmt(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }

  // Mass in kg shown in the unit chosen for an input.
  function inUnitOf(field, kg) {
    return fmt(CalcUnits.fromBase(field, kg)) + ' ' + CalcUnits.unitLabel(field);
  }

  function raw(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }

  function typed(id) {
    const v = raw(id);
    return (isFinite(v) ? v : 0) + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }

  function guideFor(grams) {
    if (!(grams > 0)) return null;
    for (let i = 0; i < GUIDE.length; i++) if (grams < GUIDE[i].hi) return GUIDE[i];
    return GUIDE[GUIDE.length - 1];
  }

  // ---------- Calculation (kg, days) ----------
  function compute() {
    const count = Math.floor(Math.max(0, raw('count') || 0));
    const wKg = CalcUnits.base('weight');
    let biomass;
    if (mode === 'count') biomass = count * wKg;
    else biomass = CalcUnits.base('biomass');
    const rate = Math.max(0, raw('rate') || 0);
    const feedsRaw = raw('feeds');
    const feeds = Math.max(0, Math.round(feedsRaw || 0));
    const fcr = raw('fcr');
    const hasFcr = isFinite(fcr) && fcr > 0;

    const daily = biomass * rate / 100;
    const per = feeds > 0 ? daily / feeds : NaN;
    const gainDay = hasFcr ? daily / fcr : NaN;
    // Fish count for per-fish growth: entered count, or biomass ÷ average weight.
    const n = mode === 'count' ? count : (wKg > 0 ? biomass / wKg : 0);
    const after = hasFcr && n > 0 && wKg > 0 ? wKg + gainDay * 30 / n : NaN;

    return {
      count: count, wKg: wKg, biomass: biomass, rate: rate, feeds: feeds, feedsRaw: feedsRaw,
      fcr: fcr, hasFcr: hasFcr, daily: daily, per: per, gainDay: gainDay, n: n, after: after,
      fishSize: wKg * 1000
    };
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for.split(' ').indexOf(m) === -1;
    });
    $('weight-hint').textContent = m === 'count'
      ? 'Weigh a sample of fish and divide by the number weighed.'
      : 'Optional here: used for the size guide, the chart and growth per fish.';
  }

  function getState() {
    const st = { mode: mode, preset: presetSel.value, out: outSel.value };
    FIELDS.forEach(function (f) {
      const wrap = $(f).closest('.field');
      if (wrap.hidden) return;
      st[f] = $(f).value;
      if (CalcUnits.unit(f)) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    CalcUnits.set('count', DEFAULTS.count);
    CalcUnits.set('weight', DEFAULTS.weight, DEFAULTS.weight_u);
    CalcUnits.set('biomass', DEFAULTS.biomass, DEFAULTS.biomass_u);
    CalcUnits.set('rate', DEFAULTS.rate);
    CalcUnits.set('feeds', DEFAULTS.feeds);
    CalcUnits.set('fcr', DEFAULTS.fcr);
    presetSel.value = 'custom';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const hasData = r.biomass > 0 && r.rate > 0;
    const msgs = [];

    if (!(r.biomass > 0)) {
      msgs.push(mode === 'count' ? 'Enter the number of fish and their average weight.' : 'Enter the total fish biomass.');
    }
    if (!(r.rate > 0)) msgs.push('Enter a feeding rate above 0% of body weight per day.');
    if (r.rate > 30) msgs.push('A feeding rate above 30% of body weight per day is higher than any guide value, even for fry. Check the number.');
    if (!(r.feeds >= 1)) msgs.push('Enter at least 1 feeding per day.');
    else if (isFinite(r.feedsRaw) && r.feedsRaw !== r.feeds) msgs.push('Feedings per day rounded to ' + r.feeds + '.');
    if (r.hasFcr && (r.fcr < 0.6 || r.fcr > 4)) msgs.push('An FCR of ' + fmt(r.fcr) + ' is unusual for fed fish; typical values are about 1–2. Growth estimates may be off.');
    if (mode === 'count' && $('count').value !== '' && raw('count') !== r.count) msgs.push('Number of fish rounded down to ' + r.count + '.');

    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    // Guide hint for this fish size
    const hint = $('guide-hint');
    const g = guideFor(r.fishSize);
    hint.classList.remove('out');
    if (g && r.rate > 0) {
      const inside = r.rate >= g.min && r.rate <= g.max;
      hint.textContent = 'Guide for ' + fmt(r.fishSize) + ' g fish (' + g.name + '): ' + fmt(g.max) + '–' + fmt(g.min) + '% BW/day. ' +
        (inside ? 'Your ' + fmt(r.rate) + '% is inside this range.'
          : 'Your ' + fmt(r.rate) + '% is ' + (r.rate > g.max ? 'above' : 'below') + ' this range.');
      if (!inside) hint.classList.add('out');
    } else if (g) {
      hint.textContent = 'Guide for ' + fmt(r.fishSize) + ' g fish (' + g.name + '): ' + fmt(g.max) + '–' + fmt(g.min) + '% BW/day.';
    } else {
      hint.textContent = 'Enter an average fish weight to see the size guide.';
    }

    $('r-daily').textContent = hasData ? mass(r.daily) : '–';
    $('r-per').textContent = hasData && r.feeds >= 1 ? mass(r.per) + ' × ' + r.feeds : '–';
    $('r-week').textContent = hasData ? mass(r.daily * 7) : '–';
    $('r-month').textContent = hasData ? mass(r.daily * 30) : '–';
    $('r-biomass').textContent = r.biomass > 0 ? mass(r.biomass) : '–';
    $('r-gainday').textContent = hasData && r.hasFcr ? mass(r.gainDay) : (hasData ? 'enter FCR' : '–');
    $('r-gainmonth').textContent = hasData && r.hasFcr ? mass(r.gainDay * 30) : (hasData ? 'enter FCR' : '–');
    $('r-after').textContent = hasData && isFinite(r.after) ? inUnitOf('weight', r.after) : (hasData && !r.hasFcr ? 'enter FCR' : '–');
    const gPerDay = r.daily * 1000;
    $('r-area').textContent = hasData
      ? fmt(gPerDay / FRR_LEAFY[1], 1) + '–' + fmt(gPerDay / FRR_LEAFY[0], 1) + ' m² (' +
        fmt(gPerDay / FRR_LEAFY[1] / 0.09290304, 0) + '–' + fmt(gPerDay / FRR_LEAFY[0] / 0.09290304, 0) + ' ft²)'
      : '–';

    $('viz-caption').textContent = hasData
      ? mass(r.daily) + ' per day = ' + fmt(r.rate) + '% of ' + mass(r.biomass) + (r.feeds >= 1 ? ', in ' + r.feeds + ' feeding' + (r.feeds === 1 ? '' : 's') : '')
      : 'Enter fish and a feeding rate to draw the ration';

    drawViz(r, hasData);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;
  // chart area
  const C = { l: 52, r: 466, t: 150, b: 352 };
  const XMIN = 0.1, XMAX = 3000;   // g
  const YMIN = 0.5, YMAX = 40;     // % BW/day

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function sx(g) {
    const v = Math.min(XMAX, Math.max(XMIN, g));
    return C.l + (Math.log(v) - Math.log(XMIN)) / (Math.log(XMAX) - Math.log(XMIN)) * (C.r - C.l);
  }
  function sy(p) {
    const v = Math.min(YMAX, Math.max(YMIN, p));
    return C.b - (Math.log(v) - Math.log(YMIN)) / (Math.log(YMAX) - Math.log(YMIN)) * (C.b - C.t);
  }

  function drawViz(r, hasData) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // ----- Ration bar -----
    el('text', { x: 20, y: 22, class: 'title-text' }, 'Daily ration split into feedings');
    const bx0 = 20, bx1 = VW - 20, by = 36, bh = 40;
    const n = hasData && r.feeds >= 1 ? Math.min(r.feeds, 24) : 0;
    if (n > 0) {
      const gap = n > 12 ? 2 : 6;
      const w = (bx1 - bx0 - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x = bx0 + i * (w + gap);
        el('rect', { class: 'feed', x: x, y: by, width: w, height: bh, rx: Math.min(6, w / 3) });
        if (w > 58) el('text', { x: x + w / 2, y: by + bh / 2 + 4, 'text-anchor': 'middle', class: 'feed-text' }, mass(r.per));
        else if (w > 18 && n <= 12) el('text', { x: x + w / 2, y: by + bh / 2 + 4, 'text-anchor': 'middle', class: 'feed-text' }, String(i + 1));
      }
      const lbl = r.feeds > 24 ? r.feeds + ' feedings (first 24 drawn)' : r.feeds + ' × ' + mass(r.per);
      el('text', { x: bx0, y: by + bh + 18, class: 'dim-text' }, lbl);
      el('text', { x: bx1, y: by + bh + 18, 'text-anchor': 'end', class: 'dim-text' }, 'total ' + mass(r.daily) + '/day');
    } else {
      el('rect', { class: 'feed-empty', x: bx0, y: by, width: bx1 - bx0, height: bh, rx: 6 });
      el('text', { x: VW / 2, y: by + bh / 2 + 4, 'text-anchor': 'middle', class: 'dim-text' }, 'No ration yet');
    }

    // ----- Chart: % BW/day vs fish size -----
    el('text', { x: 20, y: 128, class: 'title-text' }, 'Feeding rate vs fish size (guide)');

    // grid + y ticks
    [0.5, 1, 2, 5, 10, 20, 40].forEach(function (p) {
      const y = sy(p);
      el('line', { class: 'grid', x1: C.l, y1: y, x2: C.r, y2: y });
      if (p > YMIN) el('text', { x: C.l - 6, y: y + 4, 'text-anchor': 'end', class: 'dim-text' }, fmt(p) + '%');
    });
    [0.1, 1, 10, 100, 1000].forEach(function (g) {
      const x = sx(g);
      el('line', { class: 'grid', x1: x, y1: C.t, x2: x, y2: C.b });
      el('text', { x: x, y: C.b + 16, 'text-anchor': 'middle', class: 'dim-text' }, g >= 1000 ? fmt(g / 1000) + ' kg' : fmt(g) + ' g');
    });

    // guide bands
    GUIDE.forEach(function (gd) {
      const x0 = sx(Math.max(gd.lo, XMIN)), x1 = sx(Math.min(gd.hi, XMAX));
      el('rect', { class: 'band', x: x0, y: sy(gd.max), width: x1 - x0, height: sy(gd.min) - sy(gd.max), 'fill-opacity': 0.9 });
    });
    // FAO 589 grow-out rule of thumb: 1–2 % for fish over 50 g
    el('rect', { class: 'ref-line', x: sx(50), y: sy(2), width: sx(XMAX) - sx(50), height: sy(1) - sy(2) });
    el('text', { x: C.r - 4, y: sy(1) + 14, 'text-anchor': 'end', class: 'dim-text' }, 'FAO grow-out 1–2%');

    // axes
    el('path', { class: 'axis', d: 'M' + C.l + ',' + C.t + ' L' + C.l + ',' + C.b + ' L' + C.r + ',' + C.b });
    el('text', { x: (C.l + C.r) / 2, y: C.b + 36, 'text-anchor': 'middle', class: 'dim-text' }, 'average fish weight (log scale)');

    // user's point
    if (r.rate > 0) {
      const y = sy(r.rate);
      if (r.fishSize > 0) {
        const x = sx(r.fishSize);
        el('line', { class: 'you-line', x1: x, y1: y, x2: x, y2: C.b });
        el('line', { class: 'you-line', x1: C.l, y1: y, x2: x, y2: y });
        el('circle', { class: 'you', cx: x, cy: y, r: 6.5 });
        const txt = 'you: ' + fmt(r.fishSize) + ' g, ' + fmt(r.rate) + '%';
        const right = x < (C.l + C.r) / 2;
        const ty = y > C.t + 24 ? y - 12 : y + 22;
        el('text', { x: right ? x + 10 : x - 10, y: ty, 'text-anchor': right ? 'start' : 'end', class: 'you-text' }, txt);
      } else {
        el('line', { class: 'you-line', x1: C.l, y1: y, x2: C.r, y2: y });
        el('text', { x: C.l + 6, y: y - 6, class: 'you-text' }, 'your rate ' + fmt(r.rate) + '% (add a fish weight to plot)');
      }
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const fishLine = mode === 'count'
      ? 'Fish: ' + r.count + ' × ' + typed('weight') + ' = ' + mass(r.biomass) + ' biomass'
      : 'Fish biomass: ' + typed('biomass') + (r.wKg > 0 ? ', average weight ' + typed('weight') : '');
    const lines = [
      'Fish Feeding Rate Calculator',
      fishLine,
      'Feeding rate: ' + fmt(r.rate) + '% body weight per day, ' + r.feeds + ' feedings per day' + (r.hasFcr ? ', FCR ' + fmt(r.fcr) : ''),
      'Daily feed: ' + mass(r.daily),
      'Per feeding: ' + (r.feeds >= 1 ? mass(r.per) : '–'),
      'Per week: ' + mass(r.daily * 7) + ' · per 30 days: ' + mass(r.daily * 30)
    ];
    if (r.hasFcr) {
      lines.push('Expected biomass gain: ' + mass(r.gainDay) + '/day, ' + mass(r.gainDay * 30) + ' per 30 days');
      if (isFinite(r.after)) lines.push('Average weight after 30 days: ' + inUnitOf('weight', r.after));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      // Carry the current biomass across so switching modes keeps the same fish.
      const r = compute();
      if (b.dataset.mode === 'biomass' && mode === 'count' && r.biomass > 0) {
        CalcUnits.set('biomass', +CalcUnits.fromBase('biomass', r.biomass).toPrecision(6));
      }
      setMode(b.dataset.mode);
      render();
    });
  });

  FIELDS.forEach(function (f) {
    $(f).addEventListener('input', function () {
      if (f === 'rate') presetSel.value = 'custom';
      render();
    });
  });
  presetSel.addEventListener('change', function () {
    const i = parseInt(presetSel.value, 10);
    if (isFinite(i) && PRESET_RATE[i] !== undefined) $('rate').value = PRESET_RATE[i];
    render();
  });
  outSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Fish Feeding Rate Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    outSel.value = 'auto-m';
    applyDefaults();
    setMode('count');
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.out && outSel.querySelector('option[value="' + p.out + '"]')) outSel.value = p.out;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.preset && presetSel.querySelector('option[value="' + p.preset + '"]')) presetSel.value = p.preset;
    setMode(p.mode === 'biomass' ? 'biomass' : 'count');
    render();
  })();
})();
