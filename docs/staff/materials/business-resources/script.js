/* Business Resources renderer (hardened)
 * - Reads ./urls.json (array of Wikipedia URLs).
 * - Resolves redirects/typos; supports #fragment to render only that section.
 * - Per-source try/catch so one bad URL never breaks the whole page/TOC.
 * - Problems panel surfaces redirects/misspellings/missing/disambiguation.
 * - Caches MediaWiki responses in localStorage (TTL 6h).
 */

const TOC = document.getElementById('toc-content');
const TARGET = document.getElementById('sources');
const TOC_FILTER = document.getElementById('toc-filter');

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = '&origin=*'; // CORS
const HEADERS_TO_INCLUDE = null; // e.g., ['0','1','2'] to limit levels

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

    // Insert under breadcrumbs if present
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

// Cache helpers
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

// Utils
function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
}
function extractFragment(url) {
  try { return new URL(url).hash.replace(/^#/, '') || null; } catch { return null; }
}
// Normalize URL → title (no fragment)
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

// Resolve + inspect (redirects/typos/disambiguation)
async function resolveAndInspect(rawTitle) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    titles: rawTitle,
    prop: 'info|revisions|pageprops',
    rvprop: 'timestamp',
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
    PROBLEMS.push(`“${canonical}” is a disambiguation page (e.g., OKB). Rendering anyway.`);
  }

  const updated = first?.revisions?.[0]?.timestamp ? new Date(first.revisions[0].timestamp) : null;
  const fullurl = first?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical)}`;

  return { title: canonical, url: fullurl, updated, disambig: isDisambig, missing: false };
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
  link.textContent = title.replace(/_/g,' ');
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
  a.textContent = title.replace(/_/g,' ');
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
  const wrap = document.createElement('div');
  wrap.className = 'subsection';
  wrap.id = `${srcId}--sec-${s.index}`;

  const h3 = document.createElement('h3');
  h3.textContent = s.line;

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

        const srcId = `src-${slugify(info.title)}`;
        const sections = await getSections(info.title);

        let sectionList = sections;
        if (fragment) {
          const fragLower = fragment.toLowerCase().replace(/_/g,' ');
          const byAnchor = sections.find(s => (s.anchor || '').toLowerCase() === fragment.toLowerCase());
          const byLine = sections.find(s => (s.line || '').toLowerCase() === fragLower);
          const chosen = byAnchor || byLine;
          sectionList = chosen ? [chosen] : sections;
          if (!chosen) {
            PROBLEMS.push(`Fragment “#${fragment}” not found on “${info.title}”; rendering all sections.`);
          }
        } else if (HEADERS_TO_INCLUDE) {
          sectionList = sections.filter(s => HEADERS_TO_INCLUDE.includes(s.index));
        }

        addTOCSourceBlock(srcId, info.title, sectionList);
        const contentEl = renderSourceHeader(TARGET, srcId, info.title, info.url, info.updated);

        for (const s of sectionList) {
          try {
            const { html } = await getSectionHTML(info.title, s.index);
            const cleaned = sanitizeAndRewrite(html);
            if (cleaned.trim()) renderSubsection(contentEl, srcId, s, cleaned);
          } catch (err) {
            const e = document.createElement('div');
            e.className = 'error';
            e.textContent = `Section “${s.line}” failed to load: ${err.message}`;
            contentEl.appendChild(e);
          }
        }
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
