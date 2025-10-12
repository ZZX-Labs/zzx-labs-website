// /music/script.js — wrapper: wiring + state
import { repoPrefix, $, $$, clamp01, isAbs, join, fmtTime } from './modules/utils.js';
import { loadM3U } from './modules/m3u.js';
import { fetchStreamMeta, fetchTrackMeta } from './modules/metadata.js';
import { ensureMeter } from './modules/audio-meter.js';
import { buildShell, setNow, renderPlaylistList, renderRadioList, updateRadioNow, highlightList } from './modules/ui.js';

const root = document.querySelector('[data-mp]');
if (!root) { console.error('[music] no [data-mp] element'); }

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
    startSource   : attr('data-start-source') || 'stations', // 'stations' | 'playlists' | 'auto'
    corsProxy     : (attr('data-cors-proxy') || '').trim(),
    metaPollSec   : 8
  };
})();

/* ---------- State ---------- */
const audio = new Audio();
audio.preload = 'metadata';
audio.crossOrigin = 'anonymous';

let manifest = { stations: [], playlists: [] };
let queue = [];      // current list of tracks (or single LIVE entry)
let cursor = -1;
let loopMode = 'none';
let usingStations = true;     // slide switch
let lastStreamUrl = '';
let lastNowTitle = '';
let metaTimer = null;

const historyByStation = new Map();
function stationKey(title, url){
  if (title && title.trim()) return title.trim();
  try { const u=new URL(url, location.href); return `${u.host}${u.pathname}`; } catch { return url||'unknown'; }
}
function appendStationHistory(title, item){
  const key = stationKey(title, lastStreamUrl);
  const arr = historyByStation.get(key) || [];
  if (!arr.length || arr[arr.length-1] !== item) {
    arr.push(item);
    if (arr.length > 250) arr.shift();
    historyByStation.set(key, arr);
  }
}

/* ---------- Boot ---------- */
(async function boot(){
  const refs = buildShell(root, cfg.volume);
  wireControls(refs);
  setSwitch(refs, cfg.startSource === 'playlists');

  // Manifest
  const mf = await (async () => {
    try{ const r=await fetch(cfg.manifestUrl,{cache:'no-store'}); return r.ok? await r.json():{}; }catch{ return {}; }
  })();
  manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
  manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

  fillSelect(refs.sel.stations,  manifest.stations);
  fillSelect(refs.sel.playlists, manifest.playlists);

  // Start mode
  let mode = cfg.startSource;
  if (mode === 'auto') {
    const both = manifest.stations.length && manifest.playlists.length;
    mode = both ? (Math.random()<0.5?'stations':'playlists')
         : (manifest.stations.length?'stations':'playlists');
  }

  if (mode==='stations' && manifest.stations.length){
    refs.sel.stations.selectedIndex = 0;
    await onPickStations(refs, false);
  } else if (manifest.playlists.length){
    refs.sel.playlists.selectedIndex = 0;
    await onPickMusic(refs, false);
  } else {
    setNow(refs, 'No playlists found', '—');
  }

  if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
    if (mode==='stations' && manifest.stations.length) await onPickStations(refs, true);
    else if (manifest.playlists.length) await onPickMusic(refs, true);
  }
})();

