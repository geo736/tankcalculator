
(function () {
  'use strict';
  var S = GFC.svgns;
  var SIGMA = 5.670374419e-8;

  GFC.mount({
    slug: 'longwave-sky',
    kicker: 'Greenhouse climate',
    name: 'Sky temperature and long-wave loss',
    lede: 'A cover radiates to the sky, not to the outside air, and the drier the air the colder '
        + 'the apparent sky. This is the entire argument for infrared-blocking film, aluminium '
        + 'screens and closing screens on clear nights.',
    inputNote: 'Both clear-sky relations are given. They disagree, and where a pyrgeometer '
             + 'measurement exists it is worth more than either.',

    inputs: [
      { id: 'tair', label: 'Outside air temperature', unit: '°C', value: 5, step: 0.5, min: -40, max: 45 },
      { id: 'rh', label: 'Outside relative humidity', unit: '%', value: 60, step: 1, min: 5, max: 100,
        help: 'Enters the Brunt form through vapour pressure. Dry air is more transparent to thermal infrared, so the apparent sky is colder.' },
      { id: 'cloud', label: 'Cloud cover', unit: '–', value: 0, step: 0.1, min: 0, max: 1,
        help: 'Cloud raises the effective sky temperature towards air temperature. Several empirical corrections exist and they disagree with each other by more than the effect they describe, so this uses a simple linear interpolation and says so.' },
      { id: 'tcover', label: 'Cover surface temperature', unit: '°C', value: 12, step: 0.5, min: -40, max: 60,
        group: 'The cover' },
      { id: 'emiss', label: 'Cover emissivity', unit: '–', value: 0.90, step: 0.01, min: 0.1, max: 1,
        help: 'Most construction materials exceed 0.9. An infrared-blocking film is specified to be low here; anything wet has an emissivity near 1 whatever its dry value.' },
      { id: 'view', label: 'View factor to the sky', unit: '–', value: 0.5, step: 0.05, min: 0.1, max: 1,
        help: 'For a greenhouse in an open field the sky is half the horizon.' }
    ],

    compute: function (v) {
      var tAir = GFC.need(v.tair, 'Outside air temperature');
      var rh = GFC.need(v.rh, 'Outside relative humidity', { min: 5, max: 100 }) / 100;
      var cloud = GFC.need(v.cloud, 'Cloud cover', { min: 0, max: 1 });
      var tCover = GFC.need(v.tcover, 'Cover surface temperature');
      var emiss = GFC.need(v.emiss, 'Cover emissivity', { positive: true, max: 1 });
      var view = GFC.need(v.view, 'View factor to the sky', { positive: true, max: 1 });

      var tAirK = tAir + 273.15;
      var e_hPa = rh * PSY.eSat(tAir) * 10;        /* kPa to hPa */

      var tSkySwin = 0.0552 * Math.pow(tAirK, 1.5);
      var epsSky = 0.605 + 0.048 * Math.sqrt(e_hPa);
      var tSkyBrunt = Math.pow(epsSky, 0.25) * tAirK;

      /* Cloud raises the effective sky towards air temperature. Stated as the
       * simple interpolation it is, because the published corrections disagree
       * by more than the effect. */
      var clearK = tSkyBrunt;
      var tSkyK = clearK + cloud * (tAirK - clearK);
      var tSky = tSkyK - 273.15;

      var tCoverK = tCover + 273.15;
      var alphaR = 4 * SIGMA * Math.pow((tCoverK + tSkyK) / 2, 3);
      var netLin = emiss * view * alphaR * (tCover - tSky);
      var netExact = emiss * view * SIGMA * (Math.pow(tCoverK, 4) - Math.pow(tSkyK, 4));
      var depression = tAir - tSky;

      var flags = [];
      flags.push({ head: 'Sky depression ' + GFC.fixed(depression, 1) + ' K below the air.',
        text: 'On a clear cold night the difference between a greenhouse and the upper atmosphere can easily reach 50 K, so radiative loss alone can be about 150 W m⁻²: 6 W m⁻² K⁻¹ × 50 K × a half-sky view factor.' });
      if (cloud >= 0.9) flags.push({ head: 'Overcast.',
        text: 'The sky approaches air temperature and the radiative loss nearly disappears, which is why a cloudy windy night is warmer inside a greenhouse than a clear calm one at the same air temperature.' });
      if (Math.abs(tSkySwin - tSkyBrunt) > 3) flags.push({ head: 'The two clear-sky relations differ by ' + GFC.fixed(Math.abs(tSkySwin - tSkyBrunt), 1) + ' K.',
        text: 'Swinbank carries no humidity term and Brunt does. Where a station reports apparent sky temperature from a pyrgeometer, use that instead of either.' });
      if (emiss < 0.4) flags.push({ head: 'Low-emissivity cover.',
        text: 'At ' + GFC.fixed(emiss, 2) + ' the long-wave loss is ' + GFC.pct(1 - emiss / 0.9, 0) + ' below a standard 0.90 surface. Simulation plus the night energy balance predicts about 6.5 °C of night-time gain from a high-reflectance low-emissivity cover over standard polyethylene.' });
      if (tCover < tSky) flags.push({ head: 'Cover colder than the sky.',
        text: 'The net exchange is into the cover rather than out of it. That is possible under heavy cloud and worth checking before using the number.' });

      return {
        headline: [
          { label: 'Apparent sky temperature', value: GFC.fixed(tSky, 1), unit: '°C',
            hint: GFC.fixed(depression, 1) + ' K below the air' },
          { label: 'Long-wave loss', value: GFC.fixed(netLin, 0), unit: 'W m⁻²',
            hint: 'Linearised, at this view factor' },
          { label: 'Sky emissivity', value: GFC.fixed(epsSky, 3), unit: '–',
            hint: 'Brunt form, from vapour pressure' },
          { label: 'Radiative coefficient', value: GFC.fixed(alphaR, 2), unit: 'W m⁻² K⁻¹',
            hint: '4σT³, the 6 W m⁻² K⁻¹ rule' }
        ],
        flags: flags,
        rows: [
          { label: 'Vapour pressure', value: GFC.fixed(e_hPa, 2), unit: 'hPa', note: 'From air temperature and RH' },
          { label: 'Sky temperature, Swinbank', value: GFC.fixed(tSkySwin - 273.15, 2), unit: '°C', note: '0.0552 T_air^1.5, in kelvin; no humidity term' },
          { label: 'Clear-sky emissivity, Brunt', value: GFC.fixed(epsSky, 4), unit: '–', note: '0.605 + 0.048 √e, e in hPa' },
          { label: 'Sky temperature, Brunt', value: GFC.fixed(tSkyBrunt - 273.15, 2), unit: '°C', note: 'ε^¼ T_air' },
          { label: 'Sky temperature with cloud', value: GFC.fixed(tSky, 2), unit: '°C', note: 'Linear interpolation towards air temperature' },
          { label: 'Sky depression below air', value: GFC.fixed(depression, 2), unit: 'K', note: 'The quantity the loss is driven by' },
          { label: 'Linearised coefficient α_R', value: GFC.fixed(alphaR, 3), unit: 'W m⁻² K⁻¹', note: '4σT_mean³' },
          { label: 'Net long-wave loss, linearised', value: GFC.fixed(netLin, 2), unit: 'W m⁻²', note: 'ε F α_R (T_cover − T_sky)' },
          { label: 'Net long-wave loss, fourth power', value: GFC.fixed(netExact, 2), unit: 'W m⁻²', note: 'ε F σ (T_cover⁴ − T_sky⁴)' },
          { label: 'Difference between the two forms', value: GFC.pct(Math.abs(netExact - netLin) / Math.max(Math.abs(netExact), 1e-9), 1), unit: '', note: 'The linearisation is adequate for small differences' },
          { label: 'Wien peak wavelength at cover temperature', value: GFC.fixed(2.9e6 / tCoverK, 0), unit: 'nm', note: '2.9 × 10⁶ / T; the thermal infrared, 6 to 20 µm' }
        ],
        caption: 'Long-wave loss against cloud cover, at this air temperature and humidity. The '
               + 'loss falls away as the sky closes, which is why screens are closed on clear '
               + 'nights and not on cloudy ones.',
        _v: { tAirK: tAirK, clearK: clearK, tCover: tCover, emiss: emiss, view: view,
              cloud: cloud, netLin: netLin }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 330, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;

      var lossAt = function (c) {
        var tSkyK = st.clearK + c * (st.tAirK - st.clearK);
        var tCoverK = st.tCover + 273.15;
        var aR = 4 * 5.670374419e-8 * Math.pow((tCoverK + tSkyK) / 2, 3);
        return st.emiss * st.view * aR * (st.tCover - (tSkyK - 273.15));
      };

      var nc = S.nice(Math.min(0, lossAt(1)), Math.max(lossAt(0), lossAt(1)), 4);
      var sx = S.scale(0, 1, L, L + PW);
      var sy = S.scale(nc.min, nc.max, T + PH, T);

      var g = S.open(W, H, 'Long-wave loss against cloud cover');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: 1, yMin: nc.min, yMax: nc.max,
        xTicks: 10, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 1); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Cloud cover (0 clear, 1 overcast)',
        yLabel: 'Net long-wave loss (W m⁻²)'
      });

      var d = '', c, first = true;
      for (c = 0; c <= 1.0001; c += 0.01) {
        d += (first ? 'M' : 'L') + sx(c).toFixed(1) + ' ' + sy(Math.max(nc.min, Math.min(nc.max, lossAt(c)))).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      var px = sx(st.cloud), py = sy(Math.max(nc.min, Math.min(nc.max, st.netLin)));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py - 8, GFC.fixed(st.netLin, 0) + ' W m⁻²',
        { size: 11, fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'loss at this cover temperature and emissivity', colour: pal.accent, dash: null }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Swinbank’s clear-sky relation, temperatures in kelvin:',
        math: 'T<sub>sky</sub> = 0.0552 T<sub>air</sub><sup>1.5</sup>',
        note: 'Carries no humidity term, which is its weakness and its convenience.' },
      { lead: 'The Brunt form, through a clear-sky emissivity, with vapour pressure in hPa:',
        math: 'ε<sub>sky</sub> = 0.605 + 0.048 √e<sub>a</sub>, &nbsp;&nbsp; '
            + 'T<sub>sky</sub> = ε<sub>sky</sub><sup>¼</sup> T<sub>air</sub>',
        note: 'The drier the air the more transparent the atmosphere is to thermal infrared, and '
            + 'the colder the apparent sky temperature.' },
      { lead: 'Net exchange between a surface and everything it sees, and its linearisation:',
        math: 'Net = σ Σ F<sub>i</sub> (T<sub>s</sub>⁴ − T<sub>i</sub>⁴) ≈ α<sub>R</sub>(T<sub>s</sub> − T̄), '
            + '&nbsp;&nbsp; α<sub>R</sub> = 4σT<sub>mean</sub>³',
        note: 'α_R runs 4.13 at −10 °C to 7.0 at 40 °C, so about 6 W m⁻² per kelvin is a rule of '
            + 'thumb good enough to check any radiative term in seconds.' },
      { lead: 'Wien’s law, for where the energy actually sits:',
        math: 'λ<sub>max</sub> ≈ 2.9 × 10⁶ / T &nbsp; nm',
        note: 'The sun at about 6 000 K emits 300 to 2 500 nm; bodies at terrestrial temperatures '
            + 'emit 6 to 20 µm, which is the band a cover has to block to keep heat in.' }
    ],

    caveats: [
      'The cloud correction here is a linear interpolation towards air temperature, stated as such '
        + 'because the published empirical corrections disagree with each other by more than the '
        + 'effect they describe. A measured value is worth more than any of them, and some '
        + 'stations report apparent sky temperature from a pyrgeometer directly.',
      'Emissivity is a property of the surface, so a wet cover radiates almost as a black body '
        + 'whatever its dry specification. An infrared-blocking film that condenses loses much of '
        + 'its advantage.',
      'The view factor of 0.5 is for a house in an open field. Surrounding buildings, a second '
        + 'greenhouse or a hillside all reduce it, and they radiate back at close to air '
        + 'temperature rather than at sky temperature.'
    ],

    sources: ['swinbank1963', 'monteith2013', 'vanthoor2011', 'stanghellini2019'],
    provenance: 'Sections 8.1, 8.2 and 8.3 of "Greenhouse parameters and equations".'
  });
}());

