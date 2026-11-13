
(function () {
  'use strict';
  var S = GFC.svgns;

  /* Saturation efficiencies and face velocities as ANSI/ASAE EP406.4 tabulates
   * them. The efficiency column is the design figure, not a measured one. */
  var PADS = [
    { v: 0.70, label: 'Aspen fibre, 50–100 mm (pad-and-fan design value)', face: 0.76, water: 3.7, sump: 20 },
    { v: 0.75, label: 'Corrugated cellulose, 100 mm', face: 1.27, water: 6.2, sump: 33 },
    { v: 0.85, label: 'Corrugated cellulose, 150 mm', face: 1.78, water: 9.9, sump: 40 },
    { v: 0.25, label: 'Fog, measured mean cooling efficiency (0.2–0.3)', face: 0, water: 0, sump: 0 },
    { v: 0.50, label: 'Mist, mid of the 0.1–0.6 evaporation range', face: 0, water: 0, sump: 0 }
  ];

  GFC.mount({
    slug: 'evaporative-cooling',
    kicker: 'Greenhouse climate',
    name: 'Evaporative cooling: pad, mist and fog',
    lede: 'Evaporative cooling can only ever reach the wet-bulb temperature, and only a fraction '
        + 'of the way there. This works out how much cooling the air on site actually allows, '
        + 'what the house gains in humidity, and how much water it takes.',
    inputNote: 'The cooling available is set by the outside air, not by the equipment. Equipment '
             + 'only decides what fraction of it you capture.',

    inputs: [
      { id: 't',   label: 'Outside air temperature', unit: '°C', value: 34, step: 0.1, min: -5, max: 55 },
      { id: 'rh',  label: 'Outside relative humidity', unit: '%', value: 60, step: 1, min: 1, max: 100 },
      { id: 'alt', label: 'Site elevation', unit: 'm', value: 0, step: 10, min: -400, max: 4000 },
      { id: 'eff', label: 'System and saturation efficiency', unit: '–', value: 0.70, type: 'select',
        options: PADS.map(function (p) { return { v: p.v, label: p.label }; }),
        help: 'Pad efficiency rises with depth and falls with face velocity. Fog and mist are quoted on measured mean cooling efficiency, which is much lower.' },
      { id: 'flow', label: 'Ventilation rate through the pad', unit: 'm³ s⁻¹ per m² floor', value: 0.06,
        step: 0.005, min: 0.005, max: 0.2, group: 'Sizing',
        help: 'EP406.4 gives 0.06 for summer ventilation and 0.08 where evaporative cooling is fitted. Pad-and-fan houses run up to 20 air changes per hour to limit the pad-to-fan gradient.' },
      { id: 'area', label: 'Greenhouse floor area', unit: 'm²', value: 1000, step: 50, min: 10, max: 200000 },
      { id: 'hours', label: 'Hours of cooling per year', unit: 'h', value: 2000, step: 50, min: 0, max: 8760 },
      { id: 'pwater', label: 'Water price', unit: 'currency per m³', value: 1.20, step: 0.05, min: 0, max: 20 }
    ],

    compute: function (v) {
      var t = GFC.need(v.t, 'Outside air temperature');
      var rh = GFC.need(v.rh, 'Outside relative humidity', { min: 1, max: 100 }) / 100;
      var alt = GFC.need(v.alt, 'Site elevation');
      var eff = GFC.need(v.eff, 'Saturation efficiency', { positive: true, max: 1 });
      var flow = GFC.need(v.flow, 'Ventilation rate', { positive: true });
      var area = GFC.need(v.area, 'Floor area', { positive: true });
      var hours = GFC.need(v.hours, 'Hours of cooling', { min: 0 });
      var pw = GFC.need(v.pwater, 'Water price', { min: 0 });

      var p = PSY.pressureAt(alt);
      var wb = PSY.wetBulb(t, rh, p);
      var wbd = t - wb;
      var drop = eff * wbd;
      var tOut = t - drop;

      /* The process is isenthalpic: sensible heat becomes latent heat, so the
       * humidity ratio rises by exactly the water evaporated. */
      var xIn = PSY.humidityRatio(t, rh, p);
      var hIn = PSY.enthalpy(t, rh, p);
      var xOut = (hIn - 1.006 * tOut) / (2500 + 1.805 * tOut);
      var rhOut = Math.min(1, PSY.rhFromChi(tOut, PSY.chiFromE(p * xOut / (0.622 + xOut), tOut)));
      var dx = xOut - xIn;

      /* Mass flow of dry air per m2 of floor, from the volumetric rate. */
      var rhoDry = PSY.rhoDryAir(t, rh, p);
      var mDry = flow * rhoDry;                       /* kg dry air m-2 s-1 */
      var water_g_m2_h = mDry * dx * 1000 * 3600;     /* g m-2 h-1 */
      var waterHouse_lph = water_g_m2_h * area / 1000;
      var waterYear_m3 = waterHouse_lph * hours / 1000;
      var costYear = waterYear_m3 * pw;

      /* Sensible cooling delivered at the pad face, per m2 of floor. */
      var coolW = mDry * 1006 * drop;

      var pad = PADS.filter(function (q) { return q.v === eff; })[0] || PADS[0];
      var totalFlow = flow * area;                    /* m3 s-1 */
      var padArea = pad.face > 0 ? totalFlow / pad.face : null;
      var padWater = padArea !== null ? pad.water * Math.sqrt(padArea) : null;

      var flags = [];
      if (wbd < 3) flags.push({ head: 'Wet-bulb depression only ' + GFC.fixed(wbd, 1) + ' K.',
        text: 'There is almost no evaporative cooling resource in this air. Equipment efficiency cannot create one.' });
      if (rhOut > 0.90) flags.push({ head: 'Air leaves the pad at ' + GFC.pct(rhOut, 0) + ' RH.',
        text: 'Above 90 % RH brings Botrytis risk, and the pad has also lowered the evapotranspiration coefficient E, so the inlet-to-exhaust temperature rise will be larger than in an uncooled house.' });
      if (drop > 0 && t - drop < 18) flags.push({ head: 'Cooled below 18 °C.',
        text: 'Check against the crop set-point before sizing on this; most greenhouse crops are not helped by going colder.' });
      flags.push({ head: 'Buoyancy reverses.',
        text: 'Once the house is below outside temperature, the stack effect works against ventilation and wind becomes the only driver. With no wind this kind of cooling does not work.' });

      var rows = [
        { label: 'Wet-bulb temperature', value: GFC.fixed(wb, 2), unit: '°C', note: 'The floor the air can reach, at 100 % efficiency' },
        { label: 'Wet-bulb depression', value: GFC.fixed(wbd, 2), unit: 'K', note: 'The whole cooling resource of the site' },
        { label: 'Temperature drop achieved', value: GFC.fixed(drop, 2), unit: 'K', note: 'η_sat × wet-bulb depression' },
        { label: 'Air temperature after the pad', value: GFC.fixed(tOut, 2), unit: '°C', note: 'Coolest point in the house' },
        { label: 'Relative humidity after the pad', value: GFC.pct(rhOut, 0), unit: '', note: 'Along the constant-enthalpy line' },
        { label: 'Humidity ratio added', value: GFC.fixed(dx * 1000, 2), unit: 'g kg⁻¹', note: 'Equal to the water evaporated per kg of dry air' },
        { label: 'Sensible cooling at the pad', value: GFC.fixed(coolW, 1), unit: 'W m⁻²', note: 'ṁ c_p ΔT per m² of floor' },
        { label: 'Water evaporated', value: GFC.fixed(water_g_m2_h, 0), unit: 'g m⁻² h⁻¹', note: 'Isenthalpic process; this is the whole water duty' },
        { label: 'Water for the house', value: GFC.fixed(waterHouse_lph, 1), unit: 'L h⁻¹', note: 'At the stated floor area' },
        { label: 'Water over the season', value: GFC.fixed(waterYear_m3, 1), unit: 'm³ y⁻¹', note: 'At ' + GFC.fixed(hours, 0) + ' cooling hours' },
        { label: 'Water cost over the season', value: GFC.fixed(costYear, 0), unit: 'currency y⁻¹', note: 'Water only; pump electricity is small but not zero' },
        { label: 'Total air flow', value: GFC.fixed(totalFlow, 2), unit: 'm³ s⁻¹', note: 'Floor area × specific rate' }
      ];
      if (padArea !== null) {
        rows.push({ label: 'Pad face area required', value: GFC.fixed(padArea, 1), unit: 'm²',
          note: 'At the tabulated face velocity of ' + pad.face + ' m s⁻¹' });
        rows.push({ label: 'Minimum pad water flow', value: GFC.fixed(pad.water, 1), unit: 'L min⁻¹ per m of pad',
          note: 'EP406.4 7.2.1, with a sump of ' + pad.sump + ' L per m² of pad' });
        void padWater;
      }

      return {
        headline: [
          { label: 'Temperature drop', value: GFC.fixed(drop, 1), unit: 'K',
            hint: 'To ' + GFC.fixed(tOut, 1) + ' °C at the pad' },
          { label: 'Humidity after the pad', value: GFC.fixed(rhOut * 100, 0), unit: '%',
            hint: 'From ' + GFC.fixed(rh * 100, 0) + ' % outside' },
          { label: 'Water', value: GFC.fixed(waterHouse_lph, 0), unit: 'L h⁻¹',
            hint: GFC.fixed(water_g_m2_h, 0) + ' g m⁻² h⁻¹' },
          { label: 'Cooling delivered', value: GFC.fixed(coolW, 0), unit: 'W m⁻²',
            hint: 'Sensible, at the pad face' }
        ],
        flags: flags,
        rows: rows,
        caption: 'The process on a psychrometric chart. Evaporative cooling moves the air along '
               + 'a line of constant enthalpy towards the saturation curve, and stops where the '
               + 'saturation efficiency leaves it.',
        _v: { t: t, rh: rh, p: p, tOut: tOut, xIn: xIn, xOut: xOut, wb: wb, eff: eff }
      };
    },

    draw: function (v, r, pal) {
      var W = 640, H = 380, L = 62, T = 14, PW = W - L - 86, PH = H - T - 72;
      var st = r._v;
      var tMin = 5, tMax = 55, xMax = 45;
      var sx = S.scale(tMin, tMax, L, L + PW);
      var sy = S.scale(0, xMax, T + PH, T);

      var g = S.open(W, H, 'Evaporative cooling on a psychrometric chart');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: tMin, xMax: tMax, yMin: 0, yMax: xMax,
        xTicks: 10, yTicks: 9, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Dry-bulb temperature (°C)',
        yLabel: 'Humidity ratio (g kg⁻¹ dry air)'
      });

      [0.2, 0.4, 0.6, 0.8, 1.0].forEach(function (rh) {
        var d = '', tt, xx, first = true, last = tMin;
        for (tt = tMin; tt <= tMax + 0.001; tt += 0.5) {
          xx = PSY.humidityRatio(tt, rh, st.p) * 1000;
          if (xx > xMax) break;
          d += (first ? 'M' : 'L') + sx(tt).toFixed(1) + ' ' + sy(xx).toFixed(1);
          first = false;
          last = tt;
        }
        var sat = rh === 1.0;
        g += S.path(d, sat ? pal.accent : pal.line, sat ? 2 : 1.1, null, sat ? null : '3 3');
        g += S.text(sx(last) + 4, sy(PSY.humidityRatio(last, rh, st.p) * 1000) + 3,
          GFC.fixed(rh * 100, 0) + ' %', { size: 10, fill: sat ? pal.accent : pal.soft });
      });

      /* the constant-enthalpy path from the outside state to the pad outlet */
      var x1 = sx(st.t), y1 = sy(st.xIn * 1000);
      var x2 = sx(st.tOut), y2 = sy(st.xOut * 1000);
      /* where full saturation would have landed */
      var xSat = sx(st.wb), ySat = sy(PSY.humidityRatio(st.wb, 1.0, st.p) * 1000);

      g += S.line(x2, y2, xSat, ySat, pal.soft, 1.4, '3 3');
      g += S.line(x1, y1, x2, y2, pal.series[2], 2.6);
      g += S.circle(xSat, ySat, 3.2, pal.soft);
      g += S.circle(x1, y1, 5, pal.series[1]);
      g += S.circle(x2, y2, 5, pal.series[2]);

      g += S.text(x1 + 9, y1 + 4, 'outside', { size: 11, fill: pal.ink, weight: 600 });
      g += S.text(x2 - 9, y2 - 8, 'after the pad', { size: 11, anchor: 'end', fill: pal.ink, weight: 600 });
      g += S.text(xSat - 6, ySat - 8, 'wet bulb (η = 1)', { size: 10, anchor: 'end', fill: pal.soft });

      g += S.legend(L, H - 10, [
        { label: 'cooling achieved', colour: pal.series[2], dash: null },
        { label: 'cooling left on the table', colour: pal.soft, dash: '3 3' },
        { label: 'saturation', colour: pal.accent, dash: null }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Saturation efficiency is the fraction of the wet-bulb depression the equipment '
            + 'actually delivers:',
        math: 'η<sub>sat</sub> = (T<sub>db,in</sub> − T<sub>db,out</sub>) / (T<sub>db,in</sub> − T<sub>wb,in</sub>)',
        note: 'The pad water assumes the wet-bulb temperature unless it is actively cooled, and '
            + 'only at 100 % efficiency would the air reach it. Saturation efficiency and '
            + 'pressure drop both rise with pad depth and fall with face velocity.' },
      { lead: 'So the temperature drop and the outlet state are:',
        math: 'ΔT = η<sub>sat</sub> (T<sub>db</sub> − T<sub>wb</sub>), &nbsp;&nbsp; '
            + 'h<sub>out</sub> = h<sub>in</sub>, &nbsp;&nbsp; '
            + 'x<sub>out</sub> = (h<sub>in</sub> − 1.006 T<sub>out</sub>) / (2500 + 1.805 T<sub>out</sub>)',
        note: 'The process is isenthalpic: sensible heat is converted to latent heat and nothing '
            + 'leaves the air stream. The water evaporated is exactly the rise in humidity ratio.' },
      { lead: 'Water duty follows from the dry-air mass flow:',
        math: 'ṁ<sub>water</sub> = ṁ<sub>dry air</sub> (x<sub>out</sub> − x<sub>in</sub>), &nbsp;&nbsp; '
            + 'ṁ<sub>dry air</sub> = g<sub>V</sub> ρ<sub>dry</sub>',
        note: 'Pad face area comes from the tabulated face velocity for the material; velocities '
            + 'may be raised by at most 25 % where space is limiting, and higher face velocities '
            + 'reduce cooling.' },
      { lead: 'The efficiency index quoted on outside conditions, which is cruder but more '
            + 'practical, describes the cooling of the inlet air rather than of the greenhouse air:',
        math: 'η<sub>fs</sub> = (T<sub>db,out</sub> − T<sub>db,i</sub>) / (T<sub>db,out</sub> − T<sub>wb,out</sub>) × 100 %' }
    ],

    caveats: [
      'The drop computed here is at the pad. Temperature rises towards the fans with the solar '
        + 'load, so the mean house temperature is higher and the far end hotter. Houses should '
        + 'not exceed 50 m in the airflow direction, and pad-to-fan distance is best kept to '
        + '30 to 45 m.',
      'A pad-cooled house has a larger inlet-to-exhaust temperature rise than an uncooled one at '
        + 'the same ventilation rate, because the pad has raised the inlet humidity ratio and so '
        + 'lowered the evapotranspiration coefficient. Reporting only the rise makes pads look '
        + 'worse than they are; reporting only the mean hides why the far end is hot.',
      'A great deal of cooling power is spent on the surroundings rather than on the crop. Where '
        + 'more cooling is wanted it is usually better to cool the inside of the house than to '
        + 'ventilate harder with outside air.',
      'Water price here is the water only. Bleed-off against mineral build-up adds 0.002 to '
        + '0.006 L min⁻¹ per m³ s⁻¹ of air depending on make-up water TDS, and continuous bleed '
        + 'is preferred to periodic flushing.'
    ],

    sources: ['ep406', 'sethi2007cooling', 'kittas2005', 'katsoulas2009fog', 'seginer1994', 'stanghellini2019'],
    provenance: 'Pad materials, face velocities, water flows and sump volumes are the ANSI/ASAE '
              + 'EP406.4 tables as reproduced in section 12.2 of "Greenhouse parameters and '
              + 'equations". Fog and mist efficiencies are the measured ranges in section 12.1.'
  });
}());

