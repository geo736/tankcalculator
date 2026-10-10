// Cost Benefit Analysis: compare 2–4 farm decisions with NPV, equivalent annual value,
// benefit–cost ratio, payback, ROI and IRR. Live cash-flow chart, shareable URL state.
(function () {
  'use strict';

  // Currency symbols are display only: no exchange rates are applied.
  const CURRENCIES = [
    { id: 'usd', sym: '$', label: '$ (dollar)' },
    { id: 'eur', sym: '€', label: '€ (euro)' },
    { id: 'gbp', sym: '£', label: '£ (pound)' },
    { id: 'jpy', sym: '¥', label: '¥ (yen / yuan)' },
    { id: 'inr', sym: '₹', label: '₹ (rupee)' },
    { id: 'aud', sym: 'A$', label: 'A$ (Australian dollar)' },
    { id: 'cad', sym: 'C$', label: 'C$ (Canadian dollar)' },
    { id: 'nzd', sym: 'NZ$', label: 'NZ$ (NZ dollar)' },
    { id: 'zar', sym: 'R ', label: 'R (rand)' },
    { id: 'brl', sym: 'R$', label: 'R$ (real)' },
    { id: 'php', sym: '₱', label: '₱ (peso)' },
    { id: 'ngn', sym: '₦', label: '₦ (naira)' },
    { id: 'kes', sym: 'KSh ', label: 'KSh (shilling)' },
    { id: 'kr', sym: 'kr ', label: 'kr (krona / krone)' },
    { id: 'none', sym: '', label: 'No symbol' }
  ];

  // Example numbers only, to show how a decision is entered. Users replace them with their own quotes.
  const PRESETS = [
    { id: 'blank', name: 'New option', u: 0, c: 0, b: 0, l: 10, s: 0, gb: 0, gc: 0 },
    { id: 'none', name: 'Do nothing (status quo)', u: 0, c: 0, b: 0, l: 10, s: 0, gb: 0, gc: 0 },
    { id: 'led', name: 'Switch HPS to LED lights', u: 6000, c: 100, b: 1800, l: 10, s: 0, gb: 3, gc: 0 },
    { id: 'bed', name: 'Add a second grow bed', u: 2500, c: 400, b: 1300, l: 5, s: 200, gb: 0, gc: 0 },
    { id: 'gen', name: 'Backup generator', u: 4000, c: 250, b: 900, l: 15, s: 400, gb: 0, gc: 2 },
    { id: 'drum', name: 'Drum filter', u: 7000, c: 350, b: 1500, l: 12, s: 500, gb: 0, gc: 2 },
    { id: 'swirl', name: 'Swirl separator', u: 900, c: 150, b: 500, l: 10, s: 0, gb: 0, gc: 2 },
    { id: 'worker', name: 'Hire a part-time worker', u: 500, c: 15000, b: 18000, l: 5, s: 0, gb: 2, gc: 3 }
  ];

  const DEFAULTS = {
    rate: 6, period: '', cur: 'usd', method: 'eav',
    options: ['none', 'led', 'bed']
  };

  const MIN_OPTS = 2, MAX_OPTS = 4, MAX_YEARS = 50;
  const SLOT_COUNT = 4; // series colour slots --cb1..--cb4 (page <style>)
  const DASH = ['', '7 4', '2 3', '10 3 2 3'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const listEl = $('opt-list');

  let uid = 0;
  let rows = []; // [{ uid, el, slot }]

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function sym() {
    const c = CURRENCIES.filter(function (x) { return x.id === $('cur').value; })[0];
    return c ? c.sym : '$';
  }

  // Money, whole units, with a real minus sign. sign=true adds "+" to positives.
  function money(n, sign) {
    if (!isFinite(n)) return '–';
    const r = Math.round(n);
    const s = r < 0 ? '−' : (sign && r > 0 ? '+' : '');
    return s + sym() + Math.abs(r).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function moneyShort(n) {
    const a = Math.abs(n);
    const s = n < 0 ? '−' : '';
    if (a >= 1e6) return s + sym() + fmt(a / 1e6, 1) + 'M';
    if (a >= 1e4) return s + sym() + fmt(a / 1e3, 0) + 'k';
    if (a >= 1e3) return s + sym() + fmt(a / 1e3, 1) + 'k';
    return s + sym() + fmt(a, 0);
  }

  function pct(x, digits) {
    if (!isFinite(x)) return '–';
    return (x < 0 ? '−' : '') + fmt(Math.abs(x * 100), digits === undefined ? 1 : digits) + '%';
  }

  function yrs(y) {
    if (y === null) return 'none';
    if (!isFinite(y)) return 'not within period';
    return fmt(y, 1) + ' yr';
  }

  function num(id) { // plain number, NaN if empty
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : NaN;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function short(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- Option cards ----------
  function moneyField(id, label, extra) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><div class="input-row">' +
      '<span class="unit cur-pre" aria-hidden="true"></span>' +
      '<input id="' + id + '" type="number" inputmode="decimal" min="0" step="any">' +
      (extra ? '<span class="unit">' + extra + '</span>' : '') + '</div></div>';
  }

  function freeSlot() {
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (!rows.some(function (r) { return r.slot === s; })) return s;
    }
    return 0;
  }

  function addRow(o) {
    if (rows.length >= MAX_OPTS) return null;
    const id = ++uid;
    const slot = freeSlot();
    const el = document.createElement('div');
    el.className = 'opt-row';
    el.innerHTML =
      '<div class="opt-head"><span class="swatch" aria-hidden="true"></span>' +
      '<input type="text" id="on' + id + '" aria-label="Option name" maxlength="40">' +
      '<button type="button" class="opt-remove" aria-label="Remove option">×</button></div>' +
      '<div class="two-col">' +
      moneyField('ou' + id, 'Upfront cost') +
      moneyField('os' + id, 'Salvage / resale at end') +
      moneyField('oc' + id, 'Yearly costs', '/yr') +
      moneyField('ob' + id, 'Yearly benefits', '/yr') +
      '<div class="field"><label for="ol' + id + '">Useful life</label><div class="input-row">' +
      '<input id="ol' + id + '" type="number" inputmode="numeric" min="1" max="50" step="1"><span class="unit">years</span></div></div>' +
      '</div>' +
      '<details class="opt-more"><summary>Price growth per year (optional)</summary><div class="two-col">' +
      '<div class="field"><label for="ogb' + id + '">Benefit growth</label><div class="input-row">' +
      '<input id="ogb' + id + '" type="number" inputmode="decimal" step="any"><span class="unit">%/yr</span></div></div>' +
      '<div class="field"><label for="ogc' + id + '">Cost growth</label><div class="input-row">' +
      '<input id="ogc' + id + '" type="number" inputmode="decimal" step="any"><span class="unit">%/yr</span></div></div>' +
      '</div></details>';
    listEl.appendChild(el);
    $('on' + id).value = o.name;
    $('ou' + id).value = o.u;
    $('os' + id).value = o.s;
    $('oc' + id).value = o.c;
    $('ob' + id).value = o.b;
    $('ol' + id).value = o.l;
    $('ogb' + id).value = o.gb;
    $('ogc' + id).value = o.gc;
    if ((parseFloat(o.gb) || 0) !== 0 || (parseFloat(o.gc) || 0) !== 0) el.querySelector('details').open = true;
    el.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', render); });
    el.querySelector('.opt-remove').addEventListener('click', function () {
      if (rows.length <= MIN_OPTS) return;
      rows = rows.filter(function (r) { return r.uid !== id; });
      listEl.removeChild(el);
      render();
    });
    rows.push({ uid: id, el: el, slot: slot });
    return id;
  }

  function clearRows() {
    rows = [];
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  }

  function preset(id) {
    return PRESETS.filter(function (p) { return p.id === id; })[0] || PRESETS[0];
  }

  // ---------- Finance ----------
  // Capital recovery factor: turns a present value into an equal yearly amount over n years.
  function crf(r, n) {
    if (n <= 0) return NaN;
    if (Math.abs(r) < 1e-12) return 1 / n;
    const f = Math.pow(1 + r, n);
    return r * f / (f - 1);
  }

  function npvAt(cf, rate) {
    let s = 0;
    for (let t = 0; t < cf.length; t++) s += cf[t] / Math.pow(1 + rate, t);
    return s;
  }

  // IRR: scan for sign changes of NPV(rate), then bisect each one.
  function irr(cf, target) {
    const hasPos = cf.some(function (v) { return v > 1e-9; });
    const hasNeg = cf.some(function (v) { return v < -1e-9; });
    if (!hasPos || !hasNeg) return { value: NaN, multiple: false };
    const grid = [];
    for (let x = -0.99; x < 1; x += 0.005) grid.push(x);
    for (let x = 1; x <= 10.0001; x += 0.05) grid.push(x);
    const roots = [];
    let a = grid[0], fa = npvAt(cf, a);
    for (let i = 1; i < grid.length; i++) {
      const b = grid[i], fb = npvAt(cf, b);
      if (fa === 0) roots.push(a);
      else if (fa * fb < 0) {
        let lo = a, hi = b, flo = fa;
        for (let k = 0; k < 200; k++) {
          const mid = (lo + hi) / 2, fm = npvAt(cf, mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
          if (hi - lo < 1e-12) break;
        }
        roots.push((lo + hi) / 2);
      }
      a = b; fa = fb;
    }
    if (!roots.length) return { value: NaN, multiple: false };
    roots.sort(function (x, y) { return Math.abs(x - target) - Math.abs(y - target); });
    return { value: roots[0], multiple: roots.length > 1 };
  }

  // Payback: first time the cumulative cash flow reaches zero, interpolated within the year.
  function payback(cf, noInvestment) {
    if (noInvestment) return null;
    let cum = cf[0];
    if (cum >= 0) return 0;
    for (let t = 1; t < cf.length; t++) {
      const prev = cum;
      cum += cf[t];
      if (cum >= 0) return t - 1 + (-prev) / cf[t];
    }
    return Infinity;
  }

  // Value left at age a (0 < a < L) when the period ends mid-life: straight line from upfront to salvage.
  function residual(o, age) {
    return o.u - (o.u - o.s) * age / o.l;
  }

  // Year-by-year flows over T years. replace=true: buy again at the same price at the end of each life.
  function flows(o, T, r, replace) {
    const z = function () { const a = []; for (let t = 0; t <= T; t++) a.push(0); return a; };
    const f = { inv: z(), sal: z(), ben: z(), cost: z(), benFactor: z() };
    f.inv[0] = o.u;
    const last = replace ? T : Math.min(o.l, T);
    for (let t = 1; t <= last; t++) {
      f.benFactor[t] = Math.pow(1 + o.gb, t - 1);
      f.ben[t] = o.b * f.benFactor[t];
      f.cost[t] = o.c * Math.pow(1 + o.gc, t - 1);
    }
    if (replace) {
      for (let t = o.l; t <= T; t += o.l) {
        f.sal[t] += o.s;
        if (t < T) f.inv[t] += o.u;
      }
      const age = T % o.l;
      if (age !== 0) f.sal[T] += residual(o, age);
    } else if (o.l <= T) {
      f.sal[o.l] += o.s;
    } else {
      f.sal[T] += residual(o, T);
    }
    return summarize(f, T, r);
  }

  function summarize(f, T, r) {
    const res = { cf: [], dcf: [], cum: [], dcum: [], T: T };
    let pvB = 0, pvC = 0, totB = 0, totC = 0, aB = 0, totInv = 0, c = 0, dc = 0;
    for (let t = 0; t <= T; t++) {
      const v = 1 / Math.pow(1 + r, t);
      const inflow = f.ben[t] + f.sal[t], outflow = f.cost[t] + f.inv[t];
      totB += inflow; totC += outflow; totInv += f.inv[t];
      pvB += inflow * v; pvC += outflow * v;
      aB += f.benFactor[t] * v;
      const cf = inflow - outflow;
      res.cf.push(cf); res.dcf.push(cf * v);
      c += cf; dc += cf * v;
      res.cum.push(c); res.dcum.push(dc);
    }
    res.pvB = pvB; res.pvC = pvC; res.npv = pvB - pvC;
    res.totB = totB; res.totC = totC; res.totInv = totInv;
    res.annuityB = aB; // PV of 1 unit of first-year benefit with its growth
    return res;
  }

  function readOptions() {
    return rows.map(function (r, i) {
      const id = r.uid;
      const lRaw = num('ol' + id);
      const gb = num('ogb' + id), gc = num('ogc' + id);
      const nz = function (v) { return isFinite(v) ? v : 0; };
      return {
        uid: id, slot: r.slot, index: i,
        name: $('on' + id).value.trim() || 'Option ' + (i + 1),
        u: nz(num('ou' + id)), s: nz(num('os' + id)), c: nz(num('oc' + id)), b: nz(num('ob' + id)),
        lRaw: lRaw, l: isFinite(lRaw) ? Math.round(lRaw) : NaN,
        gb: nz(gb) / 100, gc: nz(gc) / 100,
        neg: [num('ou' + id), num('os' + id), num('oc' + id), num('ob' + id)].some(function (v) { return v < 0; })
      };
    });
  }

  function compute() {
    const m = { errors: [], warnings: [] };
    m.rateRaw = num('rate');
    m.r = m.rateRaw / 100;
    m.method = $('method').value;
    m.replace = m.method === 'eav';
    m.opts = readOptions();

    if (!isFinite(m.rateRaw)) m.errors.push('Enter a discount rate (use 0 to ignore the time value of money).');
    else if (m.rateRaw < 0 || m.rateRaw > 100) m.errors.push('Discount rate must be between 0% and 100%.');

    m.opts.forEach(function (o) {
      if (!isFinite(o.l) || o.l < 1) m.errors.push('Enter a useful life of at least 1 year for “' + o.name + '”.');
      else if (o.l > MAX_YEARS) m.errors.push('Useful life for “' + o.name + '” is limited to ' + MAX_YEARS + ' years.');
      else if (o.lRaw !== o.l) m.warnings.push('Life for “' + o.name + '” is rounded to ' + o.l + ' whole years (the model works year by year).');
      if (o.neg) m.errors.push('Costs, benefits and salvage for “' + o.name + '” must be zero or more. Enter savings as a benefit, not a negative cost.');
      if (o.gb <= -1 || o.gc <= -1 || o.gb > 1 || o.gc > 1) m.errors.push('Growth rates for “' + o.name + '” must be between −99% and 100% per year.');
    });

    const lives = m.opts.map(function (o) { return o.l; }).filter(function (l) { return isFinite(l) && l >= 1; });
    m.autoPeriod = lives.length ? Math.min(MAX_YEARS, Math.max.apply(null, lives)) : 10;
    const pRaw = num('period');
    if ($('period').value.trim() === '') m.T = m.autoPeriod;
    else if (!isFinite(pRaw) || pRaw < 1 || pRaw > MAX_YEARS) { m.errors.push('Analysis period must be 1–' + MAX_YEARS + ' years, or blank for automatic.'); m.T = m.autoPeriod; }
    else {
      m.T = Math.round(pRaw);
      if (m.T !== pRaw) m.warnings.push('Analysis period rounded to ' + m.T + ' years.');
    }
    $('period').placeholder = 'auto: ' + m.autoPeriod;
    $('period-hint').textContent = 'Blank = longest life (' + m.autoPeriod + ' years).';

    m.ok = m.errors.length === 0;
    if (!m.ok) return m;

    m.opts.forEach(function (o) {
      o.res = flows(o, m.T, m.r, m.replace);
      // One life cycle (for the equivalent annual value), never replaced or cut short.
      o.cyc = flows(o, o.l, m.r, false);
      o.eav = o.cyc.npv * crf(m.r, o.l);
      o.bcr = o.res.pvC > 1e-9 ? o.res.pvB / o.res.pvC : NaN;
      o.roi = o.res.totC > 1e-9 ? (o.res.totB - o.res.totC) / o.res.totC : NaN;
      o.pay = payback(o.res.cf, o.res.totInv <= 0);
      o.dpay = payback(o.res.dcf, o.res.totInv <= 0);
      o.irr = irr(o.res.cf, m.r);
      o.breakEven = o.b - o.res.npv / o.res.annuityB;
      o.zero = o.u === 0 && o.c === 0 && o.b === 0 && o.s === 0;
    });

    const key = m.replace ? 'eav' : 'npv';
    m.key = key;
    const val = function (o) { return key === 'eav' ? o.eav : o.res.npv; };
    m.ranked = m.opts.slice().sort(function (a, b) { return val(b) - val(a); });
    m.ranked.forEach(function (o, i) { o.rank = i + 1; });
    m.best = m.ranked[0];
    m.bestVal = val(m.best);

    // Do the two yardsticks agree?
    if (m.replace) {
      const byNpv = m.opts.slice().sort(function (a, b) { return b.res.npv - a.res.npv; });
      if (byNpv[0] !== m.best && Math.abs(byNpv[0].res.npv - m.best.res.npv) > 0.5) {
        m.warnings.push('Over the ' + m.T + '-year period “' + byNpv[0].name + '” has the higher NPV, but “' + m.best.name +
          '” has the higher equivalent annual value. This happens when lives differ or the period cuts a life short; the annual value is the fairer test if each option would be replaced like-for-like.');
      }
    }
    m.opts.forEach(function (o) {
      if (o.irr.multiple) m.warnings.push('“' + o.name + '” has more than one IRR (its cash flow changes sign several times); trust its NPV instead.');
    });
    return m;
  }

  // ---------- Render ----------
  const RES_IDS = ['r-best', 'r-best-sub'];

  function render() {
    const m = compute();
    const notice = $('notice');
    const msgs = m.errors.concat(m.ok ? m.warnings : []);
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    const s = sym();
    document.querySelectorAll('.cur-pre').forEach(function (e) {
      e.textContent = s.trim() || '#';
    });
    rows.forEach(function (r) {
      r.el.querySelector('.swatch').style.background = 'var(--cb' + (r.slot + 1) + ')';
      r.el.querySelector('.opt-remove').disabled = rows.length <= MIN_OPTS;
    });
    $('btn-add').disabled = rows.length >= MAX_OPTS;
    $('add-preset').disabled = rows.length >= MAX_OPTS;

    if (!m.ok) {
      RES_IDS.forEach(function (id) { $(id).textContent = '–'; });
      $('r-best-label').textContent = 'Best option';
      $('rank-list').innerHTML = '';
      $('cmp').innerHTML = '';
      $('viz-caption').textContent = 'Fix the inputs above to draw the chart';
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      CalcShare.writeParams(getState());
      return;
    }

    const yardstick = m.key === 'eav' ? 'equivalent annual value' : 'NPV over ' + m.T + ' years';
    $('r-best-label').textContent = 'Best option (highest ' + yardstick + ')';
    $('r-best').textContent = m.best.name;
    let sub = m.key === 'eav'
      ? money(m.best.eav, true) + ' per year · NPV ' + money(m.best.res.npv, true) + ' over ' + m.T + ' yr'
      : 'NPV ' + money(m.best.res.npv, true) + ' over ' + m.T + ' yr · ' + money(m.best.eav, true) + ' per year';
    if (m.bestVal < -0.5) sub += '. Every option loses money at ' + fmt(m.rateRaw) + '%; this one loses least.';
    else if (m.best.zero) sub += '. None of the other options beats doing nothing at ' + fmt(m.rateRaw) + '%.';
    $('r-best-sub').textContent = sub;

    $('rank-list').innerHTML = m.ranked.map(function (o) {
      const v = m.key === 'eav' ? money(o.eav, true) + '/yr' : money(o.res.npv, true);
      return '<li><span><span class="rank-dot" style="background:var(--cb' + (o.slot + 1) + ')"></span>' + o.rank + '. ' + esc(o.name) + '</span><span class="v">' + v + '</span></li>';
    }).join('');

    renderTable(m);
    $('viz-caption').textContent = 'Cumulative discounted cash flow at ' + fmt(m.rateRaw) + '% over ' + m.T +
      ' years; a line crossing zero marks the discounted payback. Bars: NPV over the period.';
    drawViz(m);
    CalcShare.writeParams(getState());
  }

  function renderTable(m) {
    const o = m.opts;
    const head = '<tr><th scope="col">Metric</th>' + o.map(function (x) {
      return '<th scope="col"><span class="rank-dot" style="background:var(--cb' + (x.slot + 1) + ')"></span>' + esc(short(x.name, 28)) + '</th>';
    }).join('') + '</tr>';
    const row = function (label, f, title) {
      return '<tr><th scope="row"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '</th>' +
        o.map(function (x) { return '<td>' + f(x) + '</td>'; }).join('') + '</tr>';
    };
    const irrText = function (x) {
      if (!isFinite(x.irr.value)) return 'n/a';
      return pct(x.irr.value) + (x.irr.multiple ? '*' : '');
    };
    $('cmp').innerHTML = '<thead>' + head + '</thead><tbody>' +
      row('Rank', function (x) { return '#' + x.rank; }) +
      row('Net present value', function (x) { return money(x.res.npv, true); }, 'PV of benefits minus PV of costs over the analysis period') +
      row('Equivalent annual value', function (x) { return money(x.eav, true) + '/yr'; }, 'NPV of one life × capital recovery factor') +
      row('Benefit–cost ratio', function (x) { return isFinite(x.bcr) ? fmt(x.bcr, 2) : 'n/a'; }, 'PV benefits ÷ PV costs') +
      row('Internal rate of return', irrText) +
      row('Return on investment', function (x) { return isFinite(x.roi) ? pct(x.roi, 0) : 'n/a'; }, '(total benefits − total costs) ÷ total costs, not discounted') +
      row('Simple payback', function (x) { return yrs(x.pay); }) +
      row('Discounted payback', function (x) { return yrs(x.dpay); }) +
      row('Total costs (not discounted)', function (x) { return money(x.res.totC); }) +
      row('Total benefits (not discounted)', function (x) { return money(x.res.totB); }, 'Includes salvage / resale value') +
      row('PV of costs', function (x) { return money(x.res.pvC); }) +
      row('PV of benefits', function (x) { return money(x.res.pvB); }) +
      row('Break-even yearly benefit', function (x) { return x.breakEven <= 0.5 ? (x.zero ? money(0) : 'any (NPV > 0 without it)') : money(x.breakEven) + '/yr'; }, 'First-year benefit that makes NPV = 0') +
      '</tbody>';
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  // The viewBox narrows on phones so labels stay readable (the SVG scales to the card width).
  let VW = 480, VH = 450, NAME = 22;
  const LINE = { l: 56, r: 64, t: 46, b: 270 };   // cumulative chart box (b = y of bottom)
  const BAR = { l: 150, r: 74, t: 336, b: 440 };  // NPV bars box

  function layout() {
    const w = svg.getBoundingClientRect().width || 480;
    VW = w < 440 ? 360 : 480;
    BAR.l = VW < 480 ? 116 : 150;
    NAME = VW < 480 ? 16 : 22;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  }

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function tip(node, text) { el('title', {}, text, node); }

  function niceStep(range, count) {
    const raw = range / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function drawViz(m) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    layout();
    const T = m.T;
    const x0 = LINE.l, x1 = VW - LINE.r, yTop = LINE.t, yBot = LINE.b;

    // Legend (identity never by colour alone: dash pattern + name)
    const colW = (VW - 8) / 2;
    m.opts.forEach(function (o, i) {
      const col = i % 2, rowi = Math.floor(i / 2);
      const lx = 8 + col * colW, ly = 12 + rowi * 16;
      el('line', { x1: lx, y1: ly, x2: lx + 22, y2: ly, class: 'cb-line', style: 'stroke:var(--cb' + (o.slot + 1) + ')', 'stroke-dasharray': DASH[o.slot] });
      el('text', { x: lx + 28, y: ly + 4, class: 'dim-text' }, short(o.name, VW < 480 ? 24 : 30));
    });

    // y scale over all cumulative discounted values
    let lo = 0, hi = 0;
    m.opts.forEach(function (o) { o.res.dcum.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); });
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = function (t) { return x0 + (x1 - x0) * t / T; };
    const Y = function (v) { return yBot - (yBot - yTop) * (v - lo) / (hi - lo); };

    for (let v = lo; v <= hi + step / 2; v += step) {
      el('line', { x1: x0, y1: Y(v), x2: x1, y2: Y(v), class: Math.abs(v) < step / 1e6 ? 'zero-line' : 'grid-line' });
      el('text', { x: x0 - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'dim-text' }, moneyShort(Math.abs(v) < step / 1e6 ? 0 : v));
    }
    const xStep = T <= 10 ? 1 : T <= 20 ? 2 : T <= 30 ? 5 : 10;
    for (let t = 0; t <= T; t += xStep) {
      el('line', { x1: X(t), y1: yBot, x2: X(t), y2: yBot + 4, class: 'axis' });
      el('text', { x: X(t), y: yBot + 17, 'text-anchor': 'middle', class: 'dim-text' }, String(t));
    }
    el('text', { x: (x0 + x1) / 2, y: yBot + 32, 'text-anchor': 'middle', class: 'dim-text' }, 'Year');
    el('line', { x1: x0, y1: yTop, x2: x0, y2: yBot, class: 'axis' });

    // Lines, payback markers, end labels
    const ends = [];
    m.opts.forEach(function (o) {
      const c = 'var(--cb' + (o.slot + 1) + ')';
      const d = o.res.dcum.map(function (v, t) { return (t ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      const path = el('path', { d: d, class: 'cb-line', style: 'stroke:' + c, 'stroke-dasharray': DASH[o.slot] });
      tip(path, o.name + ': NPV ' + money(o.res.npv, true));
      o.res.dcum.forEach(function (v, t) {
        const dot = el('circle', { cx: X(t), cy: Y(v), r: 6, class: 'hit' });
        tip(dot, o.name + ', year ' + t + ': cumulative discounted ' + money(v, true));
      });
      if (o.dpay !== null && isFinite(o.dpay) && o.dpay > 0) {
        const mk = el('circle', { cx: X(o.dpay), cy: Y(0), r: 4.5, class: 'pay-dot', style: 'fill:' + c });
        tip(mk, o.name + ': discounted payback ' + fmt(o.dpay, 1) + ' years');
      }
      ends.push({ y: Y(o.res.dcum[T]), text: moneyShort(o.res.npv), o: o });
    });
    // spread end labels so they do not overlap
    ends.sort(function (a, b) { return a.y - b.y; });
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (let i = ends.length - 2; i >= 0; i--) if (ends[i].y > ends[i + 1].y - 14) ends[i].y = ends[i + 1].y - 14;
    ends.forEach(function (e) {
      el('text', { x: x1 + 6, y: e.y + 4, class: 'end-text' }, e.text);
    });

    // NPV bars
    el('text', { x: 8, y: BAR.t - 12, class: 'strong-text' }, 'Net present value over ' + T + ' years');
    let bl = 0, bh = 0;
    m.opts.forEach(function (o) { bl = Math.min(bl, o.res.npv); bh = Math.max(bh, o.res.npv); });
    if (bh - bl < 1) bh = 1;
    const bx0 = BAR.l, bx1 = VW - BAR.r;
    const BX = function (v) { return bx0 + (bx1 - bx0) * (v - bl) / (bh - bl); };
    const n = m.opts.length;
    const slotH = (BAR.b - BAR.t) / n;
    const barH = Math.min(18, slotH - 6);
    m.opts.forEach(function (o, i) {
      const cy = BAR.t + slotH * (i + 0.5);
      const a = BX(Math.min(0, o.res.npv)), b = BX(Math.max(0, o.res.npv));
      el('text', { x: bx0 - 8, y: cy + 4, 'text-anchor': 'end', class: 'dim-text' }, short(o.name, NAME));
      const w = Math.max(b - a, 1);
      const bar = el('rect', { x: a, y: cy - barH / 2, width: w, height: barH, rx: 3, class: 'cb-bar', style: 'fill:var(--cb' + (o.slot + 1) + ')' });
      tip(bar, o.name + ': NPV ' + money(o.res.npv, true) + ', ' + money(o.eav, true) + ' per year');
      const pos = o.res.npv >= 0;
      el('text', { x: pos ? b + 5 : a - 5, y: cy + 4, 'text-anchor': pos ? 'start' : 'end', class: 'end-text' }, moneyShort(o.res.npv));
    });
    el('line', { x1: BX(0), y1: BAR.t - 2, x2: BX(0), y2: BAR.b + 2, class: 'zero-line' });
  }

  // ---------- State ----------
  function getState() {
    const st = { rate: $('rate').value, period: $('period').value, cur: $('cur').value, method: $('method').value, n: rows.length };
    rows.forEach(function (r, i) {
      const id = r.uid;
      st['on' + i] = $('on' + id).value;
      ['ou', 'os', 'oc', 'ob', 'ol', 'ogb', 'ogc'].forEach(function (k) { st[k + i] = $(k + id).value; });
    });
    return st;
  }

  function applyDefaults() {
    $('rate').value = DEFAULTS.rate;
    $('period').value = DEFAULTS.period;
    $('cur').value = DEFAULTS.cur;
    $('method').value = DEFAULTS.method;
    clearRows();
    DEFAULTS.options.forEach(function (id) { addRow(preset(id)); });
  }

  function resultsText() {
    const m = compute();
    const cur = CURRENCIES.filter(function (x) { return x.id === $('cur').value; })[0];
    const lines = ['Cost Benefit Analysis',
      'Discount rate ' + $('rate').value + '%, analysis period ' + (m.T || '–') + ' years' + ($('period').value.trim() === '' ? ' (longest life)' : '') +
      ', different lives: ' + (m.replace ? 'equivalent annual value, replace like-for-like' : 'common period, no replacement') +
      (cur && cur.sym ? ', currency ' + cur.sym.trim() : '')];
    m.opts.forEach(function (o) {
      lines.push('');
      lines.push(o.name + ': upfront ' + money(o.u) + ', yearly costs ' + money(o.c) + ' (+' + fmt(o.gc * 100) + '%/yr), yearly benefits ' + money(o.b) +
        ' (+' + fmt(o.gb * 100) + '%/yr), life ' + (isFinite(o.l) ? o.l : '–') + ' yr, salvage ' + money(o.s));
      if (m.ok) {
        lines.push('  Rank ' + o.rank + ' · NPV ' + money(o.res.npv, true) + ' · EAV ' + money(o.eav, true) + '/yr · BCR ' + (isFinite(o.bcr) ? fmt(o.bcr, 2) : 'n/a') +
          ' · IRR ' + (isFinite(o.irr.value) ? pct(o.irr.value) : 'n/a') + ' · ROI ' + (isFinite(o.roi) ? pct(o.roi, 0) : 'n/a'));
        lines.push('  Payback ' + yrs(o.pay) + ' (discounted ' + yrs(o.dpay) + ') · total costs ' + money(o.res.totC) + ', total benefits ' + money(o.res.totB) +
          ' · break-even yearly benefit ' + (o.breakEven <= 0.5 ? money(0) : money(o.breakEven)));
      }
    });
    lines.push('');
    if (m.ok) lines.push('Best option: ' + m.best.name + ' (highest ' + (m.key === 'eav' ? 'equivalent annual value' : 'NPV') + ')');
    else lines.push('Inputs incomplete: ' + m.errors.join(' '));
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  ['rate', 'period'].forEach(function (f) { $(f).addEventListener('input', render); });
  ['cur', 'method'].forEach(function (f) { $(f).addEventListener('change', render); });

  CalcUnits.init(render);

  let lastW = 0;
  window.addEventListener('resize', function () {
    const w = svg.getBoundingClientRect().width;
    if (Math.abs(w - lastW) > 1) { lastW = w; render(); }
  });

  CURRENCIES.forEach(function (c) {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.label;
    $('cur').appendChild(o);
  });
  PRESETS.forEach(function (p) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    $('add-preset').appendChild(o);
  });
  $('btn-add').addEventListener('click', function () {
    const id = addRow(preset($('add-preset').value));
    render();
    if (id) $('on' + id).focus();
  });

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Cost Benefit Analysis', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.rate !== undefined && isFinite(parseFloat(p.rate))) $('rate').value = p.rate;
    if (p.period !== undefined && (p.period === '' || isFinite(parseFloat(p.period)))) $('period').value = p.period;
    if (CURRENCIES.some(function (c) { return c.id === p.cur; })) $('cur').value = p.cur;
    if (p.method === 'eav' || p.method === 'npv') $('method').value = p.method;
    const n = parseInt(p.n, 10);
    if (isFinite(n) && n >= MIN_OPTS) {
      clearRows();
      const g = function (k, i, d) { return p[k + i] !== undefined ? p[k + i] : d; };
      for (let i = 0; i < Math.min(n, MAX_OPTS); i++) {
        addRow({
          name: g('on', i, 'Option ' + (i + 1)), u: g('ou', i, 0), s: g('os', i, 0), c: g('oc', i, 0), b: g('ob', i, 0),
          l: g('ol', i, 10), gb: g('ogb', i, 0), gc: g('ogc', i, 0)
        });
      }
    }
    render();
  })();
})();
