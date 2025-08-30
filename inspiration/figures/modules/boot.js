// /inspiration/figures/modules/boot.js
import { PALETTE, FIGURES, URLS_URL } from './paths.js';
import { gridEl as GRID, tpl as TPL, filterEl as FILTER, ensureDomReady } from './dom.js';
import { state } from './state.js';
import { j } from './net.js';
import { normalizePalette, ensureBaseColor, constrainPalette } from './palette.js';
import { buildUrlIndex } from './names.js';
import { loadCard } from './cards.js';
import { shuffle } from './shuffle.js';
import { renderOne } from './render.js';
import { applyFilter } from './filter.js';
import { inferGridColsVisible } from './grid.js';

let gridEl = GRID, tpl = TPL, filterEl = FILTER;

export async function boot() {
  if (state.booted) return;

  // Ensure DOM is ready and create grid/template if missing.
  try {
    if (typeof ensureDomReady === 'function') {
      await ensureDomReady({ create: true });
      // rebind live refs after dom.js updated them
      gridEl   = GRID || document.getElementById('figure-grid');
      tpl      = TPL  || document.getElementById('tpl-figure-card');
      filterEl = FILTER || document.getElementById('figure-filter');
    } else {
      // Fallback (older dom.js)
      await waitDomReady();
      gridEl = document.getElementById('figure-grid') || createGrid();
      tpl    = document.getElementById('tpl-figure-card') || createTemplate();
    }
  } catch {
    await waitDomReady();
    gridEl = document.getElementById('figure-grid') || createGrid();
    tpl    = document.getElementById('tpl-figure-card') || createTemplate();
  }

  if (!gridEl || !tpl) {
    console.error('Missing #figure-grid or #tpl-figure-card');
    return;
  }
  state.booted = true;

  // Patch template to ensure renderOne() hooks are present
  ensureTemplateShape(tpl);

  if (location.protocol === 'file:') {
    console.warn('Serving from file:// — run a local HTTP server to allow fetch().');
  }

  // Load figures first (critical path)
  let figures = [];
  try {
    figures = await j(FIGURES);
  } catch (e) {
    console.error('[figures] load failed:', e);
    gridEl.innerHTML = `<p class="error">Failed to load figures: ${e?.message || e}</p>`;
    return;
  }
  state.figures  = Array.isArray(figures) ? figures : [];

  // Best-effort palette + URLs
  let paletteRaw = null, urls = {};
  try { paletteRaw = await j(PALETTE); } catch (e) { console.warn('[palette] load failed; using fallback.', e); }
  try { urls      = await j(URLS_URL); } catch (e) { console.warn('[urls] load failed; continuing.', e); }
  state.urls     = urls || {};
  state.urlIndex = buildUrlIndex(state.urls);

  // Normalize palette (ensure brand; 8–16)
  const fallbackPalette = [
    '#c0d674', /* brand */ '#6b8e23', /* olive drab */
    '#ff3b30', '#ff6a00', '#f4b400',
    '#00a2ff', '#6b4eff', '#ff2ec8'
  ];
  let pal = normalizePalette(paletteRaw || fallbackPalette);
  pal = ensureBaseColor(pal, '#c0d674');
  pal = constrainPalette(pal, 8, 16);
  state.palette = pal.length ? pal : fallbackPalette;

  // Load per-card JSONs (robust name matching)
  await Promise.all(state.figures.map(f => loadCard(f)));

  // Stable shuffle per page load
  if (state.orderSeed == null) state.orderSeed = randomSeed32();
  const shuffled = shuffle(state.figures, { seed: state.orderSeed });

  // Render
  gridEl.innerHTML = '';
  state.nodes.length = 0;
  for (const fig of shuffled) {
    try { renderOne(fig); }
    catch (e) {
      console.error('[renderOne] failed for', fig?.id, e);
      gridEl.appendChild(minCardFallback(fig));
    }
  }

  // One pass colorization (stable; no churn on scroll/filter)
  requestAnimationFrame(() => {
    assignStableEdgeColors();
    applyFilter();
    updateCount(shuffled.length);
  });

  // Filter outline to brand on focus (requested)
  if (filterEl) {
    filterEl.addEventListener('focus', () => {
      filterEl.style.outline = '2px solid #c0d674';
      filterEl.style.outlineOffset = '2px';
      filterEl.style.borderColor = '#c0d674';
      filterEl.style.caretColor = '#c0d674';
    });
    filterEl.addEventListener('blur', () => {
      filterEl.style.outline = '';
      filterEl.style.outlineOffset = '';
      filterEl.style.borderColor = '';
    });
    filterEl.addEventListener('input', applyFilter);
  }

  // Re-check adjacency if columns change; keep existing colors where valid
  let t = 0;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { assignStableEdgeColors(); updateCount(shuffled.length); }, 100);
  }, { passive: true });
}

/* ---------------- helpers ---------------- */

function waitDomReady() {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
}

function createGrid() {
  const g = document.createElement('div');
  g.id = 'figure-grid';
  g.className = 'feature-card-container';
  const host =
    document.querySelector('#inspiration-root') ||
    document.querySelector('section.features') ||
    document.querySelector('main') ||
    document.body;
  host.appendChild(g);
  return g;
}

