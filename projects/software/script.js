// /projects/software/script.js
(function () {
  const LIST_ID = 'projects-list';
  const listEl = document.getElementById(LIST_ID);

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  async function loadManifest() {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderProjects(items) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      listEl.appendChild(el('p', { class: 'loading' }, 'No projects found.'));
      return;
    }

    items.forEach(p => {
      const card = el('div', { class: 'feature' }, [
        el('h3', {}, p.title || p.slug || 'Untitled'),
        el('p', {}, p.blurb || ''),
        el('ul', { class: 'links' }, [
          el('li', {}, el('a', { href: p.href || '#'}, 'Open Project'))
        ])
      ]);
      listEl.appendChild(card);
    });
  }

  (async () => {
    try {
      const manifest = await loadManifest();
      renderProjects(manifest.projects || []);
    } catch (err) {
      if (listEl) listEl.innerHTML = `<p class="loading">Failed to load projects: ${err.message}</p>`;
      console.error(err);
    }
  })();
})();
