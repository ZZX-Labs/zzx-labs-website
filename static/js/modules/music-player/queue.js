// static/js/modules/music-player/queue.js
// Render and manage the visible queue (track list) with live metadata support

import { fmtTime, prettyNum } from './utils.js';

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
    li.className = 'mp-row';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === cursor ? 'true' : 'false');

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
 * Highlight the active track row.
 */
export function highlightList(listEl, cursor) {
  if (!listEl) return;
  Array.from(listEl.children).forEach((li, idx) => {
    const active = (idx === cursor);
    li.classList.toggle('active', active);
    li.setAttribute('aria-selected', active);
  });
  // Ensure visible if scrolled out
  const act = listEl.children[cursor];
  if (act) act.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Update the visible title of the current (active) row.
 * @param {HTMLElement} listEl
 * @param {number} cursor
 * @param {string} label - e.g., "Artist - Title"
 */
export function updateActiveRowTitle(listEl, cursor, label) {
  if (!listEl || cursor < 0) return;
  const row = listEl.children[cursor];
  if (!row) return;
  const tDiv = row.querySelector('.t');
  if (!tDiv) return;

  const newText = String(label || '');
  if (tDiv.textContent !== newText) {
    tDiv.classList.add('fade');
    tDiv.textContent = newText;
    setTimeout(() => tDiv.classList.remove('fade'), 250);
  }
}

/**
 * Update right-side badge of active row (LIVE + listeners).
 * e.g., "LIVE • 1,234" for SomaFM.
 */
export function updateActiveRowBadge(listEl, cursor, badgeText) {
  if (!listEl || cursor < 0) return;
  const row = listEl.children[cursor];
  if (!row) return;
  const badge = row.querySelector('.len');
  if (!badge) return;

  const text = (typeof badgeText === 'number')
    ? `LIVE • ${prettyNum(badgeText)}`
    : String(badgeText ?? '');
  badge.textContent = text;
}
