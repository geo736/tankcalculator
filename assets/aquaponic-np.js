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
  // Selected mean retention by the fish (sections 4.1 and 4.2): % of feed N and P kept in fish tissue.
  const FISH_N = 23.3, FISH_P = 39.8;

  // Plant retention when fish solids are recovered (e.g. digested) and returned: the plants can get
  // at most what the fish do not keep, times the share of it that actually reaches them.
  function recoveryRetention(fishN, fishP, recN, recP) {
    if (!(fishN >= 0 && fishN < 100 && fishP >= 0 && fishP < 100 && recN > 0 && recP > 0)) return null;
    return { nue: (100 - fishN) * Math.min(recN, 100) / 100, pue: (100 - fishP) * Math.min(recP, 100) / 100 };
  }

  // Shared UI wiring for the retention-mode select ('paper' | 'recovery' | 'custom') on both pages.
  // ids: t_ret (select), t_fishn, t_fishp, t_recn, t_recp, ret-rec (wrapper), t_nue, t_pue.
  function syncRetention($) {
    const mode = $('t_ret').value;
    $('ret-rec').hidden = mode !== 'recovery';
    const fixedVals = mode !== 'custom';
    ['t_nue', 't_pue'].forEach(function (id) { $(id).readOnly = fixedVals; });
    if (mode === 'paper') { $('t_nue').value = NUE; $('t_pue').value = PUE; }
    else if (mode === 'recovery') {
      const v = function (id) { const x = parseFloat($(id).value); return isFinite(x) ? x : NaN; };
      const r = recoveryRetention(v('t_fishn'), v('t_fishp'), v('t_recn'), v('t_recp'));
      $('t_nue').value = r ? +r.nue.toFixed(2) : '';
      $('t_pue').value = r ? +r.pue.toFixed(2) : '';
    }
    return mode;
  }
  function retentionLabel($) {
    const m = $('t_ret').value;
    return m === 'paper' ? 'the paper\'s average plant retention'
      : m === 'recovery' ? 'full solids recovery (' + $('t_nue').value + '% of feed N and ' + $('t_pue').value + '% of feed P to plants)'
        : 'your retention values';
  }
  function retentionDefaults($) {
    $('t_ret').value = 'paper';
    $('t_fishn').value = FISH_N; $('t_fishp').value = FISH_P;
    $('t_recn').value = 100; $('t_recp').value = 100;
  }
  const RET_FIELDS = ['t_fishn', 't_fishp', 't_recn', 't_recp'];
  const RET_MODES = ['paper', 'recovery', 'custom'];

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

  window.AquaponicNP = { CROPS: CROPS, FEEDS: FEEDS, NUE: NUE, PUE: PUE, FISH_N: FISH_N, FISH_P: FISH_P, RANGE: RANGE,
    theory: theory, fillSelect: fillSelect, recoveryRetention: recoveryRetention, syncRetention: syncRetention,
    retentionLabel: retentionLabel, retentionDefaults: retentionDefaults, RET_FIELDS: RET_FIELDS, RET_MODES: RET_MODES };
})();
