// static/js/modules/music-player/queue.js
// Render and manage the visible queue (track list)

import { fmtTime } from './utils.js';

/**
 * Render the queue into the <ul class="mp-list"> element.
 * Each item shows title on the left and length/LIVE badge on the right.
 *
 * @param {HTMLElement} listEl - UL element to render into
 * @param {Array} queue - [{ title, isStream, url|urls, length }]
 * @param {number} cursor - active index
 * @param {Function} onPickIndex - (i:number) => void
 */
export function renderQueue(listEl, queue, cursor, onPickIndex) {
  if (!listEl) return;
  listEl.innerHTML = '';

  queue.forEach((t, i) => {
    const li = document.createElement('li');

    const left  = document.createElement('div');
    const right = document.createElement('div');
    left.className  = 't';
    right.className = 'len mono';

    left.textContent = t.title || `Track ${i + 1}`;
    right.textContent = t.isStream ? 'LIVE' : (t.length ? fmtTime(t.length) : '');

    li.appendChild(left);
    li.appendChild(right);

    if (typeof onPickIndex === 'function') {
      li.addEventListener('click', () => onPickIndex(i));
    }

    if (i === cursor) li.classList.add('active');
    listEl.appendChild(li);
  });
}

/**
 * Update which list item is highlighted as active.
 *
 * @param {HTMLElement} listEl
 * @param {number} cursor
 */
export function highlightList(listEl, cursor) {
  if (!listEl) return;
  Array.from(listEl.children).forEach((li, idx) => {
    if (idx === cursor) li.classList.add('active');
    else li.classList.remove('active');
  });
}

/**
 * Update the visible title of the current (active) row.
 * Useful when live metadata arrives and we want to reflect it in the list.
 *
 * @param {HTMLElement} listEl
 * @param {number} cursor
 * @param {string} label - e.g., "Artist - Title"
 */
export function updateActiveRowTitle(listEl, cursor, label) {
  if (!listEl || cursor < 0) return;
  const row = listEl.children[cursor];
  if (!row) return;
  const tDiv = row.querySelector('.t');
  if (tDiv) tDiv.textContent = label;
}

/**
 * Update the right-side badge of the active row (e.g., show listeners).
 * For example, you can display "LIVE • 1,234" for SomaFM.
 *
 * @param {HTMLElement} listEl
 * @param {number} cursor
 * @param {string|number|null} badgeText - e.g., 'LIVE • 1,234' or just '1,234'
 */
export function updateActiveRowBadge(listEl, cursor, badgeText) {
  if (!listEl || cursor < 0) return;
  const row = listEl.children[cursor];
  if (!row) return;
  const badge = row.querySelector('.len');
  if (badge) badge.textContent = String(badgeText ?? '');
}
