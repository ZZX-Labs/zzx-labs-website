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

export async function boot() {
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

  // Shuffle once per load; render once
  const shuffled = shuffle(state.figures);
  shuffled.forEach(renderOne);

  // Assign colors ONCE (stable across interactions)
  requestAnimationFrame(() => {
    assignStableEdgeColors();
    applyFilter();
  });

  // Bind filter (does not recolor)
  filterEl?.addEventListener('input', applyFilter);

  // Count (initial)
  const shown = state.nodes?.length || 0;
  const countEl = document.getElementById('figure-count');
  if (countEl && !countEl.textContent) {
    countEl.textContent = `${shown} shown of ${shuffled.length}`;
  }
}

/* ---------------- helpers: stable color assignment ---------------- */

function getColumnCount() {
  // Prefer computed grid-template-columns; fall back to width heuristic
  const cs = getComputedStyle(gridEl);
  const tpl = cs.gridTemplateColumns;
  if (tpl && tpl !== 'none') {
    // e.g., "300px 300px 300px" or "repeat(4, 1fr)" expanded by browser
    const parts = tpl.trim().split(/\s+/);
    return Math.max(1, parts.length);
  }
  const gap = parseFloat(cs.columnGap) || 8;
  const min = 280; // matches your min card width
  const width = gridEl.clientWidth || window.innerWidth;
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

function assignStableEdgeColors() {
  // Don’t reassign if we already did
  if (state.colorMap && Object.keys(state.colorMap).length) {
    applyColorMap(state.colorMap);
    return;
  }

  const nodes = state.nodes || [];
  const palette = state.palette || ['#c0d674'];
  if (!nodes.length) return;

  const cols = getColumnCount();

  // Rotate palette randomly once to get a fresh “start” per page load
  const start = Math.floor(Math.random() * palette.length);
  const pal = palette.slice(start).concat(palette.slice(0, start));

  const colorMap = {};
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const id = node?.dataset?.id || String(i);

    // Avoid immediate left and above collisions
    const forbidden = new Set();

    // left neighbor (same row)
    if (i % cols !== 0) {
      const left = nodes[i - 1];
      const leftId = left?.dataset?.id;
      if (leftId && colorMap[leftId]) forbidden.add(colorMap[leftId]);
    }

    // above neighbor (previous row, same column)
    const upIndex = i - cols;
    if (upIndex >= 0) {
      const up = nodes[upIndex];
      const upId = up?.dataset?.id;
      if (upId && colorMap[upId]) forbidden.add(colorMap[upId]);
    }

    // pick first palette color that isn't forbidden, with a mild offset
    const pref = i % pal.length;
    let chosen = pal[pref];
    if (forbidden.has(chosen)) {
      for (let k = 1; k < pal.length; k++) {
        const candidate = pal[(pref + k) % pal.length];
        if (!forbidden.has(candidate)) { chosen = candidate; break; }
      }
    }

    colorMap[id] = chosen;
  }

  state.colorMap = colorMap;
  applyColorMap(colorMap);
}

function applyColorMap(map) {
  const nodes = state.nodes || [];
  for (const node of nodes) {
    const id = node?.dataset?.id;
    const color = id ? map[id] : null;
    if (!color) continue;

    // Only color the rim via CSS var; card body stays on page bg
    node.style.setProperty('--edge', color);

    // tiny UI sync for swatch
    const sw = node.querySelector('.swatch');
    if (sw) sw.style.backgroundColor = color;
  }
}