/* ---------- UI wiring ---------- */
function wireControls(refs){
  refs.switchKnob?.addEventListener('click', async ()=>{
    const isRadio = (refs.switchKnob.getAttribute('aria-pressed') === 'true');
    setSwitch(refs, isRadio /* -> playlists */);
    if (usingStations) {
      if (refs.sel.stations?.options.length) await onPickStations(refs, true);
    } else {
      if (refs.sel.playlists?.options.length) await onPickMusic(refs, true);
    }
  });

  refs.btn.play?.addEventListener('click', ()=> playPause(refs));
  refs.btn.stop?.addEventListener('click', ()=> stop(refs));
  refs.btn.prev?.addEventListener('click', ()=> prev(refs));
  refs.btn.next?.addEventListener('click', ()=> next(refs));
  refs.btn.shuffle?.addEventListener('click', ()=> { cfg.shuffle=!cfg.shuffle; refs.btn.shuffle.classList.toggle('active', cfg.shuffle); });
  refs.btn.loop?.addEventListener('click', ()=> { loopMode = (loopMode==='all')?'none':'all'; refs.btn.loop.classList.toggle('active', loopMode==='all'); refs.btn.loop1.classList.remove('active'); });
  refs.btn.loop1?.addEventListener('click',()=> { loopMode = (loopMode==='one')?'none':'one'; refs.btn.loop1.classList.toggle('active', loopMode==='one'); refs.btn.loop.classList.remove('active'); });
  refs.btn.mute?.addEventListener('click', ()=> { audio.muted = !audio.muted; setMuteIcon(refs); });

  refs.seek?.addEventListener('input', ()=>{
    if (!isFinite(audio.duration) || audio.duration<=0) return;
    audio.currentTime = (refs.seek.value/1000)*audio.duration;
  });
  if (refs.vol){
    refs.vol.value = String(cfg.volume);
    audio.volume = cfg.volume;
    refs.vol.addEventListener('input', ()=> { audio.volume = clamp01(parseFloat(refs.vol.value)); });
  }

  audio.addEventListener('timeupdate', ()=> paintTimes(refs));
  audio.addEventListener('durationchange', ()=> paintTimes(refs));
  audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(refs,false) : nextTrack(refs));

  root.addEventListener('keydown', (e)=>{
    if (e.code==='Space'){ e.preventDefault(); playPause(refs); }
    if (e.code==='ArrowLeft') prev(refs);
    if (e.code==='ArrowRight') next(refs);
    if (e.key?.toLowerCase?.()==='m') { audio.muted = !audio.muted; setMuteIcon(refs); }
  });

  if (cfg.autoplayMuted) {
    audio.muted = true; setMuteIcon(refs);
    const unmute = ()=>{ audio.muted=false; setMuteIcon(refs); window.removeEventListener('click', unmute, {once:true}); };
    window.addEventListener('click', unmute, { once:true });
  }
  setMuteIcon(refs);

  // selects
  refs.sel.stations?.addEventListener('change', ()=> onPickStations(refs,false));
  refs.sel.playlists?.addEventListener('change', ()=> onPickMusic(refs,false));
}

