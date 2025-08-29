/* Business Resources renderer (v2: title-fix + collapsibles + smart cache)
 * - Titles: decode percent escapes (e.g., R%26D → R&D).
 * - Collapsible refs: References/Citations/Notes/Bibliography/External links/Further reading/See also.
 * - Caching:
 *    1) Static JSON cache (./cache/<slug>.json) if present and current (by lastrevid).
 *    2) IndexedDB wiki_cache.pages keyed by <title>#<fragment|ALL>, guarded by lastrevid.
 * - Only one light query per page (lastrevid + meta) before deciding to fetch sections.
 */

const TOC = document.getElementById('toc-content');
const TARGET = document.getElementById('sources');
const TOC_FILTER = document.getElementById('toc-filter');

const TTL_MS = 6 * 60 * 60 * 1000; // localStorage (parse-call) TTL – still used for MW responses
const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = '&origin=*'; // CORS
const HEADERS_TO_INCLUDE = null; // e.g., ['0','1','2'] to limit
const STATIC_CACHE_DIR = './cache'; // optional; place precomputed JSON here

// Problems panel
let PROBLEMS = [];
function mountProblemsPanel() {
  const container = document.querySelector('.page-container') || document.body;
  let panel = document.getElementById('problems-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'problems-panel';
    panel.className = 'notice';
    panel.style.display = 'none';
    const bc = container.querySelector('.breadcrumbs');
    if (bc && bc.parentNode === container) {
      container.insertBefore(panel, bc.nextSibling);
    } else {
      container.insertBefore(panel, container.firstChild);
    }
  }
  if (PROBLEMS.length) {
    panel.style.display = '';
    const items = PROBLEMS.map(p => `<li>${p}</li>`).join('');
    panel.innerHTML = `<strong>Problems detected:</strong><ul style="margin:.5rem 0 0 1rem">${items}</ul>`;
  } else {
    panel.style.display = 'none';
  }
}

// LocalStorage cache (for raw MW API responses; we keep this from v1)
const cacheGet = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.t > TTL_MS) { localStorage.removeItem(key); return null; }
    return obj.v;
  } catch { return null; }
};
const cacheSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch {}
};

// IndexedDB cache (render-ready pages)
let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('wiki_cache', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pages')) {
        const store = db.createObjectStore('pages', { keyPath: 'key' }); // key = title#fragment|ALL
        store.createIndex('byTitle', 'title', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}
async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readonly');
    const store = tx.objectStore('pages');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(obj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    const req = store.put(obj);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Utils
function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,128);
}
function extractFragment(url) {
  try { return new URL(url).hash.replace(/^#/, '') || null; } catch { return null; }
}
function urlToTitle(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) {
      return decodeURIComponent(u.pathname.replace('/wiki/', '')).split('#')[0];
    }
    const t = u.searchParams.get('title');
    if (t) return decodeURIComponent(t).split('#')[0];
  } catch {}
  return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0].replace(/_/g,' ');
}
function displayTitleString(title) {
  // Fix percent-escapes (e.g., R%26D → R&D) and underscores
  try { title = decodeURIComponent(title); } catch {}
  return title.replace(/_/g,' ');
}
function cacheKey(title, fragment) {
  return `${title}#${fragment || 'ALL'}`;
}
function cacheSlug(title, fragment) {
  return slugify(`${title}--${fragment || 'all'}`);
}
function isCollapsibleHeading(line) {
  return /^(references?|citations?|notes|footnotes?|bibliography|external links|further reading|see also)$/i.test(line.trim());
}

// MediaWiki calls
async function fetchParse(params) {
  const url = `${MW_API}?${params}${ORIGIN}`;
  const key = `mw:${params}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  cacheSet(key, json);
  return json;
}

// Light search suggestion for typos
async function searchSuggest(title) {
  const p = new URLSearchParams({
    action: 'opensearch',
    format: 'json',
    search: title,
    limit: '1',
    namespace: '0'
  }).toString();
  const res = await fetch(`${MW_API}?${p}${ORIGIN}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[1]?.[0] || null;
}

