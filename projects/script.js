// Load project manifests from category subdirs and render stacked "feature" blocks.
(() => {
  const CATEGORIES = [
    { key: 'web',      mountId: 'proj-web' },
    { key: 'software', mountId: 'proj-software' },
    { key: 'hardware', mountId: 'proj-hardware' }
  ];

  const isDomain = (s) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s || '').trim());
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.warn('Failed to load manifest:', url, e);
      return { __error: true, message: e.message };
    }
  }

  function renderCategory(mount, data, catKey) {
    if (!mount) return;
    mount.innerHTML = '';

    if (!data || data.__error) {
      mount.appendChild(el('p', 'error', 'No projects available (manifest missing).'));
      return;
    }

    const list = Array.isArray(data.projects) ? data.projects : [];
    if (!list.length) {
      mount.appendChild(el('p', 'muted', 'No projects listed yet.'));
      return;
    }

    const features = el('section', 'features');
    list.forEach(p => {
      const href = p.href || `/projects/${catKey}/${p.slug}/`;
      const card = el('div', 'feature');

      const rawTitle = p.title || p.slug || 'Untitled';
      const titleText = isDomain(rawTitle) ? rawTitle.toLowerCase() : rawTitle;
      const h3 = el('h3', null, titleText);

      const blurb = (p.blurb ? el('p', null, p.blurb) : null);

      const linkWrap = el('div', 'links');
      const a = el('a', 'btn', p.linkText || `Open ${titleText}`);
      a.href = href;
      if (/^https?:\/\//i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }

      linkWrap.appendChild(a);
      card.appendChild(h3);
      if (blurb) card.appendChild(blurb);
      card.appendChild(linkWrap);
      features.appendChild(card);
    });

    mount.appendChild(features);
  }

  async function boot() {
    // temporary loading placeholders
    CATEGORIES.forEach(({ mountId }) => {
      const m = document.getElementById(mountId);
      if (m && !m.innerHTML.trim()) m.innerHTML = '<p class="loading">Loading projects…</p>';
    });

    // fetch in parallel
    const results = await Promise.all(
      CATEGORIES.map(c => fetchJSON(`/projects/${c.key}/manifest.json`).then(data => ({ c, data })))
    );

    results.forEach(({ c, data }) => {
      renderCategory(document.getElementById(c.mountId), data, c.key);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
