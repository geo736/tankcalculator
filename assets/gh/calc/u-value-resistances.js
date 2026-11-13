
(function () {
  'use strict';
  var S = GFC.svgns;
  var SIGMA = 5.670374419e-8;

  GFC.mount({
    slug: 'u-value-resistances',
    kicker: 'Greenhouse climate',
    name: 'Cover U-value from thermal resistances',
    lede: 'Greenhouses are poorly insulated, so the glazing resistance is small against the two '
        + 'boundary layers and the boundary layers dominate the answer. This builds the U-value '
        + 'both published ways and shows that the same physical loss is two very different '
        + 'coefficients depending only on which temperature difference it is defined against.',
    inputNote: 'The building-physics shortcut does not transfer. Standard inside and outside '
             + 'surface resistances are acceptable in a well-insulated building and not here.',

    inputs: [
      { id: 'd', label: 'Cover thickness', unit: 'mm', value: 4, step: 0.1, min: 0.05, max: 40 },
      { id: 'lam', label: 'Cover thermal conductivity', unit: 'W m⁻¹ K⁻¹', value: 0.84, step: 0.01, min: 0.05, max: 3,
        help: 'Glass 0.84. Polyethylene is far less transparent per unit thickness but is used as a 0.1 mm film, so the two end up behaving similarly.' },
      { id: 'aci', label: 'Inside convective coefficient', unit: 'W m⁻² K⁻¹', value: 3.7, step: 0.1, min: 0.5, max: 20,
        group: 'Boundary layers' },
      { id: 'ace', label: 'Outside convective coefficient', unit: 'W m⁻² K⁻¹', value: 20, step: 0.5, min: 2, max: 80,
        help: 'Rises with wind speed. 20 corresponds to about 4 m s⁻¹.' },
      { id: 'ari', label: 'Inside radiative coefficient', unit: 'W m⁻² K⁻¹', value: 6.0, step: 0.1, min: 1, max: 12 },
      { id: 'are', label: 'Outside radiative coefficient', unit: 'W m⁻² K⁻¹', value: 6.0, step: 0.1, min: 1, max: 12,
        help: 'Net radiative exchange between two bodies at terrestrial temperatures is about 6 W m⁻² per kelvin of difference, which lets you check any radiative term in seconds.' },

      { id: 'tair', label: 'Inside air temperature', unit: '°C', value: 20, step: 0.5, min: -10, max: 45,
        group: 'Temperatures' },
      { id: 'trin', label: 'Inside radiation reference temperature', unit: '°C', value: 22, step: 0.5, min: -10, max: 60,
        help: 'What the inner surface actually radiates to: crop, floor, pipes.' },
      { id: 'tout', label: 'Outside air temperature', unit: '°C', value: 10, step: 0.5, min: -40, max: 45 },
      { id: 'trout', label: 'Sky temperature', unit: '°C', value: 0, step: 0.5, min: -70, max: 45,
        help: 'The cover radiates to the sky, not to the outside air. The long-wave calculator derives it from air temperature and humidity.' },
      { id: 'ratio', label: 'Cover-to-floor area ratio', unit: '–', value: 1.2, step: 0.01, min: 0.8, max: 2.5 },
      { id: 'wet', label: 'Cover surface', unit: '', value: 0, type: 'select',
        options: [{ v: 0, label: 'Dry' }, { v: 1, label: 'Wet with condensate' }],
        help: 'Condensation delivers latent heat to the cover, warming it and raising both the convective and the long-wave loss. The measured increase in total loss for a wet versus a dry cover is 12 to 16 %.' }
    ],

    compute: function (v) {
      var d = GFC.need(v.d, 'Cover thickness', { positive: true }) / 1000;
      var lam = GFC.need(v.lam, 'Thermal conductivity', { positive: true });
      var aci = GFC.need(v.aci, 'Inside convective coefficient', { positive: true });
      var ace = GFC.need(v.ace, 'Outside convective coefficient', { positive: true });
      var ari = GFC.need(v.ari, 'Inside radiative coefficient', { positive: true });
      var are = GFC.need(v.are, 'Outside radiative coefficient', { positive: true });
      var tAir = GFC.need(v.tair, 'Inside air temperature');
      var tRin = GFC.need(v.trin, 'Inside radiation reference temperature');
      var tOut = GFC.need(v.tout, 'Outside air temperature');
      var tRout = GFC.need(v.trout, 'Sky temperature');
      var ratio = GFC.need(v.ratio, 'Cover-to-floor area ratio', { positive: true });
      var wet = GFC.need(v.wet, 'Cover surface') === 1;

      /* Method 2 first: it eliminates the surface temperatures by equating the
       * three series heat flows, and gives the weighted driving temperatures. */
      var rI2 = 1 / (aci + ari), rC = d / lam, rE2 = 1 / (ace + are);
      var u2 = 1 / (rI2 + rC + rE2);
      var tAirStar = (aci * tAir + ari * tRin) / (aci + ari);
      var tOutStar = (ace * tOut + are * tRout) / (ace + are);
      var h2 = ratio * u2 * (tAirStar - tOutStar);

      /* Method 1: the building-physics definition, with the radiative
       * coefficients temperature-corrected because radiant energy is exchanged
       * with surrounding objects and not with air. The surface temperatures
       * follow from the same series balance. */
      var tIS = tAirStar - h2 / ratio / (aci + ari);
      var tES = tOutStar + h2 / ratio / (ace + are);
      var ariStar = Math.abs(tAir - tIS) > 1e-9 ? ari * (tRin - tIS) / (tAir - tIS) : ari;
      var areStar = Math.abs(tES - tOut) > 1e-9 ? are * (tES - tRout) / (tES - tOut) : are;
      var u1 = 1 / (1 / (aci + ariStar) + rC + 1 / (ace + areStar));
      var h1 = ratio * u1 * (tAir - tOut);

      var wetFactor = wet ? 1.14 : 1.0;           /* midpoint of the measured 12 to 16 % */
      var h1w = h1 * wetFactor, h2w = h2 * wetFactor;

      var rShare = {
        inner: rI2 / (rI2 + rC + rE2),
        cover: rC / (rI2 + rC + rE2),
        outer: rE2 / (rI2 + rC + rE2)
      };
      var alphaR20 = 4 * SIGMA * Math.pow(293.15, 3);

      var flags = [];
      if (rShare.cover < 0.2) flags.push({ head: 'The glazing is ' + GFC.pct(rShare.cover, 0) + ' of the resistance.',
        text: 'The boundary layers carry the rest, so wind, sky temperature and internal air movement are first-order terms here rather than corrections. In a well-insulated building the opposite is true and the standard surface resistances are acceptable.' });
      if (Math.abs(u1 - u2) / Math.max(u1, u2) > 0.15) flags.push({ head: 'The two coefficients differ by ' + GFC.pct(Math.abs(u1 - u2) / Math.max(u1, u2), 0) + '.',
        text: 'They describe the same physical loss. Method 1 is defined against the air-to-air difference and method 2 against the radiation-weighted difference, and the heat flow they predict agrees. A U-value quoted without stating which is meant cannot be compared or reused.' });
      if (wet) flags.push({ head: 'Wet cover.',
        text: 'The 14 % uplift applied here is the midpoint of the measured 12 to 16 % increase in total loss for a wet versus a dry cover, a loss channel most treatments neglect.' });
      if (tRout > tOut) flags.push({ head: 'Sky warmer than the air.',
        text: 'That happens only under heavy cloud. On a clear night the sky can be 50 K below the cover, which is the entire argument for infrared-blocking film and aluminium screens.' });

      return {
        headline: [
          { label: 'U-value, method 1', value: GFC.fixed(u1, 2), unit: 'W m⁻² K⁻¹',
            hint: 'Against the air-to-air difference' },
          { label: 'U-value, method 2', value: GFC.fixed(u2, 2), unit: 'W m⁻² K⁻¹',
            hint: 'Against the radiation-weighted difference' },
          { label: 'Heat flow', value: GFC.fixed(h1w, 0), unit: 'W m⁻²',
            hint: 'Per m² of floor; both methods agree' },
          { label: 'Glazing share of the resistance', value: GFC.pct(rShare.cover, 0), unit: '',
            hint: 'The rest is boundary layer' }
        ],
        flags: flags,
        rows: [
          { label: 'Inner surface resistance R_i', value: GFC.fixed(rI2, 4), unit: 'm² K W⁻¹', note: '1/(α_ci + α_Ri)' },
          { label: 'Cover resistance R_c', value: GFC.fixed(rC, 5), unit: 'm² K W⁻¹', note: 'd/λ' },
          { label: 'Outer surface resistance R_e', value: GFC.fixed(rE2, 4), unit: 'm² K W⁻¹', note: '1/(α_ce + α_Re)' },
          { label: 'Share of resistance, inner layer', value: GFC.pct(rShare.inner, 1), unit: '', note: 'Dominant in a greenhouse' },
          { label: 'Share of resistance, glazing', value: GFC.pct(rShare.cover, 1), unit: '', note: 'Small, which is the point' },
          { label: 'Share of resistance, outer layer', value: GFC.pct(rShare.outer, 1), unit: '', note: 'Falls as wind rises' },
          { label: 'U-value, method 2', value: GFC.fixed(u2, 4), unit: 'W m⁻² K⁻¹', note: 'Surface temperatures eliminated' },
          { label: 'Weighted inside temperature T*_air', value: GFC.fixed(tAirStar, 2), unit: '°C', note: 'Convection and radiation weighted' },
          { label: 'Weighted outside temperature T*_out', value: GFC.fixed(tOutStar, 2), unit: '°C', note: 'Air and sky weighted' },
          { label: 'Inner surface temperature', value: GFC.fixed(tIS, 2), unit: '°C', note: 'From the series balance' },
          { label: 'Outer surface temperature', value: GFC.fixed(tES, 2), unit: '°C', note: 'From the series balance' },
          { label: 'Corrected inside radiative coefficient', value: GFC.fixed(ariStar, 3), unit: 'W m⁻² K⁻¹', note: 'α_Ri (T_Rin − T_iS)/(T_air − T_iS)' },
          { label: 'Corrected outside radiative coefficient', value: GFC.fixed(areStar, 3), unit: 'W m⁻² K⁻¹', note: 'α_Re (T_eS − T_Rout)/(T_eS − T_out)' },
          { label: 'U-value, method 1', value: GFC.fixed(u1, 4), unit: 'W m⁻² K⁻¹', note: 'Building-physics definition' },
          { label: 'Heat flow, method 1', value: GFC.fixed(h1, 2), unit: 'W m⁻²', note: '(A_c/A_s) U_c (T_air − T_out)' },
          { label: 'Heat flow, method 2', value: GFC.fixed(h2, 2), unit: 'W m⁻²', note: '(A_c/A_s) U*_c (T*_air − T*_out)' },
          { label: 'Heat flow with the cover wet', value: GFC.fixed(h2w, 2), unit: 'W m⁻²', note: wet ? '+14 % for condensate' : 'Would be +14 % if condensing' },
          { label: 'Linearised radiative coefficient at 20 °C', value: GFC.fixed(alphaR20, 2), unit: 'W m⁻² K⁻¹', note: '4σT³; the 6 W m⁻² K⁻¹ rule of thumb' }
        ],
        caption: 'The three resistances in series. In a greenhouse the glazing is the thin slice; '
               + 'the two boundary layers carry the loss, which is why wind and sky temperature '
               + 'matter more than the material.',
        _v: { rI: rI2, rC: rC, rE: rE2, u1: u1, u2: u2 }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var tot = st.rI + st.rC + st.rE;
      var W = 640, H = 230, L = 24, T = 40, PW = W - 48, BH = 54;
      var g = S.open(W, H, 'The three thermal resistances in series');
      var parts = [
        { label: 'inside boundary layer', v: st.rI, colour: pal.series[0] },
        { label: 'glazing', v: st.rC, colour: pal.series[2] },
        { label: 'outside boundary layer', v: st.rE, colour: pal.series[1] }
      ];
      var x = L;
      parts.forEach(function (p) {
        var w = PW * p.v / tot;
        g += S.rect(x, T, w, BH, p.colour);
        if (w > 44) {
          g += S.text(x + w / 2, T + BH / 2 + 4, GFC.pct(p.v / tot, 0),
            { size: 12, anchor: 'middle', fill: '#fff', weight: 600 });
        }
        x += w;
      });
      g += S.text(L, T - 12, 'Share of the total thermal resistance', { size: 11.5, fill: pal.soft });
      /* labels below, so nothing sits on top of the bar */
      var lx = L;
      parts.forEach(function (p, i) {
        var w = PW * p.v / tot;
        var cx = lx + w / 2;
        g += S.line(cx, T + BH, cx, T + BH + 10 + i * 14, pal.line, 1);
        g += S.text(cx, T + BH + 23 + i * 14, p.label + '  ' + GFC.fixed(p.v, 4) + ' m² K W⁻¹',
          { size: 10.5, anchor: 'middle', fill: pal.soft });
        lx += w;
      });
      g += S.text(L, H - 10, 'U-value: ' + GFC.fixed(st.u1, 2) + ' against air-to-air, '
        + GFC.fixed(st.u2, 2) + ' against the radiation-weighted difference',
        { size: 11, fill: pal.ink });
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Method 1, closest to the building-physics definition, with the radiative '
            + 'coefficients temperature-corrected because radiant energy is exchanged with '
            + 'surrounding objects and not with air:',
        math: 'U<sub>c</sub> = [ 1/(α<sub>ci</sub> + α*<sub>Ri</sub>) + d<sub>c</sub>/λ<sub>c</sub> '
            + '+ 1/(α<sub>ce</sub> + α*<sub>Re</sub>) ]<sup>−1</sup>',
        note: 'α*<sub>Ri</sub> = α<sub>Ri</sub>(T<sub>Rin</sub> − T<sub>iS</sub>)/(T<sub>air</sub> − T<sub>iS</sub>) '
            + 'and α*<sub>Re</sub> = α<sub>Re</sub>(T<sub>eS</sub> − T<sub>Rout</sub>)/(T<sub>eS</sub> − T<sub>out</sub>).' },
      { lead: 'Method 2 eliminates the surface temperatures by equating the three series flows, '
            + 'and the price is that the driving temperatures become weighted averages:',
        math: 'H = U*<sub>c</sub>(T*<sub>air</sub> − T*<sub>out</sub>), &nbsp;&nbsp; '
            + 'U*<sub>c</sub> = [ 1/(α<sub>ci</sub>+α<sub>Ri</sub>) + d/λ + 1/(α<sub>ce</sub>+α<sub>Re</sub>) ]<sup>−1</sup>',
        note: 'For single glass at 4 m s⁻¹ wind the two give 9.26 and 6.83 W m⁻² K⁻¹ and the same '
            + '111 W m⁻² of heat flow. That is the whole reason published U-values disagree so '
            + 'widely: the same physical loss is a different coefficient depending only on which '
            + 'temperature difference it is defined against.' },
      { lead: 'The linearised radiative coefficient behind the rule of thumb:',
        math: 'α<sub>R</sub> = 4σT<sub>mean</sub>³ &nbsp; (4.13 at −10 °C, 7.0 at 40 °C)',
        note: 'Net radiative exchange between two bodies at terrestrial temperatures is about '
            + '6 W m⁻² per kelvin of difference.' }
    ],

    caveats: [
      'This is the cover coefficient, per m² of cover. Converting it to a floor basis needs the '
        + 'cover-to-floor area ratio and the infiltration term, which the heating capacity '
        + 'calculator adds.',
      'Emissivity is a property of the surface, so anything wet has an emissivity near 1 whatever '
        + 'its dry value. A condensing cover is both warmer and more emissive than a dry one.',
      'Convective coefficients here are entered rather than derived. They depend on wind speed, '
        + 'surface orientation and internal air movement, and the empirical correlations for them '
        + 'disagree with each other by more than the effect of changing glazing material.'
    ],

    sources: ['stanghellini2019', 'bakker2001', 'monteith2013', 'vanthoor2011', 'ep406'],
    provenance: 'Sections 7.4, 8.1 and 8.2 of "Greenhouse parameters and equations". The defaults '
              + 'are that section’s worked cross-check, which gives 9.26 and 6.83 W m⁻² K⁻¹ and '
              + '111 W m⁻² by both methods.'
  });
}());

