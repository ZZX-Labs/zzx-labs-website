// /docs/staff/materials/resources/core/script.js
import { resolveAndInspect, getSections, getSectionHTML } from '/docs/staff/materials/loader-modules/mw.js';
import {
  sanitizeAndRewrite, renderFromCache, filterSectionsByPolicy, isReferenceLikeHTML,
  attachNavCollapsibleHandlers, setupTocFilter, mountProblemsPanel, openIfCollapsibleTarget
} from '/docs/staff/materials/loader-modules/render.js';
import { idbPut, idbPrune } from '/docs/staff/materials/loader-modules/cache.js';
import { cacheKey, cacheSlug, urlToTitle, extractFragment } from '/docs/staff/materials/loader-modules/utils.js';
import { STATIC_CACHE_DIR, IDB_MAX_ENTRIES } from '/docs/staff/materials/loader-modules/config.js';

function ensureCreditsPartial() {
  if (!document.querySelector('script[type="module"][src="/__partials/credits/loader.js"]')) {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = '/__partials/credits/loader.js';
    document.head.appendChild(s);
  }
}

const PROBLEMS = [];

async function tryLoadStaticCache(slug) {
  try {
    const res = await fetch(`${STATIC_CACHE_DIR}/${slug}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function processOneWikiUrl(url) {
  const rawTitle = urlToTitle(url);
  const fragment = extractFragment(url);
  const info = await resolveAndInspect(rawTitle);

  if (info.missing) {
    PROBLEMS.push(`Page not found: “${rawTitle}”.`);
    const stub = {
      key: `${rawTitle}#${fragment || 'ALL'}`,
      title: rawTitle,
      url: null,
      updated: null,
      lastrevid: null,
      sections: [{ index: '0', line: 'Not found', anchor: null, toclevel: 1, html: `<div class="error">Page missing</div>`, refLike: false }]
    };
    renderFromCache(stub);
    return;
  }

  const key  = cacheKey(info.title, fragment);
  const slug = cacheSlug(info.title, fragment);

  const staticRec = await tryLoadStaticCache(slug);
  if (staticRec?.lastrevid && info.lastrevid && String(staticRec.lastrevid) === String(info.lastrevid)) {
    renderFromCache(staticRec);
    await idbPut(staticRec);
    return;
  }

  const allSections = await getSections(info.title);
  const sectionList = filterSectionsByPolicy(allSections, fragment);

  const outSections = [];
  for (const s of sectionList) {
    try {
      const { html } = await getSectionHTML(info.title, s.index);
      const cleaned = sanitizeAndRewrite(html);
      const refLike = isReferenceLikeHTML(cleaned);
      outSections.push({
        index: s.index,
        line: s.line,
        anchor: s.anchor,
        toclevel: s.toclevel,
        html: cleaned,
        refLike
      });
    } catch (err) {
      PROBLEMS.push(`Section “${s.line}” failed on “${info.title}”: ${err.message}`);
    }
  }

  const record = {
    key,
    title: info.title,
    url: info.url,
    updated: info.updated ? info.updated.toISOString() : null,
    lastrevid: info.lastrevid || null,
    sections: outSections
  };

  await idbPut(record);
  renderFromCache(record);
}

async function loadJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Missing ${url}`);
  return r.json();
}

async function bootCategory() {
  attachNavCollapsibleHandlers();
  ensureCreditsPartial();

  // 1) local manifest.json with { "leaves": ["leaf-a", "leaf-b", ...] }
  const manifest = await loadJson('./manifest.json');

  // 2) Start with this category’s own optional urls.json (if present)
  const allWikiUrls = [];
  try {
    const own = await loadJson('./urls.json'); // optional, ok if 404
    if (Array.isArray(own)) allWikiUrls.push(...own);
  } catch {}

  // 3) Pull each leaf’s urls.json
  if (Array.isArray(manifest?.leaves)) {
    for (const leaf of manifest.leaves) {
      try {
        const leafUrls = await loadJson(`./${leaf.replace(/\/?$/, '/') }urls.json`);
        if (Array.isArray(leafUrls)) allWikiUrls.push(...leafUrls);
      } catch (e) {
        PROBLEMS.push(`Leaf missing urls.json: ${leaf} (${e.message})`);
      }
    }
  }

  // 4) Reset TOC UI
  const toc = document.getElementById('toc-content');
  if (toc) toc.innerHTML = '';

  // 5) Render everything
  for (const url of allWikiUrls) {
    try { await processOneWikiUrl(url); }
    catch (err) { PROBLEMS.push(`Failed URL: ${url} → ${err.message}`); }
  }

  // 6) Filter, problems panel, deep-link open
  setupTocFilter(
    document.getElementById('toc-filter'),
    document.getElementById('toc-content')
  );
  mountProblemsPanel(PROBLEMS);
  if (location.hash) openIfCollapsibleTarget(location.hash.slice(1));

  // 7) Keep IndexedDB tidy
  try { await idbPrune(IDB_MAX_ENTRIES); } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  bootCategory().catch(err => {
    const toc = document.getElementById('toc-content');
    if (toc) toc.innerHTML = `<p class="error">Failed to initialize: ${err.message}</p>`;
    console.error(err);
  });
});
