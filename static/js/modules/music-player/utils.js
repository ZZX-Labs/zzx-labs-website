// static/js/modules/music-player/utils.js
export const $  = (s, c=document) => c.querySelector(s);
export const $$ = (s, c=document) => Array.from(c.querySelectorAll(s));

export const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.25));
export const isAbs   = u => /^([a-z][a-z0-9+\-.]*:)?\/\//i.test(u) || u.startsWith('/');
export const join    = (base, rel) => (isAbs(rel)
  ? rel
  : base.replace(/\/+$/,'') + '/' + String(rel||'').replace(/^\.\/?/, '')
);

export const fmtTime = (sec) => (!isFinite(sec)||sec<0)
  ? '—'
  : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

/** Optional pretty number (e.g., listeners). Safe to call with anything. */
export const prettyNum = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v.toLocaleString ? v.toLocaleString() : (n ?? '');
};

export function normalizeNow(s){
  if (!s) return '';
  let txt = String(s).replace(/\s+/g,' ').replace(/^\uFEFF/, '') // strip BOM if present
                     .replace(/^["'“”‘’]+|["'“”‘’]+$/g,'').trim();
  // Remove common stream suffix noise (codec/bitrate/live markers)
  txt = txt.replace(/\s*(\||•|—|-)\s*(radio|fm|am|live|station|stream|online|hq|ultra hd|4k)$/i,'').trim();
  txt = txt.replace(/\s*\b(32|64|96|128|160|192|256|320)\s?(kbps|kbit|kb|aac|mp3|opus|ogg)\b\s*$/i,'').trim();

  // Prefer "Artist - Title" normalization
  const parts = txt.split(' - ');
  if (parts.length >= 2) {
    const artist = parts.shift().trim();
    const title  = parts.join(' - ').trim();
    return `${artist} - ${title}`;
  }
  return txt;
}

export async function fetchText(url){
  try {
    const r = await fetch(url,{cache:'no-store'});
    if (!r.ok) return '';
    const t = await r.text();
    return String(t ?? '');
  } catch {
    return '';
  }
}
export async function fetchJSON(url){
  try {
    const r = await fetch(url,{cache:'no-store'});
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* M3U */
export function parseM3U(text){
  const lines = String(text||'').replace(/^\uFEFF/, '').split(/\r?\n/);
  const out = []; let pending = null;
  for(const raw of lines){
    const line = raw.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')){
      const i = line.indexOf(',');
      pending = (i>=0 ? line.slice(i+1).trim() : null);
      continue;
    }
    if (!line.startsWith('#')){
      out.push({ url: line, title: pending || line });
      pending = null;
    }
  }
  return out;
}
