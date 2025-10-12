// /music/modules/player.js — main state machine (DROP-IN)
// - Immediate live-now poll on station start
// - Resets lastNowTitle so first poll paints
// - Defensive guards + consistent render on station change

import { repoPrefix, $, clamp01, isAbs, join, fmtTime } from './utils.js';
import { parseM3U } from './m3u.js';
import {
  buildShell,
  getRefs,          // <— ensure ui.js exports getRefs(root)
  setNow,
  setPlayIcon,
  paintTimes,
  fillSelect,
  renderRadioList,
  updateRadioNow,
  renderPlaylist,
  highlightList
} from './ui.js';
import { ensureMeter } from './meter.js';
import { fetchStreamMeta, fetchTrackMeta } from './metadata.js';
import { wireControls } from './controls.js';

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
    corsProxy     : (attr('data-cors-proxy') || '').trim(),
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

  // UI helpers
  const setSwitch = (toPlaylists)=>{
    usingStations = !toPlaylists;
    R.switchKnob.setAttribute('aria-pressed', usingStations ? 'true':'false');
    R.sel.stations?.classList.toggle('is-disabled', !usingStations);
    R.sel.playlists?.classList.toggle('is-disabled', usingStations);
  };

  // Fetch helpers
  const getText = async (url)=>{ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.text():''; }catch{ return ''; } };
  const getJSON = async (url)=>{ try{ const r=await fetch(url,{cache:'no-store'}); return r.ok? r.json():null; }catch{ return null; } };

  // M3U loader (stations flatten to single LIVE entry with url list)
  async function loadM3U(path, isStation){
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    const url  = isAbs(path) ? path : join(base, path);
    const txt  = await getText(url);
    const entries = parseM3U(txt);
    if (!entries.length) return [];
    if (isStation) {
      const urls = entries.map(e => isAbs(e.url) ? e.url : join(cfg.audioBase, e.url)).filter(Boolean);
      lastStreamUrl = urls[0] || '';
      return [{ title: R.sel.stations?.selectedOptions?.[0]?.textContent || 'Live Station', isStream:true, urls }];
    }
    return entries.map(e => ({
      title: e.title || e.url,
      url: isAbs(e.url) ? e.url : join(cfg.audioBase, e.url),
      isStream: false
    }));
  }

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

    try{
      if (tr.isStream){
        // reset so the very first poll paints even if it's the same text
        lastNowTitle = '';

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

        // One-shot file metadata (ID3/OGG + oEmbed)
        try{
          const meta = await fetchTrackMeta(tr, cfg.corsProxy);
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

  // Live metadata (radio)
  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(stationTitle){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    pollOnce(stationTitle); // immediate
    metaTimer = setInterval(()=>pollOnce(stationTitle), Math.max(5, cfg.metaPollSec)*1000);
  }
  async function pollOnce(stationTitle){
    try{
      const meta = await fetchStreamMeta(lastStreamUrl, cfg.corsProxy);
      if (meta && (meta.now || meta.title)){
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
    lastNowTitle = ''; // ensure first paint
    queue = await loadM3U(file, true);
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    renderRadioList(R, stTitle, '—');
    setNow(R, stTitle, 'Radio');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }
  async function onPickMusic(autoPlay){
    setSwitch(true);
    const file = R.sel.playlists?.value; if (!file) return;
    let tracks = (await loadM3U(file, false)) || [];
    if (cfg.shuffle && tracks.length>1){
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylist(R, queue, (idx)=>playAt(idx));
    setNow(R, queue[0]?.title || '—', 'Playlist');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }

  // Wire controls (mute button stays on same line via CSS; no extra markup)
  wireControls(R, audio, cfg, { playPause, stop, prev, next, onPickStations, onPickMusic, setSwitch });

  // Time UI
  audio.addEventListener('timeupdate', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('durationchange', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(R,false) : nextTrack());

  // Initial switch position
  setSwitch(cfg.startSource === 'playlists');

  // Manifest
  const mf = await getJSON(cfg.manifestUrl);
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
