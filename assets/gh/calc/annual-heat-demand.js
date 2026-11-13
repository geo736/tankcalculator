
(function () {
  'use strict';
  var S = GFC.svgns;
  var RHO_CP = 1200;

  /* Gross and net calorific values, MJ per the stated unit. */
  var FUELS = [
    { k: 'ngl', label: 'Natural gas, Dutch low-calorific (m³)', hhv: 35.17, lhv: 31.65, unit: 'm³' },
    { k: 'ngh', label: 'Natural gas, high-calorific (m³)', hhv: 40.30, lhv: 34.00, unit: 'm³' },
    { k: 'biomethane', label: 'Biomethane (m³)', hhv: 38.30, lhv: null, unit: 'm³' },
    { k: 'propane', label: 'Propane (kg)', hhv: 50.33, lhv: 46.34, unit: 'kg' },
    { k: 'diesel', label: 'Light diesel (kg)', hhv: 46.10, lhv: 43.20, unit: 'kg' },
    { k: 'wood', label: 'Woody biomass, dry (kg)', hhv: 19.5, lhv: null, unit: 'kg' }
  ];

  GFC.mount({
    slug: 'annual-heat-demand',
    kicker: 'Greenhouse climate',
    name: 'Annual heat demand, fuel and load-duration sizing',
    lede: 'Capacity and annual energy answer different questions and are sensitive to different '
        + 'parameters. Capacity is set by the extreme of the climate; annual energy is set by the '
        + 'integral. An intervention can move one a great deal and the other hardly at all, which '
        + 'is why both have to be read off the same curve.',
    inputNote: 'Pick a bundled typical year, or paste your own hourly temperatures. Both the '
             + 'degree-day estimate and the duration curve are computed from whichever series is '
             + 'in use, so the comparison between methods is not confounded by the climate.',

    inputs: [
      { id: 'uprime', label: 'Design U-value on a cover basis', unit: 'W m⁻² K⁻¹', value: 3.36, step: 0.05, min: 0.3, max: 12,
        help: 'U_tr after the screen. The heating capacity calculator builds it from cover, screen and leakage.' },
      { id: 'ratio', label: 'Cover-to-floor area ratio', unit: '–', value: 1.12, step: 0.01, min: 0.8, max: 2.5 },
      { id: 'ach', label: 'Leakage air-change rate while heating', unit: 'h⁻¹', value: 0.25, step: 0.05, min: 0, max: 6 },
      { id: 'height', label: 'Mean internal height', unit: 'm', value: 6, step: 0.1, min: 1, max: 20 },
      { id: 'tin', label: 'Heating set-point', unit: '°C', value: 20, step: 0.5, min: 0, max: 40 },

      { id: 'site', label: 'Climate', unit: '', value: 'amsterdam', type: 'select',
        group: 'Climate',
        options: CLIMATE.sites().map(function (q) {
          return { v: q.key, label: q.label + ' (' + q.koppen + ')' };
        }).concat([{ v: 'custom', label: 'My own hourly series, pasted below' }]),
        help: 'Typical meteorological years from the EnergyPlus weather repository. Degree-days and the duration curve are both computed from the same hourly series, so they cannot disagree about the climate.' },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.70, step: 0.01, min: 0.2, max: 0.95,
        help: 'Used with the hourly irradiance in the bundled climate to credit the solar gain hour by hour, which is what a degree-day estimate cannot do.' },
      { id: 'onef', label: 'Sensible fraction of transmitted solar, (1 − f)', unit: '–', value: 0.45, step: 0.01, min: 0, max: 1,
        help: 'The rest becomes latent heat through transpiration and does not offset heating. 0.45 is the usual working value.' },
      { id: 'solarcredit', label: 'Annual solar credit for the degree-day estimate', unit: 'kWh m⁻² y⁻¹', value: 0, step: 5, min: 0, max: 400,
        help: 'A degree-day estimate has no hourly radiation to work with, so any solar credit has to be supplied as one annual number. Leaving it at zero is what makes the two methods diverge, and that divergence is the point.' },

      { id: 'series', label: 'Hourly outdoor temperature', unit: '°C, comma or newline separated',
        type: 'text', rows: 4, value: '',
        placeholder: 'Only read when the climate above is set to "my own hourly series". Any length works; the annual figure is scaled to the hours supplied.' },
      { id: 'pct', label: 'Peak percentile to drop', unit: '%', value: 1, step: 0.1, min: 0, max: 10,
        help: 'The top t % of hours are dropped so the plant is not sized on a handful of very short peaks.' },
      { id: 'circuit', label: 'Circuit capacity to test', unit: 'W m⁻²', value: 60, step: 5, min: 0, max: 500,
        help: 'The coverage fraction and shortfall hours are reported for this capacity, which is the question a second heat source answers.' },

      { id: 'fuel', label: 'Fuel', unit: '', value: 'ngl', type: 'select',
        options: FUELS.map(function (f) { return { v: f.k, label: f.label }; }), group: 'Fuel and boiler' },
      { id: 'basis', label: 'Efficiency basis', unit: '', value: 'gross', type: 'select',
        options: [{ v: 'gross', label: 'Gross (higher heating value)' },
                  { v: 'net', label: 'Net (lower heating value)' }],
        help: 'Boiler efficiencies quoted around 0.90 to 0.94 in this literature are generally relative to the GROSS value, which is why the same boiler is sold as 107 % efficient elsewhere. Neither number is wrong and they are not comparable.' },
      { id: 'eta', label: 'Boiler efficiency on that basis', unit: '–', value: 0.92, step: 0.01, min: 0.4, max: 1.1 },
      { id: 'fuelprice', label: 'Fuel price', unit: 'currency per unit', value: 0.40, step: 0.01, min: 0, max: 20 },
      { id: 'area', label: 'Floor area', unit: 'm²', value: 10000, step: 100, min: 10, max: 500000 }
    ],

    compute: function (v) {
      var uPrime = GFC.need(v.uprime, 'Design U-value', { positive: true });
      var ratio = GFC.need(v.ratio, 'Cover-to-floor area ratio', { positive: true });
      var ach = GFC.need(v.ach, 'Leakage air-change rate', { min: 0 });
      var height = GFC.need(v.height, 'Mean internal height', { positive: true });
      var tIn = GFC.need(v.tin, 'Heating set-point');
      var siteKey = String(v.site);
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var oneF = GFC.need(v.onef, 'Sensible fraction of transmitted solar', { min: 0, max: 1 });
      var solarCredit = GFC.need(v.solarcredit, 'Annual solar credit', { min: 0 });
      var pct = GFC.need(v.pct, 'Peak percentile', { min: 0, max: 10 });
      var circuit = GFC.need(v.circuit, 'Circuit capacity', { min: 0 });
      var fuel = FUELS.filter(function (f) { return f.k === String(v.fuel); })[0];
      if (!fuel) throw new Error('Fuel must be one of the listed six.');
      var basis = String(v.basis);
      var eta = GFC.need(v.eta, 'Boiler efficiency', { positive: true });
      var fuelPrice = GFC.need(v.fuelprice, 'Fuel price', { min: 0 });
      var area = GFC.need(v.area, 'Floor area', { positive: true });

      var gvLeak = ach * height / 3600;
      var uFloor = uPrime * ratio + RHO_CP * gvLeak;         /* W m-2 floor K-1 */

      /* One hourly series drives both answers: a bundled typical year, or the
       * user's own. */
      var temps = [], ghi = null, siteLabel;
      if (siteKey === 'custom') {
        String(v.series || '').trim().split(/[\s,;]+/).forEach(function (q) {
          if (q === '') return;
          var n = Number(q);
          if (isFinite(n)) temps.push(n);
        });
        if (temps.length < 24) {
          throw new Error('The pasted temperature series has only ' + temps.length
            + ' usable values. Paste at least a day of hourly data, or choose one of the bundled climates.');
        }
        siteLabel = 'the pasted series';
      } else {
        var site = CLIMATE.site(siteKey);
        if (!site) throw new Error('Climate must be one of the listed sites, or "my own hourly series".');
        temps = CLIMATE.series(siteKey, 't');
        ghi = CLIMATE.series(siteKey, 'ghi');
        siteLabel = site.label + ' (' + site.koppen + ')';
      }
      var haveSeries = temps.length >= 24;

      /* Degree-days from the same series, on the set-point as the base. */
      var hddSum = 0;
      temps.forEach(function (t) { if (tIn > t) hddSum += tIn - t; });
      var hdd = hddSum / 24 * (8760 / temps.length);
      var seasonJ = uFloor * hdd * 86400;                    /* J m-2 y-1 */
      var seasonKwhDd = Math.max(0, seasonJ / 3.6e6 - solarCredit);
      var loads = null, capacity = null, coverage = null, shortHours = null,
          seasonKwhCurve = null, hoursWithDemand = null, peak = null, scaled = null;
      if (haveSeries) {
        loads = temps.map(function (t, i) {
          var solar = ghi ? oneF * tau * ghi[i] : 0;
          return Math.max(0, uFloor * (tIn - t) - solar);
        });
        var sorted = loads.slice().sort(function (a, b) { return b - a; });
        peak = sorted[0];
        var k = Math.max(1, Math.ceil(pct / 100 * sorted.length));
        capacity = sorted[Math.min(k - 1, sorted.length - 1)];
        var sum = 0, covered = 0, over = 0, withDemand = 0;
        loads.forEach(function (q) {
          sum += q;
          covered += Math.min(q, circuit);
          if (q > circuit) over++;
          if (q > 0) withDemand++;
        });
        coverage = sum > 0 ? covered / sum : 1;
        shortHours = over;
        hoursWithDemand = withDemand;
        /* Scale the integral to a full year so it is comparable with the
         * degree-day figure however many hours were pasted. */
        scaled = 8760 / loads.length;
        seasonKwhCurve = sum * scaled / 1000;                /* W h m-2 to kWh m-2 */
      }

      var seasonKwh = haveSeries ? seasonKwhCurve : seasonKwhDd;
      var hv = basis === 'gross' ? fuel.hhv : fuel.lhv;
      if (hv === null) {
        throw new Error(fuel.label + ' has no published net calorific value in this table, so it '
          + 'can only be costed on the gross basis. Switch the efficiency basis to gross.');
      }
      var fuelUnits = seasonKwh * 3.6 / (hv * eta) * area;   /* units per year for the house */
      var fuelCost = fuelUnits * fuelPrice;
      var etaOther = basis === 'gross' ? eta * fuel.hhv / (fuel.lhv || fuel.hhv)
                                       : eta * (fuel.lhv || fuel.hhv) / fuel.hhv;

      var flags = [];
      flags.push({ head: 'Both answers from ' + siteLabel + '.',
        text: 'Degree-days on a base of ' + GFC.fixed(tIn, 1) + ' °C come to ' + GFC.fixed(hdd, 0)
            + ' K d, and the duration curve is built from the same hours. Where they differ it is '
            + 'because the curve credits the solar gain hour by hour and the degree-day estimate '
            + (solarCredit > 0 ? 'credits it as one annual figure.' : 'has nothing to credit it with.') });
      if (!haveSeries) flags.push({ head: 'Degree-day estimate.',
        text: 'This carries no information about solar gain or the humidity regime, so it compares envelopes at one site and cannot compare sites. A simulated European heating demand runs above 600 kWh m⁻² y⁻¹ in Sweden, Finland and Estonia, 200 to 600 across the rest of northern and central Europe and below 200 in Iberia, Greece and Cyprus. Any greenhouse economics using a single European energy figure is using a number that does not exist.' });
      else flags.push({ head: 'From ' + GFC.fixed(loads.length, 0) + ' hours of data.',
        text: 'Capacity is the ' + GFC.fixed(pct, 1) + ' % percentile of the sorted hourly demand and annual energy is the area under the same curve, scaled to a full year. The two are sensitive to different parameters, which is why they belong on one curve.' });
      if (haveSeries && circuit > 0) flags.push({ head: 'A ' + GFC.fixed(circuit, 0) + ' W m⁻² circuit covers ' + GFC.pct(coverage, 1) + ' of the energy.',
        text: 'It falls short in ' + GFC.fixed(shortHours, 0) + ' hours. The design question then becomes what second source covers those hours, rather than whether ' + GFC.fixed(circuit, 0) + ' W m⁻² is enough.' });
      if (basis === 'gross' && etaOther > 1) flags.push({ head: 'On the net basis this boiler is ' + GFC.pct(etaOther, 0) + ' efficient.',
        text: 'That is the same machine. The two values differ by the latent heat of the water combustion produces, which the gross basis counts as recovered and the net basis does not. The basis must always be stated.' });

      var rows = [
        { label: 'Design U-value on a floor basis', value: GFC.fixed(uFloor, 3), unit: 'W m⁻² K⁻¹', note: 'U_tr (A_c/A_s) + ρc_p g_V,leak' },
        { label: 'Degree-day seasonal demand', value: GFC.fixed(seasonJ / 1e9, 3), unit: 'GJ m⁻² y⁻¹', note: 'U′ × HDD × 86 400' },
        { label: 'Degree-day seasonal demand', value: GFC.fixed(seasonKwhDd, 1), unit: 'kWh m⁻² y⁻¹', note: 'After the solar credit' }
      ];
      if (haveSeries) {
        rows.push({ label: 'Hours supplied', value: GFC.fixed(loads.length, 0), unit: 'h', note: 'Scaled to a year by × ' + GFC.fixed(scaled, 3) });
        rows.push({ label: 'Peak hourly demand', value: GFC.fixed(peak, 1), unit: 'W m⁻²', note: 'The single coldest hour' });
        rows.push({ label: 'Capacity at the ' + GFC.fixed(pct, 1) + ' % percentile', value: GFC.fixed(capacity, 1), unit: 'W m⁻²', note: 'H_(k) with k = ⌈t n /100⌉' });
        rows.push({ label: 'Installed capacity for the house', value: GFC.fixed(capacity * area / 1000, 0), unit: 'kW', note: 'At the stated floor area' });
        rows.push({ label: 'Hours with any demand', value: GFC.fixed(hoursWithDemand, 0), unit: 'h', note: GFC.fixed(loads.length - hoursWithDemand, 0) + ' hours with none' });
        rows.push({ label: 'Annual energy from the curve', value: GFC.fixed(seasonKwhCurve, 1), unit: 'kWh m⁻² y⁻¹', note: 'Area under the duration curve' });
        rows.push({ label: 'Annual energy from the curve', value: GFC.fixed(seasonKwhCurve * 3.6 / 1000, 3), unit: 'GJ m⁻² y⁻¹', note: 'Same number' });
        rows.push({ label: 'Coverage by the test circuit', value: GFC.pct(coverage, 2), unit: '', note: 'Σ min(H, H_c) / Σ H' });
        rows.push({ label: 'Hours the circuit falls short', value: GFC.fixed(shortHours, 0), unit: 'h y⁻¹', note: '#{t : H(t) > H_c}' });
        rows.push({ label: 'Degree-day estimate for comparison', value: GFC.fixed(seasonKwhDd, 1), unit: 'kWh m⁻² y⁻¹', note: GFC.pct(seasonKwhDd / Math.max(seasonKwhCurve, 1e-9) - 1, 0) + ' against the curve, on the same hours' });
        rows.unshift({ label: 'Heating degree-days', value: GFC.fixed(hdd, 0), unit: 'K d', note: 'Base ' + GFC.fixed(tIn, 1) + ' °C, from the same hourly series' });
      }
      rows.push({ label: 'Gross calorific value', value: GFC.fixed(fuel.hhv, 2), unit: 'MJ per ' + fuel.unit, note: 'Higher heating value' });
      rows.push({ label: 'Net calorific value', value: fuel.lhv === null ? 'not published' : GFC.fixed(fuel.lhv, 2), unit: fuel.lhv === null ? '' : 'MJ per ' + fuel.unit, note: 'Lower heating value' });
      rows.push({ label: 'Efficiency as entered', value: GFC.pct(eta, 1), unit: '', note: 'On the ' + basis + ' basis' });
      rows.push({ label: 'The same boiler on the other basis', value: GFC.pct(etaOther, 1), unit: '', note: 'η_net = η_gross × HHV/LHV' });
      rows.push({ label: 'Fuel use', value: GFC.fixed(fuelUnits, 0), unit: fuel.unit + ' y⁻¹', note: 'For the whole house' });
      rows.push({ label: 'Fuel use per m²', value: GFC.fixed(fuelUnits / area, 3), unit: fuel.unit + ' m⁻² y⁻¹', note: 'For comparing with published figures' });
      rows.push({ label: 'Fuel cost', value: GFC.fixed(fuelCost, 0), unit: 'currency y⁻¹', note: 'At ' + GFC.fixed(fuelPrice, 2) + ' per ' + fuel.unit });
      rows.push({ label: 'Fuel cost per m²', value: GFC.fixed(fuelCost / area, 2), unit: 'currency m⁻² y⁻¹', note: 'Heat only' });

      return {
        headline: [
          { label: 'Annual heat demand', value: GFC.fixed(seasonKwh, 0), unit: 'kWh m⁻²',
            hint: haveSeries ? GFC.fixed(seasonKwh * 3.6 / 1000, 2) + ' GJ m⁻², from the curve' : 'Degree-day estimate' },
          { label: haveSeries ? 'Capacity' : 'Capacity', value: haveSeries ? GFC.fixed(capacity, 0) : '--',
            unit: haveSeries ? 'W m⁻²' : '', hint: haveSeries ? 'At the ' + GFC.fixed(pct, 1) + ' % percentile' : 'Needs an hourly series' },
          { label: 'Fuel', value: GFC.fixed(fuelUnits, 0), unit: fuel.unit + ' y⁻¹',
            hint: GFC.fixed(fuelCost, 0) + ' per year' },
          { label: haveSeries ? 'Shortfall hours' : 'Fuel per m²',
            value: haveSeries ? GFC.fixed(shortHours, 0) : GFC.fixed(fuelUnits / area, 2),
            unit: haveSeries ? 'h y⁻¹' : fuel.unit + ' m⁻²',
            hint: haveSeries ? 'For a ' + GFC.fixed(circuit, 0) + ' W m⁻² circuit' : 'On the ' + basis + ' basis' }
        ],
        flags: flags,
        rows: rows,
        caption: haveSeries
          ? 'The load-duration curve: hourly demand sorted descending. Its peak is the required '
            + 'capacity and its area is the annual energy. The shaded band is what the test '
            + 'circuit covers; the hours to its left are the ones a second source has to carry.'
          : 'With no hourly series there is no curve to draw, so this is the degree-day estimate '
            + 'against the simulated European range it should be read against.',
        _v: { haveSeries: haveSeries, loads: loads, circuit: circuit, capacity: capacity,
              seasonKwhDd: seasonKwhDd, pct: pct, siteLabel: siteLabel }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;

      if (!st.haveSeries) {
        /* The degree-day figure against the simulated European bands. */
        var bands = [
          { label: 'Iberia, Greece, Cyprus', lo: 0, hi: 200 },
          { label: 'northern and central Europe', lo: 200, hi: 600 },
          { label: 'Sweden, Finland, Estonia', lo: 600, hi: 900 }
        ];
        var sxb = S.scale(0, 900, L, L + PW);
        var g2 = S.open(W, 200, 'Degree-day estimate against the simulated European range');
        bands.forEach(function (b, i) {
          g2 += S.rect(sxb(b.lo), 40 + i * 34, sxb(b.hi) - sxb(b.lo), 22, pal.series[i], ' opacity="0.45"');
          g2 += S.text(sxb(b.lo) + 5, 55 + i * 34, b.label, { size: 10.5, fill: pal.ink });
        });
        g2 += S.line(sxb(Math.min(st.seasonKwhDd, 900)), 32, sxb(Math.min(st.seasonKwhDd, 900)), 146, pal.accent, 2.4);
        g2 += S.text(sxb(Math.min(st.seasonKwhDd, 900)), 26,
          GFC.fixed(st.seasonKwhDd, 0) + ' kWh m⁻² y⁻¹', { size: 11, anchor: 'middle', fill: pal.accent, weight: 600 });
        [0, 200, 400, 600, 800].forEach(function (q) {
          g2 += S.text(sxb(q), 166, GFC.fixed(q, 0), { size: 10.5, anchor: 'middle', fill: pal.soft });
        });
        g2 += S.line(L, 150, L + PW, 150, pal.axis, 1.2);
        g2 += S.text((L + L + PW) / 2, 186, 'Annual heating demand (kWh m⁻² y⁻¹)',
          { size: 11.5, anchor: 'middle', fill: pal.soft });
        g2 += S.close();
        return g2;
      }

      var sorted = st.loads.slice().sort(function (a, b) { return b - a; });
      var n = sorted.length;
      var nc = S.nice(0, sorted[0], 4);
      var sx = S.scale(0, n, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Load-duration curve');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: n, yMin: 0, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Hours at or above this demand',
        yLabel: 'Heat demand (W m⁻²)'
      });

      /* the area the test circuit covers */
      if (st.circuit > 0) {
        g += S.rect(L, sy(Math.min(st.circuit, nc.max)), PW, (T + PH) - sy(Math.min(st.circuit, nc.max)),
          pal.accentSoft, ' opacity="0.7"');
        g += S.line(L, sy(Math.min(st.circuit, nc.max)), L + PW, sy(Math.min(st.circuit, nc.max)),
          pal.series[2], 2, '5 3');
        g += S.text(L + PW - 3, sy(Math.min(st.circuit, nc.max)) - 6,
          'circuit ' + GFC.fixed(st.circuit, 0) + ' W m⁻²', { size: 10.5, anchor: 'end', fill: pal.series[2] });
      }

      var d = '', i, step = Math.max(1, Math.floor(n / 600));
      for (i = 0; i < n; i += step) {
        d += (i === 0 ? 'M' : 'L') + sx(i).toFixed(1) + ' ' + sy(Math.min(sorted[i], nc.max)).toFixed(1);
      }
      d += 'L' + sx(n - 1).toFixed(1) + ' ' + sy(Math.min(sorted[n - 1], nc.max)).toFixed(1);
      g += S.path(d, pal.accent, 2.2);

      var k = Math.max(1, Math.ceil(st.pct / 100 * n));
      g += S.line(sx(k), T, sx(k), T + PH, pal.warn, 1.3, '3 3');
      g += S.text(sx(k) + 5, T + 12, 'capacity ' + GFC.fixed(st.capacity, 0) + ' W m⁻²',
        { size: 10, fill: pal.warn });

      g += S.legend(L, H - 10, [
        { label: 'sorted hourly demand', colour: pal.accent, dash: null },
        { label: 'test circuit', colour: pal.series[2], dash: '5 3' },
        { label: 'sizing percentile', colour: pal.warn, dash: '3 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'The degree-day estimate, adequate for comparing envelopes at one site:',
        math: 'Q<sub>season</sub> ≈ (U′ A<sub>c</sub>/A<sub>s</sub> + ρc<sub>p</sub> g<sub>V,leak</sub>) × HDD × 86 400',
        note: 'It carries no information about the solar gain and humidity regimes that differ '
            + 'between sites, so it cannot compare sites. Use the duration curve wherever hourly '
            + 'climate data exist.' },
      { lead: 'The load-duration curve: solve the hourly balance over a reference year, sort '
            + 'descending, and drop the top t % so the plant is not sized on very short peaks.',
        math: 'H<sub>cap</sub> = H<sub>(k)</sub> with k = ⌈(t/100) n⌉, &nbsp;&nbsp; '
            + 'E<sub>ann</sub> = 3600 Σ<sub>t</sub> H<sub>h</sub>(t)',
        note: 'The peak is the required capacity and the area is the annual energy. Capacity is '
            + 'set by the extreme and so by U′ and the design outdoor temperature; annual energy '
            + 'is set by the integral and so by the screen, the leakage rate and the solar gain. '
            + 'A thermal screen is worth about a third of the annual energy while barely moving '
            + 'the peak, because on the design night the screen is closed in every variant.' },
      { lead: 'The same curve answers the sizing question directly:',
        math: 'f<sub>cov</sub>(H<sub>c</sub>) = Σ min(H<sub>h</sub>, H<sub>c</sub>) / Σ H<sub>h</sub>, '
            + '&nbsp;&nbsp; n<sub>short</sub>(H<sub>c</sub>) = #{t : H<sub>h</sub>(t) &gt; H<sub>c</sub>}',
        note: 'So the design question becomes what second source covers n_short, not whether the '
            + 'circuit is "enough".' },
      { lead: 'Gross and net calorific values differ by the latent heat of the water combustion '
            + 'produces:',
        math: 'LHV = HHV − n<sub>H₂O</sub> M<sub>H₂O</sub> L, &nbsp;&nbsp; '
            + 'η<sub>net</sub> = η<sub>gross</sub> × HHV/LHV',
        note: 'For Dutch low-calorific gas that is 35.17 against 31.65 MJ m⁻³, an 11 % difference. '
            + 'The widely used 35.17 is the GROSS value. A gross efficiency of 0.94 is a net '
            + 'efficiency of 1.04: neither number is wrong and they are not comparable.' }
    ],

    caveats: [
      'The hourly load here is the envelope and leakage loss against the set-point only. It '
        + 'carries no solar credit, no soil flux and no latent term, so it is an upper bound on '
        + 'the real hourly demand and the curve is correspondingly conservative.',
      'A1 and A2 houses have no heating circuit, so the corresponding exercise is a cooling '
        + 'duration curve built from the same hourly balance solved for the ventilation '
        + 'requirement. A closed house needs three curves — heating, cooling and '
        + 'dehumidification — and the interesting design quantity is their coincidence, because a '
        + 'plant serving two duties at once is sized on the envelope of the pair rather than on '
        + 'their sum.',
      'An indoor farm needs a single curve and it is electrical rather than thermal: lamp power is '
        + 'nearly constant by schedule, so the duration curve degenerates to a step.',
      'Fuel use here is the boiler alone. A combined heat and power engine, a buffer and a '
        + 'condensing flue-gas heat exchanger all change both the fuel and the basis on which its '
        + 'efficiency should be quoted.'
    ],

    sources: ['dezwart1996', 'ahamed2018', 'stanghellini2019', 'ep406'],
    provenance: 'Sections 7.11, 15.2, 15.3 and 15.4 of "Greenhouse parameters and equations". '
              + 'The envelope defaults are that document’s Dutch reference simulation, which '
              + 'reports 1.10 GJ m⁻² y⁻¹ with a thermal screen and 6 397 hours of demand. On the '
              + 'bundled Amsterdam typical year this page gives 1.04 GJ m⁻² y⁻¹ and 6 140 hours '
              + 'from a different weather file and without a night set-point reduction, so the '
              + 'two agree to within about six per cent.'
  });
}());

