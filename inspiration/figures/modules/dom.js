// /inspiration/figures/modules/dom.js

// Use mutable exports so we can populate them once the DOM is ready.
export let gridEl   = document.getElementById('figure-grid');
export let tpl      = document.getElementById('tpl-figure-card');
export let filterEl = document.getElementById('figure-filter');
export let countEl  = document.getElementById('figure-count');

function refreshDomRefs() {
  gridEl   = gridEl   || document.getElementById('figure-grid');
  tpl      = tpl      || document.getElementById('tpl-figure-card');
  filterEl = filterEl || document.getElementById('figure-filter');
  countEl  = countEl  || document.getElementById('figure-count');
}

// If the document isn’t fully parsed yet, wait and rebind.
// (app.js already calls boot after DOMContentLoaded, but this makes it robust)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => refreshDomRefs(), { once: true });
} else {
  refreshDomRefs();
}

// Optional helper if you ever want to await DOM readiness elsewhere.
export async function ensureDomReady() {
  if (document.readyState === 'loading') {
    await new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
  }
  refreshDomRefs();
}
