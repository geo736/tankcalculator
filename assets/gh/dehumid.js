/* Scoring for the dehumidification routes.
 *
 * Transcribed from dehumid/routes.py. The ledger it reads is in
 * dehumid-ledger.js, generated from that model's parameters.csv.
 *
 * Every route returns a specific energy in joules per kilogram of water
 * removed, and declares which price it is bought at. The boundary rules are
 * the whole point: see the header of dehumid-ledger.js.
 */
(function (root) {
  'use strict';

  var P = root.PSY;
  var LED = root.DEHUMID_LEDGER;
  var D = {};

  /* Outdoor temperatures the chiller curve was fitted over. Outside this range
   * the curve is an extrapolation and should be read as one. */
  D.COP_FIT_RANGE = [29.7, 36.6];

  D.ROUTES = [
    { key: 'forced_ventilation', label: 'Forced ventilation', family: 'ventilation',
      pricedOn: 'elec', recovers: false, maturity: 'mature',
      note: 'Available only while outside air is a vapour sink' },
    { key: 'forced_vent_hx', label: 'Forced ventilation with heat recovery', family: 'ventilation',
      pricedOn: 'elec', recovers: false, maturity: 'mature',
      note: 'Sensible recovery credited, rotor moisture return charged' },
    { key: 'coil_heat_pump', label: 'Cold coil with heat pump', family: 'condensation',
      pricedOn: 'elec', recovers: true, maturity: 'mature' },
    { key: 'liquid_desiccant_thermal', label: 'Liquid desiccant, thermal regeneration',
      family: 'sorption', pricedOn: 'heat', recovers: true, maturity: 'demonstrated' },
    { key: 'liquid_desiccant_nf', label: 'Liquid desiccant, membrane regeneration',
      family: 'sorption', pricedOn: 'elec', recovers: true, maturity: 'simulated',
      note: 'Published coefficient is cooling output over electric input, so it is charged the coil’s overcooling' },
    { key: 'solid_desiccant_standalone', label: 'Solid desiccant, standalone',
      family: 'sorption', pricedOn: 'heat', recovers: true, maturity: 'demonstrated' },
    { key: 'solid_desiccant_mcycle', label: 'Solid desiccant with Maisotsenko cycle',
      family: 'sorption', pricedOn: 'heat', recovers: true, maturity: 'demonstrated' },
    { key: 'sorbent_closed_loop', label: 'Closed-loop composite sorbent',
      family: 'sorption', pricedOn: 'elec', recovers: true, maturity: 'pilot' },
    { key: 'thermoelectric', label: 'Thermoelectric condensation', family: 'condensation',
      pricedOn: 'elec', recovers: true, maturity: 'pilot' },
    { key: 'refrigerative_field', label: 'Heat-pump dehumidifier, measured',
      family: 'condensation', pricedOn: 'elec', recovers: true, maturity: 'field',
      note: 'Scored on measured seasonal extraction rates rather than a modelled coefficient' },
    { key: 'dche_heat_pump', label: 'Desiccant-coated heat exchanger with heat pump',
      family: 'sorption', pricedOn: 'elec', recovers: true, maturity: 'demonstrated',
      note: 'Scored on a wattmeter-measured extraction rate, which is already latent-only, so no overcooling is added' },
    { key: 'electrochemical', label: 'Electrochemical membrane', family: 'membrane',
      pricedOn: 'elec', recovers: false, maturity: 'laboratory',
      note: 'Measured on a single laboratory element, not a system' },
    { key: 'membrane_amx', label: 'Active membrane energy exchanger', family: 'membrane',
      pricedOn: 'elec', recovers: false, maturity: 'simulated',
      note: 'Published only as a multiple of a dedicated-outdoor-air machine, so this is a boundary transfer' }
  ];

  D.meta = function (key) {
    for (var i = 0; i < D.ROUTES.length; i++) if (D.ROUTES[i].key === key) return D.ROUTES[i];
    return null;
  };

  D.row = function (route, param) {
    return (LED[route] || {})[param] || null;
  };

  D.get = function (route, param, which) {
    var r = D.row(route, param);
    if (!r) throw new Error('the ledger has no ' + param + ' for ' + route);
    var v = r[which || 'base'];
    if (v === null || v === undefined) throw new Error(route + '.' + param + ' has no ' + which + ' value');
    return v;
  };

  /* Kelvin outside the range the chiller curve was fitted over; zero inside it. */
  D.extrapolationK = function (tOut) {
    if (tOut < D.COP_FIT_RANGE[0]) return D.COP_FIT_RANGE[0] - tOut;
    if (tOut > D.COP_FIT_RANGE[1]) return tOut - D.COP_FIT_RANGE[1];
    return 0;
  };

  /* No device can remove latent heat L with less than L/COP of work, so a
   * reported figure below this for a plausible coefficient is a reporting
   * boundary error and not a breakthrough. */
  D.secondLawFloor = function (copCarnotEquivalent) { return P.L / copCarnotEquivalent; };

  D.build = function (which) {
    which = which || 'base';
    var S = {
      which: which,
      copChillerLevel: D.get('coil_heat_pump', 'cop_dehumid', which),
      copLevelBase: D.get('coil_heat_pump', 'cop_dehumid', 'base'),
      copFloor: D.get('coil_heat_pump', 'cop_dehumid', 'low'),
      copCeiling: D.get('coil_heat_pump', 'cop_dehumid', 'high'),
      cSens: D.get('coil_heat_pump', 'c_sens_ratio', which),
      fanJperM3: D.get('forced_ventilation', 'specific_fan_power', which),
      maxAirflow: D.get('forced_ventilation', 'max_airflow', which),
      etaHx: D.get('forced_vent_hx', 'eta_hx_sensible', which),
      moistureReturn: D.get('forced_vent_hx', 'moisture_return_fraction', which),
      priceElec: D.get('prices', 'electricity', 'base'),
      priceHeat: D.get('prices', 'heat', 'base')
    };

    /* Chiller coefficient as a function of outdoor temperature. A fixed value is
     * the defect this comparison exists to criticise, so the slope through the
     * two measured anchors is used, with the level scaled by the ledger's own
     * band and bounded by it. */
    S.copAt = function (tOut) {
      var t1 = 29.7, c1 = D.get('coil_heat_pump', 'cop_at_29_7C', which);
      var t2 = 36.6, c2 = D.get('coil_heat_pump', 'cop_at_36_6C', which);
      var cop = c1 + (c2 - c1) / (t2 - t1) * (tOut - t1);
      cop *= S.copChillerLevel / S.copLevelBase;
      return Math.min(Math.max(cop, S.copFloor), S.copCeiling);
    };

    /* Ventilation: the only route whose cost depends on the weather. Energy per
     * kilogram is the air volume needed times what that volume costs. */
    S.ventilation = function (tIn, chiIn, tOut, chiOut, withHx) {
      var key = withHx ? 'forced_vent_hx' : 'forced_ventilation';
      var dChi = chiIn - chiOut;
      if (dChi <= 0) {
        return { key: key, w: Infinity, pricedOn: 'elec', available: false,
                 note: 'outside air is wetter than inside: not a dehumidification route',
                 components: { d_chi: dChi } };
      }
      var eff = withHx ? dChi * (1 - S.moistureReturn) : dChi;
      if (eff <= 0) {
        return { key: key, w: Infinity, pricedOn: 'elec', available: false,
                 note: 'moisture return cancels the removal', components: { d_chi: dChi } };
      }
      var volPerKg = 1 / eff;
      var fan = S.fanJperM3 * volPerKg;
      var dt = tOut - tIn;
      var sensPerM3 = P.RHO * P.CP * Math.abs(dt);
      if (withHx) sensPerM3 *= (1 - S.etaHx);
      var sensible = sensPerM3 * volPerKg;
      var w, note;
      if (dt > 0) {
        w = fan + sensible / S.copAt(tOut);
        note = 'sensible gain removed by the chiller';
      } else {
        w = fan + sensible * (S.priceHeat / S.priceElec);
        note = 'reheat charged at the heat price, in electricity-price units';
      }
      return { key: key, w: w, pricedOn: 'elec', available: true, note: note,
               components: { fan: fan, sensible: sensible, d_chi: dChi, vol_per_kg: volPerKg } };
    };

    /* Kilograms of water the ventilation plant can move in one hour, per m2. A
     * specific energy carries no rate, so the airflow limit is a property of
     * the hour and not of the route. */
    S.maxRemovalPerHour = function (dChi) { return Math.max(0, S.maxAirflow * dChi); };

    /* Condensation on a cold coil: w = (L + c_sens) / COP_c, with no recovery
     * credit, because a hot humid facility has no simultaneous heat demand to
     * absorb recovered condenser heat. */
    S.coil = function (tOut) {
      var total = P.L * (1 + S.cSens);
      var cop = tOut === undefined || tOut === null ? S.copChillerLevel : S.copAt(tOut);
      return { key: 'coil_heat_pump', w: total / cop, pricedOn: 'elec', available: true,
               recovers: true,
               components: { latent: P.L, sensible: P.L * S.cSens, cop: cop } };
    };

    /* Any sorption route: regeneration energy, plus the adsorption heat it
     * dumps, which the chiller has to remove in a cooling-dominated house. */
    S.sorption = function (key, tOut, pricedOn) {
      pricedOn = pricedOn || 'heat';
      var cop = D.get(key, 'cop_thermal', which);
      var wRegen = P.L / cop;
      var copC = tOut === undefined || tOut === null ? S.copChillerLevel : S.copAt(tOut);
      var wAdsorbElec = P.L / copC;
      return { key: key, w: pricedOn === 'heat' ? wRegen : wRegen + wAdsorbElec,
               pricedOn: pricedOn, available: true, recovers: true,
               components: { cop: cop, cop_chiller: copC, w_regen: wRegen,
                             w_adsorption_heat: wAdsorbElec,
                             w_elec: pricedOn === 'heat' ? wAdsorbElec : 0 } };
    };

    /* A latent-only coefficient on the route's own input. No overcooling: these
     * routes carry water across a membrane rather than condensing it. */
    S.fromCop = function (key, param, pricedOn) {
      var cop = D.get(key, param || 'cop', which);
      return { key: key, w: P.L / cop, pricedOn: pricedOn || 'elec', available: true,
               recovers: false, components: { cop: cop } };
    };

    /* A published coefficient that is cooling output over electric input already
     * covers the sensible duty, so it carries the coil's burden. */
    S.totalCooling = function (key, param) {
      var cop = D.get(key, param, which);
      return { key: key, w: P.L * (1 + S.cSens) / cop, pricedOn: 'elec', available: true,
               recovers: true, components: { cop: cop } };
    };

    /* A route published only as a multiple of a conventional machine. The ratio
     * is applied to this model's chiller, which is a boundary transfer and is
     * stated rather than disclaimed. */
    S.improvementRatio = function (key, param, tOut) {
      var ratio = D.get(key, param, which);
      var base = tOut === undefined || tOut === null ? S.copChillerLevel : S.copAt(tOut);
      var cop = base * ratio;
      var meta = D.meta(key);
      return { key: key, w: P.L * (1 + S.cSens) / cop, pricedOn: 'elec', available: true,
               recovers: meta ? !!meta.recovers : false,
               components: { ratio: ratio, cop_baseline: base, cop: cop, boundary_transfer: true } };
    };

    /* A unit characterised by a measured specific moisture extraction rate. */
    S.fromSmer = function (key) {
      var smer = D.get(key, 'smer', which);
      return { key: key, w: 3.6e6 / smer, pricedOn: 'elec', available: true,
               recovers: true, components: { smer: smer } };
    };

    S.fromSpecificEnergy = function (key) {
      var mj = D.get(key, 'specific_energy', which);
      return { key: key, w: mj * 1e6, pricedOn: 'elec', available: true, recovers: true,
               components: { specific_energy_mj: mj } };
    };

    S.evaluateAll = function (tIn, rhIn, tOut, rhOut) {
      var chiIn = P.chi(tIn, rhIn), chiOut = P.chi(tOut, rhOut);
      return {
        forced_ventilation: S.ventilation(tIn, chiIn, tOut, chiOut, false),
        forced_vent_hx: S.ventilation(tIn, chiIn, tOut, chiOut, true),
        coil_heat_pump: S.coil(tOut),
        liquid_desiccant_thermal: S.sorption('liquid_desiccant_thermal', tOut),
        liquid_desiccant_nf: S.totalCooling('liquid_desiccant_nf', 'cop_system'),
        solid_desiccant_standalone: S.sorption('solid_desiccant_standalone', tOut),
        solid_desiccant_mcycle: S.sorption('solid_desiccant_mcycle', tOut),
        sorbent_closed_loop: S.fromSpecificEnergy('sorbent_closed_loop'),
        thermoelectric: S.fromSmer('thermoelectric'),
        refrigerative_field: S.fromSmer('refrigerative_field'),
        dche_heat_pump: S.fromSmer('dche_heat_pump'),
        electrochemical: S.fromCop('electrochemical', 'cop'),
        membrane_amx: S.improvementRatio('membrane_amx', 'cop_ratio_vs_doas', tOut)
      };
    };

    return S;
  };

  root.DEHUMID = D;
}(typeof window !== 'undefined' ? window : globalThis));

