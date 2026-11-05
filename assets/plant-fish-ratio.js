// Plant-Fish Mass Ratio (PFRM) Calculator: PFRM = plant mass gain ÷ fish mass gain (Colt & Semmens 2022,
// gain-based form), FCRfish ÷ FCRplant identity, planning mode, live SVG, shareable URL state.
(function () {
  'use strict';

  // Unit groups added here (not in units.js).
  CalcUnits.GROUPS.feedratio = CalcUnits.GROUPS.feedratio || {
    base: 'gm2d',
    units: [
      { id: 'gm2d', label: 'g/m²/day', factor: 1 },
      { id: 'gft2d', label: 'g/ft²/day', factor: 1 / 0.09290304 },
      { id: 'ozyd2d', label: 'oz/yd²/day', factor: 28.349523125 / 0.83612736 },
      { id: 'ozft2d', label: 'oz/ft²/day', factor: 28.349523125 / 0.09290304 }
    ]
  };
  CalcUnits.GROUPS.arealmass = CalcUnits.GROUPS.arealmass || {
    base: 'kgm2',
    units: [
      { id: 'kgm2', label: 'kg/m²', factor: 1 },
      { id: 'gm2', label: 'g/m²', factor: 0.001 },
      { id: 'lbft2', label: 'lb/ft²', factor: 0.45359237 / 0.09290304 },
      { id: 'ozft2', label: 'oz/ft²', factor: 0.028349523125 / 0.09290304 }
    ]
  };

  // Farmgate price per unit mass, base: per kg. Only the ratio of two prices is used, so the currency cancels.
  CalcUnits.GROUPS.pricemass = CalcUnits.GROUPS.pricemass || {
    base: 'kg',
    units: [
      { id: 'kg', label: 'per kg', factor: 1 },
      { id: 'lb', label: 'per lb', factor: 1 / 0.45359237 }
    ]
  };

  // Loading-rate guideline ranges, g/m²/day (same sources as plant-fcr.js).
  const PRESETS = {
    leafy: { min: 40, max: 50, name: 'FAO leafy greens' },
    fruiting: { min: 50, max: 80, name: 'FAO fruiting vegetables' },
    raft: { min: 60, max: 100, name: 'UVI raft' },
    bibb: { min: 30, max: 75, name: '2026 Bibb lettuce trial' }
  };

  const DEFAULTS = {
    mode: 'measure', crop: 'leafy',
    pgain: [35, 'kg'], fgain: [10.5, 'kg'], feed: [15.75, 'kg'], dmp: [''], dmf: [''],
    area: [10, 'm2'], vol: [1, 'm3'], period: [35, 'd'],
    tfish: [100, 'kg'], pfrm: [3.5], yld: [3.5, 'kgm2'], pfcrf: [1.5],
    wop: ['', 'kg'], wof: ['', 'kg'], pprice: ['', 'kg'], fprice: ['', 'kg'],
    tcrop: 'lettuce', tfeed: 'warm',
    outm: 'kg', outa: 'm2', outy: 'kgm2', outr: 'gm2d', outd: 'kgm3', outs: 'm2m3'
  };
  const INPUT_FIELDS = ['pgain', 'fgain', 'feed', 'dmp', 'dmf', 'area', 'vol', 'period', 'tfish', 'pfrm', 'yld', 'pfcrf', 'wop', 'wof', 'pprice', 'fprice'];
  const MODE_FIELDS = {
    measure: ['pgain', 'fgain', 'feed', 'dmp', 'dmf', 'area', 'vol', 'period', 'wop', 'wof', 'pprice', 'fprice'],
    plan: ['tfish', 'pfrm', 'yld', 'pfcrf', 'period']
  };
  const OUTS = [['outm', 'mass'], ['outa', 'area'], ['outy', 'arealmass'], ['outr', 'feedratio'], ['outd', 'density'], ['outs', 'specificarea']];

  const $ = function (id) { return document.getElementById(id); };
  const modeButtons = document.querySelectorAll('#mode-group button');
  const cropSel = $('crop');
  // Theoretical PFRM inputs (percent), Colt & Semmens 2022 via assets/aquaponic-np.js.
  const NP = window.AquaponicNP;
  const CROP_F = { t_dmp: 'dm', t_np: 'n', t_pp: 'p' };
  const FEED_F = { t_dmf: 'dm', t_nf: 'n', t_pf: 'p', t_fcrf: 'fcrFish' };
  const THEORY_FIELDS = ['t_dmp', 't_np', 't_pp', 't_dmf', 't_nf', 't_pf', 't_nue', 't_pue', 't_fcrf'];
  const tcrop = $('tcrop'), tfeed = $('tfeed');
  NP.fillSelect(tcrop, 'crop');
  NP.fillSelect(tfeed, 'feed');
  function fillCrop(id) {
    const c = NP.CROPS[id];
    if (c) Object.keys(CROP_F).forEach(function (f) { $(f).value = c[CROP_F[f]]; });
  }
  function fillFeed(id) {
    const f = NP.FEEDS[id];
    if (f) Object.keys(FEED_F).forEach(function (k) { $(k).value = f[FEED_F[k]]; });
  }
  function tv(id) { const x = parseFloat($(id).value); return isFinite(x) ? x : 0; }
  function theory() {
    return NP.theory({ dmP: tv('t_dmp'), nP: tv('t_np'), pP: tv('t_pp'), dmF: tv('t_dmf'), nF: tv('t_nf'), pF: tv('t_pf'), nue: tv('t_nue'), pue: tv('t_pue') });
  }
  function cropName() { return tcrop.value === 'custom' ? 'your crop' : NP.CROPS[tcrop.value].name.toLowerCase(); }
  function feedName() { return tfeed.value === 'custom' ? 'your feed' : tfeed.value === 'warm' ? 'warm-water feed' : 'cold-water feed'; }
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
  function out(group, base, baseId, sel) {
    const s = $(sel).value;
    return fmt(CalcUnits.convert(group, base, baseId, s)) + ' ' + CalcUnits.label(group, s);
  }
  function showM(kg) { return out('mass', kg, 'kg', 'outm'); }
  function showA(m2) { return out('area', m2, 'm2', 'outa'); }
  function showY(v) { return out('arealmass', v, 'kgm2', 'outy'); }
  function showR(v) { return out('feedratio', v, 'gm2d', 'outr'); }
  function showD(v) { return out('density', v, 'kgm3', 'outd'); }
  function showS(v) { return out('specificarea', v, 'm2m3', 'outs'); }
  function ratio(r) { return fmt(r, r >= 100 ? 0 : r >= 10 ? 1 : r >= 0.1 ? 2 : 3); }
  function ratio3(r) { return fmt(r, r >= 10 ? 1 : r >= 1 ? 2 : 3); }

  // ---------- Calculation (kg, m², m³, days) ----------
  function compute() {
    const c = { days: CalcUnits.base('period') / 86400, r: PRESETS[cropSel.value] };
    if (mode === 'measure') {
      c.P = CalcUnits.base('pgain');
      c.Fi = CalcUnits.base('fgain');
      c.F = CalcUnits.base('feed');
      c.dmp = numVal('dmp'); c.dmf = numVal('dmf');
      c.A = CalcUnits.base('area');
      c.V = CalcUnits.base('vol') / 1000; // L → m³
      c.ok = c.P > 0 && c.Fi > 0;
      if (!c.ok) return c;
      c.pfrm = c.P / c.Fi;
      c.inv = c.Fi / c.P;
      if (c.dmp > 0 && c.dmf > 0 && c.dmp <= 100 && c.dmf <= 100) c.pfrmDry = (c.P * c.dmp) / (c.Fi * c.dmf);
      if (c.F > 0) { c.fcrf = c.F / c.Fi; c.fcrp = c.F / c.P; c.ident = c.fcrf / c.fcrp; }
      if (c.A > 0) c.yield = c.P / c.A;
      if (c.V > 0) c.fvol = c.Fi / c.V;
      if (c.A > 0 && c.V > 0) c.avol = c.A / c.V;
      if (c.F > 0 && c.A > 0 && c.days > 0) c.load = c.F * 1000 / c.A / c.days;
    } else {
      c.Fi = CalcUnits.base('tfish');
      c.pfrm = numVal('pfrm');
      c.Y = CalcUnits.base('yld');
      c.fcrfIn = numVal('pfcrf');
      c.ok = c.Fi > 0 && c.pfrm > 0;
      if (!c.ok) return c;
      c.P = c.Fi * c.pfrm;
      c.inv = 1 / c.pfrm;
      if (c.Y > 0) c.A = c.P / c.Y;
      if (c.fcrfIn > 0) { c.F = c.Fi * c.fcrfIn; c.fcrf = c.fcrfIn; c.fcrp = c.F / c.P; }
      if (c.F > 0 && c.A > 0 && c.days > 0) c.load = c.F * 1000 / c.A / c.days;
    }
    if (c.load) c.status = c.load > c.r.max + 1e-9 ? 'high' : c.load < c.r.min - 1e-9 ? 'low' : 'ok';
    // Theory: PFRMcontrol = FCRfish ÷ controlling FCRplant (Colt & Semmens 2022, Eqs. 16–19)
    c.th = theory();
    c.thFcrf = mode === 'measure' && c.fcrf ? c.fcrf : mode === 'plan' && c.fcrfIn > 0 ? c.fcrfIn : tv('t_fcrf');
    c.thFcrfOwn = (mode === 'measure' && !!c.fcrf) || (mode === 'plan' && c.fcrfIn > 0);
    if (c.th && c.thFcrf > 0) c.thPfrm = c.thFcrf / c.th.control;
    if (c.ok && c.thPfrm && mode === 'measure') c.vs = c.pfrm / c.thPfrm;
    // Standing ratios and revenue ratio (Eqs. 2 and 11)
    if (mode === 'measure' && c.ok) {
      c.Wop = CalcUnits.base('wop'); c.Wof = CalcUnits.base('wof');
      if (c.Wof > 0) {
        c.pfrmO = c.Wop / c.Wof;
        c.pfrmH = (c.Wop + c.P) / (c.Wof + c.Fi);
        const pp = CalcUnits.base('pprice'), fp = CalcUnits.base('fprice');
        if (pp > 0 && fp > 0) c.pfrr = c.pfrmH * pp / fp;
      }
    }
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
    const st = { mode: mode, crop: cropSel.value, tcrop: tcrop.value, tfeed: tfeed.value };
    THEORY_FIELDS.forEach(function (f) { st[f] = $(f).value === '' ? 'none' : $(f).value; });
    st.t_ret = $('t_ret').value;
    if (st.t_ret === 'recovery') NP.RET_FIELDS.forEach(function (f) { st[f] = $(f).value === '' ? 'none' : $(f).value; });
    OUTS.forEach(function (o) { st[o[0]] = $(o[0]).value; });
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
    OUTS.forEach(function (o) { $(o[0]).value = DEFAULTS[o[0]]; });
    tcrop.value = DEFAULTS.tcrop; tfeed.value = DEFAULTS.tfeed;
    fillCrop(DEFAULTS.tcrop); fillFeed(DEFAULTS.tfeed);
    $('t_nue').value = NP.NUE; $('t_pue').value = NP.PUE;
    NP.retentionDefaults($);
  }

  // ---------- Render ----------
  function render() {
    NP.syncRetention($);
    const c = compute();
    const notes = [];
    if (mode === 'measure') {
      if (!(c.P > 0)) notes.push('Enter the plant weight gain over the period (greater than zero).');
      if (!(c.Fi > 0)) notes.push('Enter the fish weight gain over the period (greater than zero). If the fish lost weight, PFRM is not meaningful.');
      if (parseFloat($('dmp').value) > 100 || parseFloat($('dmf').value) > 100) notes.push('Dry matter cannot be more than 100%.');
      else if ((c.dmp > 0) !== (c.dmf > 0)) notes.push('Enter both plant and fish dry matter to get the dry-weight PFRM.');
      if (c.ok && (c.pfrm > 100 || c.pfrm < 0.01)) notes.push('A PFRM of ' + ratio(c.pfrm) + ' is extreme. Check the units of the two gains.');
      if (c.ok && c.fcrf && (c.fcrf < 0.5 || c.fcrf > 5)) notes.push('A fish FCR of ' + ratio(c.fcrf) + ' is outside the usual range for fed fish. Check the feed and fish gain.');
      if (c.ok && c.F > 0 && c.A > 0 && !(c.days > 0)) notes.push('Enter the period to get the feed loading rate.');
    } else {
      if (!(c.Fi > 0)) notes.push('Enter the target fish production.');
      if (!(c.pfrm > 0)) notes.push('Enter the PFRM to plan with.');
      if (c.ok && !(c.Y > 0)) notes.push('Enter the plant yield per area to get the grow area.');
      if (c.ok && c.pfrm > 100) notes.push('A PFRM above 100 is extreme. Check the value.');
      if (c.ok && c.F > 0 && c.A > 0 && !(c.days > 0)) notes.push('Enter the period to get the feed loading rate.');
    }
    if (c.ok && (!c.th || !(c.thFcrf > 0))) notes.push('Fill in all crop, feed, retention and fish FCR values (above 0) to get the theoretical PFRM.');
    if (THEORY_FIELDS.some(function (f) { return f !== 't_fcrf' && parseFloat($(f).value) > 100; })) notes.push('A crop, feed or retention percentage is above 100%.');
    if (mode === 'measure' && c.ok && c.Wop > 0 && !(c.Wof > 0)) notes.push('Enter the fish weight at the start too, to get the standing ratios.');
    if (mode === 'measure' && c.ok && c.Wof > 0 && (CalcUnits.base('pprice') > 0) !== (CalcUnits.base('fprice') > 0)) notes.push('Enter both farmgate prices, in the same currency, for the revenue ratio.');
    if (c.ok && c.load > 1000) notes.push('A loading rate above 1000 g/m²/day is far outside any guideline. Check the area and period units.');
    const notice = $('notice');
    notice.textContent = notes.join(' ');
    notice.hidden = notes.length === 0;

    $('r-main-label').textContent = mode === 'measure' ? 'Plant-fish mass ratio (PFRM)' : 'Plant production for this fish target';
    if (mode === 'measure') {
      $('r-main').textContent = c.ok ? ratio(c.pfrm) + ' kg plant / kg fish' : '–';
      $('r-main-sub').textContent = c.ok ? showM(c.P) + ' of plants ÷ ' + showM(c.Fi) + ' of fish (fresh weight gain)' : '';
      $('r-inv').textContent = c.ok ? ratio(c.inv) + ' kg/kg' : '–';
      $('r-dry').textContent = c.ok && c.pfrmDry ? ratio(c.pfrmDry) + ' kg/kg' : '–';
      $('r-fcrf').textContent = c.ok && c.fcrf ? ratio(c.fcrf) + ' kg feed / kg fish' : '–';
      $('r-fcrp').textContent = c.ok && c.fcrp ? ratio(c.fcrp) + ' kg feed / kg plant' : '–';
      $('r-ident').textContent = c.ok && c.fcrf ? ratio(c.fcrf) + ' ÷ ' + ratio(c.fcrp) + ' = ' + ratio(c.ident) + ' = PFRM' : '–';
      $('r-yield').textContent = c.ok && c.yield ? showY(c.yield) : '–';
      $('r-fvol').textContent = c.ok && c.fvol ? showD(c.fvol) : '–';
      $('r-avol').textContent = c.ok && c.avol ? showS(c.avol) : '–';
      $('r-load').textContent = c.ok && c.load ? showR(c.load) : '–';
    } else {
      $('r-main').textContent = c.ok ? showM(c.P) : '–';
      $('r-main-sub').textContent = c.ok ? showM(c.Fi) + ' of fish × PFRM ' + ratio(c.pfrm) : '';
      $('p-area').textContent = c.ok && c.A ? showA(c.A) : '–';
      $('p-feed').textContent = c.ok && c.F ? showM(c.F) : '–';
      $('p-fcrp').textContent = c.ok && c.fcrp ? ratio(c.fcrp) + ' kg feed / kg plant' : '–';
      $('p-load').textContent = c.ok && c.load ? showR(c.load) : '–';
    }

    // Interpretation
    let interp = '';
    if (c.ok) {
      interp = 'Each kg of fish growth ' + (mode === 'measure' ? 'came' : 'comes') + ' with ' + ratio(c.pfrm) + ' kg of fresh plant growth.';
      if (c.fcrf) interp += ' At this fish FCR (' + ratio(c.fcrf) + '), every kg of feed gives ' + fmt(1 / c.fcrp) + ' kg of plants and ' + fmt(1 / c.fcrf) + ' kg of fish; raising PFRM at the same fish FCR means a lower FCRplant.';
      if (c.thPfrm) interp += ' The theoretical PFRM for ' + cropName() + ' with ' + feedName() + ' is ' + ratio(c.thPfrm) + ' (at fish FCR ' + ratio(c.thFcrf) + ' and ' + NP.retentionLabel($) + '); Colt & Semmens (2022) give 2.5–9.1 across 12 crops.';
    }
    $('interp').textContent = interp;

    $('r-theory').textContent = c.thPfrm ? ratio(c.thPfrm) + ' kg plant / kg fish (fish FCR ' + ratio(c.thFcrf) + (c.thFcrfOwn ? ', yours' : '') + ')' : '–';
    $('r-theory-fcr').textContent = c.th ? ratio3(c.th.control) + ' kg feed / kg plant (' + c.th.limiting + '-limited; N ' + ratio3(c.th.fcrN) + ', P ' + ratio3(c.th.fcrP) + ')' : '–';
    $('r-vs').textContent = c.vs ? fmt(c.vs, 2) + ' ×' : '–';
    $('r-stand').textContent = c.pfrmH !== undefined ? ratio(c.pfrmO) + ' · ' + ratio(c.pfrmH) + ' kg/kg' : '–';
    $('r-pfrr').textContent = c.pfrr ? ratio(c.pfrr) + ' (plant revenue ÷ fish revenue)' : '–';
    $('btn-usetheory').disabled = !c.thPfrm;
    const ts = $('r-tstatus');
    if (c.vs) {
      const rg = NP.RANGE.pfrm, inR = c.pfrm >= rg[0] && c.pfrm <= rg[1];
      ts.hidden = false;
      ts.className = 'status ' + (c.vs >= 0.8 ? 'ok' : 'warn');
      ts.textContent = (c.vs > 1.25
        ? 'Above the theoretical ' + ratio(c.thPfrm) + ' for ' + cropName() + ' with ' + feedName() + ': more plant per kg of fish than ' + NP.retentionLabel($) + ' predicts (or N/P from water or supplements).'
        : c.vs >= 0.8
          ? 'Close to the theoretical ' + ratio(c.thPfrm) + ' for ' + cropName() + ' with ' + feedName() + '.'
          : fmt(c.vs, 2) + '× the theoretical ' + ratio(c.thPfrm) + ' for ' + cropName() + ' with ' + feedName() + ': the plants grew less from the feed than ' + NP.retentionLabel($) + ' predicts.') +
        (inR ? ' Inside' : ' Outside') + ' the 2.5–9.1 range of Colt & Semmens (2022).';
    } else {
      ts.hidden = true;
    }

    const st = $('r-status');
    if (c.ok && c.status) {
      st.hidden = false;
      st.className = 'status ' + (c.status === 'ok' ? 'ok' : 'warn');
      const rng = fmt(CalcUnits.convert('feedratio', c.r.min, 'gm2d', $('outr').value)) + '–' + showR(c.r.max);
      st.textContent = 'Feed loading rate ' + showR(c.load) + (c.status === 'ok' ? ' is inside' : c.status === 'high' ? ' is above' : ' is below') + ' the ' + c.r.name + ' range (' + rng + ').';
    } else {
      st.hidden = true;
    }

    let cap = 'Enter plant and fish gains to draw the ratio';
    if (c.ok) cap = 'PFRM ' + ratio(c.pfrm) + ': ' + showM(c.P) + ' of plants per ' + showM(c.Fi) + ' of fish' + (c.pfrmDry ? ' · dry ' + ratio(c.pfrmDry) : '');
    $('viz-caption').textContent = cap;

    drawViz(c);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, txt) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (txt !== undefined) e.textContent = txt;
    svg.appendChild(e);
    return e;
  }
  function text(x, y, t, anchor, cls) { return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, t); }
  function mShort(kg) {
    const s = $('outm').value, v = CalcUnits.convert('mass', kg, 'kg', s);
    return fmt(v, v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + CalcUnits.label('mass', s);
  }

  function drawViz(c) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!c.ok) return;

    // --- Bars to one scale ---
    const rows = [];
    if (c.F) rows.push({ cls: 'bar-feed', name: mode === 'plan' ? 'Feed needed' : 'Feed', v: c.F });
    rows.push({ cls: 'bar-fish', name: 'Fish gain' + (c.fcrf ? ' · FCRfish ' + ratio(c.fcrf) : ''), v: c.Fi });
    rows.push({ cls: 'bar-plant', name: 'Plant gain' + (c.fcrp ? ' · FCRplant ' + ratio(c.fcrp) : ''), v: c.P });
    const x0 = 20, x1 = 460;
    const maxV = Math.max.apply(null, rows.map(function (r) { return r.v; }));
    text(x0, 18, 'Mass over the period (one scale, fresh weight)', 'start', 'name-text');
    let y = 34;
    rows.forEach(function (r) {
      text(x0, y + 10, r.name, 'start', 'dim-text');
      text(x1, y + 10, mShort(r.v), 'end', 'marker-text');
      el('rect', { class: 'bar-bg', x: x0, y: y + 15, width: x1 - x0, height: 14, rx: 4 });
      el('rect', { class: r.cls, x: x0, y: y + 15, width: Math.max(2, (x1 - x0) * r.v / maxV), height: 14, rx: 4 });
      y += 40;
    });

    // --- Log gauge 0.1 … 100 ---
    const cx = 240, cy = 292, R = 96;
    const lmin = -1, lmax = 2;
    function ang(v) {
      const l = Math.max(lmin, Math.min(lmax, Math.log10(v)));
      return Math.PI * (1 - (l - lmin) / (lmax - lmin)); // π (left) → 0 (right)
    }
    function pt(a, r) { return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    text(x0, 164, 'PFRM, kg plant per kg fish (log scale)', 'start', 'name-text');
    const p0 = pt(Math.PI, R), p1 = pt(0, R);
    el('path', { class: 'gauge', d: 'M' + p0[0] + ',' + p0[1] + ' A' + R + ',' + R + ' 0 0 1 ' + p1[0] + ',' + p1[1] });
    [0.1, 0.3, 1, 3, 10, 30, 100].forEach(function (t) {
      const a = ang(t), i = pt(a, R - 9), o = pt(a, R + 9), l = pt(a, R + 20);
      el('line', { class: 'gauge-tick', x1: i[0], y1: i[1], x2: o[0], y2: o[1] });
      text(l[0], l[1] + 4, String(t), Math.abs(a - Math.PI / 2) < 0.2 ? 'middle' : a > Math.PI / 2 ? 'end' : 'start', 'dim-text');
    });
    text(cx - R, cy + 22, '← more fish', 'middle', 'dim-text');
    text(cx + R, cy + 22, 'more plants →', 'middle', 'dim-text');
    if (c.pfrmDry) {
      const d = pt(ang(c.pfrmDry), R - 16);
      el('line', { class: 'needle-dry', x1: cx, y1: cy, x2: d[0], y2: d[1] });
    }
    const n = pt(ang(c.pfrm), R - 14);
    el('line', { class: 'needle', x1: cx, y1: cy, x2: n[0], y2: n[1] });
    el('circle', { class: 'hub', cx: cx, cy: cy, r: 5 });
    const off = c.pfrm > 100 ? ' (off scale)' : c.pfrm < 0.1 ? ' (off scale)' : '';
    text(cx, cy + 30, '1 : ' + ratio(c.pfrm) + off, 'middle', 'ratio-text');
    text(cx, cy + 48, 'kg fish : kg plants' + (c.pfrmDry ? ' · dashed = dry ' + ratio(c.pfrmDry) : ''), 'middle', 'dim-text');
  }

  // ---------- Results text ----------
  function resultsText() {
    const c = compute();
    const L = ['Plant-Fish Mass Ratio (PFRM) Calculator'];
    if (mode === 'measure') {
      L.push('Plant gain: ' + typed('pgain') + '; fish gain: ' + typed('fgain'));
      if (numVal('feed')) L.push('Feed: ' + typed('feed'));
      if (numVal('dmp') && numVal('dmf')) L.push('Dry matter: plants ' + typed('dmp') + '%, fish ' + typed('dmf') + '%');
      if (numVal('area')) L.push('Grow area: ' + typed('area'));
      if (numVal('vol')) L.push('Fish tank volume: ' + typed('vol'));
      if (numVal('period')) L.push('Period: ' + typed('period'));
      if (c.ok) {
        L.push('PFRM: ' + ratio(c.pfrm) + ' kg plant/kg fish (' + ratio(c.inv) + ' kg fish/kg plant)');
        if (c.pfrmDry) L.push('PFRM, dry: ' + ratio(c.pfrmDry));
        if (c.fcrf) L.push('FCRfish ' + ratio(c.fcrf) + ', FCRplant ' + ratio(c.fcrp) + ', FCRfish ÷ FCRplant = ' + ratio(c.ident));
        if (c.yield) L.push('Plant gain per area: ' + showY(c.yield));
        if (c.fvol) L.push('Fish gain per tank volume: ' + showD(c.fvol));
        if (c.avol) L.push('Grow area per tank volume: ' + showS(c.avol));
        if (c.load) L.push('Feed loading rate: ' + showR(c.load));
        if (c.pfrmH !== undefined) L.push('Standing PFRM at stocking ' + ratio(c.pfrmO) + ', at harvest ' + ratio(c.pfrmH) + (c.pfrr ? '; PFRR ' + ratio(c.pfrr) : ''));
      }
    } else {
      L.push('Target fish production: ' + typed('tfish') + '; PFRM ' + typed('pfrm'));
      if (numVal('yld')) L.push('Plant yield: ' + typed('yld'));
      if (numVal('pfcrf')) L.push('Fish FCR: ' + typed('pfcrf'));
      if (numVal('period')) L.push('Period: ' + typed('period'));
      if (c.ok) {
        L.push('Plant production: ' + showM(c.P));
        if (c.A) L.push('Grow area needed: ' + showA(c.A));
        if (c.F) L.push('Feed needed: ' + showM(c.F) + '; implied FCRplant ' + ratio(c.fcrp));
        if (c.load) L.push('Feed loading rate: ' + showR(c.load));
      }
    }
    if (c.thPfrm) L.push('Theoretical PFRM (' + (tcrop.value === 'custom' ? 'custom crop' : NP.CROPS[tcrop.value].name) + ', ' + feedName() + ', fish FCR ' + ratio(c.thFcrf) + ', plant N/P retention ' + $('t_nue').value + '/' + $('t_pue').value + '%' + ($('t_ret').value === 'recovery' ? ' with solids recovered' : '') + '): ' + ratio(c.thPfrm) + (c.vs ? '; yours is ' + fmt(c.vs, 2) + '× theoretical' : ''));
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
  tcrop.addEventListener('change', function () { fillCrop(tcrop.value); render(); });
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
    const c = compute();
    if (c.thPfrm) { $('pfrm').value = +c.thPfrm.toFixed(2); render(); }
  });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Plant-Fish Mass Ratio (PFRM) Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () { applyDefaults(); setMode(DEFAULTS.mode); render(); });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.crop && PRESETS[p.crop]) cropSel.value = p.crop;
    if (p.tcrop && (NP.CROPS[p.tcrop] || p.tcrop === 'custom')) { tcrop.value = p.tcrop; fillCrop(p.tcrop); }
    if (p.tfeed && (NP.FEEDS[p.tfeed] || p.tfeed === 'custom')) { tfeed.value = p.tfeed; fillFeed(p.tfeed); }
    THEORY_FIELDS.forEach(function (f) {
      if (p[f] !== undefined) $(f).value = isFinite(parseFloat(p[f])) ? p[f] : '';
    });
    if (NP.RET_MODES.indexOf(p.t_ret) >= 0) $('t_ret').value = p.t_ret;
    NP.RET_FIELDS.forEach(function (f) {
      if (p[f] !== undefined) $(f).value = isFinite(parseFloat(p[f])) ? p[f] : '';
    });
    OUTS.forEach(function (o) {
      if (p[o[0]] && CalcUnits.unitDef(o[1], p[o[0]])) $(o[0]).value = p[o[0]];
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
