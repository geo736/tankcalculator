// Head Loss / Total Dynamic Head Calculator: Darcy-Weisbach (Colebrook) or
// Hazen-Williams pipe friction, Crane TP-410 fitting losses, live SVG, shareable URL.
(function () {
  'use strict';

  const G = 9.80665; // standard gravity, m/s²

  // Water properties at 0.101325 MPa (IAPWS-95 density, IAPWS 2008 viscosity).
  // [°C, density kg/m³, dynamic viscosity mPa·s]
  const WATER = [
    [0, 999.84, 1.7914], [5, 999.97, 1.5182], [10, 999.70, 1.3059], [15, 999.10, 1.1376],
    [20, 998.21, 1.0016], [25, 997.05, 0.8900], [30, 995.65, 0.7972], [35, 994.03, 0.7191],
    [40, 992.22, 0.6527], [45, 990.21, 0.5958], [50, 988.04, 0.5465], [60, 983.20, 0.4660],
    [70, 977.76, 0.4035], [80, 971.79, 0.3541]
  ];

  // PVC Schedule 40 inside diameters (in) = ASTM D1785 outside diameter − 2 × minimum wall.
  const PVC40 = [
    { id: '0.5', name: '1/2"', od: 0.840, wall: 0.109 },
    { id: '0.75', name: '3/4"', od: 1.050, wall: 0.113 },
    { id: '1', name: '1"', od: 1.315, wall: 0.133 },
    { id: '1.25', name: '1-1/4"', od: 1.660, wall: 0.140 },
    { id: '1.5', name: '1-1/2"', od: 1.900, wall: 0.145 },
    { id: '2', name: '2"', od: 2.375, wall: 0.154 },
    { id: '2.5', name: '2-1/2"', od: 2.875, wall: 0.203 },
    { id: '3', name: '3"', od: 3.500, wall: 0.216 },
    { id: '4', name: '4"', od: 4.500, wall: 0.237 },
    { id: '6', name: '6"', od: 6.625, wall: 0.280 },
    { id: '8', name: '8"', od: 8.625, wall: 0.322 }
  ];
  PVC40.forEach(function (p) { p.idIn = +(p.od - 2 * p.wall).toFixed(3); });

  // Crane TP-410 (2009) friction factor in the zone of complete turbulence, fT,
  // tabulated against the inside diameter of Schedule 40 pipe (m).
  const CRANE_FT_D = [0.01576, 0.02096, 0.02664, 0.03508, 0.04094, 0.05248, 0.06268,
    0.07792, 0.10226, 0.1282, 0.154, 0.20274, 0.25446, 0.33334, 0.381, 0.53994, 0.57504, 0.8759];
  const CRANE_FT = [0.026, 0.024, 0.022, 0.021, 0.020, 0.019, 0.018, 0.017, 0.016, 0.015, 0.015,
    0.014, 0.013, 0.013, 0.012, 0.012, 0.011, 0.011];

  // Fittings: K = n × fT (Crane) or a fixed K (entrance / exit).
  const FITTINGS = [
    { id: 'n90', name: '90° standard elbow', n: 30 },
    { id: 'n45', name: '45° standard elbow', n: 16 },
    { id: 'nteer', name: 'Tee, flow through run', n: 20 },
    { id: 'nteeb', name: 'Tee, flow through branch', n: 60 },
    { id: 'nball', name: 'Ball valve (full port, open)', n: 3 },
    { id: 'ncheck', name: 'Swing check valve', n: 100 },
    { id: 'nent', name: 'Pipe entrance (sharp-edged)', k: 0.5 },
    { id: 'nexit', name: 'Pipe exit into tank', k: 1.0 }
  ];

  // Hazen-Williams C and absolute roughness ε (mm) for clean, new pipe.
  const MATERIALS = {
    pvc: { name: 'PVC / CPVC', C: 150, eps: 0.0015 },
    pe: { name: 'Polyethylene (HDPE / LDPE)', C: 150, eps: 0.0015 },
    copper: { name: 'Copper tubing', C: 150, eps: 0.0015 },
    steel: { name: 'Commercial steel (new)', C: 120, eps: 0.045 },
    galv: { name: 'Galvanized iron', C: 120, eps: 0.15 },
    castiron: { name: 'Cast iron (unlined)', C: 100, eps: 0.26 }
  };

  const DEFAULTS = {
    method: 'dw', pipe: '1.5', mat: 'pvc',
    flow: [20, 'gpm'], len: [50, 'ft'], lift: [5, 'ft'], temp: [77, 'F'], eps: [0.0015, 'mm'],
    C: 150, n90: 4, n45: 0, nteer: 1, nteeb: 0, nball: 1, ncheck: 1, nent: 1, nexit: 1,
    outLen: 'ft', outP: 'psi'
  };

  const $ = function (id) { return document.getElementById(id); };
  const methodButtons = document.querySelectorAll('#method-group button');
  const pipeSel = $('pipe');
  const matSel = $('mat');
  const svg = $('viz');
  let method = 'dw';

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + ' ' + CalcUnits.unitLabel(id);
  }
  function lenOut(m) {
    const u = $('out-len').value;
    return fmt(CalcUnits.convert('length', m, 'm', u)) + ' ' + CalcUnits.label('length', u);
  }
  function pOut(pa) {
    const u = $('out-p').value;
    return fmt(CalcUnits.convert('pressure', pa, 'Pa', u)) + ' ' + CalcUnits.label('pressure', u);
  }
  function count(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  // ---------- Physics ----------
  function water(tC) {
    const t = Math.min(80, Math.max(0, tC));
    let i = 0;
    while (i < WATER.length - 2 && WATER[i + 1][0] < t) i++;
    const a = WATER[i], b = WATER[i + 1];
    const x = (t - a[0]) / (b[0] - a[0]);
    const rho = a[1] + (b[1] - a[1]) * x;
    const mu = Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * x) / 1000; // Pa·s
    return { rho: rho, mu: mu, nu: mu / rho };
  }

  function craneFT(D) {
    if (D <= CRANE_FT_D[0]) return CRANE_FT[0];
    const last = CRANE_FT_D.length - 1;
    if (D >= CRANE_FT_D[last]) return CRANE_FT[last];
    let i = 0;
    while (CRANE_FT_D[i + 1] < D) i++;
    const x = (D - CRANE_FT_D[i]) / (CRANE_FT_D[i + 1] - CRANE_FT_D[i]);
    return CRANE_FT[i] + (CRANE_FT[i + 1] - CRANE_FT[i]) * x;
  }

  function swameeJain(Re, rel) {
    const t = Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9));
    return 0.25 / (t * t);
  }

  // Colebrook (1939), solved by fixed-point iteration on 1/√f, starting from Swamee-Jain.
  function colebrook(Re, rel) {
    let x = 1 / Math.sqrt(swameeJain(Re, rel));
    for (let i = 0; i < 50; i++) {
      const nx = -2 * Math.log10(rel / 3.7 + 2.51 * x / Re);
      if (Math.abs(nx - x) < 1e-12) { x = nx; break; }
      x = nx;
    }
    return 1 / (x * x);
  }

  function compute() {
    const Q = CalcUnits.base('flow') / 1000;   // m³/s
    const D = CalcUnits.base('diam');          // m
    const L = CalcUnits.base('len');           // m
    const liftRaw = CalcUnits.baseSigned('lift');
    const lift = isFinite(liftRaw) ? Math.max(0, liftRaw) : 0;
    const eps = CalcUnits.base('eps');         // m (0 allowed = smooth)
    const C = parseFloat($('C').value);
    const tRaw = CalcUnits.baseSigned('temp');
    const tC = isFinite(tRaw) ? tRaw : 20;
    const w = water(tC);

    const r = { Q: Q, D: D, L: L, lift: lift, liftRaw: liftRaw, eps: eps, C: C, tC: tC, w: w, ok: Q > 0 && D > 0 };
    if (!r.ok) return r;

    const A = Math.PI * D * D / 4;
    const V = Q / A;
    const hv = V * V / (2 * G);
    const Re = V * D / w.nu;
    const rel = eps / D;
    r.A = A; r.V = V; r.hv = hv; r.Re = Re; r.rel = rel;
    r.regime = Re < 2000 ? 'laminar' : Re < 4000 ? 'transitional' : 'turbulent';

    if (Re < 2000) { r.f = 64 / Re; r.fSJ = NaN; }
    else { r.f = colebrook(Re, rel); r.fSJ = swameeJain(Re, rel); }

    if (method === 'hw') {
      r.hwOk = C > 0;
      // V = 0.849 C R^0.63 S^0.54 (SI), R = D/4  ⇒  S = (V / (0.849 C R^0.63))^(1/0.54)
      r.S = r.hwOk ? Math.pow(V / (0.849 * C * Math.pow(D / 4, 0.63)), 1 / 0.54) : NaN;
      r.hf = r.hwOk ? r.S * L : NaN;
    } else {
      r.hf = r.f * (L / D) * hv;
      r.S = r.f / D * hv;
    }

    r.fT = craneFT(D);
    r.items = FITTINGS.map(function (f) {
      const K = f.k !== undefined ? f.k : f.n * r.fT;
      const c = count(f.id);
      return { f: f, K: K, count: c, Ksum: K * c };
    });
    r.Ksum = r.items.reduce(function (s, it) { return s + it.Ksum; }, 0);
    r.hm = r.Ksum * hv;
    r.tdh = lift + (isFinite(r.hf) ? r.hf : 0) + r.hm;
    r.pressure = w.rho * G * r.tdh;            // Pa
    r.power = w.rho * G * Q * r.tdh;           // W
    return r;
  }

  // ---------- UI state ----------
  function setMethod(m) {
    method = m;
    methodButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.method === m)); });
    $('field-c').hidden = m !== 'hw';
    $('field-eps').hidden = m === 'hw';
  }

  function applyPipe() {
    const p = PVC40.filter(function (x) { return x.id === pipeSel.value; })[0];
    if (!p) return;
    const u = CalcUnits.unit('diam') || 'in';
    $('diam').value = +CalcUnits.convert('length', p.idIn, 'in', u).toPrecision(6);
  }

  function applyMaterial() {
    const m = MATERIALS[matSel.value];
    if (!m) return;
    $('C').value = m.C;
    const u = CalcUnits.unit('eps') || 'mm';
    $('eps').value = +CalcUnits.convert('length', m.eps, 'mm', u).toPrecision(6);
  }

  const UNIT_INPUTS = ['flow', 'diam', 'len', 'lift', 'temp', 'eps'];
  const COUNT_INPUTS = FITTINGS.map(function (f) { return f.id; });

  function getState() {
    const st = { method: method, pipe: pipeSel.value, mat: matSel.value };
    UNIT_INPUTS.forEach(function (id) {
      if (id === 'eps' && method === 'hw') return;
      st[id] = $(id).value;
      st[id + '_u'] = CalcUnits.unit(id);
    });
    if (method === 'hw') st.C = $('C').value;
    COUNT_INPUTS.forEach(function (id) { st[id] = $(id).value; });
    st.out = $('out-len').value;
    st.outp = $('out-p').value;
    return st;
  }

  function applyDefaults() {
    pipeSel.value = DEFAULTS.pipe;
    matSel.value = DEFAULTS.mat;
    ['flow', 'len', 'lift', 'temp', 'eps'].forEach(function (id) { CalcUnits.set(id, DEFAULTS[id][0], DEFAULTS[id][1]); });
    CalcUnits.set('diam', 1.61, 'in');
    applyPipe();
    $('C').value = DEFAULTS.C;
    COUNT_INPUTS.forEach(function (id) { $(id).value = DEFAULTS[id]; });
    $('out-len').value = DEFAULTS.outLen;
    $('out-p').value = DEFAULTS.outP;
    setMethod(DEFAULTS.method);
  }

  function velocityBand(V) {
    if (V < 0.3) return 'low – solids may settle (rule of thumb)';
    if (V <= 1.5) return 'typical range (rule of thumb)';
    if (V <= 2.4) return 'high – more friction and water hammer';
    return 'very high – consider a larger pipe';
  }

  // ---------- Render ----------
  function render() {
    const r = compute();
    const notes = [];
    const notice = $('notice');

    if (!r.ok) {
      notes.push('Enter a flow rate and a pipe inside diameter to see the result.');
    } else {
      if (r.tC < 0 || r.tC > 80) notes.push('Water properties are only tabulated from 0 to 80 °C (32–176 °F); using the nearest limit.');
      if (isFinite(r.liftRaw) && r.liftRaw < 0) notes.push('Static lift below zero is treated as 0 (gravity-assisted flow is not modelled).');
      if (method === 'hw' && !r.hwOk) notes.push('Enter a Hazen-Williams C above zero.');
      if (r.regime === 'laminar') notes.push('Flow is laminar (Re < 2,000). Pipe friction uses f = 64/Re; Crane fitting K values are for turbulent flow and underestimate laminar fitting losses.');
      else if (r.regime === 'transitional') notes.push('Flow is transitional (Re 2,000–4,000), where friction is unpredictable. The turbulent (Colebrook) value is used.');
      if (method === 'hw' && r.hwOk) {
        if (r.D < 0.0508) notes.push('Hazen-Williams is usually quoted for pipes of about 2 in (50 mm) and larger; Darcy-Weisbach is more reliable for small pipe.');
        else if (r.V > 3) notes.push('Hazen-Williams is usually quoted for velocities below about 3 m/s (10 ft/s).');
        if (r.tC < 5 || r.tC > 30) notes.push('Hazen-Williams ignores water temperature. Use Darcy-Weisbach for cold or warm water.');
      }
      if (method === 'dw' && r.Re >= 4000 && (r.rel > 0.01 || r.Re > 1e8)) notes.push('Outside the stated range of the Swamee-Jain equation; the Colebrook result is still shown.');
    }
    notice.innerHTML = '';
    notes.forEach(function (n) { const p = document.createElement('div'); p.textContent = n; notice.appendChild(p); });
    notice.hidden = notes.length === 0;

    const good = r.ok && isFinite(r.tdh) && !(method === 'hw' && !r.hwOk);
    const dash = '–';
    $('r-tdh').textContent = good ? lenOut(r.tdh) : dash;
    $('r-press').textContent = good ? pOut(r.pressure) : dash;
    $('r-static').textContent = good ? lenOut(r.lift) : dash;
    $('r-fric').textContent = good ? lenOut(r.hf) : dash;
    $('r-minor').textContent = good ? lenOut(r.hm) + ' (ΣK ' + fmt(r.Ksum, 2) + ')' : dash;
    $('r-vel').textContent = r.ok ? fmt(r.V, 2) + ' m/s · ' + fmt(r.V / 0.3048, 2) + ' ft/s' : dash;
    $('r-velband').textContent = r.ok ? velocityBand(r.V) : dash;
    $('r-re').textContent = r.ok ? fmt(Math.round(r.Re), 0) + ' (' + r.regime + ')' : dash;
    $('r-f').textContent = r.ok
      ? fmt(r.f, 4) + (isFinite(r.fSJ) ? ' (Swamee-Jain ' + fmt(r.fSJ, 4) + ')' : ' (64/Re)') + (method === 'hw' ? ' – not used' : '')
      : dash;
    const ou = CalcUnits.label('length', $('out-len').value);
    $('r-grad').textContent = good && r.L > 0 ? fmt(r.hf / r.L * 100) + ' ' + ou + ' per 100 ' + ou : dash;
    $('r-power').textContent = good ? fmt(r.power, r.power >= 100 ? 0 : 1) + ' W · ' + fmt(r.power / 745.69987158227, 3) + ' hp' : dash;
    $('r-water').textContent = r.ok ? fmt(r.w.rho, 1) + ' kg/m³ · ν ' + fmt(r.w.nu * 1e6, 3) + ' mm²/s' : dash;

    $('viz-caption').textContent = good
      ? 'TDH ' + lenOut(r.tdh) + ' = static ' + lenOut(r.lift) + ' + pipe ' + lenOut(r.hf) + ' + fittings ' + lenOut(r.hm)
      : 'Enter flow and pipe size to draw the head breakdown';

    drawViz(r, good);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }

  function drawViz(r, good) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const y0 = 262;        // lower water surface = datum
    const topY = 34;       // top of the TDH bar
    const tdh = good ? r.tdh : 0;
    const s = tdh > 0 ? (y0 - topY) / tdh : 0;
    const yStatic = good ? y0 - r.lift * s : y0;

    // Lower tank (sump / fish tank)
    const tx0 = 14, tx1 = 98, tTop = 236, tBot = 300;
    el('rect', { class: 'tank-glass', x: tx0, y: tTop, width: tx1 - tx0, height: tBot - tTop });
    el('rect', { class: 'water', x: tx0, y: y0, width: tx1 - tx0, height: tBot - y0 });
    el('line', { class: 'water-top', x1: tx0, y1: y0, x2: tx1, y2: y0 });
    el('path', { class: 'tank-line', d: 'M' + tx0 + ',' + tTop + ' V' + tBot + ' H' + tx1 + ' V' + tTop });
    el('text', { x: (tx0 + tx1) / 2, y: tBot + 16, 'text-anchor': 'middle', class: 'dim-text' }, 'sump');

    // Upper tank (grow bed / header tank); water surface at yStatic
    const ux0 = 214, ux1 = 290;
    const uTop = yStatic - 26, uBot = yStatic + 30;
    el('rect', { class: 'tank-glass', x: ux0, y: uTop, width: ux1 - ux0, height: uBot - uTop });
    el('rect', { class: 'water', x: ux0, y: yStatic, width: ux1 - ux0, height: uBot - yStatic });
    el('line', { class: 'water-top', x1: ux0, y1: yStatic, x2: ux1, y2: yStatic });
    el('path', { class: 'tank-line', d: 'M' + ux0 + ',' + uTop + ' V' + uBot + ' H' + ux1 + ' V' + uTop });

    // Pipe run: tank outlet → pump → riser → over the top → down into upper tank
    const py = 286, pumpX = 128, riserX = 186, outX = 244;
    const riseTop = uTop - 14;
    const pipeD = 'M' + tx1 + ',' + py + ' H' + riserX + ' V' + riseTop + ' H' + outX + ' V' + (uTop + 14);
    el('path', { class: 'hl-pipe', d: pipeD });
    el('path', { class: 'hl-pipe-water', d: pipeD });
    // Flow arrow on the riser
    const ay = (py + riseTop) / 2;
    el('path', { class: 'hl-arrow', d: 'M' + (riserX - 5) + ',' + (ay + 4) + ' L' + riserX + ',' + (ay - 4) + ' L' + (riserX + 5) + ',' + (ay + 4) });

    // Pump
    el('circle', { class: 'hl-pump', cx: pumpX, cy: py, r: 13 });
    el('path', { class: 'hl-pump-mark', d: 'M' + (pumpX - 6) + ',' + (py + 5) + ' L' + (pumpX + 7) + ',' + py + ' L' + (pumpX - 6) + ',' + (py - 5) + 'Z' });
    el('text', { x: pumpX, y: tBot + 16, 'text-anchor': 'middle', class: 'dim-text' }, 'pump');

    // Valve symbols on the riser (only if present)
    if (good) {
      let vy = py - 26;
      if (count('ncheck') > 0) {
        el('path', { class: 'hl-valve', d: 'M' + (riserX - 7) + ',' + (vy - 7) + ' L' + (riserX + 7) + ',' + (vy - 7) + ' L' + (riserX - 7) + ',' + (vy + 7) + ' L' + (riserX + 7) + ',' + (vy + 7) + 'Z' });
        el('text', { x: riserX - 11, y: vy + 4, 'text-anchor': 'end', class: 'dim-text' }, 'check');
        vy -= 24;
      }
      if (count('nball') > 0 && vy > riseTop + 10) {
        el('path', { class: 'hl-valve', d: 'M' + (riserX - 7) + ',' + (vy - 7) + ' L' + (riserX + 7) + ',' + (vy - 7) + ' L' + (riserX - 7) + ',' + (vy + 7) + ' L' + (riserX + 7) + ',' + (vy + 7) + 'Z' });
        el('circle', { class: 'hl-valve-dot', cx: riserX, cy: vy, r: 2.5 });
        el('text', { x: riserX - 11, y: vy + 4, 'text-anchor': 'end', class: 'dim-text' }, 'valve');
      }
    }

    // Pipe label
    const pipeLabel = good ? 'L ' + typed('len') + ', ID ' + typed('diam') : 'pipe';
    el('text', { x: 196, y: tBot + 16, 'text-anchor': 'middle', class: 'dim-text' }, pipeLabel);

    // Stacked TDH bar
    const bx = 318, bw = 34;
    el('line', { class: 'depth-line', x1: tx1, y1: y0, x2: bx + bw, y2: y0 });
    if (!good || !(tdh > 0)) {
      el('rect', { class: 'tank-back', x: bx, y: topY, width: bw, height: y0 - topY });
      el('text', { x: bx + bw / 2, y: topY - 10, 'text-anchor': 'middle', class: 'dim-text' }, good ? 'TDH 0' : 'TDH');
      return;
    }
    el('line', { class: 'depth-line', x1: ux1, y1: yStatic, x2: bx, y2: yStatic });

    const segs = [
      { key: 'static', name: 'Static', v: r.lift },
      { key: 'fric', name: 'Pipe', v: r.hf },
      { key: 'fit', name: 'Fittings', v: r.hm }
    ];
    let y = y0;
    const labels = [];
    segs.forEach(function (sg) {
      const h = sg.v * s;
      if (h > 0) el('rect', { class: 'hl-seg-' + sg.key, x: bx, y: y - h, width: bw, height: h });
      labels.push({ y: y - h / 2, text: sg.name + ' ' + lenOut(sg.v), key: sg.key });
      y -= h;
    });
    el('rect', { class: 'hl-bar-outline', x: bx, y: topY, width: bw, height: y0 - topY });

    // Spread labels so they never overlap (min 15 px apart), keep inside the box.
    labels.sort(function (a, b) { return b.y - a.y; });
    for (let i = 0; i < labels.length; i++) {
      labels[i].y = Math.min(labels[i].y, y0 - 2);
      if (i > 0 && labels[i - 1].y - labels[i].y < 15) labels[i].y = labels[i - 1].y - 15;
    }
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].y < topY + 8) labels[i].y = topY + 8;
      if (i < labels.length - 1 && labels[i].y - labels[i + 1].y < 15) labels[i].y = labels[i + 1].y + 15;
    }
    labels.forEach(function (lb) {
      el('rect', { class: 'hl-seg-' + lb.key, x: bx + bw + 6, y: lb.y - 8, width: 8, height: 8, rx: 2 });
      el('text', { x: bx + bw + 18, y: lb.y, class: 'dim-text' }, lb.text);
    });
    el('text', { x: bx + bw / 2, y: topY - 10, 'text-anchor': 'middle', class: 'hl-total' }, 'TDH ' + lenOut(tdh));
    // Static lift dimension next to the upper tank
    if (r.lift * s > 18) {
      el('path', { class: 'dim', d: 'M302,' + y0 + ' V' + yStatic });
      el('text', { x: 298, y: (y0 + yStatic) / 2 + 4, 'text-anchor': 'end', class: 'depth-text' }, 'lift');
    }
  }

  // ---------- Results text ----------
  function resultsText() {
    const r = compute();
    const good = r.ok && isFinite(r.tdh) && !(method === 'hw' && !r.hwOk);
    const lines = [
      'Head Loss / Total Dynamic Head Calculator',
      'Method: ' + (method === 'hw' ? 'Hazen-Williams, C = ' + $('C').value : 'Darcy-Weisbach (Colebrook), roughness ' + typed('eps')),
      'Flow ' + typed('flow') + ', pipe ID ' + typed('diam') + (pipeSel.value !== 'custom' ? ' (' + pipeSel.options[pipeSel.selectedIndex].text + ')' : '') +
        ', length ' + typed('len') + ', static lift ' + typed('lift') + ', water ' + typed('temp'),
      'Material: ' + matSel.options[matSel.selectedIndex].text,
      'Fittings: ' + FITTINGS.filter(function (f) { return count(f.id) > 0; }).map(function (f) { return count(f.id) + ' × ' + f.name; }).join(', ')
    ];
    if (good) {
      lines.push(
        'Total dynamic head: ' + lenOut(r.tdh) + ' (' + pOut(r.pressure) + ')',
        '  Static lift: ' + lenOut(r.lift),
        '  Pipe friction: ' + lenOut(r.hf),
        '  Fittings: ' + lenOut(r.hm) + ' (ΣK ' + fmt(r.Ksum, 2) + ')',
        'Velocity: ' + fmt(r.V, 2) + ' m/s (' + fmt(r.V / 0.3048, 2) + ' ft/s), Reynolds number ' + fmt(Math.round(r.Re), 0),
        'Hydraulic power: ' + fmt(r.power, 1) + ' W (' + fmt(r.power / 745.69987158227, 3) + ' hp)'
      );
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Fitting K table (in the article) ----------
  function fillKTable() {
    const body = $('k-table-body');
    if (!body) return;
    const D = PVC40.filter(function (p) { return p.id === DEFAULTS.pipe; })[0].idIn * 0.0254;
    const fT = craneFT(D);
    FITTINGS.forEach(function (f) {
      const tr = document.createElement('tr');
      [f.name, f.k !== undefined ? '—' : f.n + ' fT', fmt(f.k !== undefined ? f.k : f.n * fT, 2)].forEach(function (t) {
        const td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  // ---------- Events ----------
  // Build select options
  PVC40.forEach(function (p) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name + ' Sch 40 PVC (ID ' + p.idIn.toFixed(3) + ' in)';
    pipeSel.appendChild(o);
  });
  (function () {
    const o = document.createElement('option'); o.value = 'custom'; o.textContent = 'Custom inside diameter';
    pipeSel.appendChild(o);
    Object.keys(MATERIALS).forEach(function (k) {
      const m = document.createElement('option'); m.value = k; m.textContent = MATERIALS[k].name;
      matSel.appendChild(m);
    });
    const c = document.createElement('option'); c.value = 'custom'; c.textContent = 'Custom C / roughness';
    matSel.appendChild(c);
  })();

  methodButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMethod(b.dataset.method); render(); });
  });
  pipeSel.addEventListener('change', function () { applyPipe(); render(); });
  matSel.addEventListener('change', function () { applyMaterial(); render(); });
  $('diam').addEventListener('input', function () { pipeSel.value = 'custom'; render(); });
  ['C', 'eps'].forEach(function (id) {
    $(id).addEventListener('input', function () { matSel.value = 'custom'; render(); });
  });
  ['flow', 'len', 'lift', 'temp'].concat(COUNT_INPUTS).forEach(function (id) { $(id).addEventListener('input', render); });

  CalcUnits.init(render);

  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Head Loss / Total Dynamic Head Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    fillKTable();
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.method === 'hw' || p.method === 'dw') setMethod(p.method);
    if (p.out && CalcUnits.unitDef('length', p.out)) $('out-len').value = p.out;
    if (p.outp && CalcUnits.unitDef('pressure', p.outp)) $('out-p').value = p.outp;
    if (p.mat && (MATERIALS[p.mat] || p.mat === 'custom')) { matSel.value = p.mat; applyMaterial(); }
    UNIT_INPUTS.forEach(function (id) {
      const u = p[id + '_u'];
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) CalcUnits.set(id, p[id], u);
      else if (u) CalcUnits.set(id, $(id).value, u);
    });
    if (p.pipe && pipeSel.querySelector('option[value="' + p.pipe + '"]')) {
      pipeSel.value = p.pipe;
      if (p.diam === undefined) applyPipe();
    } else if (p.diam !== undefined) {
      pipeSel.value = 'custom';
    }
    if (p.C !== undefined && isFinite(parseFloat(p.C))) $('C').value = p.C;
    COUNT_INPUTS.forEach(function (id) {
      if (p[id] !== undefined && isFinite(parseFloat(p[id]))) $(id).value = p[id];
    });
    render();
  })();
})();
