# Tank Calculator

Aquaponics, aquaculture and hydroponics calculators as a static website. No build step: open `index.html` in a browser or serve the folder with any static host (e.g. GitHub Pages).

## Structure

- `index.html` – home page with an app-style grid of calculators
- `calculators/` – one HTML page per calculator
- `assets/style.css` – shared styles (light and dark mode)
- `assets/share.js` – shared helpers: inputs stored in the URL, copy link, copy results, native share
- `assets/units.js` – per-input unit pickers (length, volume, mass) with automatic conversion
- `assets/<calculator>.js` – logic and live SVG visualization for each calculator

## Calculator page layout

Every calculator page has the same parts:

1. **Calculator** – inputs and results, updated as you type
2. **Visualization** – an SVG diagram that redraws with the inputs
3. **Explanation** – the formulas, a worked example and limitations
4. **Sources** – references for every formula and constant
5. **Share** – Share / Copy link / Copy results (inputs are kept in the URL)

## Units rule (all calculators)

Every input that has a unit gets its **own** unit dropdown – never one shared "units" box for the whole form. A user can enter the diameter in inches and the height in centimeters.

```html
<div class="input-row">
  <input id="height" type="number" inputmode="decimal" min="0" step="any">
  <select class="unit-select" data-unit-group="length" data-unit-for="height" data-unit-default="in" aria-label="Height unit"></select>
</div>
```

- Call `CalcUnits.init(render)` once; it fills the options and converts the number when the unit changes.
- Read values with `CalcUnits.base(id)` (meters, liters or kilograms) and do all math in those base units.
- Store each field's unit in the share URL as `<id>_u` (e.g. `height=60&height_u=cm`).
- New unit groups (temperature, flow, concentration …) go in `GROUPS` in `assets/units.js`.

## Calculators

- [x] Tank Volume – rectangular, round, cone-bottom and horizontal tanks
- [ ] Fish Stocking Density
- [ ] Feeding Rate
- [ ] Grow Bed Ratio
- [ ] Pump & Turnover
- [ ] Nutrient EC
- [ ] pH Adjustment
- [ ] Daily Light Integral
- [ ] Dissolved Oxygen
