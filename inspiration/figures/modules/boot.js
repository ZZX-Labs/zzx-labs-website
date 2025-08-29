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
import { colorizeBalancedNoAdjacency } from './colorize.js';
import { applyFilter } from './filter.js';

export async function boot() {
  if (!gridEl || !tpl) { console.error('Missing #figure-grid or #tpl-figure-card in DOM.'); return; }
  if (location.protocol === 'file:') console.warn('Serving from file:// — run a local HTTP server to allow fetch().');

  const [paletteRaw, figures, urls] = await Promise.all([ j(PALETTE), j(FIGURES), j(URLS_URL) ]);

  // Palette: your JSON → dedupe → ensure brand green → cap to 8–16
  let pal = normalizePalette(paletteRaw);
  pal = ensureBaseColor(pal, '#c0d674');
  pal = constrainPalette(pal, 8, 16);
  state.palette = pal;

  state.figures  = Array.isArray(figures) ? figures : [];
  state.urls     = urls || {};
  state.urlIndex = buildUrlIndex(state.urls);

  // Load all cards (with robust filename matching)
  await Promise.all(state.figures.map(f => loadCard(f)));

  // Shuffle and render
  const shuffled = shuffle(state.figures);
  shuffled.forEach(renderOne);

  // Initial colorization + filter binding
  requestAnimationFrame(() => { colorizeBalancedNoAdjacency(); applyFilter(); });

  filterEl?.addEventListener('input', applyFilter);

  // Recolor on resize (columns change)
  let recalc = null;
  addEventListener('resize', () => {
    clearTimeout(recalc);
    recalc = setTimeout(() => colorizeBalancedNoAdjacency(), 80);
  }, { passive: true });

  // Recolor once images load
  document.querySelectorAll('img.fig-img').forEach(img => {
    img.addEventListener('load', () => colorizeBalancedNoAdjacency(), { once: true });
  });

  // Count
  const shown = state.nodes.length;
  const countEl = document.getElementById('figure-count');
  if (countEl && !countEl.textContent) countEl.textContent = `${shown} shown of ${shuffled.length}`;
}
