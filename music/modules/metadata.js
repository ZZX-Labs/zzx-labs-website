// /music/modules/metadata.js — front-end only, AllOrigins-capable metadata
import { corsWrap, normalizeNow } from './utils.js';

/* ===================== AllOrigins-aware proxy helpers ===================== */
const AO_BASE = 'https://api.allorigins.win';

function aoWrap(url, mode = 'raw') {
  const enc = encodeURIComponent(url);
  // disableCache so "now playing" endpoints aren't sticky
  return `${AO_BASE}/${mode === 'json' ? 'get' : 'raw'}?url=${enc}&disableCache=true`;
}

/**
 * Wrap a URL using:
 *  - "allorigins" | "allorigins-raw"  -> AllOrigins RAW
 *  - "allorigins-json"                -> AllOrigins JSON wrapper ({ contents, status })
 *  - any other non-empty string       -> prefix-style fallback (utils.corsWrap)
 *  - falsy                            -> AllOrigins RAW (safe front-end default)
 */
function wrapProxy(proxy, url, prefer = 'raw') {
  if (!url) return '';
  if (!proxy) return aoWrap(url, prefer);
  const p = String(proxy).toLowerCase();
  if (p.startsWith('allorigins')) return aoWrap(url, p.includes('json') ? 'json' : 'raw');
  return corsWrap(proxy, url); // legacy/prefix proxies: "https://proxy/?"
}

