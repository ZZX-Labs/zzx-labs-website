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

const state = { palette: [], figures: [], urls: {}, cards: {}, nodes: [] };

// ---------- fetch helpers ----------
async function j(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  try { return await r.json(); } catch (e) { throw new Error(`Invalid JSON for ${url}: ${e.message}`); }
}
function urlJoin(dir, name) { return new URL(name, dir); }

// If string looks absolute (https://, /, ./, ../), use as-is; else join with IMGS_DIR
function asDocUrl(pathOrName) {
  if (!pathOrName) return null;
  const s = String(pathOrName);
  if (/^(?:[a-z]+:|\/|\.{1,2}\/)/i.test(s)) return s;
  return String(urlJoin(IMGS_DIR, s));
}

function objectifyUrls(raw) {
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

// ---------- wiki helpers ----------
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
  const name  = raw.name || raw.titleName || id.replace(/-/g,' ');
  const alt   = raw.alt || name;

  // image + legacy fallback
  const image = raw.image || raw.img || raw.photo || `${id}.jpg`;
  const legacyImageSrc = raw.legacyImageSrc || raw.legacy || null;

  // meta bullets from arrays OR single fields
  let meta = [];
  if (Array.isArray(raw.meta)) meta = raw.meta.slice();
  else if (Array.isArray(raw.h5)) meta = raw.h5.slice();
  else if (Array.isArray(raw.bullets)) meta = raw.bullets.slice();
  else if (Array.isArray(raw.lines)) meta = raw.lines.slice();

  // fold in labeled one-liners if present
  const addIf = (label, val) => { if (val) meta.push(`${label}: ${val}`); };
  addIf('Background',     raw.background);
  addIf('Known For',      raw.knownFor);
  addIf('Field',          raw.field);
  addIf('Contributions',  raw.contributions);

  // local summary: accept HTML or text; also accept `bio` (string or array)
  const htmlKey = raw.aboutHtml ?? raw.aboutHTML ?? raw.about_html
                ?? raw.summaryHtml ?? raw.summaryHTML ?? raw.summary_html;

  let textKey = raw.about ?? raw.summary ?? raw.description ?? raw.desc ?? raw.blurb;
  if (!textKey && raw.bio) {
    textKey = Array.isArray(raw.bio) ? raw.bio : String(raw.bio);
  }

  let aboutHtml = '';
  if (htmlKey) {
    aboutHtml = String(htmlKey);
  } else if (textKey) {
    if (Array.isArray(textKey)) {
      aboutHtml = textKey.map(p => `<p>${String(p)}</p>`).join('');
    } else {
      aboutHtml = `<p>${String(textKey)}</p>`;
    }
  }

  return { name, alt, image, legacyImageSrc, meta, aboutHtml };
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

// ---------- render ----------
function renderOne(fig) {
  const raw  = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, raw);

  const node = tpl.content.firstElementChild.cloneNode(true);
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

  // about (local)
  const about = node.querySelector('.fig-about');
  about.innerHTML = data.aboutHtml || `<p class="muted">No local summary yet. See Wikipedia below.</p>`;

  // wikipedia (lazy)
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
  if (location.protocol === 'file:') {
    console.warn('Serving from file:// — fetch() cannot load local JSON reliably. Run a local HTTP server.');
  }

  const [palette, figures, urls] = await Promise.all([ j(PALETTE), j(FIGURES), j(URLS_URL) ]);
  state.palette = Array.isArray(palette) ? palette : [];
  state.figures = Array.isArray(figures) ? figures : [];
  state.urls    = objectifyUrls(urls);

  await Promise.all(state.figures.map(f => loadCard(f.id)));
  state.figures.forEach(renderOne);

  requestAnimationFrame(() => { colorizeNoAdjacency(); applyFilter(); });

  filterEl?.addEventListener('input', applyFilter);

  let lastCols = computeGridCols(gridEl);
  addEventListener('resize', () => {
    const cols = computeGridCols(gridEl);
    if (cols !== lastCols) { lastCols = cols; colorizeNoAdjacency(); }
  }, { passive: true });

  if (countEl && !countEl.textContent) countEl.textContent = `${state.nodes.length} shown of ${state.figures.length}`;
}

boot().catch(err => {
  gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
  console.error(err);
});
