// /music/modules/metadata.js — front-end public metadata fetchers (AllOrigins-ready)
import { normalizeNow } from './utils.js';
import { corsWrap, fetchTextViaProxy, fetchJSONViaProxy } from './cors.js';

/* ======================= PUBLIC API ======================= */
export async function fetchStreamMeta(streamUrl, proxy){
  if (!streamUrl) return null;

  // 0) SomaFM: try their official JSON first (and filter promos)
  const soma = await somaFmFromStream(streamUrl, proxy);
  if (soma) return soma;

  // 1) Vendor status endpoints (Icecast / Shoutcast / Radio.co)
  const fromStatus = await fetchFromStationStatus(streamUrl, proxy);
  if (fromStatus && (fromStatus.now || fromStatus.title)) return fromStatus;

  // 2) ICY in-band metadata (last resort)
  const fromIcy = await fetchICYOnce(streamUrl, proxy);
  if (fromIcy && (fromIcy.now || fromIcy.title)) return fromIcy;

  return null;
}

export async function fetchTrackMeta(track, proxy){
  if (!track?.url) return null;
  const base = track.url.replace(/\.[a-z0-9]+$/i, '');

  // 1. Explicit sidecar json
  try {
    const meta = await fetchJSONViaProxy(base + '.json', proxy);
    if (meta?.title || meta?.artist) return meta;
  } catch {}

  // 2. Heuristic endpoints
  for (const p of [track.url + '?meta=1', base + '/meta.json']){
    try {
      const meta = await fetchJSONViaProxy(p, proxy);
      if (meta?.title || meta?.artist) return meta;
    } catch {}
  }

  // 3. Filename fallback
  try {
    const name = decodeURIComponent(track.url.split('/').pop() || '');
    const clean = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_+]/g, ' ');
    const parts = clean.split(' - ');
    if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') };
    return { title: clean };
  } catch {}

  return null;
}

/* ==================== SOMAFM SPECIAL CASE ==================== */

async function somaFmFromStream(streamUrl, proxy){
  const u = safeURL(streamUrl);
  if (!u) return null;

  // Heuristic: many mounts look like ".../dubstepbeyond256.aac" or "/secretagent-128-mp3"
  // Extract channel candidate from last path segment.
  const last = (u.pathname.split('/').pop() || '').toLowerCase();

  // strip extension
  const noExt = last.replace(/\.(mp3|aac|ogg|opus|m3u8|pls|aacp)$/i, '');
  // remove obvious bitrate / codec tokens
  let channel = noExt
    .replace(/(-|_)?(32|64|96|128|160|192|256|320)(k|kbps|aac|mp3|ogg|aacp)?$/i, '')
    .replace(/(-|_)?(mp3|aac|ogg|aacp)$/i, '')
    .replace(/[-_]+$/,'')
    .trim();

  // Some mounts are "channel-bitrate-format": keep the left-most token if it still looks valid
  if (channel.includes('-')) channel = channel.split('-')[0];
  if (!channel) return null;

  // Query SomaFM songs JSON
  const api = `https://somafm.com/songs/${encodeURIComponent(channel)}.json`;
  const arr = await fetchJSONViaProxy(api, proxy);
  if (!Array.isArray(arr) || !arr.length) return null;

  // Find first non-promo, real track row
  const row = arr.find(isRealSomaRow) || null;
  if (!row) return null;

  const now = normalizeNow(joinArtistTitle(row.artist, row.title));
  if (!now) return null;

  return { title: `SomaFM • ${channel}`, now };
}

function isRealSomaRow(r){
  const a = (r?.artist || '').trim();
  const t = (r?.title || '').trim();
  const s = `${a} ${t}`.toLowerCase();

  // Filter obvious promos / bumps
  // e.g., "Donate to SomaFM.com and keep commercial-free radio on the air"
  if (/donate\s+to\s+somafm/i.test(s)) return false;
  if (/commercial[- ]?free/i.test(s)) return false;
  if (/support\s+somafm/i.test(s)) return false;
  if (/somafm\s+(dot\s+com|com)/i.test(s)) return false;
  if (/thank(s)?\s+for\s+listening/i.test(s)) return false;

  // Skip rows without actual artist/title
  if (!a || !t) return false;

  // Skip rows where artist is the station itself
  if (/somafm/i.test(a)) return false;

  return true;
}

function joinArtistTitle(artist, title){
  const a = (artist || '').trim();
  const t = (title  || '').trim();
  if (a && t) return `${a} - ${t}`;
  return a || t || '';
}

/* ===================== RADIO STATUS HELPERS ===================== */

async function fetchFromStationStatus(streamUrl, proxy){
  try {
    const u = safeURL(streamUrl);
    if (!u) return null;
    const base = `${u.protocol}//${u.host}`;

    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON
      corsWrap(proxy, `${base}/7.html`)              // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      const isJson = /(\.xsl$|json=1|public\.radio\.co)/.test(String(url));
      const data = isJson ? await getJSON(url) : await getText(url);
      if (!data) continue;

      // Icecast JSON
      if (isJson && typeof data === 'object' && data.icestats) {
        const src = data.icestats.source;
        const arr = Array.isArray(src) ? src : (src ? [src] : []);
        const hit = arr?.[0];
        if (hit) {
          const title = hit.server_name || hit.title || '';
          const now   = hit.artist && hit.title ? `${hit.artist} - ${hit.title}`
                      : (hit.title || '');
          const norm  = normalizeNow(now);
          if (title || norm) return { title, now: norm };
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
      if (typeof data === 'string' && (String(url).endsWith('/7.html') || String(url).includes('/7.html?'))) {
        const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
        if (m) {
          const parts = String(m[1] || m[2] || '').split(',');
          const song = parts.pop()?.trim();
          if (song) {
            const norm = normalizeNow(song);
            // Avoid promo-like lines
            if (!/donate\s+to\s+somafm/i.test(norm)) {
              return { title: '', now: norm };
            }
          }
        }
      }
    }
  } catch {}
  return null;
}

/* ===================== ICY (in-band) FALLBACK ===================== */
async function fetchICYOnce(streamUrl, proxy){
  // We DO NOT touch the <audio>. We open a separate proxied request and stop
  // as soon as we read one ICY metadata block.
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

    // Skip 'metaint' bytes of audio
    while (audioSkip > 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      const take = Math.min(audioSkip, value.length);
      audioSkip -= take;
    }

    // 1 byte length (in 16-byte blocks)
    const metaLenByte = await readExact(reader, 1);
    if (!metaLenByte) return null;
    const metaLen = metaLenByte[0] * 16;
    if (!metaLen) { ctrl.abort(); return null; }

    // Read metadata block
    const metaBuf = await readExact(reader, metaLen);
    ctrl.abort();

    const text = new TextDecoder('latin1').decode(metaBuf);
    const m = text.match(/StreamTitle='([^']*)'/i);
    const raw = (m?.[1] || '').trim();
    if (!raw) return null;

    const norm = normalizeNow(raw);
    // Avoid SomaFM promo lines if they leak through
    if (/donate\s+to\s+somafm/i.test(norm)) return null;

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
function safeURL(u){
  try { return new URL(u, location.href); } catch { return null; }
}
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}
async function getJSON(url){ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.json():null; }catch{ return null; } }
async function getText(url){ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.text():''; }catch{ return ''; } }
