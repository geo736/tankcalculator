
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'tgc-growth',
    kicker: 'Aquaculture',
    name: 'Days to harvest from the thermal growth coefficient',
    lede: 'The thermal growth coefficient turns a water temperature into a growth rate, and '
        + 'inverting it gives the grow-out time directly. This is the sizing calculation behind '
        + 'every stocking plan: how long, how much feed, and how much standing biomass at the end.',
    inputNote: 'The coefficient here follows the ×100 convention used in the source literature '
             + 'and in NEEMO. A ×1000 convention needs a coefficient ten times larger, not the '
             + 'same number.',

    inputs: [
      { id: 'ibw', label: 'Stocking weight', unit: 'g', value: 50, step: 1, min: 0.01, max: 20000 },
      { id: 'fbw', label: 'Harvest weight', unit: 'g', value: 1000, step: 10, min: 1, max: 100000 },
      { id: 'tgc', label: 'Thermal growth coefficient', unit: '×100 convention', value: 0.18, step: 0.005, min: 0.01, max: 2,
        help: 'Must be calibrated together with the growth exponent and within the same growth stage. A stage-specific fit does not transfer to a whole grow-out.' },
      { id: 'temp', label: 'Rearing water temperature', unit: '°C', value: 15, step: 0.1, min: 1, max: 35 },
      { id: 'exp', label: 'Growth weight exponent', unit: '–', value: 0.3333, step: 0.0001, min: 0.1, max: 1,
        help: 'One third is the cube-root aggregate scenario. The exponent and the coefficient are a matched pair from one calibration.' },

      { id: 'fcr', label: 'Feed conversion ratio', unit: 'kg feed per kg gain', value: 1.1, step: 0.05, min: 0.4, max: 4,
        group: 'Feed and stock' },
      { id: 'nstock', label: 'Number stocked', unit: 'fish', value: 10000, step: 100, min: 1, max: 10000000 },
      { id: 'mort', label: 'Daily mortality rate', unit: '–', value: 0.0002, step: 0.0001, min: 0, max: 0.02,
        help: 'Compounded over the grow-out, so a rate that looks negligible per day is not negligible per cycle.' },
      { id: 'density', label: 'Maximum standing density', unit: 'kg m⁻³', value: 40, step: 1, min: 1, max: 200,
        group: 'Tank sizing' },
      { id: 'util', label: 'Space utilisation efficiency', unit: '–', value: 0.5, step: 0.05, min: 0.1, max: 1,
        help: 'Fraction of the tank volume the biomass may actually occupy at the design density.' }
    ],

    compute: function (v) {
      var ibw = GFC.need(v.ibw, 'Stocking weight', { positive: true });
      var fbw = GFC.need(v.fbw, 'Harvest weight', { positive: true });
      var tgc = GFC.need(v.tgc, 'Thermal growth coefficient', { positive: true });
      var temp = GFC.need(v.temp, 'Rearing water temperature', { positive: true });
      var e = GFC.need(v.exp, 'Growth weight exponent', { positive: true, max: 1 });
      var fcr = GFC.need(v.fcr, 'Feed conversion ratio', { positive: true });
      var n0 = GFC.need(v.nstock, 'Number stocked', { positive: true });
      var mort = GFC.need(v.mort, 'Daily mortality rate', { min: 0, max: 0.02 });
      var density = GFC.need(v.density, 'Maximum standing density', { positive: true });
      var util = GFC.need(v.util, 'Space utilisation efficiency', { positive: true, max: 1 });

      if (fbw <= ibw) throw new Error('Harvest weight must exceed stocking weight.');

      /* The inversion: days = (W_h^e - W_0^e) / (TGC/100 x T) */
      var days = (Math.pow(fbw, e) - Math.pow(ibw, e)) / (tgc / 100 * temp);
      var survivors = n0 * Math.pow(1 - mort, days);
      var survival = survivors / n0;

      var bioStart = n0 * ibw / 1000;              /* kg */
      var bioEnd = survivors * fbw / 1000;         /* kg */
      /* Gain credited only to the fish that reach harvest, which is the
       * conservative reading; dead fish ate before they died, so the feed
       * figure below is a floor. */
      var gain = bioEnd - bioStart;
      var feed = gain * fcr;
      var feedPerDay = feed / days;
      var volume = bioEnd / density / util;
      var sgr = 100 * Math.log(fbw / ibw) / days;  /* % per day, for comparison */
      var degreeDays = temp * days;

      var flags = [];
      if (days > 1095) flags.push({ head: 'Grow-out of ' + GFC.fixed(days / 365, 1) + ' years.',
        text: 'Check the coefficient and the temperature. A thermal growth coefficient fitted on a different weight range will not carry across a whole grow-out.' });
      if (survival < 0.8) flags.push({ head: 'Survival ' + GFC.pct(survival, 0) + '.',
        text: 'A daily rate of ' + GFC.sig(mort, 2) + ' compounds to this over ' + GFC.fixed(days, 0) + ' days. Feed here is credited only to the fish that reach harvest, so it is a floor rather than an estimate.' });
      if (e !== 1 / 3) flags.push({ head: 'Exponent is not one third.',
        text: 'The body-mass growth exponent and the thermal growth coefficient must be calibrated together within the same growth stage. Mixing an exponent from one fit with a coefficient from another gives a number with no source.' });
      if (temp < 8 || temp > 28) flags.push({ head: 'Temperature outside the usual fitted range.',
        text: 'A thermal growth coefficient is linear in temperature by construction, which cannot hold near the species’ thermal limits. Above the optimum, growth falls while the model keeps rising.' });

      return {
        headline: [
          { label: 'Grow-out time', value: GFC.fixed(days, 0), unit: 'days',
            hint: GFC.fixed(days / 30.44, 1) + ' months at ' + GFC.fixed(temp, 1) + ' °C' },
          { label: 'Feed required', value: GFC.fixed(feed, 0), unit: 'kg',
            hint: GFC.fixed(feedPerDay, 1) + ' kg per day on average' },
          { label: 'Biomass at harvest', value: GFC.fixed(bioEnd, 0), unit: 'kg',
            hint: GFC.fixed(survivors, 0) + ' fish at ' + GFC.fixed(fbw, 0) + ' g' },
          { label: 'Tank volume needed', value: GFC.fixed(volume, 0), unit: 'm³',
            hint: 'At ' + GFC.fixed(density, 0) + ' kg m⁻³ and ' + GFC.pct(util, 0) + ' utilisation' }
        ],
        flags: flags,
        rows: [
          { label: 'Grow-out time', value: GFC.fixed(days, 1), unit: 'd', note: '(W_h^e − W_0^e) / (TGC/100 × T)' },
          { label: 'Degree-days accumulated', value: GFC.fixed(degreeDays, 0), unit: '°C d', note: 'Temperature × days' },
          { label: 'Equivalent specific growth rate', value: GFC.fixed(sgr, 3), unit: '% d⁻¹', note: 'For comparison only; the model is not exponential' },
          { label: 'Survival over the cycle', value: GFC.pct(survival, 2), unit: '', note: '(1 − m)^days' },
          { label: 'Fish at harvest', value: GFC.fixed(survivors, 0), unit: 'fish', note: 'From ' + GFC.fixed(n0, 0) + ' stocked' },
          { label: 'Biomass at stocking', value: GFC.fixed(bioStart, 1), unit: 'kg', note: 'n × W_0' },
          { label: 'Biomass at harvest', value: GFC.fixed(bioEnd, 1), unit: 'kg', note: 'Survivors × W_h' },
          { label: 'Live-weight gain', value: GFC.fixed(gain, 1), unit: 'kg', note: 'Credited to the fish that reach harvest' },
          { label: 'Feed required', value: GFC.fixed(feed, 1), unit: 'kg', note: 'Gain × feed conversion ratio' },
          { label: 'Mean feed rate', value: GFC.fixed(feedPerDay, 2), unit: 'kg d⁻¹', note: 'Averaged; the real curve rises through the cycle' },
          { label: 'Feed as a share of final biomass', value: GFC.pct(feed / bioEnd, 0), unit: '', note: 'A sanity check on the conversion ratio' },
          { label: 'Peak standing biomass', value: GFC.fixed(bioEnd, 1), unit: 'kg', note: 'At harvest, in a single-cohort tank' },
          { label: 'Tank volume at the design density', value: GFC.fixed(volume, 2), unit: 'm³', note: 'Biomass ÷ density ÷ utilisation' },
          { label: 'Volume per thousand fish stocked', value: GFC.fixed(volume / n0 * 1000, 2), unit: 'm³', note: 'For comparing stocking plans' }
        ],
        caption: 'The weight trajectory this coefficient implies. Growth in weight accelerates '
               + 'because the cube-root weight rises linearly with accumulated degree-days, which '
               + 'is the whole content of the model.',
        _v: { ibw: ibw, fbw: fbw, tgc: tgc, temp: temp, e: e, days: days }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;
      var dMax = Math.ceil(st.days * 1.05);
      var nc = S.nice(0, st.fbw, 4);
      var sx = S.scale(0, dMax, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var weightAt = function (d) {
        var w = Math.pow(Math.pow(st.ibw, st.e) + st.tgc / 100 * st.temp * d, 1 / st.e);
        return w;
      };

      var g = S.open(W, H, 'Weight against time for this cohort');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: dMax, yMin: 0, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Days from stocking',
        yLabel: 'Individual weight (g)'
      });

      var d = '', x, first = true;
      for (x = 0; x <= dMax; x += dMax / 200) {
        d += (first ? 'M' : 'L') + sx(x).toFixed(1) + ' ' + sy(Math.min(weightAt(x), nc.max)).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      /* the same run at two other temperatures, for scale */
      [[st.temp - 3, '−3 K'], [st.temp + 3, '+3 K']].forEach(function (pair, i) {
        if (pair[0] <= 0) return;
        var dd = '', xx, f = true;
        for (xx = 0; xx <= dMax; xx += dMax / 200) {
          var w = Math.pow(Math.pow(st.ibw, st.e) + st.tgc / 100 * pair[0] * xx, 1 / st.e);
          dd += (f ? 'M' : 'L') + sx(xx).toFixed(1) + ' ' + sy(Math.min(w, nc.max)).toFixed(1);
          f = false;
        }
        g += S.path(dd, pal.line, 1.3, null, '4 3');
        void i;
      });

      g += S.line(L, sy(st.fbw), sx(st.days), sy(st.fbw), pal.warn, 1.2, '3 3');
      g += S.line(sx(st.days), sy(st.fbw), sx(st.days), T + PH, pal.warn, 1.2, '3 3');
      g += S.circle(sx(st.days), sy(st.fbw), 5, pal.accent);
      g += S.text(sx(st.days) - 8, sy(st.fbw) - 8, GFC.fixed(st.days, 0) + ' d to ' + GFC.fixed(st.fbw, 0) + ' g',
        { size: 11, anchor: 'end', fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'at ' + GFC.fixed(st.temp, 1) + ' °C', colour: pal.accent, dash: null },
        { label: 'three kelvin either side', colour: pal.line, dash: '4 3' },
        { label: 'harvest', colour: pal.warn, dash: '3 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'The thermal growth coefficient model, on the ×100 convention used here:',
        math: 'W<sub>t</sub><sup>e</sup> = W<sub>0</sub><sup>e</sup> + (TGC/100) · T · t',
        note: 'W in g per fish, T in °C, t in days, e the body-weight exponent with base one '
            + 'third. A ×1000 convention would require a tenfold larger coefficient, not the same '
            + 'number, which is the commonest way this model is misapplied.' },
      { lead: 'Inverted for the cycle length, which is what sizes a stocking plan:',
        math: 'D = (W<sub>h</sub><sup>e</sup> − W<sub>0</sub><sup>e</sup>) / ((TGC/100) · T)',
        note: 'Linear in accumulated degree-days, so halving the temperature difference from zero '
            + 'doubles the time. That linearity is the model’s convenience and its main limitation.' },
      { lead: 'Survival and feed over the cycle:',
        math: 'n<sub>t</sub> = n<sub>0</sub>(1 − m)<sup>D</sup>, &nbsp;&nbsp; '
            + 'feed = (n<sub>t</sub>W<sub>h</sub> − n<sub>0</sub>W<sub>0</sub>) × FCR',
        note: 'Gain is credited only to the fish that reach harvest. Fish that die ate before '
            + 'they died, so the feed figure is a floor rather than an estimate.' },
      { lead: 'Tank volume from the peak standing biomass:',
        math: 'V = biomass / (density × utilisation)',
        note: 'In a single-cohort tank the peak is at harvest. A staggered multi-cohort system '
            + 'holds a flatter biomass and needs a different calculation.' }
    ],

    caveats: [
      'The body-mass growth exponent and the thermal growth coefficient have to be calibrated '
        + 'together and within one growth stage. Stage-specific fits with different coefficients '
        + 'are calibration evidence, not a whole-cycle model.',
      'Growth is linear in temperature by construction. That cannot hold near the species’ '
        + 'thermal limits, where growth falls while this model keeps rising.',
      'This is a single cohort grown at a constant temperature. A real farm runs several cohorts '
        + 'and a variable temperature, and the mean of the model over a temperature series is not '
        + 'the model at the mean temperature.',
      'Feed conversion ratio is entered as one number for the whole cycle. It worsens as fish '
        + 'grow, so a single value will understate late-cycle feed and overstate early-cycle feed.'
    ],

    sources: ['cho1992', 'cho1998', 'chowdhury2013', 'timmons2018'],
    provenance: 'Transcribed from growthPeriod and simulateCohort in NEEMO’s neemo-model.js, '
              + 'whose derivation is Supplementary Note 1.27 of the NEEMO supplementary '
              + 'information. The inversion follows Cho and Bureau equation 3 and Chowdhury '
              + 'equation 9.'
  });
}());

