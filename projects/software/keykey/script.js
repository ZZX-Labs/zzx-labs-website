// keykey: manifest loader + local SHA-256 verifier + optional JSON preview
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
  const presetsEl = $('presets');

  // Verifier DOM
  const fileEl    = $('file');
  const passEl    = $('pass');
  const btnHash   = $('btn-hash');

  const sha256El  = $('sha256');
  const sizeEl    = $('filesize');
  const mimeEl    = $('mimetype');
  const nameEl    = $('filename');
  const payloadPre= $('payload-pre');

  // Utils
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const attr= (s) => String(s ?? '').replace(/"/g, '&quot;');
  const hex  = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');

  // Manifest
  let manifest = {};
  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();

    if (manifest.title) titleEl.textContent = manifest.title;
    if (manifest.blurb) blurbEl.textContent = manifest.blurb;
    if (manifest.description) descEl.textContent = manifest.description;

    const meta = [];
    pushMeta(meta, 'Slug', manifest.slug);
    pushMeta(meta, 'State', manifest.state);
    pushMetaLink(meta, 'URL', manifest.href);
    pushMetaLink(meta, 'GitHub', manifest.github, true);
    pushMetaLink(meta, 'Docs', manifest.docs, true);
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    if (manifest.href) { btnOpen.href = manifest.href; if (/^https?:/i.test(manifest.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; } }
    else { btnOpen.style.display = 'none'; }

    if (manifest.github) {
      btnGitHub.style.display = '';
      btnGitHub.href = manifest.github; btnGitHub.target = '_blank'; btnGitHub.rel = 'noopener noreferrer';
    }

    if (manifest.logo) { logoEl.src = manifest.logo; logoEl.style.display = 'block'; }

    tagList.innerHTML = '';
    (manifest.tags || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; tagList.appendChild(li); });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    verList.innerHTML = '';
    (manifest.versions || []).forEach(v => { const li = document.createElement('li'); li.textContent = v; verList.appendChild(li); });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(manifest.images) ? manifest.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(manifest.title || 'keykey')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

    // Presets (example allowlist entries to test against)
    presetsEl.innerHTML = '';
    const presets = Array.isArray(manifest.example_allowlist) ? manifest.example_allowlist : [];
    presets.forEach(p => presetsEl.appendChild(presetCard(p)));
    if (!presets.length) {
      presetsEl.innerHTML = `
        <div class="preset"><h4>No example allowlist yet</h4>
        <p class="muted">Add fingerprints to <code>manifest.json</code> under <code>example_allowlist</code> to test compare.</p></div>`;
    }

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  // Copy buttons
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-copy]');
    if (!el) return;
    const tgt = document.querySelector(el.getAttribute('data-copy'));
    if (!tgt) return;
    try {
      navigator.clipboard.writeText(tgt.textContent.trim());
      el.textContent = 'Copied';
      setTimeout(() => (el.textContent = 'Copy'), 1200);
    } catch {}
  });

  // Hash handler
  btnHash.addEventListener('click', async () => {
    const f = fileEl.files?.[0];
    if (!f) return;

    nameEl.textContent = f.name || '—';
    sizeEl.textContent = `${f.size.toLocaleString()} bytes`;
    mimeEl.textContent = f.type || 'application/octet-stream';

    // Read and hash
    const buf = await f.arrayBuffer();
    const dig = await crypto.subtle.digest('SHA-256', buf);
    const digestHex = hex(dig).toLowerCase();
    sha256El.textContent = digestHex;

    // If JSON, try to display (no decryption here; passphrase reserved for future use)
    try {
      const text = new TextDecoder().decode(new Uint8Array(buf));
      const data = JSON.parse(text);
      payloadPre.textContent = JSON.stringify(data, null, 2);
    } catch {
      payloadPre.textContent = 'Binary or non-JSON payload.';
    }

    // If presets exist, show a quick compare note
    const match = (manifest.example_allowlist || []).find(x => (x.sha256 || '').toLowerCase() === digestHex);
    if (match) {
      payloadPre.textContent += `\n\n✔ Matches example allowlist entry: ${match.name || '(unnamed)'}\n`;
    } else if ((manifest.example_allowlist || []).length) {
      payloadPre.textContent += `\n\n✖ No match in example allowlist.\n`;
    }
  });

  /* ---------- helpers ---------- */
  function pushMeta(list, label, value) { if (!value) return; list.push(`<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`); }
  function pushMetaLink(list, label, href, ext=false) {
    if (!href) return;
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    list.push(`<li><strong>${esc(label)}:</strong> ${a}</li>`);
  }

  function presetCard(p) {
    const d = document.createElement('div');
    d.className = 'preset';
    d.innerHTML = `
      <h4>${esc(p.name || 'Allowlisted Key')}</h4>
      <p class="muted">${esc(p.note || '')}</p>
      <div class="pair"><span class="k">SHA-256</span><span class="v code">${esc(p.sha256 || '—')}</span></div>
      ${p.filename ? `<div class="pair"><span class="k">Filename</span><span class="v">${esc(p.filename)}</span></div>` : ''}
    `;
    return d;
  }
})();
