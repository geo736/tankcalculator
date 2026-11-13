
(function () {
  'use strict';
  var S = GFC.svgns;

  /* Closed-loop sodium ceilings and salinity yield decrements, with the crop
   * uptake fractions for sodium and chloride. */
  var CROPS = [
    { k: 'tomato',     label: 'Tomato',        naMax: 8, syd: 4.5, pNa: 0.062, pCl: 0.075 },
    { k: 'pepper',     label: 'Sweet pepper',  naMax: 6, syd: 7.5, pNa: 0.025, pCl: 0.055 },
    { k: 'cucumber',   label: 'Cucumber',      naMax: 6, syd: 7.5, pNa: 0.098, pCl: 0.135 },
    { k: 'lettuce',    label: 'Lettuce',       naMax: 5, syd: 12.0, pNa: 0.05, pCl: 0.05 },
    { k: 'strawberry', label: 'Strawberry',    naMax: 3, syd: 12.0, pNa: 0.05, pCl: 0.05 },
    { k: 'rose',       label: 'Rose',          naMax: 4, syd: 7.5, pNa: 0.001, pCl: 0.001 },
    { k: 'gerbera',    label: 'Gerbera',       naMax: 4, syd: 7.5, pNa: 0.074, pCl: 0.189 },
    { k: 'carnation',  label: 'Carnation',     naMax: 4, syd: 3.0, pNa: 0.029, pCl: 0.042 }
  ];

  GFC.mount({
    slug: 'salt-accumulation',
    kicker: 'Hydroponics',
    name: 'Salt accumulation and leaching in a closed loop',
    lede: 'Water leaving a closed system as transpiration and as biomass carries no salt, but is '
        + 'replaced by water that does. Non-nutrient ions therefore accumulate, and it is '
        + 'cumulative water uptake, not time, that drives it.',
    inputNote: 'The leaching ratio is dimensionless, so it holds whether concentrations are in '
             + 'mmol per litre or as electrical conductivity.',

    inputs: [
      { id: 'crop', label: 'Crop', unit: '', value: 'tomato', type: 'select',
        options: CROPS.map(function (c) { return { v: c.k, label: c.label }; }) },
      { id: 'cin', label: 'Sodium in the refill water', unit: 'mmol L⁻¹', value: 0.5, step: 0.1, min: 0.01, max: 20,
        help: 'The single number that decides everything here. Sodium and chloride in the irrigation water must be counted in; they come from the water, the medium or the fertilisers and none of them is essential.' },
      { id: 'volume', label: 'Water volume in the system', unit: 'L m⁻²', value: 30, step: 1, min: 1, max: 300,
        help: 'Substrate water plus tanks and pipework, per square metre of crop. A small volume reaches the ceiling faster but discharges less each time.' },
      { id: 'cmax', label: 'Discharge ceiling', unit: 'mmol L⁻¹', value: 0, step: 0.5, min: 0, max: 40,
        help: 'Leave at zero to use the crop’s own closed-loop sodium maximum.' },
      { id: 'uptake', label: 'Crop water uptake', unit: 'L m⁻² y⁻¹', value: 850, step: 10, min: 10, max: 3000,
        help: 'A Dutch tomato crop takes up about 850 L m⁻² a year and a rose crop about 1 000.' },
      { id: 'useP', label: 'Crop uptake of sodium', unit: '', value: 1, type: 'select',
        options: [{ v: 1, label: 'Credit the crop’s own sodium uptake' },
                  { v: 0, label: 'Ignore it (the diverging case)' }],
        help: 'With any uptake at all the concentration saturates rather than diverging, so ignoring it over-states the water use needed.' },

      { id: 'ecbase', label: 'Base electrical conductivity of the solution', unit: 'dS m⁻¹', value: 2.0, step: 0.1, min: 0.3, max: 8,
        group: 'The yield cost',
        help: 'The nutrient solution itself, before any accumulated sodium.' },
      { id: 'ecthresh', label: 'Salinity threshold', unit: 'dS m⁻¹', value: 2.5, step: 0.1, min: 0.5, max: 10,
        help: 'The Maas-Hoffman threshold below which yield is at its plateau.' },
      { id: 'syd', label: 'Yield decrement above the threshold', unit: '% per dS m⁻¹', value: 0, step: 0.5, min: 0, max: 30,
        help: 'Leave at zero to use the crop’s tabulated midpoint.' }
    ],

    compute: function (v) {
      var crop = CROPS.filter(function (c) { return c.k === String(v.crop); })[0];
      if (!crop) throw new Error('Crop must be one of the listed eight.');
      var cIn = GFC.need(v.cin, 'Sodium in the refill water', { positive: true });
      var vol = GFC.need(v.volume, 'Water volume in the system', { positive: true });
      var cMaxIn = GFC.need(v.cmax, 'Discharge ceiling', { min: 0 });
      var uptake = GFC.need(v.uptake, 'Crop water uptake', { positive: true });
      var useP = GFC.need(v.useP, 'Crop uptake of sodium') === 1;
      var ecBase = GFC.need(v.ecbase, 'Base electrical conductivity', { positive: true });
      var ecThresh = GFC.need(v.ecthresh, 'Salinity threshold', { positive: true });
      var sydIn = GFC.need(v.syd, 'Yield decrement', { min: 0 });

      var cMax = cMaxIn > 0 ? cMaxIn : crop.naMax;
      var syd = sydIn > 0 ? sydIn : crop.syd;
      var p = useP ? crop.pNa : 0;

      if (cMax <= cIn) {
        throw new Error('The discharge ceiling of ' + GFC.fixed(cMax, 2) + ' mmol L⁻¹ is at or below the '
          + 'refill concentration of ' + GFC.fixed(cIn, 2) + ', so the ceiling is breached by the refill '
          + 'water itself and no amount of leaching helps. Either the water source or the ceiling has to change.');
      }

      /* No uptake: C/C_in = 1 + U/V, so the ceiling is reached at a definite
       * uptake and the leaching ratio follows. */
      var uAtMax = (cMax / cIn - 1) * vol;              /* L m-2 of uptake */
      var leachRatio = cIn / (cMax - cIn);              /* L per unit of uptake */
      var waterRatio = cMax / (cMax - cIn);             /* W/U */
      var cyclesPerYear = uptake / uAtMax;
      var leachPerYear = uptake * leachRatio;
      var waterPerYear = uptake + leachPerYear;

      /* With uptake, the concentration saturates at C_in/p. */
      var cInfinity = p > 0 ? cIn / p : Infinity;
      var saturates = p > 0;
      var reachesCeiling = !saturates || cInfinity > cMax;

      /* Concentration after a year of uptake with no discharge, both cases. */
      var cNoP = cIn * (1 + uptake / vol);
      var cWithP = p > 0 ? (cIn / p) * (1 - Math.exp(-p * uptake / vol)) : cNoP;
      var cYear = useP ? cWithP : cNoP;

      /* The yield cost of the resulting salinity. Sodium contributes to EC at
       * roughly 0.1 dS m-1 per mmol of charge. */
      var ecFromNa = 0.1 * cYear;
      var ecTotal = ecBase + ecFromNa;
      var yieldRatio = ecTotal <= ecThresh ? 1
        : Math.max(0, 1 - syd / 100 * (ecTotal - ecThresh));

      var flags = [];
      if (!reachesCeiling) flags.push({ head: 'The ceiling is never reached.',
        text: 'With the crop taking up ' + GFC.pct(p, 1) + ' of the root-zone sodium concentration, the loop saturates at '
            + GFC.fixed(cInfinity, 2) + ' mmol L⁻¹, below the ceiling of ' + GFC.fixed(cMax, 2)
            + '. A fully closed loop is possible on this water, and the leaching ratio below is the no-uptake upper bound.' });
      else if (saturates) flags.push({ head: 'Saturates at ' + GFC.fixed(cInfinity, 2) + ' mmol L⁻¹, above the ceiling.',
        text: 'So discharge is still needed, but less often than the no-uptake case implies. Crops do take up some sodium and chloride, which makes the simple leaching ratio an over-estimate of water use.' });
      if (crop.pNa < 0.01) flags.push({ head: crop.label + ' takes up almost no sodium.',
        text: 'Its uptake fraction is near zero, so the concentration genuinely diverges and the simple ratio applies with no correction. This is the worst case for a closed loop.' });
      if (ecTotal > ecThresh) flags.push({ head: 'Yield falls to ' + GFC.pct(yieldRatio, 0) + ' at this salinity.',
        text: 'The dominant route is specific leaf area, about −8 % per dS m⁻¹ above a 3 dS m⁻¹ threshold: small thick leaves intercept less light. Fruit dry matter content and stomatal resistance are the moderate routes.' });
      flags.push({ head: 'Low electrical conductivity fails too.',
        text: 'The Maas-Hoffman shape has a low-end failure at both ends: as the medium approaches saturation the roots suffocate, and at very low conductivity there are simply not enough nutrient ions.' });

      return {
        headline: [
          { label: 'Uptake to reach the ceiling', value: GFC.fixed(uAtMax, 0), unit: 'L m⁻²',
            hint: GFC.fixed(cyclesPerYear, 2) + ' discharge cycles a year' },
          { label: 'Leaching ratio', value: GFC.fixed(leachRatio, 4), unit: 'L per L uptake',
            hint: GFC.pct(leachRatio / (1 + leachRatio), 1) + ' of the water supplied' },
          { label: 'Discharge', value: GFC.fixed(leachPerYear, 0), unit: 'L m⁻² y⁻¹',
            hint: 'Against ' + GFC.fixed(uptake, 0) + ' L of uptake' },
          { label: 'Yield at the resulting salinity', value: GFC.pct(yieldRatio, 0), unit: '',
            hint: GFC.fixed(ecTotal, 2) + ' dS m⁻¹ against a threshold of ' + GFC.fixed(ecThresh, 1) }
        ],
        flags: flags,
        rows: [
          { label: 'Discharge ceiling in use', value: GFC.fixed(cMax, 2), unit: 'mmol L⁻¹', note: cMaxIn > 0 ? 'As entered' : 'The crop’s tabulated closed-loop sodium maximum' },
          { label: 'Refill concentration', value: GFC.fixed(cIn, 3), unit: 'mmol L⁻¹', note: 'The water source' },
          { label: 'Ratio of ceiling to refill', value: GFC.fixed(cMax / cIn, 3), unit: '–', note: 'The whole problem in one number' },
          { label: 'Uptake to reach the ceiling', value: GFC.fixed(uAtMax, 1), unit: 'L m⁻²', note: '(C_max/C_in − 1) V' },
          { label: 'Total water per discharge cycle', value: GFC.fixed(uAtMax + vol * cMax / cIn - vol, 1), unit: 'L m⁻²', note: 'Uptake plus the volume discharged' },
          { label: 'Water-to-uptake ratio W/U', value: GFC.fixed(waterRatio, 4), unit: '–', note: 'C_max/(C_max − C_in)' },
          { label: 'Leaching ratio L/U', value: GFC.fixed(leachRatio, 5), unit: '–', note: 'C_in/(C_max − C_in); dimensionless' },
          { label: 'Discharge cycles per year', value: GFC.fixed(cyclesPerYear, 3), unit: 'y⁻¹', note: 'At ' + GFC.fixed(uptake, 0) + ' L of uptake' },
          { label: 'Leachate per year', value: GFC.fixed(leachPerYear, 1), unit: 'L m⁻² y⁻¹', note: 'What has to be discharged or treated' },
          { label: 'Water supplied per year', value: GFC.fixed(waterPerYear, 1), unit: 'L m⁻² y⁻¹', note: 'Uptake plus leachate' },
          { label: 'Crop sodium uptake fraction', value: GFC.pct(crop.pNa, 2), unit: '', note: 'As a fraction of root-zone concentration' },
          { label: 'Crop chloride uptake fraction', value: GFC.pct(crop.pCl, 2), unit: '', note: 'Chloride is usually taken up faster than sodium' },
          { label: 'Saturation concentration C_∞', value: saturates ? GFC.fixed(cInfinity, 2) : 'diverges', unit: saturates ? 'mmol L⁻¹' : '', note: 'C_in / p' },
          { label: 'Concentration after one year, no uptake', value: GFC.fixed(cNoP, 3), unit: 'mmol L⁻¹', note: 'C_in(1 + U/V)' },
          { label: 'Concentration after one year, with uptake', value: GFC.fixed(cWithP, 3), unit: 'mmol L⁻¹', note: '(C_in/p)(1 − e^(−pU/V))' },
          { label: 'Electrical conductivity from sodium', value: GFC.fixed(ecFromNa, 3), unit: 'dS m⁻¹', note: 'About 0.1 dS m⁻¹ per mmol of charge' },
          { label: 'Total electrical conductivity', value: GFC.fixed(ecTotal, 3), unit: 'dS m⁻¹', note: 'Solution plus accumulated sodium' },
          { label: 'Yield decrement in use', value: GFC.fixed(syd, 2), unit: '% per dS m⁻¹', note: sydIn > 0 ? 'As entered' : 'Midpoint of the crop’s tabulated range' },
          { label: 'Relative yield', value: GFC.pct(yieldRatio, 2), unit: '', note: 'Maas-Hoffman, two parameters only' }
        ],
        caption: 'Concentration against cumulative uptake. Without crop uptake the line is '
               + 'straight and crosses the ceiling; with uptake it bends and may never reach it.',
        _v: { cIn: cIn, vol: vol, cMax: cMax, p: p, uptake: uptake, useP: useP,
              cInfinity: cInfinity, uAtMax: uAtMax }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;
      var uMax = Math.max(st.uptake * 1.2, st.uAtMax * 1.4);
      var topNoP = st.cIn * (1 + uMax / st.vol);
      var nc = S.nice(0, Math.min(topNoP, st.cMax * 3), 4);
      var sx = S.scale(0, uMax, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Sodium concentration against cumulative water uptake');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: uMax, yMin: 0, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 1); },
        xLabel: 'Cumulative water uptake (L m⁻²)',
        yLabel: 'Sodium concentration (mmol L⁻¹)'
      });

      var dNoP = '', dWithP = '', u, first = true;
      for (u = 0; u <= uMax; u += uMax / 240) {
        var cn = st.cIn * (1 + u / st.vol);
        dNoP += (first ? 'M' : 'L') + sx(u).toFixed(1) + ' ' + sy(Math.min(cn, nc.max)).toFixed(1);
        if (st.p > 0) {
          var cw = (st.cIn / st.p) * (1 - Math.exp(-st.p * u / st.vol));
          dWithP += (first ? 'M' : 'L') + sx(u).toFixed(1) + ' ' + sy(Math.min(cw, nc.max)).toFixed(1);
        }
        first = false;
      }
      g += S.path(dNoP, st.useP ? pal.line : pal.accent, st.useP ? 1.4 : 2.4, null, st.useP ? '4 3' : null);
      if (st.p > 0) g += S.path(dWithP, st.useP ? pal.accent : pal.line, st.useP ? 2.4 : 1.4, null, st.useP ? null : '4 3');

      g += S.line(L, sy(Math.min(st.cMax, nc.max)), L + PW, sy(Math.min(st.cMax, nc.max)), pal.warn, 2, '5 3');
      g += S.text(L + PW - 3, sy(Math.min(st.cMax, nc.max)) - 6,
        'discharge ceiling ' + GFC.fixed(st.cMax, 1), { size: 10.5, anchor: 'end', fill: pal.warn });

      if (st.p > 0 && st.cInfinity < nc.max) {
        g += S.line(L, sy(st.cInfinity), L + PW, sy(st.cInfinity), pal.series[3], 1.3, '2 4');
        g += S.text(L + 4, sy(st.cInfinity) - 6, 'saturates at ' + GFC.fixed(st.cInfinity, 1),
          { size: 10, fill: pal.series[3] });
      }
      if (st.uAtMax <= uMax) {
        g += S.line(sx(st.uAtMax), T, sx(st.uAtMax), T + PH, pal.line, 1.1, '2 3');
        g += S.text(sx(st.uAtMax) + 4, T + 12, 'ceiling at ' + GFC.fixed(st.uAtMax, 0) + ' L m⁻²',
          { size: 10, fill: pal.soft });
      }

      g += S.legend(L, H - 10, [
        { label: 'with crop uptake', colour: st.useP ? pal.accent : pal.line, dash: st.useP ? null : '4 3' },
        { label: 'without', colour: st.useP ? pal.line : pal.accent, dash: st.useP ? '4 3' : null },
        { label: 'ceiling', colour: pal.warn, dash: '5 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'With U the accumulated water uptake, C_in the refill concentration and V the water '
            + 'volume in the system:',
        math: 'C<sub>t</sub> / C<sub>in</sub> = 1 + U<sub>t</sub> / V',
        note: 'It is cumulative water uptake, not time, that drives the accumulation. Water '
            + 'leaving as transpiration and as biomass carries no salt but is replaced by water '
            + 'that does.' },
      { lead: 'The uptake at which a discharge ceiling is reached, and the leaching ratio that '
            + 'follows:',
        math: 'U<sub>Cmax</sub> = (C<sub>MAX</sub>/C<sub>in</sub> − 1) V, &nbsp;&nbsp; '
            + 'W/U = C<sub>MAX</sub>/(C<sub>MAX</sub> − C<sub>in</sub>), &nbsp;&nbsp; '
            + 'L/U = C<sub>in</sub>/(C<sub>MAX</sub> − C<sub>in</sub>)',
        note: 'The leaching ratio is dimensionless, so it holds whether concentrations are in '
            + 'mmol per litre or as electrical conductivity, and it holds even when the whole '
            + 'system cannot be discharged at once: the concentration after discharge is then '
            + 'higher, so the next ceiling is reached after less uptake, and the slope of '
            + 'concentration against uptake is unchanged.' },
      { lead: 'Crops do take up some sodium and chloride, and with any uptake at all the '
            + 'concentration saturates rather than diverging:',
        math: 'dM/dU = C<sub>in</sub> − pM/V &nbsp;⟹&nbsp; '
            + 'C/C<sub>in</sub> = (1/p)(1 − e<sup>−pU/V</sup>), &nbsp;&nbsp; '
            + 'C<sub>∞</sub> = C<sub>in</sub>/p',
        note: 'So the simple leaching ratio is an over-estimate of water use. Rose takes up almost '
            + 'none and is the worst case; cucumber and gerbera take up the most.' },
      { lead: 'The yield cost, Maas-Hoffman, two parameters only:',
        math: 'Y/Y<sub>max</sub> = 1 for X ≤ X<sub>threshold</sub>, &nbsp;&nbsp; '
            + '1 − SYD(X − X<sub>threshold</sub>) above it',
        note: 'The same shape describes salinity and drought. Three routes carry the effect and '
            + 'they are very unequal: specific leaf area at about −8 % per dS m⁻¹ above a '
            + '3 dS m⁻¹ threshold is dominant, with fruit dry matter content and stomatal '
            + 'resistance moderate.' }
    ],

    caveats: [
      'The conductivity contribution of sodium here uses the linear approximation, EC ≈ 0.1 × the '
        + 'charge-weighted cation sum. That is linear only up to about 3.5 dS m⁻¹; above it the '
        + 'relation becomes logarithmic and this will over-state the conductivity.',
      'Electrical conductivity says nothing about composition. Two solutions at the same reading '
        + 'can be nutritionally very different, and it is the non-nutrient ions that matter here.',
      'Sodium uptake fractions are crop-level figures. Cultivars within a species differ, and '
        + 'cherry tomato is more salt-resistant than tomato.',
      'Discharge is treated as a complete exchange at the ceiling. A partial discharge leaves a '
        + 'higher starting concentration, so the next ceiling arrives sooner; the leaching ratio '
        + 'is unchanged but the cycle length is not.'
    ],

    sources: ['sonneveld2009', 'maas1977', 'maas1999', 'marcelis1999', 'fao56'],
    provenance: 'Sections 14.4, 14.6 and 14.7 of "Greenhouse parameters and equations", including '
              + 'its tables of closed-loop sodium maxima, yield decrements and crop uptake '
              + 'fractions.'
  });
}());

