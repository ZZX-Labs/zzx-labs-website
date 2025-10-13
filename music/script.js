// /music/script.js — drop-in orchestrator (SomaFM channels.json for meta)
// - Audio from your M3U/PLS
// - Metadata (listeners + lastPlaying) from channels.json via proxy
// - Uses your existing modules in /music/modules/

import { repoPrefix, clamp01, fmtTime } from './modules/utils.js';
import { loadM3U } from './modules/m3u.js';
import {
  buildShell, getRefs, setNow,
  renderPlaylist, renderRadioList,
  updateRadioNow, updateRadioListeners,
  highlightList, setPlayIcon, paintTimes, fillSelect
} from './modules/ui.js';
import { ensureMeter } from './modules/meter.js';
import { wireControls } from './modules/controls.js';
import { fetchTrackMeta } from './modules/metadata.js';
import { fetchJSONViaProxy } from './modules/cors.js';

/* ---------------- config ---------------- */
function getCfg(root){
  const pref = repoPrefix();
  const attr = n => root.getAttribute(n);
  return {
    manifestUrl   : attr('data-manifest-url') || (pref + 'static/audio/music/playlists/manifest.json'),
    audioBase     : attr('data-audio-base')   || (pref + 'static/audio/music/'),
    autoplay      : attr('data-autoplay') === '1',
    autoplayMuted : attr('data-autoplay-muted') === '1',
    shuffle       : attr('data-shuffle') === '1',
    volume        : clamp01(parseFloat(attr('data-volume') || '0.25')),
    startSource   : attr('data-start-source') || 'stations', // 'stations' | 'playlists' | 'auto'
    corsProxy     : (attr('data-cors-proxy') || 'allorigins-raw').trim(),
    metaPollSec   : 8,
    loopMode      : 'none'
  };
}

/* ---------------- soma helpers ---------------- */
const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // ms
let SOMA_CACHE = { t: 0, rows: [] };

const _toInt = v => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
function _mapRow(ch){
  return {
    id: String(ch.id || '').toLowerCase(),
    title: String(ch.title || ''),
    listeners: _toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || ''),
  };
}
async function _getSomaRows(proxy){
  const now = Date.now();
  if (SOMA_CACHE.rows.length && (now - SOMA_CACHE.t) < SOMA_TTL) return SOMA_CACHE.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(_mapRow) : [];
  if (rows.length){ SOMA_CACHE = { t: now, rows }; }
  return rows;
}
function _idFromStreamUrl(u){
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
function _slug(s=''){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'').trim(); }
function _isPromo(s=''){
  const t = s.toLowerCase();
  return (
    t.includes('donate to somafm') ||
    t.includes('support somafm') ||
    t.includes('keep commercial-free') || t.includes('commercial free') ||
    t.includes('somafm.com') ||
    t.includes('thanks for listening') ||
    /station id|liner|promo/.test(t)
  );
}

/* ---------------- boot ---------------- */
(async function boot(){
  const root = document.querySelector('[data-mp]');
  if (!root) return;

  const cfg = getCfg(root);

  // UI
  buildShell(root, cfg.volume);
  const R = getRefs(root); R.root = root;

  // Audio
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.volume = cfg.volume;

  // State
  let manifest = { stations: [], playlists: [] };
  let queue = [];
  let cursor = -1;
  let usingStations = (cfg.startSource !== 'playlists');
  let lastStreamUrl = '';
  let lastNowTitle  = '';
  let metaTimer     = null;

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

  const setSwitch = (toPlaylists)=>{
    usingStations = !toPlaylists;
    R.switchKnob.setAttribute('aria-pressed', usingStations ? 'true' : 'false');
    R.sel.stations?.classList.toggle('is-disabled', !usingStations);
    R.sel.playlists?.classList.toggle('is-disabled', usingStations);
  };

  async function tryPlayStream(urls){
    let lastErr;
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch(e){ lastErr=e; }
    }
    throw (lastErr || new Error('No playable endpoints'));
  }

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
        renderRadioList(R, tr.title, '—', stationHistory(tr.title));
        highlightList(R, cursor, usingStations);
        startMetaPolling(tr.title);
        ensureMeter(audio);
      } else {
        audio.src = tr.url;
        await audio.play();

        setPlayIcon(R, true);
        highlightList(R, cursor, usingStations);
        ensureMeter(audio);

        try{
          const meta = await fetchTrackMeta(tr, cfg.corsProxy);
          if (meta){
            const label = [meta.artist, meta.title].filter(Boolean).join(' - ') || tr.title;
            setNow(R, label, 'Playlist');
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

  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(stationTitle){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    pollOnce(stationTitle);
    metaTimer = setInterval(()=>pollOnce(stationTitle), Math.max(5, cfg.metaPollSec)*1000);
  }
  async function pollOnce(stationTitle){
    try{
      const rows = await _getSomaRows(cfg.corsProxy);
      const byId = rows.find(r => r.id === _idFromStreamUrl(lastStreamUrl));
      let row = byId || rows.find(r => _slug(r.title) === _slug(stationTitle));
      if (!row) return;

      updateRadioListeners(R, row.listeners);
      const nowTxt = (row.lastPlaying || '').trim();
      if (!nowTxt || _isPromo(nowTxt)) return;

      if (nowTxt !== lastNowTitle){
        lastNowTitle = nowTxt;
        setNow(R, stationTitle || row.title || 'Live Station', 'Radio');
        updateRadioNow(R, nowTxt);
        appendStationHistory(stationTitle || row.title || 'Live Station', nowTxt);
      }
    }catch{}
  }

  async function onPickStations(autoPlay){
    setSwitch(false);
    const file = R.sel.stations?.value; if (!file) return;
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    queue = await loadM3U({
      path: file, base, audioBase: cfg.audioBase, isStation: true,
      selectedTitle: R.sel.stations?.selectedOptions?.[0]?.textContent
    });
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    renderRadioList(R, stTitle, '—', stationHistory(stTitle));
    setNow(R, stTitle, 'Radio');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }
  async function onPickMusic(autoPlay){
    setSwitch(true);
    const file = R.sel.playlists?.value; if (!file) return;
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    let tracks = await loadM3U({ path:file, base, audioBase:cfg.audioBase, isStation:false });
    if (cfg.shuffle && tracks.length>1){
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylist(R, queue, (i)=> playAt(i)); // ✅ fixed name
    setNow(R, queue[0]?.title || '—', 'Playlist');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }

  wireControls(R, audio, cfg, { playPause, stop, prev, next, onPickStations, onPickMusic, setSwitch });
  audio.addEventListener('timeupdate', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('durationchange', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(R,false) : nextTrack());

  setSwitch(cfg.startSource === 'playlists');

  const mf = await (async ()=>{ try{ const r=await fetch(cfg.manifestUrl,{cache:'no-store'}); return r.ok? await r.json():{}; }catch{ return {}; }})();
  manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
  manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
  fillSelect(R.sel.stations,  manifest.stations);
  fillSelect(R.sel.playlists, manifest.playlists);

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

  if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
    if (mode==='stations' && manifest.stations.length) await onPickStations(true);
    else if (manifest.playlists.length) await onPickMusic(true);
  }
})();
