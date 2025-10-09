// bitavg page boot — loads ./manifest.json and renders everything
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
  const btnHF     = $('btn-hf');

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
    if (m.slug)  meta.push(li(`Slug`, m.slug));
    if (m.state) meta.push(li(`State`, m.state));
    if (m.href)  meta.push(liLink(`URL`, m.href, m.href));
    if (m.github) meta.push(liLink(`GitHub`, m.github, m.github));
    if (m.huggingface) meta.push(liLink(`Hugging Face`, m.huggingface, m.huggingface));
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    // Buttons
    if (m.href) {
      btnOpen.href = m.href;
      btnOpen.textContent = m.linkText || `Open ${m.title || 'bitavg'}`;
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

    // Logo (fallback to ./logo.png if manifest omits it)
    const logoSrc = m.logo || './logo.png';
    if (logoEl) {
      logoEl.src = logoSrc;
      logoEl.alt = `${m.title || 'bitavg'} logo`;
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
      const fig = document.createElement('figure');
      fig.className = 'image image-zoom';
      fig.innerHTML = `<img src="${escapeAttr(src)}" alt="${escapeHTML(m.title || 'bitavg')} image" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(fig);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load bitavg manifest: ${e.message}`;
  }

  /* ---------- helpers ---------- */
  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }
  function li(label, value) {
    return `<li><strong>${escapeHTML(label)}:</strong> ${escapeHTML(value)}</li>`;
  }
  function liLink(label, href, text) {
    const safeHref = escapeAttr(href);
    const safeText = escapeHTML(text);
    return `<li><strong>${escapeHTML(label)}:</strong> <a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeText}</a></li>`;
    }
})();
