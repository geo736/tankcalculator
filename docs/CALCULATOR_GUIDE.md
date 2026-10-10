# Calculator build guide

Every calculator in this project follows the same pattern. The reference implementation is
**Tank Volume**: `calculators/tank-volume.html` + `assets/tank-volume.js`. Copy its structure.

## Files (per calculator, slug = kebab-case name)

- `calculators/<slug>.html` – the page
- `assets/<slug>.js` – all logic, drawing, sharing for that page (vanilla JS, no libraries, wrapped in an IIFE)
- Do **not** edit `index.html`, `README.md`, `assets/style.css`, `assets/share.js`, `assets/units.js` or other calculators.
  If you truly need page-specific CSS, put a small `<style>` block in your page that only uses the CSS variables from `style.css`.

## Page structure (same order, same classes as tank-volume.html)

1. Site header (brand link to `../`, "All calculators" nav), breadcrumbs `Home / <Name>`, `h1.page-title`, `p.page-lede`.
2. `.calc-layout` with two cards:
   - **Calculator** card: inputs, `hr.divider`, `.notice` for warnings, `.result-main` (the headline answer), `ul.result-list` for secondary results, and the `.share-bar` with **Share**, **Copy link**, **Copy results**, **Reset** buttons (same ids and icons as tank volume).
   - **Visualization** card (`.viz-card`): an inline `<svg class="viz">` that is redrawn on every input change, plus `p.viz-caption`. The visual must show the calculation itself (a gauge, bars, a diagram of the tank / pipe / bed / light curve…), not decoration. Use the existing SVG classes (`tank-line`, `water`, `water-top`, `dim`, `dim-text`, `depth-line`, …) or CSS variables so it works in light and dark mode. Keep labels inside the viewBox at 390 px phone width.
3. `article.article` with: how it works (plain language), why it matters for aquaponics / aquaculture / hydroponics, the formulas in `.formula` blocks, a worked example whose numbers match what the calculator outputs for its default inputs, limitations / assumptions, and a numbered **Sources** list.
4. Footer, then scripts: `../assets/share.js`, `../assets/units.js`, `../assets/<slug>.js`.

## Units rule (mandatory)

Every input that has a unit gets **its own** unit dropdown. Never one shared "units" box.

```html
<div class="input-row">
  <input id="flow" type="number" inputmode="decimal" min="0" step="any">
  <select class="unit-select" data-unit-group="flow" data-unit-for="flow" data-unit-default="gpm" aria-label="Flow unit"></select>
</div>
```

- Groups available in `assets/units.js`: length, volume, mass, area, pressure, flow, velocity, temperature, tempdiff, power, energy, time, concentration, specificarea, density. Read the file for unit ids.
- Call `CalcUnits.init(render)` once before reading URL state.
- Read values with `CalcUnits.base(id)` (positive values; 0 if empty) or `CalcUnits.baseSigned(id)` (allows 0/negative, NaN if empty, use for temperatures and money). Do all math in base units (m, L, kg, m², Pa, L/s, m/s, °C, W, J, s, mg/L, m²/m³, kg/m³).
- Results with units should get an output unit `<select class="unit-select" data-unit-group="…" data-unit-default="…">` **without** `data-unit-for` (or a normal `<select>`), and use `CalcUnits.convert(group, value, fromId, toId)` / `CalcUnits.label(group, id)` to display.
- Unitless inputs (pH, %, counts, money) use `<span class="unit">%</span>` or no suffix.
- If a needed unit group is missing, add the units **inside your own JS** (do not edit units.js) and mention it in your report.

## Sharing

- `CalcShare.writeParams(state)` on every render; state holds every visible input and each input's unit as `<id>_u`.
- On load, read `CalcShare.readParams()` and restore values with `CalcUnits.set(id, value, unit)`.
- Copy results = a plain-text summary (inputs with units, results, and the share link).

## Quality bar

- Formulas and constants must be correct and traceable. Every constant comes from a cited source. Only cite sources you are confident exist (author, year, title, publisher/journal; a URL when you know it is stable). Never invent a citation. Prefer FAO, USDA/SRAC extension publications, peer-reviewed papers, NIST/USGS, and standard textbooks (e.g. Timmons & Ebeling, *Recirculating Aquaculture*; Somerville et al. 2014, FAO Technical Paper 589; Goddek et al. 2019, *Aquaponics Food Production Systems*, Springer open access).
- Where guidance is a range or rule of thumb, say so on the page and show which range the user's result falls in.
- Handle empty / zero / out-of-range inputs with a `.notice` message, never NaN or Infinity on screen.
- Sensible defaults so the page shows a meaningful result on first load.
- Test in headless Chromium (Playwright, `require('playwright')` with `NODE_PATH=$(npm root -g)`, browsers preinstalled; do not run `playwright install`): check results against hand calculations, no console errors, no horizontal scroll at 390 px width (`document.documentElement.scrollWidth === 390`), dark mode renders, share URL round-trips.
