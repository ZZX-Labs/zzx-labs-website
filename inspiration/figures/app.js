// inspiration/figures/app.js
const BASE      = new URL('./', import.meta.url);
const PALETTE   = new URL('color-palette.json', BASE);
const FIGURES   = new URL('figures.json', BASE);
const URLS_URL  = new URL('urls.json', BASE);
const CARDS_DIR = new URL('cards/', BASE);
const IMGS_DIR  = new URL('images/', BASE);

const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = '&origin=*';

const gridEl   = document.getElementById('figure-grid');
const tpl      = document.getElementById('tpl-figure-card');
const filterEl = document.getElementById('figure-filter');
const countEl  = document.getElementById('figure-count');

const state = {
  palette: [],
  figures: [],
  urls: {},           // raw urls object
  urlIndex: {},       // normalized lookup
  cards: {},
  nodes: []
};

// ---------- utils ----------
async function j(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}
function urlJoin(dir, name) { return new URL(name, dir); }
function asDocUrl(pathOrName) {
  if (!pathOrName) return null;
  const s = String(pathOrName);
  if (/^(?:[a-z]+:|\/|\.{1,2}\/)/i.test(s)) return s;
  return String(urlJoin(IMGS_DIR, s));
}
function normId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function toWikiTitle(s) { return String(s || '').trim().replace(/\s+/g, '_'); }

// Fisher–Yates with crypto randomness if available
function shuffle(arr) {
  const a = arr.slice();
  if (crypto && crypto.getRandomValues) {
    for (let i = a.length - 1; i > 0; i--) {
      const r32 = new Uint32Array(1);
      crypto.getRandomValues(r32);
      const j = r32[0] % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
  } else {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return a;
}

// ---------- wiki helpers ----------
function slugFromWiki(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) return decodeURIComponent(u.pathname.replace('/wiki/','')).split('#')[0];
    const t = u.searchParams.get('title');
    return t ? decodeURIComponent(t).split('#')[0] : '';
  } catch {
    return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0];
  }
}

function sanitizeWiki(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  tmp.querySelectorAll('script,style,noscript').forEach(n => n.remove());
  tmp.querySelectorAll('.infobox,.navbox,.metadata,.mw-editsection,.hatnote,.mw-empty-elt').forEach(n => n.remove());
  tmp.querySelectorAll('table').forEach(t => { t.style.width = '100%'; t.style.maxWidth = '100%'; });

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
        const next = n.nextSibling; body.appendChild(n); n = next;
      }
      details.appendChild(body);
      h.replaceWith(details);
    }
  });

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
  // Case-insensitive key access
  const lc = {};
  Object.keys(raw).forEach(k => lc[k.toLowerCase()] = raw[k]);

  // Name / alt
  const name = lc.name || lc.titlename || lc.display || lc.title || id.replace(/-/g,' ');
  const alt  = lc.alt || name;

  // Image variants
  const image = lc.image || lc.imagefile || lc.img || lc.picture || lc.photourl || `${id}.jpg`;
  const legacyImageSrc = lc.legacyimagesrc || lc.legacy || null;

  // Meta bullets: accept several shapes
  let meta = [];
  if (Array.isArray(lc.meta)) meta = lc.meta.slice();
  else if (Array.isArray(lc.h5)) meta = lc.h5.slice();
  else if (Array.isArray(lc.bullets)) meta = lc.bullets.slice();
  else if (Array.isArray(lc.lines)) meta = lc.lines.slice();

  // Fold labeled lines if present
  const addIf = (label, key) => { if (lc[key]) meta.push(`${label}: ${lc[key]}`); };
  addIf('Background', 'background');
  addIf('Known For',  'knownfor');
  addIf('Field',      'field');
  addIf('Contributions', 'contributions');

  // Local summary: prefer explicit HTML; otherwise accept text or bio
  const htmlKey = lc.abouthtml ?? lc.about_html ?? lc.summaryhtml ?? lc.summary_html;
  let aboutHtml = '';

  let textKey = lc.about ?? lc.summary ?? lc.description ?? lc.desc ?? lc.blurb;
  if (!textKey && lc.bio) {
    textKey = Array.isArray(lc.bio) ? lc.bio : String(lc.bio);
  }

  if (htmlKey) {
    aboutHtml = String(htmlKey);
  } else if (textKey) {
    if (Array.isArray(textKey)) aboutHtml = textKey.map(p => `<p>${String(p)}</p>`).join('');
    else aboutHtml = `<p>${String(textKey)}</p>`;
  }

  // Optional per-card wiki override
  const wikiOverride = lc.wikipedia || lc.wiki || lc.url || lc.href || null;

  return { name, alt, image, legacyImageSrc, meta, aboutHtml, wikiOverride };
}

