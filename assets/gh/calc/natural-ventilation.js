
(function () {
  'use strict';
  var S = GFC.svgns;
  var GRAV = 9.81;

  GFC.mount({
    slug: 'natural-ventilation',
    kicker: 'Greenhouse climate',
    name: 'Natural ventilation and the insect-screen penalty',
    lede: 'Wind and buoyancy drive natural ventilation together, and which one is in charge '
        + 'changes with wind speed and vent height. This gives the ventilation rate from the '
        + 'vent geometry, says which driver dominates, and prices the insect screen in vent area.',
    inputNote: 'A house sized on a bare-vent discharge coefficient and then screened against '
             + 'thrips has lost more than half its ventilation capacity, and no control strategy '
             + 'recovers it.',

    inputs: [
      { id: 'floor', label: 'Floor area', unit: 'm²', value: 1000, step: 10, min: 10, max: 200000, group: 'House' },
      { id: 'height', label: 'Mean internal height', unit: 'm', value: 4.5, step: 0.1, min: 1, max: 20 },
      { id: 'aroof', label: 'Roof vent area', unit: 'm²', value: 150, step: 5, min: 0, max: 40000, group: 'Vents' },
      { id: 'aside', label: 'Side vent area', unit: 'm²', value: 60, step: 5, min: 0, max: 40000 },
      { id: 'ventH', label: 'Vertical vent opening height', unit: 'm', value: 1.0, step: 0.1, min: 0.05, max: 6,
        help: 'The height over which the stack pressure acts. It raises the crossover wind speed, so a tall opening stays buoyancy-driven to higher wind.' },
      { id: 'cd', label: 'Discharge coefficient C_d', unit: '–', value: 0.65, step: 0.01, min: 0.3, max: 0.9,
        help: 'Measured 0.65 to 0.70 for greenhouse roof vents (Bot), 0.65 to 0.75 (De Jong), 0.644 for continuous vents (Boulard and Baille).' },
      { id: 'cw', label: 'Wind coefficient C_w', unit: '–', value: 0.10, step: 0.005, min: 0.03, max: 0.25,
        help: 'Essentially independent of greenhouse area over two orders of magnitude, but it falls significantly as wind speed rises, so a C_w fitted in one wind range must not be carried to another.' },

      { id: 'u', label: 'Wind speed', unit: 'm s⁻¹', value: 2.0, step: 0.1, min: 0, max: 20, group: 'Conditions' },
      { id: 'dT', label: 'Inside minus outside temperature', unit: 'K', value: 5, step: 0.5, min: 0, max: 30 },
      { id: 'tout', label: 'Outside temperature', unit: '°C', value: 20, step: 0.5, min: -30, max: 50 },

      { id: 'por', label: 'Insect screen porosity', unit: '–', value: 1.00, type: 'select',
        group: 'Insect screen',
        options: [
          { v: 1.00, label: 'No screen' },
          { v: 0.40, label: 'Anti-aphid, porosity 0.40' },
          { v: 0.25, label: 'Anti-thrips, porosity 0.25' },
          { v: 0.60, label: 'Open mesh, porosity 0.60' },
          { v: 0.15, label: 'Very fine mesh, porosity 0.15' }
        ] }
    ],

    compute: function (v) {
      var floor = GFC.need(v.floor, 'Floor area', { positive: true });
      var h = GFC.need(v.height, 'Mean internal height', { positive: true });
      var ar = GFC.need(v.aroof, 'Roof vent area', { min: 0 });
      var as = GFC.need(v.aside, 'Side vent area', { min: 0 });
      var hv = GFC.need(v.ventH, 'Vent opening height', { positive: true });
      var cd = GFC.need(v.cd, 'Discharge coefficient', { positive: true });
      var cw = GFC.need(v.cw, 'Wind coefficient', { positive: true });
      var u = GFC.need(v.u, 'Wind speed', { min: 0 });
      var dT = GFC.need(v.dT, 'Temperature difference', { min: 0 });
      var tout = GFC.need(v.tout, 'Outside temperature');
      var por = GFC.need(v.por, 'Screen porosity', { positive: true, max: 1 });

      if (ar + as <= 0) throw new Error('Roof vent area and side vent area cannot both be zero.');

      var t0 = tout + 273.15;
      var buoy = 2 * GRAV * dT / t0;

      /* 9.3, roof and side vents together (Kittas). With one set closed the
       * expression collapses to the single-opening combined form. */
      var q;
      if (ar > 0 && as > 0) {
        var pair = Math.pow(ar * as, 2) / (ar * ar + as * as);
        var mean = Math.pow((ar + as) / 2, 2);
        q = cd * Math.sqrt(buoy * pair + mean * cw * u * u);
      } else {
        var a = ar > 0 ? ar : as;
        q = (a / 2) * cd * Math.sqrt(buoy * hv / 4 + cw * u * u);
      }

      /* 9.5 the screen penalty, applied to the rate */
      var screenFactor = por * (2 - por);
      var qScreened = q * screenFactor;
      var areaMultiplier = 1 / screenFactor;

      var gv = qScreened / floor;                  /* m3 m-2 s-1, i.e. m s-1 */
      var ach = gv * 3600 / h;
      var gvBare = q / floor;
      var achBare = gvBare * 3600 / h;

      /* 9.4 which driver is in charge */
      var lambda = (buoy * hv / 4) / Math.max(cw * u * u, 1e-12);
      var uCross = Math.sqrt(GRAV * dT * hv / (2 * t0 * cw));

      /* 9.5 the pressure-loss coefficient tied to C_d, and the two Forchheimer
       * material correlations, which disagree where it matters most. */
      var k = 1 / (cd * cd);
      var K1 = 3.44e-9 * Math.pow(por, 1.6);
      var Y1 = 4.3e-2 * Math.pow(por, -2.13);
      var K2 = 5.68e-8 * Math.pow(por, 3.68);
      var Y2 = 5.67e-2 * Math.pow(por, -1.1604);

      var flags = [];
      if (por < 1) flags.push({ head: 'The screen costs ' + GFC.pct(1 - screenFactor, 0) + ' of the ventilation rate.',
        text: 'To hold the unscreened rate the vent area has to be multiplied by ' + GFC.fixed(areaMultiplier, 2) + '. A tall crop obstructing the openings does the same thing.' });
      if (lambda > 3) flags.push({ head: 'Buoyancy-driven.',
        text: 'Λ = ' + GFC.sig(lambda, 2) + '. The stack effect dominates below about ' + GFC.fixed(uCross, 2) + ' m s⁻¹ at this vent height and temperature difference.' });
      else if (lambda < 0.33) flags.push({ head: 'Wind-driven.',
        text: 'Λ = ' + GFC.sig(lambda, 2) + '. Above about 2 m s⁻¹ wind dominates and the ventilation rate is linear in wind speed.' });
      else flags.push({ head: 'Both drivers matter.',
        text: 'Λ = ' + GFC.sig(lambda, 2) + ', close to the crossover at ' + GFC.fixed(uCross, 2) + ' m s⁻¹. Neither a wind-only nor a stack-only formula is safe here.' });
      if (u === 0 && dT === 0) flags.push({ head: 'No driver at all.',
        text: 'With no wind and no temperature difference there is no natural ventilation, only leakage.' });
      if (ach > 60) flags.push({ head: GFC.fixed(ach, 0) + ' air changes per hour.',
        text: 'Check the vent areas. Pad-and-fan houses run up to about 20 h⁻¹ and naturally ventilated houses rarely exceed 60.' });

      return {
        headline: [
          { label: 'Ventilation rate', value: GFC.fixed(qScreened, 1), unit: 'm³ s⁻¹',
            hint: GFC.fixed(ach, 1) + ' air changes per hour' },
          { label: 'Specific rate g_V', value: GFC.sig(gv, 3), unit: 'm s⁻¹',
            hint: 'Per m² of floor' },
          { label: 'Crossover wind speed', value: GFC.fixed(uCross, 2), unit: 'm s⁻¹',
            hint: 'Below this, buoyancy is in charge' },
          { label: 'Screen vent-area penalty', value: GFC.fixed(areaMultiplier, 2), unit: '×',
            hint: por === 1 ? 'No screen fitted' : 'Multiply vent area by this to recover' }
        ],
        flags: flags,
        rows: [
          { label: 'Ventilation rate, bare vents', value: GFC.fixed(q, 2), unit: 'm³ s⁻¹', note: 'Before any screen' },
          { label: 'Ventilation rate, screened', value: GFC.fixed(qScreened, 2), unit: 'm³ s⁻¹', note: '× ε(2 − ε)' },
          { label: 'Air changes, bare vents', value: GFC.fixed(achBare, 2), unit: 'h⁻¹', note: 'g_V × 3600 / h' },
          { label: 'Air changes, screened', value: GFC.fixed(ach, 2), unit: 'h⁻¹', note: 'At mean height ' + GFC.fixed(h, 1) + ' m' },
          { label: 'Specific rate g_V', value: GFC.sig(gv, 4), unit: 'm s⁻¹', note: 'The unit the energy and vapour balances use' },
          { label: 'Screen transmission factor', value: GFC.fixed(screenFactor, 3), unit: '–', note: 'ε_por (2 − ε_por)' },
          { label: 'Vent area multiplier needed', value: GFC.fixed(areaMultiplier, 3), unit: '×', note: 'Reciprocal of the factor' },
          { label: 'Buoyancy term', value: GFC.sig(buoy * hv / 4, 3), unit: 'm² s⁻²', note: '2 g ΔT H / (4 T₀)' },
          { label: 'Wind term', value: GFC.sig(cw * u * u, 3), unit: 'm² s⁻²', note: 'C_w u²' },
          { label: 'Driver ratio Λ', value: GFC.sig(lambda, 3), unit: '–', note: '≫ 1 buoyancy, ≪ 1 wind' },
          { label: 'Crossover wind speed', value: GFC.fixed(uCross, 3), unit: 'm s⁻¹', note: 'Where Λ = 1' },
          { label: 'Pressure-loss coefficient k', value: GFC.fixed(k, 3), unit: '–', note: '1 / C_d²' },
          { label: 'Screen permeability K, Miguel', value: GFC.sig(K1, 3), unit: 'm²', note: '3.44 × 10⁻⁹ ε^1.6' },
          { label: 'Screen permeability K, Teitel', value: GFC.sig(K2, 3), unit: 'm²', note: '5.68 × 10⁻⁸ ε^3.68' },
          { label: 'Inertial factor Y, Miguel', value: GFC.sig(Y1, 3), unit: '–', note: '4.3 × 10⁻² ε^−2.13' },
          { label: 'Inertial factor Y, Teitel', value: GFC.sig(Y2, 3), unit: '–', note: '5.67 × 10⁻² ε^−1.1604' }
        ],
        caption: 'Ventilation rate against wind speed at this temperature difference. The '
               + 'crossover marks where wind overtakes buoyancy as the driver; below it the curve '
               + 'is flat, above it close to linear.',
        _v: { cd: cd, cw: cw, buoy: buoy, hv: hv, ar: ar, as: as, floor: floor, h: h,
              screenFactor: screenFactor, u: u, uCross: uCross, por: por }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 350, L = 66, T = 14, PW = W - L - 30, PH = H - T - 72;

      var rate = function (u) {
        var q;
        if (st.ar > 0 && st.as > 0) {
          var pair = Math.pow(st.ar * st.as, 2) / (st.ar * st.ar + st.as * st.as);
          var mean = Math.pow((st.ar + st.as) / 2, 2);
          q = st.cd * Math.sqrt(st.buoy * pair + mean * st.cw * u * u);
        } else {
          var a = st.ar > 0 ? st.ar : st.as;
          q = (a / 2) * st.cd * Math.sqrt(st.buoy * st.hv / 4 + st.cw * u * u);
        }
        return q / st.floor * 3600 / st.h;
      };

      var uMax = Math.max(8, Math.ceil(st.u * 1.4));
      var top = Math.max(rate(uMax), rate(0) * 1.2);
      var nc = S.nice(0, top, 4);
      var sx = S.scale(0, uMax, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Air changes per hour against wind speed');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: uMax, yMin: 0, yMax: nc.max,
        xTicks: uMax <= 10 ? uMax : 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Wind speed (m s⁻¹)',
        yLabel: 'Air changes per hour'
      });

      var dBare = '', dScr = '', uu, first = true;
      for (uu = 0; uu <= uMax + 1e-9; uu += uMax / 120) {
        var y = rate(uu);
        dBare += (first ? 'M' : 'L') + sx(uu).toFixed(1) + ' ' + sy(Math.min(y, nc.max)).toFixed(1);
        dScr += (first ? 'M' : 'L') + sx(uu).toFixed(1) + ' ' + sy(Math.min(y * st.screenFactor, nc.max)).toFixed(1);
        first = false;
      }
      g += S.path(dBare, pal.series[1], 2, null, st.por === 1 ? null : '5 3');
      if (st.por < 1) g += S.path(dScr, pal.accent, 2.4);

      if (st.uCross <= uMax) {
        g += S.line(sx(st.uCross), T, sx(st.uCross), T + PH, pal.warn, 1.3, '3 3');
        g += S.text(sx(st.uCross) + 4, T + 12, 'crossover', { size: 10, fill: pal.warn });
      }
      var px = sx(Math.min(st.u, uMax));
      var py = sy(Math.min(rate(st.u) * st.screenFactor, nc.max));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py - 7, GFC.fixed(rate(st.u) * st.screenFactor, 1) + ' h⁻¹',
        { size: 11, fill: pal.ink, weight: 600 });

      var items = st.por < 1
        ? [{ label: 'bare vents', colour: pal.series[1], dash: '5 3' },
           { label: 'with the screen', colour: pal.accent, dash: null },
           { label: 'wind/buoyancy crossover', colour: pal.warn, dash: '3 3' }]
        : [{ label: 'ventilation rate', colour: pal.series[1], dash: null },
           { label: 'wind/buoyancy crossover', colour: pal.warn, dash: '3 3' }];
      g += S.legend(L, H - 10, items, pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Everything follows from a pressure drop and a discharge coefficient. For roof and '
            + 'side vents acting together:',
        math: 'Q = C<sub>d</sub> √[ (2 g ΔT / T₀) · (A<sub>r</sub>A<sub>s</sub>)² / (A<sub>r</sub>² + A<sub>s</sub>²) '
            + '+ ((A<sub>r</sub>+A<sub>s</sub>)/2)² C<sub>w</sub> u² ]',
        note: 'With only one set of vents open this collapses to the single-opening combined form, '
            + 'Q = (A/2) C_d √(2gΔT H / 4T₀ + C_w u²), which is what this page uses in that case.' },
      { lead: 'Which driver is in charge is the ratio of the two terms under the root:',
        math: 'Λ = 2 g ΔT H / (4 T₀ C<sub>w</sub> u²), &nbsp;&nbsp; '
            + 'u<sub>cross</sub> = √( g ΔT H / (2 T₀ C<sub>w</sub>) )',
        note: 'At ΔT = 5 K, H = 1.0 m, T₀ = 293 K and C_w = 0.10 the crossover is 0.91 m s⁻¹. '
            + 'This reproduces the published thresholds of about 1 m s⁻¹ for roof-vent-only houses '
            + 'and about 2 m s⁻¹ generally from the geometry rather than from a rule of thumb.' },
      { lead: 'The insect-screen penalty, and the vent area it costs:',
        math: 'g<sub>V,screen</sub> / g<sub>V</sub> = ε<sub>por</sub> (2 − ε<sub>por</sub>)',
        note: 'Anti-thrips at porosity 0.25 loses 56 % of the rate and needs 2.3 times the vent '
            + 'area; anti-aphid at 0.40 loses 36 % and needs 1.6 times. This supersedes the '
            + 'qualitative statement that nets "reduce C_d greatly".' },
      { lead: 'Air-exchange units convert through the mean height only:',
        math: 'g<sub>V</sub> [m s⁻¹] = N [h⁻¹] × h [m] / 3600',
        note: 'Getting this conversion wrong by the factor h is a common and large error, because '
            + 'h ranges from 3 m in a low tunnel to 7 m in a modern Venlo.' },
      { lead: 'Where the weave is complex the screen is a porous medium and its resistance is not '
            + 'constant. Steady flow then obeys the Forchheimer equation:',
        math: '(μ/K) u + ρ (Y/√K) |u| u = ∂P/∂x',
        note: 'The first term is viscous and linear in face velocity, the second inertial and '
            + 'quadratic. Both matter at the velocities a greenhouse runs at, which is why a '
            + 'discharge coefficient fitted at one ventilation rate does not transfer to another. '
            + 'The two published K and Y correlations agree on permeability at anti-thrips '
            + 'porosity to 8 % and disagree on the inertial factor by a factor of 2.9, so the '
            + 'quadratic loss is the uncertain half.' }
    ],

    caveats: [
      'Ventilation rate is less than linear in vent opening angle, because the effective aperture '
        + 'is the projected gap rather than the vent area. The areas entered here should be '
        + 'effective apertures at the opening angle in question, not the nominal vent area.',
      'Turbulent wind accounts for about 30 to 40 % of the air exchange in a house with a single '
        + 'roof opening, and most measurement techniques cannot separate steady from turbulent '
        + 'contributions, so a single C_w absorbs both.',
      'Neither screen correlation should be carried outside the porosity range it was fitted over. '
        + 'Where a fan has to overcome the screen rather than a vent losing rate, the Forchheimer '
        + 'form and not the porosity ratio is the one that belongs in the sizing calculation.',
      'This is the rate, not the result. What the rate does to temperature and humidity is in the '
        + 'greenhouse energy balance and equilibrium humidity calculators, and the useful cooling '
        + 'is bought at low rates: the slope is steepest near g_V = 0.'
    ],

    sources: ['roy2002', 'kittas1997', 'boulard1995vent', 'bot1983', 'dejong1990', 'bailey2000',
              'fatnassi2002', 'teitel2007screen', 'miguel1998', 'baeza2009cfd', 'ep406'],
    provenance: 'Equations and coefficient tables from sections 9.1 to 9.5 of "Greenhouse '
              + 'parameters and equations". The crossover default reproduces that section’s '
              + 'worked 0.91 m s⁻¹ at ΔT = 5 K, H = 1 m and C_w = 0.10.'
  });
}());

