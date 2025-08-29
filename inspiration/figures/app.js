// inspiration/figures/app.js
const BASE      = new URL('./', import.meta.url);
const PALETTE   = new URL('color-palette.json', BASE);
const FIGURES   = new URL('figures.json', BASE);
const URLS      = new URL('urls.json', BASE);
const CARDS_DIR = new URL('cards/', BASE);
const IMGS_DIR  = new URL('images/', BASE);

const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = '&origin=*';

const gridEl   = document.getElementById('figure-grid');
const tpl      = document.getElementById('tpl-figure-card');
const filterEl = document.getElementById('figure-filter');
const countEl  = document.getElementById('figure-count');

const state = { palette: [], figures: [], urls: {}, cards: {}, nodes: [] };

async function j(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}
function urlJoin(dir, name) { return new URL(name, dir); }

function slugFromWiki(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) return decodeURIComponent(u.pathname.replace('/wiki/',''));
    return decodeURIComponent(u.searchParams.get('title') || '');
  } catch {
    return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0];
  }
}

function sanitizeWiki(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  tmp.querySelectorAll('script,style,noscript').forEach(n => n.remove());
  tmp.querySelectorAll('.infobox,.navbox,.metadata,.mw-editsection,.hatnote,.mw-empty-elt').forEach(n => n.remove());
  tmp.querySelectorAll('table').forEach(t => t.style.width = '100%');
  const headings = tmp.querySelectorAll('h2,h3,h4');
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
      let n = h.nextSibling; const stop = new Set(['H2','H3','H4','H5','H6']);
      while (n && !(n.nodeType === 1 && stop.has(n.tagName))) { const next = n.nextSibling; body.appendChild(n); n = next; }
      details.appendChild(body);
      h.replaceWith(details);
    }
  });
  tmp.querySelectorAll('a[href]').forEach(a => a.setAttribute('target','_blank'));
  return tmp.innerHTML;
}

async function loadWikiInto(el, wikiUrl) {
  const title = slugFromWiki(wikiUrl);
  if (!title) { el.innerHTML = `<p class="error">Missing Wikipedia title.</p>`; return; }
  try {
    const qs = new URLSearchParams({ action:'parse', format:'json', prop:'text', page:title }).toString();
    const data = await (await fetch(`${MW_API}?${qs}${ORIGIN}`)).json();
    const raw = data?.parse?.text?.['*'] || '';
    el.innerHTML = sanitizeWiki(raw) || `<p class="error">No content returned.</p>`;
  } catch (e) {
    el.innerHTML = `<p class="error">Failed to load Wikipedia: ${e.message}</p>`;
  }
}

function normalizeCard(id, raw = {}) {
  // Accept either aboutHtml (HTML) or about (plain text)
  const aboutHtml = raw.aboutHtml
    ? String(raw.aboutHtml)
    : (raw.about ? `<p>${String(raw.about)}</p>` : '');

  const meta = Array.isArray(raw.meta) ? raw.meta
             : (raw.h5 ? [].concat(raw.h5) : []);

  // image: allow exact filename in card, else default to "<id>.jpg"
  let image = raw.image || `${id}.jpg`;

  return {
    name: raw.name || id.replace(/-/g,' '),
    image,
    meta,
    aboutHtml
  };
}

function renderOne(fig) {
  const cardData = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, cardData);
  const node = tpl.content.firstElementChild.cloneNode(true);

  node.querySelector('.fig-name').textContent = data.name;

  const img = node.querySelector('.fig-img');
  img.src = urlJoin(IMGS_DIR, data.image);
  img.alt = data.name;

  const metaEl = node.querySelector('.fig-meta');
  if (data.meta && data.meta.length) {
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none'; ul.style.padding = '0'; ul.style.margin = '.25rem 0 .5rem';
    data.meta.forEach(line => { const li = document.createElement('li'); li.style.margin='.15rem 0'; li.textContent=line; ul.appendChild(li); });
    metaEl.appendChild(ul);
  }

  const about = node.querySelector('.fig-about');
  about.innerHTML = data.aboutHtml || `<p class="muted">No local summary yet. See Wikipedia below.</p>`;

  const wikiBox = node.querySelector('.fig-wiki');
  const wurl = state.urls[fig.id];
  if (wurl) {
    const wikiDetails = wikiBox.closest('details');
    let loaded = false;
    wikiDetails.addEventListener('toggle', () => {
      if (wikiDetails.open && !loaded) { loaded = true; loadWikiInto(wikiBox, wurl); }
    }, { once: true });
  } else {
    wikiBox.innerHTML = `<p class="error">No Wikipedia URL configured.</p>`;
  }

  gridEl.appendChild(node);
  state.nodes.push({ id: fig.id, el: node });
}

function computeGridCols(container) {
  const cs = getComputedStyle(container);
  const cols = cs.gridTemplateColumns?.split(' ').filter(Boolean).length || 0;
  if (cols) return cols;
  const first = container.querySelector('.feature-card'); if (!first) return 1;
  const cw = container.clientWidth || 1; const fw = first.getBoundingClientRect().width || 280;
  return Math.max(1, Math.floor(cw / Math.max(1, fw)));
}

function colorizeNoAdjacency() {
  const cols = computeGridCols(gridEl);
  const colors = state.palette.slice(); if (!colors.length) return;
  const cards = state.nodes.map(n => n.el);
  cards.forEach((card, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const left  = col > 0 ? cards[i-1].dataset.color : null;
    const above = row > 0 ? cards[i-cols]?.dataset.color : null;
    const choices = colors.filter(c => c !== left && c !== above);
    const pick = (choices.length ? choices : colors)[Math.floor(Math.random()* (choices.length ? choices.length : colors.length))];
    card.dataset.color = pick;
    card.style.setProperty('--card-accent', pick);
  });
}

function applyFilter() {
  const q = (filterEl?.value || '').trim().toLowerCase(); let shown = 0;
  state.nodes.forEach(({ el }) => {
    const name = el.querySelector('.fig-name')?.textContent.toLowerCase() || '';
    const about = el.querySelector('.fig-about')?.textContent.toLowerCase() || '';
    const hit = !q || name.includes(q) || about.includes(q);
    el.style.display = hit ? '' : 'none'; if (hit) shown++;
  });
  if (countEl) countEl.textContent = `${shown} shown`;
}

async function loadCard(id) {
  // Try id.json; if that 404s, log and leave as empty
  const url = urlJoin(CARDS_DIR, `${id}.json`);
  try {
    const data = await j(url);
    state.cards[id] = data;
  } catch (e) {
    console.warn(`[cards] Missing or unreadable: ${url} (${e?.message || e})`);
    state.cards[id] = {};
  }
}

async function boot() {
  // Guard: warn if running from file://
  if (location.protocol === 'file:') {
    console.warn('Serving from file:// — fetch() cannot load local JSON reliably. Run a local HTTP server.');
  }

  [state.palette, state.figures, state.urls] = await Promise.all([ j(PALETTE), j(FIGURES), j(URLS) ]);
  await Promise.all(state.figures.map(f => loadCard(f.id)));

  state.figures.forEach(renderOne);

  requestAnimationFrame(() => { colorizeNoAdjacency(); applyFilter(); });

  filterEl?.addEventListener('input', applyFilter);
  let lastCols = computeGridCols(gridEl);
  addEventListener('resize', () => {
    const cols = computeGridCols(gridEl);
    if (cols !== lastCols) { lastCols = cols; colorizeNoAdjacency(); }
  }, { passive: true });
}

boot().catch(err => {
  gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
});