// Resolve + inspect: include lastrevid (crucial for caching)
async function resolveAndInspect(rawTitle) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    titles: rawTitle,
    prop: 'info|revisions|pageprops',
    rvprop: 'ids|timestamp',      // include revid
    inprop: 'url'
  }).toString();

  let data = await fetchParse(p);
  let pages = data?.query?.pages || {};
  let first = Object.values(pages)[0];

  if (first?.missing) {
    const suggestion = await searchSuggest(rawTitle);
    if (suggestion && suggestion !== rawTitle) {
      PROBLEMS.push(`“${rawTitle}” not found; auto-suggested → “${suggestion}”.`);
      return resolveAndInspect(suggestion);
    }
    PROBLEMS.push(`“${rawTitle}” not found (no suggestion).`);
    return { title: rawTitle, missing: true };
  }

  const normalized = data?.query?.normalized?.[0]?.to || null;
  const redirected = data?.query?.redirects?.[0]?.to || null;
  const canonical = normalized || redirected || first?.title || rawTitle;

  if (normalized && normalized !== rawTitle) {
    PROBLEMS.push(`Normalized “${rawTitle}” → “${normalized}”.`);
  }
  if (redirected && redirected !== rawTitle) {
    PROBLEMS.push(`Redirected “${rawTitle}” → “${redirected}”.`);
  }

  const isDisambig = !!first?.pageprops?.disambiguation;
  if (isDisambig) {
    PROBLEMS.push(`“${canonical}” is a disambiguation page. Rendering anyway.`);
  }

  const updated = first?.revisions?.[0]?.timestamp ? new Date(first.revisions[0].timestamp) : null;
  const lastrevid = first?.revisions?.[0]?.revid || first?.lastrevid || null; // belt & suspenders
  const fullurl = first?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical)}`;

  return { title: canonical, url: fullurl, updated, lastrevid, disambig: isDisambig, missing: false };
}

async function getSections(pageTitle) {
  const p = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'sections',
    page: pageTitle
  }).toString();
  const data = await fetchParse(p);
  if (data.error) throw new Error(data.error.info || 'MediaWiki error (sections)');
  return data.parse.sections || [];
}
async function getSectionHTML(pageTitle, sectionIndex) {
  const p = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text|revid',
    page: pageTitle,
    section: sectionIndex
  }).toString();
  const data = await fetchParse(p);
  if (data.error) throw new Error(data.error.info || 'MediaWiki error (text)');
  return { html: data.parse.text['*'], revid: data.parse.revid };
}

// Sanitize/Rewrite
function sanitizeAndRewrite(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  ['script','style','meta','link'].forEach(sel => doc.querySelectorAll(sel).forEach(n => n.remove()));

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) {
      a.setAttribute('href', href);
    } else if (href.startsWith('/')) {
      a.setAttribute('href', `https://en.wikipedia.org${href}`);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  doc.querySelectorAll('.mw-editsection, .toc, .navbox, .metadata').forEach(n => n.remove());
  doc.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));

  return doc.body.innerHTML;
}

// TOC/UI
function addTOCSourceBlock(srcId, title, sections) {
  const wrap = document.createElement('div');
  wrap.className = 'toc-source';
  wrap.setAttribute('data-source', title);

  const h = document.createElement('div');
  h.className = 'source';
  const link = document.createElement('a');
  link.href = `#${srcId}`;
  link.textContent = displayTitleString(title);
  h.appendChild(link);
  wrap.appendChild(h);

  const list = document.createElement('ul');
  (sections || []).forEach(s => {
    if (s.toclevel === 0) return; // skip root
    const li = document.createElement('li');
    li.setAttribute('data-section', s.line.toLowerCase());
    const a = document.createElement('a');
    a.href = `#${srcId}--sec-${s.index}`;
    a.textContent = s.line;
    li.appendChild(a);
    list.appendChild(li);
  });
  wrap.appendChild(list);
  TOC.appendChild(wrap);
}

function renderSourceHeader(container, srcId, title, pageUrl, updated) {
  const section = document.createElement('section');
  section.id = srcId;

  const head = document.createElement('div');
  head.className = 'source-header';

  const h2 = document.createElement('h2');
  const a = document.createElement('a');
  a.href = pageUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  a.textContent = displayTitleString(title); // ✅ decode percent escapes
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  h2.appendChild(a);

  const badge = document.createElement('span');
  badge.className = 'pill';
  badge.textContent = 'Wikipedia';

  const updatedSpan = document.createElement('span');
  updatedSpan.className = 'updated-time';
  updatedSpan.textContent = updated ? `Last updated: ${updated.toLocaleString()}` : '';

  head.appendChild(h2);
  head.appendChild(badge);
  head.appendChild(updatedSpan);
  section.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'source-meta';
  meta.textContent = a.href;
  section.appendChild(meta);

  const content = document.createElement('div');
  content.className = 'source-content';
  section.appendChild(content);

  container.appendChild(section);
  return content;
}

function renderSubsection(contentEl, srcId, s, html) {
  const id = `${srcId}--sec-${s.index}`;
  const title = s.line;

  if (isCollapsibleHeading(title)) {
    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    details.id = id;
    details.open = false; // <-- ensure collapsed on load

    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'collapsible-body';
    body.innerHTML = html;
    details.appendChild(body);

    contentEl.appendChild(details);

    // Auto-open if you deep-link directly to this anchor
    if (location.hash.replace('#', '') === id) details.open = true;
    return;
  }

  // Non-collapsible sections
  const wrap = document.createElement('div');
  wrap.className = 'subsection';
  wrap.id = id;

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const body = document.createElement('div');
  body.innerHTML = html;

  wrap.appendChild(h3);
  wrap.appendChild(body);
  contentEl.appendChild(wrap);
}