/* ---------- Helpers (UI) ---------- */
function setPlayIcon(refs,on){ if (refs.btn.play) refs.btn.play.textContent = on ? '⏸' : '▶'; }
function setMuteIcon(refs){ if (refs.btn.mute) refs.btn.mute.textContent = audio.muted ? '🔇' : '🔊'; }
function paintTimes(refs){
  const time = (el, txt)=>{ if (el) el.textContent = txt; };
  time(refs.timeCur, fmtTime(audio.currentTime));
  time(refs.timeDur, isFinite(audio.duration) ? fmtTime(audio.duration) : '—');
  if (refs.seek && isFinite(audio.duration) && audio.duration>0) {
    refs.seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
}
function setSwitch(refs, toPlaylists){
  usingStations = !toPlaylists;
  refs.switchKnob.setAttribute('aria-pressed', usingStations ? 'true' : 'false');
  refs.sel.stations?.classList.toggle('is-disabled', !usingStations);
  refs.sel.playlists?.classList.toggle('is-disabled', usingStations);
}
function fillSelect(selEl, arr){
  if (!selEl) return;
  selEl.innerHTML = '';
  arr.forEach((it,i)=>{
    const o=document.createElement('option');
    o.value = it.file;
    o.textContent = it.name || `Item ${i+1}`;
    selEl.appendChild(o);
  });
}

/* ---------- Loaders ---------- */
async function onPickStations(refs, autoPlay){
  setSwitch(refs, false);
  const file = refs.sel.stations?.value; if (!file) return;
  const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
  queue = await loadM3U({ path:file, base, audioBase:cfg.audioBase, isStation:true, selectedTitle:refs.sel.stations?.selectedOptions?.[0]?.textContent });
  cursor = 0;
  const stTitle = queue[0]?.title || 'Live Station';
  renderRadioList(refs, stTitle, lastNowTitle || '—', stationHistory(stTitle));
  setNow(refs, stTitle, 'Radio');
  if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(refs, 0);
}

async function onPickMusic(refs, autoPlay){
  setSwitch(refs, true);
  const file = refs.sel.playlists?.value; if (!file) return;
  const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
  let tracks = await loadM3U({ path:file, base, audioBase:cfg.audioBase, isStation:false });
  if (cfg.shuffle && tracks.length>1){
    for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
  }
  queue = tracks; cursor = 0;
  renderPlaylistList(refs, queue, (i)=> playAt(refs, i));
  setNow(refs, queue[0]?.title || '—', 'Playlist');
  if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(refs, 0);
}

function stationHistory(title){
  const key = stationKey(title, lastStreamUrl);
  return historyByStation.get(key) || [];
}

/* ---------- Playback ---------- */
async function tryPlayStream(urls){
  let lastErr;
  for (const u of urls){
    try { audio.src = u; await audio.play(); return u; }
    catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('No playable stream endpoints');
}

async function playAt(refs, i){
  if (!queue.length) return;
  cursor = (i + queue.length) % queue.length;
  const tr = queue[cursor];
  setNow(refs, tr.title, usingStations ? 'Radio' : 'Playlist');
  setPlayIcon(refs,false);
  stopMetaPolling();

  try{
    if (tr.isStream){
      const ok = await tryPlayStream(tr.urls);
      lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;
      setPlayIcon(refs,true);
      renderRadioList(refs, tr.title, lastNowTitle || '—', stationHistory(tr.title));
      highlightList(refs, cursor, usingStations);
      startMetaPolling(refs, tr.title);
      ensureMeter(audio);
    } else {
      audio.src = tr.url;
      await audio.play();
      // fetch local/YT/SC tags once
      try {
        const meta = await fetchTrackMeta(tr, cfg.corsProxy);
        const label = meta ? [meta.artist, meta.title].filter(Boolean).join(' - ') : tr.title;
        setNow(refs, label || tr.title, 'Playlist');
      } catch {}
      setPlayIcon(refs,true);
      highlightList(refs, cursor, usingStations);
      ensureMeter(audio);
    }
  } catch (e){
    setPlayIcon(refs,false);
    setNow(refs, tr.title, 'Failed to play — choose another');
  }
}

function playPause(refs){ if (!audio.src) return playAt(refs,0); if (audio.paused) audio.play().then(()=>setPlayIcon(refs,true)).catch(()=>{}); else { audio.pause(); setPlayIcon(refs,false);} }
function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} }
function prev(refs){ usingStations ? prevStation(refs) : prevTrack(refs); }
function next(refs){ usingStations ? nextStation(refs) : nextTrack(refs); }
function prevTrack(refs){ if (loopMode==='one') return playAt(refs,cursor); playAt(refs, cursor-1); }
function nextTrack(refs){
  if (loopMode==='one') return playAt(refs,cursor);
  if (cfg.shuffle) {
    let j = Math.floor(Math.random()*queue.length);
    if (queue.length>1 && j===cursor) j = (j+1)%queue.length;
    playAt(refs, j);
  } else {
    const n = cursor + 1;
    if (n >= queue.length) { if (loopMode==='all') return playAt(refs,0); setPlayIcon(refs,false); }
    else playAt(refs, n);
  }
}
function nextStation(refs){
  const el = refs.sel.stations; if (!el || !el.options.length) return;
  el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
  onPickStations(refs, true);
}
function prevStation(refs){
  const el = refs.sel.stations; if (!el || !el.options.length) return;
  el.selectedIndex = (el.selectedIndex - 1 + el.options.length) % el.options.length;
  onPickStations(refs, true);
}

/* ---------- Live metadata polling ---------- */
function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
function startMetaPolling(refs, stationTitle){
  stopMetaPolling();
  if (!lastStreamUrl) return;
  pollOnce(refs, stationTitle);
  metaTimer = setInterval(()=>pollOnce(refs, stationTitle), Math.max(5, cfg.metaPollSec)*1000);
}
async function pollOnce(refs, stationTitle){
  try {
    const meta = await fetchStreamMeta(lastStreamUrl, cfg.corsProxy);
    if (meta && (meta.now || meta.title)) {
      const display = meta.now || meta.title || '';
      if (display && display !== lastNowTitle) {
        lastNowTitle = display;
        setNow(refs, stationTitle || meta.title || 'Live Station', 'Radio');
        updateRadioNow(refs, display);
        appendStationHistory(stationTitle, display);
      }
    }
  } catch {}
  }
