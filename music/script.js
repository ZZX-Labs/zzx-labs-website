// /music/script.js — self-contained ZZX player boot (no external module needed)
(function () {
  const root = document.querySelector('[data-mp]');
  if (!root) {
    console.error('[music] no [data-mp] element on page');
    return;
  }

  /* ---------- env + defaults ---------- */
  const isGH   = location.hostname.endsWith('github.io');
  const isFile = location.protocol === 'file:';
  const repoPrefix = (() => {
    if (!isGH) return '/';
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length ? '/' + parts[0] + '/' : '/';
  })();

  const DEFAULTS = {
    manifestUrl : root.getAttribute('data-manifest-url') || (repoPrefix + 'static/audio/music/playlists/manifest.json'),
    audioBase   : root.getAttribute('data-audio-base')   || (repoPrefix + 'static/audio/music/'),
    autoplay    : (root.getAttribute('data-autoplay') === '1'),
    autoplayMuted: (root.getAttribute('data-autoplay-muted') === '1'),
    shuffle     : (root.getAttribute('data-shuffle') === '1'),
    volume      : parseFloat(root.getAttribute('data-volume') || '0.35'),
    startSource : (root.getAttribute('data-start-source') || 'auto') // 'stations' | 'playlists' | 'auto'
  };

  const FALLBACK_MANIFEST = {
    stations: [
      { name: "LoFi Radio (sample)",    file: "stations/lofi.m3u" },
      { name: "Ambient Radio (sample)", file: "stations/ambient.m3u" }
    ],
    playlists: [
      { name: "Lobby (Ambient)", file: "music/lobby.m3u" },
      { name: "Night Drive",     file: "music/night-drive.m3u" }
    ]
  };

  /* ---------- tiny helpers ---------- */
  const $  = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const isAbs = (u) => /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/');
  function join(base, rel){ if (isAbs(rel)) return rel; if (!base.endsWith('/')) base+='/'; return base + rel.replace(/^\.\//,''); }
  function fmtTime(sec){ if (!isFinite(sec)||sec<0) return '—'; const m=Math.floor(sec/60), s=Math.floor(sec%60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  async function headOK(url){ if (isFile) return false; try{ const r=await fetch(url,{method:'HEAD',cache:'no-store'}); return r.ok; }catch{ return false; } }
  async function getJSON(url){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }catch{ return null; } }
  async function getText(url){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.text(); }catch{ return ''; } }

  // Parse .m3u / .m3u8 into [{url,title}]
  function parseM3U(text){
    const lines = String(text||'').split(/\r?\n/);
    const out = [];
    let pendingTitle = null;
    for (const raw of lines){
      const line = raw.trim();
      if (!line || line.startsWith('#EXTM3U')) continue;
      if (line.startsWith('#EXTINF:')){
        const i = line.indexOf(',');
        pendingTitle = (i>=0) ? line.slice(i+1).trim() : null;
        continue;
      }
      if (!line.startsWith('#')) {
        out.push({ url: line, title: pendingTitle || line });
        pendingTitle = null;
      }
    }
    return out;
  }

  // Build UI shell directly into root
  function buildShell(rootEl){
    rootEl.innerHTML = `
      <div class="mp-top">
        <div class="mp-now">
          <div class="mp-title mono" data-title>—</div>
          <div class="mp-sub small"  data-sub>—</div>
        </div>
        <div class="mp-controls" role="toolbar" aria-label="Playback controls">
          <button class="mp-btn" data-act="prev"    title="Previous (⟵)">⏮</button>
          <button class="mp-btn" data-act="play"    title="Play/Pause (Space)">▶</button>
          <button class="mp-btn" data-act="stop"    title="Stop">⏹</button>
          <button class="mp-btn" data-act="next"    title="Next (⟶)">⏭</button>
          <button class="mp-btn" data-act="shuffle" title="Shuffle">🔀</button>
          <button class="mp-btn" data-act="loop"    title="Loop all">🔁</button>
          <button class="mp-btn" data-act="loop1"   title="Loop one">🔂</button>
          <button class="mp-btn" data-act="mute"    title="Mute/Unmute">🔇</button>
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
  }

  // Player state
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  let manifest = { stations: [], playlists: [] };
  let queue = []; // [{title, url, isStream, length?, urls?}]
  let cursor = -1;
  let loopMode = 'none'; // 'none' | 'all' | 'one'
  let usingStations = false;

  // UI refs (filled after buildShell)
  let titleEl, subEl, btns, timeCur, timeDur, seek, vol, list, selStations, selMusic;

  function wireRefs(){
    titleEl = $('[data-title]', root);
    subEl   = $('[data-sub]', root);
    btns = {
      prev:    $('[data-act="prev"]', root),
      play:    $('[data-act="play"]', root),
      stop:    $('[data-act="stop"]', root),
      next:    $('[data-act="next"]', root),
      shuffle: $('[data-act="shuffle"]', root),
      loop:    $('[data-act="loop"]', root),
      loop1:   $('[data-act="loop1"]', root),
      mute:    $('[data-act="mute"]', root)
    };
    timeCur = $('[data-cur]', root);
    timeDur = $('[data-dur]', root);
    seek    = $('.mp-seek', root);
    vol     = $('.mp-volume', root);
    list    = $('.mp-list', root);
    selStations = $('.mp-pl-stations', root);
    selMusic    = $('.mp-pl-music', root);
  }

  function setNow(t, s){ if (titleEl) titleEl.textContent=t||'—'; if (subEl) subEl.textContent=s||'—'; }
  function setPlayIcon(on){ if (btns.play) btns.play.textContent = on ? '⏸' : '▶'; }
  function setMuteIcon(){ if (btns.mute) btns.mute.textContent = audio.muted ? '🔇' : '🔊'; }
  function paintTimes(){
    if (timeCur) timeCur.textContent = fmtTime(audio.currentTime);
    if (timeDur) timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
    if (seek && isFinite(audio.duration) && audio.duration>0) {
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
    }
  }
  function highlightList(){
    if (!list) return;
    $$('.active', list).forEach(li => li.classList.remove('active'));
    if (cursor >= 0) list.children[cursor]?.classList.add('active');
  }
  function renderQueue(){
    if (!list) return;
    list.innerHTML = '';
    queue.forEach((t,i)=>{
      const li = document.createElement('li');
      const l = document.createElement('div'); l.className='t'; l.textContent = t.title || `Track ${i+1}`;
      const r = document.createElement('div'); r.className='len mono'; r.textContent = t.isStream ? 'LIVE' : '';
      li.appendChild(l); li.appendChild(r);
      li.addEventListener('click', ()=> playAt(i));
      list.appendChild(li);
    });
    highlightList();
  }

  async function tryPlayStream(urls){
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch {}
    }
    throw new Error('All stream endpoints failed');
  }

  async function playAt(i){
    if (!queue.length) return;
    cursor = (i + queue.length) % queue.length;
    const tr = queue[cursor];
    setNow(tr.title, usingStations ? 'Radio' : 'Playlist');
    setPlayIcon(false);
    try{
      if (tr.isStream && Array.isArray(tr.urls) && tr.urls.length) {
        await tryPlayStream(tr.urls);
      } else {
        audio.src = tr.url;
        await audio.play();
      }
      setPlayIcon(true);
      highlightList();
    }catch(e){
      console.warn('[music] failed to play track, skipping', e);
      next();
    }
  }

  function playPause(){
    if (!audio.src) return playAt(0);
    if (audio.paused) { audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); }
    else { audio.pause(); setPlayIcon(false); }
  }
  function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} setPlayIcon(false); }
  function prev(){ if (loopMode==='one') return playAt(cursor); playAt(cursor-1); }
  function next(){
    if (loopMode==='one') return playAt(cursor);
    if (DEFAULTS.shuffle) {
      let j = Math.floor(Math.random()*queue.length);
      if (queue.length>1 && j===cursor) j = (j+1)%queue.length;
      playAt(j);
    } else {
      const n = cursor + 1;
      if (n >= queue.length) {
        if (loopMode==='all') return playAt(0);
        setPlayIcon(false);
      } else {
        playAt(n);
      }
    }
  }

  function toggleShuffle(){ DEFAULTS.shuffle = !DEFAULTS.shuffle; btns.shuffle?.classList.toggle('active', DEFAULTS.shuffle); }
  function toggleLoopAll(){ loopMode = (loopMode==='all')?'none':'all'; btns.loop?.classList.toggle('active', loopMode==='all'); btns.loop1?.classList.remove('active'); }
  function toggleLoopOne(){ loopMode = (loopMode==='one')?'none':'one'; btns.loop1?.classList.toggle('active', loopMode==='one'); btns.loop?.classList.remove('active'); }
  function toggleMute(){ audio.muted = !audio.muted; setMuteIcon(); }

  function wireControls(){
    btns.play?.addEventListener('click', playPause);
    btns.stop?.addEventListener('click', stop);
    btns.prev?.addEventListener('click', prev);
    btns.next?.addEventListener('click', next);
    btns.shuffle?.addEventListener('click', toggleShuffle);
    btns.loop?.addEventListener('click', toggleLoopAll);
    btns.loop1?.addEventListener('click', toggleLoopOne);
    btns.mute?.addEventListener('click', toggleMute);

    seek?.addEventListener('input', ()=>{
      if (!isFinite(audio.duration) || audio.duration<=0) return;
      audio.currentTime = (seek.value/1000)*audio.duration;
    });
    if (vol){
      const v = isFinite(DEFAULTS.volume) ? DEFAULTS.volume : 0.5;
      vol.value = String(Math.min(1, Math.max(0, v)));
      audio.volume = parseFloat(vol.value);
      vol.addEventListener('input', ()=> { audio.volume = Math.min(1, Math.max(0, parseFloat(vol.value))); });
    }

    audio.addEventListener('timeupdate', paintTimes);
    audio.addEventListener('durationchange', paintTimes);
    audio.addEventListener('ended', next);

    root.addEventListener('keydown', (e)=>{
      if (e.code==='Space'){ e.preventDefault(); playPause(); }
      if (e.code==='ArrowLeft') prev();
      if (e.code==='ArrowRight') next();
      if (e.key?.toLowerCase?.()==='m') toggleMute();
    });

    if (DEFAULTS.autoplayMuted) {
      audio.muted = true; setMuteIcon();
      const unmute = ()=>{ audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true}); };
      window.addEventListener('click', unmute, { once:true });
    }
    setMuteIcon();
  }

  function fillSelect(sel, arr){
    if (!sel) return;
    sel.innerHTML = '';
    arr.forEach((it,i)=>{
      const o = document.createElement('option');
      o.value = it.file;
      o.textContent = it.name || `Playlist ${i+1}`;
      sel.appendChild(o);
    });
  }

  async function loadM3U(path, isStation){
    const base = DEFAULTS.manifestUrl.replace(/\/manifest\.json$/i,'/');
    const url  = isAbs(path) ? path : join(base, path);
    const txt  = await getText(url);
    const entries = parseM3U(txt);
    if (!entries.length) return [];
    if (isStation) {
      // group as one LIVE item with multiple stream candidates
      return [{
        title: selStations?.selectedOptions?.[0]?.textContent || 'Live Station',
        isStream: true,
        urls: entries.map(e => isAbs(e.url) ? e.url : join(DEFAULTS.audioBase, e.url))
      }];
    } else {
      // expand to file tracks
      return entries.map(e => ({
        title: e.title || e.url,
        url: isAbs(e.url) ? e.url : join(DEFAULTS.audioBase, e.url),
        isStream: false
      }));
    }
  }

  async function onPickStations(){
    usingStations = true;
    const file = selStations?.value;
    if (!file) return;
    queue = await loadM3U(file, true);
    cursor = -1;
    renderQueue();
    setNow('—','Radio');
    if (DEFAULTS.autoplay) playAt(0);
  }
  async function onPickMusic(){
    usingStations = false;
    const file = selMusic?.value;
    if (!file) return;
    let tracks = await loadM3U(file, false);
    if (DEFAULTS.shuffle && tracks.length > 1) {
      for (let i=tracks.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]] = [tracks[j],tracks[i]];
      }
    }
    queue = tracks;
    cursor = -1;
    renderQueue();
    setNow('—','Playlist');
    if (DEFAULTS.autoplay) playAt(0);
  }

  async function resolveManifest(){
    // 1) honor explicit attribute if it exists and is reachable
    const hinted = root.getAttribute('data-manifest-url');
    if (hinted && (isFile || await headOK(hinted))) return hinted;
    // 2) try default
    if (await headOK(DEFAULTS.manifestUrl)) return DEFAULTS.manifestUrl;
    // 3) fallback blob
    const blob = new Blob([JSON.stringify(FALLBACK_MANIFEST, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }

  async function boot(){
    // Build UI now so you see it immediately
    buildShell(root);
    wireRefs();
    wireControls();
    setNow('—','—');
    btns.shuffle?.classList.toggle('active', DEFAULTS.shuffle);

    // Load manifest
    const manifestUrl = await resolveManifest();
    const mf = await getJSON(manifestUrl);
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

    fillSelect(selStations, manifest.stations);
    fillSelect(selMusic,    manifest.playlists);

    selStations?.addEventListener('change', onPickStations);
    selMusic?.addEventListener('change', onPickMusic);

    // Decide initial source
    let mode = DEFAULTS.startSource;
    if (mode === 'auto') {
      const both = manifest.stations.length && manifest.playlists.length;
      mode = both ? (Math.random() < 0.5 ? 'stations' : 'playlists') :
             (manifest.stations.length ? 'stations' : 'playlists');
    }

    if (mode === 'stations' && manifest.stations.length) {
      selStations.value = manifest.stations[Math.floor(Math.random()*manifest.stations.length)].file;
      await onPickStations();
    } else if (manifest.playlists.length) {
      selMusic.value = manifest.playlists[Math.floor(Math.random()*manifest.playlists.length)].file;
      await onPickMusic();
    } else {
      setNow('No playlists found', '—');
      console.warn('[music] manifest had no stations/playlists');
    }

    // Final autoplay attempt (policy-safe)
    if (DEFAULTS.autoplay && !DEFAULTS.autoplayMuted && audio.paused) {
      try { await audio.play(); }
      catch {
        audio.muted = true; setMuteIcon();
        try { await audio.play(); } catch {}
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
