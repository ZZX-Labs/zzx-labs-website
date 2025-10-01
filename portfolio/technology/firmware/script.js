// Load local ./manifest.json and render: one Featured + stacked list
(function () {
  const isDomain = s => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s||'').trim());
  const byRand = () => Math.random() - 0.5;

  const q = sel => document.querySelector(sel);

  async function loadManifest() {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function card(item) {
    const href = item.href || `./${item.slug}/`;
    const titleRaw = item.title || item.slug || 'Untitled';
    const title = isDomain(titleRaw) ? titleRaw.toLowerCase() : titleRaw;

    const wrap = document.createElement('div');
    wrap.className = 'feature';
    wrap.innerHTML = `
      <h3>${title}</h3>
      ${item.blurb ? `<p>${item.blurb}</p>` : ''}
      <a class="btn" href="${href}">${item.linkText || `Open ${title}`}</a>
    `;
    const a = wrap.querySelector('a.btn');
    if (/^https?:\/\//i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return wrap;
  }

  function renderFeatured(items) {
    const mount = q('#featured');
    if (!mount) return;
    mount.innerHTML = '';
    if (!items.length) { mount.innerHTML = '<p class="muted">No featured item.</p>'; return; }
    const pick = items.slice().sort(byRand)[0];
    const block = card(pick);
    mount.appendChild(block);
  }

  function renderList(items) {
    const mount = q('#portfolio-list');
    if (!mount) return;
    mount.innerHTML = '';

    if (!items.length) {
      mount.innerHTML = '<p class="muted">No firmware entries yet.</p>';
      return;
    }
    items.forEach(p => mount.appendChild(card(p)));
  }

  async function boot() {
    const data = await loadManifest().catch(e => ({ __err: e }));
    const items = Array.isArray(data?.projects) ? data.projects : [];
    if (!items.length) {
      const f = q('#featured'); if (f) f.innerHTML = '<p class="muted">No featured item.</p>';
      const l = q('#portfolio-list'); if (l) l.innerHTML = '<p class="muted">No firmware entries yet.</p>';
      return;
    }
    renderFeatured(items);
    renderList(items);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
