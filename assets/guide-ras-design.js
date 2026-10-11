// Guided design: engineer a recirculating aquaculture system (RAS), step by step.
// Uses the CalcGuide framework (assets/guide.js). Every formula and constant matches the
// calculator it comes from; see the comments next to each block.
(function () {
  'use strict';

  const G = CalcGuide;
  const fmt = G.fmt, q = G.q, p = G.p;
  const GRAV = 9.80665;                  // m/s², standard gravity (NIST SP 811)
  const RHO_PUMP = 998.2;                // kg/m³, as pump-turnover.js
  const IN = 0.0254;

  // ---------- Unit groups that units.js does not have (same definitions as the calculators) ----------
  if (!CalcUnits.GROUPS.arealrate) {      // biological-surface-area.js
    CalcUnits.GROUPS.arealrate = {
      base: 'gm2d',
      units: [
        { id: 'gm2d', label: 'g/m²·d', factor: 1 },
        { id: 'mgm2d', label: 'mg/m²·d', factor: 0.001 },
        { id: 'gft2d', label: 'g/ft²·d', factor: 1 / 0.09290304 }
      ]
    };
  }
  if (!CalcUnits.GROUPS.hydload) {        // drum-filter-sizing.js
    CalcUnits.GROUPS.hydload = {
      base: 'm3m2h',
      units: [
        { id: 'm3m2h', label: 'm³/m²/h', factor: 1 },
        { id: 'm3m2d', label: 'm³/m²/day', factor: 1 / 24 },
        { id: 'Lminm2', label: 'L/min/m²', factor: 0.06 },
        { id: 'gpmft2', label: 'US gpm/ft²', factor: 3.785411784e-3 * 60 / 0.09290304 }
      ]
    };
  }

  // ---------- Species presets (typical values, clearly labelled) ----------
  const SPECIES = {
    tilapia: { name: 'Nile tilapia', temp: 28, group: 'warm',
      note: 'Warm-water fish. 28 °C is the temperature the tilapia feeding guide on this site is written for (Riche &amp; Garling, 2003).' },
    trout: { name: 'Rainbow trout', temp: 15, group: 'cold',
      note: 'Cold-water fish: needs more dissolved oxygen. About 15 °C (59 °F) is a commonly quoted ideal for trout growth; published optima range from roughly 12 to 18 °C (typical value).' },
    catfish: { name: 'Channel catfish', temp: 29, group: 'warm',
      note: 'Warm-water fish. SRAC Publication 180 gives optimum growth at about 29.4 °C (85 °F) (typical value).' },
    barramundi: { name: 'Barramundi', temp: 28, group: 'warm',
      note: 'Warm-water fish, grown in fresh or brackish water. NSW DPI gives 28 °C as the optimum, with acceptable growth at 26–30 °C (typical value). Enter your salinity below.' },
    custom: { name: 'Other species', temp: 25, group: 'warm',
      note: 'Enter your own culture temperature. Check a species guide for its temperature and oxygen needs.' }
  };

  // ---------- Dissolved oxygen (dissolved-oxygen.js: Benson & Krause 1984 / USGS 2011) ----------
  function c0(t) {
    const T = t + 273.15;
    return Math.exp(-139.34411 + 1.575701e5 / T - 6.642308e7 / (T * T) +
      1.243800e10 / Math.pow(T, 3) - 8.621949e11 / Math.pow(T, 4));
  }
  function salFactor(t, S) {
    const T = t + 273.15;
    return Math.exp(-S * (0.017674 - 10.754 / T + 2140.7 / (T * T)));
  }
  function vaporAtm(t) {
    const T = t + 273.15;
    return Math.exp(11.8571 - 3840.70 / T - 216961 / (T * T));
  }
  function pressFactor(t, Patm) {
    const u = vaporAtm(t);
    const th = 0.000975 - 1.426e-5 * t + 6.436e-8 * t * t;
    return Patm * (1 - u / Patm) * (1 - th * Patm) / ((1 - u) * (1 - th));
  }
  function pressureFromElevation(h) { return 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588); } // US Std Atm 1976
  function csat(t, S, elev) {
    if (!(t >= 0 && t <= 40) || !(S >= 0 && S <= 40) || !(elev >= -500 && elev <= 6000)) return NaN;
    return c0(t) * salFactor(t, S) * pressFactor(t, pressureFromElevation(elev) / 101325);
  }
  const DO_GROUPS = { warm: { low: 3, ok: 5 }, cold: { low: 4, ok: 6.5 } };   // dissolved-oxygen.js

  // ---------- Biofilter (biological-surface-area.js) ----------
  const TAN_FACTOR = 0.092; // 0.16 × 0.8 × 0.8 × 0.9 (Timmons et al. 2002; Ebeling et al. 2006)
  const MEDIA = {
    k1: { ssa: 500, moving: true, name: 'K1-type moving-bed carrier (500 m²/m³)' },
    bioballs: { ssa: 250, moving: false, name: 'Plastic bio-balls (250 m²/m³)' },
    lava: { ssa: 300, moving: false, name: 'Volcanic gravel / lava rock (300 m²/m³)' },
    clay: { ssa: 250, moving: false, name: 'Expanded clay pebbles (250 m²/m³)' },
    sand: { ssa: 3600, moving: false, name: 'Sand, 1 mm grains (3,600 m²/m³)' },
    custom: { ssa: null, moving: false, name: 'Custom media' }
  };
  const MOVING_NORMAL = [0.50, 0.65], MOVING_MAX = 0.70;

  // ---------- Drum filter (drum-filter-sizing.js) ----------
  const HLR_BY_MESH = { 40: 10, 60: 15, 80: 18, 100: 20, 120: 24 };   // illustrative, m³/m²/h

  // ---------- Tank velocity (internal-tank-velocity.js) ----------
  const K_LOW = 0.15, K_HIGH = 0.20, K_MID = 0.175;
  const CLEAN_LOW = 0.15, CLEAN_HIGH = 0.30, BL_LOW = 0.5, BL_HIGH = 2.0, RATIO_LOW = 5, RATIO_HIGH = 10;

  // ---------- Pipes and head loss (head-loss.js; ASTM D1785 Schedule 40) ----------
  const PVC40 = [
    { id: '0.5', wv: '1/2', name: '½″', od: 0.840, wall: 0.109 },
    { id: '0.75', wv: '3/4', name: '¾″', od: 1.050, wall: 0.113 },
    { id: '1', wv: '1', name: '1″', od: 1.315, wall: 0.133 },
    { id: '1.25', wv: '1-1/4', name: '1¼″', od: 1.660, wall: 0.140 },
    { id: '1.5', wv: '1-1/2', name: '1½″', od: 1.900, wall: 0.145 },
    { id: '2', wv: '2', name: '2″', od: 2.375, wall: 0.154 },
    { id: '2.5', wv: '2-1/2', name: '2½″', od: 2.875, wall: 0.203 },
    { id: '3', wv: '3', name: '3″', od: 3.500, wall: 0.216 },
    { id: '4', wv: '4', name: '4″', od: 4.500, wall: 0.237 },
    { id: '6', wv: '6', name: '6″', od: 6.625, wall: 0.280 },
    { id: '8', wv: null, name: '8″', od: 8.625, wall: 0.322 }
  ];
  PVC40.forEach(function (x) { x.idIn = +(x.od - 2 * x.wall).toFixed(3); x.D = x.idIn * IN; });
  const WATER = [
    [0, 999.84, 1.7914], [5, 999.97, 1.5182], [10, 999.70, 1.3059], [15, 999.10, 1.1376],
    [20, 998.21, 1.0016], [25, 997.05, 0.8900], [30, 995.65, 0.7972], [35, 994.03, 0.7191],
    [40, 992.22, 0.6527], [45, 990.21, 0.5958], [50, 988.04, 0.5465]
  ];
  function water(tC) {
    const t = Math.min(50, Math.max(0, isFinite(tC) ? tC : 20));
    let i = 0;
    while (i < WATER.length - 2 && WATER[i + 1][0] < t) i++;
    const a = WATER[i], b = WATER[i + 1];
    const x = (t - a[0]) / (b[0] - a[0]);
    const rho = a[1] + (b[1] - a[1]) * x;
    const mu = Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * x) / 1000;
    return { rho: rho, mu: mu, nu: mu / rho };
  }
  const CRANE_FT_D = [0.01576, 0.02096, 0.02664, 0.03508, 0.04094, 0.05248, 0.06268,
    0.07792, 0.10226, 0.1282, 0.154, 0.20274, 0.25446, 0.33334, 0.381, 0.53994, 0.57504, 0.8759];
  const CRANE_FT = [0.026, 0.024, 0.022, 0.021, 0.020, 0.019, 0.018, 0.017, 0.016, 0.015, 0.015,
    0.014, 0.013, 0.013, 0.012, 0.012, 0.011, 0.011];
  function craneFT(D) {
    if (D <= CRANE_FT_D[0]) return CRANE_FT[0];
    const last = CRANE_FT_D.length - 1;
    if (D >= CRANE_FT_D[last]) return CRANE_FT[last];
    let i = 0;
    while (CRANE_FT_D[i + 1] < D) i++;
    const x = (D - CRANE_FT_D[i]) / (CRANE_FT_D[i + 1] - CRANE_FT_D[i]);
    return CRANE_FT[i] + (CRANE_FT[i + 1] - CRANE_FT[i]) * x;
  }
  function colebrook(Re, rel) {
    const sj = Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9));
    let x = 1 / Math.sqrt(0.25 / (sj * sj));
    for (let i = 0; i < 50; i++) {
      const nx = -2 * Math.log10(rel / 3.7 + 2.51 * x / Re);
      if (Math.abs(nx - x) < 1e-12) { x = nx; break; }
      x = nx;
    }
    return 1 / (x * x);
  }
  const EPS_PVC = 0.0015e-3; // m, PVC (head-loss.js)
  const FIT = { n90: 30, nTee: 20, nBall: 3, nCheck: 100 }; // Crane K = n × fT
  const K_ENT = 0.5, K_EXIT = 1.0;

  // ---------- UV (uv-sterilizer-sizing.js) ----------
  const UV_ORGS = [
    { id: 'bact', name: 'Bacterial fish pathogens (design dose)', dose: 30 },
    { id: 'isav', name: 'ISA virus, 3-log', dose: 7.7 },
    { id: 'crypto', name: 'Cryptosporidium, 3-log (drinking-water ref.)', dose: 12 },
    { id: 'ich', name: 'Ich free-swimming stages (rule of thumb)', dose: 100 },
    { id: 'noda', name: 'Nodavirus (AHNV), 3-log', dose: 105 },
    { id: 'virus4', name: 'Viruses, 4-log (EPA, adenovirus basis)', dose: 186 },
    { id: 'ipnv', name: 'IPN virus, 3-log', dose: 246 }
  ];
  function uvOrg(id) { return UV_ORGS.filter(function (o) { return o.id === id; })[0] || UV_ORGS[0]; }
  function waterFactor(uvtPct, gCm) {
    const a = -Math.log10(uvtPct / 100);
    const x = a * gCm;
    if (x < 1e-9) return 1;
    return (1 - Math.pow(10, -x)) / (x * Math.LN10);
  }

  // ---------- Battery (battery-life.js) ----------
  const CHEM = {
    agm: { name: 'AGM lead-acid', dod: 50, k: 1.25 },
    flooded: { name: 'Flooded lead-acid', dod: 50, k: 1.25 },
    lfp: { name: 'LiFePO4 (lithium iron phosphate)', dod: 80, k: 1.05 }
  };
  const RATE_H = 20; // capacity rating period, h (battery-life.js default)
  function runtimeFor(n, m) {
    const I = m.pBat / (n * m.V);
    const f = m.k > 1 && I > 0 ? Math.min(1, Math.pow(m.ratedI / I, m.k - 1)) : 1;
    return m.C * n * m.V * m.dod * f / m.pBat;
  }

  // ---------- Small helpers ----------
  function fin(x) { return typeof x === 'number' && isFinite(x); }
  function v(ctx) { return ctx.v; }
  function R(ctx, id) { return ctx.r[id] || {}; }
  function sp(ctx) { return SPECIES[ctx.v.species] || SPECIES.custom; }
  function ceilTo(x, step) { return Math.ceil(x / step - 1e-9) * step; }
  function intCheck(label) { return function (x) { return Math.abs(x - Math.round(x)) > 1e-9 ? label + ' must be a whole number.' : ''; }; }
  function pctCheck(label, lo, hi) { return function (x) { return x < lo || x > hi ? label + ' must be between ' + lo + ' and ' + hi + '%.' : ''; }; }
  const kgd = function (kg) { return fin(kg) ? q('mass', kg, ['kg']) + '/day · ' + fmt(kg / 0.45359237) + ' lb/day' : '–'; };
  const flowTxt = function (Lps) { return q('flow', Lps, ['m3ph', 'gpm']); };
  const lenTxt = function (m) { return q('length', m, ['m', 'ft']); };
  const volTxt = function (L) { return fin(L) ? q('volume', L, [L >= 10000 ? 'm3' : 'L', 'gal']) : '–'; };
  function minutes(s) { return !fin(s) ? '–' : s < 120 ? fmt(s, 0) + ' s' : s < 7200 ? fmt(s / 60, 1) + ' min' : fmt(s / 3600, 1) + ' h'; }
  function hm(hours) {
    if (!fin(hours) || hours < 0) return '–';
    const mins = Math.round(hours * 60);
    if (mins < 60) return mins + ' min';
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  }
  function fish(svg, cx, cy, s) {
    const k = s || 1;
    G.el(svg, 'path', { class: 'g-fish', d: 'M' + (cx - 15 * k) + ',' + cy +
      ' C' + (cx - 9 * k) + ',' + (cy - 8 * k) + ' ' + (cx + 6 * k) + ',' + (cy - 8 * k) + ' ' + (cx + 10 * k) + ',' + cy +
      ' C' + (cx + 6 * k) + ',' + (cy + 8 * k) + ' ' + (cx - 9 * k) + ',' + (cy + 8 * k) + ' ' + (cx - 15 * k) + ',' + cy + 'Z' +
      ' M' + (cx + 10 * k) + ',' + cy + ' L' + (cx + 17 * k) + ',' + (cy - 6 * k) + ' L' + (cx + 17 * k) + ',' + (cy + 6 * k) + 'Z' });
  }
  function text(svg, x, y, t, anchor, cls) { return G.el(svg, 'text', { x: x, y: y, 'text-anchor': anchor || 'middle', class: cls || 'dim-text' }, t); }
  function arrow(svg, x1, y1, x2, y2) {
    G.el(svg, 'line', { class: 'g-arrow', x1: x1, y1: y1, x2: x2, y2: y2 });
    const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
    G.el(svg, 'path', { class: 'g-arrowhead', d: 'M' + x2 + ',' + y2 + ' L' + (x2 - s * Math.cos(a - 0.45)) + ',' + (y2 - s * Math.sin(a - 0.45)) +
      ' L' + (x2 - s * Math.cos(a + 0.45)) + ',' + (y2 - s * Math.sin(a + 0.45)) + 'Z' });
  }
  // Horizontal bars: rows [{label, value, cls, text}], scaled to max.
  function hbars(svg, rows, opts) {
    const x0 = opts.x0 || 150, w = opts.w || 300, y0 = opts.y0 || 20, gap = opts.gap || 34, bh = opts.bh || 18;
    const max = opts.max || Math.max.apply(null, rows.map(function (r) { return fin(r.value) ? r.value : 0; }).concat([1e-12]));
    rows.forEach(function (r, i) {
      const y = y0 + i * gap;
      text(svg, x0 - 8, y + bh - 4, r.label, 'end', 'g-label');
      G.el(svg, 'rect', { class: 'g-track', x: x0, y: y, width: w, height: bh, rx: 3 });
      if (fin(r.value) && r.value > 0) {
        const bw = Math.max(2, Math.min(w, r.value / max * w * 0.6));
        G.el(svg, 'rect', { class: r.cls || 'g-bar', x: x0, y: y, width: bw, height: bh, rx: 3 });
        text(svg, x0 + bw + 6, y + bh - 5, r.text, 'start', 'g-label');
      } else {
        text(svg, x0 + 6, y + bh - 5, r.text || 'not used', 'start', 'dim-text');
      }
    });
  }

  // ---------- Sources (citations reused from the calculator pages) ----------
  const FAO589 = 'Somerville, C., Cohen, M., Pantanella, E., Stankus, A. &amp; Lovatelli, A. (2014). <em>Small-scale aquaponic food production: Integrated fish and plant farming</em>. FAO Fisheries and Aquaculture Technical Paper No. 589. Rome: FAO. <a href="https://www.fao.org/3/i4021e/i4021e.pdf" rel="noopener" target="_blank">fao.org</a>';
  const SOURCES = {
    te2010: 'Timmons, M. B. &amp; Ebeling, J. M. (2010). <em>Recirculating Aquaculture</em> (2nd ed.). Ithaca, NY: Cayuga Aqua Ventures. (Mass-balance design approach; 0.25 kg TSS per kg feed design value.)',
    et2012: 'Ebeling, J. M. &amp; Timmons, M. B. (2012). Recirculating aquaculture systems. In J. H. Tidwell (Ed.), <em>Aquaculture Production Systems</em> (Chapter 11). Oxford: Wiley-Blackwell. <a href="https://doi.org/10.1002/9781118250105.ch11" rel="noopener" target="_blank">doi:10.1002/9781118250105.ch11</a>',
    riche2003: 'Riche, M. &amp; Garling, D. (2003). <em>Feeding Tilapia in Intensive Recirculating Systems</em>. North Central Regional Aquaculture Center, Fact Sheet Series #114. <a href="https://www.ncrac.org/files/inline-files/ncrac114.pdf" rel="noopener" target="_blank">ncrac.org</a>',
    wellborn1988: 'Wellborn, T. L. (1988). <em>Channel Catfish: Life History and Biology</em>. Southern Regional Aquaculture Center, SRAC Publication No. 180.',
    nswbarra: 'NSW Department of Primary Industries. “Barramundi industry profile.” <a href="https://www.dpi.nsw.gov.au/dpi/fishing/aquaculture/resources/publications/species2/freshwater/barramundi/barramundi-industry-profile" rel="noopener" target="_blank">dpi.nsw.gov.au</a>',
    exttrout: 'Freshwater Aquaculture (Regional Aquaculture Centers / Extension). “Trout.” <a href="https://freshwater-aquaculture.extension.org/trout" rel="noopener" target="_blank">freshwater-aquaculture.extension.org</a>',
    fao589: FAO589,
    ebeling2000: 'Ebeling, J. M. (2000). Engineering aspects of recirculating aquaculture systems. <em>Marine Technology Society Journal</em>, 34(1), 68–78.',
    ellis2002: 'Ellis, T., North, B., Scott, A. P., Bromage, N. R., Porter, M. &amp; Gadd, D. (2002). The relationships between stocking density and welfare in farmed rainbow trout. <em>Journal of Fish Biology</em>, 61(3), 493–531.',
    timmons1998: 'Timmons, M. B., Summerfelt, S. T. &amp; Vinci, B. J. (1998). Review of circular tank technology and management. <em>Aquacultural Engineering</em>, 18(1), 51–69. <a href="https://doi.org/10.1016/S0144-8609(98)00023-5" rel="noopener" target="_blank">doi.org</a>',
    usgs2011: 'U.S. Geological Survey (2011). <em>Change to solubility equations for oxygen in water</em>. Office of Water Quality Technical Memorandum 2011.03. <a href="https://water.usgs.gov/admin/memo/QW/qw11.03.pdf" rel="noopener" target="_blank">water.usgs.gov</a>',
    benson1984: 'Benson, B. B. &amp; Krause, D., Jr. (1984). The concentration and isotopic fractionation of oxygen dissolved in freshwater and seawater in equilibrium with the atmosphere. <em>Limnology and Oceanography</em>, 29(3), 620–632.',
    stdatm: 'National Oceanic and Atmospheric Administration, National Aeronautics and Space Administration &amp; U.S. Air Force (1976). <em>U.S. Standard Atmosphere, 1976</em>. Washington, DC: U.S. Government Printing Office.',
    boydtucker1998: 'Boyd, C. E. &amp; Tucker, C. S. (1998). <em>Pond Aquaculture Water Quality Management</em>. Boston: Kluwer Academic Publishers.',
    epa1986: 'U.S. Environmental Protection Agency (1986). <em>Ambient Water Quality Criteria for Dissolved Oxygen</em>. EPA 440/5-86-003. Washington, DC: Office of Water.',
    gaaaeration: 'Global Seafood Alliance. “A look at aeration, oxygenation.” <em>Global Aquaculture Advocate</em>. <a href="https://www.globalseafood.org/advocate/look-at-unit-processes-in-ras-systems/" rel="noopener" target="_blank">globalseafood.org</a>',
    boydresp: 'Boyd, C. E. “Dissolved oxygen requirements in aquatic animal respiration.” <em>Responsible Seafood Advocate</em>, Global Seafood Alliance. <a href="https://www.globalseafood.org/advocate/dissolved-oxygen-requirements-in-aquatic-animal-respiration/" rel="noopener" target="_blank">globalseafood.org</a>',
    ebeling2006: 'Ebeling, J. M., Timmons, M. B. &amp; Bisogni, J. J. (2006). Engineering analysis of the stoichiometry of photoautotrophic, autotrophic, and heterotrophic removal of ammonia–nitrogen in aquaculture systems. <em>Aquaculture</em>, 257(1–4), 346–358.',
    timmons2002: 'Timmons, M. B., Ebeling, J. M., Wheaton, F. W., Summerfelt, S. T. &amp; Vinci, B. J. (2002). <em>Recirculating Aquaculture Systems</em> (2nd ed.). Ithaca, NY: Cayuga Aqua Ventures.',
    rusten2006: 'Rusten, B., Eikebrokk, B., Ulgenes, Y. &amp; Lygren, E. (2006). Design and operations of the Kaldnes moving bed biofilm reactors. <em>Aquacultural Engineering</em>, 34(3), 322–331. <a href="https://doi.org/10.1016/j.aquaeng.2005.04.002" rel="noopener" target="_blank">doi.org</a>',
    guerdat2010: 'Guerdat, T. C., Losordo, T. M., Classen, J. J., Osborne, J. A. &amp; DeLong, D. P. (2010). An evaluation of commercially available biological filters for recirculating aquaculture systems. <em>Aquacultural Engineering</em>, 42(1), 38–49.',
    losordo2015: 'Losordo, T. M. &amp; DeLong, D. P. (2015). “Control the build-up of ammonia-nitrogen, nitrite-nitrogen” (flow rate estimation for RAS). <em>Global Aquaculture Advocate</em>, July/August 2015. <a href="https://www.globalseafood.org/advocate/flow-rate-estimation-for-ras/" rel="noopener" target="_blank">globalseafood.org</a>',
    losordohobbs2000: 'Losordo, T. M. &amp; Hobbs, A. O. (2000). Using computer spreadsheets for water flow and biofilter sizing in recirculating aquaculture production systems. <em>Aquacultural Engineering</em>, 23(1–3), 95–102.',
    durborow1997: 'Durborow, R. M., Crosby, D. M. &amp; Brunson, M. W. (1997). <em>Ammonia in Fish Ponds</em>. Southern Regional Aquaculture Center Publication No. 463.',
    davidson2004: 'Davidson, J. &amp; Summerfelt, S. T. (2004). Solids flushing, mixing, and water velocity profiles within large (10 and 150 m³) circular ‘Cornell-type’ dual-drain tanks. <em>Aquacultural Engineering</em>, 32(1), 245–271.',
    cripps2000: 'Cripps, S. J. &amp; Bergheim, A. (2000). Solids management and removal for intensive land-based aquaculture production systems. <em>Aquacultural Engineering</em>, 22(1–2), 33–56.',
    dolan2013: 'Dolan, E., Murphy, N. &amp; O\'Hehir, M. (2013). Factors influencing optimal micro-screen drum filter selection for recirculating aquaculture systems. <em>Aquacultural Engineering</em>, 56, 42–50. <a href="https://doi.org/10.1016/j.aquaeng.2013.04.005" rel="noopener" target="_blank">doi.org</a>',
    ali2013: 'Ali, S. A. (2013). Design and evaluate a drum screen filter driven by undershot waterwheel for aquaculture recirculating systems. <em>Aquacultural Engineering</em>, 54, 38–44.',
    losordowesters1994: 'Losordo, T. M. &amp; Westers, H. (1994). System carrying capacity and flow estimation. In M. B. Timmons &amp; T. M. Losordo (Eds.), <em>Aquaculture Water Reuse Systems: Engineering Design and Management</em> (pp. 9–60). Amsterdam: Elsevier.',
    paul1991: 'Paul, T. C., Sayal, S. K., Sakhuja, V. S. &amp; Dhillon, G. S. (1991). Vortex-settling basin design considerations. <em>Journal of Hydraulic Engineering</em>, 117(2), 172–189.',
    tvinnereim1989: 'Tvinnereim, K. &amp; Skybakmoen, S. (1989). Water exchange and self-cleaning in fish-rearing tanks. In N. De Pauw, E. Jaspers, H. Ackefors &amp; N. Wilkins (Eds.), <em>Aquaculture: A Biotechnology in Progress</em> (pp. 1041–1047). Bredene, Belgium: European Aquaculture Society.',
    astm1785: 'ASTM International. <em>ASTM D1785: Standard Specification for Poly(Vinyl Chloride) (PVC) Plastic Pipe, Schedules 40, 80, and 120</em>. West Conshohocken, PA: ASTM International. <a href="https://www.astm.org/d1785" rel="noopener" target="_blank">astm.org</a>',
    crane2009: 'Crane Co. (2009). <em>Flow of Fluids Through Valves, Fittings, and Pipe</em>. Technical Paper No. 410. Stamford, CT: Crane Co.',
    colebrook1939: 'Colebrook, C. F. (1939). Turbulent flow in pipes, with particular reference to the transition region between the smooth and rough pipe laws. <em>Journal of the Institution of Civil Engineers</em>, 11(4), 133–156.',
    munson2009: 'Munson, B. R., Young, D. F., Okiishi, T. H. &amp; Huebsch, W. W. (2009). <em>Fundamentals of Fluid Mechanics</em> (6th ed.). Hoboken, NJ: Wiley.',
    huber2009: 'Huber, M. L., Perkins, R. A., Laesecke, A., Friend, D. G., Sengers, J. V., Assael, M. J., Metaxa, I. N., Vogel, E., Mareš, R. &amp; Miyagawa, K. (2009). New international formulation for the viscosity of H₂O. <em>Journal of Physical and Chemical Reference Data</em>, 38(2), 101–125.',
    tenstates: 'Great Lakes–Upper Mississippi River Board of State and Provincial Public Health and Environmental Managers. <em>Recommended Standards for Wastewater Facilities</em> (“Ten States Standards”), section 33.41: minimum velocity of 2.0 ft/s when flowing full. Albany, NY: Health Research, Inc.',
    clark828: 'Clark, G. A. &amp; Haman, D. Z. <em>Water Hammer in Irrigation Systems</em>. Circular 828 (AE066). Gainesville: University of Florida, IFAS Extension. <a href="https://edis.ifas.ufl.edu/publication/AE066" rel="noopener" target="_blank">edis.ifas.ufl.edu</a>',
    nist811: 'Thompson, A. &amp; Taylor, B. N. (2008). <em>Guide for the Use of the International System of Units (SI)</em>. NIST Special Publication 811. <a href="https://www.nist.gov/pml/special-publication-811" rel="noopener" target="_blank">nist.gov</a>',
    summerfelt2003: 'Summerfelt, S. T. (2003). Ozonation and UV irradiation—an introduction and examples of current applications. <em>Aquacultural Engineering</em>, 28(1–2), 21–36. doi:10.1016/S0144-8609(02)00069-9',
    bolton2003: 'Bolton, J. R. &amp; Linden, K. G. (2003). Standardization of methods for fluence (UV dose) determination in bench-scale UV experiments. <em>Journal of Environmental Engineering</em>, 129(3), 209–215.',
    epa2006uv: 'U.S. Environmental Protection Agency (2006). <em>Ultraviolet Disinfection Guidance Manual for the Final Long Term 2 Enhanced Surface Water Treatment Rule</em>. EPA 815-R-06-007. <a href="https://www.epa.gov/system/files/documents/2022-10/ultraviolet-disinfection-guidance-manual-2006.pdf" rel="noopener" target="_blank">epa.gov</a>',
    sharrer2005: 'Sharrer, M. J., et al. (2005). Inactivation of bacteria using ultraviolet irradiation in a recirculating salmonid culture system. <em>Aquacultural Engineering</em>, 33(2), 135–149. doi:10.1016/j.aquaeng.2004.12.001',
    knupp2023: 'Knupp, C. K., et al. (2023). Ultraviolet light differentially reduces viability of fish- and fish farm-associated flavobacteria (families Flavobacteriaceae and Weeksellaceae). <em>North American Journal of Aquaculture</em>, 85(4). doi:10.1002/naaq.10300',
    liltved2006: 'Liltved, H., et al. (2006). High resistance of fish pathogenic viruses to UV irradiation and ozonated seawater. <em>Aquacultural Engineering</em>, 34.',
    gratzek1983: 'Gratzek, J. B., et al. (1983). Ultraviolet light control of <em>Ichthyophthirius multifiliis</em> Fouquet in a closed fish culture recirculation system. <em>Journal of Fish Diseases</em>, 6. doi:10.1111/j.1365-2761.1983.tb00062.x',
    cfr141: 'U.S. Code of Federal Regulations, 40 CFR 141.720(d), UV dose table for Cryptosporidium, Giardia lamblia, and virus inactivation credit. <a href="https://www.law.cornell.edu/cfr/text/40/141.720" rel="noopener" target="_blank">law.cornell.edu</a>',
    masser1999: 'Masser, M. P., Rakocy, J. &amp; Losordo, T. M. (1999). <em>Recirculating Aquaculture Tank Production Systems: Management of Recirculating Systems</em>. SRAC Publication No. 452. Southern Regional Aquaculture Center. <a href="https://www.srac.msstate.edu/pdfs/Fact%20Sheets/452%20Recirculating%20Aquaculture%20Tank%20Production%20Systems-%20Management%20of%20Recirculating%20Systems.pdf" rel="noopener" target="_blank">srac.msstate.edu</a>',
    bu501: 'Battery University. “BU-501: Basics about Discharging.” Cadex Electronics. <a href="https://batteryuniversity.com/article/bu-501-basics-about-discharging" rel="noopener" target="_blank">batteryuniversity.com</a>',
    peukert1897: 'Peukert, W. (1897). Über die Abhängigkeit der Kapazität von der Entladestromstärke bei Bleiakkumulatoren. <em>Elektrotechnische Zeitschrift</em>, 18, 287–288.',
    victron: 'Victron Energy. <em>BMV-712 Smart battery monitor manual</em>, “Battery capacity and Peukert exponent”. <a href="https://www.victronenergy.com/media/pg/BMV-712_Smart/en/battery-capacity-and-peukert-exponent.html" rel="noopener" target="_blank">victronenergy.com</a>',
    ieee485: 'IEEE (2020). <em>IEEE Std 485-2020: IEEE Recommended Practice for Sizing Lead-Acid Batteries for Stationary Applications</em>. New York: IEEE.',
    usbrwmm: 'U.S. Department of the Interior, Bureau of Reclamation (2001). <em>Water Measurement Manual</em> (3rd ed., revised reprint), Chapter 7: Weirs. Denver, CO: USBR. <a href="https://www.usbr.gov/tsc/techreferences/mands/wmm/" rel="noopener" target="_blank">usbr.gov</a>',
    white2011: 'White, F. M. (2011). <em>Fluid Mechanics</em> (7th ed.). New York: McGraw-Hill.'
  };

  // =====================================================================================
  // Steps
  // =====================================================================================

  // ---------- 1. Goals ----------
  const stepGoals = {
    id: 'goals', title: 'Production goal and species', short: 'Goal',
    intro: '<p>Everything in a RAS is sized from how much fish you want to grow. This step sets the species, the water temperature it is grown at, and either the fish you want to harvest each year or the weight of fish you want in the tanks at any one time.</p>',
    fields: [
      { id: 'species', label: 'Species', type: 'select', def: 'tilapia',
        options: Object.keys(SPECIES).map(function (k) { return { value: k, label: SPECIES[k].name }; }),
        hint: function (ctx) { return sp(ctx).note; } },
      { id: 'temp', label: 'Water temperature', group: 'temperature', unit: 'C', signed: true,
        def: function (ctx) { return sp(ctx).temp; },
        check: function (t) { return t < 0 || t > 40 ? 'Water temperature must be between 0 and 40 °C (32–104 °F).' : ''; },
        hint: 'Suggested from the species. It sets oxygen solubility, water viscosity and how fast fish eat and grow.' },
      { id: 'sal', label: 'Salinity', suffix: 'ppt', allowZero: true, def: 0,
        check: function (s) { return s > 40 ? 'Salinity must be between 0 and 40 ppt.' : ''; },
        hint: '0 for fresh water. Salt lowers how much oxygen water can hold.' },
      { id: 'goal', label: 'Plan from', type: 'select', def: 'prod',
        options: [{ value: 'prod', label: 'Annual production (fish harvested per year)' }, { value: 'biomass', label: 'Standing biomass (fish in the tanks)' }] },
      { id: 'prod', label: 'Annual production', group: 'mass', unit: 'kg', def: 10000,
        show: function (ctx) { return ctx.v.goal === 'prod'; },
        hint: 'Live weight of fish harvested per year.' },
      { id: 'biomass', label: 'Standing biomass', group: 'mass', unit: 'kg', def: 2000,
        show: function (ctx) { return ctx.v.goal === 'biomass'; },
        hint: 'Total weight of fish in all tanks at the heaviest point you plan for.' },
      { id: 'harvW', label: 'Harvest weight per fish', group: 'mass', unit: 'kg', def: 0.5,
        hint: 'Market size varies by species and buyer; for example NSW DPI lists plate-size barramundi at 300–500 g.' }
    ],
    compute: function (ctx) {
      const x = v(ctx);
      return { species: sp(ctx), prod: x.goal === 'prod' ? x.prod : NaN, biomass: x.goal === 'biomass' ? x.biomass : NaN };
    },
    results: function (ctx, r) {
      const x = v(ctx);
      const out = [];
      if (x.goal === 'prod') {
        out.push({ label: 'Production goal', value: fin(r.prod) ? q('mass', r.prod, ['kg', 'lb'], 0) + ' per year' : '–', main: true });
        const n = r.prod / x.harvW;
        out.push({ label: 'Fish harvested', value: fin(n) ? fmt(n, 0) + ' per year · ' + fmt(n / 52, 0) + ' per week' : '–' });
        out.push({ label: 'Harvest each week', value: fin(r.prod) ? q('mass', r.prod / 52, ['kg', 'lb']) : '–' });
      } else {
        out.push({ label: 'Standing biomass goal', value: q('mass', r.biomass, ['kg', 'lb'], 0), main: true });
        out.push({ label: 'Fish at harvest weight', value: fin(r.biomass / x.harvW) ? fmt(r.biomass / x.harvW, 0) : '–' });
      }
      out.push({ label: 'Species and temperature', value: r.species.name + ', ' + q('temperature', x.temp, ['C', 'F'], 1) });
      return out;
    },
    tips: [
      'Plan from <strong>annual production</strong> when you have a market target: the feed, and from it every load in the system, follows directly from what you harvest.',
      'Plan for the <strong>heaviest</strong> point of the year. Tanks, oxygen and filters must cope with the most fish you will ever hold, not the average.',
      'Warm-water fish (tilapia, catfish, barramundi) eat and grow faster but warm water holds less oxygen; cold-water fish such as trout need more dissolved oxygen.'
    ],
    viz: {
      viewBox: '0 0 480 230', label: 'Production goal broken down into weekly harvests',
      draw: function (svg, ctx, r) {
        const x = v(ctx);
        const perYear = x.goal === 'prod' ? r.prod / x.harvW : r.biomass / x.harvW;
        const boxes = x.goal === 'prod'
          ? [['Per year', q('mass', r.prod, ['kg'], 0)], ['Fish per year', fmt(perYear, 0)], ['Fish per week', fmt(perYear / 52, 0)]]
          : [['In the tanks', q('mass', r.biomass, ['kg'], 0)], ['Fish (harvest size)', fmt(perYear, 0)], ['Each fish', q('mass', x.harvW, ['kg'])]];
        boxes.forEach(function (b, i) {
          const bx = 14 + i * 158;
          G.el(svg, 'rect', { class: i === 0 ? 'g-box-accent' : 'g-box', x: bx, y: 20, width: 136, height: 70, rx: 10 });
          text(svg, bx + 68, 46, b[0], 'middle', 'dim-text');
          text(svg, bx + 68, 72, b[1], 'middle', 'g-strong');
          if (i < 2) arrow(svg, bx + 138, 55, bx + 156, 55);
        });
        const perWeek = x.goal === 'prod' ? perYear / 52 : perYear;
        const per = fin(perWeek) ? Math.max(1, Math.ceil(perWeek / 40)) : 1;
        const n = fin(perWeek) ? Math.min(40, Math.round(perWeek / per)) : 0;
        for (let i = 0; i < n; i++) fish(svg, 40 + (i % 10) * 44, 122 + Math.floor(i / 10) * 24, 0.8);
        if (x.goal === 'prod') text(svg, 240, 222, 'One week of harvest · each icon = ' + per + ' fish', 'middle', 'dim-text');
        else text(svg, 240, 222, 'Fish of harvest size in the tanks · each icon = ' + per + ' fish', 'middle', 'dim-text');
      }
    },
    sources: ['te2010', 'riche2003', 'wellborn1988', 'nswbarra', 'exttrout']
  };

  // ---------- 2. Feed and biomass ----------
  const stepFeed = {
    id: 'feed', title: 'Feed and standing biomass', short: 'Feed',
    intro: '<p>Feed is the engine of a RAS. Every kilogram of feed uses oxygen and turns into ammonia, carbon dioxide and solid waste, so the daily feed sets the size of every filter that follows. This step turns your goal into kilograms of feed per day and the weight of fish the tanks must hold.</p>',
    fields: [
      { id: 'feedPct', label: 'Average feeding rate', suffix: '% body weight/day', def: 2,
        check: function (x) { return x > 30 ? 'A feeding rate above 30% of body weight per day is higher than any guide value.' : ''; },
        hint: 'Tilapia guide at 28 °C (Riche &amp; Garling, 2003): 3–4% for 20–100 g fish, 1.5–3% over 100 g. Use a herd average; it is lower in cool water.' },
      { id: 'fcr', label: 'Feed conversion ratio (FCR)', suffix: 'kg feed/kg gain', def: 1.5,
        hint: 'Kilograms of feed per kilogram of fish grown. Typical values are about 1–2 (Feeding Rate calculator).' },
      { id: 'protein', label: 'Feed protein', suffix: '%', def: 35,
        check: pctCheck('Feed protein', 0, 100),
        hint: 'From the feed bag. Most fish feeds are 25–55% protein. Protein sets how much ammonia the fish excrete.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), g = R(ctx, 'goals');
      const r = {};
      if (x.goal === 'prod') {
        r.feed = g.prod * x.fcr / 365;
        r.biomass = r.feed / (x.feedPct / 100);
        r.prod = g.prod;
      } else {
        r.biomass = g.biomass;
        r.feed = r.biomass * x.feedPct / 100;
        r.prod = r.feed * 365 / x.fcr;
      }
      r.proteinKg = r.feed * x.protein / 100;
      r.fishYr = r.prod / x.harvW;
      return r;
    },
    notices: function (ctx) {
      const f = ctx.v.fcr;
      return [fin(f) && (f < 0.6 || f > 4) ? 'An FCR of ' + fmt(f) + ' is unusual for fed fish; typical values are about 1–2.' : ''];
    },
    results: function (ctx, r) {
      return [
        { label: 'Daily feed at full production', value: kgd(r.feed), main: true },
        { label: 'Standing biomass', value: q('mass', r.biomass, ['kg', 'lb'], 0) },
        { label: 'Annual production', value: fin(r.prod) ? q('mass', r.prod, ['kg'], 0) + ' per year' : '–' },
        { label: 'Feed per year', value: fin(r.feed) ? q('mass', r.feed * 365, ['t', 'kg'], 1) : '–' },
        { label: 'Protein fed per day', value: kgd(r.proteinKg) }
      ];
    },
    tips: [
      'With a production goal, daily feed = production × FCR ÷ 365, and the fish weight needed to eat it = daily feed ÷ feeding rate. This is a steady-state approximation for a farm that stocks and harvests continuously.',
      'Small fish eat a larger share of their weight: the tilapia guide runs from 30–10% per day for fry under 1 g down to 3–1.5% over 100 g (Riche &amp; Garling, 2003, after NRC 1993). Rule of thumb only; it varies with species, temperature and feed.',
      'Timmons &amp; Ebeling size RAS components from the feed rate, because oxygen use, ammonia and solids all scale with it.'
    ],
    viz: {
      viewBox: '0 0 480 170', label: 'Daily feed, protein and the ammonia nitrogen it becomes',
      draw: function (svg, ctx, r) {
        const tan = r.feed * ctx.v.protein / 100 * TAN_FACTOR;
        hbars(svg, [
          { label: 'Feed', value: r.feed, text: q('mass', r.feed, ['kg']) + '/day' },
          { label: 'Protein', value: r.proteinKg, text: q('mass', r.proteinKg, ['kg']) + '/day', cls: 'g-bar-water' },
          { label: 'Ammonia-N (TAN)', value: tan, text: q('mass', tan, ['kg']) + '/day', cls: 'g-bar-warn' }
        ], { x0: 150, w: 300, y0: 22, gap: 40 });
        text(svg, 240, 160, 'TAN = feed × protein × 0.092 (see the biofilter step)', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.feed) ? q('mass', r.feed, ['kg']) + ' of feed per day for ' + q('mass', r.biomass, ['kg'], 0) + ' of fish' : 'Enter the inputs'; }
    },
    sources: ['riche2003', 'te2010', 'fao589'],
    links: function (ctx, r) {
      return [{ slug: 'feeding-rate', label: 'Feeding Rate', params: {
        mode: 'biomass', biomass: p(r.biomass, 5), biomass_u: 'kg', weight: p(ctx.v.harvW * 1000, 4), weight_u: 'g',
        rate: p(ctx.v.feedPct, 4), feeds: 3, fcr: p(ctx.v.fcr, 4), out: 'kg' } }];
    }
  };

  // ---------- 3. Fish tanks ----------
  function densityPreset(d) {
    return { 20: 'fao', 30: 'air', 50: 'tilnew', 100: 'tilexp' }[Math.round(d * 1e6) / 1e6] || 'custom';
  }
  const stepTanks = {
    id: 'tanks', title: 'Fish tanks', short: 'Tanks',
    intro: '<p>The stocking density you can run decides how much culture water you need. This step picks a maximum density, splits the volume into round tanks, and suggests a diameter and depth inside the usual diameter-to-depth range for self-cleaning circular tanks.</p>',
    fields: [
      { id: 'density', label: 'Maximum stocking density', group: 'density', unit: 'kgm3', def: 50,
        hint: 'Rules of thumb (Fish Stocking Density calculator): 20 kg/m³ FAO small-scale limit; about 30 kg/m³ with air alone; 50 kg/m³ for new tilapia RAS growers; 100–120 kg/m³ for experts with pure oxygen. Other species: check species guidance.' },
      { id: 'nTanks', label: 'Number of tanks', def: 4, check: intCheck('Number of tanks'),
        hint: 'Several tanks let you grade fish by size and harvest one tank while the others keep growing.' },
      { id: 'ratio', label: 'Diameter : depth ratio', suffix: ': 1', def: 6,
        hint: 'Guide for circular tanks: 5–10 (Timmons et al., 1998).' },
      { id: 'tankD', label: 'Tank diameter (inside)', group: 'length', unit: 'm',
        def: function (ctx) {
          const V = R(ctx, 'feed').biomass / ctx.v.density / ctx.v.nTanks;
          return ceilTo(Math.cbrt(4 * V * ctx.v.ratio / Math.PI), 0.1);
        },
        hint: 'Suggested: the volume per tank at your ratio, rounded up to 0.1 m.' },
      { id: 'tankDepth', label: 'Water depth', group: 'length', unit: 'm',
        def: function (ctx) { return Math.round(ctx.v.tankD / ctx.v.ratio * 100) / 100; },
        hint: 'Suggested: diameter ÷ ratio. Leave freeboard above this for the tank wall.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), f = R(ctx, 'feed');
      const r = {};
      r.volNeed = f.biomass / x.density * 1000;               // L
      r.volPer = r.volNeed / x.nTanks;
      r.area = Math.PI * x.tankD * x.tankD / 4;               // m²
      r.volEach = r.area * x.tankDepth * 1000;                 // L
      r.volTotal = r.volEach * x.nTanks;
      r.dens = f.biomass / r.volTotal * 1000;                  // kg/m³
      r.ratio = x.tankD / x.tankDepth;
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (fin(r.dens) && r.dens > ctx.v.density * 1.0001) m.push('These tanks hold less than the volume needed: density would be ' + fmt(r.dens, 1) + ' kg/m³, above your ' + fmt(ctx.v.density, 1) + ' kg/m³ maximum. Make the tanks bigger or add a tank.');
      if (fin(r.dens) && r.dens > 120) m.push('Above about 120 kg/m³ is beyond what is reported even for expert tilapia RAS with pure oxygen.');
      if (fin(r.ratio) && (r.ratio < RATIO_LOW || r.ratio > RATIO_HIGH)) m.push('Diameter : depth of ' + fmt(r.ratio, 1) + ' is outside the 5–10 guide for circular tanks.');
      return m;
    },
    results: function (ctx, r) {
      const x = v(ctx);
      return [
        { label: 'Tanks', value: fin(r.volEach) ? fmt(x.nTanks, 0) + ' × ' + fmt(x.tankD, 2) + ' m Ø × ' + fmt(x.tankDepth, 2) + ' m deep' : '–', main: true },
        { label: 'Culture volume needed', value: volTxt(r.volNeed) },
        { label: 'Water per tank', value: volTxt(r.volEach) },
        { label: 'Total culture volume', value: volTxt(r.volTotal) },
        { label: 'Density at full biomass', value: fin(r.dens) ? fmt(r.dens, 1) + ' kg/m³ · ' + fmt(r.dens / 119.826427, 3) + ' lb/US gal' : '–' },
        { label: 'Diameter : depth', value: fin(r.ratio) ? fmt(r.ratio, 1) + ' : 1' : '–' },
        { label: 'Floor area of tanks', value: fin(r.area) ? q('area', r.area * x.nTanks, ['m2', 'ft2'], 0) : '–' }
      ];
    },
    tips: [
      'Round tanks with a centre drain clean themselves when the water rotates; a diameter 5–10 times the depth works well (Timmons et al., 1998).',
      'Density is a welfare and safety check, not a guarantee: research on rainbow trout shows water quality, especially oxygen, matters more than kg/m³ alone (Ellis et al., 2002).',
      'The higher the density, the less time you have when a pump or blower fails. New growers are advised to run at about half the expert density (Ebeling &amp; Timmons, 2012).'
    ],
    viz: {
      viewBox: '0 0 480 250', label: 'Top view of the tanks and a section through one tank',
      draw: function (svg, ctx, r) {
        const x = v(ctx);
        const n = Math.max(1, Math.min(12, Math.round(x.nTanks) || 1));
        const cols = Math.min(n, 6), rows = Math.ceil(n / cols);
        const cell = Math.min(440 / cols, 100 / rows);
        const rr = cell * 0.42;
        for (let i = 0; i < n; i++) {
          const cx = 240 - cols * cell / 2 + cell * (i % cols + 0.5);
          const cy = 14 + cell * (Math.floor(i / cols) + 0.5);
          G.el(svg, 'circle', { class: 'water', cx: cx, cy: cy, r: rr });
          G.el(svg, 'circle', { class: 'tank-line', cx: cx, cy: cy, r: rr });
          G.el(svg, 'circle', { class: 'g-box', cx: cx, cy: cy, r: Math.max(2, rr * 0.08) });
        }
        if (x.nTanks > 12) text(svg, 470, 20, '+' + (Math.round(x.nTanks) - 12) + ' more', 'end');
        // section of one tank
        const top = 140, maxW = 300, maxH = 80;
        if (!(x.tankD > 0 && x.tankDepth > 0)) return;
        const s = Math.min(maxW / x.tankD, maxH / x.tankDepth);
        const w = x.tankD * s, d = x.tankDepth * s, x0 = 240 - w / 2;
        G.el(svg, 'rect', { class: 'water', x: x0, y: top + maxH - d, width: w, height: d });
        G.el(svg, 'path', { class: 'tank-line', d: 'M' + x0 + ',' + (top + maxH - d - 10) + ' L' + x0 + ',' + (top + maxH) + ' L' + (x0 + w) + ',' + (top + maxH) + ' L' + (x0 + w) + ',' + (top + maxH - d - 10) });
        G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + (top + maxH + 10) + ' L' + (x0 + w) + ',' + (top + maxH + 10) });
        text(svg, 240, top + maxH + 26, 'D ' + fmt(x.tankD, 2) + ' m');
        G.el(svg, 'path', { class: 'depth-line', d: 'M' + (x0 + w + 10) + ',' + (top + maxH - d) + ' L' + (x0 + w + 10) + ',' + (top + maxH) });
        text(svg, x0 + w + 16, top + maxH - d / 2 + 4, fmt(x.tankDepth, 2) + ' m', 'start', 'depth-text');
      },
      caption: function (ctx, r) { return fin(r.volTotal) ? fmt(ctx.v.nTanks, 0) + ' tanks · ' + volTxt(r.volTotal) + ' · ' + fmt(r.dens, 1) + ' kg/m³ at full biomass' : 'Enter the inputs'; }
    },
    sources: ['fao589', 'et2012', 'ebeling2000', 'ellis2002', 'timmons1998'],
    links: function (ctx, r) {
      const x = v(ctx), f = R(ctx, 'feed');
      const count = Math.round(f.biomass / x.harvW);
      return [
        { slug: 'tank-volume', label: 'Tank Volume', params: { shape: 'cyl', water: x.sal >= 20 ? 'salt' : 'fresh', out: 'L',
          diameter: p(x.tankD, 5), diameter_u: 'm', height: p(x.tankDepth, 5), height_u: 'm', depth: p(x.tankDepth, 5), depth_u: 'm' } },
        { slug: 'fish-stocking-density', label: 'Fish Stocking Density', params: {
          vol: p(r.volTotal / 1000, 5), vol_u: 'm3', count: fin(count) ? count : '', weight: p(x.harvW, 5), weight_u: 'kg',
          target: p(x.density, 5), target_u: 'kgm3', preset: densityPreset(x.density), dout: 'kgm3', mout: 'kg' } }
      ];
    }
  };

  // ---------- 4. Oxygen ----------
  const stepOxygen = {
    id: 'oxygen', title: 'Oxygen demand and supply', short: 'Oxygen',
    intro: '<p>Oxygen is usually the first limit on how many fish a RAS can carry. This step estimates how much oxygen the fish and the filters use each day from the feed, and how much water flow it would take to carry that oxygen into the tanks if it is not added in the tanks themselves.</p>',
    fields: [
      { id: 'o2Feed', label: 'Oxygen used per kg of feed', suffix: 'kg O₂/kg feed', def: 0.5,
        check: function (x) { return x > 2 ? 'More than 2 kg O₂ per kg of feed is far above published design values (0.3–1.0).' : ''; },
        hint: 'Rule of thumb: about 0.3 kg O₂/kg feed with fast solids removal, up to 1.0 where solids stay in submerged filters (Global Aquaculture Advocate). 0.5 is a common planning value.' },
      { id: 'elev', label: 'Site elevation', group: 'length', unit: 'm', signed: true, def: 0,
        check: function (h) { return h < -500 || h > 6000 ? 'Elevation must be between −500 m and 6,000 m.' : ''; },
        hint: 'Higher sites have lower air pressure, so water holds less oxygen.' },
      { id: 'o2Mode', label: 'How oxygen gets into the tanks', type: 'select', def: 'intank',
        options: [
          { value: 'intank', label: 'Added in the tanks (diffusers, air or pure oxygen)' },
          { value: 'inflow', label: 'Carried in by the inflow water (aerated or oxygenated sump/cone)' }
        ],
        hint: 'If all oxygen arrives with the inflow, the flow must be large enough to carry it; this is the oxygen flow limit.' },
      { id: 'doIn', label: 'Inlet dissolved oxygen', group: 'concentration', unit: 'mgL',
        def: function (ctx) { return csat(ctx.v.temp, ctx.v.sal, ctx.v.elev); },
        show: function (ctx) { return ctx.v.o2Mode === 'inflow'; },
        hint: 'Suggested: 100% saturation (aerated water). Oxygen cones or low-head oxygenators can supersaturate the inflow; enter their outlet DO.' },
      { id: 'doMin', label: 'Minimum DO leaving the tanks', group: 'concentration', unit: 'mgL',
        def: function (ctx) { return DO_GROUPS[sp(ctx).group].ok; },
        hint: 'Rule of thumb from the Dissolved Oxygen calculator: at least 5 mg/L for warm-water fish, 6.5 mg/L for cold-water fish.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), f = R(ctx, 'feed');
      const r = {};
      r.csat = csat(x.temp, x.sal, x.elev);
      r.o2Day = f.feed * x.o2Feed;                       // kg/day
      r.gasL = r.o2Day * 754.6;                           // L of O₂ gas at 21.1 °C, 1 atm (fish-hauling.js)
      r.window = x.doIn - x.doMin;
      r.qO2 = x.o2Mode === 'inflow' && r.window > 0 ? r.o2Day * 1e6 / r.window / 86400 : NaN; // L/s
      return r;
    },
    notices: function (ctx, r) {
      const m = [], x = v(ctx), dens = R(ctx, 'tanks').dens;
      if (!fin(r.csat)) m.push('Oxygen saturation needs a temperature of 0–40 °C, salinity 0–40 ppt and an elevation of −500 to 6,000 m.');
      if (x.o2Mode === 'inflow' && fin(r.window) && r.window <= 0) m.push('The inlet DO must be higher than the minimum DO leaving the tanks, or the water cannot bring any oxygen.');
      if (fin(dens) && dens > 30 && !(x.o2Mode === 'inflow' && x.doIn > r.csat * 1.02)) m.push('At ' + fmt(dens, 0) + ' kg/m³ you will most likely need pure oxygen: aeration with air alone is usually quoted as good for about 30 kg/m³ (rule of thumb).');
      return m;
    },
    results: function (ctx, r) {
      const x = v(ctx);
      return [
        { label: 'Oxygen used by fish and filters', value: fin(r.o2Day) ? fmt(r.o2Day, 1) + ' kg O₂/day · ' + fmt(r.o2Day / 24, 2) + ' kg/h' : '–', main: true },
        { label: 'DO at 100% saturation', value: fin(r.csat) ? fmt(r.csat, 2) + ' mg/L' : '–' },
        { label: 'Flow to carry the oxygen', value: x.o2Mode === 'inflow' ? flowTxt(r.qO2) : 'Not a flow limit (oxygen added in the tanks)' },
        { label: 'Same oxygen as pure O₂ gas', value: fin(r.gasL) ? fmt(r.gasL / 1000, 1) + ' m³/day absorbed (21 °C, 1 atm)' : '–' }
      ];
    },
    tips: function (ctx, r) {
      return [
        'Oxygen demand follows the feed, not the tank size: the daily oxygen budget is feed × kg O₂ per kg feed.',
        'The gas figure is only what the water absorbs. Diffusers and cones lose part of the gas, so the oxygen supply must be larger; size it from the device’s transfer efficiency.',
        'Keep DO at or above the minimum at the tank <em>outlet</em>, where it is lowest. Warm water holds less oxygen: at ' + q('temperature', ctx.v.temp, ['C'], 0) + ' saturation is ' + fmt(r.csat, 2) + ' mg/L.'
      ];
    },
    viz: {
      viewBox: '0 0 480 230', label: 'Dissolved oxygen scale from zero to saturation with the minimum and inlet levels',
      draw: function (svg, ctx, r) {
        const x = v(ctx);
        const top = Math.max(r.csat || 0, x.o2Mode === 'inflow' ? x.doIn || 0 : 0, x.doMin || 0) * 1.15 || 10;
        const X = function (val) { return 30 + Math.max(0, Math.min(1, val / top)) * 420; };
        text(svg, 30, 20, 'Dissolved oxygen (mg/L)', 'start', 'dim-text');
        G.el(svg, 'rect', { class: 'g-track', x: 30, y: 48, width: 420, height: 26, rx: 4 });
        if (fin(x.doMin)) G.el(svg, 'rect', { class: 'g-bar-warn', x: 30, y: 48, width: X(x.doMin) - 30, height: 26, rx: 4, 'fill-opacity': 0.35 });
        if (fin(r.csat)) {
          G.el(svg, 'line', { class: 'g-line', x1: X(r.csat), y1: 40, x2: X(r.csat), y2: 82 });
          text(svg, X(r.csat), 98, 'saturation ' + fmt(r.csat, 2), X(r.csat) > 380 ? 'end' : 'middle', 'g-label');
        }
        if (fin(x.doMin)) text(svg, Math.max(X(x.doMin), 130), 42, 'minimum ' + fmt(x.doMin, 1), 'end', 'g-warn-text');
        if (x.o2Mode === 'inflow' && fin(x.doIn)) {
          G.el(svg, 'rect', { class: 'g-bar', x: X(x.doMin), y: 112, width: Math.max(0, X(x.doIn) - X(x.doMin)), height: 14, rx: 3 });
          text(svg, (X(x.doMin) + X(x.doIn)) / 2, 142, 'usable ' + fmt(r.window, 2) + ' mg/L per litre of inflow', 'middle', 'g-accent-text');
        }
        text(svg, 30, 92, '0', 'start');
        text(svg, 240, 180, fin(r.o2Day) ? fmt(r.o2Day, 1) + ' kg O₂ per day = ' + fmt(r.o2Day / 24 * 1000, 0) + ' g per hour' : '', 'middle', 'g-strong');
        text(svg, 240, 202, x.o2Mode === 'inflow' ? 'flow needed = O₂ per day ÷ usable mg/L' : 'oxygen added in the tanks: flow is set by other limits', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.csat) ? 'Saturation ' + fmt(r.csat, 2) + ' mg/L at ' + q('temperature', ctx.v.temp, ['C'], 1) + ', ' + fmt(ctx.v.sal, 1) + ' ppt, ' + fmt(ctx.v.elev, 0) + ' m' : 'Enter the inputs'; }
    },
    sources: ['gaaaeration', 'usgs2011', 'benson1984', 'stdatm', 'boydtucker1998', 'epa1986', 'fao589', 'te2010'],
    links: function (ctx, r) {
      const x = v(ctx);
      return [{ slug: 'dissolved-oxygen', label: 'Dissolved Oxygen', params: {
        temp: p(x.temp, 4), temp_u: 'C', sal: p(x.sal, 4), pmode: 'elev', elev: p(x.elev, 5), elev_u: 'm',
        group: sp(ctx).group, meas: p(x.doMin, 4), meas_u: 'mgL', out: 'mgL' } }];
    }
  };

  // ---------- 5. Biofilter ----------
  const stepBio = {
    id: 'biofilter', title: 'Biofilter', short: 'Biofilter',
    intro: '<p>Fish excrete ammonia (TAN) that is toxic if it builds up. Nitrifying bacteria living on biofilter media turn it into nitrate. This step works out how much TAN the feed produces, how much bacterial surface area and media that needs, and how much water must pass the biofilter to keep TAN in the tanks low.</p>',
    fields: [
      { id: 'media', label: 'Biofilter media', type: 'select', def: 'k1',
        options: Object.keys(MEDIA).map(function (k) { return { value: k, label: MEDIA[k].name }; }) },
      { id: 'ssa', label: 'Media specific surface area', group: 'specificarea', unit: 'm2m3',
        def: function (ctx) { return MEDIA[ctx.v.media].ssa || 500; },
        hint: 'Suggested from the media choice; use your media data sheet.' },
      { id: 'nitr', label: 'Areal nitrification rate', group: 'arealrate', unit: 'gm2d', def: 0.5,
        check: function (x) { return x > 5 ? 'That nitrification rate is far above values reported for aquaculture biofilters (0.1–1.2 g/m²/day).' : ''; },
        hint: 'g TAN removed per m² of media per day. 0.1–1.2 is usually reported; lower in cold water and at low TAN.' },
      { id: 'bioSF', label: 'Safety factor', suffix: '×', def: 1.25, hint: 'Extra area for peaks, cold spells and new filters.' },
      { id: 'tanMax', label: 'Maximum TAN in the tanks', group: 'concentration', unit: 'mgL', def: 1,
        hint: 'FAO keeps TAN below about 1 mg/L in aquaponics; tolerance depends on pH and species (TAN Conversion calculator).' },
      { id: 'tanEff', label: 'Biofilter TAN removal per pass', suffix: '%', def: 50, check: pctCheck('TAN removal per pass', 0, 100),
        hint: 'About 50% per pass for most biofilters used today (Losordo &amp; DeLong, 2015).' },
      { id: 'passive', label: 'Passive nitrification elsewhere', suffix: '%', def: 0, allowZero: true, check: pctCheck('Passive nitrification', 0, 99),
        hint: 'Share of TAN removed by bacteria on tank and pipe walls. 0% is conservative; Losordo &amp; DeLong’s example assumes 20%.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), f = R(ctx, 'feed');
      const r = {};
      r.tanKg = f.feed * (x.protein / 100) * TAN_FACTOR;
      r.areaBare = r.tanKg * 1000 / x.nitr;
      r.area = r.areaBare * x.bioSF;
      r.mediaL = r.area / x.ssa * 1000;
      r.moving = MEDIA[x.media].moving;
      if (r.moving) { r.vesselLo = r.mediaL / MOVING_NORMAL[1]; r.vesselHi = r.mediaL / MOVING_NORMAL[0]; r.vesselLink = r.mediaL / 0.6; }
      else { r.vesselLo = r.vesselHi = r.vesselLink = r.mediaL; }
      r.qTan = r.tanKg * 1e6 * (1 - x.passive / 100) / (x.tanMax * x.tanEff / 100) / 86400;   // L/s
      return r;
    },
    notices: function (ctx) {
      const n = ctx.v.nitr;
      return [fin(n) && (n < 0.1 || n > 1.2) ? 'A nitrification rate of ' + fmt(n, 3) + ' g/m²/day is outside the 0.1–1.2 g/m²/day usually reported for aquaculture biofilters.' : ''];
    },
    results: function (ctx, r) {
      return [
        { label: 'Biofilm surface area needed', value: fin(r.area) ? q('area', r.area, ['m2', 'ft2'], 0) : '–', main: true },
        { label: 'TAN produced', value: fin(r.tanKg) ? fmt(r.tanKg * 1000, 0) + ' g/day' : '–' },
        { label: 'Media volume', value: volTxt(r.mediaL) },
        { label: r.moving ? 'Reactor volume at 50–65% fill' : 'Filter volume (media fills it)', value: r.moving ? (fin(r.vesselLo) ? q('volume', r.vesselLo, ['m3'], 1) + '–' + q('volume', r.vesselHi, ['m3'], 1) : '–') : volTxt(r.vesselLo) },
        { label: 'Flow through the biofilter for TAN', value: flowTxt(r.qTan) }
      ];
    },
    tips: [
      'TAN = feed × protein × 0.092: fish use about 16% of protein as nitrogen, 80% of that is assimilated, 80% excreted, 90% as TAN (Timmons et al., 2002; Ebeling et al., 2006).',
      'Moving-bed carriers are usually filled 50–65% and never above 70%, so they can circulate freely (Rusten et al., 2006).',
      'TAN flow (mass balance): flow = TAN to remove ÷ (tank TAN × removal per pass). Halving the TAN you allow doubles the flow (Losordo &amp; DeLong, 2015).',
      'A new biofilter takes weeks to establish. Stock and feed gradually while bacteria build up.'
    ],
    viz: {
      viewBox: '0 0 480 230', label: 'Biofilter vessel with media fill level',
      draw: function (svg, ctx, r) {
        if (!fin(r.mediaL)) return;
        const fill = r.moving ? 0.6 : 1;
        const x0 = 60, y0 = 24, w = 170, hgt = 170;
        G.el(svg, 'rect', { class: 'water', x: x0, y: y0 + 14, width: w, height: hgt - 14 });
        G.el(svg, 'rect', { class: 'g-media', x: x0, y: y0 + hgt - (hgt - 14) * fill, width: w, height: (hgt - 14) * fill });
        for (let i = 0; i < 46; i++) {
          const cx = x0 + 12 + (i * 37) % (w - 24), cy = y0 + hgt - 10 - ((i * 53) % Math.max(10, (hgt - 34) * fill));
          G.el(svg, 'circle', { class: 'tank-line', cx: cx, cy: cy, r: 5, 'stroke-width': 1 });
        }
        G.el(svg, 'path', { class: 'tank-line', d: 'M' + x0 + ',' + y0 + ' L' + x0 + ',' + (y0 + hgt) + ' L' + (x0 + w) + ',' + (y0 + hgt) + ' L' + (x0 + w) + ',' + y0 });
        text(svg, x0 + w / 2, y0 + hgt + 22, r.moving ? 'reactor at 60% fill' : 'media bed', 'middle', 'dim-text');
        text(svg, 260, 50, 'TAN in', 'start', 'dim-text');
        text(svg, 260, 70, fmt(r.tanKg * 1000, 0) + ' g/day', 'start', 'g-strong');
        text(svg, 260, 104, 'Surface area', 'start', 'dim-text');
        text(svg, 260, 124, q('area', r.area, ['m2'], 0), 'start', 'g-strong');
        text(svg, 260, 158, 'Media', 'start', 'dim-text');
        text(svg, 260, 178, q('volume', r.mediaL, ['m3'], 2), 'start', 'g-strong');
      },
      caption: function (ctx, r) { return fin(r.area) ? q('area', r.area, ['m2'], 0) + ' of biofilm on ' + q('volume', r.mediaL, ['m3'], 2) + ' of media' : 'Enter the inputs'; }
    },
    sources: ['ebeling2006', 'timmons2002', 'rusten2006', 'guerdat2010', 'losordo2015', 'losordohobbs2000', 'fao589', 'durborow1997'],
    links: function (ctx, r) {
      const x = v(ctx), f = R(ctx, 'feed');
      return [{ slug: 'biological-surface-area', label: 'Biofilter Surface Area', params: {
        method: 'feed', media: x.media, feed: p(f.feed, 5), feed_u: 'kg', protein: p(x.protein, 4),
        rate: p(x.nitr, 4), rate_u: 'gm2d', safety: p(x.bioSF, 4), ssa: p(x.ssa, 5), ssa_u: 'm2m3',
        vessel: p(Math.ceil(r.vesselLink), 6), vessel_u: 'L', oa: 'm2', ov: 'L', ot: 'g' } }];
    }
  };

  // ---------- 6. Water flow ----------
  const stepFlow = {
    id: 'flow', title: 'Recirculating water flow', short: 'Flow',
    intro: '<p>The pump must move enough water to meet every limit at once: carry oxygen in (if it arrives with the water), take ammonia to the biofilter, take solids to the filter, and exchange the tank water often enough. The design flow is the largest of these.</p>',
    fields: [
      { id: 'tssPct', label: 'Solids produced', suffix: '% of feed', def: 25, check: pctCheck('Solids produced', 0, 100),
        hint: '25% (0.25 kg TSS per kg feed) is the common design value (Timmons &amp; Ebeling, 2010).' },
      { id: 'tssMax', label: 'Maximum suspended solids in the tanks', group: 'concentration', unit: 'mgL', def: 25,
        hint: 'Design assumption, not a value cited on this site: enter your own target. Lower TSS needs more flow.' },
      { id: 'tssEff', label: 'Solids captured per pass', suffix: '%', def: 50, check: pctCheck('Solids captured per pass', 0, 100),
        hint: 'Design assumption: depends on the filter and particle size. Enter your filter’s value.' },
      { id: 'hrt', label: 'Target tank exchange time', group: 'time', unit: 'min', def: 1800,
        hint: 'Time to replace the water of a tank once (hydraulic retention time). Davidson &amp; Summerfelt (2004) used 20–32 min in self-cleaning circular tanks.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), f = R(ctx, 'feed'), t = R(ctx, 'tanks'), o = R(ctx, 'oxygen'), b = R(ctx, 'biofilter');
      const r = {};
      r.tssKg = f.feed * x.tssPct / 100;
      r.qTss = r.tssKg * 1e6 / (x.tssMax * x.tssEff / 100) / 86400;
      r.qHrt = t.volTotal / x.hrt;
      r.items = [
        { key: 'o2', label: 'Oxygen', rl: 'oxygen', q: o.qO2 },
        { key: 'tan', label: 'Ammonia (TAN)', rl: 'ammonia (TAN)', q: b.qTan },
        { key: 'tss', label: 'Solids (TSS)', rl: 'solids (TSS)', q: r.qTss },
        { key: 'hrt', label: 'Tank exchange', rl: 'tank exchange', q: r.qHrt }
      ];
      let best = null;
      r.items.forEach(function (it) { if (fin(it.q) && (!best || it.q > best.q)) best = it; });
      r.ctrl = best;
      r.q = best ? best.q : NaN;                       // L/s
      const needed = r.items.filter(function (it) { return it.key !== 'o2' || ctx.v.o2Mode === 'inflow'; });
      if (needed.some(function (it) { return !fin(it.q); })) r.q = NaN;
      r.hrtActual = t.volTotal / r.q;                  // s
      r.qTank = r.q / ctx.v.nTanks;
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (fin(r.hrtActual) && (r.hrtActual < 20 * 60 || r.hrtActual > 32 * 60)) m.push('Tank exchange time of ' + minutes(r.hrtActual) + ' is outside the 20–32 min used by Davidson & Summerfelt (2004) for self-cleaning circular tanks (a reference range, not a rule).');
      return m;
    },
    results: function (ctx, r) {
      const out = [{ label: 'Design recirculating flow', value: flowTxt(r.q), main: true },
        { label: 'Set by', value: r.ctrl && fin(r.q) ? r.ctrl.label : '–' }];
      r.items.forEach(function (it) { out.push({ label: 'Flow for ' + it.rl, value: fin(it.q) ? flowTxt(it.q) : 'not a limit' }); });
      out.push({ label: 'Tank exchange time at design flow', value: fin(r.hrtActual) ? minutes(r.hrtActual) + ' · ' + fmt(3600 / r.hrtActual, 2) + ' exchanges/h' : '–' });
      out.push({ label: 'Flow per tank', value: flowTxt(r.qTank) });
      out.push({ label: 'Solids produced', value: fin(r.tssKg) ? fmt(r.tssKg, 1) + ' kg/day' : '–' });
      return out;
    },
    tips: [
      'Mass balance for any waste: flow = amount produced per day ÷ (allowed concentration × share removed per pass) (Losordo &amp; Hobbs, 2000; Losordo &amp; DeLong, 2015).',
      'Whichever limit needs the most water sets the pump. To cut pumping cost, attack that limit: e.g. add oxygen in the tanks, or use a filter that removes more per pass.',
      'Intensive RAS tanks are usually exchanged far more than the 1–2 times per hour typical in aquaponics (Pump &amp; Turnover calculator).'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'Flow needed for each limit compared with the design flow',
      draw: function (svg, ctx, r) {
        const max = Math.max.apply(null, r.items.map(function (it) { return fin(it.q) ? it.q : 0; }).concat([1e-9]));
        hbars(svg, r.items.map(function (it) {
          return { label: it.label, value: it.q, text: fin(it.q) ? q('flow', it.q, ['m3ph'], 1) : 'not a limit', cls: r.ctrl && it.key === r.ctrl.key ? 'g-bar' : 'g-bar-muted' };
        }), { x0: 130, w: 320, y0: 16, gap: 36, max: max });
        if (fin(r.q)) text(svg, 240, 180, 'Design flow = largest bar = ' + q('flow', r.q, ['m3ph', 'gpm'], 0), 'middle', 'g-strong');
      },
      caption: function (ctx, r) { return r.ctrl && fin(r.q) ? 'Controlled by ' + r.ctrl.label.toLowerCase() : 'Enter the inputs'; }
    },
    sources: ['losordohobbs2000', 'losordo2015', 'te2010', 'davidson2004', 'timmons1998']
  };

  // ---------- 7. Solids removal (drum filter) ----------
  const stepDrum = {
    id: 'solids', title: 'Solids removal: drum filter', short: 'Solids',
    intro: '<p>Uneaten feed and faeces must leave the system quickly, before they break down and use oxygen. A rotating drum filter screens the whole design flow. This step sizes the submerged screen area it needs.</p>',
    fields: [
      { id: 'mesh', label: 'Screen mesh opening', type: 'select', def: '60',
        options: [40, 60, 80, 100, 120].map(function (m) { return { value: String(m), label: m + ' µm' }; }) },
      { id: 'hlr', label: 'Screen hydraulic loading', group: 'hydload', unit: 'm3m2h',
        def: function (ctx) { return HLR_BY_MESH[ctx.v.mesh]; },
        check: function (x) { return x > 100 ? 'That loading is far outside the 5–40 m³/m²/h range treated as plausible.' : ''; },
        hint: 'Illustrative starting value for the mesh (Drum Filter Sizing calculator), not a standard: use the maker’s rating.' },
      { id: 'sub', label: 'Screen submergence', suffix: '% of diameter', def: 65,
        check: function (x) { return x >= 100 ? 'Submergence must be between 0 and 100% of the diameter.' : ''; },
        hint: 'Drums typically run about 60–70% submerged (rule of thumb).' },
      { id: 'drumD', label: 'Drum diameter', group: 'length', unit: 'm', def: 1.5 }
    ],
    compute: function (ctx) {
      const x = v(ctx), fl = R(ctx, 'flow');
      const r = {};
      r.Qm3h = fl.q * 3.6;
      r.Areq = r.Qm3h / x.hlr;
      const s = Math.min(Math.max(x.sub, 0), 100) / 100;
      r.theta = 2 * Math.acos(1 - 2 * s);
      r.f = r.theta / (2 * Math.PI);
      r.Lneed = r.Areq / (r.f * Math.PI * x.drumD);
      r.L = ceilTo(r.Lneed, 0.05);
      r.conc = fl.tssKg / (r.Qm3h * 24) * 1000;            // mg/L added per pass
      return r;
    },
    notices: function (ctx) {
      const m = [], x = v(ctx);
      if (fin(x.hlr) && (x.hlr < 5 || x.hlr > 40)) m.push('A loading of ' + fmt(x.hlr) + ' m³/m²/h is outside the 5–40 m³/m²/h range treated as plausible. Confirm it with the manufacturer.');
      if (fin(x.sub) && (x.sub < 40 || x.sub > 80)) m.push('Submergence of ' + fmt(x.sub, 0) + '% is unusual; drums typically run about 60–70% submerged (rule of thumb).');
      return m;
    },
    results: function (ctx, r) {
      const x = v(ctx);
      return [
        { label: 'Submerged screen area needed', value: fin(r.Areq) ? q('area', r.Areq, ['m2', 'ft2']) : '–', main: true },
        { label: 'Screen length for this diameter', value: fin(r.Lneed) ? fmt(r.Lneed, 2) + ' m (use ' + fmt(r.L, 2) + ' m)' : '–' },
        { label: 'Suggested drum', value: fin(r.L) ? fmt(x.drumD, 2) + ' m Ø × ' + fmt(r.L, 2) + ' m screen' : '–' },
        { label: 'Wetted share of the screen', value: fin(r.f) ? fmt(r.f * 100, 1) + '%' : '–' },
        { label: 'Solids load', value: fin(R(ctx, 'flow').tssKg) ? fmt(R(ctx, 'flow').tssKg, 1) + ' kg/day' : '–' },
        { label: 'Solids added per pass (mean)', value: fin(r.conc) ? fmt(r.conc, 2) + ' mg/L' : '–' }
      ];
    },
    tips: [
      'Only the submerged part of the screen filters water; a drum at 65% submergence wets about 60% of its screen.',
      'There is no single published standard for drum-filter loading: capacity depends on mesh, solids load, particle size and backwash frequency (Dolan et al., 2013). Treat the loading as a starting value and size from the maker’s data.',
      'Large flows are often split over two or more drums, which also gives redundancy for maintenance.'
    ],
    viz: {
      viewBox: '0 0 480 230', label: 'Cross-section of the drum filter at its submergence',
      draw: function (svg, ctx, r) {
        const x = v(ctx);
        const cx = 140, cy = 112, rad = 86;
        const s = Math.min(Math.max(x.sub, 0), 100) / 100;
        const yw = cy + rad - 2 * rad * s;
        const half = Math.sqrt(Math.max(0, rad * rad - (yw - cy) * (yw - cy)));
        if (fin(r.theta)) {
          const large = s > 0.5 ? 1 : 0;
          G.el(svg, 'path', { class: 'water', d: 'M' + (cx - half) + ',' + yw + ' A' + rad + ',' + rad + ' 0 ' + large + ' 0 ' + (cx + half) + ',' + yw + 'Z' });
          G.el(svg, 'line', { class: 'water-top', x1: cx - rad - 20, y1: yw, x2: cx + rad + 20, y2: yw });
        }
        G.el(svg, 'circle', { class: 'tank-line', cx: cx, cy: cy, r: rad });
        G.el(svg, 'circle', { class: 'g-box', cx: cx, cy: cy, r: 5 });
        text(svg, cx, cy + rad + 22, 'D ' + fmt(x.drumD, 2) + ' m · ' + fmt(x.sub, 0) + '% submerged');
        text(svg, 270, 60, 'Screen needed', 'start', 'dim-text');
        text(svg, 270, 80, fin(r.Areq) ? q('area', r.Areq, ['m2'], 2) : '–', 'start', 'g-strong');
        text(svg, 270, 116, 'Screen length', 'start', 'dim-text');
        text(svg, 270, 136, fin(r.L) ? fmt(r.L, 2) + ' m' : '–', 'start', 'g-strong');
        text(svg, 270, 172, 'Design flow', 'start', 'dim-text');
        text(svg, 270, 192, fin(r.Qm3h) ? fmt(r.Qm3h, 0) + ' m³/h' : '–', 'start', 'g-strong');
      },
      caption: function (ctx, r) { return fin(r.Areq) ? q('area', r.Areq, ['m2']) + ' submerged screen at ' + fmt(ctx.v.hlr, 1) + ' m³/m²/h' : 'Enter the inputs'; }
    },
    sources: ['te2010', 'cripps2000', 'dolan2013', 'ali2013'],
    links: function (ctx, r) {
      const x = v(ctx), fl = R(ctx, 'flow'), f = R(ctx, 'feed');
      return [{ slug: 'drum-filter-sizing', label: 'Drum Filter Sizing', params: {
        flow: p(r.Qm3h, 5), flow_u: 'm3ph', feed: p(f.feed, 5), feed_u: 'kg', tssfrac: p(x.tssPct, 4), mesh: x.mesh,
        hlr: p(x.hlr, 4), hlr_u: 'm3m2h', sub: p(x.sub, 4), diameter: p(x.drumD, 4), diameter_u: 'm', length: p(r.L, 4), length_u: 'm', oa: 'm2', ov: 'L' } }];
    }
  };

  // ---------- 8. Tank inlets and rotation ----------
  const stepInlets = {
    id: 'inlets', title: 'Tank inlets and water rotation', short: 'Inlets',
    intro: '<p>In a round tank the inflow enters through ports aimed along the wall and sets the whole tank rotating. The rotation sweeps solids to the centre drain and exercises the fish, but must not be so fast that fish waste energy fighting it. This step sizes the inlet ports for a target rotation speed.</p>',
    fields: [
      { id: 'fishLen', label: 'Fish length', group: 'length', unit: 'cm', def: 0.2,
        hint: 'Length of the fish in the tank. Small fish need slower water.' },
      { id: 'vTarget', label: 'Target rotation velocity', group: 'velocity', unit: 'cmps', def: 0.3,
        hint: 'Solids move to the drain above about 15–30 cm/s (Timmons et al., 1998).' },
      { id: 'ports', label: 'Inlet ports per tank', def: 8, check: intCheck('Inlet ports per tank') },
      { id: 'portD', label: 'Port diameter', group: 'length', unit: 'mm',
        def: function (ctx) {
          const qT = R(ctx, 'flow').qTank / 1000;              // m³/s
          const vin = ctx.v.vTarget / K_MID;
          return Math.round(Math.sqrt(4 * qT / (ctx.v.ports * Math.PI * vin)) * 1000) / 1000;
        },
        hint: 'Suggested: the size that gives the target at the middle of the 15–20% rule, rounded to 1 mm.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), fl = R(ctx, 'flow');
      const r = {};
      r.qT = fl.qTank / 1000;                                   // m³/s per tank
      r.area = x.ports * Math.PI * x.portD * x.portD / 4;
      r.vin = r.qT / r.area;
      r.vLow = K_LOW * r.vin; r.vHigh = K_HIGH * r.vin; r.vMid = K_MID * r.vin;
      r.blLow = r.vLow / x.fishLen; r.blHigh = r.vHigh / x.fishLen;
      r.head = r.vin * r.vin / (2 * GRAV);
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (fin(r.blLow) && r.blLow > BL_HIGH) m.push('The rotation is faster than 2 body lengths per second for these fish; use more or larger ports.');
      if (fin(r.blHigh) && r.blHigh < BL_LOW) m.push('The rotation is below 0.5 body lengths per second.');
      if (fin(r.vHigh) && r.vHigh < CLEAN_LOW) m.push('Rotation below about 15 cm/s is unlikely to carry solids to the centre drain.');
      return m;
    },
    results: function (ctx, r) {
      let clean = '–';
      if (fin(r.vLow)) clean = r.vLow >= CLEAN_HIGH ? 'Yes, above 30 cm/s' : r.vLow >= CLEAN_LOW ? 'Likely (in the 15–30 cm/s band)' : r.vHigh >= CLEAN_LOW ? 'Borderline, near 15 cm/s' : 'Unlikely, below 15 cm/s';
      return [
        { label: 'Estimated rotation velocity', value: fin(r.vLow) ? fmt(r.vLow * 100, 1) + '–' + fmt(r.vHigh * 100, 1) + ' cm/s' : '–', main: true },
        { label: 'Inlet jet velocity', value: fin(r.vin) ? q('velocity', r.vin, ['mps', 'ftps']) : '–' },
        { label: 'Flow per tank', value: q('flow', R(ctx, 'flow').qTank, ['Lpm', 'gpm'], 0) },
        { label: 'Fish swimming speed', value: fin(r.blLow) ? fmt(r.blLow, 2) + '–' + fmt(r.blHigh, 2) + ' body lengths/s' : '–' },
        { label: 'Self-cleaning', value: clean },
        { label: 'Jet velocity head (added to pump head)', value: fin(r.head) ? fmt(r.head * 100, 1) + ' cm' : '–' }
      ];
    },
    tips: [
      'Rotation ≈ 15–20% of the inlet jet velocity (Timmons et al., 1998, citing Paul et al., 1991). It is a rule of thumb, so measure the real tank.',
      '0.5–2 body lengths per second is considered best for fish health (Losordo &amp; Westers, 1994).',
      'Use inlet pipes with swappable or rotatable ports so you can slow the water for small fish and speed it up as they grow (Davidson &amp; Summerfelt, 2004).'
    ],
    viz: {
      viewBox: '0 0 480 240', label: 'Top view of a round tank with inlet jets along the wall',
      draw: function (svg, ctx, r) {
        const cx = 130, cy = 120, rad = 96;
        G.el(svg, 'circle', { class: 'water', cx: cx, cy: cy, r: rad });
        G.el(svg, 'circle', { class: 'tank-line', cx: cx, cy: cy, r: rad });
        G.el(svg, 'circle', { class: 'g-box', cx: cx, cy: cy, r: 6 });
        const n = Math.max(1, Math.min(16, Math.round(ctx.v.ports) || 1));
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + i * 0.22;
          const px = cx + (rad - 12) * Math.cos(a), py = cy + (rad - 12) * Math.sin(a);
          arrow(svg, px, py, px - 24 * Math.sin(a), py + 24 * Math.cos(a));
        }
        G.el(svg, 'path', { class: 'g-line-accent', d: 'M' + (cx - 50) + ',' + cy + ' A50,50 0 1 1 ' + cx + ',' + (cy + 50) });
        text(svg, 260, 60, 'Jet velocity', 'start', 'dim-text');
        text(svg, 260, 80, fin(r.vin) ? fmt(r.vin, 2) + ' m/s' : '–', 'start', 'g-strong');
        text(svg, 260, 116, 'Rotation (15–20%)', 'start', 'dim-text');
        text(svg, 260, 136, fin(r.vLow) ? fmt(r.vLow * 100, 0) + '–' + fmt(r.vHigh * 100, 0) + ' cm/s' : '–', 'start', 'g-strong');
        text(svg, 260, 172, 'Fish', 'start', 'dim-text');
        text(svg, 260, 192, fin(r.blLow) ? fmt(r.blLow, 1) + '–' + fmt(r.blHigh, 1) + ' BL/s' : '–', 'start', 'g-strong');
      },
      caption: function (ctx, r) { return fin(r.vin) ? fmt(ctx.v.ports, 0) + ' ports × ' + fmt(ctx.v.portD * 1000, 0) + ' mm per tank' : 'Enter the inputs'; }
    },
    sources: ['timmons1998', 'paul1991', 'losordowesters1994', 'davidson2004', 'tvinnereim1989'],
    links: function (ctx, r) {
      const x = v(ctx);
      return [{ slug: 'internal-tank-velocity', label: 'Internal Tank Velocity', params: {
        shape: 'round', diameter: p(x.tankD, 5), diameter_u: 'm', depth: p(x.tankDepth, 5), depth_u: 'm',
        flow: p(R(ctx, 'flow').qTank * 60, 5), flow_u: 'Lpm', ports: p(x.ports, 4), portd: p(x.portD * 1000, 4), portd_u: 'mm',
        fish: p(x.fishLen * 100, 4), fish_u: 'cm', target: p(x.vTarget * 100, 4), target_u: 'cmps', vout: 'cmps' } }];
    }
  };

  // ---------- 9. Plumbing and pump ----------
  const stepPump = {
    id: 'pump', title: 'Plumbing and pump', short: 'Pump',
    intro: '<p>The main return line carries the whole design flow from the sump back to the tanks. This step picks a PVC pipe size from a target velocity, adds up the friction and fitting losses, and gives the pump duty (flow and head), its power and daily energy use.</p>',
    fields: [
      { id: 'vPipe', label: 'Target pipe velocity', group: 'velocity', unit: 'ftps', def: 4 * 0.3048,
        hint: 'Common band 2–5 ft/s (0.6–1.5 m/s); keep under 10 ft/s to limit water hammer (Pipe Water Velocity calculator).' },
      { id: 'pipe', label: 'Return pipe (PVC Schedule 40)', type: 'select', def: 'auto',
        options: function (ctx) {
          return [{ value: 'auto', label: 'Auto: smallest at or under the target' }].concat(PVC40.map(function (x) {
            return { value: x.id, label: x.name + ' Sch 40 (ID ' + x.idIn.toFixed(3) + ' in)' };
          }));
        } },
      { id: 'pipeLen', label: 'Pipe length', group: 'length', unit: 'm', def: 30, hint: 'Total length of the return line.' },
      { id: 'lift', label: 'Static lift', group: 'length', unit: 'm', allowZero: true, def: 1.5,
        hint: 'Height from the sump water level to the highest water surface the pump delivers to.' },
      { id: 'extraHead', label: 'Extra head for equipment', group: 'length', unit: 'm', allowZero: true, def: 0,
        hint: 'Pressure drop of anything on the pump side (oxygen cone, UV, heat exchanger) from its data sheet.' },
      { id: 'n90', half: true, label: '90° elbows', def: 6, allowZero: true, check: intCheck('90° elbows') },
      { id: 'nTee', half: true, label: 'Tees (flow through run)', def: 2, allowZero: true, check: intCheck('Tees') },
      { id: 'nBall', half: true, label: 'Ball valves (open)', def: 2, allowZero: true, check: intCheck('Ball valves') },
      { id: 'nCheck', half: true, label: 'Swing check valves', def: 1, allowZero: true, check: intCheck('Check valves') },
      { id: 'pumpEff', label: 'Pump wire-to-water efficiency', suffix: '%', def: 50, check: pctCheck('Pump efficiency', 0, 100),
        hint: 'Assumption: read it from your pump curve. Small submersible pumps are often 15–35% (rule of thumb, Pump &amp; Turnover calculator); larger centrifugal pumps are usually more efficient.' },
      { id: 'price', label: 'Electricity price', suffix: 'per kWh', def: 0.15, allowZero: true }
    ],
    compute: function (ctx) {
      const x = v(ctx), fl = R(ctx, 'flow'), inl = R(ctx, 'inlets');
      const r = {};
      const Q = fl.q / 1000;                                     // m³/s
      r.Q = Q;
      if (x.pipe === 'auto') {
        r.pipe = PVC40.filter(function (pp) { return Q / (Math.PI * pp.D * pp.D / 4) <= x.vPipe; })[0] || null;
        r.tooBig = !r.pipe && fin(Q);
        if (!r.pipe) r.pipe = PVC40[PVC40.length - 1];
      } else {
        r.pipe = PVC40.filter(function (pp) { return pp.id === x.pipe; })[0];
      }
      const D = r.pipe.D;
      const w = water(x.temp);
      r.V = Q / (Math.PI * D * D / 4);
      r.hv = r.V * r.V / (2 * GRAV);
      r.Re = r.V * D / w.nu;
      r.f = r.Re < 2000 ? 64 / r.Re : colebrook(r.Re, EPS_PVC / D);
      r.hf = r.f * (x.pipeLen / D) * r.hv;
      r.fT = craneFT(D);
      r.K = (x.n90 * FIT.n90 + x.nTee * FIT.nTee + x.nBall * FIT.nBall + x.nCheck * FIT.nCheck) * r.fT + K_ENT + K_EXIT;
      r.hm = r.K * r.hv;
      r.jet = inl.head;
      r.tdh = x.lift + r.hf + r.hm + x.extraHead + r.jet;
      r.pHyd = RHO_PUMP * GRAV * Q * r.tdh;
      r.pElec = r.pHyd / (x.pumpEff / 100);
      r.kWhDay = r.pElec * 24 / 1000;
      r.costYr = r.kWhDay * 365 * x.price;
      return r;
    },
    notices: function (ctx, r) {
      const m = [];
      if (r.tooBig) m.push('Even an 8″ pipe is faster than your target velocity at this flow. Use two or more return lines in parallel, or a larger pipe.');
      if (fin(r.V) && r.V > 10 * 0.3048) m.push('Velocity above 10 ft/s (3 m/s) risks damaging water hammer; use a larger pipe.');
      else if (fin(r.V) && (r.V < 2 * 0.3048 || r.V > 5 * 0.3048)) m.push('Pipe velocity ' + q('velocity', r.V, ['ftps'], 1) + ' is outside the common 2–5 ft/s band.');
      return m;
    },
    results: function (ctx, r) {
      return [
        { label: 'Pump duty', value: fin(r.tdh) ? q('flow', R(ctx, 'flow').q, ['m3ph', 'gpm'], 0) + ' at ' + q('length', r.tdh, ['m', 'ft'], 2) + ' head' : '–', main: true },
        { label: 'Return pipe', value: r.pipe ? r.pipe.name + ' Sch 40 PVC (ID ' + r.pipe.idIn.toFixed(3) + ' in)' : '–' },
        { label: 'Velocity in the pipe', value: fin(r.V) ? q('velocity', r.V, ['mps', 'ftps']) : '–' },
        { label: 'Pipe friction loss', value: fin(r.hf) ? fmt(r.hf, 3) + ' m' : '–' },
        { label: 'Fitting losses (ΣK = ' + fmt(r.K, 2) + ')', value: fin(r.hm) ? fmt(r.hm, 3) + ' m' : '–' },
        { label: 'Inlet jet head', value: fin(r.jet) ? fmt(r.jet, 3) + ' m' : '–' },
        { label: 'Total dynamic head', value: fin(r.tdh) ? q('length', r.tdh, ['m', 'ft'], 2) : '–' },
        { label: 'Hydraulic power', value: fin(r.pHyd) ? q('power', r.pHyd, ['W', 'hp']) : '–' },
        { label: 'Electrical power', value: fin(r.pElec) ? q('power', r.pElec, ['kW', 'hp']) : '–' },
        { label: 'Energy, running 24 h', value: fin(r.kWhDay) ? fmt(r.kWhDay, 1) + ' kWh/day · ' + fmt(r.costYr, 0) + ' per year' : '–' }
      ];
    },
    tips: [
      'Total dynamic head = static lift + pipe friction + fitting losses (+ equipment and inlet jets). Friction uses Darcy–Weisbach with Colebrook; fittings use Crane K = n × f<sub>T</sub>.',
      'A low-head, high-flow design saves energy: in RAS the pump runs 24 hours a day for the life of the farm, so a bigger pipe and fewer fittings often pay back quickly.',
      'Pick a pump whose best-efficiency point is near this duty, and check the duty against its curve.'
    ],
    viz: {
      viewBox: '0 0 480 220', label: 'Pump head split into static lift, friction, fittings, equipment and inlet jets',
      draw: function (svg, ctx, r) {
        const parts = [
          ['Static lift', ctx.v.lift, 'g-bar-muted'], ['Pipe friction', r.hf, 'g-bar-water'], ['Fittings', r.hm, 'g-bar'],
          ['Equipment', ctx.v.extraHead, 'g-bar-warn'], ['Inlet jets', r.jet, 'g-bar-soft']
        ];
        if (!fin(r.tdh) || r.tdh <= 0) return;
        const x0 = 40, w = 400, y = 40, hh = 34;
        let xx = x0;
        parts.forEach(function (pt) {
          if (!(pt[1] > 0)) return;
          const bw = pt[1] / r.tdh * w;
          G.el(svg, 'rect', { class: pt[2], x: xx, y: y, width: bw, height: hh });
          xx += bw;
        });
        G.el(svg, 'rect', { class: 'tank-line', x: x0, y: y, width: w, height: hh, fill: 'none' });
        text(svg, x0, y - 10, 'Total dynamic head ' + fmt(r.tdh, 2) + ' m', 'start', 'g-strong');
        parts.forEach(function (pt, i) {
          const ly = 110 + Math.floor(i / 2) * 26, lx = i % 2 ? 250 : 40;
          G.el(svg, 'rect', { class: pt[2], x: lx, y: ly - 11, width: 14, height: 12 });
          text(svg, lx + 20, ly, pt[0] + ' ' + (fin(pt[1]) ? fmt(pt[1], 2) + ' m' : '–'), 'start', 'g-label');
        });
      },
      caption: function (ctx, r) { return fin(r.pElec) ? q('power', r.pElec, ['kW']) + ' electrical at ' + fmt(ctx.v.pumpEff, 0) + '% efficiency' : 'Enter the inputs'; }
    },
    sources: ['astm1785', 'tenstates', 'clark828', 'crane2009', 'colebrook1939', 'munson2009', 'huber2009', 'nist811', 'te2010'],
    links: function (ctx, r) {
      const x = v(ctx), fl = R(ctx, 'flow'), t = R(ctx, 'tanks');
      const wvPipe = r.pipe && r.pipe.wv ? { pipe: '40:' + r.pipe.wv } : { pipe: 'custom', diam: r.pipe ? r.pipe.idIn : '', diam_u: 'in' };
      const wv = Object.assign({ mode: 'check', flow: p(fl.q * 3.6, 5), flow_u: 'm3ph', temp: p(x.temp, 4), temp_u: 'C',
        vmin: 2, vmin_u: 'ftps', vmax: 5, vmax_u: 'ftps', out: 'ftps' }, wvPipe);
      return [
        { slug: 'water-velocity', label: 'Pipe Water Velocity', params: wv },
        { slug: 'head-loss', label: 'Head Loss', params: {
          method: 'dw', pipe: r.pipe ? r.pipe.id : '', mat: 'pvc', flow: p(fl.q * 3.6, 5), flow_u: 'm3ph',
          len: p(x.pipeLen, 5), len_u: 'm', lift: p(x.lift + x.extraHead + (r.jet || 0), 5), lift_u: 'm', temp: p(x.temp, 4), temp_u: 'C',
          n90: x.n90, n45: 0, nteer: x.nTee, nteeb: 0, nball: x.nBall, ncheck: x.nCheck, nent: 1, nexit: 1, out: 'm', outp: 'kPa' } },
        { slug: 'pump-turnover', label: 'Pump & Turnover', params: {
          mode: 'check', volume: p(t.volTotal / 1000, 5), volume_u: 'm3', pumpflow: p(fl.q * 3.6, 5), pumpflow_u: 'm3ph',
          head: p(r.tdh, 4), head_u: 'm', eff: p(x.pumpEff, 4), hours: 24, price: p(x.price, 4) } }
      ];
    }
  };

  // ---------- 10. UV disinfection (optional) ----------
  function uvOn(ctx) { return ctx.v.uvOn === 'yes'; }
  const stepUV = {
    id: 'uv', title: 'UV disinfection (optional)', short: 'UV',
    intro: '<p>In a RAS every fish shares the same water, so a pathogen from one tank can reach all of them. A UV unit on the return line kills free-floating bacteria, viruses and parasite stages. This step sizes the UV-C lamp power for the dose your target organism needs.</p>',
    fields: [
      { id: 'uvOn', label: 'Include UV', type: 'select', def: 'yes', options: [{ value: 'yes', label: 'Yes, size a UV unit' }, { value: 'no', label: 'No UV' }] },
      { id: 'uvShare', label: 'Share of the flow treated', suffix: '%', def: 100, show: uvOn, check: pctCheck('Share treated', 0, 100),
        hint: 'Treating a side stream costs less but disinfects less of the water each pass.' },
      { id: 'uvOrg', label: 'Target', type: 'select', def: 'bact', show: uvOn,
        options: UV_ORGS.map(function (o) { return { value: o.id, label: o.name + ' – ' + o.dose + ' mJ/cm²' }; }) },
      { id: 'uvt', label: 'Water UV transmittance (UVT)', suffix: '%/cm', def: 80, show: uvOn, check: pctCheck('UVT', 0, 100),
        hint: 'Share of 254 nm light passing 1 cm of water; measure it. Clearer water needs less lamp power.' },
      { id: 'uvGap', label: 'Water gap, sleeve to housing', group: 'length', unit: 'cm', def: 0.02, show: uvOn },
      { id: 'uvEol', label: 'Lamp output at end of life', suffix: '%', def: 80, show: uvOn, check: pctCheck('Lamp output at end of life', 0, 100),
        hint: 'Low-pressure lamps lose about 20–25% by end of life (lamp maker data, UV Filtration Sizing calculator).' }
    ],
    compute: function (ctx) {
      const x = v(ctx), fl = R(ctx, 'flow');
      const r = { on: uvOn(ctx) };
      if (!r.on) return r;
      r.org = uvOrg(x.uvOrg);
      r.Q = fl.q * x.uvShare / 100;                    // L/s
      r.gCm = x.uvGap * 100;
      r.wf = waterFactor(x.uvt, r.gCm);
      r.uvcW = r.org.dose * r.Q * 1000 / (r.gCm * r.wf * x.uvEol / 100 * 1000);   // uv-sterilizer-sizing.js, method B
      return r;
    },
    results: function (ctx, r) {
      if (!r.on) return [{ label: 'UV', value: 'Not included', main: true }];
      return [
        { label: 'UV-C lamp output needed', value: fin(r.uvcW) ? fmt(r.uvcW, 0) + ' W UV-C' : '–', main: true },
        { label: 'Electrical lamp power (approx.)', value: fin(r.uvcW) ? fmt(r.uvcW / 0.4, 0) + '–' + fmt(r.uvcW / 0.3, 0) + ' W' : '–' },
        { label: 'Flow through the UV', value: flowTxt(r.Q) },
        { label: 'Target dose at end of lamp life', value: r.org.dose + ' mJ/cm²' },
        { label: 'Water factor', value: fin(r.wf) ? fmt(r.wf, 3) : '–' }
      ];
    },
    tips: [
      '30 mJ/cm² is a widely used design dose for bacterial fish pathogens; viruses and Ich need much more (UV Filtration Sizing calculator). Rule of thumb, not a guarantee.',
      'Put UV after the drum filter: particles shade organisms and absorb UV (Summerfelt, 2003).',
      'The lamp-watts estimate is a rough average-dose energy balance (Bolton &amp; Linden, 2003). Use the maker’s validated dose rating when you have one; electrical watts assume 30–40% UV-C conversion (US EPA, 2006).'
    ],
    viz: {
      viewBox: '0 0 480 200', label: 'UV-C lamp power needed and the electrical power it implies',
      draw: function (svg, ctx, r) {
        if (!r.on) { text(svg, 240, 100, 'No UV in this design', 'middle', 'g-label'); return; }
        G.el(svg, 'rect', { class: 'g-box', x: 40, y: 30, width: 400, height: 54, rx: 27 });
        G.el(svg, 'rect', { class: 'g-bar-soft', x: 70, y: 48, width: 340, height: 18, rx: 9 });
        text(svg, 240, 61, 'UV-C lamp', 'middle', 'g-accent-text');
        arrow(svg, 10, 57, 40, 57); arrow(svg, 440, 57, 470, 57);
        hbars(svg, [
          { label: 'UV-C', value: r.uvcW, text: fmt(r.uvcW, 0) + ' W', cls: 'g-bar' },
          { label: 'Electrical', value: r.uvcW / 0.3, text: fmt(r.uvcW / 0.4, 0) + '–' + fmt(r.uvcW / 0.3, 0) + ' W', cls: 'g-bar-muted' }
        ], { x0: 110, w: 330, y0: 112, gap: 36 });
      },
      caption: function (ctx, r) { return r.on && fin(r.uvcW) ? r.org.dose + ' mJ/cm² at ' + q('flow', r.Q, ['m3ph'], 0) + ', end of lamp life' : (r.on ? 'Enter the inputs' : 'UV skipped'); }
    },
    sources: ['summerfelt2003', 'bolton2003', 'epa2006uv', 'sharrer2005', 'knupp2023', 'liltved2006', 'gratzek1983', 'cfr141'],
    links: function (ctx, r) {
      const x = v(ctx);
      if (!r.on) return [];
      return [{ slug: 'uv-sterilizer-sizing', label: 'UV Filtration Sizing', params: {
        flowmode: 'flow', flow: p(r.Q * 3.6, 5), flow_u: 'm3ph', org: r.org.id, target: r.org.dose, uvt: p(x.uvt, 4),
        spec: 'lamp', lampw: fin(r.uvcW) ? Math.ceil(r.uvcW) : '', lampw_u: 'W', gap: p(r.gCm, 4), gap_u: 'cm', eol: p(x.uvEol, 4), out: 'm3ph' } }];
    }
  };

  // ---------- 11. Backup power ----------
  const stepBackup = {
    id: 'backup', title: 'Backup power and oxygen emergency', short: 'Backup',
    intro: '<p>A power cut is the most common way to lose a whole RAS. With no aeration, the fish use up the oxygen in the tanks in minutes. This step shows how fast that happens and sizes a battery bank to keep emergency aeration running until power returns or a generator starts.</p>',
    fields: [
      { id: 'fishO2', label: 'Fish oxygen use', suffix: 'mg O₂/kg/h', def: 500,
        hint: 'Adult fish usually use about 200–500 mg O₂ per kg per hour (Boyd, Global Seafood Alliance); 500 is the top of the range. Small and warm fish use more.' },
      { id: 'aerW', label: 'Emergency aeration power', group: 'power', unit: 'W',
        def: function (ctx) { return 110 * ctx.v.nTanks; },
        hint: 'Suggested: one 120 L/min linear air pump (about 110 W, Battery Life preset) per tank. Use your blower nameplate.' },
      { id: 'pumpBackup', label: 'Keep the main pump running on batteries', type: 'select', def: 'no',
        options: [{ value: 'no', label: 'No (aeration only)' }, { value: 'yes', label: 'Yes' }] },
      { id: 'otherW', label: 'Controller, alarm and router', group: 'power', unit: 'W', def: 10, allowZero: true },
      { id: 'backupH', label: 'Backup time needed', group: 'time', unit: 'h', def: 12 * 3600,
        hint: 'How long until power is back or a generator takes over.' },
      { id: 'chem', label: 'Battery type', type: 'select', def: 'agm',
        options: Object.keys(CHEM).map(function (k) { return { value: k, label: CHEM[k].name }; }) },
      { id: 'batAh', half: true, label: 'Capacity per battery', suffix: 'Ah', def: 100 },
      { id: 'batV', half: true, label: 'Battery voltage', suffix: 'V', def: 12 },
      { id: 'dod', label: 'Usable depth of discharge', suffix: '%', def: function (ctx) { return CHEM[ctx.v.chem].dod; }, check: pctCheck('Depth of discharge', 0, 100),
        hint: 'Rule of thumb: about 50% for lead-acid; 80% is conservative for LiFePO4.' },
      { id: 'invEff', label: 'Inverter efficiency', suffix: '%', def: 85, check: pctCheck('Inverter efficiency', 0, 100) }
    ],
    compute: function (ctx) {
      const x = v(ctx), f = R(ctx, 'feed'), t = R(ctx, 'tanks'), o = R(ctx, 'oxygen'), pm = R(ctx, 'pump'), uv = R(ctx, 'uv');
      const r = {};
      r.o2h = f.biomass * x.fishO2 / 1e6;                          // kg/h
      const usable = t.volTotal * (o.csat - x.doMin) / 1e6;        // kg O₂ between saturation and minimum
      r.tMin = usable / r.o2h;                                    // h
      r.tZero = t.volTotal * o.csat / 1e6 / r.o2h;
      r.pumpW = x.pumpBackup === 'yes' ? pm.pElec : 0;
      r.pAvg = x.aerW + x.otherW + r.pumpW;
      r.pBat = r.pAvg / (x.invEff / 100);
      const ch = CHEM[x.chem];
      const m = { pBat: r.pBat, V: x.batV, C: x.batAh, dod: x.dod / 100, k: ch.k, ratedI: x.batAh / RATE_H };
      r.need = null;
      if (fin(r.pBat) && r.pBat > 0 && x.batV > 0 && x.batAh > 0 && m.dod > 0) {
        for (let n = 1; n <= 500; n++) { const tt = runtimeFor(n, m); if (tt * 3600 >= x.backupH - 1e-6) { r.need = n; r.needT = tt; break; } }
      }
      r.k = ch.k;
      r.running = pm.pElec + (uv.on && fin(uv.uvcW) ? uv.uvcW / 0.35 : 0) + x.otherW;
      return r;
    },
    notices: function (ctx, r) {
      return [r.need === null && fin(r.pBat) ? 'More than 500 batteries would be needed; use a generator for the main load.' : ''];
    },
    results: function (ctx, r) {
      const x = v(ctx);
      return [
        { label: 'Batteries for the backup time', value: r.need ? r.need + ' × ' + fmt(x.batV) + ' V ' + fmt(x.batAh) + ' Ah in parallel (' + hm(r.needT) + ')' : '–', main: true },
        { label: 'Oxygen the fish use', value: fin(r.o2h) ? fmt(r.o2h, 2) + ' kg O₂/h' : '–' },
        { label: 'No aeration: DO falls to the minimum in', value: fin(r.tMin) ? hm(r.tMin) : '–' },
        { label: 'No aeration: DO reaches zero in', value: fin(r.tZero) ? hm(r.tZero) : '–' },
        { label: 'Load on the batteries', value: fin(r.pBat) ? fmt(r.pBat, 0) + ' W (incl. inverter loss)' : '–' },
        { label: 'Bank energy', value: r.need ? fmt(r.need * x.batV * x.batAh / 1000, 1) + ' kWh nominal' : '–' },
        { label: 'Normal running load (pump, UV, controls)', value: fin(r.running) ? q('power', r.running, ['kW']) + ' (generator: size above this plus motor starting surge)' : '–' }
      ];
    },
    tips: [
      'Every RAS needs an alarm, a backup air or oxygen supply and a written plan for power failures (Masser et al., 1999, SRAC 452).',
      'The time to reach the minimum DO is why intensive systems keep pure oxygen on a fail-safe valve that opens when power is lost.',
      'Battery runtime here uses the Battery Life method: usable energy × Peukert correction ÷ load. Lead-acid capacity drops at high discharge rates.'
    ],
    viz: {
      viewBox: '0 0 480 230', label: 'Dissolved oxygen falling after a power cut with no aeration',
      draw: function (svg, ctx, r) {
        const o = R(ctx, 'oxygen'), x = v(ctx);
        if (!fin(r.tZero) || !fin(o.csat)) return;
        const x0 = 50, x1 = 450, y0 = 30, y1 = 180;
        const tMax = r.tZero * 60 * 1.1;                     // minutes
        const X = function (m) { return x0 + m / tMax * (x1 - x0); };
        const Y = function (d) { return y1 - d / (o.csat * 1.1) * (y1 - y0); };
        G.el(svg, 'path', { class: 'dim', d: 'M' + x0 + ',' + y0 + ' L' + x0 + ',' + y1 + ' L' + x1 + ',' + y1 });
        G.el(svg, 'line', { class: 'g-line-warn', x1: x0, y1: Y(x.doMin), x2: x1, y2: Y(x.doMin) });
        text(svg, x1, Y(x.doMin) - 6, 'minimum ' + fmt(x.doMin, 1) + ' mg/L', 'end', 'g-warn-text');
        G.el(svg, 'line', { class: 'g-line-accent', x1: X(0), y1: Y(o.csat), x2: X(r.tZero * 60), y2: Y(0) });
        G.el(svg, 'circle', { class: 'g-bar', cx: X(r.tMin * 60), cy: Y(x.doMin), r: 5 });
        text(svg, X(r.tMin * 60) + 12, Y(x.doMin) - 10, hm(r.tMin), 'start', 'g-strong');
        text(svg, x0 - 6, Y(o.csat) + 4, fmt(o.csat, 1), 'end');
        text(svg, x0 - 6, y1, '0', 'end');
        text(svg, x1, y1 + 18, fmt(tMax, 0) + ' min', 'end');
        text(svg, x0, y1 + 18, '0', 'start');
        text(svg, 250, 222, 'Minutes after the power cut (no aeration, full biomass)', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.tMin) ? 'Without aeration the tanks reach the minimum DO in about ' + hm(r.tMin) : 'Enter the inputs'; }
    },
    sources: ['boydresp', 'masser1999', 'bu501', 'peukert1897', 'victron', 'ieee485'],
    links: function (ctx, r) {
      const x = v(ctx), pm = R(ctx, 'pump');
      const loads = [['Emergency aeration', x.aerW], ['Controller / alarm / router', x.otherW]];
      if (x.pumpBackup === 'yes') loads.push(['Circulation pump', pm.pElec]);
      const prm = { chem: x.chem, cap: p(x.batAh, 5), volt: p(x.batV, 4), count: r.need || 1, wiring: 'parallel', dod: p(x.dod, 4), health: 100,
        path: 'ac', eff: p(x.invEff, 4), idle: 0, idle_u: 'W', target: p(x.backupH / 3600, 4), target_u: 'h', peuk: r.k, rateh: RATE_H, rateh_u: 'h', n: loads.length };
      loads.forEach(function (l, i) { prm['ln' + i] = l[0]; prm['lp' + i] = p(l[1], 5); prm['lp' + i + '_u'] = 'W'; prm['lq' + i] = 1; prm['ld' + i] = 100; });
      return [{ slug: 'battery-life', label: 'Battery Life', params: prm }];
    }
  };

  // ---------- 12. Sump drain-back ----------
  const stepSump = {
    id: 'sump', title: 'Sump drain-back check', short: 'Sump',
    intro: '<p>When the pump stops, the water standing above the tank overflows and in the return line drains back to the sump. If the sump cannot hold it, it overflows onto the floor. This step checks the sump has room.</p>',
    fields: [
      { id: 'overHead', label: 'Water above the tank overflow', group: 'length', unit: 'cm', def: 0.02,
        hint: 'Height of the running water surface above the overflow lip or standpipe; usually about 1–3 cm. Measure it.' },
      { id: 'otherDrain', label: 'Other drain-back (filters, sumps)', group: 'volume', unit: 'L', def: 0, allowZero: true,
        hint: 'Water in the drum filter, biofilter or other parts that drains to the sump when the pump stops.' },
      { id: 'sumpL', half: true, label: 'Sump length', group: 'length', unit: 'm', def: 3 },
      { id: 'sumpW', half: true, label: 'Sump width', group: 'length', unit: 'm', def: 1.5 },
      { id: 'sumpH', half: true, label: 'Sump depth to rim', group: 'length', unit: 'm', def: 1.2 },
      { id: 'sumpRun', half: true, label: 'Sump water depth while running', group: 'length', unit: 'm', def: 0.5 },
      { id: 'margin', label: 'Safety margin', suffix: '%', def: 25, allowZero: true, hint: 'Rule of thumb: 20–25% extra.' }
    ],
    compute: function (ctx) {
      const x = v(ctx), t = R(ctx, 'tanks'), pm = R(ctx, 'pump');
      const r = {};
      r.tanksL = t.area * x.overHead * x.nTanks * 1000;
      r.pipeL = pm.pipe ? Math.PI * pm.pipe.D * pm.pipe.D / 4 * x.pipeLen * 1000 : NaN;
      r.total = r.tanksL + r.pipeL + x.otherDrain;
      const A = x.sumpL * x.sumpW;
      r.free = A * (x.sumpH - x.sumpRun) * 1000;
      r.need = r.total * (1 + x.margin / 100);
      r.after = x.sumpRun + r.total / (A * 1000);
      r.status = r.total > r.free ? 'bad' : r.need > r.free ? 'warn' : 'ok';
      r.runOk = x.sumpRun < x.sumpH;
      return r;
    },
    notices: function (ctx, r) {
      if (!r.runOk) return ['The running water depth is at or above the sump rim.'];
      if (r.status === 'bad') return ['The sump overflows when the pump stops: it has ' + fmt(r.free, 0) + ' L free but ' + fmt(r.total, 0) + ' L drains back. Use a bigger sump, run it lower, or reduce the water above the overflows.'];
      if (r.status === 'warn') return ['The drain-back fits, but without the ' + fmt(ctx.v.margin, 0) + '% safety margin.'];
      return [];
    },
    results: function (ctx, r) {
      return [
        { label: 'Water that drains back', value: volTxt(r.total), main: true },
        { label: 'From the tank overflows', value: volTxt(r.tanksL) },
        { label: 'From the return line', value: volTxt(r.pipeL) },
        { label: 'Free sump capacity', value: volTxt(r.free) },
        { label: 'Needed with margin', value: volTxt(r.need) },
        { label: 'Sump level after the pump stops', value: fin(r.after) ? fmt(r.after, 2) + ' m of ' + fmt(ctx.v.sumpH, 2) + ' m' : '–' },
        { label: 'Result', value: !r.runOk ? '–' : r.status === 'ok' ? 'Fits, with margin' : r.status === 'warn' ? 'Fits, below margin' : 'Overflows' }
      ];
    },
    tips: [
      'Only the water above the overflow lip drains from a tank with a standpipe; the rest stays in the tank (Sump Drain-Back calculator).',
      'A return line that ends below the tank water surface can back-siphon the tank into the sump. Drill a siphon-break hole just under the surface.',
      'Leave 20–25% spare sump volume, and set float switches so the pump cannot run the sump dry.'
    ],
    viz: {
      viewBox: '0 0 480 220', label: 'Side view of the sump with the running level and the level after drain-back',
      draw: function (svg, ctx, r) {
        const x = v(ctx);
        if (!(x.sumpH > 0)) return;
        const x0 = 60, w = 240, y0 = 30, hgt = 150;
        const Y = function (d) { return y0 + hgt - Math.min(d, x.sumpH * 1.15) / x.sumpH * hgt; };
        G.el(svg, 'rect', { class: 'water', x: x0, y: Y(x.sumpRun), width: w, height: Y(0) - Y(x.sumpRun) });
        if (fin(r.after)) {
          const top = Math.max(y0 - 12, Y(r.after));
          G.el(svg, 'rect', { class: r.status === 'bad' ? 'g-bar-warn' : 'g-bar-soft', x: x0, y: top, width: w, height: Y(x.sumpRun) - top });
        }
        G.el(svg, 'path', { class: 'tank-line', d: 'M' + x0 + ',' + y0 + ' L' + x0 + ',' + (y0 + hgt) + ' L' + (x0 + w) + ',' + (y0 + hgt) + ' L' + (x0 + w) + ',' + y0 });
        text(svg, x0 + w + 10, Y(x.sumpRun) + 4, 'running ' + fmt(x.sumpRun, 2) + ' m', 'start', 'g-label');
        if (fin(r.after)) text(svg, x0 + w + 10, Math.max(y0 + 2, Y(r.after)) + 4, 'after stop ' + fmt(r.after, 2) + ' m', 'start', r.status === 'bad' ? 'g-warn-text' : 'g-accent-text');
        text(svg, x0 + w + 10, y0 + 4, 'rim ' + fmt(x.sumpH, 2) + ' m', 'start', 'dim-text');
        text(svg, x0 + w / 2, y0 + hgt + 22, 'Sump ' + fmt(x.sumpL, 2) + ' × ' + fmt(x.sumpW, 2) + ' m', 'middle', 'dim-text');
      },
      caption: function (ctx, r) { return fin(r.total) ? volTxt(r.total) + ' drains back · ' + volTxt(r.free) + ' free' : 'Enter the inputs'; }
    },
    sources: ['masser1999', 'usbrwmm', 'astm1785', 'white2011', 'fao589'],
    links: function (ctx, r) {
      const x = v(ctx), pm = R(ctx, 'pump');
      const prm = { sshape: 'rect', slen: p(x.sumpL, 5), slen_u: 'm', swid: p(x.sumpW, 5), swid_u: 'm', sdepth: p(x.sumpH, 5), sdepth_u: 'm',
        srun: p(x.sumpRun, 5), srun_u: 'm', smargin: p(x.margin, 4), out: 'L',
        t0: 'tank', n0: 'Fish tanks (over overflow)', sh0: 'round', d0: p(x.tankD, 5), d0_u: 'm', h0: p(x.overHead * 100, 4), h0_u: 'cm', q0: x.nTanks,
        t1: 'pipe', n1: 'Return line', l1: p(x.pipeLen, 5), l1_u: 'm', q1: 1 };
      if (pm.pipe && pm.pipe.wv) prm.s1 = pm.pipe.wv; else { prm.s1 = 'custom'; prm.d1 = pm.pipe ? pm.pipe.idIn : ''; prm.d1_u = 'in'; }
      let n = 2;
      if (x.otherDrain > 0) { prm.t2 = 'other'; prm.n2 = 'Filters and other'; prm.v2 = p(x.otherDrain, 5); prm.v2_u = 'L'; prm.q2 = 1; n = 3; }
      prm.ns = n;
      return [{ slug: 'sump-drainback', label: 'Sump Drain-Back', params: prm }];
    }
  };

  // ---------- 13. Summary ----------
  const stepSummary = {
    id: 'summary', type: 'summary', title: 'Design sheet', short: 'Summary',
    intro: '<p>Every decision and number from the walkthrough, in one place. Use <strong>Edit</strong> to go back to any step; later steps update automatically. Copy, share or print the sheet, or keep the link to resume later.</p>',
    viz: {
      viewBox: '0 0 480 250', label: 'Process loop: tanks, drum filter, biofilter, sump, pump, UV and back to the tanks',
      draw: function (svg, ctx) {
        const t = R(ctx, 'tanks'), fl = R(ctx, 'flow'), d = R(ctx, 'solids'), b = R(ctx, 'biofilter'), pm = R(ctx, 'pump'), uv = R(ctx, 'uv'), o = R(ctx, 'oxygen');
        const boxes = [
          [20, 20, 'Fish tanks', fmt(ctx.v.nTanks, 0) + ' × ' + fmt(ctx.v.tankD, 1) + ' m Ø'],
          [175, 20, 'Drum filter', fin(d.Areq) ? fmt(d.Areq, 1) + ' m² screen' : '–'],
          [330, 20, 'Biofilter', fin(b.mediaL) ? fmt(b.mediaL / 1000, 1) + ' m³ media' : '–'],
          [330, 160, 'Sump', fin(ctx.v.sumpL) ? fmt(ctx.v.sumpL * ctx.v.sumpW * ctx.v.sumpH, 1) + ' m³' : '–'],
          [175, 160, 'Pump', fin(pm.tdh) ? fmt(fl.q * 3.6, 0) + ' m³/h @ ' + fmt(pm.tdh, 1) + ' m' : '–'],
          [20, 160, uv.on ? 'UV + oxygen' : 'Oxygen', uv.on && fin(uv.uvcW) ? fmt(uv.uvcW, 0) + ' W UV-C' : (fin(o.o2Day) ? fmt(o.o2Day, 0) + ' kg O₂/day' : ''), uv.on && fin(o.o2Day) ? fmt(o.o2Day, 0) + ' kg O₂/day' : '']
        ];
        boxes.forEach(function (bx, i) {
          G.el(svg, 'rect', { class: i === 0 ? 'g-box-accent' : 'g-box', x: bx[0], y: bx[1], width: 130, height: 64, rx: 10 });
          text(svg, bx[0] + 65, bx[1] + (bx[4] ? 22 : 26), bx[2], 'middle', 'g-strong');
          text(svg, bx[0] + 65, bx[1] + (bx[4] ? 40 : 46), bx[3], 'middle', 'dim-text');
          if (bx[4]) text(svg, bx[0] + 65, bx[1] + 56, bx[4], 'middle', 'dim-text');
        });
        arrow(svg, 150, 52, 173, 52); arrow(svg, 305, 52, 328, 52); arrow(svg, 395, 84, 395, 158);
        arrow(svg, 330, 192, 307, 192); arrow(svg, 175, 192, 152, 192); arrow(svg, 85, 160, 85, 86);
        text(svg, 240, 128, fin(fl.q) ? 'Design flow ' + q('flow', fl.q, ['m3ph', 'gpm'], 0) : '', 'middle', 'g-accent-text');
        text(svg, 240, 146, fin(t.volTotal) ? 'Culture volume ' + q('volume', t.volTotal, ['m3'], 1) : '', 'middle', 'dim-text');
      },
      caption: function () { return 'The water loop this design sizes'; }
    },
    after: '<p><strong>Comparing options?</strong> Use the <a href="../calculators/cost-benefit.html">Cost Benefit Analysis calculator</a> to weigh, for example, pure oxygen against a larger flow, or a bigger pipe against the pump’s lifetime energy cost (energy figures are on the pump step).</p>' +
      '<p>These are first-pass engineering estimates from published rules of thumb. Check them against equipment data and an experienced RAS designer before you build.</p>'
  };

  G.create({
    root: 'guide',
    sourcesList: 'guide-sources',
    title: 'Engineer a recirculating aquaculture system (RAS)',
    calcBase: '../calculators/',
    sources: SOURCES,
    steps: [stepGoals, stepFeed, stepTanks, stepOxygen, stepBio, stepFlow, stepDrum, stepInlets, stepPump, stepUV, stepBackup, stepSump, stepSummary]
  });
})();
