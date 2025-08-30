// /inspiration/modules/boot.js
// Orchestrator: load figures, palette, urls; build cards; assign colors; fetch wiki + cache
import { FIGURES_JSON, URLS_JSON, PALETTE_JSON, IMAGES_DIR, STATIC_CACHE_DIR } from './config.js';
import { idbGet, idbPut } from './cache.js';
import { displayTitleString, urlToTitle, cacheKey, extractFragment } from './utils.js';
import { assignBalancedColors } from './utils.js';
import { resolveAndInspect, getSections, getSectionHTML } from './mw.js';
import { mkFigureCard, renderFigureSectionsInto, attachHashOpenHandler } from './render.js';

/* ----------------------- helpers ----------------------- */
function seedFromCrypto() {
  if (window.crypto?.getRandomValues) {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] >>> 0;
  }
  return ((Math.random() * 0xffffffff) | 0) >>> 0;
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleSeeded(arr, seed) {
  const a = arr.slice();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
function normalizePalette(p) {
  const out = [];
  const seen = new Set();
  (Array.isArray(p) ? p : []).forEach(c => {
    if (!c) return;
    let s = String(c).trim();
    if (!s.startsWith('#')) s = `#${s}`;
    const m = s.match(HEX_RE);
    if (!m) return;
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const key = `#${hex.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  });
  // ensure brand green present
  if (!seen.has('#c0d674')) out.splice(Math.floor(out.length / 2), 0, '#c0d674');
  // constrain to 8–16 colors (spread across list if too many)
  if (out.length > 16) {
    const sel = [];
    for (let i = 0; i < 16; i++) {
      const idx = Math.round(i * (out.length - 1) / 15);
      sel.push(out[idx]);
    }
    return Array.from(new Set(sel));
  }
  return out;
}

async function tryLoadStaticCache(slug) {
  try {
    const res = await fetch(`${STATIC_CACHE_DIR}/${slug}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
function cacheSlug(title, fragment) {
  return (displayTitleString(title) + (fragment ? `--${fragment}` : '--all'))
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,128);
}
async function loadJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path} not found`);
  return r.json();
}

/* ----------------------- boot ----------------------- */
export async function boot() {
  const grid = document.getElementById('figure-grid');
  if (!grid) return;

  // Load data files
  const [figures, paletteRaw, urlMap] = await Promise.all([
    loadJSON(FIGURES_JSON),
    loadJSON(PALETTE_JSON),
    loadJSON(URLS_JSON)  // { "<figure-id>": "https://en.wikipedia.org/wiki/..." }
  ]);

  // Shuffle figures once per page load (stable within this session)
  const ORDER_SEED = (window.__FIG_ORDER_SEED__ ??= seedFromCrypto());
  const ordered = shuffleSeeded(Array.isArray(figures) ? figures : [], ORDER_SEED);

  // Build cards first (instant grid)
  grid.innerHTML = '';
  const cards = [];
  for (const fig of ordered) {
    const img = `${IMAGES_DIR}/${fig.id}.jpg`;
    const card = mkFigureCard({ id: fig.id, name: fig.name, imgUrl: img });
    grid.appendChild(card);
    cards.push(card);
  }

  // Normalize palette and assign rim colors once (no churn on interactions)
  const palette = normalizePalette(paletteRaw);
  assignBalancedColors(cards, palette, grid);

  // Hash → open collapsible hook
  attachHashOpenHandler();

  // Fetch & render Wikipedia content per figure
  for (let i = 0; i < ordered.length; i++) {
    const fig = ordered[i];
    const card = cards[i];
    const url = urlMap?.[fig.id];

    if (!url) {
      const content = card.querySelector('.card-content');
      if (content) content.innerHTML = `<p class="error">No Wikipedia URL configured for ${fig.name}.</p>`;
      continue;
    }

    try {
      const rawTitle = urlToTitle(url);
      const fragment = extractFragment(url);
      const info = await resolveAndInspect(rawTitle);
      if (info.missing) {
        card.querySelector('.card-content').innerHTML = `<p class="error">Page not found: “${rawTitle}”.</p>`;
        continue;
      }

      const key  = cacheKey(info.title, fragment);
      const slug = cacheSlug(info.title, fragment);

      // Static cache file (if precomputed), then IDB
      let record = await tryLoadStaticCache(slug);
      if (!record) record = await idbGet(key);

      if (!record || String(record.lastrevid) !== String(info.lastrevid)) {
        // Fresh fetch
        const allSections = await getSections(info.title);
        // Choose sections: if fragment specified, restrict; else all
        let sectionList = allSections;
        if (fragment) {
          const fl = fragment.toLowerCase().replace(/_/g,' ');
          const byAnchor = allSections.find(s => (s.anchor || '').toLowerCase() === fragment.toLowerCase());
          const byLine = allSections.find(s => (s.line || '').toLowerCase() === fl);
          sectionList = byAnchor ? [byAnchor] : (byLine ? [byLine] : allSections);
        }

        const outSections = [];
        for (const s of sectionList) {
          try {
            const { html } = await getSectionHTML(info.title, s.index);
            outSections.push({ index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel, html });
          } catch (err) {
            outSections.push({
              index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel,
              html: `<div class="error">Section failed: ${err.message}</div>`
            });
          }
        }

        record = {
          key, title: info.title, url: info.url,
          updated: info.updated ? info.updated.toISOString() : null,
          lastrevid: info.lastrevid || null,
          sections: outSections
        };
        await idbPut(record);
      }

      renderFigureSectionsInto(card, {
        url: record.url,
        updated: record.updated ? new Date(record.updated) : null
      }, record.sections);

    } catch (err) {
      const content = card.querySelector('.card-content');
      if (content) content.innerHTML = `<p class="error">Load error: ${err.message}</p>`;
      console.error('Figure load error', fig.id, err);
    }
  }
}
