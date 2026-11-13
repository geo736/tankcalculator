/* Calculator engine for the greenhouse and NEEMO pack.
 *
 * One page is one spec object passed to GFC.mount. The engine owns the form,
 * the share link, the headline figures, the result table, the figure frame,
 * the equation block and the reference list, so a calculator page carries
 * only its own physics.
 *
 * No build step and no external requests: a page opens from the file system
 * as readily as from a server.
 */
(function (root) {
  'use strict';

  var GFC = {};

  /* ---------- numbers ------------------------------------------------- */

  /* Significant-figure formatting with thin thousands separators. Results are
   * shown to the precision the inputs can carry, not to the precision the
   * floating-point unit happens to produce. */
  GFC.sig = function (x, n) {
    if (x === null || x === undefined || typeof x !== 'number' || !isFinite(x)) return '--';
    n = n || 3;
    if (x === 0) return '0';
    var mag = Math.floor(Math.log10(Math.abs(x)));
    var dp = Math.max(0, n - 1 - mag);
    if (dp > 8) dp = 8;
    var s;
    if (Math.abs(x) >= 1e7 || Math.abs(x) < 1e-4) {
      s = x.toExponential(n - 1);
    } else {
      s = x.toFixed(dp);
      if (s.indexOf('.') !== -1) s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    }
    if (s.indexOf('e') !== -1) return s;
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
  };

  GFC.fixed = function (x, dp) {
    if (x === null || x === undefined || typeof x !== 'number' || !isFinite(x)) return '--';
    var s = x.toFixed(dp === undefined ? 1 : dp).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return s.join('.');
  };

  GFC.pct = function (x, dp) {
    if (typeof x !== 'number' || !isFinite(x)) return '--';
    return GFC.fixed(100 * x, dp === undefined ? 1 : dp) + ' %';
  };

  /* A required positive input, named in the message so the page says which
   * field is wrong rather than failing silently. */
  GFC.need = function (v, name, opts) {
    opts = opts || {};
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(name + ' must be a number.');
    if (opts.min !== undefined && v < opts.min) throw new Error(name + ' must be at least ' + opts.min + '.');
    if (opts.max !== undefined && v > opts.max) throw new Error(name + ' must be at most ' + opts.max + '.');
    if (opts.positive && v <= 0) throw new Error(name + ' must be greater than zero.');
    return v;
  };

  /* ---------- dom ----------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  GFC.el = el;

  /* ---------- svg ----------------------------------------------------- */

  var SVG = {};
  GFC.svgns = SVG;

  SVG.esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  SVG.open = function (w, h, title) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="'
      + SVG.esc(title || '') + '" xmlns="http://www.w3.org/2000/svg">';
  };
  SVG.close = function () { return '</svg>'; };
  SVG.line = function (x1, y1, x2, y2, stroke, w, dash) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2
      + '" stroke="' + stroke + '" stroke-width="' + (w === undefined ? 1 : w) + '"'
      + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />';
  };
  SVG.rect = function (x, y, w, h, fill, extra) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h
      + '" fill="' + fill + '"' + (extra || '') + ' />';
  };
  SVG.circle = function (cx, cy, r, fill, extra) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill
      + '"' + (extra || '') + ' />';
  };
  SVG.path = function (d, stroke, w, fill, dash) {
    return '<path d="' + d + '" fill="' + (fill || 'none') + '" stroke="'
      + (stroke || 'none') + '" stroke-width="' + (w === undefined ? 1.6 : w)
      + '" stroke-linejoin="round" stroke-linecap="round"'
      + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />';
  };
  SVG.text = function (x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 11)
      + '" fill="' + (o.fill || 'currentColor') + '" text-anchor="'
      + (o.anchor || 'start') + '"'
      + (o.weight ? ' font-weight="' + o.weight + '"' : '')
      + (o.mono ? ' font-family="ui-monospace, Menlo, Consolas, monospace"' : '')
      + (o.rotate ? ' transform="rotate(' + o.rotate + ' ' + x + ' ' + y + ')"' : '')
      + '>' + SVG.esc(s) + '</text>';
  };

  /* A scale that maps data to pixels and remembers its own bounds. */
  SVG.scale = function (dMin, dMax, pMin, pMax) {
    if (dMax === dMin) dMax = dMin + 1;
    var f = function (v) { return pMin + (pMax - pMin) * (v - dMin) / (dMax - dMin); };
    f.min = dMin; f.max = dMax;
    f.clamp = function (v) { return f(Math.max(dMin, Math.min(dMax, v))); };
    return f;
  };

  /* Round a data range outward to a readable step, so the outermost tick
   * always closes past the data and no point sits on a panel edge. */
  SVG.nice = function (lo, hi, want) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi === lo) { hi = lo + Math.abs(lo || 1) * 0.1; }
    want = want || 5;
    var span = hi - lo;
    var raw = span / want;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var nLo = Math.floor(lo / step) * step;
    var nHi = Math.ceil(hi / step) * step;
    if (nHi === hi) nHi += step;          /* never flush with the top tick */
    if (nLo === lo && lo !== 0) nLo -= step;
    var n = Math.round((nHi - nLo) / step);
    return { min: nLo, max: nHi, step: step, ticks: n };
  };

  /* Plot frame: gridlines, ticks, axis lines, axis titles. */
  SVG.frame = function (o) {
    var g = '', i, t, px, py;
    var x0 = o.left, x1 = o.left + o.w, y0 = o.top, y1 = o.top + o.h;
    if (o.fill) g += SVG.rect(x0, y0, o.w, o.h, o.fill);
    var nx = o.xTicks || 5, ny = o.yTicks || 4;
    for (i = 0; i <= nx; i++) {
      t = o.xMin + (o.xMax - o.xMin) * i / nx;
      px = x0 + o.w * i / nx;
      g += SVG.line(px, y0, px, y1, o.grid, 1);
      g += SVG.text(px, y1 + 15, o.xFmt ? o.xFmt(t) : GFC.sig(t, 3),
        { anchor: 'middle', size: 10.5, fill: o.soft });
    }
    for (i = 0; i <= ny; i++) {
      t = o.yMin + (o.yMax - o.yMin) * i / ny;
      py = y1 - o.h * i / ny;
      g += SVG.line(x0, py, x1, py, o.grid, 1);
      g += SVG.text(x0 - 7, py + 3.5, o.yFmt ? o.yFmt(t) : GFC.sig(t, 3),
        { anchor: 'end', size: 10.5, fill: o.soft });
    }
    g += SVG.line(x0, y1, x1, y1, o.axis, 1.2);
    g += SVG.line(x0, y0, x0, y1, o.axis, 1.2);
    if (o.xLabel) g += SVG.text((x0 + x1) / 2, y1 + 35, o.xLabel, { anchor: 'middle', size: 11.5, fill: o.soft });
    if (o.yLabel) g += SVG.text(x0 - 46, (y0 + y1) / 2, o.yLabel, { anchor: 'middle', size: 11.5, fill: o.soft, rotate: -90 });
    return g;
  };

  /* Legends sit below the axes, never inside the plot area. */
  SVG.legend = function (x, y, items, soft) {
    var g = '', cx = x, i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      g += it.dash
        ? SVG.line(cx, y - 3.5, cx + 16, y - 3.5, it.colour, 2.2, it.dash)
        : SVG.rect(cx, y - 7.5, 16, 8, it.colour);
      g += SVG.text(cx + 21, y, it.label, { size: 11, fill: soft });
      cx += 21 + it.label.length * 6.0 + 18;
    }
    return g;
  };

  /* A horizontal bar chart, the default figure where a result is a set of
   * magnitudes that have to be compared. */
  SVG.bars = function (o) {
    var pal = o.pal, W = o.width || 620;
    var rows = o.rows.filter(function (r) { return isFinite(r.value); });
    var labelW = o.labelW || 150;
    var left = labelW, right = W - 74;
    var rowH = o.rowH || 30, top = 10;
    var H = top + rows.length * rowH + 30;
    var maxV = 0, minV = 0, i, r, x0, xv, y;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].value > maxV) maxV = rows[i].value;
      if (rows[i].value < minV) minV = rows[i].value;
    }
    var nc = SVG.nice(minV, maxV, 4);
    var sx = SVG.scale(nc.min, nc.max, left, right);
    var g = SVG.open(W, H, o.title || 'Breakdown');
    x0 = sx(0);
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      y = top + i * rowH;
      xv = sx(r.value);
      g += SVG.rect(x0, y + 4, xv - x0, rowH - 13, r.colour || pal.series[i % pal.series.length]);
      g += SVG.text(left - 8, y + rowH / 2 + 1, r.label, { anchor: 'end', size: 11.5, fill: pal.ink });
      g += SVG.text(Math.max(xv, x0) + 6, y + rowH / 2 + 1,
        (r.text !== undefined ? r.text : GFC.sig(r.value, 3)), { size: 11, fill: pal.soft, mono: true });
    }
    g += SVG.line(x0, top, x0, top + rows.length * rowH, pal.axis || pal.soft, 1.2);
    g += SVG.text(left, H - 8, o.axisLabel || '', { size: 11, fill: pal.soft });
    g += SVG.close();
    return g;
  };

  /* Theme colours read off the stylesheet, so figures follow the page. */
  GFC.palette = function () {
    var cs = getComputedStyle(document.documentElement);
    var get = function (k, d) { return (cs.getPropertyValue(k) || '').trim() || d; };
    var p = {
      ink: get('--gfc-ink', '#19201c'),
      soft: get('--gfc-ink-soft', '#5b6660'),
      line: get('--gfc-line', '#dfe4e0'),
      grid: get('--gfc-grid', '#e9ece9'),
      accent: get('--gfc-accent', '#1f6f50'),
      accentSoft: get('--gfc-accent-soft', '#e7f1ec'),
      warn: get('--gfc-warn', '#8a4b16'),
      panel: get('--gfc-panel', '#ffffff')
    };
    p.axis = p.soft;
    /* One fixed ramp, so a series keeps its colour from page to page. */
    p.series = ['#1f6f50', '#2f6f9e', '#b2762b', '#7c4b86', '#4a7f7a', '#9e4f3f'];
    return p;
  };

  /* ---------- references ---------------------------------------------- */

  GFC.reference = function (key) {
    var c = (root.CITES || {})[key];
    if (!c) return null;
    var head = [];
    if (c.authors) head.push(c.authors);
    if (c.year) head.push('(' + c.year + ')');
    var tail = '';
    if (c.container) {
      tail = c.container;
      if (c.volume) tail += ' ' + c.volume;
      if (c.page) tail += ', ' + c.page;
    }
    return { head: head.join(' '), title: c.title, tail: tail, doi: c.doi };
  };

  function renderRefs(keys) {
    var ol = el('ol', 'gfc-refs'), i, r, li, a;
    for (i = 0; i < keys.length; i++) {
      r = GFC.reference(keys[i]);
      li = el('li');
      if (!r) {
        li.textContent = 'Reference "' + keys[i] + '" is missing from cites.js.';
        ol.appendChild(li);
        continue;
      }
      li.appendChild(document.createTextNode(r.head + ' '));
      li.appendChild(el('span', 'gfc-rt', r.title + '.'));
      if (r.tail) li.appendChild(document.createTextNode(' ' + r.tail + '.'));
      if (r.doi) {
        li.appendChild(document.createTextNode(' '));
        a = el('a', null, 'doi:' + r.doi);
        a.href = 'https://doi.org/' + r.doi;
        a.rel = 'noopener';
        li.appendChild(a);
      }
      ol.appendChild(li);
    }
    return ol;
  }

  /* ---------- share link ---------------------------------------------- */

  /* Where in the fragment this page's inputs live. Empty for a standalone
   * page, so the fragment is just "a=1&b=2"; the single-file bundle sets it to
   * "/<slug>?" so the router's own route survives an input change. */
  GFC.route = { prefix: '' };

  function hashBody() {
    var raw = (location.hash || '').replace(/^#/, '');
    var p = GFC.route.prefix;
    if (!p) return raw;
    return raw.indexOf(p) === 0 ? raw.slice(p.length) : '';
  }

  function readHash(inputs) {
    /* A link from a guided design passes its inputs as ?a=1&b=2; the page's own
     * share link uses the fragment. Either is read, the fragment first. */
    var raw = hashBody() || (location.search || '').replace(/^\?/, ''), got = {};
    if (!raw) return got;
    raw.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      got[decodeURIComponent(kv.slice(0, i))] =
        decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    var keep = {};
    inputs.forEach(function (f) { if (f.id in got) keep[f.id] = got[f.id]; });
    return keep;
  }

  function writeHash(values, inputs) {
    var parts = [];
    inputs.forEach(function (f) {
      var v = values[f.id];
      if (v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v))) return;
      parts.push(encodeURIComponent(f.id) + '=' + encodeURIComponent(String(v)));
    });
    var h = GFC.route.prefix + parts.join('&');
    try {
      history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
    } catch (e) { /* file:// in some browsers refuses replaceState; the page still works */ }
  }

  /* ---------- mount --------------------------------------------------- */

  GFC.mount = function (spec) {
    var host = document.getElementById('gfc-app');
    if (!host) throw new Error('gfc: the page has no #gfc-app element');

    document.body.classList.add('gfc');
    document.title = spec.name + ' — Tank Calculator';

    var homeHref = spec.homeHref || '../index.html';

    var top = el('header', 'gfc-top');
    var tw = el('div', 'gfc-wrap');
    var home = el('a', 'gfc-home');
    home.href = homeHref;
    home.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>';
    home.appendChild(document.createTextNode('Tank Calculator'));
    tw.appendChild(home);
    var nav = el('nav');
    var back = el('a', null, 'All calculators');
    back.href = homeHref;
    nav.appendChild(back);
    tw.appendChild(nav);
    top.appendChild(tw);
    host.appendChild(top);

    var head = el('div', 'gfc-head');
    var hw = el('div', 'gfc-wrap');
    if (spec.kicker) hw.appendChild(el('p', 'gfc-kicker', spec.kicker));
    hw.appendChild(el('h1', null, spec.name));
    if (spec.lede) hw.appendChild(el('p', 'gfc-lede', spec.lede));
    head.appendChild(hw);
    host.appendChild(head);

    var mainWrap = el('div', 'gfc-wrap');
    host.appendChild(mainWrap);
    var main = el('div', 'gfc-main');
    mainWrap.appendChild(main);

    /* --- form --- */
    var form = el('form', 'gfc-card');
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.appendChild(el('h2', null, 'Inputs'));
    if (spec.inputNote) form.appendChild(el('p', 'gfc-cardnote', spec.inputNote));

    var controls = {};
    var fromHash = readHash(spec.inputs);
    var lastGroup = null;

    spec.inputs.forEach(function (f) {
      if (f.group && f.group !== lastGroup) {
        form.appendChild(el('div', 'gfc-group', f.group));
        lastGroup = f.group;
      }
      var wrap = el('div', 'gfc-field');
      var lab = el('label');
      lab.htmlFor = 'f-' + f.id;
      lab.appendChild(document.createTextNode(f.label));
      if (f.unit) {
        lab.appendChild(document.createTextNode(' '));
        lab.appendChild(el('span', 'gfc-unit', '(' + f.unit + ')'));
      }
      wrap.appendChild(lab);

      var ctl;
      if (f.type === 'select') {
        ctl = el('select');
        f.options.forEach(function (o) {
          var op = el('option', null, o.label);
          op.value = String(o.v);
          ctl.appendChild(op);
        });
      } else if (f.type === 'text') {
        ctl = el('textarea');
        if (f.rows) ctl.rows = f.rows;
        if (f.placeholder) ctl.placeholder = f.placeholder;
      } else {
        ctl = el('input');
        ctl.type = 'number';
        if (f.min !== undefined) ctl.min = f.min;
        if (f.max !== undefined) ctl.max = f.max;
        ctl.step = f.step === undefined ? 'any' : f.step;
      }
      ctl.id = 'f-' + f.id;
      ctl.value = (f.id in fromHash) ? fromHash[f.id] : String(f.value);
      wrap.appendChild(ctl);
      if (f.help) wrap.appendChild(el('span', 'gfc-help', f.help));
      form.appendChild(wrap);
      controls[f.id] = { ctl: ctl, def: f };
    });

    var actions = el('div', 'gfc-actions');
    var bReset = el('button', 'gfc-btn', 'Reset');
    var bShare = el('button', 'gfc-btn', 'Copy link');
    var bCopy = el('button', 'gfc-btn', 'Copy results');
    [bReset, bShare, bCopy].forEach(function (b) { b.type = 'button'; actions.appendChild(b); });
    form.appendChild(actions);
    main.appendChild(form);

    /* --- results --- */
    var out = el('div');
    var headline = el('div', 'gfc-headline');
    var flags = el('div');
    out.appendChild(headline);
    out.appendChild(flags);

    var figCard = el('div', 'gfc-card');
    var figWrap = el('div', 'gfc-figwrap');
    var figCap = el('p', 'gfc-figcap');
    figCard.appendChild(figWrap);
    figCard.appendChild(figCap);
    out.appendChild(figCard);

    var tblCard = el('div', 'gfc-card');
    tblCard.style.marginTop = '16px';
    tblCard.appendChild(el('h2', null, 'Result in full'));
    var tblWrap = el('div', 'gfc-tablewrap');
    tblCard.appendChild(tblWrap);
    out.appendChild(tblCard);
    main.appendChild(out);

    /* --- explanation, caveats, sources --- */
    var below = el('div', 'gfc-wrap');
    host.appendChild(below);

    if (spec.math && spec.math.length) {
      var mathSec = el('section', 'gfc-sec');
      mathSec.appendChild(el('h2', null, 'How it works'));
      spec.math.forEach(function (m) {
        var box = el('div', 'gfc-eq');
        if (m.lead) box.appendChild(el('p', 'gfc-eq-note', m.lead));
        if (m.math) {
          var mm = el('div', 'gfc-eq-math');
          mm.innerHTML = m.math;        /* authored on this page, never user input */
          box.appendChild(mm);
        }
        if (m.note) box.appendChild(el('p', 'gfc-eq-note', m.note));
        mathSec.appendChild(box);
      });
      below.appendChild(mathSec);
    }

    if (spec.caveats && spec.caveats.length) {
      var cSec = el('section', 'gfc-sec');
      cSec.appendChild(el('h2', null, 'What this does not tell you'));
      var ul = el('ul');
      ul.style.fontSize = '14.5px';
      ul.style.color = 'var(--gfc-ink-soft)';
      spec.caveats.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      cSec.appendChild(ul);
      below.appendChild(cSec);
    }

    var rSec = el('section', 'gfc-sec');
    rSec.appendChild(el('h2', null, 'Sources'));
    rSec.appendChild(renderRefs(spec.sources || []));
    below.appendChild(rSec);

    var foot = el('footer', 'gfc-foot');
    var fw = el('div', 'gfc-wrap');
    fw.appendChild(el('p', null, 'Calculations are estimates for screening. '
      + 'Check the sources above before relying on a result.'));
    if (spec.provenance) fw.appendChild(el('p', null, spec.provenance));
    foot.appendChild(fw);
    host.appendChild(foot);

    /* --- the loop --- */
    function values() {
      var v = {};
      Object.keys(controls).forEach(function (k) {
        var c = controls[k], raw = c.ctl.value;
        if (c.def.type === 'text') { v[k] = raw; return; }
        if (c.def.type === 'select') {
          var n = Number(raw);
          v[k] = (raw !== '' && isFinite(n) && /^[-+0-9.eE]+$/.test(raw)) ? n : raw;
          return;
        }
        v[k] = raw === '' ? NaN : Number(raw);
      });
      return v;
    }

    var lastText = '';

    function run() {
      var v = values();
      writeHash(v, spec.inputs);
      var pal = GFC.palette();
      var r;
      try {
        r = spec.compute(v);
      } catch (err) {
        headline.innerHTML = '';
        flags.innerHTML = '';
        var fl = el('div', 'gfc-flag');
        fl.appendChild(el('strong', null, 'Cannot compute.'));
        fl.appendChild(document.createTextNode(' ' + (err && err.message ? err.message : String(err))));
        flags.appendChild(fl);
        figCard.hidden = true;
        tblWrap.innerHTML = '';
        return;
      }

      headline.innerHTML = '';
      (r.headline || []).forEach(function (h) {
        var box = el('div', 'gfc-hl');
        box.appendChild(el('span', 'gfc-hl-label', h.label));
        var val = el('span', 'gfc-hl-value');
        val.appendChild(document.createTextNode(h.value));
        if (h.unit) val.appendChild(el('span', 'gfc-hl-unit', h.unit));
        box.appendChild(val);
        if (h.hint) box.appendChild(el('span', 'gfc-hl-hint', h.hint));
        headline.appendChild(box);
      });

      flags.innerHTML = '';
      (r.flags || []).forEach(function (f) {
        var fl = el('div', 'gfc-flag');
        if (f.head) fl.appendChild(el('strong', null, f.head));
        fl.appendChild(document.createTextNode((f.head ? ' ' : '') + f.text));
        flags.appendChild(fl);
      });

      if (spec.draw) {
        figWrap.innerHTML = spec.draw(v, r, pal);
        figCap.textContent = r.caption || spec.caption || '';
        figCard.hidden = false;
      } else {
        figCard.hidden = true;
      }

      var tbl = el('table', 'gfc-tbl');
      var thead = el('thead'), htr = el('tr');
      ['Quantity', 'Value', 'Unit', 'Basis'].forEach(function (h) { htr.appendChild(el('th', null, h)); });
      thead.appendChild(htr);
      tbl.appendChild(thead);
      var tb = el('tbody'), lines = [];
      (r.rows || []).forEach(function (row) {
        var tr = el('tr');
        tr.appendChild(el('td', null, row.label));
        tr.appendChild(el('td', 'gfc-num', row.value));
        tr.appendChild(el('td', 'gfc-num', row.unit || ''));
        tr.appendChild(el('td', 'gfc-note', row.note || ''));
        tb.appendChild(tr);
        lines.push(row.label + '\t' + row.value + (row.unit ? ' ' + row.unit : ''));
      });
      tbl.appendChild(tb);
      tblWrap.innerHTML = '';
      tblWrap.appendChild(tbl);

      lastText = spec.name + '\n' + location.href + '\n\nInputs\n'
        + spec.inputs.map(function (f) {
            return '  ' + f.label + (f.unit ? ' (' + f.unit + ')' : '') + '\t' + v[f.id];
          }).join('\n')
        + '\n\nResults\n  ' + lines.join('\n  ') + '\n';
    }

    Object.keys(controls).forEach(function (k) {
      controls[k].ctl.addEventListener('input', run);
      controls[k].ctl.addEventListener('change', run);
    });

    bReset.addEventListener('click', function () {
      Object.keys(controls).forEach(function (k) {
        controls[k].ctl.value = String(controls[k].def.value);
      });
      run();
    });

    function flash(btn, label) {
      var was = btn.textContent;
      btn.textContent = label;
      btn.setAttribute('data-done', '1');
      setTimeout(function () {
        btn.textContent = was;
        btn.removeAttribute('data-done');
      }, 1400);
    }
    function copy(text, btn) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { flash(btn, 'Copied'); },
          function () { flash(btn, 'Copy failed'); });
        return;
      }
      var ta = el('textarea');
      ta.value = text;
      ta.className = 'gfc-vis-hidden';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flash(btn, 'Copied'); }
      catch (e) { flash(btn, 'Copy failed'); }
      document.body.removeChild(ta);
    }
    bShare.addEventListener('click', function () { copy(location.href, bShare); });
    bCopy.addEventListener('click', function () { copy(lastText, bCopy); });

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', run);
    }

    run();
    return { run: run, values: values };
  };

  root.GFC = GFC;
}(typeof window !== 'undefined' ? window : globalThis));

