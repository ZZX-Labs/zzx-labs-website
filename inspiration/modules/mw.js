// /inspiration/modules/mw.js
// MediaWiki API wrappers (drop-in)
// - LocalStorage caching with TTL (via lsGet/lsSet)
// - Robust param handling + CORS
// - Safe parsing for resolve + sections + section HTML

import { MW_API, ORIGIN } from './config.js';
import { lsGet, lsSet } from './cache.js';

function withOrigin(url) {
  // Ensure we add origin param exactly once
  const hasQ = url.includes('?');
  const hasOrigin = /[?&]origin=/.test(url);
  if (hasOrigin) return url;
  const originParam = ORIGIN.startsWith('?') || ORIGIN.startsWith('&') ? ORIGIN : `&${ORIGIN}`;
  if (hasQ) return url + originParam.replace(/^\?/, '&');
  return url + originParam.replace(/^&/, '?');
}

async function fetchParse(params) {
  const qs = typeof params === 'string' ? params : new URLSearchParams(params).toString();
  const url = withOrigin(`${MW_API}?${qs}`);
  const key = `mw:${qs}`;
  const cached = lsGet(key);
  if (cached) return cached;

  const res = await fetch(url, { cache: 'no-cache', mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  // Cache only successful MW responses
  if (!json?.error) lsSet(key, json);
  return json;
}

export async function resolveAndInspect(rawTitle) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: '1',
    titles: rawTitle,
    prop: 'info|revisions|pageprops',
    rvprop: 'ids|timestamp',
    inprop: 'url'
  });

  const data = await fetchParse(params);
  const pages = data?.query?.pages || {};
  // MW returns an object keyed by pageid; pick the first
  const first = Object.values(pages)[0];

  if (!first || first?.missing) {
    return { title: rawTitle, url: null, updated: null, lastrevid: null, disambig: false, missing: true };
  }

  const normalized = data?.query?.normalized?.[0]?.to || null;
  const redirected = data?.query?.redirects?.[0]?.to || null;
  const canonical  = normalized || redirected || first.title || rawTitle;

  const updated   = first?.revisions?.[0]?.timestamp ? new Date(first.revisions[0].timestamp) : null;
  const lastrevid = first?.revisions?.[0]?.revid ?? first?.lastrevid ?? null;
  const fullurl   = first?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical)}`;
  const disambig  = !!first?.pageprops?.disambiguation;

  return { title: canonical, url: fullurl, updated, lastrevid, disambig, missing: false };
}

export async function getSections(pageTitle) {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'sections',
    page: pageTitle
  });

  const data = await fetchParse(params);
  if (data?.error) throw new Error(data.error.info || 'MediaWiki error (sections)');
  return data?.parse?.sections || [];
}

export async function getSectionHTML(pageTitle, sectionIndex) {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text|revid',
    page: pageTitle,
    section: String(sectionIndex)
  });

  const data = await fetchParse(params);
  if (data?.error) throw new Error(data.error.info || 'MediaWiki error (text)');
  const html  = data?.parse?.text?.['*'] || '';
  const revid = data?.parse?.revid ?? null;
  return { html, revid };
}
