// inspiration/figures/app.js
const PALETTE_URL = './figures/color-palette.json';
const FIGURES_URL = './figures/figures.json';
const URLS_URL    = './figures/urls.json';     // { "<id>": "https://en.wikipedia.org/wiki/..." }
const CARDS_DIR   = './figures/cards/';        // "<id>.json" files with your extracted text + image filename
const IMAGES_DIR  = './figures/images/';       // fallback image path if card omits "image"

const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = '&origin=*';

const gridEl   = document.getElementById('figure-grid');
const tpl      = document.getElementById('tpl-figure-card');
const filterEl = document.getElementById('figure-filter');
const countEl  = document.getElementById('figure-count');

const state = {
  palette: [],
  figures: [],   // [{id, name}]
  urls: {},      // {id: wikiUrl}
  cards: {},     // {id: {name, aboutHtml, image, meta:[]}}
  nodes: []      // {id, el}
};

async function j(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function slugFromWiki(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) {
      return decodeURIComponent(u.pathname.replace('/wiki/',''));
    }
    return decodeURIComponent(u.searchParams.get('title') || '');
  } catch {
    return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0];
  }
}

function sanitizeWiki(html) {
  // minimal cleanup — feel free to swap with DOMPurify if you add it
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  // nuke scripts/styles
  tmp.querySelectorAll('script, style, noscript').forEach(n => n.remove());
  // dark-theme cruft
  tmp.querySelectorAll('.infobox, .navbox, .metadata, .mw-editsection, .hatnote, .mw-empty-elt')
     .forEach(n => n.remove());
  // tables: make responsive-ish
  tmp.querySelectorAll('table').forEach(t => t.style.width = '100%');

  // Collapse typical reference sections
  const headings = tmp.querySelectorAll('h2, h3, h4');
  headings.forEach(h => {
    const text = h.textContent.trim().toLowerCase();
    if (/^(references?|citations?|notes|footnotes?|bibliography|external links|further reading|see also)$/.test(text)) {
      const details = document.createElement('details');
      details.className = 'subsection collapsible';
      const sum = document.createElement('summary');
      sum.textContent = h.textContent.trim();
      details.appendChild(sum);

      const body = document.createElement('div');
      body.className = 'collapsible-body';
      // move siblings into details until next same/greater heading
      let n = h.nextSibling;
      const stopTags = new Set(['H2','H3','H4','H5','H6']);
      while (n && !(n.nodeType === 1 && stopTags.has(n.tagName))) {
        const next = n.nextSibling;
        body.appendChild(n);
        n = next;
      }
      details.appendChild(body);
      h.replaceWith(details);
    }
  });

  // open external links in new tab
  tmp.querySelectorAll('a[href]').forEach(a => a.setAttribute('target','_blank'));

  return tmp.innerHTML;
}

async function loadWikiInto(el, wikiUrl) {
  const title = slugFromWiki(wikiUrl);
  if (!title) {
    el.innerHTML = `<p class="error">Missing Wikipedia title.</p>`;
    return;
  }
  try {
    const qs = new URLSearchParams({
      action: 'parse', format: 'json', prop: 'text', page: title
    }).toString();

    const data = await (await fetch(`${MW_API}?${qs}${ORIGIN}`)).json();
    const raw = data?.parse?.text?.['*'] || '';
    el.innerHTML = sanitizeWiki(raw) || `<p class="error">No content returned.</p>`;
  } catch (e) {
    el.innerHTML = `<p class="error">Failed to load Wikipedia: ${e.message}</p>`;
  }
}

