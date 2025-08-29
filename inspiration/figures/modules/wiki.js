// /inspiration/figures/modules/wiki.js
import { MW_API, ORIGIN } from './paths.js';

const WIKI_ORIGIN = 'https://en.wikipedia.org';

/* ----------------- URL helpers ----------------- */
function absoluteWikiUrl(href) {
  if (!href) return '';
  try {
    // protocol-relative
    if (/^\/\//.test(href)) return 'https:' + href;
    // absolute
    if (/^[a-z]+:\/\//i.test(href)) return href;
    // site-relative
    if (href.startsWith('/')) return WIKI_ORIGIN + href;
    return href;
  } catch { return href; }
}

export function slugFromWiki(url) {
  try {
    const u = new URL(url, WIKI_ORIGIN);
    // normalize mobile and other subdomains to canonical path
    const path = u.pathname.replace(/^\/m\//, '/'); // mobile → root
    if (path.startsWith('/wiki/')) {
      return decodeURIComponent(path.slice('/wiki/'.length)).split('#')[0];
    }
    const t = u.searchParams.get('title');
    return t ? decodeURIComponent(t).split('#')[0] : '';
  } catch {
    return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0];
  }
}

/* ----------------- Sanitizer ----------------- */
export function sanitizeWiki(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');

  // nuke script/style and known clutter
  tmp.querySelectorAll(`
    script,style,noscript,
    .infobox,.navbox,.vertical-navbox,.sidebar,
    .sistersitebox,.metadata,.mw-editsection,.shortdescription,
    .hatnote,.ambox,.ombox,.tmbox,.cmbox,.fmbox,.imbox,
    .toc,.thumb, .navbox-styles, .mbox-small, .plainlist.portal
  `).forEach(n => n.remove());

  // remove cite backlink superscripts like [1]
  tmp.querySelectorAll('sup.reference, span.reference').forEach(n => n.remove());

  // tables: keep but ensure they don't blow out the card
  tmp.querySelectorAll('table').forEach(t => {
    t.style.width = '100%';
    t.style.maxWidth = '100%';
    t.style.display = 'table';
  });

  // convert relative links to absolute + new tab, nofollow
  tmp.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.setAttribute('href', absoluteWikiUrl(href));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer nofollow ugc');
  });

  // images: prefer direct images, lazy load, absolute URLs
  tmp.querySelectorAll('img').forEach(img => {
    // favor src over data-* or srcset
    const srcset = img.getAttribute('srcset');
    if (!img.getAttribute('src') && srcset) {
      // pick the first candidate
      const first = srcset.split(',')[0]?.trim().split(' ')[0];
      if (first) img.setAttribute('src', first);
    }
    const src = img.getAttribute('src');
    if (src) img.setAttribute('src', absoluteWikiUrl(src));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  });

  // Turn “References / External links / See also …” sections into collapsibles
  const headings = tmp.querySelectorAll('h2,h3,h4,h5,h6');
  headings.forEach(h => {
    const text = (h.textContent || '').trim();
    const key = text.toLowerCase();
    if (/^(references?|citations?|notes|footnotes?|bibliography|external links|further reading|see also)$/.test(key)) {
      const details = document.createElement('details');
      details.className = 'subsection collapsible';
      const sum = document.createElement('summary');
      sum.textContent = text;
      const body = document.createElement('div');
      body.className = 'collapsible-body';

      let n = h.nextSibling;
      const stop = new Set(['H2','H3','H4','H5','H6']);
      while (n && !(n.nodeType === 1 && stop.has(n.tagName))) {
        const nx = n.nextSibling;
        body.appendChild(n);
        n = nx;
      }
      details.append(sum, body);
      h.replaceWith(details);
    }
  });

  // If a references list exists not under a heading, wrap it anyway
  tmp.querySelectorAll('ol.references, div.reflist').forEach(ref => {
    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    const sum = document.createElement('summary'); sum.textContent = 'References';
    const body = document.createElement('div'); body.className = 'collapsible-body';
    ref.replaceWith(details); body.appendChild(ref); details.append(sum, body);
  });

  return tmp.innerHTML;
}

/* ----------------- Fetch + Fallback ----------------- */
async function fetchParsed(title) {
  const qs = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text',
    redirects: '1',
    disablelimitreport: '1',
    page: title
  }).toString();
  const r = await fetch(`${MW_API}?${qs}${ORIGIN}`);
  if (!r.ok) throw new Error(`parse ${r.status}`);
  const data = await r.json();
  return data?.parse?.text?.['*'] || data?.parse?.text || '';
}

async function fetchSummary(title) {
  // REST summary fallback (short + clean)
  const url = `${WIKI_ORIGIN}/api/rest_v1/page/summary/${encodeURIComponent(title)}${ORIGIN}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`summary ${r.status}`);
  return r.json();
}

export async function loadWikiInto(el, wikiUrl) {
  const title = slugFromWiki(wikiUrl);
  if (!title) { el.innerHTML = `<p class="error">Missing Wikipedia title.</p>`; return; }

  try {
    const html = await fetchParsed(title);
    const clean = sanitizeWiki(html);
    el.innerHTML = clean || `<p class="muted">No content returned.</p>`;
  } catch (e) {
    // fallback to summary
    try {
      const s = await fetchSummary(title);
      const link = s?.content_urls?.desktop?.page || `${WIKI_ORIGIN}/wiki/${encodeURIComponent(title)}`;
      const extract = s?.extract || '';
      el.innerHTML = `
        <p>${extract ? extract : 'No extract available.'}</p>
        <p class="muted"><a href="${link}" target="_blank" rel="noopener noreferrer nofollow ugc">Read more on Wikipedia →</a></p>
      `;
    } catch (e2) {
      el.innerHTML = `<p class="error">Failed to load Wikipedia: ${e.message || e2.message}</p>`;
    }
  }
}
