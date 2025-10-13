// /music/script.js — drop-in: SomaFM-only meta (channels.json), audio via your .m3u/.pls

import { repoPrefix, clamp01, fmtTime } from './modules/utils.js';
import { loadM3U } from './modules/m3u.js';
import { ensureMeter } from './modules/meter.js';
import {
  buildShell,
  setNow,
  renderPlaylist as renderPlaylistList,
  renderRadioList,
  updateRadioNow,
  updateRadioListeners,
  highlightList,
  setMuteIcon,
  setPlayIcon,
  paintTimes,
  fillSelect
} from './modules/ui.js';
import { fetchStreamMeta, fetchTrackMeta } from './modules/metadata.js';

const root = document.querySelector('[data-mp]');
if (!root) {
  console.error('[music] no [data-mp] element');
}

/* -------------------- config -------------------- */
const cfg = (() => {
  const pref = repoPrefix();
  const attr = n => root.getAttribute(n);
  return {
    manifestUrl   : attr('data-manifest-url') || (pref + 'static/audio/music/playlists/manifest.json'),
    audioBase     : attr('data-audio-base')   || (pref + 'static/audio/music/'),
    autoplay      : attr('data-autoplay') === '1',
    autoplayMuted : attr('data-autoplay-muted') === '1',
    shuffle       : attr('data-shuffle') === '1',
    volume        : clamp01(parseFloat(attr('data-volume') || '0.25')),
    startSource   : attr('data-start-source') || 'stations',
    corsProxy     : (attr('data-cors-proxy') || 'allorigins-raw').trim(),
    metaPollSec   : Math.max(5, Number(attr('data-meta-poll-sec') || 8)),
  };
})();

/* -------------------- state -------------------- */
const audio = new Audio();
audio.preload = 'metadata';
audio.crossOrigin = 'anonymous';
audio.volume = cfg.volume;

let manifest = { stations: [], playlists: [] };
let queue = [];           // current tracks (or single LIVE item)
let cursor = -1;
let loopMode = 'none';
let usingStations = (cfg.startSource !== 'playlists');
let metaTimer = null;
let lastStreamUrl = '';
let lastNowTitle = '';

const historyByStation = new Map();
function stationKey(title, url){
  if (title && title.trim()) return title.trim();
  try { const u=new URL(url, location.href); return `${u.host}${u.pathname}`; } catch { return url||'unknown'; }
}
function stationHistory(title){
  const key = stationKey(title, lastStreamUrl);
  return historyByStation.get(key) || [];
}
function appendStationHistory(title, item){
  const key = stationKey(title, lastStreamUrl);
  const arr = historyByStation.get(key) || [];
  if (!arr.length || arr[arr.length-1] !== item) {
    arr.push(item);
    if (arr.length>250) arr.shift();
    historyByStation.set(key, arr);
  }
}

/* -------------------- UI shell -------------------- */
const refs = buildShell(root, cfg.volume);
function setSwitch(toPlaylists){
  usingStations = !toPlaylists;
  refs.switchKnob.setAttribute('aria-pressed', usingStations ? 'true' : 'false');
  refs.sel.stations?.classList.toggle('is-disabled', !usingStations);
  refs.sel.playlists?.classList.toggle('is-disabled', usingStations);
}

/* -------------------- transport -------------------- */
function playPause(){ if (!audio.src) return playAt(0); if (audio.paused) audio.play().then(()=>setPlayIcon(refs,true)).catch(()=>{}); else { audio.pause(); setPlayIcon(refs,false);} }
function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} setPlayIcon(refs,false); }
function prev(){ usingStations ? prevStation() : prevTrack(); }
function next(){ usingStations ? nextStation() : nextTrack(); }

function prevTrack(){ if (loopMode==='one') return playAt(cursor); playAt(cursor-1); }
function nextTrack(){
  if (loopMode==='one') return playAt(cursor);
  if (cfg.shuffle){
    let j = Math.floor(Math.random()*queue.length);
    if (queue.length>1 && j===cursor) j = (j+1)%queue.length;
    playAt(j);
  } else {
    const n = cursor + 1;
    if (n >= queue.length){ if (loopMode==='all') return playAt(0); setPlayIcon(refs,false); }
    else playAt(n);
  }
}
function nextStation(){
  const el = refs.sel.stations; if (!el || !el.options.length) return;
  el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
  onPickStations(true);
}
function prevStation(){
  const el = refs.sel.stations; if (!el || !el.options.length) return;
  el.selectedIndex = (el.selectedIndex - 1 + el.options.length) % el.options.length;
  onPickStations(true);
}

