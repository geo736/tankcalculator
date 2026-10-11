// Guided design: a grow light system, step by step (crop light needs → PPFD → fixtures →
// layout → power, heat and cost). Uses the CalcGuide framework (assets/guide.js).
// Every formula, constant, preset and rule-of-thumb band is copied from the calculator it
// comes from (daily-light-integral.js, light-conversions.js, light-fixture-layout.js) so the
// guide and the calculators give the same answers; see the comments next to each block.
(function () {
  'use strict';

  const G = CalcGuide;
  const fmt = G.fmt, q = G.q, p = G.p;

  // ---------- Constants (light-fixture-layout.js / daily-light-integral.js) ----------
  const DLI_K = 3600 / 1e6;          // µmol/m²/s × h → mol/m²/day (same as the DLI page)
  const FT2 = 0.09290304;            // m² per ft² (exact)
  const DAYS_PER_MONTH = 30.44;      // same convention as the Light Fixture Layout / Pump pages
  const SUB = 4;                     // each fixture = SUB × SUB Lambertian sub-sources
  const MAX_DRAW = 1500;             // above this many fixtures the plan is not drawn / modelled
  const SMH_OK = 1.0, SMH_MAX = 1.5; // spacing ÷ mounting height rule of thumb
  const UNIF_MIN = 0.7;              // min ÷ avg rule of thumb
  const LUX_PER_FC = 1 / 0.09290304; // 1 fc = 1 lm/ft² = 10.7639 lux (exact)
  const W_PER_BTUH = 0.29307107;     // units.js power group (1 BTU/h in W)
  const BTUH_PER_TON = 12000;        // 1 ton of refrigeration = 12,000 BTU/h (NIST SP 811)
  const FULL_SUN = 2000;             // µmol/m²/s, clear summer noon (light-conversions.js, rule of thumb)

  // ---------- Crop DLI ranges (exactly as daily-light-integral.js) ----------
  const CROPS = {
    lettuce: { name: 'Lettuce & leafy greens', lo: 12, hi: 17, hint: 'Rule of thumb 12–17 (Stallknecht 2025). High DLI raises tipburn risk.' },
    herbs: { name: 'Basil & culinary herbs', lo: 15, hi: 25, hint: 'Rule of thumb 15–25, based on basil (Stallknecht 2025).' },
    fruiting: { name: 'Tomato & fruiting crops', lo: 20, hi: 30, hint: 'Rule of thumb 20–30 or more (Stallknecht 2025; Purdue HO-303-W).' },
    seedlings: { name: 'Vegetable transplants / seedlings', lo: 10, hi: 12, hint: '10–12 is acceptable; more light gives faster growth (Purdue HO-303-W).' },
    microgreens: { name: 'Microgreens', lo: 6, hi: 18, hint: 'Range tested by Gerovac et al. (2016), not an established target.' },
    custom: { name: 'Custom target (no crop range)', lo: null, hi: null, hint: 'Enter your own target DLI in the next step.' }
  };
  function cropOf(ctx) { return CROPS[ctx.v.crop] || CROPS.custom; }
  function cropMid(c) { return c.lo === null ? NaN : +((c.lo + c.hi) / 2).toFixed(2); }   // DLI page cropTarget()

  // ---------- Light sources for lux / W/m² equivalents (exactly as light-conversions.js) ----------
  // flux: µmol/m²/s per lux; fw: µmol/J (400–700 nm). Same keys on the DLI page.
  const SOURCES = {
    led: { name: 'White LED (typical)', flux: 0.015, fw: 4.7, hint: 'Sharakshane (2018) headline estimate: 1000 lx ≈ 15 µmol/m²/s (same as the DLI page). W/m² factor is an estimate.' },
    warmled: { name: 'Warm white LED (3000 K, CRI 80)', flux: 0.0145, fw: 4.9, hint: 'Sharakshane (2018) regression: 14.5 µmol/m²/s per 1000 lx. W/m² factor is an estimate.' },
    coolled: { name: 'Cool white LED (5000 K, CRI 80)', flux: 0.0139, fw: 4.6, hint: 'Sharakshane (2018) regression: 13.9 µmol/m²/s per 1000 lx. W/m² factor is an estimate.' },
    sun: { name: 'Sunlight', flux: 0.0185, fw: 4.57, hint: 'Thimijan &amp; Heins (1983): 54 lux per µmol/m²/s, 4.57 µmol/J.' },
    hps: { name: 'High-pressure sodium', flux: 0.0122, fw: 4.98, hint: 'Standard (mogul-base) HPS: 82 lux per µmol/m²/s, 4.98 µmol/J (Thimijan &amp; Heins, 1983).' },
    mh: { name: 'Metal halide', flux: 0.0141, fw: 4.59, hint: '71 lux per µmol/m²/s, 4.59 µmol/J (Thimijan &amp; Heins, 1983).' },
    cwf: { name: 'Cool-white fluorescent', flux: 0.0135, fw: 4.59, hint: '74 lux per µmol/m²/s, 4.59 µmol/J (Thimijan &amp; Heins, 1983).' }
  };

  // ---------- Fixture presets (exactly as light-fixture-layout.js; illustrative, not products) ----------
  const PRESETS = {
    led: { ppf: 1700, watts: 680, fl: 1.1, fw: 1.1, note: 'Illustrative LED bar fixture (2.5 µmol/J), not a specific product. Replace with your datasheet values.' },
    hps: { ppf: 1800, watts: 1060, fl: 0.65, fw: 0.5, note: 'Illustrative 1000 W double-ended HPS with electronic ballast and reflector (≈1.7 µmol/J). Replace with your datasheet values.' },
    t5: { ppf: 230, watts: 230, fl: 1.2, fw: 0.6, note: 'Illustrative 4-lamp T5 HO fluorescent fixture (≈1.0 µmol/J, our estimate). Replace with your datasheet values.' },
    custom: { note: 'Enter PPF, input power and size from your fixture’s datasheet or test report.' }
  };
  const PRESET_NAMES = { led: 'LED bar fixture (illustrative)', hps: 'HPS 1000 W double-ended (illustrative)', t5: 'T5 HO fluorescent, 4 × 54 W (illustrative)', custom: 'Custom (datasheet values)' };
  const PRESET_SHORT = { led: 'LED bar', hps: 'HPS 1000 W DE', t5: 'T5 HO 4-lamp', custom: 'Custom fixture' };

  // ---------- Layout model (copied from light-fixture-layout.js) ----------
  // Fraction of a downward Lambertian point source's flux landing on the rectangle
  // [0,a]×[0,b] whose corner is directly below it at height h (view factor, signed in a and b).
  function cornerF(a, b, h) {
    const sa = Math.sqrt(a * a + h * h), sb = Math.sqrt(b * b + h * h);
    return (a / sa * Math.atan(b / sa) + b / sb * Math.atan(a / sb)) / (2 * Math.PI);
  }
  function rectFraction(px, py, L, W, h) {
    return cornerF(L - px, W - py, h) - cornerF(-px, W - py, h) - cornerF(L - px, -py, h) + cornerF(-px, -py, h);
  }
  // Pick rows × cols ≥ n: few extra fixtures and similar spacing in both directions.
  function chooseGrid(n, L, W) {
    let best = null;
    const maxC = Math.min(n, 200000);
    for (let c = 1; c <= maxC; c++) {
      const r = Math.ceil(n / c);
      const score = 2 * (r * c - n) / n + Math.abs(Math.log((L / c) / (W / r)));
      if (!best || score < best.score - 1e-12) best = { r: r, c: c, score: score };
    }
    return best;
  }
  function smhBand(v) {
    if (!isFinite(v)) return '';
    if (v <= SMH_OK + 1e-9) return 'even (≤ 1.0)';
    if (v <= SMH_MAX + 1e-9) return 'usually acceptable (1.0–1.5)';
    return 'large (> 1.5)';
  }
  // Same steps as compute() in light-fixture-layout.js (target given as PPFD, area L × W, base units).
  function layout(o) {
    const r = { L: o.L, W: o.W, A: o.L * o.W, hours: o.hours, ppf: o.ppf, watts: o.watts, fl: o.fl, fw: o.fw, mh: o.mh, cu: o.cu, mf: o.mf, target: o.target, ok: false };
    if (!(r.A > 0) || !(r.hours > 0) || !(r.target > 0) || !(r.ppf > 0) || !(r.cu > 0) || !(r.mf > 0) || r.cu > 1 || r.mf > 1 || r.hours > 24 + 1e-9) return r;
    r.perFixture = r.ppf * r.cu * r.mf / r.A;            // µmol/m²/s added by one fixture
    r.exact = r.target / r.perFixture;
    r.n = Math.max(1, Math.ceil(r.exact - 1e-9));
    if (r.n > 1e6) { r.tooMany = true; return r; }
    const g = chooseGrid(r.n, r.L, r.W);
    r.rows = g.r; r.cols = g.c; r.m = g.r * g.c;
    r.sx = r.L / g.c; r.sy = r.W / g.r;
    r.ppfd = r.m * r.perFixture;
    r.dli = r.ppfd * r.hours * DLI_K;
    r.eff = r.watts ? r.ppf / r.watts : NaN;
    r.power = r.m * r.watts;
    r.dens = r.power / r.A;
    r.kwhDay = r.power * r.hours / 1000;
    r.kwhMonth = r.kwhDay * DAYS_PER_MONTH;
    r.kwhYear = r.kwhDay * 365;
    r.smh = r.mh ? Math.max(r.sx, r.sy) / r.mh : NaN;
    if (fin(r.fl) && fin(r.fw)) {
      const fitsAsIs = r.fl <= r.sx + 1e-9 && r.fw <= r.sy + 1e-9;
      const fitsRot = r.fw <= r.sx + 1e-9 && r.fl <= r.sy + 1e-9;
      r.rotated = !fitsAsIs && fitsRot;
      r.fx = r.rotated ? r.fw : r.fl; r.fy = r.rotated ? r.fl : r.fw;
      r.overlap = !fitsAsIs && !fitsRot;
      if (r.mh && r.m <= MAX_DRAW) model(r);
    }
    r.ok = true;
    return r;
  }
  // Lambertian sub-sources: direct-capture fraction and central uniformity (light-fixture-layout.js
  // model(), without the heat-map grid, which the guide does not draw).
  function model(r) {
    const h = r.mh, h2 = h * h;
    const ns = r.m * SUB * SUB > 6000 ? 1 : SUB;
    const src = [];
    for (let i = 0; i < r.cols; i++) {
      for (let j = 0; j < r.rows; j++) {
        const cx = r.sx * (i + 0.5), cy = r.sy * (j + 0.5);
        for (let a = 0; a < ns; a++) for (let b = 0; b < ns; b++) {
          src.push(cx + r.fx * ((a + 0.5) / ns - 0.5), cy + r.fy * ((b + 0.5) / ns - 0.5));
        }
      }
    }
    const nSrc = src.length / 2;
    let cap = 0;
    for (let k = 0; k < src.length; k += 2) cap += rectFraction(src[k], src[k + 1], r.L, r.W, h);
    r.capture = cap / nSrc;
    function raw(x, y) {
      let e = 0;
      for (let k = 0; k < src.length; k += 2) {
        const dx = x - src[k], dy = y - src[k + 1];
        const d2 = dx * dx + dy * dy + h2;
        e += 1 / (d2 * d2);
      }
      return e;
    }
    const x0 = r.cols > 1 ? r.sx / 2 : r.L / 2 - r.sx / 4, x1 = r.cols > 1 ? r.L - r.sx / 2 : r.L / 2 + r.sx / 4;
    const y0 = r.rows > 1 ? r.sy / 2 : r.W / 2 - r.sy / 4, y1 = r.rows > 1 ? r.W - r.sy / 2 : r.W / 2 + r.sy / 4;
    const K = 24;
    let cmin = Infinity, csum = 0;
    for (let i = 0; i <= K; i++) for (let j = 0; j <= K; j++) {
      const v = raw(x0 + (x1 - x0) * i / K, y0 + (y1 - y0) * j / K);
      csum += v; if (v < cmin) cmin = v;
    }
    r.unif = cmin / (csum / ((K + 1) * (K + 1)));
  }

  // ---------- Small helpers ----------
  function fin(x) { return typeof x === 'number' && isFinite(x); }
  function R(ctx, id) { return ctx.r[id] || {}; }
  function hrs(ctx) { return ctx.v.hours / 3600; }
  function money(n) { return fin(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'; }
  function dliTxt(d, f) { return fin(d) ? fmt(d, f === undefined ? 1 : f) + ' mol/m²/day' : '–'; }
  function ppfdTxt(x, f) { return fin(x) ? fmt(x, f === undefined ? 0 : f) + ' µmol/m²/s' : '–'; }
  const lenTxt = function (m) { return q('length', m, ['m', 'ft']); };
  const areaTxt = function (a) { return fin(a) ? fmt(a, 1) + ' m² · ' + fmt(a / FT2, 0) + ' ft²' : '–'; };
  function pctCheck(label, lo, hi) { return function (x) { return x < lo || x > hi ? label + ' must be between ' + lo + ' and ' + hi + '%.' : ''; }; }
  function intCheck(label) { return function (x) { return Math.abs(x - Math.round(x)) > 1e-9 ? label + ' must be a whole number.' : ''; }; }
  function text(svg, x, y, t, anchor, cls, extra) {
    const a = { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return G.el(svg, 'text', a, t);
  }
  function statusOf(d, c) {
    if (!fin(d) || c.lo === null) return '';
    return d < c.lo - 1e-9 ? 'below' : d > c.hi + 1e-9 ? 'above' : 'within';
  }
  const STATUS_TEXT = { below: 'below the crop range', within: 'within the crop range', above: 'above the crop range' };
  function presetOverridden(ctx) {
    return ['ppf', 'watts', 'fl', 'fw'].some(function (id) { return ctx.overridden[id]; });
  }

  // Full layout for the design (inputs from steps 2–6).
  function designLayout(ctx) {
    const x = ctx.v, ppfd = R(ctx, 'ppfd');
    return layout({ L: x.len, W: x.wid, hours: hrs(ctx), ppf: x.ppf, watts: x.watts, fl: x.fl, fw: x.fw, mh: x.mh,
      cu: x.cu / 100, mf: x.mf / 100, target: ppfd.ppfd });
  }

  // Pre-filled Light Fixture Layout link (DLI target mode, so the calculator computes the very same PPFD).
  function layoutLink(ctx) {
    const x = ctx.v, d = R(ctx, 'dli');
    const prm = { tmode: 'dli', dli: p(d.suppl, 6), hours: p(hrs(ctx), 6), hours_u: 'h',
      len: p(x.len, 6), len_u: 'm', wid: p(x.wid, 6), wid_u: 'm',
      preset: presetOverridden(ctx) ? 'custom' : x.preset,
      ppf: p(x.ppf, 6), watts: p(x.watts, 6), watts_u: 'W', fl: p(x.fl, 6), fl_u: 'm', fw: p(x.fw, 6), fw_u: 'm',
      mh: p(x.mh, 6), mh_u: 'm', cu: p(x.cu, 6), mf: p(x.mf, 6), price: fin(x.price) ? p(x.price, 6) : '', sp_u: 'm' };
    return { slug: 'light-fixture-layout', label: 'Light Fixture Layout', params: prm };
  }
  function dliLink(ctx) {
    const x = ctx.v, d = R(ctx, 'dli');
    return { slug: 'daily-light-integral', label: 'Daily Light Integral', params: {
      mode: 'ppfd', crop: x.setting === 'greenhouse' ? 'custom' : x.crop, pattern: 'const', src: x.luxSrc || 'led',
      target: p(d.suppl, 6), hours: fin(x.hours) ? p(hrs(ctx), 6) : '', hours_u: 'h', out_u: 'umol' } };
  }

  // To-scale plan of the fixture grid (same drawing rules as the calculator, without the heat map).
  function drawPlan(svg, r, opts) {
    const VW = 480, PAD_L = 30, PAD_R = 14, TOP = 34, MAX_PH = (opts && opts.maxH) || 260;
    if (!r || !r.ok || !r.m) { svg.setAttribute('viewBox', '0 0 480 140'); text(svg, 240, 70, 'Enter the inputs to draw the layout', 'middle', 'dim-text'); return; }
    const rot = r.W > r.L;
    const v = rot
      ? { L: r.W, W: r.L, sx: r.sy, sy: r.sx, cols: r.rows, rows: r.cols, fx: r.fy, fy: r.fx, nL: 'Width', nW: 'Length' }
      : { L: r.L, W: r.W, sx: r.sx, sy: r.sy, cols: r.cols, rows: r.rows, fx: r.fx, fy: r.fy, nL: 'Length', nW: 'Width' };
    const availW = VW - PAD_L - PAD_R;
    const s = Math.min(availW / v.L, MAX_PH / v.W);
    const pw = v.L * s, ph = v.W * s;
    const x0 = PAD_L + (availW - pw) / 2, y0 = TOP;
    const VH = y0 + ph + (r.m <= MAX_DRAW ? 44 : 14);
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
    const share = opts && fin(opts.canopy) ? Math.min(1, opts.canopy) : 1;
    G.el(svg, 'rect', { x: x0, y: y0, width: pw, height: ph, class: 'g-track' });
    if (share < 0.999) {
      // benches drawn as strips along the long side, total width = canopy share
      const nb = Math.max(1, Math.min(6, Math.round(v.W / 1.5)));
      const slot = ph / nb, bw = slot * share;
      for (let i = 0; i < nb; i++) G.el(svg, 'rect', { class: 'g-media', x: x0, y: y0 + i * slot + (slot - bw) / 2, width: pw, height: bw });
    } else {
      G.el(svg, 'rect', { class: 'g-media', x: x0, y: y0, width: pw, height: ph });
    }
    if (r.m <= MAX_DRAW) {
      const fx = (v.fx || 0) * s, fy = (v.fy || 0) * s;
      const dot = Math.max(1.2, Math.min(3, Math.min(v.sx, v.sy) * s / 8));
      for (let i = 0; i < v.cols; i++) for (let j = 0; j < v.rows; j++) {
        const cx = x0 + v.sx * (i + 0.5) * s, cy = y0 + v.sy * (j + 0.5) * s;
        if (fx >= 2 && fy >= 2) G.el(svg, 'rect', { class: 'fixture', x: (cx - fx / 2).toFixed(2), y: (cy - fy / 2).toFixed(2), width: fx.toFixed(2), height: fy.toFixed(2), rx: 1.5 });
        G.el(svg, 'circle', { class: 'fixture-dot', cx: cx.toFixed(2), cy: cy.toFixed(2), r: dot });
      }
    }
    G.el(svg, 'rect', { class: 'room', x: x0, y: y0, width: pw, height: ph });
    const L = function (m) { return fmt(m, 2) + ' m'; };
    G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + (y0 - 12) + 'H' + (x0 + pw) + 'M' + x0 + ',' + (y0 - 17) + 'v10M' + (x0 + pw) + ',' + (y0 - 17) + 'v10' });
    const sideFits = ph >= 110;
    text(svg, x0 + pw / 2, y0 - 17, v.nL + ' ' + L(v.L) + (sideFits ? '' : ' × ' + v.nW.toLowerCase() + ' ' + L(v.W)));
    const lx = x0 - 12;
    G.el(svg, 'path', { class: 'dim', d: 'M' + lx + ',' + y0 + 'V' + (y0 + ph) + 'M' + (lx - 5) + ',' + y0 + 'h10M' + (lx - 5) + ',' + (y0 + ph) + 'h10' });
    if (sideFits) text(svg, lx - 5, y0 + ph / 2, v.nW + ' ' + L(v.W), 'middle', 'dim-text', { transform: 'rotate(-90 ' + (lx - 5) + ' ' + (y0 + ph / 2) + ')' });
    if (r.m <= MAX_DRAW) {
      const yb = y0 + ph + 14;
      const c1 = x0 + v.sx * 0.5 * s;
      G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + yb + 'H' + c1 + 'M' + c1 + ',' + (yb - 5) + 'v10' });
      if (v.cols > 1) {
        const c2 = x0 + v.sx * 1.5 * s;
        G.el(svg, 'path', { class: 'dim', d: 'M' + c1 + ',' + yb + 'H' + c2 + 'M' + c2 + ',' + (yb - 5) + 'v10' });
        text(svg, Math.min(c2 + 6, VW - 150), yb + 18, 'spacing ' + L(v.sx), 'start', 'g-accent-text');
      }
      if (c1 - x0 > 60 || v.cols === 1) text(svg, (x0 + c1) / 2, yb + 18, L(v.sx / 2), v.cols === 1 ? 'start' : 'middle', 'dim-text');
    }
  }

  // ---------- Sources (citations reused from the calculator pages) ----------
  const SRC = {
    stallknecht2025: 'Stallknecht, E. (2025). <em>Calculating and Using Daily Light Integral (DLI): An Introductory Guide</em>. Virginia Cooperative Extension, Virginia Tech, SPES-720NP. <a href="https://www.pubs.ext.vt.edu/SPES/spes-720/spes-720.html" rel="noopener" target="_blank">pubs.ext.vt.edu</a>',
    ho303: 'Maynard, E., O\'Donnell, M., Kong, N. N. &amp; Li, Y. (2019). <em>Seasonal Daily Light Integrals Across Indiana</em>. Purdue Extension HO-303-W. <a href="https://edustore.purdue.edu/ho-303-w.html" rel="noopener" target="_blank">edustore.purdue.edu</a>',
    gerovac2016: 'Gerovac, J. R., Craver, J. K., Boldt, J. K. &amp; Lopez, R. G. (2016). Light intensity and quality from sole-source light-emitting diodes impact growth, morphology, and nutrient content of <em>Brassica</em> microgreens. <em>HortScience</em>, 51(5), 497–503.',
    faust2018: 'Faust, J. E. &amp; Logan, J. (2018). Daily light integral: A research review and high-resolution maps of the United States. <em>HortScience</em>, 53(9), 1250–1257. <a href="https://doi.org/10.21273/HORTSCI13144-18" rel="noopener" target="_blank">doi:10.21273/HORTSCI13144-18</a>',
    torres2010: 'Torres, A. P. &amp; Lopez, R. G. (2010). <em>Commercial Greenhouse Production: Measuring Daily Light Integral in a Greenhouse</em>. Purdue Extension HO-238-W. <a href="https://www.extension.purdue.edu/extmedia/ho/ho-238-w.pdf" rel="noopener" target="_blank">extension.purdue.edu</a>',
    runkledli: 'Runkle, E. “DLI ‘requirements’.” Michigan State University Floriculture (reprinted from <em>Greenhouse Product News</em>). <a href="https://www.canr.msu.edu/floriculture/uploads/files/dli%20requirements.pdf" rel="noopener" target="_blank">canr.msu.edu</a>',
    thimijan1983: 'Thimijan, R. W. &amp; Heins, R. D. (1983). Photometric, radiometric, and quantum light units of measure: A review of procedures for interconversion. <em>HortScience</em>, 18(6), 818–822. <a href="https://doi.org/10.21273/HORTSCI.18.6.818" rel="noopener" target="_blank">doi:10.21273/HORTSCI.18.6.818</a>',
    apogee: 'Apogee Instruments. “PPFD to Lux Conversion.” <a href="https://www.apogeeinstruments.com/conversion-ppfd-to-lux/" rel="noopener" target="_blank">apogeeinstruments.com</a>',
    sharakshane2018: 'Sharakshane, A. (2018). An easy estimate of the PFDD for a plant illuminated with white LEDs: 1000 lx = 15 µmol/s/m². <em>bioRxiv</em> preprint 289280. <a href="https://doi.org/10.1101/289280" rel="noopener" target="_blank">doi:10.1101/289280</a>',
    nist811: 'Thompson, A. &amp; Taylor, B. N. (2008). <em>Guide for the Use of the International System of Units (SI)</em>. NIST Special Publication 811, Appendix B (conversion factors, including the footcandle and the ton of refrigeration, 12 000 Btu/h). <a href="https://www.nist.gov/pml/special-publication-811" rel="noopener" target="_blank">nist.gov</a>',
    dilaura2011: 'DiLaura, D. L., Houser, K. W., Mistrick, R. G. &amp; Steffy, G. R. (2011). <em>The Lighting Handbook: Reference and Application</em>, 10th ed. Illuminating Engineering Society of North America, New York. (Lumen method, coefficient of utilization and light loss factor.)',
    asabe640: 'ANSI/ASABE S640 (2017, reaffirmed 2022). <em>Quantities and Units of Electromagnetic Radiation for Plants (Photosynthetic Organisms)</em>. American Society of Agricultural and Biological Engineers, St. Joseph, MI.',
    kusuma2020: 'Kusuma, P., Pattison, P. M. &amp; Bugbee, B. (2020). From physics to fixtures to food: current and potential LED efficacy. <em>Horticulture Research</em>, 7, 56. <a href="https://doi.org/10.1038/s41438-020-0283-7" rel="noopener" target="_blank">doi:10.1038/s41438-020-0283-7</a>',
    nelson2014: 'Nelson, J. A. &amp; Bugbee, B. (2014). Economic analysis of greenhouse lighting: light emitting diodes vs. high intensity discharge fixtures. <em>PLoS ONE</em>, 9(6), e99010. <a href="https://doi.org/10.1371/journal.pone.0099010" rel="noopener" target="_blank">doi:10.1371/journal.pone.0099010</a>',
    runklebugbee: 'Runkle, E. &amp; Bugbee, B. “Lighting efficacy.” Michigan State University Floriculture (reprinted from <em>Greenhouse Product News</em>). <a href="https://www.canr.msu.edu/floriculture/uploads/files/lighting-efficacy.pdf" rel="noopener" target="_blank">canr.msu.edu</a>',
    runkle2018: 'Runkle, E. (2018). “Maximizing supplemental lighting.” Michigan State University Floriculture (reprinted from <em>Greenhouse Product News</em>, January 2018). <a href="https://www.canr.msu.edu/floriculture/uploads/files/maximizesupplementallighting.pdf" rel="noopener" target="_blank">canr.msu.edu</a>',
    both2017: 'Both, A. J., Bugbee, B., Kubota, C., Lopez, R. G., Mitchell, C., Runkle, E. S. &amp; Wallace, C. (2017). Proposed product label for electric lamps used in the plant sciences. <em>HortTechnology</em>, 27(4), 544–549.',
    ashrae2013: 'ASHRAE (2013). <em>ASHRAE Handbook—Fundamentals</em>, Chapter 18: Nonresidential Cooling and Heating Load Calculations (heat gain from lighting). Atlanta, GA: ASHRAE.',
    kay2020: 'Kay, R. D., Edwards, W. M. &amp; Duffy, P. A. (2020). <em>Farm Management</em> (9th ed.). New York: McGraw-Hill Education. Chapters on the time value of money and investment analysis (present value, NPV, IRR, payback, annuity factors).'
  };

  // =====================================================================================
  // Steps
  // =====================================================================================

  // ---------- 1. Crop and setting ----------
  const stepCrop = {
    id: 'crop', title: 'Crop and growing setting', short: 'Crop',
    intro: '<p>How much light to provide starts with the crop. Plants respond to the total light they get in a day, the <strong>daily light integral (DLI)</strong>, in moles of photons per square metre per day. Pick the crop group and whether the lights are the only light source (an indoor farm, container or grow room) or top up sunlight in a greenhouse.</p>',
    fields: [
      { id: 'crop', label: 'Crop', type: 'select', def: 'lettuce',
        options: Object.keys(CROPS).map(function (k) { return { value: k, label: CROPS[k].name }; }),
        hint: function (ctx) { return cropOf(ctx).hint; } },
      { id: 'setting', label: 'Setting', type: 'select', def: 'indoor',
        options: [{ value: 'indoor', label: 'Indoor, sole-source lighting (no sunlight)' }, { value: 'greenhouse', label: 'Greenhouse, supplemental lighting' }],
        hint: function (ctx) {
          return ctx.v.setting === 'greenhouse'
            ? 'The lights only make up the shortfall between the crop target and the daylight that gets through the greenhouse.'
            : 'The lights must deliver the whole daily light integral.';
        } }
    ],
    compute: function (ctx) { const c = cropOf(ctx); return { crop: c, mid: cropMid(c) }; },
    results: function (ctx, r) {
      const c = r.crop;
      return [
        { label: 'Target DLI range (rule of thumb)', value: c.lo !== null ? c.lo + '–' + c.hi + ' mol/m²/day' : 'none (custom target)', main: true },
        { label: 'Crop', value: c.name },
        { label: 'Range midpoint (suggested target)', value: fin(r.mid) ? dliTxt(r.mid, 2) : '–' },
        { label: 'Setting', value: ctx.v.setting === 'greenhouse' ? 'Greenhouse, supplemental light' : 'Indoor, sole-source light' }
      ];
    },
    tips: [
      'These DLI ranges are <strong>rules of thumb</strong>, the same ones the Daily Light Integral calculator uses. The best level also depends on cultivar, temperature, CO₂ and how fast you want the crop to grow (Runkle; Stallknecht 2025).',
      'Leafy greens need the least light of the food crops; fruiting crops such as tomato, pepper and cucumber need the most.',
      'Above a crop’s saturation level, extra light gives little benefit and costs electricity.'
    ],
    viz: {
      viewBox: '0 0 480 250', label: 'Rule-of-thumb DLI range of each crop group, with the chosen crop highlighted',
      draw: function (svg, ctx) {
        const keys = Object.keys(CROPS).filter(function (k) { return CROPS[k].lo !== null; });
        const x0 = 196, x1 = 466, max = 35;
        const X = function (d) { return x0 + (x1 - x0) * d / max; };
        text(svg, 8, 18, 'DLI, mol/m²/day (rule of thumb)', 'start', 'dim-text');
        keys.forEach(function (k, i) {
          const c = CROPS[k], y = 34 + i * 36, on = k === ctx.v.crop;
          text(svg, x0 - 8, y + 14, c.name.replace('Vegetable transplants / seedlings', 'Transplants, seedlings').replace(' & culinary herbs', ' & herbs').replace(' & fruiting crops', ' & fruiting').replace(' & leafy greens', ' & greens'), 'end', on ? 'g-strong' : 'g-label');
          G.el(svg, 'rect', { class: 'g-track', x: x0, y: y, width: x1 - x0, height: 18, rx: 4 });
          G.el(svg, 'rect', { class: on ? 'g-bar' : 'g-bar-soft', x: X(c.lo), y: y, width: X(c.hi) - X(c.lo), height: 18, rx: 4 });
          text(svg, X(c.hi) + 5, y + 14, c.lo + '–' + c.hi, 'start', on ? 'g-accent-text' : 'dim-text');
        });
        const yA = 34 + keys.length * 36 + 4;
        [0, 10, 20, 30].forEach(function (t) { text(svg, X(t), yA + 12, String(t), 'middle', 'dim-text'); });
      },
      caption: function (ctx, r) { return r.crop.lo !== null ? r.crop.name + ': ' + r.crop.lo + '–' + r.crop.hi + ' mol/m²/day' : 'Custom crop: you set the target in the next step'; }
    },
    sources: ['stallknecht2025', 'ho303', 'gerovac2016', 'runkledli'],
    links: function (ctx) {
      return [{ slug: 'daily-light-integral', label: 'Daily Light Integral', params: { mode: 'ppfd', crop: ctx.v.crop, pattern: 'const' } }];
    }
  };

  // ---------- 2. Daily light target ----------
  const stepDli = {
    id: 'dli', title: 'Daily light target', short: 'DLI',
    intro: '<p>Set the daily light integral the crop should get. Indoors the lights supply all of it. In a greenhouse, part of it comes from the sun: the daylight outside, cut down by the glazing, frame and anything hanging overhead. The lights supply the rest.</p>',
    fields: [
      { id: 'target', label: 'Target daily light integral', suffix: 'mol/m²/day',
        def: function (ctx) { return R(ctx, 'crop').mid; },
        check: function (d) { return d > 65 ? 'A DLI above about 65 mol/m²/day is more than the sun gives on a clear summer day. Check the value.' : ''; },
        hint: function (ctx) { const c = cropOf(ctx); return c.lo !== null ? 'Suggested: the middle of the ' + c.lo + '–' + c.hi + ' mol/m²/day range. Aim for the low end to save electricity, the high end for faster growth.' : 'Enter your own target.'; } },
      { id: 'natDli', label: 'Outdoor (natural) DLI', suffix: 'mol/m²/day', def: 10, allowZero: true, half: true,
        show: function (ctx) { return ctx.v.setting === 'greenhouse'; },
        hint: 'Example value. Read your location and the darkest month you will grow in from the monthly DLI maps of Faust &amp; Logan (2018), or log it with a PAR sensor.' },
      { id: 'trans', label: 'Greenhouse light transmission', suffix: '%', def: 50, half: true,
        show: function (ctx) { return ctx.v.setting === 'greenhouse'; },
        check: pctCheck('Greenhouse light transmission', 1, 100),
        hint: 'Your estimate: share of outdoor light reaching the crop. Purdue HO-238-W says glazing, structure and hanging baskets can cut DLI by 40–70% (30–60% transmission). Measure inside and outside with a PAR meter if you can.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, gh = x.setting === 'greenhouse';
      const r = { gh: gh, target: x.target };
      r.inside = gh ? x.natDli * x.trans / 100 : 0;
      r.supplRaw = x.target - r.inside;
      r.none = fin(r.supplRaw) && r.supplRaw <= 1e-9;
      r.suppl = r.none ? NaN : r.supplRaw;
      r.share = r.suppl / x.target;
      r.status = statusOf(x.target, cropOf(ctx));
      return r;
    },
    notices: function (ctx, r) {
      return [r.none ? 'The daylight inside (' + dliTxt(r.inside) + ') already meets the target, so no supplemental light is needed in this month. Plan for the darkest month you will grow in.' : '',
        r.status === 'below' || r.status === 'above' ? 'The target is ' + STATUS_TEXT[r.status] + ' (' + cropOf(ctx).lo + '–' + cropOf(ctx).hi + ' mol/m²/day).' : ''];
    },
    results: function (ctx, r) {
      const out = [{ label: r.gh ? 'Supplemental DLI the lights must add' : 'DLI the lights must deliver', value: dliTxt(r.suppl, 2), main: true },
        { label: 'Target DLI', value: dliTxt(r.target, 2) + (r.status ? ' · ' + STATUS_TEXT[r.status] : '') }];
      if (r.gh) {
        out.push({ label: 'Daylight reaching the crop', value: fin(r.inside) ? dliTxt(r.inside, 2) + ' (' + fmt(ctx.v.natDli) + ' × ' + fmt(ctx.v.trans) + '%)' : '–' });
        out.push({ label: 'Share of the target from the lights', value: fin(r.share) ? fmt(r.share * 100, 0) + '%' : '–' });
      }
      return out;
    },
    tips: function (ctx) {
      const sup = R(ctx, 'dli').suppl;
      const t = ['The lights can be dimmer, or on for fewer hours, when you aim for the low end of the crop range.' + (fin(sup) ? ' Electricity scales with the DLI the lights deliver: every 1 mol/m²/day less saves about ' + fmt(100 / sup, 0) + '% here.' : '')];
      if (ctx.v.setting === 'greenhouse') {
        t.push('Size supplemental lighting for the <strong>darkest month</strong> you grow in. In brighter months the lights run for fewer hours or not at all.');
        t.push('Faust &amp; Logan (2018) mapped monthly outdoor DLI for the USA. Greenhouse DLI is lower: glazing, structure and hanging baskets can remove 40–70% of it (Torres &amp; Lopez, Purdue HO-238-W).');
      } else {
        t.push('Indoors the lights supply the whole DLI, so lighting is usually the biggest running cost of the farm.');
      }
      return t;
    },
    viz: {
      viewBox: '0 0 480 210', label: 'Bar showing daylight and electric light adding up to the target DLI, against the crop range',
      draw: function (svg, ctx, r) {
        const c = cropOf(ctx);
        if (!fin(r.target)) return;
        const max = Math.ceil(Math.max(35, (c.hi || 0) * 1.2, r.target * 1.2, (r.inside || 0) * 1.2) / 10) * 10;
        const x0 = 20, x1 = 460;
        const X = function (d) { return x0 + (x1 - x0) * Math.min(d, max) / max; };
        const y = 70, h = 40;
        text(svg, x0, 22, 'Daily light integral, mol/m²/day', 'start', 'dim-text');
        G.el(svg, 'rect', { class: 'g-track', x: x0, y: y, width: x1 - x0, height: h, rx: 6 });
        if (c.lo !== null) {
          G.el(svg, 'rect', { class: 'g-bar-soft', x: X(c.lo), y: y - 14, width: X(c.hi) - X(c.lo), height: 8, rx: 3 });
          text(svg, (X(c.lo) + X(c.hi)) / 2, y - 22, 'crop range ' + c.lo + '–' + c.hi, 'middle', 'g-accent-text');
        }
        const sun = Math.min(r.inside || 0, r.target);
        if (sun > 0) G.el(svg, 'rect', { class: 'g-bar-warn', x: X(0), y: y, width: X(sun) - X(0), height: h, rx: 4 });
        if (fin(r.suppl)) G.el(svg, 'rect', { class: 'g-bar', x: X(sun), y: y, width: X(r.target) - X(sun), height: h, rx: 4 });
        G.el(svg, 'line', { class: 'g-line', x1: X(r.target), y1: y - 6, x2: X(r.target), y2: y + h + 6 });
        text(svg, X(r.target), y + h + 22, 'target ' + fmt(r.target, 1), 'middle', 'g-strong');
        let ly = 172;
        G.el(svg, 'rect', { class: 'g-bar', x: x0, y: ly - 11, width: 14, height: 14, rx: 2 });
        text(svg, x0 + 20, ly, 'Electric light ' + (fin(r.suppl) ? fmt(r.suppl, 1) : '0'), 'start', 'g-label');
        if (r.gh) {
          G.el(svg, 'rect', { class: 'g-bar-warn', x: 250, y: ly - 11, width: 14, height: 14, rx: 2 });
          text(svg, 270, ly, 'Daylight inside ' + fmt(r.inside, 1), 'start', 'g-label');
        }
        [0, Math.round(max / 2), Math.round(max)].forEach(function (t, i) { text(svg, X(t), 200, String(t), i === 0 ? 'start' : i === 2 ? 'end' : 'middle', 'dim-text'); });
      },
      caption: function (ctx, r) { return r.gh ? 'Daylight inside plus electric light = target DLI' : 'Indoors the lights supply the whole target'; }
    },
    sources: ['faust2018', 'torres2010', 'stallknecht2025'],
    links: function (ctx) { return [dliLink(ctx)]; }
  };

  // ---------- 3. Photoperiod and PPFD ----------
  const stepPpfd = {
    id: 'ppfd', title: 'Photoperiod and light intensity', short: 'PPFD',
    intro: '<p>The same daily light can come from a bright light for a few hours or a dimmer light for longer. Choose how many hours the lights are on; the guide works out the light intensity at the canopy (<strong>PPFD</strong>, in µmol/m²/s) the lights must give while they are on. Longer hours mean a lower PPFD, and so fewer or smaller fixtures for the same DLI.</p>',
    fields: [
      { id: 'hours', label: 'Hours of light per day', group: 'time', unit: 'h', def: 16 * 3600,
        check: function (s) { return s > 24 * 3600 + 1e-6 ? 'A day has only 24 hours. Check the photoperiod.' : ''; },
        hint: function (ctx) {
          const c = ctx.v.crop;
          const base = 'Suggested 16 h, the photoperiod the DLI calculator uses by default (rule of thumb). ';
          if (c === 'fruiting') return base + 'Tomatoes can be injured by continuous light, so growers keep a dark period (rule of thumb). Short-day or long-day crops may need a specific photoperiod whatever the DLI.';
          if (ctx.v.setting === 'greenhouse') return base + 'In a greenhouse this is how long the supplemental lights run, often extending the natural day.';
          return base + 'Longer hours at a lower PPFD reach the same DLI with fewer fixtures.';
        } },
      { id: 'luxSrc', label: 'Light source (for the lux equivalent)', type: 'select', def: 'led',
        options: Object.keys(SOURCES).map(function (k) { return { value: k, label: SOURCES[k].name }; }),
        hint: function (ctx) { return (SOURCES[ctx.v.luxSrc] || SOURCES.led).hint + ' Pick the lamp type you expect to use; it only changes the lux figure.'; } }
    ],
    compute: function (ctx) {
      const d = R(ctx, 'dli'), h = hrs(ctx), s = SOURCES[ctx.v.luxSrc] || SOURCES.led;
      const r = { h: h, src: s };
      r.ppfd = d.suppl / (h * DLI_K);                       // = DLI × 1e6 ÷ (h × 3600), as both calculators
      r.lux = r.ppfd / s.flux;
      r.fc = r.lux / LUX_PER_FC;
      r.wm2 = r.ppfd / s.fw;
      r.alt = [12, 18, 20].filter(function (a) { return Math.abs(a - h) > 0.01; }).slice(0, 2).map(function (a) { return { h: a, ppfd: d.suppl / (a * DLI_K) }; });
      return r;
    },
    notices: function (ctx, r) {
      return [fin(r.ppfd) && r.ppfd > 2500 ? 'That is brighter than full midday summer sun (about 2,000 µmol/m²/s). Use more hours of light or a lower target.' : '',
        R(ctx, 'dli').none ? 'No supplemental light is needed (see the previous step).' : ''];
    },
    results: function (ctx, r) {
      const gh = ctx.v.setting === 'greenhouse';
      const out = [{ label: (gh ? 'Supplemental PPFD' : 'PPFD') + ' needed at the canopy', value: ppfdTxt(r.ppfd, 1), main: true },
        { label: 'Lux equivalent (' + r.src.name + ')', value: fin(r.lux) ? fmt(r.lux, 0) + ' lx · ' + fmt(r.fc, 0) + ' fc' : '–' },
        { label: 'PAR irradiance', value: fin(r.wm2) ? fmt(r.wm2, 1) + ' W/m² (400–700 nm)' : '–' },
        { label: 'Light on', value: fin(r.h) ? fmt(r.h, 2) + ' h/day' : '–' }];
      r.alt.forEach(function (a) { out.push({ label: 'Same DLI over ' + a.h + ' h', value: ppfdTxt(a.ppfd, 0) }); });
      return out;
    },
    tips: [
      'PPFD = DLI × 1,000,000 ÷ (hours × 3600): the same formula as the Daily Light Integral and Light Fixture Layout calculators.',
      'Lux is weighted for the human eye, so lux-to-PPFD factors are <strong>approximate</strong> and depend on the lamp spectrum. Do not use a lux meter under red/blue (“blurple”) LEDs; use a quantum (PAR) meter.',
      'Running the lights longer at lower intensity often saves fixtures (capital cost), while the energy for the same DLI stays about the same.'
    ],
    viz: {
      viewBox: '0 0 480 250', label: 'Lights-on period over 24 hours at the PPFD needed',
      draw: function (svg, ctx, r) {
        const x0 = 52, x1 = 440, yT = 30, yB = 190;
        if (!fin(r.ppfd) || !(r.h > 0)) return;
        const yMax = Math.max(100, Math.ceil(r.ppfd * 1.3 / 100) * 100);
        const X = function (h) { return x0 + (x1 - x0) * h / 24; };
        const Y = function (v) { return yB - (yB - yT) * Math.min(v, yMax) / yMax; };
        text(svg, x0, 18, 'PPFD µmol/m²/s', 'start', 'dim-text');
        [0, yMax / 2, yMax].forEach(function (v) { text(svg, x0 - 6, Y(v) + 4, fmt(v, 0), 'end', 'dim-text'); });
        const st = 12 - r.h / 2, en = 12 + r.h / 2;
        G.el(svg, 'rect', { class: 'g-bar-soft', x: X(st), y: Y(r.ppfd), width: X(en) - X(st), height: yB - Y(r.ppfd) });
        text(svg, X(12), (Y(r.ppfd) + yB) / 2 - 2, 'DLI ' + fmt(R(ctx, 'dli').suppl, 1), 'middle', 'g-strong');
        text(svg, X(12), (Y(r.ppfd) + yB) / 2 + 16, 'mol/m²/day', 'middle', 'g-label');
        text(svg, X(en) + 6 > x1 - 40 ? X(st) - 6 : X(en) + 6, Y(r.ppfd) + 4, fmt(r.ppfd, 0), X(en) + 6 > x1 - 40 ? 'end' : 'start', 'g-accent-text');
        G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + yT + ' L' + x0 + ',' + yB + ' L' + x1 + ',' + yB });
        for (let h = 0; h <= 24; h += 6) text(svg, X(h), yB + 18, (h < 10 ? '0' : '') + h + ':00', 'middle', 'dim-text');
        text(svg, X(12), yB + 44, fmt(r.h, 1) + ' h lights on', 'middle', 'g-label');
      },
      caption: function (ctx, r) { return fin(r.ppfd) ? fmt(r.ppfd, 0) + ' µmol/m²/s for ' + fmt(r.h, 1) + ' h ≈ ' + fmt(r.lux, 0) + ' lx (' + r.src.name + ')' : 'Enter the inputs'; }
    },
    sources: ['thimijan1983', 'apogee', 'sharakshane2018', 'nist811'],
    links: function (ctx, r) {
      return [dliLink(ctx),
        { slug: 'light-conversions', label: 'Light Conversions', params: { src: ctx.v.luxSrc, light: p(r.ppfd, 6), light_u: 'umol', hours: fin(r.h) ? p(r.h, 6) : '', hours_u: 'h' } }];
    }
  };

  // ---------- 4. Grow area ----------
  const stepArea = {
    id: 'area', title: 'Grow area', short: 'Area',
    intro: '<p>Enter the area the fixtures light: the room, the rack level or the greenhouse bay. Fixtures are spread evenly over this whole area. If benches, rafts or channels cover only part of it, the rest (aisles, walkways) also gets light, which lowers the share of photons that reach plants.</p>',
    fields: [
      { id: 'len', half: true, label: 'Length', group: 'length', unit: 'm', def: 7 },
      { id: 'wid', half: true, label: 'Width', group: 'length', unit: 'm', def: 4 },
      { id: 'canopy', label: 'Canopy share of the area (bench coverage)', suffix: '%',
        def: function (ctx) { return ctx.v.setting === 'greenhouse' ? 80 : 100; },
        check: pctCheck('Canopy share', 1, 100),
        hint: 'Share of the floor covered by plants (rafts, NFT channels, benches). 100% for wall-to-wall rafts or a tent. The greenhouse default of 80% is only an example for benches with aisles; measure yours.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, pp = R(ctx, 'ppfd');
      const r = { A: x.len * x.wid };
      r.canopyA = r.A * x.canopy / 100;
      r.photons = pp.ppfd * r.A;                  // µmol/s that must reach the canopy plane
      return r;
    },
    results: function (ctx, r) {
      return [
        { label: 'Lit area', value: areaTxt(r.A), main: true },
        { label: 'Plant canopy', value: areaTxt(r.canopyA) },
        { label: 'Aisles and gaps', value: areaTxt(r.A - r.canopyA) },
        { label: 'Photons needed at canopy level', value: fin(r.photons) ? fmt(r.photons, 0) + ' µmol/s' : '–' }
      ];
    },
    tips: [
      'Photons needed = PPFD × area. This is what the fixtures must deliver to the canopy plane after all losses.',
      'Light falling on aisles is lost. Nelson &amp; Bugbee (2014) show how much the share of photons captured by the canopy affects lighting cost.',
      'Rule of thumb (Light Fixture Layout calculator): about 80–90% of photons reach the canopy in a walled room with reflective walls and plants covering the floor, 60–80% over open benches or racks with aisles. The next steps use this.'
    ],
    viz: {
      viewBox: '0 0 480 300', label: 'Plan of the grow area with the plant canopy shaded',
      draw: function (svg, ctx, r) {
        const x = ctx.v;
        if (!fin(r.A)) return;
        const rot = x.wid > x.len, Lm = rot ? x.wid : x.len, Wm = rot ? x.len : x.wid;
        const s = Math.min(436 / Lm, 220 / Wm), pw = Lm * s, ph = Wm * s, x0 = 30 + (436 - pw) / 2, y0 = 34;
        svg.setAttribute('viewBox', '0 0 480 ' + (y0 + ph + 34));
        G.el(svg, 'rect', { class: 'g-track', x: x0, y: y0, width: pw, height: ph });
        const share = x.canopy / 100;
        if (share < 0.999) {
          const nb = Math.max(1, Math.min(6, Math.round(Wm / 1.5))), slot = ph / nb, bw = slot * share;
          for (let i = 0; i < nb; i++) G.el(svg, 'rect', { class: 'g-media', x: x0, y: y0 + i * slot + (slot - bw) / 2, width: pw, height: bw });
        } else G.el(svg, 'rect', { class: 'g-media', x: x0, y: y0, width: pw, height: ph });
        G.el(svg, 'rect', { class: 'room', x: x0, y: y0, width: pw, height: ph });
        text(svg, x0 + pw / 2, y0 - 12, (rot ? 'Width ' : 'Length ') + fmt(Lm, 2) + ' m', 'middle', 'dim-text');
        text(svg, x0 + pw / 2, y0 + ph + 22, (rot ? 'Length ' : 'Width ') + fmt(Wm, 2) + ' m · canopy ' + fmt(x.canopy, 0) + '%', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.A) ? areaTxt(r.A) + ' lit, ' + fmt(ctx.v.canopy, 0) + '% covered by plants (green)' : 'Enter the inputs'; }
    },
    sources: ['nelson2014', 'dilaura2011'],
    links: function (ctx) { return [layoutLink(ctx)]; }
  };

  // ---------- 5. Fixtures ----------
  const stepFixture = {
    id: 'fixture', title: 'Fixture choice', short: 'Fixture',
    intro: '<p>Choose the fixture. What matters for the layout is its <strong>photosynthetic photon flux (PPF)</strong>, the photons per second it emits in the 400–700 nm band, its electrical input power and its size. PPF ÷ watts is the <strong>photon efficacy</strong> in µmol/J: the higher it is, the less electricity (and heat) per mole of light.</p>',
    fields: [
      { id: 'preset', label: 'Fixture', type: 'select', def: 'led',
        options: Object.keys(PRESETS).map(function (k) { return { value: k, label: PRESET_NAMES[k] }; }),
        hint: function (ctx) { return PRESETS[ctx.v.preset].note; } },
      { id: 'ppf', label: 'Fixture photon output (PPF)', suffix: 'µmol/s', def: function (ctx) { const pr = PRESETS[ctx.v.preset]; return pr.ppf || NaN; },
        hint: 'From the datasheet or, better, an independent integrating-sphere test report (400–700 nm; far-red not included).' },
      { id: 'watts', label: 'Fixture input power', group: 'power', unit: 'W', def: function (ctx) { const pr = PRESETS[ctx.v.preset]; return pr.watts || NaN; },
        hint: 'Electrical power drawn from the wall, including the driver or ballast.' },
      { id: 'fl', half: true, label: 'Fixture length', group: 'length', unit: 'm', def: function (ctx) { const pr = PRESETS[ctx.v.preset]; return pr.fl || NaN; } },
      { id: 'fw', half: true, label: 'Fixture width', group: 'length', unit: 'm', def: function (ctx) { const pr = PRESETS[ctx.v.preset]; return pr.fw || NaN; } }
    ],
    compute: function (ctx) {
      const x = ctx.v, a = R(ctx, 'area');
      const r = { eff: x.ppf / x.watts };
      r.raw = a.photons / x.ppf;              // fixtures if every photon reached the canopy
      return r;
    },
    notices: function (ctx, r) {
      return [r.eff > 4.2 ? 'An efficacy above about 4 µmol/J is beyond what current LED fixtures can reach (Kusuma et al. 2020). Check the PPF and wattage.' : ''];
    },
    results: function (ctx, r) {
      const e = r.eff;
      const band = !fin(e) ? '' : e < 1.3 ? 'fluorescent-class' : e < 2.0 ? 'HPS-class (≈1.7 for the best double-ended HPS)' : e <= 3.4 ? 'LED-class (many new LED fixtures exceed 2.0)' : 'above the ≈3.4 limit calculated for today’s white + red LED fixtures';
      return [
        { label: 'Photon efficacy', value: fin(e) ? fmt(e, 2) + ' µmol/J' : '–', main: true },
        { label: 'Efficacy class', value: band || '–' },
        { label: 'Photon output', value: fin(ctx.v.ppf) ? fmt(ctx.v.ppf, 0) + ' µmol/s' : '–' },
        { label: 'Input power', value: q('power', ctx.v.watts, ['W', 'BTUh'], 0) },
        { label: 'Footprint', value: fin(ctx.v.fl) && fin(ctx.v.fw) ? fmt(ctx.v.fl, 2) + ' × ' + fmt(ctx.v.fw, 2) + ' m' : '–' },
        { label: 'Fixtures if no light were lost', value: fin(r.raw) ? fmt(r.raw, 2) : '–' }
      ];
    },
    tips: [
      'The presets are <strong>illustrative round numbers</strong>, not products (Light Fixture Layout calculator). Use your fixture’s datasheet or test report.',
      'Benchmarks: ≈1.7 µmol/J for a 1000 W double-ended HPS with an electronic ballast (Runkle &amp; Bugbee; Nelson &amp; Bugbee 2014); many new LED fixtures exceed 2.0 µmol/J; about 3.4 µmol/J is the calculated upper limit for white + red LED fixtures with today’s technology (Kusuma et al. 2020).',
      'Look for PPF, efficacy and the light distribution on the label proposed by Both et al. (2017). PPF and efficacy follow ANSI/ASABE S640.'
    ],
    viz: {
      viewBox: '0 0 480 230', label: 'Photon efficacy of your fixture compared with the presets and the LED limit',
      draw: function (svg, ctx, r) {
        const rows = [['T5 HO (preset)', 1.0], ['HPS DE (preset)', 1800 / 1060], ['LED bar (preset)', 2.5], ['Your fixture', r.eff]];
        const x0 = 150, x1 = 440, max = 4;
        const X = function (v) { return x0 + (x1 - x0) * Math.min(v, max) / max; };
        text(svg, 8, 18, 'Photon efficacy, µmol/J', 'start', 'dim-text');
        rows.forEach(function (rw, i) {
          const y = 32 + i * 38, mine = i === 3;
          text(svg, x0 - 8, y + 15, rw[0], 'end', mine ? 'g-strong' : 'g-label');
          G.el(svg, 'rect', { class: 'g-track', x: x0, y: y, width: x1 - x0, height: 20, rx: 3 });
          if (fin(rw[1])) {
            G.el(svg, 'rect', { class: mine ? 'g-bar' : 'g-bar-soft', x: x0, y: y, width: Math.max(2, X(rw[1]) - x0), height: 20, rx: 3 });
            text(svg, Math.min(X(rw[1]) + 5, x1 - 30), y + 15, fmt(rw[1], 2), 'start', mine ? 'g-accent-text' : 'dim-text');
          }
        });
        const xl = X(3.4);
        G.el(svg, 'line', { class: 'g-line-warn', x1: xl, y1: 26, x2: xl, y2: 186 });
        text(svg, xl, 206, '≈3.4 LED limit', 'middle', 'g-warn-text');
        text(svg, X(0), 206, '0', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.eff) ? 'Your fixture: ' + fmt(r.eff, 2) + ' µmol of photons per joule of electricity' : 'Enter PPF and watts'; }
    },
    sources: ['kusuma2020', 'nelson2014', 'runklebugbee', 'both2017', 'asabe640'],
    links: function (ctx) { return [layoutLink(ctx)]; }
  };

  // ---------- 6. Layout ----------
  const stepLayout = {
    id: 'layout', title: 'Fixture count and layout', short: 'Layout',
    intro: '<p>Now the <strong>lumen method</strong>, with photons instead of lumens: only part of each fixture’s photons reach the canopy (the <em>utilization factor</em>), and fixtures lose output as they age and get dirty (the <em>maintenance factor</em>). The guide finds how many fixtures give the PPFD from step 3, arranges them in an even grid and checks the spacing against the mounting height. Same formulas and grid choice as the Light Fixture Layout calculator.</p>',
    fields: [
      { id: 'cu', half: true, label: 'Utilization factor', suffix: '%',
        def: function (ctx) { return ctx.v.canopy >= 95 ? 80 : 70; },
        check: pctCheck('Utilization factor', 1, 100),
        hint: function (ctx) { return ctx.v.canopy >= 95 ? 'Suggested 80%, the cautious end of the 80–90% rule of thumb for a walled room with reflective walls and plants covering the floor. The direct-capture figure below shows how much the walls must add.' : 'Suggested 70%, the middle of the 60–80% rule of thumb for open benches, racks or a greenhouse bay with aisles.'; } },
      { id: 'mf', half: true, label: 'Maintenance factor', suffix: '%', def: 90,
        check: pctCheck('Maintenance factor', 1, 100),
        hint: 'Rule of thumb 85–95%. Dirty lamps and reflectors can each cut output by 10–15% (Runkle 2018).' },
      { id: 'mh', label: 'Mounting height above the canopy', group: 'length', unit: 'm',
        def: function (ctx) {
          const x = ctx.v, pp = R(ctx, 'ppfd');
          const g = layout({ L: x.len, W: x.wid, hours: hrs(ctx), ppf: x.ppf, watts: x.watts, fl: NaN, fw: NaN, mh: 0, cu: x.cu / 100, mf: x.mf / 100, target: pp.ppfd });
          if (!g.ok || !g.rows) return 1.1;
          return Math.max(0.1, Math.ceil(Math.max(g.sx, g.sy) / SMH_MAX / 0.05 - 1e-9) * 0.05);
        },
        hint: 'Suggested: the lowest height (to 5 cm) that keeps spacing ÷ height within the 1.5 rule of thumb. Lower fixtures put more light on the plants but light less evenly; check the fixture maker’s spacing and the heat on the leaves.' }
    ],
    compute: function (ctx) {
      const r = designLayout(ctx);
      const d = R(ctx, 'dli');
      if (r.ok && fin(r.dli)) { r.total = r.dli + (d.inside || 0); r.status = statusOf(r.total, cropOf(ctx)); }
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (r.tooMany) m.push('That needs more than a million fixtures. Check the area units and the fixture PPF.');
      if (!r.ok) return m;
      if (r.overlap && r.m === 1) m.push('The fixture (' + fmt(r.fl, 2) + ' × ' + fmt(r.fw, 2) + ' m) is bigger than the grow area.');
      else if (r.overlap) m.push('The fixtures (' + fmt(r.fl, 2) + ' × ' + fmt(r.fw, 2) + ' m) are bigger than the grid spacing, so they would overlap. Use fewer, brighter fixtures or a bigger area.');
      if (r.m > r.n) m.push('An even ' + r.rows + ' × ' + r.cols + ' grid needs ' + r.m + ' fixtures, ' + (r.m - r.n) + ' more than the minimum, so the light level ends up ' + fmt((r.ppfd / r.target - 1) * 100, 1) + '% above target. Dim the fixtures or adjust the layout if you can.');
      if (r.ppfd > 1.5 * r.target && r.m - r.n <= 0) m.push('Even ' + (r.m === 1 ? 'one fixture gives' : 'this many fixtures give') + ' ' + fmt(r.ppfd, 0) + ' µmol/m²/s, well above the target. Choose a smaller fixture or dim it.');
      if (r.smh > SMH_MAX && isFinite(r.unif) && r.unif < UNIF_MIN) m.push('Spacing is large compared with the mounting height (ratio ' + fmt(r.smh, 2) + '). Expect dim strips between fixtures: raise the fixtures, or use more, smaller fixtures.');
      if (isFinite(r.capture) && r.cu > r.capture + 0.25) m.push('Your utilization factor (' + fmt(r.cu * 100, 0) + '%) is much higher than the ' + fmt(r.capture * 100, 0) + '% the model puts directly on the canopy. That needs very reflective walls; check it.');
      return m;
    },
    results: function (ctx, r) {
      if (!r.ok) return [{ label: 'Fixtures needed', value: '–', main: true }];
      const gh = ctx.v.setting === 'greenhouse';
      const out = [
        { label: 'Fixtures needed', value: r.n + (r.n === 1 ? ' fixture' : ' fixtures'), main: true },
        { label: 'Exact fixture count (rounded up)', value: fmt(r.exact, 3) },
        { label: 'Grid', value: r.rows + ' rows × ' + r.cols + ' columns = ' + r.m + (r.rotated ? ' (fixtures turned 90°)' : '') },
        { label: 'Spacing (along length × across width)', value: fmt(r.sx, 3) + ' × ' + fmt(r.sy, 3) + ' m' },
        { label: 'Fixture center to wall', value: fmt(r.sx / 2, 3) + ' × ' + fmt(r.sy / 2, 3) + ' m' },
        { label: 'Spacing ÷ mounting height', value: fin(r.smh) ? fmt(r.smh, 2) + ' · ' + smhBand(r.smh) + ' (rule of thumb)' : '–' },
        { label: 'Model uniformity (min ÷ avg, central area)', value: fin(r.unif) ? fmt(r.unif, 2) + (r.unif >= UNIF_MIN ? ' · OK (≥ 0.7 rule of thumb)' : ' · below 0.7 rule of thumb') : '–' },
        { label: 'Photons landing directly (no wall reflection)', value: fin(r.capture) ? fmt(r.capture * 100, 0) + '%' : '–' },
        { label: (gh ? 'Supplemental ' : '') + 'PPFD achieved', value: ppfdTxt(r.ppfd, 1) },
        { label: (gh ? 'Supplemental ' : '') + 'DLI achieved', value: dliTxt(r.dli, 2) }
      ];
      if (gh) out.push({ label: 'Total DLI with daylight', value: dliTxt(r.total, 2) + (r.status ? ' · ' + STATUS_TEXT[r.status] : '') });
      else if (r.status) out.push({ label: 'Crop range check', value: STATUS_TEXT[r.status].replace(/^./, function (c) { return c.toUpperCase(); }) });
      return out;
    },
    tips: [
      'N = ⌈ PPFD × area ÷ (PPF × utilization × maintenance) ⌉. The grid picks the rows × columns with the fewest extra fixtures and the most even spacing (Light Fixture Layout calculator).',
      'Spacing ÷ mounting height, rule of thumb for wide-beam fixtures: ≤ 1.0 even; 1.0–1.5 usually acceptable; above 1.5 expect dim strips. A fixture maker’s spacing criterion overrides it.',
      'The lumen method gives the <strong>average</strong>. Edges and corners get less unless the walls are reflective. For the light map open the full calculator.'
    ],
    viz: {
      viewBox: '0 0 480 320', label: 'To-scale plan of the fixture grid in the grow area',
      draw: function (svg, ctx, r) { drawPlan(svg, r, { canopy: ctx.v.canopy / 100 }); },
      caption: function (ctx, r) { return r.ok ? r.rows + ' × ' + r.cols + ' grid to scale · ' + fmt(r.ppfd, 0) + ' µmol/m²/s average · plants shaded green' : 'Enter the inputs'; }
    },
    sources: ['dilaura2011', 'runkle2018', 'nelson2014', 'faust2018'],
    links: function (ctx) { return [layoutLink(ctx)]; }
  };

  // ---------- 7. Power, heat and cost ----------
  const stepPower = {
    id: 'power', title: 'Power, heat and running cost', short: 'Power',
    intro: '<p>The fixture count sets the electrical load, the energy use and the bill. Almost all of that electricity ends up as <strong>heat in the growing space</strong>: the light itself turns to heat when it is absorbed by plants and surfaces, apart from the small share stored by photosynthesis. Indoors the cooling must remove it. Optionally compare the running cost of a second fixture type laid out the same way.</p>',
    fields: [
      { id: 'price', label: 'Electricity price', suffix: 'per kWh', def: 0.15, allowZero: true,
        hint: 'Any currency; your energy charge per kWh. Demand charges and fixed fees are not included.' },
      { id: 'cmp', label: 'Compare with', type: 'select',
        def: function (ctx) { return ctx.v.preset === 'led' ? 'hps' : 'led'; },
        options: [{ value: 'none', label: 'No comparison' }].concat(Object.keys(PRESETS).map(function (k) { return { value: k, label: PRESET_NAMES[k] }; })) },
      { id: 'cmpPpf', half: true, label: 'Its PPF', suffix: 'µmol/s',
        def: function (ctx) { const pr = PRESETS[ctx.v.cmp]; return pr && pr.ppf ? pr.ppf : NaN; },
        show: function (ctx) { return ctx.v.cmp !== 'none'; } },
      { id: 'cmpW', half: true, label: 'Its input power', group: 'power', unit: 'W',
        def: function (ctx) { const pr = PRESETS[ctx.v.cmp]; return pr && pr.watts ? pr.watts : NaN; },
        show: function (ctx) { return ctx.v.cmp !== 'none'; } },
      { id: 'fixPrice', half: true, label: 'Price per fixture (yours)', suffix: 'each', def: 0, allowZero: true,
        show: function (ctx) { return ctx.v.cmp !== 'none'; },
        hint: 'Optional: your quote, for the Cost Benefit comparison.' },
      { id: 'cmpPrice', half: true, label: 'Price per fixture (comparison)', suffix: 'each', def: 0, allowZero: true,
        show: function (ctx) { return ctx.v.cmp !== 'none'; } },
      { id: 'life', label: 'Years to compare over', suffix: 'years', def: 10,
        check: function (y) { return y > 50 ? 'Use 50 years or fewer.' : intCheck('Years to compare over')(y); },
        show: function (ctx) { return ctx.v.cmp !== 'none'; },
        hint: 'Useful life used in the Cost Benefit calculator (its default example uses 10 years for an HPS-to-LED switch). Use the fixture warranty or rated life.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, L = R(ctx, 'layout'), a = R(ctx, 'area');
      const r = { L: L };
      if (!L.ok) return r;
      r.power = L.power; r.dens = L.dens; r.densCanopy = L.power / a.canopyA;
      r.kwhDay = L.kwhDay; r.kwhMonth = L.kwhMonth; r.kwhYear = L.kwhYear;
      r.costDay = r.kwhDay * x.price; r.costMonth = r.kwhMonth * x.price; r.costYear = r.kwhYear * x.price;
      r.btuh = r.power / W_PER_BTUH;
      r.tons = r.btuh / BTUH_PER_TON;
      if (x.cmp !== 'none') {
        const c = layout({ L: x.len, W: x.wid, hours: L.hours, ppf: x.cmpPpf, watts: x.cmpW, fl: NaN, fw: NaN, mh: 0, cu: x.cu / 100, mf: x.mf / 100, target: L.target });
        r.cmp = c;
        if (c.ok) {
          c.costYear = c.kwhYear * x.price;
          r.diffYear = c.costYear - r.costYear;
          r.upA = L.m * x.fixPrice; r.upB = c.m * x.cmpPrice;
        }
      }
      return r;
    },
    notices: function (ctx, r) {
      const L = r.L || {};
      return [L.ok && !(L.watts > 0) ? 'Enter the fixture input power in step 5.' : '',
        ctx.v.setting === 'greenhouse' ? 'In a greenhouse the sun adds its own heat; the figure below is only the lights’ share.' : ''];
    },
    results: function (ctx, r) {
      if (!r.L || !r.L.ok) return [{ label: 'Total lighting power', value: '–', main: true }];
      const out = [
        { label: 'Total lighting power', value: fmt(r.power, 0) + ' W (' + fmt(r.power / 1000, 2) + ' kW)', main: true },
        { label: 'Power density', value: fmt(r.dens, 1) + ' W/m² · ' + fmt(r.dens * FT2, 1) + ' W/ft²' },
        { label: 'Per m² of plant canopy', value: fin(r.densCanopy) ? fmt(r.densCanopy, 1) + ' W/m²' : '–' },
        { label: 'Energy', value: fmt(r.kwhDay, 2) + ' kWh/day · ' + fmt(r.kwhMonth, 1) + ' kWh/month · ' + fmt(r.kwhYear, 0) + ' kWh/year' },
        { label: 'Running cost (day / month / year)', value: money(r.costDay) + ' / ' + money(r.costMonth) + ' / ' + money(r.costYear) },
        { label: 'Heat to remove while the lights are on', value: fmt(r.power, 0) + ' W · ' + fmt(r.btuh, 0) + ' BTU/h · ' + fmt(r.tons, 2) + ' tons of cooling' },
        { label: 'Heat released per day', value: fmt(r.kwhDay, 2) + ' kWh · ' + fmt(CalcUnits.convert('energy', r.kwhDay, 'kWh', 'BTU'), 0) + ' BTU' }
      ];
      if (r.cmp) {
        const c = r.cmp, nm = PRESET_SHORT[ctx.v.cmp];
        if (c.ok) {
          out.push({ label: nm + ' instead: fixtures', value: c.n + ' needed · ' + c.rows + ' × ' + c.cols + ' grid = ' + c.m + ' · ' + fmt(c.ppfd, 0) + ' µmol/m²/s' });
          out.push({ label: nm + ' instead: power and cost', value: fmt(c.power / 1000, 2) + ' kW · ' + fmt(c.kwhYear, 0) + ' kWh/year · ' + money(c.costYear) + '/year' });
          out.push({ label: 'Yearly running-cost difference', value: (r.diffYear >= 0 ? 'Your design saves ' : 'Your design costs ') + money(Math.abs(r.diffYear)) + ' per year' });
        } else out.push({ label: nm + ' instead', value: 'enter its PPF and input power' });
      }
      return out;
    },
    tips: [
      'Total power = fixtures × input power; energy per day = power × hours ÷ 1000; cost = energy × price; 30.44 days per month (Light Fixture Layout calculator).',
      'Heat: <strong>all of the electrical input becomes heat in the space</strong> (design assumption; photosynthesis stores only a small share). 1 W = 3.412 BTU/h; 1 ton of cooling = 12,000 BTU/h (NIST SP 811). Cooling-load methods take lighting heat gain from the installed electrical input (ASHRAE Handbook—Fundamentals).',
      'Running cost here is lighting electricity only. The cooling to remove the heat, demand charges and fixture replacement come on top; the Cost Benefit calculator can weigh purchase price against running cost.'
    ],
    viz: {
      viewBox: '0 0 480 220', label: 'Yearly lighting energy cost and heat load of your design, and of the comparison fixture',
      draw: function (svg, ctx, r) {
        if (!r.L || !r.L.ok) return;
        const rows = [{ name: PRESET_SHORT[ctx.v.preset] + ' (yours)', kw: r.power / 1000, cost: r.costYear, main: true }];
        if (r.cmp && r.cmp.ok) rows.push({ name: PRESET_SHORT[ctx.v.cmp], kw: r.cmp.power / 1000, cost: r.cmp.costYear });
        const max = Math.max.apply(null, rows.map(function (x) { return x.kw; }).concat([1e-9]));
        const x0 = 20, x1 = 300;
        text(svg, x0, 18, 'Electrical load = heat load (kW) and cost per year', 'start', 'dim-text');
        rows.forEach(function (rw, i) {
          const y = 34 + i * 82;
          text(svg, x0, y + 12, rw.name, 'start', rw.main ? 'g-strong' : 'g-label');
          G.el(svg, 'rect', { class: 'g-track', x: x0, y: y + 22, width: x1 - x0, height: 24, rx: 4 });
          G.el(svg, 'rect', { class: rw.main ? 'g-bar' : 'g-bar-soft', x: x0, y: y + 22, width: Math.max(2, (x1 - x0) * rw.kw / max), height: 24, rx: 4 });
          text(svg, x1 + 8, y + 39, fmt(rw.kw, 2) + ' kW', 'start', 'g-strong');
          text(svg, x0, y + 66, money(rw.cost) + ' per year · ' + fmt(rw.kw * 1000 / W_PER_BTUH, 0) + ' BTU/h', 'start', 'dim-text');
        });
      },
      caption: function (ctx, r) { return r.L && r.L.ok ? fmt(r.power / 1000, 2) + ' kW of lights ≈ ' + fmt(r.tons, 2) + ' tons of cooling while on' : 'Enter the inputs'; }
    },
    sources: ['nist811', 'ashrae2013', 'nelson2014', 'kay2020'],
    links: function (ctx, r) {
      const out = [layoutLink(ctx)];
      if (r.cmp && r.cmp.ok && r.L && r.L.ok) {
        const x = ctx.v;
        const opt = function (i, name, up, cost) {
          const o = {}; o['on' + i] = name; o['ou' + i] = p(up, 8); o['os' + i] = 0; o['oc' + i] = p(+cost.toFixed(2), 10); o['ob' + i] = 0; o['ol' + i] = x.life; o['ogb' + i] = 0; o['ogc' + i] = 0; return o;
        };
        const prm = Object.assign({ rate: 6, period: '', cur: 'none', method: 'eav', n: 2 },
          opt(0, PRESET_SHORT[x.preset] + ' × ' + r.L.m + ' (design)', r.upA, r.costYear),
          opt(1, PRESET_SHORT[x.cmp] + ' × ' + r.cmp.m, r.upB, r.cmp.costYear));
        out.push({ slug: 'cost-benefit', label: 'Cost Benefit Analysis', params: prm });
      }
      return out;
    }
  };

  // ---------- 8. Summary ----------
  const stepSummary = {
    id: 'summary', type: 'summary', title: 'Design sheet', short: 'Summary',
    intro: '<p>Every decision and number from the walkthrough, in one place. Use <strong>Edit</strong> to go back to any step; later steps update automatically. Copy, share or print the sheet, or keep the link to resume later.</p>',
    viz: {
      viewBox: '0 0 480 320', label: 'To-scale plan of the final fixture layout',
      draw: function (svg, ctx) { drawPlan(svg, R(ctx, 'layout'), { canopy: ctx.v.canopy / 100, maxH: 240 }); },
      caption: function (ctx) {
        const L = R(ctx, 'layout'), pw = R(ctx, 'power');
        return L.ok ? L.m + ' × ' + PRESET_SHORT[ctx.v.preset] + ' in a ' + L.rows + ' × ' + L.cols + ' grid · ' + fmt(L.ppfd, 0) + ' µmol/m²/s · ' + fmt(pw.power / 1000, 2) + ' kW' : 'Complete the steps to draw the layout';
      }
    },
    after: '<p><strong>Comparing fixture options?</strong> Use the <a href="../calculators/cost-benefit.html">Cost Benefit Analysis calculator</a> to weigh purchase price against running cost over the fixtures’ life (the power step opens it pre-filled with your design and the comparison fixture).</p>' +
      '<p><strong>Need the detailed light map?</strong> The <a href="../calculators/light-fixture-layout.html">Light Fixture Layout calculator</a> draws an approximate PPFD heat map of this layout, so you can see the dim edges and corners (open it pre-filled from the layout step).</p>' +
      '<p>These are first-pass estimates from published rules of thumb and illustrative fixture data. Check them against your fixture’s photometric report or a quantum-sensor survey before you buy.</p>'
  };

  G.create({
    root: 'guide',
    sourcesList: 'guide-sources',
    title: 'Design a grow light system',
    calcBase: '../calculators/',
    sources: SRC,
    steps: [stepCrop, stepDli, stepPpfd, stepArea, stepFixture, stepLayout, stepPower, stepSummary]
  });
})();
