import { state } from './state.js';
import { gridEl, tpl } from './dom.js';
import { normalizeCard } from './cards.js';
import { getWikiUrl } from './names.js';
import { loadWikiInto } from './wiki.js';
import { imageCandidates } from './images.js';

export function renderOne(fig) {
  const raw  = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, raw);
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = fig.id;

  node.querySelector('.fig-name').textContent = data.name;

  const img = node.querySelector('.fig-img');
  img.alt = data.alt;
  img.loading = 'lazy';
  const candidates = imageCandidates(fig.id, data.name, data.image, data.legacyImageSrc);
  let idx = 0;
  const tryNext = () => { if (idx < candidates.length) img.src = candidates[idx++]; };
  img.addEventListener('error', tryNext);
  tryNext();

  const metaEl = node.querySelector('.fig-meta');
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

  const about = node.querySelector('.fig-about');
  about.innerHTML = data.aboutHtml || `<p class="muted">No local summary yet. See Wikipedia below.</p>`;

  const wikiBox = node.querySelector('.fig-wiki');
  const wurl = getWikiUrl(fig, data);
  if (wurl) {
    const wikiDetails = wikiBox.closest('details');
    let loaded = false;
    wikiDetails?.addEventListener('toggle', () => {
      if (wikiDetails.open && !loaded) { loaded = true; loadWikiInto(wikiBox, wurl); }
    }, { once: true });
  } else {
    wikiBox.innerHTML = `<p class="error">No Wikipedia URL configured.</p>`;
  }

  gridEl.appendChild(node);
  state.nodes.push({ id: fig.id, el: node });
}