// TOC filter
function setupTocFilter() {
  if (!TOC_FILTER) return;
  TOC_FILTER.addEventListener('input', () => {
    const q = TOC_FILTER.value.trim().toLowerCase();
    const blocks = TOC.querySelectorAll('.toc-source');
    blocks.forEach(block => {
      let anyVisible = false;
      const items = block.querySelectorAll('li');
      items.forEach(li => {
        const match = !q || li.getAttribute('data-section')?.includes(q);
        li.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      });
      block.style.display = anyVisible || !q ? '' : 'none';
    });
  });
}

// Try static cache file (./cache/<slug>.json)
async function tryLoadStaticCache(slug) {
  try {
    const res = await fetch(`${STATIC_CACHE_DIR}/${slug}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Render from a cached record (static or IndexedDB)
function renderFromCache(rec) {
  const srcId = `src-${slugify(rec.title)}`;
  addTOCSourceBlock(srcId, rec.title, rec.sections);
  const contentEl = renderSourceHeader(TARGET, srcId, rec.title, rec.url, rec.updated ? new Date(rec.updated) : null);
  for (const s of rec.sections) {
    renderSubsection(contentEl, srcId, s, s.html || '');
  }
}

// Main
async function render() {
  try {
    const urlsRes = await fetch('./urls.json');
    if (!urlsRes.ok) throw new Error('Missing urls.json');
    const urls = await urlsRes.json();
    TOC.innerHTML = '';
    PROBLEMS = [];

    for (const url of urls) {
      try {
        const rawTitle = urlToTitle(url);
        const fragment = extractFragment(url);
        const info = await resolveAndInspect(rawTitle);
        if (info.missing) {
          const srcId = `src-${slugify(rawTitle)}`;
          const contentEl = renderSourceHeader(TARGET, srcId, rawTitle, null, null);
          const e = document.createElement('div');
          e.className = 'error';
          e.textContent = `Page not found: “${rawTitle}”.`;
          contentEl.appendChild(e);
          continue;
        }

        const key = cacheKey(info.title, fragment);
        const slug = cacheSlug(info.title, fragment);

        // 1) Static JSON cache (if present and current)
        const staticRec = await tryLoadStaticCache(slug);
        if (staticRec && staticRec.lastrevid && info.lastrevid && String(staticRec.lastrevid) === String(info.lastrevid)) {
          renderFromCache(staticRec);
          // also feed into IndexedDB for offline reuse
          await idbPut(staticRec);
          continue;
        }

        // 2) IndexedDB cache (if present and current)
        const idbRec = await idbGet(key);
        if (idbRec && idbRec.lastrevid && info.lastrevid && String(idbRec.lastrevid) === String(info.lastrevid)) {
          renderFromCache(idbRec);
          continue;
        }

        // 3) Fresh fetch (sections + per-section HTML)
        const allSections = await getSections(info.title);

        // pick sections
        let sectionList = allSections;
        if (fragment) {
          const fragLower = fragment.toLowerCase().replace(/_/g,' ');
          const byAnchor = allSections.find(s => (s.anchor || '').toLowerCase() === fragment.toLowerCase());
          const byLine = allSections.find(s => (s.line || '').toLowerCase() === fragLower);
          const chosen = byAnchor || byLine;
          if (chosen) sectionList = [chosen];
          else PROBLEMS.push(`Fragment “#${fragment}” not found on “${info.title}”; rendering all sections.`);
        } else if (HEADERS_TO_INCLUDE) {
          sectionList = allSections.filter(s => HEADERS_TO_INCLUDE.includes(s.index));
        }

        // Fetch HTML for chosen sections
        const outSections = [];
        for (const s of sectionList) {
          try {
            const { html } = await getSectionHTML(info.title, s.index);
            const cleaned = sanitizeAndRewrite(html);
            outSections.push({ index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel, html: cleaned });
          } catch (err) {
            PROBLEMS.push(`Section “${s.line}” failed to load on “${info.title}”: ${err.message}`);
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

        // Persist to IndexedDB (and still render)
        await idbPut(record);
        renderFromCache(record);

      } catch (err) {
        PROBLEMS.push(`Failed to process URL: ${url} → ${err.message}`);
      }
    }

    if (!urls?.length) {
      TOC.innerHTML = '<p class="error">No sources in <code>urls.json</code>.</p>';
    }

    setupTocFilter();
    mountProblemsPanel();
  } catch (err) {
    TOC.innerHTML = `<p class="error">Failed to initialize: ${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', render);
