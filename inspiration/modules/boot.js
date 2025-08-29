// Orchestrator: load figures, palette, urls; build cards; assign colors; fetch wiki + cache
import { FIGURES_JSON, URLS_JSON, PALETTE_JSON, IMAGES_DIR, STATIC_CACHE_DIR } from './config.js';
import { idbGet, idbPut } from './cache.js';
import { displayTitleString, urlToTitle, cacheKey, extractFragment } from './utils.js';
import { assignBalancedColors } from './utils.js';
import { resolveAndInspect, getSections, getSectionHTML } from './mw.js';
import { mkFigureCard, renderFigureSectionsInto, attachHashOpenHandler } from './render.js';

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

export async function boot() {
  const grid = document.getElementById('figure-grid');
  if (!grid) return;

  // Load data files
  const [figures, palette, urlMap] = await Promise.all([
    loadJSON(FIGURES_JSON),
    loadJSON(PALETTE_JSON),
    loadJSON(URLS_JSON)  // { "<figure-id>": "https://en.wikipedia.org/wiki/..." }
  ]);

  // Build cards first (so users see the grid immediately)
  grid.innerHTML = '';
  const cards = [];
  for (const fig of figures) {
    const img = `${IMAGES_DIR}/${fig.id}.jpg`;
    const card = mkFigureCard({ id: fig.id, name: fig.name, imgUrl: img });
    grid.appendChild(card);
    cards.push(card);
  }

  // Assign colors with adjacency constraint (based on actual grid columns)
  assignBalancedColors(cards, palette, grid);

  // Hook: open-anchor opens a collapsible
  attachHashOpenHandler();

  // Fetch & render Wikipedia content per figure
  for (const [idx, fig] of figures.entries()) {
    const card = cards[idx];
    const url = urlMap[fig.id];
    if (!url) {
      const content = card.querySelector('.card-content');
      content.innerHTML = `<p class="error">No Wikipedia URL configured for ${fig.name}.</p>`;
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

      // Static cache file (if you later precompute), then IDB
      let record = await tryLoadStaticCache(slug);
      if (!record) record = await idbGet(key);

      if (!record || String(record.lastrevid) !== String(info.lastrevid)) {
        // Fresh fetch
        const allSections = await getSections(info.title);
        // Choose sections: if fragment specified, restrict to that section; else all
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
            outSections.push({ index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel, html: `<div class="error">Section failed: ${err.message}</div>` });
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
      card.querySelector('.card-content').innerHTML = `<p class="error">Load error: ${err.message}</p>`;
      console.error('Figure load error', fig.id, err);
    }
  }
}
