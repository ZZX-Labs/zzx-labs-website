// ISAN: manifest loader + minimal demo player + mock swarm metrics
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
  const stationEl = $('station');
  const autoplayEl= $('autoplay');
  const loopEl    = $('loop');
  const volEl     = $('vol');
  const btnLoad   = $('btn-load');
  const audio     = $('audio');
  const statusEl  = $('status');
  const codecEl   = $('codec');
  const bitrateEl = $('bitrate');
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
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(manifest.title || 'ISAN')}" loading="lazy" decoding="async" />`;
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
        <p class="muted">Add stream presets to <code>manifest.json</code> under <code>streams</code>.</p></div>`;
    }

    // Autofill first preset
    if (streams[0]?.url && !urlEl.value) {
      urlEl.value = streams[0].url;
      stationEl.value = streams[0].name || '';
    }

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  // Player logic
  btnLoad.addEventListener('click', loadStream);
  volEl.addEventListener('input', () => { audio.volume = Number(volEl.value || 1); });
  audio.addEventListener('play',  () => setStatus('Playing'));
  audio.addEventListener('pause', () => setStatus('Paused'));
  audio.addEventListener('waiting', () => setStatus('Buffering…'));
  audio.addEventListener('stalled', () => setStatus('Stalled'));
  audio.addEventListener('error', () => setStatus('Error'));
  audio.addEventListener('loadedmetadata', () => {
    codecEl.textContent = guessCodec(audio.currentSrc) || '—';
  });

  // Mock swarm metrics (demo only)
  let mockPeers = 0;
  setInterval(() => {
    // If playing, bounce peers in a small range
    if (!audio.paused && audio.currentSrc) {
      mockPeers = Math.max(1, mockPeers + (Math.random() * 4 - 2) | 0);
      peersEl.textContent = String(Math.max(1, Math.min(128, mockPeers)));
      // Fake bitrate values (for demo): 96–192 kbps
      const kbps = 96 + Math.round(Math.random() * 96);
      bitrateEl.textContent = `${kbps} kbps (approx)`;
    } else {
      peersEl.textContent = '0';
      bitrateEl.textContent = '—';
    }
  }, 1500);

  function setStatus(s) { statusEl.textContent = s; labelEl.textContent = stationEl.value.trim() || '—'; }

  async function loadStream() {
    const url = urlEl.value.trim();
    if (!url) return;
    audio.pause();
    audio.loop = !!loopEl.checked;
    audio.autoplay = !!autoplayEl.checked;
    audio.volume = Number(volEl.value || 1);
    setStatus('Loading…');

    try {
      // Simple direct load (no external libs)
      audio.src = url;
      // For some browsers, calling load() helps
      audio.load();
      if (audio.autoplay) {
        await audio.play().catch(() => {/* ignore autoplay block */});
      }
      setStatus(audio.paused ? 'Loaded' : 'Playing');
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
      <h4>${esc(s.name || 'Station')}</h4>
      <p class="muted">${esc(s.note || s.codec || '')}</p>
      <a class="btn">Load</a>
    `;
    d.querySelector('.btn').addEventListener('click', () => {
      urlEl.value = s.url || '';
      stationEl.value = s.name || '';
      loadStream();
    });
    return d;
  }

  function guessCodec(src) {
    const u = (src || '').toLowerCase();
    if (u.endsWith('.mp3')) return 'MP3';
    if (u.endsWith('.aac') || u.includes('aac')) return 'AAC';
    if (u.endsWith('.opus') || u.includes('opus')) return 'Opus';
    if (u.endsWith('.ogg') || u.includes('.oga')) return 'Ogg Vorbis';
    if (u.endsWith('.m3u8')) return 'HLS (manifest)';
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
