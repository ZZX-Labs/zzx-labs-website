// Load local manifest.json and render stacked "feature" cards.
(async function () {
  async function fetchManifest(url) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.warn('Failed to load manifest:', url, e);
      return null;
    }
  }

  function render(listEl, projects) {
    if (!listEl) return;
    listEl.innerHTML = '';

    const items = Array.isArray(projects) ? projects : [];

    if (!items.length) {
      listEl.innerHTML = '<p class="muted">No projects listed yet.</p>';
      return;
    }

    for (const p of items) {
      const href = p.href || `/projects/hardware/${p.slug}/`;
      const el = document.createElement('div');
      el.className = 'feature';
      el.innerHTML = `
        <h3>${p.title || p.slug}</h3>
        <p>${p.blurb || ''}</p>
        <a class="btn" href="${href}">${p.linkText || `Open ${p.title || p.slug}`}</a>
      `;
      listEl.appendChild(el);
    }
  }

  const mount = document.getElementById('projects-list');
  const manifest = await fetchManifest('./manifest.json'); // same folder
  render(mount, manifest?.projects || []);
})();