/* -------------------- live meta polling (Soma-only) -------------------- */
function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer = null; } }
function startMetaPolling(stationTitle, stationMeta){
  stopMetaPolling();
  if (!lastStreamUrl) return;
  pollOnce(stationTitle, stationMeta); // immediate
  metaTimer = setInterval(()=>pollOnce(stationTitle, stationMeta), cfg.metaPollSec*1000);
}
async function pollOnce(stationTitle, stationMeta){
  try{
    // SomaFM ONLY: read channels.json (via metadata.js)
    const meta = await fetchStreamMeta(lastStreamUrl, cfg.corsProxy, stationMeta);
    if (!meta) return;

    // Update listeners each pass if available
    if (Number.isFinite(meta.listeners) || typeof meta.listeners === 'number'){
      updateRadioListeners(refs, meta.listeners);
    }

    const label = (meta.now || '').trim();
    if (label && label !== lastNowTitle){
      lastNowTitle = label;
      setNow(refs, stationTitle || meta.title || 'Live Station', 'Radio');
      updateRadioNow(refs, label);
      appendStationHistory(stationTitle || 'Live Station', label);
    }
  }catch{}
}

/* -------------------- loaders -------------------- */
async function onPickStations(autoPlay){
  setSwitch(false);
  const file = refs.sel.stations?.value; if (!file) return;
  const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');

  // Flatten .m3u/.pls into a single LIVE entry with URLs
  queue = await loadM3U({
    path: file,
    base,
    audioBase: cfg.audioBase,
    isStation: true,
    selectedTitle: refs.sel.stations?.selectedOptions?.[0]?.textContent,
    proxy: cfg.corsProxy
  });

  cursor = 0;
  lastNowTitle = '';
  lastStreamUrl = '';

  const stTitle = queue[0]?.title || 'Live Station';
  renderRadioList(refs, stTitle, '—', stationHistory(stTitle), /* listeners: */ undefined);
  setNow(refs, stTitle, 'Radio');
  if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
}

async function onPickMusic(autoPlay){
  setSwitch(true);
  const file = refs.sel.playlists?.value; if (!file) return;
  const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');

  let tracks = await loadM3U({
    path: file,
    base,
    audioBase: cfg.audioBase,
    isStation: false,
    proxy: cfg.corsProxy
  });

  if (cfg.shuffle && tracks.length>1){
    for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
  }

  queue = tracks; cursor = 0;
  renderPlaylistList(refs, queue, (idx)=> playAt(idx));
  setNow(refs, queue[0]?.title || '—', 'Playlist');
  if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
}

/* -------------------- playback -------------------- */
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

  setNow(refs, tr.title, usingStations ? 'Radio' : 'Playlist');
  setPlayIcon(refs, false);
  stopMetaPolling();

  try{
    if (tr.isStream){
      // first poll should always paint even if same text
      lastNowTitle = '';

      const ok = await tryPlayStream(tr.urls);
      lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;

      setPlayIcon(refs, true);
      renderRadioList(refs, tr.title, '—', stationHistory(tr.title));
      highlightList(refs, cursor, usingStations);
      ensureMeter(audio);

      // Soma station hint: use select text as the "name", also pass id from URL if any
      const hint = {
        name: tr.title || '',
        // idFromUrl is inside metadata.js; it derives id from the stream URL as fallback
        // we don't need to compute here—metadata.js does it.
      };
      startMetaPolling(tr.title, hint);

    } else {
      audio.src = tr.url;
      await audio.play();

      setPlayIcon(refs, true);
      highlightList(refs, cursor, usingStations);
      ensureMeter(audio);

      // One-shot track metadata normalize
      try{
        const meta = await fetchTrackMeta(tr);
        const label = meta ? [meta.artist, meta.title].filter(Boolean).join(' - ') : tr.title;
        if (label) setNow(refs, label, 'Playlist');
      }catch{}
    }
  } catch (e){
    setPlayIcon(refs, false);
    setNow(refs, tr.title, 'Failed to play — choose another');
  }
}

