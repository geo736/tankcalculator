// Guided design walkthroughs: a reusable step-by-step framework (window.CalcGuide).
//
// Load order on a guide page: share.js, units.js, guide.js, then the guide's own file
// (e.g. guide-ras-design.js), which calls CalcGuide.create({...}). Styles: style.css + guide.css.
//
// ---------------------------------------------------------------------------------------
// API
//
//   CalcGuide.create({
//     root: 'guide',                 // id (or element) the guide renders into
//     sourcesList: 'guide-sources',  // optional id of an <ol class="sources"> for the combined list
//     title: 'Engineer a RAS',       // used in copied text and share titles
//     calcBase: '../calculators/',   // where "Open the full calculator" links point
//     sources: { key: 'Citation HTML', ... },   // every source a step may cite, by key
//     steps: [ step, step, ..., { id: 'summary', type: 'summary', title, short, intro, after } ]
//   })
//
// A step:
//   {
//     id: 'tanks',                   // unique; used in the URL (?step=tanks)
//     title: 'Fish tanks',           // heading; short: 'Tanks' is the stepper label
//     intro: 'HTML: what this step decides and why',
//     fields: [ field, ... ],
//     compute: function (ctx) { return { ... } },   // results object, stored as ctx.r[step.id]
//     results: function (ctx, r) { return [{ label, value, main: true }, { label, value }] },
//     notices: function (ctx, r) { return ['warning text', ...] },          // optional
//     viz: { viewBox: '0 0 480 260', label: 'aria label',
//            draw: function (svg, ctx, r, G) {}, caption: function (ctx, r) {} },  // optional
//     tips: ['HTML rule of thumb', ...]  or  function (ctx, r) { return [...] },
//     sources: ['key', ...],         // keys into the guide-level sources map
//     links: function (ctx, r) {     // pre-filled links to full calculators
//       return [{ slug: 'tank-volume', label: 'Tank Volume', params: { shape: 'cyl', ... } }];
//     }
//   }
//
// A field (rendered with the same markup/classes as the calculators):
//   { id: 'tankD',                   // unique across the whole guide (it is a URL parameter)
//     label: 'Tank diameter',
//     type: 'number' (default) | 'select',
//     group: 'length', unit: 'm',    // unit group from units.js (or one added by the guide) and
//                                    // default unit -> gets its own unit-select dropdown
//     suffix: '%',                   // for unitless numbers: a fixed <span class="unit">
//     def: 4.3 | function (ctx) { return ... },   // default in BASE units (m, L, kg, L/s, °C, ...)
//                                    // functions read earlier values, so suggestions carry forward
//     signed: true,                  // allow 0 and negatives (temperatures, elevations)
//     allowZero: true,               // allow 0 but not negatives
//     check: function (v, ctx) { return 'message' or '' },  // extra validation (v in base units)
//     sig: 4,                        // significant digits when a default is shown (default 4)
//     hint: 'text' | function (ctx) { return 'text' },
//     show: function (ctx) { return bool },   // hide when not relevant (value still computed)
//     options: [{ value, label }] | function (ctx) {...}   // for type 'select'
//   }
//
// ctx (passed to def/compute/results/...): ctx.v[fieldId] = value in base units (NaN when
// missing or invalid; string for selects), ctx.r[stepId] = that step's compute() result,
// ctx.shown[fieldId], ctx.bad[fieldId] = validation message.
// Values flow strictly forward: a step can read any field or result of earlier steps (and
// earlier fields of its own step).
//
// User edits are "overrides". A field that is not overridden keeps following its suggested
// default, so changing step 1 updates later suggestions. An overridden field shows a
// "Use suggested" button. Only overrides, non-default units, the current step and the
// furthest step reached are written to the URL, so links stay short and resume exactly.
//
// Helpers on CalcGuide: fmt(n, maxFrac), q(group, base, [unitIds], maxFrac) -> "10 m³/h · 44 US gpm",
// p(n, sig) -> rounded string for link params, el(svg, name, attrs, text) for SVG drawing.
// ---------------------------------------------------------------------------------------
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // ---------- Formatting helpers (same rules as the calculators) ----------
  function fmt(n, maxFrac) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    const abs = Math.abs(n);
    const digits = maxFrac !== undefined ? maxFrac : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function baseUnit(group) { return CalcUnits.GROUPS[group].base; }

  // A base-unit value shown in one or more units: q('flow', 30.6, ['m3ph', 'gpm']).
  function q(group, base, units, maxFrac) {
    if (typeof base !== 'number' || !isFinite(base)) return '–';
    return (units || [baseUnit(group)]).map(function (u) {
      return fmt(CalcUnits.convert(group, base, baseUnit(group), u), maxFrac) + ' ' + CalcUnits.label(group, u);
    }).join(' · ');
  }

  // Rounded number as a string for URL parameters (no thousands separators).
  function p(n, sig) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return String(+n.toPrecision(sig || 4));
  }

  function el(parent, name, attrs, text) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (a) { e.setAttribute(a, attrs[a]); });
    if (text !== undefined && text !== null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }

  function h(tag, attrs, html) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (a) {
      if (a === 'class') e.className = attrs[a];
      else e.setAttribute(a, attrs[a]);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function textOf(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent;
  }

  const ICONS = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
    calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
  };

  // ---------- The guide ----------
  function create(cfg) {
    const root = typeof cfg.root === 'string' ? document.getElementById(cfg.root) : cfg.root;
    const steps = cfg.steps;
    const calcBase = cfg.calcBase || '../calculators/';
    const fieldIndex = {};       // id -> { f, step }
    const sourceOrder = [];      // source keys in first-use order (for numbering)

    steps.forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        if (fieldIndex[f.id] || f.id === 'step' || f.id === 'reached') throw new Error('CalcGuide: duplicate or reserved field id ' + f.id);
        if (f.group && !CalcUnits.GROUPS[f.group]) throw new Error('CalcGuide: unknown unit group ' + f.group);
        fieldIndex[f.id] = { f: f, step: s };
      });
      (s.sources || []).forEach(function (k) {
        if (!cfg.sources[k]) throw new Error('CalcGuide: unknown source ' + k);
        if (sourceOrder.indexOf(k) === -1) sourceOrder.push(k);
      });
    });
    function srcNum(k) { return sourceOrder.indexOf(k) + 1; }

    const state = { idx: 0, reached: 0, ov: {}, units: {} };

    function unitOf(f) { return state.units[f.id] || f.unit; }
    function optionsOf(f, ctx) { return typeof f.options === 'function' ? f.options(ctx) : f.options; }

    // ---------- Evaluate every step in order ----------
    function evaluate() {
      const ctx = { v: {}, r: {}, shown: {}, bad: {}, overridden: {} };
      steps.forEach(function (s) {
        if (s.type === 'summary') return;
        (s.fields || []).forEach(function (f) {
          const has = Object.prototype.hasOwnProperty.call(state.ov, f.id);
          ctx.overridden[f.id] = has;
          const d = typeof f.def === 'function' ? f.def(ctx) : f.def;
          if (f.type === 'select') {
            const opts = optionsOf(f, ctx) || [];
            const ok = function (v) { return opts.some(function (o) { return o.value === v; }); };
            ctx.v[f.id] = has && ok(state.ov[f.id]) ? state.ov[f.id] : (ok(d) ? d : (opts[0] && opts[0].value));
            ctx.suggest = ctx.suggest || {};
            ctx.suggest[f.id] = d;
          } else {
            let v;
            if (has) {
              const n = parseFloat(state.ov[f.id]);
              v = isFinite(n) ? (f.group ? CalcUnits.convert(f.group, n, unitOf(f), baseUnit(f.group)) : n) : NaN;
            } else {
              v = typeof d === 'number' ? d : NaN;
            }
            ctx.suggest = ctx.suggest || {};
            ctx.suggest[f.id] = d;
            let msg = '';
            if (!isFinite(v)) msg = 'Enter ' + f.label.toLowerCase() + '.';
            else if (!f.signed && v < 0) msg = f.label + ' cannot be negative.';
            else if (!f.signed && !f.allowZero && v === 0) msg = f.label + ' must be more than 0.';
            else if (f.check) msg = f.check(v, ctx) || '';
            ctx.shown[f.id] = f.show ? !!f.show(ctx) : true;
            if (msg) { ctx.bad[f.id] = msg; v = NaN; }
            ctx.v[f.id] = v;
          }
          if (ctx.shown[f.id] === undefined) ctx.shown[f.id] = f.show ? !!f.show(ctx) : true;
        });
        ctx.r[s.id] = s.compute ? (s.compute(ctx) || {}) : {};
      });
      return ctx;
    }

    // Display string of a field's base value in its unit.
    function displayValue(f, base) {
      if (typeof base !== 'number' || !isFinite(base)) return '';
      const v = f.group ? CalcUnits.convert(f.group, base, baseUnit(f.group), unitOf(f)) : base;
      return String(+v.toPrecision(f.sig || 4));
    }

    function fieldText(f, ctx) {
      if (f.type === 'select') {
        const o = (optionsOf(f, ctx) || []).filter(function (x) { return x.value === ctx.v[f.id]; })[0];
        return o ? textOf(o.label) : '–';
      }
      const v = ctx.v[f.id];
      if (!isFinite(v)) return '–';
      const shown = Object.prototype.hasOwnProperty.call(state.ov, f.id) ? parseFloat(state.ov[f.id]) : parseFloat(displayValue(f, v));
      const u = f.group ? ' ' + CalcUnits.label(f.group, unitOf(f)) : (f.suffix ? (f.suffix === '%' ? '%' : ' ' + f.suffix) : '');
      return fmt(shown, 4) + u;
    }

    // ---------- URL state ----------
    function urlState() {
      const st = { step: steps[state.idx].id, reached: state.reached };
      Object.keys(state.ov).forEach(function (k) { st[k] = state.ov[k]; });
      Object.keys(state.units).forEach(function (k) {
        if (fieldIndex[k] && state.units[k] !== fieldIndex[k].f.unit) st[k + '_u'] = state.units[k];
      });
      return st;
    }
    function shareUrl() { return CalcShare.buildUrl(urlState()); }

    function readUrl() {
      const prm = CalcShare.readParams();
      Object.keys(fieldIndex).forEach(function (id) {
        const f = fieldIndex[id].f;
        const u = prm[id + '_u'];
        if (u && f.group && CalcUnits.unitDef(f.group, u)) state.units[id] = u;
        if (prm[id] !== undefined) {
          if (f.type === 'select' || isFinite(parseFloat(prm[id]))) state.ov[id] = prm[id];
        }
      });
      let idx = 0;
      steps.forEach(function (s, i) { if (s.id === prm.step) idx = i; });
      state.idx = idx;
      const r = parseInt(prm.reached, 10);
      state.reached = Math.min(steps.length - 1, Math.max(idx, isFinite(r) ? r : 0));
    }

    // ---------- Static skeleton ----------
    root.classList.add('guide');
    root.innerHTML = '';
    const progress = h('div', { class: 'guide-progress' });
    const progressText = h('p', { class: 'guide-progress-text', 'aria-live': 'polite' });
    const progressBar = h('div', { class: 'fill-bar guide-progress-bar', 'aria-hidden': 'true' }, '<span></span>');
    progress.appendChild(progressText);
    progress.appendChild(progressBar);
    const nav = h('nav', { class: 'guide-stepper-wrap', 'aria-label': 'Guide steps' });
    const stepper = h('ol', { class: 'guide-stepper' });
    nav.appendChild(stepper);
    const body = h('div', { class: 'guide-body' });
    root.appendChild(progress);
    root.appendChild(nav);
    root.appendChild(body);

    steps.forEach(function (s, i) {
      const li = h('li');
      const b = h('button', { type: 'button', class: 'guide-step-btn', 'data-i': String(i) },
        '<span class="guide-step-num" aria-hidden="true">' + (i + 1) + '</span><span class="guide-step-label">' + esc(s.short || s.title) + '</span>');
      b.setAttribute('aria-label', 'Step ' + (i + 1) + ': ' + s.title);
      b.addEventListener('click', function () { if (i <= state.reached) go(i); });
      li.appendChild(b);
      stepper.appendChild(li);
    });

    function updateStepper() {
      stepper.querySelectorAll('.guide-step-btn').forEach(function (b, i) {
        const cur = i === state.idx;
        b.classList.toggle('is-current', cur);
        b.classList.toggle('is-done', i < state.idx || (i <= state.reached && !cur));
        if (cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        const locked = i > state.reached;
        b.disabled = locked;
        if (locked) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      });
      const s = steps[state.idx];
      progressText.innerHTML = '<strong>Step ' + (state.idx + 1) + ' of ' + steps.length + '</strong> · ' + esc(s.title);
      progressBar.firstChild.style.width = ((state.idx + 1) / steps.length * 100) + '%';
      // keep the current step visible inside the horizontally scrolling stepper (not the page)
      const cur = stepper.children[state.idx];
      if (cur) {
        const left = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
        nav.scrollLeft = Math.max(0, left);
      }
    }

    // ---------- Step DOM ----------
    let dom = null; // references for the current step

    function sourcesHtml(keys) {
      return '<ol class="guide-src">' + keys.map(function (k) {
        return '<li value="' + srcNum(k) + '">' + cfg.sources[k] + '</li>';
      }).join('') + '</ol>';
    }

    function navBar(s) {
      const bar = h('div', { class: 'guide-nav' });
      const back = h('button', { type: 'button', class: 'btn', id: 'guide-back' }, ICONS.prev + 'Back');
      back.disabled = state.idx === 0;
      back.addEventListener('click', function () { if (state.idx > 0) go(state.idx - 1); });
      bar.appendChild(back);
      const reset = h('button', { type: 'button', class: 'btn btn-quiet', id: 'guide-reset' }, 'Reset');
      reset.addEventListener('click', resetAll);
      bar.appendChild(reset);
      if (state.idx < steps.length - 1) {
        const nextS = steps[state.idx + 1];
        const next = h('button', { type: 'button', class: 'btn btn-primary', id: 'guide-next' },
          '<span>Next<span class="guide-next-name">: ' + esc(nextS.short || nextS.title) + '</span></span>' + ICONS.next);
        next.addEventListener('click', function () { go(state.idx + 1); });
        bar.appendChild(next);
      }
      return bar;
    }

    function buildField(f) {
      const wrap = h('div', { class: 'field', 'data-field': f.id });
      const head = h('div', { class: 'guide-label-row' });
      head.appendChild(h('label', { for: 'gf-' + f.id }, esc(f.label)));
      const useBtn = h('button', { type: 'button', class: 'guide-use', hidden: '' }, 'Use suggested');
      useBtn.setAttribute('aria-label', 'Use the suggested value for ' + f.label);
      useBtn.addEventListener('click', function () {
        delete state.ov[f.id];
        update();
        const inp = document.getElementById('gf-' + f.id);
        if (inp) inp.focus();
      });
      head.appendChild(useBtn);
      wrap.appendChild(head);
      let input;
      if (f.type === 'select') {
        input = h('select', { id: 'gf-' + f.id });
        input.addEventListener('change', function () {
          const ctx = evaluate();
          if (input.value === ctx.suggest[f.id]) delete state.ov[f.id];
          else state.ov[f.id] = input.value;
          update();
        });
        wrap.appendChild(input);
      } else {
        const row = h('div', { class: 'input-row' });
        input = h('input', { id: 'gf-' + f.id, type: 'number', inputmode: 'decimal', step: 'any' });
        if (!f.signed) input.setAttribute('min', '0');
        input.addEventListener('input', function () { state.ov[f.id] = input.value; update(); });
        row.appendChild(input);
        if (f.group) {
          const sel = h('select', { class: 'unit-select', 'data-unit-group': f.group, 'data-unit-for': 'gf-' + f.id, 'aria-label': f.label + ' unit' });
          CalcUnits.GROUPS[f.group].units.forEach(function (u) {
            const o = document.createElement('option');
            o.value = u.id; o.textContent = u.label; sel.appendChild(o);
          });
          sel.value = unitOf(f);
          sel.addEventListener('change', function () {
            const from = unitOf(f), to = sel.value;
            if (Object.prototype.hasOwnProperty.call(state.ov, f.id)) {
              const n = parseFloat(state.ov[f.id]);
              if (isFinite(n)) state.ov[f.id] = String(+CalcUnits.convert(f.group, n, from, to).toPrecision(6));
            }
            state.units[f.id] = to;
            update();
          });
          row.appendChild(sel);
        } else if (f.suffix) {
          row.appendChild(h('span', { class: 'unit' }, esc(f.suffix)));
        }
        wrap.appendChild(row);
      }
      const hint = h('div', { class: 'field-hint' });
      wrap.appendChild(hint);
      return { wrap: wrap, input: input, hint: hint, use: useBtn, f: f };
    }

    function buildStep(s) {
      body.innerHTML = '';
      dom = { s: s, fields: [] };
      const headingId = 'guide-step-heading';
      const section = h('section', { class: 'guide-step', 'aria-labelledby': headingId });
      if (s.type === 'summary') {
        buildSummary(s, section, headingId);
        body.appendChild(section);
        body.appendChild(navBar(s));
        return;
      }

      const layout = h('div', { class: 'calc-layout guide-layout' });
      const main = h('div', { class: 'card guide-main' });
      main.appendChild(h('p', { class: 'guide-kicker' }, 'Step ' + (state.idx + 1) + ' of ' + steps.length));
      const heading = h('h2', { class: 'guide-title', id: headingId, tabindex: '-1' }, esc(s.title));
      main.appendChild(heading);
      dom.heading = heading;
      main.appendChild(h('div', { class: 'guide-intro' }, s.intro || ''));

      const fieldsBox = h('div', { class: 'guide-fields' });
      (s.fields || []).forEach(function (f) {
        const fd = buildField(f);
        dom.fields.push(fd);
        fieldsBox.appendChild(fd.wrap);
      });
      main.appendChild(fieldsBox);
      main.appendChild(h('hr', { class: 'divider' }));
      dom.notice = h('div', { class: 'notice', hidden: '', role: 'status' });
      main.appendChild(dom.notice);
      dom.resMain = h('div', { class: 'result-main', 'aria-live': 'polite' }, '<div class="label"></div><div class="value"></div>');
      main.appendChild(dom.resMain);
      dom.resList = h('ul', { class: 'result-list' });
      main.appendChild(dom.resList);
      dom.links = h('div', { class: 'guide-links' });
      main.appendChild(dom.links);
      layout.appendChild(main);

      const side = h('div', { class: 'card guide-side' });
      if (s.viz) {
        side.appendChild(h('h3', { class: 'guide-side-h' }, 'Visual'));
        dom.svg = document.createElementNS(NS, 'svg');
        dom.svg.setAttribute('class', 'viz');
        dom.svg.setAttribute('viewBox', s.viz.viewBox || '0 0 480 260');
        dom.svg.setAttribute('role', 'img');
        dom.svg.setAttribute('aria-label', s.viz.label || s.title + ' diagram');
        side.appendChild(dom.svg);
        dom.caption = h('p', { class: 'viz-caption' });
        side.appendChild(dom.caption);
      }
      side.appendChild(h('h3', { class: 'guide-side-h' }, 'Rules of thumb'));
      dom.tips = h('ul', { class: 'guide-tips' });
      side.appendChild(dom.tips);
      if (s.sources && s.sources.length) {
        side.appendChild(h('h3', { class: 'guide-side-h' }, 'Sources for this step'));
        side.appendChild(h('div', {}, sourcesHtml(s.sources)));
      }
      layout.appendChild(side);
      section.appendChild(layout);
      body.appendChild(section);
      body.appendChild(navBar(s));
    }

    // ---------- Summary ----------
    function sheetData(ctx) {
      return steps.filter(function (s) { return s.type !== 'summary'; }).map(function (s, i) {
        const inputs = (s.fields || []).filter(function (f) { return ctx.shown[f.id]; }).map(function (f) {
          return { label: f.label, value: fieldText(f, ctx), mine: Object.prototype.hasOwnProperty.call(state.ov, f.id) };
        });
        const res = s.results ? s.results(ctx, ctx.r[s.id]) : [];
        return { s: s, i: steps.indexOf(s), inputs: inputs, results: res };
      });
    }

    function buildSummary(s, section, headingId) {
      const card = h('div', { class: 'card guide-summary' });
      card.appendChild(h('p', { class: 'guide-kicker' }, 'Step ' + (state.idx + 1) + ' of ' + steps.length));
      const heading = h('h2', { class: 'guide-title', id: headingId, tabindex: '-1' }, esc(s.title));
      card.appendChild(heading);
      dom.heading = heading;
      card.appendChild(h('div', { class: 'guide-intro' }, s.intro || ''));
      if (s.viz) {
        dom.svg = document.createElementNS(NS, 'svg');
        dom.svg.setAttribute('class', 'viz guide-summary-viz');
        dom.svg.setAttribute('viewBox', s.viz.viewBox || '0 0 480 260');
        dom.svg.setAttribute('role', 'img');
        dom.svg.setAttribute('aria-label', s.viz.label || 'System diagram');
        card.appendChild(dom.svg);
        dom.caption = h('p', { class: 'viz-caption' });
        card.appendChild(dom.caption);
      }
      dom.sheet = h('div', { class: 'guide-sheet' });
      card.appendChild(dom.sheet);
      if (s.after) card.appendChild(h('div', { class: 'guide-after' }, s.after));

      const bar = h('div', { class: 'share-bar guide-share' });
      const mk = function (id, cls, icon, text, fn) {
        const b = h('button', { type: 'button', class: 'btn ' + cls, id: id }, icon + text);
        b.addEventListener('click', fn);
        bar.appendChild(b);
      };
      mk('btn-copy', 'btn-primary', ICONS.copy, 'Copy results', function () { CalcShare.copy(resultsText(), 'Design sheet copied'); });
      mk('btn-link', '', ICONS.link, 'Copy link', function () { CalcShare.copy(shareUrl(), 'Link copied'); });
      mk('btn-share', '', ICONS.share, 'Share', function () { CalcShare.share({ title: cfg.title, text: resultsText(), url: shareUrl() }); });
      mk('btn-print', '', ICONS.print, 'Print', function () { window.print(); });
      card.appendChild(bar);
      section.appendChild(card);
    }

    function renderSummary(ctx) {
      const data = sheetData(ctx);
      dom.sheet.innerHTML = '';
      data.forEach(function (d) {
        const block = h('section', { class: 'guide-sheet-step' });
        const head = h('div', { class: 'guide-sheet-head' });
        head.appendChild(h('h3', {}, (d.i + 1) + '. ' + esc(d.s.title)));
        const edit = h('button', { type: 'button', class: 'guide-use guide-edit' }, 'Edit');
        edit.setAttribute('aria-label', 'Edit step ' + (d.i + 1) + ': ' + d.s.title);
        edit.addEventListener('click', function () { go(d.i); });
        head.appendChild(edit);
        block.appendChild(head);
        const cols = h('div', { class: 'guide-sheet-cols' });
        const inUl = h('ul', { class: 'result-list guide-sheet-in' });
        inUl.setAttribute('aria-label', 'Inputs');
        d.inputs.forEach(function (it) {
          inUl.appendChild(h('li', {}, '<span>' + esc(it.label) + (it.mine ? ' <span class="guide-mine" title="You changed this value">edited</span>' : '') + '</span><span class="v">' + esc(it.value) + '</span>'));
        });
        const outUl = h('ul', { class: 'result-list guide-sheet-out' });
        outUl.setAttribute('aria-label', 'Results');
        d.results.forEach(function (it) {
          outUl.appendChild(h('li', { class: it.main ? 'is-main' : '' }, '<span>' + esc(it.label) + '</span><span class="v">' + esc(it.value) + '</span>'));
        });
        const c1 = h('div', {}, '<h4>Decisions and inputs</h4>'); c1.appendChild(inUl);
        const c2 = h('div', {}, '<h4>Results</h4>'); c2.appendChild(outUl);
        cols.appendChild(c1); cols.appendChild(c2);
        block.appendChild(cols);
        dom.sheet.appendChild(block);
      });
    }

    function resultsText() {
      const ctx = evaluate();
      const lines = [cfg.title + ' – design sheet', ''];
      sheetData(ctx).forEach(function (d) {
        lines.push((d.i + 1) + '. ' + d.s.title);
        d.inputs.forEach(function (it) { lines.push('  ' + it.label + ': ' + it.value); });
        d.results.forEach(function (it) { lines.push('  = ' + it.label + ': ' + it.value); });
        lines.push('');
      });
      lines.push('Estimates only: check each figure against the sources and your equipment data.');
      lines.push(shareUrl());
      return lines.join('\n');
    }

    // ---------- Update the current step ----------
    function linkHref(l) {
      const qs = new URLSearchParams();
      Object.keys(l.params || {}).forEach(function (k) {
        const v = l.params[k];
        if (v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && !isFinite(v))) qs.set(k, v);
      });
      return calcBase + l.slug + '.html' + (qs.toString() ? '?' + qs.toString() : '');
    }

    function update() {
      const ctx = evaluate();
      const s = steps[state.idx];
      CalcShare.writeParams(urlState());
      if (!dom || dom.s !== s) return;
      if (s.type === 'summary') {
        renderSummary(ctx);
        if (s.viz && dom.svg) drawViz(s, ctx, ctx.r[s.id] || {});
        return;
      }
      const r = ctx.r[s.id];
      const msgs = [];
      dom.fields.forEach(function (fd) {
        const f = fd.f;
        const shown = ctx.shown[f.id];
        fd.wrap.hidden = !shown;
        const has = Object.prototype.hasOwnProperty.call(state.ov, f.id);
        if (f.type === 'select') {
          const opts = optionsOf(f, ctx) || [];
          const sig = opts.map(function (o) { return o.value + '|' + o.label; }).join('§');
          if (fd.optSig !== sig) {
            fd.input.innerHTML = opts.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(textOf(o.label)) + '</option>'; }).join('');
            fd.optSig = sig;
          }
          fd.input.value = ctx.v[f.id];
          fd.use.hidden = !(has && ctx.suggest[f.id] !== undefined && ctx.suggest[f.id] !== ctx.v[f.id]);
        } else {
          if (!has && document.activeElement !== fd.input) {
            fd.input.value = displayValue(f, ctx.suggest[f.id]);
          } else if (has && document.activeElement !== fd.input && fd.input.value !== state.ov[f.id]) {
            fd.input.value = state.ov[f.id];
          }
          const sel = fd.wrap.querySelector('.unit-select');
          if (sel && sel.value !== unitOf(f)) sel.value = unitOf(f);
          const sug = ctx.suggest[f.id];
          const differs = has && typeof sug === 'number' && isFinite(sug) && displayValue(f, sug) !== String(parseFloat(state.ov[f.id]));
          fd.use.hidden = !differs;
          if (differs) fd.use.textContent = 'Use suggested (' + displayValue(f, sug) + (f.group ? ' ' + CalcUnits.label(f.group, unitOf(f)) : '') + ')';
          if (shown && ctx.bad[f.id]) msgs.push(ctx.bad[f.id]);
        }
        const hint = typeof f.hint === 'function' ? f.hint(ctx) : (f.hint || '');
        fd.hint.innerHTML = hint;
        fd.hint.hidden = !hint;
      });

      if (s.notices) s.notices(ctx, r).forEach(function (m) { if (m) msgs.push(m); });
      dom.notice.textContent = msgs.join(' ');
      dom.notice.hidden = msgs.length === 0;

      const res = s.results ? s.results(ctx, r) : [];
      const main = res.filter(function (x) { return x.main; })[0];
      dom.resMain.hidden = !main;
      if (main) {
        dom.resMain.querySelector('.label').textContent = main.label;
        dom.resMain.querySelector('.value').textContent = main.value;
      }
      dom.resList.innerHTML = res.filter(function (x) { return !x.main; }).map(function (x) {
        return '<li><span>' + esc(x.label) + '</span><span class="v">' + esc(x.value) + '</span></li>';
      }).join('');

      const links = s.links ? s.links(ctx, r) : [];
      dom.links.innerHTML = '';
      links.forEach(function (l) {
        const a = h('a', { class: 'btn guide-calc-link', href: linkHref(l), target: '_blank', rel: 'noopener', 'data-slug': l.slug },
          ICONS.calc + '<span>Open the full ' + esc(l.label) + ' calculator<span class="visually-hidden"> (opens in a new tab, pre-filled with these values)</span></span>');
        dom.links.appendChild(a);
      });
      if (links.length) dom.links.appendChild(h('p', { class: 'field-hint' }, 'Opens pre-filled with this step’s values, for the full set of options and the detailed explanation.'));

      const tips = typeof s.tips === 'function' ? s.tips(ctx, r) : (s.tips || []);
      dom.tips.innerHTML = tips.map(function (t) { return '<li>' + t + '</li>'; }).join('');

      if (s.viz && dom.svg) drawViz(s, ctx, r);
    }

    function drawViz(s, ctx, r) {
      while (dom.svg.firstChild) dom.svg.removeChild(dom.svg.firstChild);
      try { s.viz.draw(dom.svg, ctx, r, api); } catch (e) { /* a drawing error must never break the inputs */ if (window.console) console.warn(e); }
      if (dom.caption) dom.caption.textContent = s.viz.caption ? s.viz.caption(ctx, r) : '';
    }

    // ---------- Navigation ----------
    function go(i, opts) {
      state.idx = Math.max(0, Math.min(steps.length - 1, i));
      state.reached = Math.max(state.reached, state.idx);
      buildStep(steps[state.idx]);
      updateStepper();
      update();
      if (!opts || !opts.noFocus) {
        dom.heading.focus({ preventScroll: true });
        const top = root.getBoundingClientRect().top + window.pageYOffset - 8;
        if (window.pageYOffset > top) window.scrollTo(0, top);
      }
    }

    function resetAll() {
      if (!window.confirm('Reset the whole guide to the suggested values and go back to step 1?')) return;
      state.ov = {}; state.units = {}; state.reached = 0;
      go(0);
      CalcShare.toast('Guide reset');
    }

    // ---------- Combined sources ----------
    if (cfg.sourcesList) {
      const ol = typeof cfg.sourcesList === 'string' ? document.getElementById(cfg.sourcesList) : cfg.sourcesList;
      if (ol) ol.innerHTML = sourceOrder.map(function (k) { return '<li>' + cfg.sources[k] + '</li>'; }).join('');
    }

    const api = {
      go: go, evaluate: evaluate, state: state, shareUrl: shareUrl, resultsText: resultsText,
      fmt: fmt, q: q, p: p, el: el, srcNum: srcNum
    };

    readUrl();
    go(state.idx, { noFocus: true });
    return api;
  }

  window.CalcGuide = { create: create, fmt: fmt, q: q, p: p, el: el };
})();
