// /inspiration/modules/render.js
// Render a figure card + collapsible wiki sections (drop-in)
import { sanitizeAndRewrite, isCollapsibleHeading } from './utils.js';
import { IMAGES_DIR } from './config.js';

export function mkFigureCard({ id, name, imgUrl, accent }) {
  const card = document.createElement('article');
  card.className = 'feature-card';
  card.id = `fig-${id}`;
  card.dataset.id = id;              // used by filters/colorizers, etc.
  if (accent) card.style.setProperty('--edge', accent); // rim-only color hint

  const safeName = String(name || id).trim();
  const placeholderUrl = `${IMAGES_DIR}/placeholder.jpg`;

  card.innerHTML = `
    <div class="card-watermark" aria-hidden="true"></div>
    <div class="card-header">
      <span class="swatch"></span>
      <h3 class="fig-name">${safeName}</h3>
    </div>
    <div class="figure-wrap">
      <img class="fig-img" src="${imgUrl}" alt="${safeName}"
           loading="lazy" decoding="async" referrerpolicy="no-referrer"
           onerror="this.onerror=null;this.src='${placeholderUrl}';" />
    </div>
    <div class="card-actions">
      <button type="button" data-act="expand">Expand all</button>
      <button type="button" data-act="collapse">Collapse all</button>
      <span class="api-badge" style="margin-left:auto;color:#aaa;">Wikipedia</span>
    </div>
    <div class="card-content">
      <p class="loading">Loading ${safeName}…</p>
    </div>
  `;

  // actions
  const content = card.querySelector('.card-content');
  card.querySelector('[data-act="expand"]').addEventListener('click', () => {
    content.querySelectorAll('details.subsection.collapsible').forEach(d => (d.open = true));
  });
  card.querySelector('[data-act="collapse"]').addEventListener('click', () => {
    content.querySelectorAll('details.subsection.collapsible').forEach(d => (d.open = false));
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

  // wrapper so filters can target full wiki text easily
  const aboutWrap = document.createElement('div');
  aboutWrap.className = 'fig-about';
  content.appendChild(aboutWrap);

  for (const s of sections) {
    const id = `${cardEl.id}--sec-${s.index}`;
    const title = s.line;

    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    details.id = id;
    details.open = false; // collapsed by default

    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'collapsible-body';
    body.innerHTML = sanitizeAndRewrite(s.html || '');
    details.appendChild(body);

    if (isCollapsibleHeading(title)) details.open = false;

    aboutWrap.appendChild(details);
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
