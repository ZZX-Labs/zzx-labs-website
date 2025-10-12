// ZZX-Labs Music Player — compact row UI, slide switch, live metadata & stereo LED meters
(function () {
  const root = document.querySelector('[data-mp]');
  if (!root) return;

  /* ---------- Config ---------- */
  const cfg = {
    manifestUrl   : attr('data-manifest-url') || '/static/audio/music/playlists/manifest.json',
    audioBase     : attr('data-audio-base')   || '/static/audio/music/',
    corsProxy     : attr('data-cors-proxy')   || '',               // e.g. https://corsproxy.io/?
    autoplay      : attr('data-autoplay') === '1',
    autoplayMuted : attr('data-autoplay-muted') === '1',
    shuffle       : attr('data-shuffle') === '1',
    volume        : clamp01(parseFloat(attr('data-volume') || '0.25')), // default 25%
    startSource   : attr('data-start-source') || 'stations',
    metaPollSec   : 12
  };

  function attr(n){ return root.getAttribute(n); }
  function clamp01(v){ return Math.min(1, Math.max(0, isFinite(v)?v:0.25)); }
  const $ = (s,c=root)=>c.querySelector(s);
  const $$= (s,c=root)=>Array.from(c.querySelectorAll(s));
  const isAbs = u => /^([a-z]+:)?\/\//i.test(u) || u.startsWith('/');
  const join  = (b,r)=> isAbs(r) ? r : b.replace(/\/+$/,'') + '/' + r.replace(/^\/+/,'');
  const fmtTime = s => (!isFinite(s)||s<0)?'—':`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  /* ---------- UI shell ---------- */
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-now">
        <div class="mp-title mono" data-title>—</div>
        <div class="mp-sub small"  data-sub>—</div>
      </div>
      <div class="mp-controls" role="toolbar" aria-label="Audio Controls">
        <div class="mp-switch" data-switch title="Toggle stations/playlists"><div class="knob"></div><div class="hint"><div class="dot"></div><div class="dot"></div></div></div>
        <button class="mp-btn" data-act="prev" title="Previous">⏮</button>
        <button class="mp-btn" data-act="play" title="Play/Pause">▶</button>
        <button class="mp-btn" data-act="stop" title="Stop">⏹</button>
        <button class="mp-btn" data-act="next" title="Next">⏭</button>
        <button class="mp-btn" data-act="shuffle" title="Shuffle">🔀</button>
        <button class="mp-btn" data-act="loop" title="Loop all">🔁</button>
        <button class="mp-btn" data-act="loop1" title="Loop one">🔂</button>
        <button class="mp-btn" data-act="mute" title="Mute">🔇</button>
      </div>
    </div>

    <div class="mp-middle">
      <div class="mp-time mono"><span data-cur>00:00</span> / <span data-dur>—</span></div>
      <input type="range" class="mp-seek" min="0" max="1000" value="0" step="1" aria-label="Seek">
    </div>

    <div class="mp-volrow">
      <input type="range" class="mp-volume" min="0" max="1" step="0.01" value="${cfg.volume}" aria-label="Volume">
      <div class="meters">
        <div class="vu" data-vu="L"></div>
        <div class="vu" data-vu="R"></div>
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

  /* ---------- Elements ---------- */
  const titleEl = $('[data-title]');
  const subEl   = $('[data-sub]');
  const timeCur = $('[data-cur]');
  const timeDur = $('[data-dur]');
  const seek    = $('.mp-seek');
  const vol     = $('.mp-volume');
  const list    = $('.mp-list');
  const selSt   = $('.mp-pl-stations');
  const selPl   = $('.mp-pl-music');
  const switchEl= $('[data-switch]');
  const btn = {
    prev:$('.mp-btn[data-act="prev"]'), play:$('.mp-btn[data-act="play"]'),
    stop:$('.mp-btn[data-act="stop"]'), next:$('.mp-btn[data-act="next"]'),
    shuffle:$('.mp-btn[data-act="shuffle"]'), loop:$('.mp-btn[data-act="loop"]'),
    loop1:$('.mp-btn[data-act="loop1"]'), mute:$('.mp-btn[data-act="mute"]')
  };

  /* ---------- Audio + meters ---------- */
  const audio = new Audio(); audio.preload='metadata'; audio.crossOrigin='anonymous'; audio.volume=cfg.volume;
  let ac, srcNode, split, anaL, anaR, rafId=0;

  buildVu($('.vu[data-vu="L"]')); buildVu($('.vu[data-vu="R"]'));
  function buildVu(container){
    // 6 green (pairs), 2 yellow, 2 red = 10 leds
    const plan = ['g','g','g','g','g','g','y','y','r','r'];
    plan.forEach(k=>{const d=document.createElement('div'); d.className='led '+k; container.appendChild(d);});
  }
  function startMeters(){
    if (ac) return;
    ac = new (window.AudioContext||window.webkitAudioContext)();
    srcNode = ac.createMediaElementSource(audio);
    split = ac.createChannelSplitter(2);
    anaL = ac.createAnalyser(); anaR = ac.createAnalyser();
    anaL.fftSize = anaR.fftSize = 2048;
    srcNode.connect(split);
    split.connect(anaL,0); split.connect(anaR,1);
    // also route to destination
    srcNode.connect(ac.destination);
    loopMeter();
  }
  function stopMeters(){ if (rafId) cancelAnimationFrame(rafId); rafId=0; }
  function level(analyser){
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    // simple peak detector
    let peak = 0;
    for (let i=0;i<buf.length;i++){ const v = (buf[i]-128)/128; peak = Math.max(peak, Math.abs(v)); }
    return peak; // 0..1
  }
  function light(container, value){
    const leds = $$('.led', container);
    const n = Math.round(value * leds.length);
    leds.forEach((el,i)=> el.classList.toggle('on', i < n));
  }
  function loopMeter(){
    const l = level(anaL||anaR||{fftSize:2048,getByteTimeDomainData(){}});
    const r = level(anaR||anaL||{fftSize:2048,getByteTimeDomainData(){}});
    light($('.vu[data-vu="L"]'), l);
    light($('.vu[data-vu="R"]'), r);
    rafId = requestAnimationFrame(loopMeter);
  }

  /* ---------- State ---------- */
  let manifest = {stations:[],playlists:[]};
  let usingStations = (cfg.startSource !== 'playlists');
  let queue=[], cursor=-1, loopMode='none', metaTimer=0, lastStreamUrl='', lastNow='—';

  function setSwitchUI(){
    switchEl.classList.toggle('active', !usingStations); // active = playlists
    selSt.classList.toggle('is-disabled', !usingStations);
    selPl.classList.toggle('is-disabled', usingStations);
  }
  function setNow(t, s){ titleEl.textContent = t || '—'; subEl.textContent = s || '—'; }
  function setPlayIcon(on){ btn.play.textContent = on ? '⏸' : '▶'; }
  function paintTimes(){
    timeCur.textContent = fmtTime(audio.currentTime);
    timeDur.textContent = isFinite(audio.duration) ? fmtTime(audio.duration) : '—';
    if (isFinite(audio.duration) && audio.duration>0) seek.value = Math.round((audio.currentTime/audio.duration)*1000);
  }

  /* ---------- Manifest + lists ---------- */
  async function getJSON(u){ try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw 0; return r.json(); }catch{ return null; } }
  async function getText(u){ try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw 0; return r.text(); }catch{ return ''; } }
  function fillSelect(sel, arr){
    sel.innerHTML=''; arr.forEach((it,i)=>{ const o=document.createElement('option'); o.value=it.file; o.textContent=it.name||`Item ${i+1}`; sel.appendChild(o); });
  }
  function parseM3U(text){
    const lines = String(text||'').split(/\r?\n/); const out=[]; let t=null;
    for(const raw of lines){ const s=raw.trim();
      if(!s || s.startsWith('#EXTM3U')) continue;
      if(s.startsWith('#EXTINF:')){ const i=s.indexOf(','); t = (i>=0)?s.slice(i+1).trim():null; continue; }
      if(!s.startsWith('#')) out.push({url:s,title:t||s}), t=null;
    } return out;
  }
  async function loadM3U(path, isStation){
    const url = isAbs(path) ? path : join(cfg.manifestUrl.replace(/\/manifest\.json$/i,''), path);
    const text = await getText(url);
    const ents = parseM3U(text);
    if (!ents.length) return [];
    if (isStation){
      const urls = ents.map(e=> isAbs(e.url)?e.url : join(cfg.audioBase, e.url));
      lastStreamUrl = urls[0] || '';
      return [{ title: selSt.selectedOptions[0]?.textContent || 'Live Station', isStream:true, urls }];
    } else {
      return ents.map(e => ({ title:e.title||e.url, url:isAbs(e.url)?e.url:join(cfg.audioBase,e.url), isStream:false }));
    }
  }
  function renderRadioList(stationTitle, nowTitle){
    list.innerHTML='';
    const li1=document.createElement('li'); li1.innerHTML=`<div class="t">${escapeHtml(stationTitle||'Live Station')}</div><div class="len">LIVE</div>`; list.appendChild(li1);
    const li2=document.createElement('li'); li2.setAttribute('data-now','1'); li2.innerHTML=`<div class="t">${escapeHtml(nowTitle||'—')}</div><div class="len"></div>`; list.appendChild(li2);
  }
  function updateRadioNow(msg){ const el=list.querySelector('li[data-now] .t'); if(el) el.textContent=(msg||'—'); }
  function renderPlaylistList(tracks){
    list.innerHTML=''; tracks.forEach((t,i)=>{
      const li=document.createElement('li');
      li.innerHTML=`<div class="t">${String(i+1).padStart(2,'0')} — ${escapeHtml(t.title||`Track ${i+1}`)}</div><div class="len"></div>`;
      li.addEventListener('click',()=> playAt(i));
      list.appendChild(li);
    });
  }

  /* ---------- Playback ---------- */
  async function tryPlayStream(urls){
    for (const u of urls){ try{ audio.src=u; await audio.play(); return u; }catch{} }
    throw new Error('stream failed');
  }
  async function playAt(i){
    if (!queue.length) return;
    cursor = (i+queue.length)%queue.length;
    const tr = queue[cursor];
    setNow(tr.title, usingStations?'Radio':'Playlist');
    setPlayIcon(false);

    try{
      if (tr.isStream){
        const ok = await tryPlayStream(tr.urls);
        lastStreamUrl = ok || tr.urls[0] || lastStreamUrl;
        renderRadioList(tr.title, lastNow);
        startMetaPolling(tr.title);
        startMeters();
      } else {
        audio.src = tr.url;
        await audio.play();
        stopMetaPolling();
        startMeters();
      }
      setPlayIcon(true);
    }catch(e){
      usingStations ? nextStation() : nextTrack();
    }
  }
  function playPause(){ if(!audio.src) return playAt(0); if(audio.paused) audio.play().then(()=>setPlayIcon(true)); else {audio.pause(); setPlayIcon(false);} }
  function stop(){ audio.pause(); try{audio.currentTime=0;}catch{} setPlayIcon(false); }
  function next(){ usingStations ? nextStation() : nextTrack(); }
  function prev(){ usingStations ? prevStation() : prevTrack(); }
  function nextTrack(){
    if (loopMode==='one') return playAt(cursor);
    if (cfg.shuffle){ let j=Math.floor(Math.random()*queue.length); if(queue.length>1 && j===cursor) j=(j+1)%queue.length; playAt(j); }
    else { const n=cursor+1; if(n>=queue.length){ if(loopMode==='all') playAt(0); else setPlayIcon(false);} else playAt(n); }
  }
  function prevTrack(){ if (loopMode==='one') return playAt(cursor); playAt(cursor-1); }
  function nextStation(){ if (!selSt.options.length) return; selSt.selectedIndex=(selSt.selectedIndex+1)%selSt.options.length; onPickStations(true); }
  function prevStation(){ if (!selSt.options.length) return; selSt.selectedIndex=(selSt.selectedIndex-1+selSt.options.length)%selSt.options.length; onPickStations(true); }

  /* ---------- Metadata (ID3-ish) polling with noise filters ---------- */
  function stopMetaPolling(){ if(metaTimer){ clearInterval(metaTimer); metaTimer=0; } }
  function startMetaPolling(stTitle){
    stopMetaPolling(); if(!lastStreamUrl) return;
    const poll = async ()=>{
      const m = await fetchStreamMeta(lastStreamUrl);
      if (!m) return;
      const clean = scrubNow(m.now || m.title || '—');
      lastNow = clean;
      setNow(stTitle, 'Radio');
      updateRadioNow(clean);
    };
    poll(); metaTimer = setInterval(poll, Math.max(6,cfg.metaPollSec)*1000);
  }
  function cors(u){ return cfg.corsProxy ? (cfg.corsProxy.includes('?') ? cfg.corsProxy + encodeURIComponent(u) : cfg.corsProxy.replace(/\/+$/,'')+'/'+u) : u; }
  async function fetchTextMaybe(u){ try{ const r=await fetch(u,{cache:'no-store'}); return r.ok ? r.text() : ''; }catch{ return ''; } }
  async function fetchJSONMaybe(u){ try{ const r=await fetch(u,{cache:'no-store'}); return r.ok ? r.json() : null; }catch{ return null; } }

  async function fetchStreamMeta(streamUrl){
    try{
      const u = new URL(streamUrl, location.href);
      const base = u.origin;
      const cand = [
        cors(base + '/status-json.xsl'),           // Icecast JSON
        cors(base + '/status.xsl?json=1'),        // Icecast JSON alt
        cors(base + '/stats?sid=1&json=1'),       // Shoutcast v2 JSON
        guessRadioCo(u),                          // radio.co public status
        cors(base + '/7.html')                    // Shoutcast v1 legacy
      ].filter(Boolean);

      for (const c of cand){
        if (c.includes('public.radio.co')){
          const j = await fetchJSONMaybe(c);
          const t = j?.current_track?.title_with_artists || j?.current_track?.title || '';
          if (t) return { now:t };
          continue;
        }
        if (c.endsWith('/7.html')){
          const txt = await fetchTextMaybe(c);
          const m = txt.match(/<body[^>]*>([^<]*)<\/body>/i) || txt.match(/(.*,){6}(.+)/);
          const song = (m ? (m[1]||m[2]||'') : '').split(',').pop()?.trim();
          if (song) return { now:song };
          continue;
        }
        // JSON parses
        const txt = await fetchTextMaybe(c);
        if (!txt) continue;
        // Icecast JSON
        if (c.includes('status-json.xsl') || c.includes('status.xsl?json=1')){
          try{
            const j = JSON.parse(txt);
            const src = j.icestats?.source;
            const arr = Array.isArray(src)?src:(src?[src]:[]);
            const first = arr[0];
            const now = first?.artist && first?.title ? `${first.artist} — ${first.title}` : (first?.title || '');
            if (now) return { now };
          }catch{}
        }
        // Shoutcast v2 JSON
        if (c.includes('/stats?sid=1')){
          try{
            const j = JSON.parse(txt);
            const now = j?.songtitle || '';
            if (now) return { now };
          }catch{}
        }
      }
    }catch{}
    return null;
  }
  function guessRadioCo(u){
    const m = u.pathname.match(/\/(s[0-9a-f]{10})/i) || u.host.match(/(s[0-9a-f]{10})/i);
    return m ? cors(`https://public.radio.co/stations/${m[1]}/status`) : null;
  }
  function scrubNow(s){
    const t = (s||'').trim();
    const kill = [
      /donate\s+to\s+somafm/i,
      /support\s+somafm/i,
      /commercial[-\s]*free\s+radio/i,
      /station\s+id/i
    ];
    for (const re of kill){ if (re.test(t)) return '—'; }
    return t.replace(/\s{2,}/g,' ');
  }
  const escMap = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'};
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>escMap[c]); }

  /* ---------- Wiring ---------- */
  function setSource(isStations){ usingStations = isStations; setSwitchUI(); }
  switchEl.addEventListener('click', ()=>{
    setSource(!usingStations); // toggle
    if (usingStations) onPickStations(true); else onPickMusic(true);
  });

  btn.play.addEventListener('click', playPause);
  btn.stop.addEventListener('click', stop);
  btn.prev.addEventListener('click', prev);
  btn.next.addEventListener('click', next);
  btn.shuffle.addEventListener('click', ()=> btn.shuffle.classList.toggle('active', (cfg.shuffle=!cfg.shuffle)));
  btn.loop.addEventListener('click', ()=>{ loopMode = (loopMode==='all')?'none':'all'; btn.loop.classList.toggle('active', loopMode==='all'); btn.loop1.classList.remove('active'); });
  btn.loop1.addEventListener('click',()=>{ loopMode = (loopMode==='one')?'none':'one'; btn.loop1.classList.toggle('active', loopMode==='one'); btn.loop.classList.remove('active'); });
  btn.mute.addEventListener('click', ()=>{ audio.muted=!audio.muted; btn.mute.textContent = audio.muted ? '🔇' : '🔊'; });

  seek.addEventListener('input', ()=>{
    if (!isFinite(audio.duration) || audio.duration<=0) return;
    audio.currentTime = (seek.value/1000)*audio.duration;
  });
  vol.addEventListener('input', ()=>{ audio.volume = clamp01(parseFloat(vol.value)); });

  audio.addEventListener('timeupdate', paintTimes);
  audio.addEventListener('durationchange', paintTimes);
  audio.addEventListener('ended', ()=> usingStations ? nextStation() : nextTrack());

  if (cfg.autoplayMuted){
    audio.muted = true; btn.mute.textContent='🔇';
    const unmute=()=>{ audio.muted=false; btn.mute.textContent='🔊'; window.removeEventListener('click', unmute, {once:true}); };
    window.addEventListener('click', unmute, {once:true});
  }

  selSt.addEventListener('change', ()=> onPickStations(false));
  selPl.addEventListener('change', ()=> onPickMusic(false));

  /* ---------- Boot ---------- */
  (async function init(){
    setSource(cfg.startSource !== 'playlists');

    const mf = await getJSON(cfg.manifestUrl) || {};
    manifest.stations  = Array.isArray(mf.stations)?mf.stations:[];
    manifest.playlists = Array.isArray(mf.playlists)?mf.playlists:[];

    fillSelect(selSt, manifest.stations);
    fillSelect(selPl, manifest.playlists);

    if (usingStations && manifest.stations.length){ await onPickStations(false); }
    else if (manifest.playlists.length){ await onPickMusic(false); }

    if (cfg.autoplay && audio.paused){
      try{ await audio.play(); }catch{
        audio.muted = true; btn.mute.textContent='🔇';
        try{ await audio.play(); }catch{}
      }
    }
  })();

  async function onPickStations(autoPlay){
    setSource(true);
    const def = selSt.value; if (!def) return;
    queue = await loadM3U(def, true);
    cursor = 0; setNow(queue[0]?.title||'Live Station','Radio');
    renderRadioList(queue[0]?.title||'Live Station', lastNow||'—');
    if (autoPlay || cfg.autoplay) playAt(0);
  }
  async function onPickMusic(autoPlay){
    setSource(false);
    const def = selPl.value; if (!def) return;
    let tracks = await loadM3U(def, false);
    if (cfg.shuffle && tracks.length>1){
      for(let i=tracks.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tracks[i],tracks[j]]=[tracks[j],tracks[i]]; }
    }
    queue = tracks; cursor=0; setNow(queue[0]?.title||'—','Playlist');
    renderPlaylistList(queue);
    if (autoPlay || cfg.autoplay) playAt(0);
  }
})();
