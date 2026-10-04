// /music/modules/m3u.js — parse & loader helpers (robust M3U + PLS + nested)
import { isAbs, join } from './utils.js';

/* -------------------------------- low-level fetch -------------------------------- */
async function fetchText(url){
  try{
    if (!url) return '';
    const r = await fetch(url, { cache:'no-store' });
    return r.ok ? await r.text() : '';
  }catch{ return ''; }
}

/* --------------------------------- M3U parser ----------------------------------- */
/** Returns: [{ url, title }] */
export function parseM3U(text){
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const out = [];
  let pendingTitle = null;

  for (const raw of lines){
    const line = raw.trim();
    if (!line || line.toUpperCase() === '#EXTM3U') continue;

    if (line.startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      pendingTitle = comma >= 0 ? line.slice(comma + 1).trim() : null;
      continue;
    }

    if (!line.startsWith('#')) {
      out.push({ url: line, title: pendingTitle || line });
      pendingTitle = null;
    }
  }
  return out;
}

/* ---------------------------------- PLS parser ---------------------------------- */
/** Returns: [{ url, title }] */
export function parsePLS(text){
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const files = {};
  const titles = {};
  for (const raw of lines) {
    const m = raw.match(/^\s*(File|Title)(\d+)\s*=\s*(.+)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(); const idx = m[2]; const val = m[3].trim();
    if (key === 'file')  files[idx]  = val;
    if (key === 'title') titles[idx] = val;
  }
  const out = [];
  Object.keys(files).sort((a,b)=>Number(a)-Number(b)).forEach(i=>{
    out.push({ url: files[i], title: titles[i] || files[i] });
  });
  return out;
}

/* ---------------------------------- Loader -------------------------------------- */
/**
 * loadM3U({ path, base, audioBase, isStation, selectedTitle })
 * - Resolves relative against provided bases
 * - For stations: flattens nested .pls/.m3u (common in radio dir lists)
 * - For playlists: returns track items
 */
export async function loadM3U({ path, base, audioBase, isStation, selectedTitle }){
  const url  = isAbs(path) ? path : join(base, path);
  const txt  = await fetchText(url);
  if (!txt) return [];

  if (/\.(pls)(\?|#|$)/i.test(url)) {
    return await expandFromPLS({ text: txt, isStation, audioBase, base, selectedTitle });
  }

  if (/\.(m3u8?|m3u)(\?|#|$)/i.test(url)) {
    return await expandFromM3U({ entries: parseM3U(txt), isStation, audioBase, base, selectedTitle });
  }

  // Fallback: treat as M3U text if extension is missing/misleading
  return await expandFromM3U({ entries: parseM3U(txt), isStation, audioBase, base, selectedTitle });
}

/* ------------------------------- expand helpers --------------------------------- */
async function expandFromPLS({ text, isStation, audioBase, base, selectedTitle }){
  const items = parsePLS(text);
  if (!items.length) return [];
  if (isStation) {
    const urls = items.map(e => toAbs(e.url, audioBase, base));
    const title = selectedTitle || items[0]?.title || 'Live Station';
    return [{ title, isStream: true, urls: dedupe(urls) }];
  }
  return items.map(e => ({
    title: e.title || e.url,
    url: toAbs(e.url, audioBase, base),
    isStream: false
  }));
}

async function expandFromM3U({ entries, isStation, audioBase, base, selectedTitle, _depth=0 }){
  if (!entries?.length) return [];
  const MAX_DEPTH = 2;
  if (_depth > MAX_DEPTH) return [];

  if (isStation) {
    const urls = [];
    let stationTitle = selectedTitle || entries[0]?.title || 'Live Station';

    for (const e of entries) {
      const abs = toAbs(e.url, audioBase, base);

      if (/\.(pls)(\?|#|$)/i.test(abs)) {
        const plsText = await fetchText(abs);
        const pl = parsePLS(plsText);
        for (const p of pl) urls.push(toAbs(p.url, audioBase, base));
        if (!selectedTitle && pl[0]?.title) stationTitle = pl[0].title;

      } else if (/\.(m3u8?|m3u)(\?|#|$)/i.test(abs)) {
        const innerTxt = await fetchText(abs);
        const inner = parseM3U(innerTxt);
        const got = await expandFromM3U({
          entries: inner, isStation:true, audioBase, base, selectedTitle: stationTitle, _depth: _depth+1
        });
        if (got?.[0]?.urls) {
          urls.push(...got[0].urls);
          if (!selectedTitle && got[0].title) stationTitle = got[0].title;
        }

      } else {
        urls.push(abs);
        if (!selectedTitle && e.title) stationTitle = e.title;
      }
    }

    const uniq = dedupe(urls).filter(Boolean);
    return uniq.length ? [{ title: stationTitle, isStream: true, urls: uniq }] : [];
  }

  // Regular playlist of files/URLs
  return entries.map(e => ({
    title: e.title || e.url,
    url: toAbs(e.url, audioBase, base),
    isStream: false
  }));
}

/* ---------------------------------- helpers ------------------------------------- */
function toAbs(u, audioBase, base){
  if (isAbs(u)) return u;
  const looksMedia = /\.(mp3|m4a|flac|ogg|opus|oga|wav|aif|aiff|aac|m3u8|mpd)(\?|#|$)/i.test(u);
  return join(looksMedia ? audioBase : base, u);
}
function dedupe(arr){
  const seen = new Set(); const out = [];
  for (const x of arr){ if (!x || seen.has(x)) continue; seen.add(x); out.push(x); }
  return out;
}
