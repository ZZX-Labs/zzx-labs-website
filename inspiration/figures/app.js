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
  urls: {},
  urlIndex: {},
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

// Crypto-friendly Fisher–Yates
function shuffle(arr) {
  const a = arr.slice();
  if (window.crypto?.getRandomValues) {
    for (let i = a.length - 1; i > 0; i--) {
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      const j = r[0] % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
  } else {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.random() * (i + 1) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return a;
}

// ---------- color helpers (inline paint) ----------
function hexToRgb(hex) {
  const h = hex.replace('#','').trim();
  if (h.length === 3) {
    const r = parseInt(h[0]+h[0],16), g = parseInt(h[1]+h[1],16), b = parseInt(h[2]+h[2],16);
    return { r, g, b };
  }
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return { r, g, b };
}
function rgbToHex(r,g,b) {
  const h = n => n.toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function mixHex(aHex, bHex, t) {
  const a = hexToRgb(aHex), b = hexToRgb(bHex);
  const r = Math.round(a.r + (b.r - a.r)*t);
  const g = Math.round(a.g + (b.g - a.g)*t);
  const b3 = Math.round(a.b + (b.b - a.b)*t);
  return rgbToHex(r,g,b3);
}
function tint(hex, amount=0.7) { return mixHex(hex, '#ffffff', amount); }
function shade(hex, amount=0.25) { return mixHex(hex, '#000000', amount); }
function luminance(hex) {
  const {r,g,b} = hexToRgb(hex);
  const lin = c => {
    const s = c/255;
    return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4);
  };
  const L = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  return L;
}
function onColor(hex) {
  // Choose white/near-black for contrast
  const L = luminance(hex);
  return L > 0.5 ? '#111111' : '#ffffff';
}
function setCardPaint(card, color) {
  const top = tint(color, 0.82);
  const bot = tint(color, 0.62);
  const border = shade(color, 0.35);
  const text = onColor(color);

  card.style.background = `linear-gradient(145deg, ${top} 0%, ${bot} 100%)`;
  card.style.borderColor = border;
  card.style.setProperty('--card-accent', color);
  card.style.color = text;

  // Make inner links readable
  card.querySelectorAll('a').forEach(a => {
    a.style.color = text;
    a.style.textDecorationColor = text;
  });

  // Keep a data-color that’s compatible with any existing CSS targeting
  const idx = state.palette.indexOf(color);
  card.dataset.color = idx >= 0 ? `color${idx+1}` : color;
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
        const nx = n.nextSibling; body.appendChild(n); n = nx;
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
  const lc = {};
  Object.keys(raw).forEach(k => lc[k.toLowerCase()] = raw[k]);

  const name = lc.name || lc.titlename || lc.display || lc.title || id.replace(/-/g,' ');
  const alt  = lc.alt || name;

  const image = lc.image || lc.imagefile || lc.img || lc.picture || lc.photourl || `${id}.jpg`;
  const legacyImageSrc = lc.legacyimagesrc || lc.legacy || null;

  let meta = [];
  if (Array.isArray(lc.meta)) meta = lc.meta.slice();
  else if (Array.isArray(lc.h5)) meta = lc.h5.slice();
  else if (Array.isArray(lc.bullets)) meta = lc.bullets.slice();
  else if (Array.isArray(lc.lines)) meta = lc.lines.slice();

  const addIf = (label, key) => { if (lc[key]) meta.push(`${label}: ${lc[key]}`); };
  addIf('Background', 'background');
  addIf('Known For',  'knownfor');
  addIf('Field',      'field');
  addIf('Contributions', 'contributions');

  const htmlKey = lc.abouthtml ?? lc.about_html ?? lc.summaryhtml ?? lc.summary_html;
  let aboutHtml = '';
  let textKey = lc.about ?? lc.summary ?? lc.description ?? lc.desc ?? lc.blurb;
  if (!textKey && lc.bio) textKey = Array.isArray(lc.bio) ? lc.bio : String(lc.bio);

  if (htmlKey) aboutHtml = String(htmlKey);
  else if (textKey) aboutHtml = Array.isArray(textKey) ? textKey.map(p => `<p>${String(p)}</p>`).join('') : `<p>${String(textKey)}</p>`;

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
  Object.entries(urlsObj || {}).forEach(([k, v]) => { idx[normId(k)] = v; });
  return idx;
}
function getWikiUrl(fig, cardData) {
  if (cardData?.wikiOverride) return cardData.wikiOverride;
  const byId = state.urls[fig.id];
  if (byId) return byId;
  const ni = normId(fig.id);
  if (state.urlIndex[ni]) return state.urlIndex[ni];
  const nName = normId(fig.name || fig.display || fig.title || '');
  if (nName && state.urlIndex[nName]) return state.urlIndex[nName];
  const guessName = fig.name || fig.title || fig.id.replace(/-/g, ' ');
  return guessName ? `https://en.wikipedia.org/wiki/${encodeURIComponent(toWikiTitle(guessName))}` : null;
}

// ---------- rendering ----------
function renderOne(fig) {
  const raw  = state.cards[fig.id] || {};
  const data = normalizeCard(fig.id, raw);
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = fig.id;

  node.querySelector('.fig-name').textContent = data.name;

  const img = node.querySelector('.fig-img');
  const primarySrc = asDocUrl(data.image);
  const legacySrc  = asDocUrl(data.legacyImageSrc);
  img.alt = data.alt;
  img.loading = 'lazy';
  let triedLegacy = false;
  img.addEventListener('error', () => {
    if (!triedLegacy && legacySrc) { triedLegacy = true; img.src = legacySrc; }
    else { img.onerror = null; img.src = asDocUrl('placeholder.jpg'); }
  });
  img.src = primarySrc || asDocUrl('placeholder.jpg');

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

// Infer columns from actual layout (robust to CSS changes & filtering)
function inferGridColsVisible(cards) {
  const visible = cards.filter(c => c.offsetParent !== null);
  if (!visible.length) return 1;
  const firstTop = visible[0].offsetTop;
  let cols = 0;
  for (const c of visible) {
    if (c.offsetTop !== firstTop) break;
    cols++;
  }
  return Math.max(cols, 1);
}

// Assign colors so no left/above neighbor shares the same color.
// Uses balanced palette cycling for better distribution.
function colorizeNoAdjacency() {
  const cards = state.nodes.map(n => n.el).filter(c => c.offsetParent !== null);
  if (!cards.length || !state.palette.length) return;

  const cols = inferGridColsVisible(cards);
  const pal = shuffle(state.palette); // shuffle palette order each run
  let pIdx = Math.floor(Math.random() * pal.length);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const row = Math.floor(i / cols), col = i % cols;
    const left  = col > 0 ? cards[i - 1]?.dataset.colorResolved : null;
    const above = row > 0 ? cards[i - cols]?.dataset.colorResolved : null;

    // Try up to N attempts to find a color not equal to left/above
    let picked = null;
    for (let tries = 0; tries < pal.length * 2; tries++) {
      const c = pal[pIdx % pal.length]; pIdx++;
      if (c !== left && c !== above) { picked = c; break; }
    }
    if (!picked) picked = pal[pIdx++ % pal.length];

    setCardPaint(card, picked);
    card.dataset.colorResolved = picked;
  }
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
  colorizeNoAdjacency();
  if (countEl) countEl.textContent = `${shown} shown of ${state.nodes.length}`;
}

// ---------- boot ----------
async function boot() {
  if (!gridEl || !tpl) { console.error('Missing #figure-grid or #tpl-figure-card in DOM.'); return; }
  if (location.protocol === 'file:') console.warn('Serving from file:// — run a local HTTP server to allow fetch().');

  const [palette, figures, urls] = await Promise.all([ j(PALETTE), j(FIGURES), j(URLS_URL) ]);
  state.palette = Array.isArray(palette) ? palette : [];
  state.figures = Array.isArray(figures) ? figures : [];
  state.urls    = urls || {};
  state.urlIndex = buildUrlIndex(state.urls);

  await Promise.all(state.figures.map(f => loadCard(f.id)));

  const shuffled = shuffle(state.figures);
  shuffled.forEach(renderOne);

  // Initial colorization after layout
  requestAnimationFrame(() => { colorizeNoAdjacency(); applyFilter(); });

  filterEl?.addEventListener('input', applyFilter);

  // Recolor on resize (layout/columns can change)
  let recalc = null;
  addEventListener('resize', () => {
    clearTimeout(recalc);
    recalc = setTimeout(() => colorizeNoAdjacency(), 80);
  }, { passive: true });

  // Recolor once images load (affects positioning)
  gridEl.querySelectorAll('img.fig-img').forEach(img => {
    img.addEventListener('load', () => colorizeNoAdjacency(), { once: true });
  });

  if (countEl && !countEl.textContent) countEl.textContent = `${state.nodes.length} shown of ${shuffled.length}`;
}

boot().catch(err => {
  gridEl.innerHTML = `<p class="error">Failed to load figures: ${err.message}</p>`;
  console.error(err);
});
