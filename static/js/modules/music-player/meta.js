// Universal now-playing metadata helpers (Icecast/Shoutcast/Radio.co) + SomaFM
// For SomaFM we *only* use channels.json (no ICY probing).

import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* ----------------------------------------------------------------------------
 * SomaFM live metadata (channels.json)
 * ------------------------------------------------------------------------- */

const SOMA_URL   = 'https://somafm.com/channels.json';
const SOMA_TTLMS = 4_500; // re-fetch under 5s poll cadence
let _soma = { t: 0, rows: null };

function toInt(v){
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function liteRow(ch){
  return {
    id:          String(ch.id || ''),
    title:       String(ch.title || ''),
    listeners:   toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || '')
  };
}

async function fetchSomaChannels(proxy){
  const now = Date.now();
  if (_soma.rows && (now - _soma.t) < SOMA_TTLMS) return _soma.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(liteRow) : null;
  if (rows) { _soma = { t: now, rows }; return rows; }
  return _soma.rows || null; // stale-if-error
}

/** Canonicalize common SomaFM aliases to channels.json ids */
const SOMA_ALIASES = {
  // yours
  dubstepbeyond: 'dubstep',
  heavyweightreggae: 'reggae',
  metaldetector: 'metal',
  secretagent: 'secretagent',
  suburbsofgoa: 'suburbsofgoa',
  tikitime: 'tikitime',
  // a few extra common ones
  groovesaladclassic: 'gsclassic',
  illinoisstreetlounge: 'illstreet',
  illstreetlounge: 'illstreet',
  seveninchsoul: '7soul',
};

function canonicalizeSomaId(s){
  if (!s) return '';
  const raw = String(s).trim();
  const simple = raw.replace(/[^a-z0-9]/gi,'').toLowerCase();
  return SOMA_ALIASES[simple] || simple;
}

