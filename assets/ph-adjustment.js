// pH Adjustment Calculator: acid dose from alkalinity using the carbonate system,
// live titration-curve SVG, shareable URL state.
(function () {
  'use strict';

  // ---------- Extra unit group (kept local; units.js is shared) ----------
  // Alkalinity, base = mg/L as CaCO3. 1 meq/L = 50.04 mg/L CaCO3 (CaCO3 100.087 g/mol ÷ 2).
  const MG_CACO3_PER_MEQ = 50.04;
  if (!CalcUnits.GROUPS.alkalinity) {
    CalcUnits.GROUPS.alkalinity = {
      base: 'caco3',
      units: [
        { id: 'caco3', label: 'mg/L CaCO₃', factor: 1 },
        { id: 'meq', label: 'meq/L', factor: MG_CACO3_PER_MEQ },
        { id: 'hco3', label: 'mg/L HCO₃⁻', factor: MG_CACO3_PER_MEQ / 61.017 },
        { id: 'dkh', label: '°dKH', factor: MG_CACO3_PER_MEQ * 2 * 10 / 56.077 }
      ]
    };
  }

  // ---------- Acid products ----------
  // w = mass fraction, rho = density g/mL (≈20–25 °C, CRC Handbook / supplier specs),
  // mw = g/mol, pKa = dissociation constants at 25 °C (CRC Handbook), nut = nutrient element.
  const ACIDS = {
    phos75: { name: '75% phosphoric acid', short: 'H₃PO₄ 75%', w: 0.75, rho: 1.579, mw: 97.994, pKa: [2.16, 7.21, 12.32], nut: 'P', nutMw: 30.974 },
    phos85: { name: '85% phosphoric acid', short: 'H₃PO₄ 85%', w: 0.85, rho: 1.685, mw: 97.994, pKa: [2.16, 7.21, 12.32], nut: 'P', nutMw: 30.974 },
    nitric67: { name: '67% nitric acid', short: 'HNO₃ 67%', w: 0.67, rho: 1.40, mw: 63.012, pKa: [-1.4], nut: 'N', nutMw: 14.007 },
    sulf35: { name: '35% sulfuric acid', short: 'H₂SO₄ 35%', w: 0.35, rho: 1.26, mw: 98.079, pKa: [-3, 1.99], nut: 'S', nutMw: 32.06 },
    sulf93: { name: '93% sulfuric acid', short: 'H₂SO₄ 93%', w: 0.93, rho: 1.83, mw: 98.079, pKa: [-3, 1.99], nut: 'S', nutMw: 32.06 },
    citric: { name: 'citric acid (anhydrous powder)', short: 'citric acid', w: 1, rho: null, mw: 192.12, pKa: [3.13, 4.76, 6.40], nut: null, nutMw: 0 }
  };

  const DEFAULTS = { vol: 1000, vol_u: 'L', alk: 150, alk_u: 'caco3', ph0: 7.8, ph1: 5.8, temp: 20, temp_u: 'C', acid: 'phos75' };
  const ML_PER_USGAL = 3785.411784;
  const ML_PER_FLOZ = 29.5735295625;

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const acidSel = $('acid');
  const outVol = $('out-vol');
  const outMass = $('out-mass');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : '–') + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }

  // ---------- Chemistry ----------
  // Carbonate constants vs temperature: Plummer & Busenberg (1982); Kw: Harned & Owen as in Stumm & Morgan (1996).
  function constants(tC) {
    const T = tC + 273.15, L = Math.log10;
    const logK1 = -356.3094 - 0.06091964 * T + 21834.37 / T + 126.8339 * L(T) - 1684915 / (T * T);
    const logK2 = -107.8871 - 0.03252849 * T + 5151.79 / T + 38.92561 * L(T) - 563713.9 / (T * T);
    const pKw = 4470.99 / T - 6.0875 + 0.01706 * T;
    return { pK1: -logK1, pK2: -logK2, pKw: pKw, K1: Math.pow(10, logK1), K2: Math.pow(10, logK2), Kw: Math.pow(10, -pKw) };
  }

  // HCO3- and CO3-- fractions of total carbonate at [H+] = H.
  function alphas(H, c) {
    const D = H * H + H * c.K1 + c.K1 * c.K2;
    return { a0: H * H / D, a1: H * c.K1 / D, a2: c.K1 * c.K2 / D };
  }

  // Alkalinity (eq/L) of water with total carbonate CT (mol/L) at pH.
  function alkAt(pH, CT, c) {
    const H = Math.pow(10, -pH);
    const a = alphas(H, c);
    return CT * (a.a1 + 2 * a.a2) + c.Kw / H - H;
  }

  // Average number of protons each acid molecule has given up at pH (speciation from pKa).
  function protonsPerMolecule(acid, pH) {
    const H = Math.pow(10, -pH);
    const K = acid.pKa.map(function (p) { return Math.pow(10, -p); });
    const n = K.length;
    // terms[i] = concentration weight of the species that has lost i protons
    const terms = [Math.pow(H, n)];
    let prod = 1;
    for (let i = 0; i < n; i++) { prod *= K[i]; terms.push(prod * Math.pow(H, n - i - 1)); }
    let sum = 0, wsum = 0;
    terms.forEach(function (t, i) { sum += t; wsum += i * t; });
    return wsum / sum;
  }

  function compute() {
    const volL = CalcUnits.base('vol');
    const alkRaw = CalcUnits.baseSigned('alk');
    const ph0 = parseFloat($('ph0').value);
    const ph1 = parseFloat($('ph1').value);
    let tC = CalcUnits.baseSigned('temp');
    const notes = [];
    let tempNote = '';
    if (!isFinite(tC)) { tC = 25; tempNote = 'default'; }
    else if (tC < 0 || tC > 50) { tC = Math.min(50, Math.max(0, tC)); tempNote = 'clamped'; }
    const c = constants(tC);
    const acid = ACIDS[acidSel.value] || ACIDS.phos75;

    const r = { ok: false, volL: volL, tC: tC, tempNote: tempNote, c: c, acid: acid, ph0: ph0, ph1: ph1, notes: notes };

    if (!(volL > 0) || !isFinite(alkRaw) || alkRaw < 0 || !isFinite(ph0) || !isFinite(ph1)) {
      r.error = 'Enter the water volume, alkalinity, current pH and target pH to see the dose.';
      return r;
    }
    if (ph0 < 3 || ph0 > 11) { r.error = 'Current pH should be between 3 and 11.'; return r; }
    if (ph1 < 3 || ph1 > 9) { r.error = 'Target pH should be between 3 and 9.'; return r; }

    const alkEq = alkRaw / MG_CACO3_PER_MEQ / 1000; // eq/L
    const H0 = Math.pow(10, -ph0);
    const a0 = alphas(H0, c);
    let CT = (alkEq - c.Kw / H0 + H0) / (a0.a1 + 2 * a0.a2);
    if (!(CT > 0)) CT = 0;
    r.alkEq = alkEq;
    r.CT = CT;
    r.ok = true;

    if (ph1 >= ph0) {
      r.noAcid = true;
      r.acidEq = 0;
      r.molAcidL = 0;
      r.alkLeftEq = alkEq;
      r.nbar = protonsPerMolecule(acid, ph1);
      return r;
    }

    r.alkLeftEq = alkAt(ph1, CT, c);
    r.acidEq = Math.max(0, alkEq - r.alkLeftEq); // eq/L (= mol H+ per L)
    r.nbar = protonsPerMolecule(acid, ph1);
    r.molAcidL = r.acidEq / r.nbar;
    r.molH = r.acidEq * volL;
    r.molAcid = r.molAcidL * volL;
    r.gPure = r.molAcid * acid.mw;
    r.gProduct = r.gPure / acid.w;
    r.mL = acid.rho ? r.gProduct / acid.rho : null;
    // one N, P or S atom per acid molecule
    r.nutMgL = acid.nut ? r.molAcidL * acid.nutMw * 1000 : 0;

    if (ph1 < 4) notes.push('Below pH 4 the dose is set by the acid itself, not the alkalinity, so small errors in pH make large errors in dose. Plants and fish are damaged at this pH.');
    if (ph1 < 5 && ph1 >= 4) notes.push('A target below pH 5 removes almost all buffering; pH can then swing quickly. Most crops are grown at pH 5.5–6.5.');
    if (tempNote === 'clamped') notes.push('Temperature was limited to 0–50 °C for the carbonate constants.');
    if (alkRaw > 500) notes.push('Alkalinity above 500 mg/L CaCO₃ is unusual; check the units on your water test.');
    return r;
  }

  // ---------- State ----------
  function getState() {
    return {
      vol: $('vol').value, vol_u: CalcUnits.unit('vol'),
      alk: $('alk').value, alk_u: CalcUnits.unit('alk'),
      ph0: $('ph0').value, ph1: $('ph1').value,
      temp: $('temp').value, temp_u: CalcUnits.unit('temp'),
      acid: acidSel.value,
      out: ACIDS[acidSel.value] && ACIDS[acidSel.value].rho ? outVol.value : outMass.value
    };
  }

  function applyDefaults() {
    CalcUnits.set('vol', DEFAULTS.vol, DEFAULTS.vol_u);
    CalcUnits.set('alk', DEFAULTS.alk, DEFAULTS.alk_u);
    $('ph0').value = DEFAULTS.ph0;
    $('ph1').value = DEFAULTS.ph1;
    CalcUnits.set('temp', DEFAULTS.temp, DEFAULTS.temp_u);
    acidSel.value = DEFAULTS.acid;
    outVol.value = 'mL';
    outMass.value = 'g';
  }

  function amountText(r) {
    if (r.acid.rho) {
      const u = outVol.value;
      return fmt(CalcUnits.convert('volume', r.mL / 1000, 'L', u)) + ' ' + CalcUnits.label('volume', u);
    }
    const u = outMass.value;
    return fmt(CalcUnits.convert('mass', r.gProduct / 1000, 'kg', u)) + ' ' + CalcUnits.label('mass', u);
  }

  function nutrientText(r) {
    if (!r.acid.nut) return 'none (adds citrate, an organic carbon source)';
    const names = { N: 'nitrate-N', P: 'phosphorus (P)', S: 'sulfate-S' };
    return fmt(r.nutMgL) + ' mg/L ' + names[r.acid.nut];
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const liquid = !!r.acid.rho;
    outVol.hidden = !liquid;
    outMass.hidden = liquid;

    const alkHint = $('alk-hint');
    const alkB = CalcUnits.baseSigned('alk');
    alkHint.textContent = isFinite(alkB) && alkB >= 0
      ? '= ' + fmt(alkB, 0) + ' mg/L as CaCO₃ = ' + fmt(alkB / MG_CACO3_PER_MEQ, 2) + ' meq/L. Use total alkalinity from a water test or lab report.'
      : 'Total alkalinity from a water test or lab report.';
    $('temp-hint').textContent = (r.tempNote === 'default' ? 'No temperature entered: using 25 °C. ' : '') +
      'Constants used: pK₁ ' + r.c.pK1.toFixed(2) + ', pK₂ ' + r.c.pK2.toFixed(2) + ' at ' + fmt(r.tC, 1) + ' °C.';
    $('r-unit').textContent = 'of ' + r.acid.name;

    const notice = $('notice');
    const ids = ['r-amount', 'r-per100', 'r-pergal', 'r-floz', 'r-h', 'r-removed', 'r-left', 'r-nut', 'r-nbar'];
    if (!r.ok) {
      notice.textContent = r.error;
      notice.hidden = false;
      ids.forEach(function (id) { $(id).textContent = '–'; });
      $('viz-caption').textContent = 'Enter the inputs to draw the titration curve';
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }
    if (r.noAcid) {
      notice.textContent = 'The target pH is not below the current pH, so no acid is needed. Raising pH needs a base (for example potassium hydroxide or potassium bicarbonate).';
      notice.hidden = false;
      $('r-amount').textContent = '0';
      ['r-per100', 'r-pergal', 'r-floz', 'r-h', 'r-removed', 'r-nut'].forEach(function (id) { $(id).textContent = '0'; });
      $('r-left').textContent = fmt(r.alkEq * 1000 * MG_CACO3_PER_MEQ, 0) + ' mg/L CaCO₃ (' + fmt(r.alkEq * 1000, 2) + ' meq/L)';
      $('r-nbar').textContent = '–';
      $('viz-caption').textContent = 'pH ' + r.ph0 + ' is already at or below the target pH ' + r.ph1;
      drawViz(r);
      CalcShare.writeParams(getState());
      return;
    }
    if (r.notes.length) { notice.textContent = r.notes.join(' '); notice.hidden = false; }
    else notice.hidden = true;

    $('r-amount').textContent = amountText(r);
    const perL = (liquid ? r.mL : r.gProduct) / r.volL;
    const unitShort = liquid ? 'mL' : 'g';
    $('r-per100').textContent = fmt(perL * 100) + ' ' + unitShort + ' per 100 L';
    $('r-pergal').textContent = fmt(perL * ML_PER_USGAL / 1000) + ' ' + unitShort + ' per US gal';
    $('r-floz').textContent = liquid
      ? fmt(perL * ML_PER_USGAL / ML_PER_FLOZ) + ' fl oz per 1,000 US gal'
      : fmt(perL * ML_PER_USGAL / 28.349523125) + ' oz per 1,000 US gal';
    $('r-h').textContent = fmt(r.acidEq * 1000, 2) + ' mmol/L · ' + fmt(r.molH) + ' mol total';
    const removedMg = r.acidEq * 1000 * MG_CACO3_PER_MEQ;
    $('r-removed').textContent = fmt(removedMg, 0) + ' mg/L CaCO₃ (' + fmt(r.alkEq > 0 ? r.acidEq / r.alkEq * 100 : 0, 0) + '% of start)';
    const left = Math.max(0, r.alkLeftEq);
    $('r-left').textContent = fmt(left * 1000 * MG_CACO3_PER_MEQ, 0) + ' mg/L CaCO₃ (' + fmt(left * 1000, 2) + ' meq/L)';
    $('r-nut').textContent = nutrientText(r);
    $('r-nbar').textContent = fmt(r.nbar, 2) + ' H⁺ per molecule';

    $('viz-caption').textContent = 'pH ' + r.ph0 + ' → ' + r.ph1 + ' needs ' + fmt(r.acidEq * 1000, 2) + ' meq/L of acid · ' + amountText(r) + ' of ' + r.acid.short + ' for ' + typed('vol');
    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG: titration curve ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480, VH = 320;
  const PAD = { l: 62, r: 18, t: 18, b: 50 };

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function niceStep(range) {
    const raw = range / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const c = r.c;
    const ph0 = isFinite(r.ph0) ? Math.min(11, Math.max(3, r.ph0)) : 7;
    const ph1 = isFinite(r.ph1) ? Math.min(9, Math.max(3, r.ph1)) : 6;
    const CT = r.ok ? r.CT : 0;
    const alkEq = r.ok ? r.alkEq : 0;
    const phLow = Math.max(3, Math.min(ph1 - 0.8, 4.3));
    const yMax = Math.ceil(Math.max(ph0, ph1, c.pK1 + 1) + 0.2);
    const yMin = Math.floor(phLow);
    function acidTo(pH) { return Math.max(0, alkEq - alkAt(pH, CT, c)) * 1000; } // meq/L
    let xMax = r.ok ? acidTo(phLow) * 1.05 : 1;
    if (!(xMax > 0.01)) xMax = 0.01;
    const step = niceStep(xMax);
    xMax = Math.ceil(xMax / step - 1e-9) * step;

    const x0 = PAD.l, x1 = VW - PAD.r, yTop = PAD.t, yBot = VH - PAD.b;
    const X = function (v) { return x0 + (v / xMax) * (x1 - x0); };
    const Y = function (p) { return yBot - (p - yMin) / (yMax - yMin) * (yBot - yTop); };

    // pH colour strip (universal indicator style)
    const defs = el('defs', {});
    const grad = el('linearGradient', { id: 'ph-grad', x1: 0, y1: 0, x2: 0, y2: 1 }, undefined, defs);
    const stops = [[14, '#3b2a8f'], [11, '#2f5fd0'], [9, '#2aa198'], [7, '#4caf50'], [6, '#b5c934'], [5, '#f2c12e'], [4, '#f08a24'], [3, '#e4572e'], [0, '#c0392b']];
    stops.forEach(function (s) {
      const off = (yMax - s[0]) / (yMax - yMin);
      if (off < -0.3 || off > 1.3) return;
      el('stop', { offset: Math.min(1, Math.max(0, off)), 'stop-color': s[1] }, undefined, grad);
    });
    el('rect', { x: 8, y: yTop, width: 10, height: yBot - yTop, rx: 3, fill: 'url(#ph-grad)', opacity: 0.85 });

    // bicarbonate buffer zone: pK1 ± 1
    const bTop = Math.min(yMax, c.pK1 + 1), bBot = Math.max(yMin, c.pK1 - 1);
    if (bTop > bBot) {
      el('rect', { x: x0, y: Y(bTop), width: x1 - x0, height: Y(bBot) - Y(bTop), class: 'ph-band' });
      el('line', { x1: x0, y1: Y(c.pK1), x2: x1, y2: Y(c.pK1), class: 'ph-pk' });
      el('text', { x: x1 - 4, y: Y(bTop) + 14, 'text-anchor': 'end', class: 'ph-band-text' }, 'HCO₃⁻ ⇄ CO₂ buffer zone');
      el('text', { x: x1 - 4, y: Y(c.pK1) - 4, 'text-anchor': 'end', class: 'dim-text' }, 'pK₁ ' + c.pK1.toFixed(2));
    }

    // axes and grid
    for (let p = yMin; p <= yMax + 1e-9; p++) {
      el('line', { x1: x0, y1: Y(p), x2: x1, y2: Y(p), class: 'ph-grid' });
      el('text', { x: x0 - 8, y: Y(p) + 4, 'text-anchor': 'end', class: 'dim-text' }, String(p));
    }
    for (let v = 0; v <= xMax + 1e-9; v += step) {
      el('line', { x1: X(v), y1: yBot, x2: X(v), y2: yBot + 4, class: 'dim' });
      el('text', { x: X(v), y: yBot + 17, 'text-anchor': 'middle', class: 'dim-text' }, fmt(v, step < 0.1 ? 2 : step < 1 ? 1 : 0));
    }
    el('path', { d: 'M' + x0 + ',' + yTop + ' L' + x0 + ',' + yBot + ' L' + x1 + ',' + yBot, class: 'ph-axis' });
    el('text', { x: (x0 + x1) / 2, y: VH - 10, 'text-anchor': 'middle', class: 'dim-text' }, 'Acid added (meq/L = mmol H⁺/L)');
    const yMid = (yTop + yBot) / 2;
    el('text', { x: 34, y: yMid, 'text-anchor': 'middle', class: 'dim-text', transform: 'rotate(-90 34 ' + yMid + ')' }, 'pH');

    if (!r.ok) return;

    // titration curve from current pH down to phLow
    const N = 160;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const p = ph0 - (ph0 - phLow) * i / N;
      const v = acidTo(p);
      if (v > xMax) break;
      d += (i ? ' L' : 'M') + X(v).toFixed(1) + ',' + Y(p).toFixed(1);
    }
    el('path', { d: d, class: 'ph-curve' });

    // current point
    el('circle', { cx: X(0), cy: Y(ph0), r: 5.5, class: 'ph-pt-cur' });
    el('text', { x: X(0) + 10, y: Y(ph0) - 8, 'text-anchor': 'start', class: 'ph-label' }, 'now pH ' + r.ph0);

    if (!r.noAcid) {
      const dv = r.acidEq * 1000;
      const tx = X(dv), ty = Y(ph1);
      el('line', { x1: x0, y1: ty, x2: tx, y2: ty, class: 'depth-line' });
      el('line', { x1: tx, y1: ty, x2: tx, y2: yBot, class: 'depth-line' });
      el('circle', { cx: tx, cy: ty, r: 5.5, class: 'ph-pt-tgt' });
      const right = tx > (x0 + x1) / 2;
      el('text', { x: tx + (right ? -10 : 10), y: ty - 10, 'text-anchor': right ? 'end' : 'start', class: 'ph-label' }, 'target pH ' + r.ph1);
      el('text', { x: tx + (right ? -6 : 6), y: yBot - 8, 'text-anchor': right ? 'end' : 'start', class: 'depth-text' }, fmt(dv, 2) + ' meq/L');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'pH Adjustment Calculator',
      'Water: ' + typed('vol') + ', alkalinity ' + typed('alk') + ', pH ' + $('ph0').value + ' → ' + $('ph1').value + ', ' + fmt(r.tC, 1) + ' °C',
      'Acid: ' + r.acid.name
    ];
    if (!r.ok) lines.push(r.error);
    else if (r.noAcid) lines.push('No acid needed (target pH is not below current pH).');
    else {
      const liquid = !!r.acid.rho;
      const perL = (liquid ? r.mL : r.gProduct) / r.volL;
      lines.push('Acid to add: ' + amountText(r) + ' (' + fmt(perL * 100) + (liquid ? ' mL' : ' g') + ' per 100 L)');
      lines.push('Acid needed: ' + fmt(r.acidEq * 1000, 2) + ' meq/L H+ (' + fmt(r.molH) + ' mol total)');
      lines.push('Alkalinity left: ' + fmt(Math.max(0, r.alkLeftEq) * 1000 * MG_CACO3_PER_MEQ, 0) + ' mg/L CaCO3');
      lines.push('Nutrient added: ' + nutrientText(r));
      lines.push('Estimate only: add in steps and measure pH. Always add acid to water.');
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  ['vol', 'alk', 'ph0', 'ph1', 'temp'].forEach(function (id) { $(id).addEventListener('input', render); });
  acidSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'pH Adjustment Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    ['vol', 'alk', 'temp'].forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && (p[f] === '' || isFinite(parseFloat(p[f])))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.temp === undefined && p.vol !== undefined) $('temp').value = ''; // temperature left blank in shared link
    ['ph0', 'ph1'].forEach(function (f) { if (p[f] !== undefined && isFinite(parseFloat(p[f]))) $(f).value = p[f]; });
    if (p.acid && ACIDS[p.acid]) acidSel.value = p.acid;
    if (p.out) {
      if (CalcUnits.unitDef('volume', p.out)) outVol.value = p.out;
      else if (CalcUnits.unitDef('mass', p.out)) outMass.value = p.out;
    }
    render();
  })();
})();
