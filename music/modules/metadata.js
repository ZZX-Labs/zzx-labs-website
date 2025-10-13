// /music/modules/metadata.js
// Clean now-playing: SomaFM via channels.json only. Optional Radio.co by explicit meta.
// NO ICY/Icecast/Shoutcast polling.

import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

/* -------------------------------- SomaFM -------------------------------- */

const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000;
let somaCache = { t: 0, rows: null };

const scrubDonate = s => /donate\s+to\s+somafm/i.test(String(s||'')) ? '' : String(s||'');
const toInt = v => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

function mapSomaRow(ch){
  return {
    id: (ch.id || '').toLowerCase(),
    title: ch.title || '',
    listeners: toInt(ch.listeners),
    lastPlaying: ch.lastPlaying || ''
  };
}

async function getSomaChannels(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(mapSomaRow) : null;
  if (rows) somaCache = { t: now, rows };
  return somaCache.rows || null;
}

function somaIdFromUrl(u){
  try{
    const p = new URL(u, location.href).pathname.replace(/^\/+/, '');
    let id = (p.split('/')[0] || '');
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

async function fetchSomaMeta(streamUrl, proxy, hints={}){
  const rows = await getSomaChannels(proxy);
  if (!rows || !rows.length) return null;

  const candidates = [];
  if (hints.id) candidates.push(String(hints.id).toLowerCase());
  if (hints.name) candidates.push(slugToSomaId(hints.name));
  const fromUrl = somaIdFromUrl(streamUrl);
  if (fromUrl) candidates.push(fromUrl);

  const seen = new Set();
  for (const c of candidates){
    const id = (c || '').toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const r = rows.find(x => x.id === id);
    if (r) {
      return {
        title: r.title || `SomaFM • ${id}`,
        now: normalizeNow(scrubDonate(r.lastPlaying || '')),
        listeners: r.listeners
      };
    }
  }
  return null;
}

/* ----------------------------- Radio.co (optional) ----------------------------- */

export async function fetchStreamMeta(url, proxy, stationMeta = {}){
  // SomaFM first (by host or declared)
  try{
    const host = url ? new URL(url, location.href).hostname : '';
    const somaDeclared = stationMeta?.kind === 'somafm' || /somafm/i.test(stationMeta?.name || '');
    if (host.match(/\.somafm\.com$/i) || somaDeclared){
      const s = await fetchSomaMeta(url, proxy, {
        id: (stationMeta?.id || stationMeta?.channel || stationMeta?.channelId || '').toLowerCase(),
        name: stationMeta?.name || ''
      });
      return s || null; // NEVER fall back to ICY
    }
  } catch {}

  // If explicitly Radio.co, allow JSON status (not ICY)
  if (stationMeta?.kind === 'radioco' || stationMeta?.station_id || stationMeta?.status) {
    const statusUrl = stationMeta?.status || (stationMeta?.station_id ? `https://public.radio.co/stations/${stationMeta.station_id}/status` : '');
    if (statusUrl) {
      const j = await fetchJSONViaProxy(statusUrl, proxy);
      if (j) {
        const title = stationMeta?.name || j?.name || '';
        const now = j?.current_track?.title_with_artists || j?.current_track?.title || j?.now_playing?.title || '';
        return { title, now: normalizeNow(now) };
      }
    }
  }

  // Otherwise, no probing at all (complies with "None should poll icy")
  return null;
}

// Lightweight file-based track meta (unchanged)
export async function fetchTrackMeta(tr){
  const src = tr?.title || tr?.url || '';
  const parts = String(src).split(/ - (.+)/);
  const artist = parts.length >= 3 ? parts[0].trim() : '';
  const title  = parts.length >= 3 ? parts[1].trim() : String(src).trim();
  const now    = normalizeNow([artist, title].filter(Boolean).join(' - '));
  return now ? { artist, title: title || now } : null;
}
