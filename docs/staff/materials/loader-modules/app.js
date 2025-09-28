// /docs/staff/materials/loader-modules/app.js
// Orchestrator: load urls.json (and recursively child urls.json via manifest.json), then resolve/cache/render

import { STATIC_CACHE_DIR, IDB_MAX_ENTRIES } from './config.js';
import { urlToTitle, extractFragment, cacheKey, cacheSlug } from './utils.js';
import { idbGet, idbPut, idbPrune } from './cache.js';
import { resolveAndInspect, getSections, getSectionHTML } from './mw.js';
import {
  sanitizeAndRewrite, mountProblemsPanel, setupTocFilter,
  renderFromCache, filterSectionsByPolicy,
  attachNavCollapsibleHandlers, openIfCollapsibleTarget,
  isReferenceLikeHTML
} from './render.js';

const PROBLEMS = [];

/** Utility: ensure a path ends with '/' */
function ensureSlash(p) { return p.endsWith('/') ? p : (p + '/'); }

/** Compute the current dir URL for relative fetches (safe for deep subdirs) */
function currentDirURL() {
  return new URL('./', window.location.href).toString();
}

/** Fetch JSON if exists; return null if 404 or invalid */
async function fetchJSONMaybe(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** Recursively gather URLs from this directory and its children via manifest.json */
async function collectUrlsRecursive(dirUrl, seenDirs = new Set()) {
  const out = [];

  const dirKey = new URL(dirUrl).toString();
  if (seenDirs.has(dirKey)) return out;
  seenDirs.add(dirKey);

  // 1) urls.json in this directory (if present)
  const urlsJsonUrl = new URL('urls.json', dirUrl).toString();
  const urls = await fetchJSONMaybe(urlsJsonUrl);
  if (Array.isArray(urls)) {
    // Defensive: filter to strings and trim
    for (const u of urls) if (typeof u === 'string' && u.trim()) out.push(u.trim());
  }

  // 2) manifest.json with child subdirectories (if present)
  const manifestUrl = new URL('manifest.json', dirUrl).toString();
  const manifest = await fetchJSONMaybe(manifestUrl);
  const children = Array.isArray(manifest?.children) ? manifest.children : [];

  for (const child of children) {
    if (typeof child !== 'string' || !child.trim()) continue;
    const childDir = new URL(ensureSlash(child.trim()), dirUrl).toString();
    const childUrls = await collectUrlsRecursive(childDir, seenDirs);
    out.push(...childUrls);
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

export async function boot() {
  // Wire UI first so TOC clicks/hash work as content streams in
  attachNavCollapsibleHandlers();

  // Gather URLs: this dir + recursive children (via manifest.json)
  const here = currentDirURL();
  const allUrls = await collectUrlsRecursive(here);

  if (!allUrls.length) {
    const toc = document.getElementById('toc-content');
    if (toc) toc.innerHTML = `<p class="error">No sources found. Add a urls.json or a manifest.json with "children".</p>`;
    return;
  }

  // Reset TOC content
  const toc = document.getElementById('toc-content');
  if (toc) toc.innerHTML = '';

  // Render all sources
  for (const url of allUrls) {
    try { await processUrl(url); }
    catch (err) { PROBLEMS.push(`Failed URL: ${url} → ${err.message}`); }
  }

  // UX: filter + problems panel + open deep-link collapsible (if any)
  setupTocFilter(document.getElementById('toc-filter'), document.getElementById('toc-content'));
  mountProblemsPanel(PROBLEMS);
  if (location.hash) openIfCollapsibleTarget(location.hash.slice(1));

  // Keep IDB lean
  try { await idbPrune(IDB_MAX_ENTRIES); } catch {}
}
