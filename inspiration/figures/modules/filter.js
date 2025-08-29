// /inspiration/figures/modules/filter.js
import { state } from './state.js';
import { filterEl, countEl } from './dom.js';
import { colorizeBalancedNoAdjacency } from './colorize.js';

let raf1 = 0, raf2 = 0;

// diacritic-insensitive, case-insensitive
function norm(s) {
  return String(s || '')
    .normalize?.('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase();
}

function buildSearchCache(el) {
  const id    = norm(el.dataset.id || '');
  const name  = norm(el.querySelector('.fig-name')?.textContent);
  const about = norm(el.querySelector('.fig-about')?.textContent);
  const meta  = norm(
    Array.from(el.querySelectorAll('.fig-meta li'))
      .map(li => li.textContent).join(' ')
  );
  // one big searchable string; cache it
  const cache = [id, name, about, meta].join(' ');
  el.dataset.search = cache;
  return cache;
}

export function applyFilter() {
  const q = norm(filterEl?.value || '');
  let shown = 0;

  state.nodes.forEach(({ el }) => {
    const hay = el.dataset.search || buildSearchCache(el);
    const hit = !q || hay.includes(q);

    // Use the HTML hidden attribute (cleaner than inline display)
    // This *does* remove from flow (intended), so we recolor after reflow.
    el.hidden = !hit;
    el.setAttribute('aria-hidden', String(!hit));
    if (hit) shown++;
  });

  if (countEl) countEl.textContent = `${shown} shown of ${state.nodes.length}`;

  // Double-RAF: let browser apply hidden/display changes & reflow, then recolor.
  cancelAnimationFrame(raf1); cancelAnimationFrame(raf2);
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => colorizeBalancedNoAdjacency());
  });
}
