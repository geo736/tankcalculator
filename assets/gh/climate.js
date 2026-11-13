/* Decoder and helpers for the bundled hourly climate.
 *
 * The data file holds delta-coded zigzag varints in base 36. One decode per
 * series per page load is enough, so results are cached.
 */
(function (root) {
  'use strict';

  var DATA = root.CLIMATE_DATA || {};
  var C = { data: DATA };
  var cache = {};

  function decode(s) {
    var out = [], prev = 0, parts = s.split(','), i, z, d;
    for (i = 0; i < parts.length; i++) {
      z = parseInt(parts[i], 36);
      d = (z & 1) ? -((z + 1) >> 1) : (z >> 1);
      prev += d;
      out.push(prev);
    }
    return out;
  }

  C.sites = function () {
    return Object.keys(DATA).map(function (k) {
      return { key: k, label: DATA[k].label, koppen: DATA[k].koppen, n: DATA[k].n };
    });
  };

  C.site = function (key) { return DATA[key] || null; };

  /* which: "t" degrees C, "rh" fraction 0-1, "ghi" W m-2 */
  C.series = function (key, which) {
    var ck = key + '/' + which;
    if (cache[ck]) return cache[ck];
    var site = DATA[key];
    if (!site || !site[which]) return null;
    var raw = decode(site[which]);
    var scale = which === 't' ? 0.1 : which === 'rh' ? 0.001 : 1;
    var out = scale === 1 ? raw : raw.map(function (q) { return q * scale; });
    cache[ck] = out;
    return out;
  };

  /* Heating degree-days on a stated base, from the hourly series, so a
   * degree-day estimate and a duration curve for the same site cannot
   * disagree about the climate. */
  C.degreeDays = function (key, base, sign) {
    var t = C.series(key, 't');
    if (!t) return null;
    var sum = 0, i, d;
    for (i = 0; i < t.length; i++) {
      d = sign === 'cooling' ? t[i] - base : base - t[i];
      if (d > 0) sum += d;
    }
    return sum / 24;
  };

  root.CLIMATE = C;
}(typeof window !== 'undefined' ? window : globalThis));

