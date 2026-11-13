
(function () {
  'use strict';
  var S = GFC.svgns;
  var RHO_CP = 1200;      /* J m-3 K-1 */

  GFC.mount({
    slug: 'energy-balance',
    kicker: 'Greenhouse climate',
    name: 'Greenhouse temperature excess and the ventilation curve',
    lede: 'An unventilated greenhouse sits at whatever temperature closes its energy balance. '
        + 'Opening the vents pulls it down a hyperbola whose slope is steepest at the start, '
        + 'which is why all the useful cooling is bought cheaply and the last few degrees are '
        + 'very expensive indeed.',
    inputNote: 'Two results here are routinely got wrong: whenever ventilation is sufficient '
             + 'shading is unnecessary, and 50 % whitewash does not halve the temperature excess.',

    inputs: [
      { id: 'isun', label: 'Global radiation outside', unit: 'W m⁻²', value: 800, step: 10, min: 0, max: 1200 },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.65, step: 0.01, min: 0.2, max: 0.95 },
      { id: 'shade', label: 'Shading in place', unit: '–', value: 0, step: 0.05, min: 0, max: 0.8,
        help: 'Fraction of the transmitted radiation removed by whitewash or screen.' },
      { id: 'tout', label: 'Outside air temperature', unit: '°C', value: 30, step: 0.5, min: -20, max: 50 },

      { id: 'ucov', label: 'Cover heat transfer coefficient', unit: 'W m⁻² K⁻¹', value: 7.0, step: 0.1, min: 0.5, max: 15,
        group: 'The envelope' },
      { id: 'ratio', label: 'Cover-to-floor area ratio', unit: '–', value: 1.2, step: 0.01, min: 0.8, max: 2.5 },
      { id: 'alphaR', label: 'Linearised radiative coefficient', unit: 'W m⁻² K⁻¹', value: 6.0, step: 0.1, min: 2, max: 10,
        help: 'About 6 W m⁻² per kelvin of difference between bodies at terrestrial temperatures.' },
      { id: 'viewsky', label: 'View factor to the sky', unit: '–', value: 0.5, step: 0.05, min: 0.1, max: 1,
        help: 'For a house in an open field the sky is half the horizon, and the soil the other half.' },
      { id: 'epscov', label: 'Cover emissivity', unit: '–', value: 0.9, step: 0.01, min: 0.1, max: 1 },
      { id: 'alphasoil', label: 'Soil heat transfer coefficient', unit: 'W m⁻² K⁻¹', value: 5.0, step: 0.1, min: 0.5, max: 20 },

      { id: 'ach', label: 'Air exchange rate', unit: 'h⁻¹', value: 20, step: 0.5, min: 0, max: 80, group: 'Ventilation' },
      { id: 'height', label: 'Mean internal height', unit: 'm', value: 4.5, step: 0.1, min: 1, max: 20 },
      { id: 'latshare', label: 'Latent share of the ventilation enthalpy', unit: '–', value: 0.55, step: 0.05, min: 0, max: 0.95,
        help: 'The fraction of the enthalpy difference the vented air carries as vapour rather than as sensible heat. Two to three times the sensible term in a cooling-dominated house, which is why the same ventilation rate behaves so differently in the tropics and in the Netherlands.' }
    ],

    compute: function (v) {
      var iSun = GFC.need(v.isun, 'Global radiation', { min: 0 });
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var shade = GFC.need(v.shade, 'Shading', { min: 0, max: 0.8 });
      var tOut = GFC.need(v.tout, 'Outside air temperature');
      var uCov = GFC.need(v.ucov, 'Cover heat transfer coefficient', { positive: true });
      var ratio = GFC.need(v.ratio, 'Cover-to-floor area ratio', { positive: true });
      var alphaR = GFC.need(v.alphaR, 'Radiative coefficient', { positive: true });
      var viewSky = GFC.need(v.viewsky, 'View factor to the sky', { positive: true, max: 1 });
      var epsCov = GFC.need(v.epscov, 'Cover emissivity', { positive: true, max: 1 });
      var alphaSoil = GFC.need(v.alphasoil, 'Soil heat transfer coefficient', { positive: true });
      var ach = GFC.need(v.ach, 'Air exchange rate', { min: 0 });
      var height = GFC.need(v.height, 'Mean internal height', { positive: true });
      var latShare = GFC.need(v.latshare, 'Latent share', { min: 0, max: 0.95 });

      /* Sigma: the sum of the loss conductances of the unventilated case. */
      var viewSoil = 1 - viewSky;
      var sigma = viewSky * epsCov * alphaR + ratio * uCov + viewSoil * alphaR + alphaSoil;
      var absorbed = iSun * tau * (1 - shade);
      var excessUnvent = absorbed / sigma;

      /* The ventilation conductance, with the latent term folded in as the
       * compendium's hyperbola does. */
      var gv = ach * height / 3600;
      var ventCond = gv * RHO_CP / (1 - latShare);     /* effective W m-2 K-1 */
      var excess = absorbed / (sigma + ventCond);
      var tIn = tOut + excess;
      var ratioToUnvent = excessUnvent > 0 ? excess / excessUnvent : 1;

      /* What the same drop would have cost in shading instead, which is the
       * comparison the compendium insists on. */
      var shadeForSameDrop = excessUnvent > 0 ? 1 - excess / excessUnvent : 0;

      /* The marginal value of ventilation: the slope of the hyperbola. */
      var dExcess_dGv = -absorbed * (RHO_CP / (1 - latShare)) / Math.pow(sigma + ventCond, 2);
      var perAch = dExcess_dGv * height / 3600;

      var flags = [];
      if (ach === 0) flags.push({ head: 'Unventilated.',
        text: 'This is the reference case: ' + GFC.fixed(excessUnvent, 1) + ' K above outside. At night the same balance says an unheated house can be warmer than outside only to the extent that the soil is warm and the radiative loss to the sky is made small, and the sky is always much colder than surface air.' });
      if (ach > 0) flags.push({ head: 'Ventilation has removed ' + GFC.fixed(excessUnvent - excess, 1) + ' K of ' + GFC.fixed(excessUnvent, 1) + '.',
        text: 'The next air change buys ' + GFC.fixed(Math.abs(perAch), 3) + ' K. At low rates the same increment buys far more: the slope is steepest near zero, so all the useful cooling is bought cheaply and the last few degrees are very expensive.' });
      if (shade > 0) flags.push({ head: 'Shading is the lesser evil, not a first choice.',
        text: 'The drop this ' + GFC.pct(shade, 0) + ' shade delivers could have been had by ventilating harder, at no cost in light. Design maximum ventilation capacity in first; whenever ventilation is sufficient, shading is unnecessary.' });
      if (shade === 0 && excess > 6) flags.push({ head: 'Shading would need to be ' + GFC.pct(shadeForSameDrop, 0) + ' to match this ventilation rate.',
        text: 'And halving the radiation does not halve the excess, because the outgoing losses shrink as the house cools and the crop transpires less, removing some of its own cooling.' });
      if (latShare > 0.6) flags.push({ head: 'Latent-dominated ventilation.',
        text: 'At a latent share of ' + GFC.fixed(latShare, 2) + ' most of the enthalpy leaving through the vents is vapour. The latent term outweighs the sensible term by two to three times in a cooling-dominated house and by less than half as much in a heating-dominated one.' });

      return {
        headline: [
          { label: 'Inside temperature', value: GFC.fixed(tIn, 1), unit: '°C',
            hint: GFC.fixed(excess, 1) + ' K above outside' },
          { label: 'Unventilated excess', value: GFC.fixed(excessUnvent, 1), unit: 'K',
            hint: 'The reference case, vents shut' },
          { label: 'Excess remaining', value: GFC.pct(ratioToUnvent, 0), unit: '',
            hint: 'Of the unventilated excess' },
          { label: 'Next air change buys', value: GFC.fixed(Math.abs(perAch), 3), unit: 'K',
            hint: 'The slope of the hyperbola here' }
        ],
        flags: flags,
        rows: [
          { label: 'Transmitted radiation', value: GFC.fixed(iSun * tau, 1), unit: 'W m⁻²', note: 'I_sun τ_gh' },
          { label: 'After shading', value: GFC.fixed(absorbed, 1), unit: 'W m⁻²', note: '× (1 − shade)' },
          { label: 'Radiative loss to the sky', value: GFC.fixed(viewSky * epsCov * alphaR, 3), unit: 'W m⁻² K⁻¹', note: 'F ε α_R' },
          { label: 'Loss through the cover', value: GFC.fixed(ratio * uCov, 3), unit: 'W m⁻² K⁻¹', note: '(A_c/A_s) α_cover' },
          { label: 'Radiative exchange with the soil', value: GFC.fixed(viewSoil * alphaR, 3), unit: 'W m⁻² K⁻¹', note: 'F α_R' },
          { label: 'Conduction to the soil', value: GFC.fixed(alphaSoil, 3), unit: 'W m⁻² K⁻¹', note: 'α_soil' },
          { label: 'Total loss conductance Σ', value: GFC.fixed(sigma, 3), unit: 'W m⁻² K⁻¹', note: 'The sum of the four above' },
          { label: 'Unventilated temperature excess', value: GFC.fixed(excessUnvent, 3), unit: 'K', note: 'Absorbed radiation ÷ Σ' },
          { label: 'Specific ventilation rate g_V', value: GFC.sig(gv, 4), unit: 'm s⁻¹', note: 'N h / 3600' },
          { label: 'Effective ventilation conductance', value: GFC.fixed(ventCond, 3), unit: 'W m⁻² K⁻¹', note: 'g_V ρ c_p / (1 − latent share)' },
          { label: 'Ventilated temperature excess', value: GFC.fixed(excess, 3), unit: 'K', note: 'Absorbed ÷ (Σ + ventilation)' },
          { label: 'Inside temperature', value: GFC.fixed(tIn, 2), unit: '°C', note: 'Outside plus the excess' },
          { label: 'Fraction of the unventilated excess left', value: GFC.fixed(ratioToUnvent, 4), unit: '–', note: 'Σ / (Σ + ventilation)' },
          { label: 'Shading that would match this ventilation', value: GFC.pct(shadeForSameDrop, 1), unit: '', note: 'For the same drop, at the cost of the light' },
          { label: 'Marginal cooling per air change', value: GFC.fixed(perAch, 4), unit: 'K per h⁻¹', note: 'Negative; the slope at this rate' },
          { label: 'Sensible heat vented', value: GFC.fixed(gv * RHO_CP * excess, 1), unit: 'W m⁻²', note: 'g_V ρ c_p ΔT' },
          { label: 'Latent heat vented', value: GFC.fixed(gv * RHO_CP * excess * latShare / (1 - latShare), 1), unit: 'W m⁻²', note: 'At the stated latent share' }
        ],
        caption: 'The ventilation hyperbola. It equals one at zero ventilation by definition and '
               + 'approaches zero as the rate rises, and the slope is steepest at the left-hand end.',
        _v: { sigma: sigma, absorbed: absorbed, height: height, latShare: latShare,
              ach: ach, excessUnvent: excessUnvent, excess: excess }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;
      var achMax = Math.max(40, Math.ceil(st.ach * 1.4));
      var sx = S.scale(0, achMax, L, L + PW);
      var nc = S.nice(0, st.excessUnvent, 4);
      var sy = S.scale(0, nc.max, T + PH, T);

      var excessAt = function (n) {
        var gv = n * st.height / 3600;
        return st.absorbed / (st.sigma + gv * 1200 / (1 - st.latShare));
      };

      var g = S.open(W, H, 'Temperature excess against air exchange rate');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: achMax, yMin: 0, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Air exchange rate (h⁻¹)',
        yLabel: 'Temperature excess above outside (K)'
      });

      var d = '', n, first = true;
      for (n = 0; n <= achMax; n += achMax / 240) {
        d += (first ? 'M' : 'L') + sx(n).toFixed(1) + ' ' + sy(Math.min(excessAt(n), nc.max)).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      /* the same house at 50 % shading, so the comparison is on the page */
      var d2 = '', first2 = true;
      for (n = 0; n <= achMax; n += achMax / 240) {
        var gv = n * st.height / 3600;
        var e = st.absorbed * 0.5 / (st.sigma + gv * 1200 / (1 - st.latShare));
        d2 += (first2 ? 'M' : 'L') + sx(n).toFixed(1) + ' ' + sy(Math.min(e, nc.max)).toFixed(1);
        first2 = false;
      }
      g += S.path(d2, pal.series[2], 1.6, null, '5 3');

      var px = sx(Math.min(st.ach, achMax)), py = sy(Math.min(st.excess, nc.max));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py - 8, GFC.fixed(st.excess, 1) + ' K',
        { size: 11, fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'as configured', colour: pal.accent, dash: null },
        { label: 'with half the radiation', colour: pal.series[2], dash: '5 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'For an empty, unheated, unventilated greenhouse at equilibrium, the transmitted '
            + 'radiation equals the losses to sky, outside air and soil:',
        math: 'τI<sub>sun</sub> = F<sub>sky</sub>ε<sub>cov</sub>α<sub>R</sub>(T−T<sub>sky</sub>) '
            + '+ (A<sub>c</sub>/A<sub>s</sub>)α<sub>cov</sub>(T−T<sub>out</sub>) '
            + '+ F<sub>soil</sub>ε<sub>soil</sub>α<sub>R</sub>(T−T<sub>soil</sub>) '
            + '+ α<sub>soil</sub>(T−T<sub>soil</sub>)',
        note: 'For a house in an open field the sky is half the horizon, so F_sky = F_soil = 0.5. '
            + 'Collecting the coefficients gives Σ and the excess is the absorbed radiation over Σ.' },
      { lead: 'Adding the enthalpy ventilation carries out turns that into a hyperbola:',
        math: '(T<sub>in</sub>−T<sub>out</sub>)/(T<sub>unvent</sub>−T<sub>out</sub>) '
            + '= Σ / (Σ + g<sub>V</sub>[ρc<sub>p</sub> + L(χ<sub>in</sub>−χ<sub>out</sub>)/(T<sub>in</sub>−T<sub>out</sub>)])',
        note: 'It equals 1 at g_V = 0 by definition and approaches 0 as g_V → ∞. The slope is '
            + 'steepest near zero: raising the rate from 0.01 to 0.02 m s⁻¹ lowers the '
            + 'temperature far more than raising it from 10.01 to 10.02.' },
      { lead: 'The energy a cubic metre of exchanged air removes is an enthalpy difference, not a '
            + 'temperature difference:',
        math: 'energy = ρc<sub>p</sub>(T<sub>in</sub>−T<sub>out</sub>) + L(χ<sub>in</sub>−χ<sub>out</sub>)',
        note: 'The latent term is two to three times the sensible one in a cooling-dominated '
            + 'house, which is why the same ventilation rate removes very different proportions '
            + 'of the two loads in the tropics and in the Netherlands.' },
      { lead: 'As a closure statement, the annual budget is what makes a published Sankey diagram '
            + 'checkable:',
        math: 'Q<sub>heat</sub> + τ∫I dt + Q<sub>lamp</sub> + Q<sub>CO₂</sub> '
            + '= Q<sub>cover</sub> + Q<sub>vent,sens</sub> + Q<sub>vent,lat</sub> + Q<sub>soil</sub> + ΔU<sub>store</sub>' }
    ],

    caveats: [
      'This is a steady-state balance for an empty house, with the crop entering only through the '
        + 'latent share of the vented enthalpy. A cropped house transpires, and that transpiration '
        + 'changes with the radiation and the humidity, so the latent share is not a constant.',
      'The soil term is treated as a conductance to a fixed soil temperature. Over a day the soil '
        + 'stores and releases heat, and the stored term is what lets an unheated house stay above '
        + 'outside at night.',
      'Sky temperature is inside the radiative conductance here rather than entered separately. '
        + 'On a clear night the sky can be 50 K below the cover and the radiative term dominates '
        + 'everything else; the long-wave calculator handles that case properly.'
    ],

    sources: ['stanghellini2019', 'vanthoor2011', 'monteith2013', 'baille2001whitening'],
    provenance: 'Sections 6.1, 6.2 and 6.3 of "Greenhouse parameters and equations".'
  });
}());

