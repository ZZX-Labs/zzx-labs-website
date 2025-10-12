// /music/modules/m3u.js — parse & loader helpers (robust M3U + PLS support)
import { isAbs, join } from './utils.js';

/* ----------------------------- low-level fetch ----------------------------- */
export async function fetchText(url){
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

/* ------------------------------ M3U parser --------------------------------- */
/**
 * Basic M3U/EXTM3U parser.
 * Returns: [{ url, title, attrs? }]
 * - Keeps the right-hand display text after #EXTINF:
 * - Ignores non-url lines, #EXTVLCOPT, etc.
 */
export function parseM3U(text){
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const out = [];
  let pendingTitle = null;

  for (const raw of lines){
    const line = raw.trim();
    if (!line || line.toUpperCase() === '#EXTM3U') continue;

    if (line.startsWith('#EXTINF:')) {
      // #EXTINF:-1, Artist - Title
      // Some lists include attributes like #EXTINF:-1 tvg-name="Foo",Display Title
      const comma = line.indexOf(',');
      pendingTitle = comma >= 0 ? line.slice(comma + 1).trim() : null;
      continue;
    }

    if (!line.startsWith('#')) {
      // Plain URL
      out.push({ url: line, title: pendingTitle || line });
      pendingTitle = null;
    }
    // ignore other tags
  }
  return out;
}

/* ------------------------------ PLS parser --------------------------------- */
/**
 * Simple PLS parser; returns array: [{ url, title }]
 * Supports File1=..., Title1=...
 */
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

/* ----------------------------- Loader (public) ----------------------------- */
/**
 * loadM3U({ path, base, audioBase, isStation, selectedTitle })
 * - Resolves relative paths against provided bases
 * - For stations: flattens nested .pls (common with radio directories)
 * - For playlists: returns track items as before
 */
export async function loadM3U({ path, base, audioBase, isStation, selectedTitle }){
  const url  = isAbs(path) ? path : join(base, path);
  const txt  = await fetchText(url);
  if (!txt) return [];

  // If someone supplied a .pls directly in the manifest, resolve it now.
  if (/\.(pls)(\?|#|$)/i.test(url)) {
    const items = parsePLS(txt);
    if (!items.length) return [];
    if (isStation) {
      const urls = items.map(e => toAbs(e.url, audioBase, base));
      const title = selectedTitle || items[0]?.title || 'Live Station';
      return [{ title, isStream: true, urls }];
    }
    return items.map(e => ({ title: e.title || e.url, url: toAbs(e.url, audioBase, base), isStream: false }));
  }

  // Normal M3U
  const entries = parseM3U(txt);
  if (!entries.length) return [];

  // Some M3Us chain to .pls files for the real stream endpoints — flatten those for stations
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
      } else {
        urls.push(abs);
        if (!selectedTitle && e.title) stationTitle = e.title;
      }
    }

    // Deduplicate while preserving order
    const uniq = [...new Set(urls)].filter(Boolean);
    return uniq.length ? [{ title: stationTitle, isStream: true, urls: uniq }] : [];
  }

  // Regular playlist of files/URLs
  return entries.map(e => ({
    title: e.title || e.url,
    url: toAbs(e.url, audioBase, base),
    isStream: false
  }));
}

/* ------------------------------ helpers ------------------------------------ */
function toAbs(u, audioBase, base){
  if (isAbs(u)) return u;
  // If it *looks* like media in your repo, prefer audioBase; otherwise fall back to base
  // (safe either way — both resolve to absolute URLs)
  const looksMedia = /\.(mp3|m4a|flac|ogg|opus|oga|wav|aif|aiff|aac|m3u8|mpd)(\?|#|$)/i.test(u);
  return join(looksMedia ? audioBase : base, u);
}
