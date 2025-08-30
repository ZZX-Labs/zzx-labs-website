// /inspiration/figures/modules/dom.js
// Live, mutable refs + creation fallback so boot/render always have a grid + template.

export let gridEl   = document.getElementById('figure-grid');
export let tpl      = document.getElementById('tpl-figure-card');
export let filterEl = document.getElementById('figure-filter');
export let countEl  = document.getElementById('figure-count');

function createGridIfMissing() {
  if (gridEl && document.body.contains(gridEl)) return;
  const g = document.createElement('div');
  g.id = 'figure-grid';
  g.className = 'feature-card-container'; // matches your CSS grid

  // Pick the most likely host so it centers correctly
  const host =
    document.querySelector('#inspiration-root') ||
    document.querySelector('section.features') ||
    document.querySelector('main') ||
    document.body;

  host.appendChild(g);
  gridEl = g;
}

function createTemplateIfMissing() {
  if (tpl && document.body.contains(tpl)) return;
  const t = document.createElement('template');
  t.id = 'tpl-figure-card';
  t.innerHTML = `
    <article class="feature-card" data-id="">
      <div class="card-watermark" aria-hidden="true"></div>
      <div class="card-header">
        <span class="swatch"></span>
        <h3 class="fig-name"></h3>
      </div>
      <div class="figure-wrap">
        <img class="fig-img" alt="" loading="lazy" />
      </div>
      <div class="card-actions">
        <button type="button" data-act="expand">Expand all</button>
        <button type="button" data-act="collapse">Collapse all</button>
        <span class="api-badge" style="margin-left:auto;color:#8a8f98;">Wikipedia</span>
      </div>
      <div class="card-content">
        <div class="fig-meta"></div>
        <div class="fig-about"></div>
        <details class="subsection collapsible">
          <summary>Wikipedia</summary>
          <div class="collapsible-body fig-wiki"></div>
        </details>
      </div>
    </article>
  `.trim();
  document.body.appendChild(t);
  tpl = t;
}

function refreshDomRefs({ create = false } = {}) {
  // rebind queries
  if (!gridEl || !document.body.contains(gridEl)) {
    gridEl = document.getElementById('figure-grid') || null;
    if (!gridEl && create) createGridIfMissing();
  }
  if (!tpl || !document.body.contains(tpl)) {
    tpl = document.getElementById('tpl-figure-card') || null;
    if (!tpl && create) createTemplateIfMissing();
  }
  filterEl = document.getElementById('figure-filter') || filterEl || null;
  countEl  = document.getElementById('figure-count')  || countEl  || null;
}

// Run once if DOM already parsed
if (document.readyState !== 'loading') refreshDomRefs();

// Update when DOM is ready
document.addEventListener('DOMContentLoaded', () => refreshDomRefs(), { once: true });

// Export a ready helper that *also* creates missing nodes when asked
export async function ensureDomReady(opts = { create: true }) {
  if (document.readyState === 'loading') {
    await new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
  }
  refreshDomRefs(opts);
}
