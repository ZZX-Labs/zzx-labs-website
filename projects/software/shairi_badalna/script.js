// Shairi Badalna: video sorter & tagger (client-side demo UI).
// - Loads manifest.json for project metadata
// - Ingests files via input/drag-drop (no uploads)
// - Extracts basic media info using HTMLVideoElement where possible
// - Computes quick SHA-256 hash (chunked) for dedup/fingerprints
// - Applies rules to simulate target paths
// - Exports CSV plan
// NOTE: Actual file moves require a desktop/CLI companion; this page prepares a safe plan.

(function () {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- Manifest ---------------- */
  async function loadManifest() {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  function setHrefOrHide(el, href) {
    if (!el) return;
    if (href && String(href).trim()) { el.href = href; }
    else { el.style.display = 'none'; }
  }
  function mountTags(tags) {
    const ul = $('#tag-list'); if (!ul) return; ul.innerHTML = '';
    (tags || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  }
  function mountVersions(versions) {
    const wrap = $('#version-list'); if (!wrap) return; wrap.innerHTML = '';
    (versions || []).forEach(v => {
      const card = document.createElement('div');
      card.className = 'version';
      card.innerHTML = `<h4>${v.version} · <span class="muted">${v.state || 'unknown'}</span></h4>
        <p class="muted small">${v.date ? `Released: ${v.date}` : ''}</p>
        ${v.notes ? `<p>${v.notes}</p>` : ''}`;
      wrap.appendChild(card);
    });
  }

  /* ---------------- State ---------------- */
  /** @type {{file:File, url:string, meta:object, tags:string[], collection:string, title:string, year:number|null, hash:string, target:string}[]} */
  let rows = [];
  let selectedIndex = -1;

  /* ---------------- Helpers ---------------- */
  function fmtDuration(sec) {
    if (!sec || !isFinite(sec)) return '';
    const s = Math.round(sec);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60;
    return (h? String(h).padStart(2,'0')+':':'') + String(m).padStart(2,'0') + ':' + String(r).padStart(2,'0');
  }
  async function sha256File(file, chunkSize=1<<20) { // 1 MiB chunks
    const crypto = window.crypto || {};
    if (!crypto.subtle) return '';
    const hasher = await crypto.subtle.digest.bind(crypto.subtle);
    const chunks = [];
    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      const buf = await file.slice(offset, end).arrayBuffer();
      chunks.push(new Uint8Array(buf));
      offset = end;
    }
    // concat
    let totalLen = chunks.reduce((a,c)=>a+c.length,0);
    const all = new Uint8Array(totalLen);
    let pos = 0; for (const c of chunks) { all.set(c, pos); pos += c.length; }
    const digest = await hasher('SHA-256', all);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function extractResolution(video) {
    const w = video.videoWidth|0, h = video.videoHeight|0;
    if (!w || !h) return '';
    return `${w}x${h}`;
  }
  function approxFPS(video) {
    // Browser doesn't expose FPS; we leave blank or guess from metadata APIs (omitted).
    return '';
  }

  function updateCount() {
    $('#count-pill').textContent = `${rows.length} files`;
  }

  function sanitizeSegment(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function computeTargetPath(row) {
    const root = ($('#rule-root').value || '').trim();
    const pat  = ($('#rule-pattern').value || '').trim();
    if (!root || !pat) return '';
    const {
      title='', collection='', tags=[], year='', meta={}, hash='', file
    } = row;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const basename = file.name.replace(/\.[^.]+$/, '');
    const res = meta.resolution || '';
    const codec = meta.codec || '';
    const fps = meta.fps || '';
    const duration = meta.duration || '';
    const date = row.date || '';

    const tokens = {
      title, collection, tags: Array.isArray(tags) ? tags.join(',') : String(tags||''),
      year, date, duration, codec, resolution: res, fps, basename, ext, hash
    };

    let out = pat.replace(/\{([a-z]+)\}/gi, (_, k) => sanitizeSegment(tokens[k] ?? ''));
    if (!out) return '';
    const full = [root, out].filter(Boolean).join('/');
    return full.replace(/\/+/g, '/');
  }

  function renderTable() {
    const tbody = $('#file-tbody'); tbody.innerHTML = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="8" class="muted">No files yet.</td>`;
      tbody.appendChild(tr); return;
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.dataset.index = i;
      if (i === selectedIndex) tr.style.background = 'rgba(255,255,255,.05)';
      tr.innerHTML = `
        <td title="${r.file.name}">${r.file.name}</td>
        <td>${r.meta.resolution || ''}</td>
        <td>${r.meta.fps || ''}</td>
        <td>${r.meta.duration || ''}</td>
        <td>${r.meta.codec || ''}</td>
        <td>${(r.tags||[]).join(', ')}</td>
        <td>${r.collection || ''}</td>
        <td title="${r.target || ''}">${r.target || ''}</td>
      `;
      tr.addEventListener('click', () => selectRow(i));
      tbody.appendChild(tr);
    });
  }

  function selectRow(i) {
    selectedIndex = i;
    renderTable();
    const r = rows[i]; if (!r) return;
    // populate editor
    $('#ed-title').value = r.title || '';
    $('#ed-collection').value = r.collection || '';
    $('#ed-tags').value = (r.tags || []).join(', ');
    $('#ed-year').value = r.year || '';
    $('#ed-date').value = r.date || '';
    $('#ed-hash').value = r.hash || '';
    // preview
    const v = $('#preview');
    v.src = r.url;
    $('#preview-meta').textContent = `${r.meta.resolution || ''} ${r.meta.codec || ''} ${r.meta.duration||''}`;
  }

  function applyEditor() {
    if (selectedIndex < 0) return;
    const r = rows[selectedIndex]; if (!r) return;
    r.title = $('#ed-title').value.trim();
    r.collection = $('#ed-collection').value.trim();
    r.tags = ($('#ed-tags').value || '').split(',').map(s=>s.trim()).filter(Boolean);
    r.year = Number($('#ed-year').value || '') || '';
    r.date = $('#ed-date').value || '';
    // recompute target for that row
    r.target = computeTargetPath(r);
    renderTable();
  }

  async function rehashSelected() {
    if (selectedIndex < 0) return;
    const r = rows[selectedIndex]; if (!r) return;
    r.hash = await sha256File(r.file);
    $('#ed-hash').value = r.hash;
    r.target = computeTargetPath(r);
    renderTable();
  }

  function simulateAll() {
    rows.forEach(r => r.target = computeTargetPath(r));
    renderTable();
  }

  function toCSV() {
    const header = ['file','hash','resolution','fps','duration','codec','title','collection','tags','year','date','target'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      const vals = [
        r.file.name,
        r.hash || '',
        r.meta.resolution || '',
        r.meta.fps || '',
        r.meta.duration || '',
        r.meta.codec || '',
        r.title || '',
        r.collection || '',
        (r.tags||[]).join('|'),
        r.year || '',
        r.date || '',
        r.target || ''
      ].map(v => `"${String(v||'').replace(/"/g, '""')}"`);
      lines.push(vals.join(','));
    });
    return lines.join('\n');
  }

  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type:'text/plain'}));
    a.download = name;
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
  }

  /* ---------------- Ingest ---------------- */
  function addFiles(fileList) {
    const vids = Array.from(fileList || []).filter(f => /^video\//i.test(f.type) || /\.(mp4|mkv|webm|mov|avi|mts|m2ts)$/i.test(f.name));
    vids.forEach(file => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      const row = { file, url, meta: {}, tags: [], collection: '', title: '', year: '', hash: '', target: '' };
      rows.push(row);

      // On loadedmetadata, capture tech info
      video.addEventListener('loadedmetadata', async () => {
        row.meta.resolution = extractResolution(video);
        row.meta.duration = fmtDuration(video.duration);
        row.meta.fps = approxFPS(video);
        // codec container isn't exposed; leave blank or infer by extension
        row.meta.codec = (file.name.split('.').pop() || '').toUpperCase();
        // initial title defaults to basename
        row.title = file.name.replace(/\.[^.]+$/, '');
        // compute hash (async)
        row.hash = await sha256File(file).catch(()=> '');
        row.target = computeTargetPath(row);
        updateCount();
        renderTable();
      }, { once: true });
    });
    updateCount();
    renderTable();
  }

  function wireIngest() {
    $('#pick-files')?.addEventListener('change', (e) => addFiles(e.target.files));
    $('#pick-folder')?.addEventListener('change', (e) => addFiles(e.target.files));

    const dz = $('#dropzone');
    if (!dz) return;
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, (e)=>{ e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, (e)=>{ e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => {
      const items = e.dataTransfer?.items;
      if (items && items.length && items[0].webkitGetAsEntry) {
        // best effort: flatten directory
        const files = [];
        const walk = (entry, path='') => new Promise((resolve) => {
          if (entry.isFile) entry.file(f => { f.fullPath = path + f.name; files.push(f); resolve(); });
          else if (entry.isDirectory) {
            const reader = entry.createReader();
            reader.readEntries(async (entries) => {
              for (const en of entries) await walk(en, path + entry.name + '/');
              resolve();
            });
          } else resolve();
        });
        Promise.all(Array.from(items).map(it => walk(it.webkitGetAsEntry()))).then(()=> addFiles(files));
      } else {
        addFiles(e.dataTransfer?.files);
      }
    });
  }

  /* ---------------- Wire UI ---------------- */
  function wireUI() {
    $('#btn-apply')?.addEventListener('click', applyEditor);
    $('#btn-rehash')?.addEventListener('click', rehashSelected);
    $('#btn-simulate')?.addEventListener('click', simulateAll);
    $('#btn-export')?.addEventListener('click', () => download('shairi-plan.csv', toCSV()));
    $('#btn-clear')?.addEventListener('click', () => { rows.forEach(r=> URL.revokeObjectURL(r.url)); rows = []; selectedIndex = -1; renderTable(); updateCount(); });
    $('#rule-root')?.addEventListener('input', simulateAll);
    $('#rule-pattern')?.addEventListener('input', simulateAll);
  }

  /* ---------------- Boot ---------------- */
  (async function init() {
    wireIngest();
    wireUI();

    try {
      const data = await loadManifest();
      const p = data?.project || {};

      $('#project-title').textContent = p.title || 'Shairi Badalna';
      $('#project-blurb').textContent = p.blurb || '';
      $('#project-description').textContent = p.description || '';
      setHrefOrHide($('#project-primary-link'), p.href || p.github || p.homepage || '#');
      setHrefOrHide($('#project-github'), p.github);
      setHrefOrHide($('#project-hf'), p.huggingface);
      $('#project-status').textContent = p.state ? `State: ${p.state}` : '';

      const logo = $('#project-logo');
      if (logo) {
        const src = p.logo || (p.images && p.images[0]) || '/static/images/placeholder.jpg';
        logo.src = src;
      }

      mountTags(p.tags);
      mountVersions(p.versions);

      // Defaults for rules
      if (p.defaults?.root) $('#rule-root').value = p.defaults.root;
      if (p.defaults?.pattern) $('#rule-pattern').value = p.defaults.pattern;
    } catch (e) {
      console.error(e);
      const hero = document.querySelector('.hero');
      if (hero) {
        const div = document.createElement('div');
        div.className = 'notice';
        div.textContent = `Failed to load manifest.json: ${e.message}`;
        hero.appendChild(div);
      }
    }
  })();
})();
