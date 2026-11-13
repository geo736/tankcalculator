
(function () {
  'use strict';
  var S = GFC.svgns;
  var RHO_CP = 1200;    /* volumetric heat capacity of air at 20 C, J m-3 K-1 */

  GFC.mount({
    slug: 'greenhouse-heat-load',
    kicker: 'Greenhouse climate',
    name: 'Heating capacity and design U-value',
    lede: 'A U-value quoted without its reference area and its infiltration treatment cannot be '
        + 'converted, compared or reused. This builds the design U-value explicitly from cover, '
        + 'screen and leakage, works out the cover-to-floor area ratio from the geometry, and '
        + 'sizes the heating plant on the design hour.',
    inputNote: 'Geometry first: the cover-to-floor ratio is worth computing rather than guessing. '
             + 'Typical values run 1.1 to 1.3.',

    inputs: [
      { id: 'length', label: 'House length', unit: 'm', value: 105, step: 1, min: 3, max: 2000, group: 'Geometry' },
      { id: 'spans', label: 'Number of spans', unit: '–', value: 8, step: 1, min: 1, max: 200 },
      { id: 'spanw', label: 'Span width', unit: 'm', value: 12, step: 0.5, min: 1, max: 60 },
      { id: 'eaves', label: 'Eaves height', unit: 'm', value: 3.5, step: 0.1, min: 0.5, max: 15 },
      { id: 'roof', label: 'Roof angle', unit: 'degrees', value: 25, step: 1, min: 0, max: 60 },
      { id: 'height', label: 'Mean internal height', unit: 'm', value: 4.5, step: 0.1, min: 1, max: 20,
        help: 'Volume divided by floor area. Infiltration loss scales with it, so a tall house leaks more heat at the same air-change rate.' },

      { id: 'uc', label: 'Cover U-value', unit: 'W m⁻² K⁻¹', value: 5.6, step: 0.1, min: 0.3, max: 12,
        group: 'Envelope',
        help: 'Per m² of COVER. Single glass sits near 5.6 to 9.3 depending on which temperature difference the coefficient is defined against.' },
      { id: 'screen', label: 'Thermal screen', unit: '–', value: 1, type: 'select',
        options: [{ v: 0, label: 'Open (or none fitted)' }, { v: 1, label: 'Closed' }] },
      { id: 'pscreen', label: 'Screen energy-saving fraction', unit: '–', value: 0.40, step: 0.01, min: 0, max: 0.8,
        help: 'Typical 0.40, improved screens 0.50.' },
      { id: 'ach', label: 'Leakage air-change rate', unit: 'h⁻¹', value: 0.25, step: 0.05, min: 0, max: 6,
        help: 'A modern Dutch house is simulated at 0.25 while heating. EP406.4 Table 2 gives 0.5 to 1.0 for new glass and 2.0 to 4.0 for old glass in poor repair.' },

      { id: 'tin', label: 'Heating set-point', unit: '°C', value: 20, step: 0.5, min: 0, max: 40, group: 'Design hour' },
      { id: 'tout', label: 'Design outdoor temperature', unit: '°C', value: -10, step: 0.5, min: -40, max: 30,
        help: 'The temperature exceeded for all but a small percentage of the year. Capacity is set by the extreme of the climate, so this input and the U-value dominate the answer.' },
      { id: 'rad', label: 'Solar radiation at the design hour', unit: 'W m⁻²', value: 0, step: 10, min: 0, max: 1100,
        help: 'Not necessarily zero: the night is not always the hour of highest heat demand.' },
      { id: 'tau', label: 'Whole-greenhouse transmissivity', unit: '–', value: 0.70, step: 0.01, min: 0.2, max: 0.95 },
      { id: 'onef', label: 'Sensible fraction of transmitted solar, (1 − f)', unit: '–', value: 0.45, step: 0.01, min: 0.05, max: 1,
        help: 'The rest becomes latent heat through transpiration and does not offset the heating demand. 0.45 is the usual working value.' },
      { id: 'area', label: 'Floor area', unit: 'm²', value: 10080, step: 10, min: 10, max: 500000 }
    ],

    compute: function (v) {
      var L = GFC.need(v.length, 'House length', { positive: true });
      var n = GFC.need(v.spans, 'Number of spans', { positive: true });
      var ws = GFC.need(v.spanw, 'Span width', { positive: true });
      var he = GFC.need(v.eaves, 'Eaves height', { positive: true });
      var ang = GFC.need(v.roof, 'Roof angle', { min: 0, max: 60 });
      var h = GFC.need(v.height, 'Mean internal height', { positive: true });
      var uc = GFC.need(v.uc, 'Cover U-value', { positive: true });
      var sScreen = GFC.need(v.screen, 'Thermal screen');
      var pScreen = GFC.need(v.pscreen, 'Screen energy-saving fraction', { min: 0, max: 0.8 });
      var ach = GFC.need(v.ach, 'Leakage air-change rate', { min: 0 });
      var tin = GFC.need(v.tin, 'Heating set-point');
      var tout = GFC.need(v.tout, 'Design outdoor temperature');
      var rad = GFC.need(v.rad, 'Solar radiation', { min: 0 });
      var tau = GFC.need(v.tau, 'Transmissivity', { positive: true, max: 0.95 });
      var onef = GFC.need(v.onef, 'Sensible fraction', { positive: true, max: 1 });
      var area = GFC.need(v.area, 'Floor area', { positive: true });

      /* 7.1 geometric factor, multi-span house */
      var W = n * ws;
      var aSoil = L * W;
      var rads = ang * Math.PI / 180;
      var walls = 2 * (L + W) * he;
      var roofPlane = aSoil / Math.cos(rads);
      var gables = 0.5 * n * ws * ws * Math.tan(rads);
      var ratio = (walls + roofPlane + gables) / aSoil;

      /* 7.3 design U-value: cover through the screen, plus leakage */
      var uTr = uc * (sScreen * (1 - pScreen) + (1 - sScreen));
      var gvLeak = ach * h / 3600;            /* m s-1 */
      var uLeak = RHO_CP * gvLeak;            /* W m-2 floor K-1 */
      var uFloor = uTr * ratio + uLeak;

      var dT = tin - tout;
      var lossCover = uTr * ratio * dT;
      var lossLeak = uLeak * dT;
      var solarCredit = onef * tau * rad;
      var demand = Math.max(lossCover + lossLeak - solarCredit, 0);
      var capacityKw = demand * area / 1000;

      /* 7.9 critical outdoor temperature for heating, with the latent and soil
       * terms left out as a hand calculation leaves them. */
      var tCoh = tin - (tau * rad) / (ratio * uTr + gvLeak * RHO_CP);

      var flags = [];
      if (uLeak > 1.0) flags.push({ head: 'Infiltration is ' + GFC.fixed(uLeak, 2) + ' W m⁻² K⁻¹.',
        text: 'That is comparable to the entire difference between single and double glazing per unit floor area, and it is a property of how well this particular building is sealed, not of its class.' });
      if (sScreen === 0) flags.push({ head: 'No screen in the design case.',
        text: 'A thermal screen is worth about a third of annual energy in the Dutch reference simulation while barely moving the peak, because on the design night the screen is closed in every variant. Size the plant from the screened case and the fuel budget from the unscreened one and the answer will be wrong both ways.' });
      if (ratio < 1.05 || ratio > 1.45) flags.push({ head: 'Cover-to-floor ratio of ' + GFC.fixed(ratio, 2) + '.',
        text: 'Typical houses run 1.1 to 1.3. Check the geometry inputs before using this.' });
      if (demand === 0) flags.push({ head: 'No heating demand at this hour.',
        text: 'The solar credit covers the envelope and leakage loss, so this hour does not size the plant.' });

      return {
        headline: [
          { label: 'Design heating capacity', value: GFC.fixed(demand, 0), unit: 'W m⁻²',
            hint: GFC.fixed(capacityKw, 0) + ' kW over ' + GFC.sig(area, 3) + ' m²' },
          { label: 'Design U-value', value: GFC.fixed(uFloor, 2), unit: 'W m⁻² K⁻¹',
            hint: 'Per m² of FLOOR, screen and leakage included' },
          { label: 'Cover-to-floor ratio', value: GFC.fixed(ratio, 3), unit: '–',
            hint: 'From the geometry, not assumed' },
          { label: 'Heating switches on below', value: GFC.fixed(tCoh, 1), unit: '°C',
            hint: 'Critical outdoor temperature' }
        ],
        flags: flags,
        rows: [
          { label: 'House width', value: GFC.fixed(W, 1), unit: 'm', note: 'Spans × span width' },
          { label: 'Floor area from geometry', value: GFC.sig(aSoil, 5), unit: 'm²', note: 'Length × width; the area input below drives the kW figure' },
          { label: 'Wall area', value: GFC.sig(walls, 4), unit: 'm²', note: '2 (L + W) × eaves height' },
          { label: 'Roof plane area', value: GFC.sig(roofPlane, 4), unit: 'm²', note: 'Floor area ÷ cos(roof angle)' },
          { label: 'Gable area', value: GFC.sig(gables, 4), unit: 'm²', note: '½ n w² tan(angle)' },
          { label: 'Cover-to-floor area ratio', value: GFC.fixed(ratio, 4), unit: '–', note: 'Compendium 7.1' },
          { label: 'Transmission U-value U_tr', value: GFC.fixed(uTr, 3), unit: 'W m⁻² K⁻¹', note: 'Per m² of cover, screen applied' },
          { label: 'Specific leakage rate g_V,leak', value: GFC.sig(gvLeak, 3), unit: 'm s⁻¹', note: 'N h / 3600' },
          { label: 'Infiltration U-value U_inf', value: GFC.fixed(uLeak, 3), unit: 'W m⁻² K⁻¹', note: 'ρ c_p g_V,leak, per m² of floor' },
          { label: 'Design U-value U_floor', value: GFC.fixed(uFloor, 3), unit: 'W m⁻² K⁻¹', note: 'U_tr A_c/A_s + U_inf' },
          { label: 'Design temperature difference', value: GFC.fixed(dT, 1), unit: 'K', note: 'Set-point − design outdoor' },
          { label: 'Loss through the cover', value: GFC.fixed(lossCover, 1), unit: 'W m⁻²', note: 'U_tr A_c/A_s ΔT' },
          { label: 'Loss by infiltration', value: GFC.fixed(lossLeak, 1), unit: 'W m⁻²', note: 'U_inf ΔT' },
          { label: 'Solar credit', value: GFC.fixed(solarCredit, 1), unit: 'W m⁻²', note: '(1 − f) τ I_s' },
          { label: 'Design heating demand', value: GFC.fixed(demand, 1), unit: 'W m⁻²', note: 'Floored at zero' },
          { label: 'Installed capacity', value: GFC.fixed(capacityKw, 1), unit: 'kW', note: 'At the stated floor area' },
          { label: 'Critical outdoor temperature', value: GFC.fixed(tCoh, 2), unit: '°C',
            note: 'Heating needed below this; latent and soil terms omitted as in a hand calculation' }
        ],
        caption: 'Where the design-hour heat goes, per square metre of floor. The solar credit is '
               + 'drawn negative because it offsets the loss.',
        _v: { lossCover: lossCover, lossLeak: lossLeak, solarCredit: solarCredit, demand: demand,
              uTr: uTr, ratio: ratio, uLeak: uLeak, uc: uc, sScreen: sScreen, pScreen: pScreen }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      return S.bars({
        pal: pal, width: 640, labelW: 182, rowH: 32,
        title: 'Design-hour heat balance',
        axisLabel: 'W per m² of floor',
        rows: [
          { label: 'Through the cover', value: st.lossCover, colour: pal.series[0],
            text: GFC.fixed(st.lossCover, 0) + ' W m⁻²' },
          { label: 'By infiltration', value: st.lossLeak, colour: pal.series[1],
            text: GFC.fixed(st.lossLeak, 0) + ' W m⁻²' },
          { label: 'Solar credit', value: -st.solarCredit, colour: pal.series[2],
            text: '−' + GFC.fixed(st.solarCredit, 0) + ' W m⁻²' },
          { label: 'Heating demand', value: st.demand, colour: pal.accent,
            text: GFC.fixed(st.demand, 0) + ' W m⁻²' }
        ]
      });
    },

    math: [
      { lead: 'The cover-to-floor area ratio for a multi-span house of length L, width W, eaves '
            + 'height H, roof angle α and n spans of width w:',
        math: 'A<sub>c</sub>/A<sub>s</sub> = [ 2(L+W)H + A<sub>s</sub>/cos α + ½ n w² tan α ] / A<sub>s</sub>',
        note: 'Typical values run 1.1 to 1.3; a simulated modern Dutch house sits at 1.12 and the '
            + 'EP406.4 reference figure is 1.2.' },
      { lead: 'The design U-value, which is where most published comparisons go wrong:',
        math: 'U<sub>floor</sub> = U<sub>cover</sub> (A<sub>c</sub>/A<sub>s</sub>) + U<sub>inf</sub>, '
            + '&nbsp;&nbsp; U<sub>inf</sub> = ρ c<sub>p</sub> N h / 3600',
        note: 'The infiltration coefficient is not a property of the cover at all: it is the '
            + 'air-exchange rate times the mean height, so it scales with building volume per '
            + 'unit floor area. At N = 1 h⁻¹ and h = 4 m it is 1.33 W m⁻² K⁻¹.' },
      { lead: 'The screen enters as a switch and a saving fraction:',
        math: 'U<sub>tr</sub> = U<sub>c</sub> [ s<sub>screen</sub>(1 − p<sub>screen</sub>) + (1 − s<sub>screen</sub>) ]',
        note: 'Leakage ventilation adds a further 0.4 to 1 W m⁻² K⁻¹ on a floor basis.' },
      { lead: 'Required heating capacity at the design hour:',
        math: 'H<sub>heating</sub> = max{ U′ (A<sub>c</sub>/A<sub>s</sub>) (T<sub>iH</sub> − T<sub>out,D</sub>) '
            + '− (1 − f) τ I<sub>s</sub>, &nbsp; 0 }',
        note: 'Solar radiation appears because the night is not necessarily the hour of highest '
            + 'heat demand. Both f and U_c are held constant here, which is not accurate, but '
            + 'gives a good indication of capacity.' },
      { lead: 'The outdoor temperature below which heating is required:',
        math: 'T<sub>coh</sub> = T<sub>iH</sub> − τ(1−ρ)I<sub>s</sub> / [ (A<sub>c</sub>/A<sub>s</sub>)U<sub>tr</sub> '
            + '+ g<sub>V,min</sub> ρ c<sub>p</sub> ]',
        note: 'The switch-on temperature depends on greenhouse design, ventilation, '
            + 'evapotranspiration, soil flux and radiation, not on outside temperature alone. The '
            + 'evapotranspiration and soil terms are omitted here, as a hand calculation omits them.' }
    ],

    caveats: [
      'This sizes capacity, not energy. Capacity is set by the extreme of the climate and so by '
        + 'U′ and the design outdoor temperature; annual energy is set by the integral and so by '
        + 'the screen, the leakage rate and the solar gain. An intervention can move one a great '
        + 'deal and the other hardly at all. Use the load-duration calculator for both from one curve.',
      'Greenhouses are poorly insulated, so the cover resistance is small against the inside and '
        + 'outside boundary layers and those boundary layers dominate the answer. Wind, sky '
        + 'temperature and internal air movement are first-order here, not corrections.',
      'Condensation on the cover is a further loss channel most treatments neglect: it delivers '
        + 'latent heat to the cover, warming it and raising both the convective and the long-wave '
        + 'loss. The measured increase in total energy loss for a wet versus a dry cover is 12 to 16 %.',
      'The critical outdoor temperature here omits the latent and soil-flux terms. Both matter in '
        + 'a real control decision.'
    ],

    sources: ['stanghellini2019', 'ep406', 'dezwart1996', 'vanthoor2011', 'bakker2001', 'ahamed2018'],
    provenance: 'Equations from sections 7.1, 7.2, 7.3, 7.9 and 7.10 of "Greenhouse parameters '
              + 'and equations". The defaults are that section’s worked geometry: 105 × 96 m on '
              + '10 080 m², eaves 3.5 m, roof 25°, 8 spans of 12 m. Its component areas reproduce '
              + 'exactly (1 407 + 11 122 + 269 m²), and their sum over the floor area is 1.270; '
              + 'the source prints 1.28 for the same three numbers.'
  });
}());

