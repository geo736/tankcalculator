
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'supplemental-light',
    kicker: 'Lighting',
    name: 'Is supplementary light worth it?',
    lede: 'Two questions in order: is the lamp light material against the sun at this site and '
        + 'season, and does the yield it buys cover the electricity? The lamp electricity term is '
        + 'independent of the crop and the yield term is not, which is why the same installation '
        + 'pays in roses and not in lettuce at the same latitude.',
    inputNote: 'Efficacy is µmol of PAR per joule of electricity. High-pressure sodium sits near '
             + '1.85 and a red-blue LED near 3.0.',

    inputs: [
      { id: 'ppfd', label: 'Lamp PPFD at the canopy', unit: 'µmol m⁻² s⁻¹', value: 200, step: 10, min: 10, max: 1200 },
      { id: 'hours', label: 'Lit hours per day', unit: 'h', value: 16, step: 0.5, min: 1, max: 24 },
      { id: 'days', label: 'Lit days in the cycle', unit: 'd', value: 30, step: 1, min: 1, max: 365 },
      { id: 'efficacy', label: 'Fixture efficacy', unit: 'µmol J⁻¹', value: 3.0, step: 0.05, min: 0.5, max: 4.0,
        help: 'The ceiling is set by the energy a photon carries at the emitted wavelength: about 4.6 µmol J⁻¹ at 550 nm even at perfect electrical efficiency.' },
      { id: 'fpar', label: 'Fraction of lamp power leaving as PAR', unit: '–', value: 0.558, step: 0.01, min: 0.1, max: 0.9,
        help: 'The rest becomes heat inside the envelope. 0.372 for high-pressure sodium and 0.558 for an LED at these efficacies.' },

      { id: 'rs', label: 'Daily global radiation outside', unit: 'MJ m⁻² d⁻¹', value: 17.7, step: 0.5, min: 0.2, max: 35,
        group: 'The solar comparison' },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.65, step: 0.01, min: 0.2, max: 0.95 },
      { id: 'windowless', label: 'Daylight', unit: '', value: 0, type: 'select',
        options: [{ v: 0, label: 'Daylit greenhouse' }, { v: 1, label: 'No daylight (indoor farm)' }],
        help: 'With no daylight the first stage of the test has nothing to compare against and the screening collapses to the margin alone.' },

      { id: 'pcrop', label: 'Crop price', unit: 'currency per kg', value: 1.20, step: 0.05, min: 0, max: 100, group: 'The margin' },
      { id: 'yield', label: 'Unlit yield over the cycle', unit: 'kg m⁻²', value: 12, step: 0.5, min: 0, max: 200 },
      { id: 'epsL', label: 'Light–yield elasticity', unit: '–', value: 1.0, step: 0.05, min: 0.3, max: 1.5 },
      { id: 'pel', label: 'Electricity price', unit: 'currency per kWh', value: 0.20, step: 0.01, min: 0, max: 2 },

      { id: 'pheat', label: 'Heat price', unit: 'currency per kWh', value: 0.06, step: 0.01, min: 0, max: 2,
        group: 'The heat the lamp gives back',
        help: 'Lamp heat displaces heating during lit hours. Whether that is worth anything depends entirely on the price ratio of electricity to heat and on whether the heat was going to be generated anyway.' },
      { id: 'heatuse', label: 'Fraction of lamp heat that displaces heating', unit: '–', value: 0.5, step: 0.05, min: 0, max: 1,
        help: 'Near 1 in a heating-dominated house in winter, 0 in an indoor farm where it is a cooling duty instead.' }
    ],

    compute: function (v) {
      var ppfd = GFC.need(v.ppfd, 'Lamp PPFD', { positive: true });
      var hours = GFC.need(v.hours, 'Lit hours per day', { positive: true, max: 24 });
      var days = GFC.need(v.days, 'Lit days', { positive: true });
      var eff = GFC.need(v.efficacy, 'Fixture efficacy', { positive: true });
      var fPar = GFC.need(v.fpar, 'PAR fraction of lamp power', { positive: true, max: 0.9 });
      var rs = GFC.need(v.rs, 'Daily global radiation', { positive: true });
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var windowless = GFC.need(v.windowless, 'Daylight') === 1;
      var pCrop = GFC.need(v.pcrop, 'Crop price', { min: 0 });
      var yUnlit = GFC.need(v.yield, 'Unlit yield', { min: 0 });
      var epsL = GFC.need(v.epsL, 'Light–yield elasticity', { positive: true });
      var pEl = GFC.need(v.pel, 'Electricity price', { min: 0 });
      var pHeat = GFC.need(v.pheat, 'Heat price', { min: 0 });
      var heatUse = GFC.need(v.heatuse, 'Useful heat fraction', { min: 0, max: 1 });

      var dliLamp = 0.0036 * ppfd * hours;
      var dliSol = windowless ? 0 : 2 * tau * rs;      /* mol m-2 d-1, factor 2 from 3.1 */
      var phi = windowless ? Infinity : dliLamp / dliSol;

      /* Installed electrical power and the heat it leaves behind. */
      var pLamp = ppfd / eff;                          /* W m-2 */
      var heatW = pLamp * (1 - fPar);                  /* W m-2 of sensible heat */
      var kwhPerM2 = dliLamp * days / (3.6 * eff);     /* the compendium's own form */
      var elecCost = pEl * kwhPerM2;

      var heatKwh = heatW * hours * days / 1000;
      var heatCredit = heatKwh * heatUse * pHeat;

      var yieldGain = windowless ? NaN : yUnlit * (Math.pow(1 + phi, epsL) - 1);
      var revenue = windowless ? NaN : pCrop * yieldGain;
      var margin = windowless ? NaN : revenue - elecCost + heatCredit;
      var breakEvenCropValue = (elecCost - heatCredit) /
        (windowless ? 1 : (Math.pow(1 + phi, epsL) - 1));

      var ceiling = 4.6;   /* micromol per joule at 550 nm, perfect electrical efficiency */

      var flags = [];
      if (eff > ceiling) flags.push({ head: 'Above the photon-energy ceiling.',
        text: 'An efficacy of ' + GFC.fixed(eff, 2) + ' µmol J⁻¹ exceeds what a photon at 550 nm can deliver even at perfect electrical efficiency, about ' + ceiling + '. Check the figure.' });
      if (windowless) flags.push({ head: 'No daylight.',
        text: 'The light fraction is undefined and the screening collapses to its second stage alone: there is no light fraction to judge, only the margin between crop price and electricity. That is why indoor-farm economics is dominated by efficacy and electricity price.' });
      else if (phi < 0.1) flags.push({ head: 'Light fraction of only ' + GFC.fixed(phi, 2) + '.',
        text: 'The lamp is adding little against the sun at this radiation level. The first stage of the test has already failed; the margin below is the second stage and will be small.' });
      else if (phi > 0.3) flags.push({ head: 'Light fraction of ' + GFC.fixed(phi, 2) + ' is material.',
        text: 'The lamp adds ' + GFC.pct(phi, 0) + ' on top of the solar light, which is enough to shorten the cycle as well as raise the rate.' });
      if (!windowless && isFinite(margin) && margin < 0) flags.push({ head: 'The margin is negative.',
        text: 'The yield side has to clear ' + GFC.fixed(elecCost - heatCredit, 2) + ' per m² over the cycle, which needs an unlit crop value above about ' + GFC.fixed(breakEvenCropValue, 2) + ' per m². This is the whole reason supplementary light spread from propagation into production only as efficacy rose.' });
      flags.push({ head: 'Lamp heat is ' + GFC.fixed(heatW, 0) + ' W m⁻².',
        text: 'Essentially all radiation the lamps emit is degraded to heat inside the envelope; the fraction fixed by photosynthesis is of order 5 % and is neglected in every energy balance here. In a heating-dominated house that heat is largely useful; in an indoor farm it is always a cooling duty.' });

      var rows = [
        { label: 'Lamp daily light integral', value: GFC.fixed(dliLamp, 2), unit: 'mol m⁻² d⁻¹', note: '0.0036 PPFD t_h' },
        { label: 'Lamp light over the cycle', value: GFC.fixed(dliLamp * days, 0), unit: 'mol m⁻²', note: 'Over ' + GFC.fixed(days, 0) + ' lit days' },
        { label: 'Installed lamp power', value: GFC.fixed(pLamp, 1), unit: 'W m⁻²', note: 'PPFD ÷ efficacy' },
        { label: 'Lamp electricity over the cycle', value: GFC.fixed(kwhPerM2, 2), unit: 'kWh m⁻²', note: 'DLI × days / (3.6 × efficacy)' },
        { label: 'Electricity cost', value: GFC.fixed(elecCost, 2), unit: 'currency m⁻²', note: 'Independent of the crop' },
        { label: 'Sensible heat from the lamps', value: GFC.fixed(heatW, 1), unit: 'W m⁻²', note: 'P (1 − f_PAR)' },
        { label: 'Lamp heat over the cycle', value: GFC.fixed(heatKwh, 2), unit: 'kWh m⁻²', note: 'During lit hours only' },
        { label: 'Heat credit', value: GFC.fixed(heatCredit, 2), unit: 'currency m⁻²', note: GFC.pct(heatUse, 0) + ' of it displacing bought heat' }
      ];
      if (!windowless) {
        rows.unshift({ label: 'Solar daily light integral inside', value: GFC.fixed(dliSol, 2), unit: 'mol m⁻² d⁻¹', note: '2 τ R_s' });
        rows.push({ label: 'Light fraction φ_lamp', value: GFC.fixed(phi, 4), unit: '–', note: 'Lamp DLI ÷ solar DLI inside' });
        rows.push({ label: 'Yield multiplier', value: GFC.fixed(Math.pow(1 + phi, epsL), 4), unit: '–', note: '(1 + φ)^ε_L' });
        rows.push({ label: 'Extra yield', value: GFC.fixed(yieldGain, 3), unit: 'kg m⁻²', note: 'Over the lit cycle' });
        rows.push({ label: 'Extra revenue', value: GFC.fixed(revenue, 2), unit: 'currency m⁻²', note: 'At ' + GFC.fixed(pCrop, 2) + ' per kg' });
        rows.push({ label: 'Margin', value: GFC.fixed(margin, 2), unit: 'currency m⁻²', note: 'Revenue − electricity + heat credit' });
        rows.push({ label: 'Unlit crop value needed to break even', value: GFC.fixed(breakEvenCropValue, 2), unit: 'currency m⁻²', note: 'At this light fraction and elasticity' });
      }

      return {
        headline: [
          { label: 'Light fraction', value: windowless ? '∞' : GFC.fixed(phi, 2), unit: '',
            hint: windowless ? 'No daylight to compare against' : 'Lamp DLI over solar DLI inside' },
          { label: 'Installed power', value: GFC.fixed(pLamp, 0), unit: 'W m⁻²',
            hint: GFC.fixed(heatW, 0) + ' W m⁻² of it becomes heat' },
          { label: 'Electricity', value: GFC.fixed(kwhPerM2, 1), unit: 'kWh m⁻²',
            hint: GFC.fixed(elecCost, 2) + ' per m² over the cycle' },
          { label: 'Margin', value: windowless ? '--' : GFC.fixed(margin, 2), unit: 'per m²',
            hint: windowless ? 'Needs a crop price and a yield' : (margin >= 0 ? 'Worth installing at these prices' : 'Does not pay at these prices') }
        ],
        flags: flags,
        rows: rows,
        caption: 'Margin against fixture efficacy at these prices and this light fraction. The '
               + 'electricity term falls as efficacy rises while the yield term does not move, '
               + 'which is the whole history of supplementary lighting in one curve.',
        _v: { eff: eff, dliLamp: dliLamp, days: days, pEl: pEl, pCrop: pCrop, yUnlit: yUnlit,
              epsL: epsL, phi: phi, windowless: windowless, fPar: fPar, ppfd: ppfd,
              hours: hours, heatUse: heatUse, pHeat: pHeat, margin: margin }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;

      var marginAt = function (eff) {
        var kwh = st.dliLamp * st.days / (3.6 * eff);
        var pLamp = st.ppfd / eff;
        var heatKwh = pLamp * (1 - st.fPar) * st.hours * st.days / 1000;
        var credit = heatKwh * st.heatUse * st.pHeat;
        if (st.windowless) return -(st.pEl * kwh) + credit;
        return st.pCrop * st.yUnlit * (Math.pow(1 + st.phi, st.epsL) - 1) - st.pEl * kwh + credit;
      };

      var lo = marginAt(0.8), hi = marginAt(4.0);
      var nc = S.nice(Math.min(lo, hi, 0), Math.max(lo, hi, 0), 4);
      var sx = S.scale(0.8, 4.0, L, L + PW);
      var sy = S.scale(nc.min, nc.max, T + PH, T);

      var g = S.open(W, H, 'Margin against fixture efficacy');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0.8, xMax: 4.0, yMin: nc.min, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 1); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Fixture efficacy (µmol J⁻¹)',
        yLabel: 'Margin over the cycle (per m²)'
      });

      if (nc.min < 0 && nc.max > 0) {
        g += S.line(L, sy(0), L + PW, sy(0), pal.axis, 1.4);
      }
      var d = '', e, first = true;
      for (e = 0.8; e <= 4.0001; e += 0.02) {
        d += (first ? 'M' : 'L') + sx(e).toFixed(1) + ' ' + sy(Math.max(nc.min, Math.min(nc.max, marginAt(e)))).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      /* the two reference lamps, marked outside the curve */
      [[1.85, 'HPS'], [3.0, 'LED']].forEach(function (pair) {
        g += S.line(sx(pair[0]), T, sx(pair[0]), T + PH, pal.line, 1.2, '3 3');
        g += S.text(sx(pair[0]) + 4, T + 12, pair[1], { size: 10, fill: pal.soft });
      });

      var px = sx(Math.max(0.8, Math.min(4.0, st.eff)));
      var py = sy(Math.max(nc.min, Math.min(nc.max, marginAt(st.eff))));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py - 8, GFC.fixed(marginAt(st.eff), 2) + ' per m²',
        { size: 11, fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'margin at these prices', colour: pal.accent, dash: null },
        { label: 'reference lamps', colour: pal.line, dash: '3 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Stage one. The lamp contribution relative to the solar contribution at canopy '
            + 'level:',
        math: 'φ<sub>lamp</sub> = DLI<sub>lamp</sub> / DLI<sub>sol</sub> '
            + '= 0.0036 PPFD<sub>lamp</sub> t<sub>h</sub> / (2 τ<sub>gh</sub> R<sub>s</sub>)',
        note: 'R_s is the daily global irradiation outside in MJ m⁻² d⁻¹ and the factor 2 is the '
            + 'global-radiation photon conversion. Below about 0.1 the lamp is not material; '
            + 'around 0.5 it adds half again and the cycle can be shortened.' },
      { lead: 'Stage two. The yield gained against the electricity bought:',
        math: 'margin = p<sub>crop</sub> Y [(1 + φ<sub>lamp</sub>)<sup>ε<sub>L</sub></sup> − 1] '
            + '− p<sub>el</sub> DLI<sub>lamp</sub> n<sub>d</sub> / (3.6 ε<sub>lamp</sub>)',
        note: 'The 3.6 converts mol per µmol J⁻¹ to kWh. The lamp electricity term is independent '
            + 'of the crop and the yield term is not, which is why the same installation pays in '
            + 'roses and not in lettuce at the same latitude.' },
      { lead: 'The heat an LED does not give you. Substituting at equal photon flux means equal '
            + 'f_PAR·P, so installed power falls in the ratio of the efficacies:',
        math: 'ΔH<sub>h</sub> = P<sub>HPS</sub>(1 − f<sub>PAR,HPS</sub>) − P<sub>LED</sub>(1 − f<sub>PAR,LED</sub>), '
            + '&nbsp;&nbsp; P<sub>LED</sub>/P<sub>HPS</sub> = ε<sub>HPS</sub>/ε<sub>LED</sub>',
        note: 'At 200 µmol m⁻² s⁻¹ substituted from 1.85 to 3.0 µmol J⁻¹, installed power falls '
            + 'from 108 to 67 W m⁻², saving 41 W m⁻² of electricity and giving back 38 W m⁻² of '
            + 'heating demand during lit hours. The direct radiative cooling of the canopy is '
            + 'small, about 0.15 K; the large effect is on the house, not on the leaf.' },
      { lead: 'The ceiling on efficacy, which no fixture can pass:',
        math: 'ε<sub>max</sub> = 1 / E<sub>µmol</sub> = λ[nm] / 120 &nbsp; µmol J⁻¹',
        note: 'About 4.6 µmol J⁻¹ at 550 nm even at perfect electrical efficiency.' }
    ],

    caveats: [
      'The yield response here is the elasticity applied to the light fraction. The "1 % rule" is '
        + 'a good approximation for fruit crops and a poorer one for crops whose value depends on '
        + 'morphology rather than mass.',
      'Red light alone produces malformed plants, so a blue component is always included. A '
        + 'spectrum that tops a weighted photon count can still fail the morphological '
        + 'requirements, and this calculation says nothing about spectrum.',
      'Whether the lamp heat is worth anything is the spark-spread question, not a lighting '
        + 'question. In a heating-dominated house in winter it is largely useful; in a closed '
        + 'house it is useful only until the buffer is full; in an indoor farm it is always a '
        + 'cooling duty and sets installed cooling capacity directly.',
      'Water-cooled fixtures move the heat out of the greenhouse air and into a buffer, which '
        + 'changes the answer and is not modelled here.'
    ],

    sources: ['dueck2012led', 'katzin2021lighting', 'graamans2018', 'marcelis2006', 'stanghellini2024darkside', 'thimijan1983'],
    provenance: 'Sections 4.2, 4.3, 4.5 and 4.6 of "Greenhouse parameters and equations". The '
              + 'defaults are that section’s worked tomato-seedling case, which gives a light '
              + 'fraction near 0.5, 32 kWh m⁻² and 6.4 per m² of electricity over 30 days.'
  });
}());

