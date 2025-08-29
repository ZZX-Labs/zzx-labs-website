// Render a figure card + collapsible wiki sections
import { sanitizeAndRewrite, isCollapsibleHeading, displayTitleString } from './utils.js';

export function mkFigureCard({ id, name, imgUrl, accent }) {
  const card = document.createElement('article');
  card.className = 'feature-card';
  card.id = `fig-${id}`;

  card.innerHTML = `
    <div class="card-watermark" aria-hidden="true"></div>
    <div class="card-header">
      <span class="swatch" style="background:${accent || '#888'}"></span>
      <h3>${name}</h3>
    </div>
    <div class="figure-wrap">
      <img src="${imgUrl}" alt="${name}" onerror="this.onerror=null;this.src='../static/images/placeholder.jpg';" />
    </div>
    <div class="card-actions">
      <button type="button" data-act="expand">Expand all</button>
      <button type="button" data-act="collapse">Collapse all</button>
      <span class="api-badge" style="margin-left:auto;color:#aaa;">Wikipedia</span>
    </div>
    <div class="card-content"><p class="loading">Loading ${name}…</p></div>
  `;

  // actions
  const content = card.querySelector('.card-content');
  card.querySelector('[data-act="expand"]').addEventListener('click', () => {
    content.querySelectorAll('details.subsection.collapsible').forEach(d => d.open = true);
  });
  card.querySelector('[data-act="collapse"]').addEventListener('click', () => {
    content.querySelectorAll('details.subsection.collapsible').forEach(d => d.open = false);
  });

  return card;
}

export function renderFigureSectionsInto(cardEl, pageInfo, sections) {
  const content = cardEl.querySelector('.card-content');
  content.innerHTML = '';

  // meta row (optional)
  const meta = document.createElement('div');
  meta.className = 'source-meta';
  meta.style.cssText = 'color:#8a8f98;font-size:.85rem;word-break:break-all;margin:.25rem 0 .5rem;';
  meta.innerHTML = `<a href="${pageInfo.url}" target="_blank" rel="noopener noreferrer">${pageInfo.url}</a>
    ${pageInfo.updated ? ` — Last updated: ${pageInfo.updated.toLocaleString()}` : ''}`;
  content.appendChild(meta);

  for (const s of sections) {
    const id = `${cardEl.id}--sec-${s.index}`;
    const title = s.line;

    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    details.id = id;
    details.open = false; // collapsed by default (all sections)

    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'collapsible-body';
    body.innerHTML = sanitizeAndRewrite(s.html || '');
    details.appendChild(body);

    // Always collapse "reference-like" headings (still collapsed by default anyway)
    if (isCollapsibleHeading(title)) details.open = false;

    content.appendChild(details);
  }
}

export function openIfCollapsibleTarget(id) {
  const el = document.getElementById(id);
  if (el && el.tagName.toLowerCase() === 'details' && el.classList.contains('collapsible')) {
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function attachHashOpenHandler() {
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id) openIfCollapsibleTarget(id);
  });
  if (location.hash) openIfCollapsibleTarget(location.hash.slice(1));
}
