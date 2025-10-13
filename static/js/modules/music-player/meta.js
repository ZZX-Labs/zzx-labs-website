// static/js/modules/music-player/meta.js
// SomaFM-only now-playing. NO ICY/SHOUTCAST. Returns { id, title, listeners, now }.

import { normalizeNow } from './utils.js';
import { fetchJSONViaProxy } from './cors.js';

const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // ms
let somaCache = { t: 0, rows: null };

const toInt = (v)=> {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

function mapRow(ch){
  return {
    id: String(ch.id || '').toLowerCase(),
    title: String(ch.title || ''),
    listeners: toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || ''),
  };
}

async function getSomaRows(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(mapRow) : [];
  if (rows.length) somaCache = { t: now, rows };
  return rows;
}

/** derive soma id from stream url like /tikitime256.pls, /groovesalad-256-mp3, /secretagent */
function idFromUrl(u){
  try{
    const p = new URL(u, location.href).pathname.replace(/^\/+/, '').split('/')[0] || '';
    let id = p
      .replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '')
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, '');
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  }catch{return '';}
}

/** light slug for title fallback */
function slugTitle(s=''){
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
}

/**
 * fetchNowPlaying(streamUrl, stationMeta?, proxy?)
 * - Tries id (from URL or stationMeta.id) then title (stationMeta.name)
 * - Returns { id, title, listeners, now } or null
 */
export async function fetchNowPlaying(streamUrl, stationMeta = {}, proxy){
  const rows = await getSomaRows(proxy);

  // 1) match by id
  const hintId = String(
    stationMeta.id || stationMeta.channel || stationMeta.channelId || idFromUrl(streamUrl) || ''
  ).toLowerCase();
  let row = hintId ? rows.find(r => r.id === hintId) : null;

  // 2) fallback: match by title
  if (!row && stationMeta.name){
    const want = slugTitle(stationMeta.name);
    row = rows.find(r => slugTitle(r.title) === want) || null;
  }

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    listeners: row.listeners,
    now: normalizeNow(row.lastPlaying || '')
  };
}
