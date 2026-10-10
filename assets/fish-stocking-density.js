// Fish Stocking Density Calculator: biomass, kg/m³, capacity at a target density, live SVG tank + gauge.
(function () {
  'use strict';

  // Target densities in kg/m³ (= kg per 1,000 L). See the article for sources; all are rules of thumb.
  const PRESETS = {
    fao: { kgm3: 20, band: [10, 20], hint: 'FAO 589: do not exceed 20 kg per 1,000 L; 10–20 kg is the usual range for small-scale aquaponics.' },
    air: { kgm3: 30, hint: 'Approximate limit for oxygen supplied by air alone (about 30 kg/m³, some sources say 40–60). Rule of thumb.' },
    tilnew: { kgm3: 50, hint: 'Ebeling & Timmons: new tilapia growers should run at about half the expert density, ~50 kg/m³.' },
    tilexp: { kgm3: 100, hint: 'Experienced tilapia RAS with pure oxygen and full water treatment: 100–120 kg/m³.' },
    custom: { kgm3: null, hint: 'Enter the maximum density you want to stay under. Safe density depends on aeration, filtration, feeding and species.' }
  };
  const DEFAULTS = { vol: [1000, 'L'], count: [40, ''], weight: [400, 'g'], target: [20, 'kgm3'], preset: 'fao', dout: 'kgm3', mout: 'kg' };
  const KG_PER_LB = 0.45359237;
  const KGM3_PER_LBGAL = KG_PER_LB / 3.785411784 * 1000; // 119.826...

  const $ = function (id) { return document.getElementById(id); };
  const presetSel = $('preset');
  const doutSel = $('dout');
  const moutSel = $('mout');
  const svg = $('viz');

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function fmtInt(n) { return isFinite(n) ? Math.round(n).toLocaleString() : '–'; }

  function density(kgm3) {
    return fmt(CalcUnits.convert('density', kgm3, 'kgm3', doutSel.value)) + ' ' + CalcUnits.label('density', doutSel.value);
  }
  function mass(kg) {
    return fmt(CalcUnits.convert('mass', kg, 'kg', moutSel.value)) + ' ' + CalcUnits.label('mass', moutSel.value);
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }

  // ---------- Math (base units: L, kg, kg/m³) ----------
  function fishCount() {
    const v = parseFloat($('count').value);
    return isFinite(v) && v > 0 ? v : 0;
  }

  function compute() {
    const volL = CalcUnits.base('vol');
    const n = fishCount();
    const w = CalcUnits.base('weight');
    const target = CalcUnits.base('target');
    const ok = volL > 0 && w > 0;
    const biomass = n * w;
    const d = ok ? biomass / volL * 1000 : NaN;
    const r = { volL: volL, n: n, w: w, target: target, ok: ok, biomass: biomass, d: d };
    if (ok && target > 0) {
      r.pct = d / target * 100;
      r.maxBiomass = target * volL / 1000;
      // small epsilon so e.g. 20 kg / 0.4 kg = 50 exactly despite floating point
      r.maxFish = Math.floor(r.maxBiomass / w + 1e-9);
      r.headroom = r.maxBiomass - biomass;
      r.extraFish = r.maxFish - Math.ceil(n - 1e-9);
    }
    return r;
  }

  // ---------- State ----------
  function getState() {
    const st = { preset: presetSel.value, dout: doutSel.value, mout: moutSel.value };
    ['vol', 'count', 'weight', 'target'].forEach(function (f) {
      st[f] = $(f).value;
      const u = CalcUnits.unit(f);
      if (u) st[f + '_u'] = u;
    });
    return st;
  }

  function applyDefaults() {
    ['vol', 'count', 'weight', 'target'].forEach(function (f) { CalcUnits.set(f, DEFAULTS[f][0], DEFAULTS[f][1]); });
    presetSel.value = DEFAULTS.preset;
    doutSel.value = DEFAULTS.dout;
    moutSel.value = DEFAULTS.mout;
  }

  function setTargetFromPreset() {
    const p = PRESETS[presetSel.value];
    if (p && p.kgm3) {
      const u = CalcUnits.unit('target');
      CalcUnits.set('target', +CalcUnits.convert('density', p.kgm3, 'kgm3', u).toPrecision(6), u);
    }
  }

  // When the target is typed by hand, switch the preset to Custom unless it still matches.
  function syncPresetToTarget() {
    const t = CalcUnits.base('target');
    const p = PRESETS[presetSel.value];
    if (p && p.kgm3 && Math.abs(t - p.kgm3) > 1e-6 * p.kgm3) presetSel.value = 'custom';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notice = $('notice');
    const msgs = [];

    $('preset-hint').textContent = PRESETS[presetSel.value].hint;

    if (!(r.volL > 0)) msgs.push('Enter the tank water volume.');
    if (!(r.w > 0)) msgs.push('Enter the average fish weight.');
    if (r.ok && !(r.target > 0)) msgs.push('Enter a target density to see capacity and headroom.');
    if (r.ok && r.n > 0 && Math.abs(r.n - Math.round(r.n)) > 1e-9) msgs.push('Number of fish is not a whole number; it is used as entered.');
    if (r.ok && r.target > 0 && r.pct > 100) {
      msgs.push('Density is above your target. Harvest or move fish, or make sure aeration, oxygen backup and filtration are sized for this load.');
    }
    if (r.ok && r.d > 120) msgs.push('Above about 120 kg/m³ is beyond what is reported even for expert tilapia RAS with pure oxygen.');
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const hasT = r.ok && r.target > 0;
    $('r-density').textContent = r.ok ? density(r.d) : '–';
    $('r-biomass').textContent = r.ok ? mass(r.biomass) : '–';
    $('r-alt').textContent = r.ok
      ? [fmt(r.d) + ' kg/1,000 L', fmt(r.d / KGM3_PER_LBGAL, 3) + ' lb/US gal'].join(' · ')
      : '–';
    $('r-pct').textContent = hasT ? fmt(r.pct, 0) + '%' : '–';
    $('r-fillbar').style.width = hasT ? Math.min(100, r.pct) + '%' : '0%';
    $('r-max').textContent = hasT ? fmtInt(r.maxFish) + ' fish (' + mass(r.maxBiomass) + ')' : '–';
    if (hasT && r.headroom < 0) {
      $('r-head-label').textContent = 'Over target by';
      $('r-head').textContent = mass(-r.headroom) + ' (' + fmtInt(-r.extraFish) + ' fish)';
    } else {
      $('r-head-label').textContent = 'Biomass headroom';
      $('r-head').textContent = hasT ? mass(r.headroom) + ' (' + fmtInt(Math.max(0, r.extraFish)) + ' more fish)' : '–';
    }

    $('viz-caption').textContent = r.ok
      ? (hasT ? fmt(r.pct, 0) + '% of the ' + density(r.target) + ' target · ' : '') + density(r.d)
      : 'Enter volume and fish weight to draw the tank';

    drawViz(r);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function label(x, y, text, anchor, cls) {
    return el('text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, text);
  }

  // Simple fish: oval body + tail, centred on (cx, cy), about 30 × 14.
  function fish(cx, cy, cls) {
    el('path', {
      class: cls,
      d: 'M' + (cx - 15) + ',' + cy +
        ' C' + (cx - 9) + ',' + (cy - 8) + ' ' + (cx + 6) + ',' + (cy - 8) + ' ' + (cx + 10) + ',' + cy +
        ' C' + (cx + 6) + ',' + (cy + 8) + ' ' + (cx - 9) + ',' + (cy + 8) + ' ' + (cx - 15) + ',' + cy + 'Z' +
        ' M' + (cx + 10) + ',' + cy + ' L' + (cx + 17) + ',' + (cy - 6) + ' L' + (cx + 17) + ',' + (cy + 6) + 'Z'
    });
  }

  function niceCeil(v) {
    if (!(v > 0)) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < steps.length; i++) if (steps[i] * p >= v - 1e-9) return steps[i] * p;
    return 10 * p;
  }

  function drawViz(r) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const hasT = r.ok && r.target > 0;

    // Tank (front view)
    const tx = 30, ty = 18, tw = 420, th = 168;
    const wy = ty + 14;
    el('rect', { class: 'tank-glass', x: tx, y: ty, width: tw, height: th });
    el('rect', { class: 'tank-water', x: tx, y: wy, width: tw, height: th - (wy - ty) });
    el('line', { class: 'water-top', x1: tx, y1: wy, x2: tx + tw, y2: wy });
    el('path', { class: 'tank-line', d: 'M' + tx + ',' + ty + ' L' + tx + ',' + (ty + th) + ' L' + (tx + tw) + ',' + (ty + th) + ' L' + (tx + tw) + ',' + ty });

    if (r.ok) {
      const cols = 10, rows = 4, maxIcons = cols * rows;
      const nNow = Math.ceil(r.n - 1e-9);
      const cap = hasT ? r.maxFish : nNow;
      const per = Math.max(1, Math.ceil(Math.max(nNow, cap) / maxIcons));
      const nowIcons = nNow > 0 ? Math.max(1, Math.round(nNow / per)) : 0;
      const capIcons = hasT ? Math.floor(cap / per) : nowIcons;
      const total = Math.min(maxIcons, Math.max(nowIcons, capIcons));
      const cw = tw / cols, ch = (th - (wy - ty)) / rows;
      for (let i = 0; i < total; i++) {
        const row = Math.floor(i / cols), col = i % cols;
        const cx = tx + cw * (col + 0.5) - 2 + (row % 2 ? 2 : -2);
        const cy = ty + th - ch * (row + 0.5);
        let cls = 'fish-room';
        if (i < nowIcons) cls = (hasT && i >= capIcons) ? 'fish-over' : 'fish-now';
        fish(cx, cy, cls);
      }
      label(tx + 6, ty + 10, per === 1 ? 'each fish icon = 1 fish' : 'each icon = ' + per + ' fish', 'start');
      if (hasT) label(tx + tw - 6, ty + 10, 'dashed = room at target', 'end');
    }

    // Gauge
    const gx = 30, gw = 420, gy = 236, gh = 18;
    const dVal = r.ok ? r.d : 0;
    const tVal = hasT ? r.target : 0;
    const max = niceCeil(Math.max(tVal * 1.5, dVal * 1.1, 10));
    const X = function (v) { return gx + Math.max(0, Math.min(1, v / max)) * gw; };

    label(gx, gy - 24, 'Stocking density (' + CalcUnits.label('density', doutSel.value) + ')', 'start');
    el('rect', { class: 'gauge-track', x: gx, y: gy, width: gw, height: gh, rx: 4 });
    if (hasT) {
      el('rect', { class: 'gauge-ok', x: gx, y: gy, width: X(tVal) - gx, height: gh });
      el('rect', { class: 'gauge-over', x: X(tVal), y: gy, width: gx + gw - X(tVal), height: gh });
      const band = presetSel.value !== 'custom' && PRESETS[presetSel.value].band;
      if (band) {
        el('rect', { class: 'gauge-rec', x: X(band[0]), y: gy, width: X(band[1]) - X(band[0]), height: gh });
      }
      el('line', { class: 'gauge-target', x1: X(tVal), y1: gy - 4, x2: X(tVal), y2: gy + gh + 4 });
      label(X(tVal), gy + gh + 30, 'target ' + fmt(CalcUnits.convert('density', tVal, 'kgm3', doutSel.value)), X(tVal) > gx + gw - 50 ? 'end' : 'middle');
    }
    el('rect', { class: 'tank-line', x: gx, y: gy, width: gw, height: gh, rx: 4 });
    label(gx, gy + gh + 16, '0', 'start');
    label(gx + gw, gy + gh + 16, fmt(CalcUnits.convert('density', max, 'kgm3', doutSel.value)), 'end');

    if (r.ok) {
      const nx = X(dVal);
      el('path', { class: 'gauge-needle', d: 'M' + nx + ',' + (gy + 6) + ' L' + (nx - 7) + ',' + (gy - 8) + ' L' + (nx + 7) + ',' + (gy - 8) + 'Z' });
      const anchor = nx < gx + 60 ? 'start' : nx > gx + gw - 60 ? 'end' : 'middle';
      label(nx, gy - 12, density(r.d), anchor, (hasT && r.pct > 100) ? 'warn-text' : 'gauge-val');
    }

    // Legend
    if (hasT) {
      const ly = 308;
      el('rect', { class: 'gauge-ok', x: gx, y: ly - 9, width: 12, height: 10 });
      label(gx + 16, ly, 'within target', 'start');
      el('rect', { class: 'gauge-over-key', x: gx + 120, y: ly - 9, width: 12, height: 10 });
      label(gx + 136, ly, 'over target', 'start');
      if (presetSel.value === 'fao') {
        el('rect', { class: 'gauge-rec', x: gx + 230, y: ly - 9, width: 12, height: 10 });
        label(gx + 246, ly, 'FAO 10–20 kg/m³ range', 'start');
      }
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const presetName = presetSel.options[presetSel.selectedIndex].text;
    const lines = [
      'Fish Stocking Density Calculator',
      'Tank water: ' + typed('vol') + ' · Fish: ' + typed('count') + ' × ' + typed('weight'),
      'Target: ' + typed('target') + ' (' + presetName + ')'
    ];
    if (r.ok) {
      lines.push('Biomass: ' + mass(r.biomass));
      lines.push('Stocking density: ' + density(r.d) + ' (' + fmt(r.d) + ' kg/1,000 L, ' + fmt(r.d / KGM3_PER_LBGAL, 3) + ' lb/US gal)');
      if (r.target > 0) {
        lines.push('Share of target: ' + fmt(r.pct, 0) + '%');
        lines.push('Max fish at target: ' + fmtInt(r.maxFish) + ' (' + mass(r.maxBiomass) + ')');
        lines.push(r.headroom >= 0
          ? 'Headroom: ' + mass(r.headroom) + ' (' + fmtInt(Math.max(0, r.extraFish)) + ' more fish)'
          : 'Over target by: ' + mass(-r.headroom) + ' (' + fmtInt(-r.extraFish) + ' fish)');
      }
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  ['vol', 'count', 'weight'].forEach(function (f) { $(f).addEventListener('input', render); });
  $('target').addEventListener('input', function () { syncPresetToTarget(); render(); });
  presetSel.addEventListener('change', function () { setTargetFromPreset(); render(); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Fish Stocking Density Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    ['vol', 'count', 'weight', 'target'].forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.preset && PRESETS[p.preset]) presetSel.value = p.preset;
    if (p.dout && CalcUnits.unitDef('density', p.dout)) doutSel.value = p.dout;
    if (p.mout && CalcUnits.unitDef('mass', p.mout)) moutSel.value = p.mout;
    if (p.preset && PRESETS[p.preset] && p.target === undefined) setTargetFromPreset();
    render();
  })();
})();
