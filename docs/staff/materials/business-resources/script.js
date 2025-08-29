/* Business Resources renderer
 * - Reads ./urls.json (array of Wikipedia URLs).
 * - Resolve titles (redirects/typos), fetch sections + per-section HTML via MediaWiki API.
 * - Sanitizes incoming HTML, rewrites links, opens external in new tabs.
 * - Caches responses in localStorage (TTL default 6h).
 * - Provides a sticky TOC with filter.
 */

const TOC = document.getElementById('toc-content');
const TARGET = document.getElementById('sources');
const TOC_FILTER = document.getElementById('toc-filter');

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = '&origin=*'; // CORS
const HEADERS_TO_INCLUDE = null; // e.g., ['0','1','2'] to limit level(s)

// --- Cache helpers ---
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

// --- Utils ---
function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
}

// Normalize URL → extract title and drop fragments/query noise
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

// --- API calls ---
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

// Resolve redirects & typos → canonical title (or fallback to original)
async function resolveTitle(rawTitle) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    titles: rawTitle
  }).toString();

  const data = await fetchParse(p);
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];

  if (first && !first.missing) {
    const normalized = data?.query?.normalized?.[0]?.to || null;
    const redirected = data?.query?.redirects?.[0]?.to || null;
    return (normalized || redirected || first.title || rawTitle);
  }

  const suggestion = await searchSuggest(rawTitle);
  return suggestion || rawTitle;
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

async function getPageMeta(pageTitle) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'revisions|info',
    titles: pageTitle,
    rvprop: 'timestamp',
    inprop: 'url'
  }).toString();
  const data = await fetchParse(p);
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];
  const ts = first?.revisions?.[0]?.timestamp;
  const fullurl = first?.fullurl;
  return { updated: ts ? new Date(ts) : null, url: fullurl || null };
}

// --- Sanitize HTML, rewrite links ---
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

// --- TOC/UI builders ---
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
  sections.forEach(s => {
    if (s.toclevel === 0) return;
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

function renderSourceHeader(container, srcId, titleOrUrl, updated) {
  const section = document.createElement('section');
  section.id = srcId;

  const head = document.createElement('div');
  head.className = 'source-header';

  const h2 = document.createElement('h2');
  const a = document.createElement('a');
  a.href = typeof titleOrUrl === 'string' && titleOrUrl.startsWith('http')
    ? titleOrUrl
    : `https://en.wikipedia.org/wiki/${encodeURIComponent(titleOrUrl)}`;
  a.textContent = (typeof titleOrUrl === 'string' && !titleOrUrl.startsWith('http')
    ? titleOrUrl
    : (new URL(a.href)).pathname.replace('/wiki/','').replace(/_/g,' '));
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

// --- TOC filter ---
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

// --- Main render ---
async function render() {
  try {
    const urlsRes = await fetch('./urls.json');
    if (!urlsRes.ok) throw new Error('Missing urls.json');
    const urls = await urlsRes.json();
    TOC.innerHTML = '';

    for (const url of urls) {
      const title = await resolveTitle(urlToTitle(url));
      const srcId = `src-${slugify(title)}`;

      const [sections, meta] = await Promise.all([
        getSections(title),
        getPageMeta(title)
      ]);

      addTOCSourceBlock(srcId, title, sections);

      const contentEl = renderSourceHeader(
        TARGET,
        srcId,
        meta.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        meta.updated
      );

      const sectionList = (HEADERS_TO_INCLUDE)
        ? sections.filter(s => HEADERS_TO_INCLUDE.includes(s.index))
        : sections;

      for (const s of sectionList) {
        try {
          const { html } = await getSectionHTML(title, s.index);
          const cleaned = sanitizeAndRewrite(html);
          if (cleaned.trim()) renderSubsection(contentEl, srcId, s, cleaned);
        } catch (err) {
          const e = document.createElement('div');
          e.className = 'error';
          e.textContent = `Section “${s.line}” failed to load: ${err.message}`;
          contentEl.appendChild(e);
        }
      }
    }

    if (!urls?.length) {
      TOC.innerHTML = '<p class="error">No sources in <code>urls.json</code>.</p>';
    }

    setupTocFilter();
  } catch (err) {
    TOC.innerHTML = `<p class="error">Failed to initialize: ${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', render);
