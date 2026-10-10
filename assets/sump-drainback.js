// Sump Drain-Back Calculator: water that drains back to the sump when the pump stops,
// sump free capacity and operating band, live side-view diagram, shareable URL state.
(function () {
  'use strict';

  // ---------- Data ----------
  // ASTM D1785 Schedule 40 PVC: outside diameter and minimum wall (inches).
  // Inside diameter = OD - 2 x minimum wall (same table as water-velocity.js / head-loss.js).
  const PIPES = [
    { id: '1/2', label: '½″', od: 0.840, w: 0.109 },
    { id: '3/4', label: '¾″', od: 1.050, w: 0.113 },
    { id: '1', label: '1″', od: 1.315, w: 0.133 },
    { id: '1-1/4', label: '1¼″', od: 1.660, w: 0.140 },
    { id: '1-1/2', label: '1½″', od: 1.900, w: 0.145 },
    { id: '2', label: '2″', od: 2.375, w: 0.154 },
    { id: '2-1/2', label: '2½″', od: 2.875, w: 0.203 },
    { id: '3', label: '3″', od: 3.500, w: 0.216 },
    { id: '4', label: '4″', od: 4.500, w: 0.237 },
    { id: '6', label: '6″', od: 6.625, w: 0.280 }
  ];
  const IN = 0.0254;
  function pipeIdIn(p) { return +(p.od - 2 * p.w).toFixed(3); }
  function pipeById(id) { return PIPES.filter(function (p) { return p.id === id; })[0] || null; }

  // Field kinds: len (length group), vol (volume group), pct, count, shape, pipe.
  const FIELD_KIND = { sh: 'shape', s: 'pipe', l: 'len', w: 'len', d: 'len', h: 'len', p: 'pct', q: 'count', v: 'vol' };

  const TYPES = {
    tank: {
      name: 'Tank with an overflow', fields: ['sh', 'l', 'w', 'd', 'h', 'q'],
      labels: { h: 'Water above overflow lip', q: 'Number of tanks' },
      hint: 'Height of the running water surface above the overflow lip, weir or standpipe top. Usually about 1–3 cm; measure it.',
      def: { n: 'Fish tank', sh: 'round', l: 100, w: 100, d: 100, h: 2, q: 1 }
    },
    full: {
      name: 'Drains completely', fields: ['sh', 'l', 'w', 'd', 'h', 'q'],
      labels: { h: 'Water depth', q: 'Number' },
      hint: 'For a tank or bed whose outlet is at the bottom, with nothing to stop it draining empty.',
      def: { n: 'Tank that drains empty', sh: 'rect', l: 100, w: 100, d: 100, h: 30, q: 1 }
    },
    media: {
      name: 'Media bed (flood & drain)', fields: ['l', 'w', 'h', 'p', 'q'],
      labels: { h: 'Flooded depth', q: 'Number of beds' },
      hint: 'Porosity: expanded clay about 40%, lava rock about 45%, gravel about 38% (typical values).',
      def: { n: 'Media bed', l: 100, w: 100, h: 25, p: 40, q: 1 }
    },
    dwc: {
      name: 'DWC raft canal', fields: ['l', 'w', 'h', 'q'],
      labels: { h: 'Water above outlet', q: 'Number of canals' },
      hint: 'With an overflow standpipe only the head over it drains (1–2 cm). With a bottom outlet use the whole water depth.',
      def: { n: 'DWC canal', l: 200, w: 100, h: 2, q: 1 }
    },
    nft: {
      name: 'NFT channels', fields: ['q', 'l', 'w', 'h'],
      labels: { q: 'Channels', l: 'Channel length', w: 'Film width', h: 'Film depth' },
      hint: 'Film width = channel floor width. The film is usually a few millimetres deep; measure it with the pump running.',
      def: { n: 'NFT channels', q: 6, l: 300, w: 10, h: 5 }
    },
    pipe: {
      name: 'Pipe run', fields: ['s', 'd', 'l', 'q'],
      labels: { l: 'Length', q: 'Number of runs' },
      hint: 'Return line from the pump, and drain lines above the sump water level. Counted as full.',
      def: { n: 'Pipe', s: '1-1/2', d: 1.61, l: 2, q: 1 }
    },
    siphon: {
      name: 'Back-siphon through return line', fields: ['sh', 'l', 'w', 'd', 'h', 'q'],
      labels: { h: 'Drop until outlet uncovers', q: 'Number of tanks' },
      hint: 'Area of the tank the return pipe ends in, and the height from the overflow lip down to the pipe outlet, or to a siphon-break hole if there is one.',
      def: { n: 'Back-siphon', sh: 'round', l: 100, w: 100, d: 100, h: 5, q: 1 }
    },
    other: {
      name: 'Other known volume', fields: ['v', 'q'],
      labels: { v: 'Volume that drains', q: 'Number' },
      hint: 'Filters, swirl separators or anything else whose drain-back volume you know.',
      def: { n: 'Filter', v: 20, q: 1 }
    }
  };

  const DEFAULT_LEN_UNIT = { l: 'cm', w: 'cm', d: 'cm', h: 'cm' };
  const UNIT_OVERRIDE = { nft: { h: 'mm' }, pipe: { l: 'm', d: 'in' } };

  const DEFAULTS = {
    sshape: 'rect', slen: 120, swid: 80, sdia: 100, sdepth: 60, srun: 25, smin: 15, smargin: 25, out: 'L',
    rows: [
      { t: 'tank', n: 'Fish tank (over standpipe)', sh: 'round', l: 120, w: 100, d: 120, h: 2, q: 1 },
      { t: 'media', n: 'Media beds', l: 120, w: 100, h: 25, p: 40, q: 2 },
      { t: 'pipe', n: 'Return line', s: '1', d: 1.049, l: 4, q: 1 },
      { t: 'pipe', n: 'Drain line', s: '2', d: 2.067, l: 3, q: 1 },
      { t: 'siphon', n: 'Back-siphon, fish tank', sh: 'round', l: 120, w: 100, d: 120, h: 5, q: 1 }
    ]
  };

  const MAX_ROWS = 10;
  const COLORS = ['var(--water)', 'var(--accent)', 'var(--c-hydroponics)', '#c7792b', '#8a63c9', 'var(--c-aquaculture)', '#c4537a', '#3aa7a0', '#9c8a2e', '#6c7fa8'];
  const SUMP_LEN = ['slen', 'swid', 'sdia', 'sdepth', 'srun', 'smin'];

  const $ = function (id) { return document.getElementById(id); };
  const svg = $('viz');
  const listEl = $('src-list');
  const outSel = $('out');

  let uid = 0;
  let rows = []; // [{ uid, t, el }]

  // ---------- Formatting ----------
  function fmt(n, maxFrac) {
    if (!isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function volOut(L) { // L -> chosen output unit
    const u = outSel.value;
    return fmt(CalcUnits.convert('volume', L, 'L', u)) + ' ' + CalcUnits.label('volume', u);
  }
  function volShort(L) {
    const u = outSel.value;
    const v = CalcUnits.convert('volume', L, 'L', u);
    return fmt(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) + ' ' + CalcUnits.label('volume', u);
  }
  function depthOut(m) { // metres -> sump depth unit
    return fmt(CalcUnits.fromBase('sdepth', m)) + ' ' + CalcUnits.unitLabel('sdepth');
  }
  function typed(id) {
    const v = parseFloat($(id).value);
    return (isFinite(v) ? v : 0) + (CalcUnits.unitLabel(id) ? ' ' + CalcUnits.unitLabel(id) : '');
  }
  function numRaw(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }

  // ---------- Source rows ----------
  // Unit selects in rows are created after CalcUnits.init, so wire them like units.js does.
  function wireUnitSelect(sel, inputId, group, unitId) {
    CalcUnits.GROUPS[group].units.forEach(function (u) {
      const o = document.createElement('option');
      o.value = u.id;
      o.textContent = u.label;
      sel.appendChild(o);
    });
    sel.value = CalcUnits.unitDef(group, unitId) ? unitId : CalcUnits.GROUPS[group].base;
    sel.dataset.prev = sel.value;
    sel.addEventListener('change', function () {
      const input = $(inputId);
      const v = parseFloat(input.value);
      if (isFinite(v)) input.value = +CalcUnits.convert(group, v, sel.dataset.prev, sel.value).toPrecision(6);
      sel.dataset.prev = sel.value;
      render();
    });
  }

  function defaultUnit(t, k) {
    if (UNIT_OVERRIDE[t] && UNIT_OVERRIDE[t][k]) return UNIT_OVERRIDE[t][k];
    if (FIELD_KIND[k] === 'vol') return 'L';
    return DEFAULT_LEN_UNIT[k] || 'cm';
  }

  function fieldLabel(t, k) {
    const own = TYPES[t].labels[k];
    if (own) return own;
    return { sh: 'Shape', s: 'Pipe size', l: 'Length', w: 'Width', d: t === 'pipe' ? 'Inside diameter' : 'Diameter', p: 'Porosity', q: 'Number', v: 'Volume' }[k];
  }

  function fieldHtml(id, t, k) {
    const fid = 'f' + id + k;
    const lab = '<label for="' + fid + '">' + fieldLabel(t, k) + '</label>';
    const kind = FIELD_KIND[k];
    if (kind === 'shape') {
      return '<div class="field" data-k="sh">' + lab + '<select id="' + fid + '"><option value="rect">Rectangular</option><option value="round">Round</option></select></div>';
    }
    if (kind === 'pipe') {
      let opts = PIPES.map(function (p) { return '<option value="' + p.id + '">' + p.label + ' Sch 40 (ID ' + pipeIdIn(p).toFixed(3) + '″)</option>'; }).join('');
      opts += '<option value="custom">Custom inside diameter</option>';
      return '<div class="field wide" data-k="s">' + lab + '<select id="' + fid + '">' + opts + '</select></div>';
    }
    let suffix = '';
    if (kind === 'len' || kind === 'vol') {
      suffix = '<select class="unit-select" data-unit-group="' + (kind === 'len' ? 'length' : 'volume') + '" data-unit-for="' + fid + '" aria-label="' + fieldLabel(t, k) + ' unit"></select>';
    } else if (kind === 'pct') {
      suffix = '<span class="unit">%</span>';
    }
    const step = kind === 'count' ? '1' : 'any';
    const mode = kind === 'count' ? 'numeric' : 'decimal';
    return '<div class="field" data-k="' + k + '">' + lab + '<div class="input-row"><input id="' + fid + '" type="number" inputmode="' + mode + '" min="0" step="' + step + '">' + suffix + '</div></div>';
  }

  function addRow(src) {
    if (rows.length >= MAX_ROWS || !TYPES[src.t]) return null;
    const id = ++uid;
    const T = TYPES[src.t];
    const def = T.def;
    const el = document.createElement('div');
    el.className = 'src-row';
    el.innerHTML =
      '<div class="src-head"><span class="swatch" aria-hidden="true"></span>' +
      '<input type="text" id="f' + id + 'n" aria-label="Source name" maxlength="40">' +
      '<button type="button" class="src-remove" aria-label="Remove source">×</button></div>' +
      '<div class="src-type"><strong>' + T.name + '</strong></div>' +
      '<div class="src-grid">' + T.fields.map(function (k) { return fieldHtml(id, src.t, k); }).join('') + '</div>' +
      '<div class="field-hint">' + T.hint + '</div>' +
      '<div class="src-vol">Drains back: <strong id="f' + id + 'out">–</strong></div>';
    listEl.appendChild(el);

    $('f' + id + 'n').value = src.n !== undefined ? src.n : def.n;
    T.fields.forEach(function (k) {
      const fid = 'f' + id + k;
      const kind = FIELD_KIND[k];
      const val = src[k] !== undefined ? src[k] : def[k];
      if (kind === 'shape') {
        $(fid).value = val === 'round' ? 'round' : 'rect';
        $(fid).addEventListener('change', function () { applyRowVisibility(id, src.t); render(); });
      } else if (kind === 'pipe') {
        $(fid).value = pipeById(val) ? val : (val === 'custom' ? 'custom' : def.s);
        $(fid).addEventListener('change', function () {
          // Switching to custom starts from the preset's inside diameter.
          const p = pipeById(prevPipe[id]);
          if ($(fid).value === 'custom' && p) {
            const dSel = el.querySelector('select[data-unit-for="f' + id + 'd"]');
            $('f' + id + 'd').value = +CalcUnits.convert('length', pipeIdIn(p), 'in', dSel.value).toPrecision(6);
          }
          prevPipe[id] = $(fid).value;
          applyRowVisibility(id, src.t);
          render();
        });
        prevPipe[id] = $(fid).value;
      } else {
        $(fid).value = val !== undefined ? val : '';
        if (kind === 'len' || kind === 'vol') {
          const sel = el.querySelector('select[data-unit-for="' + fid + '"]');
          wireUnitSelect(sel, fid, kind === 'len' ? 'length' : 'volume', src[k + '_u'] || defaultUnit(src.t, k));
        }
        $(fid).addEventListener('input', render);
      }
    });
    $('f' + id + 'n').addEventListener('input', render);
    el.querySelector('.src-remove').addEventListener('click', function () {
      rows = rows.filter(function (r) { return r.uid !== id; });
      listEl.removeChild(el);
      render();
    });
    rows.push({ uid: id, t: src.t, el: el });
    applyRowVisibility(id, src.t);
    return id;
  }
  const prevPipe = {};

  function rowShape(r) { const s = $('f' + r.uid + 'sh'); return s ? s.value : null; }
  function rowPipe(r) { const s = $('f' + r.uid + 's'); return s ? s.value : null; }

  function applyRowVisibility(id, t) {
    const el = rows.filter(function (r) { return r.uid === id; })[0];
    const root = el ? el.el : listEl.lastChild;
    const shapeSel = $('f' + id + 'sh');
    const pipeSel = $('f' + id + 's');
    root.querySelectorAll('.field[data-k]').forEach(function (f) {
      const k = f.dataset.k;
      let hide = false;
      if (shapeSel) {
        if (shapeSel.value === 'round' && (k === 'l' || k === 'w')) hide = true;
        if (shapeSel.value === 'rect' && k === 'd') hide = true;
      }
      if (pipeSel && k === 'd' && pipeSel.value !== 'custom') hide = true;
      f.hidden = hide;
    });
  }

  function clearRows() {
    rows = [];
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  }

  // Drain-back volume of one row, in litres.
  function rowVolume(r) {
    const id = r.uid, t = r.t;
    const b = function (k) { return CalcUnits.base('f' + id + k); };
    const cnt = function (k) { const v = numRaw('f' + id + k); return isFinite(v) && v > 0 ? v : 0; };
    let m3 = 0, idM = 0, area = 0;
    if (t === 'tank' || t === 'full' || t === 'siphon') {
      area = rowShape(r) === 'round' ? Math.PI * b('d') * b('d') / 4 : b('l') * b('w');
      m3 = area * b('h') * cnt('q');
    } else if (t === 'media') {
      const p = numRaw('f' + id + 'p');
      m3 = b('l') * b('w') * b('h') * (isFinite(p) ? Math.max(0, Math.min(100, p)) / 100 : 0) * cnt('q');
    } else if (t === 'dwc') {
      m3 = b('l') * b('w') * b('h') * cnt('q');
    } else if (t === 'nft') {
      m3 = cnt('q') * b('l') * b('w') * b('h');
    } else if (t === 'pipe') {
      const p = pipeById(rowPipe(r));
      idM = p ? pipeIdIn(p) * IN : b('d');
      m3 = Math.PI * idM * idM / 4 * b('l') * cnt('q');
    } else if (t === 'other') {
      m3 = b('v') / 1000 * cnt('q');
    }
    return { L: m3 * 1000, idM: idM, area: area };
  }

  function readSources() {
    return rows.map(function (r, i) {
      const v = rowVolume(r);
      const name = $('f' + r.uid + 'n').value.trim() || TYPES[r.t].name;
      const pRaw = r.t === 'media' ? numRaw('f' + r.uid + 'p') : NaN;
      return { uid: r.uid, t: r.t, idx: i + 1, name: name, L: v.L, idM: v.idM, color: COLORS[i % COLORS.length], badPct: r.t === 'media' && (pRaw > 100 || pRaw < 0) };
    });
  }

  // ---------- Model ----------
  function compute() {
    const m = { errors: [], warnings: [] };
    m.src = readSources();
    m.total = m.src.reduce(function (s, x) { return s + x.L; }, 0); // L
    m.shape = $('sshape').value;
    m.A = m.shape === 'round' ? Math.PI * Math.pow(CalcUnits.base('sdia'), 2) / 4 : CalcUnits.base('slen') * CalcUnits.base('swid'); // m²
    m.H = CalcUnits.base('sdepth');
    const run = CalcUnits.baseSigned('srun');
    m.run = isFinite(run) ? run : NaN;
    const mn = CalcUnits.baseSigned('smin');
    m.min = isFinite(mn) && mn > 0 ? mn : null;
    const mg = numRaw('smargin');
    m.margin = isFinite(mg) && mg > 0 ? mg / 100 : 0;

    const missing = m.src.filter(function (s) { return !(s.L > 0); }).map(function (s) { return s.idx; });
    if (!m.src.length) m.errors.push('Add at least one tank, bed or pipe that drains to the sump.');
    else if (missing.length === m.src.length) m.errors.push('Enter the dimensions of at least one source.');
    else if (missing.length) m.warnings.push('Source' + (missing.length > 1 ? 's ' : ' ') + missing.join(', ') + ' ha' + (missing.length > 1 ? 've' : 's') + ' a missing or zero value and add' + (missing.length > 1 ? '' : 's') + ' nothing.');
    if (m.src.some(function (s) { return s.badPct; })) m.warnings.push('Porosity is limited to 0–100%.');

    m.sumpOk = m.A > 0 && m.H > 0 && isFinite(m.run) && m.run >= 0;
    if (!(m.A > 0)) m.errors.push('Enter the sump ' + (m.shape === 'round' ? 'diameter' : 'length and width') + '.');
    else if (!(m.H > 0)) m.errors.push('Enter the sump depth to the rim.');
    else if (!isFinite(m.run) || m.run < 0) m.errors.push('Enter the sump water depth while running.');
    else if (m.run > m.H) { m.errors.push('The running water depth is above the rim (' + depthOut(m.H) + ').'); m.sumpOk = false; }

    m.ok = m.total > 0 && m.sumpOk;
    if (!m.sumpOk) return m;

    const A_L_per_m = m.A * 1000;             // litres per metre of depth
    m.free = A_L_per_m * (m.H - m.run);        // L
    m.cap = A_L_per_m * m.H;
    m.spare = m.free - m.total;
    m.need = m.total * (1 + m.margin);
    m.rise = m.total / A_L_per_m;              // m
    m.after = m.run + m.rise;
    m.maxRun = m.H - m.need / A_L_per_m;       // m (can be negative)
    m.status = m.total > m.free + 1e-9 ? 'bad' : m.need > m.free + 1e-9 ? 'warn' : 'ok';
    if (m.min !== null) {
      if (m.min >= m.H) m.warnings.push('The lowest safe pump depth is at or above the rim.');
      else if (m.run < m.min) m.warnings.push('The running level is below the lowest safe depth for the pump; it may suck air.');
      m.band = m.maxRun - m.min;
    }
    return m;
  }

  // ---------- UI state ----------
  function applySumpShape() {
    const s = $('sshape').value;
    document.querySelectorAll('[data-sfor]').forEach(function (el) { el.hidden = el.dataset.sfor !== s; });
  }

  function getState() {
    const st = { sshape: $('sshape').value, out: outSel.value };
    SUMP_LEN.forEach(function (f) {
      if ($(f).closest('.field').hidden) return;
      st[f] = $(f).value;
      st[f + '_u'] = CalcUnits.unit(f);
    });
    st.smargin = $('smargin').value;
    st.ns = rows.length;
    rows.forEach(function (r, i) {
      st['t' + i] = r.t;
      st['n' + i] = $('f' + r.uid + 'n').value;
      TYPES[r.t].fields.forEach(function (k) {
        const fid = 'f' + r.uid + k;
        const wrap = $(fid).closest('.field');
        if (wrap.hidden) return;
        st[k + i] = $(fid).value;
        const kind = FIELD_KIND[k];
        if (kind === 'len' || kind === 'vol') st[k + i + '_u'] = CalcUnits.unit(fid);
      });
    });
    return st;
  }

  function applyDefaults() {
    $('sshape').value = DEFAULTS.sshape;
    SUMP_LEN.forEach(function (f) { CalcUnits.set(f, DEFAULTS[f], 'cm'); });
    $('smargin').value = DEFAULTS.smargin;
    outSel.value = DEFAULTS.out;
    clearRows();
    DEFAULTS.rows.forEach(addRow);
    applySumpShape();
  }

  // ---------- Render ----------
  function render() {
    const m = compute();
    const notice = $('notice');
    const msgs = m.errors.concat(m.warnings);
    notice.textContent = msgs.join(' ');
    notice.hidden = msgs.length === 0;

    rows.forEach(function (r, i) {
      const sw = r.el.querySelector('.swatch');
      sw.style.background = COLORS[i % COLORS.length];
      sw.textContent = i + 1;
    });
    $('btn-add').disabled = rows.length >= MAX_ROWS;
    m.src.forEach(function (s) {
      let t = s.L > 0 ? volOut(s.L) : '–';
      if (s.t === 'pipe' && s.idM > 0) t += ' (ID ' + fmt(s.idM * 1000, 1) + ' mm)';
      $('f' + s.uid + 'out').textContent = t;
    });

    const set = function (id, t) { $(id).textContent = t; };
    const box = $('r-box');
    box.classList.remove('ok', 'warn', 'bad');
    set('r-total', m.total > 0 ? volOut(m.total) : '–');

    // Breakdown
    const bd = $('r-breakdown');
    while (bd.firstChild) bd.removeChild(bd.firstChild);
    m.src.forEach(function (s) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      const sw = document.createElement('span');
      sw.className = 'sw';
      sw.style.background = s.color;
      a.appendChild(sw);
      a.appendChild(document.createTextNode(s.idx + '. ' + s.name));
      const b = document.createElement('span');
      b.className = 'v';
      b.textContent = s.L > 0 ? volOut(s.L) + (m.total > 0 ? ' · ' + fmt(s.L / m.total * 100, 0) + '%' : '') : '–';
      li.appendChild(a); li.appendChild(b);
      bd.appendChild(li);
    });

    const ids = ['r-free', 'r-spare', 'r-need', 'r-after', 'r-rise', 'r-maxrun', 'r-minrun', 'r-band'];
    $('r-need-label').textContent = 'Recommended free volume (+' + fmt(m.margin * 100, 1) + '%)';
    if (!m.sumpOk) {
      ids.forEach(function (id) { set(id, '–'); });
      set('r-status', '');
      $('r-bar').style.width = '0%';
      set('viz-caption', m.total > 0 ? 'Enter the sump size to check whether it can hold the drain-back' : 'Enter the sources and sump to draw the diagram');
    } else {
      box.classList.add(m.status);
      set('r-free', volOut(m.free));
      $('r-spare-label').textContent = m.spare >= 0 ? 'Spare capacity' : 'Shortfall (overflow)';
      set('r-spare', volOut(Math.abs(m.spare)));
      set('r-need', volOut(m.need));
      set('r-after', m.status === 'bad' ? 'overflows the rim (' + depthOut(m.H) + ')' : depthOut(m.after) + ' of ' + depthOut(m.H));
      set('r-rise', depthOut(m.rise) + (m.status === 'bad' ? ' needed, ' + depthOut(m.H - m.run) + ' available' : ''));
      set('r-maxrun', m.maxRun > 0 ? depthOut(m.maxRun) : 'none: sump too small');
      set('r-minrun', m.min !== null ? depthOut(m.min) : 'not set');
      if (m.min !== null) {
        set('r-band', m.band > 0 ? depthOut(m.min) + ' – ' + depthOut(m.maxRun) + ' (' + depthOut(m.band) + ')' : 'none: short by ' + volOut(-m.band * m.A * 1000));
      } else {
        set('r-band', m.maxRun > 0 ? 'up to ' + depthOut(m.maxRun) : '–');
      }
      const pct = m.free > 0 ? m.total / m.free * 100 : 100;
      $('r-bar').style.width = Math.min(100, pct) + '%';
      $('r-bar').classList.toggle('over', m.status === 'bad');
      let status;
      if (m.total <= 0) status = '';
      else if (m.status === 'bad') status = 'Sump overflows by ' + volOut(-m.spare);
      else if (m.status === 'warn') status = 'Fits with ' + volOut(m.spare) + ' spare, but less than the ' + fmt(m.margin * 100, 1) + '% safety margin';
      else status = 'Fits with ' + volOut(m.spare) + ' spare' + (m.margin > 0 ? ', inside the ' + fmt(m.margin * 100, 1) + '% margin' : '');
      set('r-status', status);
      set('viz-caption', m.total > 0
        ? volShort(m.total) + ' drains back into ' + volShort(m.free) + ' of free space · ' + fmt(pct, 0) + '% of free capacity'
        : 'Enter the sources to see the drain-back');
    }

    drawViz(m);
    CalcShare.writeParams(getState());
  }

  // ---------- SVG drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const VW = 480;

  function el(name, attrs, text, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined) e.textContent = text;
    (parent || svg).appendChild(e);
    return e;
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // Small side-view icon of one source, with its draining part in the source colour.
  function drawIcon(s, x, y, w, h) {
    const c = s.color;
    if (s.t === 'pipe') {
      el('path', { d: 'M' + (x + 6) + ',' + (y + 6) + ' H' + (x + w - 10) + ' V' + (y + h), class: 'tank-line', 'stroke-width': 7, stroke: c, style: 'stroke:' + c, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      return;
    }
    if (s.t === 'nft') {
      for (let i = 0; i < 3; i++) {
        const yy = y + 8 + i * 14;
        el('path', { d: 'M' + (x + 4) + ',' + yy + ' L' + (x + w - 4) + ',' + (yy + 5), class: 'tank-line' });
        el('path', { d: 'M' + (x + 4) + ',' + (yy - 2) + ' L' + (x + w - 4) + ',' + (yy + 3), stroke: c, 'stroke-width': 3, fill: 'none' });
      }
      return;
    }
    if (s.t === 'other') {
      el('rect', { x: x + w * 0.2, y: y + 4, width: w * 0.6, height: h - 4, rx: 6, class: 'tank-glass' });
      el('rect', { x: x + w * 0.2, y: y + h * 0.45, width: w * 0.6, height: h * 0.55, rx: 4, fill: c, 'fill-opacity': 0.85 });
      el('rect', { x: x + w * 0.2, y: y + 4, width: w * 0.6, height: h - 4, rx: 6, class: 'tank-line' });
      return;
    }
    const top = y + 6, bot = y + h;
    const iy = s.t === 'media' || s.t === 'dwc' ? top + (bot - top) * 0.35 : top; // beds are shallower
    el('rect', { x: x, y: iy, width: w, height: bot - iy, class: 'tank-glass' });
    const waterTop = iy + (bot - iy) * 0.2;
    if (s.t === 'tank' || s.t === 'dwc') {
      el('rect', { x: x, y: waterTop + 4, width: w, height: bot - waterTop - 4, class: 'water' });
      el('rect', { x: x, y: waterTop, width: w, height: 4, fill: c });
      // overflow standpipe
      el('path', { d: 'M' + (x + w * 0.75) + ',' + bot + ' V' + (waterTop + 4), class: 'tank-line', 'stroke-width': 3 });
      if (s.t === 'dwc') el('rect', { x: x + 2, y: waterTop - 3, width: w - 4, height: 3, fill: 'var(--tank-back)' });
    } else if (s.t === 'siphon') {
      const outY = waterTop + (bot - waterTop) * 0.45;
      el('rect', { x: x, y: outY, width: w, height: bot - outY, class: 'water' });
      el('rect', { x: x, y: waterTop, width: w, height: outY - waterTop, fill: c, 'fill-opacity': 0.85 });
      // return pipe coming over the wall, ending below the surface
      el('path', { d: 'M' + (x + w + 6) + ',' + (bot + 4) + ' V' + (iy - 4) + ' H' + (x + w * 0.35) + ' V' + outY, class: 'tank-line', 'stroke-width': 2.5 });
    } else if (s.t === 'full') {
      el('rect', { x: x, y: waterTop, width: w, height: bot - waterTop, fill: c, 'fill-opacity': 0.85 });
    } else if (s.t === 'media') {
      el('rect', { x: x, y: waterTop, width: w, height: bot - waterTop, fill: c, 'fill-opacity': 0.75 });
      for (let yy = iy + 4; yy < bot - 1; yy += 5) {
        for (let xx = x + 3 + ((yy / 5) % 2) * 2.5; xx < x + w - 2; xx += 6) el('circle', { cx: xx, cy: yy, r: 1.3, class: 'media-dot' });
      }
    }
    el('path', { d: 'M' + x + ',' + iy + ' V' + bot + ' H' + (x + w) + ' V' + iy, class: 'tank-line' });
  }

  // Spread right-side labels so they do not overlap (keeps order, min gap).
  function spread(items, gap, yMin, yMax) {
    items.sort(function (a, b) { return a.y - b.y; });
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const over = items.length ? items[items.length - 1].y - yMax : 0;
    if (over > 0) {
      items[items.length - 1].y -= over;
      for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < gap) items[i].y = items[i + 1].y - gap;
    }
    if (items.length && items[0].y < yMin) items[0].y = yMin;
    return items;
  }

  function drawViz(m) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const defs = el('defs', {});
    const mk = el('marker', { id: 'sd-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, undefined, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }, undefined, mk);

    const srcs = m.src.filter(function (s) { return s.L > 0; });
    if (!srcs.length && !m.sumpOk) { svg.setAttribute('viewBox', '0 0 ' + VW + ' 300'); return; }

    // --- Sources row(s) ---
    const perRow = Math.min(5, Math.max(1, srcs.length));
    const nRows = Math.max(1, Math.ceil(srcs.length / 5));
    const gapX = 14;
    const iw = Math.min(70, (452 - (perRow - 1) * gapX) / perRow - 8);
    const ih = 44;
    const rowH = ih + 34;
    el('text', { x: 14, y: 16, 'text-anchor': 'start', class: 'dim-text' }, 'Drains back when the pump stops');
    const iconPos = [];
    srcs.forEach(function (s, i) {
      const r = Math.floor(i / 5), inRow = Math.min(5, srcs.length - r * 5), col = i % 5;
      const cellW = 452 / inRow;
      const cx = 14 + cellW * (col + 0.5);
      const y = 28 + r * rowH;
      drawIcon(s, cx - iw / 2, y, iw, ih);
      el('text', { x: cx, y: y + ih + 15, 'text-anchor': 'middle', class: 'small-text' }, s.idx + ' · ' + volShort(s.L));
      iconPos.push({ x: cx, y: y + ih + 20, s: s });
    });

    // --- Sump ---
    const sumpTop = 28 + nRows * rowH + 40;
    const SW = 230, SH = 150;
    const sx = (VW - SW) / 2 - 20, sx1 = sx + SW;
    const sb = sumpTop + SH; // floor y
    if (m.sumpOk) {
      const k = SH / m.H; // px per metre
      const Y = function (d) { return sb - d * k; };
      const yRim = Y(m.H);

      // arrows from sources to sump
      iconPos.forEach(function (p, i) {
        const tx = sx + SW * (i + 1) / (iconPos.length + 1);
        el('path', { d: 'M' + p.x + ',' + p.y + ' C' + p.x + ',' + (p.y + 24) + ' ' + tx + ',' + (yRim - 34) + ' ' + tx + ',' + (yRim - 6), class: 'arrow', 'marker-end': 'url(#sd-arrow)' });
      });

      el('rect', { x: sx, y: yRim, width: SW, height: SH, class: 'tank-glass' });
      // running water
      const yRun = Y(m.run);
      if (m.run > 0) el('rect', { x: sx, y: yRun, width: SW, height: sb - yRun, class: 'water' });
      // drain-back layers stacked on top of the running level
      let d0 = m.run;
      const A_L_per_m = m.A * 1000;
      let spillPx = 0;
      m.src.forEach(function (s) {
        if (!(s.L > 0)) return;
        const d1 = d0 + s.L / A_L_per_m;
        const a = Math.min(d0, m.H), b = Math.min(d1, m.H);
        if (b > a) el('rect', { x: sx, y: Y(b), width: SW, height: (b - a) * k, fill: s.color, 'fill-opacity': 0.8 });
        d0 = d1;
      });
      if (m.status === 'bad') {
        spillPx = Math.min(26, (m.after - m.H) * k);
        // water heaped above the rim and running down the outside walls
        el('path', { class: 'spill', d: 'M' + (sx - 10) + ',' + sb + ' L' + (sx - 4) + ',' + (yRim - spillPx) + ' H' + (sx1 + 4) + ' L' + (sx1 + 10) + ',' + sb + ' H' + (sx1 + 2) + ' V' + yRim + ' H' + (sx - 2) + ' V' + sb + 'Z' });
        el('text', { x: sx + SW / 2, y: yRim - spillPx - 6, 'text-anchor': 'middle', class: 'warn-text' }, 'overflow ' + volShort(-m.spare));
      } else if (m.total > 0) {
        el('line', { x1: sx, y1: Y(m.after), x2: sx1, y2: Y(m.after), stroke: 'var(--water-deep)', 'stroke-width': 1.5 });
      }
      // running water surface line
      if (m.run > 0) el('line', { x1: sx, y1: yRun, x2: sx1, y2: yRun, stroke: 'var(--water-deep)', 'stroke-width': 1.5, 'stroke-dasharray': '6 3' });
      // min (pump) line and max running line
      if (m.min !== null && m.min < m.H) el('line', { x1: sx - 6, y1: Y(m.min), x2: sx1 + 6, y2: Y(m.min), class: 'warn-line' });
      if (m.maxRun > 0 && m.margin > 0) el('line', { x1: sx - 6, y1: Y(m.maxRun), x2: sx1 + 6, y2: Y(m.maxRun), class: 'max-line' });
      // pump
      const pumpH = m.min !== null ? Math.min(Y(0) - Y(m.min), 30) : 18;
      el('rect', { x: sx + 14, y: sb - Math.max(12, pumpH * 0.6), width: 22, height: Math.max(12, pumpH * 0.6), rx: 3, fill: 'var(--tank-stroke)', 'fill-opacity': 0.75 });
      // walls
      el('path', { d: 'M' + sx + ',' + yRim + ' V' + sb + ' H' + sx1 + ' V' + yRim, class: 'tank-line' });

      // right-hand labels
      const labs = [{ y: yRim + 4, t: 'rim ' + depthOut(m.H), c: 'dim-text' }];
      if (m.total > 0 && m.status !== 'bad') labs.push({ y: Y(m.after) + 4, t: 'after ' + depthOut(m.after), c: 'depth-text' });
      labs.push({ y: yRun + 4, t: 'running ' + depthOut(m.run), c: 'depth-text' });
      if (m.maxRun > 0 && m.margin > 0) labs.push({ y: Y(m.maxRun) + 4, t: 'max run ' + depthOut(m.maxRun), c: 'max-text' });
      if (m.min !== null && m.min < m.H) labs.push({ y: Y(m.min) + 4, t: 'pump min ' + depthOut(m.min), c: 'warn-text' });
      spread(labs, 14, yRim - 6, sb + 4).forEach(function (l) {
        el('text', { x: sx1 + 14, y: l.y, 'text-anchor': 'start', class: l.c }, l.t);
      });
      // left: free capacity dimension
      el('path', { class: 'dim', d: 'M' + (sx - 16) + ',' + yRim + ' V' + yRun + ' M' + (sx - 20) + ',' + yRim + ' h8 M' + (sx - 20) + ',' + yRun + ' h8' });
      el('text', { x: sx - 22, y: (yRim + yRun) / 2 - 2, 'text-anchor': 'end', class: 'small-text' }, 'free');
      el('text', { x: sx - 22, y: (yRim + yRun) / 2 + 11, 'text-anchor': 'end', class: 'small-text' }, volShort(m.free));
      el('text', { x: sx + SW / 2, y: sb + 16, 'text-anchor': 'middle', class: 'small-text' }, 'Sump · ' + volShort(m.cap) + ' to rim');
    } else {
      el('text', { x: VW / 2, y: sumpTop + 40, 'text-anchor': 'middle', class: 'dim-text' }, 'Enter the sump size to draw it');
    }

    // --- Stacked bar: drain-back vs free capacity ---
    let y = sb + 52;
    if (m.sumpOk && m.total > 0) {
      const bx0 = 14, bx1 = 466, bh = 22;
      const maxV = Math.max(m.total, m.free, m.need) * 1.02;
      const X = function (v) { return bx0 + (bx1 - bx0) * v / maxV; };
      el('text', { x: bx0, y: y - 8, 'text-anchor': 'start', class: 'dim-text' }, 'Drain-back vs sump free capacity');
      el('text', { x: bx1, y: y - 8, 'text-anchor': 'end', class: 'strong-text' }, fmt(m.total / m.free * 100, 0) + '%');
      let acc = 0;
      srcs.forEach(function (s) {
        el('rect', { x: X(acc), y: y, width: Math.max(0, X(acc + s.L) - X(acc)), height: bh, fill: s.color, class: 'seg-gap' });
        acc += s.L;
      });
      // free-capacity marker
      const fx = X(m.free);
      el('line', { x1: fx, y1: y - 4, x2: fx, y2: y + bh + 4, stroke: m.status === 'bad' ? 'var(--warn-text)' : 'var(--tank-stroke)', 'stroke-width': 2 });
      if (m.margin > 0) {
        const nx = X(m.need);
        el('line', { x1: nx, y1: y - 4, x2: nx, y2: y + bh + 4, class: 'max-line' });
      }
      el('rect', { x: bx0, y: y, width: X(m.total) - bx0, height: bh, rx: 2, class: 'axis' });
      const ty = y + bh + 16;
      const fAnchor = fx > bx1 - 90 ? 'end' : fx < bx0 + 90 ? 'start' : 'middle';
      el('text', { x: fx, y: ty, 'text-anchor': fAnchor, class: m.status === 'bad' ? 'warn-text' : 'dim-text' }, 'free ' + volShort(m.free));
      if (m.margin > 0) {
        const nx = X(m.need);
        const nAnchor = nx > bx1 - 90 ? 'end' : nx < bx0 + 90 ? 'start' : 'middle';
        let nty = ty;
        if (Math.abs(nx - fx) < 120) nty = ty + 15;
        el('text', { x: nx, y: nty, 'text-anchor': nAnchor, class: 'max-text' }, '+' + fmt(m.margin * 100, 0) + '% ' + volShort(m.need));
        y = nty;
      } else y = ty;
      y += 22;
    } else if (srcs.length) {
      y = (m.sumpOk ? sb : sumpTop + 50) + 30;
    }

    // --- Legend ---
    const colW = 452 / 2;
    srcs.forEach(function (s, i) {
      const lx = 14 + (i % 2) * colW, ly = y + Math.floor(i / 2) * 18;
      el('rect', { x: lx, y: ly - 9, width: 10, height: 10, rx: 2, fill: s.color });
      el('text', { x: lx + 15, y: ly, 'text-anchor': 'start', class: 'dim-text' }, s.idx + ' ' + trunc(s.name, 18) + ' ' + volShort(s.L));
    });
    const vh = y + Math.ceil(srcs.length / 2) * 18 + 4;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + Math.max(300, Math.ceil(vh)));
  }

  // ---------- Results text ----------
  function rowText(r) {
    const id = r.uid, t = r.t;
    const v = function (k) { return typed('f' + id + k); };
    const q = $('f' + id + 'q') ? $('f' + id + 'q').value : '';
    if (t === 'tank' || t === 'full' || t === 'siphon') {
      const dims = rowShape(r) === 'round' ? 'round, D ' + v('d') : v('l') + ' × ' + v('w');
      const hl = { tank: 'head over overflow ', full: 'water depth ', siphon: 'drop to outlet ' }[t];
      return dims + ', ' + hl + v('h') + ', × ' + q;
    }
    if (t === 'media') return v('l') + ' × ' + v('w') + ', flooded ' + v('h') + ', porosity ' + $('f' + id + 'p').value + '%, × ' + q;
    if (t === 'dwc') return v('l') + ' × ' + v('w') + ', water above outlet ' + v('h') + ', × ' + q;
    if (t === 'nft') return q + ' channels × ' + v('l') + ', film ' + v('w') + ' × ' + v('h');
    if (t === 'pipe') {
      const p = pipeById(rowPipe(r));
      return (p ? p.label + ' Sch 40 PVC' : 'ID ' + v('d')) + ', ' + v('l') + ', × ' + q;
    }
    return v('v') + ' × ' + q;
  }

  function resultsText() {
    const m = compute();
    const lines = ['Sump Drain-Back Calculator', 'Sources that drain back:'];
    rows.forEach(function (r, i) {
      const s = m.src[i];
      lines.push('  ' + (i + 1) + '. ' + s.name + ' (' + TYPES[r.t].name + '): ' + rowText(r) + ' → ' + (s.L > 0 ? volOut(s.L) : '–'));
    });
    const dims = $('sshape').value === 'round' ? 'round, D ' + typed('sdia') : typed('slen') + ' × ' + typed('swid');
    lines.push('Sump: ' + dims + ', depth to rim ' + typed('sdepth') + ', running depth ' + typed('srun') +
      ($('smin').value ? ', lowest safe depth ' + typed('smin') : '') + ', safety margin ' + ($('smargin').value || 0) + '%');
    lines.push('Total drain-back: ' + (m.total > 0 ? volOut(m.total) : '–'));
    if (m.sumpOk) {
      lines.push(
        'Sump free capacity: ' + volOut(m.free),
        (m.spare >= 0 ? 'Spare capacity: ' : 'Shortfall (overflow): ') + volOut(Math.abs(m.spare)),
        'Status: ' + $('r-status').textContent,
        'Recommended free volume (+' + fmt(m.margin * 100, 1) + '%): ' + volOut(m.need),
        'Level after drain-back: ' + $('r-after').textContent + ', rise ' + depthOut(m.rise),
        'Highest running level with margin: ' + $('r-maxrun').textContent,
        'Usable operating band: ' + $('r-band').textContent
      );
    } else if (m.errors.length) {
      lines.push(m.errors.join(' '));
    }
    lines.push(CalcShare.buildUrl(getState()));
    return lines.join('\n');
  }

  // ---------- Events ----------
  SUMP_LEN.concat(['smargin']).forEach(function (f) { $(f).addEventListener('input', render); });
  $('sshape').addEventListener('change', function () { applySumpShape(); render(); });
  outSel.addEventListener('change', render);

  CalcUnits.init(render);

  $('btn-add').addEventListener('click', function () {
    const t = $('add-type').value;
    const id = addRow({ t: t });
    render();
    if (id) $('f' + id + 'n').focus();
  });
  $('btn-link').addEventListener('click', function () {
    CalcShare.copy(CalcShare.buildUrl(getState()), 'Link copied');
  });
  $('btn-copy').addEventListener('click', function () {
    CalcShare.copy(resultsText(), 'Results copied');
  });
  $('btn-share').addEventListener('click', function () {
    CalcShare.share({ title: 'Sump Drain-Back Calculator', text: resultsText(), url: CalcShare.buildUrl(getState()) });
  });
  $('btn-reset').addEventListener('click', function () {
    applyDefaults();
    render();
  });

  // ---------- Init from URL ----------
  (function init() {
    const p = CalcShare.readParams();
    applyDefaults();
    if (p.sshape === 'rect' || p.sshape === 'round') $('sshape').value = p.sshape;
    SUMP_LEN.forEach(function (f) {
      const u = p[f + '_u'];
      if (p[f] !== undefined && isFinite(parseFloat(p[f]))) CalcUnits.set(f, p[f], u);
      else if (p[f] === '' ) CalcUnits.set(f, '', u);
      else if (u) CalcUnits.set(f, $(f).value, u);
    });
    if (p.smargin !== undefined) $('smargin').value = p.smargin;
    if (p.out && CalcUnits.unitDef('volume', p.out)) outSel.value = p.out;
    const n = parseInt(p.ns, 10);
    if (isFinite(n) && n >= 0) {
      clearRows();
      for (let i = 0; i < Math.min(n, MAX_ROWS); i++) {
        const t = p['t' + i];
        if (!TYPES[t]) continue;
        const src = { t: t };
        if (p['n' + i] !== undefined) src.n = p['n' + i];
        TYPES[t].fields.forEach(function (k) {
          if (p[k + i] !== undefined) src[k] = p[k + i];
          if (p[k + i + '_u'] !== undefined) src[k + '_u'] = p[k + i + '_u'];
        });
        addRow(src);
      }
    }
    applySumpShape();
    render();
  })();
})();
