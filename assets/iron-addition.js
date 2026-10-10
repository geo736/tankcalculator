// Iron Addition Calculator: chelated iron dose to reach a target Fe level,
// pH stability check, live SVG (Fe level bar, dose jar, chelate pH chart), shareable URL state.
(function () {
  'use strict';

  // Typical label Fe content (mass fraction) and approximate upper pH at which the
  // product keeps iron in solution. Chelate limits: Norvell (1972), Lindsay (1979),
  // Hershkowitz et al. (2025, HortScience 60:404). FeSO4·7H2O Fe fraction from IUPAC
  // atomic weights: 55.845 / 278.01 = 0.2009. The FeSO4 pH 6.0 limit is a rule of thumb
  // (Fe2+ oxidation rate rises ~100× per pH unit; Stumm & Lee 1961).
  const PRODUCTS = {
    dtpa: { name: 'Fe-DTPA', pct: 11, phMax: 7.5, chelate: true },
    eddha: { name: 'Fe-EDDHA', pct: 6, phMax: 9.0, chelate: true },
    edta: { name: 'Fe-EDTA', pct: 13, phMax: 6.5, chelate: true },
    fes: { name: 'ferrous sulfate', pct: 20.1, phMax: 6.0, chelate: false },
    other: { name: 'iron product', pct: 10, phMax: null, chelate: null }
  };
  const PH_ROWS = [
    { key: 'edta', label: 'Fe-EDTA' },
    { key: 'dtpa', label: 'Fe-DTPA' },
    { key: 'eddha', label: 'Fe-EDDHA' },
    { key: 'fes', label: 'FeSO₄' }
  ];
  const NEAR = 0.3; // pH units below a limit that count as "near limit"
  // Guidance bands in mg/L (rules of thumb): aquaponics ~1–2 (FAO TP 589; UVI 2 mg/L),
  // hydroponic recipes ~1–3.
  const BANDS = { aqp: { lo: 1, hi: 2, name: 'aquaponics' }, hyd: { lo: 1, hi: 3, name: 'hydroponics' } };
  const L_PER_GAL = 3.785411784;

  const DEFAULTS = {
    sys: 'aqp', vol: 1000, vol_u: 'L', cur: 0, cur_u: 'mgL', tgt: 2, tgt_u: 'mgL',
    prod: 'dtpa', form: 'powder', pct: 11, liq: 6, liq_u: 'pct', ph: 7.0, mout: 'g', vout: 'mL'
  };
  const UNIT_FIELDS = ['vol', 'cur', 'tgt', 'liq'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const sysSel = $('sys'), prodSel = $('prod'), formSel = $('form');
  const moutSel = $('mout'), voutSel = $('vout');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac
      : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : '–') + (u ? ' ' + u : '');
  }
  function mgL(v) { return fmt(v) + ' mg/L'; }

  // ---------- Inputs ----------
  function readPh() {
    const v = parseFloat($('ph').value);
    return isFinite(v) ? v : NaN;
  }
  function readPct() {
    const v = parseFloat($('pct').value);
    return isFinite(v) ? v : NaN;
  }

  // ---------- Calculation ----------
  function compute() {
    const volL = CalcUnits.base('vol');
    const cur = CalcUnits.base('cur');             // mg/L (0 when empty)
    const tgtRaw = CalcUnits.baseSigned('tgt');
    const tgt = isFinite(tgtRaw) && tgtRaw > 0 ? tgtRaw : 0;
    const form = formSel.value;
    const pct = readPct();
    const liqMgL = CalcUnits.base('liq');          // Fe in liquid product, mg/L
    const ph = readPh();
    const prod = PRODUCTS[prodSel.value];
    const band = BANDS[sysSel.value];

    const msgs = [];
    let ok = true;
    if (!(volL > 0)) { msgs.push('Enter the system water volume.'); ok = false; }
    if (!(tgt > 0)) { msgs.push('Enter a target iron level above zero.'); ok = false; }
    if (form === 'powder' && !(pct > 0 && pct <= 100)) { msgs.push('Iron content must be between 0 and 100% Fe.'); ok = false; }
    if (form === 'liquid' && !(liqMgL > 0)) { msgs.push('Enter the iron strength of the liquid product.'); ok = false; }
    if (form === 'liquid' && liqMgL > 500000) { msgs.push('Liquid strength above 50% w/v is not realistic – check the label and unit.'); ok = false; }

    const rise = Math.max(0, tgt - cur);              // mg/L
    const feMg = rise * volL;                         // mg Fe
    const feG = feMg / 1000;
    let productG = NaN, productMl = NaN;
    if (ok) {
      if (form === 'powder') productG = feG / (pct / 100);
      else productMl = feMg / liqMgL * 1000;          // L of product × 1000
    }
    if (ok && tgt <= cur) msgs.push('Current iron is already at or above the target, so no iron is needed.');
    if (ok && tgt > band.hi + 1) msgs.push('The target is well above the usual ' + band.name + ' range (' + band.lo + '–' + band.hi + ' mg/L). Check the number and unit; excess iron is wasted and can precipitate.');

    let phStat = null;
    if (isFinite(ph)) {
      if (ph < 0 || ph > 14) { msgs.push('pH must be between 0 and 14.'); }
      else phStat = phCheck(prodSel.value, ph);
    }
    if (prodSel.value === 'fes') {
      msgs.push('Ferrous sulfate is not chelated. In aerated water near neutral pH its iron oxidises and precipitates as rust-coloured ferric hydroxide; use a chelate in aquaponics.');
    }

    return { volL: volL, cur: cur, tgt: tgt, rise: rise, feG: feG, productG: productG, productMl: productMl,
      form: form, pct: pct, liqMgL: liqMgL, ph: ph, phStat: phStat, prod: prod, band: band, ok: ok, msgs: msgs };
  }

  // Returns {level: 'ok'|'near'|'bad'|'na', text, alt}
  function phCheck(key, ph) {
    const p = PRODUCTS[key];
    if (p.phMax === null) return { level: 'na', text: 'No data for this product' };
    const better = ['edta', 'dtpa', 'eddha'].filter(function (k) { return PRODUCTS[k].phMax - NEAR >= ph; })
      .map(function (k) { return PRODUCTS[k].name; });
    if (ph > p.phMax) {
      return { level: 'bad', text: 'Not stable above pH ' + fmt(p.phMax, 1),
        alt: better.length ? better.join(' or ') : 'no common chelate (lower the pH)' };
    }
    if (ph > p.phMax - NEAR) return { level: 'near', text: 'Near limit (pH ' + fmt(p.phMax, 1) + ')', alt: better.join(' or ') };
    return { level: 'ok', text: 'OK (stable to ~pH ' + fmt(p.phMax, 1) + ')' };
  }

  // ---------- Output helpers ----------
  function productText(r, perL) {
    // perL: optional litres of water to scale to (100 L etc.)
    const scale = perL ? perL / r.volL : 1;
    if (r.form === 'powder') {
      const kg = r.productG / 1000 * scale;
      const u = moutSel.value;
      return fmt(CalcUnits.convert('mass', kg, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
    }
    const L = r.productMl / 1000 * scale;
    const u = voutSel.value;
    return fmt(CalcUnits.convert('volume', L, 'L', u)) + ' ' + CalcUnits.label('volume', u);
  }
  function productName(r) {
    const p = PRODUCTS[prodSel.value];
    if (r.form === 'powder') return (prodSel.value === 'other' ? 'product' : p.name) + ' at ' + fmt(r.pct) + '% Fe';
    return 'liquid ' + (prodSel.value === 'other' ? 'product' : p.name) + ' at ' + fmt(r.liqMgL / 10000) + '% w/v Fe';
  }
  function bandText(r) {
    const b = r.band;
    if (r.tgt < b.lo) return 'Below ' + b.lo + '–' + b.hi + ' mg/L';
    if (r.tgt > b.hi) return 'Above ' + b.lo + '–' + b.hi + ' mg/L';
    return 'Within ' + b.lo + '–' + b.hi + ' mg/L';
  }
  function phText(r) {
    if (!r.phStat) return isFinite(r.ph) ? '–' : 'Enter pH to check';
    let t = r.phStat.text;
    if ((r.phStat.level === 'bad' || r.phStat.level === 'near') && r.phStat.alt) t += '; consider ' + r.phStat.alt;
    return t;
  }

  // ---------- UI state ----------
  function applyForm() {
    const f = formSel.value;
    document.querySelectorAll('[data-form]').forEach(function (el) { el.hidden = el.dataset.form !== f; });
    $('pct-hint').textContent = f === 'powder'
      ? 'Use the % Fe printed on your product label; the preset is a typical value.'
      : 'Grams of Fe per 100 mL of product. If the label gives % w/w, multiply by the product’s specific gravity.';
  }

  function getState() {
    const st = { sys: sysSel.value, prod: prodSel.value, form: formSel.value };
    ['vol', 'cur', 'tgt'].forEach(function (f) { st[f] = $(f).value; st[f + '_u'] = CalcUnits.unit(f); });
    if (formSel.value === 'powder') { st.pct = $('pct').value; st.mout = moutSel.value; }
    else { st.liq = $('liq').value; st.liq_u = CalcUnits.unit('liq'); st.vout = voutSel.value; }
    st.ph = $('ph').value || 'none'; // keep an emptied pH empty after reload
    return st;
  }

  function applyDefaults() {
    sysSel.value = DEFAULTS.sys;
    prodSel.value = DEFAULTS.prod;
    formSel.value = DEFAULTS.form;
    UNIT_FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f], DEFAULTS[f + '_u']); });
    $('pct').value = DEFAULTS.pct;
    $('ph').value = DEFAULTS.ph.toFixed(1);
    moutSel.value = DEFAULTS.mout;
    voutSel.value = DEFAULTS.vout;
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    notice.textContent = r.msgs.join(' ');
    notice.hidden = r.msgs.length === 0;

    const show = r.ok;
    $('r-main-label').textContent = show ? 'Product to add (' + productName(r) + ')' : 'Product to add';
    $('r-main').textContent = show ? productText(r) : '–';
    $('r-fe').textContent = show ? fmt(r.feG) + ' g' : '–';
    $('r-rise').textContent = show ? mgL(r.cur) + ' → ' + mgL(Math.max(r.cur, r.tgt)) : '–';
    $('r-100l').textContent = show ? productText(r, 100) : '–';
    $('r-100g').textContent = show ? productText(r, 100 * L_PER_GAL) : '–';
    $('r-band').textContent = r.tgt > 0 ? bandText(r) : '–';
    const phEl = $('r-ph');
    phEl.textContent = phText(r);
    phEl.className = 'v' + (r.phStat ? (r.phStat.level === 'ok' ? ' status-ok' : r.phStat.level === 'na' ? '' : ' status-warn') : '');

    $('viz-caption').textContent = show
      ? productText(r) + ' adds ' + fmt(r.feG) + ' g Fe: ' + mgL(r.cur) + ' → ' + mgL(Math.max(r.cur, r.tgt)) +
        (isFinite(r.ph) && r.phStat ? ' · pH ' + r.ph.toFixed(1) : '')
      : 'Enter the inputs to see the dose';

    drawViz(r);
    CalcShare.writeParams(getState());
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
  function txt(x, y, s, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, s);
  }

  function niceMax(v) {
    const steps = [1, 2, 2.5, 4, 5, 8, 10];
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (let i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawLevel(r);
    drawJar(r);
    drawPh(r);
  }

  // Section 1: Fe level bar, y 0–100
  function drawLevel(r) {
    const x0 = 24, x1 = VW - 24, y = 50, h = 22;
    const b = r.band;
    const max = niceMax(Math.max(b.hi * 1.5, r.tgt * 1.15, r.cur * 1.15, 0.1));
    const X = function (v) { return x0 + (x1 - x0) * Math.min(v, max) / max; };

    txt(x0, 16, 'Iron level (mg/L Fe)', 'start', 'strong-text');
    el('rect', { class: 'track', x: x0, y: y, width: x1 - x0, height: h, rx: 4 });
    el('rect', { class: 'band', x: X(b.lo), y: y - 4, width: X(b.hi) - X(b.lo), height: h + 8, rx: 3 });
    if (r.cur > 0) el('rect', { class: 'have', x: x0, y: y + 4, width: X(r.cur) - x0, height: h - 8, rx: 2 });
    if (r.tgt > r.cur) el('rect', { class: 'rise', x: X(r.cur), y: y + 4, width: X(r.tgt) - X(r.cur), height: h - 8, rx: 2 });
    txt((X(b.lo) + X(b.hi)) / 2, y - 8, b.name + ' band', 'middle', 'accent-text');

    // ticks
    const step = max / 4;
    for (let i = 0; i <= 4; i++) {
      const v = step * i, xx = X(v);
      el('line', { class: 'tick', x1: xx, y1: y + h, x2: xx, y2: y + h + 4 });
      txt(xx, y + h + 16, fmt(v, 2), i === 0 ? 'start' : i === 4 ? 'end' : 'middle');
    }
    // markers
    if (r.tgt > 0) {
      const xt = X(r.tgt);
      el('line', { class: 'marker', x1: xt, y1: y - 6, x2: xt, y2: y + h + 6 });
      const anchor = xt > x1 - 50 ? 'end' : xt < x0 + 50 ? 'start' : 'middle';
      txt(xt, y + h + 32, 'target ' + fmt(r.tgt), anchor, 'strong-text');
    }
    const xc = X(r.cur);
    el('line', { class: 'marker', x1: xc, y1: y - 2, x2: xc, y2: y + h + 2, 'stroke-dasharray': '3 2' });
    if (Math.abs(xc - X(r.tgt)) > 80 || r.tgt <= 0) {
      txt(xc, y + h + 32, 'now ' + fmt(r.cur), xc < x0 + 40 ? 'start' : 'middle', 'dim-text');
    }
  }

  // Section 2: jar sized by dose (log scale), y 110–195
  function drawJar(r) {
    const amount = r.form === 'powder' ? r.productG : r.productMl; // g or mL
    const has = r.ok && amount > 0;
    const lg = has ? Math.log10(amount) : -1;
    const s = 0.35 + 0.65 * Math.max(0, Math.min(1, (lg + 1) / 5)); // 0.1 g/mL → 0.35, 10 kg/L → 1
    const cx = 62, base = 196;
    const w = 64 * s, hgt = 72 * s;
    const left = cx - w / 2, top = base - hgt;

    if (r.form === 'powder') {
      el('rect', { class: 'jar', x: left, y: top, width: w, height: hgt, rx: 6 * s });
      if (has) el('rect', { class: 'powder', x: left + 3, y: top + hgt * 0.3, width: w - 6, height: hgt * 0.7 - 3, rx: 4 * s });
      el('rect', { class: 'jar-lid', x: left - 3, y: top - 9 * s, width: w + 6, height: 9 * s, rx: 2 });
    } else {
      const neck = w * 0.34, sh = hgt * 0.28;
      const d = 'M' + (cx - neck / 2) + ',' + (top - 6 * s) + ' L' + (cx - neck / 2) + ',' + top +
        ' L' + left + ',' + (top + sh) + ' L' + left + ',' + base + ' L' + (left + w) + ',' + base +
        ' L' + (left + w) + ',' + (top + sh) + ' L' + (cx + neck / 2) + ',' + top + ' L' + (cx + neck / 2) + ',' + (top - 6 * s) + 'Z';
      el('path', { class: 'jar', d: d });
      if (has) el('rect', { class: 'liquid', x: left + 3, y: top + sh + 4, width: w - 6, height: base - top - sh - 7, rx: 2 });
      el('rect', { class: 'jar-lid', x: cx - neck / 2 - 2, y: top - 14 * s, width: neck + 4, height: 8 * s, rx: 2 });
    }

    const tx = 128;
    if (has) {
      txt(tx, 142, productText(r) + ' of product', 'start', 'strong-text');
      txt(tx, 160, 'contains ' + fmt(r.feG) + ' g Fe · ' + productText(r, 100) + ' per 100 L', 'start');
      txt(tx, 178, 'Jar size grows with the dose (log scale)', 'start');
    } else {
      txt(tx, 160, r.ok ? 'No iron needed' : 'Enter the inputs to see the dose', 'start', 'strong-text');
    }
  }

  // Section 3: chelate stability vs pH, y 210–398
  function drawPh(r) {
    const px0 = 116, px1 = VW - 16, phMin = 4, phMax = 10;
    const X = function (p) { return px0 + (px1 - px0) * (Math.max(phMin, Math.min(phMax, p)) - phMin) / (phMax - phMin); };
    const rowY0 = 238, rowH = 20, gap = 12;
    const yEnd = rowY0 + PH_ROWS.length * (rowH + gap) - gap;

    txt(24, 214, 'pH range where iron stays dissolved', 'start', 'strong-text');
    // typical aquaponic pH zone 6–7
    el('rect', { class: 'ph-zone', x: X(6), y: rowY0 - 6, width: X(7) - X(6), height: yEnd - rowY0 + 12 });

    for (let p = phMin; p <= phMax; p++) {
      el('line', { class: 'grid', x1: X(p), y1: rowY0 - 6, x2: X(p), y2: yEnd + 6 });
      txt(X(p), yEnd + 20, String(p));
    }
    txt(px0 - 8, yEnd + 20, 'pH', 'end');

    PH_ROWS.forEach(function (row, i) {
      const y = rowY0 + i * (rowH + gap);
      const lim = PRODUCTS[row.key].phMax;
      const sel = prodSel.value === row.key;
      el('rect', { class: 'stable' + (sel ? ' sel' : ''), x: X(phMin), y: y, width: X(lim) - X(phMin), height: rowH, rx: 3 });
      el('rect', { class: 'unstable' + (sel ? ' sel' : ''), x: X(lim), y: y, width: X(phMax) - X(lim), height: rowH, rx: 3 });
      if (sel) el('rect', { class: 'row-sel', x: X(phMin) - 2, y: y - 2, width: X(phMax) - X(phMin) + 4, height: rowH + 4, rx: 4 });
      txt(px0 - 8, y + 14, row.label, 'end', sel ? 'strong-text' : 'dim-text');
      txt(X(lim) + 4, y + 14, (row.key === 'fes' ? '~' : '≤') + fmt(lim, 1), 'start', 'dim-text');
    });

    txt(24, yEnd + 42, 'Shaded: usual aquaponic pH 6–7 · FeSO₄ is not chelated', 'start');

    if (isFinite(r.ph) && r.ph >= 0 && r.ph <= 14) {
      const xp = X(r.ph);
      el('line', { class: 'ph-line', x1: xp, y1: rowY0 - 12, x2: xp, y2: yEnd + 6 });
      const lvl = r.phStat ? r.phStat.level : 'na';
      const anchor = xp > px1 - 40 ? 'end' : 'middle';
      const label = 'your pH ' + r.ph.toFixed(1) + (r.ph < phMin || r.ph > phMax ? ' (off scale)' : '');
      txt(xp, rowY0 - 16, label, anchor, lvl === 'bad' || lvl === 'near' ? 'warn-text' : 'strong-text');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'Iron Addition Calculator',
      'System: ' + (sysSel.value === 'aqp' ? 'aquaponics' : 'hydroponics') + ', volume ' + typed('vol'),
      'Current Fe ' + typed('cur') + ', target Fe ' + typed('tgt'),
      'Product: ' + prodSel.options[prodSel.selectedIndex].text + ', ' +
        (r.form === 'powder' ? 'powder at ' + typed('pct') + '% Fe' : 'liquid at ' + typed('liq'))
    ];
    if (r.ok) {
      lines.push('Product to add: ' + productText(r));
      lines.push('Fe added: ' + fmt(r.feG) + ' g (' + mgL(r.cur) + ' → ' + mgL(Math.max(r.cur, r.tgt)) + ')');
      lines.push('Dose: ' + productText(r, 100) + ' per 100 L · ' + productText(r, 100 * L_PER_GAL) + ' per 100 US gal');
    } else {
      lines.push('Result: incomplete inputs');
    }
    if (r.tgt > 0) lines.push('Target vs ' + r.band.name + ' guidance: ' + bandText(r));
    if (isFinite(r.ph)) lines.push('pH ' + r.ph.toFixed(1) + ': ' + phText(r));
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  ['vol', 'cur', 'tgt', 'pct', 'liq', 'ph'].forEach(function (f) { $(f).addEventListener('input', render); });
  sysSel.addEventListener('change', render);
  formSel.addEventListener('change', function () { applyForm(); render(); });
  prodSel.addEventListener('change', function () {
    $('pct').value = PRODUCTS[prodSel.value].pct;
    render();
  });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Iron Addition Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    applyForm();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.sys && BANDS[p.sys]) sysSel.value = p.sys;
    if (p.prod && PRODUCTS[p.prod]) { prodSel.value = p.prod; $('pct').value = PRODUCTS[p.prod].pct; }
    if (p.form === 'powder' || p.form === 'liquid') formSel.value = p.form;
    UNIT_FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.pct !== undefined && isFinite(parseFloat(p.pct))) $('pct').value = p.pct;
    if (p.ph !== undefined) $('ph').value = isFinite(parseFloat(p.ph)) ? p.ph : '';
    if (p.mout && CalcUnits.unitDef('mass', p.mout)) moutSel.value = p.mout;
    if (p.vout && CalcUnits.unitDef('volume', p.vout)) voutSel.value = p.vout;
    applyForm();
    render();
  })();
})();
