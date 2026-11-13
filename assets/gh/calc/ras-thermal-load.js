
(function () {
  'use strict';
  var S = GFC.svgns;
  var WATER_KWH_PER_M3_K = 1.163;   /* 4.186 MJ m-3 K-1 over 3.6 MJ per kWh */

  GFC.mount({
    slug: 'ras-thermal-load',
    kicker: 'Aquaculture',
    name: 'RAS make-up water heating and cooling load',
    lede: 'Recirculation saves most of the water but not the heat in it: every cubic metre of '
        + 'make-up water arrives at ambient temperature and has to be brought to the rearing '
        + 'temperature. This is the electrical load that takes, through a heat pump, per kilogram '
        + 'of fish.',
    inputNote: 'The load is per kilogram of fish produced, because make-up water is driven by '
             + 'production rather than by tank volume.',

    inputs: [
      { id: 'target', label: 'Rearing water temperature', unit: '°C', value: 15, step: 0.1, min: 1, max: 35 },
      { id: 'ambient', label: 'Make-up water temperature', unit: '°C', value: 8, step: 0.1, min: -2, max: 40,
        help: 'The temperature the water actually arrives at, which is groundwater or surface water and not air temperature.' },
      { id: 'wateruse', label: 'Make-up water per kg of fish', unit: 'm³ kg⁻¹', value: 0.08, step: 0.005, min: 0.001, max: 2,
        help: 'A well-run recirculating system runs 0.05 to 0.3 m³ per kg; a flow-through system is one to two orders of magnitude higher and this calculation then dominates its energy bill.' },
      { id: 'cop', label: 'Heat pump coefficient of performance', unit: '–', value: 3.3, step: 0.1, min: 1, max: 8,
        help: 'Electrical input is the thermal duty divided by this. A resistance heater is a coefficient of 1.' },

      { id: 'prod', label: 'Annual production', unit: 't y⁻¹', value: 100, step: 5, min: 0.1, max: 20000, group: 'Scale and price' },
      { id: 'price', label: 'Electricity price', unit: 'currency per kWh', value: 0.15, step: 0.01, min: 0, max: 2 },

      { id: 'amplitude', label: 'Seasonal swing in make-up water temperature', unit: '± K', value: 6, step: 0.5, min: 0, max: 20,
        group: 'Over the year',
        help: 'Groundwater is nearly constant; surface water swings with the season, and a system can need heating in winter and cooling in summer at the same set-point.' }
    ],

    compute: function (v) {
      var target = GFC.need(v.target, 'Rearing water temperature');
      var ambient = GFC.need(v.ambient, 'Make-up water temperature');
      var water = GFC.need(v.wateruse, 'Make-up water per kg', { positive: true });
      var cop = GFC.need(v.cop, 'Heat pump coefficient of performance', { positive: true });
      var prod = GFC.need(v.prod, 'Annual production', { positive: true });
      var price = GFC.need(v.price, 'Electricity price', { min: 0 });
      var amp = GFC.need(v.amplitude, 'Seasonal swing', { min: 0 });

      var dt = target - ambient;
      var perK = water * WATER_KWH_PER_M3_K / cop;        /* kWh per kg fish per K */
      var heating = perK * Math.max(dt, 0);               /* kWh per kg fish */
      var cooling = perK * Math.max(-dt, 0);
      var total = heating + cooling;

      var prodKg = prod * 1000;
      var annualKwh = total * prodKg;
      var annualCost = annualKwh * price;
      var thermalDuty = water * WATER_KWH_PER_M3_K * Math.abs(dt);   /* kWh thermal per kg */
      var waterPerYear = water * prodKg;

      /* A full year at a sinusoidal make-up temperature, so a system that both
       * heats and cools is not reported as if it only did one. */
      var hDays = 0, cDays = 0, hSum = 0, cSum = 0, day;
      for (day = 0; day < 365; day++) {
        var t = ambient + amp * Math.sin(2 * Math.PI * (day - 90) / 365);
        var d = target - t;
        if (d > 0) { hDays++; hSum += perK * d; } else if (d < 0) { cDays++; cSum += perK * -d; }
      }
      var annualHeatKwh = hSum / 365 * prodKg;
      var annualCoolKwh = cSum / 365 * prodKg;
      var annualBothKwh = annualHeatKwh + annualCoolKwh;

      var flags = [];
      if (dt > 0) flags.push({ head: 'Heating.',
        text: 'The make-up water is ' + GFC.fixed(dt, 1) + ' K below the set-point, so ' + GFC.fixed(heating, 4) + ' kWh of electricity per kilogram of fish goes into warming water that is then discharged.' });
      else if (dt < 0) flags.push({ head: 'Cooling.',
        text: 'The make-up water is ' + GFC.fixed(-dt, 1) + ' K above the set-point. Cooling is charged at the same coefficient here, which is optimistic for a chiller rejecting heat in summer.' });
      else flags.push({ head: 'No thermal duty at this hour.',
        text: 'Make-up water arrives at the set-point. That is the best case and it is rare for more than a few weeks a year.' });
      if (amp > 0 && hDays > 0 && cDays > 0) flags.push({ head: 'Both duties over the year.',
        text: GFC.fixed(hDays, 0) + ' days of heating and ' + GFC.fixed(cDays, 0) + ' days of cooling at this seasonal swing. A single-sign annual figure would miss ' + GFC.fixed(Math.min(annualHeatKwh, annualCoolKwh) / 1000, 1) + ' MWh of the smaller duty.' });
      if (water > 0.5) flags.push({ head: 'High make-up water use.',
        text: 'At ' + GFC.fixed(water, 2) + ' m³ per kg this is closer to a flow-through system than a recirculating one, and the thermal load dominates the energy bill rather than sitting beside it.' });

      return {
        headline: [
          { label: 'Electrical load', value: GFC.fixed(total, 4), unit: 'kWh kg⁻¹',
            hint: dt >= 0 ? 'Heating' : 'Cooling' },
          { label: 'Thermal duty', value: GFC.fixed(thermalDuty, 3), unit: 'kWh kg⁻¹',
            hint: 'Before the coefficient of performance' },
          { label: 'Annual electricity', value: GFC.fixed(annualKwh / 1000, 1), unit: 'MWh y⁻¹',
            hint: GFC.fixed(annualCost, 0) + ' per year' },
          { label: 'Over a full year', value: GFC.fixed(annualBothKwh / 1000, 1), unit: 'MWh y⁻¹',
            hint: 'Heating and cooling together' }
        ],
        flags: flags,
        rows: [
          { label: 'Temperature lift', value: GFC.fixed(dt, 2), unit: 'K', note: 'Set-point minus make-up water' },
          { label: 'Volumetric heat capacity of water', value: GFC.fixed(WATER_KWH_PER_M3_K, 4), unit: 'kWh m⁻³ K⁻¹', note: '4.186 MJ m⁻³ K⁻¹ over 3.6' },
          { label: 'Thermal duty per kg of fish', value: GFC.fixed(thermalDuty, 4), unit: 'kWh kg⁻¹', note: 'Water × capacity × |ΔT|' },
          { label: 'Electrical load per kelvin', value: GFC.sig(perK, 4), unit: 'kWh kg⁻¹ K⁻¹', note: 'Water × capacity ÷ coefficient of performance' },
          { label: 'Heating load', value: GFC.fixed(heating, 4), unit: 'kWh kg⁻¹', note: 'Zero if the water arrives warm' },
          { label: 'Cooling load', value: GFC.fixed(cooling, 4), unit: 'kWh kg⁻¹', note: 'Zero if the water arrives cold' },
          { label: 'Make-up water per year', value: GFC.fixed(waterPerYear, 0), unit: 'm³ y⁻¹', note: 'At ' + GFC.fixed(prod, 1) + ' t of production' },
          { label: 'Annual electricity, this condition', value: GFC.fixed(annualKwh, 0), unit: 'kWh y⁻¹', note: 'Held at the stated make-up temperature all year' },
          { label: 'Annual cost, this condition', value: GFC.fixed(annualCost, 0), unit: 'currency y⁻¹', note: 'At ' + GFC.fixed(price, 2) + ' per kWh' },
          { label: 'Heating days per year', value: GFC.fixed(hDays, 0), unit: 'd', note: 'At a ± ' + GFC.fixed(amp, 1) + ' K seasonal swing' },
          { label: 'Cooling days per year', value: GFC.fixed(cDays, 0), unit: 'd', note: 'Same swing' },
          { label: 'Annual heating electricity', value: GFC.fixed(annualHeatKwh, 0), unit: 'kWh y⁻¹', note: 'Integrated over the year' },
          { label: 'Annual cooling electricity', value: GFC.fixed(annualCoolKwh, 0), unit: 'kWh y⁻¹', note: 'Integrated over the year' },
          { label: 'Annual cost over the year', value: GFC.fixed(annualBothKwh * price, 0), unit: 'currency y⁻¹', note: 'Both duties' },
          { label: 'Cost per kg of fish', value: GFC.fixed(annualBothKwh * price / prodKg, 4), unit: 'currency kg⁻¹', note: 'Thermal only; excludes pumping, aeration and lighting' }
        ],
        caption: 'The two duties through the year at this seasonal swing. A set-point inside the '
               + 'swing means paying for heating and cooling in the same twelve months.',
        _v: { target: target, ambient: ambient, amp: amp, perK: perK }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 330, L = 66, T = 14, PW = W - L - 28, PH = H - T - 76;
      var lo = st.ambient - st.amp, hi = st.ambient + st.amp;
      var nc = S.nice(Math.min(lo, st.target), Math.max(hi, st.target), 4);
      var sx = S.scale(0, 365, L, L + PW);
      var sy = S.scale(nc.min, nc.max, T + PH, T);

      var g = S.open(W, H, 'Make-up water temperature against the set-point over the year');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: 365, yMin: nc.min, yMax: nc.max,
        xTicks: 12, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q / 30.4, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Month',
        yLabel: 'Water temperature (°C)'
      });

      /* shade the two duties between the curve and the set-point */
      var day, tPrev = null, xPrev = null;
      for (day = 0; day <= 365; day += 1) {
        var t = st.ambient + st.amp * Math.sin(2 * Math.PI * (day - 90) / 365);
        var x = sx(day);
        if (tPrev !== null) {
          var mid = (t + tPrev) / 2;
          var colour = mid < st.target ? pal.series[5] : pal.series[1];
          if (Math.abs(mid - st.target) > 1e-9) {
            g += S.rect(xPrev, sy(st.target), x - xPrev, sy(mid) - sy(st.target), colour,
              ' opacity="0.25"');
          }
        }
        tPrev = t; xPrev = x;
      }

      var d = '', first = true;
      for (day = 0; day <= 365; day += 2) {
        var tt = st.ambient + st.amp * Math.sin(2 * Math.PI * (day - 90) / 365);
        d += (first ? 'M' : 'L') + sx(day).toFixed(1) + ' ' + sy(tt).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.series[1], 2.2);
      g += S.line(L, sy(st.target), L + PW, sy(st.target), pal.accent, 2.4);
      g += S.text(L + 4, sy(st.target) - 6, 'rearing set-point ' + GFC.fixed(st.target, 1) + ' °C',
        { size: 10.5, fill: pal.accent, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'make-up water', colour: pal.series[1], dash: null },
        { label: 'heating needed', colour: pal.series[5], dash: null },
        { label: 'cooling needed', colour: pal.series[1], dash: null }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'The thermal duty is the make-up water times its heat capacity times the lift:',
        math: 'Q = V<sub>water</sub> × 1.163 × ΔT &nbsp; [kWh per kg of fish]',
        note: '1.163 kWh m⁻³ K⁻¹ is 4.186 MJ m⁻³ K⁻¹ divided by 3.6. Water use is per kilogram of '
            + 'fish produced, because make-up water is driven by production and not by tank volume.' },
      { lead: 'Electrical input through a heat pump, with the two signs kept separate so a system '
            + 'that does both is not reported as if it did one:',
        math: 'per K = V<sub>water</sub> × 1.163 / COP, &nbsp;&nbsp; '
            + 'heating = per K × max(ΔT, 0), &nbsp;&nbsp; cooling = per K × max(−ΔT, 0)',
        note: 'A resistance heater is a coefficient of 1 and costs three times as much as a heat '
            + 'pump at 3.3.' },
      { lead: 'Over a year with a seasonal swing in the source water:',
        math: 'T<sub>water</sub>(d) = T̄ + A sin(2π(d − 90)/365)',
        note: 'Groundwater is nearly constant and the swing can be left at zero; surface water '
            + 'swings, and a set-point inside the swing means paying for both duties.' }
    ],

    caveats: [
      'This is the make-up water duty only. It is not the whole thermal balance of a recirculating '
        + 'system, which also gains heat from pumps and blowers and loses it through tank walls, '
        + 'the building envelope and degassing.',
      'Cooling is charged at the same coefficient as heating, which flatters a chiller rejecting '
        + 'heat on a hot day. A real machine’s coefficient falls as the sink warms.',
      'Heat recovery from the discharge stream is not credited, and in a system with this much '
        + 'throughput it is usually the first thing worth costing.',
      'The seasonal curve is a sinusoid with a northern-hemisphere phase. For a real site, use '
        + 'measured source-water temperatures.'
    ],

    sources: ['timmons2018', 'klatt2026', 'li2023ras'],
    provenance: 'Transcribed from rasThermalLoad in NEEMO’s neemo-model.js, including its '
              + 'volumetric heat capacity constant of 1.163 kWh m⁻³ K⁻¹ and its default '
              + 'coefficient of performance of 3.3.'
  });
}());

