// ISVN: manifest loader + minimal video player + mock swarm metrics
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
  const video     = $('video');
  const statusEl  = $('status');
  const typeEl    = $('type');
  const resEl     = $('res');
  const peersEl   = $('peers');
  const labelEl   = $('label');
  const presetsEl = $('presets');

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
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(manifest.title || 'ISVN')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

    // Presets
    presetsEl.innerHTML = '';
    const streams = Array.isArray(manifest.streams) ? manifest.streams : [];
    streams.forEach(s => presetsEl.appendChild(presetCard(s)));
    if (!streams.length) {
      presetsEl.innerHTML = `
        <div class="preset"><h4>No presets yet</h4>
        <p class="muted">Add video presets to <code>manifest.json</code> under <code>streams</code>.</p></div>`;
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

  // Player logic
  btnLoad.addEventListener('click', loadVideo);
  volEl.addEventListener('input', () => { video.volume = Number(volEl.value || 1); });
  video.addEventListener('play',  () => setStatus('Playing'));
  video.addEventListener('pause', () => setStatus('Paused'));
  video.addEventListener('waiting', () => setStatus('Buffering…'));
  video.addEventListener('stalled', () => setStatus('Stalled'));
  video.addEventListener('error', () => setStatus('Error'));
  video.addEventListener('loadedmetadata', () => {
    typeEl.textContent = guessType(video.currentSrc) || '—';
    const w = video.videoWidth, h = video.videoHeight;
    resEl.textContent = (w && h) ? `${w}×${h}` : '—';
  });

  // Mock swarm metrics (demo only)
  let mockPeers = 0;
  setInterval(() => {
    if (!video.paused && video.currentSrc) {
      mockPeers = Math.max(1, mockPeers + (Math.random() * 6 - 3) | 0);
      peersEl.textContent = String(Math.max(1, Math.min(256, mockPeers)));
    } else {
      peersEl.textContent = '0';
    }
  }, 1500);

  function setStatus(s) { statusEl.textContent = s; labelEl.textContent = channelEl.value.trim() || '—'; }

  async function loadVideo() {
    const url = urlEl.value.trim();
    if (!url) return;
    video.pause();
    video.loop = !!loopEl.checked;
    video.autoplay = !!autoplayEl.checked;
    video.volume = Number(volEl.value || 1);
    setStatus('Loading…');

    try {
      // Clean existing sources
      while (video.firstChild) video.removeChild(video.firstChild);

      if (url.toLowerCase().endsWith('.m3u8')) {
        // Native HLS (Safari & some mobile): set src directly
        const source = document.createElement('source');
        source.src = url;
        source.type = 'application/vnd.apple.mpegurl';
        video.appendChild(source);
      } else if (url.toLowerCase().endsWith('.mpd')) {
        // DASH (not natively supported by most browsers without libs; we still set for completeness)
        const source = document.createElement('source');
        source.src = url;
        source.type = 'application/dash+xml';
        video.appendChild(source);
      } else {
        // Progressive MP4/WebM/OGG
        const source = document.createElement('source');
        source.src = url;
        // naive type guess
        if (url.toLowerCase().endsWith('.mp4')) source.type = 'video/mp4';
        if (url.toLowerCase().endsWith('.webm')) source.type = 'video/webm';
        if (url.toLowerCase().endsWith('.ogv') || url.toLowerCase().endsWith('.ogg')) source.type = 'video/ogg';
        video.appendChild(source);
      }

      video.load();
      if (video.autoplay) {
        await video.play().catch(() => {/* ignore autoplay block */});
      }
      setStatus(video.paused ? 'Loaded' : 'Playing');
    } catch (e) {
      console.error(e);
      setStatus('Error');
    }
  }

  /* ---------- helpers ---------- */
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
      loadVideo();
    });
    return d;
  }

  function guessType(src) {
    const u = (src || '').toLowerCase();
    if (u.endsWith('.mp4')) return 'MP4 (progressive)';
    if (u.endsWith('.webm')) return 'WebM (progressive)';
    if (u.endsWith('.ogg') || u.endsWith('.ogv')) return 'Ogg (progressive)';
    if (u.endsWith('.m3u8')) return 'HLS (manifest)';
    if (u.endsWith('.mpd')) return 'MPEG-DASH (manifest)';
    return 'Unknown';
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
