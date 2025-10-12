// Music Player Widget (ZZX) — streams + live metadata (Radio.co, SomaFM, Shoutcast)
// Usage: <div class="mp-root" data-mp ...> (see index.html below)
// Exposes window.MusicPlayer.mount(root, options)

(function(){
  const MusicPlayer = {};
  const isGH = location.hostname.endsWith('github.io');
  const repoPrefix = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    return (isGH && parts.length) ? '/' + parts[0] + '/' : '/';
  })();

  const $  = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const isAbs = u => /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/');
  const join  = (base, rel) => (!rel ? base : (isAbs(rel) ? rel : (base.replace(/\/+$/,'') + '/' + rel.replace(/^\.\/?/,''))));

  const fmtTime = (sec) => (!isFinite(sec)||sec<0) ? '—' : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

  // Parse .m3u/.m3u8 -> [{url, title}]
  function parseM3U(text){
    const lines = String(text||'').split(/\r?\n/);
    const out = []; let pending = null;
    for(const raw of lines){
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

  // Try multiple stream candidates
  async function tryPlayStream(audio, urls){
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch(e){}
    }
    throw new Error('No playable stream endpoints');
  }

  // CORS helper: prepend proxy if configured and URL is cross-origin
  function proxied(url, corsProxy){
    if (!corsProxy) return url;
    try {
      const u = new URL(url, location.origin);
      if (u.origin === location.origin) return url;
      return corsProxy.replace(/\/+$/,'') + '/' + url;
    } catch {
      // if relative or invalid, let browser handle
      return url;
    }
  }

  // ---- Metadata polling by kind ----
  async function fetchJSON(url){ const r = await fetch(url, {cache:'no-store'}); if(!r.ok) throw new Error(r.statusText); return r.json(); }
  async function fetchText(url){ const r = await fetch(url, {cache:'no-store'}); if(!r.ok) throw new Error(r.statusText); return r.text(); }

  // Radio.co JSON: https://public.radio.co/stations/<id>/status
  async function metaRadioCo(meta, corsProxy){
    const url = proxied(meta.status || `https://public.radio.co/stations/${meta.station_id}/status`, corsProxy);
    const j = await fetchJSON(url);
    // structure commonly: { current_track: { title, artist }, ... } or now_playing: {}
    const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
    const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
    return { title: t || a || 'Live', sub: a || meta.name || 'Radio' };
  }

  // SomaFM JSON: https://somafm.com/songs/<channel>.json
  async function metaSomaFM(meta, corsProxy){
    const url = proxied(meta.status, corsProxy);
    const j = await fetchJSON(url);
    // latest at [0]; fields usually {title, artist, album}
    const first = Array.isArray(j) ? j[0] : null;
    const t = first?.title || '';
    const a = first?.artist || '';
    return { title: t || 'Live', sub: a || `SomaFM • ${meta.channel}` };
  }

  // Shoutcast 7.html (CSV-ish): .../7.html -> "OK2,xx,yy,zz,aa,bb,Current Song"
  // CORS frequently blocked; allow proxy via data-cors-proxy if needed.
  async function metaShoutcast(meta, corsProxy){
    const url = proxied(meta.status, corsProxy);
    const txt = await fetchText(url);
    // crude parse: split by comma, last item is current song
    const parts = txt.split(',').map(s=>s.trim());
    const cur = parts[parts.length-1] || 'Live';
    return { title: cur, sub: 'Shoutcast' };
  }

  async function pollMeta(kind, meta, corsProxy){
    try{
      if (kind === 'radioco')   return await metaRadioCo(meta, corsProxy);
      if (kind === 'somafm')    return await metaSomaFM(meta, corsProxy);
      if (kind === 'shoutcast') return await metaShoutcast(meta, corsProxy);
    }catch(e){}
    return null;
  }

  // -------- Core mount --------
  MusicPlayer.mount = function(root, opts={}){
    if (!root) return;

    // Config
    const cfg = {
      manifestUrl   : root.dataset.manifestUrl  || opts.manifestUrl  || (repoPrefix + 'static/audio/music/playlists/manifest.json'),
      audioBase     : root.dataset.audioBase    || opts.audioBase    || (repoPrefix + 'static/audio/music/'),
      autoplay      : (root.dataset.autoplay ?? (opts.autoplay ? '1':'0')) === '1',
      autoplayMuted : (root.dataset.autoplayMuted ?? (opts.autoplayMuted ? '1':'0')) === '1',
      shuffle       : (root.dataset.shuffle ?? (opts.shuffle ? '1':'0')) === '1',
      volume        : parseFloat(root.dataset.volume ?? (opts.volume ?? 0.5)),
      startSource   : root.dataset.startSource  || opts.startSource || 'auto',
      corsProxy     : root.dataset.corsProxy    || opts.corsProxy || '' // e.g. https://your-worker.example.com/fetch
    };

    // Build internal UI skeleton (so we don’t depend on external template timing)
    root.innerHTML = `
      <div class="mp-top">
        <div class="mp-now">
          <div class="mp-title mono">—</div>
          <div class="mp-sub small">—</div>
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
          <label class="small" for="mp-pl-stations">Radio Stations (.m3u)</label>
          <select id="mp-pl-stations" class="mp-pl mp-pl-stations"></select>

          <label class="small" for="mp-pl-music" style="margin-top:.6rem;display:block;">Playlists (.m3u)</label>
          <select id="mp-pl-music" class="mp-pl mp-pl-music"></select>
        </div>
        <div class="mp-right">
          <label class="small">Tracks</label>
          <ul class="mp-list" role="listbox" aria-label="Tracks"></ul>
        </div>
      </div>
    `;

    // Elements after injection
    const titleEl = $('.mp-title', root);
    const subEl   = $('.mp-sub', root);
    const btns = {
      prev:    $('[data-act="prev"]', root),
      play:    $('[data-act="play"]', root),
      stop:    $('[data-act="stop"]', root),
      next:    $('[data-act="next"]', root),
      shuffle: $('[data-act="shuffle"]', root),
      loop:    $('[data-act="loop"]', root),
      loop1:   $('[data-act="loop1"]', root),
      mute:    $('[data-act="mute"]', root),
    };
    const timeCur = $('[data-cur]', root);
    const timeDur = $('[data-dur]', root);
    const seek    = $('.mp-seek', root);
    const vol     = $('.mp-volume', root);
    const list    = $('.mp-list', root);
    const selStations = $('#mp-pl-stations', root);
    const selMusic    = $('#mp-pl-music', root);

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';

    // State
    let queue = [];     // [{url,title,isStream, length?, meta?, kind?}]
    let cursor = -1;
    let loopMode = 'none'; // 'none'|'all'|'one'
    let usingStations = false;
    let manifest = { stations: [], playlists: [] };
    let metaTimer = 0;

    // UI helpers
    const setNow = (t, s='') => { if (titleEl) titleEl.textContent = t || '—'; if (subEl) subEl.textContent = s || '—'; };
    const setPlayIcon = (on) => { if (btns.play) btns.play.textContent = on ? '⏸' : '▶'; };
    const setMuteIcon = () => { if (btns.mute) btns.mute.textContent = audio.muted ? '🔇' : '🔊'; };
    const paintTimes = () => {
      if (timeCur) timeCur.textContent = fmtTime(audio.currentTime);
      if (timeDur) timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
      if (seek && isFinite(audio.duration) && audio.duration>0){
        seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
      }
    };
    function renderQueue(){
      if (!list) return; list.innerHTML = '';
      queue.forEach((t, i) => {
        const li = document.createElement('li');
        const left = document.createElement('div');
        const right = document.createElement('div');
        left.className = 't'; right.className = 'len mono';
        left.textContent = t.title || `Track ${i+1}`;
        right.textContent = t.isStream ? 'LIVE' : (t.length ? fmtTime(t.length) : '');
        li.appendChild(left); li.appendChild(right);
        li.addEventListener('click', ()=> playAt(i));
        list.appendChild(li);
      });
      highlightList();
    }
    const highlightList = () => {
      if (!list) return;
      $$('.active', list).forEach(li => li.classList.remove('active'));
      if (cursor >= 0) list.children[cursor]?.classList.add('active');
    };

    // Controls
    async function playAt(i){
      if (!queue.length) return;
      cursor = (i + queue.length) % queue.length;
      const tr = queue[cursor];
      setNow(tr.title, usingStations ? 'Radio' : 'Playlist');
      setPlayIcon(false);

      clearInterval(metaTimer);
      metaTimer = 0;

      try {
        if (tr.isStream && Array.isArray(tr.urls) && tr.urls.length){
          await tryPlayStream(audio, tr.urls);
        } else {
          audio.src = tr.url;
          await audio.play();
        }
        setPlayIcon(true);
        highlightList();

        // Start metadata polling if station has meta
        if (tr.isStream && tr.kind && tr.meta) {
          const pollMs = Math.max(3, parseInt(tr.meta.poll||10)) * 1000;
          const refresh = async () => {
            const data = await pollMeta(tr.kind, tr.meta, cfg.corsProxy);
            if (data) setNow(data.title || tr.title || 'LIVE', data.sub || subEl.textContent);
          };
          refresh();
          metaTimer = setInterval(refresh, pollMs);
        }
      } catch(e){
        next(); // try next if failed
      }
    }

    function playPause(){ if (!audio.src) return playAt(0); if (audio.paused) audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); else { audio.pause(); setPlayIcon(false);} }
    function stop(){ audio.pause(); try{audio.currentTime=0;}catch{} setPlayIcon(false); }
    function prev(){ if (loopMode === 'one') return playAt(cursor); playAt(cursor-1); }
    function next(){
      if (loopMode === 'one') return playAt(cursor);
      if (cfg.shuffle){
        let j = Math.floor(Math.random()*queue.length);
        if (queue.length>1 && j === cursor) j = (j+1)%queue.length;
        playAt(j);
      } else {
        const n = cursor+1;
        if (n >= queue.length){ if (loopMode === 'all') playAt(0); else setPlayIcon(false); }
        else playAt(n);
      }
    }
    function toggleShuffle(){ cfg.shuffle = !cfg.shuffle; btns.shuffle?.classList.toggle('active', cfg.shuffle); }
    function toggleLoopAll(){ loopMode = (loopMode==='all')?'none':'all'; btns.loop?.classList.toggle('active', loopMode==='all'); btns.loop1?.classList.remove('active'); }
    function toggleLoopOne(){ loopMode = (loopMode==='one')?'none':'one'; btns.loop1?.classList.toggle('active', loopMode==='one'); btns.loop?.classList.remove('active'); }
    function toggleMute(){ audio.muted = !audio.muted; setMuteIcon(); }

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
      audio.currentTime = (seek.value/1000) * audio.duration;
    });
    if (isFinite(cfg.volume)) audio.volume = Math.min(1, Math.max(0, cfg.volume));
    vol?.addEventListener('input', ()=>{ audio.volume = Math.min(1, Math.max(0, parseFloat(vol.value||'0.5'))); });

    audio.addEventListener('timeupdate', paintTimes);
    audio.addEventListener('durationchange', paintTimes);
    audio.addEventListener('ended', next);

    root.addEventListener('keydown', (e)=>{
      if (e.code === 'Space'){ e.preventDefault(); playPause(); }
      if (e.code === 'ArrowLeft') prev();
      if (e.code === 'ArrowRight') next();
      if (e.key.toLowerCase() === 'm') toggleMute();
    });

    if (cfg.autoplayMuted) { audio.muted = true; setMuteIcon(); const unmute=()=>{audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true});}; window.addEventListener('click', unmute, {once:true}); }
    setMuteIcon();

    // Manifest + selects
    async function getJSON(u){ try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }catch{return null;} }
    function fillSelect(sel, arr){ if (!sel) return; sel.innerHTML=''; arr.forEach((it,i)=>{ const o=document.createElement('option'); o.value=it.file; o.textContent=it.name||`Playlist ${i+1}`; sel.appendChild(o); }); }

    async function loadM3U(path, isStation, stationMeta){
      const url = isAbs(path) ? path : join(cfg.manifestUrl.replace(/\/manifest\.json$/i,''), path);
      const txt = await fetch(url, {cache:'no-store'}).then(r=>r.ok?r.text():'');
      const entries = parseM3U(txt);
      if (!entries.length) return [];
      if (isStation){
        // station: one logical "track" with candidate URLs (some m3u list mirrors)
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

    async function onPickStations(){
      usingStations = true;
      const idx = selStations?.selectedIndex ?? -1;
      if (idx < 0) return;
      const file = manifest.stations[idx].file;
      const meta = manifest.stations[idx].meta || {};
      const tracks = await loadM3U(file, true, { meta, kind: meta.kind, title: manifest.stations[idx].name });
      queue = tracks; cursor = -1; renderQueue(); setNow('—','Radio'); if (cfg.autoplay) playAt(0);
    }
    async function onPickMusic(){
      usingStations = false;
      const file = selMusic?.value; if (!file) return;
      let tracks = await loadM3U(file, false);
      if (cfg.shuffle){ for(let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; } }
      queue = tracks; cursor = -1; renderQueue(); setNow('—','Playlist'); if (cfg.autoplay) playAt(0);
    }

    selStations?.addEventListener('change', onPickStations);
    selMusic?.addEventListener('change', onPickMusic);

    (async function init(){
      setNow('—','—');
      const mf = await getJSON(cfg.manifestUrl);
      manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
      manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
      fillSelect(selStations, manifest.stations);
      fillSelect(selMusic,    manifest.playlists);

      btns.shuffle?.classList.toggle('active', cfg.shuffle);

      // choose initial
      let mode = cfg.startSource;
      if (mode === 'auto'){
        mode = (manifest.stations.length && manifest.playlists.length)
                ? (Math.random() < 0.5 ? 'stations' : 'playlists')
                : (manifest.stations.length ? 'stations' : 'playlists');
      }
      if (mode === 'stations' && manifest.stations.length){
        selStations.selectedIndex = Math.floor(Math.random()*manifest.stations.length);
        await onPickStations();
      } else if (manifest.playlists.length) {
        selMusic.selectedIndex = Math.floor(Math.random()*manifest.playlists.length);
        await onPickMusic();
      }

      if (cfg.autoplay && !cfg.autoplayMuted && audio.paused) {
        try { await audio.play(); } catch {
          audio.muted = true; setMuteIcon();
          try { await audio.play(); } catch {}
        }
      }
    })();
  };

  // Auto-mount via custom event
  document.addEventListener('mp:init', (ev) => {
    const root = ev.target.closest('[data-mp]') || $('[data-mp]');
    if (root) MusicPlayer.mount(root, ev.detail || {});
  });

  window.MusicPlayer = MusicPlayer;
})();
