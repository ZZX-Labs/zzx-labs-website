// /music/modules/metadata.js
import { corsWrap, normalizeNow } from './utils.js';
import { fetchTextViaProxy, fetchJSONViaProxy } from './cors.js';

/* ===================== PUBLIC API ===================== */
export async function fetchStreamMeta(streamUrl, proxy){
  // 0) Special-case SomaFM (most reliable): detect mount -> use channel JSON
  const sfm = await maybeFetchSomaFMFromMount(streamUrl, proxy);
  if (sfm && (sfm.now || sfm.title)) return sfm;

  // 1) Try station status endpoints (Icecast/Shoutcast/Radio.co)
  const fromStatus = await fetchFromStationStatus(streamUrl, proxy);
  if (fromStatus && (fromStatus.now || fromStatus.title)) return fromStatus;

  // 2) Fallback: ICY in-band
  const fromIcy = await fetchICYOnce(streamUrl, proxy);
  if (fromIcy && (fromIcy.now || fromIcy.title)) return fromIcy;

  return null;
}

export async function fetchTrackMeta(track, proxy){
  const url = track?.url || '';
  if (!url) return null;
  const lower = url.toLowerCase();

  if (/\.(mp3)(\?|#|$)/.test(lower)){
    const id3 = await fetchID3v2(url);
    if (id3 && (id3.title || id3.artist)) return id3;
  }
  if (/\.(ogg|opus|oga|flac)(\?|#|$)/.test(lower)){
    const vorb = await fetchVorbis(url);
    if (vorb && (vorb.title || vorb.artist)) return vorb;
  }
  if (isYouTube(url) || isSoundCloud(url)){
    const oem = await fetchOEmbed(url, proxy);
    if (oem && (oem.title || oem.artist)) return oem;
  }
  const jmt = await readViaJsMediaTags(url, proxy);
  if (jmt && (jmt.title || jmt.artist)) return jmt;

  return { title: track.title || titleFromFilename(url), artist: '', album: '' };
}

/* ===================== DONATION/JUNK FILTER ===================== */

const JUNK_PATTERNS = [
  /donate to somafm/i,
  /keep commercial[- ]?free radio on the air/i,
  /visit somafm\.com/i,
  /support somafm/i,
  /station id/i,
  /now playing:?$/i
];
function isJunkNow(s){
  if (!s) return false;
  const t = String(s).trim();
  if (!t) return false;
  return JUNK_PATTERNS.some(rx => rx.test(t));
}

/* ===================== SOMAFM FAST-PATH ===================== */

function isSomaHost(host){ return /(^|\.)somafm\.com$/i.test(host) || /(^|\.)(ice|icecast)\d*\.somafm\.com$/i.test(host); }
function guessSomaChannelFromMount(pathname){
  // e.g. "/dubstepbeyond-128-mp3", "/secretagent-256-mp3"
  const base = (pathname || '').split('/').pop() || '';
  const m = base.match(/^([a-z0-9]+?)(?:-[0-9]+-(?:aac|mp3|ogg|opus))?$/i);
  return m ? m[1].toLowerCase() : '';
}

async function maybeFetchSomaFMFromMount(streamUrl, proxy){
  try {
    const u = new URL(streamUrl, location.href);
    if (!isSomaHost(u.hostname)) return null;
    const channel = guessSomaChannelFromMount(u.pathname);
    if (!channel) return null;

    // Official songs JSON (latest-first array)
    const api = `https://somafm.com/songs/${encodeURIComponent(channel)}.json`;
    const j = await fetchJSONViaProxy(api, proxy);
    const arr = Array.isArray(j) ? j : null;
    if (!arr || !arr.length) return null;

    // pick the first NON-junk item: { artist, title } OR { title: "Artist - Title" }
    for (const it of arr){
      const a = (it.artist || '').trim();
      const t = (it.title  || '').trim();
      const joined = [a, t].filter(Boolean).join(' - ') || (it.song || it.text || '');
      const norm = normalizeNow(joined);
      if (!isJunkNow(norm) && norm) {
        return { title: `SomaFM • ${channel}`, now: norm };
      }
    }
  } catch {}
  return null;
}

/* ===================== RADIO STATUS HELPERS ===================== */

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
      const data = isJson ? await getJSON(url, proxy) : await getText(url, proxy);
      if (!data) continue;

      // Icecast JSON
      if (isJson && typeof data === 'object' && data.icestats) {
        const src = data.icestats.source;
        const arr = Array.isArray(src) ? src : (src ? [src] : []);
        const hit = pickBestIcecastSource(arr, u);
        if (hit) {
          // Compose now-playing
          const nowRaw = (hit.artist && hit.title) ? `${hit.artist} - ${hit.title}` : (hit.title || '');
          const now = normalizeNow(nowRaw);
          const title = hit.server_name || hit.server_description || '';
          if (now && !isJunkNow(now)) return { title, now };

          // SomaFM often puts the banner as the most recent; try their JSON as a rescue
          const sfm = await maybeFetchSomaFMFromMount(streamUrl, proxy);
          if (sfm && (sfm.now || sfm.title)) return sfm;

          // if only title present and not junk, return at least that
          if (title && !isJunkNow(title)) return { title, now: '' };
          continue;
        }
      }

      // Shoutcast v2 JSON
      if (isJson && (data?.servertitle || data?.songtitle)) {
        const now = normalizeNow(data.songtitle || '');
        const title = data.servertitle || '';
        if (now && !isJunkNow(now)) return { title, now };
        if (title && !isJunkNow(title)) return { title, now: '' };
        continue;
      }

      // Radio.co JSON
      if (isJson && (data?.current_track || data?.name)) {
        const nowRaw = data.current_track?.title_with_artists || data.current_track?.title || '';
        const now = normalizeNow(nowRaw);
        const title = data.name || '';
        if (now && !isJunkNow(now)) return { title, now };
        if (title && !isJunkNow(title)) return { title, now: '' };
        continue;
      }

      // Shoutcast v1 /7.html
      if (typeof data === 'string' && (url.endsWith('/7.html') || url.includes('/7.html?'))) {
        const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
        if (m) {
          const parts = String(m[1] || m[2] || '').split(',');
          const song = (parts.pop() || '').trim();
          const now = normalizeNow(song);
          if (now && !isJunkNow(now)) return { title: '', now };
        }
      }
    }
  } catch {}
  return null;
}

