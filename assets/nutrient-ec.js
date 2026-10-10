// Nutrient EC Calculator: Kohlrausch sum of limiting ionic conductivities,
// stacked contribution bar + crop-range gauge, shareable URL state.
(function () {
  'use strict';

  // ---------- Constants ----------
  // lambda = limiting molar conductivity at 25 °C (S·cm²/mol), PHREEQC-derived values
  // as tabulated by aqion. mw = mass the input is reported as (g/mol), so
  // mmol/L = (mg/L) / mw. z = ionic charge.
  const IONS = [
    { id: 'no3', sym: 'NO₃⁻', name: 'Nitrate', mw: 14.007, lambda: 71.4, z: -1, color: '#3b82c4' },
    { id: 'nh4', sym: 'NH₄⁺', name: 'Ammonium-N', mw: 14.007, lambda: 74.4, z: 1, color: '#8a6fd1' },
    { id: 'p', sym: 'H₂PO₄⁻', name: 'Phosphorus (P)', mw: 30.97, lambda: 31.8, z: -1, color: '#d46a9a' },
    { id: 'k', sym: 'K⁺', name: 'Potassium', mw: 39.10, lambda: 73.6, z: 1, color: '#e08a2e' },
    { id: 'ca', sym: 'Ca²⁺', name: 'Calcium', mw: 40.08, lambda: 119.1, z: 2, color: '#2fa37a' },
    { id: 'mg', sym: 'Mg²⁺', name: 'Magnesium', mw: 24.31, lambda: 105.1, z: 2, color: '#93b024' },
    { id: 's', sym: 'SO₄²⁻', name: 'Sulfur (S)', mw: 32.06, lambda: 160.7, z: -2, color: '#d1b02a' },
    { id: 'na', sym: 'Na⁺', name: 'Sodium', mw: 22.99, lambda: 50.0, z: 1, color: '#8c99a6' },
    { id: 'cl', sym: 'Cl⁻', name: 'Chloride', mw: 35.45, lambda: 76.2, z: -1, color: '#4cb8c4' },
    { id: 'hco3', sym: 'HCO₃⁻', name: 'Bicarbonate', mw: 61.02, lambda: 44.3, z: -1, color: '#b07a52', other: true },
    { id: 'mn', sym: 'Mn²⁺', name: 'Manganese', mw: 54.94, lambda: 103.4, z: 2, other: true },
    { id: 'zn', sym: 'Zn²⁺', name: 'Zinc', mw: 65.38, lambda: 107.4, z: 2, other: true },
    { id: 'cu', sym: 'Cu²⁺', name: 'Copper', mw: 63.55, lambda: 110.1, z: 2, other: true },
    { id: 'mo', sym: 'MoO₄²⁻', name: 'Molybdenum (Mo)', mw: 95.96, lambda: 298.0, z: -2, other: true },
    { id: 'fe', sym: 'Fe', name: 'Iron (chelated)', mw: 55.85, lambda: 0, z: 0, other: true },
    { id: 'b', sym: 'B', name: 'Boron (H₃BO₃)', mw: 10.81, lambda: 0, z: 0, other: true }
  ];
  const MW_NO3 = 62.004;          // g/mol NO3⁻, used when nitrate is entered as NO3
  const CORRECTION = 0.90;        // ~10 % ion-interaction reduction (rule of thumb)
  const OTHER_COLOR = '#9a8a7a';

  // Optimum EC ranges, mS/cm (rule of thumb). OSU HLA-6722 except tomato.
  const CROPS = [
    { name: 'Pepper', lo: 0.8, hi: 1.8 },
    { name: 'Basil', lo: 1.0, hi: 1.6 },
    { name: 'Lettuce', lo: 1.2, hi: 1.8 },
    { name: 'Cucumber', lo: 1.7, hi: 2.0 },
    { name: 'Strawberry', lo: 1.8, hi: 2.2 },
    { name: 'Spinach', lo: 1.8, hi: 2.3 },
    { name: 'Tomato*', lo: 2.0, hi: 4.0 }
  ];

  // Presets in mg/L. Hoagland & Arnon (1950) No. 2 from its stock volumes:
  // 6 mM KNO3, 4 mM Ca(NO3)2, 1 mM NH4H2PO4, 2 mM MgSO4 + micronutrient stock.
  const PRESETS = {
    hoagland: { no3: 196.1, nh4: 14.0, p: 31.0, k: 234.6, ca: 160.3, mg: 48.6, s: 64.1, na: 0, cl: 0.65, hco3: 0,
      mn: 0.5, zn: 0.05, cu: 0.02, mo: 0.01, fe: 1, b: 0.5 },
    half: { no3: 98.05, nh4: 7.0, p: 15.5, k: 117.3, ca: 80.15, mg: 24.3, s: 32.05, na: 0, cl: 0.33, hco3: 0,
      mn: 0.25, zn: 0.025, cu: 0.01, mo: 0.005, fe: 1, b: 0.25 },
    aquaponics: { no3: 40, nh4: 0.5, p: 10, k: 40, ca: 60, mg: 10, s: 15, na: 20, cl: 30, hco3: 80,
      mn: 0.05, zn: 0.1, cu: 0.02, mo: 0, fe: 1.5, b: 0.1 }
  };
  const DEFAULT_PRESET = 'hoagland';

  const OUT = {
    mScm: { label: 'mS/cm', f: 1, d: 2 },
    uScm: { label: 'µS/cm', f: 1000, d: 0 },
    dSm: { label: 'dS/m', f: 1, d: 2 },
    cf: { label: 'CF', f: 10, d: 1 }
  };

  const $ = function (id) { return document.getElementById(id); };
  const presetSel = $('preset');
  const no3Sel = $('no3form');
  const outSel = $('out');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function fixed(n, d) {
    return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '–';
  }
  function ecOut(ms) {
    const o = OUT[outSel.value] || OUT.mScm;
    return fixed(ms * o.f, o.d) + ' ' + o.label;
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + ' ' + CalcUnits.unitLabel(id);
  }

  // ---------- Calculation ----------
  function compute() {
    const rows = [];
    let theo = 0, cat = 0, an = 0, ionic = 0, negative = false;
    IONS.forEach(function (ion) {
      const raw = parseFloat($(ion.id).value);
      if (isFinite(raw) && raw < 0) negative = true;
      const mg = CalcUnits.base(ion.id); // mg/L
      const mw = ion.id === 'no3' && no3Sel.value === 'no3' ? MW_NO3 : ion.mw;
      const mmol = mg / mw;
      const ec = ion.lambda * mmol / 1000; // mS/cm
      const meq = mmol * Math.abs(ion.z);
      if (ion.z > 0) cat += meq; else if (ion.z < 0) an += meq;
      ionic += 0.5 * mmol * ion.z * ion.z;
      theo += ec;
      rows.push({ ion: ion, mg: mg, mmol: mmol, ec: ec });
    });
    return { rows: rows, theo: theo, est: theo * CORRECTION, cat: cat, an: an, ionic: ionic, negative: negative };
  }

  function cropsIn(ec) {
    return CROPS.filter(function (c) { return ec >= c.lo && ec <= c.hi; }).map(function (c) { return c.name.replace('*', ''); });
  }

  // ---------- State ----------
  function getState() {
    const st = { preset: presetSel.value, no3form: no3Sel.value, out: outSel.value };
    IONS.forEach(function (ion) {
      st[ion.id] = $(ion.id).value;
      st[ion.id + '_u'] = CalcUnits.unit(ion.id);
    });
    return st;
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    IONS.forEach(function (ion) { CalcUnits.set(ion.id, p[ion.id], 'mgL'); });
    no3Sel.value = 'n';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const has = r.theo > 0;
    const notice = $('notice');
    const msgs = [];
    if (!has) msgs.push('Enter at least one ion concentration to estimate EC.');
    if (r.negative) msgs.push('Negative concentrations are treated as zero.');
    const imb = (r.cat + r.an) > 0 ? (r.cat - r.an) / (r.cat + r.an) * 100 : 0;
    if (has && Math.abs(imb) > 10) {
      msgs.push('Cations and anions differ by ' + fmt(Math.abs(imb), 0) + '% (' + (imb > 0 ? 'cations' : 'anions') +
        ' in excess). A real solution is electrically neutral, so check for a missing ion (often bicarbonate, chloride or sulfate) or a nitrate entered in the wrong form.');
    }
    if (has && r.est > 5) msgs.push('Above about 5 mS/cm the simple ion sum becomes less reliable, and few crops tolerate this EC.');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const ppm500 = r.est * 500, ppm700 = r.est * 700;
    $('r-ec').textContent = has ? ecOut(r.est) : '–';
    $('r-theo').textContent = has ? ecOut(r.theo) : '–';
    $('r-ppm500').textContent = has ? fmt(Math.round(ppm500), 0) + ' ppm' : '–';
    $('r-ppm700').textContent = has ? fmt(Math.round(ppm700), 0) + ' ppm' : '–';
    $('r-bal').textContent = has ? fixed(r.cat, 2) + ' / ' + fixed(r.an, 2) + ' meq/L' : '–';
    $('r-ionic').textContent = has ? fixed(r.ionic, 1) + ' mmol/L' : '–';
    const crops = has ? cropsIn(r.est) : [];
    $('r-crops').textContent = !has ? '–' : crops.length ? crops.join(', ') : (r.est < 0.8 ? 'Below all listed ranges' : 'Above all listed ranges');

    // Per-ion table
    const tbody = $('ion-table');
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    r.rows.forEach(function (row) {
      if (!(row.mg > 0)) return;
      const tr = document.createElement('tr');
      [row.ion.sym, fmt(row.mg), fixed(row.mmol, row.mmol >= 0.1 ? 2 : 4), row.ion.lambda ? fixed(row.ion.lambda, 1) : '0',
        fixed(row.ec, 3), has ? fmt(row.ec / r.theo * 100, 1) + '%' : '–'].forEach(function (t) {
        const td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    $('viz-caption').textContent = has
      ? 'Estimated EC ' + fixed(r.est, 2) + ' mS/cm (theoretical sum ' + fixed(r.theo, 2) + ') · ' +
        (crops.length ? 'within the range for ' + crops.join(', ') : 'outside the listed crop ranges')
      : 'Enter ion concentrations to draw the chart';

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
  function text(x, y, t, anchor, extra) {
    const a = { x: x, y: y, 'text-anchor': anchor || 'start', class: 'dim-text' };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return el('text', a, t);
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const x0 = 86, x1 = VW - 16, W = x1 - x0;

    // ---- Section 1: stacked contribution bar ----
    text(8, 18, 'Contribution of each ion (theoretical sum)', 'start', { 'font-weight': 600 });
    const barY = 28, barH = 30;
    el('rect', { x: 8, y: barY, width: VW - 24, height: barH, rx: 6, fill: 'var(--surface-2)' });
    const segs = [];
    let other = 0;
    r.rows.forEach(function (row) {
      if (row.ion.other) other += row.ec;
      else segs.push({ sym: row.ion.sym, ec: row.ec, color: row.ion.color });
    });
    segs.push({ sym: 'Other', ec: other, color: OTHER_COLOR });
    if (r.theo > 0) {
      let x = 8;
      const full = VW - 24;
      segs.forEach(function (s) {
        const w = s.ec / r.theo * full;
        if (w <= 0) return;
        el('rect', { x: x, y: barY, width: w, height: barH, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 1 });
        if (w > 34) {
          el('text', { x: x + w / 2, y: barY + barH / 2 + 4, 'text-anchor': 'middle', fill: '#fff', 'font-size': 11,
            'font-weight': 600, 'font-family': 'var(--font)' }, s.sym);
        }
        x += w;
      });
    }
    // legend: 5 columns × 2 rows
    segs.forEach(function (s, i) {
      const col = i % 5, row = Math.floor(i / 5);
      const lx = 8 + col * 93, ly = barY + barH + 18 + row * 18;
      el('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 2, fill: s.color });
      text(lx + 14, ly, s.sym + ' ' + fixed(s.ec, 2));
    });

    // ---- Section 2: crop range gauge ----
    const gTop = 128;
    text(8, gTop, 'Estimated EC vs crop ranges (mS/cm)', 'start', { 'font-weight': 600 });
    const maxEc = Math.max(4, Math.ceil(r.theo * 1.1 * 2) / 2);
    const sx = function (v) { return x0 + Math.min(v, maxEc) / maxEc * W; };
    const rowH = 19, rowsTop = gTop + 12;
    CROPS.forEach(function (c, i) {
      const y = rowsTop + i * rowH;
      const inRange = r.est >= c.lo && r.est <= c.hi && r.theo > 0;
      text(x0 - 8, y + 12, c.name, 'end', inRange ? { 'font-weight': 700, fill: 'var(--text)' } : undefined);
      el('rect', { x: x0, y: y + 3, width: W, height: rowH - 6, rx: 3, fill: 'var(--surface-2)' });
      el('rect', { x: sx(c.lo), y: y + 3, width: sx(c.hi) - sx(c.lo), height: rowH - 6, rx: 3,
        fill: inRange ? 'var(--accent)' : 'var(--accent-soft)', stroke: 'var(--accent)', 'stroke-width': 1 });
    });
    const axisY = rowsTop + CROPS.length * rowH + 4;
    el('path', { class: 'dim', d: 'M' + x0 + ',' + axisY + ' L' + x1 + ',' + axisY });
    const step = maxEc > 6 ? 2 : maxEc > 3 ? 1 : 0.5;
    for (let v = 0; v <= maxEc + 1e-9; v += step) {
      el('path', { class: 'dim', d: 'M' + sx(v) + ',' + axisY + ' L' + sx(v) + ',' + (axisY + 4) });
      text(sx(v), axisY + 16, fmt(v, 1), 'middle');
    }

    if (r.theo > 0) {
      const xt = sx(r.theo), xe = sx(r.est);
      el('line', { x1: xt, y1: rowsTop - 2, x2: xt, y2: axisY, stroke: 'var(--text-muted)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' });
      el('line', { x1: xe, y1: rowsTop - 2, x2: xe, y2: axisY, stroke: 'var(--text)', 'stroke-width': 2.5 });
      el('path', { d: 'M' + (xe - 6) + ',' + (rowsTop - 8) + ' L' + (xe + 6) + ',' + (rowsTop - 8) + ' L' + xe + ',' + (rowsTop - 1) + 'Z', fill: 'var(--text)' });
      // value label near the needle, kept inside the viewBox
      const label = fixed(r.est, 2) + (r.est > maxEc ? '+' : '');
      const lx = Math.min(Math.max(xe, x0 + 14), x1 - 14);
      el('text', { x: lx, y: axisY + 32, 'text-anchor': 'middle', class: 'depth-text' }, 'est. ' + label);
    }
    // legend for lines
    const ly = axisY + 50;
    el('line', { x1: 8, y1: ly - 4, x2: 26, y2: ly - 4, stroke: 'var(--text)', 'stroke-width': 2.5 });
    text(30, ly, 'estimate (×0.90)');
    el('line', { x1: 150, y1: ly - 4, x2: 168, y2: ly - 4, stroke: 'var(--text-muted)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' });
    text(172, ly, 'theoretical sum');
    text(VW - 8, ly, '* tomato: grower range', 'end');
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + (ly + 8));
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = ['Nutrient EC Calculator (Kohlrausch, 25 °C)'];
    lines.push('Nitrate entered as ' + (no3Sel.value === 'no3' ? 'NO3' : 'NO3-N'));
    r.rows.forEach(function (row) {
      if (row.mg > 0) lines.push('  ' + row.ion.name + ': ' + typed(row.ion.id) + ' → ' + fixed(row.ec, 3) + ' mS/cm');
    });
    lines.push('Estimated EC (×0.90): ' + ecOut(r.est));
    lines.push('Theoretical EC (infinite dilution): ' + ecOut(r.theo));
    lines.push('TDS meter reading: ' + fmt(Math.round(r.est * 500), 0) + ' ppm (500 scale) / ' + fmt(Math.round(r.est * 700), 0) + ' ppm (700 scale)');
    lines.push('Cations / anions: ' + fixed(r.cat, 2) + ' / ' + fixed(r.an, 2) + ' meq/L');
    const crops = cropsIn(r.est);
    lines.push('Within crop range: ' + (crops.length ? crops.join(', ') : 'none listed'));
    lines.push('Estimate only; check with a calibrated EC meter.');
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  IONS.forEach(function (ion) {
    $(ion.id).addEventListener('input', function () { presetSel.value = 'custom'; render(); });
  });
  presetSel.addEventListener('change', function () {
    if (PRESETS[presetSel.value]) applyPreset(presetSel.value);
    render();
  });
  no3Sel.addEventListener('change', function () { presetSel.value = 'custom'; render(); });
  outSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Nutrient EC Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    presetSel.value = DEFAULT_PRESET;
    outSel.value = 'mScm';
    applyPreset(DEFAULT_PRESET);
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    const preset = PRESETS[p.preset] || p.preset === 'custom' ? p.preset : DEFAULT_PRESET;
    applyPreset(PRESETS[preset] ? preset : DEFAULT_PRESET);
    presetSel.value = preset;
    if (p.no3form === 'n' || p.no3form === 'no3') no3Sel.value = p.no3form;
    if (p.out && OUT[p.out]) outSel.value = p.out;
    IONS.forEach(function (ion) {
      const u = p[ion.id + '_u'];
      if (p[ion.id] !== undefined && isFinite(parseFloat(p[ion.id]))) CalcUnits.set(ion.id, p[ion.id], u);
      else if (u) CalcUnits.set(ion.id, $(ion.id).value, u);
    });
    render();
  })();
})();
