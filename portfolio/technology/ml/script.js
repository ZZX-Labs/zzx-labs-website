// Loads ./manifest.json, shuffles items, renders cards,
// and optionally injects each item's ./card.html (if present).

(() => {
  const LIST = document.getElementById('portfolio-list');
  const SHUFFLE = document.getElementById('shuffle');
  const SAMPLE_SIZE = 12; // how many items to show at once

  const isDomain = (s) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s||'').trim());

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
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function fetchCardHTML(href) {
    try {
      const url = href.replace(/\/?$/, '/') + 'card.html';
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  function cardSkeleton(item) {
    const href = item.href || `./${item.slug}/`;
    const rawTitle = item.title || item.slug || 'Untitled';
    const title = isDomain(rawTitle) ? rawTitle.toLowerCase() : rawTitle;

    const root = el('div', 'feature');

    const thumb = el('div', 'thumb');
    if (item.thumb) {
      const img = new Image();
      img.alt = '';
      img.src = item.thumb;
      thumb.appendChild(img);
    } else {
      thumb.appendChild(el('span', 'muted', '—'));
    }
    root.appendChild(thumb);

    const body = el('div', 'body');
    body.appendChild(el('h3', null, title));
    if (item.blurb) body.appendChild(el('p', null, item.blurb));

    const open = el('a', 'btn', item.linkText || `Open ${title}`);
    open.href = href;
    if (/^https?:\/\//i.test(href)) { open.target = '_blank'; open.rel = 'noopener noreferrer'; }
    body.appendChild(open);

    if (item.note) body.appendChild(el('div', 'meta', item.note));

    root.appendChild(body);
    return root;
  }

  async function render(items) {
    LIST.innerHTML = '';

    if (!items.length) {
      LIST.appendChild(el('p', 'loading', 'No ML portfolio items yet.'));
      return;
    }

    const sample = shuffleInPlace(items.slice()).slice(0, SAMPLE_SIZE);

    for (const it of sample) {
      const card = cardSkeleton(it);
      LIST.appendChild(card);

      // Progressive enhancement: inject card.html if available
      const href = it.href || `./${it.slug}/`;
      const html = await fetchCardHTML(href);
      if (html) {
        const body = card.querySelector('.body');
        const container = document.createElement('div');
        container.innerHTML = html;
        container.querySelectorAll('script').forEach(s => s.remove());
        body.insertBefore(container, body.querySelector('.btn'));
      }
    }
  }

  async function boot() {
    try {
      const data = await fetchJSON('./manifest.json');
      const items = Array.isArray(data?.projects) ? data.projects : [];
      await render(items);
      SHUFFLE?.addEventListener('click', () => render(items));
    } catch (e) {
      console.error(e);
      LIST.innerHTML = `<p class="loading">Failed to load: ${e.message}</p>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