// Prefer the source that matches host/port/path of the actual stream mount
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
    const listen = s.listenurl || s.server_url || '';
    let lHost='', lPort='', lPath='';
    try {
      const u = new URL(listen, streamURL);
      lHost = u.hostname; lPort = u.port || (u.protocol==='https:'?'443':'80'); lPath = pathTail(u.pathname);
    } catch {}
    if (listen && lPath && lPath === want.path && lHost === want.host && lPort === want.port) return s;
    if (!best && (s.title || s.server_name || s.listenurl)) best = s;
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
      headers: { 'Icy-MetaData': '1' },
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!r.ok) return null;

    const metaint = parseInt(r.headers.get('icy-metaint') || r.headers.get('Ice-MetaInt') || '0', 10);
    if (!metaint || !r.body) return null;

    const reader = r.body.getReader();

    // 1) skip metaint bytes
    let toSkip = metaint;
    while (toSkip > 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      toSkip -= Math.min(toSkip, value.length);
    }

    // 2) metadata length in 16-byte blocks
    const metaLenByte = await readExact(reader, 1);
    if (!metaLenByte) return null;
    const metaLen = metaLenByte[0] * 16;
    if (!metaLen) { ctrl.abort(); return null; }

    // 3) read and parse StreamTitle
    const metaBuf = await readExact(reader, metaLen);
    ctrl.abort();

    const text = new TextDecoder('latin1').decode(metaBuf);
    const m = text.match(/StreamTitle='([^']*)'/i);
    const raw = (m?.[1] || '').trim();
    const norm = normalizeNow(raw);
    if (!norm || isJunkNow(norm)) return null;   // ignore banner/junk
    return { title: '', now: norm };
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

// Use AllOrigins-aware fetchers (to honor your proxy choice)
async function getJSON(url, proxy){ return await fetchJSONViaProxy(url, proxy); }
async function getText(url, proxy){ return await fetchTextViaProxy(url, proxy); }

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
