// static/js/modules/music-player/meta.js
// Clean now-playing: SomaFM via channels.json only. Optional Radio.co by explicit meta.
// Absolutely NO ICY/Shoutcast/Icecast polling.

import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

/* -------------------------------- SomaFM -------------------------------- */

const SOMA_URL    = 'https://somafm.com/channels.json';
const SOMA_TTL_MS = 5000; // cache ~ ticker cadence
let _soma = { t: 0, rows: null };

const scrubDonate = s => /donate\s+to\s+somafm/i.test(String(s||'')) ? '' : String(s||'');
const toInt = v => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

function somaLite(ch){
  return {
    id: String(ch.id || '').toLowerCase(),
    title: String(ch.title || ''),
    listeners: toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || ''),
  };
}

async function fetchSomaChannels(proxy){
  const now = Date.now();
  if (_soma.rows && (now - _soma.t) < SOMA_TTL_MS) return _soma.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(somaLite) : null;
  if (rows) _soma = { t: now, rows };
  return _soma.rows || null; // stale-if-error
}

function somaIdFromUrl(urlString){
  try {
    const u = new URL(urlString, location.href);
    let id = String(u.pathname || '').replace(/^\/+/, '').split('/')[0] || '';
    id = id
      .replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '')
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, '');
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  } catch { return ''; }
}

function slugToSomaId(name=''){
  return String(name).toLowerCase()
    .replace(/soma\s*fm|somafm|[-–—]\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

async function fetchSomaMeta({ streamUrl, hintId, hintName }, proxy){
  const rows = await fetchSomaChannels(proxy);
  if (!rows || !rows.length) return null;

  const candidates = [];
  if (hintId) candidates.push(String(hintId).toLowerCase());
  if (hintName) candidates.push(slugToSomaId(hintName));
  const fromUrl = somaIdFromUrl(streamUrl);
  if (fromUrl) candidates.push(fromUrl);

  const tried = new Set();
  for (const c of candidates){
    const id = (c || '').toLowerCase();
    if (!id || tried.has(id)) continue;
    tried.add(id);
    const row = rows.find(r => r.id === id);
    if (row) {
      return {
        title: row.title || `SomaFM • ${id}`,
        now: normalizeNow(scrubDonate(row.lastPlaying || '')),
        listeners: row.listeners
      };
    }
  }
  return null;
}

/* ----------------------------- Radio.co (optional) ----------------------------- */

async function metaRadioCo(meta, proxy){
  const url = meta?.status || (meta?.station_id ? `https://public.radio.co/stations/${meta.station_id}/status` : '');
  if (!url) return null;
  const j = await fetchJSONViaProxy(url, proxy);
  if (!j) return null;
  const title = meta?.name || j?.name || '';
  const now = j?.current_track?.title_with_artists || j?.current_track?.title || j?.now_playing?.title || '';
  return { title, now: normalizeNow(now) };
}

/* -------------------------------- Orchestrator -------------------------------- */
/**
 * Returns { title, now, listeners? } or null.
 * - If SomaFM (by host or declared), uses channels.json only.
 * - If kind === 'radioco', uses Radio.co JSON status only.
 * - NO ICY probing at all.
 */
export async function fetchNowPlaying(streamUrl, stationMeta = {}, proxy){
  // SomaFM?
  try {
    const host = streamUrl ? new URL(streamUrl, location.href).hostname : '';
    const somaDeclared = stationMeta?.kind === 'somafm' || /somafm/i.test(stationMeta?.name || '');
    if (host.match(/\.somafm\.com$/i) || somaDeclared) {
      const soma = await fetchSomaMeta({
        streamUrl,
        hintId: (stationMeta?.id || stationMeta?.channel || stationMeta?.channelId || '').toLowerCase(),
        hintName: stationMeta?.name || ''
      }, proxy);
      // If SomaFM, we NEVER fall back to ICY. Return null if not found.
      return soma || null;
    }
  } catch {}

  // Radio.co (explicit only)
  if (stationMeta?.kind === 'radioco' || stationMeta?.station_id || stationMeta?.status) {
    const rc = await metaRadioCo(stationMeta, proxy);
    if (rc && (rc.now || rc.title)) return rc;
  }

  // Everything else: no probing (to comply with "None should poll ICY")
  return null;
}
