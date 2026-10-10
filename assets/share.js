// Shared helpers for every calculator page: URL state, copy, share, toast.
(function () {
  'use strict';

  function readParams() {
    const out = {};
    new URLSearchParams(window.location.search).forEach(function (v, k) { out[k] = v; });
    return out;
  }

  function buildUrl(state) {
    const params = new URLSearchParams();
    Object.keys(state).forEach(function (k) {
      if (state[k] !== '' && state[k] !== null && state[k] !== undefined) params.set(k, state[k]);
    });
    const base = window.location.origin + window.location.pathname;
    const qs = params.toString();
    return qs ? base + '?' + qs : base;
  }

  function writeParams(state) {
    try {
      history.replaceState(null, '', buildUrl(state));
    } catch (e) { /* file:// or sandboxed iframes can refuse; sharing still works */ }
  }

  function toast(message) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copy(text, message) {
    const done = function () { toast(message || 'Copied to clipboard'); };
    const fail = function () {
      if (fallbackCopy(text)) done();
      else window.prompt('Copy this:', text);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  function share(opts) {
    if (navigator.share) {
      navigator.share({ title: opts.title, text: opts.text, url: opts.url }).catch(function (err) {
        if (err && err.name !== 'AbortError') copy(opts.url, 'Link copied');
      });
    } else {
      copy(opts.url, 'Link copied (sharing not supported in this browser)');
    }
  }

  window.CalcShare = {
    readParams: readParams,
    writeParams: writeParams,
    buildUrl: buildUrl,
    copy: copy,
    share: share,
    toast: toast
  };
})();
