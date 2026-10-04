// static/js/modules/music-player/meta.js
// SomaFM-only now-playing via channels.json (no ICY probing).

import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

const SOMA_URL    = 'https://somafm.com/channels.json';
const SOMA_TTL_MS = 5000;

let _soma = { t: 0, rows: null };

const toInt = (v)=> {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

function somaIdFromUrl(u){
  try{
    const p = new URL(u, location.href).pathname.replace(/^\/+/, '');
    let id = (p.split('/')[0] || '')
      .replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '')
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, '');
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  }catch{ return ''; }
}

async function getSomaRows(proxy){
  const now = Date.now();
  if (_soma.rows && (now - _soma.t) < SOMA_TTL_MS) return _soma.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(ch=>({
    id: String(ch.id || '').toLowerCase(),
    title: String(ch.title || ''),
    listeners: toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || '')
  })) : null;
  if (rows) _soma = { t: now, rows };
  return _soma.rows || null; // stale-if-error
}

/**
 * Fetch { title, now, listeners } for a SomaFM stream.
 * Only uses channels.json. If we can't match a channel, returns null.
 */
export async function fetchNowPlaying(streamUrl, stationMeta={}, proxy){
  const idHints = [
    String(stationMeta.id || stationMeta.channel || stationMeta.channelId || '').toLowerCase(),
    somaIdFromUrl(streamUrl),
  ].filter(Boolean);

  const rows = await getSomaRows(proxy);
  if (!rows) return null;

  let hit = null;
  for (const h of idHints){
    hit = rows.find(r => r.id === h);
    if (hit) break;
  }

  // If still no hit and stationMeta.name looks like "SomaFM - Tiki Time"
  if (!hit && stationMeta.name){
    const slug = String(stationMeta.name).toLowerCase().replace(/[^a-z0-9]+/g,'');
    hit = rows.find(r => (r.id || '').toLowerCase() === slug);
  }

  if (!hit) return null;

  return {
    title: hit.title || `SomaFM • ${hit.id}`,
    now: normalizeNow(hit.lastPlaying || ''),
    listeners: hit.listeners
  };
}
