// Per-input unit pickers shared by every calculator.
//
// Markup: put a <select data-unit-group="length" data-unit-for="height"> next to
// <input id="height"> inside an .input-row. CalcUnits fills the options, converts
// the input's value when its unit changes (so the physical quantity stays the same),
// and gives calculators the value in base units (m, L, kg, °C ...).
(function () {
  'use strict';

  // factor = how many base units one of this unit is
  const GROUPS = {
    length: {
      base: 'm',
      units: [
        { id: 'mm', label: 'mm', factor: 0.001 },
        { id: 'cm', label: 'cm', factor: 0.01 },
        { id: 'm', label: 'm', factor: 1 },
        { id: 'in', label: 'in', factor: 0.0254 },
        { id: 'ft', label: 'ft', factor: 0.3048 },
        { id: 'yd', label: 'yd', factor: 0.9144 }
      ]
    },
    volume: {
      base: 'L',
      units: [
        { id: 'mL', label: 'mL', factor: 0.001 },
        { id: 'L', label: 'L', factor: 1 },
        { id: 'm3', label: 'm³', factor: 1000 },
        { id: 'gal', label: 'US gal', factor: 3.785411784 },
        { id: 'impgal', label: 'imp gal', factor: 4.54609 },
        { id: 'ft3', label: 'ft³', factor: 28.316846592 }
      ]
    },
    mass: {
      base: 'kg',
      units: [
        { id: 'mg', label: 'mg', factor: 0.000001 },
        { id: 'g', label: 'g', factor: 0.001 },
        { id: 'kg', label: 'kg', factor: 1 },
        { id: 't', label: 't (metric)', factor: 1000 },
        { id: 'oz', label: 'oz', factor: 0.028349523125 },
        { id: 'lb', label: 'lb', factor: 0.45359237 }
      ]
    },
    area: {
      base: 'm2',
      units: [
        { id: 'cm2', label: 'cm²', factor: 0.0001 },
        { id: 'm2', label: 'm²', factor: 1 },
        { id: 'ha', label: 'ha', factor: 10000 },
        { id: 'in2', label: 'in²', factor: 0.00064516 },
        { id: 'ft2', label: 'ft²', factor: 0.09290304 },
        { id: 'acre', label: 'acre', factor: 4046.8564224 }
      ]
    },
    pressure: {
      base: 'Pa',
      units: [
        { id: 'Pa', label: 'Pa', factor: 1 },
        { id: 'kPa', label: 'kPa', factor: 1000 },
        { id: 'bar', label: 'bar', factor: 100000 },
        { id: 'psi', label: 'psi', factor: 6894.757293168 },
        { id: 'mH2O', label: 'm H₂O', factor: 9806.65 },
        { id: 'ftH2O', label: 'ft H₂O', factor: 2989.06692 },
        { id: 'inH2O', label: 'in H₂O', factor: 249.08891 },
        { id: 'inHg', label: 'in Hg', factor: 3386.389 },
        { id: 'mmHg', label: 'mm Hg', factor: 133.322387415 }
      ]
    },
    flow: {
      base: 'Lps',
      units: [
        { id: 'Lps', label: 'L/s', factor: 1 },
        { id: 'Lpm', label: 'L/min', factor: 1 / 60 },
        { id: 'Lph', label: 'L/h', factor: 1 / 3600 },
        { id: 'm3ph', label: 'm³/h', factor: 1000 / 3600 },
        { id: 'm3pd', label: 'm³/day', factor: 1000 / 86400 },
        { id: 'gpm', label: 'US gpm', factor: 3.785411784 / 60 },
        { id: 'gph', label: 'US gph', factor: 3.785411784 / 3600 },
        { id: 'cfm', label: 'ft³/min', factor: 28.316846592 / 60 }
      ]
    },
    velocity: {
      base: 'mps',
      units: [
        { id: 'cmps', label: 'cm/s', factor: 0.01 },
        { id: 'mps', label: 'm/s', factor: 1 },
        { id: 'kmph', label: 'km/h', factor: 1 / 3.6 },
        { id: 'inps', label: 'in/s', factor: 0.0254 },
        { id: 'ftps', label: 'ft/s', factor: 0.3048 },
        { id: 'fpm', label: 'ft/min', factor: 0.3048 / 60 },
        { id: 'mph', label: 'mph', factor: 0.44704 }
      ]
    },
    // Temperature needs an offset: base = value × factor + offset
    temperature: {
      base: 'C',
      units: [
        { id: 'C', label: '°C', factor: 1, offset: 0 },
        { id: 'F', label: '°F', factor: 5 / 9, offset: -32 * 5 / 9 },
        { id: 'K', label: 'K', factor: 1, offset: -273.15 }
      ]
    },
    // Temperature differences (no offset)
    tempdiff: {
      base: 'C',
      units: [
        { id: 'C', label: '°C', factor: 1 },
        { id: 'F', label: '°F', factor: 5 / 9 },
        { id: 'K', label: 'K', factor: 1 }
      ]
    },
    power: {
      base: 'W',
      units: [
        { id: 'W', label: 'W', factor: 1 },
        { id: 'kW', label: 'kW', factor: 1000 },
        { id: 'hp', label: 'hp', factor: 745.69987158227 },
        { id: 'BTUh', label: 'BTU/h', factor: 0.29307107 }
      ]
    },
    energy: {
      base: 'J',
      units: [
        { id: 'J', label: 'J', factor: 1 },
        { id: 'kJ', label: 'kJ', factor: 1000 },
        { id: 'Wh', label: 'Wh', factor: 3600 },
        { id: 'kWh', label: 'kWh', factor: 3600000 },
        { id: 'BTU', label: 'BTU', factor: 1055.05585262 },
        { id: 'therm', label: 'therm', factor: 105505585.262 }
      ]
    },
    time: {
      base: 's',
      units: [
        { id: 's', label: 's', factor: 1 },
        { id: 'min', label: 'min', factor: 60 },
        { id: 'h', label: 'h', factor: 3600 },
        { id: 'd', label: 'days', factor: 86400 },
        { id: 'wk', label: 'weeks', factor: 604800 }
      ]
    },
    // Dissolved concentration in water; base mg/L (≈ ppm in fresh water)
    concentration: {
      base: 'mgL',
      units: [
        { id: 'ugL', label: 'µg/L', factor: 0.001 },
        { id: 'mgL', label: 'mg/L (ppm)', factor: 1 },
        { id: 'gL', label: 'g/L (ppt)', factor: 1000 },
        { id: 'pct', label: '% w/v', factor: 10000 }
      ]
    },
    // Volume per area or surface loading, e.g. biofilter specific surface; base m²/m³
    specificarea: {
      base: 'm2m3',
      units: [
        { id: 'm2m3', label: 'm²/m³', factor: 1 },
        { id: 'ft2ft3', label: 'ft²/ft³', factor: 3.280839895 }
      ]
    },
    density: {
      base: 'kgm3',
      units: [
        { id: 'kgm3', label: 'kg/m³', factor: 1 },
        { id: 'kgL', label: 'kg/L', factor: 1000 },
        { id: 'lbft3', label: 'lb/ft³', factor: 16.018463374 },
        { id: 'lbgal', label: 'lb/US gal', factor: 119.826427 }
      ]
    }
  };

  function group(name) { return GROUPS[name]; }

  function unitDef(groupName, unitId) {
    const g = GROUPS[groupName];
    for (let i = 0; i < g.units.length; i++) if (g.units[i].id === unitId) return g.units[i];
    return null;
  }

  function selectFor(inputId) {
    return document.querySelector('select[data-unit-for="' + inputId + '"]');
  }

  function populate(sel) {
    const g = GROUPS[sel.dataset.unitGroup];
    if (!g || sel.options.length) return;
    g.units.forEach(function (u) {
      const o = document.createElement('option');
      o.value = u.id;
      o.textContent = u.label;
      sel.appendChild(o);
    });
    if (sel.dataset.unitDefault) sel.value = sel.dataset.unitDefault;
    sel.dataset.prev = sel.value;
  }

  function toBaseValue(u, v) { return v * u.factor + (u.offset || 0); }
  function fromBaseValue(u, b) { return (b - (u.offset || 0)) / u.factor; }

  function round(v) {
    return +v.toPrecision(6);
  }

  // Value of an input in the group's base unit (0 when empty, invalid or negative).
  function base(inputId) {
    const input = document.getElementById(inputId);
    const sel = selectFor(inputId);
    const v = parseFloat(input.value);
    if (!isFinite(v) || v <= 0) return 0;
    if (!sel) return v;
    const u = unitDef(sel.dataset.unitGroup, sel.value);
    return u ? toBaseValue(u, v) : v;
  }

  // Like base() but keeps zero and negative values (temperatures, money, deltas).
  // Returns NaN when the input is empty or invalid.
  function baseSigned(inputId) {
    const input = document.getElementById(inputId);
    const sel = selectFor(inputId);
    const v = parseFloat(input.value);
    if (!isFinite(v)) return NaN;
    if (!sel) return v;
    const u = unitDef(sel.dataset.unitGroup, sel.value);
    return u ? toBaseValue(u, v) : v;
  }

  // Convert a number between two units of a group (for result displays).
  function convert(groupName, value, fromId, toId) {
    const a = unitDef(groupName, fromId), b = unitDef(groupName, toId);
    return fromBaseValue(b, toBaseValue(a, value));
  }

  // Format a base-unit value in another unit of a group, e.g. format('flow', 0.5, 'gpm').
  function label(groupName, unitId) {
    const u = unitDef(groupName, unitId);
    return u ? u.label : unitId;
  }

  function unit(inputId) {
    const sel = selectFor(inputId);
    return sel ? sel.value : '';
  }

  function unitLabel(inputId) {
    const sel = selectFor(inputId);
    if (!sel) return '';
    const u = unitDef(sel.dataset.unitGroup, sel.value);
    return u ? u.label : sel.value;
  }

  // Convert a base-unit value into the unit currently chosen for an input.
  function fromBase(inputId, value) {
    const sel = selectFor(inputId);
    if (!sel) return value;
    const u = unitDef(sel.dataset.unitGroup, sel.value);
    return u ? fromBaseValue(u, value) : value;
  }

  // Set an input's value and (optionally) its unit without converting.
  function set(inputId, value, unitId) {
    const sel = selectFor(inputId);
    if (sel && unitId && unitDef(sel.dataset.unitGroup, unitId)) {
      sel.value = unitId;
      sel.dataset.prev = unitId;
    }
    document.getElementById(inputId).value = value;
  }

  // Wire every unit select on the page. onChange runs after a conversion.
  function init(onChange) {
    document.querySelectorAll('select[data-unit-group]').forEach(function (sel) {
      populate(sel);
      if (!sel.dataset.unitFor) {
        // Output unit picker: no input to convert, just re-render.
        sel.addEventListener('change', function () { if (onChange) onChange(null); });
        return;
      }
      sel.addEventListener('change', function () {
        const input = document.getElementById(sel.dataset.unitFor);
        const from = unitDef(sel.dataset.unitGroup, sel.dataset.prev);
        const to = unitDef(sel.dataset.unitGroup, sel.value);
        const v = parseFloat(input.value);
        if (from && to && isFinite(v)) input.value = round(fromBaseValue(to, toBaseValue(from, v)));
        sel.dataset.prev = sel.value;
        if (onChange) onChange(sel.dataset.unitFor);
      });
    });
  }

  window.CalcUnits = {
    GROUPS: GROUPS,
    group: group,
    unitDef: unitDef,
    init: init,
    base: base,
    baseSigned: baseSigned,
    convert: convert,
    label: label,
    unit: unit,
    unitLabel: unitLabel,
    fromBase: fromBase,
    set: set
  };
})();
