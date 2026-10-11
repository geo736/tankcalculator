# Tank Calculator

Aquaponics, aquaculture and hydroponics calculators as a static website. No build step: open `index.html` in a browser or serve the folder with any static host (e.g. GitHub Pages).

## Structure

- `index.html` – home page with an app-style grid of calculators, search and filters
- `assets/catalog.js` – the list of calculators on the home page (set `status: 'live'` when one is finished). `tags` drive the system filter (aquaponics, aquaculture, hydroponics) and `uses` drive the "I'm working on" task filter, whose options are listed in `CALC_USES`
- `window.GUIDES` in `assets/catalog.js` – step-by-step guided designs shown in the "Guided design" section of the home page (`guides/<slug>.html`)
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


- [x] Tank Volume – `calculators/tank-volume.html`
- [x] Fish Stocking Density – `calculators/fish-stocking-density.html`
- [x] Feeding Rate – `calculators/feeding-rate.html`
- [x] Grow Bed Ratio – `calculators/grow-bed-ratio.html`
- [x] Pump & Turnover – `calculators/pump-turnover.html`
- [x] Nutrient EC – `calculators/nutrient-ec.html`
- [x] pH Adjustment – `calculators/ph-adjustment.html`
- [x] Daily Light Integral – `calculators/daily-light-integral.html`
- [x] Dissolved Oxygen – `calculators/dissolved-oxygen.html`
- [x] Hydrostatic Pressure – `calculators/hydrostatic-pressure.html`
- [x] Growing Media Fill – `calculators/growing-media-fill.html`
- [x] Iron Addition – `calculators/iron-addition.html`
- [x] Biofilter Surface Area – `calculators/biological-surface-area.html`
- [x] Fish Hauling
- [x] Pipe Water Velocity – `calculators/water-velocity.html`
- [x] Grow Bed Volume – `calculators/grow-bed-volume.html`
- [x] Salt Addition – `calculators/salt-addition.html`
- [x] Feed Rate to Grow Space – `calculators/feed-rate-to-grow-space.html`
- [x] TAN Conversion – `calculators/tan-conversion.html`
- [x] Mineralization Tank – `calculators/mineralization-tank.html`
- [x] Light Conversions – `calculators/light-conversions.html`
- [x] Head Loss – `calculators/head-loss.html`
- [x] Internal Tank Velocity – `calculators/internal-tank-velocity.html`
- [x] Sump Drain-Back
- [x] Battery Life Estimator – `calculators/battery-life.html`
- [x] UV Filtration Sizing – `calculators/uv-sterilizer-sizing.html`
- [x] Drum Filter Sizing – `calculators/drum-filter-sizing.html`
- [x] Cost Benefit Analysis
