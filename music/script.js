// /music/script.js — COMPLETE DROP-IN (SomaFM-only meta via channels.json; no ICY probes)

import { repoPrefix, clamp01, fmtTime } from './modules/utils.js';
import { loadM3U } from './modules/m3u.js';
import { ensureMeter } from './modules/meter.js';
import {
  buildShell,
  setNow,
  renderPlaylistList,
  renderRadioList,
  updateRadioNow,
  updateRadioListeners,
  highlightList,
  fillSelect
} from './modules/ui.js';
import { fetchJSONViaProxy } from './modules/cors.js';
import { fetchTrackMeta } from './modules/metadata.js';

// ---- Config & state ----
const root = document.querySelector('[data-mp]');
if (!root) { console.error('[music] Missing [data-mp] root'); }

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
    // use AllOrigins by default if nothing set
    corsProxy     : (attr('data-cors-proxy') || 'allorigins-raw').trim(),
    metaPollSec   : Math.max(5, Number(attr('data-meta-poll-sec') || 8)),
  };
})();

const audio = new Audio();
audio.preload = 'metadata';
audio.crossOrigin = 'anonymous';
audio.volume = cfg.volume;

let manifest = { stations: [], playlists: [] };
let queue = [];                  // [{ title, isStream, urls }] or file tracks
let cursor = -1;
let loopMode = 'none';
let usingStations = cfg.startSource !== 'playlists';
let lastStreamUrl = '';
let lastNowTitle  = '';
let metaTimer = null;

const historyByStation = new Map();
const stationKey = (title, url)=>{
  if (title && title.trim()) return title.trim();
  try { const u=new URL(url, location.href); return `${u.host}${u.pathname}`; } catch { return url||'unknown'; }
};
const stationHistory = (title)=> historyByStation.get(stationKey(title, lastStreamUrl)) || [];
const pushHistory = (title, item)=>{
  const key = stationKey(title, lastStreamUrl);
  const arr = historyByStation.get(key) || [];
  if (!arr.length || arr[arr.length-1] !== item){
    arr.push(item);
    if (arr.length > 250) arr.shift();
    historyByStation.set(key, arr);
  }
};

// ---- SomaFM channels.json helpers (no ICY, ever) ----
const SOMA_URL = 'https://somafm.com/channels.json';
let somaCache = { t: 0, rows: null };
const SOMA_TTL = 5000;

const toInt = v => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
const normalizeNow = (s)=>{
  if (!s) return '';
  let txt = String(s).replace(/\s+/g,' ').replace(/^['"“”‘’]+|['"“”‘’]+$/g, '').trim();
  txt = txt.replace(/\s*(\||•|—|-)\s*(radio|fm|am|live|station|stream|online|hq|ultra hd|4k)$/i, '').trim();
  txt = txt.replace(/\s*\b(32|64|96|128|160|192|256|320)\s?(kbps|kbit|kb|aac|mp3|opus|ogg)\b\s*$/i, '').trim();
  const parts = txt.split(' - ');
  if (parts.length >= 2) {
    const artist = parts.shift().trim();
    const title  = parts.join(' - ').trim();
    return `${artist} - ${title}`;
  }
  return txt;
};
const slug = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'').trim();

// Derive Soma id from URL path like "groovesalad-256-mp3" => "groovesalad"
function somaIdFromUrl(urlString){
  try{
    const u = new URL(urlString, location.href);
    const base = String(u.pathname || '').replace(/^\/+/, '').split('/')[0] || '';
    if (!base) return '';
    let id = base.replace(/\.(mp3|aacp?|ogg|pls|m3u8)$/i, '');
    id = id
      .replace(/-(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)(-(mp3|aacp?|aac|ogg))?$/i, '')
      .replace(/(320|256|192|160|150|144|130|128|112|104|96|80|72|64|56|48|40|32)$/i, '');
    if (id.includes('-')) id = id.split('-')[0];
    return id.toLowerCase();
  } catch { return ''; }
}

async function fetchSomaRows(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(ch => ({
    id: String(ch.id||'').toLowerCase(),
    title: String(ch.title||''),
    listeners: toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying||'')
  })) : [];
  if (rows.length) somaCache = { t: now, rows };
  return rows;
}

async function fetchSomaNow(streamUrl, proxy, hints={}){
  const rows = await fetchSomaRows(proxy);
  if (!rows.length) return null;

  const candidates = [];
  if (hints.id)   candidates.push(String(hints.id).toLowerCase());
  if (hints.name) candidates.push(slug(hints.name));
  const fromUrl = somaIdFromUrl(streamUrl);
  if (fromUrl) candidates.push(fromUrl);

  // try id match
  for (const c of candidates){
    const byId = rows.find(r => r.id === c);
    if (byId) return {
      id: byId.id,
      title: byId.title || `SomaFM • ${byId.id}`,
      listeners: byId.listeners,
      now: normalizeNow(byId.lastPlaying)
    };
  }

  // try title slug match
  const wanted = slug(hints.name || '');
  if (wanted) {
    const byTitle = rows.find(r => slug(r.title) === wanted);
    if (byTitle) return {
      id: byTitle.id,
      title: byTitle.title,
      listeners: byTitle.listeners,
      now: normalizeNow(byTitle.lastPlaying)
    };
  }
  return null;
}

