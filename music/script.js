// /music/script.js — ZZX one-file audio player (stations & playlists) with live now-playing
(function () {
  const root = document.querySelector('[data-mp]');
  if (!root) { console.error('[music] no [data-mp] element'); return; }

  /* ---------- env + defaults ---------- */
  const isGH   = location.hostname.endsWith('github.io');
  const isFile = location.protocol === 'file:';
  const repoPrefix = (() => {
    if (!isGH) return '/';
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length ? '/' + parts[0] + '/' : '/';
  })();

  const cfg = {
    manifestUrl   : attr('data-manifest-url') || (repoPrefix + 'static/audio/music/playlists/manifest.json'),
    audioBase     : attr('data-audio-base')   || (repoPrefix + 'static/audio/music/'),
    autoplay      : attr('data-autoplay') === '1',
    autoplayMuted : attr('data-autoplay-muted') === '1',
    shuffle       : attr('data-shuffle') === '1',
    volume        : clamp01(parseFloat(attr('data-volume') || '0.35')),
    startSource   : attr('data-start-source') || 'stations', // 'stations' | 'playlists' | 'auto'
    corsProxy     : (attr('data-cors-proxy') || '').trim(),  // e.g. https://your-proxy.example/fetch?url=
    metaPollSec   : 20
  };

  function attr(n){ return root.getAttribute(n); }
  function clamp01(v){ return Math.min(1, Math.max(0, isFinite(v) ? v : 0.5)); }
  function isAbs(u){ return /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/'); }
  function join(base, rel){ if (isAbs(rel)) return rel; return (base.replace(/\/+$/,'') + '/' + rel.replace(/^\/+/,'').replace(/^\.\//,'')); }
  const $  = (s, c=root)=>c.querySelector(s);
  const $$ = (s, c=root)=>Array.from(c.querySelectorAll(s));
  const fmtTime = (sec)=> (!isFinite(sec)||sec<0) ? '—' : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
  async function headOK(url){ if (isFile) return false; try{ const r=await fetch(url,{method:'HEAD',cache:'no-store'}); return r.ok; }catch{ return false; } }
  async function getJSON(url){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }catch{ return null; } }
  async function getText(url){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.text(); }catch{ return ''; } }

  // CORS helper (prefix a proxy if provided)
  function corsWrap(u){
    if (!cfg.corsProxy) return u;
    // If proxy expects ?url= style:
    if (cfg.corsProxy.includes('?')) return cfg.corsProxy + encodeURIComponent(u);
    // If proxy expects path passthrough like /proxy/https://… :
    return cfg.corsProxy.replace(/\/+$/,'') + '/' + u;
  }

  /* ---------- parse M3U(.8) ---------- */
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

  /* ---------- UI shell with category toggle ---------- */
  function buildShell(){
    root.innerHTML = `
      <div class="mp-top">
        <div class="mp-now">
          <div class="mp-title mono" data-title>—</div>
          <div class="mp-sub small"  data-sub>—</div>
        </div>

        <div class="mp-source-toggle" aria-label="Source">
          <button class="mp-toggle-btn" data-src="stations" aria-selected="true">Radio Stations</button>
          <button class="mp-toggle-btn" data-src="playlists" aria-selected="false">Playlists</button>
        </div>

        <div class="mp-controls" role="toolbar" aria-label="Controls">
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
        <div class="mp-vol"><input type="range" class="mp-volume" min="0" max="1" step="0.01" value="${cfg.volume}" aria-label="Volume"></div>
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

  /* ---------- State ---------- */
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  let manifest = { stations: [], playlists: [] };
  let queue = [];       // current playable queue (tracks or a single LIVE item)
  let cursor = -1;      // index into queue
  let loopMode = 'none';
  let usingStations = true; // toggled by buttons
  let metaTimer = null; // metadata polling interval
  let lastStreamUrl = ''; // for metadata probes

  /* ---------- Refs & wiring ---------- */
  let titleEl, subEl, timeCur, timeDur, seek, vol, list;
  let btn = {}, sel = {}, toggleBtn = {};

  function wireRefs(){
    titleEl = $('[data-title]'); subEl = $('[data-sub]');
    timeCur = $('[data-cur]');   timeDur = $('[data-dur]');
    seek    = $('.mp-seek');     vol    = $('.mp-volume');
    list    = $('.mp-list');

    btn = {
      prev:    $('[data-act="prev"]'),
      play:    $('[data-act="play"]'),
      stop:    $('[data-act="stop"]'),
      next:    $('[data-act="next"]'),
      shuffle: $('[data-act="shuffle"]'),
      loop:    $('[data-act="loop"]'),
      loop1:   $('[data-act="loop1"]'),
      mute:    $('[data-act="mute"]')
    };
    sel = {
      stations: $('.mp-pl-stations'),
      playlists: $('.mp-pl-music')
    };
    toggleBtn = {
      stations: $('[data-src="stations"]'),
      playlists: $('[data-src="playlists"]')
    };
  }

  function setNow(t, s){ if (titleEl) titleEl.textContent = t || '—'; if (subEl) subEl.textContent = s || '—'; }
  function setPlayIcon(on){ if (btn.play) btn.play.textContent = on ? '⏸' : '▶'; }
  function setMuteIcon(){ if (btn.mute) btn.mute.textContent = audio.muted ? '🔇' : '🔊'; }
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

  /* ---------- Category toggle ---------- */
  function applyToggle(){
    usingStations = (toggleBtn.stations.getAttribute('aria-selected') === 'true');
    if (usingStations) {
      sel.stations.classList.remove('is-disabled');
      sel.playlists.classList.add('is-disabled');
    } else {
      sel.playlists.classList.remove('is-disabled');
      sel.stations.classList.add('is-disabled');
    }
  }
  function setToggle(target){
    toggleBtn.stations.setAttribute('aria-selected', target==='stations' ? 'true' : 'false');
    toggleBtn.playlists.setAttribute('aria-selected', target==='playlists' ? 'true' : 'false');
    applyToggle();
  }

  /* ---------- Loaders ---------- */
  async function loadM3U(path, isStation){
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    const url  = isAbs(path) ? path : join(base, path);
    const txt  = await getText(url);
    const entries = parseM3U(txt);
    if (!entries.length) return [];
    if (isStation) {
      const urls = entries.map(e => isAbs(e.url) ? e.url : join(cfg.audioBase, e.url));
      // Keep for metadata polling
      lastStreamUrl = urls[0] || '';
      return [{
        title: sel.stations?.selectedOptions?.[0]?.textContent || 'Live Station',
        isStream: true,
        urls
      }];
    } else {
      return entries.map(e => ({
        title: e.title || e.url,
        url: isAbs(e.url) ? e.url : join(cfg.audioBase, e.url),
        isStream: false
      }));
    }
  }

  /* ---------- Playback ---------- */
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
        const ok = await tryPlayStream(tr.urls);
        lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;
        startMetaPolling(); // live updates
      } else {
        audio.src = tr.url;
        await audio.play();
        stopMetaPolling(); // file mode: no live metadata
      }
      setPlayIcon(true);
      highlightList();
    }catch(e){
      console.warn('[music] failed to play, skipping', e);
      next();
    }
  }

  function playPause(){
    if (!audio.src) return playAt(0);
    if (audio.paused) { audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); }
    else { audio.pause(); setPlayIcon(false); }
  }
  function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} setPlayIcon(false); }
  function prev(){
    if (usingStations) return prevStation();
    // playlists: cycle within current playlist tracks
    if (loopMode==='one') return playAt(cursor);
    playAt(cursor - 1);
  }
  function next(){
    if (usingStations) return nextStation();
    if (loopMode==='one') return playAt(cursor);
    if (cfg.shuffle) {
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

  // Category-wide next/prev
  function nextStation(){
    const el = sel.stations; if (!el || !el.options.length) return;
    el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
    onPickStations(true);
  }
  function prevStation(){
    const el = sel.stations; if (!el || !el.options.length) return;
    el.selectedIndex = (el.selectedIndex - 1 + el.options.length) % el.options.length;
    onPickStations(true);
  }
  function nextPlaylist(){
    const el = sel.playlists; if (!el || !el.options.length) return;
    el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
    onPickMusic(true);
  }
  function prevPlaylist(){
    const el = sel.playlists; if (!el || !el.options.length) return;
    el.selectedIndex = (el.selectedIndex - 1 + el.options.length) % el.options.length;
    onPickMusic(true);
  }

  /* ---------- Live metadata polling (best-effort) ---------- */
  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    // poll immediately then every N sec
    pollOnce();
    metaTimer = setInterval(pollOnce, Math.max(6, cfg.metaPollSec)*1000);
  }

  async function pollOnce(){
    if (!lastStreamUrl) return;
    try {
      const meta = await fetchStreamMeta(lastStreamUrl);
      if (meta && meta.title) {
        // Show "Stream Title — Now Playing"
        setNow(meta.title, meta.now || 'Radio');
      }
    } catch (e) {
      // ignore
    }
  }

  // Heuristics for Icecast/Shoutcast/Radio.co
  async function fetchStreamMeta(streamUrl){
    try {
      const u = new URL(streamUrl, location.href);
      const base = u.origin; // e.g. https://ice4.somafm.com
      const path = u.pathname; // e.g. /suburbsofgoa-128-aac
      // candidates (proxied if needed)
      const candidates = [
        // Icecast JSON:
        corsWrap(base + '/status-json.xsl'),
        corsWrap(base + '/status.xsl?json=1'),
        // Shoutcast v2 JSON (some servers):
        corsWrap(base + '/stats?sid=1&json=1'),
        // Radio.co (public):
        guessRadioCoStatus(u)
      ].filter(Boolean);

      for (const c of candidates){
        const txt = await getText(c);
        if (!txt) continue;

        // Icecast JSON
        if (c.includes('status-json.xsl') || c.includes('status.xsl?json=1')) {
          try {
            const j = JSON.parse(txt);
            // Find mount that matches our path (best effort)
            const src = j.icestats?.source;
            const arr = Array.isArray(src) ? src : (src ? [src] : []);
            let hit = arr.find(s => (s.listenurl && s.listenurl.includes(path))) || arr[0];
            if (hit && (hit.title || hit.artist || hit.server_name)) {
              return { title: hit.title || hit.server_name, now: (hit.artist ? `${hit.artist}` : 'Radio') };
            }
          } catch {}
        }

        // Shoutcast v2 JSON
        if (c.includes('/stats') && c.includes('json=1')){
          try {
            const j = JSON.parse(txt);
            const title = j?.songtitle || j?.servertitle || '';
            if (title) return { title, now: 'Radio' };
          } catch {}
        }

        // Radio.co JSON
        if (c.includes('public.radio.co/stations/')){
          try {
            const j = JSON.parse(txt);
            const title = j?.current_track?.title || j?.current_track?.title_with_artists || j?.name;
            if (title) return { title, now: 'Radio' };
          } catch {}
        }

        // Shoutcast v1 HTML (7.html)
        if (c.endsWith('/7.html') || c.includes('/7.html?')){
          const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/); // very loose
          if (m) {
            const parts = String(m[1] || m[2] || '').split(',');
            const song = parts.pop()?.trim();
            if (song) return { title: song, now: 'Radio' };
          }
        }
      }
    } catch {}
    return null;
  }

  function guessRadioCoStatus(u){
    // Try to extract station id from host path like streamer.radio.co/s0635c8b0d/listen
    const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
    if (m && m[1]) {
      return corsWrap(`https://public.radio.co/stations/${m[1]}/status`);
    }
    return null;
  }

  /* ---------- Events & selections ---------- */
  function wireControls(){
    // Buttons
    btn.play?.addEventListener('click', playPause);
    btn.stop?.addEventListener('click', stop);
    btn.prev?.addEventListener('click', ()=> usingStations ? prevStation() : prev());
    btn.next?.addEventListener('click', ()=> usingStations ? nextStation() : next());
    btn.shuffle?.addEventListener('click', ()=> { cfg.shuffle=!cfg.shuffle; btn.shuffle.classList.toggle('active', cfg.shuffle); });
    btn.loop?.addEventListener('click', ()=> { loopMode = (loopMode==='all')?'none':'all'; btn.loop.classList.toggle('active', loopMode==='all'); btn.loop1.classList.remove('active'); });
    btn.loop1?.addEventListener('click',()=> { loopMode = (loopMode==='one')?'none':'one'; btn.loop1.classList.toggle('active', loopMode==='one'); btn.loop.classList.remove('active'); });
    btn.mute?.addEventListener('click', ()=> { audio.muted = !audio.muted; setMuteIcon(); });

    // Seek & volume
    seek?.addEventListener('input', ()=>{
      if (!isFinite(audio.duration) || audio.duration<=0) return;
      audio.currentTime = (seek.value/1000)*audio.duration;
    });
    if (vol){
      vol.value = String(cfg.volume);
      audio.volume = cfg.volume;
      vol.addEventListener('input', ()=> { audio.volume = clamp01(parseFloat(vol.value)); });
    }

    // Audio events
    audio.addEventListener('timeupdate', paintTimes);
    audio.addEventListener('durationchange', paintTimes);
    audio.addEventListener('ended', ()=> usingStations ? nextStation() : next());

    // Keys
    root.addEventListener('keydown', (e)=>{
      if (e.code==='Space'){ e.preventDefault(); playPause(); }
      if (e.code==='ArrowLeft') usingStations ? prevStation() : prev();
      if (e.code==='ArrowRight') usingStations ? nextStation() : next();
      if (e.key?.toLowerCase?.()==='m') { audio.muted = !audio.muted; setMuteIcon(); }
    });

    // Autoplay policy
    if (cfg.autoplayMuted) {
      audio.muted = true; setMuteIcon();
      const unmute = ()=>{ audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true}); };
      window.addEventListener('click', unmute, { once:true });
    }
    setMuteIcon();

    // Category toggle
    toggleBtn.stations?.addEventListener('click', async ()=>{
      setToggle('stations');
      if (sel.stations?.options.length) { await onPickStations(false); }
    });
    toggleBtn.playlists?.addEventListener('click', async ()=>{
      setToggle('playlists');
      if (sel.playlists?.options.length) { await onPickMusic(false); }
    });

    // Select changes
    sel.stations?.addEventListener('change', ()=> onPickStations(false));
    sel.playlists?.addEventListener('change', ()=> onPickMusic(false));
  }

  async function onPickStations(autoNext){
    setToggle('stations');
    const file = sel.stations?.value; if (!file) return;
    queue = await loadM3U(file, true);
    cursor = -1;
    renderQueue();
    setNow('—','Radio');
    if (cfg.autoplay || autoNext) playAt(0);
  }
  async function onPickMusic(autoNext){
    setToggle('playlists');
    const file = sel.playlists?.value; if (!file) return;
    let tracks = await loadM3U(file, false);
    if (cfg.shuffle && tracks.length>1) {
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = -1;
    renderQueue();
    setNow('—','Playlist');
    if (cfg.autoplay || autoNext) playAt(0);
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

  async function resolveManifest(){
    const hinted = attr('data-manifest-url');
    if (hinted && (isFile || await headOK(hinted))) return hinted;
    if (await headOK(cfg.manifestUrl)) return cfg.manifestUrl;
    // fallback inline blob
    const FALLBACK = {
      stations: [{ name:"Example Station", file:"radio-stations/example.m3u" }],
      playlists:[{ name:"Lobby (Ambient)", file:"ambient.m3u" }]
    };
    const blob = new Blob([JSON.stringify(FALLBACK, null, 2)], { type:'application/json' });
    return URL.createObjectURL(blob);
  }

  /* ---------- Boot ---------- */
  async function boot(){
    buildShell();
    wireRefs();
    wireControls();

    // Set initial toggle visual
    setToggle(cfg.startSource==='playlists' ? 'playlists' : 'stations');

    // Load manifest
    const url = await resolveManifest();
    const mf = await getJSON(url);
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

    fillSelect(sel.stations,  manifest.stations);
    fillSelect(sel.playlists, manifest.playlists);

    // Choose initial source
    let mode = cfg.startSource;
    if (mode === 'auto'){
      const both = manifest.stations.length && manifest.playlists.length;
      mode = both ? (Math.random()<0.5?'stations':'playlists')
           : (manifest.stations.length?'stations':'playlists');
    }

    if (mode==='stations' && manifest.stations.length){
      sel.stations.selectedIndex = Math.floor(Math.random()*manifest.stations.length);
      await onPickStations(false);
    } else if (manifest.playlists.length){
      sel.playlists.selectedIndex = Math.floor(Math.random()*manifest.playlists.length);
      await onPickMusic(false);
    } else {
      setNow('No playlists found','—');
    }

    // Last-chance autoplay
    if (cfg.autoplay && !cfg.autoplayMuted && audio.paused) {
      try { await audio.play(); }
      catch {
        audio.muted = true; setMuteIcon();
        try { await audio.play(); } catch {}
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
