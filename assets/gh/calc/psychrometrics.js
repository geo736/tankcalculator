
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'psychrometrics',
    kicker: 'Greenhouse climate',
    name: 'Air state and psychrometrics',
    lede: 'Every statement about greenhouse humidity, condensation, evaporative cooling and '
        + 'dehumidification rests on this one air state. Give a temperature, a relative humidity '
        + 'and an elevation, and read off the ten quantities the other calculators are written on.',
    inputNote: 'Saturation vapour pressure depends on temperature alone. Everything mass-based '
             + 'depends on pressure too, so elevation matters.',

    inputs: [
      { id: 't',   label: 'Air temperature',   unit: '°C',  value: 24,   step: 0.1, min: -30, max: 60 },
      { id: 'rh',  label: 'Relative humidity', unit: '%',   value: 80,   step: 0.5, min: 0.1, max: 100 },
      { id: 'alt', label: 'Site elevation',    unit: 'm',   value: 0,    step: 10,  min: -400, max: 4000,
        help: 'The psychrometric constant falls 4.6 % by 400 m. Negligible against the uncertainty in canopy resistance; not negligible against a wet-bulb depression a pad wall is sized on.' },
      { id: 'tsurf', label: 'Coldest surface temperature', unit: '°C', value: 18, step: 0.1, min: -30, max: 60,
        group: 'Condensation check',
        help: 'Inner cover, a cold pipe, a glazing bar. Condensation starts where a surface is below the air dew point.' }
    ],

    compute: function (v) {
      var t = GFC.need(v.t, 'Air temperature');
      var rh = GFC.need(v.rh, 'Relative humidity', { min: 0.1, max: 100 }) / 100;
      var alt = GFC.need(v.alt, 'Site elevation');
      var ts = GFC.need(v.tsurf, 'Coldest surface temperature');

      var p = PSY.pressureAt(alt);
      var eStar = PSY.eSat(t);
      var e = rh * eStar;
      var dp = PSY.dewPoint(t, rh);
      var wb = PSY.wetBulb(t, rh, p);
      var chi = PSY.chi(t, rh);
      var chiS = PSY.chiSat(t);
      var x = PSY.humidityRatio(t, rh, p);
      var h = PSY.enthalpy(t, rh, p);
      var vpd = PSY.vpd(t, rh);
      var dpd = t - dp;
      var wbd = t - wb;
      var condensing = ts < dp;

      var flags = [];
      if (rh > 0.90) flags.push({ head: 'Above 90 % RH.', text: 'Botrytis risk.' });
      else if (rh > 0.85) flags.push({ head: 'Above 85 % RH.', text: 'Sustained, stomata become malfunctional and do not close when needed; vase life suffers in sensitive rose cultivars.' });
      if (vpd > 1.0) flags.push({ head: 'Air VPD above 1 kPa.', text: 'Marked stomatal closure begins, so transpiration no longer rises with the deficit.' });
      if (condensing) flags.push({ head: 'Condensing.', text: 'The surface at ' + GFC.fixed(ts, 1) + ' °C is ' + GFC.fixed(dp - ts, 1) + ' K below the air dew point of ' + GFC.fixed(dp, 1) + ' °C.' });
      if (wbd < 3) flags.push({ head: 'Wet-bulb depression under 3 K.', text: 'The whole cooling resource of an evaporative system is this depression, so pad and fog have almost nothing to work with here.' });

      return {
        headline: [
          { label: 'Dew point', value: GFC.fixed(dp, 1), unit: '°C',
            hint: 'Depression ' + GFC.fixed(dpd, 1) + ' K below air' },
          { label: 'Wet-bulb depression', value: GFC.fixed(wbd, 1), unit: 'K',
            hint: 'Wet bulb ' + GFC.fixed(wb, 1) + ' °C' },
          { label: 'Vapour pressure deficit', value: GFC.fixed(vpd, 2), unit: 'kPa',
            hint: 'At air temperature, not canopy' },
          { label: 'Vapour concentration', value: GFC.fixed(chi * 1000, 2), unit: 'g m⁻³',
            hint: 'Saturated would be ' + GFC.fixed(chiS * 1000, 2) }
        ],
        flags: flags,
        rows: [
          { label: 'Atmospheric pressure', value: GFC.fixed(p, 2), unit: 'kPa', note: 'From elevation, compendium 2.3' },
          { label: 'Saturation vapour pressure e*', value: GFC.fixed(eStar, 3), unit: 'kPa', note: 'FAO-56 form; function of temperature only' },
          { label: 'Vapour pressure e', value: GFC.fixed(e, 3), unit: 'kPa', note: 'RH × e*' },
          { label: 'Vapour pressure deficit', value: GFC.fixed(vpd, 3), unit: 'kPa', note: 'e* − e, at air temperature' },
          { label: 'Dew point', value: GFC.fixed(dp, 2), unit: '°C', note: 'FAO-56 form inverted' },
          { label: 'Dew-point depression', value: GFC.fixed(dpd, 2), unit: 'K', note: 'What decides condensation on the crop, not RH' },
          { label: 'Wet-bulb temperature', value: GFC.fixed(wb, 2), unit: '°C', note: 'Psychrometric equation inverted at this pressure' },
          { label: 'Wet-bulb depression', value: GFC.fixed(wbd, 2), unit: 'K', note: 'The evaporative cooling resource' },
          { label: 'Vapour concentration χ', value: GFC.fixed(chi * 1000, 3), unit: 'g m⁻³', note: 'The measure the vapour balance is written on' },
          { label: 'Saturated concentration χ*', value: GFC.fixed(chiS * 1000, 3), unit: 'g m⁻³', note: 'At this air temperature' },
          { label: 'Humidity ratio x', value: GFC.fixed(x * 1000, 3), unit: 'g kg⁻¹', note: 'Per kg of dry air' },
          { label: 'Enthalpy h', value: GFC.fixed(h, 2), unit: 'kJ kg⁻¹', note: 'Zero at dry air, 0 °C' },
          { label: 'Dry-air density', value: GFC.fixed(PSY.rhoDryAir(t, rh, p), 4), unit: 'kg m⁻³', note: 'Dry component only' },
          { label: 'Slope of saturation curve Δ', value: GFC.fixed(PSY.delta(t), 4), unit: 'kPa K⁻¹', note: 'FAO-56 eq. 13' },
          { label: 'Psychrometric constant γ', value: GFC.fixed(PSY.gamma(p), 5), unit: 'kPa K⁻¹', note: '0.665 × 10⁻³ P' },
          { label: 'Latent/sensible slope ratio ε_S', value: GFC.fixed(PSY.epsS(t), 3), unit: '–',
            note: 'About 1.2 at 10 °C and 3.5 at 30 °C: how much the latent term outweighs the sensible one' },
          { label: 'Condensation on the named surface', value: condensing ? 'yes' : 'no', unit: '',
            note: condensing ? 'Surface below the air dew point' : 'Surface above the air dew point' }
        ],
        caption: 'The state point on a psychrometric chart, with the dew-point and wet-bulb '
               + 'constructions drawn. Curves are constant relative humidity; the top curve is saturation.',
        _v: { t: t, rh: rh, p: p, dp: dp, wb: wb, x: x, ts: ts }
      };
    },

    draw: function (v, r, pal) {
      var W = 640, H = 400, L = 62, T = 14, PW = W - L - 96, PH = H - T - 72;
      var tMin = -5, tMax = 50, xMax = 40;      /* g kg-1 dry air */
      var st = r._v;
      var sx = S.scale(tMin, tMax, L, L + PW);
      var sy = S.scale(0, xMax, T + PH, T);

      var g = S.open(W, H, 'Psychrometric chart with the state point');
      g += S.frame({
        left: L, top: T, w: PW, h: PH,
        xMin: tMin, xMax: tMax, yMin: 0, yMax: xMax,
        xTicks: 11, yTicks: 8, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Dry-bulb temperature (°C)',
        yLabel: 'Humidity ratio (g water per kg dry air)'
      });

      /* constant-RH curves, saturation last so it sits on top */
      var levels = [0.2, 0.4, 0.6, 0.8, 1.0];
      levels.forEach(function (rh, i) {
        var d = '', tt, xx, px, py, first = true;
        for (tt = tMin; tt <= tMax + 0.001; tt += 0.5) {
          xx = PSY.humidityRatio(tt, rh, st.p) * 1000;
          if (xx > xMax) break;
          px = sx(tt); py = sy(xx);
          d += (first ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1);
          first = false;
        }
        var isSat = rh === 1.0;
        g += S.path(d, isSat ? pal.accent : pal.line, isSat ? 2 : 1.1, null, isSat ? null : '3 3');
        /* label the curve where it leaves the panel, outside the data region */
        var lt = tt - 0.5;
        if (lt > tMin && lt < tMax) {
          g += S.text(sx(lt) + 4, sy(Math.min(xMax, PSY.humidityRatio(lt, rh, st.p) * 1000)) + 3,
            GFC.fixed(rh * 100, 0) + ' %', { size: 10, fill: isSat ? pal.accent : pal.soft });
        }
      });

      /* the state point and its two constructions */
      var pxT = sx(st.t), pyX = sy(st.x * 1000);
      var pxDp = sx(st.dp), pxWb = sx(st.wb);
      var pySat = sy(Math.min(xMax, PSY.humidityRatio(st.dp, 1.0, st.p) * 1000));

      /* horizontal to the dew point: cooling at constant humidity ratio */
      g += S.line(pxDp, pyX, pxT, pyX, pal.series[1], 1.6, '4 3');
      g += S.circle(pxDp, pyX, 3.4, pal.series[1]);
      /* wet-bulb marker on the temperature axis */
      g += S.line(pxWb, T + PH, pxWb, T + PH - 10, pal.series[2], 2);
      g += S.text(pxWb, T + PH - 14, 'wet bulb', { size: 10, anchor: 'middle', fill: pal.series[2] });

      g += S.circle(pxT, pyX, 5, pal.accent);
      g += S.text(pxT + 9, pyX - 7, GFC.fixed(st.t, 1) + ' °C, ' + GFC.fixed(st.rh * 100, 0) + ' % RH',
        { size: 11, fill: pal.ink, weight: 600 });
      g += S.text(pxDp - 6, pyX - 7, 'dew point ' + GFC.fixed(st.dp, 1) + ' °C',
        { size: 10.5, anchor: 'end', fill: pal.series[1] });

      /* the named surface, so the condensation check is visible */
      var pxS = sx(st.ts);
      g += S.line(pxS, T, pxS, T + PH, pal.warn, 1.4, '2 4');
      g += S.text(pxS + 4, T + 12, 'surface ' + GFC.fixed(st.ts, 1) + ' °C', { size: 10, fill: pal.warn });

      g += S.legend(L, H - 10, [
        { label: 'saturation', colour: pal.accent, dash: null },
        { label: 'constant RH', colour: pal.line, dash: '3 3' },
        { label: 'cooling to dew point', colour: pal.series[1], dash: '4 3' },
        { label: 'coldest surface', colour: pal.warn, dash: '2 4' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Saturation vapour pressure, FAO-56 form, kPa. Use this one whenever the result '
            + 'feeds a Penman–Monteith calculation, so that e*, Δ and γ stay mutually consistent.',
        math: 'e*(T) = 0.6108 · exp( 17.27 T / (T + 237.3) )',
        note: 'A function of temperature only. Saturation is set by interaction among water '
            + 'molecules, not by how much air is present, so e* does not change with elevation '
            + 'while every mass-based concentration does.' },
      { lead: 'Vapour concentration, which is what a vapour balance over a volume is written on:',
        math: 'χ = (M<sub>w</sub> / R T<sub>K</sub>) · e &nbsp;&nbsp;&nbsp; '
            + 'x = 0.622 e / (P − e)',
        note: 'χ in kg m⁻³ from e in Pa; x is the humidity ratio per kg of dry air.' },
      { lead: 'The psychrometric equation, inverted here by bisection for the wet bulb:',
        math: 'e = e*(T<sub>wb</sub>) − γ (T<sub>db</sub> − T<sub>wb</sub>), &nbsp;&nbsp; '
            + 'γ = 0.665 × 10⁻³ P, &nbsp;&nbsp; P = 101.3 ((293 − 0.0065 z) / 293)<sup>5.26</sup>',
        note: 'The wet-bulb depression T_db − T_wb is the entire cooling resource of an '
            + 'evaporative system, which is why this is the number that decides whether a pad '
            + 'wall is worth installing at all.' },
      { lead: 'Dew point by inverting the same saturation form, and the condensation criterion:',
        math: 'T<sub>dp</sub> = 237.3 ln(e/0.6108) / (17.27 − ln(e/0.6108)), &nbsp;&nbsp; '
            + 'condensation where T<sub>surface</sub> &lt; T<sub>dp</sub>',
        note: 'Dew-point depression, not relative humidity, is what decides condensation risk on '
            + 'the crop. In warm humid conditions a less-ventilated house can hold a larger '
            + 'depression than a ventilated one.' },
      { lead: 'The slope terms the crop and energy calculators need:',
        math: 'Δ = 4098 e*(T) / (T + 237.3)² &nbsp;&nbsp; χ′ ≈ 0.36 e<sup>0.05T</sup> '
            + '&nbsp;&nbsp; ε<sub>S</sub> ≈ 0.7156 e<sup>0.0533T</sup>',
        note: 'ε_S is the ratio of latent to sensible heat capacity of saturated air per kelvin. '
            + 'It runs from about 0.7 at 0 °C to about 3.5 at 30 °C, so the same ventilation rate '
            + 'removes very different proportions of latent and sensible heat in the tropics and '
            + 'in the Netherlands.' },
      { lead: 'Moist-air enthalpy, kJ per kg of dry air, zero at dry air and 0 °C:',
        math: 'h = 1.006 T + x (2500 + 1.805 T)',
        note: 'A cooling coil duty is a difference of enthalpy and not of temperature, which is '
            + 'why a closed house has to be sized on h.' }
    ],

    caveats: [
      'Vapour pressure deficit here is at air temperature. It is not the driving force for '
        + 'transpiration: that is χ_crop − χ_air, and canopy temperature differs from air '
        + 'temperature by up to 2 K in steady state. Use the transpiration calculator for the '
        + 'driving force and this one for stating crop targets.',
      'The condensation check compares one surface temperature you supply against the air dew '
        + 'point. It does not tell you how much water condenses; that needs the condensation '
        + 'conductance in the equilibrium humidity calculator.',
      'Three saturation forms are in use and they are not interchangeable. This page uses FAO-56 '
        + 'throughout. Buck holds its accuracy furthest outside 0 to 50 °C and Magnus carries an '
        + 'ice branch below zero.'
    ],

    sources: ['fao56', 'buck1981', 'stanghellini2019', 'stanghellini1987', 'stanghellini2008hum'],
    provenance: 'Transcribed from section 2 of "Greenhouse parameters and equations" by way of '
              + 'dehumid/psychro.py, and checked against that document’s own conversion and '
              + 'dew-point tables.'
  });
}());

