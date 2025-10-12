// static/js/modules/music-player/meta.js
// Accurate SomaFM (channels.json) + generic Icecast/Shoutcast/Radio.co metadata

import { normalizeNow } from './utils.js';
import { corsWrap, fetchJSONViaProxy, fetchTextViaProxy } from './cors.js';

/* ---------------- SomaFM via channels.json ---------------- */

const SOMA_URL   = 'https://somafm.com/channels.json';
const SOMA_TTLMS = 5000;   // cache for 5 s
let _soma = { t: 0, rows: null };

function toInt(v){ const n = parseInt(String(v ?? '').trim(),10); return Number.isFinite(n)?n:0; }
function lite(ch){ return { id:String(ch.id||''), title:String(ch.title||''), listeners:toInt(ch.listeners), lastPlaying:String(ch.lastPlaying||'') }; }

async function fetchSoma(proxy){
  const now = Date.now();
  if (_soma.rows && now - _soma.t < SOMA_TTLMS) return _soma.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(lite) : null;
  if (rows){ _soma = { t: now, rows }; return rows; }
  return _soma.rows || null;
}

/** derive "groovesalad" from e.g. "https://ice2.somafm.com/groovesalad-128-mp3" */
function somaId(url){
  try{
    const u = new URL(url, location.href);
    const seg = (u.pathname||'').replace(/^\/+/, '').split(/[/?#]/)[0];
    if (!seg) return '';
    let base = seg.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i,'');
    base = base.replace(/-(320|256|192|160|128|112|96|80|64|56|48|40|32)(-(mp3|aacp?|ogg))?$/i,'');
    if (base.includes('-')) base = base.split('-')[0];
    return base.toLowerCase();
  }catch{return '';}
}

async function somaMeta(streamUrl, proxy){
  const id = somaId(streamUrl);
  if (!id) return null;
  const rows = await fetchSoma(proxy);
  if (!rows) return null;
  const row = rows.find(r => r.id.toLowerCase() === id);
  if (!row) return null;
  return {
    title: row.title || `SomaFM • ${id}`,
    now: normalizeNow(row.lastPlaying || ''),
    listeners: row.listeners
  };
}

/* ---------------- Non-Soma generic probing ---------------- */

function guessRadioCoStatus(u){
  const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
  return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
}

async function universal(streamUrl, proxy){
  try{
    const u = new URL(streamUrl, location.href);
    if (/\.somafm\.com$/i.test(u.hostname)) return null;

    const base = `${u.protocol}//${u.host}`;
    const cand = [
      corsWrap(proxy, `${base}/status-json.xsl`),
      corsWrap(proxy, `${base}/status.xsl?json=1`),
      corsWrap(proxy, `${base}/stats?sid=1&json=1`),
      corsWrap(proxy, guessRadioCoStatus(u)),
      corsWrap(proxy, `${base}/7.html`)
    ].filter(Boolean);

    for (const url of cand){
      const jsonLike = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
      if (jsonLike){
        const data = await fetchJSONViaProxy(url, proxy);
        if (!data) continue;
        if (data.icestats){
          const src = data.icestats.source;
          const arr = Array.isArray(src)?src:[src];
          const s = arr[0];
          if (s){
            const title = s.server_name || s.title || '';
            const now = normalizeNow(s.artist && s.title ? `${s.artist} - ${s.title}` : s.title || '');
            return { title, now };
          }
        }
        if (data.servertitle || data.songtitle)
          return { title:data.servertitle||'', now:normalizeNow(data.songtitle||'') };
        if (data.current_track || data.name){
          const now = data.current_track?.title_with_artists || data.current_track?.title || '';
          return { title:data.name||'', now:normalizeNow(now) };
        }
      } else {
        const txt = await fetchTextViaProxy(url, proxy);
        if (!txt) continue;
        const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/);
        if (m){
          const parts = String(m[1]||m[2]||'').split(',');
          const song = parts.pop()?.trim();
          if (song) return { title:'', now:normalizeNow(song) };
        }
      }
    }
  }catch{}
  return null;
}

/* ---------------- Manifest-declared fallbacks ---------------- */

export async function metaRadioCo(meta, proxy){
  const url = meta?.status || (meta?.station_id ? `https://public.radio.co/stations/${meta.station_id}/status` : '');
  if (!url) return null;
  const j = await fetchJSONViaProxy(url, proxy);
  if (!j) return null;
  const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
  const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
  return { title: meta?.name || '', now: normalizeNow([a,t].filter(Boolean).join(' - ')) };
}

export async function metaShoutcast(meta, proxy){
  if (!meta?.status) return null;
  const txt = await fetchTextViaProxy(meta.status, proxy);
  if (!txt) return null;
  const parts = txt.split(',').map(s=>s.trim());
  const cur = parts[parts.length-1] || '';
  return { title: 'Shoutcast', now: normalizeNow(cur) };
}

/* ---------------- Main orchestrator ---------------- */

export async function fetchNowPlaying(streamUrl, stationMeta, proxy){
  // 1) SomaFM
  try{
    const isSoma = /\.somafm\.com$/i.test(new URL(streamUrl, location.href).hostname) || stationMeta?.kind === 'somafm';
    if (isSoma){
      const soma = await somaMeta(streamUrl, proxy);
      if (soma) return soma;
    }
  }catch{}

  // 2) Universal
  if (streamUrl){
    const gen = await universal(streamUrl, proxy);
    if (gen) return gen;
  }

  // 3) Manifest fallbacks
  if (stationMeta?.kind === 'radioco')   return await metaRadioCo(stationMeta, proxy);
  if (stationMeta?.kind === 'shoutcast') return await metaShoutcast(stationMeta, proxy);

  return null;
}
