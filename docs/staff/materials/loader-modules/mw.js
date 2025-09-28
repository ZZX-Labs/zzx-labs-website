// MediaWiki API wrappers (v2: timeout+retry, stricter errors, safe caching)

import {
  MW_API, ORIGIN,
  REQUEST_TIMEOUT_MS as _REQ_TO_MS,
  RETRY as _RETRY,
  RETRY_BACKOFF_MS as _BACKOFF,
  FETCH_INIT as _FETCH_INIT
} from './config.js';
import { lsGet, lsSet } from './cache.js';

const REQ_TO_MS = typeof _REQ_TO_MS === 'number' ? _REQ_TO_MS : 15000;
const RETRIES   = typeof _RETRY === 'number' ? _RETRY : 2;
const BACKOFF   = typeof _BACKOFF === 'number' ? _BACKOFF : 400;
const FETCH_INIT = _FETCH_INIT || { cache: 'no-cache' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSONWithTimeout(url, { timeout = REQ_TO_MS, init = FETCH_INIT } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function fetchWithRetryJSON(url, { retries = RETRIES, timeout = REQ_TO_MS, init = FETCH_INIT } = {}) {
  let attempt = 0, lastErr;
  while (attempt <= retries) {
    try { return await fetchJSONWithTimeout(url, { timeout, init }); }
    catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      await sleep(BACKOFF * Math.pow(2, attempt));
      attempt++;
    }
  }
  throw lastErr;
}

// Core cached fetch (per MediaWiki params string)
async function fetchParse(params) {
  const url = `${MW_API}?${params}${ORIGIN}`;
  const key = `mw:${params}`;
  const cached = lsGet(key);
  if (cached) return cached;

  const json = await fetchWithRetryJSON(url);
  if (json && json.error) {
    const msg = json.error.info || json.error.code || 'MediaWiki API error';
    throw new Error(msg);
  }
  lsSet(key, json);
  return json;
}

// Public: search suggestion (typo correction)
export async function searchSuggest(title) {
  const p = new URLSearchParams({
    action: 'opensearch', format: 'json', search: title, limit: '1', namespace: '0'
  }).toString();
  try {
    const url = `${MW_API}?${p}${ORIGIN}`;
    const data = await fetchWithRetryJSON(url);
    return data?.[1]?.[0] || null;
  } catch { return null; }
}

// Public: resolve canonical title + lastrevid + meta
export async function resolveAndInspect(rawTitle) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', redirects: '1', titles: rawTitle,
    prop: 'info|revisions|pageprops', rvprop: 'ids|timestamp', inprop: 'url'
  }).toString();

  const data = await fetchParse(p);
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];

  if (!first) throw new Error('MediaWiki response malformed (no pages)');

  if (first.missing || first.invalid) {
    const suggestion = await searchSuggest(rawTitle);
    if (suggestion && suggestion !== rawTitle) return resolveAndInspect(suggestion);
    return { title: rawTitle, missing: true };
  }

  const normalized = data?.query?.normalized?.[0]?.to || null;
  const redirected = data?.query?.redirects?.[0]?.to || null;
  const canonical  = normalized || redirected || first.title || rawTitle;

  const updated   = first?.revisions?.[0]?.timestamp ? new Date(first.revisions[0].timestamp) : null;
  const lastrevid = first?.revisions?.[0]?.revid || first?.lastrevid || null;
  const fullurl   = first?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical)}`;
  const disambig  = !!first?.pageprops?.disambiguation;

  return { title: canonical, url: fullurl, updated, lastrevid, disambig, missing: false };
}

// Public: get sections metadata for a page
export async function getSections(pageTitle) {
  const p = new URLSearchParams({
    action: 'parse', format: 'json', prop: 'sections', page: pageTitle
  }).toString();

  const data = await fetchParse(p);
  if (data?.error) {
    const msg = data.error.info || 'MediaWiki error (sections)';
    throw new Error(msg);
  }
  return data?.parse?.sections || [];
}

// Public: get HTML for a specific section index
export async function getSectionHTML(pageTitle, sectionIndex) {
  const p = new URLSearchParams({
    action: 'parse', format: 'json', prop: 'text|revid', page: pageTitle, section: sectionIndex
  }).toString();

  const data = await fetchParse(p);
  if (data?.error) {
    const msg = data.error.info || 'MediaWiki error (text)';
    throw new Error(msg);
  }

  const html  = data?.parse?.text?.['*'];
  const revid = data?.parse?.revid || null;

  if (!html) throw new Error('Empty parse HTML');

  return { html, revid };
    }
