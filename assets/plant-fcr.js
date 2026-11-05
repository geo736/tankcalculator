// Plant Feed Conversion Ratio (FCRplant) Calculator: FCRplant = feed supplied ÷ plant weight gain
// (Colt & Semmens 2022), feed loading rate, fish FCR, planning mode, live SVG, shareable URL state.
(function () {
  'use strict';

  // Unit groups added here (not in units.js).
  // Feed rate ratio, base g per m² per day (same definition as feed-rate-to-grow-space.js).
  CalcUnits.GROUPS.feedratio = CalcUnits.GROUPS.feedratio || {
    base: 'gm2d',
    units: [
      { id: 'gm2d', label: 'g/m²/day', factor: 1 },
      { id: 'gft2d', label: 'g/ft²/day', factor: 1 / 0.09290304 },
      { id: 'ozyd2d', label: 'oz/yd²/day', factor: 28.349523125 / 0.83612736 },
      { id: 'ozft2d', label: 'oz/ft²/day', factor: 28.349523125 / 0.09290304 }
    ]
  };
  // Mass per area (yield), base kg per m².
  CalcUnits.GROUPS.arealmass = CalcUnits.GROUPS.arealmass || {
    base: 'kgm2',
    units: [
      { id: 'kgm2', label: 'kg/m²', factor: 1 },
      { id: 'gm2', label: 'g/m²', factor: 0.001 },
      { id: 'lbft2', label: 'lb/ft²', factor: 0.45359237 / 0.09290304 },
      { id: 'ozft2', label: 'oz/ft²', factor: 0.028349523125 / 0.09290304 }
    ]
  };

  // Loading-rate guideline ranges, g/m²/day. leafy/fruiting: Somerville et al. 2014 (FAO TP 589);
  // raft: Rakocy, Masser & Losordo 2006 (SRAC 454); bibb: 2026 Aquaculture Reports study
  // (doi 10.1016/j.aqrep.2026.103748), 30–75 within "standard operating performance".
  const PRESETS = {
    leafy: { min: 40, max: 50, name: 'FAO leafy greens' },
    fruiting: { min: 50, max: 80, name: 'FAO fruiting vegetables' },
    raft: { min: 60, max: 100, name: 'UVI raft' },
    bibb: { min: 30, max: 75, name: '2026 Bibb lettuce trial' }
  };

  const DEFAULTS = {
    mode: 'measure', crop: 'leafy',
    feed: [15.75, 'kg'], harv: [36, 'kg'], start: [1, 'kg'], dm: [4.37], period: [35, 'd'], area: [10, 'm2'], fgain: [10.5, 'kg'],
    target: [35, 'kg'], fcrp: [0.45], fcrf: [1.5],
    outm: 'kg', outy: 'kgm2', outr: 'gm2d', tcrop: 'lettuce', tfeed: 'warm'
  };
  // Theoretical FCRplant inputs (percent), Colt & Semmens 2022 via assets/aquaponic-np.js.
  const NP = window.AquaponicNP;
  const CROP_F = { t_dmp: 'dm', t_np: 'n', t_pp: 'p' };
  const FEED_F = { t_dmf: 'dm', t_nf: 'n', t_pf: 'p' };
  const THEORY_FIELDS = ['t_dmp', 't_np', 't_pp', 't_dmf', 't_nf', 't_pf', 't_nue', 't_pue'];
  const INPUT_FIELDS = ['feed', 'harv', 'start', 'dm', 'period', 'area', 'fgain', 'target', 'fcrp', 'fcrf'];
  const MODE_FIELDS = {
    measure: ['feed', 'harv', 'start', 'dm', 'period', 'area', 'fgain'],
    plan: ['target', 'fcrp', 'fcrf', 'period', 'area']
  };

  const $ = function (id) { return document.getElementById(id); };
  const modeButtons = document.querySelectorAll('#mode-group button');
  const cropSel = $('crop');
  const tcrop = $('tcrop'), tfeed = $('tfeed');
  NP.fillSelect(tcrop, 'crop');
  NP.fillSelect(tfeed, 'feed');
  function fillCrop(id, alsoDm) {
    const c = NP.CROPS[id];
    if (!c) return;
    Object.keys(CROP_F).forEach(function (f) { $(f).value = c[CROP_F[f]]; });
    if (alsoDm) $('dm').value = c.dm;
  }
  function fillFeed(id) {
    const f = NP.FEEDS[id];
    if (!f) return;
    Object.keys(FEED_F).forEach(function (k) { $(k).value = f[FEED_F[k]]; });
  }
  function theory() {
    const v = function (id) { const x = parseFloat($(id).value); return isFinite(x) ? x : 0; };
    return NP.theory({ dmP: v('t_dmp'), nP: v('t_np'), pP: v('t_pp'), dmF: v('t_dmf'), nF: v('t_nf'), pF: v('t_pf'), nue: v('t_nue'), pue: v('t_pue') });
  }
  function cropName() { return tcrop.value === 'custom' ? 'your crop' : NP.CROPS[tcrop.value].name.toLowerCase(); }
  function feedName() { return tfeed.value === 'custom' ? 'your feed' : tfeed.value === 'warm' ? 'warm-water feed' : 'cold-water feed'; }
  const outM = $('outm'), outY = $('outy'), outR = $('outr');
  const svg = $('viz');
  let mode = 'measure';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function numVal(id) { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function mU() { return CalcUnits.label('mass', outM.value); }
  function mV(kg) { return CalcUnits.convert('mass', kg, 'kg', outM.value); }
  function showM(kg) { return fmt(mV(kg)) + ' ' + mU(); }
  function showY(kgm2) { return fmt(CalcUnits.convert('arealmass', kgm2, 'kgm2', outY.value)) + ' ' + CalcUnits.label('arealmass', outY.value); }
  function rV(g) { return CalcUnits.convert('feedratio', g, 'gm2d', outR.value); }
  function showR(g) { return fmt(rV(g)) + ' ' + CalcUnits.label('feedratio', outR.value); }
  function showA(m2) { return fmt(m2) + ' m²'; }
  function ratio(r) { return fmt(r, r >= 100 ? 0 : r >= 10 ? 1 : 2); }
  function ratio3(r) { return fmt(r, r >= 10 ? 1 : r >= 1 ? 2 : 3); }

  // ---------- Calculation (kg, m², days, g/m²/day) ----------
  function compute() {
    const c = { days: CalcUnits.base('period') / 86400, A: CalcUnits.base('area'), r: PRESETS[cropSel.value] };
    if (mode === 'measure') {
      c.F = CalcUnits.base('feed');
      c.H = CalcUnits.base('harv');
      c.S = CalcUnits.base('start');
      c.dm = numVal('dm');
      c.FG = CalcUnits.base('fgain');
      c.G = c.H - c.S;
      c.ok = c.F > 0 && c.H > 0 && c.G > 0;
      if (!c.ok) return c;
      c.fcr = c.F / c.G;
      c.perkg = c.G / c.F;
      if (c.dm > 0 && c.dm <= 100) { c.Gd = c.G * c.dm / 100; c.fcrDry = c.F / c.Gd; }
      if (c.FG > 0) { c.fcrf = c.F / c.FG; c.total = (c.G + c.FG) / c.F; c.pfrm = c.G / c.FG; }
      if (c.A > 0) c.yield = c.G / c.A;
      if (c.A > 0 && c.days > 0) c.load = c.F * 1000 / c.A / c.days;
      if (c.days > 0) c.Fday = c.F / c.days;
    } else {
      c.P = CalcUnits.base('target');
      c.fcrIn = numVal('fcrp');
      c.fcrfIn = numVal('fcrf');
      c.ok = c.P > 0 && c.fcrIn > 0;
      if (!c.ok) return c;
      c.F = c.P * c.fcrIn;
      c.G = c.P;
      if (c.fcrfIn > 0) { c.FG = c.F / c.fcrfIn; c.pfrm = c.P / c.FG; }
      if (c.days > 0) {
        c.Fday = c.F / c.days;
        c.Amin = c.Fday * 1000 / c.r.max;
        c.Amax = c.Fday * 1000 / c.r.min;
      }
      if (c.A > 0) c.yield = c.P / c.A;
      if (c.A > 0 && c.days > 0) c.load = c.F * 1000 / c.A / c.days;
    }
    if (c.load) c.status = c.load > c.r.max + 1e-9 ? 'high' : c.load < c.r.min - 1e-9 ? 'low' : 'ok';
    c.th = theory();
    if (c.ok && c.th && mode === 'measure') c.vs = c.fcr / c.th.control;
    return c;
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-show]').forEach(function (e) { e.hidden = e.dataset.show !== m; });
    $('list-measure').hidden = m !== 'measure';
    $('list-plan').hidden = m !== 'plan';
  }

  function getState() {
    const st = { mode: mode, crop: cropSel.value, outm: outM.value, outy: outY.value, outr: outR.value, tcrop: tcrop.value, tfeed: tfeed.value };
    THEORY_FIELDS.forEach(function (f) { st[f] = $(f).value === '' ? 'none' : $(f).value; });
    st.t_ret = $('t_ret').value;
    if (st.t_ret === 'recovery') NP.RET_FIELDS.forEach(function (f) { st[f] = $(f).value === '' ? 'none' : $(f).value; });
    MODE_FIELDS[mode].forEach(function (f) {
      st[f] = $(f).value === '' ? 'none' : $(f).value; // keep cleared optional fields cleared on reload
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    INPUT_FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    cropSel.value = DEFAULTS.crop;
    outM.value = DEFAULTS.outm; outY.value = DEFAULTS.outy; outR.value = DEFAULTS.outr;
    tcrop.value = DEFAULTS.tcrop; tfeed.value = DEFAULTS.tfeed;
    fillCrop(DEFAULTS.tcrop, false); fillFeed(DEFAULTS.tfeed);
    $('t_nue').value = NP.NUE; $('t_pue').value = NP.PUE;
    NP.retentionDefaults($);
  }

  // ---------- Render ----------
  function render() {
    NP.syncRetention($);
    const c = compute();
    const notes = [];
    if (mode === 'measure') {
      if (!(c.F > 0)) notes.push('Enter the fish feed supplied over the period.');
      if (!(c.H > 0)) notes.push('Enter the fresh weight of the plant harvest.');
      else if (c.S > 0 && c.G <= 0) notes.push('The transplant weight is equal to or larger than the harvest, so there is no plant gain to divide by.');
      if (parseFloat($('dm').value) > 100) notes.push('Dry matter cannot be more than 100%.');
      if (c.ok && c.fcr > 20) notes.push('FCRplant above 20 means very little plant growth for the feed. Check the units and that feed and harvest cover the same period.');
      if (c.ok && c.fcr < 0.02) notes.push('FCRplant below 0.02 is implausibly low. Check the units of the feed and the harvest.');
      if (c.ok && c.fcrf && (c.fcrf < 0.5 || c.fcrf > 5)) notes.push('A fish FCR of ' + ratio(c.fcrf) + ' is outside the usual range for fed fish. Check the fish gain.');
    } else {
      if (!(c.P > 0)) notes.push('Enter the target plant production.');
      if (!(c.fcrIn > 0)) notes.push('Enter the plant FCR to plan with.');
      if (c.fcrIn > 20) notes.push('A plant FCR above 20 is unusually high. Check the value.');
    }
    if (c.ok && !(c.days > 0)) notes.push('Enter the period to get the daily feed and the loading rate.');
    if (c.ok && c.days > 0 && !(c.A > 0)) notes.push('Add the grow area to get the loading rate and yield per area.');
    if (c.ok && c.load > 1000) notes.push('A loading rate above 1000 g/m²/day is far outside any guideline. Check the area and period units.');
    if (c.ok && !c.th) notes.push('Fill in all crop, feed and retention values (above 0) to get the theoretical FCRplant.');
    if (THEORY_FIELDS.some(function (f) { return parseFloat($(f).value) > 100; })) notes.push('A crop, feed or retention percentage is above 100%.');
    const notice = $('notice');
    notice.textContent = notes.join(' ');
    notice.hidden = notes.length === 0;

    const th = c.th;
    $('r-theory').textContent = th ? ratio3(th.control) + ' kg/kg (' + th.limiting + '-limited) · ' + fmt(1 / th.control) + ' kg plant per kg feed' : '–';
    $('r-theory-np').textContent = th ? ratio3(th.fcrN) + ' · ' + ratio3(th.fcrP) : '–';
    $('r-vs').textContent = c.vs ? fmt(c.vs, 2) + ' ×' : '–';
    const ts = $('r-tstatus');
    if (mode === 'measure' && c.vs) {
      const rg = NP.RANGE.fcrPlant;
      const inR = c.fcr >= rg[0] && c.fcr <= rg[1];
      ts.hidden = false;
      ts.className = 'status ' + (c.vs <= 1.25 ? 'ok' : 'warn');
      ts.textContent = (c.vs < 0.8
        ? 'Below the theoretical ' + ratio3(th.control) + ' for ' + cropName() + ' with ' + feedName() + ': more plant per kg of feed than ' + NP.retentionLabel($) + ' predicts (or N/P from water or supplements).'
        : c.vs <= 1.25
          ? 'Close to the theoretical ' + ratio3(th.control) + ' for ' + cropName() + ' with ' + feedName() + '.'
          : fmt(c.vs, 2) + '× the theoretical ' + ratio3(th.control) + ' for ' + cropName() + ' with ' + feedName() + ': the plants retain less of the feed nutrients than ' + NP.retentionLabel($) + ' predicts.') +
        (inR ? ' Inside' : ' Outside') + ' the 0.064–0.564 range of [1].';
    } else {
      ts.hidden = true;
    }
    $('btn-usetheory').disabled = !th;

    const st = $('r-status');
    if (mode === 'measure') {
      $('r-main-label').textContent = 'Plant feed conversion ratio (FCRplant)';
      $('r-main').textContent = c.ok ? ratio(c.fcr) : '–';
      $('r-main-sub').textContent = c.ok ? 'kg feed per kg plant gain (fresh) · ' + fmt(c.perkg) + ' kg of plants per kg of feed' : '';
      $('r-gain').textContent = c.ok ? showM(c.G) : '–';
      $('r-perkg').textContent = c.ok ? fmt(c.perkg) + ' kg/kg' : '–';
      $('r-dry').textContent = c.ok && c.fcrDry ? ratio(c.fcrDry) + ' (dry gain ' + showM(c.Gd) + ')' : '–';
      $('r-load').textContent = c.ok && c.load ? showR(c.load) : '–';
      $('r-yield').textContent = c.ok && c.yield ? showY(c.yield) : '–';
      $('r-fcrf').textContent = c.ok && c.fcrf ? ratio(c.fcrf) + ' kg feed / kg fish' : '–';
      $('r-total').textContent = c.ok && c.total ? fmt(c.total) + ' kg/kg' : '–';
      $('r-pfrm').textContent = c.ok && c.pfrm ? ratio(c.pfrm) + ' kg/kg' : '–';
    } else {
      $('r-main-label').textContent = 'Feed needed over the period';
      $('r-main').textContent = c.ok ? showM(c.F) : '–';
      $('r-main-sub').textContent = c.ok ? showM(c.P) + ' of plants × FCRplant ' + ratio(c.fcrIn) : '';
      $('p-day').textContent = c.ok && c.Fday ? showM(c.Fday) + '/day' : '–';
      $('p-load').textContent = c.ok && c.load ? showR(c.load) : '–';
      $('p-area').textContent = c.ok && c.Amin ? fmt(c.Amin) + '–' + showA(c.Amax) : '–';
      $('p-yield').textContent = c.ok && c.yield ? showY(c.yield) : '–';
      $('p-fish').textContent = c.ok && c.FG ? showM(c.FG) : '–';
      $('p-pfrm').textContent = c.ok && c.pfrm ? ratio(c.pfrm) + ' kg/kg' : '–';
    }

    if (c.ok && c.status) {
      st.hidden = false;
      st.className = 'status ' + (c.status === 'ok' ? 'ok' : 'warn');
      const rng = fmt(rV(c.r.min)) + '–' + showR(c.r.max);
      st.textContent = c.status === 'ok'
        ? 'Loading rate ' + showR(c.load) + ' is inside the ' + c.r.name + ' range (' + rng + ').'
        : c.status === 'high'
          ? 'Loading rate ' + showR(c.load) + ' is above the ' + c.r.name + ' range (' + rng + '): more feed than this area usually uses.'
          : 'Loading rate ' + showR(c.load) + ' is below the ' + c.r.name + ' range (' + rng + '): plants may run short of nutrients.';
    } else {
      st.hidden = true;
    }

    let cap = 'Enter values to draw the feed and production bars';
    if (c.ok) {
      cap = showM(c.F) + ' of feed → ' + showM(c.G) + ' of plants (FCRplant ' + ratio(c.fcr || c.fcrIn) + ')';
      if (c.FG) cap += ' + ' + showM(c.FG) + ' of fish';
    }
    $('viz-caption').textContent = cap;

    drawViz(c);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, txt, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (txt !== undefined) e.textContent = txt;
    (parent || svg).appendChild(e);
    return e;
  }
  function text(x, y, t, anchor, cls) { return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, t); }
  function mShort(kg) { const v = mV(kg); return fmt(v, v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + mU(); }

  function drawViz(c) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!c.ok) return;

    // --- Mass bars, one common scale ---
    const rows = [{ cls: 'bar-feed', name: mode === 'plan' ? 'Feed needed' : 'Feed supplied', v: c.F }];
    rows.push({ cls: 'bar-plant', name: 'Plant gain (fresh)', v: c.G, tag: 'FCRplant ' + ratio(c.F / c.G) });
    if (c.Gd) rows.push({ cls: 'bar-dry', name: 'Plant gain (dry)', v: c.Gd, tag: 'dry FCR ' + ratio(c.fcrDry) });
    if (c.FG) rows.push({ cls: 'bar-fish', name: 'Fish gain', v: c.FG, tag: 'FCRfish ' + ratio(c.F / c.FG) });
    const x0 = 20, x1 = 460, maxV = Math.max.apply(null, rows.map(function (r) { return r.v; }));
    text(x0, 20, 'Mass over the period (one scale)', 'start', 'name-text');
    let y = 40;
    const rowH = rows.length > 3 ? 38 : 46;
    rows.forEach(function (r, i) {
      const w = Math.max(2, (x1 - x0) * r.v / maxV);
      text(x0, y + 10, r.name + (r.tag ? ' · ' + r.tag : ''), 'start', 'dim-text');
      text(x1, y + 10, mShort(r.v), 'end', 'marker-text');
      el('rect', { class: 'bar-bg', x: x0, y: y + 15, width: x1 - x0, height: 14, rx: 4 });
      el('rect', { class: r.cls, x: x0, y: y + 15, width: w, height: 14, rx: 4 });
      y += rowH;
    });

    // --- Loading rate vs guideline ---
    const yb = 278, bh = 14, bx0 = 34, bx1 = 446;
    text(bx0, yb - 40, 'Feed loading rate (' + CalcUnits.label('feedratio', outR.value) + ')', 'start', 'name-text');
    if (!c.load) {
      text(bx0, yb - 18, 'Add the period and the grow area to compare with ' + c.r.name + '.', 'start', 'dim-text');
      return;
    }
    const lo = c.r.min, hi = c.r.max;
    const top = Math.max(hi, c.load) * 1.25;
    const X = function (v) { return bx0 + (bx1 - bx0) * Math.min(v, top) / top; };
    el('rect', { class: 'bar-bg', x: bx0, y: yb, width: bx1 - bx0, height: bh, rx: 7 });
    el('rect', { class: 'bar-zone', x: X(lo), y: yb, width: Math.max(2, X(hi) - X(lo)), height: bh });
    let xl = X(lo), xh = X(hi);
    if (xh - xl < 56) { const m = (xl + xh) / 2; xl = m - 28; xh = m + 28; }
    xl = Math.max(bx0 + 10, xl); xh = Math.min(bx1 - 10, xh);
    const rs = function (g) { const v = rV(g); return fmt(v, v >= 100 ? 0 : 1); };
    text(xl, yb + bh + 15, rs(lo), 'middle', 'zone-text');
    text(xh, yb + bh + 15, rs(hi), 'middle', 'zone-text');
    text(bx0, yb + bh + 32, '0', 'start', 'dim-text');
    text((X(lo) + X(hi)) / 2, yb + bh + 32, c.r.name, 'middle', 'dim-text');
    const ux = X(c.load);
    el('line', { class: 'marker-line', x1: ux, y1: yb - 4, x2: ux, y2: yb + bh + 2 });
    el('path', { class: 'marker', d: 'M' + (ux - 6) + ',' + (yb - 12) + ' L' + (ux + 6) + ',' + (yb - 12) + ' L' + ux + ',' + (yb - 4) + 'Z' });
    const anchor = ux > bx1 - 50 ? 'end' : ux < bx0 + 50 ? 'start' : 'middle';
    text(ux, yb - 16, 'you ' + rs(c.load) + (c.load > top ? '+' : ''), anchor, 'marker-text');
  }

  // ---------- Results text ----------
  function resultsText() {
    const c = compute();
    const L = ['Plant Feed Conversion Ratio (FCRplant) Calculator'];
    if (mode === 'measure') {
      L.push('Feed supplied: ' + typed('feed'));
      L.push('Plant harvest (fresh): ' + typed('harv') + (numVal('start') ? ', transplants ' + typed('start') : ''));
      if (numVal('dm')) L.push('Dry matter: ' + typed('dm') + '%');
      if (numVal('period')) L.push('Period: ' + typed('period'));
      if (numVal('area')) L.push('Grow area: ' + typed('area'));
      if (numVal('fgain')) L.push('Fish gain: ' + typed('fgain'));
      if (c.ok) {
        L.push('Plant gain: ' + showM(c.G));
        L.push('FCRplant (fresh): ' + ratio(c.fcr) + ' kg feed/kg plant; ' + fmt(c.perkg) + ' kg plant per kg feed');
        if (c.fcrDry) L.push('FCRplant (dry): ' + ratio(c.fcrDry));
        if (c.load) L.push('Feed loading rate: ' + showR(c.load));
        if (c.yield) L.push('Plant gain per area: ' + showY(c.yield));
        if (c.fcrf) L.push('Fish FCR: ' + ratio(c.fcrf) + '; food per kg feed: ' + fmt(c.total) + ' kg; PFRM: ' + ratio(c.pfrm));
      }
    } else {
      L.push('Target plant production: ' + typed('target'));
      L.push('FCRplant: ' + typed('fcrp'));
      if (numVal('fcrf')) L.push('Fish FCR: ' + typed('fcrf'));
      if (numVal('period')) L.push('Period: ' + typed('period'));
      if (numVal('area')) L.push('Grow area: ' + typed('area'));
      if (c.ok) {
        L.push('Feed needed: ' + showM(c.F) + (c.Fday ? ' (' + showM(c.Fday) + '/day)' : ''));
        if (c.Amin) L.push('Grow area for this feed (' + c.r.name + '): ' + fmt(c.Amin) + '–' + showA(c.Amax));
        if (c.load) L.push('Feed loading rate: ' + showR(c.load));
        if (c.FG) L.push('Expected fish gain: ' + showM(c.FG));
      }
    }
    if (c.th) L.push('Theoretical FCRplant (' + (tcrop.value === 'custom' ? 'custom crop' : NP.CROPS[tcrop.value].name) + ', ' + feedName() + ', NUE ' + $('t_nue').value + '%, PUE ' + $('t_pue').value + '%' + ($('t_ret').value === 'recovery' ? ', solids recovered' : '') + '): ' + ratio3(c.th.control) + ' (' + c.th.limiting + '-limited; N ' + ratio3(c.th.fcrN) + ', P ' + ratio3(c.th.fcrP) + ')' + (c.vs ? '; yours is ' + fmt(c.vs, 2) + '× theoretical' : ''));
    if (c.ok && c.status) L.push($('r-status').textContent);
    L.push(CalcShare.buildUrl(getState()));
    return L.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); render(); });
  });
  INPUT_FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  cropSel.addEventListener('change', render);
  tcrop.addEventListener('change', function () { fillCrop(tcrop.value, true); render(); });
  $('t_ret').addEventListener('change', render);
  NP.RET_FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  tfeed.addEventListener('change', function () { fillFeed(tfeed.value); render(); });
  THEORY_FIELDS.forEach(function (f) {
    $(f).addEventListener('input', function () {
      if (CROP_F[f]) tcrop.value = 'custom';
      if (FEED_F[f]) tfeed.value = 'custom';
      if (f === 't_nue' || f === 't_pue') $('t_ret').value = 'custom';
      render();
    });
  });
  $('btn-usetheory').addEventListener('click', function () {
    const th = theory();
    if (th) { $('fcrp').value = +th.control.toFixed(3); render(); }
  });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Plant Feed Conversion Ratio (FCRplant) Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); setMode(DEFAULTS.mode); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.crop && PRESETS[p.crop]) cropSel.value = p.crop;
    if (p.tcrop && (NP.CROPS[p.tcrop] || p.tcrop === 'custom')) { tcrop.value = p.tcrop; fillCrop(p.tcrop, false); }
    if (p.tfeed && (NP.FEEDS[p.tfeed] || p.tfeed === 'custom')) { tfeed.value = p.tfeed; fillFeed(p.tfeed); }
    THEORY_FIELDS.forEach(function (f) {
      if (p[f] !== undefined) $(f).value = isFinite(parseFloat(p[f])) ? p[f] : '';
    });
    if (NP.RET_MODES.indexOf(p.t_ret) >= 0) $('t_ret').value = p.t_ret;
    NP.RET_FIELDS.forEach(function (f) {
      if (p[f] !== undefined) $(f).value = isFinite(parseFloat(p[f])) ? p[f] : '';
    });
    [[outM, 'outm', 'mass'], [outY, 'outy', 'arealmass'], [outR, 'outr', 'feedratio']].forEach(function (o) {
      if (p[o[1]] && CalcUnits.unitDef(o[2], p[o[1]])) o[0].value = p[o[1]];
    });
    INPUT_FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && p[f] !== '' && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (p[f] !== undefined) CalcUnits.set(f, '', u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    setMode(p.mode === 'plan' ? 'plan' : 'measure');
    render();
  })();
})();
