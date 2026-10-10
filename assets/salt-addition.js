// Salt Addition Calculator: NaCl dose for fish health, nitrite protection or target salinity,
// with a live tank / salt pile / salinity gauge diagram and shareable URL state.
(function () {
  'use strict';

  // Atomic masses (g/mol), CIAAW standard atomic weights.
  const M_NA = 22.98977, M_CL = 35.453, M_N = 14.007, M_O = 15.999;
  const M_NACL = M_NA + M_CL;                 // 58.443
  const CL_FRAC = M_CL / M_NACL;              // 0.6066 g Cl per g NaCl
  const N_FRAC_NO2 = M_N / (M_N + 2 * M_O);   // 0.3045 g N per g NO2
  const G_PER_CUP = 292;                      // USDA FoodData Central, salt, table: 1 cup = 292 g
  const ML_PER_CUP = 236.5882365;             // US cup
  const G_PER_ML = G_PER_CUP / ML_PER_CUP;    // ≈ 1.234 g/mL bulk density
  const G_PER_TBSP = G_PER_ML * ML_PER_CUP / 16;
  const G_PER_TSP = G_PER_TBSP / 3;
  const EC_PER_GL = 2;                        // mS/cm per g/L NaCl, rough, valid at low levels only
  const SRAC_RATIO = 10, MIN_RATIO = 6;

  // Treatment presets (mg/L). lo === hi means a single recommended strength.
  const PRESETS = {
    prolonged: { lo: 1000, hi: 3000, def: 2, name: 'prolonged / indefinite', hint: 'Many freshwater aquaculturists keep 1–3 g/L NaCl in recirculating systems (Yanong 2003). Can be used in the whole system if plants and species tolerate it.' },
    transport: { lo: 5000, hi: 8000, def: 6, name: 'handling and transport', hint: 'Used in hauling water during transport to reduce stress (Kubitza). For hauling tanks or holding tanks, not the whole system.' },
    bath: { lo: 10000, hi: 10000, def: 10, name: '1% bath', hint: '1% salt for 30 minutes up to several hours (Francis-Floyd). Separate container with aeration; watch the fish.' },
    dip: { lo: 30000, hi: 30000, def: 30, name: '3% dip', hint: '3% (about seawater) for 30 seconds to 10 minutes depending on species (Francis-Floyd). Separate container; remove fish at the first sign of distress.' }
  };

  // Venice System (1958) salinity classes, mg/L ≈ ppt × 1000.
  const VENICE = [
    { lo: 0, hi: 500, name: 'fresh (< 0.5‰)' },
    { lo: 500, hi: 5000, name: 'oligohaline (0.5–5‰)' },
    { lo: 5000, hi: 18000, name: 'mesohaline (5–18‰)' },
    { lo: 18000, hi: 30000, name: 'polyhaline (18–30‰)' },
    { lo: 30000, hi: 40000, name: 'euhaline (30–40‰)' },
    { lo: 40000, hi: Infinity, name: 'hyperhaline (> 40‰)' }
  ];

  const DEFAULTS = {
    volume: [100, 'gal'], cur: [0, 'gL'], target: [2, 'gL'],
    nitrite: [2, 'mgL'], cl: [10, 'mgL'], ratio: [10], purity: [99]
  };
  const FIELDS = Object.keys(DEFAULTS);
  const UNIT_FIELDS = ['volume', 'cur', 'target', 'nitrite', 'cl'];
  const MODES = ['therapy', 'nitrite', 'salinity'];

  const $ = function (id) { return document.getElementById(id); };
  const presetSel = $('preset'), basisSel = $('basis'), nformSel = $('nform'), outSel = $('out');
  const modeButtons = document.querySelectorAll('#mode-group button');
  const svg = $('viz');
  let mode = 'therapy';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function fmtMass(kg, unitId) {
    return fmt(CalcUnits.convert('mass', kg, 'kg', unitId)) + ' ' + CalcUnits.label('mass', unitId);
  }
  // Concentration in mg/L shown in a unit; mg/L below 1 g/L, otherwise g/L unless the user picked another unit.
  function fmtConc(mgL, unitId) {
    const u = unitId || (Math.abs(mgL) >= 1000 ? 'gL' : 'mgL');
    return fmt(CalcUnits.convert('concentration', mgL, 'mgL', u)) + ' ' + CalcUnits.label('concentration', u);
  }
  function autoConc(mgL) { return fmtConc(mgL, Math.abs(mgL) >= 1000 ? 'gL' : 'mgL'); }
  function typed(id) {
    const v = parseFloat($(id).value);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function kitchen(g) {
    if (!(g > 0)) return '–';
    const cups = g / G_PER_CUP;
    if (cups > 100) return 'weigh it (≈ ' + fmt(cups, 0) + ' cups)';
    if (cups >= 0.5) return '≈ ' + fmt(cups, cups >= 10 ? 0 : 1) + ' cups';
    const tbsp = g / G_PER_TBSP;
    if (tbsp >= 1) return '≈ ' + fmt(tbsp, 1) + ' tbsp';
    return '≈ ' + fmt(g / G_PER_TSP, 1) + ' tsp';
  }

  // ---------- Calculation (mg/L, L, kg) ----------
  function compute() {
    const r = { errors: [], notes: [] };
    r.V = CalcUnits.base('volume');                     // L
    const purityRaw = parseFloat($('purity').value);
    r.purity = purityRaw;
    if (!(r.V > 0)) r.errors.push('Enter the water volume to see the result.');
    if (!(purityRaw > 0 && purityRaw <= 100)) r.errors.push('Salt purity must be more than 0% and at most 100%.');

    if (mode === 'nitrite') {
      const nRaw = CalcUnits.base('nitrite');
      r.no2n = nformSel.value === 'no2' ? nRaw * N_FRAC_NO2 : nRaw;
      r.clNow = CalcUnits.base('cl');
      r.ratio = parseFloat($('ratio').value);
      if (!(r.ratio > 0)) r.errors.push('Enter a target chloride : nitrite-N ratio (for example 10).');
      if (!(r.no2n > 0)) r.notes.push('With no nitrite measured, no chloride is needed for nitrite protection.');
      r.clTarget = r.ratio > 0 ? r.ratio * r.no2n : 0;
      r.clAdd = Math.max(0, r.clTarget - r.clNow);
      r.dose = r.clAdd / CL_FRAC;                        // mg/L NaCl
      r.clAfter = r.clNow + r.clAdd;
      r.saltNow = r.clNow / CL_FRAC;
      r.saltAfter = r.saltNow + r.dose;
      if (r.no2n > 0 && r.clAdd === 0 && r.ratio > 0) r.notes.push('Chloride is already at or above ' + fmt(r.ratio) + ' : 1 with nitrite-N. No salt is needed.');
    } else {
      const curRaw = CalcUnits.base('cur');
      r.saltNow = basisSel.value === 'cl' ? curRaw / CL_FRAC : curRaw;
      const t = CalcUnits.baseSigned('target');
      if (!isFinite(t) || t < 0) r.errors.push('Enter a target salt level of 0 or more.');
      r.target = isFinite(t) && t >= 0 ? t : 0;
      r.dose = Math.max(0, r.target - r.saltNow);
      r.saltAfter = r.saltNow + r.dose;
      r.clNow = r.saltNow * CL_FRAC;
      r.clAfter = r.saltAfter * CL_FRAC;
      if (!r.errors.length && r.target < r.saltNow) {
        const f = 1 - r.target / r.saltNow;
        r.notes.push('The water is already saltier than the target. Salt cannot be filtered out: to go from ' + autoConc(r.saltNow) + ' to ' + autoConc(r.target) + ', replace about ' + fmt(f * 100, 0) + '% of the water with salt-free water.');
        r.waterChange = f;
      } else if (!r.errors.length && r.target === r.saltNow && r.target > 0) {
        r.notes.push('The water is already at the target level.');
      }
      if (r.target > 40000) r.notes.push('The target is above seawater strength (about 35 g/L).');
      if (mode === 'therapy' && (presetSel.value === 'bath' || presetSel.value === 'dip')) {
        r.notes.push('Baths and dips are for a separate, aerated container holding only the treatment water. Never raise a whole system or aquaponic loop to this strength.');
      }
      if (mode === 'salinity' && r.target > 5000) {
        r.notes.push('Above a few g/L, brackish and marine species usually do better with a marine salt mix (which also supplies Mg, Ca and K) than with pure NaCl.');
      }
    }

    r.ok = !r.errors.length;
    r.pureKg = r.ok ? r.dose * r.V / 1e6 : NaN;          // mg/L × L = mg → kg
    r.saltKg = r.ok ? r.pureKg / (r.purity / 100) : NaN;
    return r;
  }

  function zoneInfo(r) {
    if (mode === 'therapy') {
      const p = PRESETS[presetSel.value];
      const v = r.saltAfter;
      const rangeTxt = p.lo === p.hi ? fmtConc(p.lo, 'gL') : fmt(p.lo / 1000) + '–' + fmtConc(p.hi, 'gL');
      let ok, txt;
      if (p.lo === p.hi) {
        ok = Math.abs(v - p.lo) <= 0.1 * p.lo;
        txt = ok ? 'At ' + p.name + ' strength (' + rangeTxt + ')' : (v < p.lo ? 'Below ' : 'Above ') + p.name + ' strength (' + rangeTxt + ')';
      } else {
        ok = v >= p.lo - 1e-9 && v <= p.hi + 1e-9;
        txt = ok ? 'Within ' + p.name + ' range (' + rangeTxt + ')' : (v < p.lo ? 'Below ' : 'Above ') + p.name + ' range (' + rangeTxt + ')';
      }
      return { ok: ok, text: txt };
    }
    if (mode === 'nitrite') {
      if (!(r.no2n > 0)) return { ok: true, text: 'No nitrite measured' };
      const after = r.clAfter / r.no2n;
      if (after >= SRAC_RATIO - 1e-9) return { ok: true, text: 'Meets SRAC 462 (≥ 10 : 1)' };
      if (after >= MIN_RATIO - 1e-9) return { ok: false, text: 'Above 6 : 1, below SRAC 10 : 1' };
      return { ok: false, text: 'Below the 6 : 1 minimum' };
    }
    const c = VENICE.filter(function (b) { return r.saltAfter >= b.lo && r.saltAfter < b.hi; })[0];
    return { ok: true, text: 'Venice class: ' + c.name };
  }

  // ---------- UI state ----------
  function setMode(m) {
    mode = m;
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-for]').forEach(function (el) {
      el.hidden = el.dataset.for.split(' ').indexOf(m) === -1;
    });
    $('li-ratio').hidden = m !== 'nitrite';
    $('volume-hint').textContent = m === 'nitrite'
      ? 'The whole pond or system volume.'
      : 'The water that receives the salt: the whole system, or just the treatment tank.';
  }

  function updatePresetHint() {
    $('preset-hint').textContent = PRESETS[presetSel.value].hint;
  }

  function visibleFields() {
    return FIELDS.filter(function (f) { return !$(f).closest('[data-for]') || !$(f).closest('[data-for]').hidden; });
  }

  function getState() {
    const st = { mode: mode, out: outSel.value };
    if (mode === 'therapy') st.preset = presetSel.value;
    if (mode !== 'nitrite') st.basis = basisSel.value;
    if (mode === 'nitrite') st.nform = nformSel.value;
    visibleFields().forEach(function (f) {
      st[f] = $(f).value;
      if (UNIT_FIELDS.indexOf(f) !== -1) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    presetSel.value = 'prolonged';
    basisSel.value = 'salt';
    nformSel.value = 'n';
    outSel.value = 'lb';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const out = outSel.value;
    const notice = $('notice');
    const msgs = r.errors.length ? r.errors : r.notes;
    notice.textContent = msgs.join(' ');
    notice.hidden = !msgs.length;

    const ok = r.ok;
    const g = r.saltKg * 1000;
    $('r-salt').textContent = ok ? fmtMass(r.saltKg, out) : '–';
    $('r-cups').textContent = ok ? (g > 0 ? kitchen(g) : 'none') : '–';
    $('r-dose').textContent = ok ? '+' + autoConc(r.dose) + (r.dose > 0 && r.purity < 100 ? ' (' + fmtMass(r.pureKg, g >= 1000 ? 'kg' : 'g') + ' pure NaCl)' : '') : '–';
    $('r-level').textContent = ok ? autoConc(r.saltNow) + ' → ' + autoConc(r.saltAfter) : '–';
    $('r-cl').textContent = ok ? autoConc(r.clNow) + ' → ' + autoConc(r.clAfter) : '–';
    if (mode === 'nitrite') {
      $('r-ratio').textContent = ok && r.no2n > 0
        ? fmt(r.clNow / r.no2n, 1) + ' → ' + fmt(r.clAfter / r.no2n, 1) + ' : 1'
        : '–';
    }
    const zone = ok ? zoneInfo(r) : null;
    const zEl = $('r-zone');
    zEl.textContent = zone ? zone.text : '–';
    zEl.className = 'v zone-status' + (zone ? (zone.ok ? ' ok' : ' warn') : '');

    const doseGL = r.dose / 1000;
    $('r-ec').textContent = !ok ? '–' : r.dose <= 0 ? 'none'
      : doseGL <= 3 ? '≈ +' + fmt(doseGL * EC_PER_GL, doseGL * EC_PER_GL < 0.1 ? 3 : 2) + ' mS/cm'
        : 'more than +6 mS/cm';

    const alts = ['g', 'kg', 'lb', 'oz'].filter(function (u) { return u !== out; }).slice(0, 2);
    $('r-alt').textContent = ok ? alts.map(function (u) { return fmtMass(r.saltKg, u); }).join(' · ') : '–';

    // Aquaponics plant caution
    let plant;
    if (mode === 'nitrite') {
      plant = 'Aquaponics: this adds only ' + autoConc(r.clAdd || 0) + ' of chloride, which most crops tolerate. But sodium and chloride are not used up and build up with every dose, so track EC over time.';
    } else {
      plant = 'Aquaponics: plants take up very little sodium or chloride, so this salt stays in the water. Many crops (lettuce, strawberries, many leafy greens) are salt-sensitive. Treat fish in a separate tank or bypass the grow beds for anything above a small dose.';
    }
    $('plant-note').textContent = plant;

    $('viz-caption').textContent = captionText(r, zone);
    drawViz(r);
    CalcShare.writeParams(getState());
  }

  function captionText(r, zone) {
    if (!r.ok) return 'Enter the inputs to draw the tank and gauge';
    const what = mode === 'nitrite' ? 'Chloride ' + autoConc(r.clNow) + ' → ' + autoConc(r.clAfter) : 'Salt ' + autoConc(r.saltNow) + ' → ' + autoConc(r.saltAfter);
    const legend = mode === 'therapy' ? 'green band = ' + PRESETS[presetSel.value].name + ' guidance'
      : mode === 'nitrite' ? 'amber = below 6 : 1, green = target ratio or more'
        : 'shaded bands = Venice salinity classes';
    return what + ' · ' + legend;
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

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  // Simple deterministic pseudo-random numbers so the dots do not jump on every redraw.
  function rng(seed) {
    let s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!r.ok) return;

    // --- Tank (oblique box) ---
    const tx0 = 150, tx1 = 304, tyTop = 84, tyBot = 266, ox = 26, oy = 16;
    const yw = tyTop + 22;
    el('path', { class: 'tank-back', d: 'M' + (tx0 + ox) + ',' + (tyBot - oy) + ' V' + (tyTop - oy) + ' M' + (tx0 + ox) + ',' + (tyBot - oy) + ' H' + (tx1 + ox) + ' M' + (tx0 + ox) + ',' + (tyBot - oy) + ' L' + tx0 + ',' + tyBot });
    el('rect', { class: 'water', x: tx0, y: yw, width: tx1 - tx0, height: tyBot - yw });
    el('path', { class: 'water-side', d: 'M' + tx1 + ',' + tyBot + ' L' + (tx1 + ox) + ',' + (tyBot - oy) + ' V' + (yw - oy) + ' L' + tx1 + ',' + yw + 'Z' });
    el('path', { class: 'water-top', d: 'M' + tx0 + ',' + yw + ' H' + tx1 + ' L' + (tx1 + ox) + ',' + (yw - oy) + ' H' + (tx0 + ox) + 'Z' });

    // dissolved salt dots: density follows the resulting salt level (relative to seawater, 35 g/L)
    const n = Math.round(70 * Math.sqrt(Math.min(1, r.saltAfter / 35000)));
    const rand = rng(12345);
    for (let i = 0; i < n; i++) {
      el('circle', { class: 'salt-dot', cx: tx0 + 6 + rand() * (tx1 - tx0 - 12), cy: yw + 8 + rand() * (tyBot - yw - 14), r: 1.6 });
    }

    el('path', { class: 'tank-line', d: 'M' + tx0 + ',' + tyTop + ' V' + tyBot + ' H' + tx1 + ' V' + tyTop + 'Z' +
      ' M' + tx1 + ',' + tyBot + ' L' + (tx1 + ox) + ',' + (tyBot - oy) + ' V' + (tyTop - oy) + ' H' + (tx0 + ox) + ' L' + tx0 + ',' + tyTop +
      ' M' + tx1 + ',' + tyTop + ' L' + (tx1 + ox) + ',' + (tyTop - oy) });
    el('text', { x: (tx0 + tx1) / 2, y: tyBot + 18, 'text-anchor': 'middle', class: 'dim-text' }, fmt(CalcUnits.fromBase('volume', r.V)) + ' ' + CalcUnits.unitLabel('volume'));

    // --- Salt pile, size by mass on a log scale (0.1 g … 1 t) ---
    const g = r.saltKg * 1000;
    const cx = 70, base = 266;
    if (g > 0) {
      const s = Math.max(0.08, Math.min(1, (Math.log10(g) + 1) / 7));
      const w = 26 + 100 * s, h = w * 0.5;
      el('path', { class: 'salt-pile', d: 'M' + (cx - w / 2) + ',' + base + ' Q' + (cx - w * 0.22) + ',' + (base - h * 1.15) + ' ' + cx + ',' + (base - h) +
        ' Q' + (cx + w * 0.22) + ',' + (base - h * 1.15) + ' ' + (cx + w / 2) + ',' + base + 'Z' });
      const gr = rng(777);
      const grains = Math.round(6 + 14 * s);
      for (let i = 0; i < grains; i++) {
        const u = (gr() - 0.5) * 0.8, v = gr();
        const hAt = h * (1 - Math.pow(2 * u, 2));
        el('circle', { class: 'salt-grain', cx: cx + u * w, cy: base - 3 - v * Math.max(0, hAt - 7), r: 1.1 });
      }
      // pour path into tank
      const py = base - h - 6;
      el('path', { class: 'add-path', d: 'M' + cx + ',' + py + ' Q' + (cx + 20) + ',' + (tyTop - 40) + ' ' + (tx0 + 30) + ',' + (tyTop - 8) });
      el('path', { class: 'arrow-head', d: 'M' + (tx0 + 30) + ',' + (tyTop - 4) + ' l-7,-6 l9,-3 z' });
      el('text', { x: cx, y: base + 18, 'text-anchor': 'middle', class: 'strong-text' }, fmtMass(r.saltKg, outSel.value));
      el('text', { x: cx, y: base + 33, 'text-anchor': 'middle', class: 'small-text' }, 'salt to add');
    } else {
      el('line', { class: 'tick', x1: cx - 30, y1: base, x2: cx + 30, y2: base });
      el('text', { x: cx, y: base + 18, 'text-anchor': 'middle', class: 'strong-text' }, 'no salt');
      el('text', { x: cx, y: base + 33, 'text-anchor': 'middle', class: 'small-text' }, 'needed');
    }

    drawGauge(r);
  }

  function drawGauge(r) {
    const gx = 376, gw = 18, gTop = 44, gBot = 266;
    const nitrite = mode === 'nitrite';
    const now = nitrite ? r.clNow : r.saltNow;
    const after = nitrite ? r.clAfter : r.saltAfter;
    const target = nitrite ? r.clTarget : r.target;
    const du = nitrite ? CalcUnits.unit('cl') : CalcUnits.unit('target');
    const toDu = function (mgL) { return CalcUnits.convert('concentration', mgL, 'mgL', du); };

    let hiRef = Math.max(now, after, target || 0);
    if (mode === 'therapy') hiRef = Math.max(hiRef, PRESETS[presetSel.value].hi);
    if (nitrite) hiRef = Math.max(hiRef, MIN_RATIO * r.no2n, SRAC_RATIO * r.no2n);
    if (!(hiRef > 0)) hiRef = nitrite ? 100 : 1000;
    const step = niceStep(toDu(hiRef * 1.15) / 5);
    const maxDu = Math.ceil(toDu(hiRef * 1.15) / step) * step;
    const y = function (mgL) { return gBot - Math.min(1, toDu(mgL) / maxDu) * (gBot - gTop); };

    el('rect', { class: 'gauge-tube', x: gx, y: gTop, width: gw, height: gBot - gTop, rx: 4 });

    // zones
    const zoneRect = function (lo, hi, cls, opacity) {
      const y1 = y(Math.min(hi, 1e12)), y0 = y(lo);
      let top = y1, hgt = y0 - y1;
      if (hgt < 3) { top = (y0 + y1) / 2 - 2; hgt = 4; }
      const a = { class: cls, x: gx + 1, y: top, width: gw - 2, height: hgt };
      if (opacity !== undefined) a['fill-opacity'] = opacity;
      el('rect', a);
    };
    if (mode === 'therapy') {
      const p = PRESETS[presetSel.value];
      zoneRect(p.lo, p.hi, 'zone-ok');
    } else if (nitrite && r.no2n > 0) {
      const tgt = r.ratio * r.no2n;
      zoneRect(0, Math.min(MIN_RATIO * r.no2n, tgt), 'zone-warn');
      zoneRect(tgt, Infinity, 'zone-ok');
    } else if (mode === 'salinity') {
      VENICE.forEach(function (b, i) {
        if (toDu(b.lo) >= maxDu) return;
        zoneRect(b.lo, b.hi, 'zone-band', 0.08 + i * 0.12);
      });
    }

    // fill: existing level (muted) and the part added by this dose (accent)
    const yNow = y(now), yAfter = y(after);
    if (now > 0) el('rect', { class: 'gauge-fill', x: gx + 5, y: yNow, width: gw - 10, height: gBot - yNow, rx: 2 });
    if (after > now) el('rect', { class: 'marker-target', x: gx + 5, y: yAfter, width: gw - 10, height: yNow - yAfter, rx: 2 });

    // ticks on the left
    for (let v = 0; v <= maxDu + 1e-9; v += step) {
      const yy = gBot - v / maxDu * (gBot - gTop);
      el('line', { class: 'tick', x1: gx - 5, y1: yy, x2: gx, y2: yy });
      el('text', { x: gx - 8, y: yy + 4, 'text-anchor': 'end', class: 'small-text' }, fmt(v));
    }
    el('text', { x: gx + gw / 2, y: gTop - 10, 'text-anchor': 'middle', class: 'small-text' },
      (nitrite ? 'Cl⁻ ' : 'NaCl ') + CalcUnits.label('concentration', du).replace(' (ppm)', '').replace(' (ppt)', ''));

    // markers on the right
    const mx = gx + gw + 3;
    let yT = yAfter + 4, yN = yNow + 4;
    if (Math.abs(yT - yN) < 26) {
      if (after >= now) { yT = Math.min(yT, yN - 26); } else { yN = Math.min(yN, yT - 26); }
    }
    el('path', { class: 'marker-now', d: 'M' + mx + ',' + yNow + ' l7,-5 v10 z' });
    el('text', { x: mx + 10, y: yN, class: 'small-text' }, 'now');
    el('text', { x: mx + 10, y: yN + 12, class: 'small-text' }, fmt(toDu(now)));
    if (after !== now) {
      el('path', { class: 'marker-target', d: 'M' + mx + ',' + yAfter + ' l7,-5 v10 z' });
      el('text', { x: mx + 10, y: yT - 8, class: 'accent-text' }, 'after');
      el('text', { x: mx + 10, y: yT + 5, class: 'accent-text' }, fmt(toDu(after)));
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Salt Addition Calculator'];
    lines.push('Purpose: ' + { therapy: 'Fish health (' + PRESETS[presetSel.value].name + ')', nitrite: 'Nitrite protection with chloride', salinity: 'Target salinity' }[mode]);
    lines.push('Water volume: ' + typed('volume'));
    if (mode === 'nitrite') {
      lines.push('Nitrite: ' + typed('nitrite') + ' as ' + (nformSel.value === 'no2' ? 'NO2' : 'NO2-N') + '; current chloride: ' + typed('cl') + '; target ratio ' + $('ratio').value + ' : 1 (Cl : NO2-N)');
    } else {
      lines.push('Current level: ' + typed('cur') + ' as ' + (basisSel.value === 'cl' ? 'chloride' : 'salt') + '; target: ' + typed('target') + ' NaCl');
    }
    lines.push('Salt purity: ' + $('purity').value + '%');
    if (!r.ok) { lines.push(r.errors.join(' ')); return lines.join('\n'); }
    lines.push('Salt to add: ' + fmtMass(r.saltKg, outSel.value) + ' (' + fmtMass(r.saltKg, 'g') + ')' + (r.saltKg > 0 ? ', ' + kitchen(r.saltKg * 1000) + ' of fine table salt' : ''));
    lines.push('Salt level: ' + autoConc(r.saltNow) + ' -> ' + autoConc(r.saltAfter));
    lines.push('Chloride: ' + autoConc(r.clNow) + ' -> ' + autoConc(r.clAfter));
    if (mode === 'nitrite' && r.no2n > 0) lines.push('Cl : NO2-N ratio: ' + fmt(r.clNow / r.no2n, 1) + ' -> ' + fmt(r.clAfter / r.no2n, 1) + ' : 1');
    const z = zoneInfo(r);
    lines.push('Guidance: ' + z.text);
    if (r.notes.length) lines.push('Note: ' + r.notes.join(' '));
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); render(); });
  });
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  [basisSel, nformSel].forEach(function (s) { s.addEventListener('change', render); });
  presetSel.addEventListener('change', function () {
    CalcUnits.set('target', PRESETS[presetSel.value].def, 'gL');
    updatePresetHint();
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
    CalcShare.share({ title: 'Salt Addition Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    setMode('therapy');
    updatePresetHint();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.preset && PRESETS[p.preset]) presetSel.value = p.preset;
    if (p.basis === 'salt' || p.basis === 'cl') basisSel.value = p.basis;
    if (p.nform === 'n' || p.nform === 'no2') nformSel.value = p.nform;
    if (p.out && CalcUnits.unitDef('mass', p.out)) outSel.value = p.out;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    setMode(MODES.indexOf(p.mode) !== -1 ? p.mode : 'therapy');
    updatePresetHint();
    render();
  })();
})();
