
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'fan-ventilation',
    kicker: 'Greenhouse climate',
    name: 'Fan ventilation sizing to EP406.4',
    lede: 'The sizing balance for forced ventilation, and the one coefficient that decides the '
        + 'answer. A fan specification that does not state the assumed evapotranspiration '
        + 'coefficient is not a specification.',
    inputNote: 'The coefficient E runs from 0 to 1 and can exceed 1 for a healthy mature canopy '
             + 'with very dry inlet air, in which case the air cools from inlet to exhaust.',

    inputs: [
      { id: 'area', label: 'Floor area', unit: 'm²', value: 1000, step: 10, min: 10, max: 200000 },
      { id: 'isun', label: 'Design solar radiation', unit: 'W m⁻²', value: 900, step: 10, min: 100, max: 1200,
        help: 'The EP406.4 design chart uses 900 W m⁻².' },
      { id: 'tau', label: 'Cover transmissivity', unit: '–', value: 0.80, step: 0.01, min: 0.2, max: 0.95 },
      { id: 'u', label: 'Cover heat transfer coefficient', unit: 'W m⁻² K⁻¹', value: 4.0, step: 0.1, min: 0.5, max: 15 },
      { id: 'ratio', label: 'Cover-to-floor area ratio', unit: '–', value: 1.2, step: 0.01, min: 0.8, max: 2.5 },
      { id: 'tout', label: 'Outside air temperature', unit: '°C', value: 33, step: 0.5, min: -10, max: 50 },

      { id: 'E', label: 'Evapotranspiration coefficient E', unit: '–', value: 0.5, step: 0.05, min: 0, max: 1.4,
        group: 'The coefficient that decides it',
        help: 'Young, stressed, diseased or succulent crops lower it. Pad cooling lowers it by raising inlet humidity. Wet floors, standing water and fog raise it.' },
      { id: 'rise', label: 'Allowed inlet-to-exhaust rise', unit: 'K', value: 4, step: 0.5, min: 0.5, max: 15 },
      { id: 'pad', label: 'Inlet', unit: '', value: 0, type: 'select',
        options: [{ v: 0, label: 'Open inlet, air enters at outside temperature' },
                  { v: 1, label: 'Evaporative pad, air enters cooled' }] },
      { id: 'tinlet', label: 'Inlet temperature with a pad', unit: '°C', value: 26, step: 0.5, min: 0, max: 45,
        help: 'The EP406.4 pad curves use 26 °C against 33 °C outside. The evaporative cooling calculator derives it from the wet-bulb depression.' },

      { id: 'fansize', label: 'Rated flow per fan', unit: 'm³ s⁻¹', value: 4.0, step: 0.1, min: 0.2, max: 30, group: 'Layout' },
      { id: 'fandia', label: 'Fan diameter', unit: 'm', value: 1.25, step: 0.05, min: 0.2, max: 2.5 },
      { id: 'wall', label: 'Length of the fan wall', unit: 'm', value: 30, step: 1, min: 2, max: 400 },
      { id: 'windward', label: 'Fan wall orientation', unit: '', value: 0, type: 'select',
        options: [{ v: 0, label: 'Leeward or sheltered' }, { v: 1, label: 'Windward (+10 % capacity)' }] }
    ],

    compute: function (v) {
      var area = GFC.need(v.area, 'Floor area', { positive: true });
      var iSun = GFC.need(v.isun, 'Design solar radiation', { positive: true });
      var tau = GFC.need(v.tau, 'Cover transmissivity', { positive: true, max: 0.95 });
      var u = GFC.need(v.u, 'Cover heat transfer coefficient', { positive: true });
      var ratio = GFC.need(v.ratio, 'Cover-to-floor area ratio', { positive: true });
      var tOut = GFC.need(v.tout, 'Outside air temperature');
      var E = GFC.need(v.E, 'Evapotranspiration coefficient', { min: 0, max: 1.4 });
      var rise = GFC.need(v.rise, 'Allowed rise', { positive: true });
      var usePad = GFC.need(v.pad, 'Inlet') === 1;
      var tInletPad = GFC.need(v.tinlet, 'Inlet temperature with a pad');
      var fanSize = GFC.need(v.fansize, 'Rated flow per fan', { positive: true });
      var fanDia = GFC.need(v.fandia, 'Fan diameter', { positive: true });
      var wall = GFC.need(v.wall, 'Fan wall length', { positive: true });
      var windward = GFC.need(v.windward, 'Orientation') === 1;

      var tInlet = usePad ? tInletPad : tOut;
      var tEx = tInlet + rise;
      var tMean = (tEx + tInlet) / 2;

      /* EP406.4 eq. 4, rearranged for the specific air flow. Specific volume
       * and specific heat of the exhaust air come from the psychrometrics at
       * the mean house condition. */
      var solarGain = (1 - E) * tau * iSun;                  /* W m-2 of floor */
      var envelope = u * ratio * (tMean - tOut);             /* W m-2, negative if the house is cooler */
      var net = solarGain - envelope;

      var vEx = 1 / PSY.rhoDryAir(tEx, 0.6);                 /* m3 per kg dry air, approximate */
      var cpEx = 1006;                                       /* J kg-1 K-1 */
      if (net <= 0) {
        throw new Error('At E = ' + GFC.fixed(E, 2) + ' the crop is absorbing more than the net gain, '
          + 'so no ventilation is needed to hold this rise. That is the case where air cools from '
          + 'inlet to exhaust, and the sizing balance has no positive solution.');
      }
      var qSpecific = net * vEx / (cpEx * rise);              /* m3 s-1 per m2 of floor */
      var qTotal = qSpecific * area;

      var fanCapacity = fanSize * (windward ? 0.9 : 1.0);     /* windward fans lose 10 % */
      var nFans = Math.ceil(qTotal / fanCapacity);
      var fanArea = Math.PI * Math.pow(fanDia / 2, 2);
      var louvreArea = 1.375 * fanArea * nFans;               /* mid of the 1.25 to 1.50 range */
      var spacing = nFans > 1 ? wall / nFans : wall;
      var clearance = 4.5 * fanDia;                           /* mid of 4 to 5 diameters */
      var staticPa = usePad ? 30 : 15;                        /* kPa 0.030 / 0.015 */
      var fanPowerKw = qTotal * staticPa / 0.6 / 1000;        /* at a 60 % total efficiency */
      var achEquivalent = qSpecific * 3600 / 4.5;             /* at a nominal 4.5 m height */

      var flags = [];
      flags.push({ head: 'E = ' + GFC.fixed(E, 2) + ' is doing most of the work here.',
        text: 'It sets the fraction of the transmitted radiation that becomes latent heat rather than sensible heat. Moving it from 0.3 to 0.7 changes the required flow by a factor of about ' + GFC.fixed(0.7 / 0.3, 1) + '. This is why a fan specification without a stated E is not a specification.' });
      if (spacing > 7.6) flags.push({ head: 'Fan spacing ' + GFC.fixed(spacing, 1) + ' m.',
        text: 'EP406.4 7.1.11 keeps fans no more than 7.6 m apart along the wall. Either more fans or a shorter wall.' });
      if (usePad) flags.push({ head: 'With a pad the rise is larger and the mean is lower.',
        text: 'The pad has raised the inlet humidity ratio and so lowered E, which widens the inlet-to-exhaust rise while lowering the average house temperature. Reporting only the rise makes pads look worse than they are; reporting only the mean hides why the far end is hot. Houses should not exceed 50 m in the airflow direction, and pad-to-fan distance is best kept to 30 to 45 m.' });
      if (qSpecific > 0.08) flags.push({ head: GFC.fixed(qSpecific, 3) + ' m³ s⁻¹ per m² is above the tabulated rates.',
        text: 'EP406.4 7.7.1 gives 0.06 for summer ventilation in small houses and 0.08 where evaporative cooling is fitted. A requirement above that points at the radiation, the coefficient or the allowed rise rather than at the fans.' });
      if (windward) flags.push({ head: 'Windward wall.',
        text: 'Ten per cent of rated capacity is lost to the wind, which is why the fan count here is computed on the derated figure.' });

      return {
        headline: [
          { label: 'Air flow required', value: GFC.fixed(qTotal, 1), unit: 'm³ s⁻¹',
            hint: GFC.fixed(qSpecific, 4) + ' per m² of floor' },
          { label: 'Fans', value: GFC.fixed(nFans, 0), unit: '',
            hint: 'At ' + GFC.fixed(fanCapacity, 2) + ' m³ s⁻¹ each' },
          { label: 'Equivalent air changes', value: GFC.fixed(achEquivalent, 0), unit: 'h⁻¹',
            hint: 'At a nominal 4.5 m height' },
          { label: 'Fan power', value: GFC.fixed(fanPowerKw, 1), unit: 'kW',
            hint: 'At ' + GFC.fixed(staticPa, 0) + ' Pa static and 60 % efficiency' }
        ],
        flags: flags,
        rows: [
          { label: 'Inlet temperature', value: GFC.fixed(tInlet, 1), unit: '°C', note: usePad ? 'Behind the pad' : 'Outside air' },
          { label: 'Exhaust temperature', value: GFC.fixed(tEx, 1), unit: '°C', note: 'Inlet plus the allowed rise' },
          { label: 'Mean house temperature', value: GFC.fixed(tMean, 1), unit: '°C', note: '(exhaust + inlet)/2, as EP406.4 defines it' },
          { label: 'Transmitted radiation', value: GFC.fixed(tau * iSun, 0), unit: 'W m⁻²', note: 'τ I' },
          { label: 'Sensible share after evapotranspiration', value: GFC.fixed(solarGain, 1), unit: 'W m⁻²', note: '(1 − E) τ I' },
          { label: 'Envelope exchange', value: GFC.fixed(envelope, 1), unit: 'W m⁻²', note: 'U (A_c/A_s)(T_mean − T_out); negative when the house is cooler' },
          { label: 'Net sensible load', value: GFC.fixed(net, 1), unit: 'W m⁻²', note: 'What the fans have to carry' },
          { label: 'Specific volume of exhaust air', value: GFC.fixed(vEx, 4), unit: 'm³ kg⁻¹', note: 'At the exhaust condition' },
          { label: 'Specific air flow', value: GFC.fixed(qSpecific, 5), unit: 'm³ s⁻¹ m⁻²', note: 'Net load × specific volume ÷ (c_p × rise)' },
          { label: 'Total air flow', value: GFC.fixed(qTotal, 2), unit: 'm³ s⁻¹', note: 'Over the floor area' },
          { label: 'Derated capacity per fan', value: GFC.fixed(fanCapacity, 3), unit: 'm³ s⁻¹', note: windward ? 'Rated less 10 % for the windward wall' : 'As rated' },
          { label: 'Number of fans', value: GFC.fixed(nFans, 0), unit: '', note: 'Rounded up' },
          { label: 'Installed capacity', value: GFC.fixed(nFans * fanCapacity, 2), unit: 'm³ s⁻¹', note: GFC.pct(nFans * fanCapacity / qTotal - 1, 0) + ' above the requirement' },
          { label: 'Fan face area each', value: GFC.fixed(fanArea, 3), unit: 'm²', note: 'π d²/4' },
          { label: 'Inlet louvre area', value: GFC.fixed(louvreArea, 2), unit: 'm²', note: '1.25 to 1.50 × fan area; mid value used' },
          { label: 'Fan spacing along the wall', value: GFC.fixed(spacing, 2), unit: 'm', note: 'Maximum 7.6 m' },
          { label: 'Clear distance at discharge', value: GFC.fixed(clearance, 2), unit: 'm', note: '4 to 5 fan diameters' },
          { label: 'Design static pressure', value: GFC.fixed(staticPa, 0), unit: 'Pa', note: usePad ? '0.030 kPa with pads' : '0.015 kPa without pads' },
          { label: 'Fan shaft power', value: GFC.fixed(fanPowerKw, 2), unit: 'kW', note: 'Flow × static ÷ efficiency' },
          { label: 'Internal circulation flow', value: GFC.fixed(0.01 * area, 2), unit: 'm³ s⁻¹', note: '0.01 m³ s⁻¹ m⁻², with canopy velocity held below 1.0 m s⁻¹' },
          { label: 'Winter ventilation flow', value: GFC.fixed(0.0125 * area, 2), unit: 'm³ s⁻¹', note: '0.005 to 0.020 m³ s⁻¹ m⁻², 10 to 50 % of summer' }
        ],
        caption: 'Required air flow against the evapotranspiration coefficient, with the operating '
               + 'point marked. The curve is the whole argument for stating E in a specification.',
        _v: { tau: tau, iSun: iSun, u: u, ratio: ratio, tMean: tMean, tOut: tOut, rise: rise,
              vEx: vEx, area: area, E: E, qTotal: qTotal }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 70, T = 14, PW = W - L - 28, PH = H - T - 72;
      var flowAt = function (E) {
        var net = (1 - E) * st.tau * st.iSun - st.u * st.ratio * (st.tMean - st.tOut);
        if (net <= 0) return 0;
        return net * st.vEx / (1006 * st.rise) * st.area;
      };
      var nc = S.nice(0, flowAt(0), 4);
      var sx = S.scale(0, 1.2, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Required air flow against the evapotranspiration coefficient');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: 1.2, yMin: 0, yMax: nc.max,
        xTicks: 12, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 1); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Evapotranspiration coefficient E',
        yLabel: 'Air flow required (m³ s⁻¹)'
      });

      var d = '', e, first = true;
      for (e = 0; e <= 1.2001; e += 0.005) {
        d += (first ? 'M' : 'L') + sx(e).toFixed(1) + ' ' + sy(Math.min(flowAt(e), nc.max)).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      g += S.line(sx(1), T, sx(1), T + PH, pal.line, 1.2, '3 3');
      g += S.text(sx(1) + 4, T + 12, 'E = 1', { size: 10, fill: pal.soft });

      var px = sx(Math.min(st.E, 1.2)), py = sy(Math.min(st.qTotal, nc.max));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px - 9, py - 8, GFC.fixed(st.qTotal, 1) + ' m³ s⁻¹',
        { size: 11, anchor: 'end', fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'required flow at this design condition', colour: pal.accent, dash: null },
        { label: 'where the air cools from inlet to exhaust', colour: pal.line, dash: '3 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'The EP406.4 sizing balance, for the air volume needed to hold a temperature rise:',
        math: '(1 − E) τ I A<sub>f</sub> = U A<sub>c</sub>(t<sub>i</sub> − t<sub>o</sub>) '
            + '+ (Q<sub>v</sub> A<sub>f</sub> c<sub>p,ex</sub> / v<sub>ex</sub>)(t<sub>ex</sub> − t<sub>inlet</sub>)',
        note: 'with t_i the mean of exhaust and inlet, t_inlet the temperature just inside the pads '
            + 'if fitted and otherwise outside, and v_ex and c_p,ex from the psychrometrics at the '
            + 'exhaust condition.' },
      { lead: 'E, the evapotranspiration coefficient, decides the answer:',
        math: 'sensible load = (1 − E) τ I',
        note: 'It ranges 0 to 1 and can exceed 1 for a healthy mature canopy with very dry inlet '
            + 'air, in which case the air cools from inlet to exhaust and the balance has no '
            + 'positive solution. Young, stressed, diseased or succulent crops lower it; pad '
            + 'cooling lowers it by raising the inlet humidity ratio; wet floors, standing water '
            + 'and fog raise it.' },
      { lead: 'The tabulated design rates, which the computed flow should be read against:',
        math: 'summer 0.06 &nbsp;·&nbsp; with evaporative cooling 0.08 &nbsp;·&nbsp; '
            + 'winter 0.005 to 0.020 &nbsp;&nbsp; m³ s⁻¹ per m² of floor',
        note: 'Internal circulation with no air exchange is 0.01 m³ s⁻¹ m⁻², with local canopy '
            + 'velocity held below 1.0 m s⁻¹. Circulation also raises crop temperature whenever '
            + 'the crop is colder than the air, which directly reduces condensation risk.' }
    ],

    caveats: [
      'Louvres belong upstream of the fans, to cut the friction loss. Roof-mounted fans raise '
        + 'infiltration through their louvres in cold climates and can be sealed shut by frozen '
        + 'condensate.',
      'This sizes the design hour. The seasonal water use of an evaporative system and the annual '
        + 'fan energy both come from a duration curve over a climate year, not from this '
        + 'calculation.',
      'Fan shaft power here uses one assumed total efficiency. Real fan curves fall steeply with '
        + 'static pressure, and a screened or dirty inlet moves the operating point along the '
        + 'curve rather than simply reducing flow in proportion.',
      'Gradients are inherent in a pad-and-fan house: the coolest point is at the pads and '
        + 'temperature rises towards the fans with the solar load. A single mean temperature '
        + 'hides that.'
    ],

    sources: ['ep406', 'sethi2007cooling', 'stanghellini2019'],
    provenance: 'Section 9.7 and the layout tables of section 9.8 of "Greenhouse parameters and '
              + 'equations", which reproduce ANSI/ASAE EP406.4. The defaults are that standard’s '
              + 'own design-chart reference conditions.'
  });
}());