function createTemplate() {
  const t = document.createElement('template');
  t.id = 'tpl-figure-card';
  t.innerHTML = `
    <article class="feature-card" data-id="">
      <div class="card-watermark" aria-hidden="true"></div>
      <div class="card-header">
        <span class="swatch"></span>
        <h3 class="fig-name"></h3>
      </div>
      <div class="figure-wrap"><img class="fig-img" alt="" loading="lazy" /></div>
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
  return t;
}

function randomSeed32() {
  try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] >>> 0; }
  catch { return ((Math.random() * 0x100000000) | 0) >>> 0; }
}

function updateCount(total) {
  const el = document.getElementById('figure-count');
  if (!el) return;
  const shown = (state.nodes || []).filter(n => n.el?.style.display !== 'none').length;
  el.textContent = `${shown} shown of ${total}`;
}

function getColumnCount() {
  const cards = (state.nodes || []).map(n => n.el);
  return Math.max(1, inferGridColsVisible(cards));
}

function assignStableEdgeColors() {
  const nodes = state.nodes || [];
  const palette = state.palette?.length ? state.palette.slice() : ['#c0d674'];
  if (!nodes.length) return;

  const cols = getColumnCount();
  const start = (state.orderSeed ?? 0) % palette.length;
  const pal = palette.slice(start).concat(palette.slice(0, start));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i].el || nodes[i];
    const id = node?.dataset?.id || String(i);
    const existing = state.colors[id] || null;

    const forbidden = new Set();
    if (i % cols !== 0) {
      const L = nodes[i - 1].el || nodes[i - 1];
      const lid = L?.dataset?.id; if (lid && state.colors[lid]) forbidden.add(state.colors[lid]);
    }
    const up = i - cols;
    if (up >= 0) {
      const U = nodes[up].el || nodes[up];
      const uid = U?.dataset?.id; if (uid && state.colors[uid]) forbidden.add(state.colors[uid]);
    }

    if (existing && !forbidden.has(existing)) {
      applyEdgeColor(node, existing);
      continue;
    }

    const pref = i % pal.length;
    let chosen = pal[pref];
    if (forbidden.has(chosen)) {
      for (let k = 1; k < pal.length; k++) {
        const c = pal[(pref + k) % pal.length];
        if (!forbidden.has(c)) { chosen = c; break; }
      }
    }

    state.colors[id] = chosen;
    applyEdgeColor(node, chosen);
  }
}

function applyEdgeColor(node, color) {
  if (!node) return;
  node.style.setProperty('--edge', color);
  node.dataset.colorResolved = color;
  const sw = node.querySelector('.swatch');
  if (sw) sw.style.backgroundColor = color;
}

/* Ensure template matches renderOne() expectations */
function ensureTemplateShape(t) {
  const c = t?.content; if (!c) return;

  let nameEl = c.querySelector('.fig-name');
  if (!nameEl) {
    const h3 = c.querySelector('h3') || c.querySelector('.card-header h3');
    if (h3) h3.classList.add('fig-name');
  }

  let imgEl = c.querySelector('.fig-img');
  if (!imgEl) {
    const img = c.querySelector('img') || c.querySelector('.figure-wrap img');
    if (img) img.classList.add('fig-img');
  }

  if (!c.querySelector('.fig-meta')) {
    const content = c.querySelector('.card-content') || c;
    const div = document.createElement('div');
    div.className = 'fig-meta';
    content.prepend(div);
  }

  if (!c.querySelector('.fig-about')) {
    const content = c.querySelector('.card-content') || c;
    const div = document.createElement('div');
    div.className = 'fig-about';
    content.appendChild(div);
  }

  if (!c.querySelector('.fig-wiki')) {
    const content = c.querySelector('.card-content') || c;
    const det = document.createElement('details');
    det.className = 'subsection collapsible';
    const sum = document.createElement('summary');
    sum.textContent = 'Wikipedia';
    const body = document.createElement('div');
    body.className = 'collapsible-body fig-wiki';
    det.append(sum, body);
    content.appendChild(det);
  }

  if (!c.querySelector('.swatch')) {
    const header = c.querySelector('.card-header') || c.querySelector('header');
    if (header) {
      const sw = document.createElement('span');
      sw.className = 'swatch';
      header.insertBefore(sw, header.firstChild);
    }
  }
}

/* Minimal fallback if renderOne() throws */
function minCardFallback(fig) {
  const a = document.createElement('article');
  a.className = 'feature-card';
  a.dataset.id = fig?.id || '';
  a.innerHTML = `
    <div class="card-header"><span class="swatch"></span><h3 class="fig-name">${fig?.name || fig?.id || 'Unknown'}</h3></div>
    <div class="figure-wrap" style="aspect-ratio:16/10;background:#101318;border-bottom:1px solid rgba(255,255,255,.08)"></div>
    <div class="card-content">
      <div class="fig-meta"></div>
      <div class="fig-about"><p class="muted">Card template was missing expected parts; rendered minimal fallback.</p></div>
      <details class="subsection collapsible"><summary>Wikipedia</summary><div class="collapsible-body fig-wiki"><p class="muted">Not loaded here.</p></div></details>
    </div>
  `;
  state.nodes.push({ id: fig?.id || '', el: a });
  return a;
}