/** "/groovesalad-128-mp3" -> "groovesalad" */
function somaIdFromPath(pathname=''){
  const first = String(pathname || '').replace(/^\/+/, '').split(/[/?#]/)[0] || '';
  const id = first.replace(/[-_].*$/,''); // kill "-128-mp3" etc.
  return canonicalizeSomaId(id);
}

/** Best-effort find by id/aliases or fuzzy by title */
function findSomaRow(rows, idHint, nameHint){
  if (!rows?.length) return null;
  const id = canonicalizeSomaId(idHint);

  // 1) exact id
  let row = id ? rows.find(r => r.id.toLowerCase() === id) : null;
  if (row) return row;

  // 2) alias hit (id already canonicalized above) — skip

  // 3) try to derive from "SomaFM - Heavyweight Reggae" → "heavyweightreggae" → alias
  if (!row && nameHint){
    const name = String(nameHint).replace(/^SomaFM\s*-\s*/i,'').trim();
    const aliasTry = canonicalizeSomaId(name);
    row = rows.find(r => r.id.toLowerCase() === aliasTry);
    if (row) return row;

    // fuzzy title match
    const norm = s => String(s||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
    const nTarget = norm(name);
    row = rows.find(r => norm(r.title) === nTarget) || rows.find(r => norm(r.title).includes(nTarget));
    if (row) return row;
  }

  return null;
}

/** Public (optional): fetch a subset of Soma rows by ids */
export async function fetchSomaByIds(ids, proxy){
  if (!Array.isArray(ids) || !ids.length) return [];
  const rows = await fetchSomaChannels(proxy); if (!rows) return [];
  const want = new Set(ids.map(s => canonicalizeSomaId(s)));
  return rows.filter(r => want.has(canonicalizeSomaId(r.id)));
}

/* ----------------------------------------------------------------------------
 * Universal (probe by stream host) — used for non-Soma
 * ------------------------------------------------------------------------- */

function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

export async function fetchStreamMetaUniversal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);

    // Never probe SomaFM; avoid ICY "Donate…" titles entirely.
    if (/\.somafm\.com$/i.test(u.hostname)) return null;

    const base = `${u.protocol}//${u.host}`;
    const candidates = [
      corsWrap(proxy, `${base}/status-json.xsl`),    // Icecast JSON
      corsWrap(proxy, `${base}/status.xsl?json=1`),  // Alt Icecast JSON
      corsWrap(proxy, `${base}/stats?sid=1&json=1`), // Shoutcast v2 JSON
      corsWrap(proxy, guessRadioCoStatus(u)),        // Radio.co JSON (if match)
      corsWrap(proxy, `${base}/7.html`)              // Shoutcast v1 plaintext
    ].filter(Boolean);

    for (const url of candidates){
      const looksJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
      if (looksJson){
        const data = await fetchJSONViaProxy(url, proxy);
        if (!data) continue;

        // Icecast JSON
        if (typeof data === 'object' && data.icestats) {
          const src = data.icestats.source;
          const arr = Array.isArray(src) ? src : (src ? [src] : []);
          const hit = arr?.[0];
          if (hit) {
            const title = hit.server_name || hit.title || '';
            const now   = hit.artist && hit.title ? `${hit.artist} - ${hit.title}` : (hit.title || '');
            const norm  = normalizeNow(now);
            if (title || norm) return { title, now: norm };
          }
        }
        // Shoutcast v2 JSON
        if (data?.servertitle || data?.songtitle) {
          return { title: data.servertitle || '', now: normalizeNow(data.songtitle || '') };
        }
        // Radio.co JSON
        if (data?.current_track || data?.name) {
          const now = data.current_track?.title_with_artists || data.current_track?.title || '';
          return { title: data.name || '', now: normalizeNow(now) };
        }
      } else {
        // Shoutcast v1: /7.html
        const txt = await fetchTextViaProxy(url, proxy);
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

/* ----------------------------------------------------------------------------
 * Specific adapters (manifest-declared)
 * ------------------------------------------------------------------------- */

export async function metaRadioCo(meta, proxy){
  const url = meta?.status || (meta?.station_id ? `https://public.radio.co/stations/${meta.station_id}/status` : '');
  if (!url) return null;
  const j = await fetchJSONViaProxy(url, proxy);
  if (!j) return null;
  const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
  const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
  return { title: meta?.name || '', now: normalizeNow([a,t].filter(Boolean).join(' - ')) };
}

/**
 * SomaFM adapter backed by channels.json
 * station hint fields supported: { channelId } | { channel } | { id } | { name }
 * If no hint, tries to infer from streamUrl hostname/path.
 */
export async function metaSomaFM(meta, proxy, streamUrl){
  const rows = await fetchSomaChannels(proxy);
  if (!rows) return null;

  let id =
    (meta?.channelId || meta?.channel || meta?.id || '').toString();

  if (!id && streamUrl){
    try {
      const u = new URL(streamUrl, location.href);
      if (/\.somafm\.com$/i.test(u.hostname)) id = somaIdFromPath(u.pathname);
    } catch {}
  }

  const row = findSomaRow(rows, id, meta?.name);
  if (!row) return null;

  const now = normalizeNow(row.lastPlaying || '');
  return {
    title: row.title || `SomaFM • ${row.id}`,
    now: now || (row.lastPlaying || '').trim(),
    listeners: row.listeners,
    id: row.id
  };
}

export async function metaShoutcast(meta, proxy){
  if (!meta?.status) return null;
  const txt = await fetchTextViaProxy(meta.status, proxy);
  if (!txt) return null;
  const parts = txt.split(',').map(s=>s.trim());
  const cur = parts[parts.length-1] || '';
  return { title: 'Shoutcast', now: normalizeNow(cur) };
}

/* ----------------------------------------------------------------------------
 * Orchestrator
 * ------------------------------------------------------------------------- */
/**
 * Try SomaFM first (if detected), then stream-host probing, then declared kind.
 * @param {string} streamUrl - actual playing URL
 * @param {{kind?:'somafm'|'radioco'|'shoutcast', channelId?:string, channel?:string, id?:string, status?:string, station_id?:string, name?:string}} stationMeta
 * @param {string} proxy - "allorigins-raw" | "allorigins-json" | custom prefix | ''
 */
export async function fetchNowPlaying(streamUrl, stationMeta, proxy){
  // 1) If this is SomaFM by URL or explicit kind, use channels.json only
  try {
    const u = streamUrl ? new URL(streamUrl, location.href) : null;
    const isSomaByHost = !!u && /\.somafm\.com$/i.test(u.hostname);
    if (isSomaByHost || stationMeta?.kind === 'somafm') {
      const soma = await metaSomaFM(stationMeta, proxy, streamUrl);
      if (soma && (soma.now || soma.title)) return soma;
      // If we thought it was Soma but failed to map, do NOT fall back to ICY.
      return null;
    }
  } catch {}

  // 2) Generic host probing (non-Soma only)
  if (streamUrl){
    const uni = await fetchStreamMetaUniversal(streamUrl, proxy);
    if (uni && (uni.now || uni.title)) return uni;
  }

  // 3) Manifest-declared fallbacks
  if (stationMeta?.kind === 'radioco')   return await metaRadioCo(stationMeta, proxy);
  if (stationMeta?.kind === 'shoutcast') return await metaShoutcast(stationMeta, proxy);

  return null;
               }
