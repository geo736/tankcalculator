/* Crop transpiration and the greenhouse vapour balance.
 *
 * Transcribed from dehumid/loads.py in the hot-humid dehumidification model,
 * which transcribes sections 5.2, 10 and 11 of "Greenhouse parameters and
 * equations". Three pages share this file so they cannot drift apart, and so
 * one comparison against the Python verifies all of them.
 *
 * The structure is that vapour leaves a greenhouse by exactly two natural
 * routes, through the openings or by condensing on a surface below the dew
 * point, and that active dehumidification is a third exit bought when the
 * first two cannot carry the crop's output:
 *
 *     E = V + C + D
 */
(function (root) {
  'use strict';

  var P = root.PSY;
  var C = {};

  /* Compendium 10.3, parameter table: r_s,min and r_b in s m-1, LAI dimensionless. */
  C.CROPS = {
    tomato:   { label: 'Tomato',   r_s_min: 200, r_b: 200, lai: 3.0, jarvis_a: 0.4 },
    pepper:   { label: 'Pepper',   r_s_min: 200, r_b: 300, lai: 4.0, jarvis_a: 0.4 },
    cucumber: { label: 'Cucumber', r_s_min: 100, r_b: 400, lai: 5.0, jarvis_a: 0.4 },
    eggplant: { label: 'Eggplant', r_s_min: 100, r_b: 350, lai: 4.0, jarvis_a: 0.4 }
  };

  C.R_N_ABSORPTION = 0.86;   /* compendium 5.2, lumped short- and long-wave coefficient */
  C.K_EXTINCTION = 0.70;     /* the radiation form of 5.2, NOT the 0.64 of 10.4 */
  C.R_S_NIGHT = 1000;        /* stomata closed at night, s m-1 */

  /* The Jarvis temperature factor was fitted with air temperature almost always
   * below 25 C and behaves pathologically outside that envelope: at 26 C the
   * factor is already 9.3 and at 30 C it is 24. It is held at the edge of the
   * calibration range and the extrapolation is reported rather than performed. */
  C.JARVIS_T_MAX = 25.0;

  C.jarvisExtrapolation = function (tAir) {
    return Math.max(0, tAir - C.JARVIS_T_MAX);
  };

  /* Jarvis-type stomatal resistance, s m-1 (compendium 10.3).
   *
   * Two guards the published form needs and does not carry: a floor at the
   * crop's minimum stomatal resistance, because the bare expression can return
   * a conductance the plant does not have, and a cap on the temperature factor
   * at the edge of its calibration range. */
  C.stomatalResistance = function (iGlobal, tAir, lai, rsMin, jarvisA, night) {
    rsMin = rsMin === undefined ? 200 : rsMin;
    jarvisA = jarvisA === undefined ? 0.4 : jarvisA;
    if (night || iGlobal <= 1.0) return Math.max(C.R_S_NIGHT, rsMin);
    var rad = 1 + 6.95 * Math.exp(-jarvisA * iGlobal / Math.max(lai, 0.1));
    var tEff = Math.min(tAir, C.JARVIS_T_MAX);
    var temp = 1 + 0.23 * Math.pow(tEff - 20, 2);
    return Math.max(rsMin, 82 * rad * temp);
  };

  /* Net radiation absorbed by the canopy, W m-2 (compendium 5.2):
   *   R_n = 0.86 (1 - exp(-0.7 LAI)) tau I_sun
   * The 0.86 lumps the short- and long-wave absorption coefficients onto the
   * solar term. */
  C.netRadiation = function (iGlobal, tauGh, lai, k, absorption) {
    k = k === undefined ? C.K_EXTINCTION : k;
    absorption = absorption === undefined ? C.R_N_ABSORPTION : absorption;
    return absorption * tauGh * iGlobal * (1 - Math.exp(-k * lai));
  };

  /* g_E, m s-1 (compendium 10.2) */
  C.cropConductance = function (lai, rb, rs, tAir) {
    return 2 * lai / ((1 + P.epsS(tAir)) * rb + rs);
  };

  /* chi_crop, kg m-3: the virtual vapour concentration the canopy behaves as
   * though it holds, saturated at air temperature and raised by the radiation
   * the leaves must shed. */
  C.cropVapourSource = function (tAir, rb, lai, rn) {
    return P.chiSat(tAir) + P.epsS(tAir) * (rb / (2 * lai)) * (rn / P.L);
  };

  /* Crop transpiration E, kg m-2 s-1 (compendium 10.2 big-leaf model).
   * E is driven by chi_crop - chi_air, so it RISES as the air is dried: drying
   * the air makes more water to dry. */
  C.transpiration = function (tAir, chiAir, iGlobal, crop, tauGh, night) {
    var c = C.CROPS[crop] || C.CROPS.tomato;
    tauGh = tauGh === undefined ? 0.60 : tauGh;
    var rn = C.netRadiation(iGlobal, tauGh, c.lai);
    var rs = C.stomatalResistance(iGlobal, tAir, c.lai, c.r_s_min, c.jarvis_a, night);
    var ge = C.cropConductance(c.lai, c.r_b, rs, tAir);
    var chiCrop = C.cropVapourSource(tAir, c.r_b, c.lai, rn);
    return {
      E: Math.max(0, ge * (chiCrop - chiAir)),
      g_E: ge, chi_crop: chiCrop, r_s: rs, R_n: rn, lai: c.lai, r_b: c.r_b
    };
  };

  /* g_V, m s-1, from air changes per hour and mean height (compendium 9.1) */
  C.ventilationConductance = function (ach, meanHeight) {
    return ach * meanHeight / 3600;
  };

  /* Inner cover-surface temperature, C (compendium 11.3):
   *   T_air - T_iS = (R_i / R_o)(T_air - T_out)
   * sky_depression is an extra depression from radiative loss to a cold sky,
   * which the conduction form does not carry. */
  C.coverInnerTemperature = function (tAir, tOut, rInner, rCover, rOuter, skyDepression) {
    rInner = rInner === undefined ? 0.10 : rInner;
    rCover = rCover === undefined ? 0.005 : rCover;
    rOuter = rOuter === undefined ? 0.05 : rOuter;
    skyDepression = skyDepression || 0;
    var rTotal = rInner + rCover + rOuter;
    return tAir - (rInner / rTotal) * (tAir - tOut) - skyDepression;
  };

  /* g_C, m s-1 (compendium 11.4), on virtual temperatures approximated by dry bulb:
   *   g_C = (A_cover/A_soil) 1.64e-3 (T_a - T_cover)^(1/3) */
  C.condensationConductance = function (tAir, tCover, areaRatio) {
    areaRatio = areaRatio === undefined ? 1.4 : areaRatio;
    var dt = tAir - tCover;
    if (dt <= 0) return 0;
    return areaRatio * 1.64e-3 * Math.pow(dt, 1 / 3);
  };

  /* The master equation, compendium 11.2. Greenhouse humidity is a
   * conductance-weighted average of three sources: what the crop pushes out,
   * what is outside, and saturation at the coldest surface. */
  C.equilibriumHumidity = function (chiCrop, chiOut, chiCoverSat, gE, gV, gC) {
    var total = gE + gV + gC;
    if (total <= 0) return chiCrop;
    return (gE * chiCrop + gV * chiOut + gC * chiCoverSat) / total;
  };

  /* Solve the free-running house: air humidity and transpiration are mutually
   * dependent through chi_air, so iterate the pair to a fixed point. */
  C.freeRunning = function (o) {
    var chiOut = P.chi(o.tOut, o.rhOut);
    var tCover = C.coverInnerTemperature(o.tIn, o.tOut, o.rInner, o.rCover, o.rOuter, o.skyDepression);
    var chiCoverSat = P.chiSat(tCover);
    var gV = C.ventilationConductance(o.ach, o.height);
    var gC = C.condensationConductance(o.tIn, tCover, o.areaRatio);
    var chiSatIn = P.chiSat(o.tIn);
    var chiAir = Math.max(chiOut, P.chi(o.tIn, 0.70));
    var tr = null, i, gCeff = 0;
    for (i = 0; i < 200; i++) {
      tr = C.transpiration(o.tIn, chiAir, o.iGlobal, o.crop, o.tauGh, o.night);
      /* Condensation is a sink only while the air is wetter than saturation at
       * the cover. A cover above the air's dew point carries no condensate, so
       * it is neither a sink nor a source and g_C must leave the equation
       * entirely; leaving it in makes a dry cover evaporate water it does not
       * have and pushes the free-running humidity up. */
      gCeff = chiAir > chiCoverSat ? gC : 0;
      var next = C.equilibriumHumidity(tr.chi_crop, chiOut, chiCoverSat, tr.g_E, gV, gCeff);
      next = Math.min(next, chiSatIn);             /* cannot exceed saturation */
      if (Math.abs(next - chiAir) < 1e-15) { chiAir = next; break; }
      chiAir = chiAir + 0.5 * (next - chiAir);     /* damped, so it cannot oscillate */
    }
    tr = C.transpiration(o.tIn, chiAir, o.iGlobal, o.crop, o.tauGh, o.night);
    gCeff = chiAir > chiCoverSat ? gC : 0;
    return {
      chi_air: chiAir,
      rh: P.rhFromChi(o.tIn, chiAir),
      t_cover: tCover,
      chi_out: chiOut,
      chi_cover_sat: chiCoverSat,
      g_V: gV, g_C: gC, g_C_effective: gCeff, g_E: tr.g_E,
      E: tr.E, chi_crop: tr.chi_crop, r_s: tr.r_s, R_n: tr.R_n,
      V: gV * (chiAir - chiOut),
      C: gCeff * Math.max(0, chiAir - chiCoverSat),
      saturated: chiAir >= chiSatIn - 1e-15,
      iterations: i
    };
  };

  root.CROP = C;
}(typeof window !== 'undefined' ? window : globalThis));

