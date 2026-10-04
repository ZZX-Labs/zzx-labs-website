// blog/script.js
// 1) Load ./manifest.json (featured)
// 2) Load .posted + .tank manifests (if present)
// 3) Merge, de-dupe by URL, sort by date desc
// 4) Render Featured + Recent lists with search and tag filters

(() => {
  const FEAT = document.getElementById('featured-list');
  const RECENT = document.getElementById('recent-list');
  const SHUFFLE = document.getElementById('shuffle');
  const SEARCH = document.getElementById('search');
  const TAGSEL = document.getElementById('tag-filter');

  let featured = [];
  let recent = [];
  let allTags = new Set();

  const el = (t, c, txt) => {
    const n = document.createElement(t);
    if (c) n.className = c;
    if (txt != null) n.textContent = txt;
    return n;
  };

  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function normalizePost(p) {
    return {
      title: p.title || 'Untitled',
      url: p.url || '#',
      description: p.description || '',
      date: p.date ? new Date(p.date).toISOString() : new Date().toISOString(),
      thumb: p.thumb || '',
      tags: Array.isArray(p.tags) ? p.tags : []
    };
  }

  function dedupeByUrl(list) {
    const seen = new Set();
    const out = [];
    for (const it of list) {
      if (!seen.has(it.url)) {
        seen.add(it.url);
        out.push(it);
      }
    }
    return out;
  }

  function collectTags(items) {
    items.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
  }

  function fillTagSelect() {
    TAGSEL.innerHTML = '<option value="">All tags</option>';
    [...allTags].sort().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      TAGSEL.appendChild(opt);
    });
  }

  function matchFilters(p) {
    const q = (SEARCH.value || '').toLowerCase().trim();
    const tag = TAGSEL.value;
    const hay = `${p.title} ${p.description}`.toLowerCase();
    const okText = !q || hay.includes(q);
    const okTag = !tag || (p.tags || []).includes(tag);
    return okText && okTag;
  }

  function renderList(mount, items) {
    mount.innerHTML = '';
    if (!items.length) {
      mount.appendChild(el('p', 'loading', 'No posts.'));
      return;
    }
    for (const it of items) {
      if (!matchFilters(it)) continue;

      const wrap = el('div', 'feature');

      const thumb = el('div', 'thumb');
      if (it.thumb) {
        const img = new Image();
        img.alt = '';
        img.src = it.thumb;
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el('span', 'muted', '—'));
      }
      wrap.appendChild(thumb);

      const body = el('div', 'body');
      const h3 = el('h3');
      const link = el('a', null, it.title);
      link.href = it.url;
      h3.appendChild(link);
      body.appendChild(h3);

      if (it.description) body.appendChild(el('p', null, it.description));

      const btn = el('a', 'btn', 'Read Post');
      btn.href = it.url;
      body.appendChild(btn);

      const meta = el('div', 'meta', new Date(it.date).toLocaleString());
      body.appendChild(meta);

      if (it.tags && it.tags.length) {
        const tg = el('div', 'tags');
        it.tags.forEach(t => tg.appendChild(el('span', 'tag', t)));
        body.appendChild(tg);
      }

      wrap.appendChild(body);
      mount.appendChild(wrap);
    }
    if (!mount.children.length) {
      mount.appendChild(el('p', 'loading', 'No posts match your filters.'));
    }
  }

  async function boot() {
    // Featured (curated)
    const mf = await fetchJSON('./manifest.json');
    featured = Array.isArray(mf?.posts) ? mf.posts.map(normalizePost) : [];

    // Recent from posted + tank (if present)
    const posted = await fetchJSON('/blog/blog-posts/.posted/manifest.json');
    const tank   = await fetchJSON('/blog/blog-posts/.tank/manifest.json');
    const merged = [
      ...(Array.isArray(posted?.posts) ? posted.posts : []),
      ...(Array.isArray(tank?.posts) ? tank.posts : [])
    ].map(normalizePost);

    // Sort and dedupe
    recent = dedupeByUrl(merged).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Collect tags across both sets
    collectTags(featured);
    collectTags(recent);
    fillTagSelect();

    renderList(FEAT, featured);
    renderList(RECENT, recent);

    SHUFFLE?.addEventListener('click', () => {
      shuffleInPlace(recent);
      renderList(RECENT, recent);
    });
    SEARCH?.addEventListener('input', () => {
      renderList(FEAT, featured);
      renderList(RECENT, recent);
    });
    TAGSEL?.addEventListener('change', () => {
      renderList(FEAT, featured);
      renderList(RECENT, recent);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
