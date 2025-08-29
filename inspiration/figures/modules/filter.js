// /inspiration/figures/modules/filter.js
import { state } from './state.js';
import { filterEl, countEl } from './dom.js';

/**
 * Filter only shows/hides and updates count.
 * NO recoloring here — colors stay stable across interactions.
 */
export function applyFilter() {
  const q = (filterEl?.value || '').trim().toLowerCase();
  let shown = 0;

  for (const { el } of state.nodes) {
    const id    = (el.dataset.id || '').toLowerCase();
    const name  = el.querySelector('.fig-name')?.textContent.toLowerCase() || '';
    const about = el.querySelector('.fig-about')?.textContent.toLowerCase() || '';
    const meta  = Array.from(el.querySelectorAll('.fig-meta li'))
                  .map(li => li.textContent.toLowerCase()).join(' ');

    const hit = !q || id.includes(q) || name.includes(q) || about.includes(q) || meta.includes(q);
    el.style.display = hit ? '' : 'none';
    if (hit) shown++;
  }

  if (countEl) countEl.textContent = `${shown} shown of ${state.nodes.length}`;
}
