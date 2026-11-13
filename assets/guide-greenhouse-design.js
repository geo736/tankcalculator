// Guided design: a greenhouse, step by step (site climate → crop and set-points → house →
// glazing and light → supplemental light → heating and fuel → ventilation and cooling →
// night humidity → CO₂ → irrigation water → design sheet). Uses the CalcGuide framework
// (assets/guide.js) and the greenhouse pack's shared physics (assets/gh/psychro.js,
// crop.js, climate.js), so the guide and the greenhouse calculators give the same answers.
// Each step names the calculator whose formulas it copies.
(function () {
  'use strict';

  const G = CalcGuide;
  const fmt = G.fmt, q = G.q, p = G.p;
  const PSY = window.PSY, CROPM = window.CROP, CLIM = window.CLIMATE;

  // ---------- Unit groups this guide adds ----------
  if (!CalcUnits.GROUPS.airflow) {
    CalcUnits.GROUPS.airflow = {
      base: 'm3s',
      units: [
        { id: 'm3s', label: 'm³/s', factor: 1 },
        { id: 'm3h', label: 'm³/h', factor: 1 / 3600 },
        { id: 'cfm', label: 'cfm', factor: 0.00047194745 }
      ]
    };
  }
  if (!CalcUnits.GROUPS.uvalue) {
    CalcUnits.GROUPS.uvalue = {
      base: 'Wm2K',
      units: [
        { id: 'Wm2K', label: 'W/m²·K', factor: 1 },
        { id: 'btu', label: 'Btu/h·ft²·°F', factor: 5.678263 }
      ]
    };
  }

  // ---------- Constants (copied from the pack calculators named) ----------
  const RHO_CP = 1200;              // J m⁻³ K⁻¹, greenhouse-heat-load.js / annual-heat-demand.js
  const ONE_F = 0.45;               // sensible fraction of transmitted solar, same two pages
  const CP_AIR = 1006;              // J kg⁻¹ K⁻¹, fan-ventilation.js
  const LAMBDA = 2.45;              // MJ kg⁻¹, latent heat for mm of water (FAO-56 convention)
  const M_CO2 = 44.01, R_GAS = 8.314462618;   // co2-enrichment.js
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Fuels and calorific values (gross), annual-heat-demand.js, plus electricity for comparison.
  const FUELS = {
    ngh: { name: 'Natural gas (m³)', hhv: 40.30, unit: 'm³' },
    ngl: { name: 'Natural gas, low-calorific (m³)', hhv: 35.17, unit: 'm³' },
    propane: { name: 'Propane (kg)', hhv: 50.33, unit: 'kg' },
    diesel: { name: 'Light diesel / heating oil (kg)', hhv: 46.10, unit: 'kg' },
    wood: { name: 'Woody biomass, dry (kg)', hhv: 19.5, unit: 'kg' },
    elec: { name: 'Electricity, resistance or heat pump (kWh)', hhv: 3.6, unit: 'kWh' }
  };

  // Glazing: U-values from ANSI/ASAE EP406.4 Table 1 (per m² of cover); material light
  // transmission from MSU Extension (glass, poly, twin-wall) and Virginia Tech SPES-821
  // (insulated glass). IR-inhibited double poly takes the double-poly transmission.
  const COVERS = {
    glass1: { name: 'Single glass', u: 6.2, tau: 90, ach: 0.75, src: 'EP406.4: 6.2 W/m²·K. MSU: 90% light.' },
    glass2: { name: 'Double glass, sealed', u: 3.7, tau: 78, ach: 0.75, src: 'EP406.4: 3.7 W/m²·K. VT SPES-821: insulated glass ≈ 78% light.' },
    pe1: { name: 'Single polyethylene film', u: 6.2, tau: 88, ach: 1.1, src: 'EP406.4 single plastic: 6.2 W/m²·K. MSU: 88% light.' },
    pe2: { name: 'Double polyethylene, inflated', u: 4.0, tau: 77, ach: 1.1, src: 'EP406.4: 4.0 W/m²·K. MSU: 77% light.' },
    pe2ir: { name: 'Double polyethylene, IR-inhibited', u: 2.8, tau: 77, ach: 1.1, src: 'EP406.4: 2.8 W/m²·K. Light taken as double poly (77%); check the film datasheet.' },
    pc2: { name: 'Twin-wall polycarbonate', u: 3.4, tau: 75, ach: 0.75, src: 'EP406.4: 3.2–3.6 W/m²·K (midpoint used). MSU: 75% light.' },
    ac2: { name: 'Twin-wall acrylic', u: 3.2, tau: 74, ach: 0.75, src: 'EP406.4: 3.2 W/m²·K. MSU: 74% light.' },
    custom: { name: 'Custom (datasheet values)', u: NaN, tau: NaN, ach: 0.75, src: 'Enter the U-value and light transmission from the glazing datasheet.' }
  };

  // Crop DLI rules of thumb, exactly as daily-light-integral.js / the lighting guide.
  // model: the transpiration parameter set used for the humidity step (crop.js has
  // tomato, pepper, cucumber and eggplant only).
  const CROPS = {
    lettuce: { name: 'Lettuce & leafy greens', lo: 12, hi: 17, model: 'tomato', assim: 2.5 },
    herbs: { name: 'Basil & culinary herbs', lo: 15, hi: 25, model: 'tomato', assim: 2.5 },
    tomato: { name: 'Tomato', lo: 20, hi: 30, model: 'tomato', assim: 3.8 },
    cucumber: { name: 'Cucumber', lo: 20, hi: 30, model: 'cucumber', assim: 3.8 },
    pepper: { name: 'Sweet pepper', lo: 20, hi: 30, model: 'pepper', assim: 3.8 },
    seedlings: { name: 'Vegetable transplants / seedlings', lo: 10, hi: 12, model: 'tomato', assim: 2.0 },
    custom: { name: 'Other crop (set your own targets)', lo: null, hi: null, model: 'tomato', assim: 3.0 }
  };
  function cropOf(ctx) { return CROPS[ctx.v.crop] || CROPS.custom; }

  // Evaporative pads, evaporative-cooling.js (EP406.4 face velocities and water rates).
  const PADS = {
    aspen: { name: 'Aspen fibre, 50–100 mm', eff: 0.70, face: 0.76, water: 3.7 },
    cell100: { name: 'Corrugated cellulose, 100 mm', eff: 0.75, face: 1.27, water: 6.2 },
    cell150: { name: 'Corrugated cellulose, 150 mm', eff: 0.85, face: 1.78, water: 9.9 }
  };

  // ---------- Sources ----------
  function cite(key) {
    const c = (window.CITES || {})[key];
    if (!c) return key;
    let s = esc(c.authors) + ' (' + c.year + '). ' + (c.container ? esc(c.title) + '. <em>' + esc(c.container) + '</em>' + (c.volume ? ', ' + esc(c.volume) : '') + (c.page ? ', ' + esc(c.page) : '') : '<em>' + esc(c.title) + '</em>') + '.';
    if (c.doi) s += ' <a href="https://doi.org/' + esc(c.doi) + '" rel="noopener" target="_blank">doi:' + esc(c.doi) + '</a>';
    return s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  const SRC = {
    ep406: 'American Society of Agricultural Engineers (2003). <em>ANSI/ASAE EP406.4 JAN03: Heating, Ventilating and Cooling Greenhouses</em>. ASABE, St. Joseph, MI. Table 1 U-values, Table 2 infiltration rates, ventilation rates, pad face velocities, fan spacing, 99% winter design temperature.',
    stanghellini2019: cite('stanghellini2019'),
    dezwart1996: cite('dezwart1996'),
    ahamed2018: cite('ahamed2018'),
    sethi2007: cite('sethi2007cooling'),
    kittas2005: cite('kittas2005'),
    pollet2002: cite('pollet2002'),
    marcelis2006: cite('marcelis2006'),
    katzin2021: cite('katzin2021lighting'),
    vanthoor2011: cite('vanthoor2011'),
    stanghellini1987: cite('stanghellini1987'),
    campen2003: cite('campen2003drying'),
    fao56: cite('fao56'),
    sonneveld2009: cite('sonneveld2009'),
    thimijan1983: cite('thimijan1983'),
    msuenergy: 'Michigan State University Extension. <em>Energy evaluations: lock in heat</em> (glazing light transmission and U-values). <a href="https://www.canr.msu.edu/uploads/resources/pdfs/energy_evaluations.pdf" rel="noopener" target="_blank">canr.msu.edu</a>',
    vtglazing: 'Virginia Cooperative Extension. <em>Greenhouse glazing</em>, SPES-821 (light transmittance of glass and film). <a href="https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/spes/spes-821/SPES-821.pdf" rel="noopener" target="_blank">pubs.ext.vt.edu</a>',
    energyplus: 'U.S. Department of Energy. EnergyPlus weather data: typical meteorological year (TMY3 / IWEC) hourly files for each bundled site. <a href="https://energyplus.net/weather" rel="noopener" target="_blank">energyplus.net/weather</a>',
    stallknecht2025: 'Stallknecht, E. (2025). <em>Calculating and Using Daily Light Integral (DLI): An Introductory Guide</em>. Virginia Cooperative Extension, Virginia Tech, SPES-720NP. <a href="https://www.pubs.ext.vt.edu/SPES/spes-720/spes-720.html" rel="noopener" target="_blank">pubs.ext.vt.edu</a>',
    ho303: 'Maynard, E., O\'Donnell, M., Kong, N. N. &amp; Li, Y. (2019). <em>Seasonal Daily Light Integrals Across Indiana</em>. Purdue Extension HO-303-W. <a href="https://edustore.purdue.edu/ho-303-w.html" rel="noopener" target="_blank">edustore.purdue.edu</a>',
    faust2018: 'Faust, J. E. &amp; Logan, J. (2018). Daily light integral: A research review and high-resolution maps of the United States. <em>HortScience</em>, 53(9), 1250–1257. <a href="https://doi.org/10.21273/HORTSCI13144-18" rel="noopener" target="_blank">doi:10.21273/HORTSCI13144-18</a>'
  };

  // ---------- Helpers ----------
  function fin(x) { return typeof x === 'number' && isFinite(x); }
  function R(ctx, id) { return ctx.r[id] || {}; }
  function money(n) { return fin(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: n < 100 ? 2 : 0 }) : '–'; }
  function dliTxt(d, f) { return fin(d) ? fmt(d, f === undefined ? 1 : f) + ' mol/m²/day' : '–'; }
  function tTxt(t) { return q('temperature', t, ['C', 'F'], 1); }
  function pctCheck(label, lo, hi) { return function (x) { return x < lo || x > hi ? label + ' must be between ' + lo + ' and ' + hi + '%.' : ''; }; }
  function intCheck(label) { return function (x) { return Math.abs(x - Math.round(x)) > 1e-9 ? label + ' must be a whole number.' : ''; }; }
  function text(svg, x, y, t, anchor, cls, extra) {
    const a = { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return G.el(svg, 'text', a, t);
  }
  function isSite(ctx) { return ctx.v.site !== 'custom'; }
  function kwTxt(w) { return fin(w) ? q('power', w, ['kW', 'BTUh'], 0) : '–'; }

  // ---------- Climate statistics from a bundled typical year (cached per site) ----------
  const statCache = {};
  function siteStats(key) {
    if (statCache[key]) return statCache[key];
    const site = CLIM.site(key);
    if (!site) return null;
    const t = CLIM.series(key, 't'), rh = CLIM.series(key, 'rh'), ghi = CLIM.series(key, 'ghi');
    const n = t.length;
    const sorted = t.slice().sort(function (a, b) { return a - b; });
    const pick = function (f) { return sorted[Math.min(n - 1, Math.max(0, Math.floor(f * n)))]; };
    const tW = pick(0.01), tS = pick(0.99);
    let rhS = 0, nS = 0;
    for (let i = 0; i < n; i++) if (t[i] >= tS) { rhS += rh[i]; nS++; }
    const months = [];
    let h0 = 0;
    for (let m = 0; m < 12; m++) {
      const h1 = Math.min(n, h0 + MONTH_DAYS[m] * 24);
      let ts = 0, gs = 0, rn = 0, tn = 0, nn = 0;
      for (let i = h0; i < h1; i++) {
        ts += t[i]; gs += ghi[i];
        if (ghi[i] <= 0) { tn += t[i]; rn += rh[i]; nn++; }
      }
      const hrs = Math.max(1, h1 - h0);
      const rs = gs * 3600 / 1e6 / (hrs / 24);          // MJ m⁻² d⁻¹
      months.push({ t: ts / hrs, rs: rs, dli: 2 * rs, tNight: nn ? tn / nn : ts / hrs, rhNight: nn ? rn / nn : 0.85, h0: h0, h1: h1 });
      h0 = h1;
    }
    let cold = 0, dark = 0, bright = 0;
    months.forEach(function (m, i) {
      if (m.t < months[cold].t) cold = i;
      if (m.dli < months[dark].dli) dark = i;
      if (m.dli > months[bright].dli) bright = i;
    });
    const annualRs = ghi.reduce(function (a, b) { return a + b; }, 0) / 1000;   // kWh m⁻² y⁻¹
    statCache[key] = { label: site.label, koppen: site.koppen, t: t, rh: rh, ghi: ghi, n: n, tW: tW, tS: tS, rhS: nS ? rhS / nS : 0.5, months: months, cold: cold, dark: dark, bright: bright, annualRs: annualRs, source: site.source };
    return statCache[key];
  }

  const SITE_OPTIONS = CLIM.sites().map(function (s) { return { value: s.key, label: s.label + ' (' + s.koppen + ')' }; })
    .concat([{ value: 'custom', label: 'My own location (enter design conditions)' }]);

  // ======================================================================================
  // 1. Site and climate
  // ======================================================================================
  const stepSite = {
    id: 'site', title: 'Site and climate', short: 'Site',
    intro: '<p>A greenhouse is sized by its climate: the cold extreme sets the heater, the hot extreme sets the fans and cooling, and the darkest month sets the lights. Pick the closest bundled climate, or enter your own design conditions. The bundled sites are <strong>typical meteorological years</strong> from the EnergyPlus weather library, 8,760 hourly values each, so heating, cooling and light can be worked out hour by hour.</p>',
    fields: [
      { id: 'site', label: 'Climate', type: 'select', def: 'boston', options: SITE_OPTIONS,
        hint: function (ctx) { return isSite(ctx) ? 'Typical year, not an actual year: right for sizing, wrong for reconstructing a particular season.' : 'Look up your local design temperatures (ASHRAE 99% winter and 1% summer) and monthly light, then enter them below.'; } },
      { id: 'elev', label: 'Site elevation', group: 'length', unit: 'm', def: 0, signed: true,
        hint: 'Used for air pressure in the cooling and CO₂ steps. The bundled sites are all near sea level; enter yours.' },
      { id: 'cTw', half: true, label: 'Winter design temperature', group: 'temperature', unit: 'C', def: -15, signed: true,
        show: function (ctx) { return !isSite(ctx); }, hint: 'EP406.4 uses the ASHRAE 99% winter design dry-bulb.' },
      { id: 'cTs', half: true, label: 'Summer design temperature', group: 'temperature', unit: 'C', def: 32, signed: true,
        show: function (ctx) { return !isSite(ctx); }, hint: 'ASHRAE 1% summer design dry-bulb.' },
      { id: 'cRhs', half: true, label: 'Summer design relative humidity', suffix: '%', def: 45,
        show: function (ctx) { return !isSite(ctx); }, check: pctCheck('Relative humidity', 1, 100),
        hint: 'Mean coincident humidity at the summer design temperature.' },
      { id: 'cHdd', half: true, label: 'Heating degree-days at your heating set-point', suffix: '°C·day', def: 3200,
        show: function (ctx) { return !isSite(ctx); },
        hint: 'Base = the heating set-point you choose in step 2. degreedays.net lets you pick the base temperature.' },
      { id: 'cDliLo', half: true, label: 'Outdoor DLI, darkest month', suffix: 'mol/m²/day', def: 10,
        show: function (ctx) { return !isSite(ctx); }, hint: 'From Faust &amp; Logan (2018) maps for the USA, or a PAR sensor log.' },
      { id: 'cDliHi', half: true, label: 'Outdoor DLI, brightest month', suffix: 'mol/m²/day', def: 50,
        show: function (ctx) { return !isSite(ctx); } },
      { id: 'cCoolH', half: true, label: 'Hours a year above your ventilation set-point', suffix: 'h/year', def: 800, allowZero: true,
        show: function (ctx) { return !isSite(ctx); }, hint: 'Used to estimate fan electricity and pad water over the season.' },
      { id: 'cTn', half: true, label: 'Typical winter night temperature', group: 'temperature', unit: 'C', def: -4, signed: true,
        show: function (ctx) { return !isSite(ctx); }, hint: 'Mean night temperature of the coldest month, for the humidity step.' }
    ],
    compute: function (ctx) {
      const x = ctx.v;
      if (isSite(ctx)) {
        const s = siteStats(x.site);
        const md = s.months;
        return {
          site: true, s: s, label: s.label + ' (' + s.koppen + ')', tW: s.tW, tS: s.tS, rhS: s.rhS,
          dliLo: md[s.dark].dli, dliHi: md[s.bright].dli, darkMonth: MONTHS_FULL[s.dark], brightMonth: MONTHS_FULL[s.bright],
          tNight: md[s.cold].tNight, rhNight: md[s.cold].rhNight, coldMonth: MONTHS_FULL[s.cold],
          monthsDli: md.map(function (m) { return m.dli; }), monthsT: md.map(function (m) { return m.t; }), annualRs: s.annualRs
        };
      }
      return {
        site: false, label: 'Custom location', tW: x.cTw, tS: x.cTs, rhS: x.cRhs / 100,
        dliLo: x.cDliLo, dliHi: x.cDliHi, darkMonth: 'darkest month', brightMonth: 'brightest month',
        tNight: x.cTn, rhNight: 0.85, coldMonth: 'coldest month', monthsDli: null, monthsT: null, annualRs: NaN
      };
    },
    results: function (ctx, r) {
      const pk = PSY.pressureAt(ctx.v.elev);
      const wb = PSY.wetBulb(r.tS, r.rhS, pk);
      return [
        { label: 'Winter design temperature (99%)', value: tTxt(r.tW), main: true },
        { label: 'Summer design temperature (1%)', value: tTxt(r.tS) + ' at ' + fmt(r.rhS * 100, 0) + '% RH' },
        { label: 'Summer design wet-bulb', value: fin(wb) ? tTxt(wb) : '–' },
        { label: 'Outdoor DLI, ' + r.darkMonth, value: dliTxt(r.dliLo) },
        { label: 'Outdoor DLI, ' + r.brightMonth, value: dliTxt(r.dliHi) },
        r.site ? { label: 'Annual global radiation', value: fmt(r.annualRs, 0) + ' kWh/m²' } : { label: 'Data', value: 'Your design conditions' }
      ];
    },
    tips: [
      'EP406.4 recommends the <strong>99% winter design dry-bulb</strong> for a heater used all year: the temperature that is beaten in all but 1% of hours. A warmer design value is fine for a house used only part of the year.',
      'The bundled sites cover eight climate types. If none is close to you, use your own design values: the guide then uses degree-days for the yearly heat and the darkest-month light instead of hour-by-hour figures.',
      'Light (DLI) here is outdoor global radiation converted at about 2 mol of PAR photons per MJ, the same factor the Cover Light Transmission calculator uses.'
    ],
    viz: {
      viewBox: '0 0 480 250', label: 'Monthly outdoor daily light integral as bars and mean air temperature as a line',
      draw: function (svg, ctx, r) {
        if (!r.site) { text(svg, 240, 125, 'Monthly chart available for the bundled climates', 'middle', 'dim-text'); return; }
        const x0 = 46, x1 = 440, y0 = 30, y1 = 200, bw = (x1 - x0) / 12;
        const dMax = Math.ceil(Math.max.apply(null, r.monthsDli) / 10) * 10 || 10;
        const tLo = Math.floor(Math.min(0, Math.min.apply(null, r.monthsT)) / 10) * 10, tHi = Math.ceil(Math.max.apply(null, r.monthsT) / 10) * 10 + 10;
        const Yd = function (d) { return y1 - (y1 - y0) * d / dMax; };
        const Yt = function (t) { return y1 - (y1 - y0) * (t - tLo) / (tHi - tLo); };
        G.el(svg, 'line', { class: 'g-track', x1: x0, y1: y1, x2: x1, y2: y1 });
        r.monthsDli.forEach(function (d, i) {
          G.el(svg, 'rect', { class: i === r.s.dark ? 'g-bar-warn' : 'g-bar-soft', x: x0 + i * bw + 4, y: Yd(d), width: bw - 8, height: y1 - Yd(d), rx: 2 });
          text(svg, x0 + i * bw + bw / 2, y1 + 14, MONTHS[i].charAt(0), 'middle', 'dim-text');
        });
        let d = '';
        r.monthsT.forEach(function (t, i) { d += (i ? 'L' : 'M') + (x0 + i * bw + bw / 2) + ' ' + Yt(t); });
        G.el(svg, 'path', { class: 'g-line-accent', d: d, fill: 'none' });
        r.monthsT.forEach(function (t, i) { G.el(svg, 'circle', { class: 'g-bar', cx: x0 + i * bw + bw / 2, cy: Yt(t), r: 3 }); });
        text(svg, x0 - 6, y0 + 4, String(dMax), 'end', 'dim-text');
        text(svg, x0 - 6, y1 + 4, '0', 'end', 'dim-text');
        text(svg, x1 + 6, Yt(tHi) + 4, tHi + '°', 'start', 'g-accent-text');
        text(svg, x1 + 6, Yt(tLo) + 4, tLo + '°', 'start', 'g-accent-text');
        if (tLo < 0 && tHi > 0) { G.el(svg, 'line', { class: 'g-line', x1: x0, y1: Yt(0), x2: x1, y2: Yt(0), 'stroke-dasharray': '3 3' }); }
        text(svg, x0, 18, 'Outdoor DLI, mol/m²/day (bars) · mean air temperature, °C (line)', 'start', 'dim-text');
        text(svg, 240, 240, 'Darkest month highlighted: ' + MONTHS[r.s.dark] + ' ' + fmt(r.dliLo, 1) + ' mol/m²/day', 'middle', 'g-label');
      },
      caption: function (ctx, r) { return r.label + ': winter design ' + fmt(r.tW, 1) + ' °C, summer design ' + fmt(r.tS, 1) + ' °C'; }
    },
    sources: ['ep406', 'energyplus', 'faust2018'],
    links: function (ctx) {
      const r = R(ctx, 'site');
      return [{ slug: 'psychrometrics', label: 'Psychrometrics & VPD (summer design air)', params: { t: p(r.tS, 3), rh: p(r.rhS * 100, 3), alt: p(ctx.v.elev, 4) } }];
    }
  };

  // ======================================================================================
  // 2. Crop and set-points
  // ======================================================================================
  const stepCrop = {
    id: 'crop', title: 'Crop and climate set-points', short: 'Crop',
    intro: '<p>The crop decides the light target and the set-points the house has to hold. The <strong>heating set-point</strong> is the coldest the house may get on a winter night; the <strong>ventilation set-point</strong> is where vents or fans start removing heat; the <strong>humidity limit</strong> is where you start paying to dry the air.</p>',
    fields: [
      { id: 'crop', label: 'Crop', type: 'select', def: 'lettuce',
        options: Object.keys(CROPS).map(function (k) { return { value: k, label: CROPS[k].name }; }) },
      { id: 'tHeat', half: true, label: 'Heating set-point (night)', group: 'temperature', unit: 'C', def: 16, signed: true,
        hint: 'EP406.4 suggests 16 °C (60 °F) at night as generally meeting most plants’ needs. Use your crop’s own night set-point if you have one.' },
      { id: 'tVent', half: true, label: 'Ventilation set-point', group: 'temperature', unit: 'C', def: 26, signed: true,
        check: function (v, ctx) { return v <= ctx.v.tHeat ? 'The ventilation set-point must be above the heating set-point.' : ''; },
        hint: 'Your design choice: the temperature above which the house ventilates or cools.' },
      { id: 'rhMax', half: true, label: 'Humidity limit', suffix: '% RH', def: 85, check: pctCheck('Humidity limit', 40, 100),
        hint: 'Your design choice. The pack’s calculators flag above 90% RH as a Botrytis risk.' },
      { id: 'dli', half: true, label: 'Target daily light integral', suffix: 'mol/m²/day',
        def: function (ctx) { const c = cropOf(ctx); return c.lo === null ? 15 : +((c.lo + c.hi) / 2).toFixed(1); },
        hint: function (ctx) { const c = cropOf(ctx); return c.lo !== null ? 'Rule of thumb ' + c.lo + '–' + c.hi + ' mol/m²/day (Stallknecht 2025; Purdue HO-303-W). Suggested: the middle.' : 'Enter your crop’s target.'; } }
    ],
    compute: function (ctx) { return { crop: cropOf(ctx) }; },
    results: function (ctx, r) {
      const c = r.crop;
      return [
        { label: 'Target DLI', value: dliTxt(ctx.v.dli) + (c.lo !== null ? ' (range ' + c.lo + '–' + c.hi + ')' : ''), main: true },
        { label: 'Heating set-point', value: tTxt(ctx.v.tHeat) },
        { label: 'Ventilation set-point', value: tTxt(ctx.v.tVent) },
        { label: 'Humidity limit', value: fmt(ctx.v.rhMax, 0) + '% RH' },
        { label: 'Winter design temperature difference', value: q('tempdiff', ctx.v.tHeat - R(ctx, 'site').tW, ['C', 'F'], 1) }
      ];
    },
    tips: [
      'Every degree of night set-point costs heat. On the design night the heater must cover the whole difference between the set-point and the outside design temperature.',
      'The DLI ranges are rules of thumb; cultivar, temperature and CO₂ all move the best value.',
      'The humidity model in step 8 has published parameters for tomato, pepper, cucumber and eggplant only. For leafy greens and herbs it uses the tomato set, so treat that step as a screening estimate.'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'Temperature ladder: winter design, heating set-point, ventilation set-point and summer design',
      draw: function (svg, ctx) {
        const s = R(ctx, 'site');
        const pts = [
          { t: s.tW, l: 'Winter design', c: 'g-bar-water' },
          { t: ctx.v.tHeat, l: 'Heating set-point', c: 'g-bar' },
          { t: ctx.v.tVent, l: 'Ventilation set-point', c: 'g-bar-warn' },
          { t: s.tS, l: 'Summer design', c: 'g-bar-warn' }
        ].filter(function (o) { return fin(o.t); });
        if (!pts.length) return;
        const lo = Math.floor(Math.min.apply(null, pts.map(function (o) { return o.t; })) / 5) * 5 - 5;
        const hi = Math.ceil(Math.max.apply(null, pts.map(function (o) { return o.t; })) / 5) * 5 + 5;
        const x0 = 30, x1 = 450, X = function (t) { return x0 + (x1 - x0) * (t - lo) / (hi - lo); };
        G.el(svg, 'rect', { class: 'g-track', x: x0, y: 92, width: x1 - x0, height: 10, rx: 5 });
        if (fin(ctx.v.tHeat) && fin(ctx.v.tVent)) G.el(svg, 'rect', { class: 'g-bar-soft', x: X(ctx.v.tHeat), y: 92, width: Math.max(0, X(ctx.v.tVent) - X(ctx.v.tHeat)), height: 10, rx: 5 });
        pts.forEach(function (o, i) {
          const up = i % 2 === 0;
          G.el(svg, 'circle', { class: o.c, cx: X(o.t), cy: 97, r: 7 });
          G.el(svg, 'line', { class: 'g-line', x1: X(o.t), y1: up ? 88 : 106, x2: X(o.t), y2: up ? 60 : 134 });
          text(svg, X(o.t), up ? 52 : 150, o.l, 'middle', 'g-label');
          text(svg, X(o.t), up ? 36 : 166, fmt(o.t, 1) + ' °C', 'middle', 'g-strong');
        });
        text(svg, (X(ctx.v.tHeat) + X(ctx.v.tVent)) / 2, 122, 'band the house holds', 'middle', 'g-accent-text');
        text(svg, x0, 190, lo + ' °C', 'start', 'dim-text');
        text(svg, x1, 190, hi + ' °C', 'end', 'dim-text');
      },
      caption: function (ctx) { return 'Heater lifts the house from ' + fmt(R(ctx, 'site').tW, 1) + ' °C to ' + fmt(ctx.v.tHeat, 1) + ' °C; vents and cooling hold it near ' + fmt(ctx.v.tVent, 1) + ' °C'; }
    },
    sources: ['ep406', 'stallknecht2025', 'ho303'],
    links: function (ctx) {
      const dc = ['lettuce', 'herbs', 'seedlings'].indexOf(ctx.v.crop) >= 0 ? ctx.v.crop : (ctx.v.crop === 'custom' ? '' : 'fruiting');
      return [{ slug: 'daily-light-integral', label: 'Daily Light Integral', params: { mode: 'ppfd', crop: dc, pattern: 'const' } }];
    }
  };

  // ======================================================================================
  // 3. House size and shape
  // ======================================================================================
  function house(x) {
    const L = x.len, n = x.spans, ws = x.spanW, he = x.eaves, ang = x.roof * Math.PI / 180;
    const W = n * ws, floor = L * W;
    const walls = 2 * (L + W) * he;
    const roofPlane = floor / Math.cos(ang);
    const gables = 0.5 * n * ws * ws * Math.tan(ang);          // greenhouse-heat-load.js, compendium 7.1
    const cover = walls + roofPlane + gables;
    const vol = L * (W * he + n * 0.25 * ws * ws * Math.tan(ang));
    return { W: W, floor: floor, walls: walls, roofPlane: roofPlane, gables: gables, cover: cover, ratio: cover / floor, vol: vol, meanH: vol / floor, ridge: he + ws / 2 * Math.tan(ang) };
  }
  const stepHouse = {
    id: 'house', title: 'House size and shape', short: 'House',
    intro: '<p>Heat is lost through the whole cover, not the floor, so the shape matters. A gutter-connected house of several spans has less cover per square metre of floor than a single free-standing bay. Enter the outside dimensions; the guide works out the floor area, the cover area and the <strong>cover-to-floor ratio</strong>, and the volume that leaks and has to be ventilated.</p>',
    fields: [
      { id: 'len', half: true, label: 'House length', group: 'length', unit: 'm', def: 72 },
      { id: 'spans', half: true, label: 'Number of spans (bays)', suffix: 'spans', def: 6, check: intCheck('Number of spans') },
      { id: 'spanW', half: true, label: 'Span width', group: 'length', unit: 'm', def: 9.6 },
      { id: 'eaves', half: true, label: 'Gutter (eaves) height', group: 'length', unit: 'm', def: 4.5 },
      { id: 'roof', half: true, label: 'Roof slope', suffix: '°', def: 22, allowZero: true, check: function (v) { return v > 60 ? 'Roof slope must be 60° or less.' : ''; } },
      { id: 'grow', half: true, label: 'Growing share of the floor', suffix: '%', def: 85, check: pctCheck('Growing share', 5, 100),
        hint: 'Benches, gutters or rafts as a share of the floor. Used for lamp count and crop water.' }
    ],
    compute: function (ctx) { const h = house(ctx.v); h.growArea = h.floor * ctx.v.grow / 100; return h; },
    notices: function (ctx, r) {
      return [fin(r.ratio) && (r.ratio < 1.05 || r.ratio > 1.45) ? 'Cover-to-floor ratio is ' + fmt(r.ratio, 2) + '. Large gutter-connected houses run about 1.1 to 1.3 (Heating Capacity calculator); a small, narrow or tall house runs higher and loses more heat per m² of floor. Check the dimensions.' : ''];
    },
    results: function (ctx, r) {
      return [
        { label: 'Floor area', value: q('area', r.floor, ['m2', 'ft2'], 0), main: true },
        { label: 'House width', value: q('length', r.W, ['m', 'ft'], 1) },
        { label: 'Cover area (walls + roof + gables)', value: q('area', r.cover, ['m2', 'ft2'], 0) },
        { label: 'Cover-to-floor ratio', value: fmt(r.ratio, 2) },
        { label: 'Air volume', value: q('volume', r.vol * 1000, ['m3'], 0) + ' · mean height ' + q('length', r.meanH, ['m', 'ft'], 2) },
        { label: 'Growing area', value: q('area', r.growArea, ['m2', 'ft2'], 0) }
      ];
    },
    tips: [
      'Taller houses cost a little more to heat (more wall, more leaking volume) but buffer temperature and humidity better and leave room for screens and lights.',
      'The heating and ventilation steps use the cover-to-floor ratio worked out here, not an assumed one.'
    ],
    viz: {
      viewBox: '0 0 480 230', label: 'To-scale end view of the greenhouse spans with gutter and ridge heights',
      draw: function (svg, ctx, r) {
        const x = ctx.v;
        if (!fin(r.W) || !fin(r.ridge) || !(x.spans >= 1)) return;
        const n = Math.round(x.spans);
        const sc = Math.min(400 / r.W, 150 / r.ridge);
        const w = r.W * sc, x0 = 240 - w / 2, yG = 190;
        G.el(svg, 'line', { class: 'g-track', x1: 20, y1: yG, x2: 460, y2: yG });
        let d = 'M' + x0 + ' ' + yG + 'L' + x0 + ' ' + (yG - x.eaves * sc);
        for (let i = 0; i < n; i++) {
          const a = x0 + i * x.spanW * sc;
          d += 'L' + (a + x.spanW * sc / 2) + ' ' + (yG - r.ridge * sc) + 'L' + (a + x.spanW * sc) + ' ' + (yG - x.eaves * sc);
        }
        d += 'L' + (x0 + w) + ' ' + yG + 'Z';
        G.el(svg, 'path', { class: 'g-box-accent', d: d });
        for (let i = 1; i < n; i++) { const a = x0 + i * x.spanW * sc; G.el(svg, 'line', { class: 'g-line', x1: a, y1: yG, x2: a, y2: yG - x.eaves * sc, 'stroke-dasharray': '3 3' }); }
        text(svg, 240, yG + 18, fmt(r.W, 1) + ' m wide · ' + n + ' × ' + fmt(x.spanW, 1) + ' m spans', 'middle', 'g-label');
        text(svg, x0 - 6, yG - x.eaves * sc + 4, fmt(x.eaves, 1) + ' m', 'end', 'dim-text');
        text(svg, x0 + x.spanW * sc / 2, yG - r.ridge * sc - 6, 'ridge ' + fmt(r.ridge, 1) + ' m', 'middle', 'dim-text');
        text(svg, 240, 22, fmt(r.floor, 0) + ' m² floor · ' + fmt(r.cover, 0) + ' m² cover · ratio ' + fmt(r.ratio, 2), 'middle', 'g-strong');
      },
      caption: function (ctx, r) { return 'End view, to scale. Length ' + fmt(ctx.v.len, 1) + ' m into the page'; }
    },
    sources: ['stanghellini2019'],
    links: function () { return []; }
  };

  // ======================================================================================
  // 4. Glazing, screen and light transmission
  // ======================================================================================
  function coverOf(ctx) { return COVERS[ctx.v.cover] || COVERS.custom; }
  const stepCover = {
    id: 'cover', title: 'Glazing, screen and light', short: 'Glazing',
    intro: '<p>The glazing sets two numbers that pull against each other: how much heat leaks out (the <strong>U-value</strong>) and how much light gets in (<strong>transmission</strong>). Double layers save heat and cost light. The frame, dirt and condensation take a further share of the light, and a <strong>thermal screen</strong> drawn at night cuts the heat loss without costing daytime light.</p>',
    fields: [
      { id: 'cover', label: 'Glazing', type: 'select', def: 'pe2',
        options: Object.keys(COVERS).map(function (k) { return { value: k, label: COVERS[k].name }; }),
        hint: function (ctx) { return coverOf(ctx).src; } },
      { id: 'uc', half: true, label: 'Cover U-value (per m² of cover)', group: 'uvalue', unit: 'Wm2K',
        def: function (ctx) { return coverOf(ctx).u; },
        hint: 'EP406.4 Table 1 values include the convection and radiation at the surfaces.' },
      { id: 'tauc', half: true, label: 'Glazing light transmission', suffix: '%', def: function (ctx) { return coverOf(ctx).tau; },
        check: pctCheck('Light transmission', 20, 98) },
      { id: 'fstr', half: true, label: 'Light lost to frame and structure', suffix: '%', def: 12, allowZero: true, check: pctCheck('Structure loss', 0, 40),
        hint: '10–20%, rising with span count; 20% or more in older heavy-framed houses (Cover Light Transmission calculator).' },
      { id: 'fdirt', half: true, label: 'Lost to dirt and condensation', suffix: '%', def: 9, allowZero: true, check: pctCheck('Dirt and condensation loss', 0, 40),
        hint: 'Dirt 2–10% between washes plus condensate droplets 2–8%.' },
      { id: 'screen', label: 'Thermal screen', type: 'select', def: 'yes',
        options: [{ value: 'yes', label: 'Thermal / energy screen, closed on cold nights' }, { value: 'no', label: 'No screen' }] },
      { id: 'pscreen', half: true, label: 'Screen heat saving', suffix: '%', def: 40, allowZero: true,
        show: function (ctx) { return ctx.v.screen === 'yes'; }, check: pctCheck('Screen saving', 0, 80),
        hint: 'Typical 40%, improved screens 50% (Heating Capacity calculator). EP406.4 lists single glass with a blanket at 4.0 vs 6.2 W/m²·K, a 35% cut.' },
      { id: 'ach', half: true, label: 'Air leakage', suffix: 'air changes/h',
        def: function (ctx) { return coverOf(ctx).ach; },
        hint: 'EP406.4 Table 2: new double film 0.75–1.5, new glass or fiberglass 0.5–1.0, old glass 1–2 (well kept) or 2–4 (poorly kept). Windy sites leak more.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = R(ctx, 'site');
      const tauGh = x.tauc / 100 * (1 - x.fstr / 100) * (1 - x.fdirt / 100);
      const uTr = x.uc * (x.screen === 'yes' ? 1 - x.pscreen / 100 : 1);
      const inside = s.monthsDli ? s.monthsDli.map(function (d) { return d * tauGh; }) : null;
      const insideLo = s.dliLo * tauGh, insideHi = s.dliHi * tauGh;
      const short = inside ? inside.filter(function (d) { return d < x.dli; }).length : (insideLo < x.dli ? NaN : 0);
      return { tauGh: tauGh, uTr: uTr, inside: inside, insideLo: insideLo, insideHi: insideHi, short: short };
    },
    notices: function (ctx, r) { return [r.tauGh > 0.78 ? 'Whole-house transmission above 0.78 is unusually high; about 0.72–0.76 is the practical top for clean glass (Cover Light Transmission calculator).' : '']; },
    results: function (ctx, r) {
      return [
        { label: 'Light reaching the crop (whole house)', value: fin(r.tauGh) ? fmt(r.tauGh * 100, 0) + '%' : '–', main: true },
        { label: 'Crop DLI, ' + R(ctx, 'site').darkMonth, value: dliTxt(r.insideLo) + ' vs target ' + fmt(ctx.v.dli, 1) },
        { label: 'Crop DLI, ' + R(ctx, 'site').brightMonth, value: dliTxt(r.insideHi) },
        { label: 'Months below the light target', value: fin(r.short) ? r.short + ' of 12' : 'darkest month is short' },
        { label: 'Night U-value of the cover', value: q('uvalue', r.uTr, ['Wm2K', 'btu'], 2) + (ctx.v.screen === 'yes' ? ' (screen closed)' : '') }
      ];
    },
    tips: [
      'Whole-house transmission = glazing × (1 − structure) × (1 − dirt and condensation). Even clean single glass rarely gets more than about 72–76% of outside light to the crop.',
      'Light matters for yield: the "1% rule" says 1% more light gives about 1% more yield for fruit crops (Marcelis et al. 2006). Weigh that against the heat a double layer saves.',
      'The screen only works when it is closed. The heating step sizes the plant with the screen closed, which is how it will be on the design night.'
    ],
    viz: {
      viewBox: '0 0 480 250', label: 'Monthly daily light integral reaching the crop against the target',
      draw: function (svg, ctx, r) {
        const t = ctx.v.dli;
        const data = r.inside || [r.insideLo, r.insideHi];
        const labels = r.inside ? MONTHS.map(function (m) { return m.charAt(0); }) : ['dark', 'bright'];
        const max = Math.ceil(Math.max(t * 1.2, Math.max.apply(null, data)) / 10) * 10 || 10;
        const x0 = 40, x1 = 460, y0 = 34, y1 = 200, bw = (x1 - x0) / data.length;
        const Y = function (d) { return y1 - (y1 - y0) * Math.min(d, max) / max; };
        data.forEach(function (d, i) {
          G.el(svg, 'rect', { class: d < t ? 'g-bar-warn' : 'g-bar', x: x0 + i * bw + 4, y: Y(d), width: bw - 8, height: y1 - Y(d), rx: 2 });
          text(svg, x0 + i * bw + bw / 2, y1 + 14, labels[i], 'middle', 'dim-text');
        });
        if (fin(t)) {
          G.el(svg, 'line', { class: 'g-line-warn', x1: x0, y1: Y(t), x2: x1, y2: Y(t), 'stroke-dasharray': '5 4' });
          text(svg, x1, Y(t) - 6, 'target ' + fmt(t, 1), 'end', 'g-warn-text');
        }
        text(svg, x0 - 6, y0 + 4, String(max), 'end', 'dim-text');
        text(svg, x0 - 6, y1 + 4, '0', 'end', 'dim-text');
        text(svg, x0, 20, 'DLI at the crop, mol/m²/day (amber = below target)', 'start', 'dim-text');
        text(svg, 240, 240, 'Whole-house transmission ' + fmt(r.tauGh * 100, 0) + '%', 'middle', 'g-label');
      },
      caption: function (ctx, r) { return fin(r.short) ? r.short + ' month(s) below the ' + fmt(ctx.v.dli, 1) + ' mol/m²/day target' : 'Darkest month below target'; }
    },
    sources: ['ep406', 'msuenergy', 'vtglazing', 'pollet2002', 'marcelis2006', 'stanghellini2019'],
    links: function (ctx, r) {
      const x = ctx.v;
      return [
        { slug: 'cover-transmission', label: 'Cover Light Transmission', params: { tauhem: p(x.tauc / 100, 3), fstr: p(x.fstr / 100, 3), fdirt: p(x.fdirt / 100, 3), fcond: 0 } },
        { slug: 'u-value-resistances', label: 'Cover U-Value (why published U-values differ)', params: { ratio: p(R(ctx, 'house').ratio, 3) } }
      ];
    }
  };

  // ======================================================================================
  // 5. Supplemental lighting
  // ======================================================================================
  const LAMPS = {
    none: { name: 'No supplemental lighting', eff: NaN },
    led: { name: 'LED (illustrative 2.5 µmol/J)', eff: 2.5 },
    hps: { name: 'HPS 1000 W double-ended (illustrative 1.7 µmol/J)', eff: 1.7 }
  };
  const stepLight = {
    id: 'light', title: 'Supplemental lighting', short: 'Lights',
    intro: '<p>If the crop DLI falls short of the target in the dark months, lamps can make up the difference. The lamps are sized for the <strong>darkest month</strong> and run fewer hours, or not at all, the rest of the year. Every watt of lamp power ends up as heat inside the house.</p>',
    fields: [
      { id: 'lamp', label: 'Lighting', type: 'select', def: function (ctx) { return R(ctx, 'cover').insideLo < ctx.v.dli ? 'led' : 'none'; },
        options: Object.keys(LAMPS).map(function (k) { return { value: k, label: LAMPS[k].name }; }),
        hint: 'Efficacies are the illustrative fixtures of the Light Fixture Layout calculator. Use your fixture’s datasheet.' },
      { id: 'eff', half: true, label: 'Fixture efficacy', suffix: 'µmol/J', def: function (ctx) { return LAMPS[ctx.v.lamp] ? LAMPS[ctx.v.lamp].eff : NaN; },
        show: function (ctx) { return ctx.v.lamp !== 'none'; } },
      { id: 'photo', half: true, label: 'Lit hours per day', group: 'time', unit: 'h', def: 16 * 3600,
        show: function (ctx) { return ctx.v.lamp !== 'none'; }, check: function (v) { return v > 86400 ? 'At most 24 hours.' : ''; } },
      { id: 'lampStart', half: true, label: 'Lamps switch on at', suffix: 'h (0–23, clock)', def: 2, allowZero: true,
        show: function (ctx) { return ctx.v.lamp !== 'none'; },
        check: function (v) { return v > 23 || Math.abs(v - Math.round(v)) > 1e-9 ? 'Enter a whole hour from 0 to 23.' : ''; },
        hint: 'Each day the lamps run from this hour for as long as that month needs. In midwinter the house needs heat around the clock, so the timing changes little; in spring and autumn, daytime lighting overlaps the sun and some lamp heat is wasted or has to be vented.' },
      { id: 'pel', half: true, label: 'Electricity price', suffix: 'per kWh', def: 0.15, allowZero: true },
      { id: 'litDays', half: true, label: 'Days a year the lamps run', suffix: 'days', def: 120,
        show: function (ctx) { return ctx.v.lamp !== 'none' && !isSite(ctx); },
        hint: 'Custom climate only: the guide has no monthly light, so it assumes darkest-month duty on these days (an upper bound).' }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = R(ctx, 'site'), cv = R(ctx, 'cover'), hs = R(ctx, 'house');
      if (x.lamp === 'none') return { none: true, lampW: 0, kwhYear: 0, cost: 0, dliLamp: 0, ppfd: 0, kw: 0 };
      const h = x.photo / 3600;
      const dliLamp = Math.max(0, x.dli - cv.insideLo);
      const ppfd = dliLamp / (0.0036 * h);                    // supplemental-light.js: DLI = 0.0036 PPFD h
      const lampW = ppfd / x.eff;                             // W per m² of growing area
      const kw = lampW * hs.growArea / 1000;
      let kwhM2 = 0, monthly = null;
      if (cv.inside) {
        monthly = cv.inside.map(function (d, i) {
          const need = Math.min(dliLamp, Math.max(0, x.dli - d));
          kwhM2 += MONTH_DAYS[i] * need / (3.6 * x.eff);      // DLI × days / (3.6 × efficacy)
          return need;
        });
      } else {
        kwhM2 = x.litDays * dliLamp / (3.6 * x.eff);
      }
      const kwhYear = kwhM2 * hs.growArea;
      // Share of lamp power leaving as PAR photons: efficacy ÷ photons per joule of PAR
      // (Thimijan & Heins 1983: 4.98 µmol/J for HPS; 4.7 for white LED, as Light Conversions).
      const fPar = Math.min(0.9, x.eff / (x.lamp === 'hps' ? 4.98 : 4.7));
      const sensW = lampW * (1 - fPar) * hs.growArea / hs.floor;   // W per m² of floor while lit
      // Hourly schedule over the typical year: each day the lamps run from lampStart for the
      // hours that month needs (need ÷ 0.0036 PPFD), at full output.
      let hourly = null, litH = 0;
      if (monthly && fin(ppfd) && ppfd > 0) {
        hourly = new Float32Array(s.s.n);
        let h0 = 0;
        monthly.forEach(function (need, m) {
          const hrsDay = Math.min(h, need / (0.0036 * ppfd));
          const full = Math.floor(hrsDay), part = hrsDay - full;
          for (let d = 0; d < MONTH_DAYS[m]; d++) {
            for (let k = 0; k <= full; k++) {
              const frac = k < full ? 1 : part;
              if (frac <= 0) continue;
              // a window past midnight wraps to the early hours of the same calendar day
              const j = h0 + d * 24 + ((x.lampStart + k) % 24);
              if (j < s.s.n) { hourly[j] += sensW * frac; litH += frac; }
            }
          }
          h0 += MONTH_DAYS[m] * 24;
        });
      }
      return { none: false, dliLamp: dliLamp, ppfd: ppfd, lampW: lampW, kw: kw, kwhM2: kwhM2, kwhYear: kwhYear, cost: kwhYear * x.pel, monthly: monthly, fPar: fPar, sensW: sensW, hourly: hourly, litH: litH };
    },
    notices: function (ctx, r) {
      return [!r.none && r.dliLamp === 0 ? 'The crop already reaches the target in the darkest month, so the lamps would not be needed for light. Choose "No supplemental lighting" unless you light for photoperiod.' : '',
        !r.none && r.ppfd > 400 ? 'More than 400 µmol/m²/s of supplemental light is a lot for a greenhouse; check the target DLI and the lit hours.' : ''];
    },
    results: function (ctx, r) {
      if (r.none) return [{ label: 'Supplemental lighting', value: 'none', main: true }, { label: 'Crop DLI, darkest month', value: dliTxt(R(ctx, 'cover').insideLo) }];
      return [
        { label: 'Lamp PPFD at the crop', value: fmt(r.ppfd, 0) + ' µmol/m²/s', main: true },
        { label: 'Lamp DLI in the darkest month', value: dliTxt(r.dliLamp) },
        { label: 'Installed lamp power', value: fmt(r.lampW, 0) + ' W/m² · ' + kwTxt(r.kw * 1000) },
        { label: 'Lamp electricity per year', value: fmt(r.kwhYear, 0) + ' kWh (' + fmt(r.kwhM2, 0) + ' kWh/m²)' },
        { label: 'Lamp electricity cost per year', value: money(r.cost) },
        { label: 'Lamp heat into the house while lit', value: fmt(r.sensW, 0) + ' W/m² of floor (' + fmt((1 - r.fPar) * 100, 0) + '% of lamp power, the non-PAR share)' + (r.hourly ? ' · ' + fmt(r.litH, 0) + ' lit hours a year' : '') }
      ];
    },
    tips: [
      'Lamp electricity = lamp DLI × days ÷ (3.6 × efficacy), per m² of lit area: the same formula as the Supplemental Light Payback calculator.',
      'The lamps also heat the house. The heating step credits the non-PAR share of lamp power hour by hour, at the hours they run; the PAR the crop absorbs is not credited, because much of it leaves as transpiration (latent heat). The design capacity gets no lamp credit, since the lamps may be off or failed on the design night.',
      'Whether lamps pay depends on crop price and yield response; the Supplemental Light Payback calculator runs that test, and the Grow Light guide lays out the fixtures.'
    ],
    viz: {
      viewBox: '0 0 480 250', label: 'Monthly daylight and lamp light at the crop against the target',
      draw: function (svg, ctx, r) {
        const cv = R(ctx, 'cover'), t = ctx.v.dli;
        const sun = cv.inside || [cv.insideLo];
        const lamp = r.monthly || [r.dliLamp || 0];
        const labels = cv.inside ? MONTHS.map(function (m) { return m.charAt(0); }) : ['darkest month'];
        const max = Math.ceil(Math.max(t * 1.2, Math.max.apply(null, sun)) / 10) * 10 || 10;
        const x0 = 40, x1 = 460, y0 = 34, y1 = 200, bw = (x1 - x0) / sun.length;
        const Y = function (d) { return y1 - (y1 - y0) * Math.min(d, max) / max; };
        sun.forEach(function (d, i) {
          G.el(svg, 'rect', { class: 'g-bar-warn', x: x0 + i * bw + 4, y: Y(d), width: bw - 8, height: y1 - Y(d), rx: 2 });
          const l = r.none ? 0 : lamp[i] || 0;
          if (l > 0) G.el(svg, 'rect', { class: 'g-bar', x: x0 + i * bw + 4, y: Y(d + l), width: bw - 8, height: Y(d) - Y(d + l), rx: 2 });
          text(svg, x0 + i * bw + bw / 2, y1 + 14, labels[i], 'middle', 'dim-text');
        });
        if (fin(t)) G.el(svg, 'line', { class: 'g-line', x1: x0, y1: Y(t), x2: x1, y2: Y(t), 'stroke-dasharray': '5 4' });
        text(svg, x1, Y(t) - 6, 'target ' + fmt(t, 1), 'end', 'g-strong');
        G.el(svg, 'rect', { class: 'g-bar-warn', x: x0, y: 226, width: 12, height: 12, rx: 2 });
        text(svg, x0 + 18, 236, 'daylight at the crop', 'start', 'g-label');
        G.el(svg, 'rect', { class: 'g-bar', x: 220, y: 226, width: 12, height: 12, rx: 2 });
        text(svg, 238, 236, 'lamps', 'start', 'g-label');
        text(svg, x0, 20, 'DLI at the crop, mol/m²/day', 'start', 'dim-text');
      },
      caption: function (ctx, r) { return r.none ? 'No lamps: daylight only' : fmt(r.ppfd, 0) + ' µmol/m²/s for ' + fmt(ctx.v.photo / 3600, 1) + ' h tops up the dark months'; }
    },
    sources: ['katzin2021', 'marcelis2006', 'thimijan1983', 'stallknecht2025'],
    links: function (ctx, r) {
      const x = ctx.v, s = R(ctx, 'site');
      const out = [];
      if (!r.none) {
        out.push({ slug: 'supplemental-light', label: 'Supplemental Light Payback', params: { ppfd: p(r.ppfd, 3), hours: p(x.photo / 3600, 3), days: 30, efficacy: p(x.eff, 3), rs: p(s.dliLo / 2, 3), tau: p(R(ctx, 'cover').tauGh, 3), pel: p(x.pel, 3) } });
      }
      return out;
    }
  };

  // ======================================================================================
  // 6. Heating and fuel
  // ======================================================================================
  const stepHeat = {
    id: 'heat', title: 'Heating capacity and fuel', short: 'Heating',
    intro: '<p>The heater has to hold the night set-point on the design night: no sun, screen closed, the cold extreme outside. The loss is the cover U-value × the cover area × the temperature difference, plus the heat carried out by leaking air. The yearly fuel follows from the same loss <strong>hour by hour</strong> over the typical year, with the sun credited during the day.</p>',
    fields: [
      { id: 'tDes', label: 'Design outdoor temperature', group: 'temperature', unit: 'C', signed: true,
        def: function (ctx) { return R(ctx, 'site').tW; }, hint: 'Suggested: the 99% winter design temperature from step 1.' },
      { id: 'fuel', label: 'Fuel', type: 'select', def: 'ngh', options: Object.keys(FUELS).map(function (k) { return { value: k, label: FUELS[k].name }; }) },
      { id: 'eta', half: true, label: 'Heater efficiency (gross basis)', suffix: '%', def: function (ctx) { return ctx.v.fuel === 'elec' ? 100 : 85; },
        check: function (v) { return v <= 0 || v > 500 ? 'Efficiency must be above 0 and at most 500% (heat-pump COP 5).' : ''; },
        hint: function (ctx) { return ctx.v.fuel === 'elec' ? '100% for resistance heat; a heat pump’s seasonal COP × 100 (e.g. 300%).' : 'Your heater’s efficiency on the gross (higher heating value) basis. Condensing boilers reach about 90–94% gross.'; } },
      { id: 'fuelPrice', half: true, label: 'Fuel price', suffix: 'per unit', def: function (ctx) { return ({ ngh: 0.45, ngl: 0.40, propane: 1.6, diesel: 1.3, wood: 0.15, elec: 0.15 })[ctx.v.fuel] || 0; },
        allowZero: true, hint: function (ctx) { return 'Per ' + (FUELS[ctx.v.fuel] || FUELS.ngh).unit + '. Example value; enter your own.'; } },
      { id: 'pctDrop', half: true, label: 'Peak hours to ignore (duration curve)', suffix: '%', def: 1, allowZero: true, check: pctCheck('Peak percentile', 0, 10),
        show: isSite, hint: 'Annual Heat &amp; Fuel calculator: drops the top hours so the plant is not sized on a few short peaks.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, hs = R(ctx, 'house'), cv = R(ctx, 'cover'), s = R(ctx, 'site');
      const uLeak = RHO_CP * x.ach * hs.meanH / 3600;          // W m⁻² floor K⁻¹
      const uFloor = cv.uTr * hs.ratio + uLeak;                // greenhouse-heat-load.js, compendium 7.3
      const dT = x.tHeat - x.tDes;
      const lossCover = cv.uTr * hs.ratio * dT, lossLeak = uLeak * dT;
      const demand = Math.max(0, lossCover + lossLeak);        // design hour: no sun
      const capW = demand * hs.floor;
      const out = { uLeak: uLeak, uFloor: uFloor, dT: dT, lossCover: lossCover, lossLeak: lossLeak, demand: demand, capW: capW };
      let kwhM2;
      if (s.site) {
        // annual-heat-demand.js: hourly load with the solar credit, and the duration curve.
        // Lamp heat from step 5 is credited in the hours it is delivered.
        const t = s.s.t, ghi = s.s.ghi, loads = new Array(t.length);
        const lamp = R(ctx, 'light').hourly;
        let sum = 0, hrs = 0, sumNoLamp = 0;
        for (let i = 0; i < t.length; i++) {
          const base = uFloor * (x.tHeat - t[i]) - ONE_F * cv.tauGh * ghi[i];
          const l = Math.max(0, base - (lamp ? lamp[i] : 0));
          sumNoLamp += Math.max(0, base);
          loads[i] = l; sum += l; if (l > 0) hrs++;
        }
        out.lampSaved = (sumNoLamp - sum) * (8760 / t.length) / 1000 * hs.floor;   // kWh y⁻¹
        const sorted = loads.slice().sort(function (a, b) { return b - a; });
        const k = Math.max(1, Math.ceil(x.pctDrop / 100 * sorted.length));
        out.curve = sorted; out.capCurve = sorted[Math.min(k - 1, sorted.length - 1)]; out.peak = sorted[0]; out.hrs = hrs;
        kwhM2 = sum * (8760 / t.length) / 1000;
      } else {
        kwhM2 = uFloor * x.cHdd * 24 / 1000;                    // degree-day method, no solar credit
      }
      const f = FUELS[x.fuel] || FUELS.ngh;
      const kwh = kwhM2 * hs.floor;
      const units = kwh * 3.6 / (f.hhv * x.eta / 100);
      out.kwhM2 = kwhM2; out.kwh = kwh; out.units = units; out.unit = f.unit; out.cost = units * x.fuelPrice;
      return out;
    },
    notices: function (ctx, r) {
      return [r.uLeak > 1.0 ? 'Air leakage adds ' + fmt(r.uLeak, 2) + ' W/m²·K per m² of floor, as much as the whole difference between single and double glazing. Sealing pays.' : '',
        R(ctx, 'site').site ? '' : 'Custom climate: the yearly heat uses degree-days with no solar or lamp credit, so it overstates the fuel somewhat.'];
    },
    results: function (ctx, r) {
      const out = [
        { label: 'Design heating capacity', value: kwTxt(r.capW), main: true },
        { label: 'Per m² of floor', value: fmt(r.demand, 0) + ' W/m² at ' + fmt(r.dT, 1) + ' K difference' },
        { label: 'Design U-value (per m² floor, screen and leakage included)', value: fmt(r.uFloor, 2) + ' W/m²·K' },
        { label: 'Heat through the cover / by leakage', value: fmt(r.lossCover, 0) + ' / ' + fmt(r.lossLeak, 0) + ' W/m²' }
      ];
      if (fin(r.capCurve)) out.push({ label: 'Capacity from the duration curve (top ' + fmt(ctx.v.pctDrop, 1) + '% of hours dropped)', value: kwTxt(r.capCurve * R(ctx, 'house').floor) });
      out.push({ label: 'Heat per year', value: fmt(r.kwh / 1000, 0) + ' MWh (' + fmt(r.kwhM2, 0) + ' kWh/m²)' + (r.lampSaved > 0 ? ', after ' + fmt(r.lampSaved / 1000, 0) + ' MWh of lamp heat' : '') });
      out.push({ label: 'Fuel per year', value: fmt(r.units, 0) + ' ' + r.unit + ' · cost ' + money(r.cost) });
      return out;
    },
    tips: function (ctx) {
      return [
        'Design capacity uses the screen closed and no sun, EP406.4-style. The duration curve shows how rarely that peak occurs; a smaller main heater plus a backup for the rare peak is a common choice.',
        'The yearly figure follows the Annual Heat &amp; Fuel calculator: one U-value (screen closed) every hour, with ' + fmt(ONE_F * 100, 0) + '% of the transmitted sun counted as useful heat. Real screens open by day, so expect somewhat more fuel than shown. Lamp heat from step 5 is credited in the hours the lamps run (move the switch-on hour to see the effect).',
        'Heater efficiency here is on the gross (higher heating value) basis, which is why the same boiler is quoted as 107% efficient on the net basis elsewhere.'
      ];
    },
    viz: {
      viewBox: '0 0 480 250', label: 'Load-duration curve: hourly heating demand sorted from highest to lowest, with the design capacity',
      draw: function (svg, ctx, r) {
        const x0 = 50, x1 = 460, y0 = 30, y1 = 200;
        if (!r.curve) {
          const tot = r.lossCover + r.lossLeak, max = Math.max(tot, 1);
          [['Through the cover', r.lossCover, 'g-bar'], ['By leakage', r.lossLeak, 'g-bar-water']].forEach(function (b, i) {
            const y = 70 + i * 50;
            text(svg, 150, y + 18, b[0], 'end', 'g-label');
            G.el(svg, 'rect', { class: b[2], x: 160, y: y, width: 280 * b[1] / max, height: 26, rx: 3 });
            text(svg, 166 + 280 * b[1] / max, y + 18, fmt(b[1], 0) + ' W/m²', 'start', 'g-strong');
          });
          text(svg, 240, 30, 'Design-hour heat loss per m² of floor', 'middle', 'dim-text');
          return;
        }
        const n = r.curve.length, max = Math.max(r.demand, r.peak) * 1.1 || 1;
        const X = function (i) { return x0 + (x1 - x0) * i / n; };
        const Y = function (v) { return y1 - (y1 - y0) * v / max; };
        let d = 'M' + x0 + ' ' + y1;
        for (let i = 0; i < n; i += 24) d += 'L' + X(i) + ' ' + Y(r.curve[i]);
        d += 'L' + x1 + ' ' + y1 + 'Z';
        G.el(svg, 'path', { class: 'g-bar-soft', d: d });
        G.el(svg, 'line', { class: 'g-line-warn', x1: x0, y1: Y(r.demand), x2: x1, y2: Y(r.demand), 'stroke-dasharray': '5 4' });
        text(svg, x1, Y(r.demand) - 6, 'design ' + fmt(r.demand, 0) + ' W/m²', 'end', 'g-warn-text');
        G.el(svg, 'line', { class: 'g-line-accent', x1: x0, y1: Y(r.capCurve), x2: x1, y2: Y(r.capCurve) });
        text(svg, x1, Y(r.capCurve) + 14, 'duration-curve capacity ' + fmt(r.capCurve, 0), 'end', 'g-accent-text');
        G.el(svg, 'line', { class: 'g-track', x1: x0, y1: y1, x2: x1, y2: y1 });
        text(svg, x0 - 6, y0 + 4, fmt(max, 0), 'end', 'dim-text');
        text(svg, x0 - 6, y1 + 4, '0', 'end', 'dim-text');
        [0, 2190, 4380, 6570, 8760].forEach(function (h) { text(svg, X(h * n / 8760), y1 + 16, String(h), 'middle', 'dim-text'); });
        text(svg, 255, y1 + 34, 'hours of the year, highest demand first', 'middle', 'dim-text');
        text(svg, x0, 18, 'Heating demand, W per m² of floor', 'start', 'dim-text');
        text(svg, X(r.hrs), Y(0) - 8, fmt(r.hrs, 0) + ' h with demand', fin(r.hrs) && r.hrs > n * 0.8 ? 'end' : 'start', 'g-label');
      },
      caption: function (ctx, r) { return kwTxt(r.capW) + ' design capacity · ' + fmt(r.units, 0) + ' ' + r.unit + ' of fuel a year'; }
    },
    sources: ['ep406', 'stanghellini2019', 'dezwart1996', 'ahamed2018'],
    links: function (ctx, r) {
      const x = ctx.v, hs = R(ctx, 'house'), cv = R(ctx, 'cover'), s = R(ctx, 'site');
      const out = [{ slug: 'greenhouse-heat-load', label: 'Greenhouse Heating Capacity', params: {
        length: p(x.len, 4), spans: Math.round(x.spans), spanw: p(x.spanW, 4), eaves: p(x.eaves, 3), roof: p(x.roof, 3), height: p(hs.meanH, 3),
        uc: p(x.uc, 3), screen: x.screen === 'yes' ? 1 : 0, pscreen: p((x.pscreen || 0) / 100, 3), ach: p(x.ach, 3),
        tin: p(x.tHeat, 3), tout: p(x.tDes, 3), rad: 0, tau: p(cv.tauGh, 3), area: p(hs.floor, 5) } }];
      if (s.site && x.fuel !== 'elec') {
        out.push({ slug: 'annual-heat-demand', label: 'Annual Heat & Fuel', params: { uprime: p(cv.uTr, 3), ratio: p(hs.ratio, 3), ach: p(x.ach, 3), height: p(hs.meanH, 3),
          tin: p(x.tHeat, 3), site: x.site, tau: p(cv.tauGh, 3), pct: p(x.pctDrop, 3), fuel: x.fuel, basis: 'gross', eta: p(x.eta / 100, 3), fuelprice: p(x.fuelPrice, 4), area: p(hs.floor, 5) } });
      }
      return out;
    }
  };

  // ======================================================================================
  // 7. Ventilation and cooling
  // ======================================================================================
  function fanSizing(o) {
    // fan-ventilation.js: EP406.4 eq. 4 rearranged for the specific air flow.
    const tInlet = o.tInlet, tEx = tInlet + o.rise, tMean = (tEx + tInlet) / 2;
    const solarGain = (1 - o.E) * o.tau * o.isun;
    const envelope = o.u * o.ratio * (tMean - o.tOut);
    const net = solarGain - envelope;
    const vEx = 1 / PSY.rhoDryAir(tEx, 0.6);
    return { net: net, q: net > 0 ? net * vEx / (CP_AIR * o.rise) : 0, tEx: tEx, tMean: tMean };
  }
  function padWater(t, rh, pk, eff, flow) {
    // evaporative-cooling.js: isenthalpic pad, water = dry-air mass flow × humidity-ratio rise.
    const wb = PSY.wetBulb(t, rh, pk), drop = eff * (t - wb), tOut = t - drop;
    const xIn = PSY.humidityRatio(t, rh, pk), hIn = PSY.enthalpy(t, rh, pk);
    const xOut = (hIn - 1.006 * tOut) / (2500 + 1.805 * tOut);
    const mDry = flow * PSY.rhoDryAir(t, rh, pk);
    const rhOut = Math.min(1, PSY.rhFromChi(tOut, PSY.chiFromE(pk * xOut / (0.622 + xOut), tOut)));
    return { wb: wb, tOut: tOut, rhOut: rhOut, gm2h: Math.max(0, mDry * (xOut - xIn) * 1000 * 3600) };
  }
  const stepVent = {
    id: 'vent', title: 'Ventilation and cooling', short: 'Cooling',
    intro: '<p>On a bright summer day the sun pours several hundred watts per m² into the house. Ventilation carries that heat out; the more air, the smaller the rise from inlet to exhaust. A wet <strong>evaporative pad</strong> on the inlet cools the incoming air towards the wet-bulb temperature, which works well in dry climates and poorly in humid ones. The sizing follows ANSI/ASAE EP406.4, as in the Fan Ventilation calculator.</p>',
    fields: [
      { id: 'cool', label: 'Cooling system', type: 'select', def: function (ctx) { return R(ctx, 'site').tS > 30 ? 'pad' : 'fans'; },
        options: [{ value: 'fans', label: 'Exhaust fans, open inlet' }, { value: 'pad', label: 'Exhaust fans with evaporative pad' }, { value: 'natural', label: 'Natural ventilation (roof and side vents)' }] },
      { id: 'pad', label: 'Pad', type: 'select', def: 'cell100', show: function (ctx) { return ctx.v.cool === 'pad'; },
        options: Object.keys(PADS).map(function (k) { return { value: k, label: PADS[k].name + ' (' + fmt(PADS[k].eff * 100, 0) + '% efficient)' }; }) },
      { id: 'E', half: true, label: 'Evapotranspiration coefficient E', suffix: '', def: 0.5, allowZero: true,
        check: function (v) { return v > 1.4 ? 'E must be 1.4 or less.' : ''; },
        hint: 'Share of the transmitted sun the crop turns into transpiration. Young, stressed or succulent crops lower it; wet floors raise it. It decides most of the answer.' },
      { id: 'rise', half: true, label: 'Allowed inlet-to-exhaust rise', group: 'tempdiff', unit: 'C', def: 4 },
      { id: 'isun', half: true, label: 'Design sun', suffix: 'W/m²', def: 900, hint: 'The EP406.4 design chart uses 900 W/m².' },
      { id: 'fanQ', half: true, label: 'Rated flow per fan', group: 'airflow', unit: 'm3s', def: 4, show: function (ctx) { return ctx.v.cool !== 'natural'; },
        hint: 'At the working static pressure, from the fan’s test report.' },
      { id: 'fanD', half: true, label: 'Fan diameter', group: 'length', unit: 'm', def: 1.25, show: function (ctx) { return ctx.v.cool !== 'natural'; } }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = R(ctx, 'site'), hs = R(ctx, 'house'), cv = R(ctx, 'cover');
      const pk = PSY.pressureAt(x.elev);
      const usePad = x.cool === 'pad', pad = PADS[x.pad] || PADS.cell100;
      const pw = padWater(s.tS, s.rhS, pk, usePad ? pad.eff : 0, 0.06);
      const tInlet = usePad ? pw.tOut : s.tS;
      const f = fanSizing({ tInlet: tInlet, rise: x.rise, E: x.E, tau: cv.tauGh, isun: x.isun, u: x.uc, ratio: hs.ratio, tOut: s.tS });
      const qTot = f.q * hs.floor;
      const out = { pw: pw, tInlet: tInlet, f: f, qSpec: f.q, qTot: qTot, wb: pw.wb, usePad: usePad };
      // hours a year the house is ventilating
      let coolH;
      if (s.site) { coolH = 0; for (let i = 0; i < s.s.n; i++) if (s.s.t[i] > x.tVent) coolH++; } else coolH = x.cCoolH;
      out.coolH = coolH;
      if (x.cool === 'natural') {
        out.ventLo = 0.15 * hs.floor; out.ventHi = 0.20 * hs.floor;     // EP406.4: side and ridge each 15–20 % of floor
        out.fanKw = 0; out.fanKwh = 0; out.water = 0;
        return out;
      }
      const nFans = Math.ceil(qTot / x.fanQ);
      const fanArea = Math.PI * Math.pow(x.fanD / 2, 2);
      const staticPa = usePad ? 30 : 15;                                // EP406.4 0.030 / 0.015 kPa
      out.nFans = nFans; out.louvre = 1.375 * fanArea * nFans;
      out.fanKw = nFans * x.fanQ * staticPa / 0.6 / 1000;              // installed, 60 % total efficiency
      const qCap = nFans * x.fanQ / hs.floor;                          // installed m³ s⁻¹ per m² floor
      out.fanKwhMax = out.fanKw * coolH;
      if (usePad) {
        out.padArea = qTot / pad.face;
        out.padLen = hs.W;                                              // pad across the end wall
        out.padH = out.padArea / out.padLen;
        out.padFlowLpm = pad.water * out.padLen;                        // EP406.4 minimum, L/min per m of pad
        out.waterPeak = padWater(s.tS, s.rhS, pk, pad.eff, f.q).gm2h * hs.floor / 1000;   // L/h
      }
      if (s.site) {
        // Expected values, hour by hour over the typical year. Each hour the controller asks
        // for the air flow that holds the mean house temperature at the ventilation
        // set-point (same balance as the sizing, with that hour's sun, outside air and lamp
        // heat), staged fans deliver it up to the installed capacity, and the pad is wetted
        // only in hours when the fans alone cannot hold the set-point.
        const lamp = R(ctx, 'light').hourly;
        let fanKwh = 0, gWater = 0, fanH = 0, padH = 0, overH = 0;
        const flowAt = function (tIn, i) {
          const rise = Math.min(x.rise, 2 * (x.tVent - tIn));
          if (rise <= 0) return Infinity;                               // inlet already at the set-point
          const gain = (1 - x.E) * cv.tauGh * s.s.ghi[i] + (lamp ? lamp[i] : 0);
          const net = gain - x.uc * hs.ratio * (x.tVent - s.s.t[i]);
          if (net <= 0) return 0;
          return net / PSY.rhoDryAir(tIn + rise, 0.6) / (CP_AIR * rise);
        };
        for (let i = 0; i < s.s.n; i++) {
          const t = s.s.t[i];
          let qh = flowAt(t, i), wet = false;
          if (qh === 0) continue;
          if (usePad && qh > qCap) {
            const pw2 = padWater(t, s.s.rh[i], pk, pad.eff, qCap);
            const qp = flowAt(pw2.tOut, i);
            wet = true; qh = qp;
          }
          const qRun = Math.min(qh, qCap);
          if (qh > qCap) overH++;
          fanKwh += out.fanKw * qRun / qCap; fanH++;
          if (wet) { gWater += padWater(t, s.s.rh[i], pk, pad.eff, qRun).gm2h; padH++; }
        }
        out.fanKwh = fanKwh; out.fanH = fanH; out.padHrs = padH; out.overH = overH;
        out.water = usePad ? gWater * hs.floor / 1e6 : 0;               // m³ per year
        out.expected = true;
      } else {
        out.fanKwh = out.fanKwhMax;
        out.water = usePad ? padWater(s.tS, s.rhS, pk, pad.eff, f.q).gm2h * coolH * hs.floor / 1e6 : 0;
        out.expected = false;
      }
      return out;
    },
    notices: function (ctx, r) {
      const x = ctx.v, n = [];
      if (r.expected && r.overH > 50) n.push('In ' + fmt(r.overH, 0) + ' hours of the typical year the installed ' + (r.usePad ? 'fans and pad' : 'fans') + ' cannot hold the ' + fmt(x.tVent, 1) + ' °C set-point; the house runs warmer then.');
      if (r.f.net <= 0) n.push('At these settings the crop absorbs more than the net heat gain, so no ventilation is needed to hold the rise (the sizing balance has no positive solution).');
      if (r.qSpec > 0.08) n.push(fmt(r.qSpec, 3) + ' m³/s per m² is above EP406.4’s 0.06 (or 0.08 with pads). Check E, the allowed rise, or consider shading.');
      if (r.usePad && r.pw.rhOut > 0.9) n.push('Air leaves the pad at ' + fmt(r.pw.rhOut * 100, 0) + '% RH: little cooling resource left and a Botrytis risk.');
      if (r.f.tMean > x.tVent + 2) n.push('Mean house temperature at the design hour is about ' + fmt(r.f.tMean, 1) + ' °C, above the ' + fmt(x.tVent, 1) + ' °C ventilation set-point. ' + (r.usePad ? 'A deeper pad, shading or a smaller rise will help.' : 'Consider an evaporative pad, shading or a smaller allowed rise.'));
      if (r.usePad && r.padH > 2.4) n.push('The pad would need to be ' + fmt(r.padH, 1) + ' m tall across the end wall; EP406.4 keeps vertical pads 0.6–2.4 m. Put pads on both end walls, or along a side wall, or use a deeper (faster) pad.');
      if (x.cool !== 'natural' && x.len > 45 && r.usePad) n.push('EP406.4 prefers a pad-to-fan distance of 30–45 m; this house is ' + fmt(x.len, 0) + ' m long. Put pads and fans across the shorter dimension if you can.');
      return n;
    },
    results: function (ctx, r) {
      const x = ctx.v;
      const out = [
        { label: 'Air flow needed', value: q('airflow', r.qTot, ['m3s', 'cfm']), main: true },
        { label: 'Per m² of floor', value: fmt(r.qSpec, 3) + ' m³/s·m² (EP406.4: 0.06, 0.08 with pads) · ' + fmt(r.qSpec * 3600 / R(ctx, 'house').meanH, 0) + ' air changes/h' },
        { label: 'Inlet air', value: tTxt(r.tInlet) + (r.usePad ? ' after the pad (wet-bulb ' + fmt(r.wb, 1) + ' °C)' : ' (outside air)') },
        { label: 'Exhaust / mean house temperature', value: fmt(r.f.tEx, 1) + ' / ' + fmt(r.f.tMean, 1) + ' °C' }
      ];
      if (x.cool === 'natural') {
        out.push({ label: 'Roof (ridge) vent area', value: fmt(r.ventLo, 0) + '–' + fmt(r.ventHi, 0) + ' m² (15–20% of floor)' });
        out.push({ label: 'Side vent area', value: fmt(r.ventLo, 0) + '–' + fmt(r.ventHi, 0) + ' m², about equal to the roof vents' });
      } else {
        out.push({ label: 'Fans', value: r.nFans + ' × ' + q('airflow', x.fanQ, ['m3s', 'cfm']) + ' · louvres ' + fmt(r.louvre, 1) + ' m²' });
        out.push({ label: 'Fan power, all fans running', value: fmt(r.fanKw, 1) + ' kW' });
        out.push({ label: 'Fan electricity per year', value: r.expected
          ? fmt(r.fanKwh, 0) + ' kWh expected (fans running ' + fmt(r.fanH, 0) + ' h, including sunny hours when it is cooler outside than the set-point)'
          : 'about ' + fmt(r.fanKwh, 0) + ' kWh (full speed for the ' + fmt(r.coolH, 0) + ' h above set-point; misses part-load ventilation on cooler sunny days, so it can read low)' });
        if (r.usePad) {
          out.push({ label: 'Pad face area', value: fmt(r.padArea, 1) + ' m² · ' + fmt(r.padH, 2) + ' m tall across the ' + fmt(r.padLen, 1) + ' m end wall' });
          out.push({ label: 'Pad water supply (minimum)', value: fmt(r.padFlowLpm, 0) + ' L/min · ' + fmt(r.padFlowLpm / 3.785411784, 0) + ' US gpm' });
          out.push({ label: 'Pad water evaporated, design hour / year', value: fmt(r.waterPeak, 0) + ' L/h · ' + (r.expected ? fmt(r.water, 0) + ' m³/year expected (pad wet ' + fmt(r.padHrs, 0) + ' h)' : 'up to ' + fmt(r.water, 0) + ' m³/year (upper bound)') });
        }
      }
      return out;
    },
    tips: function (ctx) {
      const t = ['The evapotranspiration coefficient E does most of the work: moving it from 0.3 to 0.7 changes the air flow about 2.3 times. Use a measured value if you have one.',
        'Yearly fan electricity and pad water are worked out hour by hour: each hour the fans are staged to the air flow that holds the ventilation set-point (with that hour’s sun, outside air and lamp heat), and the pad is wetted only when the fans alone cannot hold it. Fan power is taken as proportional to air flow (fans switched in stages), which slightly overstates variable-speed fans.',
        'EP406.4 layout rules: exhaust fans no more than 7.6 m apart, 4–5 fan diameters of clear space downstream, louvres 1.25–1.5 × fan area, pads facing the prevailing summer wind.'];
      if (ctx.v.cool === 'natural') t.push('Natural ventilation depends on wind and on the house being warmer than outside. Insect screens on the vents cut the flow; the Natural Ventilation calculator shows by how much.');
      if (ctx.v.cool === 'pad') t.push('A pad lowers E by humidifying the inlet air, so the inlet-to-exhaust rise grows while the average house temperature falls.');
      return t;
    },
    viz: {
      viewBox: '0 0 480 240', label: 'Section through the house: inlet, air flow and exhaust with their temperatures',
      draw: function (svg, ctx, r) {
        const nat = ctx.v.cool === 'natural';
        const x0 = 70, x1 = 410, yT = 70, yB = 190;
        G.el(svg, 'path', { class: 'g-box', d: 'M' + x0 + ' ' + yB + 'L' + x0 + ' ' + yT + 'L' + ((x0 + x1) / 2) + ' ' + (yT - 35) + 'L' + x1 + ' ' + yT + 'L' + x1 + ' ' + yB + 'Z' });
        G.el(svg, 'line', { class: 'g-track', x1: 20, y1: yB, x2: 460, y2: yB });
        if (nat) {
          G.el(svg, 'rect', { class: 'g-bar', x: x0 - 4, y: yB - 50, width: 8, height: 36 });
          G.el(svg, 'rect', { class: 'g-bar', x: (x0 + x1) / 2 + 6, y: yT - 36, width: 30, height: 7, transform: 'rotate(-12 ' + ((x0 + x1) / 2 + 6) + ' ' + (yT - 32) + ')' });
          text(svg, x0 - 10, yB - 56, 'side vent', 'end', 'g-label');
          text(svg, (x0 + x1) / 2 + 40, yT - 44, 'roof vent', 'start', 'g-label');
        } else {
          if (r.usePad) { G.el(svg, 'rect', { class: 'g-bar-water', x: x0 - 6, y: yB - 80, width: 12, height: 70 }); text(svg, x0 - 12, yB - 86, 'pad', 'end', 'g-label'); }
          G.el(svg, 'circle', { class: 'g-bar', cx: x1, cy: yB - 45, r: 18 });
          text(svg, x1 + 24, yB - 64, (r.nFans || 0) + ' fans', 'start', 'g-label');
        }
        const ay = yB - 45;
        G.el(svg, 'line', { class: 'g-line-accent', x1: 20, y1: ay, x2: x0 - 10, y2: ay });
        G.el(svg, 'line', { class: 'g-line-accent', x1: x0 + 14, y1: ay, x2: x1 - 24, y2: ay, 'stroke-dasharray': '6 5' });
        G.el(svg, 'line', { class: 'g-line-accent', x1: x1 + 22, y1: ay, x2: 465, y2: ay });
        text(svg, 16, ay - 12, fmt(R(ctx, 'site').tS, 1) + ' °C out', 'start', 'g-strong');
        text(svg, x0 + 20, ay + 22, fmt(r.tInlet, 1) + ' °C in', 'start', 'g-strong');
        text(svg, x1 - 30, ay + 22, fmt(r.f.tEx, 1) + ' °C', 'end', 'g-strong');
        for (let i = 0; i < 5; i++) G.el(svg, 'line', { class: 'g-line-warn', x1: 150 + i * 45, y1: 14, x2: 140 + i * 45, y2: yT - 8 });
        text(svg, 240, 12, fmt(ctx.v.isun, 0) + ' W/m² sun', 'middle', 'g-warn-text');
        text(svg, 240, 224, fmt(r.qSpec, 3) + ' m³/s per m² · ' + fmt(r.qTot, 1) + ' m³/s total', 'middle', 'g-label');
      },
      caption: function (ctx, r) { return 'Design hour: ' + fmt(R(ctx, 'site').tS, 1) + ' °C outside, ' + fmt(ctx.v.isun, 0) + ' W/m² sun'; }
    },
    sources: ['ep406', 'sethi2007', 'kittas2005', 'stanghellini2019'],
    links: function (ctx, r) {
      const x = ctx.v, s = R(ctx, 'site'), hs = R(ctx, 'house'), cv = R(ctx, 'cover');
      const out = [];
      if (x.cool === 'natural') {
        out.push({ slug: 'natural-ventilation', label: 'Natural Ventilation', params: { floor: p(hs.floor, 5), height: p(hs.meanH, 3), aroof: p(r.ventLo, 4), aside: p(r.ventLo, 4), tout: p(s.tS, 3) } });
      } else {
        out.push({ slug: 'fan-ventilation', label: 'Fan Ventilation Sizing', params: { area: p(hs.floor, 5), isun: p(x.isun, 4), tau: p(cv.tauGh, 3), u: p(x.uc, 3), ratio: p(hs.ratio, 3), tout: p(s.tS, 3), E: p(x.E, 3), rise: p(x.rise, 3), pad: r.usePad ? 1 : 0, tinlet: p(r.tInlet, 3), fansize: p(x.fanQ, 3), fandia: p(x.fanD, 3), wall: p(hs.W, 4) } });
      }
      if (r.usePad) out.push({ slug: 'evaporative-cooling', label: 'Evaporative Cooling', params: { t: p(s.tS, 3), rh: p(s.rhS * 100, 3), alt: p(x.elev, 4), eff: (PADS[x.pad] || PADS.cell100).eff, flow: p(r.qSpec, 3), area: p(hs.floor, 5), hours: Math.round(r.coolH) } });
      return out;
    }
  };

  // ======================================================================================
  // 8. Night humidity and condensation
  // ======================================================================================
  function freeRun(ctx, ach) {
    const x = ctx.v, hs = R(ctx, 'house');
    return CROPM.freeRunning({ tIn: x.tHeat, tOut: x.tNight, rhOut: x.rhNight / 100, iGlobal: 0, crop: x.hCrop, tauGh: R(ctx, 'cover').tauGh, night: true,
      ach: ach, height: hs.meanH, areaRatio: hs.ratio, rInner: 0.10, rCover: 0.005, rOuter: 0.05, skyDepression: 0 });
  }
  const stepHum = {
    id: 'hum', title: 'Night humidity and condensation', short: 'Humidity',
    intro: '<p>A closed, heated house at night fills with water vapour from the crop. It leaves by two natural routes: <strong>leaking out</strong> with the air and <strong>condensing</strong> on the cold cover. The humidity settles where those exits balance the crop. If it settles above your limit, you have to ventilate (and pay to heat the extra air) or dehumidify. This step uses the same vapour-balance model as the Humidity &amp; Condensation Risk calculator.</p>',
    fields: [
      { id: 'tNight', half: true, label: 'Outside night temperature', group: 'temperature', unit: 'C', signed: true,
        def: function (ctx) { return R(ctx, 'site').tNight; }, hint: function (ctx) { return R(ctx, 'site').site ? 'Suggested: the mean night temperature of ' + R(ctx, 'site').coldMonth + ', the coldest month.' : 'Suggested: the typical winter night from step 1.'; } },
      { id: 'rhNight', half: true, label: 'Outside night humidity', suffix: '% RH', def: function (ctx) { return Math.round(R(ctx, 'site').rhNight * 100); }, check: pctCheck('Humidity', 1, 100) },
      { id: 'hCrop', label: 'Transpiration parameters', type: 'select', def: function (ctx) { return cropOf(ctx).model; },
        options: Object.keys(CROPM.CROPS).map(function (k) { return { value: k, label: CROPM.CROPS[k].label + ' (LAI ' + CROPM.CROPS[k].lai + ')' }; }),
        hint: 'Published big-leaf parameters exist for these four crops only. For leafy greens and herbs, tomato is used as a stand-in.' }
    ],
    compute: function (ctx) {
      const x = ctx.v;
      const base = freeRun(ctx, x.ach);
      const lim = x.rhMax / 100;
      const out = { base: base, lim: lim, ok: base.rh <= lim };
      if (!out.ok) {
        let lo = x.ach, hi = 60, fr = freeRun(ctx, hi);
        if (fr.rh > lim) { out.impossible = true; }
        else {
          for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (freeRun(ctx, m).rh > lim) lo = m; else hi = m; }
          out.achNeed = hi;
          const sol = freeRun(ctx, hi);
          out.sol = sol;
          const hs = R(ctx, 'house');
          out.extraW = RHO_CP * (hi - x.ach) * hs.meanH / 3600 * (x.tHeat - x.tNight);   // W m⁻² floor, sensible
          const extraV = (sol.V - base.V);                                                 // kg m⁻² s⁻¹ more vapour out
          out.kwhPerKg = extraV > 0 ? out.extraW / extraV / 3.6e6 : NaN;
          out.extraKw = out.extraW * hs.floor / 1000;
        }
      }
      return out;
    },
    notices: function (ctx, r) {
      return [r.impossible ? 'Even 60 air changes an hour would not bring the humidity down to the limit with this outside air. Active dehumidification (or a lower limit on transpiration) is needed; see the Dehumidification Options calculator.' : '',
        r.base.saturated ? 'The model house reaches saturation: expect dripping and wet leaves on nights like this.' : ''];
    },
    results: function (ctx, r) {
      const b = r.base, gh = function (v) { return fmt(v * 3.6e6, 1) + ' g/m²·h'; };
      const out = [
        { label: 'Night humidity with leakage only', value: fmt(b.rh * 100, 0) + '% RH (limit ' + fmt(ctx.v.rhMax, 0) + '%)', main: true },
        { label: 'Crop transpiration', value: gh(b.E) },
        { label: 'Vapour out by leakage / by condensation', value: gh(b.V) + ' / ' + gh(b.C) },
        { label: 'Inner cover surface temperature', value: tTxt(b.t_cover) }
      ];
      if (fin(r.achNeed)) {
        out.push({ label: 'Air exchange to hold the limit', value: fmt(r.achNeed, 2) + ' air changes/h (from ' + fmt(ctx.v.ach, 2) + ')' });
        out.push({ label: 'Extra heat for that air', value: fmt(r.extraW, 1) + ' W/m² · ' + kwTxt(r.extraKw * 1000) + (fin(r.kwhPerKg) ? ' · ' + fmt(r.kwhPerKg, 2) + ' kWh per kg water removed' : '') });
      }
      return out;
    },
    tips: [
      'Transpiration rises as the air is dried, because the crop pushes vapour harder into dry air: drying the air makes more water to dry.',
      'Venting to dry the house costs about the heat needed to warm the extra air. Compare that per-kg cost with heat-pump or desiccant dehumidifiers in the Dehumidification Options calculator.',
      'A closed thermal screen keeps the crop side of the house warmer and moves condensation onto the screen and the cover above it.'
    ],
    viz: {
      viewBox: '0 0 480 220', label: 'Where the crop’s night-time water vapour goes: leakage, condensation and any extra ventilation',
      draw: function (svg, ctx, r) {
        const b = r.base, sol = r.sol || b;
        const rows = [
          ['Crop transpiration', sol.E, 'g-bar'],
          ['Out by leakage / venting', sol.V, 'g-bar-water'],
          ['Condenses on the cover', sol.C, 'g-bar-warn']
        ];
        const max = Math.max(sol.E, sol.V, sol.C, 1e-9);
        rows.forEach(function (row, i) {
          const y = 40 + i * 46;
          text(svg, 170, y + 18, row[0], 'end', 'g-label');
          G.el(svg, 'rect', { class: 'g-track', x: 180, y: y, width: 250, height: 26, rx: 3 });
          G.el(svg, 'rect', { class: row[2], x: 180, y: y, width: 250 * row[1] / max, height: 26, rx: 3 });
          text(svg, 186 + 250 * row[1] / max, y + 18, fmt(row[1] * 3.6e6, 1) + ' g/m²·h', 'start', 'g-strong');
        });
        text(svg, 240, 20, r.sol ? 'At the air exchange that holds ' + fmt(ctx.v.rhMax, 0) + '% RH' : 'Leakage only, settling at ' + fmt(b.rh * 100, 0) + '% RH', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return 'Night at ' + fmt(ctx.v.tNight, 1) + ' °C outside, house at ' + fmt(ctx.v.tHeat, 1) + ' °C'; }
    },
    sources: ['stanghellini2019', 'stanghellini1987', 'vanthoor2011', 'campen2003'],
    links: function (ctx, r) {
      const x = ctx.v, hs = R(ctx, 'house');
      return [{ slug: 'equilibrium-humidity', label: 'Humidity & Condensation Risk', params: { tin: p(x.tHeat, 3), tout: p(x.tNight, 3), rhout: p(x.rhNight, 3), rad: 0, tau: p(R(ctx, 'cover').tauGh, 3), crop: x.hCrop, night: 1, ach: p(r.achNeed || x.ach, 3), height: p(hs.meanH, 3), arearatio: p(hs.ratio, 3) } },
        { slug: 'dehumidification-routes', label: 'Dehumidification Options', params: {} }];
    }
  };

  // ======================================================================================
  // 9. CO₂ enrichment
  // ======================================================================================
  const stepCo2 = {
    id: 'co2', title: 'CO₂ enrichment', short: 'CO₂',
    intro: '<p>In a closed house on a bright winter day the crop can pull CO₂ well below outside air. Adding CO₂ back raises growth, but the gas you inject is lost through every leak and vent. Enrich only while the vents are shut: EP406.4 does not recommend enrichment once ventilation passes 0.020 m³/s per m² of floor.</p>',
    fields: [
      { id: 'co2On', label: 'Enrichment', type: 'select', def: 'yes', options: [{ value: 'yes', label: 'Enrich with CO₂' }, { value: 'no', label: 'No enrichment' }] },
      { id: 'co2Set', half: true, label: 'CO₂ set-point', suffix: 'ppm', def: 800, show: function (ctx) { return ctx.v.co2On === 'yes'; },
        check: function (v) { return v <= 420 ? 'The set-point must be above outside air (about 420 ppm).' : ''; } },
      { id: 'assim', half: true, label: 'Crop CO₂ uptake', suffix: 'g/m²·h', def: function (ctx) { return cropOf(ctx).assim; }, allowZero: true, show: function (ctx) { return ctx.v.co2On === 'yes'; },
        hint: 'A fully grown greenhouse crop takes up about 3–5 g/m²·h in good light (CO₂ Enrichment calculator). The leafy-crop default of 2.5 is a lower working assumption.' },
      { id: 'co2H', half: true, label: 'Enriched hours per year', suffix: 'h', show: function (ctx) { return ctx.v.co2On === 'yes'; },
        def: function (ctx) {
          const s = R(ctx, 'site');
          if (!s.site) return 2500;
          let n = 0; for (let i = 0; i < s.s.n; i++) if (s.s.ghi[i] > 50 && s.s.t[i] < ctx.v.tHeat) n++;
          return n;
        },
        hint: 'Suggested: daylight hours when it is colder outside than the heating set-point, so the vents are normally shut.' },
      { id: 'co2Price', half: true, label: 'CO₂ price', suffix: 'per tonne', def: 150, allowZero: true, show: function (ctx) { return ctx.v.co2On === 'yes'; },
        hint: 'Delivered liquid CO₂; example value. Flue gas from an on-site boiler is a different, usually cheaper source.' }
    ],
    compute: function (ctx) {
      const x = ctx.v, hs = R(ctx, 'house');
      if (x.co2On !== 'yes') return { none: true, tonnes: 0, cost: 0 };
      const pk = PSY.pressureAt(x.elev), tK = x.tHeat + 273.15;
      const perPpm = M_CO2 * pk * 1000 / (R_GAS * tK) * 1e-6 * 1000;      // co2-enrichment.js, mg m⁻³ per ppm
      const dC = (x.co2Set - 420) * perPpm;
      const gv = x.ach * hs.meanH / 3600;
      const vent = gv * dC * 1e-3 * 3600;                                  // g m⁻² h⁻¹ lost to leakage
      const inj = vent + x.assim;
      const tonnes = inj * hs.floor * x.co2H / 1e6;
      return { none: false, vent: vent, inj: inj, kgh: inj * hs.floor / 1000, tonnes: tonnes, cost: tonnes * x.co2Price, gv: gv };
    },
    results: function (ctx, r) {
      if (r.none) return [{ label: 'CO₂ enrichment', value: 'none', main: true }];
      return [
        { label: 'Injection rate with vents shut', value: fmt(r.kgh, 1) + ' kg/h (' + fmt(r.inj, 2) + ' g/m²·h)', main: true },
        { label: 'Lost through leakage / taken up by the crop', value: fmt(r.vent, 2) + ' / ' + fmt(ctx.v.assim, 2) + ' g/m²·h' },
        { label: 'CO₂ per year', value: fmt(r.tonnes, 1) + ' t over ' + fmt(ctx.v.co2H, 0) + ' h' },
        { label: 'CO₂ cost per year', value: money(r.cost) }
      ];
    },
    tips: ['Leak-tight houses keep more of the CO₂ you buy: the leakage term scales directly with the air-change rate from step 4.',
      'One hour with vents open can lose more CO₂ than a day with them shut. Most growers drop the set-point to about outside air whenever the vents open.'],
    viz: {
      viewBox: '0 0 480 160', label: 'CO₂ injection split between leakage loss and crop uptake',
      draw: function (svg, ctx, r) {
        if (r.none) { text(svg, 240, 80, 'No enrichment', 'middle', 'dim-text'); return; }
        const tot = r.inj, x0 = 30, x1 = 450, w = x1 - x0;
        const a = w * ctx.v.assim / tot;
        G.el(svg, 'rect', { class: 'g-bar', x: x0, y: 50, width: a, height: 40, rx: 4 });
        G.el(svg, 'rect', { class: 'g-bar-water', x: x0 + a, y: 50, width: w - a, height: 40, rx: 4 });
        text(svg, x0 + a / 2, 76, a > 60 ? 'crop ' + fmt(ctx.v.assim / tot * 100, 0) + '%' : '', 'middle', 'g-strong');
        text(svg, x0 + a + (w - a) / 2, 76, w - a > 60 ? 'leakage ' + fmt(r.vent / tot * 100, 0) + '%' : '', 'middle', 'g-strong');
        text(svg, 240, 30, 'Where injected CO₂ goes, vents shut', 'middle', 'dim-text');
        text(svg, 240, 120, fmt(r.inj, 2) + ' g/m²·h to hold ' + fmt(ctx.v.co2Set, 0) + ' ppm', 'middle', 'g-label');
      },
      caption: function (ctx, r) { return r.none ? 'No CO₂ enrichment' : fmt(r.tonnes, 1) + ' t of CO₂ a year'; }
    },
    sources: ['ep406', 'stanghellini2019', 'vanthoor2011'],
    links: function (ctx, r) {
      const x = ctx.v, hs = R(ctx, 'house');
      return r.none ? [] : [{ slug: 'co2-enrichment', label: 'CO₂ Enrichment', params: { target: p(x.co2Set, 4), outside: 420, tair: p(x.tHeat, 3), alt: p(x.elev, 4), ach: p(x.ach, 3), height: p(hs.meanH, 3), assim: p(x.assim, 3), area: p(hs.floor, 5), hours: Math.round(x.co2H), price: p(x.co2Price, 4) } }];
    }
  };

  // ======================================================================================
  // 10. Irrigation and water
  // ======================================================================================
  const stepWater = {
    id: 'water', title: 'Irrigation and water', short: 'Water',
    intro: '<p>Almost all the water a crop takes up is transpired, and transpiration is driven mainly by the sun. The guide estimates it from the light reaching the crop and the evapotranspiration coefficient E used for cooling, adds a drainage fraction so salts do not build up, and adds the pad water from the cooling step.</p>',
    fields: [
      { id: 'drain', half: true, label: 'Drainage fraction', suffix: '%', def: 30, allowZero: true, check: pctCheck('Drainage fraction', 0, 60),
        hint: 'Share of the supply meant to drain. About 70% of irrigation ending up transpired is this at 30% (Irrigation &amp; Drainage calculator).' },
      { id: 'recycle', half: true, label: 'Drainage recycled', suffix: '%', def: 90, allowZero: true, check: pctCheck('Recycled share', 0, 100),
        hint: 'Closed systems reuse most drainage; how much is limited by sodium build-up (Salt Build-Up calculator).' },
      { id: 'buffer', half: true, label: 'Days of water storage', suffix: 'days', def: 2, allowZero: true },
      { id: 'pWater', half: true, label: 'Water price', suffix: 'per m³', def: 1.2, allowZero: true }
    ],
    compute: function (ctx) {
      const x = ctx.v, s = R(ctx, 'site'), hs = R(ctx, 'house'), cv = R(ctx, 'cover'), vt = R(ctx, 'vent');
      const E = x.E, tau = cv.tauGh;
      const tPeak = E * tau * (s.dliHi / 2) / LAMBDA;                 // mm d⁻¹ = L m⁻² d⁻¹
      let tYear;
      if (s.site) { tYear = 0; s.s.months.forEach(function (m, i) { tYear += MONTH_DAYS[i] * E * tau * m.rs / LAMBDA; }); }
      else tYear = 365 * E * tau * ((s.dliLo + s.dliHi) / 4) / LAMBDA;
      const f = x.drain / 100, rec = x.recycle / 100;
      const supplyPeak = tPeak / (1 - f);                             // root-zone-water.js: I = T / (1 − D)
      const freshPeak = supplyPeak - (supplyPeak - tPeak) * rec;
      const supplyYear = tYear / (1 - f), freshYear = supplyYear - (supplyYear - tYear) * rec;
      const A = hs.growArea;
      const out = { tPeak: tPeak, tYear: tYear, supplyPeakM3: supplyPeak * A / 1000, freshPeakM3: freshPeak * A / 1000, freshYearM3: freshYear * A / 1000, padM3: vt.water || 0 };
      out.totalM3 = out.freshYearM3 + out.padM3;
      out.storeM3 = (out.freshPeakM3 + (vt.waterPeak || 0) * 10 / 1000) * x.buffer;   // pads ≈ 10 h a hot day
      out.cost = out.totalM3 * x.pWater;
      return out;
    },
    results: function (ctx, r) {
      return [
        { label: 'Peak-day irrigation supply', value: q('volume', r.supplyPeakM3 * 1000, ['m3', 'gal'], 1) + ' per day (' + fmt(r.tPeak / (1 - ctx.v.drain / 100), 1) + ' L/m²)', main: true },
        { label: 'Crop transpiration, peak month', value: fmt(r.tPeak, 1) + ' mm/day' },
        { label: 'New water per year, irrigation', value: fmt(r.freshYearM3, 0) + ' m³ (' + fmt(r.tYear, 0) + ' mm transpired)' },
        { label: 'Pad water per year', value: fmt(r.padM3, 0) + ' m³' },
        { label: 'Total new water per year', value: q('volume', r.totalM3 * 1000, ['m3', 'gal'], 0) + ' · cost ' + money(r.cost) },
        { label: 'Storage for ' + fmt(ctx.v.buffer, 1) + ' peak days', value: q('volume', r.storeM3 * 1000, ['m3', 'gal'], 1) }
      ];
    },
    tips: [
      'Transpiration here is E × light at the crop ÷ latent heat (2.45 MJ per kg of water), i.e. the same coefficient E as the cooling step. A measured E for your crop improves both.',
      'Trigger irrigation on accumulated radiation, not on a clock: transpiration follows the sun much more than the temperature.',
      'Rainwater from the roof can cover a large share of this in wet climates; the roof area is the floor area of step 3.'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'Yearly new water: irrigation and evaporative pads',
      draw: function (svg, ctx, r) {
        const rows = [['Irrigation (after recycling)', r.freshYearM3, 'g-bar'], ['Evaporative pads', r.padM3, 'g-bar-water']];
        const max = Math.max(r.freshYearM3, r.padM3, 1);
        rows.forEach(function (row, i) {
          const y = 50 + i * 54;
          text(svg, 190, y + 20, row[0], 'end', 'g-label');
          G.el(svg, 'rect', { class: 'g-track', x: 200, y: y, width: 230, height: 30, rx: 3 });
          G.el(svg, 'rect', { class: row[2], x: 200, y: y, width: 230 * row[1] / max, height: 30, rx: 3 });
          text(svg, 206 + 230 * row[1] / max, y + 20, fmt(row[1], 0) + ' m³', 'start', 'g-strong');
        });
        text(svg, 240, 26, 'New water per year', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fmt(r.totalM3, 0) + ' m³ of new water a year'; }
    },
    sources: ['fao56', 'stanghellini2019', 'sonneveld2009'],
    links: function (ctx, r) {
      const x = ctx.v;
      return [{ slug: 'root-zone-water', label: 'Irrigation & Drainage', params: { transp: p(r.tPeak, 3), drainfrac: p(x.drain / 100, 3), recycle: p(x.recycle / 100, 3), price: p(x.pWater, 3) } },
        { slug: 'salt-accumulation', label: 'Salt Build-Up & Leaching', params: {} }];
    }
  };

  // ======================================================================================
  // Summary
  // ======================================================================================
  function costs(ctx) {
    const lt = R(ctx, 'light'), ht = R(ctx, 'heat'), vt = R(ctx, 'vent'), co = R(ctx, 'co2'), wt = R(ctx, 'water');
    return [
      { l: 'Heating fuel', v: ht.cost, c: 'g-bar-warn' },
      { l: 'Lamp electricity', v: lt.cost || 0, c: 'g-bar' },
      { l: 'Fan electricity', v: (vt.fanKwh || 0) * ctx.v.pel, c: 'g-bar-soft' },
      { l: 'CO₂', v: co.cost || 0, c: 'g-bar-muted' },
      { l: 'Water', v: wt.cost || 0, c: 'g-bar-water' }
    ];
  }
  const stepSummary = {
    id: 'summary', type: 'summary', title: 'Design sheet', short: 'Summary',
    intro: '<p>The whole greenhouse on one sheet. Use <strong>Edit</strong> to go back to any step; later steps follow. Copy, share or print the sheet, or keep the link to come back to it.</p>',
    viz: {
      viewBox: '0 0 480 260', label: 'Estimated yearly running cost by item',
      draw: function (svg, ctx) {
        const rows = costs(ctx), tot = rows.reduce(function (a, b) { return a + (fin(b.v) ? b.v : 0); }, 0);
        const max = Math.max.apply(null, rows.map(function (r) { return fin(r.v) ? r.v : 0; })) || 1;
        const floor = R(ctx, 'house').floor;
        rows.forEach(function (row, i) {
          const y = 36 + i * 38;
          text(svg, 130, y + 18, row.l, 'end', 'g-label');
          G.el(svg, 'rect', { class: 'g-track', x: 140, y: y, width: 250, height: 26, rx: 3 });
          G.el(svg, 'rect', { class: row.c, x: 140, y: y, width: 250 * (fin(row.v) ? row.v : 0) / max, height: 26, rx: 3 });
          text(svg, 146 + 250 * (fin(row.v) ? row.v : 0) / max, y + 18, money(row.v), 'start', 'g-strong');
        });
        text(svg, 240, 18, 'Yearly running cost at the prices entered', 'middle', 'dim-text');
        text(svg, 240, 250, 'Total ' + money(tot) + ' a year · ' + money(tot / floor) + ' per m² of floor', 'middle', 'g-strong');
      },
      caption: function (ctx) {
        const ht = R(ctx, 'heat'), vt = R(ctx, 'vent'), hs = R(ctx, 'house');
        return fmt(hs.floor, 0) + ' m² · heater ' + fmt(ht.capW / 1000, 0) + ' kW · ' + (ctx.v.cool === 'natural' ? 'natural ventilation' : fmt(vt.qTot, 1) + ' m³/s of fans');
      }
    },
    after: '<p><strong>Next steps.</strong> Each step’s <em>Open the full calculator</em> button opens the matching calculator pre-filled with your numbers, with every equation and source written out. The <a href="lighting-design.html">grow light guide</a> lays out the lamps, and the <a href="hydroponic-design.html">hydroponic guide</a> or <a href="ras-design.html">RAS guide</a> design what grows inside.</p>' +
      '<p>These are first-pass screening estimates for a gutter-connected or single-bay house. They do not size the structure for snow and wind, the heating distribution, controls or electrical service, and they do not replace equipment data, local codes or an experienced greenhouse engineer.</p>'
  };

  G.create({
    root: 'guide',
    sourcesList: 'guide-sources',
    title: 'Design a greenhouse',
    calcBase: '../calculators/',
    sources: SRC,
    steps: [stepSite, stepCrop, stepHouse, stepCover, stepLight, stepHeat, stepVent, stepHum, stepCo2, stepWater, stepSummary]
  });
})();
