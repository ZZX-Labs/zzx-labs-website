// inspiration/figures/app.js
// Robust, tolerant, and noisy-in-the-console so you can spot missing pieces fast.

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

// ---------- utils ----------
async function j(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  try { return await r.json(); }
  catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }
}
function urlJoin(dir, name) { return new URL(name, dir); }

function slugFromWiki(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) {
      return decodeURIComponent(u.pathname.replace('/wiki/','')).split('#')[0];
    }
    const t = u.searchParams.get('title');
    return t ? decodeURIComponent(t).split('#')[0] : '';
  } catch {
    return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0];
  }
}

function objectifyUrls(raw) {
  // Accept {id:url} or [{id, url}] or [[id, url]]
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach(item => {
      if (!item) return;
      if (Array.isArray(item)) out[item[0]] = item[1];
      else if (item.id && item.url) out[item.id] = item.url;
    });
    return out;
  }
  return raw;
}

// ---------- wiki ----------
function sanitizeWiki(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');

  // Strip junk
  tmp.querySelectorAll('script,style,noscript').forEach(n => n.remove());
  tmp.querySelectorAll('.infobox,.navbox,.metadata,.mw-editsection,.hatnote,.mw-empty-elt').forEach(n => n.remove());
  tmp.querySelectorAll('table').forEach(t => { t.style.width = '100%'; t.style.maxWidth = '100%'; });

  // Collapse known terminal sections (by heading)
  const headings = tmp.querySelectorAll('h2,h3,h4,h5,h6');
  headings.forEach(h => {
    const text = (h.textContent || '').trim().toLowerCase();
    if (/^(references?|citations?|notes|footnotes?|bibliography|external links|further reading|see also)$/.test(text)) {
      const details = document.createElement('details');
      details.className = 'subsection collapsible';
      const sum = document.createElement('summary');
      sum.textContent = h.textContent.trim();
      details.appendChild(sum);
      const body = document.createElement('div');
      body.className = 'collapsible-body';
      let n = h.nextSibling;
      const stop = new Set(['H2','H3','H4','H5','H6']);
      while (n && !(n.nodeType === 1 && stop.has(n.tagName))) {
        const next = n.nextSibling;
        body.appendChild(n);
        n = next;
      }
      details.appendChild(body);
      h.replaceWith(details);
    }
  });

  // If references appear without a heading, wrap common reflist blocks
  tmp.querySelectorAll('ol.references, div.reflist').forEach(ref => {
    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    const sum = document.createElement('summary');
    sum.textContent = 'References';
    details.appendChild(sum);
    const body = document.createElement('div');
    body.className = 'collapsible-body';
    ref.replaceWith(details);
    body.appendChild(ref);
    details.appendChild(body);
  });

  // External links target + rel hygiene
  tmp.querySelectorAll('a[href]').forEach(a => {
    a.setAttribute('target','_blank');
    a.setAttribute('rel','noopener noreferrer nofollow ugc');
  });

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

// ---------- cards ----------
function normalizeCard(id, raw = {}) {
  // name variants
  const name = raw.name || raw.title || id.replace(/-/g,' ');

  // image variants (allow subpaths)
  const image = raw.image || raw.img || raw.photo || `${id}.jpg`;

  // meta bullets variants
  let meta = [];
  if (Array.isArray(raw.meta)) meta = raw.meta;
  else if (Array.isArray(raw.h5)) meta = raw.h5;
  else if (Array.isArray(raw.bullets)) meta = raw.bullets;
  else if (Array.isArray(raw.lines)) meta = raw.lines;

  // about variants
  const htmlKey = raw.aboutHtml ?? raw.aboutHTML ?? raw.about_html
                ?? raw.summaryHtml ?? raw.summaryHTML ?? raw.summary_html;
  const textKey = raw.about ?? raw.summary ?? raw.description ?? raw.desc ?? raw.blurb;

  const aboutHtml = htmlKey ? String(htmlKey)
                    : (textKey ? `<p>${String(textKey)}</p>` : '');

  return { name, image, meta, aboutHtml };
}

async function loadCard(id) {
  const url = urlJoin(CARDS_DIR, `${id}.json`);
  try {
    const data = await j(url);
    state.cards[id] = data || {};
  } catch (e) {
    console.warn(`[cards] ${id}.json → ${e.message} @ ${url}`);
    state.cards[id] = {};
  }
}

// ---------- render ----------
function renderOne(fig) {
  const cardData = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, cardData);
  const node = tpl.content.firstElementChild.cloneNode(true);

  // name
  node.querySelector('.fig-name').textContent = data.name;

  // image w/ fallback
  const img = node.querySelector('.fig-img');
  img.src = urlJoin(IMGS_DIR, data.image);
  img.alt = data.name;
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    img.onerror = null;
    img.src = urlJoin(IMGS_DIR, 'placeholder.jpg');
  });

  // meta bullets
  const metaEl = node.querySelector('.fig-meta');
  metaEl.innerHTML = '';
  if (data.meta && data.meta.length) {
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

  // about (local summary)
  const about = node.querySelector('.fig-about');
  if (data.aboutHtml) {
    about.innerHTML = data.aboutHtml;
  } else {
    const expected = urlJoin(CARDS_DIR, `${fig.id}.json`);
    about.innerHTML = `<p class="muted">No local summary yet. Provide <code>${expected.pathname}</code> with <code>aboutHtml</code> or <code>about</code>.</p>`;
    if (cardData && Object.keys(cardData).length) {
      console.warn(`[cards] ${fig.id}.json loaded but has no "aboutHtml"/"about"/"summary"/"description".`);
    }
  }

  // wikipedia block (lazy on first open)
  const wikiBox = node.querySelector('.fig-wiki');
  const wurl = state.urls[fig.id];
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

function computeGridCols(container) {
  const cs = getComputedStyle(container);
  const cols = cs.gridTemplateColumns?.split(' ').filter(Boolean).length || 0;
  if (cols) return cols;
  const first = container.querySelector('.feature-card') || container.firstElementChild;
  if (!first) return 1;
  const cw = container.clientWidth || 1;
  const fw = first.getBoundingClientRect().width || 280;
  return Math.max(1, Math.floor(cw / Math.max(1, fw)));
}

function colorizeNoAdjacency() {
  const cols = computeGridCols(gridEl);
  const colors = state.palette.slice();
  if (!colors.length) return;
  const cards = state.nodes.map(n => n.el);
  cards.forEach((card, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const left  = col > 0 ? cards[i - 1].dataset.color : null;
    const above = row > 0 ? cards[i - cols]?.dataset.color : null;
    const choices = colors.filter(c => c !== left && c !== above);
    const pool = choices.length ? choices : colors;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    card.dataset.color = pick;
    card.style.setProperty('--card-accent', pick);
  });
}

function applyFilter() {
  const q = (filterEl?.value || '').trim().toLowerCase();
  let shown = 0;
  state.nodes.forEach(({ el }) => {
    const name = el.querySelector('.fig-name')?.textContent.toLowerCase() || '';
    const about = el.querySelector('.fig-about')?.textContent.toLowerCase() || '';
    const meta  = Array.from(el.querySelectorAll('.fig-meta li')).map(li => li.textContent.toLowerCase()).join(' ');
    const hit = !q || name.includes(q) || about.includes(q) || meta.includes(q);
    el.style.display = hit ? '' : 'none';
    if (hit) shown++;
  });
  if (countEl) countEl.textContent = `${shown} shown of ${state.nodes.length}`;
}

// ---------- boot ----------
async function boot() {
  if (!gridEl || !tpl) {
    console.error('Missing #figure-grid or #tpl-figure-card in DOM.');
    return;
  }

  // Guard: warn if running from file://
  if (location.protocol === 'file:') {
    console.warn('Serving from file:// — fetch() cannot load local JSON reliably. Run a local HTTP server.');
  }

  // Load base data
  let [palette, figures, urls] = await Promise.all([ j(PALETTE), j(FIGURES), j(URLS) ]);
  state.palette = Array.isArray(palette) ? palette : [];
  state.figures = Array.isArray(figures) ? figures : [];
  state.urls    = objectifyUrls(urls);

  // Load all cards (tolerant)
  await Promise.all(state.figures.map(f => loadCard(f.id)));

  // Render
  state.figures.forEach(renderOne);

  // Colorize + initial filter after layout
  requestAnimationFrame(() => {
    colorizeNoAdjacency();
    applyFilter();
  });

  // Wire filter
  filterEl?.addEventListener('input', applyFilter);

  // Recolor on actual column count change
  let lastCols = computeGridCols(gridEl);
  addEventListener('resize', () => {
    const cols = computeGridCols(gridEl);
    if (cols !== lastCols) { lastCols = cols; colorizeNoAdjacency(); }
  }, { passive: true });

  // Optional: show quick status in counter if empty
  if (countEl && !countEl.textContent) countEl.textContent = `${state.nodes.length} shown of ${state.figures.length}`;
}

boot().catch(err => {
  gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
  console.error(err);
});
