// Load local /projects/hardware/manifest.json and render feature cards
(async function () {
  const isDomain = (s) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s || '').trim());
  const mount = document.getElementById('projects-list');
  if (!mount) return;

  function card(p) {
    const href = p.href || `/projects/hardware/${p.slug}/`;
    const titleRaw = p.title || p.slug || 'Untitled';
    const title = isDomain(titleRaw) ? titleRaw.toLowerCase() : titleRaw;

    const wrap = document.createElement('div');
    wrap.className = 'feature';
    wrap.innerHTML = `
      <h3>${title}</h3>
      ${p.blurb ? `<p>${p.blurb}</p>` : ''}
      <a class="btn" href="${href}">${p.linkText || `Open ${title}`}</a>
    `;
    const a = wrap.querySelector('a.btn');
    if (/^https?:\/\//i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return wrap;
  }

  try {
    const res = await fetch('/projects/hardware/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json?.projects) ? json.projects : [];
    mount.innerHTML = items.length ? '' : '<p class="loading">No projects listed yet.</p>';
    for (const p of items) mount.appendChild(card(p));
  } catch (e) {
    console.error(e);
    mount.innerHTML = `<p class="loading">Failed to load project list: ${e.message}</p>`;
  }
})();