// ---- Boot ----
(async function boot(){
  try{
    const refs = buildShell(root, cfg.volume);
    wireUI(refs);

    // Load manifest
    const mf = await (async ()=>{
      try {
        const r = await fetch(cfg.manifestUrl, { cache:'no-store' });
        return r.ok ? await r.json() : {};
      } catch(e){
        console.error('[music] manifest fetch error:', e);
        return {};
      }
    })();
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

    fillSelect(refs.sel.stations,  manifest.stations);
    fillSelect(refs.sel.playlists, manifest.playlists);

    // Start mode
    let mode = cfg.startSource;
    if (mode === 'auto'){
      const both = manifest.stations.length && manifest.playlists.length;
      mode = both ? (Math.random()<0.5?'stations':'playlists')
           : (manifest.stations.length?'stations':'playlists');
    }
    setSwitch(refs, mode === 'playlists');

    if (mode==='stations' && manifest.stations.length){
      refs.sel.stations.selectedIndex = 0; await onPickStations(refs, false);
    } else if (manifest.playlists.length){
      refs.sel.playlists.selectedIndex = 0; await onPickMusic(refs, false);
    } else {
      setNow(refs, 'No playlists found', '—');
    }

    // Autoplay muted fallback
    if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
      if (mode==='stations' && manifest.stations.length) await onPickStations(refs, true);
      else if (manifest.playlists.length) await onPickMusic(refs, true);
    }
  } catch (e) {
    console.error('[music] boot error:', e);
  }
})();

// ---- UI wiring ----
function wireUI(refs){
  // Switch: aria-pressed="true" => RADIO is active
  refs.switchKnob?.addEventListener('click', async ()=>{
    const isRadio = (refs.switchKnob.getAttribute('aria-pressed') === 'true');
    setSwitch(refs, isRadio); // flip to playlists if radio was active
    if (usingStations) {
      if (refs.sel.stations?.options.length) await onPickStations(refs, true);
    } else {
      if (refs.sel.playlists?.options.length) await onPickMusic(refs, true);
    }
  });

  refs.btn.play?.addEventListener('click', ()=> playPause(refs));
  refs.btn.stop?.addEventListener('click', ()=> stop());
  refs.btn.prev?.addEventListener('click', ()=> prev(refs));
  refs.btn.next?.addEventListener('click', ()=> next(refs));

  refs.btn.shuffle?.addEventListener('click', ()=> {
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
    audio.muted = !audio.muted;
    setMuteIcon(refs);
  });

  refs.seek?.addEventListener('input', ()=>{
    if (!isFinite(audio.duration) || audio.duration<=0) return;
    audio.currentTime = (refs.seek.value / 1000) * audio.duration;
  });

  if (refs.vol){
    refs.vol.value = String(cfg.volume);
    audio.volume = cfg.volume;
    refs.vol.addEventListener('input', ()=>{
      const v = parseFloat(refs.vol.value);
      audio.volume = clamp01(Number.isFinite(v) ? v : cfg.volume);
    });
  }

  audio.addEventListener('timeupdate', ()=> paintTimes(refs));
  audio.addEventListener('durationchange', ()=> paintTimes(refs));
  audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(refs,false) : nextTrack(refs));

  // Autoplay-muted UX
  if (cfg.autoplayMuted){
    audio.muted = true; setMuteIcon(refs);
    const unmute = ()=>{
      audio.muted = false; setMuteIcon(refs);
      window.removeEventListener('click', unmute, { once:true });
    };
    window.addEventListener('click', unmute, { once:true });
  }
  setMuteIcon(refs);

  root.addEventListener('keydown', (e)=>{
    if (e.code === 'Space'){ e.preventDefault(); playPause(refs); }
    if (e.code === 'ArrowLeft') prev(refs);
    if (e.code === 'ArrowRight') next(refs);
    if ((e.key||'').toLowerCase() === 'm'){
      audio.muted = !audio.muted; setMuteIcon(refs);
    }
  });

  refs.sel.stations?.addEventListener('change', ()=> onPickStations(refs,false));
  refs.sel.playlists?.addEventListener('change', ()=> onPickMusic(refs,false));
}

