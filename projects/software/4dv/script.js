// 4DV page boot — loads ./manifest.json and renders everything
(async function () {
  const sel = (id) => document.getElementById(id);

  const titleEl   = sel('project-title');
  const blurbEl   = sel('project-blurb');
  const descEl    = sel('project-description');
  const metaList  = sel('meta-list');
  const tagList   = sel('tag-list');
  const verList   = sel('version-list');
  const imgGrid   = sel('image-grid');
  const imgNote   = sel('image-note');
  const logoEl    = sel('project-logo');

  const btnOpen   = sel('btn-open');
  const btnGitHub = sel('btn-github');
  const btnHF     = sel('btn-hf');

  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();

    // Basic text
    if (m.title) titleEl.textContent = m.title;
    if (m.blurb) blurbEl.textContent = m.blurb;
    if (m.description) descEl.textContent = m.description;

    // State / meta
    const meta = [];
    if (m.slug) meta.push(`<li><strong>Slug:</strong> ${escapeHTML(m.slug)}</li>`);
    if (m.state) meta.push(`<li><strong>State:</strong> ${escapeHTML(m.state)}</li>`);
    if (m.href)  meta.push(`<li><strong>URL:</strong> <a href="${escapeAttr(m.href)}">${escapeHTML(m.href)}</a></li>`);
    if (m.github) meta.push(`<li><strong>GitHub:</strong> <a href="${escapeAttr(m.github)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m.github)}</a></li>`);
    if (m.huggingface) meta.push(`<li><strong>Hugging Face:</strong> <a href="${escapeAttr(m.huggingface)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m.huggingface)}</a></li>`);
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    // Buttons
    if (m.href) {
      btnOpen.href = m.href;
      if (/^https?:/i.test(m.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; }
    } else {
      btnOpen.style.display = 'none';
    }
    if (m.github) {
      btnGitHub.style.display = '';
      btnGitHub.href = m.github;
      btnGitHub.target = '_blank';
      btnGitHub.rel = 'noopener noreferrer';
    }
    if (m.huggingface) {
      btnHF.style.display = '';
      btnHF.href = m.huggingface;
      btnHF.target = '_blank';
      btnHF.rel = 'noopener noreferrer';
    }

    // Logo
    if (m.logo) {
      logoEl.src = m.logo;
      logoEl.style.display = 'block';
    }

    // Tags
    tagList.innerHTML = '';
    (m.tags || []).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      tagList.appendChild(li);
    });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    // Versions
    verList.innerHTML = '';
    (m.versions || []).forEach(v => {
      const li = document.createElement('li');
      li.textContent = v;
      verList.appendChild(li);
    });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No versions yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(m.images) ? m.images : [];
    imgs.forEach(src => {
      const wrap = document.createElement('figure');
      wrap.className = 'image image-zoom';
      wrap.innerHTML = `<img src="${escapeAttr(src)}" alt="4DV image" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(wrap);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load 4DV manifest: ${e.message}`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }
})();
