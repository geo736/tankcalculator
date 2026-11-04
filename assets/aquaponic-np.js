// Theoretical plant FCR and PFRM from nitrogen and phosphorus mass balances
// (Colt & Semmens 2022, Aquacultural Engineering 102260, Eqs. 16–19, Tables 1–3).
// Shared by plant-fcr.js and plant-fish-ratio.js. Exposes window.AquaponicNP.
(function () {
  'use strict';

  // Table 2 (USDA FoodData Central 2019 via Colt & Semmens): salable product, wet basis.
  // dm = dry matter % of fresh weight; n, p = % of dry weight.
  const CROPS = {
    lettuce: { name: 'Lettuce', dm: 4.37, n: 4.94, p: 0.76 },
    basil: { name: 'Basil', dm: 7.90, n: 6.38, p: 0.71 },
    pakchoi: { name: 'Pak choi', dm: 4.70, n: 5.11, p: 0.79 },
    chard: { name: 'Swiss chard', dm: 7.30, n: 3.95, p: 0.63 },
    spinach: { name: 'Spinach', dm: 8.60, n: 5.40, p: 0.57 },
    parsley: { name: 'Parsley', dm: 12.30, n: 3.86, p: 0.47 },
    kale: { name: 'Kale', dm: 10.40, n: 4.49, p: 0.53 },
    peppermint: { name: 'Peppermint', dm: 21.40, n: 2.80, p: 0.34 },
    mustard: { name: 'Mustard green', dm: 9.30, n: 4.92, p: 0.62 },
    tomato: { name: 'Tomato', dm: 5.50, n: 2.62, p: 0.44 },
    cucumber: { name: 'Cucumber', dm: 4.77, n: 2.18, p: 0.50 },
    jalapeno: { name: 'Jalapeño pepper', dm: 8.30, n: 1.75, p: 0.31 },
    mean: { name: 'Mean of the 12 crops', dm: 8.74, n: 4.03, p: 0.56 }
  };
  const CROP_ORDER = ['lettuce', 'basil', 'pakchoi', 'chard', 'spinach', 'parsley', 'kale', 'peppermint', 'mustard', 'tomato', 'cucumber', 'jalapeno', 'mean'];

  // Table 3 "selected values": feed means (Table 1) and the fish FCR used with each feed type.
  const FEEDS = {
    warm: { name: 'Warm-water feed (mean)', dm: 91.5, n: 5.21, p: 1.02, fcrFish: 1.40 },
    cold: { name: 'Cold-water feed (mean)', dm: 94.22, n: 7.70, p: 1.39, fcrFish: 1.10 }
  };
  const FEED_ORDER = ['warm', 'cold'];

  // Selected mean retention by the plants (Supplemental Tables S-2, S-3; Table 3).
  const NUE = 22.3, PUE = 15.1;

  // Ranges reported in the paper.
  const RANGE = {
    fcrPlant: [0.064, 0.564], // theoretical FCRplant over 12 crops × 2 feed types (Table 3)
    pfrm: [2.5, 9.1]          // theoretical PFRM range quoted in section 6.2
  };

  // All inputs in percent. Returns kg feed per kg plant (wet) for N and P and the controlling one.
  function theory(c) {
    const ok = c.dmP > 0 && c.nP > 0 && c.pP > 0 && c.dmF > 0 && c.nF > 0 && c.pF > 0 && c.nue > 0 && c.pue > 0;
    if (!ok) return null;
    const fcrN = (c.dmP / c.dmF) * (c.nP / c.nF) / (c.nue / 100);   // Eq. 16
    const fcrP = (c.dmP / c.dmF) * (c.pP / c.pF) / (c.pue / 100);   // Eq. 18
    const control = Math.max(fcrN, fcrP);
    return { fcrN: fcrN, fcrP: fcrP, control: control, limiting: fcrP >= fcrN ? 'P' : 'N' };
  }

  // Fill a <select> with crops or feeds, plus a "custom" option.
  function fillSelect(sel, kind) {
    const list = kind === 'crop' ? CROP_ORDER : FEED_ORDER;
    const src = kind === 'crop' ? CROPS : FEEDS;
    list.forEach(function (id) {
      const o = document.createElement('option');
      o.value = id; o.textContent = src[id].name;
      sel.appendChild(o);
    });
    const o = document.createElement('option');
    o.value = 'custom'; o.textContent = 'Custom (enter below)';
    sel.appendChild(o);
  }

  window.AquaponicNP = { CROPS: CROPS, FEEDS: FEEDS, NUE: NUE, PUE: PUE, RANGE: RANGE, theory: theory, fillSelect: fillSelect };
})();
