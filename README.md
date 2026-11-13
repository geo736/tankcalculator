# Tank Calculator

Aquaponics, aquaculture, hydroponics, greenhouse and indoor-farm calculators as a static website. No build step: open `index.html` in a browser or serve the folder with any static host (e.g. GitHub Pages).

## Structure

- `index.html` – home page with an app-style grid of calculators, search and filters
- `assets/catalog.js` – the list of calculators on the home page (set `status: 'live'` when one is finished). `tags` drive the system filter (aquaponics, aquaculture, hydroponics, greenhouse, indoor); optional `keywords` add search words only and `uses` drive the "I'm working on" task filter, whose options are listed in `CALC_USES`
- `group` on each calculator places it in a home-page section listed in `CALC_GROUPS` (water quality, system design, equipment, fish management, plants & lighting, power & costs)
- `window.GUIDES` in `assets/catalog.js` – step-by-step guided designs shown in the "Guided design" section of the home page (`guides/<slug>.html`)
- `calculators/` – one HTML page per calculator
- `assets/style.css` – shared styles (light and dark mode)
- `assets/share.js` – shared helpers: inputs stored in the URL, copy link, copy results, native share
- `assets/units.js` – per-input unit pickers (length, volume, mass) with automatic conversion
- `assets/<calculator>.js` – logic and live SVG visualization for each calculator

## Greenhouse & NEEMO pack (`assets/gh/`)

23 calculators ported from the greenhouse/NEEMO pack run on their own small engine instead of the per-page markup above:

- `assets/gh/gfc.js` + `gfc.css` – the engine: one spec object per page (`GFC.mount`) builds the form, headline, figure, equations and sources. Inputs are read from the URL fragment (`#a=1&b=2`) or, for links from guides, the query string (`?a=1&b=2`).
- `assets/gh/calc/<slug>.js` – one spec per calculator; `calculators/<slug>.html` is a thin shell that loads it.
- Shared physics: `psychro.js` (psychrometrics), `crop.js` (big-leaf transpiration and vapour balance), `dehumid*.js` (dehumidification routes), `climate-data.js` + `climate.js` (8 typical-year hourly climates from EnergyPlus), `cites.js` (references with DOIs).
- `assets/gh/narrative.js` – each page's narrative in the site's order (how it works, why it matters, then the page's formulas, a worked example and limitations). The example is a template filled from the calculator's own `compute()` at its default inputs, so its numbers always match the page.
- These pages use fixed SI units per field, not the per-input unit pickers required above.

`guides/greenhouse-design.html` (`assets/guide-greenhouse-design.js`) uses the CalcGuide framework and the pack's shared physics, with hourly climate for heating, lamp heat, fan electricity and pad water.

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
- [x] pH Down Adjustment – `calculators/ph-adjustment.html`
- [x] pH Up Adjustment – `calculators/ph-up-adjustment.html`
- [x] Air Pump & Air Stone Sizing (fish systems) – `calculators/aeration-aquaculture.html`
- [x] Air Pump & Air Stone Sizing (hydroponic systems) – `calculators/aeration-hydroponic.html`
- [x] Feed Conversion Ratio (FCR) – `calculators/fcr.html`
- [x] Hydroponic Nutrient Additions – `calculators/nutrient-additions.html`
- [x] Aquaponic Buffer Blend (fish feed to plant nutrient balance) – `calculators/buffer-blend.html`
- [x] Low-Cost Artificial Sea Salt Mix (inland shrimp) – `calculators/sea-salt-mix.html`
- [x] Plant Feed Conversion Ratio (FCRplant)
- [x] Plant-Fish Mass Ratio (PFRM)
- [x] Foam Fractionator Sizing – `calculators/foam-fractionator.html`
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
- [x] Light Fixture Layout – `calculators/light-fixture-layout.html`
