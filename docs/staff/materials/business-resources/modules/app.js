// Orchestrator: load urls.json, resolve/calc cache, fetch/render

import { STATIC_CACHE_DIR } from './config.js';
import { urlToTitle, extractFragment, cacheKey, cacheSlug } from './utils.js';
import { idbGet, idbPut } from './cache.js';
import { resolveAndInspect, getSections, getSectionHTML } from './mw.js';
import {
  sanitizeAndRewrite, mountProblemsPanel, setupTocFilter,
  renderFromCache, filterSectionsByPolicy,
  attachNavCollapsibleHandlers, openIfCollapsibleTarget,
  isReferenceLikeHTML
} from './render.js';

const PROBLEMS = [];

async function tryLoadStaticCache(slug) {
  try {
    const res = await fetch(`${STATIC_CACHE_DIR}/${slug}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function processUrl(url) {
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

  // 1) Static cache file if present & current
  const staticRec = await tryLoadStaticCache(slug);
  if (staticRec?.lastrevid && info.lastrevid && String(staticRec.lastrevid) === String(info.lastrevid)) {
    renderFromCache(staticRec);
    await idbPut(staticRec);
    return;
  }

  // 2) IndexedDB if present & current
  const idbRec = await idbGet(key);
  if (idbRec?.lastrevid && info.lastrevid && String(idbRec.lastrevid) === String(info.lastrevid)) {
    renderFromCache(idbRec);
    return;
  }

  // 3) Fresh fetch
  const allSections = await getSections(info.title);
  const sectionList = filterSectionsByPolicy(allSections, fragment);

  const outSections = [];
  for (const s of sectionList) {
    try {
      const { html } = await getSectionHTML(info.title, s.index);
      const cleaned = sanitizeAndRewrite(html);
      const refLike = isReferenceLikeHTML(cleaned); // <-- flag ref/cite-like sections
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

export async function boot() {
  // Wire UI first so TOC clicks/hash work as content streams in
  attachNavCollapsibleHandlers();

  // Load URL list
  const urlsRes = await fetch('./urls.json', { cache: 'no-cache' });
  if (!urlsRes.ok) throw new Error('Missing urls.json');
  const urls = await urlsRes.json();

  // Reset TOC content
  const toc = document.getElementById('toc-content');
  if (toc) toc.innerHTML = '';

  // Render all sources
  for (const url of urls) {
    try { await processUrl(url); }
    catch (err) { PROBLEMS.push(`Failed URL: ${url} → ${err.message}`); }
  }

  // UX: filter + problems panel + open deep-link collapsible (if any)
  setupTocFilter(document.getElementById('toc-filter'), document.getElementById('toc-content'));
  mountProblemsPanel(PROBLEMS);
  if (location.hash) openIfCollapsibleTarget(location.hash.slice(1));
}
