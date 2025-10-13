// /music/script.js — wrapper: wiring + state (SomaFM channels.json meta only)
import { repoPrefix, $, $$, clamp01, isAbs, join, fmtTime, corsWrap } from './modules/utils.js';
import { loadM3U } from './modules/m3u.js';
import { fetchTrackMeta } from './modules/metadata.js';       // keep for playlist tracks
import { ensureMeter } from './modules/meter.js';
import { buildShell, setNow, renderPlaylistList, renderRadioList, updateRadioNow, updateRadioListeners, highlightList } from './modules/ui.js';

// Keep your existing AllOrigins helpers (used by our JSON fetcher where needed)
const AO_BASE = 'https://api.allorigins.win';
function aoWrap(url, mode='raw') {
  const enc = encodeURIComponent(url);
  return `${AO_BASE}/${mode==='json'?'get':'raw'}?url=${enc}&disableCache=true`;
}
function wrapProxy(proxy, url, prefer='raw') {
  if (!url) return '';
  if (!proxy) return url;
  const p = String(proxy).toLowerCase();
  if (p.startsWith('allorigins')) return aoWrap(url, p.includes('json') ? 'json' : 'raw');
  return corsWrap(proxy, url);
}
async function fetchTextViaProxy(url, proxy) {
  const p = String(proxy||'').toLowerCase();
  if (p.startsWith('allorigins')) {
    try { const r = await fetch(aoWrap(url,'raw'), { cache:'no-store' }); if (r.ok) return await r.text(); } catch {}
    try { const r = await fetch(aoWrap(url,'json'), { cache:'no-store' }); if (!r.ok) return ''; const j = await r.json(); return String(j?.contents || ''); } catch {}
    return '';
  }
  try { const r = await fetch(wrapProxy(proxy, url, 'raw'), { cache:'no-store' }); return r.ok ? await r.text() : ''; } catch { return ''; }
}
async function fetchJSONViaProxy(url, proxy) {
  const p = String(proxy||'').toLowerCase();
  if (p.startsWith('allorigins')) {
    try { const r = await fetch(aoWrap(url,'raw'), { cache:'no-store' }); if (r.ok) return await r.json(); } catch {}
    try {
      const r = await fetch(aoWrap(url,'json'), { cache:'no-store' }); if (!r.ok) return null;
      const j = await r.json(); const txt = j?.contents || ''; if (!txt) return null;
      try { return JSON.parse(txt); } catch { return null; }
    } catch {}
    return null;
  }
  try { const r = await fetch(wrapProxy(proxy, url, 'raw'), { cache:'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

// ====== SomaFM-only now-playing (id, title, listeners, lastPlaying) ======
const SOMA_URL = 'https://somafm.com/channels.json';
const SOMA_TTL = 5000; // ms
let somaCache = { t: 0, rows: null };

const toInt = (v)=> {
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
function somaIdFromUrl(u){
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
async function getSomaRows(proxy){
  const now = Date.now();
  if (somaCache.rows && (now - somaCache.t) < SOMA_TTL) return somaCache.rows;
  const j = await fetchJSONViaProxy(SOMA_URL, proxy);
  const rows = Array.isArray(j?.channels) ? j.channels.map(ch => ({
    id: String(ch.id || '').toLowerCase(),
    title: String(ch.title || ''),
    listeners: toInt(ch.listeners),
    lastPlaying: String(ch.lastPlaying || ''),
  })) : [];
  if (rows.length) somaCache = { t: now, rows };
  return rows;
}
async function fetchSomaNow(streamUrl, proxy, hints = {}){
  const rows = await getSomaRows(proxy);
  if (!rows?.length) return null;

  // Try id first (hint or from URL)
  const hintId = String(hints.id || somaIdFromUrl(streamUrl) || '').toLowerCase();
  let row = hintId ? rows.find(r => r.id === hintId) : null;

  // Fallback by station name
  if (!row && hints.name){
    const want = slug(hints.name);
    row = rows.find(r => slug(r.title) === want) || null;
  }
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    listeners: row.listeners,
    now: normalizeNow(row.lastPlaying || '')
  };
}
// ============================================================

// ----- Config -----
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
    corsProxy     : (attr('data-cors-proxy') || 'allorigins-raw').trim(),
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
  throw lastErr || new Error('No playable endpoints');
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

/* ---------- Live metadata polling (SomaFM channels.json ONLY) ---------- */
function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
function startMetaPolling(refs, stationTitle){
  stopMetaPolling();
  if (!lastStreamUrl) return;
  pollOnce(refs, stationTitle);
  metaTimer = setInterval(()=>pollOnce(refs, stationTitle), Math.max(5, cfg.metaPollSec)*1000);
}
async function pollOnce(refs, stationTitle){
  try {
    const meta = await fetchSomaNow(lastStreamUrl, cfg.corsProxy, {
      id: somaIdFromUrl(lastStreamUrl),
      name: stationTitle
    });
    if (!meta) return;

    // listeners every time
    if (typeof meta.listeners === 'number') updateRadioListeners(refs, meta.listeners);

    // lastPlaying
    const display = (meta.now || meta.title || '').trim();
    if (display && display !== lastNowTitle) {
      lastNowTitle = display;
      setNow(refs, stationTitle || meta.title || 'Live Station', 'Radio');
      updateRadioNow(refs, display);
      appendStationHistory(stationTitle, display);
    }
  } catch {}
  }