function renderOne(fig) {
  const cardData = state.cards[fig.id] || {};
  const node = tpl.content.firstElementChild.cloneNode(true);

  // name
  node.querySelector('.fig-name').textContent = cardData.name || fig.name;

  // image
  const img = node.querySelector('.fig-img');
  const imgFile = cardData.image || `${fig.id}.jpg`;
  img.src = `${IMAGES_DIR}${imgFile}`;
  img.alt = cardData.name || fig.name;

  // meta (optional bullets -> styled listless)
  const meta = node.querySelector('.fig-meta');
  if (Array.isArray(cardData.meta) && cardData.meta.length) {
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none'; ul.style.padding = '0'; ul.style.margin = '.25rem 0 .5rem';
    cardData.meta.forEach(line => {
      const li = document.createElement('li');
      li.style.margin = '.15rem 0';
      li.textContent = line;
      ul.appendChild(li);
    });
    meta.appendChild(ul);
  }

  // about
  const about = node.querySelector('.fig-about');
  about.innerHTML = cardData.aboutHtml || `<p>No local summary yet. See Wikipedia below.</p>`;

  // wiki (lazy)
  const wikiBox = node.querySelector('.fig-wiki');
  const wurl = state.urls[fig.id];
  if (wurl) {
    // load when details opened the first time
    const wikiDetails = wikiBox.closest('details');
    let loaded = false;
    wikiDetails.addEventListener('toggle', () => {
      if (wikiDetails.open && !loaded) {
        loaded = true;
        loadWikiInto(wikiBox, wurl);
      }
    }, { once: true });
  } else {
    wikiBox.innerHTML = `<p class="error">No Wikipedia URL configured.</p>`;
  }

  // attach & track
  gridEl.appendChild(node);
  state.nodes.push({ id: fig.id, el: node });
}

function computeGridCols(container) {
  // try CSS grid template first
  const cs = getComputedStyle(container);
  const cols = cs.gridTemplateColumns?.split(' ').filter(Boolean).length || 0;
  if (cols > 0) return cols;

  // fallback: estimate by width
  const first = container.querySelector('.feature-card');
  if (!first) return 1;
  const cw = container.clientWidth || 1;
  const fw = first.getBoundingClientRect().width || 280;
  return Math.max(1, Math.floor(cw / Math.max(1, fw)));
}

function colorizeNoAdjacency() {
  const cols = computeGridCols(gridEl);
  const colors = state.palette.slice();
  if (!colors.length) return;

  // assign colors row-by-row; avoid same as left or above
  const cards = state.nodes.map(n => n.el);
  cards.forEach((card, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const left = col > 0 ? cards[i - 1].dataset.color : null;
    const above = row > 0 ? cards[i - cols]?.dataset.color : null;

    const choices = colors.filter(c => c !== left && c !== above);
    const pick = choices.length ? choices[Math.floor(Math.random() * choices.length)]
                                : colors[Math.floor(Math.random() * colors.length)];
    card.dataset.color = pick;
    // Optional: tint header accents
    card.style.setProperty('--card-accent', pick);
  });
}

function applyFilter() {
  const q = (filterEl.value || '').trim().toLowerCase();
  let shown = 0;
  state.nodes.forEach(({ el }) => {
    const name = el.querySelector('.fig-name')?.textContent.toLowerCase() || '';
    const about = el.querySelector('.fig-about')?.textContent.toLowerCase() || '';
    const hit = !q || name.includes(q) || about.includes(q);
    el.style.display = hit ? '' : 'none';
    if (hit) shown++;
  });
  countEl.textContent = `${shown} shown`;
}

async function loadCard(id) {
  try {
    const data = await j(`${CARDS_DIR}${id}.json`);
    state.cards[id] = data;
  } catch {
    // tolerate missing local card
    state.cards[id] = {};
  }
}

async function boot() {
  [state.palette, state.figures, state.urls] = await Promise.all([
    j(PALETTE_URL), j(FIGURES_URL), j(URLS_URL)
  ]);

  // load all cards (in parallel, but don’t block render too long)
  await Promise.all(state.figures.map(f => loadCard(f.id)));

  // render
  state.figures.forEach(renderOne);

  // colorize once painted
  requestAnimationFrame(() => {
    colorizeNoAdjacency();
    applyFilter();
  });

  // interactions
  filterEl?.addEventListener('input', applyFilter);
  // recolor on resize if columns change materially
  let lastCols = computeGridCols(gridEl);
  window.addEventListener('resize', () => {
    const cols = computeGridCols(gridEl);
    if (cols !== lastCols) {
      lastCols = cols;
      colorizeNoAdjacency();
    }
  }, { passive: true });
}

boot().catch(err => {
  gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
});
