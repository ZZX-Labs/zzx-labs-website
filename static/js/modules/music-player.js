// Music Player Widget (ZZX) — slide switch (left of Prev), source-level next/prev, universal live metadata ticker
(function(){
  const MusicPlayer = {};
  const isGH = location.hostname.endsWith('github.io');
  const repoPrefix = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    return (isGH && parts.length) ? '/' + parts[0] + '/' : '/';
  })();

  /* ------------------------ tiny utils ------------------------ */
  const $  = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const isAbs = u => /^([a-z][a-z0-9+\-.]*:)?\/\//i.test(u) || u.startsWith('/');
  const join  = (base, rel) => (!rel ? base : (isAbs(rel) ? rel : (base.replace(/\/+$/,'') + '/' + rel.replace(/^\.\/?/,''))));
  const fmtTime = (sec) => (!isFinite(sec)||sec<0) ? '—' : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

  function normalizeNow(s){
    if (!s) return '';
    let txt = String(s).replace(/\s+/g,' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g,'').trim();
    // trim common junk
    txt = txt.replace(/\s*(\||•|—|-)\s*(radio|fm|am|live|station|stream|online|hq|ultra hd|4k)$/i,'').trim();
    txt = txt.replace(/\s*\b(32|64|96|128|160|192|256|320)\s?(kbps|kbit|kb|aac|mp3|opus|ogg)\b\s*$/i,'').trim();
    const parts = txt.split(' - ');
    if (parts.length >= 2) {
      const artist = parts.shift().trim();
      const title  = parts.join(' - ').trim();
      return `${artist} - ${title}`;
    }
    return txt;
  }

  // Wrap metadata fetches only (audio itself is direct)
  function corsWrap(proxy, url){
    if (!url) return '';
    if (!proxy) return url;
    return proxy.includes('?') ? (proxy + encodeURIComponent(url))
                               : (proxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, ''));
  }

  async function fetchJSON(url){ try{ const r = await fetch(url, {cache:'no-store'}); if(!r.ok) return null; return await r.json(); }catch{ return null; } }
  async function fetchText(url){ try{ const r = await fetch(url, {cache:'no-store'}); if(!r.ok) return ''; return await r.text(); }catch{ return ''; } }

  /* ------------------------ M3U ------------------------ */
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

  /* ------------------------ Audio helpers ------------------------ */
  async function tryPlayStream(audio, urls){
    let lastErr;
    for (const u of urls){
      try { audio.src = u; await audio.play(); return u; } catch(e){ lastErr=e; }
    }
    throw (lastErr || new Error('No playable stream endpoints'));
  }

  /* ------------------------ Universal live metadata ------------------------ */
  function guessRadioCoStatus(u){
    const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
    return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
  }

  // Probe Icecast/Shoutcast/Radio.co using the stream's host. CORS-proxied for metadata only.
  async function fetchStreamMetaUniversal(streamUrl, proxy){
    try {
      const u = new URL(streamUrl, location.href);
      const base = `${u.protocol}//${u.host}`;
      const candidates = [
        corsWrap(proxy, `${base}/status-json.xsl`),     // Icecast JSON
        corsWrap(proxy, `${base}/status.xsl?json=1`),   // Alt Icecast JSON
        corsWrap(proxy, `${base}/stats?sid=1&json=1`),  // Shoutcast v2 JSON
        corsWrap(proxy, guessRadioCoStatus(u)),         // Radio.co JSON
        corsWrap(proxy, `${base}/7.html`)               // Shoutcast v1 plaintext
      ].filter(Boolean);

      for (const url of candidates){
        const isJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
        const data = isJson ? await fetchJSON(url) : await fetchText(url);
        if (!data) continue;

        // Icecast JSON
        if (isJson && typeof data === 'object' && data.icestats) {
          const src = data.icestats.source;
          const arr = Array.isArray(src) ? src : (src ? [src] : []);
          const hit = arr?.[0];
          if (hit) {
            const title = hit.server_name || hit.title || '';
            const now   = hit.artist && hit.title ? `${hit.artist} - ${hit.title}` : (hit.title || '');
            const norm  = normalizeNow(now);
            if (title || norm) return { title, now: norm };
          }
        }
        // Shoutcast v2 JSON
        if (isJson && (data?.servertitle || data?.songtitle)) {
          return { title: data.servertitle || '', now: normalizeNow(data.songtitle || '') };
        }
        // Radio.co JSON
        if (isJson && (data?.current_track || data?.name)) {
          const now = data.current_track?.title_with_artists || data.current_track?.title || '';
          return { title: data.name || '', now: normalizeNow(now) };
        }
        // Shoutcast v1 /7.html
        if (typeof data === 'string' && (url.endsWith('/7.html') || url.includes('/7.html?'))) {
          const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
          if (m) {
            const parts = String(m[1] || m[2] || '').split(',');
            const song = parts.pop()?.trim();
            if (song) return { title: '', now: normalizeNow(song) };
          }
        }
      }
    } catch {}
    return null;
  }

  // Optional adapters if your manifest explicitly declares kind/meta (kept for compatibility)
  function proxied(url, corsProxy){
    if (!corsProxy) return url;
    try {
      const u = new URL(url, location.origin);
      if (u.origin === location.origin) return url;
      return corsProxy.replace(/\/+$/,'') + '/' + url.replace(/^\/+/, '');
    } catch { return url; }
  }
  async function metaRadioCo(meta, corsProxy){
    const url = proxied(meta.status || `https://public.radio.co/stations/${meta.station_id}/status`, corsProxy);
    const j = await fetchJSON(url);
    if (!j) return null;
    const t = j?.current_track?.title || j?.now_playing?.title || j?.title || '';
    const a = j?.current_track?.artist || j?.now_playing?.artist || j?.artist || '';
    return { now: normalizeNow([a,t].filter(Boolean).join(' - ')) || '', title: meta.name || '' };
  }
  async function metaSomaFM(meta, corsProxy){
    const url = proxied(meta.status, corsProxy);
    const j = await fetchJSON(url);
    const first = Array.isArray(j) ? j[0] : null;
    if (!first) return null;
    const t = first?.title || '';
    const a = first?.artist || '';
    return { now: normalizeNow([a,t].filter(Boolean).join(' - ')), title: (meta.channel ? `SomaFM • ${meta.channel}` : 'SomaFM') };
  }
  async function metaShoutcast(meta, corsProxy){
    const url = proxied(meta.status, corsProxy);
    const txt = await fetchText(url);
    if (!txt) return null;
    const parts = txt.split(',').map(s=>s.trim());
    const cur = parts[parts.length-1] || '';
    return { now: normalizeNow(cur), title: 'Shoutcast' };
  }
  async function pollMeta(kind, meta, proxy){
    try{
      if (kind === 'radioco')   return await metaRadioCo(meta, proxy);
      if (kind === 'somafm')    return await metaSomaFM(meta, proxy);
      if (kind === 'shoutcast') return await metaShoutcast(meta, proxy);
    }catch{}
    return null;
  }

  /* ------------------------ Widget ------------------------ */
  MusicPlayer.mount = function(root, opts={}){
    if (!root) return;

    const cfg = {
      manifestUrl   : root.dataset.manifestUrl  || opts.manifestUrl  || (repoPrefix + 'static/audio/music/playlists/manifest.json'),
      audioBase     : root.dataset.audioBase    || opts.audioBase    || (repoPrefix + 'static/audio/music/'),
      autoplay      : (root.dataset.autoplay ?? (opts.autoplay ? '1':'0')) === '1',
      autoplayMuted : (root.dataset.autoplayMuted ?? (opts.autoplayMuted ? '1':'0')) === '1',
      shuffle       : (root.dataset.shuffle ?? (opts.shuffle ? '1':'0')) === '1',
      volume        : parseFloat(root.dataset.volume ?? (opts.volume ?? 0.5)),
      startSource   : root.dataset.startSource  || opts.startSource || 'stations', // 'stations' | 'playlists'
      corsProxy     : root.dataset.corsProxy    || opts.corsProxy || '',
      metaPollSec   : Math.max(5, Number(root.dataset.metaPollSec || opts.metaPollSec || 8)) // seconds
    };

    // UI
    root.innerHTML = `
      <div class="mp-top">
        <div class="mp-now">
          <div class="mp-title mono">—</div>
          <div class="mp-sub small">—</div>
        </div>

        <div class="mp-controls" role="toolbar" aria-label="Playback">
          <!-- Slide switch goes first (left-most) -->
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

    // Refs
    const titleEl = $('.mp-title', root);
    const subEl   = $('.mp-sub', root);
    const switchKnob = $('.mp-switch-knob', root);

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
    const selStations = $('.mp-pl-stations', root);
    const selMusic    = $('.mp-pl-music', root);

    // Audio + state
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';

    let queue = [];
    let cursor = -1;
    let loopMode = 'none';
    let activeSource = (cfg.startSource === 'playlists') ? 'playlists' : 'stations';
    let manifest = { stations: [], playlists: [] };

    let metaTimer = 0;
    let lastStreamUrl = '';
    let lastNow = '';

    // Helpers
    const setNow = (t, s='') => {
      const txt = t || '—';
      if (titleEl) {
        titleEl.textContent = txt;
        requestAnimationFrame(() => {
          const over = titleEl.scrollWidth > titleEl.clientWidth + 2;
          titleEl.classList.toggle('ticker', over);
        });
      }
      if (subEl) subEl.textContent = s || '—';
    };
    const setPlayIcon = (on) => { if (btns.play) btns.play.textContent = on ? '⏸' : '▶'; };
    const setMuteIcon = () => { if (btns.mute) btns.mute.textContent = audio.muted ? '🔇' : '🔊'; };
    const paintTimes = () => {
      if (timeCur) timeCur.textContent = fmtTime(audio.currentTime);
      if (timeDur) timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
      if (seek && isFinite(audio.duration) && audio.duration>0){
        seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
      }
    };

    function setSourceUI(){
      const stationsActive = (activeSource === 'stations');
      switchKnob.setAttribute('aria-pressed', stationsActive ? 'true' : 'false');

      selStations.disabled = !stationsActive;
      selStations.classList.toggle('is-disabled', !stationsActive);
      selMusic.disabled = stationsActive;
      selMusic.classList.toggle('is-disabled', stationsActive);
    }

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

    function clearMetaTimer(){ if (metaTimer) { clearInterval(metaTimer); metaTimer = 0; } }

    function startMetaTicker(track){
      clearMetaTimer();
      if (!track?.isStream) return;

      const poll = async () => {
        let info = null;

        // 1) Try universal detectors from the actual stream URL (best effort)
        if (lastStreamUrl) info = await fetchStreamMetaUniversal(lastStreamUrl, cfg.corsProxy);

        // 2) If the station object provided `kind/meta`, try that as a fallback
        if (!info && track.kind && track.meta) info = await pollMeta(track.kind, track.meta, cfg.corsProxy);

        if (info && (info.now || info.title)) {
          const label = normalizeNow(info.now || info.title || '');
          if (label && label !== lastNow) {
            lastNow = label;
            setNow(label, 'Radio');
            // Also update the current list row text if present
            try {
              const row = list?.children[cursor];
              const tDiv = row?.querySelector('.t');
              if (tDiv && !track._titleOverridden) tDiv.textContent = label;
            } catch {}
          }
        }
      };

      poll();
      metaTimer = setInterval(poll, cfg.metaPollSec * 1000);
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
          const ok = await tryPlayStream(audio, tr.urls);
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

    // Controls
    function playPause(){ if (!audio.src) return playAt(0); if (audio.paused) audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); else { audio.pause(); setPlayIcon(false);} }
    function stop(){ audio.pause(); try{audio.currentTime=0;}catch{} setPlayIcon(false); clearMetaTimer(); lastNow=''; }
    function prev(){
      if (activeSource === 'stations'){
        if (!manifest.stations.length) return;
        const i = (selStations.selectedIndex - 1 + manifest.stations.length) % manifest.stations.length;
        selStations.selectedIndex = i; onPickStations();
      } else {
        if (!manifest.playlists.length) return;
        const i = (selMusic.selectedIndex - 1 + manifest.playlists.length) % manifest.playlists.length;
        selMusic.selectedIndex = i; onPickMusic();
      }
    }
    function next(){
      if (activeSource === 'stations'){
        if (!manifest.stations.length) return;
        const i = (selStations.selectedIndex + 1) % manifest.stations.length;
        selStations.selectedIndex = i; onPickStations();
      } else {
        if (!manifest.playlists.length) return;
        const i = (selMusic.selectedIndex + 1) % manifest.playlists.length;
        selMusic.selectedIndex = i; onPickMusic();
      }
    }
    function toggleShuffle(){ cfg.shuffle = !cfg.shuffle; btns.shuffle?.classList.toggle('active', cfg.shuffle); }
    function toggleLoopAll(){ loopMode = (loopMode==='all')?'none':'all'; btns.loop?.classList.toggle('active', loopMode==='all'); btns.loop1?.classList.remove('active'); }
    function toggleLoopOne(){ loopMode = (loopMode==='one')?'none':'one'; btns.loop1?.classList.toggle('active', loopMode==='one'); btns.loop?.classList.remove('active'); }
    function toggleMute(){ audio.muted = !audio.muted; setMuteIcon(); }

    // Wire events
    btns.play?.addEventListener('click', playPause);
    btns.stop?.addEventListener('click', stop);
    btns.prev?.addEventListener('click', prev);
    btns.next?.addEventListener('click', next);
    btns.shuffle?.addEventListener('click', toggleShuffle);
    btns.loop?.addEventListener('click', toggleLoopAll);
    btns.loop1?.addEventListener('click', toggleLoopOne);
    btns.mute?.addEventListener('click', toggleMute);

    switchKnob.addEventListener('click', ()=>{
      const pressed = switchKnob.getAttribute('aria-pressed') === 'true';
      activeSource = pressed ? 'playlists' : 'stations';
      setSourceUI();
      clearMetaTimer();
      lastNow = '';
      if (activeSource === 'stations') onPickStations(); else onPickMusic();
    });

    seek?.addEventListener('input', ()=>{
      if (!isFinite(audio.duration) || audio.duration<=0) return;
      audio.currentTime = (seek.value/1000) * audio.duration;
    });
    if (Number.isFinite(cfg.volume)) audio.volume = Math.min(1, Math.max(0, cfg.volume));
    vol?.addEventListener('input', ()=>{ audio.volume = Math.min(1, Math.max(0, parseFloat(vol.value||'0.5'))); });

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
      if (e.key && e.key.toLowerCase() === 'm') toggleMute();
    });

    if (cfg.autoplayMuted) {
      audio.muted = true; setMuteIcon();
      const unmute=()=>{audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true});};
      window.addEventListener('click', unmute, {once:true});
    }
    setMuteIcon();

    // Data loading
    async function getJSON(u){ try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }catch{return null;} }
    function fillSelect(sel, arr, label='Item'){
      if (!sel) return; sel.innerHTML='';
      arr.forEach((it,i)=>{ const o=document.createElement('option'); o.value=it.file; o.textContent=it.name||`${label} ${i+1}`; sel.appendChild(o); });
    }

    async function loadM3U(path, isStation, stationMeta){
      const url = isAbs(path) ? path : join(cfg.manifestUrl.replace(/\/manifest\.json$/i,''), path);
      const txt = await fetch(url, {cache:'no-store'}).then(r=>r.ok?r.text():'');
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

    async function onPickStations(){
      if (!manifest.stations.length) return;
      const idx = Math.max(0, selStations.selectedIndex);
      const def = manifest.stations[idx];
      const meta = def.meta || {};
      const tracks = await loadM3U(def.file, true, { meta, kind: meta.kind, title: def.name });
      queue = tracks; cursor = -1; renderQueue(); setNow('—','Radio'); if (cfg.autoplay) playAt(0);
    }
    async function onPickMusic(){
      if (!manifest.playlists.length) return;
      const idx = Math.max(0, selMusic.selectedIndex);
      const def = manifest.playlists[idx];
      let tracks = await loadM3U(def.file, false);
      if (cfg.shuffle && tracks.length > 1){
        for(let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
      }
      queue = tracks; cursor = -1; renderQueue(); setNow('—','Playlist'); if (cfg.autoplay) playAt(0);
    }

    (async function init(){
      setNow('—','—');
      const mf = await getJSON(cfg.manifestUrl);
      manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
      manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
      fillSelect(selStations, manifest.stations, 'Station');
      fillSelect(selMusic,    manifest.playlists, 'Playlist');

      btns.shuffle?.classList.toggle('active', cfg.shuffle);

      if (manifest.stations.length && selStations.selectedIndex < 0) selStations.selectedIndex = 0;
      if (manifest.playlists.length && selMusic.selectedIndex < 0) selMusic.selectedIndex = 0;
      switchKnob.setAttribute('aria-pressed', activeSource === 'stations' ? 'true' : 'false');
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
    })();

    selStations.addEventListener('change', ()=>{ if(activeSource==='stations') { clearMetaTimer(); lastNow=''; onPickStations(); } });
    selMusic.addEventListener('change',    ()=>{ if(activeSource==='playlists'){ clearMetaTimer(); lastNow=''; onPickMusic(); } });
  };

  // Auto-mount
  document.addEventListener('mp:init', (ev) => {
    const root = ev.target.closest('[data-mp]') || document.querySelector('[data-mp]');
    if (root) MusicPlayer.mount(root, ev.detail || {});
  });

  window.MusicPlayer = MusicPlayer;
})();
