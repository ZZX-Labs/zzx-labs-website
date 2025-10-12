// m3u.js
export function parseM3U(text){
  const lines = String(text||'').split(/\r?\n/);
  const out = []; let pending = null;
  for (const raw of lines){
    const line = raw.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')){
      const i = line.indexOf(',');
      pending = (i>=0) ? line.slice(i+1).trim() : null;
      continue;
    }
    if (!line.startsWith('#')) out.push({ url: line, title: pending || line }), pending=null;
  }
  return out;
}
