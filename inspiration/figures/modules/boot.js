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
    console.warn('Serving from file:// — run a local HTTP server to allow fetch().');
  }

  const [paletteRaw, figures, urls] = await Promise.all([
    j(PALETTE),
    j(FIGURES),
    j(URLS_URL),
  ]);

  // Palette: normalize → include brand → constrain
  let pal = normalizePalette(paletteRaw);
  pal = ensureBaseColor(pal, '#c0d674'); // keep brand green
  pal = constrainPalette(pal, 8, 16);
  state.palette = pal;

  state.figures  = Array.isArray(figures) ? figures : [];
  state.urls     = urls || {};
  state.urlIndex = buildUrlIndex(state.urls);

  // Load all cards (with robust filename matching)
  await Promise.all(state.figures.map(f => loadCard(f)));

  // One seed per page load so order is stable for this session only
  if (state.orderSeed == null) state.orderSeed = randomSeed32();

  // Shuffle once per load; render once
  const shuffled = shuffle(state.figures, { seed: state.orderSeed });
  shuffled.forEach(renderOne);

  // Assign colors ONCE (stable across interactions)
  requestAnimationFrame(() => {
    assignStableEdgeColors();
    applyFilter(); // filtering does NOT recolor
    updateCount(shuffled.length);
  });

  // Bind filter (does not recolor)
  filterEl?.addEventListener('input', applyFilter);
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
  // Use actual layout (first row count) for accuracy with auto-fill grids
  const cards = (state.nodes || []).map(n => n.el);
  return Math.max(1, inferGridColsVisible(cards));
}

function assignStableEdgeColors() {
  const nodes = state.nodes || [];
  const palette = state.palette && state.palette.length ? state.palette.slice() : ['#c0d674'];
  if (!nodes.length) return;

  const cols = getColumnCount();

  // Rotate palette randomly once to get a fresh “start” per page load
  const start = state.orderSeed % palette.length;
  const pal = palette.slice(start).concat(palette.slice(0, start));

  // Build colors only where missing / colliding; keep existing stable
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i].el || nodes[i];
    const id = node?.dataset?.id || String(i);

    // Already has a color?
    const existing = state.colors[id] || null;

    // Determine left & above colors using current map
    const forbidden = new Set();

    // Left neighbor (same row)
    if (i % cols !== 0) {
      const leftNode = nodes[i - 1].el || nodes[i - 1];
      const leftId = leftNode?.dataset?.id;
      if (leftId && state.colors[leftId]) forbidden.add(state.colors[leftId]);
    }

    // Above neighbor (previous row, same column)
    const upIndex = i - cols;
    if (upIndex >= 0) {
      const upNode = nodes[upIndex].el || nodes[upIndex];
      const upId = upNode?.dataset?.id;
      if (upId && state.colors[upId]) forbidden.add(state.colors[upId]);
    }

    // Keep existing if it doesn't collide
    if (existing && !forbidden.has(existing)) {
      applyEdgeColor(node, existing);
      continue;
    }

    // Pick first palette color that isn’t forbidden, with a mild index preference
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

  // tiny UI sync for swatch
  const sw = node.querySelector('.swatch');
  if (sw) sw.style.backgroundColor = color;
}
