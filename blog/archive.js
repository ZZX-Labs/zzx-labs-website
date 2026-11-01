/* ZZX-Labs R&D unified journal/archive browser; no external packages.
   Canonical published status and imagery come from blog/catalog.json.
   Identical article URL => same assigned cover across all views.
*/
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const grid = $('post-grid');
  if (!grid) return;
  const search = $('search');
  const category = $('category');
  const sort = $('sort');
  const status = $('publication-status');
  const count = $('counter');
  const prev = $('prev');
  const next = $('next');
  const pageLabel = $('page-label');
  const isArchive = document.body.dataset.view === 'archive';
  let records = [];
  let page = 0;
  const SIZE = 12;

  function el(tag, text, classname) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (classname) node.className = classname;
    return node;
  }
  function safeBlogUrl(url) {
    if (typeof url !== 'string' || !/^\/blog\/[a-zA-Z0-9/_-]+\/$/.test(url)) return null;
    if (url.includes('//') || url.split('/').some((part) => part.startsWith('.'))) return null;
    return url;
  }
  function safeHeroUrl(url) {
    return typeof url === 'string' && /^\/assets\/hero\/[a-z0-9-]+\.png$/.test(url) ? url : null;
  }
  function formatDate(date) {
    const parsed = new Date(date);
    return date && !Number.isNaN(parsed.getTime())
      ? parsed.toLocaleDateString('en-US', {dateStyle:'medium',timeZone:'UTC'}) : 'Undated';
  }
  function card(post) {
    const item = el('article', undefined, 'tile');
    const src = safeHeroUrl(post.thumb);
    if (src) {
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 1920;
      image.height = 1080;
      image.src = src;
      image.alt = post.hero_alt || `Editorial illustration for ${post.title}`;
      image.addEventListener('error', () => { image.hidden = true; item.classList.add('missing-image'); }, {once:true});
      item.appendChild(image);
    } else {
      item.appendChild(el('div', post.category || 'Research', 'tile-image-fallback'));
    }
    const body = el('div', undefined, 'body');
    body.appendChild(el('div', `${formatDate(post.date)} · ${post.category || 'Research'}`, 'meta'));
    const heading = el('h3');
    const url = safeBlogUrl(post.url);
    if (post.published === true && url) {
      const link = el('a', post.title || 'Untitled');
      link.href = url;
      heading.appendChild(link);
    } else {
      heading.appendChild(el('span', post.title || 'Untitled'));
    }
    body.appendChild(heading);
    body.appendChild(el('p', post.description || 'Editorial article'));
    const label = post.published ? 'Verified publication' : 'Editorial review · not published';
    body.appendChild(el('span', label, 'state'));
    if (post.published && url) {
      const link = el('a', 'Read article', 'read-link');
      link.href = url;
      body.appendChild(link);
    }
    item.appendChild(body);
    return item;
  }
  function redraw() {
    const q = search.value.toLowerCase().trim();
    const cat = category.value;
    const state = status.value;
    const filtered = records.filter((p) => {
      const searchable = [p.title, p.description, p.category, ...(p.tags || [])].join(' ').toLowerCase();
      return (!q || searchable.includes(q)) && (!cat || p.category === cat) &&
        (state === 'all' || (state === 'published' ? p.published === true : !p.published));
    });
    if (sort.value === 'title') filtered.sort((a,b) => a.title.localeCompare(b.title));
    else if (sort.value === 'oldest') filtered.sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
    else filtered.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
    const pages = Math.max(1, Math.ceil(filtered.length / SIZE));
    page = Math.max(0,Math.min(page,pages-1));
    grid.replaceChildren(...filtered.slice(page*SIZE,(page+1)*SIZE).map(card));
    if (!filtered.length) grid.appendChild(el('p',
      isArchive ? 'No articles in this view. Change publication filter to see drafts.' : 'No matching articles.', 'empty'));
    count.textContent = `${filtered.length} ${filtered.length===1 ? 'entry' : 'entries'}`;
    pageLabel.textContent = `Page ${page+1} / ${pages}`;
    prev.disabled = page===0;
    next.disabled = page>=pages-1;
  }
  async function boot() {
    try {
      const response = await fetch('/blog/catalog.json',{cache:'no-cache'});
      if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
      const data = await response.json();
      const seen = new Set();
      records = (Array.isArray(data.posts) ? data.posts : []).filter((p) => {
        const key = safeBlogUrl(p.url);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const name of [...new Set(records.map((p) => p.category || 'Research'))].sort()) {
        const option = el('option',name); option.value=name; category.appendChild(option);
      }
      status.value = isArchive ? 'published' : 'all';
      redraw();
    } catch (err) {
      count.textContent = 'Cannot load catalog';
      grid.replaceChildren(el('p',
        'The catalog could not be loaded. Run the catalog builder and serve through an HTTP server (not file://).','empty'));
    }
  }
  for (const control of [search, category, sort, status]) {
    control.addEventListener('input', () => {page=0; redraw();});
  }
  prev.addEventListener('click',()=>{page--;redraw();});
  next.addEventListener('click',()=>{page++;redraw();});
  boot();
})();