/* -------------------- controls wiring -------------------- */
refs.switchKnob?.addEventListener('click', async ()=>{
  const isRadio = (refs.switchKnob.getAttribute('aria-pressed') === 'true');
  // If currently Radio -> switch to Playlists
  setSwitch(isRadio);
  if (usingStations) {
    if (refs.sel.stations?.options.length) await onPickStations(true);
  } else {
    if (refs.sel.playlists?.options.length) await onPickMusic(true);
  }
});

refs.btn.play?.addEventListener('click', playPause);
refs.btn.stop?.addEventListener('click', stop);
refs.btn.prev?.addEventListener('click', prev);
refs.btn.next?.addEventListener('click', next);
refs.btn.shuffle?.addEventListener('click', ()=>{
  cfg.shuffle = !cfg.shuffle;
  refs.btn.shuffle.classList.toggle('active', cfg.shuffle);
});
refs.btn.loop?.addEventListener('click', ()=>{
  loopMode = (loopMode==='all') ? 'none' : 'all';
  refs.btn.loop.classList.toggle('active', loopMode==='all');
  refs.btn.loop1?.classList.remove('active');
});
refs.btn.loop1?.addEventListener('click', ()=>{
  loopMode = (loopMode==='one') ? 'none' : 'one';
  refs.btn.loop1.classList.toggle('active', loopMode==='one');
  refs.btn.loop?.classList.remove('active');
});
refs.btn.mute?.addEventListener('click', ()=>{
  audio.muted = !audio.muted; setMuteIcon(refs, audio);
});

refs.seek?.addEventListener('input', ()=>{
  if (!isFinite(audio.duration) || audio.duration<=0) return;
  audio.currentTime = (refs.seek.value/1000)*audio.duration;
});
if (refs.vol){
  refs.vol.value = String(cfg.volume);
  audio.volume = cfg.volume;
  refs.vol.addEventListener('input', ()=>{
    const v = parseFloat(refs.vol.value);
    audio.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : cfg.volume;
  });
}

audio.addEventListener('timeupdate', ()=> paintTimes(refs, audio, fmtTime));
audio.addEventListener('durationchange', ()=> paintTimes(refs, audio, fmtTime));
audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(refs,false) : nextTrack());

root.addEventListener('keydown', (e)=>{
  const isTyping = !!(e.target && e.target.closest && e.target.closest('input, select, textarea, [contenteditable="true"]'));
  if (isTyping) return;
  if (e.code==='Space'){ e.preventDefault(); playPause(); }
  if (e.code==='ArrowLeft') prev();
  if (e.code==='ArrowRight') next();
  if ((e.key||'').toLowerCase()==='m'){ audio.muted = !audio.muted; setMuteIcon(refs, audio); }
});

if (cfg.autoplayMuted) {
  audio.muted = true; setMuteIcon(refs, audio);
  const unmute = ()=>{ audio.muted=false; setMuteIcon(refs, audio); window.removeEventListener('click', unmute, {once:true}); };
  window.addEventListener('click', unmute, { once:true });
}
setMuteIcon(refs, audio);

/* -------------------- init -------------------- */
(async function init(){
  setNow(refs, '—','—');
  // Load manifest
  try{
    const r = await fetch(cfg.manifestUrl, { cache: 'no-store' });
    const mf = r.ok ? await r.json() : {};
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
  } catch { manifest = { stations: [], playlists: [] }; }

  fillSelect(refs.sel.stations,  manifest.stations);
  fillSelect(refs.sel.playlists, manifest.playlists);

  // Initial switch position
  setSwitch(cfg.startSource === 'playlists');

  // Start mode
  let mode = cfg.startSource;
  if (mode === 'auto'){
    const both = manifest.stations.length && manifest.playlists.length;
    mode = both ? (Math.random()<0.5?'stations':'playlists')
         : (manifest.stations.length?'stations':'playlists');
  }

  if (mode==='stations' && manifest.stations.length){
    refs.sel.stations.selectedIndex = 0;
    await onPickStations(false);
  } else if (manifest.playlists.length){
    refs.sel.playlists.selectedIndex = 0;
    await onPickMusic(false);
  } else {
    setNow(refs, 'No playlists found', '—');
  }

  // Polite autoplay if muted
  if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
    if (mode==='stations' && manifest.stations.length) await onPickStations(true);
    else if (manifest.playlists.length) await onPickMusic(true);
  }
})();
