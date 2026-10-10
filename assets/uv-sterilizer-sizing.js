// UV Filtration Sizing Calculator: UV dose vs flow, UVT and lamp aging; live SVG; shareable URL state.
(function () {
  'use strict';

  // Required doses (mJ/cm²). See the Sources list on the page.
  const ORGS = [
    { id: 'bact', name: 'Bacterial fish pathogens (design dose)', short: 'Bacteria (design)', dose: 30,
      hint: 'Widely recommended design dose for bacteria (rule of thumb).' },
    { id: 'isav', name: 'ISA virus, 3-log', short: 'ISAV 3-log', dose: 7.7,
      hint: '99.9% inactivation, Liltved et al. 2006.' },
    { id: 'crypto', name: 'Cryptosporidium, 3-log (drinking-water ref.)', short: 'Crypto 3-log', dose: 12,
      hint: 'US EPA table, 40 CFR 141.720.' },
    { id: 'ich', name: 'Ich (Ichthyophthirius) free-swimming stages', short: 'Ich free stages', dose: 100,
      hint: '≈92 stopped spread (Gratzek et al. 1983); 100 is a rule of thumb.' },
    { id: 'noda', name: 'Nodavirus (AHNV), 3-log', short: 'Nodavirus 3-log', dose: 105,
      hint: '99.9% inactivation, Liltved et al. 2006.' },
    { id: 'virus4', name: 'Viruses, 4-log (EPA, adenovirus basis)', short: 'Viruses 4-log', dose: 186,
      hint: 'US EPA table, 40 CFR 141.720.' },
    { id: 'ipnv', name: 'IPN virus, 3-log', short: 'IPNV 3-log', dose: 246,
      hint: '99.9% inactivation, Liltved et al. 2006.' },
    { id: 'custom', name: 'Custom dose', short: 'Custom target', dose: null,
      hint: 'Enter the dose your target needs.' }
  ];

  const DEFAULTS = {
    volume: [5000, 'L'], passes: [1, ''], flow: [5000, 'Lph'], target: [30, ''], uvt: [80, ''],
    rdose: [30, ''], rflow: [8000, 'Lph'], ruvt: [95, ''], lampw: [12, 'W'], gap: [2, 'cm'], eol: [80, '']
  };
  const FIELDS = Object.keys(DEFAULTS);

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const orgSel = $('org');
  const outSel = $('outflow');
  const flowButtons = document.querySelectorAll('#flowmode-group button');
  const specButtons = document.querySelectorAll('#spec-group button');

  let flowmode = 'vol';
  let spec = 'rated';

  ORGS.forEach(function (o) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.name + (o.dose ? ' – ' + o.dose + ' mJ/cm²' : '');
    orgSel.appendChild(opt);
  });

  function orgById(id) {
    for (let i = 0; i < ORGS.length; i++) if (ORGS[i].id === id) return ORGS[i];
    return null;
  }

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function raw(id) { return parseFloat($(id).value); }
  function typed(id) {
    const v = raw(id);
    const u = CalcUnits.unitLabel(id);
    return (isFinite(v) ? v : 0) + (u ? ' ' + u : '');
  }
  function flowOut(lps) {
    return fmt(CalcUnits.convert('flow', lps, 'Lps', outSel.value)) + ' ' + CalcUnits.label('flow', outSel.value);
  }

  // ---------- Physics ----------
  // Average relative intensity across a water layer g (cm) with transmittance uvt (%/cm).
  function waterFactor(uvtPct, gCm) {
    const a = -Math.log10(uvtPct / 100); // absorbance per cm
    const x = a * gCm;
    if (x < 1e-9) return 1;
    return (1 - Math.pow(10, -x)) / (x * Math.LN10);
  }

  function compute() {
    const r = { errors: [] };
    // Flow in L/s
    if (flowmode === 'vol') {
      const V = CalcUnits.base('volume'), N = CalcUnits.base('passes');
      r.Q = V * N / 3600;
      if (!(V > 0 && N > 0)) r.errors.push('Enter the system volume and the number of passes per hour.');
    } else {
      r.Q = CalcUnits.base('flow');
      if (!(r.Q > 0)) r.errors.push('Enter the flow through the UV unit.');
    }
    r.target = CalcUnits.base('target');
    if (!(r.target > 0)) r.errors.push('Enter the required UV dose.');
    const uvt = raw('uvt');
    if (!(uvt > 0 && uvt <= 100)) r.errors.push('UV transmittance must be between 0 and 100%.');
    r.gCm = CalcUnits.base('gap') * 100;
    if (!(r.gCm > 0)) r.errors.push('Enter the water gap between the sleeve and the housing wall.');
    const eol = raw('eol');
    if (!(eol > 0 && eol <= 100)) r.errors.push('Lamp output at end of life must be between 0 and 100%.');
    r.feol = eol / 100;

    if (spec === 'rated') {
      r.Dr = CalcUnits.base('rdose');
      r.Qr = CalcUnits.base('rflow');
      const ruvt = raw('ruvt');
      if (!(r.Dr > 0 && r.Qr > 0)) r.errors.push('Enter the unit\'s rated dose and rated flow.');
      if (!(ruvt > 0 && ruvt <= 100)) r.errors.push('The rating\'s UVT must be between 0 and 100%.');
      if (r.errors.length) return r;
      r.wf = waterFactor(uvt, r.gCm);
      r.wfr = waterFactor(ruvt, r.gCm);
      r.uvtFactor = r.wf / r.wfr;
      r.dose = r.Dr * (r.Qr / r.Q) * r.uvtFactor;
    } else {
      r.P = CalcUnits.base('lampw');
      if (!(r.P > 0)) r.errors.push('Enter the lamp\'s UV-C output in watts.');
      if (r.errors.length) return r;
      r.wf = waterFactor(uvt, r.gCm);
      r.wfr = 1;
      r.uvtFactor = r.wf;
      const Qcm3s = r.Q * 1000;
      r.dose = r.P * r.gCm * r.wf / Qcm3s * 1000; // mJ/cm²
    }
    r.doseEol = r.dose * r.feol;
    r.qmax = r.Q * r.doseEol / r.target;
    r.units = Math.ceil(r.Q / r.qmax - 1e-9);
    r.meetsEol = r.doseEol >= r.target;
    r.meetsNew = r.dose >= r.target;
    if (spec === 'rated') {
      // Rated flow (at the rated dose and UVT) a unit needs so it still meets the target at end of life.
      r.reqRatedFlow = r.Q * r.target / (r.Dr * r.feol * r.uvtFactor);
    } else {
      r.reqUvcW = r.target * r.Q * 1000 / (r.gCm * r.wf * r.feol * 1000);
    }
    return r;
  }

  // ---------- UI state ----------
  function setFlowmode(m) {
    flowmode = m;
    flowButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.flowmode === m)); });
    document.querySelectorAll('[data-flowmode-for]').forEach(function (el) { el.hidden = el.dataset.flowmodeFor !== m; });
  }
  function setSpec(s) {
    spec = s;
    specButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.spec === s)); });
    document.querySelectorAll('[data-spec-for]').forEach(function (el) { el.hidden = el.dataset.specFor !== s; });
  }
  function setOrg(id, keepDose) {
    const o = orgById(id) || ORGS[0];
    orgSel.value = o.id;
    if (o.dose && !keepDose) $('target').value = o.dose;
    $('target-hint').textContent = o.hint;
  }

  function getState() {
    const st = { flowmode: flowmode, spec: spec, org: orgSel.value, out: outSel.value };
    FIELDS.forEach(function (f) {
      const wrap = $(f).closest('.field');
      if (wrap.hidden) return;
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1] || undefined); });
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const ok = r.errors.length === 0 && isFinite(r.dose);
    const notice = $('notice');
    const ids = ['r-dose', 'r-meets', 'r-flow', 'r-eol', 'r-qmax', 'r-uvtf', 'r-size', 'r-size2'];

    if (!ok) {
      notice.textContent = r.errors[0] || 'Check the inputs.';
      notice.hidden = false;
      ids.forEach(function (id) { $(id).textContent = '–'; $(id).className = 'v'; });
      $('r-dose').className = 'value';
      $('r-dose-sub').textContent = '';
      $('viz-caption').textContent = 'Enter the inputs to draw the chart';
      drawViz(null);
      CalcShare.writeParams(getState());
      return;
    }

    const msgs = [];
    if (!r.meetsEol && r.meetsNew) msgs.push('Meets the target only while the lamp is new. Dose drops below the target as the lamp ages.');
    else if (!r.meetsEol) msgs.push('Delivered dose is below the target. Reduce the flow or use a larger unit.');
    if (raw('uvt') < 60) msgs.push('UVT below about 60% is very poor water for UV. Improve filtration first.');
    if (spec === 'lamp') msgs.push('Lamp-watts method: approximate average dose. Prefer a manufacturer rating where one exists.');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    $('r-dose').textContent = fmt(r.dose) + ' mJ/cm²';
    $('r-dose-sub').textContent = 'Target ' + fmt(r.target) + ' mJ/cm² · ' + fmt(r.dose / r.target * 100, 0) + '% of target';
    const meets = $('r-meets');
    if (r.meetsEol) { meets.textContent = 'Yes, even at end of lamp life'; meets.className = 'v verdict-ok'; }
    else if (r.meetsNew) { meets.textContent = 'Only with a new lamp'; meets.className = 'v verdict-bad'; }
    else { meets.textContent = 'No'; meets.className = 'v verdict-bad'; }

    let flowText = flowOut(r.Q);
    if (flowmode === 'vol') flowText += ' (' + fmt(raw('passes')) + '×/h)';
    $('r-flow').textContent = flowText;
    $('r-eol').textContent = fmt(r.doseEol) + ' mJ/cm² (' + fmt(r.feol * 100, 0) + '%)';
    $('r-qmax').textContent = flowOut(r.qmax);
    $('r-uvtf').textContent = spec === 'rated'
      ? '×' + fmt(r.uvtFactor, 3) + ' vs rating'
      : 'avg ' + fmt(r.wf * 100, 0) + '% of sleeve intensity';

    if (spec === 'rated') {
      $('r-size-label').textContent = 'Recommended unit size';
      $('r-size').textContent = 'rated ≥ ' + flowOut(r.reqRatedFlow) + ' at ' + fmt(r.Dr) + ' mJ/cm² (' + fmt(raw('ruvt')) + '% UVT)';
      $('r-size2-label').textContent = 'Units like yours needed (in parallel)';
    } else {
      $('r-size-label').textContent = 'UV-C output needed';
      const w = r.reqUvcW;
      $('r-size').textContent = fmt(w) + ' W UV-C (≈ ' + fmt(w / 0.4, 0) + '–' + fmt(w / 0.3, 0) + ' W electrical)';
      $('r-size2-label').textContent = 'Lamps like yours needed';
    }
    $('r-size2').textContent = String(r.units);

    const o = orgById(orgSel.value);
    $('viz-caption').textContent = fmt(r.dose) + ' mJ/cm² new, ' + fmt(r.doseEol) + ' at end of life vs ' +
      fmt(r.target) + ' needed (' + (o ? o.short : 'target') + ')';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function drawReactor(r) {
    const x0 = 40, x1 = 440, yT = 44, yB = 112, cy = (yT + yB) / 2;
    const sleeveH = 22, lampH = 10;
    // inlet / outlet pipes
    el('rect', { class: 'housing', x: 8, y: yB - 18, width: 36, height: 14 });
    el('rect', { class: 'housing', x: 436, y: yT + 4, width: 36, height: 14 });
    el('rect', { class: 'housing', x: x0, y: yT, width: x1 - x0, height: yB - yT, rx: 10 });

    // UV glow falling off across the gap (depends on UVT and lamp age)
    if (r) {
      const uvt = raw('uvt') / 100;
      const bands = 6;
      const gapPx = (yB - yT - sleeveH) / 2 - 2;
      for (let i = 0; i < bands; i++) {
        const depthCm = (i + 0.5) / bands * r.gCm;
        const op = 0.55 * Math.pow(uvt, depthCm);
        const h = gapPx / bands;
        el('rect', { class: 'glow', x: x0 + 30, y: cy - sleeveH / 2 - (i + 1) * h, width: x1 - x0 - 60, height: h + 0.5, 'fill-opacity': op.toFixed(3) });
        el('rect', { class: 'glow', x: x0 + 30, y: cy + sleeveH / 2 + i * h, width: x1 - x0 - 60, height: h + 0.5, 'fill-opacity': op.toFixed(3) });
      }
      // flow streaks: closer spacing = more flow (log scaled against max flow)
      const ratio = Math.max(0.15, Math.min(3, r.Q / r.qmax));
      const dash = 10, gapLen = Math.max(4, 26 / ratio);
      [yT + 8, yB - 8].forEach(function (y) {
        el('line', { class: 'flow-dash', x1: x0 + 8, y1: y, x2: x1 - 8, y2: y, 'stroke-dasharray': dash + ' ' + gapLen.toFixed(1) });
      });
    }
    // sleeve and lamp
    el('rect', { class: 'sleeve', x: x0 + 24, y: cy - sleeveH / 2, width: x1 - x0 - 48, height: sleeveH, rx: sleeveH / 2 });
    el('rect', { class: 'lamp', x: x0 + 32, y: cy - lampH / 2, width: x1 - x0 - 64, height: lampH, rx: lampH / 2 });
    // arrows
    el('path', { class: 'arrow', d: 'M14,' + (yB - 25) + ' l12,-6 v12 z' });
    el('path', { class: 'arrow', d: 'M462,' + (yT + 11) + ' l12,-6 v12 z', transform: 'translate(0,0)' });

    if (r) {
      el('text', { x: x0, y: 30, class: 'head-text' }, 'Flow ' + flowOut(r.Q));
      el('text', { x: x1, y: 30, 'text-anchor': 'end', class: 'dose-text' }, fmt(r.dose) + ' mJ/cm² delivered');
      el('text', { x: 240, y: yB + 18, 'text-anchor': 'middle', class: 'dim-text' },
        'UVT ' + fmt(raw('uvt')) + '% · gap ' + fmt(raw('gap')) + ' ' + CalcUnits.unitLabel('gap') + ' · end of life ' + fmt(r.doseEol) + ' mJ/cm²');
    }
  }

  function drawBars(r) {
    const top = 160, rowH = 24, lx = 140, px0 = 148, px1 = 462;
    const sel = orgSel.value;
    const rows = ORGS.filter(function (o) { return o.dose; }).map(function (o) { return { id: o.id, short: o.short, dose: o.dose }; });
    const target = CalcUnits.base('target');
    if (sel === 'custom' && target > 0) rows.push({ id: 'custom', short: 'Custom target', dose: target });
    rows.sort(function (a, b) { return a.dose - b.dose; });

    let maxV = 300;
    if (r) maxV = Math.max(maxV, r.dose * 1.15);
    rows.forEach(function (row) { maxV = Math.max(maxV, row.dose * 1.15); });
    const minV = 1;
    const lmax = Math.log10(maxV), lmin = Math.log10(minV);
    const X = function (v) { return px0 + (Math.log10(Math.max(minV, v)) - lmin) / (lmax - lmin) * (px1 - px0); };
    const bottom = top + rows.length * rowH;

    el('text', { x: 8, y: top - 16, class: 'head-text' }, 'Dose needed vs delivered (mJ/cm², log scale)');
    [1, 3, 10, 30, 100, 300, 1000, 3000, 10000].forEach(function (t) {
      if (t > maxV) return;
      el('line', { class: 'grid', x1: X(t), y1: top - 4, x2: X(t), y2: bottom });
      el('text', { x: X(t), y: bottom + 14, 'text-anchor': 'middle', class: 'dim-text' }, fmt(t));
    });

    rows.forEach(function (row, i) {
      const y = top + i * rowH;
      const isSel = row.id === sel || (sel === 'custom' && row.id === 'custom');
      const met = r ? r.doseEol >= row.dose : false;
      el('text', { x: lx, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: isSel ? 'bar-text-sel' : 'bar-text' }, row.short);
      el('rect', {
        class: (met ? 'bar-ok' : 'bar-bad') + (isSel ? ' bar-sel' : ''),
        x: px0, y: y + 4, width: Math.max(1, X(row.dose) - px0), height: rowH - 8, rx: 3
      });
      const vx = X(row.dose) + 4;
      el('text', { x: vx, y: y + rowH / 2 + 4, class: 'dim-text' }, fmt(row.dose) + (r ? (met ? ' ✓' : '') : ''));
    });

    if (r) {
      const xn = X(r.dose), xe = X(r.doseEol);
      el('line', { class: 'dose-eol', x1: xe, y1: top - 6, x2: xe, y2: bottom + 2 });
      el('line', { class: 'dose-line', x1: xn, y1: top - 6, x2: xn, y2: bottom + 2 });
      el('text', { x: 8, y: bottom + 34, class: 'dose-text' }, '━ new lamp ' + fmt(r.dose) + '   ┅ end of life ' + fmt(r.doseEol));
      el('text', { x: 472, y: bottom + 34, 'text-anchor': 'end', class: 'dim-text' }, '✓ met at end of life');
    }
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawReactor(r);
    drawBars(r);
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const o = orgById(orgSel.value);
    const lines = ['UV Filtration Sizing Calculator'];
    if (flowmode === 'vol') lines.push('System volume: ' + typed('volume') + ', ' + typed('passes') + ' passes per hour');
    else lines.push('Flow through UV: ' + typed('flow'));
    lines.push('Target: ' + (o ? o.name : 'custom') + ', ' + typed('target') + ' mJ/cm²');
    lines.push('Water UVT: ' + typed('uvt') + '%, water gap ' + typed('gap') + ', lamp end-of-life output ' + typed('eol') + '%');
    if (spec === 'rated') lines.push('Unit rating: ' + typed('rdose') + ' mJ/cm² at ' + typed('rflow') + ' (' + typed('ruvt') + '% UVT)');
    else lines.push('Lamp UV-C output: ' + typed('lampw') + ' (approximate method)');
    if (r.errors.length || !isFinite(r.dose)) {
      lines.push('Incomplete inputs: ' + (r.errors[0] || ''));
    } else {
      lines.push('Flow through UV: ' + flowOut(r.Q));
      lines.push('Delivered dose: ' + fmt(r.dose) + ' mJ/cm² new lamp, ' + fmt(r.doseEol) + ' mJ/cm² at end of life');
      lines.push('Meets target: ' + (r.meetsEol ? 'yes, even at end of lamp life' : r.meetsNew ? 'only with a new lamp' : 'no'));
      lines.push('Max flow for target (end of life): ' + flowOut(r.qmax));
      if (spec === 'rated') lines.push('Recommended: unit rated ≥ ' + flowOut(r.reqRatedFlow) + ' at ' + fmt(r.Dr) + ' mJ/cm²; units like this needed: ' + r.units);
      else lines.push('UV-C output needed: ' + fmt(r.reqUvcW) + ' W; lamps like this needed: ' + r.units);
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  flowButtons.forEach(function (b) { b.addEventListener('click', function () { setFlowmode(b.dataset.flowmode); render(); }); });
  specButtons.forEach(function (b) { b.addEventListener('click', function () { setSpec(b.dataset.spec); render(); }); });
  FIELDS.forEach(function (f) { $(f).addEventListener('input', render); });
  $('target').addEventListener('input', function () {
    const o = orgById(orgSel.value);
    if (o && o.dose && parseFloat($('target').value) !== o.dose) setOrg('custom', true);
  });
  orgSel.addEventListener('change', function () { setOrg(orgSel.value); render(); });
  outSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () { CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied'); });
  $('btn-copy').addEventListener('click', function () { CalcShare.copy(resultsText(), 'Results copied'); });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'UV Filtration Sizing Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    outSel.value = 'Lph';
    setFlowmode('vol');
    setSpec('rated');
    setOrg('bact');
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.out && CalcUnits.unitDef('flow', p.out)) outSel.value = p.out;
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    setFlowmode(p.flowmode === 'flow' ? 'flow' : 'vol');
    setSpec(p.spec === 'lamp' ? 'lamp' : 'rated');
    const org = orgById(p.org) ? p.org : 'bact';
    // Keep a shared target dose; otherwise use the preset's dose.
    setOrg(org, p.target !== undefined && isFinite(parseFloat(p.target)));
    render();
  })();
})();