async function fetchTextViaProxy(url, proxy) {
  try {
    const p = String(proxy || '').toLowerCase();
    if (p.startsWith('allorigins')) {
      // Try RAW first
      const r1 = await fetch(aoWrap(url, 'raw'), { cache: 'no-store' });
      if (r1.ok) return await r1.text();
      // Fallback: JSON wrapper -> .contents
      const r2 = await fetch(aoWrap(url, 'json'), { cache: 'no-store' });
      if (!r2.ok) return '';
      const j = await r2.json();
      return String(j?.contents || '');
    }
    const r = await fetch(wrapProxy(proxy, url, 'raw'), { cache: 'no-store' });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

async function fetchJSONViaProxy(url, proxy) {
  try {
    const p = String(proxy || '').toLowerCase();
    if (p.startsWith('allorigins')) {
      // RAW first (works if target replies with application/json)
      try {
        const r1 = await fetch(aoWrap(url, 'raw'), { cache: 'no-store' });
        if (r1.ok) return await r1.json();
      } catch {}
      // Fallback: JSON wrapper -> parse contents
      const r2 = await fetch(aoWrap(url, 'json'), { cache: 'no-store' });
      if (!r2.ok) return null;
      const j = await r2.json();
      const txt = j?.contents || '';
      if (!txt) return null;
      try { return JSON.parse(txt); } catch { return null; }
    }
    const r = await fetch(wrapProxy(proxy, url, 'raw'), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/* ===================== PUBLIC API ===================== */
export async function fetchStreamMeta(streamUrl, proxy){
  // 1) Try station status endpoints (Icecast/Shoutcast/Radio.co)
  const fromStatus = await fetchFromStationStatus(streamUrl, proxy);
  if (fromStatus && (fromStatus.now || fromStatus.title)) return fromStatus;

  // 2) Fallback: one-shot ICY metadata read
  const fromIcy = await fetchICYOnce(streamUrl, proxy);
  if (fromIcy && (fromIcy.now || fromIcy.title)) return fromIcy;

  return null;
}

export async function fetchTrackMeta(track, proxy){
  const url = track?.url || '';
  if (!url) return null;
  const lower = url.toLowerCase();

  // MP3 ID3v2
  if (/\.(mp3)(\?|#|$)/.test(lower)){
    const id3 = await fetchID3v2(url);
    if (id3 && (id3.title || id3.artist)) return id3;
  }
  // Vorbis/Opus/FLAC comments
  if (/\.(ogg|opus|oga|flac)(\?|#|$)/.test(lower)){
    const vorb = await fetchVorbis(url);
    if (vorb && (vorb.title || vorb.artist)) return vorb;
  }
  // YouTube/SoundCloud (oEmbed)
  if (isYouTube(url) || isSoundCloud(url)){
    const oem = await fetchOEmbed(url, proxy);
    if (oem && (oem.title || oem.artist)) return oem;
  }
  // Optional: jsmediatags (if included on page)
  const jmt = await readViaJsMediaTags(url, proxy);
  if (jmt && (jmt.title || jmt.artist)) return jmt;

  // Fallback: filename or EXTINF
  return { title: track.title || titleFromFilename(url), artist: '', album: '' };
}

/* ===================== RADIO STATUS HELPERS ===================== */
async function fetchFromStationStatus(streamUrl, proxy){
  try {
    const u = new URL(streamUrl, location.href);
    const base = `${u.protocol}//${u.host}`;

    const candidates = [
      `${base}/status-json.xsl`,     // Icecast JSON
      `${base}/status.xsl?json=1`,   // Alt Icecast JSON
      `${base}/stats?sid=1&json=1`,  // Shoutcast v2 JSON
      guessRadioCoStatus(u),         // Radio.co JSON
      `${base}/7.html`               // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const raw of candidates){
      const isJson = /(\.xsl$|json=1|public\.radio\.co)/.test(raw);

      if (isJson) {
        const data = await fetchJSONViaProxy(raw, proxy);
        if (!data) continue;

        // Icecast JSON
        if (data.icestats) {
          const src = data.icestats.source;
          const arr = Array.isArray(src) ? src : (src ? [src] : []);
          const hit = pickBestIcecastSource(arr, u);
          if (hit) {
            const title = hit.server_name || hit.title || '';
            const now = (hit.artist && hit.title)
              ? `${hit.artist} - ${hit.title}`
              : (hit.title || '');
            if (title || now) return { title, now: normalizeNow(now) };
          }
        }

        // Shoutcast v2 JSON
        if (data?.servertitle || data?.songtitle) {
          return { title: data.servertitle || '', now: normalizeNow(data?.songtitle || '') };
        }

        // Radio.co JSON
        if (data?.current_track || data?.name) {
          const now = data.current_track?.title_with_artists || data.current_track?.title || '';
          return { title: data.name || '', now: normalizeNow(now) };
        }
      } else {
        // Shoutcast v1 /7.html
        const txt = await fetchTextViaProxy(raw, proxy);
        if (!txt) continue;
        const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/);
        if (m) {
          const parts = String(m[1] || m[2] || '').split(',');
          const song = parts.pop()?.trim();
          if (song) return { title: '', now: normalizeNow(song) };
        }
      }
    }
  } catch {}
  return null;
}

// Prefer the source that matches the actual mount
function pickBestIcecastSource(sources, streamURL){
  if (!Array.isArray(sources) || !sources.length) return null;
  const pathTail = (p) => (p || '').toLowerCase().replace(/\/+$/,'');
  const want = {
    host: streamURL.hostname,
    port: streamURL.port || (streamURL.protocol === 'https:' ? '443' : '80'),
    path: pathTail(streamURL.pathname)
  };
  let best = null;
  for (const s of sources){
    const listen = s.listenurl || '';
    let lHost='', lPort='', lPath='';
    try {
      const u = new URL(listen, streamURL);
      lHost = u.hostname;
      lPort = u.port || (u.protocol === 'https:' ? '443' : '80');
      lPath = pathTail(u.pathname);
    } catch {}
    if (listen && lPath === want.path && lHost === want.host && lPort === want.port) return s;
    if (!best) best = s;
  }
  return best || sources[0];
}

function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

/* ===================== ICY (in-band) FALLBACK ===================== */
async function fetchICYOnce(streamUrl, proxy){
  try {
    const ctrl = new AbortController();
    const url = wrapProxy(proxy, streamUrl, 'raw');
    const r = await fetch(url, {
      method: 'GET',
      headers: { 'Icy-MetaData': '1' },
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!r.ok) return null;

    const metaint = parseInt(r.headers.get('icy-metaint') || r.headers.get('Ice-MetaInt') || '0', 10);
    if (!metaint || !r.body) return null;

    const reader = r.body.getReader();

    // 1) Skip metaint bytes of audio
    let remain = metaint;
    while (remain > 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      remain -= value.length;
    }

    // 2) Next byte is metadata length in 16-byte blocks
    const metaLenByte = await readExact(reader, 1);
    if (!metaLenByte) return null;
    const metaLen = metaLenByte[0] * 16;
    if (!metaLen) { ctrl.abort(); return null; }

    // 3) Read metadata
    const metaBuf = await readExact(reader, metaLen);
    ctrl.abort();

    const text = new TextDecoder('latin1').decode(metaBuf);
    const m = text.match(/StreamTitle='([^']*)'/i);
    const raw = (m?.[1] || '').trim();
    if (!raw) return null;

    return { title: '', now: normalizeNow(raw) };
  } catch { return null; }
}

async function readExact(reader, n){
  const chunks = []; let need = n;
  while (need > 0) {
    const { done, value } = await reader.read();
    if (done) return null;
    chunks.push(value);
    need -= value.length;
  }
  const out = new Uint8Array(n);
  let off = 0;
  for (const c of chunks){
    const take = Math.min(c.length, n - off);
    out.set(c.subarray(0, take), off);
    off += take;
    if (off >= n) break;
  }
  return out;
}

/* ===================== Playlist/file metadata ===================== */
function isYouTube(u){
  try{ const x=new URL(u, location.href); return /(^|\.)youtube\.com$/.test(x.hostname)||/(^|\.)youtu\.be$/.test(x.hostname);}catch{return false;}
}
function isSoundCloud(u){
  try{ const x=new URL(u, location.href); return /(^|\.)soundcloud\.com$/.test(x.hostname);}catch{return false;}
}
function titleFromFilename(u){
  try{
    const p = new URL(u, location.href).pathname.split('/').pop() || '';
    return decodeURIComponent(p.replace(/\.[a-z0-9]+$/i,'').replace(/[_\-]+/g,' ').trim());
  }catch{ return ''; }
}

/* ===================== Local tag readers (ID3, Vorbis, oEmbed) ===================== */
function synchsafeToInt(a,b,c,d){ return (a<<21)|(b<<14)|(c<<7)|d; }
function decodeID3Text(buf, offset, length){
  const enc = new DataView(buf, offset, 1).getUint8(0);
  const bytes = new Uint8Array(buf, offset+1, length-1);
  try{
    if (enc === 0x00) return new TextDecoder('latin1').decode(bytes).replace(/\0+$/,'').trim();
    if (enc === 0x01 || enc === 0x02) return new TextDecoder('utf-16').decode(bytes).replace(/\0+$/,'').trim();
    if (enc === 0x03) return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/,'').trim();
  }catch{}
  return '';
}
async function fetchID3v2(url){
  try{
    const r = await fetch(url, { headers: { Range:'bytes=0-65535' }, cache:'no-store' });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer(); const dv = new DataView(ab);
    if (dv.getUint8(0)!==0x49 || dv.getUint8(1)!==0x44 || dv.getUint8(2)!==0x33) return null; // "ID3"
    const ver = dv.getUint8(3);
    const flags = dv.getUint8(5);
    const size = synchsafeToInt(dv.getUint8(6),dv.getUint8(7),dv.getUint8(8),dv.getUint8(9));
    let pos = 10;

    if (flags & 0x40){
      if (ver===4){ const ext = synchsafeToInt(dv.getUint8(pos),dv.getUint8(pos+1),dv.getUint8(pos+2),dv.getUint8(pos+3)); pos += ext; }
      else { const ext = dv.getUint32(pos); pos += ext + 4; }
    }

    const end = Math.min(pos + size, ab.byteLength);
    let title='', artist='', album='';
    while (pos + 10 <= end){
      let id=''; for (let i=0;i<4;i++) id += String.fromCharCode(dv.getUint8(pos+i));
      const fsz = (ver===4)
        ? synchsafeToInt(dv.getUint8(pos+4),dv.getUint8(pos+5),dv.getUint8(pos+6),dv.getUint8(pos+7))
        : dv.getUint32(pos+4);
      pos += 10;
      if (!fsz || pos+fsz>end) break;
      if (id==='TIT2' || id==='TPE1' || id==='TALB'){
        const t = decodeID3Text(ab, pos, fsz);
        if (id==='TIT2') title  = title  || t;
        if (id==='TPE1') artist = artist || t;
        if (id==='TALB') album  = album  || t;
      }
      pos += fsz;
      if (title && artist && album) break;
    }
    if (title || artist || album) return { title, artist, album };
  }catch{}
  return null;
}
async function fetchVorbis(url){
  try{
    const r = await fetch(url, { headers: { Range:'bytes=0-65535' }, cache:'no-store' });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const s = new TextDecoder('utf-8').decode(new Uint8Array(ab));
    const title  = s.match(/TITLE=([^\n\r]+)/i)?.[1]?.trim() || '';
    const artist = s.match(/ARTIST=([^\n\r]+)/i)?.[1]?.trim() || '';
    const album  = s.match(/ALBUM=([^\n\r]+)/i)?.[1]?.trim() || '';
    if (title || artist || album) return { title, artist, album };
  }catch{}
  return null;
}
async function fetchOEmbed(url, proxy){
  try{
    let api = '';
    if (isYouTube(url)){
      api = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    } else if (isSoundCloud(url)){
      api = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    }
    if (!api) return null;
    const j = await fetchJSONViaProxy(api, proxy);
    if (!j) return null;
    return { title: j.title||'', artist: j.author_name||'', album:'' };
  }catch{}
  return null;
}
function haveJsMediaTags(){
  return typeof window !== 'undefined' && !!window.jsmediatags && !!window.jsmediatags.read;
}
async function readViaJsMediaTags(url, proxy){
  if (!haveJsMediaTags()) return null;

  // If a prefix proxy is provided, pass the URL through it so jsmediatags can fetch cross-origin
  const src = proxy
    ? (proxy.includes('?') ? (proxy + encodeURIComponent(url))
                           : (proxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, '')))
    : url;

  return new Promise((resolve) => {
    try {
      window.jsmediatags.read(src, {
        onSuccess: tag => {
          const tags = tag?.tags || {};
          const title  = (tags.title || '').trim();
          const artist = (tags.artist || '').trim();
          const album  = (tags.album || '').trim();
          if (title || artist || album) resolve({ title, artist, album });
          else resolve(null);
        },
        onError: () => resolve(null)
      });
    } catch {
      resolve(null);
    }
  });
  }
