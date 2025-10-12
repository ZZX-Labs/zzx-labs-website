// /music/modules/metadata.js — stations + track metadata (SomaFM aware)
import { corsWrap, normalizeNow } from './utils.js';

/* ===================== PUBLIC API ===================== */
export async function fetchStreamMeta(streamUrl, proxy){
  // 1) SomaFM: pull from channels.json and skip ICY/7.html (to avoid Donate banner)
  if (isSomaUrl(streamUrl)) {
    const som = await fetchSomaFromStreamUrl(streamUrl, proxy);
    if (som && (som.now || som.title)) return som;
    // If Soma detection triggered but channels.json didn’t yield, return null instead
    // of falling back to 7.html (prevents "Donate…" text).
    return null;
  }

  // 2) Other station status endpoints; if none, fall back to ICY in-band tags
  const fromStatus = await fetchFromStationStatus(streamUrl, proxy);
  if (fromStatus && (fromStatus.now || fromStatus.title)) return fromStatus;

  const fromIcy = await fetchICYOnce(streamUrl, proxy);
  if (fromIcy && (fromIcy.now || fromIcy.title)) return fromIcy;

  return null;
}

export async function fetchTrackMeta(track, proxy){
  const url = track?.url || '';
  if (!url) return null;
  const lower = url.toLowerCase();

  // MP3 ID3
  if (/\.(mp3)(\?|#|$)/.test(lower)){
    const id3 = await fetchID3v2(url);
    if (id3 && (id3.title || id3.artist)) return id3;
  }
  // Vorbis/Opus/FLAC
  if (/\.(ogg|opus|oga|flac)(\?|#|$)/.test(lower)){
    const vorb = await fetchVorbis(url);
    if (vorb && (vorb.title || vorb.artist)) return vorb;
  }
  // YouTube/SoundCloud (oEmbed)
  if (isYouTube(url) || isSoundCloud(url)){
    const oem = await fetchOEmbed(url, proxy);
    if (oem && (oem.title || oem.artist)) return oem;
  }
  // Optional vendor fallback (only if you've included jsmediatags)
  const jmt = await readViaJsMediaTags(url, proxy);
  if (jmt && (jmt.title || jmt.artist)) return jmt;

  // Final fallback: filename or EXTINF
  return { title: track.title || titleFromFilename(url), artist: '', album: '' };
}

/* ===================== SOMAFM (channels.json) ===================== */

function isSomaUrl(u){
  try {
    const x = new URL(u, location.href);
    // ice servers like ice2.somafm.com / ice6.somafm.com, etc.
    return /(^|\.)somafm\.com$/i.test(x.hostname);
  } catch { return false; }
}

// Extract station id from ice path, e.g. "/secretagent-128-mp3" -> "secretagent"
function somaIdFromPath(pathname){
  // First path segment (strip leading "/"), before first "-" or "." or end
  const seg = String(pathname || '').replace(/^\/+/, '').split('/')[0] || '';
  const id  = seg.split(/[-.]/)[0] || '';
  return id.toLowerCase();
}

const SOMA_CACHE = { ts: 0, data: null };
const SOMA_TTL_MS = 25 * 1000; // short cache; these update frequently

async function fetchSomaChannels(proxy){
  const now = Date.now();
  if (SOMA_CACHE.data && (now - SOMA_CACHE.ts) < SOMA_TTL_MS) return SOMA_CACHE.data;
  try {
    const url = corsWrap(proxy, 'https://somafm.com/channels.json');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j?.channels) ? j.channels : [];
    SOMA_CACHE.data = arr; SOMA_CACHE.ts = now;
    return arr;
  } catch { return null; }
}

async function fetchSomaFromStreamUrl(streamUrl, proxy){
  try {
    const u = new URL(streamUrl, location.href);
    const id = somaIdFromPath(u.pathname); // e.g. "secretagent", "gsclassic", "u80s", "dubstep"
    if (!id) return null;

    const channels = await fetchSomaChannels(proxy);
    if (!channels || !channels.length) return null;

    // match by id
    const ch = channels.find(c => (c?.id || '').toLowerCase() === id);
    if (!ch) return null;

    const title = ch.title || '';
    const now = normalizeNow(ch.lastPlaying || '');
    // If lastPlaying missing, we still return the channel title; UI will show "—" until next tick
    return (title || now) ? { title, now } : null;
  } catch { return null; }
}

/* ===================== RADIO STATUS HELPERS (non-Soma) ===================== */

async function fetchFromStationStatus(streamUrl, proxy){
  try {
    const u = new URL(streamUrl, location.href);
    const base = `${u.protocol}//${u.host}`;

    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON
      corsWrap(proxy, `${base}/7.html`)              // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      const isJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
      const data = isJson ? await getJSON(url) : await getText(url);
      if (!data) continue;

      // Icecast JSON — pick the mount that actually matches the stream
      if (isJson && typeof data === 'object' && data.icestats) {
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
      if (isJson && (data?.servertitle || data?.songtitle)) {
        return { title: data.servertitle || '', now: normalizeNow(data.songtitle || '') };
      }

      // Radio.co JSON
      if (isJson && (data?.current_track || data?.name)) {
        const now = data.current_track?.title_with_artists || data.current_track?.title || '';
        return { title: data.name || '', now: normalizeNow(now) };
      }

      // Shoutcast v1 /7.html
      if (typeof data === 'string' && (url.endsWith('/7.html') || url.includes('/7.html?'))) {
        const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
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

// Prefer the source that matches host/port/path of the actual stream mount
function pickBestIcecastSource(sources, streamURL){
  if (!Array.isArray(sources) || !sources.length) return null;
  const sameHostPort = (a,b) => (a.host === b.host) && (a.port === b.port);
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
      lPort = u.port || (u.protocol==='https:'?'443':'80');
      lPath = pathTail(u.pathname);
    } catch {}

    if (listen && lPath && lPath === want.path && lHost && lPort && lHost === want.host && lPort === want.port) {
      return s; // exact mount match
    }
    if (!best) best = s;
  }
  return best || sources[0];
}

/* ===================== ICY (in-band) FALLBACK ===================== */
async function fetchICYOnce(streamUrl, proxy){
  try {
    const ctrl = new AbortController();
    const url = corsWrap(proxy, streamUrl);
    const r = await fetch(url, {
      method: 'GET',
      headers: { 'Icy-MetaData': '1' }, // ask server to send metadata
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!r.ok) return null;

    const metaint = parseInt(r.headers.get('icy-metaint') || r.headers.get('Ice-MetaInt') || '0', 10);
    if (!metaint || !r.body) return null;

    const reader = r.body.getReader();
    let audioSkip = metaint;

    // 1) Skip 'metaint' bytes of audio data…
    while (audioSkip > 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      const take = Math.min(audioSkip, value.length);
      audioSkip -= take;
    }

    // 2) Next 1 byte gives metadata length (in 16-byte blocks)
    const metaLenByte = await readExact(reader, 1);
    if (!metaLenByte) return null;
    const metaLen = metaLenByte[0] * 16;
    if (!metaLen) { ctrl.abort(); return null; }

    // 3) Read metadata block and parse StreamTitle='...';
    const metaBuf = await readExact(reader, metaLen);
    ctrl.abort();

    const text = new TextDecoder('latin1').decode(metaBuf);
    const m = text.match(/StreamTitle='([^']*)'/i);
    const raw = (m?.[1] || '').trim();
    if (!raw) return null;

    return { title: '', now: normalizeNow(raw) };
  } catch {
    return null;
  }
}

async function readExact(reader, n){
  const chunks = [];
  let need = n;
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

/* ===================== Generic helpers ===================== */
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}
async function getJSON(url){ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.json():null; }catch{ return null; } }
async function getText(url){ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.text():''; }catch{ return ''; } }

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
    return decodeURIComponent(p.replace(/\.[a-z0-9]+$/i,'').replace(/[_\-]+/g, ' ').trim());
  }catch{ return ''; }
}
function synchsafeToInt(a,b,c,d){ return (a<<21)|(b<<14)|(c<<7)|d; }
function decodeID3Text(buf, offset, length){
  const enc = new DataView(buf, offset, 1).getUint8(0);
  const bytes = new Uint8Array(buf, offset+1, length-1);
  if (enc === 0x00) return new TextDecoder('latin1').decode(bytes).replace(/\0+$/,'').trim();
  if (enc === 0x01 || enc === 0x02){
    try{ return new TextDecoder('utf-16').decode(bytes).replace(/\0+$/,'').trim(); }catch{ return ''; }
  }
  if (enc === 0x03) return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/,'').trim();
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
    const r = await fetch(corsWrap(proxy, api), { cache:'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j.title||'', artist: j.author_name||'', album:'' };
  }catch{}
  return null;
}
function haveJsMediaTags(){
  return typeof window !== 'undefined' && !!window.jsmediatags && !!window.jsmediatags.read;
}
async function readViaJsMediaTags(url, proxy){
  if (!haveJsMediaTags()) return null;

  const src = proxy
    ? (proxy.includes('?') ? proxy + encodeURIComponent(url)
                           : proxy.replace(/\/+$/,'') + '/' + url)
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
