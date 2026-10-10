// Mineralization Tank Calculator: sludge mass balance, tank sizing, live SVG, shareable URL state.
(function () {
  'use strict';

  // Rule-of-thumb and example defaults (see the article on the page for sources).
  const DEFAULTS = {
    feed: [1, 'kg'],
    solids: [25, ''],
    capture: [80, ''],
    conc: [1, 'pct'],
    hrt: [20, 'd'],
    free: [15, '']
  };
  const FIELDS = Object.keys(DEFAULTS);
  const UNIT_FIELDS = ['feed', 'conc', 'hrt'];
  const RANGE = [5, 30]; // reported mineralization cycle length, days (Delaide et al., 2019)
  const DAY_S = 86400;

  const $ = function (id) { return document.getElementById(id); };
  const inputs = {};
  FIELDS.forEach(function (f) { inputs[f] = $(f); });
  const outVol = $('out-vol');
  const outMass = $('out-mass');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function vol(L) {
    return fmt(CalcUnits.convert('volume', L, 'L', outVol.value)) + ' ' + CalcUnits.label('volume', outVol.value);
  }
  function mass(kg) {
    return fmt(CalcUnits.convert('mass', kg, 'kg', outMass.value)) + ' ' + CalcUnits.label('mass', outMass.value);
  }
  function typed(f) {
    const v = parseFloat(inputs[f].value);
    const u = UNIT_FIELDS.indexOf(f) !== -1 ? ' ' + CalcUnits.unitLabel(f) : '%';
    return (isFinite(v) ? v : 0) + u;
  }
  function pct(f) {
    const v = parseFloat(inputs[f].value);
    return isFinite(v) ? v : NaN;
  }

  // ---------- Calculation (kg, L, days) ----------
  function compute() {
    const feedKg = CalcUnits.base('feed');
    const solidsPct = pct('solids');
    const capPct = pct('capture');
    const concMgL = CalcUnits.base('conc');   // mg/L = g/m³
    const hrtD = CalcUnits.base('hrt') / DAY_S;
    let freePct = pct('free');
    if (!isFinite(freePct)) freePct = 0;      // optional

    const errors = [];
    if (!(feedKg > 0)) errors.push('Enter the feed given per day.');
    if (!(solidsPct > 0 && solidsPct <= 100)) errors.push('Solid waste must be between 0 and 100% of feed.');
    if (!(capPct > 0 && capPct <= 100)) errors.push('Capture efficiency must be between 0 and 100%.');
    if (!(concMgL > 0)) errors.push('Enter the sludge concentration.');
    else if (concMgL > 200000) errors.push('Sludge concentration above 20% solids is not a pumpable sludge; check the value and unit.');
    if (!(hrtD > 0)) errors.push('Enter a retention time.');
    if (freePct < 0 || freePct >= 90) errors.push('Freeboard must be between 0 and 90% of the tank depth.');
    if (errors.length) return { ok: false, errors: errors };

    const producedKg = feedKg * solidsPct / 100;
    const dryKg = producedKg * capPct / 100;
    const concKgL = concMgL / 1e6;            // kg per L
    const sludgeL = dryKg / concKgL;          // L/day
    const workL = sludgeL * hrtD;
    const totalL = workL / (1 - freePct / 100);
    return {
      ok: true, feedKg: feedKg, producedKg: producedKg, dryKg: dryKg, concMgL: concMgL,
      sludgeL: sludgeL, hrtD: hrtD, workL: workL, totalL: totalL, freePct: freePct,
      loadKg: dryKg * hrtD
    };
  }

  function rangeText(d) {
    if (d < RANGE[0]) return 'Below range (' + fmt(d, 1) + ' d)';
    if (d > RANGE[1]) return 'Above range (' + fmt(d, 1) + ' d)';
    return 'Within range (' + fmt(d, 1) + ' d)';
  }

  // ---------- State ----------
  function getState() {
    const st = { outv: outVol.value, outm: outMass.value };
    FIELDS.forEach(function (f) {
      st[f] = inputs[f].value;
      if (f === 'free' && st[f] === '') st[f] = '0'; // optional field: keep "no freeboard" in links
      if (UNIT_FIELDS.indexOf(f) !== -1) st[f + '_u'] = CalcUnits.unit(f);
    });
    return st;
  }

  function applyDefaults() {
    FIELDS.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1] || undefined); });
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    const ids = ['r-total', 'r-work', 'r-dry', 'r-sludge', 'r-return', 'r-load', 'r-range'];

    if (!r.ok) {
      notice.textContent = r.errors.join(' ');
      notice.hidden = false;
      ids.forEach(function (id) { $(id).textContent = '–'; });
      $('viz-caption').textContent = 'Enter all inputs to size the tank';
      drawViz(null);
      CalcShare.writeParams(getState());
      return;
    }

    const warn = [];
    if (r.hrtD < RANGE[0]) warn.push('Retention time is shorter than the 5–30 days reported for mineralization; digestion may be incomplete.');
    else if (r.hrtD > RANGE[1]) warn.push('Retention time is longer than the 5–30 days usually reported; the tank will be larger than typical.');
    if (r.concMgL < 1000) warn.push('Sludge under 0.1% solids is very dilute; thickening it first (settle and decant) would shrink the tank a lot.');
    notice.textContent = warn.join(' ');
    notice.hidden = warn.length === 0;

    $('r-total').textContent = vol(r.totalL);
    $('r-work').textContent = vol(r.workL);
    $('r-dry').textContent = mass(r.dryKg) + '/day';
    $('r-sludge').textContent = vol(r.sludgeL) + '/day';
    $('r-return').textContent = vol(r.sludgeL) + '/day';
    $('r-load').textContent = mass(r.loadKg);
    $('r-range').textContent = rangeText(r.hrtD);

    $('viz-caption').textContent = vol(r.sludgeL) + '/day × ' + fmt(r.hrtD, 1) + ' days = ' + vol(r.workL) +
      ' working · ' + vol(r.totalL) + ' total';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  }
  function text(x, y, t, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, t);
  }
  function arrow(x1, y1, x2, y2) {
    el('path', { class: 'flow', d: 'M' + x1 + ',' + y1 + ' L' + (x2 - 7) + ',' + y2 });
    el('path', { class: 'flow-head', d: 'M' + x2 + ',' + y2 + ' l-8,-4.5 v9 z' });
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // --- Clarifier (fixed size, cone bottom) ---
    const cx0 = 18, cx1 = 92, cTop = 60, cWallBot = 120, cTip = 158;
    const cMid = (cx0 + cx1) / 2;
    text(cMid, 40, 'Clarifier', 'middle', 'title-text');
    el('path', { class: 'clar-fill', d: 'M' + cx0 + ',' + (cTop + 10) + ' L' + cx1 + ',' + (cTop + 10) + ' L' + cx1 + ',' + cWallBot + ' L' + cMid + ',' + cTip + ' L' + cx0 + ',' + cWallBot + ' Z' });
    el('path', { class: 'sludge', d: 'M' + (cMid - 22) + ',' + (cTip - 22) + ' L' + (cMid + 22) + ',' + (cTip - 22) + ' L' + cMid + ',' + cTip + ' Z' });
    el('path', { class: 'tank-line', d: 'M' + cx0 + ',' + cTop + ' L' + cx0 + ',' + cWallBot + ' L' + cMid + ',' + cTip + ' L' + cx1 + ',' + cWallBot + ' L' + cx1 + ',' + cTop });
    arrow(2, cTop + 18, cx0 + 14, cTop + 18);
    text(cMid, cTop + 36, 'fish water', 'middle', 'small-text');

    // --- Mineralization tank, size on a log scale of total volume ---
    const tBottom = 196;
    let frac = 0.5;
    if (r) {
      const lo = Math.log10(20), hi = Math.log10(100000);
      frac = Math.max(0, Math.min(1, (Math.log10(Math.max(r.totalL, 1e-9)) - lo) / (hi - lo)));
    }
    const tW = 90 + 130 * frac;
    const tH = 70 + 80 * frac;
    const tx0 = 315 - tW / 2;
    const tx1 = tx0 + tW;
    const tTop = tBottom - tH;

    // sludge pipe from cone tip to tank
    const pipeY = cTip + 10;
    el('path', { class: 'flow', d: 'M' + cMid + ',' + cTip + ' L' + cMid + ',' + pipeY + ' L' + (tx0 - 18) + ',' + pipeY });
    arrow(tx0 - 20, pipeY, tx0 - 4, pipeY);
    const sx = (cMid + tx0) / 2 + 4;
    text(sx, pipeY + 15, 'sludge', 'middle', 'accent-text');
    if (r) text(sx, pipeY + 28, vol(r.sludgeL) + '/d', 'middle', 'accent-text');

    text((tx0 + tx1) / 2, tTop - 10, 'Mineralization tank', 'middle', 'title-text');

    const liqFrac = r ? 1 - r.freePct / 100 : 0.85;
    const yLiq = tBottom - tH * liqFrac;
    el('rect', { class: 'tank-glass', x: tx0, y: tTop, width: tW, height: tH });
    el('rect', { class: 'sludge', x: tx0, y: yLiq, width: tW, height: tBottom - yLiq });
    el('line', { class: 'sludge-top', x1: tx0, y1: yLiq, x2: tx1, y2: yLiq });

    // aeration bubbles
    const nb = Math.round(4 + 8 * frac);
    for (let i = 0; i < nb; i++) {
      const bx = tx0 + 12 + (tW - 24) * (i + 0.5) / nb;
      const by = tBottom - 10 - ((i * 37) % Math.max(10, (tBottom - yLiq - 18)));
      el('circle', { class: 'bubble', cx: bx, cy: by, r: 2.5 + (i % 3) });
    }
    el('line', { class: 'dim', x1: tx0 + 8, y1: tBottom - 4, x2: tx1 - 8, y2: tBottom - 4 });
    el('path', { class: 'tank-line', d: 'M' + tx0 + ',' + tTop + ' L' + tx0 + ',' + tBottom + ' L' + tx1 + ',' + tBottom + ' L' + tx1 + ',' + tTop });

    // freeboard line
    if (r && r.freePct > 0) {
      el('line', { class: 'tank-back', x1: tx0, y1: yLiq, x2: tx1, y2: yLiq });
    }

    // supernatant out to plants
    const outY = Math.max(yLiq + 8, tTop + 10);
    arrow(tx1, outY, tx1 + 40, outY);
    text(tx1 + 3, outY - 7, 'to plants', 'start', 'small-text');

    // volume labels
    if (r) {
      const lx = tx0 + 8;
      text(lx, yLiq + 16, 'Working ' + vol(r.workL), 'start', 'depth-text');
      text(tx1 - 6, tBottom + 15, 'Total ' + vol(r.totalL) + (r.freePct > 0 ? ' (' + fmt(r.freePct, 0) + '% freeboard)' : ''), 'end', 'small-text');
    }

    // --- Timeline of retention days ---
    const ax0 = 30, ax1 = 450, ay = 290;
    text(ax0, 236, 'Retention timeline (days)', 'start', 'title-text');
    const hrt = r ? r.hrtD : 0;
    const maxD = Math.max(35, Math.ceil(hrt * 1.1 / 5) * 5);
    const xOf = function (d) { return ax0 + (ax1 - ax0) * d / maxD; };

    // reported range band
    el('rect', { class: 'band', x: xOf(RANGE[0]), y: ay - 34, width: xOf(RANGE[1]) - xOf(RANGE[0]), height: 34 });
    text((xOf(RANGE[0]) + xOf(RANGE[1])) / 2, ay - 38, 'reported 5–30 d', 'middle', 'accent-text');

    // one block per daily sludge batch currently in the tank
    if (hrt > 0) {
      const days = Math.ceil(hrt);
      if (days <= 60) {
        for (let i = 0; i < days; i++) {
          const w = Math.min(1, hrt - i);
          const x = xOf(i) + 0.6;
          const bw = Math.max(0.6, xOf(i + w) - xOf(i) - 1.2);
          el('rect', { class: i === 0 ? 'day-new' : 'day', x: x, y: ay - 22, width: bw, height: 18, rx: 1.5 });
        }
      } else {
        el('rect', { class: 'day', x: xOf(0), y: ay - 22, width: xOf(hrt) - xOf(0), height: 18 });
      }
      el('line', { class: 'marker', x1: xOf(hrt), y1: ay - 28, x2: xOf(hrt), y2: ay + 4 });
    }

    el('line', { class: 'dim', x1: ax0, y1: ay, x2: ax1, y2: ay });
    const step = maxD <= 40 ? 5 : maxD <= 80 ? 10 : maxD <= 200 ? 25 : Math.ceil(maxD / 8 / 50) * 50;
    for (let d = 0; d <= maxD + 1e-9; d += step) {
      el('line', { class: 'dim', x1: xOf(d), y1: ay, x2: xOf(d), y2: ay + 4 });
      text(xOf(d), ay + 16, String(d));
    }
    if (r) {
      text(ax0, ay + 36, (Math.ceil(hrt) <= 60 ? 'Each block = one day of sludge (' + vol(r.sludgeL) + '); ' : '') +
        'oldest sludge leaves after ' + fmt(hrt, 1) + ' d', 'start', 'small-text');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const lines = [
      'Mineralization Tank Calculator',
      'Feed: ' + typed('feed') + '/day, solid waste ' + typed('solids') + ' of feed, capture ' + typed('capture') +
        ', sludge ' + typed('conc') + ', retention ' + typed('hrt') + ', freeboard ' + typed('free')
    ];
    if (r.ok) {
      lines.push(
        'Dry solids captured: ' + mass(r.dryKg) + '/day',
        'Sludge volume: ' + vol(r.sludgeL) + '/day',
        'Working volume: ' + vol(r.workL),
        'Total tank volume: ' + vol(r.totalL),
        'Retention time: ' + rangeText(r.hrtD) + ' of reported 5–30 days'
      );
    } else {
      lines.push(r.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  FIELDS.forEach(function (f) { inputs[f].addEventListener('input', render); });
  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Mineralization Tank Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    outVol.value = 'L';
    outMass.value = 'kg';
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    if (p.outv && CalcUnits.unitDef('volume', p.outv)) outVol.value = p.outv;
    if (p.outm && CalcUnits.unitDef('mass', p.outm)) outMass.value = p.outm;
    applyDefaults();
    FIELDS.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && (p[f] === '' || isFinite(parseFloat(p[f])))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, inputs[f].value, u);
    });
    render();
  })();
})();
