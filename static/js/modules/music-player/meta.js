// static/js/modules/music-player/meta.js
// SomaFM-only now-playing via channels.json (no ICY probing)

import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // cache ~5s
let somaCache = { t: 0, rows: null };

const toInt = v => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

function mapRow(ch){
  return {
    id: (ch.id || '').toLowerCase(),
    title: ch.title || '',
    listeners: toInt(ch.listeners),
    lastPlaying: ch.lastPlaying || ''
  };
}

async function getSoma(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(mapRow) : null;
  if (rows) somaCache = { t: now, rows };
  return rows || [];
}

/** Extract channel id from stream or playlist URL. */
function somaIdFromUrl(u){
  try{
    const p = new URL(u, location.href).pathname.replace(/^\/+/, '');
    let id = (p.split('/')[0] || '');
    id = id
      .replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '')
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|aac|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, '');
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  }catch{ return ''; }
}

/** Turn a friendly name into a Soma id-ish slug (e.g. "SomaFM - Tiki Time" -> "tikitime"). */
function slug(name=''){
  return String(name).toLowerCase()
    .replace(/soma\s*fm|somafm/g,' ')
    .replace(/[^a-z0-9]+/g,'')
    .trim();
}

/**
 * fetchNowPlaying(streamUrl, stationMeta, proxy)
 * stationMeta can include { name, id, channel, channelId }
 * Returns { title, now, listeners } or null.
 */
export async function fetchNowPlaying(streamUrl, stationMeta={}, proxy){
  // Only use channels.json; never ICY.
  const rows = await getSoma(proxy);
  if (!rows.length) return null;

  const hints = new Set();
  const fromUrl = somaIdFromUrl(streamUrl); if (fromUrl) hints.add(fromUrl);
  const metaId  = (stationMeta.id || stationMeta.channel || stationMeta.channelId || '').toLowerCase();
  if (metaId) hints.add(metaId);
  const byName  = slug(stationMeta.name || '');
  if (byName) hints.add(byName);

  // Try exact id match first, then name-slug match
  let row = null;
  for (const h of hints){
    row = rows.find(r => r.id === h) || row;
  }
  if (!row && byName) {
    // Looser: some names map cleanly (e.g., "Tiki Time" -> "tikitime")
    row = rows.find(r => r.id === byName) || null;
  }

  if (!row) return null;

  return {
    title: row.title || `SomaFM • ${row.id}`,
    now: normalizeNow(row.lastPlaying || ''),
    listeners: row.listyeners
  };
}
