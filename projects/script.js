// Load project manifests from category subdirs and render stacked "feature" blocks

(async function () {
  const categories = [
    { key: 'web',      mount: 'proj-web' },
    { key: 'software', mount: 'proj-software' },
    { key: 'hardware', mount: 'proj-hardware' }
  ];

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

  function renderFeatures(mountEl, list = [], catKey) {
    if (!mountEl) return;
    mountEl.innerHTML = '';

    if (!list.length) {
      mountEl.innerHTML = '<p class="muted">No projects listed yet.</p>';
      return;
    }

    for (const p of list) {
      const href = p.href || `/projects/${catKey}/${p.slug}/`;
      const block = document.createElement('div');
      block.className = 'feature';
      block.innerHTML = `
        <h3>${p.title || p.slug}</h3>
        <p>${p.blurb || ''}</p>
        <a href="${href}">${p.linkText || `Open ${p.title || p.slug}`}</a>
      `;
      mountEl.appendChild(block);
    }
  }

  for (const c of categories) {
    const mount = document.getElementById(c.mount);
    const manifest = await fetchManifest(`/projects/${c.key}/manifest.json`);
    const projects = manifest?.projects || [];
    renderFeatures(mount, projects, c.key);
  }
})();