async function loadCard(id) {
  const url = urlJoin(CARDS_DIR, `${id}.json`);
  try {
    const data = await j(url);
    state.cards[id] = data || {};
  } catch (e) {
    console.warn(`[cards] ${id}.json → ${e.message}`);
    state.cards[id] = {};
  }
}

// ---------- URL lookup ----------
function buildUrlIndex(urlsObj) {
  const idx = {};
  Object.entries(urlsObj || {}).forEach(([k, v]) => {
    idx[normId(k)] = v;
  });
  return idx;
}

function getWikiUrl(fig, cardData) {
  // 1) Card-level override (wikipedia/wiki/url/href)
  if (cardData?.wikiOverride) return cardData.wikiOverride;

  // 2) Exact id in urls.json
  const byId = state.urls[fig.id];
  if (byId) return byId;

  // 3) Normalized id lookup
  const ni = normId(fig.id);
  if (state.urlIndex[ni]) return state.urlIndex[ni];

  // 4) Try by normalized display name
  const nName = normId(fig.name || fig.display || fig.title || '');
  if (nName && state.urlIndex[nName]) return state.urlIndex[nName];

  // 5) Fallback: guess Wikipedia URL from the best name we have
  const guessName = fig.name || fig.title || fig.id.replace(/-/g, ' ');
  if (guessName) {
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(toWikiTitle(guessName))}`;
  }

  return null;
}

// ---------- render ----------
function renderOne(fig) {
  const raw  = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, raw);

  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = fig.id;

  // name
  node.querySelector('.fig-name').textContent = data.name;

  // image with layered fallback: image -> legacyImageSrc -> placeholder
  const img = node.querySelector('.fig-img');
  const primarySrc = asDocUrl(data.image);
  const legacySrc  = asDocUrl(data.legacyImageSrc);
  img.alt = data.alt;
  img.loading = 'lazy';

  let triedLegacy = false;
  img.addEventListener('error', () => {
    if (!triedLegacy && legacySrc) {
      triedLegacy = true;
      img.src = legacySrc;
    } else {
      img.onerror = null;
      img.src = asDocUrl('placeholder.jpg');
    }
  });
  img.src = primarySrc || asDocUrl('placeholder.jpg');

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

  // local about
  const about = node.querySelector('.fig-about');
  about.innerHTML = data.aboutHtml || `<p class="muted">No local summary yet. See Wikipedia below.</p>`;

  // wikipedia (lazy)
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

// Columns calc (fallback-safe)
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

// Assign colors so no left/above neighbor shares the same color
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
    const id    = (el.dataset.id || '').toLowerCase();
    const name  = el.querySelector('.fig-name')?.textContent.toLowerCase() || '';
    const about = el.querySelector('.fig-about')?.textContent.toLowerCase() || '';
    const meta  = Array.from(el.querySelectorAll('.fig-meta li')).map(li => li.textContent.toLowerCase()).join(' ');
    const hit = !q || id.includes(q) || name.includes(q) || about.includes(q) || meta.includes(q);
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
  if (location.protocol === 'file:') {
    console.warn('Serving from file:// — fetch() cannot load local JSON reliably. Run a local HTTP server.');
  }

  // Load data
  const [palette, figures, urls] = await Promise.all([ j(PALETTE), j(FIGURES), j(URLS_URL) ]);
  state.palette = Array.isArray(palette) ? palette : [];
  state.figures = Array.isArray(figures) ? figures : [];
  state.urls    = urls || {};
  state.urlIndex = buildUrlIndex(state.urls);

  // Load all cards
  await Promise.all(state.figures.map(f => loadCard(f.id)));

  // Shuffle figures BEFORE rendering, to randomize card order each load
  const shuffled = shuffle(state.figures);
  shuffled.forEach(renderOne);

  // Colorize after layout, then on resize & first image loads (layout changes)
  const recolor = () => { colorizeNoAdjacency(); applyFilter(); };
  requestAnimationFrame(recolor);

  filterEl?.addEventListener('input', applyFilter);

  let lastCols = computeGridCols(gridEl);
  addEventListener('resize', () => {
    const cols = computeGridCols(gridEl);
    if (cols !== lastCols) { lastCols = cols; colorizeNoAdjacency(); }
  }, { passive: true });

  // Recolor once images start affecting layout
  const firstImg = gridEl.querySelector('img.fig-img');
  if (firstImg) firstImg.addEventListener('load', () => colorizeNoAdjacency(), { once: true });

  if (countEl && !countEl.textContent) countEl.textContent = `${state.nodes.length} shown of ${shuffled.length}`;
}

boot().catch(err => {
  gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
  console.error(err);
});
