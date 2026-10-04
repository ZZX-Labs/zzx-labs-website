// Load local /portfolio/technology/manifest.json and render portfolio cards
(async function () {
  const mount = document.getElementById('tech-portfolios');
  if (!mount) return;

  function card(item) {
    const href = item.href || `./${item.slug}/`;
    const wrap = document.createElement('div');
    wrap.className = 'feature';
    wrap.innerHTML = `
      <h3>${item.title || item.slug}</h3>
      ${item.blurb ? `<p>${item.blurb}</p>` : ''}
      <a class="btn" href="${href}">${item.linkText || `Open ${item.title || item.slug}`}</a>
    `;
    return wrap;
  }

  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json?.projects) ? json.projects : [];

    mount.innerHTML = items.length ? '' : '<p class="loading">No technology portfolios yet.</p>';
    for (const it of items) mount.appendChild(card(it));
  } catch (e) {
    console.error(e);
    mount.innerHTML = `<p class="loading">Failed to load: ${e.message}</p>`;
  }
})();
