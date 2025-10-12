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
  if (isRealNow(fromStatus)) return fromStatus;

  // 2) ICY in-band metadata (last resort)
  const fromIcy = await fetchICYOnce(streamUrl, proxy);
  if (isRealNow(fromIcy)) return fromIcy;

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

  // Heuristic channel from mount: ".../secretagent-128-mp3" -> "secretagent"
  const last = (u.pathname.split('/').pop() || '').toLowerCase();
  const noExt = last.replace(/\.(mp3|aac|ogg|opus|m3u8|pls|aacp)$/i, '');
  let channel = noExt
    .replace(/(-|_)?(32|64|96|128|160|192|256|320)(k|kbps|aac|mp3|ogg|aacp)?$/i, '')
    .replace(/(-|_)?(mp3|aac|ogg|aacp)$/i, '')
    .replace(/[-_]+$/,'')
    .trim();
  if (channel.includes('-')) channel = channel.split('-')[0];
  if (!channel) return null;

  const api = `https://somafm.com/songs/${encodeURIComponent(channel)}.json`;
  const arr = await fetchJSONViaProxy(api, proxy);
  if (!Array.isArray(arr) || !arr.length) return null;

  // Pick first *real* row (not promos/bumps)
  const row = arr.find(r => isSomaRealRow(r)) || null;
  if (!row) return null;

  const now = normalizeNow(joinArtistTitle(row.artist, row.title));
  if (!now) return null;

  return { title: `SomaFM • ${channel}`, now };
}

function isSomaRealRow(r){
  const artist = (r?.artist || '').trim();
  const title  = (r?.title  || '').trim();
  const s = `${artist} ${title}`.toLowerCase();

  if (!artist || !title) return false;

  // Filter obvious promo/bump lines seen on SomaFM feeds
  if (s.includes('donate to somafm')) return false;
  if (s.includes('keep commercial-free') || s.includes('commercial free')) return false;
  if (s.includes('support somafm')) return false;
  if (s.includes('thanks for listening')) return false;
  if (s.includes('somafm.com')) return false;
  if (/station id|station id:|liner|promo/.test(s)) return false;

  // Sometimes artist is "SomaFM" or "Soma FM" on bumps
  if (/^soma\s?fm$/i.test(artist)) return false;

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
    const isSoma = /(^|\.)somafm\.com$/i.test(u.hostname);

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
          let now   = hit.artist && hit.title ? `${hit.artist} - ${hit.title}`
                     : (hit.title || '');
          now = normalizeNow(now);
          if (isSoma && isSomaPromo(now)) continue; // skip promo rows
          if (title || now) return { title, now };
        }
      }

      // Shoutcast v2 JSON
      if (isJson && (data?.servertitle || data?.songtitle)) {
        const now = normalizeNow(data.songtitle || '');
        if (isSoma && isSomaPromo(now)) continue;
        return { title: data.servertitle || '', now };
      }

      // Radio.co JSON
      if (isJson && (data?.current_track || data?.name)) {
        const now = normalizeNow(data.current_track?.title_with_artists || data.current_track?.title || '');
        if (isSoma && isSomaPromo(now)) continue;
        return { title: data.name || '', now };
      }

      // Shoutcast v1 /7.html
      if (typeof data === 'string' && (String(url).endsWith('/7.html') || String(url).includes('/7.html?'))) {
        const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
        if (m) {
          const parts = String(m[1] || m[2] || '').split(',');
          const song = normalizeNow(parts.pop()?.trim() || '');
          if (song) {
            if (isSoma && isSomaPromo(song)) continue;
            return { title: '', now: song };
          }
        }
      }
    }
  } catch {}
  return null;
}

/* ===================== ICY (in-band) FALLBACK ===================== */
async function fetchICYOnce(streamUrl, proxy){
  try {
    const u = safeURL(streamUrl);
    const isSoma = !!u && /(^|\.)somafm\.com$/i.test(u.hostname);

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

    // skip audio
    let remain = metaint;
    while (remain > 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      remain -= Math.min(remain, value.length);
    }

    // read metadata size
    const metaLenByte = await readExact(reader, 1);
    if (!metaLenByte) return null;
    const metaLen = metaLenByte[0] * 16;
    if (!metaLen) { ctrl.abort(); return null; }

    // read metadata block
    const metaBuf = await readExact(reader, metaLen);
    ctrl.abort();

    const text = new TextDecoder('latin1').decode(metaBuf);
    const m = text.match(/StreamTitle='([^']*)'/i);
    const raw = (m?.[1] || '').trim();
    if (!raw) return null;

    const norm = normalizeNow(raw);
    if (isSoma && isSomaPromo(norm)) return null;

    return { title: '', now: norm };
  } catch {
    return null;
  }
}

/* ===================== helpers ===================== */
function isRealNow(obj){
  if (!obj) return false;
  const s = (obj.now || obj.title || '').trim();
  if (!s) return false;
  if (isSomaPromo(s)) return false;
  return true;
}

function isSomaPromo(s){
  const t = (s || '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('donate to somafm') ||
    t.includes('keep commercial-free') ||
    t.includes('commercial free') ||
    t.includes('support somafm') ||
    t.includes('somafm.com') ||
    t.includes('thanks for listening') ||
    /station id|liner|promo/.test(t)
  );
}

function safeURL(u){
  try { return new URL(u, location.href); } catch { return null; }
}
function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}
async function getJSON(url){ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.json():null; }catch{ return null; } }
async function getText(url){ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.text():''; }catch{ return ''; } }
