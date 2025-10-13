// /music/modules/metadata.js
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

function slugTitle(s=''){
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
}

/**
 * fetchStreamMeta(url, proxy, stationMeta?)
 * - SomaFM only
 * - Returns { id, title, listeners, now } or null
 */
export async function fetchStreamMeta(url, proxy, stationMeta = {}){
  const rows = await getSomaRows(proxy);

  // by id first
  const hintId = String(
    stationMeta.id || stationMeta.channel || stationMeta.channelId || idFromUrl(url) || ''
  ).toLowerCase();
  let row = hintId ? rows.find(r => r.id === hintId) : null;

  // by title fallback
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

/** Optional: file tracks (unchanged) */
export async function fetchTrackMeta(tr){
  const src = tr?.title || tr?.url || '';
  const m = String(src).split(/ - (.+)/);
  const artist = m.length >= 3 ? m[0].trim() : '';
  const title  = m.length >= 3 ? m[1].trim() : String(src).trim();
  const now    = normalizeNow([artist, title].filter(Boolean).join(' - '));
  return now ? { artist, title: title || now } : null;
}
