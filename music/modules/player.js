// /music/modules/player.js — main state machine (SomaFM now-playing + listeners)
// - Uses channels.json (via AllOrigins or provided proxy) for {lastPlaying, listeners}
// - Uses m3u/pls for actual audio URLs
// - No ID3 parsing here; playlist track meta is handled in metadata.js (optional)

import { repoPrefix, $, clamp01, isAbs, join, fmtTime, normalizeNow } from './utils.js';
import { loadM3U } from './m3u.js';
import {
  buildShell,
  getRefs,
  setNow,
  setPlayIcon,
  paintTimes,
  fillSelect,
  renderRadioList,
  updateRadioNow,
  updateRadioListeners,
  renderPlaylist,
  highlightList
} from './ui.js';
import { ensureMeter } from './meter.js';
import { fetchTextViaProxy, fetchJSONViaProxy } from './cors.js';
import { fetchTrackMeta } from './metadata.js';

const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // ms cache (in-memory)
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
async function fetchStreamMeta(url, proxy, stationMeta = {}){
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

export async function boot(root){
  if (!root) return;

  const attr = n => root.getAttribute(n);
  const cfg = {
    manifestUrl   : attr('data-manifest-url') || (repoPrefix() + 'static/audio/music/playlists/manifest.json'),
    audioBase     : attr('data-audio-base')   || (repoPrefix() + 'static/audio/music/'),
    autoplay      : attr('data-autoplay') === '1',
    autoplayMuted : attr('data-autoplay-muted') === '1',
    shuffle       : attr('data-shuffle') === '1',
    volume        : clamp01(parseFloat(attr('data-volume') || '0.25')),
    startSource   : attr('data-start-source') || 'stations',
    corsProxy     : (attr('data-cors-proxy') || 'allorigins-raw').trim(),
    metaPollSec   : 8,
    loopMode      : 'none'
  };

  // Shell + refs
  buildShell(root, cfg.volume);
  const R = getRefs(root);
  R.root = root;

  // Audio & state
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.volume = cfg.volume;

  let manifest = { stations: [], playlists: [] };
  let queue = [];          // playlist tracks or single LIVE item
  let cursor = -1;
  let usingStations = (cfg.startSource !== 'playlists');
  let metaTimer = null;
  let lastStreamUrl = '';
  let lastNowTitle = '';   // reset this when changing stations

  const historyByStation = new Map();
  const stationKey = (title, url)=>{
    if (title && title.trim()) return title.trim();
    try { const u=new URL(url, location.href); return `${u.host}${u.pathname}`; } catch { return url||'unknown'; }
  };
  const appendStationHistory = (stTitle, item)=>{
    const key = stationKey(stTitle, lastStreamUrl);
    const arr = historyByStation.get(key) || [];
    if (!arr.length || arr[arr.length-1] !== item){
      arr.push(item); if (arr.length>250) arr.shift(); historyByStation.set(key, arr);
    }
  };
  const stationHistory = (stTitle)=> historyByStation.get(stationKey(stTitle, lastStreamUrl)) || [];

  // UI helpers
  const setSwitch = (toPlaylists)=>{
    usingStations = !toPlaylists;
    R.switchKnob.setAttribute('aria-pressed', usingStations ? 'true':'false');
    R.sel.stations?.classList.toggle('is-disabled', !usingStations);
    R.sel.playlists?.classList.toggle('is-disabled', usingStations);
  };

  // Try play stream (multi-endpoint)
  async function tryPlayStream(urls){
    let lastErr;
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch(e){ lastErr=e; }
    }
    throw (lastErr || new Error('No playable endpoints'));
  }

  // Pretty label
  const pretty = (meta)=>{
    const t = (meta?.title||'').trim();
    const a = (meta?.artist||'').trim();
    return (t && a) ? `${a} - ${t}` : (t || a || '');
  };

  // Playback
  async function playAt(i){
    if (!queue.length) return;
    cursor = (i + queue.length) % queue.length;
    const tr = queue[cursor];

    setNow(R, tr.title, usingStations ? 'Radio' : 'Playlist');
    setPlayIcon(R, false);
    stopMetaPolling();
    lastNowTitle = '';

    try{
      if (tr.isStream){
        const ok = await tryPlayStream(tr.urls);
        lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;

        setPlayIcon(R, true);
        renderRadioList(R, tr.title, '—');    // em dash until poll lands
        highlightList(R, cursor, usingStations);
        startMetaPolling(tr.title);           // immediate poll inside
        ensureMeter(audio);

      } else {
        audio.src = tr.url;
        await audio.play();

        setPlayIcon(R, true);
        highlightList(R, cursor, usingStations);
        ensureMeter(audio);

        // One-shot file metadata (derived from filename/title)
        try{
          const meta = await fetchTrackMeta(tr);
          const label = pretty(meta);
          if (label){
            setNow(R, label, 'Playlist');
            const li = R.list?.children[cursor];
            const tDiv = li?.querySelector('.t');
            if (tDiv) tDiv.textContent = `${String(cursor+1).padStart(2,'0')} — ${label}`;
          }
        }catch{}
      }
    }catch(e){
      setPlayIcon(R, false);
      setNow(R, tr.title, 'Failed to play — choose another');
    }
  }

  function playPause(){ if (!audio.src) return playAt(0); if (audio.paused) audio.play().then(()=>setPlayIcon(R,true)).catch(()=>{}); else { audio.pause(); setPlayIcon(R,false);} }
  function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} setPlayIcon(R,false); }
  function prev(){ usingStations ? prevStation() : prevTrack(); }
  function next(){ usingStations ? nextStation() : nextTrack(); }

  function prevTrack(){ if (cfg.loopMode==='one') return playAt(cursor); playAt(cursor-1); }
  function nextTrack(){
    if (cfg.loopMode==='one') return playAt(cursor);
    if (cfg.shuffle){
      let j = Math.floor(Math.random()*queue.length);
      if (queue.length>1 && j===cursor) j = (j+1)%queue.length;
      playAt(j);
    } else {
      const n = cursor + 1;
      if (n >= queue.length){ if (cfg.loopMode==='all') return playAt(0); setPlayIcon(R,false); }
      else playAt(n);
    }
  }
  function nextStation(){
    const el = R.sel.stations; if (!el || !el.options.length) return;
    el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
    onPickStations(true);
  }
  function prevStation(){
    const el = R.sel.stations; if (!el || !el.options.length) return;
    el.selectedIndex = (el.selectedIndex - 1 + el.options.length) % el.options.length;
    onPickStations(true);
  }

  // Live metadata (SomaFM channels.json)
  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(stationTitle){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    pollOnce(stationTitle); // immediate
    metaTimer = setInterval(()=>pollOnce(stationTitle), Math.max(5, cfg.metaPollSec)*1000);
  }
  async function pollOnce(stationTitle){
    try{
      const meta = await fetchStreamMeta(lastStreamUrl, cfg.corsProxy, { name: stationTitle });
      if (meta){
        // Always update listeners if provided
        if (meta.listeners != null) updateRadioListeners(R, meta.listeners);

        const label = (meta.now || meta.title || '').trim();
        if (label && label !== lastNowTitle){
          lastNowTitle = label;
          setNow(R, stationTitle || meta.title || 'Live Station', 'Radio');
          updateRadioNow(R, label);
          appendStationHistory(stationTitle || 'Live Station', label);
        }
      }
    }catch{}
  }

  // Selections
  async function onPickStations(autoPlay){
    setSwitch(false);
    const file = R.sel.stations?.value; if (!file) return;
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    queue = await loadM3U({
      path: file,
      base,
      audioBase: cfg.audioBase,
      isStation: true,
      selectedTitle: R.sel.stations?.selectedOptions?.[0]?.textContent
    });
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    renderRadioList(R, stTitle, '—');    // listeners will fill on first poll
    setNow(R, stTitle, 'Radio');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }
  async function onPickMusic(autoPlay){
    setSwitch(true);
    const file = R.sel.playlists?.value; if (!file) return;
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    let tracks = (await loadM3U({ path:file, base, audioBase:cfg.audioBase, isStation:false })) || [];
    if (cfg.shuffle && tracks.length>1){
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylist(R, queue, (idx)=>playAt(idx));
    setNow(R, queue[0]?.title || '—', 'Playlist');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }

  // Wire controls
  import('./controls.js').then(mod=>{
    const { wireControls } = mod;
    wireControls(R, audio, cfg, { playPause, stop, prev, next, onPickStations, onPickMusic, setSwitch });
  }).catch(()=>{ /* if dynamic import fails, no controls */ });

  // Time UI
  audio.addEventListener('timeupdate', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('durationchange', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(R,false) : nextTrack());

  // Initial switch position
  setSwitch(cfg.startSource === 'playlists');

  // Manifest
  const mf = await (async ()=>{ try{ const r=await fetch(cfg.manifestUrl,{cache:'no-store'}); return r.ok? await r.json():{}; }catch{ return {}; }})();
  manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
  manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
  fillSelect(R.sel.stations,  manifest.stations);
  fillSelect(R.sel.playlists, manifest.playlists);

  // Start
  let mode = cfg.startSource;
  if (mode === 'auto'){
    const both = manifest.stations.length && manifest.playlists.length;
    mode = both ? (Math.random()<0.5?'stations':'playlists')
         : (manifest.stations.length?'stations':'playlists');
  }
  if (mode==='stations' && manifest.stations.length){
    R.sel.stations.selectedIndex = 0; await onPickStations(false);
  } else if (manifest.playlists.length){
    R.sel.playlists.selectedIndex = 0; await onPickMusic(false);
  } else {
    setNow(R, 'No playlists found', '—');
  }

  // Polite autoplay if muted
  if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
    if (mode==='stations' && manifest.stations.length) await onPickStations(true);
    else if (manifest.playlists.length) await onPickMusic(true);
  }
}

// Optional auto-mount (single player)
const autoRoot = document.querySelector('[data-mp]');
if (autoRoot) boot(autoRoot);
