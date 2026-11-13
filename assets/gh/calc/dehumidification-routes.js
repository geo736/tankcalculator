
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'dehumidification-routes',
    kicker: 'Greenhouse climate',
    name: 'Dehumidification routes: energy and cost per kilogram',
    lede: 'Thirteen ways to take water out of a greenhouse, each scored on its own published '
        + 'coefficient and on the same boundary. The corrections matter more than the '
        + 'coefficients: a route that condenses water is charged the overcooling it causes, a '
        + 'sorption route is charged the adsorption heat it dumps, and ventilation is charged '
        + 'the heat it imports.',
    inputNote: 'Ventilation is the only route whose cost depends on the weather, and the only one '
             + 'that can be unavailable. Everything else is priced on its own characterisation.',

    inputs: [
      { id: 'tin', label: 'Inside set-point temperature', unit: '°C', value: 26, step: 0.1, min: 5, max: 40 },
      { id: 'rhin', label: 'Inside humidity set-point', unit: '%', value: 80, step: 1, min: 40, max: 95 },
      { id: 'tout', label: 'Outside air temperature', unit: '°C', value: 29, step: 0.1, min: -30, max: 50 },
      { id: 'rhout', label: 'Outside relative humidity', unit: '%', value: 85, step: 1, min: 5, max: 100 },

      { id: 'band', label: 'Where in each parameter band', unit: '', value: 'base', type: 'select',
        group: 'Evidence',
        options: [{ v: 'base', label: 'Base value' },
                  { v: 'low', label: 'Low end of every band' },
                  { v: 'high', label: 'High end of every band' }],
        help: 'Each ledger row carries a low, base and high value from its source. Sweeping the band is how the ranking is tested; some routes change places.' },

      { id: 'duty', label: 'Latent duty to remove', unit: 'g m⁻² h⁻¹', value: 150, step: 5, min: 1, max: 1000,
        group: 'Duty',
        help: 'The transpiration the two natural exits cannot carry. The equilibrium humidity calculator produces it.' },
      { id: 'hours', label: 'Hours per year the duty runs', unit: 'h', value: 4000, step: 100, min: 1, max: 8760 },
      { id: 'pelec', label: 'Electricity price', unit: 'currency per kWh', value: 0, step: 0.01, min: 0, max: 2,
        help: 'Leave at zero to use the ledger’s own price.' },
      { id: 'pheat', label: 'Heat price', unit: 'currency per kWh', value: 0, step: 0.01, min: 0, max: 2,
        help: 'Leave at zero to use the ledger’s own price.' }
    ],

    compute: function (v) {
      var tIn = GFC.need(v.tin, 'Inside set-point temperature');
      var rhIn = GFC.need(v.rhin, 'Inside humidity set-point', { min: 40, max: 95 }) / 100;
      var tOut = GFC.need(v.tout, 'Outside air temperature');
      var rhOut = GFC.need(v.rhout, 'Outside relative humidity', { min: 5, max: 100 }) / 100;
      var which = String(v.band);
      if (['base', 'low', 'high'].indexOf(which) < 0) throw new Error('Band must be low, base or high.');
      var duty = GFC.need(v.duty, 'Latent duty', { positive: true });
      var hours = GFC.need(v.hours, 'Hours per year', { positive: true, max: 8760 });
      var pe = GFC.need(v.pelec, 'Electricity price', { min: 0 });
      var ph = GFC.need(v.pheat, 'Heat price', { min: 0 });

      var set = DEHUMID.build(which);
      var priceElec = pe > 0 ? pe : set.priceElec;
      var priceHeat = ph > 0 ? ph : set.priceHeat;

      var all = set.evaluateAll(tIn, rhIn, tOut, rhOut);
      var chiIn = PSY.chi(tIn, rhIn), chiOut = PSY.chi(tOut, rhOut);
      var dChi = chiIn - chiOut;
      var kgPerYear = duty / 1000 * hours;        /* kg m-2 y-1 */

      var scored = DEHUMID.ROUTES.map(function (meta) {
        var res = all[meta.key];
        var kwhPerKg = isFinite(res.w) ? res.w / 3.6e6 : Infinity;
        var price = res.pricedOn === 'heat' ? priceHeat : priceElec;
        var perKg = kwhPerKg * price;
        /* A sorption route bought on heat also pays electricity for the
         * adsorption heat the chiller removes, at its own price. */
        var extraElec = res.components && res.components.w_elec
          ? res.components.w_elec / 3.6e6 * priceElec : 0;
        return {
          meta: meta, res: res,
          kwhPerKg: kwhPerKg,
          costPerKg: isFinite(perKg) ? perKg + extraElec : Infinity,
          extraElec: extraElec
        };
      });

      var available = scored.filter(function (s) { return isFinite(s.kwhPerKg); });
      available.sort(function (a, b) { return a.costPerKg - b.costPerKg; });
      var best = available[0];
      var coil = scored.filter(function (s) { return s.meta.key === 'coil_heat_pump'; })[0];

      var ventRes = all.forced_ventilation;
      var ventAvailable = ventRes.available;
      var maxVent = ventAvailable ? set.maxRemovalPerHour(dChi) * 1000 : 0;   /* g m-2 h-1 */
      var extrap = DEHUMID.extrapolationK(tOut);
      var floor = DEHUMID.secondLawFloor(set.copCeiling) / 3.6e6;

      var flags = [];
      if (!ventAvailable) flags.push({ head: 'Outside air is not a vapour sink.',
        text: 'At ' + GFC.fixed(tOut, 1) + ' °C and ' + GFC.fixed(rhOut * 100, 0) + ' % the outside air holds '
            + GFC.fixed(chiOut * 1000, 1) + ' g m⁻³ against ' + GFC.fixed(chiIn * 1000, 1)
            + ' g m⁻³ inside, so ventilation adds water instead of removing it. Both ventilation routes are out.' });
      else if (maxVent < duty) flags.push({ head: 'Ventilation cannot carry the duty.',
        text: 'Through a difference of ' + GFC.fixed(dChi * 1000, 2) + ' g m⁻³ the installed airflow moves at most '
            + GFC.fixed(maxVent, 0) + ' g m⁻² h⁻¹ against a duty of ' + GFC.fixed(duty, 0)
            + '. A specific energy carries no rate, so this limit is a property of the hour and not of the route.' });
      if (extrap > 0) flags.push({ head: 'Chiller curve extrapolated ' + GFC.fixed(extrap, 1) + ' K.',
        text: 'The coefficient slope was fitted between 29.7 and 36.6 °C outside. Beyond that range this is an extrapolation and should be read as one.' });
      if (best && best.meta.maturity !== 'mature' && best.meta.maturity !== 'field') {
        flags.push({ head: 'The cheapest route here is ' + best.meta.maturity + '.',
          text: best.meta.label + ' is not a mature technology, and a route with no built greenhouse installation is a research direction rather than a specification.' });
      }
      flags.push({ head: 'Second-law floor ' + GFC.fixed(floor, 3) + ' kWh kg⁻¹.',
        text: 'No device can remove latent heat with less work than this at the best coefficient in the ledger. A reported figure below it is a reporting-boundary error, not a breakthrough.' });

      var rows = [];
      scored.forEach(function (s) {
        var c = s.res.components || {};
        var basis = [];
        if (c.cop !== undefined) basis.push('COP ' + GFC.fixed(c.cop, 2));
        if (c.smer !== undefined) basis.push('SMER ' + GFC.fixed(c.smer, 2) + ' L kWh⁻¹');
        if (c.specific_energy_mj !== undefined) basis.push(GFC.fixed(c.specific_energy_mj, 2) + ' MJ kg⁻¹ published');
        if (c.ratio !== undefined) basis.push('ratio ' + GFC.fixed(c.ratio, 2) + ' × a conventional machine');
        if (c.vol_per_kg !== undefined) basis.push(GFC.fixed(c.vol_per_kg, 0) + ' m³ of air per kg');
        if (s.res.pricedOn === 'heat') basis.push('bought as heat');
        if (s.extraElec > 0) basis.push('plus adsorption heat on electricity');
        if (s.res.note) basis.push(s.res.note);
        rows.push({
          label: s.meta.label,
          value: isFinite(s.kwhPerKg) ? GFC.fixed(s.kwhPerKg, 3) : 'unavailable',
          unit: isFinite(s.kwhPerKg) ? 'kWh kg⁻¹' : '',
          note: (isFinite(s.costPerKg) ? GFC.fixed(s.costPerKg, 4) + ' per kg. ' : '')
              + s.meta.maturity + '. ' + basis.join('; ')
        });
      });
      rows.push({ label: 'Inside vapour concentration', value: GFC.fixed(chiIn * 1000, 2), unit: 'g m⁻³', note: 'At the set-point' });
      rows.push({ label: 'Outside vapour concentration', value: GFC.fixed(chiOut * 1000, 2), unit: 'g m⁻³', note: 'At the stated weather' });
      rows.push({ label: 'Concentration difference', value: GFC.fixed(dChi * 1000, 2), unit: 'g m⁻³', note: dChi > 0 ? 'Ventilation is a sink' : 'Ventilation is a source' });
      rows.push({ label: 'Chiller coefficient at this hour', value: GFC.fixed(set.copAt(tOut), 3), unit: '–', note: 'Slope through two measured anchors, bounded by the ledger band' });
      rows.push({ label: 'Sensible burden on condensing routes', value: GFC.fixed(set.cSens, 3), unit: '–', note: 'c_sens; the overcooling charged as (L + c_sens)' });
      rows.push({ label: 'Water removed per year', value: GFC.fixed(kgPerYear, 1), unit: 'kg m⁻² y⁻¹', note: 'Duty × hours' });
      if (best) {
        rows.push({ label: 'Annual cost, cheapest route', value: GFC.fixed(best.costPerKg * kgPerYear, 2), unit: 'currency m⁻² y⁻¹', note: best.meta.label });
      }
      if (coil && isFinite(coil.costPerKg)) {
        rows.push({ label: 'Annual cost, cold coil', value: GFC.fixed(coil.costPerKg * kgPerYear, 2), unit: 'currency m⁻² y⁻¹', note: 'The mature reference route' });
      }

      return {
        headline: [
          { label: 'Cheapest route', value: best ? GFC.fixed(best.costPerKg, 3) : '--',
            unit: 'per kg', hint: best ? best.meta.label : 'no route available' },
          { label: 'Cold coil reference', value: coil && isFinite(coil.kwhPerKg) ? GFC.fixed(coil.kwhPerKg, 3) : '--',
            unit: 'kWh kg⁻¹', hint: 'The mature benchmark' },
          { label: 'Ventilation', value: ventAvailable ? GFC.fixed(maxVent, 0) : 'none',
            unit: ventAvailable ? 'g m⁻² h⁻¹' : '', hint: ventAvailable ? 'Most the airflow can carry' : 'Outside air is wetter than inside' },
          { label: 'Annual water', value: GFC.fixed(kgPerYear, 0), unit: 'kg m⁻² y⁻¹',
            hint: 'At ' + GFC.fixed(hours, 0) + ' h of duty' }
        ],
        flags: flags,
        rows: rows,
        caption: 'Specific energy per kilogram of water removed, cheapest first. Routes priced on '
               + 'heat and routes priced on electricity are drawn differently because they are '
               + 'not bought at the same price.',
        _v: { scored: available, duty: duty }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var rows = st.scored.map(function (s) {
        return {
          label: s.meta.label.length > 34 ? s.meta.label.slice(0, 32) + '…' : s.meta.label,
          value: s.kwhPerKg,
          colour: s.res.pricedOn === 'heat' ? pal.series[2]
                : s.meta.maturity === 'mature' || s.meta.maturity === 'field' ? pal.accent
                : pal.series[1],
          text: GFC.fixed(s.kwhPerKg, 2)
        };
      });
      rows.sort(function (a, b) { return a.value - b.value; });
      return S.bars({
        pal: pal, width: 640, labelW: 218, rowH: 24,
        title: 'Specific energy by route',
        axisLabel: 'kWh per kg of water removed  ·  green mature or field-measured, blue earlier stage, amber bought as heat',
        rows: rows
      });
    },

    math: [
      { lead: 'Condensation on a cold coil, with no recovery credit, because a cooling-dominated '
            + 'house has no simultaneous heat demand to absorb the condenser heat:',
        math: 'w = (L + c<sub>sens</sub>) / COP<sub>c</sub>',
        note: 'The sensible term is the overcooling the coil causes while reaching the dew point. '
            + 'Dropping it compares a condensing route against a non-condensing one on different '
            + 'boundaries, and the published worked case passes through zero at a recovery '
            + 'fraction of 0.25, which is why temperate figures for this route do not transfer.' },
      { lead: 'Any sorption route pays regeneration energy and then pays again for the adsorption '
            + 'heat it releases into the air:',
        math: 'w<sub>regen</sub> = L / COP<sub>regen</sub>, &nbsp;&nbsp; '
            + 'w<sub>adsorb</sub> = L / COP<sub>c</sub>',
        note: 'Sorption converts latent heat to sensible heat. In a heating-dominated house that '
            + 'is a benefit; in a cooling-dominated one the chiller has to remove it. The two '
            + 'components are kept separate and each is charged at its own price, because folding '
            + 'one into the other at a base price ratio is exact only at that pair.' },
      { lead: 'Ventilation, the only weather-dependent route:',
        math: 'volume per kg = 1 / (χ<sub>in</sub> − χ<sub>out</sub>), &nbsp;&nbsp; '
            + 'w = fan work + ρc<sub>p</sub>|ΔT| × volume / COP<sub>c</sub>',
        note: 'Unavailable whenever outside air is wetter than inside. The sensible penalty has '
            + 'two signs and both are charged: colder outside air must be reheated, and hotter '
            + 'outside air brings heat the cooling plant must remove.' },
      { lead: 'A unit characterised by a measured extraction rate, and one published only as a '
            + 'coefficient:',
        math: 'w = 3.6 × 10⁶ / SMER &nbsp;&nbsp; (SMER in L kWh⁻¹), &nbsp;&nbsp; w = L / COP',
        note: 'A specific moisture extraction rate is already a latent-only quantity, so no '
            + 'overcooling is added. A coefficient defined as cooling output over electric input '
            + 'is a total-cooling coefficient and carries the coil’s burden instead.' },
      { lead: 'The sanity bound every row is checked against:',
        math: 'w<sub>min</sub> = L / COP<sub>best</sub>',
        note: 'No device removes latent heat L with less than L/COP of work.' }
    ],

    caveats: [
      'This is operating energy and operating cost only. Capital is in the ledger for some routes '
        + 'and absent for others, and a route with no published capital cannot be ranked on total '
        + 'cost of ownership however cheap its energy looks.',
      'Maturity is reported for every row because it changes what the number means. A laboratory '
        + 'element and a field-measured machine do not belong in the same ranking without the '
        + 'label, and the active membrane exchanger is a boundary transfer from a '
        + 'dedicated-outdoor-air duty onto recirculated greenhouse air.',
      'The chiller coefficient falls as outdoor temperature rises, so the plant is least '
        + 'efficient in exactly the hours when the latent duty is largest. A fixed-coefficient '
        + 'comparison cannot represent that, which is why the slope is used here.',
      'Lowering the humidity set-point raises transpiration, so the duty is not independent of '
        + 'the target. The marginal kilogram costs more than the average kilogram.'
    ],

    sources: ['campen2003drying', 'stanghellini2019', 'graamans2018', 'ep406', 'sethi2007cooling'],
    provenance: 'Scoring transcribed from dehumid/routes.py; parameters generated from that '
              + 'model’s parameters.csv, which carries one row per published value with its '
              + 'source, DOI, page, evidence class and verification state. The per-route sources '
              + 'are named in the Basis column rather than in the list above, because there are '
              + 'more of them than this page should print.'
  });
}());

