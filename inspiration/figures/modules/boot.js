// /inspiration/figures/modules/boot.js
import { PALETTE, FIGURES, URLS_URL } from './paths.js';
import { gridEl, tpl, filterEl } from './dom.js';
import { state } from './state.js';
import { j } from './net.js';
import { normalizePalette, ensureBaseColor, constrainPalette } from './palette.js';
import { buildUrlIndex } from './names.js';
import { loadCard } from './cards.js';
import { shuffle } from './shuffle.js';
import { renderOne } from './render.js';
import { applyFilter } from './filter.js';
import { inferGridColsVisible } from './grid.js';

export async function boot() {
  if (state.booted) return;
  state.booted = true;

  if (!gridEl || !tpl) {
    console.error('Missing #figure-grid or #tpl-figure-card in DOM.');
    return;
  }
  if (location.protocol === 'file:') {
    console.warn('Serving from file:// — run a local web server to allow fetch().');
  }

  // --- Load FIGURES first; render must not be blocked by palette/urls ---
  let figures = [];
  try {
    figures = await j(FIGURES);
  } catch (e) {
    console.error('[figures] Failed to load figures:', e);
    gridEl.innerHTML = `<p class="error">Failed to load figures: ${e?.message || e}</p>`;
    return;
  }
  state.figures = Array.isArray(figures) ? figures : [];

  // Palette + URLs load independently; fall back gracefully
  let paletteRaw = null;
  try { paletteRaw = await j(PALETTE); } catch (e) { console.warn('[figures] palette.json load failed, using fallback.', e); }
  let urls = {};
  try { urls = await j(URLS_URL); } catch (e) { console.warn('[figures] urls.json load failed, continuing.', e); }
  state.urls = urls || {};
  state.urlIndex = buildUrlIndex(state.urls);

  // Palette: normalize → include brand → constrain → fallback if missing
  const fallbackPalette = [
    '#c0d674', // brand
    '#6b8e23', // olive drab
    '#ff3b30',
    '#ff6a00',
    '#f4b400',
    '#00a2ff',
    '#6b4eff',
    '#ff2ec8'
  ];
  let pal = normalizePalette(paletteRaw || fallbackPalette);
  pal = ensureBaseColor(pal, '#c0d674');
  pal = constrainPalette(pal, 8, 16);
  state.palette = pal.length ? pal : fallbackPalette;

  // Load all per-figure card JSONs (don’t block earlier than necessary)
  await Promise.all(state.figures.map(f => loadCard(f)));

  // One seed per page load so order is stable for this session only
  if (state.orderSeed == null) state.orderSeed = randomSeed32();

  // Shuffle once per load; render once
  const shuffled = shuffle(state.figures, { seed: state.orderSeed });
  shuffled.forEach(renderOne);

  // Assign colors ONCE (stable across interactions)
  requestAnimationFrame(() => {
    assignStableEdgeColors();
    applyFilter();           // filtering does NOT recolor
    updateCount(shuffled.length);
  });

  // Bind filter (does not recolor)
  filterEl?.addEventListener('input', applyFilter);

  // Re-evaluate adjacency after layout changes (only fix collisions; keep stable colors otherwise)
  let t = 0;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { assignStableEdgeColors(); updateCount(shuffled.length); }, 100);
  }, { passive: true });

  // If images load and cause reflow/row wrap, fix collisions once
  document.querySelectorAll('img.fig-img').forEach(img => {
    img.addEventListener('load', () => assignStableEdgeColors(), { once: true });
  });
}

/* ---------------- helpers ---------------- */

function randomSeed32() {
  try {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] >>> 0;
  } catch {
    return ((Math.random() * 0x100000000) | 0) >>> 0;
  }
}

function updateCount(total) {
  const countEl = document.getElementById('figure-count');
  if (!countEl) return;
  const shown = (state.nodes || []).filter(n => n.el?.style.display !== 'none').length;
  countEl.textContent = `${shown} shown of ${total}`;
}

function getColumnCount() {
  const cards = (state.nodes || []).map(n => n.el);
  return Math.max(1, inferGridColsVisible(cards));
}

function assignStableEdgeColors() {
  const nodes = state.nodes || [];
  const palette = state.palette && state.palette.length ? state.palette.slice() : ['#c0d674'];
  if (!nodes.length) return;

  const cols = getColumnCount();
  const start = (state.orderSeed ?? 0) % palette.length;
  const pal = palette.slice(start).concat(palette.slice(0, start));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i].el || nodes[i];
    const id = node?.dataset?.id || String(i);

    const existing = state.colors[id] || null;

    // Who's left/above (based on current state.colors)?
    const forbidden = new Set();
    if (i % cols !== 0) {
      const leftNode = nodes[i - 1].el || nodes[i - 1];
      const leftId = leftNode?.dataset?.id;
      if (leftId && state.colors[leftId]) forbidden.add(state.colors[leftId]);
    }
    const upIndex = i - cols;
    if (upIndex >= 0) {
      const upNode = nodes[upIndex].el || nodes[upIndex];
      const upId = upNode?.dataset?.id;
      if (upId && state.colors[upId]) forbidden.add(state.colors[upId]);
    }

    // Keep existing if it doesn’t collide
    if (existing && !forbidden.has(existing)) {
      applyEdgeColor(node, existing);
      continue;
    }

    // Pick first non-forbidden color, mildly preferring index
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
