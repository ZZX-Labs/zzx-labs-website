// /inspiration/figures/modules/render.js
import { state } from './state.js';
import { gridEl, tpl } from './dom.js';
import { normalizeCard } from './cards.js';
import { getWikiUrl } from './names.js';
import { loadWikiInto } from './wiki.js';
import { imageCandidates } from './images.js';

export function renderOne(fig) {
  if (!tpl?.content) throw new Error('Missing #tpl-figure-card <template> content.');
  const root = tpl.content.querySelector('.feature-card') || tpl.content.firstElementChild;
  if (!root) throw new Error('Template does not contain a .feature-card root node.');

  const raw  = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, raw);

  const node = root.cloneNode(true);
  node.dataset.id = fig.id;

  // Title
  const nameEl = node.querySelector('.fig-name');
  if (nameEl) nameEl.textContent = data.name;

  // Image (with fallback chain ending in /images/placeholder.jpg)
  const img = node.querySelector('.fig-img');
  if (img) {
    img.alt = data.alt;
    img.loading = 'lazy';
    img.decoding = 'async';

    const candidates = imageCandidates(fig.id, data.name, data.image, data.legacyImageSrc);
    let idx = 0;
    const tryNext = () => { if (idx < candidates.length) img.src = candidates[idx++]; };
    img.addEventListener('error', tryNext, { passive: true });
    tryNext();
  }

  // Meta lines
  const metaEl = node.querySelector('.fig-meta');
  if (metaEl) {
    metaEl.innerHTML = '';
    if (data.meta?.length) {
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = '0';
      ul.style.margin = '.25rem 0 .5rem';
      data.meta.forEach(line => {
        const li = document.createElement('li');
        li.style.margin = '.15rem 0';
        li.textContent = line;
        ul.appendChild(li);
      });
      metaEl.appendChild(ul);
    }
  }

  // About content
  const about = node.querySelector('.fig-about');
  if (about) {
    about.innerHTML = data.aboutHtml || `<p class="muted">No local summary yet. See Wikipedia below.</p>`;
  }

  // Wikipedia (lazy load on first expand)
  const wikiBox = node.querySelector('.fig-wiki');
  if (wikiBox) {
    const wurl = getWikiUrl(fig, data);
    if (wurl) {
      const wikiDetails = wikiBox.closest('details');
      if (wikiDetails) {
        let loaded = false;
        wikiDetails.addEventListener('toggle', () => {
          if (wikiDetails.open && !loaded) { loaded = true; loadWikiInto(wikiBox, wurl); }
        }, { once: true, passive: true });
      } else {
        // fallback: simple link if no <details>
        wikiBox.innerHTML = `<a href="${wurl}" target="_blank" rel="noopener">Open on Wikipedia</a>`;
      }
    } else {
      wikiBox.innerHTML = `<p class="error">No Wikipedia URL configured.</p>`;
    }
  }

  // Precompute a search haystack for fast filtering (optional, backward compatible)
  node.dataset.search = [
    fig.id,
    data.name,
    ...(data.meta || []),
    stripHtml(data.aboutHtml || '')
  ].join(' ').toLowerCase();

  gridEl.appendChild(node);
  state.nodes.push({ id: fig.id, el: node });
}

// tiny helper
function stripHtml(s) {
  const div = document.createElement('div');
  div.innerHTML = s;
  return (div.textContent || div.innerText || '').trim();
}
