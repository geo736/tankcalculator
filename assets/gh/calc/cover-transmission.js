
(function () {
  'use strict';
  var S = GFC.svgns;

  GFC.mount({
    slug: 'cover-transmission',
    kicker: 'Lighting',
    name: 'Cover transmission to the canopy',
    lede: 'Four independent factors stand between a cover datasheet and the light the crop '
        + 'receives, and they multiply. This builds the chain explicitly, adds the shading on '
        + 'top, and converts the result into the photon units the crop responds to.',
    inputNote: 'Perpendicular transmittance over-states the light below the cover by at least '
             + '10 %. The design figure is the hemispherical transmittance.',

    inputs: [
      { id: 'tauhem', label: 'Hemispherical transmittance of the cover', unit: '–', value: 0.82, step: 0.01, min: 0.3, max: 0.95,
        help: 'Materials run 0.60 to 0.91. For glass this sits 7 to 8 percentage points below the perpendicular value, and much further below it for a material whose reflection rises steeply with angle.' },
      { id: 'fstr', label: 'Lost to structure', unit: '–', value: 0.12, step: 0.01, min: 0, max: 0.4,
        help: 'Gutters, trusses, glazing bars, pipes and overhead gear. 0.10 to 0.20, rising with span count; 0.20 or more in older heavy-framed houses.' },
      { id: 'fdirt', label: 'Lost to soiling', unit: '–', value: 0.05, step: 0.01, min: 0, max: 0.3,
        help: '0.02 to 0.10 between washes. Recovered by washing, so this is an operating variable rather than a property.' },
      { id: 'fcond', label: 'Lost to condensate droplets', unit: '–', value: 0.04, step: 0.01, min: 0, max: 0.2,
        help: '0.02 to 0.08. Droplets scatter backwards; a film-forming treatment moves this towards the low end and a dry cover removes it.' },

      { id: 'sww', label: 'Whitewash shade factor', unit: '–', value: 0, step: 0.05, min: 0, max: 0.8,
        group: 'Shading',
        help: 'A whitewash is quoted as a transmissivity reduction, so S = 1 − τ of the wash. It acts over the whole cover whenever it is on.' },
      { id: 'sscr', label: 'Screen shade rating', unit: '–', value: 0.50, step: 0.05, min: 0, max: 0.95,
        help: 'A woven screen is sold on the fraction of VISIBLE radiation it blocks and says nothing about the near infrared. Keep the two conventions apart.' },
      { id: 'uscr', label: 'Screen closure fraction', unit: '–', value: 0, step: 0.05, min: 0, max: 1 },

      { id: 'isun', label: 'Global radiation outside', unit: 'W m⁻²', value: 900, step: 10, min: 0, max: 1200,
        group: 'Conditions' },
      { id: 'hours', label: 'Equivalent full-light hours per day', unit: 'h', value: 8, step: 0.5, min: 0.5, max: 16,
        help: 'Used only to turn the instantaneous figure into a daily light integral at this radiation level.' },
      { id: 'epsL', label: 'Light–yield elasticity', unit: '–', value: 1.0, step: 0.05, min: 0.3, max: 1.5,
        group: 'Yield',
        help: 'The "1 % rule": 1 % more light gives 1 % more yield, a good approximation for fruit crops. Shading enters yield as a power law, so yield falls less than light.' }
    ],

    compute: function (v) {
      var tauHem = GFC.need(v.tauhem, 'Hemispherical transmittance', { positive: true, max: 0.95 });
      var fStr = GFC.need(v.fstr, 'Structure loss', { min: 0, max: 0.4 });
      var fDirt = GFC.need(v.fdirt, 'Soiling loss', { min: 0, max: 0.3 });
      var fCond = GFC.need(v.fcond, 'Condensate loss', { min: 0, max: 0.2 });
      var sWw = GFC.need(v.sww, 'Whitewash shade factor', { min: 0, max: 0.8 });
      var sScr = GFC.need(v.sscr, 'Screen shade rating', { min: 0, max: 0.95 });
      var uScr = GFC.need(v.uscr, 'Screen closure', { min: 0, max: 1 });
      var iSun = GFC.need(v.isun, 'Global radiation', { min: 0 });
      var hours = GFC.need(v.hours, 'Full-light hours', { positive: true });
      var epsL = GFC.need(v.epsL, 'Light–yield elasticity', { positive: true });

      var tauGh = tauHem * (1 - fStr) * (1 - fDirt) * (1 - fCond);
      var shadeWw = 1 - sWw;
      var shadeScr = 1 - uScr * sScr;
      var shade = shadeWw * shadeScr;

      var iCan = iSun * tauGh * shade;
      var iUnshaded = iSun * tauGh;
      var ppfd = 2 * iCan;                       /* global-radiation photon factor, 3.1 */
      var ppfdUnshaded = 2 * iUnshaded;
      var dli = 0.0036 * ppfd * hours;
      var dliUnshaded = 0.0036 * ppfdUnshaded * hours;
      var yieldRatio = Math.pow(shade, epsL);

      var flags = [];
      if (tauGh > 0.78) flags.push({ head: 'Whole-greenhouse transmissivity of ' + GFC.fixed(tauGh, 2) + '.',
        text: 'A clean dry anti-reflective glass house reaches about 0.76 and roughly 0.72 is described as about the highest possible. Check the four factors before using a figure above that.' });
      if (sWw > 0) flags.push({ head: 'The whitewash costs ' + GFC.fixed(ppfdUnshaded - 2 * iSun * tauGh * shadeScr, 0) + ' µmol m⁻² s⁻¹.',
        text: 'For comparison, a typical supplementary lighting installation delivers 150 to 200 µmol m⁻² s⁻¹.' });
      if (uScr > 0 && sWw > 0) flags.push({ head: 'Both shading layers on.',
        text: 'They multiply, and the two conventions are different: the whitewash figure is a transmissivity reduction over the whole cover, the screen figure is a visible-light shade rating applied in proportion to closure.' });
      if (shade < 1) flags.push({ head: 'Yield falls less than light.',
        text: 'Light is down to ' + GFC.pct(shade, 0) + ' and yield to ' + GFC.pct(yieldRatio, 0) + ' at an elasticity of ' + GFC.fixed(epsL, 2) + '. Whenever ventilation is sufficient, shading is unnecessary: the same temperature drop could have been had by ventilating harder.' });

      return {
        headline: [
          { label: 'Transmissivity to the canopy', value: GFC.fixed(tauGh * shade, 3), unit: '–',
            hint: 'τ_gh ' + GFC.fixed(tauGh, 3) + ' × shading ' + GFC.fixed(shade, 3) },
          { label: 'Radiation at the canopy', value: GFC.fixed(iCan, 0), unit: 'W m⁻²',
            hint: 'From ' + GFC.fixed(iSun, 0) + ' outside' },
          { label: 'PPFD at the canopy', value: GFC.fixed(ppfd, 0), unit: 'µmol m⁻² s⁻¹',
            hint: 'At the global-radiation factor of 2' },
          { label: 'Yield relative to unshaded', value: GFC.pct(yieldRatio, 0), unit: '',
            hint: 'Light is at ' + GFC.pct(shade, 0) }
        ],
        flags: flags,
        rows: [
          { label: 'Hemispherical transmittance τ_hem', value: GFC.fixed(tauHem, 3), unit: '–', note: 'Material property' },
          { label: 'After structure', value: GFC.fixed(tauHem * (1 - fStr), 3), unit: '–', note: '× (1 − ' + GFC.fixed(fStr, 2) + ')' },
          { label: 'After soiling', value: GFC.fixed(tauHem * (1 - fStr) * (1 - fDirt), 3), unit: '–', note: '× (1 − ' + GFC.fixed(fDirt, 2) + ')' },
          { label: 'Whole-greenhouse transmissivity τ_gh', value: GFC.fixed(tauGh, 4), unit: '–', note: '× (1 − ' + GFC.fixed(fCond, 2) + ') for condensate' },
          { label: 'Whitewash factor', value: GFC.fixed(shadeWw, 3), unit: '–', note: '1 − S_ww' },
          { label: 'Screen factor', value: GFC.fixed(shadeScr, 3), unit: '–', note: '1 − u_scr S_scr' },
          { label: 'Combined shading factor', value: GFC.fixed(shade, 4), unit: '–', note: 'The two multiply' },
          { label: 'Radiation at the canopy, unshaded', value: GFC.fixed(iUnshaded, 1), unit: 'W m⁻²', note: 'I_sun τ_gh' },
          { label: 'Radiation at the canopy, shaded', value: GFC.fixed(iCan, 1), unit: 'W m⁻²', note: 'I_sun τ_gh (1 − S_ww)(1 − u S_scr)' },
          { label: 'PPFD, unshaded', value: GFC.fixed(ppfdUnshaded, 0), unit: 'µmol m⁻² s⁻¹', note: 'Approximately 2 I_can' },
          { label: 'PPFD, shaded', value: GFC.fixed(ppfd, 0), unit: 'µmol m⁻² s⁻¹', note: 'What the crop sees' },
          { label: 'Daily light integral, unshaded', value: GFC.fixed(dliUnshaded, 2), unit: 'mol m⁻² d⁻¹', note: 'At ' + GFC.fixed(hours, 1) + ' full-light hours' },
          { label: 'Daily light integral, shaded', value: GFC.fixed(dli, 2), unit: 'mol m⁻² d⁻¹', note: 'Same hours' },
          { label: 'Light lost to shading', value: GFC.fixed(ppfdUnshaded - ppfd, 0), unit: 'µmol m⁻² s⁻¹', note: 'The photons the shade removes' },
          { label: 'Yield ratio', value: GFC.fixed(yieldRatio, 4), unit: '–', note: '[(1 − S_ww)(1 − u S_scr)]^ε_L' },
          { label: 'Yield lost to shading', value: GFC.pct(1 - yieldRatio, 1), unit: '', note: 'Less than the light lost, because ε_L applies as a power' }
        ],
        caption: 'The transmission chain from the material datasheet to the canopy. Each bar is '
               + 'what survives the step named below it.',
        _v: { tauHem: tauHem, fStr: fStr, fDirt: fDirt, fCond: fCond, tauGh: tauGh,
              shadeWw: shadeWw, shadeScr: shadeScr, shade: shade }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var steps = [
        { label: 'material τ_hem', v: st.tauHem },
        { label: 'less structure', v: st.tauHem * (1 - st.fStr) },
        { label: 'less soiling', v: st.tauHem * (1 - st.fStr) * (1 - st.fDirt) },
        { label: 'less condensate', v: st.tauGh },
        { label: 'less whitewash', v: st.tauGh * st.shadeWw },
        { label: 'less screen', v: st.tauGh * st.shade }
      ];
      var W = 640, H = 320, L = 56, T = 14, PW = W - L - 24, PH = H - T - 76;
      var sy = S.scale(0, 1, T + PH, T);
      var g = S.open(W, H, 'Transmission chain from cover material to canopy');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: steps.length, yMin: 0, yMax: 1,
        xTicks: steps.length, yTicks: 5, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function () { return ''; },
        yFmt: function (q) { return GFC.fixed(q, 1); },
        yLabel: 'Fraction of outside radiation'
      });
      var bw = PW / steps.length;
      steps.forEach(function (s, i) {
        var cx = L + bw * (i + 0.5);
        var colour = i < 4 ? pal.series[0] : pal.series[2];
        g += S.rect(cx - bw * 0.3, sy(s.v), bw * 0.6, (T + PH) - sy(s.v), colour);
        g += S.text(cx, sy(s.v) - 5, GFC.fixed(s.v, 2), { size: 10.5, anchor: 'middle', fill: pal.ink, mono: true });
        g += S.text(cx, T + PH + 16, s.label, { size: 9.5, anchor: 'middle', fill: pal.soft });
      });
      g += S.legend(L, H - 10, [
        { label: 'the cover chain (τ_gh)', colour: pal.series[0], dash: null },
        { label: 'shading on top', colour: pal.series[2], dash: null }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Only the diffuse component takes the hemispherical transmittance; the direct beam '
            + 'keeps its own transmittance at the instantaneous incidence angle:',
        math: 'τ<sub>hem</sub> = 2 ∫<sub>0</sub><sup>π/2</sup> τ(θ) cos θ sin θ dθ, &nbsp;&nbsp; '
            + 'τ I<sub>sun</sub> = τ(θ<sub>i</sub>) DNI max(0, cos θ<sub>i</sub>) + τ<sub>hem</sub> DHI',
        note: 'The cos θ sin θ weight puts most of the weight near 45°, which is why τ_hem sits '
            + 'well below τ(0). Almost no part of a cover anywhere on Earth ever receives '
            + 'perpendicular radiation.' },
      { lead: 'Four independent factors stand between the datasheet and the canopy, and they '
            + 'multiply:',
        math: 'τ<sub>gh</sub> = τ<sub>hem</sub> (1 − f<sub>str</sub>)(1 − f<sub>dirt</sub>)(1 − f<sub>cond</sub>)',
        note: 'The product reproduces the whole-greenhouse figures quoted in this literature from '
            + 'the material property alone, which is the check that the factorisation is not '
            + 'double-counting: 0.82 × 0.88 × 0.95 × 0.96 ≈ 0.66 for a dirty condensing glass '
            + 'house, 0.84 × 0.92 × 0.98 ≈ 0.76 for a clean dry anti-reflective one.' },
      { lead: 'Shading enters as a whitewash over the whole cover and a screen in proportion to '
            + 'its closure:',
        math: 'I<sub>can</sub> = I<sub>sun</sub> τ<sub>gh</sub> (1 − S<sub>ww</sub>)(1 − u<sub>scr</sub>S<sub>scr</sub>), '
            + '&nbsp;&nbsp; PPFD<sub>can</sub> ≈ 2 I<sub>can</sub>' },
      { lead: 'Yield follows through the light–yield elasticity, so the loss is a power law and '
            + 'not a proportion:',
        math: 'Y / Y<sub>unshaded</sub> = [(1 − S<sub>ww</sub>)(1 − u<sub>scr</sub>S<sub>scr</sub>)]<sup>ε<sub>L</sub></sup>',
        note: 'Also why 50 % whitewash does not halve the temperature excess: halving the incoming '
            + 'radiation does not halve the excess, because the outgoing losses shrink as the '
            + 'house cools, and the crop transpires less and so removes less of its own heat.' }
    ],

    caveats: [
      'A woven screen’s shade rating is the fraction of visible radiation blocked and says nothing '
        + 'about the near infrared, where leaves reflect about half the incident energy. Two '
        + 'screens with the same rating can have very different thermal effects.',
      'Soiling is an operating variable, not a material property. A figure measured just after a '
        + 'wash is not the figure to design on.',
      'The global-radiation photon factor of 2 holds for sunlight only. Under lamps the spectrum '
        + 'has to be known; the light units calculator carries the per-source factors.'
    ],

    sources: ['hemming2005', 'pollet2002', 'baille2001whitening', 'marcelis2006', 'stanghellini2019', 'thimijan1983'],
    provenance: 'Sections 3.3, 3.4 and 3.6 of "Greenhouse parameters and equations", with that '
              + 'document’s own worked chain reproduced by the defaults.'
  });
}());

