// Project page loader — hydrates from ./manifest.json
(async function () {
  const $ = (id) => document.getElementById(id);

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

  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();

    if (m.title) titleEl.textContent = m.title;
    if (m.blurb) blurbEl.textContent = m.blurb;
    if (m.description) descEl.textContent = m.description || m.blurb || '';

    // Meta
    const meta = [];
    if (m.slug)   meta.push(`<li><strong>Slug:</strong> ${esc(m.slug)}</li>`);
    if (m.state)  meta.push(`<li><strong>State:</strong> ${esc(m.state)}</li>`);
    if (m.href)   meta.push(`<li><strong>URL:</strong> <a href="${attr(m.href)}">${esc(m.href)}</a></li>`);
    if (m.github) meta.push(`<li><strong>GitHub:</strong> <a href="${attr(m.github)}" target="_blank" rel="noopener noreferrer">${esc(m.github)}</a></li>`);
    if (m.huggingface) meta.push(`<li><strong>Hugging Face:</strong> <a href="${attr(m.huggingface)}" target="_blank" rel="noopener noreferrer">${esc(m.huggingface)}</a></li>`);
    if (m.docs)   meta.push(`<li><strong>Docs:</strong> <a href="${attr(m.docs)}" target="_blank" rel="noopener noreferrer">${esc(m.docs)}</a></li>`);
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
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(m.images) ? m.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(m.title || 'GPAI')} image" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function attr(s) { return String(s).replace(/"/g, '&quot;'); }
})();
