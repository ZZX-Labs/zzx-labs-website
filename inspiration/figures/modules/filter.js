// /inspiration/figures/modules/filter.js
import { state } from './state.js';
import { filterEl, countEl } from './dom.js';
import { colorizeBalancedNoAdjacency } from './colorize.js';

let raf1 = 0, raf2 = 0;

export function applyFilter() {
  const q = (filterEl?.value || '').trim().toLowerCase();
  let shown = 0;

  state.nodes.forEach(({ el }) => {
    const id    = (el.dataset.id || '').toLowerCase();
    const name  = el.querySelector('.fig-name')?.textContent.toLowerCase() || '';
    const about = el.querySelector('.fig-about')?.textContent.toLowerCase() || '';
    const meta  = Array.from(el.querySelectorAll('.fig-meta li'))
                  .map(li => li.textContent.toLowerCase()).join(' ');

    const hit = !q || id.includes(q) || name.includes(q) || about.includes(q) || meta.includes(q);
    // Use visibility toggle to avoid layout thrash from removing flow entirely
    el.style.display = hit ? '' : 'none';
    if (hit) shown++;
  });

  if (countEl) countEl.textContent = `${shown} shown of ${state.nodes.length}`;

  // Double-RAF: wait for the browser to apply display changes and reflow, then colorize.
  cancelAnimationFrame(raf1); cancelAnimationFrame(raf2);
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => colorizeBalancedNoAdjacency());
  });
}
