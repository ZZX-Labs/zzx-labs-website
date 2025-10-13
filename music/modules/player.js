// /music/modules/player.js — main state machine (DROP-IN)
// Uses SomaFM channels.json for now-playing and listener counts.

import { repoPrefix, $, clamp01, isAbs, join, fmtTime } from './utils.js';
import { loadM3UCompat } from './m3u.js';
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
    corsProxy     : (attr('data-cors-proxy') || 'allorigins-raw').trim(),
    metaPollSec   : 8,
    loopMode      : 'none'
  };

  buildShell(root, cfg.volume);
  const R = getRefs(root);
  R.root = root;

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.volume = cfg.volume;

  let manifest = { stations: [], playlists: [] };
  let queue = [];
  let cursor = -1;
  let usingStations = (cfg.startSource !== 'playlists');
  let metaTimer = null;
  let lastStreamUrl = '';
  let lastNowTitle = '';
  let currentStationName = '';

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

  const setSwitch = (toPlaylists)=>{
    usingStations = !toPlaylists;
    R.switchKnob.setAttribute('aria-pressed', usingStations ? 'true':'false');
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

  const pretty = (meta)=>{
    const t = (meta?.title||'').trim();
    const a = (meta?.artist||'').trim();
    return (t && a) ? `${a} - ${t}` : (t || a || '');
  };

  async function playAt(i){
    if (!queue.length) return;
    cursor = (i + queue.length) % queue.length;
    const tr = queue[cursor];

    setNow(R, tr.title, usingStations ? 'Radio' : 'Playlist');
    setPlayIcon(R, false);
    stopMetaPolling();

    try{
      if (tr.isStream){
        lastNowTitle = '';
        const ok = await tryPlayStream(tr.urls);
        lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;
        currentStationName = tr.title || '';

        setPlayIcon(R, true);
        renderRadioList(R, tr.title, '—');
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

  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(stationTitle){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    pollOnce(stationTitle);
    metaTimer = setInterval(()=>pollOnce(stationTitle), Math.max(5, cfg.metaPollSec)*1000);
  }

  async function pollOnce(stationTitle){
    try{
      const meta = await fetchStreamMeta(lastStreamUrl, cfg.corsProxy, { name: currentStationName });
      if (meta && (meta.now || meta.title)){
        const label = (meta.now || meta.title || '').trim();

        if (meta.listeners != null) updateRadioListeners(R, meta.listeners);

        if (label && label !== lastNowTitle){
          lastNowTitle = label;
          setNow(R, stationTitle || meta.title || 'Live Station', 'Radio');
          updateRadioNow(R, label);
          appendStationHistory(stationTitle || 'Live Station', label);
        }
      }
    }catch(e){
      console.debug('[pollOnce] Soma fetch failed', e);
    }
  }

  async function onPickStations(autoPlay){
    setSwitch(false);
    const file = R.sel.stations?.value; if (!file) return;
    lastNowTitle = '';
    queue = await loadM3UCompat(file, true, { title: R.sel.stations?.selectedOptions?.[0]?.textContent || 'Live Station' }, { manifestUrl: cfg.manifestUrl, audioBase: cfg.audioBase, corsProxy: cfg.corsProxy });
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    renderRadioList(R, stTitle, '—');
    setNow(R, stTitle, 'Radio');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }

  async function onPickMusic(autoPlay){
    setSwitch(true);
    const file = R.sel.playlists?.value; if (!file) return;
    let tracks = (await loadM3UCompat(file, false, null, { manifestUrl: cfg.manifestUrl, audioBase: cfg.audioBase, corsProxy: cfg.corsProxy })) || [];
    if (cfg.shuffle && tracks.length>1){
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylist(R, queue, (idx)=>playAt(idx));
    setNow(R, queue[0]?.title || '—', 'Playlist');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }

  wireControls(R, audio, cfg, { playPause, stop, onPickStations, onPickMusic, setSwitch });
  audio.addEventListener('timeupdate', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('durationchange', ()=> paintTimes(R, audio, fmtTime));
  audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(R,false) : null);

  const mf = await (await fetch(cfg.manifestUrl)).json().catch(()=>null);
  manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
  manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
  fillSelect(R.sel.stations,  manifest.stations);
  fillSelect(R.sel.playlists, manifest.playlists);

  if (cfg.startSource === 'stations' && manifest.stations.length){
    R.sel.stations.selectedIndex = 0;
    await onPickStations(false);
  } else if (manifest.playlists.length){
    R.sel.playlists.selectedIndex = 0;
    await onPickMusic(false);
  }

  if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
    if (manifest.stations.length) await onPickStations(true);
  }
}

// Auto-mount (single player)
const autoRoot = document.querySelector('[data-mp]');
if (autoRoot) boot(autoRoot);
