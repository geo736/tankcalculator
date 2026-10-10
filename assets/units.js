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
        { id: 'g', label: 'g', factor: 0.001 },
        { id: 'kg', label: 'kg', factor: 1 },
        { id: 'oz', label: 'oz', factor: 0.028349523125 },
        { id: 'lb', label: 'lb', factor: 0.45359237 }
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
    return v * (u ? u.factor : 1);
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
    return u ? value / u.factor : value;
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
      sel.addEventListener('change', function () {
        const input = document.getElementById(sel.dataset.unitFor);
        const from = unitDef(sel.dataset.unitGroup, sel.dataset.prev);
        const to = unitDef(sel.dataset.unitGroup, sel.value);
        const v = parseFloat(input.value);
        if (from && to && isFinite(v)) input.value = round(v * from.factor / to.factor);
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
    unit: unit,
    unitLabel: unitLabel,
    fromBase: fromBase,
    set: set
  };
})();
