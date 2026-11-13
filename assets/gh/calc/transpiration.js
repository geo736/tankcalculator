
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'transpiration',
    kicker: 'Greenhouse climate',
    name: 'Crop transpiration and the latent load',
    lede: 'Transpiration is both the crop’s water requirement and the greenhouse’s latent heat '
        + 'load, and it is driven by radiation and by the air’s vapour deficit together. This '
        + 'runs the big-leaf model and shows which of the two drivers is in charge.',
    inputNote: 'Air vapour deficit becomes the dominant driver once LAI passes about 0.5, so for '
             + 'anything but a very young crop this is not a radiation-only calculation.',

    inputs: [
      { id: 'crop', label: 'Crop', unit: '', value: 'tomato', type: 'select',
        options: Object.keys(CROP.CROPS).map(function (k) {
          var c = CROP.CROPS[k];
          return { v: k, label: c.label + ' (LAI ' + c.lai + ', r_b ' + c.r_b + ', r_s,min ' + c.r_s_min + ')' };
        }) },
      { id: 't', label: 'Air temperature', unit: '°C', value: 24, step: 0.1, min: 0, max: 45 },
      { id: 'rh', label: 'Relative humidity', unit: '%', value: 75, step: 1, min: 10, max: 99 },
      { id: 'rad', label: 'Global radiation outside', unit: 'W m⁻²', value: 500, step: 10, min: 0, max: 1100 },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.65, step: 0.01, min: 0.2, max: 0.95 },
      { id: 'night', label: 'Period', unit: '', value: 0, type: 'select',
        options: [{ v: 0, label: 'Day, stomata responding to light' },
                  { v: 1, label: 'Night, stomata closed' }] },
      { id: 'hours', label: 'Hours in the period', unit: 'h', value: 12, step: 0.5, min: 0.5, max: 24,
        group: 'Over a period',
        help: 'Used only to turn the instantaneous rate into a daily water figure at this radiation level.' }
    ],

    compute: function (v) {
      var cropKey = String(v.crop);
      if (!CROP.CROPS[cropKey]) throw new Error('Crop must be one of the listed four.');
      var t = GFC.need(v.t, 'Air temperature');
      var rh = GFC.need(v.rh, 'Relative humidity', { min: 10, max: 99 }) / 100;
      var rad = GFC.need(v.rad, 'Global radiation', { min: 0 });
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var night = GFC.need(v.night, 'Period') === 1;
      var hours = GFC.need(v.hours, 'Hours in the period', { positive: true, max: 24 });

      var chiAir = PSY.chi(t, rh);
      var tr = CROP.transpiration(t, chiAir, rad, cropKey, tau, night);
      var c = CROP.CROPS[cropKey];

      var E = tr.E;                                /* kg m-2 s-1 */
      var latentW = E * PSY.L;                     /* W m-2 */
      var g_m2_h = E * 1000 * 3600;
      var mm_day = g_m2_h * hours / 1000;          /* L m-2 over the period, i.e. mm */
      var driving = tr.chi_crop - chiAir;          /* kg m-3 */

      /* Split the canopy vapour source into its two parts, so the figure can
       * show which driver is doing the work. */
      var chiSatAir = PSY.chiSat(t);
      var radPart = tr.chi_crop - chiSatAir;       /* the radiation term */
      var deficitPart = chiSatAir - chiAir;        /* the air's own deficit */
      var radShare = driving > 0 ? radPart / driving : 0;

      var overshoot = CROP.jarvisExtrapolation(t);
      var incoming = tau * rad;

      var flags = [];
      if (overshoot > 0) flags.push({ head: 'Temperature factor extrapolated.',
        text: 'The Jarvis temperature term was fitted with air temperature almost always below 25 °C and behaves pathologically above it, so it is held at its 25 °C value here. This result is ' + GFC.fixed(overshoot, 1) + ' K past the calibration envelope.' });
      if (latentW > incoming && incoming > 0) flags.push({ head: 'Latent load exceeds the solar input.',
        text: 'The crop is transpiring ' + GFC.fixed(latentW, 0) + ' W m⁻² against ' + GFC.fixed(incoming, 0) + ' W m⁻² of transmitted radiation. That is possible in dry air, where sensible heat is drawn from the air and from the heating pipes, but check the humidity input before relying on it.' });
      if (night) flags.push({ head: 'Night.',
        text: 'Stomatal resistance is held at its closed value of ' + GFC.fixed(CROP.R_S_NIGHT, 0) + ' s m⁻¹, so what remains is largely cuticular loss driven by the air deficit.' });
      if (radShare > 0.6) flags.push({ head: 'Radiation-dominated.',
        text: GFC.pct(radShare, 0) + ' of the driving concentration difference is the radiation the leaves must shed. Irrigation triggered on accumulated radiation will track this crop well.' });
      else if (driving > 0) flags.push({ head: 'Deficit-dominated.',
        text: GFC.pct(1 - radShare, 0) + ' of the driving difference is the air’s own vapour deficit, so humidity control and transpiration cannot be set independently here.' });

      return {
        headline: [
          { label: 'Transpiration', value: GFC.fixed(g_m2_h, 0), unit: 'g m⁻² h⁻¹',
            hint: GFC.fixed(mm_day, 2) + ' mm over ' + GFC.fixed(hours, 1) + ' h' },
          { label: 'Latent heat load', value: GFC.fixed(latentW, 0), unit: 'W m⁻²',
            hint: 'L × E, the load a coil would see' },
          { label: 'Canopy conductance g_E', value: GFC.sig(tr.g_E, 3), unit: 'm s⁻¹',
            hint: '2 LAI / ((1+ε)r_b + r_s)' },
          { label: 'Stomatal resistance', value: GFC.fixed(tr.r_s, 0), unit: 's m⁻¹',
            hint: 'Floor at r_s,min of ' + c.r_s_min }
        ],
        flags: flags,
        rows: [
          { label: 'Leaf area index', value: GFC.fixed(c.lai, 1), unit: '–', note: 'Compendium 10.3 parameter table' },
          { label: 'Boundary-layer resistance r_b', value: GFC.fixed(c.r_b, 0), unit: 's m⁻¹', note: 'Crop-specific' },
          { label: 'Transmitted radiation', value: GFC.fixed(incoming, 0), unit: 'W m⁻²', note: 'τ × outside global' },
          { label: 'Net radiation absorbed R_n', value: GFC.fixed(tr.R_n, 1), unit: 'W m⁻²', note: '0.86 (1 − e^(−0.7 LAI)) τ I' },
          { label: 'Stomatal resistance r_s', value: GFC.fixed(tr.r_s, 1), unit: 's m⁻¹', note: 'Jarvis form, temperature factor capped at 25 °C' },
          { label: 'Latent/sensible slope ratio ε_S', value: GFC.fixed(PSY.epsS(t), 3), unit: '–', note: 'At this air temperature' },
          { label: 'Canopy conductance g_E', value: GFC.sig(tr.g_E, 4), unit: 'm s⁻¹', note: 'Compendium 10.2 transfer form' },
          { label: 'Canopy vapour source χ_crop', value: GFC.fixed(tr.chi_crop * 1000, 3), unit: 'g m⁻³', note: 'χ*(T_a) + ε r_b R_n / (2 LAI L)' },
          { label: 'Air vapour concentration χ_a', value: GFC.fixed(chiAir * 1000, 3), unit: 'g m⁻³', note: 'From temperature and RH' },
          { label: 'Saturated at air temperature χ*', value: GFC.fixed(chiSatAir * 1000, 3), unit: 'g m⁻³', note: 'For the split below' },
          { label: 'Driving difference χ_crop − χ_a', value: GFC.fixed(driving * 1000, 3), unit: 'g m⁻³', note: 'The real driving force, not air VPD' },
          { label: '— of which radiation', value: GFC.fixed(radPart * 1000, 3), unit: 'g m⁻³', note: GFC.pct(radShare, 0) + ' of the difference' },
          { label: '— of which the air deficit', value: GFC.fixed(deficitPart * 1000, 3), unit: 'g m⁻³', note: GFC.pct(1 - radShare, 0) + ' of the difference' },
          { label: 'Transpiration E', value: GFC.sig(E, 4), unit: 'kg m⁻² s⁻¹', note: 'g_E (χ_crop − χ_a), floored at zero' },
          { label: 'Transpiration', value: GFC.fixed(g_m2_h, 1), unit: 'g m⁻² h⁻¹', note: 'Same number, practical units' },
          { label: 'Water over the period', value: GFC.fixed(mm_day, 3), unit: 'mm', note: 'At this constant rate for ' + GFC.fixed(hours, 1) + ' h' },
          { label: 'Latent heat load', value: GFC.fixed(latentW, 1), unit: 'W m⁻²', note: 'L = 2.45 MJ kg⁻¹' },
          { label: 'Air vapour pressure deficit', value: GFC.fixed(PSY.vpd(t, rh), 3), unit: 'kPa', note: 'For stating crop targets, not for driving this model' }
        ],
        caption: 'Transpiration against relative humidity at this radiation, with the operating '
               + 'point marked. The curve rises as the air dries, which is the hydraulic '
               + 'feedback: drying the air makes more water to dry.',
        _v: { t: t, rh: rh, rad: rad, tau: tau, crop: cropKey, night: night, E: E, g_m2_h: g_m2_h }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 350, L = 66, T = 14, PW = W - L - 30, PH = H - T - 72;

      var rate = function (rh) {
        var tr = CROP.transpiration(st.t, PSY.chi(st.t, rh), st.rad, st.crop, st.tau, st.night);
        return tr.E * 1000 * 3600;
      };

      var hiEnd = rate(0.30), loEnd = rate(0.95);
      var nc = S.nice(0, Math.max(hiEnd, loEnd, st.g_m2_h), 4);
      var sx = S.scale(30, 95, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Transpiration against relative humidity');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 30, xMax: 95, yMin: 0, yMax: nc.max,
        xTicks: 13, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Relative humidity (%)',
        yLabel: 'Transpiration (g m⁻² h⁻¹)'
      });

      var d = '', rr, first = true;
      for (rr = 30; rr <= 95.001; rr += 0.5) {
        d += (first ? 'M' : 'L') + sx(rr).toFixed(1) + ' ' + sy(Math.min(rate(rr / 100), nc.max)).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      /* the humidity thresholds that matter to the crop, marked outside the data */
      [[85, 'stomata'], [90, 'Botrytis']].forEach(function (pair) {
        g += S.line(sx(pair[0]), T, sx(pair[0]), T + PH, pal.warn, 1.1, '2 4');
        g += S.text(sx(pair[0]) - 4, T + 12, pair[1], { size: 10, anchor: 'end', fill: pal.warn });
      });

      var px = sx(Math.max(30, Math.min(95, st.rh * 100)));
      var py = sy(Math.min(st.g_m2_h, nc.max));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py - 8, GFC.fixed(st.g_m2_h, 0) + ' g m⁻² h⁻¹',
        { size: 11, fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'transpiration at this radiation', colour: pal.accent, dash: null },
        { label: 'humidity thresholds', colour: pal.warn, dash: '2 4' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'There is 2·LAI of leaf area per unit ground area available for heat and vapour '
            + 'exchange, which gives the big-leaf model:',
        math: 'E = 2 LAI (χ<sub>crop</sub> − χ<sub>a</sub>) / (r<sub>s</sub> + r<sub>b</sub>), '
            + '&nbsp;&nbsp; H = 2 LAI ρ c<sub>p</sub> (T<sub>crop</sub> − T<sub>a</sub>) / r<sub>b</sub>',
        note: 'Some authors use LAI rather than 2·LAI for vapour because most crops have stomata '
            + 'on one side only. 2·LAI is the accepted convention, because there is also '
            + 'cuticular loss and because using different areas for heat and vapour adds '
            + 'complication for no gain.' },
      { lead: 'Solved into the transfer form the humidity balance needs:',
        math: 'g<sub>E</sub> = 2 LAI / ((1 + ε)r<sub>b</sub> + r<sub>s</sub>), &nbsp;&nbsp; '
            + 'χ<sub>crop</sub> = χ*(T<sub>a</sub>) + ε (r<sub>b</sub> / 2 LAI)(R<sub>n</sub> / L), &nbsp;&nbsp; '
            + 'E = g<sub>E</sub> (χ<sub>crop</sub> − χ<sub>a</sub>)',
        note: 'χ_crop is the virtual vapour concentration the canopy behaves as though it holds: '
            + 'saturated at air temperature, raised by the radiation the leaves have to shed.' },
      { lead: 'Net radiation absorbed by the canopy:',
        math: 'R<sub>n</sub> = 0.86 (1 − e<sup>−0.7 LAI</sup>) τ I<sub>sun</sub>',
        note: 'The 0.86 lumps the short- and long-wave absorption coefficients onto the solar '
            + 'term. The extinction constant here is 0.70, the radiation form; the 0.64 that '
            + 'appears in this literature belongs to a simplified transpiration correlation and '
            + 'mixing the two over-predicts net radiation by about 13 % at LAI 3.' },
      { lead: 'Stomatal resistance, Jarvis form with a radiation and a temperature term:',
        math: 'r<sub>s</sub> = 82 (1 + 6.95 e<sup>−a I / LAI</sup>)(1 + 0.23 (T<sub>a</sub> − 20)²)',
        note: 'Floored at the crop’s minimum stomatal resistance, because the bare expression can '
            + 'return a conductance the plant does not have, and with the temperature factor held '
            + 'at 25 °C, the edge of its calibration range.' },
      { lead: 'The latent load the climate plant has to remove, and the water it condenses:',
        math: 'q<sub>latent</sub> = L E, &nbsp;&nbsp; 1 W m⁻² ≡ 1.44 g m⁻² h⁻¹ at L = 2 500 J g⁻¹',
        note: 'Transpiration does not remove energy from a closed house; it converts sensible '
            + 'heat to latent heat, and the latent heat still has to be taken out.' }
    ],

    caveats: [
      'Air vapour pressure deficit is not the driving force for transpiration, and this page does '
        + 'not use it as one. The driving force is χ_crop − χ_a. VPD at air temperature is shown '
        + 'only because crop targets are conventionally written on it.',
      'Two conflicting processes set crop temperature: positive net radiation makes the crop '
        + 'warmer than the air, and evaporation driven by the air’s deficit makes it cooler. The '
        + 'canopy can therefore sit either side of air temperature, by up to about 2 K.',
      'Drying the air lowers its dew point but also raises transpiration, which cools the crop, '
        + 'so the crop may end up only slightly further from the new dew point than from the old '
        + 'one. Humidity control aimed at preventing condensation partly defeats itself.',
      'The big-leaf assumption is weakest at the canopy-air boundary, where wind speed above a '
        + 'crop can be an order of magnitude higher than within it. The parameters here are for '
        + 'four greenhouse fruit crops and should not be carried to a different training system '
        + 'or plant density without refitting.'
    ],

    sources: ['stanghellini1987', 'katsoulas2019', 'stanghellini2019', 'baille1994', 'fao56'],
    provenance: 'Transcribed from dehumid/loads.py in the hot-humid dehumidification model, which '
              + 'implements sections 5.2, 10.2 and 10.3 of "Greenhouse parameters and equations".'
  });
}());

