// MetaTagDB: manifest loader + local hashing/tagging demo
(async function () {
  const $ = (id) => document.getElementById(id);

  // Manifest DOM
  const logoEl  = $('project-logo');
  const titleEl = $('project-title');
  const blurbEl = $('project-blurb');
  const descEl  = $('project-description');
  const metaList= $('meta-list');
  const tagList = $('tag-list');
  const verList = $('version-list');
  const imgGrid = $('image-grid');
  const imgNote = $('image-note');
  const btnOpen = $('btn-open');
  const btnGH   = $('btn-github');

  // Demo DOM
  const drop    = $('drop');
  const fileInp = $('fileInput');
  const results = $('results');
  const globalTagsEl = $('globalTags');
  const btnClear = $('btn-clear');
  const btnExport= $('btn-export');

  const esc  = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const attr = (s) => String(s ?? '').replace(/"/g, '&quot;');
  const hex  = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');

  let rows = []; // in-memory table of {name,size,type,lastModified,sha256,tags[]}

  /* ---------------- Manifest ---------------- */
  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();

    if (m.title) titleEl.textContent = m.title;
    if (m.blurb) blurbEl.textContent = m.blurb;
    if (m.description) descEl.textContent = m.description;

    const meta = [];
    pushMeta(meta, 'Slug', m.slug);
    pushMeta(meta, 'State', m.state);
    pushMetaLink(meta, 'URL', m.href);
    pushMetaLink(meta, 'GitHub', m.github, true);
    pushMetaLink(meta, 'Docs', m.docs, true);
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    if (m.href) { btnOpen.href = m.href; if (/^https?:/i.test(m.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; } }
    else { btnOpen.style.display = 'none'; }

    if (m.github) { btnGH.style.display=''; btnGH.href = m.github; btnGH.target='_blank'; btnGH.rel='noopener noreferrer'; }

    if (m.logo) { logoEl.src = m.logo; logoEl.style.display = 'block'; }

    tagList.innerHTML = '';
    (m.tags || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; tagList.appendChild(li); });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    verList.innerHTML = '';
    (m.versions || []).forEach(v => { const li = document.createElement('li'); li.textContent = v; verList.appendChild(li); });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    imgGrid.innerHTML = '';
    const imgs = Array.isArray(m.images) ? m.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(m.title || 'MetaTagDB')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';
  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  function pushMeta(list, label, value) { if (value == null || value === '') return; list.push(`<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`); }
  function pushMetaLink(list, label, href, ext=false) {
    if (!href) return;
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    list.push(`<li><strong>${esc(label)}:</strong> ${a}</li>`);
  }

  /* ---------------- Demo: hashing & tagging ---------------- */
  drop.addEventListener('click', () => fileInp.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('hover');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) handleFiles(files);
  });
  fileInp.addEventListener('change', () => {
    const files = [...(fileInp.files || [])];
    if (files.length) handleFiles(files);
    fileInp.value = '';
  });

  btnClear.addEventListener('click', () => {
    rows = []; renderRows();
  });

  btnExport.addEventListener('click', () => {
    const payload = {
      tool: 'MetaTagDB',
      generatedAt: new Date().toISOString(),
      records: rows.map(r => ({
        name: r.name,
        size: r.size,
        type: r.type,
        lastModified: r.lastModified,
        sha256: r.sha256,
        tags: r.tags
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metatags-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  async function handleFiles(files) {
    const gtags = parseTags(globalTagsEl.value);
    for (const f of files) {
      try {
        const ab = await f.arrayBuffer();
        const dig = await crypto.subtle.digest('SHA-256', ab);
        const sha256 = hex(dig);

        rows.push({
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream',
          lastModified: f.lastModified || null,
          sha256,
          tags: [...gtags]
        });
      } catch (e) {
        console.error('Hash error:', e);
      }
    }
    renderRows();
  }

  function parseTags(s) {
    return String(s || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  function renderRows() {
    // wipe old rows except header
    [...results.querySelectorAll('.row.item')].forEach(n => n.remove());

    if (!rows.length) return;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const row = document.createElement('div');
      row.className = 'row item';
      row.innerHTML = `
        <div title="${attr(r.name)}">${esc(r.name)}</div>
        <div class="mono" title="${attr(r.sha256)}">${esc(r.sha256)}</div>
        <div>${Intl.NumberFormat().format(r.size)} B</div>
        <div>${esc(r.type)}</div>
        <div>
          <input class="tag-edit" type="text" value="${attr(r.tags.join(', '))}" placeholder="comma-separated" />
        </div>
      `;
      const inp = row.querySelector('.tag-edit');
      inp.addEventListener('change', () => {
        rows[i].tags = parseTags(inp.value);
      });
      results.appendChild(row);
    }
  }
})();
