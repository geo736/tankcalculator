
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'equilibrium-humidity',
    kicker: 'Greenhouse climate',
    name: 'Equilibrium humidity and condensation risk',
    lede: 'Vapour leaves a greenhouse by exactly two natural routes: through the openings, or by '
        + 'condensing somewhere. Everything in humidity management follows from that. This solves '
        + 'the balance for the humidity a free-running house actually settles at.',
    inputNote: 'Humidity is an outcome here, not a set-point. The three conductances decide it, '
             + 'and transpiration and humidity are solved together because each depends on the other.',

    inputs: [
      { id: 'tin', label: 'Inside air temperature', unit: '°C', value: 26, step: 0.1, min: 0, max: 45 },
      { id: 'tout', label: 'Outside air temperature', unit: '°C', value: 20, step: 0.1, min: -30, max: 45 },
      { id: 'rhout', label: 'Outside relative humidity', unit: '%', value: 80, step: 1, min: 5, max: 100 },
      { id: 'rad', label: 'Global radiation outside', unit: 'W m⁻²', value: 400, step: 10, min: 0, max: 1100 },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.65, step: 0.01, min: 0.2, max: 0.95 },

      { id: 'crop', label: 'Crop', unit: '', value: 'tomato', type: 'select', group: 'Crop',
        options: Object.keys(CROP.CROPS).map(function (k) {
          return { v: k, label: CROP.CROPS[k].label + ' (LAI ' + CROP.CROPS[k].lai + ')' };
        }) },
      { id: 'night', label: 'Period', unit: '', value: 0, type: 'select',
        options: [{ v: 0, label: 'Day' }, { v: 1, label: 'Night, stomata closed' }] },

      { id: 'ach', label: 'Air exchange rate', unit: 'h⁻¹', value: 10, step: 0.5, min: 0, max: 60,
        group: 'The two exits',
        help: 'The ventilation conductance is this times the mean height over 3600. With no ventilation, outside humidity becomes irrelevant to the answer.' },
      { id: 'height', label: 'Mean internal height', unit: 'm', value: 4.5, step: 0.1, min: 1, max: 20 },
      { id: 'arearatio', label: 'Cover-to-floor area ratio', unit: '–', value: 1.4, step: 0.05, min: 0.8, max: 2.5,
        help: 'The condensation conductance scales with the cover area available to condense on.' },
      { id: 'rinner', label: 'Inner surface resistance', unit: 'm² K W⁻¹', value: 0.10, step: 0.01, min: 0.01, max: 0.5,
        help: 'Cover temperature follows the resistance split. Insulating the cover raises the inner surface temperature and so removes the condensation sink: the double-cover paradox.' },
      { id: 'router', label: 'Outer surface resistance', unit: 'm² K W⁻¹', value: 0.05, step: 0.01, min: 0.01, max: 0.5 },
      { id: 'rcover', label: 'Cover material resistance', unit: 'm² K W⁻¹', value: 0.005, step: 0.005, min: 0, max: 1,
        help: 'Single glass is near 0.005; a double or insulated cover is an order of magnitude higher and that is what kills the sink.' },
      { id: 'sky', label: 'Extra cover depression from the cold sky', unit: 'K', value: 0, step: 0.5, min: 0, max: 12,
        help: 'The conduction form carries no radiative loss to the sky. One to three kelvin is reported for leaf boundary layers at night; a cover sees the sky more directly still.' },

      { id: 'tcrop', label: 'Crop surface temperature', unit: '°C', value: 25, step: 0.1, min: -10, max: 50,
        group: 'Condensation on the crop',
        help: 'Typically within 2 K of air temperature, and below it at night when the canopy loses radiation to a cold cover.' }
    ],

    compute: function (v) {
      var tIn = GFC.need(v.tin, 'Inside air temperature');
      var tOut = GFC.need(v.tout, 'Outside air temperature');
      var rhOut = GFC.need(v.rhout, 'Outside relative humidity', { min: 5, max: 100 }) / 100;
      var rad = GFC.need(v.rad, 'Global radiation', { min: 0 });
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var cropKey = String(v.crop);
      if (!CROP.CROPS[cropKey]) throw new Error('Crop must be one of the listed four.');
      var night = GFC.need(v.night, 'Period') === 1;
      var ach = GFC.need(v.ach, 'Air exchange rate', { min: 0 });
      var height = GFC.need(v.height, 'Mean internal height', { positive: true });
      var areaRatio = GFC.need(v.arearatio, 'Cover-to-floor area ratio', { positive: true });
      var rInner = GFC.need(v.rinner, 'Inner surface resistance', { positive: true });
      var rOuter = GFC.need(v.router, 'Outer surface resistance', { positive: true });
      var rCover = GFC.need(v.rcover, 'Cover material resistance', { min: 0 });
      var sky = GFC.need(v.sky, 'Sky depression', { min: 0 });
      var tCrop = GFC.need(v.tcrop, 'Crop surface temperature');

      var sol = CROP.freeRunning({
        tIn: tIn, tOut: tOut, rhOut: rhOut, iGlobal: rad, tauGh: tau, crop: cropKey,
        night: night, ach: ach, height: height, areaRatio: areaRatio,
        rInner: rInner, rCover: rCover, rOuter: rOuter, skyDepression: sky
      });

      var rh = Math.min(sol.rh, 1);
      var dp = PSY.dewPoint(tIn, Math.min(rh, 0.999999));
      var dpd = tIn - dp;
      var cropCondenses = tCrop < dp;
      var coverCondenses = sol.t_cover < dp;

      /* The three weights in the master equation, as shares. */
      var gTot = sol.g_E + sol.g_V + sol.g_C_effective;
      var wCrop = sol.g_E / gTot, wOut = sol.g_V / gTot, wCover = sol.g_C_effective / gTot;

      /* Where the vapour actually goes. */
      var exitV = sol.V, exitC = sol.C, total = Math.max(sol.E, 1e-15);

      var flags = [];
      if (rh >= 0.999) flags.push({ head: 'Saturated.',
        text: 'The balance cannot hold this crop’s output with these two exits. Either the ventilation rate or a dehumidifier has to carry the difference.' });
      else if (rh > 0.90) flags.push({ head: GFC.pct(rh, 0) + ' relative humidity.', text: 'Botrytis risk.' });
      else if (rh > 0.85) flags.push({ head: GFC.pct(rh, 0) + ' relative humidity.',
        text: 'Sustained above 85 %, stomata become malfunctional and do not close when needed.' });
      if (cropCondenses) flags.push({ head: 'Condensing on the crop.',
        text: 'The canopy at ' + GFC.fixed(tCrop, 1) + ' °C is below the air dew point of ' + GFC.fixed(dp, 1) + ' °C. This, not relative humidity, is the disease-relevant criterion.' });
      if (!coverCondenses) flags.push({ head: 'No condensation sink.',
        text: 'The inner cover surface at ' + GFC.fixed(sol.t_cover, 1) + ' °C is above the air dew point, so the cover is not taking any water out. Only ventilation is left.' });
      if (ach === 0) flags.push({ head: 'No ventilation.',
        text: 'With g_V = 0 the outside humidity drops out of the master equation entirely: the answer depends only on the crop and the cover.' });
      if (rCover > 0.05) flags.push({ head: 'The double-cover paradox.',
        text: 'With a cover this well insulated the inner surface is barely colder than the air, so the condensation conductance collapses and humidity rises even though the house is losing less heat.' });

      return {
        headline: [
          { label: 'Equilibrium humidity', value: GFC.fixed(rh * 100, 1), unit: '%',
            hint: GFC.fixed(sol.chi_air * 1000, 2) + ' g m⁻³' },
          { label: 'Dew-point depression', value: GFC.fixed(dpd, 1), unit: 'K',
            hint: 'Dew point ' + GFC.fixed(dp, 1) + ' °C' },
          { label: 'Transpiration', value: GFC.fixed(sol.E * 1000 * 3600, 0), unit: 'g m⁻² h⁻¹',
            hint: 'Solved together with the humidity' },
          { label: 'Condensing on the cover', value: GFC.fixed(sol.C * 1000 * 3600, 0), unit: 'g m⁻² h⁻¹',
            hint: coverCondenses ? GFC.pct(exitC / total, 0) + ' of the crop’s output' : 'Cover above the dew point' }
        ],
        flags: flags,
        rows: [
          { label: 'Crop conductance g_E', value: GFC.sig(sol.g_E, 4), unit: 'm s⁻¹', note: 'Weight ' + GFC.pct(wCrop, 0) + ' in the master equation' },
          { label: 'Ventilation conductance g_V', value: GFC.sig(sol.g_V, 4), unit: 'm s⁻¹', note: 'Weight ' + GFC.pct(wOut, 0) + '; N h / 3600' },
          { label: 'Condensation conductance g_C', value: GFC.sig(sol.g_C, 4), unit: 'm s⁻¹', note: 'From the cover temperature difference: (A_c/A_s) 1.64 × 10⁻³ ΔT^⅓' },
          { label: 'g_C as it enters the balance', value: GFC.sig(sol.g_C_effective, 4), unit: 'm s⁻¹',
            note: sol.g_C_effective > 0 ? 'Weight ' + GFC.pct(wCover, 0) + ' in the master equation' : 'Zero: the cover is above the air dew point, so it is neither a sink nor a source' },
          { label: 'Canopy vapour source χ_crop', value: GFC.fixed(sol.chi_crop * 1000, 3), unit: 'g m⁻³', note: 'Saturated at air temperature plus the radiation term' },
          { label: 'Outside concentration χ_out', value: GFC.fixed(sol.chi_out * 1000, 3), unit: 'g m⁻³', note: 'From outside temperature and RH' },
          { label: 'Saturated at the cover χ*_cover', value: GFC.fixed(sol.chi_cover_sat * 1000, 3), unit: 'g m⁻³', note: 'At the inner surface temperature' },
          { label: 'Inside concentration χ_a', value: GFC.fixed(sol.chi_air * 1000, 3), unit: 'g m⁻³', note: 'The conductance-weighted average' },
          { label: 'Equilibrium relative humidity', value: GFC.pct(rh, 2), unit: '', note: 'At inside air temperature' },
          { label: 'Inside dew point', value: GFC.fixed(dp, 2), unit: '°C', note: 'From the solved humidity' },
          { label: 'Dew-point depression', value: GFC.fixed(dpd, 2), unit: 'K', note: 'The condensation-risk measure' },
          { label: 'Inner cover temperature', value: GFC.fixed(sol.t_cover, 2), unit: '°C', note: 'T_a − (R_i/R_o)(T_a − T_out), less any sky depression' },
          { label: 'Transpiration E', value: GFC.fixed(sol.E * 1000 * 3600, 1), unit: 'g m⁻² h⁻¹', note: 'Solved simultaneously with χ_a' },
          { label: 'Leaving by ventilation V', value: GFC.fixed(exitV * 1000 * 3600, 1), unit: 'g m⁻² h⁻¹', note: GFC.pct(exitV / total, 0) + ' of the crop’s output' },
          { label: 'Leaving by condensation C', value: GFC.fixed(exitC * 1000 * 3600, 1), unit: 'g m⁻² h⁻¹', note: GFC.pct(exitC / total, 0) + ' of the crop’s output' },
          { label: 'Balance residual E − V − C', value: GFC.sig((sol.E - exitV - exitC) * 1000 * 3600, 2), unit: 'g m⁻² h⁻¹', note: 'Should be zero at the solved state' },
          { label: 'Latent load', value: GFC.fixed(sol.E * PSY.L, 1), unit: 'W m⁻²', note: 'L × E' },
          { label: 'Stomatal resistance', value: GFC.fixed(sol.r_s, 0), unit: 's m⁻¹', note: 'At the solved humidity' },
          { label: 'Condensation on the crop', value: cropCondenses ? 'yes' : 'no', unit: '',
            note: 'Canopy at ' + GFC.fixed(tCrop, 1) + ' °C against a dew point of ' + GFC.fixed(dp, 1) + ' °C' },
          { label: 'Iterations to converge', value: GFC.fixed(sol.iterations, 0), unit: '', note: 'Damped fixed point on χ_a' }
        ],
        caption: 'Left: the three sources the master equation averages, with the solved air '
               + 'concentration between them. Right: where the crop’s vapour actually leaves.',
        _v: { sol: sol, rh: rh, dp: dp, tIn: tIn, exitV: exitV, exitC: exitC,
              wCrop: wCrop, wOut: wOut, wCover: wCover }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v, sol = st.sol;
      var W = 640, H = 330, L = 60, T = 16;
      var PW = 320, PH = H - T - 72;

      /* panel 1: the three sources on a concentration axis, with the result */
      var vals = [sol.chi_out * 1000, sol.chi_cover_sat * 1000, sol.chi_crop * 1000, sol.chi_air * 1000];
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      var nc = S.nice(Math.min(0, lo), hi, 4);
      var sy = S.scale(nc.min, nc.max, T + PH, T);

      var g = S.open(W, H, 'The three vapour sources and where the vapour goes');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: 3, yMin: nc.min, yMax: nc.max,
        xTicks: 3, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function () { return ''; },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        yLabel: 'Vapour concentration (g m⁻³)'
      });

      var slots = [
        { label: 'crop', v: sol.chi_crop * 1000, w: st.wCrop, colour: pal.series[0] },
        { label: 'outside', v: sol.chi_out * 1000, w: st.wOut, colour: pal.series[1] },
        { label: 'cover', v: sol.chi_cover_sat * 1000, w: st.wCover, colour: pal.series[2] }
      ];
      slots.forEach(function (s, i) {
        var cx = L + PW * (i + 0.5) / 3;
        var bw = 26 + 30 * s.w;                 /* width carries the conductance weight */
        g += S.rect(cx - bw / 2, sy(s.v), bw, (T + PH) - sy(s.v), s.colour);
        g += S.text(cx, T + PH + 15, s.label, { size: 11, anchor: 'middle', fill: pal.soft });
        g += S.text(cx, T + PH + 28, GFC.pct(s.w, 0), { size: 10, anchor: 'middle', fill: pal.soft, mono: true });
      });
      var yAir = sy(sol.chi_air * 1000);
      g += S.line(L, yAir, L + PW, yAir, pal.accent, 2.4);
      g += S.text(L + PW - 3, yAir - 6, 'inside air ' + GFC.fixed(sol.chi_air * 1000, 1) + ' g m⁻³',
        { size: 10.5, anchor: 'end', fill: pal.accent, weight: 600 });

      /* panel 2: the exits */
      var L2 = L + PW + 74, PW2 = W - L2 - 16;
      var exits = [
        { label: 'ventilation', v: st.exitV * 1000 * 3600, colour: pal.series[1] },
        { label: 'condensation', v: st.exitC * 1000 * 3600, colour: pal.series[2] }
      ];
      var eMax = Math.max(sol.E * 1000 * 3600, 1e-9);
      var ne = S.nice(0, eMax, 3);
      var sy2 = S.scale(0, ne.max, T + PH, T);
      g += S.frame({
        left: L2, top: T, w: PW2, h: PH, xMin: 0, xMax: 2, yMin: 0, yMax: ne.max,
        xTicks: 2, yTicks: ne.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function () { return ''; },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        yLabel: 'Vapour flux (g m⁻² h⁻¹)'
      });
      exits.forEach(function (s, i) {
        var cx = L2 + PW2 * (i + 0.5) / 2;
        g += S.rect(cx - 20, sy2(Math.max(0, s.v)), 40, (T + PH) - sy2(Math.max(0, s.v)), s.colour);
        g += S.text(cx, T + PH + 15, s.label, { size: 11, anchor: 'middle', fill: pal.soft });
        g += S.text(cx, sy2(Math.max(0, s.v)) - 5, GFC.fixed(s.v, 0), { size: 10, anchor: 'middle', fill: pal.ink, mono: true });
      });
      var yE = sy2(Math.min(sol.E * 1000 * 3600, ne.max));
      g += S.line(L2, yE, L2 + PW2, yE, pal.accent, 2, '4 3');
      g += S.text(L2 + 3, yE - 6, 'transpiration', { size: 10.5, fill: pal.accent });

      g += S.close();
      return g;
    },

    math: [
      { lead: 'Vapour can leave a greenhouse by only two routes, through the vents or by '
            + 'condensing somewhere:',
        math: 'E = V + C, &nbsp;&nbsp; V = g<sub>V</sub>(χ<sub>a</sub> − χ<sub>out</sub>), '
            + '&nbsp;&nbsp; C = max{0, g<sub>C</sub>(χ<sub>a</sub> − χ*<sub>T,cover</sub>)}',
        note: 'Everything in humidity management follows from that. Active dehumidification is a '
            + 'third exit bought when the first two cannot carry the crop’s output.' },
      { lead: 'Substituting the three transfer forms and solving gives the master equation:',
        math: 'χ<sub>a</sub> = ( g<sub>E</sub>χ<sub>crop</sub> + g<sub>V</sub>χ<sub>out</sub> '
            + '+ g<sub>C</sub>χ*<sub>cover</sub> ) / ( g<sub>E</sub> + g<sub>V</sub> + g<sub>C</sub> )',
        note: 'Greenhouse humidity is a conductance-weighted average of three sources: what the '
            + 'crop is pushing out, what is outside, and the saturated concentration at cover '
            + 'temperature. Humidity is high to the extent that there is transpiration, that '
            + 'outside humidity is high, and that the cover is warm.' },
      { lead: 'Cover temperature follows the resistance split, and the condensation conductance '
            + 'follows the cover temperature:',
        math: 'T<sub>a</sub> − T<sub>iS</sub> = (R<sub>i</sub>/R<sub>o</sub>)(T<sub>a</sub> − T<sub>out</sub>), '
            + '&nbsp;&nbsp; g<sub>C</sub> = (A<sub>c</sub>/A<sub>s</sub>) · 1.64 × 10⁻³ (T<sub>a</sub> − T<sub>cover</sub>)<sup>⅓</sup>',
        note: 'This is the double-cover paradox. In a highly insulated greenhouse the inner '
            + 'surface is barely colder than the air, so the condensation sink disappears exactly '
            + 'when the heat saving arrives, and humidity becomes the binding constraint instead '
            + 'of temperature.' },
      { lead: 'Transpiration and humidity are mutually dependent, so the pair is solved together:',
        math: 'E = g<sub>E</sub>(χ<sub>crop</sub> − χ<sub>a</sub>) &nbsp; with &nbsp; '
            + 'χ<sub>a</sub> = f(E)',
        note: 'Iterated to a fixed point with damping. Lowering the humidity raises '
            + 'transpiration, so the marginal kilogram of water removed costs more than the '
            + 'average kilogram.' }
    ],

    caveats: [
      'This is the free-running house: the humidity it settles at with no dehumidifier. If that '
        + 'humidity is above the set-point, the difference is the active duty, and the '
        + 'dehumidification calculator prices it.',
      'The condensation criterion on the crop uses a canopy temperature you supply. In steady '
        + 'state the canopy sits within about 2 K of air temperature, warmer under radiation and '
        + 'cooler when it is losing long-wave to a cold cover.',
      'Dew-point depression, not relative humidity, is the quantity that decides condensation on '
        + 'the crop, and in warm humid conditions a less-ventilated house can hold a larger '
        + 'depression than a ventilated one. Both are reported here for that reason.',
      'Internal air circulation is not modelled. By reducing the boundary-layer resistance it '
        + 'raises crop temperature whenever the crop is colder than the air, which directly '
        + 'reduces condensation risk.'
    ],

    sources: ['stanghellini2019', 'vanthoor2011', 'stanghellini1987', 'campen2003drying', 'stanghellini2008hum'],
    provenance: 'Transcribed from dehumid/loads.py, which implements sections 10.2, 11.1 to 11.5 '
              + 'of "Greenhouse parameters and equations". The condensation conductance and the '
              + 'cover-temperature form are that document’s 11.3 and 11.4.'
  });
}());

