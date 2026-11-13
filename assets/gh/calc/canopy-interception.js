
(function () {
  'use strict';
  var S = GFC.svgns;

  /* Extinction coefficients of black leaves, which depend only on mean leaf
   * inclination. Leaves are effectively black in the thermal infrared, so these
   * apply to long-wave; in other wavebands k is smaller in proportion to how
   * much the leaves reflect and transmit. */
  var KS = [
    { v: 0.70, label: 'Tomato, PAR working value (0.64–0.70)' },
    { v: 0.61, label: 'Cucumber, PAR working value' },
    { v: 1.00, label: 'Black leaves, horizontal' },
    { v: 0.83, label: 'Black leaves, conical 45°' },
    { v: 0.68, label: 'Black leaves, spherical' },
    { v: 0.54, label: 'Black leaves, conical 60°' },
    { v: 0.40, label: 'Black leaves, vertical' }
  ];

  GFC.mount({
    slug: 'canopy-interception',
    kicker: 'Lighting',
    name: 'Canopy interception, growth and fresh yield',
    lede: 'The canopy is a turbid medium with leaf area index in the role of thickness. This '
        + 'gives the fraction of light intercepted, the dry matter that light buys, and the '
        + 'fresh yield that follows — including the two terms whose direction surprises people.',
    inputNote: 'Light use efficiency is per MJ of PAR. A radiation use efficiency of 2 g per MJ '
             + 'of global radiation is a light use efficiency of 4 g per MJ of PAR.',

    inputs: [
      { id: 'lai', label: 'Leaf area index', unit: 'm² m⁻²', value: 3.0, step: 0.1, min: 0.1, max: 8 },
      { id: 'k', label: 'Extinction coefficient', unit: '–', value: 0.70, type: 'select',
        options: KS.map(function (q) { return { v: q.v, label: q.label }; }),
        help: 'Specific to crop, training system and plant density rather than to the species. Leaves reflect about 50 % of near infrared and about 5 % of PAR, so NIR penetrates deeper than PAR.' },
      { id: 'global', label: 'Daily global radiation outside', unit: 'MJ m⁻² d⁻¹', value: 12, step: 0.5, min: 0.5, max: 35 },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.70, step: 0.01, min: 0.2, max: 0.95 },
      { id: 'parfrac', label: 'PAR fraction of global radiation', unit: '–', value: 0.50, step: 0.01, min: 0.3, max: 0.6 },
      { id: 'lue', label: 'Light use efficiency', unit: 'g per MJ PAR', value: 3.5, step: 0.1, min: 0.5, max: 8,
        group: 'Growth',
        help: 'The slope of cumulative dry weight against cumulative intercepted light. A lumped parameter over photosynthesis and respiration: CO₂ enrichment raises it, and it is higher in winter than in summer because in summer some leaves are light-saturated.' },
      { id: 'days', label: 'Cycle length', unit: 'd', value: 100, step: 1, min: 1, max: 400 },
      { id: 'hi', label: 'Harvest index', unit: '–', value: 0.70, step: 0.01, min: 0.1, max: 0.95,
        group: 'Yield',
        help: 'Fraction of total plant dry mass in the harvested organ.' },
      { id: 'dmc', label: 'Dry matter content of the product', unit: '–', value: 0.035, step: 0.005, min: 0.01, max: 0.3,
        help: 'Fruit near 0.035, leafy greens near 0.05. A higher dry matter content LOWERS fresh yield, because there is less dilution with water.' }
    ],

    compute: function (v) {
      var lai = GFC.need(v.lai, 'Leaf area index', { positive: true });
      var k = GFC.need(v.k, 'Extinction coefficient', { positive: true });
      var global = GFC.need(v.global, 'Daily global radiation', { positive: true });
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var parFrac = GFC.need(v.parfrac, 'PAR fraction', { positive: true });
      var lue = GFC.need(v.lue, 'Light use efficiency', { positive: true });
      var days = GFC.need(v.days, 'Cycle length', { positive: true });
      var hi = GFC.need(v.hi, 'Harvest index', { positive: true, max: 0.95 });
      var dmc = GFC.need(v.dmc, 'Dry matter content', { positive: true, max: 0.3 });

      var parTop = global * parFrac * tau;        /* MJ m-2 d-1 PAR at the top of the crop */
      var intercepted = 1 - Math.exp(-k * lai);
      var soilCover = intercepted;                /* the same quantity for black leaves */
      var transmittedToFloor = Math.exp(-k * lai);
      var parAbsorbed = parTop * intercepted;
      var growth = parAbsorbed * lue;             /* g m-2 d-1 dry matter */
      var totalDry = growth * days;               /* g m-2 */
      var dryYield = totalDry * hi;
      var freshYield = dryYield / dmc / 1000;     /* kg m-2 */
      var ppfdEquiv = 2 * global * 1e6 / 86400;   /* rough daily-mean PPFD, for scale */

      var flags = [];
      if (lai < 0.6) flags.push({ head: 'Low leaf area index.',
        text: 'At LAI ' + GFC.fixed(lai, 1) + ' a low extinction coefficient is unfavourable, because deeper penetration means light reaching the floor instead of a leaf: ' + GFC.pct(transmittedToFloor, 0) + ' of the PAR is passing the canopy.' });
      else if (transmittedToFloor > 0.2) flags.push({ head: GFC.pct(transmittedToFloor, 0) + ' of the light reaches the floor.',
        text: 'That is light bought and not intercepted. With many leaf layers a low extinction coefficient is favourable instead, because light reaches lower leaves still on the linear part of their response curve.' });
      if (hi > 0.8) flags.push({ head: 'Harvest index above 0.8.',
        text: 'A higher harvest index does not automatically raise yield: more partitioning to the harvested organ means less to leaves, hence lower leaf area index, lower interception and lower total growth. That feedback is not modelled here.' });
      flags.push({ head: 'Light use efficiency is per MJ of PAR here.',
        text: 'Since 1 MJ of global radiation is about 0.5 MJ of PAR, a radiation use efficiency of 2 g per MJ global is a light use efficiency of 4 g per MJ PAR. The two are not interchangeable.' });

      return {
        headline: [
          { label: 'Light intercepted', value: GFC.pct(intercepted, 1), unit: '',
            hint: '1 − e^(−k·LAI) at k = ' + GFC.fixed(k, 2) },
          { label: 'Growth rate', value: GFC.fixed(growth, 1), unit: 'g m⁻² d⁻¹',
            hint: 'Dry matter' },
          { label: 'Fresh yield', value: GFC.fixed(freshYield, 1), unit: 'kg m⁻²',
            hint: 'Over ' + GFC.fixed(days, 0) + ' days' },
          { label: 'PAR at the top of the crop', value: GFC.fixed(parTop, 2), unit: 'MJ m⁻² d⁻¹',
            hint: 'Global × PAR fraction × τ' }
        ],
        flags: flags,
        rows: [
          { label: 'PAR outside', value: GFC.fixed(global * parFrac, 2), unit: 'MJ m⁻² d⁻¹', note: 'Global × PAR fraction' },
          { label: 'PAR at the top of the crop', value: GFC.fixed(parTop, 3), unit: 'MJ m⁻² d⁻¹', note: '× whole-greenhouse transmissivity' },
          { label: 'Fraction intercepted', value: GFC.fixed(intercepted, 4), unit: '–', note: '1 − e^(−k LAI); equals soil cover for black leaves' },
          { label: 'Fraction reaching the floor', value: GFC.fixed(transmittedToFloor, 4), unit: '–', note: 'e^(−k LAI)' },
          { label: 'Soil cover', value: GFC.pct(soilCover, 1), unit: '', note: 'The same quantity, stated as ground shaded' },
          { label: 'PAR absorbed by the canopy', value: GFC.fixed(parAbsorbed, 3), unit: 'MJ m⁻² d⁻¹', note: 'Top-of-crop PAR × interception' },
          { label: 'Crop growth rate', value: GFC.fixed(growth, 2), unit: 'g m⁻² d⁻¹', note: 'Absorbed PAR × light use efficiency' },
          { label: 'Total plant dry mass', value: GFC.fixed(totalDry, 0), unit: 'g m⁻²', note: 'Over the cycle, at a constant rate' },
          { label: 'Dry yield of the harvested organ', value: GFC.fixed(dryYield, 0), unit: 'g m⁻²', note: '× harvest index' },
          { label: 'Fresh yield', value: GFC.fixed(freshYield, 2), unit: 'kg m⁻²', note: 'Dry yield ÷ dry matter content' },
          { label: 'Fresh yield per day', value: GFC.fixed(freshYield / days * 1000, 1), unit: 'g m⁻² d⁻¹', note: 'Averaged over the cycle' },
          { label: 'Daily-mean PPFD outside, for scale', value: GFC.fixed(ppfdEquiv, 0), unit: 'µmol m⁻² s⁻¹', note: 'Global radiation at the factor of 2, averaged over 24 h' }
        ],
        caption: 'Interception against leaf area index. The curve saturates, so the last units of '
               + 'leaf area buy very little extra light, which is why the marked operating point '
               + 'matters more than the asymptote.',
        _v: { lai: lai, k: k, intercepted: intercepted }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 330, L = 60, T = 14, PW = W - L - 28, PH = H - T - 72;
      var sx = S.scale(0, 8, L, L + PW);
      var sy = S.scale(0, 1, T + PH, T);
      var g = S.open(W, H, 'Fraction of light intercepted against leaf area index');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: 8, yMin: 0, yMax: 1,
        xTicks: 8, yTicks: 5, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 1); },
        xLabel: 'Leaf area index (m² m⁻²)',
        yLabel: 'Fraction of light intercepted'
      });
      /* the chosen k in front, two reference inclinations behind it */
      [[0.40, pal.line, '3 3', 'vertical leaves, k 0.40'],
       [1.00, pal.line, '3 3', 'horizontal leaves, k 1.00'],
       [st.k, pal.accent, null, 'k ' + GFC.fixed(st.k, 2)]].forEach(function (row) {
        var d = '', x, first = true;
        for (x = 0; x <= 8.001; x += 0.05) {
          d += (first ? 'M' : 'L') + sx(x).toFixed(1) + ' ' + sy(1 - Math.exp(-row[0] * x)).toFixed(1);
          first = false;
        }
        g += S.path(d, row[1], row[1] === pal.accent ? 2.4 : 1.2, null, row[2]);
      });
      var px = sx(Math.min(st.lai, 8)), py = sy(st.intercepted);
      g += S.line(L, py, px, py, pal.accent, 1, '2 3');
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py + 4, GFC.pct(st.intercepted, 0) + ' at LAI ' + GFC.fixed(st.lai, 1),
        { size: 11, fill: pal.ink, weight: 600 });
      g += S.legend(L, H - 10, [
        { label: 'this canopy', colour: pal.accent, dash: null },
        { label: 'vertical and horizontal leaves', colour: pal.line, dash: '3 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'The canopy attenuates light exactly as a cover does, with leaf area index in the '
            + 'role of thickness:',
        math: 'I<sub>below</sub> / I<sub>top</sub> = e<sup>−k LAI</sup>, &nbsp;&nbsp; '
            + 'fraction intercepted = soil cover = 1 − e<sup>−k<sub>black</sub> LAI</sup>',
        note: 'The extinction coefficient of black leaves depends only on their mean inclination: '
            + '1.0 horizontal, 0.68 spherical, 0.40 vertical.' },
      { lead: 'Growth is intercepted light times a light use efficiency:',
        math: 'growth rate = I<sub>top</sub> (1 − e<sup>−k LAI</sup>) × LUE',
        note: 'LUE is the slope of cumulative dry weight against cumulative intercepted light, in '
            + 'g per MJ. It is a lumped parameter over photosynthesis and respiration.' },
      { lead: 'Yield from dry mass:',
        math: 'dry yield = total plant dry mass × HI, &nbsp;&nbsp; fresh yield = dry yield / DMC',
        note: 'Two terms run counter to intuition. A higher fruit dry matter content LOWERS fresh '
            + 'yield, because there is less dilution with water. And a higher harvest index does '
            + 'not automatically raise yield, because more partitioning to the harvested organ '
            + 'means less to leaves, hence lower leaf area index and lower interception.' }
    ],

    caveats: [
      'The extinction coefficient is specific to crop, training system and plant density rather '
        + 'than to the species. Whether a low value is good depends on crop stage: with many leaf '
        + 'layers it is favourable, and early in the crop it is unfavourable.',
      'Growth here runs at a constant rate over the cycle. A real crop builds its leaf area, so '
        + 'interception rises through the cycle and the early days contribute far less than this '
        + 'average implies.',
      'Light use efficiency is higher in winter than in summer, because in summer some leaves are '
        + 'light-saturated and extra light yields no extra dry matter. One annual value will '
        + 'over-state a summer cycle and under-state a winter one.'
    ],

    sources: ['ross1981', 'marcelis2006', 'stanghellini2019', 'stanghellini1987', 'katsoulas2019', 'sanchezguerrero2009'],
    provenance: 'Sections 5.1 and 5.3 of "Greenhouse parameters and equations". The defaults are '
              + 'that section’s worked cucumber cycle, which gives 12.9 g m⁻² d⁻¹ and 25.8 kg m⁻².'
  });
}());

