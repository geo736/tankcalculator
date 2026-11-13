
(function () {
  'use strict';
  var S = GFC.svgns;

  /* Recommended macronutrient concentrations, mmol L-1. */
  var RECIPES = {
    tomato_free:  { label: 'Tomato, free drain',  NO3: 15.5, NH4: 1.5, H2PO4: 1.5, K: 7.75, SO4: 3.5,  Ca: 5.5,  Mg: 2.5 },
    tomato_closed:{ label: 'Tomato, closed',      NO3: 12.5, NH4: 1.1, H2PO4: 1.2, K: 7.0,  SO4: 2.5,  Ca: 4.5,  Mg: 1.5 },
    pepper_closed:{ label: 'Sweet pepper, closed', NO3: 13.5, NH4: 1.0, H2PO4: 1.0, K: 6.75, SO4: 1.5, Ca: 3.5,  Mg: 1.25 },
    cucumber:     { label: 'Cucumber, closed',    NO3: 13.0, NH4: 1.0, H2PO4: 1.15, K: 7.5, SO4: 1.25, Ca: 2.75, Mg: 1.0 },
    rose:         { label: 'Rose, closed',        NO3: 7.5,  NH4: 0.5, H2PO4: 0.75, K: 3.5, SO4: 1.0,  Ca: 3.0,  Mg: 1.0 }
  };
  /* Charge on each ion, for the electroneutrality check and the EC sum. */
  var CHARGE = { NO3: -1, NH4: 1, H2PO4: -1, K: 1, SO4: -2, Ca: 2, Mg: 2, Na: 1, Cl: -1 };
  var CATIONS = ['NH4', 'K', 'Ca', 'Mg', 'Na'];
  var ANIONS = ['NO3', 'H2PO4', 'SO4', 'Cl'];
  var NAMES = { NO3: 'NO₃⁻', NH4: 'NH₄⁺', H2PO4: 'H₂PO₄⁻', K: 'K⁺', SO4: 'SO₄²⁻',
                Ca: 'Ca²⁺', Mg: 'Mg²⁺', Na: 'Na⁺', Cl: 'Cl⁻' };

  GFC.mount({
    slug: 'nutrient-uptake',
    kicker: 'Hydroponics',
    name: 'Nutrient uptake vs supply',
    lede: 'Electrical conductivity is the cheap proxy for total dissolved ions and says nothing '
        + 'about composition. This builds it from the charge-weighted cation sum, checks '
        + 'electroneutrality, and separates what is supplied from what the crop actually removes.',
    inputNote: 'Minerals are a roughly constant fraction of dry matter, so nutrients are required '
             + 'as far as there is growth. Of 1 kg fresh biomass about 20 g is mineral.',

    inputs: [
      { id: 'recipe', label: 'Recipe', unit: '', value: 'tomato_closed', type: 'select',
        options: Object.keys(RECIPES).map(function (k) { return { v: k, label: RECIPES[k].label }; }) },
      { id: 'scale', label: 'Scale the recipe', unit: '×', value: 1.0, step: 0.05, min: 0.2, max: 2.5,
        help: 'Multiplies every macronutrient together, which is what raising or lowering the target conductivity does in practice.' },
      { id: 'na', label: 'Sodium in the water', unit: 'mmol L⁻¹', value: 0.5, step: 0.1, min: 0, max: 20,
        group: 'What the water brings',
        help: 'Not essential and not removed by the crop in any quantity, so it has to be counted into the conductivity and then into the salt balance.' },
      { id: 'cl', label: 'Chloride in the water', unit: 'mmol L⁻¹', value: 0.5, step: 0.1, min: 0, max: 20 },

      { id: 'transp', label: 'Transpiration', unit: 'L m⁻² d⁻¹', value: 3.0, step: 0.1, min: 0.05, max: 12,
        group: 'Uptake' },
      { id: 'growth', label: 'Fresh biomass growth', unit: 'kg m⁻² d⁻¹', value: 0.25, step: 0.01, min: 0.005, max: 3,
        help: 'Of 1 kg fresh biomass about 130 g is dry matter, of which 110 g is carbohydrate, leaving about 20 g of minerals: 2 % of fresh weight.' },
      { id: 'mineralfrac', label: 'Mineral content of fresh biomass', unit: '–', value: 0.02, step: 0.001, min: 0.005, max: 0.05 },
      { id: 'nshare', label: 'Nitrogen share of the mineral content', unit: '–', value: 0.30, step: 0.01, min: 0.05, max: 0.6,
        help: 'Nitrogen is the largest single element in the mineral fraction; the rest is dominated by potassium.' }
    ],

    compute: function (v) {
      var recipe = RECIPES[String(v.recipe)];
      if (!recipe) throw new Error('Recipe must be one of the listed five.');
      var scale = GFC.need(v.scale, 'Recipe scale', { positive: true });
      var na = GFC.need(v.na, 'Sodium in the water', { min: 0 });
      var cl = GFC.need(v.cl, 'Chloride in the water', { min: 0 });
      var transp = GFC.need(v.transp, 'Transpiration', { positive: true });
      var growth = GFC.need(v.growth, 'Fresh biomass growth', { positive: true });
      var mineralFrac = GFC.need(v.mineralfrac, 'Mineral content', { positive: true, max: 0.05 });
      var nShare = GFC.need(v.nshare, 'Nitrogen share', { positive: true, max: 0.6 });

      var conc = {};
      Object.keys(recipe).forEach(function (k) {
        if (k === 'label') return;
        conc[k] = recipe[k] * scale;
      });
      conc.Na = na;
      conc.Cl = cl;

      /* The charge-weighted sums, and the electroneutrality constraint. */
      var cationSum = 0, anionSum = 0;
      CATIONS.forEach(function (k) { cationSum += (conc[k] || 0) * CHARGE[k]; });
      ANIONS.forEach(function (k) { anionSum += (conc[k] || 0) * -CHARGE[k]; });
      var imbalance = cationSum - anionSum;

      /* EC from the cation sum. Linear only to about 3.5 dS m-1. */
      var ec = 0.1 * cationSum;
      var linear = ec <= 3.5;

      /* Uptake: mineral mass over transpiration gives the uptake concentration. */
      var mineralKg = growth * mineralFrac;                /* kg m-2 d-1 of minerals */
      var nKg = mineralKg * nShare;
      var nMmol = nKg * 1e6 / 14.007;                      /* mmol m-2 d-1 of N */
      var cUptakeN = nMmol / transp;                       /* mmol L-1 */
      var cSupplyN = (conc.NO3 || 0) + (conc.NH4 || 0);
      var ratioN = cSupplyN > 0 ? cUptakeN / cSupplyN : 0;

      /* Potassium, the other element worth separating out. */
      var kMmol = mineralKg * (1 - nShare) * 0.45 * 1e6 / 39.098;
      var cUptakeK = kMmol / transp;
      var ratioK = conc.K > 0 ? cUptakeK / conc.K : 0;

      var flags = [];
      if (!linear) flags.push({ head: 'Above 3.5 dS m⁻¹.',
        text: 'The EC relation is linear only up to about that point; above it the relation becomes logarithmic and this estimate over-states the conductivity.' });
      if (Math.abs(imbalance) > 0.5) flags.push({ head: 'Charge imbalance of ' + GFC.fixed(imbalance, 2) + ' mmol L⁻¹ of charge.',
        text: 'Electroneutrality requires the charge-weighted cation and anion sums to be equal. The published recipes balance within rounding once the water’s own sodium and chloride are counted, so an imbalance this large points at the water analysis.' });
      if (ratioN > 1.1) flags.push({ head: 'The crop is removing nitrogen faster than the solution supplies it.',
        text: 'Uptake concentration ' + GFC.fixed(cUptakeN, 2) + ' against a supply of ' + GFC.fixed(cSupplyN, 2) + ' mmol L⁻¹. The root zone will deplete, and in a closed system the conductivity will fall while the sodium fraction rises.' });
      else if (ratioN < 0.6) flags.push({ head: 'Nitrogen supplied well above uptake.',
        text: 'Uptake concentration is ' + GFC.pct(ratioN, 0) + ' of supply, so the difference accumulates in the root zone or leaves in the drainage. Uptake concentration is not the supply concentration, and the gap is what accumulates or depletes.' });
      if (na > 2) flags.push({ head: 'Sodium is ' + GFC.pct(na * 1 / cationSum, 0) + ' of the cation charge.',
        text: 'It does no nutritional work and the crop removes very little of it, so in a closed loop it is the ion that decides how much drainage has to be discharged.' });

      var rows = [];
      Object.keys(NAMES).forEach(function (k) {
        if (conc[k] === undefined) return;
        rows.push({
          label: NAMES[k], value: GFC.fixed(conc[k], 3), unit: 'mmol L⁻¹',
          note: 'charge ' + (CHARGE[k] > 0 ? '+' : '') + CHARGE[k]
              + ', contributing ' + GFC.fixed(conc[k] * Math.abs(CHARGE[k]), 2) + ' mmol L⁻¹ of charge'
        });
      });
      rows.push({ label: 'Charge-weighted cation sum C⁺', value: GFC.fixed(cationSum, 3), unit: 'mmol L⁻¹', note: 'The quantity EC tracks' });
      rows.push({ label: 'Charge-weighted anion sum C⁻', value: GFC.fixed(anionSum, 3), unit: 'mmol L⁻¹', note: 'Should equal C⁺' });
      rows.push({ label: 'Charge imbalance', value: GFC.fixed(imbalance, 4), unit: 'mmol L⁻¹', note: 'Electroneutrality constraint' });
      rows.push({ label: 'Electrical conductivity', value: GFC.fixed(ec, 3), unit: 'dS m⁻¹', note: 'EC ≈ 0.1 C⁺' + (linear ? '' : '; outside the linear range') });
      rows.push({ label: 'Mineral uptake', value: GFC.fixed(mineralKg * 1000, 2), unit: 'g m⁻² d⁻¹', note: 'Growth × mineral fraction' });
      rows.push({ label: 'Nitrogen uptake', value: GFC.fixed(nMmol, 2), unit: 'mmol m⁻² d⁻¹', note: 'From the nitrogen share of the minerals' });
      rows.push({ label: 'Nitrogen uptake concentration', value: GFC.fixed(cUptakeN, 3), unit: 'mmol L⁻¹', note: 'Uptake rate ÷ transpiration' });
      rows.push({ label: 'Nitrogen supply concentration', value: GFC.fixed(cSupplyN, 3), unit: 'mmol L⁻¹', note: 'Nitrate plus ammonium in the recipe' });
      rows.push({ label: 'Nitrogen uptake over supply', value: GFC.pct(ratioN, 1), unit: '', note: 'Above 100 % depletes, below it accumulates' });
      rows.push({ label: 'Potassium uptake concentration', value: GFC.fixed(cUptakeK, 3), unit: 'mmol L⁻¹', note: 'Indicative; the mineral split is not resolved here' });
      rows.push({ label: 'Potassium uptake over supply', value: GFC.pct(ratioK, 1), unit: '', note: 'Potassium is the largest single cation in most recipes' });
      rows.push({ label: 'Nutrient solution target range', value: '1.5 to 2.0', unit: 'dS m⁻¹', note: 'Typical, before any accumulated sodium' });

      return {
        headline: [
          { label: 'Electrical conductivity', value: GFC.fixed(ec, 2), unit: 'dS m⁻¹',
            hint: linear ? 'Inside the linear range' : 'Outside the linear range' },
          { label: 'Cation charge sum', value: GFC.fixed(cationSum, 1), unit: 'mmol L⁻¹',
            hint: 'Anions ' + GFC.fixed(anionSum, 1) + ', imbalance ' + GFC.fixed(imbalance, 2) },
          { label: 'Nitrogen uptake concentration', value: GFC.fixed(cUptakeN, 2), unit: 'mmol L⁻¹',
            hint: GFC.pct(ratioN, 0) + ' of what is supplied' },
          { label: 'Mineral uptake', value: GFC.fixed(mineralKg * 1000, 1), unit: 'g m⁻² d⁻¹',
            hint: 'About 2 % of fresh weight' }
        ],
        flags: flags,
        rows: rows,
        caption: 'Charge contribution by ion, cations above and anions below. The two columns have '
               + 'to match: that is electroneutrality, and it is the check that catches a water '
               + 'analysis with a missing ion.',
        _v: { conc: conc, cationSum: cationSum, anionSum: anionSum }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 330, L = 44, T = 20, PW = W - L - 24, PH = H - T - 80;
      var items = [];
      CATIONS.forEach(function (k) {
        if (st.conc[k]) items.push({ k: k, v: st.conc[k] * Math.abs(CHARGE[k]), side: 1 });
      });
      ANIONS.forEach(function (k) {
        if (st.conc[k]) items.push({ k: k, v: st.conc[k] * Math.abs(CHARGE[k]), side: -1 });
      });
      var maxV = Math.max.apply(null, items.map(function (q) { return q.v; }));
      var nc = S.nice(0, maxV, 4);
      var mid = T + PH / 2;
      var sy = S.scale(0, nc.max, 0, PH / 2 - 10);

      var g = S.open(W, H, 'Charge contribution by ion');
      g += S.line(L, mid, L + PW, mid, pal.axis, 1.4);
      /* ticks both ways from the centre line, labelled with magnitude */
      var i;
      for (i = 1; i <= nc.ticks; i++) {
        var o = sy(nc.min + (nc.max - nc.min) * i / nc.ticks);
        g += S.line(L, mid - o, L + PW, mid - o, pal.grid, 1);
        g += S.line(L, mid + o, L + PW, mid + o, pal.grid, 1);
        var lbl = GFC.fixed(nc.max * i / nc.ticks, 0);
        g += S.text(L - 6, mid - o + 3.5, lbl, { anchor: 'end', size: 10, fill: pal.soft });
        g += S.text(L - 6, mid + o + 3.5, lbl, { anchor: 'end', size: 10, fill: pal.soft });
      }

      var bw = PW / items.length;
      items.forEach(function (it, idx) {
        var cx = L + bw * (idx + 0.5);
        var h = sy(it.v);
        var colour = it.side > 0 ? pal.series[0] : pal.series[1];
        g += S.rect(cx - bw * 0.32, it.side > 0 ? mid - h : mid, bw * 0.64, h, colour);
        g += S.text(cx, it.side > 0 ? mid - h - 5 : mid + h + 12, NAMES[it.k],
          { size: 10, anchor: 'middle', fill: pal.ink });
      });

      g += S.text(L, T - 6, 'cations, ' + GFC.fixed(st.cationSum, 1) + ' mmol L⁻¹ of charge',
        { size: 11, fill: pal.series[0], weight: 600 });
      g += S.text(L, T + PH + 26, 'anions, ' + GFC.fixed(st.anionSum, 1) + ' mmol L⁻¹ of charge',
        { size: 11, fill: pal.series[1], weight: 600 });
      g += S.text(L, H - 10, 'Charge contribution (mmol L⁻¹), measured from the centre line',
        { size: 11, fill: pal.soft });
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Electrical conductivity from the charge-weighted cation sum, with the '
            + 'electroneutrality constraint:',
        math: 'EC ≈ 0.1 C⁺ &nbsp;&nbsp; [dS m⁻¹], &nbsp;&nbsp; C⁺ = C⁻',
        note: 'C⁺ is the sum of cation molar concentrations weighted by charge, in mmol per litre. '
            + 'Linear only up to about 3.5 dS m⁻¹, above which the relation becomes logarithmic. '
            + 'Potassium is usually the largest single contributor, and sodium or chloride in the '
            + 'irrigation water must be counted in.' },
      { lead: 'Uptake concentration is not the supply concentration, and the difference is what '
            + 'accumulates or depletes:',
        math: 'C<sub>uptake</sub> = nutrient uptake rate [mmol m⁻² d⁻¹] / transpiration [L m⁻² d⁻¹]',
        note: 'So the same crop on the same recipe has a different uptake concentration on a '
            + 'bright day and a dull one, because transpiration moves and mineral uptake tracks '
            + 'growth rather than water.' },
      { lead: 'The mineral requirement, which follows growth rather than water:',
        math: 'minerals ≈ 0.02 × fresh biomass',
        note: 'Of 1 kg fresh biomass about 130 g is dry matter, of which 110 g is carbohydrate, '
            + 'leaving about 20 g of minerals. Micro-elements are under 0.3 % of that. Sodium and '
            + 'chloride appear in the analysis but are not essential: they come from the water, '
            + 'the medium or the fertilisers.' }
    ],

    caveats: [
      'Conductivity says nothing about composition. Two solutions with the same reading can be '
        + 'nutritionally very different, and a controller holding conductivity will happily hold '
        + 'it with the wrong ions.',
      'The potassium uptake figure here splits the non-nitrogen mineral fraction by a single '
        + 'assumed share. It is indicative; a real nutrient plan needs the per-element uptake, '
        + 'which this page does not resolve.',
      'Micro-elements are not modelled. They are a small mass and a large share of the problems, '
        + 'iron in particular.',
      'The recipes are published targets for the root-zone solution, not dosing recipes. What to '
        + 'dose depends on what the water already contains, which is why the water analysis is '
        + 'the first input and not the last.'
    ],

    sources: ['sonneveld2009', 'stanghellini2019', 'fao56'],
    provenance: 'Section 14.4 of "Greenhouse parameters and equations", including its table of '
              + 'recommended macronutrient concentrations and its statement of the conductivity '
              + 'relation and its linear range.'
  });
}());