function setSwitch(refs, toPlaylists){
  usingStations = !toPlaylists;
  refs.switchKnob?.setAttribute('aria-pressed', usingStations ? 'true' : 'false');
  refs.sel.stations?.classList.toggle('is-disabled', !usingStations);
  refs.sel.playlists?.classList.toggle('is-disabled', usingStations);
}
function setPlayIcon(refs,on){ if (refs.btn.play) refs.btn.play.textContent = on ? '⏸' : '▶'; }
function setMuteIcon(refs){ if (refs.btn.mute) refs.btn.mute.textContent = audio.muted ? '🔇' : '🔊'; }
function paintTimes(refs){
  const t = (el, txt)=>{ if (el) el.textContent = txt; };
  t(refs.timeCur, fmtTime(audio.currentTime));
  t(refs.timeDur, isFinite(audio.duration) ? fmtTime(audio.duration) : '—');
  if (refs.seek && isFinite(audio.duration) && audio.duration>0) {
    refs.seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
}

// ---- Selections ----
async function onPickStations(refs, autoPlay){
  try{
    setSwitch(refs, false);
    const file = refs.sel.stations?.value; if (!file) return;
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    queue = await loadM3U({ path:file, base, audioBase:cfg.audioBase, isStation:true, selectedTitle:refs.sel.stations?.selectedOptions?.[0]?.textContent, proxy: cfg.corsProxy });
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    lastNowTitle = '';
    renderRadioList(refs, stTitle, '—', stationHistory(stTitle), undefined);
    setNow(refs, stTitle, 'Radio');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(refs, 0);
  } catch (e) {
    console.error('[music] onPickStations error:', e);
  }
}

async function onPickMusic(refs, autoPlay){
  try{
    setSwitch(refs, true);
    const file = refs.sel.playlists?.value; if (!file) return;
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    let tracks = await loadM3U({ path:file, base, audioBase:cfg.audioBase, isStation:false, proxy: cfg.corsProxy });
    if (cfg.shuffle && tracks.length>1){
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylistList(refs, queue, (i)=> playAt(refs, i));
    setNow(refs, queue[0]?.title || '—', 'Playlist');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(refs, 0);
  } catch (e) {
    console.error('[music] onPickMusic error:', e);
  }
}

// ---- Playback ----
async function tryPlayStream(urls){
  let lastErr;
  for (const u of urls){
    try { audio.src = u; await audio.play(); return u; }
    catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('No playable endpoints');
}

async function playAt(refs, i){
  if (!queue.length) return;
  cursor = (i + queue.length) % queue.length;
  const tr = queue[cursor];

  setNow(refs, tr.title, usingStations ? 'Radio' : 'Playlist');
  setPlayIcon(refs, false);
  stopMetaPolling();

  try{
    if (tr.isStream){
      const ok = await tryPlayStream(tr.urls);
      lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;

      setPlayIcon(refs, true);
      renderRadioList(refs, tr.title, '—', stationHistory(tr.title));
      highlightList(refs, cursor, usingStations);
      startMetaPolling(refs, tr.title, { idGuess: somaIdFromUrl(lastStreamUrl) });
      ensureMeter(audio);

    } else {
      audio.src = tr.url;
      await audio.play();

      // one-shot local file meta (if any)
      try{
        const meta = await fetchTrackMeta(tr);
        const label = meta ? [meta.artist, meta.title].filter(Boolean).join(' - ') : tr.title;
        setNow(refs, label || tr.title, 'Playlist');
      }catch{}

      setPlayIcon(refs, true);
      highlightList(refs, cursor, usingStations);
      ensureMeter(audio);
    }
  }catch(e){
    console.error('[music] playAt error:', e);
    setPlayIcon(refs, false);
    setNow(refs, tr.title, 'Failed to play — choose another');
  }
}

function playPause(refs){
  if (!audio.src) return playAt(refs, 0);
  if (audio.paused) audio.play().then(()=>setPlayIcon(refs,true)).catch(()=>{});
  else { audio.pause(); setPlayIcon(refs,false); }
}
function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} }
function prev(refs){ usingStations ? prevStation(refs) : prevTrack(refs); }
function next(refs){ usingStations ? nextStation(refs) : nextTrack(refs); }
function prevTrack(refs){ if (loopMode==='one') return playAt(refs,cursor); playAt(refs, cursor-1); }
function nextTrack(refs){
  if (loopMode==='one') return playAt(refs,cursor);
  if (cfg.shuffle){
    let j = Math.floor(Math.random()*queue.length);
    if (queue.length>1 && j===cursor) j = (j+1)%queue.length;
    playAt(refs, j);
  } else {
    const n = cursor + 1;
    if (n >= queue.length){ if (loopMode==='all') return playAt(refs,0); setPlayIcon(refs,false); }
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

// ---- Live meta polling (SomaFM ONLY) ----
function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer = null; } }
function startMetaPolling(refs, stationTitle, hints){
  stopMetaPolling();
  if (!lastStreamUrl) return;
  pollOnce(refs, stationTitle, hints); // immediate
  metaTimer = setInterval(()=>pollOnce(refs, stationTitle, hints), cfg.metaPollSec * 1000);
}

async function pollOnce(refs, stationTitle, hints){
  try{
    const meta = await fetchSomaNow(lastStreamUrl, cfg.corsProxy, {
      id: hints?.idGuess,
      name: stationTitle
    });
    if (!meta) return;

    // listeners
    if (typeof meta.listeners === 'number') updateRadioListeners(refs, meta.listeners);

    // lastPlaying
    const label = (meta.now || meta.title || '').trim();
    if (label && label !== lastNowTitle){
      lastNowTitle = label;
      setNow(refs, stationTitle || meta.title || 'Live Station', 'Radio');
      updateRadioNow(refs, label);
      pushHistory(stationTitle || 'Live Station', label);
    }
  } catch (e){
    // Fail silently but keep polling
    // console.debug('[music] soma poll err', e);
  }
                           }
