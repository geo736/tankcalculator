
(function () {
  'use strict';
  var S = GFC.svgns;
  var R = 8.3145;        /* J mol-1 K-1 */
  var M_CO2 = 44.01;     /* g mol-1 */

  GFC.mount({
    slug: 'co2-enrichment',
    kicker: 'Greenhouse climate',
    name: 'CO₂ enrichment rate, cost and buffer',
    lede: 'The same air exchange that removes sensible heat and water vapour removes the injected '
        + 'carbon dioxide, which is why temperature control, humidity control and enrichment '
        + 'cannot be optimised independently. This works out what it costs to hold a set-point.',
    inputNote: 'Controllers are set in ppm and the mass balance is written on mg m⁻³. Every '
             + 'injection-rate calculation therefore carries a factor P/T, usually left at its '
             + '20 °C sea-level value.',

    inputs: [
      { id: 'target', label: 'Inside CO₂ set-point', unit: 'ppm', value: 1000, step: 25, min: 200, max: 2000 },
      { id: 'outside', label: 'Outside CO₂', unit: 'ppm', value: 420, step: 5, min: 300, max: 600 },
      { id: 'tair', label: 'Inside air temperature', unit: '°C', value: 20, step: 0.5, min: 0, max: 50,
        help: 'A cooling-dominated house at 35 to 45 °C needs 5 to 8 % less mass for the same ppm than the 20 °C conversion implies.' },
      { id: 'alt', label: 'Site elevation', unit: 'm', value: 0, step: 10, min: -400, max: 4000 },

      { id: 'ach', label: 'Air exchange rate', unit: 'h⁻¹', value: 0.33, step: 0.01, min: 0, max: 60,
        group: 'Losses',
        help: 'At a leakage rate of 2 m³ m⁻² h⁻¹ in a 6 m house this is 0.33 h⁻¹. Ventilation for temperature control raises it by one to two orders of magnitude, and the injection rate with it.' },
      { id: 'height', label: 'Mean internal height', unit: 'm', value: 6, step: 0.1, min: 1, max: 20 },
      { id: 'assim', label: 'Net crop assimilation', unit: 'g m⁻² h⁻¹', value: 3.8, step: 0.1, min: 0, max: 20,
        help: 'The same quantity as the growth rate in different units. A fully grown greenhouse crop takes up of order 3 to 5 g m⁻² h⁻¹ of CO₂ in good light.' },

      { id: 'area', label: 'Floor area', unit: 'm²', value: 10000, step: 100, min: 10, max: 500000, group: 'Scale and price' },
      { id: 'hours', label: 'Enriched hours per year', unit: 'h', value: 2500, step: 50, min: 1, max: 8760 },
      { id: 'price', label: 'CO₂ price', unit: 'currency per tonne', value: 90, step: 5, min: 0, max: 1000,
        help: 'Bottled or delivered liquid. Flue gas from an on-site boiler or engine is a different and usually much cheaper source, with its own conditions.' },

      { id: 'bufferh', label: 'Buffer hours to cover', unit: 'h', value: 6, step: 0.5, min: 0, max: 24,
        group: 'Decoupling CO₂ from heat',
        help: 'How long the injection has to run on stored supply when the heat the flue gas came with is not wanted.' }
    ],

    compute: function (v) {
      var target = GFC.need(v.target, 'Inside CO₂ set-point', { positive: true });
      var outside = GFC.need(v.outside, 'Outside CO₂', { positive: true });
      var tAir = GFC.need(v.tair, 'Inside air temperature');
      var alt = GFC.need(v.alt, 'Site elevation');
      var ach = GFC.need(v.ach, 'Air exchange rate', { min: 0 });
      var height = GFC.need(v.height, 'Mean internal height', { positive: true });
      var assim = GFC.need(v.assim, 'Net assimilation', { min: 0 });
      var area = GFC.need(v.area, 'Floor area', { positive: true });
      var hours = GFC.need(v.hours, 'Enriched hours', { positive: true, max: 8760 });
      var price = GFC.need(v.price, 'CO₂ price', { min: 0 });
      var bufferH = GFC.need(v.bufferh, 'Buffer hours', { min: 0 });

      if (target <= outside) throw new Error('The set-point must be above the outside concentration for there to be anything to inject.');

      var p = PSY.pressureAt(alt);                        /* kPa */
      var tK = tAir + 273.15;
      /* mg m-3 per ppm, by the ideal gas law */
      var perPpm = M_CO2 * p * 1000 / (R * tK) * 1e-6 * 1000;   /* mg m-3 per ppm */
      var cIn = target * perPpm;                          /* mg m-3 */
      var cOut = outside * perPpm;
      var dC = cIn - cOut;

      var gv = ach * height / 3600;                       /* m s-1 */
      var ventLoss_g_m2_h = gv * dC * 1e-3 * 3600;        /* mg m-3 × m s-1 → mg m-2 s-1 → g m-2 h-1 */
      var injection = ventLoss_g_m2_h + assim;            /* g m-2 h-1 */

      var kgPerHaPerH = injection * 10;                   /* g m-2 h-1 → kg ha-1 h-1 */
      var onceCharge = dC * height * 1e-3;                /* g m-2 to raise the whole volume once */
      var tonnesPerYear = injection * area * hours / 1e6;
      var costPerYear = tonnesPerYear * price;
      var bufferKg = injection * area * bufferH / 1000;
      /* Pure CO2 is 1.83 kg m-3 at 20 C and sea level; scale with the same P/T. */
      var pureKgPerM3 = M_CO2 * p * 1000 / (R * tK) / 1000;
      var bufferM3Gas = bufferKg / pureKgPerM3;

      /* How much the usual 20 C sea-level conversion would have over-stated it. */
      var perPpm20 = M_CO2 * 101.3 * 1000 / (R * 293.15) * 1e-6 * 1000;
      var massError = perPpm20 / perPpm - 1;

      var flags = [];
      if (Math.abs(massError) > 0.03) flags.push({ head: 'The standard conversion is ' + GFC.pct(Math.abs(massError), 1) + ' out here.',
        text: 'The 20 °C sea-level factor would ' + (massError > 0 ? 'over-state' : 'under-state') + ' the mass needed for this set-point. The same 1 000 ppm is 1.83 g m⁻³ at 20 °C, 1.67 at 40 °C and 1.63 at 1 000 m elevation.' });
      if (ach > 5) flags.push({ head: 'Ventilating at ' + GFC.fixed(ach, 1) + ' h⁻¹.',
        text: 'Enrichment against open vents is mostly paying to fertilise the outside air: ' + GFC.pct(ventLoss_g_m2_h / injection, 0) + ' of the injection is leaving through the openings.' });
      if (assim > 0 && ventLoss_g_m2_h / Math.max(assim, 1e-9) < 0.5) flags.push({ head: 'Assimilation-dominated.',
        text: 'The crop is taking up more than twice what the openings lose, so this hour is buying growth rather than replacing leakage.' });
      flags.push({ head: 'One air change costs ' + GFC.fixed(onceCharge, 1) + ' g m⁻².',
        text: 'That is what it takes to raise the whole volume from outside concentration to the set-point once, ' + GFC.fixed(onceCharge * 10, 0) + ' kg ha⁻¹. Holding the set-point is the recurring cost and this is the one-off.' });

      return {
        headline: [
          { label: 'Injection rate', value: GFC.fixed(injection, 2), unit: 'g m⁻² h⁻¹',
            hint: GFC.fixed(kgPerHaPerH, 0) + ' kg ha⁻¹ h⁻¹' },
          { label: 'Lost through the openings', value: GFC.fixed(ventLoss_g_m2_h, 2), unit: 'g m⁻² h⁻¹',
            hint: GFC.pct(ventLoss_g_m2_h / injection, 0) + ' of the injection' },
          { label: 'Annual CO₂', value: GFC.fixed(tonnesPerYear, 1), unit: 't y⁻¹',
            hint: GFC.fixed(costPerYear, 0) + ' per year at ' + GFC.fixed(price, 0) + ' per tonne' },
          { label: 'Buffer for ' + GFC.fixed(bufferH, 1) + ' h', value: GFC.fixed(bufferKg, 0), unit: 'kg',
            hint: GFC.fixed(bufferM3Gas, 0) + ' m³ as gas at these conditions' }
        ],
        flags: flags,
        rows: [
          { label: 'Atmospheric pressure', value: GFC.fixed(p, 2), unit: 'kPa', note: 'From elevation' },
          { label: 'Mass per ppm at these conditions', value: GFC.fixed(perPpm, 4), unit: 'mg m⁻³ per ppm', note: 'M P / R T' },
          { label: 'Mass per ppm at 20 °C, sea level', value: GFC.fixed(perPpm20, 4), unit: 'mg m⁻³ per ppm', note: 'The tabulated 1.83 g m⁻³ at 1 000 ppm' },
          { label: 'Error from using the tabulated value', value: GFC.pct(massError, 2), unit: '', note: 'Positive means it over-states the mass' },
          { label: 'Inside concentration', value: GFC.fixed(cIn, 0), unit: 'mg m⁻³', note: 'At the set-point' },
          { label: 'Outside concentration', value: GFC.fixed(cOut, 0), unit: 'mg m⁻³', note: 'Ambient' },
          { label: 'Concentration difference', value: GFC.fixed(dC, 0), unit: 'mg m⁻³', note: 'What the openings carry out' },
          { label: 'Specific air exchange g_V', value: GFC.sig(gv, 4), unit: 'm s⁻¹', note: 'N h / 3600' },
          { label: 'Ventilation loss', value: GFC.fixed(ventLoss_g_m2_h, 3), unit: 'g m⁻² h⁻¹', note: 'g_V × ΔC' },
          { label: 'Net crop assimilation', value: GFC.fixed(assim, 3), unit: 'g m⁻² h⁻¹', note: 'Entered; the growth rate in CO₂ units' },
          { label: 'Injection rate', value: GFC.fixed(injection, 3), unit: 'g m⁻² h⁻¹', note: 'I = V + A at steady state' },
          { label: 'Injection rate', value: GFC.fixed(kgPerHaPerH, 1), unit: 'kg ha⁻¹ h⁻¹', note: 'Same number, the unit growers use' },
          { label: 'Charge to raise the volume once', value: GFC.fixed(onceCharge, 2), unit: 'g m⁻²', note: 'ΔC × mean height' },
          { label: 'Annual CO₂ for the house', value: GFC.fixed(tonnesPerYear, 2), unit: 't y⁻¹', note: 'At ' + GFC.fixed(hours, 0) + ' enriched hours' },
          { label: 'Annual cost', value: GFC.fixed(costPerYear, 0), unit: 'currency y⁻¹', note: 'Gas only, no distribution' },
          { label: 'Buffer mass', value: GFC.fixed(bufferKg, 1), unit: 'kg', note: 'Injection × area × buffer hours' },
          { label: 'Buffer volume as gas', value: GFC.fixed(bufferM3Gas, 1), unit: 'm³', note: 'At ' + GFC.fixed(pureKgPerM3, 3) + ' kg m⁻³' },
          { label: 'Density of pure CO₂ here', value: GFC.fixed(pureKgPerM3, 4), unit: 'kg m⁻³', note: '1.83 at 20 °C and sea level' }
        ],
        caption: 'Injection rate against air exchange rate. The leakage term is linear in the '
               + 'exchange rate and the assimilation term is not, so the two cross and the '
               + 'balance of the cost changes completely between a closed house and a ventilating one.',
        _v: { gv: gv, dC: dC, assim: assim, ach: ach, height: height, injection: injection }
      };
    },

    draw: function (v, r, pal) {
      var st = r._v;
      var W = 640, H = 340, L = 66, T = 14, PW = W - L - 28, PH = H - T - 72;
      var achMax = Math.max(4, Math.ceil(st.ach * 1.5));

      var ventAt = function (n) { return (n * st.height / 3600) * st.dC * 1e-3 * 3600; };
      var nc = S.nice(0, ventAt(achMax) + st.assim, 4);
      var sx = S.scale(0, achMax, L, L + PW);
      var sy = S.scale(0, nc.max, T + PH, T);

      var g = S.open(W, H, 'Injection rate against air exchange rate');
      g += S.frame({
        left: L, top: T, w: PW, h: PH, xMin: 0, xMax: achMax, yMin: 0, yMax: nc.max,
        xTicks: 8, yTicks: nc.ticks, grid: pal.grid, axis: pal.axis, soft: pal.soft,
        xFmt: function (q) { return GFC.fixed(q, 1); },
        yFmt: function (q) { return GFC.fixed(q, 0); },
        xLabel: 'Air exchange rate (h⁻¹)',
        yLabel: 'CO₂ injection (g m⁻² h⁻¹)'
      });

      /* assimilation is flat; the total rises with the exchange rate */
      g += S.line(L, sy(Math.min(st.assim, nc.max)), L + PW, sy(Math.min(st.assim, nc.max)),
        pal.series[2], 2, '5 3');
      var d = '', n, first = true;
      for (n = 0; n <= achMax + 1e-9; n += achMax / 120) {
        d += (first ? 'M' : 'L') + sx(n).toFixed(1) + ' ' + sy(Math.min(ventAt(n) + st.assim, nc.max)).toFixed(1);
        first = false;
      }
      g += S.path(d, pal.accent, 2.4);

      var px = sx(Math.min(st.ach, achMax)), py = sy(Math.min(st.injection, nc.max));
      g += S.circle(px, py, 5, pal.accent);
      g += S.text(px + 9, py - 8, GFC.fixed(st.injection, 1) + ' g m⁻² h⁻¹',
        { size: 11, fill: pal.ink, weight: 600 });

      g += S.legend(L, H - 10, [
        { label: 'total injection', colour: pal.accent, dash: null },
        { label: 'crop assimilation alone', colour: pal.series[2], dash: '5 3' }
      ], pal.soft);
      g += S.close();
      return g;
    },

    math: [
      { lead: 'Only the volume and molecular bases are pressure- and temperature-independent. '
            + 'Everything mass-based carries the ideal gas law:',
        math: 'C [mg m⁻³] = c [ppm] × M<sub>CO₂</sub> P / (R T<sub>K</sub>) × 10⁻³',
        note: 'At 20 °C and 101.3 kPa, 1 ppm is 1.83 mg m⁻³ and 1 m³ of pure CO₂ is 1.83 kg. The '
            + 'same 1 000 ppm set-point is 1.83 g m⁻³ at 20 °C, 1.67 at 40 °C and 1.63 at '
            + '1 000 m elevation. The mass balance is written on mg m⁻³ and controllers are set '
            + 'in ppm, so the factor P/T is in every injection calculation whether or not anyone '
            + 'updates it.' },
      { lead: 'The mass balance, with injection, respiration, assimilation and ventilation:',
        math: 'h d[CO₂]<sub>in</sub>/dt = I + R<sub>resp</sub> − A − V, &nbsp;&nbsp; '
            + 'V = g<sub>V</sub>([CO₂]<sub>in</sub> − [CO₂]<sub>out</sub>)',
        note: 'At steady state I = V + A. The same g_V that removes sensible heat and water '
            + 'vapour removes the injected CO₂, which is why the three cannot be optimised '
            + 'independently.' },
      { lead: 'The injection rate in molar form, which is the one to cost:',
        math: 'ṁ<sub>CO₂</sub> = g<sub>V</sub>(c<sub>in</sub> − c<sub>out</sub>) × 10⁻⁶ M<sub>CO₂</sub> P / (R T<sub>K</sub>)',
        note: 'Units g m⁻² s⁻¹ with g_V in m s⁻¹.' },
      { lead: 'The one-off charge to bring the house up to the set-point:',
        math: 'charge = (C<sub>in</sub> − C<sub>out</sub>) × h',
        note: 'For a 6 m house from 400 to 1 000 ppm that is 6.6 g m⁻², or 66 kg ha⁻¹, once.' }
    ],

    caveats: [
      'Respiration is not included as a separate term. In a cropped house it is small against net '
        + 'assimilation and is normally folded into it.',
      'Assimilation is an input here rather than a model. It is the same quantity as the crop '
        + 'growth rate in different units, so the canopy interception calculator will give a '
        + 'consistent figure, and it rises with the CO₂ concentration being held, which this does '
        + 'not iterate.',
      'Distribution is not costed. Getting the gas to the canopy evenly is a real capital and fan '
        + 'cost and a real uniformity problem, especially in a tall house.',
      'Flue gas from an on-site boiler or engine is a different source with its own constraints: '
        + 'it arrives with heat that may not be wanted, which is exactly what the buffer here is '
        + 'sized to decouple.'
    ],

    sources: ['stanghellini2019', 'vanthoor2011', 'ep406'],
    provenance: 'Sections 13.1, 13.2, 13.3 and 13.5 of "Greenhouse parameters and equations". The '
              + 'defaults reproduce that section’s worked 6 m house: 6.6 g m⁻² to charge it once, '
              + '22 kg ha⁻¹ h⁻¹ of leakage loss with no crop, and 60 kg ha⁻¹ h⁻¹ with a crop '
              + 'assimilating 38.'
  });
}());

