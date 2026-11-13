
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'root-zone-water',
    kicker: 'Hydroponics',
    name: 'Root-zone water balance and irrigation volume',
    lede: 'Under a cover there is no rain and no run-off, so every litre supplied is accounted '
        + 'for by transpiration, evaporation, drainage or storage. That is what makes a '
        + 'greenhouse water balance closable to a few per cent where a field balance is not.',
    inputNote: 'About 90 % of the water taken up is transpired and about 10 % is stored in fresh '
             + 'biomass, so transpiration is a good proxy for crop water requirement.',

    inputs: [
      { id: 'transp', label: 'Crop transpiration', unit: 'mm d⁻¹', value: 3.0, step: 0.1, min: 0.01, max: 12,
        help: 'Greenhouse tomato runs 0.06 to 6.57 mm d⁻¹ across a season and about 333 mm over the whole crop. The transpiration calculator derives it from the climate.' },
      { id: 'evap', label: 'Substrate surface evaporation', unit: 'mm d⁻¹', value: 0.2, step: 0.05, min: 0, max: 3,
        help: 'Small under a covered substrate and not negligible on bare wet media or a wet floor.' },
      { id: 'drainfrac', label: 'Target drainage fraction', unit: '–', value: 0.30, step: 0.05, min: 0, max: 0.6,
        help: 'The fraction of the supply that is meant to leave as drainage. Roughly 70 % of irrigation ends up as transpiration in a well-run system, which is this fraction at 0.30.' },
      { id: 'days', label: 'Crop cycle length', unit: 'd', value: 240, step: 5, min: 1, max: 400 },

      { id: 'substrate', label: 'Substrate volume', unit: 'L m⁻²', value: 12, step: 1, min: 0.5, max: 100,
        group: 'What is in the system' },
      { id: 'whc', label: 'Water-holding capacity', unit: '–', value: 0.65, step: 0.01, min: 0.05, max: 0.95,
        help: 'Fraction of the substrate volume holding water against gravity at container capacity.' },
      { id: 'tanks', label: 'Tank and pipework volume', unit: 'L m⁻²', value: 12, step: 1, min: 0, max: 200 },
      { id: 'depletion', label: 'Allowable depletion before the next event', unit: '–', value: 0.15, step: 0.01, min: 0.02, max: 0.6,
        help: 'Fraction of the available water the crop may use between irrigations. It sets the event size and so the frequency.' },

      { id: 'yield', label: 'Fresh yield over the cycle', unit: 'kg m⁻²', value: 60, step: 1, min: 0.1, max: 300,
        group: 'Efficiency and price' },
      { id: 'price', label: 'Water price', unit: 'currency per m³', value: 1.20, step: 0.05, min: 0, max: 20 },
      { id: 'recycle', label: 'Drainage recycled', unit: '–', value: 0.9, step: 0.05, min: 0, max: 1,
        help: 'A closed system recovers most of its drainage. What it cannot recover is set by the salt balance, not by the plumbing.' }
    ],

    compute: function (v) {
      var transp = GFC.need(v.transp, 'Crop transpiration', { positive: true });
      var evap = GFC.need(v.evap, 'Substrate surface evaporation', { min: 0 });
      var drainFrac = GFC.need(v.drainfrac, 'Target drainage fraction', { min: 0, max: 0.6 });
      var days = GFC.need(v.days, 'Crop cycle length', { positive: true });
      var substrate = GFC.need(v.substrate, 'Substrate volume', { positive: true });
      var whc = GFC.need(v.whc, 'Water-holding capacity', { positive: true, max: 0.95 });
      var tanks = GFC.need(v.tanks, 'Tank and pipework volume', { min: 0 });
      var depletion = GFC.need(v.depletion, 'Allowable depletion', { positive: true, max: 0.6 });
      var yieldKg = GFC.need(v.yield, 'Fresh yield', { positive: true });
      var price = GFC.need(v.price, 'Water price', { min: 0 });
      var recycle = GFC.need(v.recycle, 'Drainage recycled', { min: 0, max: 1 });

      /* I = T + E_s + D, with D a stated fraction of the supply. */
      var consumed = transp + evap;                        /* mm d-1 */
      var supply = consumed / (1 - drainFrac);             /* mm d-1 */
      var drain = supply - consumed;
      var fresh = supply - drain * recycle;                /* mm d-1 of new water */

      var supplyCycle = supply * days;                     /* mm = L m-2 */
      var consumedCycle = consumed * days;
      var drainCycle = drain * days;
      var freshCycle = fresh * days;

      var waterInSubstrate = substrate * whc;              /* L m-2 */
      var systemWater = waterInSubstrate + tanks;
      var eventSize = waterInSubstrate * depletion;        /* L m-2 per event */
      var eventsPerDay = supply / Math.max(eventSize, 1e-9);
      var hoursBetween = eventsPerDay > 0 ? 24 / eventsPerDay : Infinity;
      var turnover = systemWater > 0 ? supply / systemWater : Infinity;

      var wueGross = yieldKg / (supplyCycle / 1000);        /* kg per m3 supplied */
      var wueFresh = yieldKg / (freshCycle / 1000);         /* kg per m3 of new water */
      var waterPerKg = freshCycle / yieldKg;                /* L per kg */
      var costPerKg = freshCycle / 1000 * price / yieldKg;

      /* About 90 % of uptake is transpired and 10 % stored in biomass. */
      var storedInBiomass = consumedCycle * 0.10 / 0.90;

      var flags = [];
      if (eventsPerDay > 24) flags.push({ head: GFC.fixed(eventsPerDay, 0) + ' irrigation events a day.',
        text: 'That is more than hourly. Either the allowable depletion is too tight or the substrate volume is too small to buffer this transpiration rate.' });
      else if (eventsPerDay < 0.5) flags.push({ head: 'Fewer than one event every two days.',
        text: 'A long interval lets the root zone swing in both water content and salinity, and the salinity swing is usually what limits it rather than the water.' });
      if (drainFrac === 0) flags.push({ head: 'No drainage.',
        text: 'With nothing leaving, every non-nutrient ion that arrives stays. The salt accumulation calculator shows how fast that becomes the binding constraint.' });
      if (recycle > 0 && drainFrac > 0) flags.push({ head: 'Recycling ' + GFC.pct(recycle, 0) + ' of the drainage.',
        text: 'New water falls to ' + GFC.fixed(fresh, 2) + ' mm d⁻¹ against a supply of ' + GFC.fixed(supply, 2) + '. What cannot be recycled is set by the salt balance and not by the plumbing.' });
      flags.push({ head: 'Trigger on radiation, not on a clock.',
        text: 'Greenhouse transpiration is driven mainly by radiation and only weakly by temperature, so irrigation programmes trigger an event on accumulated radiation, calibrated against observed drainage. That calibration is only available in soilless systems where drainage can be measured on a short timescale.' });

      return {
        headline: [
          { label: 'Irrigation supply', value: GFC.fixed(supply, 2), unit: 'mm d⁻¹',
            hint: GFC.fixed(supplyCycle, 0) + ' mm over the cycle' },
          { label: 'New water needed', value: GFC.fixed(fresh, 2), unit: 'mm d⁻¹',
            hint: 'After recycling ' + GFC.pct(recycle, 0) + ' of the drainage' },
          { label: 'Events per day', value: GFC.fixed(eventsPerDay, 1), unit: '',
            hint: GFC.fixed(eventSize, 2) + ' L m⁻² each' },
          { label: 'Water use efficiency', value: GFC.fixed(wueFresh, 1), unit: 'kg m⁻³',
            hint: GFC.fixed(waterPerKg, 1) + ' L per kg of produce' }
        ],
        flags: flags,
        rows: [
          { label: 'Transpiration', value: GFC.fixed(transp, 3), unit: 'mm d⁻¹', note: 'The dominant term' },
          { label: 'Surface evaporation', value: GFC.fixed(evap, 3), unit: 'mm d⁻¹', note: 'Entered' },
          { label: 'Consumed', value: GFC.fixed(consumed, 3), unit: 'mm d⁻¹', note: 'T + E_s' },
          { label: 'Irrigation supply', value: GFC.fixed(supply, 3), unit: 'mm d⁻¹', note: 'Consumed ÷ (1 − drainage fraction)' },
          { label: 'Drainage', value: GFC.fixed(drain, 3), unit: 'mm d⁻¹', note: 'Supply − consumed' },
          { label: 'New water after recycling', value: GFC.fixed(fresh, 3), unit: 'mm d⁻¹', note: 'Supply − recycled drainage' },
          { label: 'Supply over the cycle', value: GFC.fixed(supplyCycle, 1), unit: 'mm', note: 'Equivalently L m⁻²' },
          { label: 'Consumed over the cycle', value: GFC.fixed(consumedCycle, 1), unit: 'mm', note: 'Compare with about 333 mm for a greenhouse tomato season' },
          { label: 'Drainage over the cycle', value: GFC.fixed(drainCycle, 1), unit: 'mm', note: 'What the salt balance has to work with' },
          { label: 'New water over the cycle', value: GFC.fixed(freshCycle, 1), unit: 'mm', note: 'What has to be bought or abstracted' },
          { label: 'Stored in fresh biomass', value: GFC.fixed(storedInBiomass, 2), unit: 'mm', note: 'About 10 % of uptake against 90 % transpired' },
          { label: 'Water held in the substrate', value: GFC.fixed(waterInSubstrate, 2), unit: 'L m⁻²', note: 'Volume × water-holding capacity' },
          { label: 'Total water in the system', value: GFC.fixed(systemWater, 2), unit: 'L m⁻²', note: 'Substrate plus tanks and pipework' },
          { label: 'Event size', value: GFC.fixed(eventSize, 3), unit: 'L m⁻²', note: 'Substrate water × allowable depletion' },
          { label: 'Events per day', value: GFC.fixed(eventsPerDay, 2), unit: '', note: 'Supply ÷ event size' },
          { label: 'Interval between events', value: isFinite(hoursBetween) ? GFC.fixed(hoursBetween, 2) : '--', unit: 'h', note: 'At a constant transpiration rate' },
          { label: 'System turnover', value: GFC.fixed(turnover, 4), unit: 'd⁻¹', note: 'Supply ÷ system water; the inverse is the residence time' },
          { label: 'Water use efficiency, gross', value: GFC.fixed(wueGross, 2), unit: 'kg m⁻³', note: 'Yield per m³ supplied' },
          { label: 'Water use efficiency, new water', value: GFC.fixed(wueFresh, 2), unit: 'kg m⁻³', note: 'Yield per m³ abstracted; the figure to quote' },
          { label: 'Water per kilogram of produce', value: GFC.fixed(waterPerKg, 2), unit: 'L kg⁻¹', note: 'New water only' },
          { label: 'Water cost per kilogram', value: GFC.fixed(costPerKg, 4), unit: 'currency kg⁻¹', note: 'At ' + GFC.fixed(price, 2) + ' per m³' }
        ],
        caption: 'Where the supply goes. The drainage bar is the only one the salt balance can '
               + 'use, and recycling it moves water from the new-water column into the recycled one.',
        _v: { consumed: consumed, drain: drain, recycle: recycle, supply: supply, fresh: fresh }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      return S.bars({
        pal: pal, width: 640, labelW: 176, rowH: 30,
        title: 'The root-zone water balance',
        axisLabel: 'mm per day',
        rows: [
          { label: 'Supply', value: st.supply, colour: pal.series[0], text: GFC.fixed(st.supply, 2) },
          { label: 'Consumed by the crop', value: st.consumed, colour: pal.accent, text: GFC.fixed(st.consumed, 2) },
          { label: 'Drainage', value: st.drain, colour: pal.series[1], text: GFC.fixed(st.drain, 2) },
          { label: 'Drainage recycled', value: st.drain * st.recycle, colour: pal.series[4], text: GFC.fixed(st.drain * st.recycle, 2) },
          { label: 'New water needed', value: st.fresh, colour: pal.series[2], text: GFC.fixed(st.fresh, 2) }
        ]
      });
    },

    math: [
      { lead: 'The full root-zone balance, with the terms a cover removes struck out:',
        math: 'ΔS = I + P + C − T − E<sub>s</sub> − D − R',
        note: 'Under a cover P and R are zero, and capillary rise C is zero in any substrate '
            + 'system, so it reduces to I = T + E_s + D + ΔS. Every litre supplied is accounted '
            + 'for, which is what makes the balance closable to a few per cent.' },
      { lead: 'Supply from the consumption and a target drainage fraction:',
        math: 'I = (T + E<sub>s</sub>) / (1 − D/I)',
        note: 'Roughly 70 % of irrigation ends up as transpiration in a well-run system, which is '
            + 'a drainage fraction of about 0.30.' },
      { lead: 'Event size and frequency from the buffer the substrate provides:',
        math: 'event = V<sub>substrate</sub> × WHC × depletion, &nbsp;&nbsp; '
            + 'events per day = I / event',
        note: 'Advanced irrigation programmes trigger on accumulated radiation rather than on a '
            + 'clock, because greenhouse transpiration is driven mainly by radiation and only '
            + 'weakly by temperature.' },
      { lead: 'Water use efficiency, which has to say which water it means:',
        math: 'WUE = yield / water',
        note: 'Per cubic metre supplied and per cubic metre abstracted are different numbers in '
            + 'any recirculating system, and only the second is what the site actually consumes.' }
    ],

    caveats: [
      'The balance runs at one constant transpiration rate. A real cycle has a transpiration that '
        + 'tracks radiation hour by hour, so the event frequency swings far more than this '
        + 'average suggests.',
      'Drainage fraction is a target here, not an outcome. What you can actually achieve is set '
        + 'by the uniformity of the system: a drainage fraction low enough to look efficient on '
        + 'average will starve the driest emitters.',
      'How much of the drainage can be recycled is set by the salt balance and not by the '
        + 'plumbing. Use the salt accumulation calculator to find the leaching ratio the water '
        + 'source forces, then come back here.',
      'In soil rather than substrate, drainage is not measurable on a short timescale and '
        + 'groundwater fluctuations interfere, which leaves a lysimeter calibrated over long '
        + 'periods as the only option.'
    ],

    sources: ['fao56', 'stanghellini2019', 'sonneveld2009'],
    provenance: 'Sections 14.1, 14.2, 14.3 and 14.9 of "Greenhouse parameters and equations", '
              + 'including its reference magnitudes for greenhouse tomato and rose water use.'
  });
}());

