// /inspiration/figures/modules/wiki.js
import { MW_API, ORIGIN } from './paths.js';

export function slugFromWiki(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) return decodeURIComponent(u.pathname.replace('/wiki/','')).split('#')[0];
    const t = u.searchParams.get('title');
    return t ? decodeURIComponent(t).split('#')[0] : '';
  } catch {
    return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0];
  }
}

export function sanitizeWiki(html) {
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
      const body = document.createElement('div');
      body.className = 'collapsible-body';
      let n = h.nextSibling;
      const stop = new Set(['H2','H3','H4','H5','H6']);
      while (n && !(n.nodeType === 1 && stop.has(n.tagName))) { const nx = n.nextSibling; body.appendChild(n); n = nx; }
      details.append(sum, body);
      h.replaceWith(details);
    }
  });

  tmp.querySelectorAll('ol.references, div.reflist').forEach(ref => {
    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    const sum = document.createElement('summary'); sum.textContent = 'References';
    const body = document.createElement('div'); body.className = 'collapsible-body';
    ref.replaceWith(details); body.appendChild(ref); details.append(sum, body);
  });

  tmp.querySelectorAll('a[href]').forEach(a => {
    a.setAttribute('target','_blank');
    a.setAttribute('rel','noopener noreferrer nofollow ugc');
  });

  return tmp.innerHTML;
}

export async function loadWikiInto(el, wikiUrl) {
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
