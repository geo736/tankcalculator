
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'indoor-farm',
    kicker: 'Indoor farm',
    name: 'Indoor farm energy, water and electricity per kilogram',
    lede: 'Light is heat. Essentially all the radiation the lamps emit is degraded to heat inside '
        + 'the envelope, so installed lamp power is not a lighting load that happens to warm the '
        + 'room — it is the cooling load. This closes the energy and vapour balances together and '
        + 'turns them into electricity per kilogram.',
    inputNote: 'Transpiration does not remove energy from a sealed farm. It converts sensible '
             + 'heat to latent heat, and the latent heat still has to be taken out.',

    inputs: [
      { id: 'ppfd', label: 'PPFD at the canopy', unit: 'µmol m⁻² s⁻¹', value: 250, step: 10, min: 20, max: 1200 },
      { id: 'hours', label: 'Photoperiod', unit: 'h d⁻¹', value: 16, step: 0.5, min: 1, max: 24 },
      { id: 'efficacy', label: 'Fixture efficacy', unit: 'µmol J⁻¹', value: 2.8, step: 0.05, min: 0.5, max: 4.2 },
      { id: 'fpar', label: 'Fraction of lamp power leaving as PAR', unit: '–', value: 0.52, step: 0.01, min: 0.1, max: 0.9,
        help: 'The rest never became a photon. Both parts end up as heat inside the envelope, so this fraction changes where the heat appears rather than how much there is.' },

      { id: 'latshare', label: 'Latent share of the lamp power', unit: '–', value: 0.61, step: 0.01, min: 0.1, max: 0.9,
        group: 'The two cooling duties',
        help: 'From a measured plant-factory balance: a lettuce canopy under 230 W m⁻² partitions into about 140 W m⁻² latent and 90 sensible, so 61 % of the installed power leaves as vapour and has to be removed by dehumidification rather than by cooling.' },
      { id: 'copSens', label: 'Cooling coefficient of performance', unit: '–', value: 3.5, step: 0.1, min: 1, max: 8 },
      { id: 'copLat', label: 'Dehumidification coefficient of performance', unit: '–', value: 2.5, step: 0.1, min: 0.5, max: 8,
        help: 'Lower than the sensible coefficient, because the coil has to reach the dew point. The dehumidification routes calculator prices the alternatives.' },
      { id: 'heat', label: 'Heating supplied', unit: 'W m⁻²', value: 0, step: 1, min: 0, max: 200,
        help: 'Rarely needed: the lamp load is the dominant internal gain, so the plant is nearly always rejecting heat.' },

      { id: 'tiers', label: 'Tiers in the stack', unit: '–', value: 6, step: 1, min: 1, max: 20, group: 'The stack' },
      { id: 'fuse', label: 'Fraction of each tier carrying crop', unit: '–', value: 0.80, step: 0.05, min: 0.2, max: 1,
        help: 'The rest is aisle, gutter and service space.' },

      { id: 'lp', label: 'Light productivity', unit: 'g fresh weight per mol', value: 1.2, step: 0.05, min: 0.1, max: 6,
        group: 'Yield and price',
        help: 'Yield per mole of photons delivered. It falls as yield rises, because the extra light is going to leaves that are closer to saturation.' },
      { id: 'pel', label: 'Electricity price', unit: 'currency per kWh', value: 0.15, step: 0.01, min: 0, max: 2 },
      { id: 'pcrop', label: 'Crop price', unit: 'currency per kg', value: 6.0, step: 0.25, min: 0, max: 100 }
    ],

    compute: function (v) {
      var ppfd = GFC.need(v.ppfd, 'PPFD at the canopy', { positive: true });
      var hours = GFC.need(v.hours, 'Photoperiod', { positive: true, max: 24 });
      var eff = GFC.need(v.efficacy, 'Fixture efficacy', { positive: true });
      var fPar = GFC.need(v.fpar, 'PAR fraction of lamp power', { positive: true, max: 0.9 });
      var latShare = GFC.need(v.latshare, 'Latent share', { positive: true, max: 0.9 });
      var copSens = GFC.need(v.copSens, 'Cooling coefficient of performance', { positive: true });
      var copLat = GFC.need(v.copLat, 'Dehumidification coefficient of performance', { positive: true });
      var heat = GFC.need(v.heat, 'Heating supplied', { min: 0 });
      var tiers = Math.round(GFC.need(v.tiers, 'Tiers in the stack', { positive: true }));
      var fUse = GFC.need(v.fuse, 'Fraction of each tier carrying crop', { positive: true, max: 1 });
      var lp = GFC.need(v.lp, 'Light productivity', { positive: true });
      var pEl = GFC.need(v.pel, 'Electricity price', { min: 0 });
      var pCrop = GFC.need(v.pcrop, 'Crop price', { min: 0 });

      /* Per square metre of CANOPY. */
      var pLamp = ppfd / eff;                      /* W m-2 */
      var latent = (pLamp + heat) * latShare;      /* W m-2 */
      var sensible = pLamp + heat - latent;        /* W m-2 */
      var nonPhoton = pLamp * (1 - fPar);          /* the part that never became light */

      /* 1 W m-2 of latent heat is 1.44 g m-2 h-1 of water at L = 2500 J g-1. */
      var condensate = latent * 3600 / 2500;       /* g m-2 h-1 */
      var condensateDay = condensate * 24 / 1000;  /* L m-2 d-1 */

      var dliTier = 0.0036 * ppfd * hours;         /* mol m-2 d-1 per tier */
      var dliFloor = dliTier * tiers * fUse;       /* per m2 of floor */
      var canopyPerFloor = tiers * fUse;

      /* Electricity per kilogram. */
      var eLight = 1e9 / (3.6e6 * eff * lp);       /* kWh per kg fresh weight: 1000 g kg⁻¹ / LP mol, × 10⁶ µmol mol⁻¹ / ε J, ÷ 3.6 × 10⁶ J kWh⁻¹ */
      var copEff = 1 / (latShare / copLat + (1 - latShare) / copSens);
      var eTotal = eLight * (1 + 1 / copEff);
      var yieldPerCanopyDay = dliTier * lp / 1000; /* kg m-2 canopy per day */
      var yieldPerFloorYear = yieldPerCanopyDay * canopyPerFloor * 365;

      var elecCanopy = (pLamp + latent / copLat + sensible / copSens) / 1000;  /* kW m-2 canopy */
      var elecFloorKw = elecCanopy * canopyPerFloor;
      var elecFloorYear = pLamp * hours / 1000 * 365 * canopyPerFloor
        + (latent / copLat + sensible / copSens) * 24 / 1000 * 365 * canopyPerFloor;

      var costPerKg = eTotal * pEl;
      var marginPerKg = pCrop - costPerKg;

      var flags = [];
      flags.push({ head: 'The lamp load is the cooling load.',
        text: 'Of ' + GFC.fixed(pLamp, 0) + ' W m⁻² installed, ' + GFC.fixed(nonPhoton, 0) + ' W m⁻² never became a photon and the rest is absorbed and degraded inside the envelope. The fraction fixed in chemical bonds by photosynthesis is of order 5 % and is neglected in every energy balance here.' });
      flags.push({ head: 'Condensing ' + GFC.fixed(condensate, 0) + ' g m⁻² h⁻¹.',
        text: 'That is the number that sizes the coil, the condensate return and the water balance at once: ' + GFC.fixed(condensateDay, 2) + ' L per m² of canopy per day.' });
      if (latShare > 0.55) flags.push({ head: 'Latent-dominated.',
        text: GFC.pct(latShare, 0) + ' of the installed power leaves as vapour, so the plant is a dehumidifier first and a chiller second. Sizing it on sensible capacity alone will leave it unable to hold humidity.' });
      if (marginPerKg < 0) flags.push({ head: 'Electricity alone exceeds the crop price.',
        text: GFC.fixed(costPerKg, 2) + ' per kg of electricity against a crop price of ' + GFC.fixed(pCrop, 2) + '. With no daylight the screening calculation collapses to this margin, which is why indoor-farm economics is dominated by efficacy and electricity price.' });
      if (tiers > 1) flags.push({ head: 'Stacking multiplies canopy, not light.',
        text: 'At ' + GFC.fixed(tiers, 0) + ' tiers and ' + GFC.pct(fUse, 0) + ' usable area there is ' + GFC.fixed(canopyPerFloor, 2) + ' m² of canopy per m² of floor, and every square metre of it needs its own lamps. The electricity per kilogram does not improve with height; only the land does.' });

      return {
        headline: [
          { label: 'Cooling duty', value: GFC.fixed(latent + sensible, 0), unit: 'W m⁻²',
            hint: GFC.fixed(latent, 0) + ' latent, ' + GFC.fixed(sensible, 0) + ' sensible' },
          { label: 'Condensate', value: GFC.fixed(condensate, 0), unit: 'g m⁻² h⁻¹',
            hint: GFC.fixed(condensateDay, 2) + ' L m⁻² d⁻¹' },
          { label: 'Electricity per kilogram', value: GFC.fixed(eTotal, 1), unit: 'kWh kg⁻¹',
            hint: GFC.fixed(eLight, 1) + ' for light, the rest for removing it' },
          { label: 'Margin after electricity', value: GFC.fixed(marginPerKg, 2), unit: 'per kg',
            hint: marginPerKg >= 0 ? 'Before every other cost' : 'Negative on electricity alone' }
        ],
        flags: flags,
        rows: [
          { label: 'Installed lamp power', value: GFC.fixed(pLamp, 1), unit: 'W m⁻² canopy', note: 'PPFD ÷ efficacy' },
          { label: '— of which never became a photon', value: GFC.fixed(nonPhoton, 1), unit: 'W m⁻²', note: 'P (1 − f_PAR)' },
          { label: 'Heating supplied', value: GFC.fixed(heat, 1), unit: 'W m⁻²', note: 'Added to the balance' },
          { label: 'Latent cooling duty', value: GFC.fixed(latent, 1), unit: 'W m⁻²', note: 'L × E; crop transpiration and nothing else' },
          { label: 'Sensible cooling duty', value: GFC.fixed(sensible, 1), unit: 'W m⁻²', note: 'P_lamp + heat − L E' },
          { label: 'Total cooling duty', value: GFC.fixed(latent + sensible, 1), unit: 'W m⁻²', note: 'Equal to the power in, as the balance requires' },
          { label: 'Balance residual', value: GFC.sig(pLamp + heat - latent - sensible, 2), unit: 'W m⁻²', note: 'Should be zero' },
          { label: 'Condensate rate', value: GFC.fixed(condensate, 2), unit: 'g m⁻² h⁻¹', note: '1 W m⁻² ≡ 1.44 g m⁻² h⁻¹ at L = 2 500 J g⁻¹' },
          { label: 'Condensate per day', value: GFC.fixed(condensateDay, 3), unit: 'L m⁻² d⁻¹', note: 'Which is also the irrigation the crop takes up' },
          { label: 'Daily light integral per tier', value: GFC.fixed(dliTier, 2), unit: 'mol m⁻² d⁻¹', note: '0.0036 PPFD t_h' },
          { label: 'Canopy area per floor area', value: GFC.fixed(canopyPerFloor, 3), unit: 'm² m⁻²', note: 'n_tier × f_use' },
          { label: 'Daily light integral per floor area', value: GFC.fixed(dliFloor, 2), unit: 'mol m⁻² d⁻¹', note: 'What the building has to deliver' },
          { label: 'Light productivity', value: GFC.fixed(lp, 3), unit: 'g FW mol⁻¹', note: 'Yield per mole delivered' },
          { label: 'Yield per m² of canopy', value: GFC.fixed(yieldPerCanopyDay * 1000, 1), unit: 'g d⁻¹', note: 'DLI × light productivity' },
          { label: 'Yield per m² of floor', value: GFC.fixed(yieldPerFloorYear, 1), unit: 'kg y⁻¹', note: 'Across the stack, continuous production' },
          { label: 'Electricity for light', value: GFC.fixed(eLight, 2), unit: 'kWh kg⁻¹', note: '10⁹ / (3.6 × 10⁶ ε LP), LP in g mol⁻¹' },
          { label: 'Effective plant coefficient', value: GFC.fixed(copEff, 3), unit: '–', note: 'Harmonic blend of the two duties at their own coefficients' },
          { label: 'Total electricity per kilogram', value: GFC.fixed(eTotal, 3), unit: 'kWh kg⁻¹', note: 'e_light (1 + 1/COP_eff)' },
          { label: 'Electrical load per m² of floor', value: GFC.fixed(elecFloorKw, 3), unit: 'kW m⁻²', note: 'Lamps plus plant, while lit' },
          { label: 'Annual electricity per m² of floor', value: GFC.fixed(elecFloorYear, 0), unit: 'kWh m⁻² y⁻¹', note: 'Lamps on the schedule, plant continuous' },
          { label: 'Electricity cost per kilogram', value: GFC.fixed(costPerKg, 3), unit: 'currency kg⁻¹', note: 'At ' + GFC.fixed(pEl, 2) + ' per kWh' },
          { label: 'Margin after electricity', value: GFC.fixed(marginPerKg, 3), unit: 'currency kg⁻¹', note: 'Before labour, capital, seed, nutrients and packaging' }
        ],
        caption: 'The closed balance. Everything that goes in as electricity comes out as heat, '
               + 'and the only question is how much of it leaves as vapour.',
        _v: { pLamp: pLamp, heat: heat, latent: latent, sensible: sensible,
              nonPhoton: nonPhoton, eLight: eLight, eTotal: eTotal }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 300, L = 24, T = 46, BW = W - 48, BH = 44;
      var total = st.pLamp + st.heat;
      var g = S.open(W, H, 'Indoor farm energy balance');

      g += S.text(L, T - 12, 'Energy in, W per m² of canopy', { size: 11.5, fill: pal.soft });
      var inParts = [
        { label: 'lamp power', v: st.pLamp, colour: pal.series[0] },
        { label: 'heating', v: st.heat, colour: pal.series[2] }
      ].filter(function (p) { return p.v > 0; });
      var x = L;
      inParts.forEach(function (p) {
        var w = BW * p.v / total;
        g += S.rect(x, T, w, BH, p.colour);
        if (w > 60) g += S.text(x + w / 2, T + BH / 2 + 4, p.label + '  ' + GFC.fixed(p.v, 0),
          { size: 11, anchor: 'middle', fill: '#fff', weight: 600 });
        x += w;
      });

      var T2 = T + BH + 54;
      g += S.text(L, T2 - 12, 'Energy out, the two cooling duties', { size: 11.5, fill: pal.soft });
      var outParts = [
        { label: 'latent', v: st.latent, colour: pal.series[1] },
        { label: 'sensible', v: st.sensible, colour: pal.series[4] }
      ];
      x = L;
      outParts.forEach(function (p) {
        var w = BW * p.v / total;
        g += S.rect(x, T2, w, BH, p.colour);
        if (w > 60) g += S.text(x + w / 2, T2 + BH / 2 + 4, p.label + '  ' + GFC.fixed(p.v, 0),
          { size: 11, anchor: 'middle', fill: '#fff', weight: 600 });
        x += w;
      });

      /* the arrows between, so the identity reads as an identity */
      [0.25, 0.5, 0.75].forEach(function (f) {
        var ax = L + BW * f;
        g += S.line(ax, T + BH + 4, ax, T2 - 22, pal.line, 1.4);
        g += S.path('M' + (ax - 4) + ' ' + (T2 - 27) + 'L' + ax + ' ' + (T2 - 20)
          + 'L' + (ax + 4) + ' ' + (T2 - 27), pal.line, 1.4);
      });

      g += S.text(L, T2 + BH + 26,
        'All of it. ' + GFC.fixed(total, 0) + ' W m⁻² in, ' + GFC.fixed(total, 0) + ' W m⁻² out, '
        + GFC.pct(st.latent / total, 0) + ' of it as water vapour.',
        { size: 11.5, fill: pal.ink });
      g += S.text(L, T2 + BH + 44,
        GFC.fixed(st.eLight, 1) + ' kWh kg⁻¹ to make the light and '
        + GFC.fixed(st.eTotal - st.eLight, 1) + ' kWh kg⁻¹ to take it back out again.',
        { size: 11.5, fill: pal.soft });
      g += S.close();
      return g;
    },

    math: [
      { lead: 'A sunless, sealed, insulated farm has no solar term and almost no envelope term, '
            + 'so the steady-state balance reduces to a statement about the lamps alone:',
        math: 'P<sub>lamp</sub> + q̇<sub>heat</sub> = q̇<sub>cool,sens</sub> + q̇<sub>cool,lat</sub>',
        note: 'Light is heat. Installed lamp power is not a lighting load that happens to warm the '
            + 'room; it is the cooling load, and the part that never became a photon is only a '
            + 'share of it.' },
      { lead: 'The latent branch is crop transpiration and nothing else:',
        math: 'q̇<sub>cool,lat</sub> = L E, &nbsp;&nbsp; '
            + 'q̇<sub>cool,sens</sub> = P<sub>lamp</sub> + q̇<sub>heat</sub> − L E',
        note: 'Transpiration does not remove energy from the farm; it converts sensible heat to '
            + 'latent heat, and the latent heat still has to be taken out. That is why the vapour '
            + 'balance and the energy balance have to be closed together, and why the '
            + 'transpiration rate rather than the lamp power sets the RATIO of the two duties.' },
      { lead: 'The unit conversion that makes this arithmetic:',
        math: '1 W m⁻² ≡ 3600/2500 = 1.44 g m⁻² h⁻¹',
        note: 'A farm removing 140 W m⁻² of latent heat is condensing 202 g m⁻² h⁻¹ of water, '
            + 'which is the number that sizes the coil, the condensate return and the water '
            + 'balance at once.' },
      { lead: 'Stacking multiplies canopy area per unit footprint, and the light each tier needs '
            + 'with it:',
        math: 'A<sub>can</sub> = n<sub>tier</sub> A<sub>floor</sub> f<sub>use</sub>, &nbsp;&nbsp; '
            + 'DLI<sub>floor</sub> = n<sub>tier</sub> DLI<sub>tier</sub>' },
      { lead: 'Electricity per unit product, which is the number the business runs on:',
        math: 'e<sub>light</sub> = 10⁹ / (3.6 × 10⁶ ε<sub>lamp</sub> LP), &nbsp;&nbsp; '
            + 'e<sub>total</sub> = e<sub>light</sub>(1 + 1/COP<sub>eff</sub>)',
        note: 'Light productivity LP is grams of fresh weight per mole of photons delivered, and '
            + 'it falls as yield rises because the extra light goes to leaves nearer saturation. '
            + 'Every joule spent on light is spent again, divided by the plant coefficient, '
            + 'taking it out.' }
    ],

    caveats: [
      'The envelope is taken as perfectly sealed and insulated. A real building gains and loses '
        + 'through its walls and leaks air, and in a cold climate that is a credit against the '
        + 'cooling duty rather than an addition to it.',
      'The latent share is entered rather than modelled. It follows from the transpiration of the '
        + 'crop at the air condition being held, so a different set-point or a different crop '
        + 'changes it, and the transpiration calculator is the place to work it out.',
      'Light productivity is a lumped parameter over the whole cycle. It falls as yield rises, so '
        + 'a value measured at one light level does not transfer to another.',
      'Electricity here is lamps and climate plant only. Pumps, controls, packing and the building '
        + 'are all real and absent, and so is the embodied energy of a stack that has to be built '
        + 'before it grows anything.'
    ],

    sources: ['graamans2017', 'graamans2018', 'kozai2013', 'stanghellini2024darkside', 'devisser2014'],
    provenance: 'Sections 16.1, 16.2, 16.3 and 16.4 of "Greenhouse parameters and equations". The '
              + 'default latent share is that document’s measured plant-factory balance: a lettuce '
              + 'canopy under 230 W m⁻² partitioning into about 140 latent and 90 sensible.'
  });
}());

