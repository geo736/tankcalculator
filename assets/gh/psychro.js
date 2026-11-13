/* Psychrometrics for the greenhouse calculators.
 *
 * Transcribed from dehumid/psychro.py in the hot-humid dehumidification model,
 * which in turn transcribes section 2 of "Greenhouse parameters and equations".
 * The compendium carries the citations; the keys in cites.js match them.
 *
 * Saturation vapour pressure has three forms here and they are not
 * interchangeable. FAO-56 is the default because anything feeding a
 * Penman-Monteith calculation needs e*, Delta and gamma mutually consistent.
 */
(function (root) {
  'use strict';

  var P = {
    RHO: 1.2,        // moist air density at greenhouse conditions, kg m-3
    CP: 1006.0,      // specific heat of air, J kg-1 K-1
    L: 2.45e6,       // latent heat of vaporisation at 20 C, J kg-1
    M_W: 0.018016,   // molar mass of water, kg mol-1
    R_GAS: 8.3145,   // universal gas constant, J mol-1 K-1
    P_STD: 101.3,    // standard atmospheric pressure, kPa
    EPS_M: 0.622,    // ratio of molar masses, water to dry air
    M_CO2: 44.01     // molar mass of CO2, kg kmol-1
  };

  /* 2.1 saturation vapour pressure, kPa */
  P.eSat = function (t) { return 0.6108 * Math.exp(17.27 * t / (t + 237.3)); };

  P.eSatBuck = function (t) {
    return 0.61121 * Math.exp(((18.678 - t / 234.5) * t) / (257.14 + t));
  };

  P.eSatMagnus = function (t) {
    if (t < 0) return Math.pow(10, 2.7857 + 9.5 * t / (265.5 + t)) / 1000;
    return Math.pow(10, 2.7857 + 7.5 * t / (237.3 + t)) / 1000;
  };

  /* 2.2 slope of the saturation curve */
  P.delta = function (t) { return 4098 * P.eSat(t) / Math.pow(t + 237.3, 2); };
  P.chiPrime = function (t) { return 0.36 * Math.exp(0.05 * t); };   // g m-3 K-1
  P.epsS = function (t) { return 0.7156 * Math.exp(0.0533 * t); };   // dimensionless

  /* 2.3 psychrometric constant and the psychrometric equation */
  P.pressureAt = function (alt) {
    return P.P_STD * Math.pow((293 - 0.0065 * alt) / 293, 5.26);
  };
  P.gamma = function (pkpa) {
    return 0.665e-3 * (pkpa === undefined ? P.P_STD : pkpa);
  };

  /* Wet bulb by bisection on e = e*(Twb) - gamma (Tdb - Twb).
   * The wet-bulb depression is the whole cooling resource of an evaporative
   * system, so this is the number that decides whether a pad wall is worth
   * installing at all. */
  P.wetBulb = function (t, rh, pkpa) {
    var e = rh * P.eSat(t), g = P.gamma(pkpa);
    var resid = function (twb) { return P.eSat(twb) - g * (t - twb) - e; };
    var lo = -40, hi = t, mid, i;
    if (resid(hi) < 0) return t;
    for (i = 0; i < 200; i++) {
      mid = 0.5 * (lo + hi);
      if (resid(mid) > 0) hi = mid; else lo = mid;
    }
    return 0.5 * (lo + hi);
  };

  /* 2.4 humidity measures. chi is kg m-3; a greenhouse is a volume, so the
   * vapour balance of section 11 is written on concentration. */
  P.chi = function (t, rh) {
    var ePa = rh * P.eSat(t) * 1000;
    return P.M_W * ePa / (P.R_GAS * (t + 273.15));
  };
  P.chiSat = function (t) { return P.chi(t, 1.0); };
  P.chiFromE = function (ekpa, t) {
    return P.M_W * ekpa * 1000 / (P.R_GAS * (t + 273.15));
  };
  P.humidityRatio = function (t, rh, pkpa) {
    var p = pkpa === undefined ? P.P_STD : pkpa, e = rh * P.eSat(t);
    return P.EPS_M * e / (p - e);
  };
  P.rhFromChi = function (t, chi) {
    var ePa = chi * P.R_GAS * (t + 273.15) / P.M_W;
    return (ePa / 1000) / P.eSat(t);
  };
  P.rhoDryAir = function (t, rh, pkpa) {
    var p = pkpa === undefined ? P.P_STD : pkpa, x = P.humidityRatio(t, rh, p);
    return p * 1000 * P.M_W / (P.R_GAS * (t + 273.15) * (0.6222 + x));
  };

  /* VPD at AIR temperature. Not the driving force for transpiration: that is
   * chi_crop - chi_a, and canopy temperature differs from air temperature by
   * up to 2 K in steady state. This is for stating crop targets. */
  P.vpd = function (t, rh) { return P.eSat(t) * (1 - rh); };

  /* 2.5 enthalpy, kJ per kg dry air, zero at dry air 0 C */
  P.enthalpy = function (t, rh, pkpa) {
    var x = P.humidityRatio(t, rh, pkpa);
    return 1.006 * t + x * (2500 + 1.805 * t);
  };

  /* 2.7 dew point and the condensation criterion */
  P.dewPoint = function (t, rh) {
    var e = rh * P.eSat(t);
    if (e <= 0) return -Infinity;
    var ln = Math.log(e / 0.6108);
    return 237.3 * ln / (17.27 - ln);
  };
  P.dewPointFromE = function (ekpa) {
    if (ekpa <= 0) return -Infinity;
    var ln = Math.log(ekpa / 0.6108);
    return 237.3 * ln / (17.27 - ln);
  };
  /* Dew-point depression, not RH, is what decides condensation on the crop,
   * and in warm humid conditions a less-ventilated house can hold a LARGER
   * depression than a ventilated one (compendium 11.5). */
  P.dewPointDepression = function (t, rh) { return t - P.dewPoint(t, rh); };
  P.condensesOn = function (tSurface, tAir, rh) {
    return tSurface < P.dewPoint(tAir, rh);
  };

  /* 9.1 air exchange unit conversion. Getting this wrong by the factor h is a
   * common and large error: h runs 3 m in a low tunnel to 7 m in a Venlo. */
  P.gvFromAch = function (ach, meanHeight) { return ach * meanHeight / 3600; };
  P.achFromGv = function (gv, meanHeight) { return gv * 3600 / meanHeight; };

  root.PSY = P;
}(typeof window !== 'undefined' ? window : globalThis));

