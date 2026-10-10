# Tank Calculator

Aquaponics, aquaculture and hydroponics calculators as a static website. No build step: open `index.html` in a browser or serve the folder with any static host (e.g. GitHub Pages).

## Structure

- `index.html` – home page with an app-style grid of calculators
- `calculators/` – one HTML page per calculator
- `assets/style.css` – shared styles (light and dark mode)
- `assets/share.js` – shared helpers: inputs stored in the URL, copy link, copy results, native share
- `assets/<calculator>.js` – logic and live SVG visualization for each calculator

## Calculator page layout

Every calculator page has the same parts:

1. **Calculator** – inputs and results, updated as you type
2. **Visualization** – an SVG diagram that redraws with the inputs
3. **Explanation** – the formulas, a worked example and limitations
4. **Sources** – references for every formula and constant
5. **Share** – Share / Copy link / Copy results (inputs are kept in the URL)

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
