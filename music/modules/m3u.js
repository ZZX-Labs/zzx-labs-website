// m3u.js — parse & loader helpers
import { isAbs, join } from './utils.js';

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
    if (!line.startsWith('#')) {
      out.push({ url: line, title: pending || line });
      pending = null;
    }
  }
  return out;
}

export async function fetchText(url){
  try { const r=await fetch(url,{cache:'no-store'}); return r.ok ? r.text() : ''; } catch { return ''; }
}

export async function loadM3U({ path, base, audioBase, isStation, selectedTitle }){
  const url  = isAbs(path) ? path : join(base, path);
  const txt  = await fetchText(url);
  const entries = parseM3U(txt);
  if (!entries.length) return [];
  if (isStation){
    const urls = entries.map(e => isAbs(e.url) ? e.url : join(audioBase, e.url));
    return [{ title: selectedTitle || 'Live Station', isStream:true, urls }];
  }
  return entries.map(e => ({
    title: e.title || e.url,
    url: isAbs(e.url) ? e.url : join(audioBase, e.url),
    isStream: false
  }));
}
