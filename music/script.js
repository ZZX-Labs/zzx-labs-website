// /music/script.js — ZZX player with slide switch + live now-playing + ordered lists
(function () {
  const root = document.querySelector('[data-mp]');
  if (!root) return console.error('[music] no [data-mp] element');

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
    metaPollSec   : 15
  };

  function attr(n){ return root.getAttribute(n); }
  function clamp01(v){ return Math.min(1, Math.max(0, isFinite(v) ? v : 0.5)); }
  function isAbs(u){ return /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/'); }
  function join(base, rel){ if (isAbs(rel)) return rel; return (base.replace(/\/+$/,'') + '/' + rel.replace(/^\/+/,'').replace(/^\.\//,'')); }
  const $=(s,c=root)=>c.querySelector(s), $$=(s,c=root)=>Array.from(c.querySelectorAll(s));
  const fmtTime=(sec)=>(!isFinite(sec)||sec<0)?'—':`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
  async function headOK(url){ if (isFile) return false; try{ const r=await fetch(url,{method:'HEAD',cache:'no-store'}); return r.ok; }catch{ return false; } }
  async function getJSON(url){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }catch{ return null; } }
  async function getText(url){ try{ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.text(); }catch{ return ''; } }
  function corsWrap(u){ if(!cfg.corsProxy) return u; return cfg.corsProxy.includes('?') ? cfg.corsProxy+encodeURIComponent(u) : cfg.corsProxy.replace(/\/+$/,'')+'/'+u; }

  /* ---------- parse M3U(.8) ---------- */
  function parseM3U(text){
    const lines = String(text||'').split(/\r?\n/);
    const out = []; let pendingTitle = null;
    for (const raw of lines){
      const line = raw.trim();
      if (!line || line.startsWith('#EXTM3U')) continue;
      if (line.startsWith('#EXTINF:')){
        const i = line.indexOf(','); pendingTitle = (i>=0) ? line.slice(i+1).trim() : null; continue;
      }
      if (!line.startsWith('#')) { out.push({ url: line, title: pendingTitle || line }); pendingTitle=null; }
    }
    return out;
  }

  /* ---------- UI shell (adds slide switch right after Prev) ---------- */
  function buildShell(){
    root.innerHTML = `
      <div class="mp-top">
        <div class="mp-now">
          <div class="mp-title mono" data-title>—</div>
          <div class="mp-sub small"  data-sub>—</div>
        </div>

        <div class="mp-controls" role="toolbar" aria-label="Controls">
          <button class="mp-btn" data-act="prev" title="Previous (⟵)">⏮</button>

          <!-- Slide Switch (Radio ⇄ Playlists) -->
          <div class="mp-switch" role="group" aria-label="Source toggle" title="Toggle Radio/Playlists">
            <span class="mp-switch-label">Radio</span>
            <button class="mp-switch-knob" data-src-toggle aria-pressed="true" aria-label="Radio / Playlists"></button>
            <span class="mp-switch-label">Playlists</span>
          </div>

          <button class="mp-btn" data-act="play" title="Play/Pause (Space)">▶</button>
          <button class="mp-btn" data-act="stop" title="Stop">⏹</button>
          <button class="mp-btn" data-act="next" title="Next (⟶)">⏭</button>
          <button class="mp-btn" data-act="shuffle" title="Shuffle">🔀</button>
          <button class="mp-btn" data-act="loop" title="Loop all">🔁</button>
          <button class="mp-btn" data-act="loop1" title="Loop one">🔂</button>
          <button class="mp-btn" data-act="mute" title="Mute/Unmute">🔇</button>
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
  let queue = [];               // playlist tracks OR one LIVE item
  let cursor = -1;
  let loopMode = 'none';
  let usingStations = true;     // controlled by slide switch
  let metaTimer = null;
  let lastStreamUrl = '';
  let lastNowTitle = '';

  /* ---------- Refs & wiring ---------- */
  let titleEl, subEl, timeCur, timeDur, seek, vol, list;
  let btn = {}, sel = {}, switchKnob;

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
    switchKnob = $('[data-src-toggle]');
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
    if (cursor >= 0) list.children[cursor+radioListOffset()]?.classList.add('active'); // offset when radio shows 2 rows
  }

  // For radio view, we render two rows: [0]=station, [1]=now-playing.
  function radioListOffset(){ return usingStations ? 1 : 0; }

  function renderRadioList(stationTitle, nowTitle){
    if (!list) return;
    list.innerHTML = '';

    const liStation = document.createElement('li');
    const Ls = document.createElement('div'); Ls.className='t';   Ls.textContent = stationTitle || 'Live Station';
    const Rs = document.createElement('div'); Rs.className='len mono'; Rs.textContent = 'LIVE';
    liStation.appendChild(Ls); liStation.appendChild(Rs);
    list.appendChild(liStation);

    const liNow = document.createElement('li');
    liNow.setAttribute('data-now', '1');
    const Ln = document.createElement('div'); Ln.className='t';   Ln.textContent = nowTitle || '—';
    const Rn = document.createElement('div'); Rn.className='len mono'; Rn.textContent = '';
    liNow.appendChild(Ln); liNow.appendChild(Rn);
    list.appendChild(liNow);
  }

  function updateRadioNow(nowTitle){
    const liNow = list?.querySelector('li[data-now="1"] .t');
    if (liNow) liNow.textContent = nowTitle || '—';
  }

  function renderPlaylistList(tracks){
    if (!list) return;
    list.innerHTML = '';
    tracks.forEach((t,i)=>{
      const li = document.createElement('li');
      const left = document.createElement('div'); left.className='t';
      left.textContent = `${String(i+1).padStart(2,'0')} — ${t.title || `Track ${i+1}`}`;
      const right = document.createElement('div'); right.className='len mono'; right.textContent = '';
      li.appendChild(left); li.appendChild(right);
      li.addEventListener('click', ()=> playAt(i));
      list.appendChild(li);
    });
    highlightList();
  }

  /* ---------- Slide switch ---------- */
  function setSwitch(toPlaylists){
    usingStations = !toPlaylists;
    switchKnob.setAttribute('aria-pressed', toPlaylists ? 'false' : 'true');
    // Grey out the unused select
    sel.stations?.classList.toggle('is-disabled', !usingStations);
    sel.playlists?.classList.toggle('is-disabled', usingStations);
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
        startMetaPolling(tr.title);
        renderRadioList(tr.title, lastNowTitle || '—'); // ensure radio list visible
      } else {
        audio.src = tr.url;
        await audio.play();
        stopMetaPolling();
      }
      setPlayIcon(true);
      highlightList();
    }catch(e){
      console.warn('[music] failed to play, skipping', e);
      usingStations ? nextStation() : nextTrack();
    }
  }

  function playPause(){
    if (!audio.src) return playAt(0);
    if (audio.paused) { audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); }
    else { audio.pause(); setPlayIcon(false); }
  }
  function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} setPlayIcon(false); }
  function prev(){
    usingStations ? prevStation() : prevTrack();
  }
  function next(){
    usingStations ? nextStation() : nextTrack();
  }
  function prevTrack(){
    if (loopMode==='one') return playAt(cursor);
    playAt(cursor - 1);
  }
  function nextTrack(){
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

  // Category-wide next/prev among station entries (select list items)
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

  /* ---------- Live metadata polling ---------- */
  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(stationTitle){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    pollOnce(stationTitle);
    metaTimer = setInterval(()=>pollOnce(stationTitle), Math.max(6, cfg.metaPollSec)*1000);
  }

  async function pollOnce(stationTitle){
    try {
      const meta = await fetchStreamMeta(lastStreamUrl);
      if (meta && (meta.now || meta.title)) {
        const display = meta.now || meta.title;
        lastNowTitle = display;
        setNow(stationTitle || meta.title || 'Live Station', 'Radio');
        updateRadioNow(display);
      }
    } catch {}
  }

  async function fetchStreamMeta(streamUrl){
    try {
      const u = new URL(streamUrl, location.href);
      const base = u.origin;
      const path = u.pathname;

      const candidates = [
        corsWrap(base + '/status-json.xsl'),
        corsWrap(base + '/status.xsl?json=1'),
        corsWrap(base + '/stats?sid=1&json=1'),
        guessRadioCoStatus(u),
        // shoutcast v1 legacy (often no CORS; proxy recommended)
        corsWrap(base + '/7.html')
      ].filter(Boolean);

      for (const c of candidates){
        const txt = await getText(c);
        if (!txt) continue;

        // Icecast JSON
        if (c.includes('status-json.xsl') || c.includes('status.xsl?json=1')) {
          try {
            const j = JSON.parse(txt);
            const src = j.icestats?.source;
            const arr = Array.isArray(src) ? src : (src ? [src] : []);
            let hit = arr.find(s => (s.listenurl && s.listenurl.includes(path))) || arr[0];
            if (hit) {
              const title = hit.server_name || hit.title || '';
              const now   = hit.artist && hit.title ? `${hit.artist} — ${hit.title}` : (hit.title || '');
              return { title, now };
            }
          } catch {}
        }

        // Shoutcast v2 JSON
        if (c.includes('/stats') && c.includes('json=1')){
          try {
            const j = JSON.parse(txt);
            const title = j?.servertitle || '';
            const now   = j?.songtitle || '';
            if (title || now) return { title, now };
          } catch {}
        }

        // Radio.co JSON
        if (c.includes('public.radio.co/stations/')){
          try {
            const j = JSON.parse(txt);
            const title = j?.name || '';
            const now   = j?.current_track?.title_with_artists || j?.current_track?.title || '';
            if (title || now) return { title, now };
          } catch {}
        }

        // Shoutcast v1 /7.html
        if (c.endsWith('/7.html') || c.includes('/7.html?')){
          const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/);
          if (m) {
            const parts = String(m[1] || m[2] || '').split(',');
            const song = parts.pop()?.trim();
            if (song) return { title: '', now: song };
          }
        }
      }
    } catch {}
    return null;
  }

  function guessRadioCoStatus(u){
    const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
    return m ? corsWrap(`https://public.radio.co/stations/${m[1]}/status`) : null;
  }

  /* ---------- Events & selections ---------- */
  function wireControls(){
    // Slide switch: pressed=true means RADIO; false means PLAYLISTS
    switchKnob?.addEventListener('click', async ()=>{
      const pressed = switchKnob.getAttribute('aria-pressed') === 'true';
      setSwitch(!pressed); // toggle
      if (usingStations) {
        if (sel.stations?.options.length) await onPickStations(false);
      } else {
        if (sel.playlists?.options.length) await onPickMusic(false);
      }
    });

    // Buttons
    btn.play?.addEventListener('click', playPause);
    btn.stop?.addEventListener('click', stop);
    btn.prev?.addEventListener('click', prev);
    btn.next?.addEventListener('click', next);
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
    audio.addEventListener('ended', ()=> usingStations ? nextStation() : nextTrack());

    // Keys
    root.addEventListener('keydown', (e)=>{
      if (e.code==='Space'){ e.preventDefault(); playPause(); }
      if (e.code==='ArrowLeft') prev();
      if (e.code==='ArrowRight') next();
      if (e.key?.toLowerCase?.()==='m') { audio.muted = !audio.muted; setMuteIcon(); }
    });

    // CORS autoplay policy
    if (cfg.autoplayMuted) {
      audio.muted = true; setMuteIcon();
      const unmute = ()=>{ audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true}); };
      window.addEventListener('click', unmute, { once:true });
    }
    setMuteIcon();

    // Select changes
    sel.stations?.addEventListener('change', ()=> onPickStations(false));
    sel.playlists?.addEventListener('change', ()=> onPickMusic(false));
  }

  async function onPickStations(autoPlay){
    setSwitch(false); // pressed=true => Radio
    const file = sel.stations?.value; if (!file) return;
    queue = await loadM3U(file, true);
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    renderRadioList(stTitle, lastNowTitle || '—');
    setNow(stTitle, 'Radio');
    if (cfg.autoplay || autoPlay) playAt(0);
  }
  async function onPickMusic(autoPlay){
    setSwitch(true); // pressed=false => Playlists
    const file = sel.playlists?.value; if (!file) return;
    let tracks = await loadM3U(file, false);
    if (cfg.shuffle && tracks.length>1) {
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylistList(queue);
    setNow(queue[0]?.title || '—', 'Playlist');
    if (cfg.autoplay || autoPlay) playAt(0);
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

    // Initial switch visuals
    setSwitch(cfg.startSource === 'playlists');

    // Load manifest
    const url = await resolveManifest();
    const mf = await getJSON(url);
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];

    fillSelect(sel.stations,  manifest.stations);
    fillSelect(sel.playlists, manifest.playlists);

    // Initial selection/order
    let mode = cfg.startSource;
    if (mode === 'auto'){
      const both = manifest.stations.length && manifest.playlists.length;
      mode = both ? (Math.random()<0.5?'stations':'playlists')
           : (manifest.stations.length?'stations':'playlists');
    }

    if (mode==='stations' && manifest.stations.length){
      sel.stations.selectedIndex = 0;
      await onPickStations(false);
    } else if (manifest.playlists.length){
      sel.playlists.selectedIndex = 0;
      await onPickMusic(false);
    } else {
      setNow('No playlists found','—');
    }

    // Final autoplay attempt
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
