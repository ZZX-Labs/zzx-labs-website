// /music/script.js — direct stream playback + CORS-only metadata + working toggle + per-station history + HORIZONTAL meters
(function () {
  const root = document.querySelector('[data-mp]');
  if (!root) return console.error('[music] no [data-mp] element');

  /* ---------- env + cfg ---------- */
  const isGH = location.hostname.endsWith('github.io');
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
    volume        : clamp01(parseFloat(attr('data-volume') || '0.25')),
    startSource   : attr('data-start-source') || 'stations',   // 'stations' | 'playlists' | 'auto'
    corsProxy     : (attr('data-cors-proxy') || '').trim(),    // e.g. https://corsproxy.io/?
    metaPollSec   : 8
  };

  function attr(n){ return root.getAttribute(n); }
  function clamp01(v){ return Math.min(1, Math.max(0, isFinite(v) ? v : 0.25)); }
  function isAbs(u){ return /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/'); }
  function join(base, rel){ if (isAbs(rel)) return rel; return (base.replace(/\/+$/,'') + '/' + rel.replace(/^\/+/,'').replace(/^\.\//,'')); }
  const $=(s,c=root)=>c.querySelector(s), $$=(s,c=root)=>Array.from(c.querySelectorAll(s));
  const fmtTime=(sec)=>(!isFinite(sec)||sec<0)?'—':`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

  // Metadata fetches go via proxy, audio does NOT.
  function corsWrap(u){
    if (!u) return '';
    if (!cfg.corsProxy) return u;
    return cfg.corsProxy.includes('?') ? (cfg.corsProxy + encodeURIComponent(u))
                                       : (cfg.corsProxy.replace(/\/+$/,'') + '/' + u);
  }

  /* ---------- M3U ---------- */
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

  /* ---------- UI shell ---------- */
  function buildShell(){
    root.innerHTML = `
      <div class="mp-top">
        <div class="mp-now">
          <div class="mp-title mono" data-title>—</div>
          <div class="mp-sub small"  data-sub>—</div>
        </div>

        <div class="mp-controls" role="toolbar" aria-label="Controls">
          <!-- Slide toggle, left-most -->
          <div class="mp-switch" role="group" title="Toggle Radio / Playlists">
            <button class="mp-switch-knob" data-src-toggle aria-pressed="true" aria-label="Radio / Playlists"></button>
          </div>

          <button class="mp-btn" data-act="prev" title="Previous (⟵)">⏮</button>
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
      </div>

      <!-- HORIZONTAL stacked meters (L top, R bottom) + full-width volume -->
      <div class="mp-meter">
        <div class="vu-scale"><span class="left">0 dB</span><span class="right">+6 dB</span></div>
        <div class="vu-rows">
          <div class="vu-row">
            <div class="vu-ch">L</div>
            <div class="vu-bar">${renderBar('L')}</div>
          </div>
          <div class="vu-row">
            <div class="vu-ch">R</div>
            <div class="vu-bar">${renderBar('R')}</div>
          </div>
        </div>
        <div class="mp-vol">
          <input type="range" class="mp-volume" min="0" max="1" step="0.01" value="${cfg.volume}" aria-label="Volume">
        </div>
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
  function renderBar(side){
    // 6 green, 1 yellow, 1 red — horizontal; data-led-* kept for the JS to light segments
    const seg = (cls, i) => `<span class="hled ${cls}" data-led-${side}${i}></span>`;
    return [
      seg('g',0), seg('g',1), seg('g',2), seg('g',3), seg('g',4), seg('g',5),
      seg('y',6),
      seg('r',7)
    ].join('');
  }

  /* ---------- State ---------- */
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  // Audio meter graph
  let audioCtx, srcNode, splitter, analyserL, analyserR, meterTimer;

  let manifest = { stations: [], playlists: [] };
  let queue = [];        // tracks for playlists or single LIVE item for station
  let cursor = -1;
  let loopMode = 'none';
  let usingStations = true;
  let metaTimer = null;
  let lastStreamUrl = '';
  let lastNowTitle = '';

  // Per-station history: Map<stationKey, string[]>
  const historyByStation = new Map();
  function stationKey(title, url){
    if (title && title.trim()) return title.trim();
    try { const u=new URL(url, location.href); return `${u.host}${u.pathname}`; } catch { return url||'unknown'; }
  }

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
    sel = { stations: $('.mp-pl-stations'), playlists: $('.mp-pl-music') };
    switchKnob = $('[data-src-toggle]');
  }

  function setNow(t, s){ if (titleEl) titleEl.textContent = t || '—'; if (subEl) subEl.textContent = s || '—'; }
  function setPlayIcon(on){ if (btn.play) btn.play.textContent = on ? '⏸' : '▶'; }
  function setMuteIcon(){ if (btn.mute) btn.mute.textContent = audio.muted ? '🔇' : '🔊'; }
  function paintTimes(){
    if (timeCur) timeCur.textContent = fmtTime(audio.currentTime);
    if (timeDur) timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
    if (seek && isFinite(audio.duration) && audio.duration>0) seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
  function normalizeNow(s){
    if (!s) return '';
    const txt = s.replace(/\s+/g,' ').trim();
    const m = txt.split(' - ');
    if (m.length >= 2) {
      const artist = m.shift();
      const title  = m.join(' - ');
      return `${artist} - ${title}`;
    }
    return txt;
  }

  function highlightList(){
    if (!list) return;
    $$('.active', list).forEach(li => li.classList.remove('active'));
    if (cursor >= 0) list.children[cursor + (usingStations ? 1 : 0)]?.classList.add('active');
  }

  // Radio view shows: [station row], [now-playing row], then history (most recent first)
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

    // History under current station
    const key = stationKey(stationTitle, lastStreamUrl);
    const hist = historyByStation.get(key) || [];
    for (let i = hist.length - 1; i >= 0; i--){
      const hli = document.createElement('li');
      const hl  = document.createElement('div'); hl.className='t';
      const hr  = document.createElement('div'); hr.className='len mono';
      hl.textContent = hist[i];
      hr.textContent = '';
      hli.appendChild(hl); hli.appendChild(hr);
      list.appendChild(hli);
    }
  }

  function appendStationHistory(stationTitle, item){
    const key = stationKey(stationTitle, lastStreamUrl);
    const arr = historyByStation.get(key) || [];
    if (!arr.length || arr[arr.length - 1] !== item) {
      arr.push(item);
      if (arr.length > 250) arr.shift(); // cap
      historyByStation.set(key, arr);
    }
  }
  function updateRadioNow(stationTitle, nowTitle){
    const el = list?.querySelector('li[data-now="1"] .t');
    if (el) el.textContent = nowTitle || '—';
    appendStationHistory(stationTitle, nowTitle);
  }

  /* ---------- Loaders ---------- */
  async function getText(url){ try { const r=await fetch(url,{cache:'no-store'}); return r.ok? r.text():''; } catch { return ''; } }
  async function getJSON(url){ try { const r=await fetch(url,{cache:'no-store'}); return r.ok? r.json():null; } catch { return null; } }

  async function loadM3U(path, isStation){
    const base = cfg.manifestUrl.replace(/\/manifest\.json$/i,'/');
    const url  = isAbs(path) ? path : join(base, path);
    const txt  = await getText(url);
    const entries = parseM3U(txt);
    if (!entries.length) return [];
    if (isStation) {
      const urls = entries.map(e => isAbs(e.url) ? e.url : join(cfg.audioBase, e.url));
      lastStreamUrl = urls[0] || '';
      return [{ title: sel.stations?.selectedOptions?.[0]?.textContent || 'Live Station', isStream:true, urls }];
    }
    return entries.map(e => ({ title: e.title || e.url, url: isAbs(e.url) ? e.url : join(cfg.audioBase, e.url), isStream:false }));
  }

  /* ---------- Playback ---------- */
  async function tryPlayStream(urls){
    let lastErr;
    for (const u of urls){
      try {
        audio.src = u;                  // direct stream (no proxy)
        await audio.play();
        return u;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No playable stream endpoints');
  }

  async function playAt(i){
    if (!queue.length) return;
    cursor = (i + queue.length) % queue.length;
    const tr = queue[cursor];
    setNow(tr.title, usingStations ? 'Radio' : 'Playlist');
    setPlayIcon(false);

    stopMetaPolling();
    try{
      if (tr.isStream) {
        const ok = await tryPlayStream(tr.urls);
        lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;
        setPlayIcon(true);
        renderRadioList(tr.title, lastNowTitle || '—');
        highlightList();
        startMetaPolling(tr.title);
        ensureMeter();
      } else {
        audio.src = tr.url;
        await audio.play();
        setPlayIcon(true);
        highlightList();
        ensureMeter();
      }
    }catch(e){
      setPlayIcon(false);
      setNow(tr.title, 'Failed to play — choose another');
    }
  }

  function playPause(){ if (!audio.src) return playAt(0); if (audio.paused) audio.play().then(()=>setPlayIcon(true)).catch(()=>{}); else { audio.pause(); setPlayIcon(false); } }
  function stop(){ audio.pause(); try{ audio.currentTime=0; }catch{} setPlayIcon(false); }
  function prev(){ usingStations ? prevStation() : prevTrack(); }
  function next(){ usingStations ? nextStation() : nextTrack(); }
  function prevTrack(){ if (loopMode==='one') return playAt(cursor); playAt(cursor - 1); }
  function nextTrack(){
    if (loopMode==='one') return playAt(cursor);
    if (cfg.shuffle) {
      let j = Math.floor(Math.random()*queue.length);
      if (queue.length>1 && j===cursor) j = (j+1)%queue.length;
      playAt(j);
    } else {
      const n = cursor + 1;
      if (n >= queue.length) { if (loopMode==='all') return playAt(0); setPlayIcon(false); }
      else playAt(n);
    }
  }
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

  /* ---------- Live metadata (CORS only) ---------- */
  function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer=null; } }
  function startMetaPolling(stationTitle){
    stopMetaPolling();
    if (!lastStreamUrl) return;
    pollOnce(stationTitle);
    metaTimer = setInterval(()=>pollOnce(stationTitle), Math.max(5, cfg.metaPollSec)*1000);
  }
  async function pollOnce(stationTitle){
    try {
      const meta = await fetchStreamMeta(lastStreamUrl);
      if (meta && (meta.now || meta.title)) {
        const display = normalizeNow(meta.now || meta.title);
        if (display && display !== lastNowTitle) {
          lastNowTitle = display;
          setNow(stationTitle || meta.title || 'Live Station', 'Radio');
          updateRadioNow(stationTitle, display);
        }
      }
    } catch {}
  }
  async function fetchStreamMeta(streamUrl){
    try {
      const u = new URL(streamUrl, location.href);
      const base = `${u.protocol}//${u.host}`;
      const candidates = [
        corsWrap(`${base}/status-json.xsl`),     // Icecast JSON
        corsWrap(`${base}/status.xsl?json=1`),   // Alt Icecast JSON
        corsWrap(`${base}/stats?sid=1&json=1`),  // Shoutcast v2 JSON
        corsWrap(guessRadioCoStatus(u)),         // Radio.co JSON
        corsWrap(`${base}/7.html`)               // Shoutcast v1 plaintext
      ].filter(Boolean);

      for (const url of candidates){
        const isJson = /(\.xsl$|json=1|public\.radio\.co)/.test(url);
        const data = isJson ? await getJSON(url) : await getText(url);
        if (!data) continue;

        // Icecast JSON
        if (isJson && typeof data === 'object' && data.icestats) {
          const src = data.icestats.source;
          const arr = Array.isArray(src) ? src : (src ? [src] : []);
          const hit = arr[0];
          if (hit) {
            const title = hit.server_name || hit.title || '';
            const now   = hit.artist && hit.title ? `${hit.artist} - ${hit.title}` : (hit.title || '');
            if (title || now) return { title, now };
          }
        }
        // Shoutcast v2 JSON
        if (isJson && (data?.servertitle || data?.songtitle)) {
          return { title: data.servertitle || '', now: data.songtitle || '' };
        }
        // Radio.co JSON
        if (isJson && (data?.current_track || data?.name)) {
          const now = data.current_track?.title_with_artists || data.current_track?.title || '';
          return { title: data.name || '', now };
        }
        // Shoutcast v1 /7.html
        if (typeof data === 'string' && (url.endsWith('/7.html') || url.includes('/7.html?'))) {
          const m = data.match(/<body[^>]*>([^<]*)<\/body>/i) || data.match(/(.*,){6}(.+)/);
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
    return m ? `https://public.radio.co/stations/${m[1]}/status` : '';
  }

  /* ---------- Meter ---------- */
  function ensureMeter(){
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      srcNode  = audioCtx.createMediaElementSource(audio);
      splitter = audioCtx.createChannelSplitter(2);
      analyserL = audioCtx.createAnalyser(); analyserR = audioCtx.createAnalyser();
      analyserL.fftSize = 256; analyserR.fftSize = 256;
      srcNode.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);
      srcNode.connect(audioCtx.destination);
      startMeterLoop();
    } catch {}
  }
  function startMeterLoop(){
    stopMeterLoop();
    // selects by data-led-* so CSS class names can differ; we render .hled in the DOM
    const ledsL = Array.from(document.querySelectorAll('[data-led-L0],[data-led-L1],[data-led-L2],[data-led-L3],[data-led-L4],[data-led-L5],[data-led-L6],[data-led-L7]'));
    const ledsR = Array.from(document.querySelectorAll('[data-led-R0],[data-led-R1],[data-led-R2],[data-led-R3],[data-led-R4],[data-led-R5],[data-led-R6],[data-led-R7]'));
    const bufL = new Uint8Array(analyserL.frequencyBinCount);
    const bufR = new Uint8Array(analyserR.frequencyBinCount);
    function rms(arr){ let s=0; for (let i=0;i<arr.length;i++) s+=arr[i]*arr[i]; return Math.sqrt(s/arr.length)/255; }
    function tick(){
      analyserL.getByteTimeDomainData(bufL);
      analyserR.getByteTimeDomainData(bufR);
      const vL = Math.min(1, Math.max(0, (rms(bufL)-0.02)*1.4));
      const vR = Math.min(1, Math.max(0, (rms(bufR)-0.02)*1.4));
      paintLeds(ledsL, vL); paintLeds(ledsR, vR);
      meterTimer = requestAnimationFrame(tick);
    }
    tick();
  }
  function stopMeterLoop(){ if (meterTimer) cancelAnimationFrame(meterTimer); meterTimer=null; }
  function paintLeds(leds, v){ const total=8, lit=Math.round(v*total); leds.forEach((el,i)=> el.classList.toggle('on', i<lit)); }

  /* ---------- Controls ---------- */
  function setSwitch(toPlaylists){
    // toPlaylists === true -> switch to playlists; false -> stations
    usingStations = !toPlaylists;
    switchKnob.setAttribute('aria-pressed', usingStations ? 'true' : 'false');
    sel.stations?.classList.toggle('is-disabled', !usingStations);
    sel.playlists?.classList.toggle('is-disabled', usingStations);
  }

  function wireControls(){
    // Toggle: read current state from aria-pressed and invert
    switchKnob?.addEventListener('click', async ()=>{
      const currentlyRadio = (switchKnob.getAttribute('aria-pressed') === 'true');
      setSwitch(currentlyRadio /* -> playlists */);
      if (usingStations) {
        if (sel.stations?.options.length) await onPickStations(true);
      } else {
        if (sel.playlists?.options.length) await onPickMusic(true);
      }
    });

    btn.play?.addEventListener('click', playPause);
    btn.stop?.addEventListener('click', stop);
    btn.prev?.addEventListener('click', prev);
    btn.next?.addEventListener('click', next);
    btn.shuffle?.addEventListener('click', ()=> { cfg.shuffle=!cfg.shuffle; btn.shuffle.classList.toggle('active', cfg.shuffle); });
    btn.loop?.addEventListener('click', ()=> { loopMode = (loopMode==='all')?'none':'all'; btn.loop.classList.toggle('active', loopMode==='all'); btn.loop1.classList.remove('active'); });
    btn.loop1?.addEventListener('click',()=> { loopMode = (loopMode==='one')?'none':'one'; btn.loop1.classList.toggle('active', loopMode==='one'); btn.loop.classList.remove('active'); });
    btn.mute?.addEventListener('click', ()=> { audio.muted = !audio.muted; setMuteIcon(); });

    seek?.addEventListener('input', ()=>{
      if (!isFinite(audio.duration) || audio.duration<=0) return;
      audio.currentTime = (seek.value/1000)*audio.duration;
    });
    if (vol){ vol.value = String(cfg.volume); audio.volume = cfg.volume; vol.addEventListener('input', ()=> { audio.volume = clamp01(parseFloat(vol.value)); }); }

    audio.addEventListener('timeupdate', paintTimes);
    audio.addEventListener('durationchange', paintTimes);
    audio.addEventListener('ended', ()=> usingStations ? setPlayIcon(false) : nextTrack());

    root.addEventListener('keydown', (e)=>{
      if (e.code==='Space'){ e.preventDefault(); playPause(); }
      if (e.code==='ArrowLeft') prev();
      if (e.code==='ArrowRight') next();
      if (e.key?.toLowerCase?.()==='m') { audio.muted = !audio.muted; setMuteIcon(); }
    });

    if (cfg.autoplayMuted) {
      audio.muted = true; setMuteIcon();
      const unmute = ()=>{ audio.muted=false; setMuteIcon(); window.removeEventListener('click', unmute, {once:true}); };
      window.addEventListener('click', unmute, { once:true });
    }
    setMuteIcon();
  }

  async function onPickStations(autoPlay){
    setSwitch(false);
    const file = sel.stations?.value; if (!file) return;
    queue = await loadM3U(file, true);
    cursor = 0;
    const stTitle = queue[0]?.title || 'Live Station';
    renderRadioList(stTitle, lastNowTitle || '—');
    setNow(stTitle, 'Radio');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
  }
  async function onPickMusic(autoPlay){
    setSwitch(true);
    const file = sel.playlists?.value; if (!file) return;
    let tracks = await loadM3U(file, false);
    if (cfg.shuffle && tracks.length>1){
      for (let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor = 0;
    renderPlaylistList(queue);
    setNow(queue[0]?.title || '—', 'Playlist');
    if (autoPlay || cfg.autoplay || cfg.autoplayMuted) playAt(0);
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

  async function boot(){
    buildShell(); wireRefs(); wireControls();

    // Start on preferred source
    setSwitch(cfg.startSource === 'playlists');

    const mf = await getJSON(cfg.manifestUrl);
    manifest.stations  = Array.isArray(mf?.stations)  ? mf.stations  : [];
    manifest.playlists = Array.isArray(mf?.playlists) ? mf.playlists : [];
    fillSelect(sel.stations,  manifest.stations);
    fillSelect(sel.playlists, manifest.playlists);

    // Initial selection
    let mode = cfg.startSource;
    if (mode === 'auto'){
      const both = manifest.stations.length && manifest.playlists.length;
      mode = both ? (Math.random()<0.5?'stations':'playlists')
           : (manifest.stations.length?'stations':'playlists');
    }
    if (mode==='stations' && manifest.stations.length){
      sel.stations.selectedIndex = 0; await onPickStations(false);
    } else if (manifest.playlists.length){
      sel.playlists.selectedIndex = 0; await onPickMusic(false);
    } else {
      setNow('No playlists found','—');
    }

    // polite autoplay if muted
    if (cfg.autoplay && cfg.autoplayMuted && !audio.src) {
      if (mode==='stations' && manifest.stations.length) await onPickStations(true);
      else if (manifest.playlists.length) await onPickMusic(true);
    }
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
