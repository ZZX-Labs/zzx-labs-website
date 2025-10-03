// Load local manifest.json and wire the page.
(function () {
  const $ = (sel, root=document) => root.querySelector(sel);

  async function loadManifest() {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function setHrefOrHide(el, href) {
    if (!el) return;
    if (href && String(href).trim()) {
      el.href = href;
    } else {
      el.style.display = 'none';
    }
  }

  function buildCompatRow(row) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.family}</td>
      <td>${row.strategy}</td>
      <td><span class="u-pill">${row.status}</span></td>
      <td>${row.notes || ''}</td>
    `;
    return tr;
  }

  function mountTags(tags) {
    const ul = $('#tag-list');
    if (!ul) return;
    ul.innerHTML = '';
    (tags || []).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function mountVersions(versions) {
    const wrap = $('#version-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    (versions || []).forEach(v => {
      const card = document.createElement('div');
      card.className = 'version';
      card.innerHTML = `
        <h4>${v.version} · <span class="muted">${v.state || 'unknown'}</span></h4>
        <p class="muted small">${v.date ? `Released: ${v.date}` : ''}</p>
        ${v.notes ? `<p>${v.notes}</p>` : ''}
      `;
      wrap.appendChild(card);
    });
  }

  function mountGallery(images) {
    const grid = $('#gallery');
    if (!grid) return;
    grid.innerHTML = '';
    (images || []).forEach(src => {
      const fig = document.createElement('figure');
      fig.className = 'image image-shadow rounded';
      fig.innerHTML = `<img src="${src}" alt="" loading="lazy" decoding="async" />`;
      grid.appendChild(fig);
    });
  }

  function copyFrom(selector) {
    const el = $(selector);
    if (!el) return;
    const text = el.textContent || el.value || '';
    navigator.clipboard?.writeText(text).catch(()=>{});
  }

  function wireCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyFrom(btn.getAttribute('data-copy')));
    });
  }

  // Boot
  (async function init() {
    try {
      const data = await loadManifest();
      const p = data?.project || {};

      // Title / blurb / description
      $('#project-title').textContent = p.title || 'PyOS';
      $('#project-blurb').textContent = p.blurb || '';
      $('#project-description').textContent = p.description || '';

      // Links
      setHrefOrHide($('#project-primary-link'), p.href || p.github || p.homepage || '#');
      setHrefOrHide($('#project-github'), p.github);
      setHrefOrHide($('#project-hf'), p.huggingface);

      // Status badge
      $('#project-status').textContent = p.state ? `State: ${p.state}` : '';

      // Logo
      const logo = $('#project-logo');
      if (logo) {
        const src = p.logo || (p.images && p.images[0]) || '/static/images/placeholder.jpg';
        logo.src = src;
      }

      // Compatibility
      const body = $('#compat-body');
      if (body) {
        body.innerHTML = '';
        (p.compatibility || []).forEach(row => body.appendChild(buildCompatRow(row)));
      }

      // Meta
      mountTags(p.tags);
      mountVersions(p.versions);

      // Gallery
      mountGallery(p.images);

      // Wire copy buttons
      wireCopyButtons();
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
