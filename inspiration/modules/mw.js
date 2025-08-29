// MediaWiki API wrappers
import { MW_API, ORIGIN } from './config.js';
import { lsGet, lsSet } from './cache.js';

async function fetchParse(params) {
  const url = `${MW_API}?${params}${ORIGIN}`;
  const key = `mw:${params}`;
  const cached = lsGet(key);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  lsSet(key, json);
  return json;
}

export async function resolveAndInspect(rawTitle) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', redirects: '1',
    titles: rawTitle, prop: 'info|revisions|pageprops',
    rvprop: 'ids|timestamp', inprop: 'url'
  }).toString();

  const data = await fetchParse(p);
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];

  if (first?.missing) return { title: rawTitle, missing: true };

  const normalized = data?.query?.normalized?.[0]?.to || null;
  const redirected = data?.query?.redirects?.[0]?.to || null;
  const canonical  = normalized || redirected || first?.title || rawTitle;

  const updated   = first?.revisions?.[0]?.timestamp ? new Date(first.revisions[0].timestamp) : null;
  const lastrevid = first?.revisions?.[0]?.revid || first?.lastrevid || null;
  const fullurl   = first?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical)}`;
  const disambig  = !!first?.pageprops?.disambiguation;

  return { title: canonical, url: fullurl, updated, lastrevid, disambig, missing: false };
}

export async function getSections(pageTitle) {
  const p = new URLSearchParams({
    action: 'parse', format: 'json', prop: 'sections', page: pageTitle
  }).toString();
  const data = await fetchParse(p);
  if (data.error) throw new Error(data.error.info || 'MediaWiki error (sections)');
  return data.parse.sections || [];
}

export async function getSectionHTML(pageTitle, sectionIndex) {
  const p = new URLSearchParams({
    action: 'parse', format: 'json', prop: 'text|revid', page: pageTitle, section: sectionIndex
  }).toString();
  const data = await fetchParse(p);
  if (data.error) throw new Error(data.error.info || 'MediaWiki error (text)');
  return { html: data.parse.text['*'], revid: data.parse.revid };
}
