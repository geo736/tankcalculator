// Feed Conversion Ratio (FCR) Calculator: biological and economic FCR, SGR, feed
// efficiency, PER and feed % BW from production records, or feed / cost planning
// with two FCR values. Live SVG (feed vs gain bars + FCR gauge, or feed-vs-FCR line).
(function () {
  'use strict';

  // Currency symbols are display only: no exchange rates are applied (as cost-benefit.js).
  const CURRENCIES = [
    { id: 'usd', sym: '$', label: '$ (dollar)' },
    { id: 'eur', sym: '€', label: '€ (euro)' },
    { id: 'gbp', sym: '£', label: '£ (pound)' },
    { id: 'jpy', sym: '¥', label: '¥ (yen / yuan)' },
    { id: 'inr', sym: '₹', label: '₹ (rupee)' },
    { id: 'aud', sym: 'A$', label: 'A$ (Australian dollar)' },
    { id: 'cad', sym: 'C$', label: 'C$ (Canadian dollar)' },
    { id: 'nzd', sym: 'NZ$', label: 'NZ$ (NZ dollar)' },
    { id: 'zar', sym: 'R ', label: 'R (rand)' },
    { id: 'brl', sym: 'R$', label: 'R$ (real)' },
    { id: 'php', sym: '₱', label: '₱ (peso)' },
    { id: 'ngn', sym: '₦', label: '₦ (naira)' },
    { id: 'kes', sym: 'KSh ', label: 'KSh (shilling)' },
    { id: 'kr', sym: 'kr ', label: 'kr (krona / krone)' },
    { id: 'none', sym: '', label: 'No symbol' }
  ];

  // Feed price "per" units -> kg of feed (NIST: 1 lb = 0.45359237 kg, 1 US ton = 2000 lb).
  const PRICE_PER = { kg: 1, lb: 0.45359237, t: 1000, ton: 907.18474 };

  // Reference FCR values. Only figures traced to a named source; 'general' is the
  // site-wide rule of thumb (feeding-rate page). Compared with economic FCR.
  const REFS = {
    general: { lo: 1, hi: 2, label: 'rule of thumb 1–2',
      hint: 'Rule of thumb only: fed fish typically convert at about 1–2 kg feed per kg gain.' },
    tilapia: { lo: 1.4, hi: 2.0, marks: [{ v: 1.8, t: 'budget 1.8' }], label: 'tilapia RAS 1.4–2.0',
      hint: 'Lutz (2000), Louisiana greenhouse RAS: long-term FCR 1.4–2.0 depending on feed supplier; budget uses 1.8.' },
    catfish: { lo: null, hi: 1.8, marks: [{ v: 2.5, t: 'farm example 2.5' }], label: 'research ponds ≤ 1.8',
      hint: 'Robinson & Li (2015): research ponds routinely reach 1.8 or less, rare on commercial farms; they use 2.5 as an example farm-level FCR.' },
    salmon: { lo: null, hi: null, marks: [{ v: 1.30, t: 'Norway 2016: 1.30' }], label: 'Norway national eFCR',
      hint: 'Aas et al. (2019): Norwegian national economic FCR 1.30 in 2016 (as-fed; 1.21 dry matter).' }
  };

  const TAN_FACTOR = 0.092; // 0.16 × 0.8 × 0.8 × 0.9 (Timmons et al. 2002; Ebeling et al. 2006)

  const STOCKS = ['start', 'end', 'rem', 'dead'];
  const STOCK_NAMES = { start: 'Start', end: 'End', rem: 'Removed', dead: 'Dead' };
  const FIELDS = [
    'start_n', 'start_w', 'start_b', 'end_n', 'end_w', 'end_b', 'rem_n', 'rem_w', 'rem_b',
    'dead_n', 'dead_w', 'dead_b', 'feed', 'days', 'gain', 'fcr_a', 'fcr_b', 'protein', 'price'
  ];
  const MEASURE_ONLY = ['start_n', 'start_w', 'start_b', 'end_n', 'end_w', 'end_b', 'rem_n', 'rem_w', 'rem_b',
    'dead_n', 'dead_w', 'dead_b', 'feed', 'days'];
  const PLAN_ONLY = ['gain', 'fcr_a', 'fcr_b'];
  // Optional inputs: an emptied box is written to the URL as "none" so it stays empty on reload.
  const OPTIONAL = ['fcr_b', 'protein', 'price', 'start_n', 'end_n', 'rem_n', 'dead_n'];

  const DEFAULTS = {
    mode: 'measure',
    how: { start: 'cw', end: 'cw', rem: 'cw', dead: 'cw' },
    v: {
      start_n: 1000, start_w: 50, start_b: 50, end_n: 900, end_w: 250, end_b: 225,
      rem_n: 60, rem_w: 200, rem_b: 12, dead_n: 40, dead_w: 120, dead_b: 4.8,
      feed: 300, days: 120, gain: 1000, fcr_a: 1.6, fcr_b: 1.3, protein: 32, price: 1.2
    },
    u: { start_w: 'g', start_b: 'kg', end_w: 'g', end_b: 'kg', rem_w: 'g', rem_b: 'kg', dead_w: 'g', dead_b: 'kg',
      feed: 'kg', days: 'd', gain: 'kg' },
    species: 'tilapia', cur: 'usd', price_u: 'kg', out: 'kg'
  };

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const modeButtons = document.querySelectorAll('#mode-group button');
  let mode = 'measure';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function fixed(n, d) {
    if (!isFinite(n)) return '–';
    return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function sym() {
    const c = CURRENCIES.filter(function (x) { return x.id === $('cur').value; })[0];
    return c ? c.sym : '$';
  }
  function money(n, dec) {
    if (!isFinite(n)) return '–';
    const d = dec !== undefined ? dec : (Math.abs(n) >= 100 ? 0 : 2);
    const s = n < 0 ? '−' : '';
    return s + sym() + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function outUnit() { return $('out').value || 'kg'; }
  function mass(kg) {
    if (!isFinite(kg)) return '–';
    const u = outUnit();
    return fmt(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }
  function massShort(kg) {
    const u = outUnit();
    const v = CalcUnits.convert('mass', kg, 'kg', u);
    const a = Math.abs(v);
    const s = a >= 1e4 ? fmt(v / 1000, 1) + 'k' : fmt(v, a >= 100 ? 0 : 1);
    return s + ' ' + CalcUnits.label('mass', u).replace(' (metric)', '');
  }
  function raw(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }
  function typed(id) {
    const v = raw(id);
    return (isFinite(v) ? fmt(v, 4) : '–') + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }
  function how(s) { return $(s + '_how').value === 'bm' ? 'bm' : 'cw'; }

  // ---------- Calculation (kg, days) ----------
  // A stock group: biomass (kg), fish count (NaN if unknown), average weight (kg, NaN if unknown).
  function stock(s) {
    const nRaw = raw(s + '_n');
    const n = isFinite(nRaw) && nRaw >= 0 ? nRaw : NaN;
    let b, w;
    if (how(s) === 'cw') {
      w = CalcUnits.base(s + '_w');
      const nn = isFinite(n) ? n : 0;
      b = nn * w;
      if (!(w > 0)) w = NaN;
    } else {
      b = CalcUnits.base(s + '_b');
      w = n > 0 && b > 0 ? b / n : NaN;
    }
    return { b: b, n: n, w: w };
  }

  function priceKg() {
    const p = raw('price');
    if (!(p > 0)) return NaN;
    return p / PRICE_PER[$('price_u').value || 'kg'];
  }
  function protein() {
    const p = raw('protein');
    return p > 0 && p <= 100 ? p / 100 : NaN;
  }

  function computeMeasure() {
    const S = stock('start'), E = stock('end'), R = stock('rem'), D = stock('dead');
    const F = CalcUnits.base('feed');
    const t = CalcUnits.base('days') / 86400;
    const gBio = E.b + R.b + D.b - S.b;
    const gEco = E.b + R.b - S.b;
    const bfcr = F > 0 && gBio > 0 ? F / gBio : NaN;
    const efcr = F > 0 && gEco > 0 ? F / gEco : NaN;
    const fe = F > 0 ? 100 * gBio / F : NaN;
    const pr = protein();
    const protFed = isFinite(pr) ? F * pr : NaN;
    const per = protFed > 0 && gBio > 0 ? gBio / protFed : NaN;
    const g = S.w > 0 && E.w > 0 && t > 0 ? (Math.log(E.w) - Math.log(S.w)) / t : NaN;
    const sgr = 100 * g;
    const sgrC = 100 * (Math.exp(g) - 1);
    const daily = t > 0 ? F / t : NaN;
    const meanB = (S.b + E.b) / 2;
    const bw = t > 0 && meanB > 0 ? 100 * daily / meanB : NaN;
    const mort = S.n > 0 && isFinite(D.n) ? 100 * D.n / S.n : NaN;
    const pk = priceKg();
    const costKg = isFinite(pk) && isFinite(efcr) ? pk * efcr : NaN;
    const tan = isFinite(protFed) ? protFed * TAN_FACTOR : NaN;
    const tanPerKg = isFinite(tan) && gEco > 0 ? tan / gEco : NaN;
    let unacc = NaN;
    if ([S.n, E.n, R.n, D.n].every(isFinite)) unacc = S.n - E.n - R.n - D.n;
    return { S: S, E: E, R: R, D: D, F: F, t: t, gBio: gBio, gEco: gEco, bfcr: bfcr, efcr: efcr, fe: fe,
      pr: pr, protFed: protFed, per: per, g: g, sgr: sgr, sgrC: sgrC, daily: daily, meanB: meanB, bw: bw,
      mort: mort, pk: pk, costKg: costKg, tan: tan, tanPerKg: tanPerKg, unacc: unacc };
  }

  function computePlan() {
    const G = CalcUnits.base('gain');
    const a = raw('fcr_a'), b = raw('fcr_b');
    const hasA = a > 0, hasB = b > 0;
    const feedA = hasA ? G * a : NaN, feedB = hasB ? G * b : NaN;
    const pk = priceKg();
    const pr = protein();
    return { G: G, a: a, b: b, hasA: hasA, hasB: hasB, feedA: feedA, feedB: feedB, saved: feedA - feedB,
      pk: pk, costA: feedA * pk, costB: feedB * pk, moneySaved: (feedA - feedB) * pk,
      perKgA: a * pk, perKgB: b * pk, step: G * 0.1, stepMoney: G * 0.1 * pk,
      pr: pr, tanA: feedA * pr * TAN_FACTOR, tanB: feedB * pr * TAN_FACTOR };
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m === 'plan' ? 'plan' : 'measure';
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
    document.querySelectorAll('[data-mode-show]').forEach(function (el) { el.hidden = el.dataset.modeShow !== mode; });
  }

  function applyHow() {
    STOCKS.forEach(function (s) {
      const h = how(s);
      const fs = $(s + '_how').closest('fieldset');
      fs.querySelectorAll('[data-how]').forEach(function (el) { el.hidden = el.dataset.how !== h; });
      fs.querySelector('[data-n-label]').textContent = h === 'cw' ? 'Number of fish' : 'Number of fish, optional';
    });
  }

  function getState() {
    const st = { mode: mode, species: $('species').value, cur: $('cur').value, price_u: $('price_u').value, out: $('out').value };
    if (mode === 'measure') STOCKS.forEach(function (s) { st[s + '_how'] = how(s); });
    FIELDS.forEach(function (f) {
      if (mode === 'measure' && PLAN_ONLY.indexOf(f) !== -1) return;
      if (mode === 'plan' && MEASURE_ONLY.indexOf(f) !== -1) return;
      if ($(f).closest('.field').hidden) return;
      st[f] = $(f).value === '' && OPTIONAL.indexOf(f) !== -1 ? 'none' : $(f).value;
      if (CalcUnits.unit(f)) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS.v[f], DEFAULTS.u[f]); });
    STOCKS.forEach(function (s) { $(s + '_how').value = DEFAULTS.how[s]; });
    $('species').value = DEFAULTS.species;
    $('cur').value = DEFAULTS.cur;
    $('price_u').value = DEFAULTS.price_u;
    $('out').value = DEFAULTS.out;
  }

  // ---------- Render ----------
  function setText(id, s) { $(id).textContent = s; }

  function refCompare(v) {
    const ref = REFS[$('species').value] || REFS.general;
    if (!isFinite(v)) return { text: ref.hint, out: false };
    let where = '';
    let out = false;
    if (ref.lo !== null && ref.hi !== null) {
      if (v < ref.lo) { where = 'below this range (better than the reference, or check your records)'; out = true; }
      else if (v > ref.hi) { where = 'above this range'; out = true; }
      else where = 'inside this range';
    } else if (ref.hi !== null) {
      where = v <= ref.hi ? 'at or below ' + fmt(ref.hi) : 'above ' + fmt(ref.hi);
      out = v > ref.hi;
    } else if (ref.marks) {
      const m = ref.marks[0].v;
      where = v <= m ? 'at or below ' + fmt(m) : fmt(v - m, 2) + ' above ' + fmt(m);
    }
    const lead = mode === 'measure' ? 'Your economic FCR ' : 'Your current FCR ';
    return { text: ref.hint + ' ' + lead + fmt(v, 2) + ' is ' + where + '.', out: out };
  }

  function render() {
    const s = sym();
    document.querySelectorAll('.cur-pre').forEach(function (e) { e.textContent = s.trim() || '#'; });
    applyHow();
    if (mode === 'measure') renderMeasure(); else renderPlan();
    CalcShare.writeParams(getState());
  }

  function renderMeasure() {
    const r = computeMeasure();
    const msgs = [];
    if (!(r.S.b > 0)) msgs.push('Enter the fish at the start of the period.');
    if (!(r.E.b > 0) && !(r.R.b > 0)) msgs.push('Enter the fish at the end of the period (or the fish removed).');
    if (!(r.F > 0)) msgs.push('Enter the feed fed during the period.');
    if (r.F > 0 && r.S.b > 0 && (r.E.b > 0 || r.R.b > 0)) {
      if (!(r.gBio > 0)) msgs.push('The fish weighed less in total at the end than at the start, so there was no gain and FCR cannot be calculated. Check the weights and units.');
      else if (!(r.gEco > 0)) msgs.push('Net harvestable gain is zero or negative (losses to mortality were larger than growth), so economic FCR cannot be calculated.');
    }
    if (isFinite(r.bfcr) && (r.bfcr < 0.6 || r.efcr > 4 || r.bfcr > 4)) msgs.push('An FCR outside about 0.6–4 is unusual for fish fed a pellet diet. Check the feed total, weights and units.');
    STOCKS.forEach(function (st) {
      const v = raw(st + '_n');
      if ($(st + '_n').value !== '' && isFinite(v) && (v < 0 || v !== Math.floor(v))) msgs.push(STOCK_NAMES[st] + ' fish count should be a whole number.');
    });
    if (isFinite(r.unacc) && Math.abs(r.unacc) >= 0.5) {
      if (r.unacc > 0) msgs.push(fmt(r.unacc, 0) + ' fish are unaccounted for (start − removed − dead − end). Missing fish are usually uncounted deaths, predation or a counting error; their weight is in neither FCR, so both may be understated.');
      else msgs.push('There are ' + fmt(-r.unacc, 0) + ' more fish at the end than the counts allow. If fish were added during the period, add their weight to the starting fish.');
    }
    if (!(r.t > 0)) msgs.push('Enter the length of the period to get growth rate and daily feed.');
    else if ((r.S.w > 0) !== true || (r.E.w > 0) !== true) msgs.push('Specific growth rate needs the average weight at the start and end: enter the number of fish.');
    if ($('protein').value !== '' && !isFinite(r.pr)) msgs.push('Feed protein must be between 0 and 100%.');

    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    setText('r-main-label', 'Biological FCR (kg feed per kg gain)');
    setText('r-main', isFinite(r.bfcr) ? fixed(r.bfcr, 2) : '–');
    setText('r-efcr', isFinite(r.efcr) ? fixed(r.efcr, 2) : '–');
    setText('r-gb', r.F > 0 || r.S.b > 0 ? mass(r.gBio) : '–');
    setText('r-ge', r.F > 0 || r.S.b > 0 ? mass(r.gEco) : '–');
    setText('r-fe', isFinite(r.bfcr) ? fmt(r.fe, 1) + '%' : '–');
    setText('r-per', isFinite(r.per) ? fixed(r.per, 2) + ' kg gain / kg protein' : (isFinite(r.bfcr) ? 'enter feed protein' : '–'));
    setText('r-sgr', isFinite(r.g) ? fixed(r.sgr, 2) + '%/day (compound ' + fixed(r.sgrC, 2) + '%/day)' : '–');
    setText('r-bw', isFinite(r.bw) ? fixed(r.bw, 2) + '%/day' : '–');
    setText('r-daily', isFinite(r.daily) && r.F > 0 ? mass(r.daily) + '/day' : '–');
    setText('r-mort', isFinite(r.mort) ? fmt(r.mort, 1) + '% (' + fmt(r.D.n, 0) + ' of ' + fmt(r.S.n, 0) + ')' : '–');
    setText('r-cost', isFinite(r.costKg) ? money(r.costKg) + ' per kg (' + money(r.costKg * 0.45359237) + ' per lb)' : (isFinite(r.efcr) ? 'enter feed price' : '–'));
    setText('r-tan', isFinite(r.tan) && r.F > 0 ? mass(r.tan) + (isFinite(r.tanPerKg) ? ' (' + fmt(r.tanPerKg * 1000, 0) + ' g per kg fish)' : '') : (r.F > 0 ? 'enter feed protein' : '–'));

    const cmp = refCompare(r.efcr);
    $('ref-hint').textContent = cmp.text;
    $('ref-hint').classList.toggle('out', cmp.out);

    setText('viz-caption', isFinite(r.bfcr)
      ? mass(r.F) + ' of feed produced ' + mass(r.gBio) + ' of fish (' + mass(r.gEco) + ' harvestable): biological FCR ' + fixed(r.bfcr, 2) + (isFinite(r.efcr) ? ', economic FCR ' + fixed(r.efcr, 2) : '')
      : 'Enter the fish and feed records to compare feed with growth');
    drawMeasure(r);
  }

  function renderPlan() {
    const r = computePlan();
    const msgs = [];
    if (!(r.G > 0)) msgs.push('Enter the fish weight you want to grow.');
    if (!r.hasA) msgs.push('Enter your current FCR.');
    [['current', r.a], ['improved', r.b]].forEach(function (x) {
      if (x[1] > 0 && (x[1] < 0.6 || x[1] > 4)) msgs.push('An ' + x[0] + ' FCR of ' + fmt(x[1]) + ' is unusual for fish fed a pellet diet; typical values are about 1–2.');
    });
    if (r.hasA && r.hasB && r.b > r.a) msgs.push('The "improved" FCR is higher than the current one, so the savings show as negative.');
    if ($('protein').value !== '' && !isFinite(r.pr)) msgs.push('Feed protein must be between 0 and 100%.');
    const notice = $('notice');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const ok = r.G > 0 && r.hasA;
    const okB = r.G > 0 && r.hasB;
    const both = ok && okB;
    const hasP = isFinite(r.pk);
    setText('r-main-label', 'Feed needed at current FCR');
    setText('r-main', ok ? mass(r.feedA) : '–');
    setText('r-feed-b', okB ? mass(r.feedB) : '–');
    setText('r-saved', both ? mass(r.saved) + ' (' + fmt(100 * r.saved / r.feedA, 1) + '%)' : '–');
    setText('r-cost-a', ok && hasP ? money(r.costA) : (ok ? 'enter feed price' : '–'));
    setText('r-cost-b', okB && hasP ? money(r.costB) : (okB ? 'enter feed price' : '–'));
    setText('r-money', both && hasP ? money(r.moneySaved) : '–');
    setText('r-perkg', ok && hasP ? money(r.perKgA) + (r.hasB ? ' → ' + money(r.perKgB) : '') + ' per kg' : '–');
    setText('r-step', r.G > 0 ? mass(r.step) + ' of feed' + (hasP ? ' = ' + money(r.stepMoney) : '') : '–');
    setText('r-tan-plan', ok && isFinite(r.pr) ? mass(r.tanA) + (okB ? ' → ' + mass(r.tanB) : '') : (ok ? 'enter feed protein' : '–'));

    const cmp = refCompare(r.hasA ? r.a : NaN);
    $('ref-hint').textContent = cmp.text;
    $('ref-hint').classList.toggle('out', cmp.out);

    setText('viz-caption', ok
      ? 'Feed needed for ' + mass(r.G) + ' of fish: ' + mass(r.feedA) + ' at FCR ' + fmt(r.a) + (okB ? ', ' + mass(r.feedB) + ' at FCR ' + fmt(r.b) : '')
      : 'Enter a biomass gain and an FCR to draw the feed line');
    drawPlan(r, ok);
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;
  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function clear() { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  function drawGauge(y0, valB, valE, singleLabel) {
    const ref = REFS[$('species').value] || REFS.general;
    const x0 = 30, x1 = 450;
    let vmax = 3;
    [valB, valE].forEach(function (v) { if (isFinite(v) && v > vmax - 0.2) vmax = Math.min(6, Math.ceil((v + 0.3) * 2) / 2); });
    const vmin = 0.5;
    const sx = function (v) { return x0 + (Math.min(vmax, Math.max(vmin, v)) - vmin) / (vmax - vmin) * (x1 - x0); };
    const ty = y0 + 40; // track centre
    el('rect', { class: 'track', x: x0, y: ty - 9, width: x1 - x0, height: 18, rx: 9 });
    // reference band / marks
    if (ref.lo !== null || ref.hi !== null) {
      const lo = ref.lo !== null ? ref.lo : vmin, hi = ref.hi !== null ? ref.hi : vmax;
      el('rect', { class: 'band', x: sx(lo), y: ty - 9, width: Math.max(2, sx(hi) - sx(lo)), height: 18, rx: ref.lo === null ? 9 : 2 });
    }
    (ref.marks || []).forEach(function (m) {
      el('line', { class: 'ref-mark', x1: sx(m.v), y1: ty - 13, x2: sx(m.v), y2: ty + 13 });
    });
    // ticks
    for (let v = vmin; v <= vmax + 1e-9; v += 0.5) {
      const x = sx(v);
      el('line', { class: 'tick', x1: x, y1: ty + 10, x2: x, y2: ty + 15 });
      el('text', { x: x, y: ty + 28, 'text-anchor': 'middle', class: 'dim-text' }, fmt(v, 1));
    }
    const marksText = (ref.marks || []).map(function (m) { return m.t; }).join(', ');
    el('text', { x: x0, y: ty + 76, class: 'band-text' }, 'Reference: ' + ref.label + (marksText && ref.label.indexOf(marksText) === -1 ? ' · ' + marksText : '') + (mode === 'measure' ? ' (vs economic FCR)' : ''));
    // markers: biological above, economic below
    function anchor(x) { return x < x0 + 50 ? 'start' : x > x1 - 50 ? 'end' : 'middle'; }
    if (isFinite(valB)) {
      const x = sx(valB);
      el('path', { class: 'mk-bio', d: 'M' + (x - 7) + ',' + (ty - 22) + ' L' + (x + 7) + ',' + (ty - 22) + ' L' + x + ',' + (ty - 8) + 'Z' });
      el('text', { x: x, y: ty - 27, 'text-anchor': anchor(x), class: 'mk-bio-text' }, (singleLabel || 'biological ') + fixed(valB, 2));
    }
    if (isFinite(valE)) {
      const x = sx(valE);
      const yy = ty + 52;
      el('path', { class: 'mk-eco', d: 'M' + (x - 7) + ',' + (ty + 8) + ' L' + x + ',' + (ty - 4) + ' L' + (x + 7) + ',' + (ty + 8) + 'Z' });
      el('line', { class: 'guide', x1: x, y1: ty + 8, x2: x, y2: yy - 12 });
      el('text', { x: x, y: yy, 'text-anchor': anchor(x), class: 'mk-eco-text' }, 'economic ' + fixed(valE, 2));
    }
  }

  function drawMeasure(r) {
    clear();
    svg.setAttribute('viewBox', '0 0 ' + VW + ' 340');
    svg.setAttribute('aria-label', 'Feed fed compared with fish weight gained, and your FCR on a scale with the reference range');
    el('text', { x: 20, y: 22, class: 'title-text' }, 'Feed in vs fish weight gained');
    const bx0 = 92, bx1 = 460, bh = 32;
    const ok = r.F > 0 && r.gBio > 0;
    el('text', { x: 20, y: 58, class: 'label-text' }, 'Feed fed');
    el('text', { x: 20, y: 114, class: 'label-text' }, 'Fish gain');
    if (!ok) {
      el('rect', { class: 'bar-empty', x: bx0, y: 38, width: bx1 - bx0, height: bh, rx: 6 });
      el('rect', { class: 'bar-empty', x: bx0, y: 94, width: bx1 - bx0, height: bh, rx: 6 });
      el('text', { x: (bx0 + bx1) / 2, y: 118, 'text-anchor': 'middle', class: 'dim-text' }, 'No gain to show yet');
    } else {
      const max = Math.max(r.F, r.gBio);
      const sc = function (v) { return Math.max(0, v) / max * (bx1 - bx0); };
      const wf = sc(r.F);
      el('rect', { class: 'bar-feed', x: bx0, y: 38, width: wf, height: bh, rx: 4 });
      if (wf > 70) el('text', { x: bx0 + 8, y: 59, class: 'bar-text' }, massShort(r.F));
      const we = sc(Math.max(0, r.gEco)), wd = sc(r.gBio) - we;
      if (we > 0) el('rect', { class: 'bar-gain', x: bx0, y: 94, width: we, height: bh, rx: 4 });
      if (wd > 0) el('rect', { class: 'bar-dead', x: bx0 + we, y: 94, width: Math.max(wd, 1.5), height: bh });
      if (we > 70) el('text', { x: bx0 + 8, y: 115, class: 'bar-text' }, massShort(r.gEco));
      // legend
      el('rect', { class: 'bar-gain', x: bx0, y: 136, width: 10, height: 10, rx: 2 });
      el('text', { x: bx0 + 14, y: 145, class: 'dim-text' }, 'harvestable ' + massShort(Math.max(0, r.gEco)));
      el('rect', { class: 'bar-dead', x: bx0 + 190, y: 136, width: 10, height: 10, rx: 2 });
      el('text', { x: bx0 + 204, y: 145, class: 'dim-text' }, 'dead fish ' + massShort(r.D.b));
      if (r.F > r.gBio) el('text', { x: bx1, y: 87, 'text-anchor': 'end', class: 'dim-text' }, fmt(r.fe, 0) + '% of the feed weight became fish');
    }
    el('text', { x: 20, y: 184, class: 'title-text' }, 'Your FCR vs reference');
    drawGauge(190, r.bfcr, r.efcr);
  }

  function drawPlan(r, ok) {
    clear();
    svg.setAttribute('viewBox', '0 0 ' + VW + ' 380');
    svg.setAttribute('aria-label', 'Feed needed against FCR for your biomass gain, with your current and improved FCR marked');
    el('text', { x: 20, y: 22, class: 'title-text' }, 'Feed needed vs FCR for ' + (r.G > 0 ? massShort(r.G) : '–') + ' of fish');
    const C = { l: 64, r: 462, t: 40, b: 200 };
    let xmax = 3;
    [r.a, r.b].forEach(function (v) { if (v > xmax - 0.2) xmax = Math.min(6, Math.ceil((v + 0.3) * 2) / 2); });
    const xmin = 0.5;
    const sx = function (v) { return C.l + (Math.min(xmax, Math.max(xmin, v)) - xmin) / (xmax - xmin) * (C.r - C.l); };
    const ymax = r.G > 0 ? r.G * xmax : 1;
    const sy = function (v) { return C.b - Math.max(0, Math.min(ymax, v)) / ymax * (C.b - C.t); };
    for (let i = 0; i <= 4; i++) {
      const v = ymax * i / 4, y = sy(v);
      el('line', { class: 'grid', x1: C.l, y1: y, x2: C.r, y2: y });
      if (r.G > 0) el('text', { x: C.l - 6, y: y + 4, 'text-anchor': 'end', class: 'dim-text' }, massShort(v));
    }
    for (let v = xmin; v <= xmax + 1e-9; v += 0.5) {
      el('text', { x: sx(v), y: C.b + 16, 'text-anchor': 'middle', class: 'dim-text' }, fmt(v, 1));
    }
    el('path', { class: 'axis', d: 'M' + C.l + ',' + C.t + ' L' + C.l + ',' + C.b + ' L' + C.r + ',' + C.b });
    el('text', { x: (C.l + C.r) / 2, y: C.b + 32, 'text-anchor': 'middle', class: 'dim-text' }, 'FCR (kg feed per kg fish)');
    if (r.G > 0) {
      el('path', { class: 'curve', d: 'M' + sx(xmin) + ',' + sy(r.G * xmin) + ' L' + sx(xmax) + ',' + sy(r.G * xmax) });
      const pts = [];
      if (r.hasA) pts.push({ v: r.a, f: r.feedA, cls: 'mk-eco', tcls: 'mk-eco-text', t: 'current' });
      if (r.hasB) pts.push({ v: r.b, f: r.feedB, cls: 'mk-bio', tcls: 'mk-bio-text', t: 'improved' });
      pts.forEach(function (p) {
        const x = sx(p.v), y = sy(p.f);
        el('line', { class: 'guide', x1: x, y1: y, x2: x, y2: C.b });
        el('line', { class: 'guide', x1: C.l, y1: y, x2: x, y2: y });
        el('circle', { class: p.cls, cx: x, cy: y, r: 6 });
      });
      if (pts.length === 2 && Math.abs(r.a - r.b) > 1e-9) {
        // saving bracket on the right of the higher point
        const hi = r.a > r.b ? pts[0] : pts[1], lo = r.a > r.b ? pts[1] : pts[0];
        const x = sx(hi.v) + 14;
        el('line', { class: 'save', x1: x, y1: sy(hi.f), x2: x, y2: sy(lo.f) });
        const saveTxt = (r.saved >= 0 ? 'saves ' : 'costs ') + massShort(Math.abs(r.saved));
        const right = x < C.r - 110;
        el('text', { x: right ? x + 6 : x - 6, y: (sy(hi.f) + sy(lo.f)) / 2 + 4, 'text-anchor': right ? 'start' : 'end', class: 'save-text' }, saveTxt);
      }
    }
    el('text', { x: 20, y: 256, class: 'title-text' }, 'FCR vs reference');
    drawGauge(254, r.hasB ? r.b : NaN, r.hasA ? r.a : NaN, 'improved ');
    // relabel economic marker as current in plan mode
    svg.querySelectorAll('.mk-eco-text').forEach(function (t) { if (t.textContent.indexOf('economic ') === 0) t.textContent = t.textContent.replace('economic ', 'current '); });
    if (!ok) el('text', { x: (C.l + C.r) / 2, y: (C.t + C.b) / 2, 'text-anchor': 'middle', class: 'dim-text' }, 'Enter a biomass gain and an FCR');
  }

  // ---------- Results text ----------
  function stockLine(s) {
    if (how(s) === 'cw') return fmt(raw(s + '_n') || 0, 0) + ' fish × ' + typed(s + '_w');
    return typed(s + '_b') + ($(s + '_n').value !== '' ? ' (' + fmt(raw(s + '_n'), 0) + ' fish)' : '');
  }

  function resultsText() {
    const lines = ['Feed Conversion Ratio (FCR) Calculator'];
    if (mode === 'measure') {
      const r = computeMeasure();
      lines.push('Start: ' + stockLine('start') + ' = ' + mass(r.S.b));
      lines.push('End: ' + stockLine('end') + ' = ' + mass(r.E.b));
      lines.push('Removed: ' + stockLine('rem') + ' = ' + mass(r.R.b));
      lines.push('Dead: ' + stockLine('dead') + ' = ' + mass(r.D.b));
      lines.push('Feed: ' + typed('feed') + ' over ' + typed('days') + (isFinite(r.pr) ? ', ' + fmt(r.pr * 100) + '% protein' : ''));
      lines.push('Biological FCR: ' + (isFinite(r.bfcr) ? fixed(r.bfcr, 2) : '–') + ' (gain ' + mass(r.gBio) + ')');
      lines.push('Economic FCR: ' + (isFinite(r.efcr) ? fixed(r.efcr, 2) : '–') + ' (gain ' + mass(r.gEco) + ')');
      lines.push('Feed efficiency: ' + (isFinite(r.bfcr) ? fmt(r.fe, 1) + '%' : '–') + ' · PER: ' + (isFinite(r.per) ? fixed(r.per, 2) : '–'));
      lines.push('SGR: ' + (isFinite(r.g) ? fixed(r.sgr, 2) + '%/day' : '–') + ' · Feed: ' + (isFinite(r.bw) ? fixed(r.bw, 2) + '% BW/day' : '–'));
      if (isFinite(r.mort)) lines.push('Mortality: ' + fmt(r.mort, 1) + '%');
      if (isFinite(r.costKg)) lines.push('Feed cost per kg fish: ' + money(r.costKg) + ' (feed ' + $('price').value + ' ' + sym().trim() + ' ' + $('price_u').selectedOptions[0].textContent + ')');
    } else {
      const r = computePlan();
      lines.push('Biomass gain: ' + typed('gain') + '; FCR ' + fmt(r.a) + (r.hasB ? ' → ' + fmt(r.b) : ''));
      lines.push('Feed needed: ' + mass(r.feedA) + (r.hasB ? ' → ' + mass(r.feedB) + ' (saves ' + mass(r.saved) + ')' : ''));
      if (isFinite(r.pk)) {
        lines.push('Feed cost: ' + money(r.costA) + (r.hasB ? ' → ' + money(r.costB) + ' (saves ' + money(r.moneySaved) + ')' : ''));
        lines.push('Feed cost per kg fish: ' + money(r.perKgA) + (r.hasB ? ' → ' + money(r.perKgB) : ''));
      }
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  CURRENCIES.forEach(function (c) {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.label;
    $('cur').appendChild(o);
  });

  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); render(); });
  });

  // Switching how a group is entered carries its biomass (and weight) across.
  STOCKS.forEach(function (s) {
    $(s + '_how').addEventListener('change', function () {
      const h = how(s);
      const n = raw(s + '_n');
      if (h === 'bm') {
        const w = CalcUnits.base(s + '_w');
        if (n >= 0 && w > 0) CalcUnits.set(s + '_b', +CalcUnits.fromBase(s + '_b', n * w).toPrecision(6));
      } else {
        const b = CalcUnits.base(s + '_b');
        if (n > 0 && b > 0) CalcUnits.set(s + '_w', +CalcUnits.fromBase(s + '_w', b / n).toPrecision(6));
      }
      render();
    });
  });

  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  ['species', 'cur', 'price_u'].forEach(function (f) { $(f).addEventListener('change', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Feed Conversion Ratio (FCR) Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    setMode(mode);
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    function okOpt(sel, v) { return v !== undefined && sel.querySelector('option[value="' + v + '"]'); }
    ['species', 'cur', 'price_u', 'out'].forEach(function (f) { if (okOpt($(f), p[f])) $(f).value = p[f]; });
    STOCKS.forEach(function (s) { if (p[s + '_how'] === 'bm' || p[s + '_how'] === 'cw') $(s + '_how').value = p[s + '_how']; });
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] === 'none' && OPTIONAL.indexOf(f) !== -1) CalcUnits.set(f, '', u);
      else if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    setMode(p.mode === 'plan' ? 'plan' : 'measure');
    render();
  })();
})();
