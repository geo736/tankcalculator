
(function () {
  'use strict';
  var S = GFC.svgns;

  /* Methane potentials, Nm3 per tonne of volatile solids, and biomass yields,
   * as NEEMO carries them from the ADM1-R4 simplification. */
  var BMP = { ch: 347, pr: 450, li: 893, bio: 450 };
  var Y = { ch: 0.1372, pr: 0.1723, li: 0.2286 };

  function raw(fCh, fPr, fLi, hrt, kCh, kPr, kLi, kDec) {
    var eta = function (k, h) { return k * h / (1 + k * h); };
    var eCh = eta(kCh, hrt), ePr = eta(kPr, hrt), eLi = eta(kLi, hrt);
    var ch4Ch = fCh * eCh * (1 - Y.ch) * BMP.ch;
    var ch4Pr = fPr * ePr * (1 - Y.pr) * BMP.pr;
    var ch4Li = fLi * eLi * (1 - Y.li) * BMP.li;
    var bio = fCh * eCh * Y.ch + fPr * ePr * Y.pr + fLi * eLi * Y.li;
    var eDec = eta(kDec, hrt);
    var decay = bio * eDec * (1 - Y.pr) * BMP.bio;
    return { total: ch4Ch + ch4Pr + ch4Li + decay, eCh: eCh, ePr: ePr, eLi: eLi,
             eDec: eDec, decay: decay, ch: ch4Ch, pr: ch4Pr, li: ch4Li, bio: bio };
  }

  GFC.mount({
    slug: 'digester-methane',
    kicker: 'Aquaculture',
    name: 'ADM1-R4 methane yield from a sludge blend',
    lede: 'Methane yield from the substrate’s own composition rather than from a table of '
        + 'averages. First-order hydrolysis of carbohydrate, protein and lipid, then decay of the '
        + 'microbial biomass those reactions build, all at the retention time the digester '
        + 'actually runs.',
    inputNote: 'Composition fractions are normalised on volatile solids, which is the substrate '
             + 'the methane derives from, not on wet mass or volume.',

    inputs: [
      { id: 'fch', label: 'Carbohydrate fraction of volatile solids', unit: '–', value: 0.25, step: 0.01, min: 0, max: 1 },
      { id: 'fpr', label: 'Protein fraction of volatile solids', unit: '–', value: 0.45, step: 0.01, min: 0, max: 1 },
      { id: 'fli', label: 'Lipid fraction of volatile solids', unit: '–', value: 0.15, step: 0.01, min: 0, max: 1,
        help: 'Lipid carries by far the highest methane potential, 893 against 347 for carbohydrate, and hydrolyses slowest. A lipid-rich sludge therefore needs a long retention time to realise its advantage.' },
      { id: 'hrt', label: 'Hydraulic retention time', unit: 'd', value: 25, step: 1, min: 1, max: 200 },

      { id: 'bmp', label: 'Measured methane potential, if known', unit: 'Nm³ t⁻¹ VS', value: 0, step: 5, min: 0, max: 1200,
        group: 'Anchoring',
        help: 'A measured biochemical methane potential anchors the finite-retention yield to the near-complete conversion calculation. Leave at zero to report the raw ADM1-R4 yield unanchored.' },

      { id: 'kch', label: 'Carbohydrate hydrolysis rate', unit: 'd⁻¹', value: 0.25, step: 0.01, min: 0.01, max: 2, group: 'Rate parameters' },
      { id: 'kpr', label: 'Protein hydrolysis rate', unit: 'd⁻¹', value: 0.20, step: 0.01, min: 0.01, max: 2 },
      { id: 'kli', label: 'Lipid hydrolysis rate', unit: 'd⁻¹', value: 0.10, step: 0.01, min: 0.01, max: 2 },
      { id: 'kdec', label: 'Biomass decay rate', unit: 'd⁻¹', value: 0.02, step: 0.005, min: 0.001, max: 0.5 },

      { id: 'tpd', label: 'Substrate throughput', unit: 't wet per day', value: 5, step: 0.5, min: 0.01, max: 1000, group: 'Scale' },
      { id: 'ts', label: 'Total solids', unit: '%', value: 3.0, step: 0.1, min: 0.1, max: 60 },
      { id: 'vsfrac', label: 'Volatile solids as a fraction of total solids', unit: '–', value: 0.75, step: 0.01, min: 0.2, max: 1 },
      { id: 'ch4frac', label: 'Methane fraction of the biogas', unit: '–', value: 0.62, step: 0.01, min: 0.3, max: 0.9 },
      { id: 'chpeff', label: 'Electrical efficiency of the engine', unit: '–', value: 0.38, step: 0.01, min: 0.1, max: 0.5 }
    ],

    compute: function (v) {
      var fCh = GFC.need(v.fch, 'Carbohydrate fraction', { min: 0, max: 1 });
      var fPr = GFC.need(v.fpr, 'Protein fraction', { min: 0, max: 1 });
      var fLi = GFC.need(v.fli, 'Lipid fraction', { min: 0, max: 1 });
      var hrt = GFC.need(v.hrt, 'Hydraulic retention time', { positive: true });
      var bmpMeas = GFC.need(v.bmp, 'Measured methane potential', { min: 0 });
      var kCh = GFC.need(v.kch, 'Carbohydrate hydrolysis rate', { positive: true });
      var kPr = GFC.need(v.kpr, 'Protein hydrolysis rate', { positive: true });
      var kLi = GFC.need(v.kli, 'Lipid hydrolysis rate', { positive: true });
      var kDec = GFC.need(v.kdec, 'Biomass decay rate', { positive: true });
      var tpd = GFC.need(v.tpd, 'Substrate throughput', { positive: true });
      var ts = GFC.need(v.ts, 'Total solids', { positive: true, max: 60 });
      var vsFrac = GFC.need(v.vsfrac, 'Volatile solids fraction', { positive: true, max: 1 });
      var ch4Frac = GFC.need(v.ch4frac, 'Methane fraction', { positive: true, max: 0.9 });
      var chpEff = GFC.need(v.chpeff, 'Electrical efficiency', { positive: true, max: 0.5 });

      var sum = fCh + fPr + fLi;
      if (sum <= 0) throw new Error('At least one of the three composition fractions must be above zero.');
      if (sum > 1.0001) throw new Error('The three composition fractions sum to ' + GFC.fixed(sum, 3) + ', which is more than the whole of the volatile solids.');

      var atHrt = raw(fCh, fPr, fLi, hrt, kCh, kPr, kLi, kDec);
      var atInf = raw(fCh, fPr, fLi, 10000, kCh, kPr, kLi, kDec);

      var anchored = bmpMeas > 0 && atInf.total > 0;
      var yieldPerT = anchored ? atHrt.total * (bmpMeas / atInf.total) : atHrt.total;
      var scale = anchored ? bmpMeas / atInf.total : 1;
      var etaOverall = atInf.total > 0 ? atHrt.total / atInf.total : 1;

      var vsPerDay = tpd * (ts / 100) * vsFrac;           /* t VS per day */
      var ch4PerDay = yieldPerT * vsPerDay;               /* Nm3 CH4 per day */
      var biogasPerDay = ch4PerDay / ch4Frac;
      /* Lower heating value of methane, 35.9 MJ per Nm3 (50.05 MJ/kg at 0.717 kg/Nm3). */
      var lhv = 35.9;
      var energyPerDay = ch4PerDay * lhv;                 /* MJ per day */
      var elecPerDay = energyPerDay * chpEff / 3.6;       /* kWh per day */
      var elecKw = elecPerDay / 24;
      var digesterVolume = tpd * hrt;                     /* m3, at about 1 t per m3 */

      var flags = [];
      if (sum < 0.999) flags.push({ head: 'Composition sums to ' + GFC.fixed(sum, 2) + '.',
        text: 'The remaining ' + GFC.pct(1 - sum, 0) + ' of the volatile solids is treated as inert and produces no methane. If that is not intended, raise the fractions.' });
      if (!anchored) flags.push({ head: 'Unanchored.',
        text: 'With no measured methane potential supplied this is the raw ADM1-R4 yield. Where a composition is missing altogether, the right move is a measured potential rather than a default composition reported as an ADM1 reduction.' });
      else flags.push({ head: 'Anchored to a measured potential.',
        text: 'The finite-retention yield is scaled by ' + GFC.fixed(scale, 3) + ', the ratio of the measured potential to the near-complete conversion calculation at 10 000 days.' });
      if (atHrt.eLi < 0.6) flags.push({ head: 'Lipid only ' + GFC.pct(atHrt.eLi, 0) + ' hydrolysed.',
        text: 'Lipid carries the highest methane potential of the three and hydrolyses slowest, so at ' + GFC.fixed(hrt, 0) + ' days most of its potential is leaving in the digestate. Lengthening the retention time buys more here than anywhere else.' });
      if (etaOverall < 0.7) flags.push({ head: 'Overall conversion ' + GFC.pct(etaOverall, 0) + '.',
        text: 'Nearly a third of the achievable methane is unrealised at this retention time.' });

      return {
        headline: [
          { label: 'Methane yield', value: GFC.fixed(yieldPerT, 0), unit: 'Nm³ t⁻¹ VS',
            hint: GFC.pct(etaOverall, 0) + ' of near-complete conversion' },
          { label: 'Methane', value: GFC.fixed(ch4PerDay, 0), unit: 'Nm³ d⁻¹',
            hint: GFC.fixed(biogasPerDay, 0) + ' Nm³ d⁻¹ of biogas' },
          { label: 'Electrical output', value: GFC.fixed(elecKw, 1), unit: 'kW',
            hint: GFC.fixed(elecPerDay, 0) + ' kWh per day' },
          { label: 'Digester volume', value: GFC.fixed(digesterVolume, 0), unit: 'm³',
            hint: 'Throughput × retention time' }
        ],
        flags: flags,
        rows: [
          { label: 'Carbohydrate hydrolysed', value: GFC.pct(atHrt.eCh, 1), unit: '', note: 'k h / (1 + k h) at k = ' + GFC.fixed(kCh, 2) },
          { label: 'Protein hydrolysed', value: GFC.pct(atHrt.ePr, 1), unit: '', note: 'at k = ' + GFC.fixed(kPr, 2) },
          { label: 'Lipid hydrolysed', value: GFC.pct(atHrt.eLi, 1), unit: '', note: 'at k = ' + GFC.fixed(kLi, 2) },
          { label: 'Biomass decayed', value: GFC.pct(atHrt.eDec, 1), unit: '', note: 'at k = ' + GFC.fixed(kDec, 3) },
          { label: 'Methane from carbohydrate', value: GFC.fixed(atHrt.ch * scale, 1), unit: 'Nm³ t⁻¹ VS', note: 'f η (1 − Y) × 347' },
          { label: 'Methane from protein', value: GFC.fixed(atHrt.pr * scale, 1), unit: 'Nm³ t⁻¹ VS', note: 'f η (1 − Y) × 450' },
          { label: 'Methane from lipid', value: GFC.fixed(atHrt.li * scale, 1), unit: 'Nm³ t⁻¹ VS', note: 'f η (1 − Y) × 893' },
          { label: 'Methane from biomass decay', value: GFC.fixed(atHrt.decay * scale, 1), unit: 'Nm³ t⁻¹ VS', note: GFC.pct(atHrt.decay / Math.max(atHrt.total, 1e-9), 0) + ' of the total' },
          { label: 'Microbial biomass built', value: GFC.fixed(atHrt.bio, 4), unit: 't per t VS', note: 'Σ f η Y; the substrate that becomes cells' },
          { label: 'Yield at this retention time', value: GFC.fixed(yieldPerT, 2), unit: 'Nm³ t⁻¹ VS', note: anchored ? 'Anchored to the measured potential' : 'Raw ADM1-R4' },
          { label: 'Yield at near-complete conversion', value: GFC.fixed(atInf.total * scale, 2), unit: 'Nm³ t⁻¹ VS', note: 'The 10 000-day calculation' },
          { label: 'Overall conversion', value: GFC.pct(etaOverall, 2), unit: '', note: 'Finite over near-complete' },
          { label: 'Volatile solids fed', value: GFC.fixed(vsPerDay, 3), unit: 't d⁻¹', note: 'Throughput × total solids × volatile fraction' },
          { label: 'Methane produced', value: GFC.fixed(ch4PerDay, 1), unit: 'Nm³ d⁻¹', note: 'Yield × volatile solids fed' },
          { label: 'Biogas produced', value: GFC.fixed(biogasPerDay, 1), unit: 'Nm³ d⁻¹', note: 'At ' + GFC.pct(ch4Frac, 0) + ' methane' },
          { label: 'Energy in the methane', value: GFC.fixed(energyPerDay, 0), unit: 'MJ d⁻¹', note: 'At 35.9 MJ Nm⁻³, the lower heating value' },
          { label: 'Electricity generated', value: GFC.fixed(elecPerDay, 0), unit: 'kWh d⁻¹', note: 'At ' + GFC.pct(chpEff, 0) + ' electrical efficiency' },
          { label: 'Continuous electrical output', value: GFC.fixed(elecKw, 2), unit: 'kW', note: 'Averaged over the day' },
          { label: 'Digester working volume', value: GFC.fixed(digesterVolume, 1), unit: 'm³', note: 'At about one tonne per cubic metre' }
        ],
        caption: 'Yield against retention time, with the contribution of each substrate class. '
               + 'The three curves saturate at different rates, so the mix decides how long the '
               + 'digester has to be.',
        _v: { fCh: fCh, fPr: fPr, fLi: fLi, kCh: kCh, kPr: kPr, kLi: kLi, kDec: kDec,
              hrt: hrt, scale: scale, yieldPerT: yieldPerT }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 350, L = 66, T = 14, PW = W - L - 28, PH = H - T - 76;
      var hMax = Math.max(60, Math.ceil(st.hrt * 1.6));
      var top = raw(st.fCh, st.fPr, st.fLi, hMax, st.kCh, st.kPr, st.kLi, st.kDec).total * st.scale;
      var nc = S.nice(0, top, 4);
      var sx = S.scale(0, hMax, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Methane yield against hydraulic retention time');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: hMax, yMin: 0, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 0); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Hydraulic retention time (days)',
        yLabel: 'Methane yield (Nm³ per t VS)'
      });

      var series = [
        { pick: function (o) { return o.total; }, colour: pal.accent, w: 2.6, dash: null, label: 'total' },
        { pick: function (o) { return o.ch; }, colour: pal.series[1], w: 1.5, dash: '4 3', label: 'carbohydrate' },
        { pick: function (o) { return o.pr; }, colour: pal.series[2], w: 1.5, dash: '4 3', label: 'protein' },
        { pick: function (o) { return o.li; }, colour: pal.series[3], w: 1.5, dash: '4 3', label: 'lipid' }
      ];
      series.forEach(function (s) {
        var d = '', h, first = true;
        for (h = 0.5; h <= hMax; h += hMax / 180) {
          var o = raw(st.fCh, st.fPr, st.fLi, h, st.kCh, st.kPr, st.kLi, st.kDec);
          d += (first ? 'M' : 'L') + sx(h).toFixed(1) + ' ' + sy(Math.min(s.pick(o) * st.scale, nc.max)).toFixed(1);
          first = false;
        }
        g += S.path(d, s.colour, s.w, null, s.dash);
      });

      g += S.line(sx(st.hrt), T, sx(st.hrt), T + PH, pal.warn, 1.2, '3 3');
      g += S.circle(sx(st.hrt), sy(Math.min(st.yieldPerT, nc.max)), 5, pal.accent);
      g += S.text(sx(st.hrt) + 8, sy(Math.min(st.yieldPerT, nc.max)) - 8,
        GFC.fixed(st.yieldPerT, 0) + ' Nm³ t⁻¹ VS', { size: 11, fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, series.map(function (s) {
        return { label: s.label, colour: s.colour, dash: s.dash };
      }), pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Each substrate class hydrolyses to first order, so the fraction converted at a '
            + 'retention time h is:',
        math: 'η<sub>i</sub> = k<sub>i</sub> h / (1 + k<sub>i</sub> h)',
        note: 'Default rates are 0.25, 0.20 and 0.10 d⁻¹ for carbohydrate, protein and lipid, and '
            + '0.02 d⁻¹ for biomass decay. Lipid has the highest potential and the slowest rate, '
            + 'which is why a lipid-rich substrate rewards a long digester.' },
      { lead: 'Methane from each class, net of the substrate that becomes microbial biomass:',
        math: 'CH₄<sub>i</sub> = f<sub>i</sub> η<sub>i</sub> (1 − Y<sub>i</sub>) B<sub>i</sub>',
        note: 'Biomass yields are 0.1372, 0.1723 and 0.2286; methane potentials are 347, 450 and '
            + '893 Nm³ per tonne of volatile solids.' },
      { lead: 'The biomass those reactions built then decays and yields methane itself:',
        math: 'CH₄<sub>dec</sub> = (Σ f<sub>i</sub> η<sub>i</sub> Y<sub>i</sub>) · η<sub>dec</sub> · (1 − Y<sub>pr</sub>) · B<sub>bio</sub>',
        note: 'With B_bio taken as the protein potential, 450 Nm³ t⁻¹ VS.' },
      { lead: 'A measured potential anchors the finite-retention yield to the near-complete '
            + 'conversion calculation:',
        math: 'CH₄ = CH₄(h) × B<sub>measured</sub> / CH₄(10 000 d)',
        note: 'Without a supplied anchor the raw yield is reported. Where a stream lacks a '
            + 'composition altogether, a measured potential is the right fallback rather than a '
            + 'default composition presented as an ADM1 reduction.' }
    ],

    caveats: [
      'This is the steady-state reduction of ADM1, not ADM1. It carries no pH, no alkalinity, no '
        + 'inhibition and no temperature dependence, so it cannot tell you whether the digester '
        + 'is stable, only what it would yield if it were.',
      'Composition fractions are on a volatile-solids basis. Weighting a blend by wet mass or by '
        + 'volume instead will give the wrong answer, because volatile solids are the substrate '
        + 'the methane derives from.',
      'Ammonia inhibition is the usual limit on a protein-rich sludge and is absent here. A '
        + 'high-protein blend that this calculator likes may not run.',
      'The electrical conversion assumes an engine running continuously on the day’s gas. Real '
        + 'plants have gas storage, maintenance downtime and a parasitic load, and the digester '
        + 'itself needs heat.'
    ],

    sources: ['weinrich2021', 'batstone2002', 'delaide2019sludge', 'ebeling2006'],
    provenance: 'Transcribed from rawAdm1r4 and adm1r4MethaneYield in NEEMO’s neemo-model.js, '
              + 'whose parameters and formulation are Supplementary Note 4 of the NEEMO '
              + 'supplementary information.'
  });
}());

