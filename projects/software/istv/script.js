// ISTV: unified audio+video manifest loader + native players + minimal metrics
(async function () {
  const $ = (id) => document.getElementById(id);

  // Manifest DOM
  const titleEl   = $('project-title');
  const blurbEl   = $('project-blurb');
  const descEl    = $('project-description');
  const metaList  = $('meta-list');
  const tagList   = $('tag-list');
  const verList   = $('version-list');
  const imgGrid   = $('image-grid');
  const imgNote   = $('image-note');
  const logoEl    = $('project-logo');
  const btnOpen   = $('btn-open');
  const btnGitHub = $('btn-github');

  // Player DOM
  const urlEl     = $('url');
  const channelEl = $('channel');
  const autoplayEl= $('autoplay');
  const loopEl    = $('loop');
  const volEl     = $('vol');
  const btnLoad   = $('btn-load');

  const audio     = $('audio');
  const video     = $('video');

  const statusEl  = $('status');
  const typeEl    = $('type');
  const resEl     = $('res');
  const bitrateEl = $('bitrate');
  const peersEl   = $('peers');
  const labelEl   = $('label');
  const presetsEl = $('presets');

  const tabAuto   = $('tab-auto');
  const tabAudio  = $('tab-audio');
  const tabVideo  = $('tab-video');
  let forcedKind  = 'auto'; // 'auto' | 'audio' | 'video'

  // Load manifest
  let manifest = {};
  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();

    // Title & text
    if (manifest.title) titleEl.textContent = manifest.title;
    if (manifest.blurb) blurbEl.textContent = manifest.blurb;
    if (manifest.description) descEl.textContent = manifest.description;

    // Meta
    const meta = [];
    pushMeta(meta, 'Slug', manifest.slug);
    pushMeta(meta, 'State', manifest.state);
    pushMetaLink(meta, 'URL', manifest.href);
    pushMetaLink(meta, 'GitHub', manifest.github, true);
    pushMetaLink(meta, 'Docs', manifest.docs, true);
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    // Buttons
    if (manifest.href) { btnOpen.href = manifest.href; if (/^https?:/i.test(manifest.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; } }
    else { btnOpen.style.display = 'none'; }
    if (manifest.github) {
      btnGitHub.style.display = '';
      btnGitHub.href = manifest.github; btnGitHub.target = '_blank'; btnGitHub.rel = 'noopener noreferrer';
    }

    // Logo
    if (manifest.logo) { logoEl.src = manifest.logo; logoEl.style.display = 'block'; }

    // Tags
    tagList.innerHTML = '';
    (manifest.tags || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; tagList.appendChild(li); });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    // Versions
    verList.innerHTML = '';
    (manifest.versions || []).forEach(v => { const li = document.createElement('li'); li.textContent = v; verList.appendChild(li); });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(manifest.images) ? manifest.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(manifest.title || 'ISTV')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

    // Presets (audio + video together)
    presetsEl.innerHTML = '';
    const streams = Array.isArray(manifest.streams) ? manifest.streams : [];
    streams.forEach(s => presetsEl.appendChild(presetCard(s)));
    if (!streams.length) {
      presetsEl.innerHTML = `
        <div class="preset"><h4>No presets yet</h4>
        <p class="muted">Add AV presets to <code>manifest.json</code> under <code>streams</code>.</p></div>`;
    }

    // Autofill first preset
    if (streams[0]?.url && !urlEl.value) {
      urlEl.value = streams[0].url;
      channelEl.value = streams[0].name || '';
    }

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  // Tabs
  [tabAuto, tabAudio, tabVideo].forEach(b => {
    b.addEventListener('click', () => {
      [tabAuto, tabAudio, tabVideo].forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      forcedKind = b.dataset.kind;
      // Reload current url in the chosen mode
      if (urlEl.value.trim()) loadMedia();
    });
  });

  // Player logic
  btnLoad.addEventListener('click', loadMedia);
  volEl.addEventListener('input', () => {
    const v = Number(volEl.value || 1);
    audio.volume = v; video.volume = v;
  });

  // Audio events
  wireMedia(audio, /*isVideo*/false);
  // Video events
  wireMedia(video, /*isVideo*/true);

  // Mock swarm metrics
  let mockPeers = 0;
  setInterval(() => {
    const playing = (!audio.paused && audio.currentSrc) || (!video.paused && video.currentSrc);
    if (playing) {
      mockPeers = Math.max(1, mockPeers + (Math.random() * 6 - 3) | 0);
      peersEl.textContent = String(Math.max(1, Math.min(256, mockPeers)));
    } else {
      peersEl.textContent = '0';
    }
  }, 1500);

  async function loadMedia() {
    const url = urlEl.value.trim();
    if (!url) return;

    // Decide target element
    const guessed = guessKind(url); // 'audio' | 'video' | 'unknown'
    const kind = forcedKind === 'auto' ? (guessed === 'unknown' ? 'video' : guessed) : forcedKind;

    // Reset both
    softReset(audio); softReset(video);
    audio.style.display = 'none'; video.style.display = 'none';

    // Common flags
    const loop = !!loopEl.checked;
    const autoplay = !!autoplayEl.checked;
    const vol = Number(volEl.value || 1);

    if (kind === 'audio') {
      setStatus('Loading…'); typeEl.textContent = guessType(url) || 'audio';
      audio.loop = loop; audio.autoplay = autoplay; audio.volume = vol;
      addSource(audio, url);
      audio.style.display = '';
      if (autoplay) await playSilently(audio);
      setStatus(audio.paused ? 'Loaded' : 'Playing');
    } else {
      setStatus('Loading…'); typeEl.textContent = guessType(url) || 'video';
      video.loop = loop; video.autoplay = autoplay; video.volume = vol;
      addSource(video, url);
      video.style.display = '';
      if (autoplay) await playSilently(video);
      setStatus(video.paused ? 'Loaded' : 'Playing');
    }

    labelEl.textContent = channelEl.value.trim() || '—';
    // Bitrate hint (purely a string from preset name or URL params, if present)
    const br = extractBitrateHint(url);
    bitrateEl.textContent = br || '—';
  }

  /* ---------- helpers ---------- */
  function wireMedia(el, isVideo) {
    el.addEventListener('play',  () => setStatus('Playing'));
    el.addEventListener('pause', () => setStatus('Paused'));
    el.addEventListener('waiting', () => setStatus('Buffering…'));
    el.addEventListener('stalled', () => setStatus('Stalled'));
    el.addEventListener('error', () => setStatus('Error'));
    if (isVideo) {
      el.addEventListener('loadedmetadata', () => {
        const w = el.videoWidth, h = el.videoHeight;
        resEl.textContent = (w && h) ? `${w}×${h}` : '—';
      });
    }
  }

  function presetCard(s) {
    const d = document.createElement('div');
    d.className = 'preset';
    d.innerHTML = `
      <h4>${esc(s.name || 'Channel')}</h4>
      <p class="muted">${esc(s.note || s.type || '')}</p>
      <a class="btn">Load</a>
    `;
    d.querySelector('.btn').addEventListener('click', () => {
      urlEl.value = s.url || '';
      channelEl.value = s.name || '';
      loadMedia();
    });
    return d;
  }

  function addSource(mediaEl, url) {
    while (mediaEl.firstChild) mediaEl.removeChild(mediaEl.firstChild);
    const source = document.createElement('source');
    source.src = url;
    const lower = url.toLowerCase();
    if (lower.endsWith('.m3u8')) source.type = mediaEl.tagName === 'VIDEO'
      ? 'application/vnd.apple.mpegurl' : 'audio/mpegurl';
    else if (lower.endsWith('.mpd')) source.type = mediaEl.tagName === 'VIDEO'
      ? 'application/dash+xml' : 'application/dash+xml';
    else if (lower.endsWith('.mp4')) source.type = 'video/mp4';
    else if (lower.endsWith('.webm')) source.type = 'video/webm';
    else if (lower.endsWith('.ogv') || lower.endsWith('.ogg')) source.type = mediaEl.tagName === 'VIDEO' ? 'video/ogg' : 'audio/ogg';
    else if (lower.endsWith('.mp3')) source.type = 'audio/mpeg';
    else if (lower.endsWith('.aac')) source.type = 'audio/aac';
    else if (lower.endsWith('.flac')) source.type = 'audio/flac';
    else if (lower.endsWith('.wav')) source.type = 'audio/wav';
    mediaEl.appendChild(source);
    mediaEl.load();
  }

  function setStatus(s) { statusEl.textContent = s; }

  function softReset(m) {
    try { m.pause(); } catch {}
    while (m.firstChild) m.removeChild(m.firstChild);
    if (m === video) resEl.textContent = '—';
  }

  async function playSilently(m) {
    try { await m.play(); } catch { /* ignore autoplay block */ }
  }

  function guessKind(src) {
    const u = (src || '').toLowerCase();
    if (/\.(mp3|aac|flac|wav|oga|ogg)(\?|#|$)/.test(u)) return 'audio';
    if (/\.(mp4|webm|ogv|m3u8|mpd)(\?|#|$)/.test(u)) return 'video';
    return 'unknown';
  }

  function guessType(src) {
    const u = (src || '').toLowerCase();
    if (u.endsWith('.mp3')) return 'MP3 (audio)';
    if (u.endsWith('.aac')) return 'AAC (audio)';
    if (u.endsWith('.flac')) return 'FLAC (audio)';
    if (u.endsWith('.wav')) return 'WAV (audio)';
    if (u.endsWith('.ogg') || u.endsWith('.oga')) return 'Ogg (audio)';
    if (u.endsWith('.mp4')) return 'MP4 (video)';
    if (u.endsWith('.webm')) return 'WebM (video)';
    if (u.endsWith('.ogv')) return 'Ogg (video)';
    if (u.endsWith('.m3u8')) return 'HLS (manifest)';
    if (u.endsWith('.mpd')) return 'MPEG-DASH (manifest)';
    return 'Unknown';
  }

  function extractBitrateHint(url) {
    // try query like ?br=128k or name hints like _128k, 720p, 1080p
    const u = new URL(url, location.href);
    const q = u.searchParams.get('br') || u.searchParams.get('bitrate');
    if (q) return q;
    const low = u.pathname.toLowerCase();
    const p = (low.match(/(\d{2,4}p|\d{2,4}k)/) || [])[0];
    return p || '';
  }

  function esc(s)  { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function attr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function pushMeta(list, label, value) { if (!value) return; list.push(`<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`); }
  function pushMetaLink(list, label, href, ext=false) {
    if (!href) return;
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    list.push(`<li><strong>${esc(label)}:</strong> ${a}</li>`);
  }
})();
