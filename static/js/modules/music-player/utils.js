// tiny utils for the player
export const isAbs = (u) => /^([a-z][a-z0-9+\-.]*:)?\/\//i.test(u) || (u||'').startsWith('/');

export const join = (base, rel) => {
  if (!rel) return base;
  if (isAbs(rel)) return rel;
  return base.replace(/\/+$/,'') + '/' + rel.replace(/^\.\/?/, '');
};

export function corsWrap(proxy, url){
  if (!url) return '';
  if (!proxy) return url;
  return proxy.includes('?') ? (proxy + encodeURIComponent(url))
                             : (proxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, ''));
}

export function normalizeNow(s){
  if (!s) return '';
  let txt = String(s).replace(/\s+/g,' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g,'').trim();
  // trim common junk / bitrates
  txt = txt.replace(/\s*(\||•|—|-)\s*(radio|fm|am|live|station|stream|online|hq|ultra hd|4k)$/i,'').trim();
  txt = txt.replace(/\s*\b(32|64|96|128|160|192|256|320)\s?(kbps|kbit|kb|aac|mp3|opus|ogg)\b\s*$/i,'').trim();

  // normalize "Artist - Title"
  const parts = txt.split(' - ');
  if (parts.length >= 2){
    const artist = parts.shift().trim();
    const title  = parts.join(' - ').trim();
    return `${artist} - ${title}`;
  }
  return txt;
}

export async function fetchJSON(url){
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
export async function fetchText(url){
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return '';
    return await r.text();
  } catch { return ''; }
}
