// blog/blog-posts/script.js
(() => {
  const ROOT = '/blog/blog-posts';
  const ARCH = document.getElementById('archives');
  const SHUFFLE = document.getElementById('shuffle');
  const SEARCH = document.getElementById('search');
  const TAGSEL = document.getElementById('tag-filter');

  let ALL = [];
  let TAGS = new Set();

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

  function normalize(p) {
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

  function groupByMonth(items) {
    const map = new Map(); // "YYYY-MM" -> items[]
    for (const it of items) {
      const d = new Date(it.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()].sort((a,b) => b[0].localeCompare(a[0]));
  }

  function monthLabel(key) {
    const [y, m] = key.split('-');
    const dt = new Date(Date.UTC(Number(y), Number(m)-1, 1));
    return dt.toLocaleString(undefined, { month:'long', year:'numeric' });
  }

  function collectTags(items) {
    items.forEach(p => (p.tags || []).forEach(t => TAGS.add(t)));
  }

  function fillTagSelect() {
    TAGSEL.innerHTML = '<option value="">All tags</option>';
    [...TAGS].sort().forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      TAGSEL.appendChild(o);
    });
  }

  function matchesFilters(p) {
    const q = (SEARCH.value || '').toLowerCase().trim();
    const tag = TAGSEL.value;
    const hay = `${p.title} ${p.description}`.toLowerCase();
    const okText = !q || hay.includes(q);
    const okTag = !tag || (p.tags || []).includes(tag);
    return okText && okTag;
  }

  function render(items) {
    ARCH.innerHTML = '';
    const filtered = items.filter(matchesFilters);
    if (!filtered.length) {
      ARCH.appendChild(el('p', 'loading', 'No posts match your filters.'));
      return;
    }

    const grouped = groupByMonth(filtered);
    for (const [key, posts] of grouped) {
      const group = el('div', 'month-group');
      group.appendChild(el('h3', null, monthLabel(key)));

      posts.forEach(it => {
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

        const h4 = el('h4');
        const a = el('a', null, it.title);
        a.href = it.url;
        h4.appendChild(a);
        body.appendChild(h4);

        if (it.description) body.appendChild(el('p', null, it.description));

        const btn = el('a', 'btn', 'Read Post');
        btn.href = it.url;
        body.appendChild(btn);

        body.appendChild(el('div', 'meta', new Date(it.date).toLocaleString()));

        if (it.tags && it.tags.length) {
          const tg = el('div', 'tags');
          it.tags.forEach(t => tg.appendChild(el('span', 'tag', t)));
          body.appendChild(tg);
        }

        wrap.appendChild(body);
        group.appendChild(wrap);
      });

      ARCH.appendChild(group);
    }
  }

  async function loadViaMonthIndexes() {
    // Try months index for posted & tank
    const [postedIdx, tankIdx] = await Promise.all([
      fetchJSON(`${ROOT}/.posted/months.json`),
      fetchJSON(`${ROOT}/.tank/months.json`)
    ]);

    const paths = [
      ...(postedIdx?.months || []).map(m => m.path),
      ...(tankIdx?.months || []).map(m => m.path)
    ];

    if (!paths.length) return null;

    // Fetch all month manifests in parallel
    const monthLists = await Promise.all(paths.map(p => fetchJSON(p)));
    const posts = monthLists
      .filter(Boolean)
      .flatMap(m => Array.isArray(m.posts) ? m.posts : [])
      .map(normalize);

    return posts;
  }

  async function loadFallbackFlat() {
    const [posted, tank, local] = await Promise.all([
      fetchJSON(`${ROOT}/.posted/manifest.json`),
      fetchJSON(`${ROOT}/.tank/manifest.json`),
      fetchJSON(`${ROOT}/manifest.json`)
    ]);
    return [
      ...(Array.isArray(posted?.posts) ? posted.posts : []),
      ...(Array.isArray(tank?.posts) ? tank.posts : []),
      ...(Array.isArray(local?.posts) ? local.posts : [])
    ].map(normalize);
  }

  async function boot() {
    ARCH.innerHTML = '<p class="loading">Loading posts…</p>';

    let items = await loadViaMonthIndexes();
    if (!items) items = await loadFallbackFlat();

    ALL = dedupeByUrl(items).sort((a, b) => new Date(b.date) - new Date(a.date));
    TAGS = new Set();
    collectTags(ALL);
    fillTagSelect();
    render(ALL);

    SHUFFLE?.addEventListener('click', () => render(shuffleInPlace(ALL.slice())));
    SEARCH?.addEventListener('input', () => render(ALL));
    TAGSEL?.addEventListener('change', () => render(ALL));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
