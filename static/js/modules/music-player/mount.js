// static/js/modules/music-player/mount.js
// Orchestrator: builds UI, loads manifest, hooks controls, and wires playback.

// Existing helpers
import { $, clamp01 } from './utils.js';
import { fetchNowPlaying } from './meta.js';

// New submodules
import { buildUI, uiHelpers }     from './ui.js';
import { loadM3U }                from './m3u.js';
import { loadManifest, fillSelects } from './manifest.js';
import { createTicker }           from './ticker.js';
import { createPlayback }         from './playback.js';

export function mount(root, opts = {}) {
  if (!root) return;

  // ------- Config -------
  const cfg = {
    manifestUrl   : root.dataset.manifestUrl  || opts.manifestUrl  || '/static/audio/music/playlists/manifest.json',
    audioBase     : root.dataset.audioBase    || opts.audioBase    || '/static/audio/music/',
    autoplay      : (root.dataset.autoplay ?? (opts.autoplay ? '1':'0')) === '1',
    autoplayMuted : (root.dataset.autoplayMuted ?? (opts.autoplayMuted ? '1':'0')) === '1',
    shuffle       : (root.dataset.shuffle ?? (opts.shuffle ? '1':'0')) === '1',
    volume        : clamp01(parseFloat(root.dataset.volume ?? (opts.volume ?? 0.25))),
    startSource   : root.dataset.startSource  || opts.startSource || 'stations',
    corsProxy     : root.dataset.corsProxy    || opts.corsProxy || 'allorigins-raw',
    metaPollSec   : Math.max(5, Number(root.dataset.metaPollSec || opts.metaPollSec || 8)),
  };

  // ------- UI scaffold & refs -------
  const refs = buildUI(root, cfg);
  const { titleEl, subEl, switchKnob, btns, timeCur, timeDur, seek, vol, list, selStations, selMusic } = refs;

  const { setNow, setPlayIcon, setMuteIcon, paintTimes, setSourceUI, renderQueue, highlightList } =
    uiHelpers({ titleEl, subEl, list, timeCur, timeDur, seek });

  // ------- State -------
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.volume = cfg.volume;

  let queue = [];
  let cursor = -1;
  let loopMode = 'none';
  let activeSource = (cfg.startSource === 'playlists') ? 'playlists' : 'stations';
  let manifest = { stations: [], playlists: [] };
  let metaTimer = 0;
  let lastStreamUrl = '';
  let lastNow = '';

  const ticker = createTicker({
    getStreamUrl: () => lastStreamUrl,
    getTrackMeta: () => queue[cursor]?.meta,
    pollSec: cfg.metaPollSec,
    corsProxy: cfg.corsProxy,
    fetchNowPlaying,
    setNow: (label) => {
      if (label && label !== lastNow) {
        lastNow = label;
        setNow(label, 'Radio');
        try {
          const row = list?.children[cursor];
          const tDiv = row?.querySelector('.t');
          if (tDiv && !queue[cursor]?._titleOverridden) tDiv.textContent = label;
        } catch {}
      }
    },
    onTimerId: (id) => { metaTimer = id; },
  });

  function clearMetaTimer(){ if (metaTimer) { clearInterval(metaTimer); metaTimer = 0; } }

  // ------- Core helpers -------
  async function tryPlayStream(urls){
    let lastErr;
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch(e){ lastErr=e; }
    }
    throw (lastErr || new Error('No playable stream endpoints'));
  }

  async function onPickStations(){
    if (!manifest.stations.length) return;
    const idx = Math.max(0, selStations.selectedIndex);
    const def = manifest.stations[idx];
    const meta = def.meta || {};
    queue = await loadM3U(def.file, true, {
      title: def.name,
      kind: meta.kind,
      meta
    }, cfg);
    cursor = -1;
    renderQueue(queue, cursor);
    setNow('—','Radio');
    if (cfg.autoplay) playAt(0);
  }

  async function onPickMusic(){
    if (!manifest.playlists.length) return;
    const idx = Math.max(0, selMusic.selectedIndex);
    const def = manifest.playlists[idx];
    queue = await loadM3U(def.file, false, null, cfg, { shuffle: cfg.shuffle });
    cursor = -1;
    renderQueue(queue, cursor);
    setNow('—','Playlist');
    if (cfg.autoplay) playAt(0);
  }

  async function playAt(i){
    if (!queue.length) return;
    cursor = (i + queue.length) % queue.length;
    const tr = queue[cursor];
    setNow(tr.title, activeSource === 'stations' ? 'Radio' : 'Playlist');
    setPlayIcon(false);
    clearMetaTimer();
    lastNow = '';

    try {
      if (tr.isStream && Array.isArray(tr.urls) && tr.urls.length){
        const ok = await tryPlayStream(tr.urls);
        lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;
      } else {
        audio.src = tr.url;
        lastStreamUrl = '';
        await audio.play();
      }
      setPlayIcon(true);
      highlightList(cursor);

      // Kick off metadata polling for live streams
      if (tr.isStream) ticker.start();
    } catch (e) {
      next();
    }
  }

  const {
    playPause, stop, prev, next,
    toggleShuffle, toggleLoopAll, toggleLoopOne, toggleMute
  } = createPlayback({
    audio, cfg,
    getState: () => ({ queue, cursor, loopMode, activeSource, manifest }),
    setState: (patch) => {
      if ('cursor' in patch) cursor = patch.cursor;
      if ('loopMode' in patch) loopMode = patch.loopMode;
      if ('activeSource' in patch) activeSource = patch.activeSource;
    },
    ui: { setPlayIcon, setMuteIcon, setSourceUI, renderQueue, highlightList, setNow },
    pickers: { onPickStations, onPickMusic },
    dom: { selStations, selMusic },
    onPlayAt: playAt,
    onStopMeta: () => { clearMetaTimer(); lastNow=''; ticker.stop(); },
  });

  // ------- Wire events -------
  btns.play?.addEventListener('click', playPause);
  btns.stop?.addEventListener('click', stop);
  btns.prev?.addEventListener('click', prev);
  btns.next?.addEventListener('click', next);
  btns.shuffle?.addEventListener('click', () => { toggleShuffle(); btns.shuffle?.classList.toggle('active', cfg.shuffle); });
  btns.loop?.addEventListener('click', () => { toggleLoopAll(); btns.loop?.classList.toggle('active', loopMode==='all'); btns.loop1?.classList.remove('active');});
  btns.loop1?.addEventListener('click', () => { toggleLoopOne(); btns.loop1?.classList.toggle('active', loopMode==='one'); btns.loop?.classList.remove('active');});
  btns.mute?.addEventListener('click', toggleMute);

  switchKnob.addEventListener('click', ()=>{
    const pressed = switchKnob.getAttribute('aria-pressed') === 'true';
    const nextSource = pressed ? 'playlists' : 'stations';
    // Switch source
    ticker.stop();
    clearMetaTimer();
    lastNow = '';
    activeSource = nextSource;
    setSourceUI(activeSource, selStations, selMusic);
    if (activeSource === 'stations') onPickStations(); else onPickMusic();
  });

  seek?.addEventListener('input', ()=>{
    if (!isFinite(audio.duration) || audio.duration<=0) return;
    audio.currentTime = (seek.value/1000) * audio.duration;
  });
  vol?.addEventListener('input', ()=>{ audio.volume = clamp01(parseFloat(vol.value || String(cfg.volume))); });

  audio.addEventListener('timeupdate', () => paintTimes(audio));
  audio.addEventListener('durationchange', () => paintTimes(audio));
  audio.addEventListener('ended', ()=>{
    if (activeSource === 'playlists' && queue.length > 0){
      if (loopMode === 'one') return playAt(cursor);
      const n = cursor + 1;
      if (n >= queue.length){
        if (loopMode === 'all') playAt(0);
        else setPlayIcon(false);
      } else {
        playAt(n);
      }
    }
  });

  root.addEventListener('keydown', (e)=>{
    if (e.code === 'Space'){ e.preventDefault(); playPause(); }
    if (e.code === 'ArrowLeft') prev();
    if (e.code === 'ArrowRight') next();
    if (e.key && e.key.toLowerCase() === 'm') toggleMute();
  });

  if (cfg.autoplayMuted) {
    audio.muted = true; setMuteIcon(audio);
    const unmute=()=>{audio.muted=false; setMuteIcon(audio); window.removeEventListener('click', unmute, {once:true});};
    window.addEventListener('click', unmute, {once:true});
  }
  setMuteIcon(audio);

  // ------- Init -------
  (async function init(){
    setNow('—','—');

    const mf = await loadManifest(cfg.manifestUrl);
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

    fillSelects({ selStations, selMusic }, manifest);

    btns.shuffle?.classList.toggle('active', cfg.shuffle);

    if (manifest.stations.length && selStations.selectedIndex < 0) selStations.selectedIndex = 0;
    if (manifest.playlists.length && selMusic.selectedIndex < 0) selMusic.selectedIndex = 0;
    switchKnob.setAttribute('aria-pressed', activeSource === 'stations' ? 'true' : 'false');
    setSourceUI(activeSource, selStations, selMusic);

    if (activeSource === 'stations' && manifest.stations.length){
      await onPickStations();
    } else if (manifest.playlists.length) {
      await onPickMusic();
    }

    if (cfg.autoplay && !cfg.autoplayMuted && audio.paused) {
      try { await audio.play(); } catch {
        audio.muted = true; setMuteIcon(audio);
        try { await audio.play(); } catch {}
      }
    }
  })();

  selStations.addEventListener('change', ()=>{
    if(activeSource==='stations') { ticker.stop(); clearMetaTimer(); lastNow=''; onPickStations(); }
  });
  selMusic.addEventListener('change', ()=>{
    if(activeSource==='playlists'){ ticker.stop(); clearMetaTimer(); lastNow=''; onPickMusic(); }
  });
}

// Auto-mount single player
const autoRoot = document.querySelector('[data-mp]');
if (autoRoot) mount(autoRoot);
