// Music Player (modular wrapper) — uses meta.js for robust live metadata
import { isAbs, join } from './utils.js';
import { fetchLiveNow } from './meta.js';

const fmtTime = (sec) => (!isFinite(sec)||sec<0) ? '—'
  : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

function parseM3U(text){
  const lines = String(text||'').split(/\r?\n/);
  const out = []; let pending = null;
  for (const raw of lines){
    const line = raw.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;
    if (line.startsWith('#EXTINF:')){
      const i = line.indexOf(',');
      pending = (i>=0? line.slice(i+1).trim() : null);
      continue;
    }
    if (!line.startsWith('#')) out.push({ url: line, title: pending||line }), pending=null;
  }
  return out;
}

async function fetchJSON(u){ try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }catch{return null;} }
async function fetchText(u){ try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw 0; return await r.text(); }catch{return ''; } }

function buildUI(root){
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-now">
        <div class="mp-title mono">—</div>
        <div class="mp-sub small">—</div>
      </div>

      <div class="mp-controls" role="toolbar" aria-label="Playback">
        <div class="mp-switch" aria-label="Source">
          <button class="mp-switch-knob" type="button" aria-pressed="true" title="Left = Radio Stations, Right = Playlists"></button>
        </div>

        <button class="mp-btn" data-act="prev"    title="Previous (⟵)">⏮</button>
        <button class="mp-btn" data-act="play"    title="Play/Pause (Space)">▶</button>
        <button class="mp-btn" data-act="stop"    title="Stop">⏹</button>
        <button class="mp-btn" data-act="next"    title="Next (⟶)">⏭</button>
        <button class="mp-btn" data-act="shuffle" title="Shuffle">🔀</button>
        <button class="mp-btn" data-act="loop"    title="Loop all">🔁</button>
        <button class="mp-btn" data-act="loop1"   title="Loop one">🔂</button>
        <button class="mp-btn" data-act="mute"    title="Mute/Unmute">🔊</button>
      </div>
    </div>

    <div class="mp-middle">
      <div class="mp-time mono"><span data-cur>00:00</span> / <span data-dur>—</span></div>
      <input type="range" class="mp-seek" min="0" max="1000" value="0" step="1" aria-label="Seek">
      <div class="mp-vol"><input type="range" class="mp-volume" min="0" max="1" step="0.01" value="0.5" aria-label="Volume"></div>
    </div>

    <div class="mp-bottom">
      <div class="mp-left">
        <label class="small">Radio Stations (.m3u)</label>
        <select class="mp-pl mp-pl-stations"></select>

        <label class="small" style="margin-top:.6rem;display:block;">Playlists (.m3u)</label>
        <select class="mp-pl mp-pl-music"></select>
      </div>
      <div class="mp-right">
        <label class="small">Tracks</label>
        <ul class="mp-list" role="listbox" aria-label="Tracks"></ul>
      </div>
    </div>
  `;
  return {
    titleEl: $('.mp-title', root),
    subEl:   $('.mp-sub', root),
    switchKnob: $('.mp-switch-knob', root),
    btn: {
      prev:    $('[data-act="prev"]', root),
      play:    $('[data-act="play"]', root),
      stop:    $('[data-act="stop"]', root),
      next:    $('[data-act="next"]', root),
      shuffle: $('[data-act="shuffle"]', root),
      loop:    $('[data-act="loop"]', root),
      loop1:   $('[data-act="loop1"]', root),
      mute:    $('[data-act="mute"]', root),
    },
    timeCur: $('[data-cur]', root),
    timeDur: $('[data-dur]', root),
    seek:    $('.mp-seek', root),
    vol:     $('.mp-volume', root),
    list:    $('.mp-list', root),
    selStations: $('.mp-pl-stations', root),
    selMusic:    $('.mp-pl-music', root),
  };
}

export async function mountPlayer(root, opts={}){
  if (!root) return;

  const cfg = {
    manifestUrl   : root.dataset.manifestUrl  || opts.manifestUrl,
    audioBase     : root.dataset.audioBase    || opts.audioBase || '/',
    autoplay      : (root.dataset.autoplay ?? (opts.autoplay ? '1':'0')) === '1',
    autoplayMuted : (root.dataset.autoplayMuted ?? (opts.autoplayMuted ? '1':'0')) === '1',
    shuffle       : (root.dataset.shuffle ?? (opts.shuffle ? '1':'0')) === '1',
    volume        : parseFloat(root.dataset.volume ?? (opts.volume ?? 0.5)),
    startSource   : root.dataset.startSource  || opts.startSource || 'stations',
    corsProxy     : root.dataset.corsProxy    || opts.corsProxy || '',
    metaPollSec   : Math.max(5, Number(root.dataset.metaPollSec || opts.metaPollSec || 8)),
  };

  const R = buildUI(root);
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  let manifest = { stations: [], playlists: [] };
  let queue = [];
  let cursor = -1;
  let loopMode = 'none';
  let activeSource = (cfg.startSource === 'playlists') ? 'playlists' : 'stations';
  let metaTimer = 0;
  let lastStreamUrl = '';
  let lastNow = '';

  const setNow = (t, s='—') => {
    const txt = t || '—';
    if (R.titleEl) {
      R.titleEl.textContent = txt;
      requestAnimationFrame(() => {
        const over = R.titleEl.scrollWidth > R.titleEl.clientWidth + 2;
        R.titleEl.classList.toggle('ticker', over);
      });
    }
    if (R.subEl) R.subEl.textContent = s || '—';
  };
  const setPlayIcon = (on) => { if (R.btn.play) R.btn.play.textContent = on ? '⏸' : '▶'; };
  const setMuteIcon = () => { if (R.btn.mute) R.btn.mute.textContent = audio.muted ? '🔇' : '🔊'; };
  const paintTimes = () => {
    if (R.timeCur) R.timeCur.textContent = fmtTime(audio.currentTime);
    if (R.timeDur) R.timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
    if (R.seek && isFinite(audio.duration) && audio.duration>0){
      R.seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
    }
  };

  function setSourceUI(){
    const stationsActive = (activeSource === 'stations');
    R.switchKnob.setAttribute('aria-pressed', stationsActive ? 'true' : 'false');
    R.selStations.disabled = !stationsActive;
    R.selStations.classList.toggle('is-disabled', !stationsActive);
    R.selMusic.disabled = stationsActive;
    R.selMusic.classList.toggle('is-disabled', stationsActive);
  }

  function renderQueue(){
    if (!R.list) return; R.list.innerHTML = '';
    queue.forEach((t, i) => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const right = document.createElement('div');
      left.className = 't'; right.className = 'len mono';
      left.textContent = t.title || `Track ${i+1}`;
      right.textContent = t.isStream ? 'LIVE' : (t.length ? fmtTime(t.length) : '');
      li.appendChild(left); li.appendChild(right);
      li.addEventListener('click', ()=> playAt(i));
      R.list.appendChild(li);
    });
    highlightList();
  }
  function highlightList(){
    if (!R.list) return;
    $$('.active', R.list).forEach(li => li.classList.remove('active'));
    if (cursor >= 0) R.list.children[cursor]?.classList.add('active');
  }
  function clearMetaTimer(){ if (metaTimer) { clearInterval(metaTimer); metaTimer = 0; } }

  function startMetaTicker(track){
    clearMetaTimer();
    if (!track?.isStream) return;

    const poll = async () => {
      const info = await fetchLiveNow({
        lastStreamUrl,
        stationMeta: track.meta && track.kind ? { ...track.meta, kind: track.kind } : null,
        proxy: cfg.corsProxy
      });
      if (info && (info.now || info.title)) {
        const label = info.now || info.title || '';
        if (label && label !== lastNow) {
          lastNow = label;
          setNow(label, 'Radio');
          try {
            const row = R.list?.children[cursor];
            const tDiv = row?.querySelector('.t');
            if (tDiv && !track._titleOverridden) tDiv.textContent = label;
          } catch {}
        }
      }
    };

    poll();
    metaTimer = setInterval(poll, cfg.metaPollSec * 1000);
  }

  async function tryPlayStream(urls){
    let lastErr;
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('No playable stream endpoints');
  }

  async function loadM3U(path, isStation, stationMeta){
    const url = isAbs(path) ? path : join(cfg.manifestUrl.replace(/\/manifest\.json$/i,''), path);
    const txt = await fetchText(url);
    const entries = parseM3U(txt);
    if (!entries.length) return [];
    if (isStation){
      return [{
        title: stationMeta?.title || 'Live Station',
        isStream: true,
        urls: entries.map(e => isAbs(e.url) ? e.url : join(cfg.audioBase, e.url)),
        kind: stationMeta?.kind || stationMeta?.meta?.kind,
        meta: stationMeta?.meta || stationMeta
      }];
    } else {
      return entries.map(e => ({
        title: e.title || e.url,
        url: isAbs(e.url) ? e.url : join(cfg.audioBase, e.url),
        isStream: false
      }));
    }
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
      highlightList();
      startMetaTicker(tr);
    } catch(e){ next(); }
  }

  function playPause(){ if (!audio.src) return playAt(0); if (audio.paused) audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); else { audio.pause(); setPlayIcon(false);} }
  function stop(){ audio.pause(); try{audio.currentTime=0;}catch{} setPlayIcon(false); clearMetaTimer(); lastNow=''; }
  function prev(){
    if (activeSource === 'stations'){
      if (!manifest.stations.length) return;
      const i = (R.selStations.selectedIndex - 1 + manifest.stations.length) % manifest.stations.length;
      R.selStations.selectedIndex = i; onPickStations();
    } else {
      if (!manifest.playlists.length) return;
      const i = (R.selMusic.selectedIndex - 1 + manifest.playlists.length) % manifest.playlists.length;
      R.selMusic.selectedIndex = i; onPickMusic();
    }
  }
  function next(){
    if (activeSource === 'stations'){
      if (!manifest.stations.length) return;
      const i = (R.selStations.selectedIndex + 1) % manifest.stations.length;
      R.selStations.selectedIndex = i; onPickStations();
    } else {
      if (!manifest.playlists.length) return;
      const i = (R.selMusic.selectedIndex + 1) % manifest.playlists.length;
      R.selMusic.selectedIndex = i; onPickMusic();
    }
  }

  R.btn.play?.addEventListener('click', playPause);
  R.btn.stop?.addEventListener('click', stop);
  R.btn.prev?.addEventListener('click', prev);
  R.btn.next?.addEventListener('click', next);
  R.btn.shuffle?.addEventListener('click', ()=>{ cfg.shuffle = !cfg.shuffle; R.btn.shuffle.classList.toggle('active', cfg.shuffle); });
  R.btn.loop?.addEventListener('click', ()=>{ loopMode = (loopMode==='all')?'none':'all'; R.btn.loop.classList.toggle('active', loopMode==='all'); R.btn.loop1?.classList.remove('active'); });
  R.btn.loop1?.addEventListener('click', ()=>{ loopMode = (loopMode==='one')?'none':'one'; R.btn.loop1.classList.toggle('active', loopMode==='one'); R.btn.loop?.classList.remove('active'); });
  R.btn.mute?.addEventListener('click', ()=>{ audio.muted = !audio.muted; setMuteIcon(); });

  R.switchKnob.addEventListener('click', ()=>{
    const pressed = R.switchKnob.getAttribute('aria-pressed') === 'true';
    activeSource = pressed ? 'playlists' : 'stations';
    setSourceUI();
    clearMetaTimer(); lastNow = '';
    if (activeSource === 'stations') onPickStations(); else onPickMusic();
  });

  R.seek?.addEventListener('input', ()=>{
    if (!isFinite(audio.duration) || audio.duration<=0) return;
    audio.currentTime = (R.seek.value/1000) * audio.duration;
  });
  if (Number.isFinite(cfg.volume)) audio.volume = Math.min(1, Math.max(0, cfg.volume));
  R.vol?.addEventListener('input', ()=>{ audio.volume = Math.min(1, Math.max(0, parseFloat(R.vol.value||'0.5'))); });

  audio.addEventListener('timeupdate', paintTimes);
  audio.addEventListener('durationchange', paintTimes);
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
    if (e.key && e.key.toLowerCase() === 'm') { audio.muted = !audio.muted; setMuteIcon(); }
  });

  if (cfg.autoplayMuted) {
    audio.muted = true; setMuteIcon();
    const unmute=()=>{audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true});};
    window.addEventListener('click', unmute, {once:true});
  }
  setMuteIcon();

  function fillSelect(sel, arr, label='Item'){
    if (!sel) return; sel.innerHTML='';
    arr.forEach((it,i)=>{ const o=document.createElement('option'); o.value=it.file; o.textContent=it.name||`${label} ${i+1}`; sel.appendChild(o); });
  }

  async function onPickStations(){
    if (!manifest.stations.length) return;
    const idx = Math.max(0, R.selStations.selectedIndex);
    const def = manifest.stations[idx];
    const meta = def.meta || {};
    const tracks = await loadM3U(def.file, true, { meta, kind: meta.kind, title: def.name });
    queue = tracks; cursor = -1; renderQueue(); setNow('—','Radio'); if (cfg.autoplay) playAt(0);
  }
  async function onPickMusic(){
    if (!manifest.playlists.length) return;
    const idx = Math.max(0, R.selMusic.selectedIndex);
    const def = manifest.playlists[idx];
    let tracks = await loadM3U(def.file, false);
    if (cfg.shuffle && tracks.length > 1){
      for(let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = -1; renderQueue(); setNow('—','Playlist'); if (cfg.autoplay) playAt(0);
  }

  // Init
  setNow('—','—');
  const mf = await fetchJSON(cfg.manifestUrl);
  manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
  manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
  fillSelect(R.selStations, manifest.stations, 'Station');
  fillSelect(R.selMusic,    manifest.playlists, 'Playlist');

  if (manifest.stations.length && R.selStations.selectedIndex < 0) R.selStations.selectedIndex = 0;
  if (manifest.playlists.length && R.selMusic.selectedIndex < 0)   R.selMusic.selectedIndex = 0;

  R.switchKnob.setAttribute('aria-pressed', activeSource === 'stations' ? 'true' : 'false');
  setSourceUI();

  if (activeSource === 'stations' && manifest.stations.length){
    await onPickStations();
  } else if (manifest.playlists.length) {
    await onPickMusic();
  }

  if (cfg.autoplay && !cfg.autoplayMuted && audio.paused) {
    try { await audio.play(); } catch {
      audio.muted = true; setMuteIcon();
      try { await audio.play(); } catch {}
    }
  }
}
